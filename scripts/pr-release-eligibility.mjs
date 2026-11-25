import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// An informational pre-merge result. Protected production verifies its own receipt and authority.
export function releaseEligibility({ classification, mode, validation, preview, sameTree }) {
  if (classification !== 'success' || !['docs', 'application', 'corpus'].includes(mode)) return 'classification-undetermined';
  if (validation !== 'success') return 'validation-incomplete';
  if (mode === 'docs') return 'no-deployment-required';
  if (!sameTree) return 'merge-tree-differs-from-preview';
  if (preview === 'skipped') return 'protected-preview-required';
  if (preview !== 'success') return 'protected-preview-incomplete';
  return 'ready-for-protected-release-verification';
}

export function main() {
  const status = releaseEligibility({
    classification: process.env.CI_RELEASE_CLASSIFICATION_RESULT,
    mode: process.env.CI_RELEASE_MODE,
    validation: process.env.CI_VALIDATION_RESULT,
    preview: process.env.CI_PREVIEW_RESULT,
    sameTree: process.env.CI_RELEASE_SAME_TREE === 'true',
  });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Release eligibility\n\n**${status}**\n\nThis evaluates the cumulative change against the accepted production source and the exact candidate tree. Production verifies a fresh source-bound preview receipt and current deployment identity.\n`);
  console.log(status);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
