import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stage = readFileSync(new URL('../../../.github/workflows/stage-ccel-operator-secret.yml', import.meta.url), 'utf8');
const promote = readFileSync(new URL('../../../.github/workflows/promote-ccel-operator-secret.yml', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../../../.github/workflows/rollback-ccel-operator-secret.yml', import.meta.url), 'utf8');
const releaseConfig = readFileSync(new URL('../../../wrangler.release.toml', import.meta.url), 'utf8');
const policy = readFileSync(new URL('../../../scripts/ccel-operator-secret-release.ts', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../../../docs/CCEL-OPERATOR-SECRET-PROVISIONING.md', import.meta.url), 'utf8');
const workflows = [stage, promote, rollback];

describe('protected CCEL operator-secret provisioning', () => {
  it.each(workflows)('is manual, main/account-pinned, production-protected, least-privilege, and serialized', workflow => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/\n\s+(push|pull_request):/);
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('group: deploy-production');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('ref: ${{ github.sha }}');
    expect(workflow).toContain('expected_cloudflare_account_id:');
    expect(workflow).toContain('--live-main-sha "$LIVE_MAIN_SHA"');
    expect(workflow).toContain('--expected-account "$EXPECTED_ACCOUNT"');
    expect(workflow).toContain('git fetch --no-tags origin main:refs/remotes/origin/main');
    expect(workflow).toContain('--config wrangler.toml --release-config wrangler.release.toml');
    expect(workflow).toContain('--config wrangler.release.toml --name theologai');
    expect(workflow).toContain('npm run validate:release-config');
    expect(workflow).toContain('environment:\n      name: production');
    expect(workflow).toContain('if: inputs.execute == true');
    expect(workflow).toContain('continue-on-error: true');
    expect(workflow).toContain('if: always()');
    expect(workflow).toContain('MUTATION_OUTCOME: ${{ steps.mutate.outcome }}');
    expect(workflow).not.toContain('--env preview');
    expect(workflow).not.toContain('theologai-preview');
    expect(workflow).not.toContain('theologai-ccel-coordinator');
    expect(workflow).not.toContain('ccel.org');
    const validateStart = workflow.indexOf('  validate:\n');
    const protectedStart = workflow.search(/\n  (stage|promote|rollback):\n/);
    const validation = workflow.slice(validateStart, protectedStart);
    expect(protectedStart).toBeGreaterThan(validateStart);
    expect(validation).not.toContain('CLOUDFLARE_API_TOKEN');
  });

  it.each(workflows)('runs slow D1 readiness before immediate same-step mutation preflight', workflow => {
    const d1 = workflow.indexOf('Complete slow production D1 readiness before the mutation window');
    const mutate = workflow.indexOf('Immediately revalidate and attempt');
    expect(d1).toBeGreaterThan(0);
    expect(mutate).toBeGreaterThan(d1);
    const mutationStep = workflow.slice(mutate, workflow.indexOf('- name: Always capture', mutate));
    expect(mutationStep).toContain('validate-dispatch');
    expect(mutationStep).toContain('wrangler versions list');
    expect(mutationStep).toContain('wrangler deployments list');
    expect(mutationStep).toContain('wrangler versions view');
    expect(mutationStep).toContain("echo 'attempted=true'");
  });

  it.each(workflows)('does not execute Markdown backticks while writing reconciliation summaries', workflow => {
    expect(workflow).not.toMatch(/echo\s+"[^"\n]*`[^"\n]*"/);
    expect(workflow).toContain("printf 'Mutation attempted: `%s`\\n'");
  });

  it('stages a canonical token as one undeployed secret-only version', () => {
    expect(stage).toContain('I AUTHORIZE PROVISIONING THE PROTECTED CCEL OPERATOR SECRET');
    expect(stage).toContain('validate-token');
    expect(stage).toContain("printf '%s' \"$THEOLOGAI_CCEL_OPERATOR_TOKEN\"");
    expect(stage).toContain('wrangler versions secret put THEOLOGAI_CCEL_OPERATOR_TOKEN');
    expect(stage).not.toMatch(/wrangler secret put/);
    expect(stage).not.toContain('wrangler versions deploy');
    expect(stage).toContain('validate-stage-outcome');
    expect(stage).toContain('validate-staged');
  });

  it('promotes only one exact independently revalidated UUID and verifies actual state', () => {
    expect(promote).toContain('PROMOTE THEOLOGAI CCEL OPERATOR SECRET');
    expect(promote).toContain('validate-promotion-baseline');
    expect(promote).toContain('wrangler versions deploy "$STAGED_VERSION@100%"');
    expect(promote).toContain('validate-promotion-result');
    expect(promote).toContain('wrangler secret list --config wrangler.release.toml --name theologai --format json');
    expect(promote).not.toContain('THEOLOGAI_CCEL_OPERATOR_TOKEN: ${{ secrets.');
  });

  it('provides a separately authorized exact secretless rollback with changed-secret protection', () => {
    expect(rollback).toContain('ROLL BACK THEOLOGAI TO THE EXACT SECRETLESS BASELINE');
    expect(rollback).toContain('exact_secretless_baseline_version_id:');
    expect(rollback).toContain('validate-rollback-baseline');
    expect(rollback).toContain('wrangler rollback "$ROLLBACK_TARGET"');
    expect(rollback).toContain('validate-rollback-result');
    expect(rollback).not.toContain('secret delete');
    expect(policy).toContain('rollback would change a secret other than the operator token');
  });

  it('uses a checked-in mutation config with no non-versioned settings', () => {
    expect(releaseConfig).toContain('name = "theologai"');
    expect(releaseConfig).toContain('compatibility_date = "2026-07-09"');
    expect(releaseConfig).toContain('compatibility_flags = ["nodejs_compat"]');
    for (const forbidden of ['routes', 'workers_dev', 'observability', 'd1_databases', 'durable_objects', 'ratelimits', 'vars']) {
      expect(releaseConfig).not.toMatch(new RegExp(`^${forbidden}`, 'm'));
    }
  });

  it('keeps authoritative state validation in tested TypeScript with distinct official shapes', () => {
    for (const invariant of [
      'sequence number is invalid',
      'must not be parsed as a full version view',
      'staging changed a deployment or traffic',
      'staged version changed code, compatibility settings, or a non-secret binding',
      'deployed secret metadata does not match the reviewed staged version',
      'operator token must be canonical base64url for exactly 32 bytes',
    ]) expect(policy).toContain(invariant);
  });

  it('documents exact authorization, token generation, permissions, external-writer risk, audit, and rollback', () => {
    for (const text of [
      'Generic agreement is not authorization',
      'I AUTHORIZE PROVISIONING THE PROTECTED CCEL OPERATOR SECRET',
      'PROMOTE THEOLOGAI CCEL OPERATOR SECRET',
      'ROLL BACK THEOLOGAI TO THE EXACT SECRETLESS BASELINE',
      '43-character base64url',
      'Workers Scripts:Edit',
      'external writer',
      'read-only `snapshot`',
      'Do not dispatch `reset`',
      'versions secret delete',
      'separate deletion authorization',
    ]) expect(guide).toContain(text);
  });
});
