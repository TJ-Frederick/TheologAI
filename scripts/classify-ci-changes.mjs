import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseNameStatusNul } from './classify-production-deployment.mjs';

const documentation = path => path === 'README.md' || path === 'CHANGELOG.md' || /^docs\/[^\r\n]+\.md$/.test(path);
// Narrow by positive ownership only. Kernel, repositories, historical search,
// preparation scripts, configuration, dependencies and unknown paths run all.
const serving = path => /^src\/(?:mcp|http|tools|presenters|formatters)\//.test(path)
  || /^src\/(?:index|server|worker|worker-server)\.ts$/.test(path)
  || /^src\/services\/(?:bible|commentary|donation|languages)\//.test(path)
  || /^test\/unit\/(?:mcp|http|tools|presenters|formatters|worker)\//.test(path)
  || /^test\/(?:integration\/current|worker-runtime)\//.test(path);

export function classifyCiChanges(diff, forceFull = false) {
  const full = reason => ({ mode: 'full', data: true, serving: true, reason });
  if (forceFull) return full('explicit-full-validation');
  const changes = parseNameStatusNul(diff);
  const paths = changes.flatMap(change => change.paths);
  if (paths.length === 0) return full('empty-diff');
  if (paths.every(documentation)) return { mode: 'docs', data: false, serving: false, reason: 'documentation-only' };
  if (paths.every(path => documentation(path) || serving(path))) {
    return { mode: 'serving', data: false, serving: true, reason: 'serving-only' };
  }
  return full('corpus-delivery-or-unclassified-path');
}

export function main() {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const head = process.env.CI_EXPECTED_HEAD;
  if (!/^[0-9a-f]{40}$/.test(head ?? '') || git('rev-parse', 'HEAD') !== head) throw new Error('Unexpected checkout identity');
  let diff = '';
  const forceFull = process.env.CI_FORCE_FULL === 'true';
  if (!forceFull) {
    const parents = git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ');
    if (parents.length !== 3 || parents[2] !== process.env.CI_PR_HEAD) throw new Error('Expected exact PR merge checkout');
    diff = execFileSync('git', ['diff', '--name-status', '-z', '--find-renames', '--find-copies', parents[1], head], { encoding: 'utf8' });
  }
  const result = classifyCiChanges(diff, forceFull);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    `mode=${result.mode}\ndata=${result.data}\nserving=${result.serving}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Validation selection\n\nMode: **${result.mode}** (${result.reason}). Checkout: \`${head}\`.\n\n`);
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
