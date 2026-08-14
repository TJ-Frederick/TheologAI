import { appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const SHA = /^[0-9a-fA-F]{40}$/;
const ZERO_SHA = '0'.repeat(40);

export function parseNameStatusNul(output) {
  if (output !== '' && !output.endsWith('\0')) throw new Error('malformed-missing-terminal-nul');
  const fields = output.split('\0');
  if (fields.at(-1) === '') fields.pop();
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) throw new Error('malformed-empty-status');
    const score = /^[RC]([0-9]{1,3})$/.exec(status);
    const pathCount = score && Number(score[1]) <= 100 ? 2 : /^[AMD]$/.test(status) ? 1 : 0;
    if (pathCount === 0 || index + pathCount > fields.length) throw new Error(`malformed-status:${status}`);
    const paths = fields.slice(index, index + pathCount);
    if (paths.some(path => path.length === 0)) throw new Error(`malformed-empty-path:${status}`);
    index += pathCount;
    changes.push({ status, paths });
  }
  return changes;
}

export function classifyProductionDeployment(input) {
  const fallback = (reason, changedPaths = [], changedPathEvidence = []) => ({
    classificationSucceeded: false, deployRequired: true, reason, base: input.before, head: input.head, changedPaths, changedPathEvidence,
  });
  if (!SHA.test(input.before)) return fallback('invalid-before-sha');
  if (input.before.toLowerCase() === ZERO_SHA) return fallback('zero-before-sha');
  if (!SHA.test(input.after)) return fallback('invalid-after-sha');
  if (!SHA.test(input.head)) return fallback('invalid-head-sha');
  if (input.head.toLowerCase() !== input.after.toLowerCase()) return fallback('head-does-not-match-after');
  if (!input.beforeExists) return fallback('before-object-missing');
  if (!input.afterExists) return fallback('after-object-missing');
  if (!input.beforeIsAncestor) return fallback('before-is-not-ancestor');
  if (!input.diff.ok) return fallback('diff-failed');
  let changes;
  try { changes = parseNameStatusNul(input.diff.output); } catch { return fallback('malformed-diff'); }
  const changedPaths = changes.flatMap(change => change.paths);
  if (changes.length === 0) return fallback('empty-diff');
  const isDocumentation = path => path === 'README.md' || path === 'CHANGELOG.md' || /^docs\/.+\.md$/.test(path);
  if (changes.some(change => !change.paths.every(isDocumentation))) {
    return { classificationSucceeded: true, deployRequired: true, reason: 'non-documentation-path', base: input.before, head: input.head, changedPaths, changedPathEvidence: changes };
  }
  return { classificationSucceeded: true, deployRequired: false, reason: 'markdown-documentation-only', base: input.before, head: input.head, changedPaths, changedPathEvidence: changes };
}

function gitSucceeds(...args) { try { execFileSync('git', args, { stdio: 'ignore' }); return true; } catch { return false; } }
function gitDiff(before, after) {
  try { return { ok: true, output: execFileSync('git', ['diff', '--name-status', '-z', '--find-renames', '--find-copies', before, after], { encoding: 'utf8' }) }; }
  catch { return { ok: false, error: 'git-diff-failed' }; }
}

export function collectGitClassification(before, after, head, runner) {
  const normalizedBefore = before.toLowerCase();
  const normalizedAfter = after.toLowerCase();
  return classifyProductionDeployment({
    before, after, head,
    beforeExists: SHA.test(before) && runner.succeeds('cat-file', '-e', `${normalizedBefore}^{commit}`),
    afterExists: SHA.test(after) && runner.succeeds('cat-file', '-e', `${normalizedAfter}^{commit}`),
    beforeIsAncestor: SHA.test(before) && SHA.test(after) && runner.succeeds('merge-base', '--is-ancestor', normalizedBefore, normalizedAfter),
    diff: SHA.test(before) && SHA.test(after) ? runner.diff(normalizedBefore, normalizedAfter) : { ok: false, error: 'sha-validation-failed' },
  });
}

const argument = name => { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? (process.argv[index + 1] ?? '') : ''; };
async function writeClassification(result) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, [
    `classification_succeeded=${result.classificationSucceeded}`, `deploy_required=${result.deployRequired}`, `decision=${result.deployRequired ? 'deploy' : 'skip'}`,
    `reason=${result.reason}`, `base=${result.base}`, `head=${result.head}`, `changed_path_evidence_json=${JSON.stringify(result.changedPathEvidence)}`, '',
  ].join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const evidence = result.changedPathEvidence.length ? result.changedPathEvidence.map(change => `- ${JSON.stringify(change)}`).join('\n') : '- _(none available)_';
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Production deployment classification\n\n- Decision: **${result.deployRequired ? 'deploy required' : 'deployment skipped'}**\n- Classification succeeded: \`${result.classificationSucceeded}\`\n- Reason: \`${result.reason}\`\n- Base: \`${result.base}\`\n- Head: \`${result.head}\`\n\nChanged paths:\n${evidence}\n\n`);
  }
}
export async function main() {
  const before = argument('before'); const after = argument('after'); const head = argument('head');
  let result;
  try { result = collectGitClassification(before, after, head, { succeeds: gitSucceeds, diff: gitDiff }); }
  catch { result = { classificationSucceeded: false, deployRequired: true, reason: 'classifier-error', base: before, head, changedPaths: [], changedPathEvidence: [] }; }
  await writeClassification(result);
}
if (import.meta.url === `file://${process.argv[1]}`) void main();
