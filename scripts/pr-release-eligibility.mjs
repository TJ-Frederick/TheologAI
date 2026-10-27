import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { collectGitClassification } from './classify-production-deployment.mjs';

// An informational pre-merge result, never a substitute for the protected
// production receipt verifier or current authorization after approval.
export function releaseEligibility({ classified, deployRequired, validation, preview, sameTree }) {
  if (!classified || validation !== 'success') return 'validation-incomplete';
  if (!deployRequired) return 'no-deployment-required';
  if (preview === 'skipped') return 'protected-preview-required';
  if (preview !== 'success') return 'protected-preview-incomplete';
  if (!sameTree) return 'merge-tree-differs-from-preview';
  return 'ready-for-protected-release-verification';
}

export function main() {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const head = process.env.CI_EXPECTED_HEAD;
  const prHead = process.env.CI_PR_HEAD;
  if (![head, prHead].every(value => /^[0-9a-f]{40}$/.test(value ?? '')) || git('rev-parse', 'HEAD') !== head) throw new Error('Unexpected candidate checkout');
  const parents = git('rev-list', '--parents', '-n', '1', head).split(' ');
  if (parents.length !== 3 || parents[2] !== prHead) throw new Error('Expected exact PR merge checkout');
  const classification = collectGitClassification(parents[1], head, head, {
    succeeds: (...args) => { try { git(...args); return true; } catch { return false; } },
    diff: (before, after) => ({ ok: true, output: execFileSync('git', ['diff', '--name-status', '-z', '--find-renames', '--find-copies', before, after], { encoding: 'utf8' }) }),
  });
  const status = releaseEligibility({
    classified: classification.classificationSucceeded,
    deployRequired: classification.deployRequired,
    validation: process.env.CI_VALIDATION_RESULT,
    preview: process.env.CI_PREVIEW_RESULT,
    sameTree: git('rev-parse', `${head}^{tree}`) === git('rev-parse', `${prHead}^{tree}`),
  });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Release eligibility\n\n**${status}**\n\nThis evaluates the current PR diff and exact candidate tree. Production still verifies a fresh source-bound preview receipt and current deployment identity.\n`);
  console.log(status);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
