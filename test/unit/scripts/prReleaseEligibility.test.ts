import { expect, it } from 'vitest';
import { releaseEligibility } from '../../../scripts/pr-release-eligibility.mjs';

const passing = {classification: 'success', validation: 'success', preview: 'success', sameTree: true};

it.each(['skipped', 'failure', 'cancelled', undefined])('treats %s classification as undetermined even with a docs output', classification => {
  expect(releaseEligibility({...passing, mode: 'docs', classification})).toBe('classification-undetermined');
});

it.each(['', 'unknown', undefined])('treats an unrecognized mode %s as undetermined', mode => {
  expect(releaseEligibility({...passing, mode})).toBe('classification-undetermined');
});

it('reports cumulative docs without requiring protected preview, after validation succeeds', () => {
  expect(releaseEligibility({...passing, mode: 'docs', preview: 'skipped'})).toBe('no-deployment-required');
  expect(releaseEligibility({...passing, mode: 'docs', validation: 'failure'})).toBe('validation-incomplete');
});

it.each(['application', 'corpus'])('requires the exact tested tree and protected preview for %s', mode => {
  expect(releaseEligibility({...passing, mode, preview: 'skipped', sameTree: false})).toBe('merge-tree-differs-from-preview');
  expect(releaseEligibility({...passing, mode, preview: 'skipped'})).toBe('protected-preview-required');
  expect(releaseEligibility({...passing, mode, preview: 'failure'})).toBe('protected-preview-incomplete');
  expect(releaseEligibility({...passing, mode})).toBe('ready-for-protected-release-verification');
});
