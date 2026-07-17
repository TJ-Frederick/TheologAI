import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  CCEL_OPERATOR_SECRET,
  PROMOTE_CONFIRMATION,
  ROLLBACK_CONFIRMATION,
  STAGE_CONFIRMATION,
  assertReleaseConfig,
  assertWorkerConfig,
  identifyStagedVersion,
  validateAccount,
  validateDispatch,
  validateOperatorToken,
  validatePromotionBaseline,
  validatePromotionResult,
  validateRollbackBaseline,
  validateRollbackResult,
  validateStageBaseline,
  validateStageOutcome,
  validateStagedVersion,
} from '../../../scripts/ccel-operator-secret-release.js';

const baselineId = '123e4567-e89b-42d3-a456-426614174000';
const stagedId = '223e4567-e89b-42d3-a456-426614174000';
const otherId = '523e4567-e89b-42d3-a456-426614174000';
const sha = 'a'.repeat(40);
const account = 'b'.repeat(32);
const workerConfig = readFileSync(new URL('../../../wrangler.toml', import.meta.url), 'utf8');
const releaseConfig = readFileSync(new URL('../../../wrangler.release.toml', import.meta.url), 'utf8');

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../fixtures/wrangler/${name}`, import.meta.url), 'utf8')) as unknown;
}

const summariesBefore = fixture('versions-before.json') as Array<Record<string, unknown>>;
const summariesAfter = fixture('versions-after.json') as Array<Record<string, unknown>>;
const deploymentsBaseline = fixture('deployments-baseline.json');
const deploymentsStaged = fixture('deployments-staged.json');
const baseline = fixture('baseline-version-view.json') as Record<string, unknown>;
const staged = fixture('staged-version-view.json') as Record<string, unknown>;
const stagedSecrets = fixture('secret-list-staged.json');
const baselineSecrets = fixture('secret-list-baseline.json');

describe('CCEL operator-secret staged release policy', () => {
  it('requires exact live main, account, UUIDs, configurations, and action-specific confirmations', () => {
    expect(() => validateDispatch({
      action: 'stage', ref: 'refs/heads/main', sha, expectedSha: sha, liveMainSha: sha,
      expectedAccountId: account, baselineVersion: baselineId, confirmation: STAGE_CONFIRMATION,
      execute: false, configText: workerConfig, releaseConfigText: releaseConfig,
    })).not.toThrow();
    expect(() => validateDispatch({
      action: 'promote', ref: 'refs/heads/main', sha, expectedSha: sha, liveMainSha: sha,
      expectedAccountId: account, baselineVersion: baselineId, stagedVersion: stagedId,
      confirmation: PROMOTE_CONFIRMATION, execute: true, configText: workerConfig, releaseConfigText: releaseConfig,
    })).not.toThrow();
    expect(() => validateDispatch({
      action: 'rollback', ref: 'refs/heads/main', sha, expectedSha: sha, liveMainSha: sha,
      expectedAccountId: account, baselineVersion: baselineId, currentVersion: stagedId,
      confirmation: ROLLBACK_CONFIRMATION, execute: true, configText: workerConfig, releaseConfigText: releaseConfig,
    })).not.toThrow();
    for (const override of [
      { confirmation: 'Agree' },
      { ref: 'refs/heads/feature' },
      { expectedSha: 'c'.repeat(40) },
      { liveMainSha: 'c'.repeat(40) },
      { expectedAccountId: 'not-an-account' },
      { baselineVersion: stagedId, stagedVersion: stagedId },
    ]) {
      expect(() => validateDispatch({
        action: 'promote', ref: 'refs/heads/main', sha, expectedSha: sha, liveMainSha: sha,
        expectedAccountId: account, baselineVersion: baselineId, stagedVersion: stagedId,
        confirmation: PROMOTE_CONFIRMATION, execute: true, configText: workerConfig,
        releaseConfigText: releaseConfig, ...override,
      })).toThrow('release refused');
    }
  });

  it('structurally pins all critical production and preview bindings and a minimal release config', () => {
    expect(() => assertWorkerConfig(workerConfig)).not.toThrow();
    expect(() => assertReleaseConfig(releaseConfig)).not.toThrow();
    expect(() => assertWorkerConfig(workerConfig.replace('namespace_id = "361203"', 'namespace_id = "361201"')))
      .toThrow('namespace mismatch');
    expect(() => assertWorkerConfig(workerConfig.replace('database_id = "0dab804f-8df0-4727-93bd-299612b6e179"', `database_id = "${baselineId}"`)))
      .toThrow('D1 binding mismatch');
    expect(() => assertWorkerConfig(workerConfig.replace('THEOLOGAI_REQUEST_LOGS = "true"', 'THEOLOGAI_REQUEST_LOGS = "false"')))
      .toThrow('theologai-preview THEOLOGAI_REQUEST_LOGS mismatch');
    expect(() => assertWorkerConfig(`${workerConfig}\n${CCEL_OPERATOR_SECRET} = "unsafe"`)).toThrow('must not be stored');
    expect(() => assertReleaseConfig(`${releaseConfig}\nworkers_dev = true`)).toThrow('authorized keys');
  });

  it('accepts only canonical, single-line base64url encoding of exactly 32 random bytes', () => {
    const valid = Buffer.alloc(32, 7).toString('base64url');
    expect(valid).toHaveLength(43);
    expect(() => validateOperatorToken(valid)).not.toThrow();
    for (const invalid of [`${valid}\n`, ` ${valid}`, valid.slice(1), `${valid}A`, `${valid.slice(0, -1)}B`, 'x'.repeat(43)]) {
      expect(() => validateOperatorToken(invalid)).toThrow('operator token');
    }
    expect(() => validateAccount(account, account)).not.toThrow();
    expect(() => validateAccount(account, 'c'.repeat(32))).toThrow('does not match');
  });

  it('parses official VersionSummary shape separately and chooses newest by sequence number', () => {
    const contradictoryTimes = structuredClone(summariesAfter);
    (contradictoryTimes[0]!.metadata as Record<string, unknown>).created_on = '2027-01-01T00:00:00.000Z';
    (contradictoryTimes[1]!.metadata as Record<string, unknown>).created_on = '2026-01-01T00:00:00.000Z';
    expect(identifyStagedVersion(summariesBefore, contradictoryTimes, deploymentsBaseline, deploymentsBaseline, baselineId))
      .toBe(stagedId);
    const wrongShape = structuredClone(summariesBefore);
    wrongShape[0]!.resources = {};
    expect(() => validateStageBaseline(wrongShape, deploymentsBaseline, baseline, baselineId))
      .toThrow('must not be parsed as a full version view');
  });

  it('stages only from the sole active latest baseline and reconciles command outcome', () => {
    expect(validateStageBaseline(summariesBefore, deploymentsBaseline, baseline, baselineId)).toEqual(baseline);
    expect(validateStageOutcome(summariesBefore, summariesAfter, deploymentsBaseline, deploymentsBaseline, baselineId, 'success'))
      .toBe(stagedId);
    expect(() => validateStageOutcome(summariesBefore, summariesAfter, deploymentsBaseline, deploymentsBaseline, baselineId, 'failure'))
      .toThrow('command did not succeed');
    expect(() => validateStageOutcome(summariesBefore, summariesAfter, deploymentsBaseline, deploymentsStaged, baselineId, 'success'))
      .toThrow('changed a deployment');
    const extra = structuredClone(summariesAfter);
    extra.push({ ...extra[1], id: otherId, number: 43 });
    expect(() => identifyStagedVersion(summariesBefore, extra, deploymentsBaseline, deploymentsBaseline, baselineId))
      .toThrow('exactly one version');
  });

  it('accepts only the canonical operator-secret delta in a full Version view', () => {
    expect(() => validateStagedVersion(baseline, staged, baselineId, stagedId)).not.toThrow();
    const drift = structuredClone(staged) as typeof staged;
    const resources = drift.resources as Record<string, unknown>;
    (resources.bindings as unknown[]).push({ name: 'UNAUTHORIZED', type: 'plain_text', text: 'drift' });
    expect(() => validateStagedVersion(baseline, drift, baselineId, stagedId)).toThrow('non-secret binding');
    const exposed = structuredClone(staged) as typeof staged;
    const exposedBindings = ((exposed.resources as Record<string, unknown>).bindings as Array<Record<string, unknown>>);
    exposedBindings.find(item => item.name === CCEL_OPERATOR_SECRET)!.value = 'unsafe';
    expect(() => validateStagedVersion(baseline, exposed, baselineId, stagedId)).toThrow('authorized keys');
  });

  it('revalidates and verifies exact promotion including official secret-list shape', () => {
    expect(() => validatePromotionBaseline(summariesAfter, deploymentsBaseline, baseline, staged, baselineId, stagedId)).not.toThrow();
    expect(() => validatePromotionResult(deploymentsStaged, stagedSecrets, staged, stagedId)).not.toThrow();
    expect(() => validatePromotionResult(deploymentsStaged, stagedSecrets, staged, stagedId, 'failure')).toThrow('command did not succeed');
    expect(() => validatePromotionResult(deploymentsBaseline, stagedSecrets, staged, stagedId)).toThrow('not promoted');
    const exposed = structuredClone(stagedSecrets) as Array<Record<string, unknown>>;
    exposed[0]!.value = 'unsafe';
    expect(() => validatePromotionResult(deploymentsStaged, exposed, staged, stagedId)).toThrow('authorized keys');
  });

  it('permits rollback only to the exact equivalent secretless baseline and verifies removal', () => {
    expect(() => validateRollbackBaseline(summariesAfter, deploymentsStaged, staged, baseline, stagedId, baselineId)).not.toThrow();
    expect(() => validateRollbackResult(deploymentsBaseline, baselineSecrets, baseline, baselineId)).not.toThrow();
    expect(() => validateRollbackResult(deploymentsBaseline, baselineSecrets, baseline, baselineId, 'failure'))
      .toThrow('command did not succeed');
    const changedSecret = structuredClone(staged) as typeof staged;
    const bindings = ((changedSecret.resources as Record<string, unknown>).bindings as Array<Record<string, unknown>>);
    bindings.push({ name: 'NEW_SECRET', type: 'secret_text' });
    expect(() => validateRollbackBaseline(summariesAfter, deploymentsStaged, changedSecret, baseline, stagedId, baselineId))
      .toThrow('other than the operator token');
  });
});
