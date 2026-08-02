import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_WIDE_WORKERS_WRITE_ACK,
  CANARY_CONFIRMATION,
  CANARY_MESSAGE,
  CANARY_TAG,
  PRODUCTION_BASE_SECRET_BINDINGS,
  assertCommittedConfig,
  identifyCanaryUpload,
  planRestore,
  renderCanaryPreviewConfig,
  sanitizedCanaryEvidence,
  validateCanaryCredentials,
  validateCanaryDeployment,
  validateCanaryDispatch,
  validateCanaryInputs,
  validateCanaryVersion,
  validateEmergencyCredentials,
  validateEmergencyInputs,
  validatePreviewBaseline,
  validateProductionBindingInventory,
  validateProductionControl,
  validateRestoreResult,
} from '../../../scripts/ccel-live-preview-canary.js';

const predecessor = '123e4567-e89b-42d3-a456-426614174000';
const canary = '123e4567-e89b-42d3-a456-426614174001';
const production = '123e4567-e89b-42d3-a456-426614174002';
const deployment = '223e4567-e89b-42d3-a456-426614174000';
const config = readFileSync(new URL('../../../wrangler.toml', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../../.github/workflows/ccel-live-preview-canary.yml', import.meta.url), 'utf8');
const canarySource = readFileSync(new URL('../../../scripts/ccel-live-preview-canary.ts', import.meta.url), 'utf8');
const emergencyWorkflow = readFileSync(new URL('../../../.github/workflows/restore-ccel-live-preview-canary.yml', import.meta.url), 'utf8');
const prWorkflow = readFileSync(new URL('../../../.github/workflows/pr.yml', import.meta.url), 'utf8');
const liveBindingShapes = JSON.parse(readFileSync(
  new URL('../../fixtures/wrangler/ccel-canary-live-binding-shapes.json', import.meta.url), 'utf8',
)) as {
  schemaVersion: string;
  capturedAt: string;
  privacy: string;
  production: { versionId: string; flags: string; secretTextBindingNames: string[]; operatorReady: boolean };
  preview: { versionId: string; flags: string; secretTextBindingNames: string[]; operatorReady: boolean };
};

function bindings(mode: '100' | '111' | '000', includeOperatorSecret = false) {
  const productionMode = mode === '000';
  return [
    { name: 'THEOLOGAI_DB', type: 'd1', id: productionMode ? '53211f50-a893-4b4c-be1e-bc625a595dc7' : '62b871a6-5b4d-4d9b-8f52-301f6c878f48' },
    { name: 'THEOLOGAI_CCEL_COORDINATOR', type: 'durable_object_namespace', class_name: 'CcelGlobalCoordinator', script_name: 'theologai-ccel-coordinator' },
    { name: 'THEOLOGAI_RATE_LIMITER', type: 'ratelimit', namespace_id: productionMode ? '361201' : '361202', simple: { limit: 120, period: 60 } },
    { name: 'THEOLOGAI_CCEL_OPERATOR_AUTH_LIMITER', type: 'ratelimit', namespace_id: productionMode ? '361203' : '361204', simple: { limit: 12, period: 60 } },
    { name: 'CF_VERSION_METADATA', type: 'version_metadata' },
    { name: 'THEOLOGAI_VERSION', type: 'plain_text', text: productionMode ? '3.6.0' : '3.6.0-preview' },
    { name: 'THEOLOGAI_ALLOWED_ORIGINS', type: 'plain_text', text: 'https://theologai.xyz,https://theologai.pages.dev' },
    { name: 'THEOLOGAI_MAX_REQUEST_BYTES', type: 'plain_text', text: '1048576' },
    { name: 'THEOLOGAI_REQUEST_LOGS', type: 'plain_text', text: productionMode ? 'false' : 'true' },
    { name: 'THEOLOGAI_EXPOSE_CCEL_DISCOVERY', type: 'plain_text', text: productionMode ? 'false' : 'true' },
    { name: 'THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH', type: 'plain_text', text: mode === '111' ? 'true' : 'false' },
    { name: 'THEOLOGAI_ENABLE_CCEL_COORDINATOR', type: 'plain_text', text: mode === '111' ? 'true' : 'false' },
    { name: 'ESV_API_KEY', type: 'secret_text' },
    ...(productionMode ? [
      { name: 'AUTH_TOKEN', type: 'secret_text' },
      { name: 'SBC_FACILITATOR_API_KEY', type: 'secret_text' },
    ] : []),
    ...(includeOperatorSecret ? [{ name: 'THEOLOGAI_CCEL_OPERATOR_TOKEN', type: 'secret_text' }] : []),
  ];
}

function view(id: string, number: number, mode: '100' | '111' | '000' = '100', options: { message?: string; tag?: string; secret?: boolean } = {}) {
  return {
    id, number, metadata: { created_on: '2026-07-29T00:00:00.000Z' },
    ...(options.message === undefined ? {} : { annotations: { 'workers/message': options.message, 'workers/tag': options.tag ?? '' } }),
    resources: {
      script_runtime: { compatibility_date: '2026-07-09', compatibility_flags: ['nodejs_compat'] },
      bindings: bindings(mode, options.secret),
    },
  };
}

function deployments(versionId: string) {
  return [{ id: deployment, created_on: '2026-07-29T00:00:00.000Z', versions: [{ version_id: versionId, percentage: 100 }] }];
}

describe('CCEL live preview canary transaction', () => {
  it('holds the tracked configuration at production 000 and preview 100, then renders only ephemeral preview 111', () => {
    expect(() => assertCommittedConfig(config)).not.toThrow();
    const candidate = renderCanaryPreviewConfig(config);
    expect(candidate).toContain('THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH = "true"');
    expect(candidate).toContain('THEOLOGAI_ENABLE_CCEL_COORDINATOR = "true"');
    expect(candidate).toContain('THEOLOGAI_EXPOSE_CCEL_DISCOVERY = "false"');
    expect(candidate).not.toContain('THEOLOGAI_CCEL_OPERATOR_TOKEN');
    expect(config).toContain('THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH = "false"');
  });

  it('fails closed for wrong branch, SHA, confirmation, custom route, D1, DO, or rate namespace', () => {
    expect(() => validateCanaryDispatch({
      ref: 'refs/heads/main', sha: 'a'.repeat(40), expectedSha: 'a'.repeat(40), liveMainSha: 'a'.repeat(40),
      confirmation: CANARY_CONFIRMATION, configText: config,
    })).not.toThrow();
    expect(() => validateCanaryDispatch({
      ref: 'refs/heads/feature', sha: 'a'.repeat(40), expectedSha: 'a'.repeat(40), liveMainSha: 'a'.repeat(40),
      confirmation: CANARY_CONFIRMATION, configText: config,
    })).toThrow(/refs\/heads\/main/);
    expect(() => validateCanaryDispatch({
      ref: 'refs/heads/main', sha: 'a'.repeat(40), expectedSha: 'b'.repeat(40), liveMainSha: 'a'.repeat(40),
      confirmation: 'wrong', configText: config,
    })).toThrow();
    for (const tampered of [
      config.replace('preview-mcp.theologai.xyz', 'wrong.example'),
      config.replace('62b871a6-5b4d-4d9b-8f52-301f6c878f48', '11111111-1111-4111-8111-111111111111'),
      config.replace('class_name = "CcelGlobalCoordinator"', 'class_name = "WrongCoordinator"'),
      config.replace('namespace_id = "361204"', 'namespace_id = "999999"'),
    ]) expect(() => assertCommittedConfig(tampered)).toThrow();
  });

  it('rejects option-like, malformed, or duplicate user IDs and unprovisioned dedicated credentials before Wrangler', () => {
    expect(() => validateCanaryInputs({ previewPredecessor: predecessor, productionControl: production })).not.toThrow();
    expect(() => validateCanaryInputs({ previewPredecessor: '--env', productionControl: production })).toThrow(/UUID/);
    expect(() => validateCanaryInputs({ previewPredecessor: predecessor, productionControl: predecessor })).toThrow(/differ/);
    expect(() => validateEmergencyInputs('refs/heads/main', canary, predecessor, 'RESTORE THE EXACT CCEL PREVIEW PREDECESSOR', config)).not.toThrow();
    expect(() => validateEmergencyInputs('refs/heads/main', '--env', predecessor, 'RESTORE THE EXACT CCEL PREVIEW PREDECESSOR', config)).toThrow(/UUID/);
    expect(() => validateCanaryCredentials('missing', ACCOUNT_WIDE_WORKERS_WRITE_ACK, 'cf-token', 'a'.repeat(43))).toThrow(/provisioned/);
    expect(() => validateCanaryCredentials('CCEL_CANARY_CREDENTIALS_CONFIGURED', 'missing', 'cf-token', 'a'.repeat(43))).toThrow(/account-wide/);
    expect(() => validateCanaryCredentials('CCEL_CANARY_CREDENTIALS_CONFIGURED', ACCOUNT_WIDE_WORKERS_WRITE_ACK, '', 'a'.repeat(43))).toThrow(/Cloudflare/);
    expect(() => validateCanaryCredentials('CCEL_CANARY_CREDENTIALS_CONFIGURED', ACCOUNT_WIDE_WORKERS_WRITE_ACK, 'cf-token', 'bad')).toThrow(/operator/);
    expect(() => validateCanaryCredentials(
      'CCEL_CANARY_CREDENTIALS_CONFIGURED', ACCOUNT_WIDE_WORKERS_WRITE_ACK, 'cf-token', 'a'.repeat(43),
    )).not.toThrow();
    expect(() => validateEmergencyCredentials(
      'CCEL_CANARY_CREDENTIALS_CONFIGURED', ACCOUNT_WIDE_WORKERS_WRITE_ACK, 'cf-token',
    )).not.toThrow();
    expect(() => validateEmergencyCredentials('CCEL_CANARY_CREDENTIALS_CONFIGURED', 'missing', 'cf-token')).toThrow(/account-wide/);
    expect(() => validateEmergencyCredentials('missing', ACCOUNT_WIDE_WORKERS_WRITE_ACK, 'cf-token')).toThrow(/provisioned/);
  });

  it('requires a sole predecessor, stages one undeployed candidate, validates exact 111, and never accepts the operator token in preview', () => {
    const baseline = view(predecessor, 10);
    expect(() => validatePreviewBaseline(config, deployments(predecessor), baseline, predecessor)).not.toThrow();
    expect(() => validatePreviewBaseline(config, deployments(predecessor), baseline, 'not-an-id')).toThrow(/UUID/);
    expect(identifyCanaryUpload(
      [{ id: predecessor, number: 10, metadata: baseline.metadata }],
      [{ id: predecessor, number: 10, metadata: baseline.metadata }, { id: canary, number: 11, metadata: baseline.metadata }],
      deployments(predecessor), deployments(predecessor), predecessor,
    )).toBe(canary);
    const candidate = view(canary, 11, '111', { message: CANARY_MESSAGE, tag: CANARY_TAG });
    expect(() => validateCanaryVersion(config, baseline, candidate, predecessor, canary)).not.toThrow();
    expect(() => validateCanaryDeployment(config, deployments(canary), candidate, canary)).not.toThrow();
    const codeResourceDrift = view(canary, 11, '111', { message: CANARY_MESSAGE, tag: CANARY_TAG });
    codeResourceDrift.resources.script_runtime.compatibility_date = '2026-07-10';
    expect(() => validateCanaryVersion(config, baseline, codeResourceDrift, predecessor, canary))
      .toThrow(/compatibility settings mismatch/);
    const withPreviewToken = view(canary, 11, '111', { message: CANARY_MESSAGE, tag: CANARY_TAG, secret: true });
    expect(() => validateCanaryVersion(config, baseline, withPreviewToken, predecessor, canary)).toThrow(/exact authorized set/);
    const wrongNamespace = view(canary, 11, '111', { message: CANARY_MESSAGE, tag: CANARY_TAG });
    (wrongNamespace.resources.bindings.find(binding => binding.name === 'THEOLOGAI_RATE_LIMITER') as { namespace_id: string }).namespace_id = '361201';
    expect(() => validateCanaryVersion(config, baseline, wrongNamespace, predecessor, canary)).toThrow(/policy/);
    const extraBinding = view(canary, 11, '111', { message: CANARY_MESSAGE, tag: CANARY_TAG });
    extraBinding.resources.bindings.push({ name: 'UNAUTHORIZED_BINDING', type: 'plain_text', text: 'nope' });
    expect(() => validateCanaryVersion(config, baseline, extraBinding, predecessor, canary)).toThrow(/exact authorized set/);
    const missingSecret = view(canary, 11, '111', { message: CANARY_MESSAGE, tag: CANARY_TAG });
    missingSecret.resources.bindings.splice(missingSecret.resources.bindings.findIndex(binding => binding.name === 'ESV_API_KEY'), 1);
    expect(() => validateCanaryVersion(config, baseline, missingSecret, predecessor, canary)).toThrow(/exact authorized set/);
  });

  it('pins the sanitized live binding shapes and requires the separately staged operator secret before preview mutation', () => {
    expect(liveBindingShapes).toEqual({
      schemaVersion: '1',
      capturedAt: '2026-07-29',
      privacy: 'worker_version_ids_and_binding_names_types_only',
      production: {
        versionId: '291f3292-3fa9-44fc-bf6f-b68fd2f4cef6',
        flags: '000',
        secretTextBindingNames: [...PRODUCTION_BASE_SECRET_BINDINGS],
        operatorReady: false,
      },
      preview: {
        versionId: '06b9a603-8339-42b6-a246-ef9238563043',
        flags: '100',
        secretTextBindingNames: ['ESV_API_KEY'],
        operatorReady: false,
      },
    });
    const currentLiveShape = view(liveBindingShapes.production.versionId, 9, '000');
    expect(validateProductionBindingInventory(currentLiveShape)).toEqual({ operatorReady: false });
    expect(() => validateProductionControl(
      config, deployments(liveBindingShapes.production.versionId), currentLiveShape, liveBindingShapes.production.versionId,
    )).toThrow(/production operator prerequisite is missing.*before any preview mutation/);

    const control = view(production, 9, '000', { secret: true });
    expect(() => validateProductionControl(config, deployments(production), control, production)).not.toThrow();
    expect(validateProductionBindingInventory(control)).toEqual({ operatorReady: true });
    const duplicate = view(production, 9, '000', { secret: true });
    duplicate.resources.bindings.push({ name: 'THEOLOGAI_CCEL_OPERATOR_TOKEN', type: 'secret_text' });
    expect(() => validateProductionControl(config, deployments(production), duplicate, production)).toThrow(/unique/);
    const wrongType = view(production, 9, '000', { secret: true });
    (wrongType.resources.bindings.find(binding => binding.name === 'THEOLOGAI_CCEL_OPERATOR_TOKEN') as { type: string }).type = 'plain_text';
    expect(() => validateProductionControl(config, deployments(production), wrongType, production)).toThrow(/type mismatch/);
    for (const requiredSecret of PRODUCTION_BASE_SECRET_BINDINGS) {
      const missing = view(production, 9, '000', { secret: true });
      missing.resources.bindings.splice(missing.resources.bindings.findIndex(binding => binding.name === requiredSecret), 1);
      expect(() => validateProductionBindingInventory(missing)).toThrow(/exact authorized set/);
      const wrongBaseType = view(production, 9, '000', { secret: true });
      (wrongBaseType.resources.bindings.find(binding => binding.name === requiredSecret) as { type: string }).type = 'plain_text';
      expect(() => validateProductionBindingInventory(wrongBaseType)).toThrow(/type mismatch/);
    }
    const extra = view(production, 9, '000', { secret: true });
    extra.resources.bindings.push({ name: 'UNAUTHORIZED_SECRET', type: 'secret_text' });
    expect(() => validateProductionBindingInventory(extra)).toThrow(/exact authorized set/);
  });

  it('accepts only ESV in preview and rejects every production-only or unknown secret', () => {
    const previewLiveShape = view(liveBindingShapes.preview.versionId, 10, '100');
    expect(() => validatePreviewBaseline(
      config, deployments(liveBindingShapes.preview.versionId), previewLiveShape, liveBindingShapes.preview.versionId,
    )).not.toThrow();
    for (const forbiddenSecret of ['AUTH_TOKEN', 'SBC_FACILITATOR_API_KEY', 'THEOLOGAI_CCEL_OPERATOR_TOKEN', 'UNKNOWN_SECRET']) {
      const forbidden = view(predecessor, 10, '100');
      forbidden.resources.bindings.push({ name: forbiddenSecret, type: 'secret_text' });
      expect(() => validatePreviewBaseline(config, deployments(predecessor), forbidden, predecessor)).toThrow(/exact authorized set/);
    }
  });

  it('restores only the exact captured predecessor and makes a second restore idempotent', () => {
    const baseline = view(predecessor, 10);
    const candidate = view(canary, 11, '111', { message: CANARY_MESSAGE, tag: CANARY_TAG });
    expect(planRestore(config, deployments(canary), candidate, baseline, canary, predecessor)).toBe('deploy');
    expect(() => validateRestoreResult(config, deployments(predecessor), baseline, predecessor)).not.toThrow();
    expect(planRestore(config, deployments(predecessor), baseline, baseline, predecessor, predecessor)).toBe('already');
    expect(() => planRestore(config, deployments(production), view(production, 99, '000', { secret: true }), baseline, canary, predecessor)).toThrow(/authorized canary/);
  });

  it('retains only sanitized canary evidence and invokes the existing two-call audit exactly once', () => {
    const evidence = sanitizedCanaryEvidence({
      commit: 'a'.repeat(40), predecessor, canary, productionControl: production,
      auditSha256: 'b'.repeat(64), auditOutcome: 'success', restored: true,
    });
    expect(JSON.stringify(evidence)).not.toMatch(/query|snippet|token|https?:\/\//i);
    expect(() => sanitizedCanaryEvidence({
      commit: 'not-a-sha', predecessor, canary, productionControl: production,
      auditSha256: 'b'.repeat(64), auditOutcome: 'failure', restored: true,
    })).toThrow(/commit/);
    expect(workflow.match(/npm run audit:ccel-preview/g)).toHaveLength(1);
    expect(workflow).toContain('I AUTHORIZE TWO LIVE CCEL PREVIEW REQUESTS');
    expect(workflow).not.toMatch(/labels\.\*\.name.*deploy-preview/);
    expect(workflow).toMatch(/^on:\n  workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^  (push|pull_request):/m);
    expect(workflow).toContain('environment: ccel-canary');
    expect(workflow).not.toContain('environment: production');
    expect(workflow).not.toContain('secrets.CLOUDFLARE_API_TOKEN');
    expect(workflow).toContain('secrets.CCEL_CANARY_CLOUDFLARE_API_TOKEN');
    expect(workflow).toContain('secrets.CCEL_CANARY_ACCOUNT_WIDE_WORKERS_WRITE_ACK');
    expect(workflow).toContain('validate-canary-credentials');
    expect(workflow.indexOf('validate-canary-credentials')).toBeLessThan(workflow.indexOf('npx wrangler'));
    expect(workflow.indexOf('validate-production-control')).toBeLessThan(workflow.indexOf('npx wrangler versions upload'));
    expect(workflow).toContain('made the predecessor exact-current-main and code/resource-equivalent');
    expect(canarySource).toContain('separately refreshed current-main');
    expect(canarySource).toContain('code/resource drift remains forbidden');
    expect(workflow.indexOf('Run the existing authorized two-attempt audit exactly once'))
      .toBeLessThan(workflow.indexOf('Always restore the exact preview predecessor before job exit'));
    expect(workflow).toMatch(/id: restore\n        if: always\(\)/);
    expect(workflow.indexOf('Always restore the exact preview predecessor before job exit'))
      .toBeLessThan(workflow.indexOf('Fail only after recovery and evidence are complete'));
    for (const command of workflow.match(/npx wrangler versions (?:upload|deploy)[^\n]*/g) ?? []) {
      expect(command).toContain('--env preview');
    }
    expect(emergencyWorkflow).toMatch(/^on:\n  workflow_dispatch:/m);
    expect(emergencyWorkflow).not.toContain('THEOLOGAI_CCEL_OPERATOR_TOKEN');
    expect(emergencyWorkflow).not.toContain('CCEL_CANARY_OPERATOR_TOKEN');
    expect(emergencyWorkflow).toContain('environment: ccel-canary');
    expect(emergencyWorkflow).toContain('secrets.CCEL_CANARY_ACCOUNT_WIDE_WORKERS_WRITE_ACK');
    expect(emergencyWorkflow).toContain('validate-emergency-inputs');
    expect(emergencyWorkflow).toContain('validate-restore-result');
    for (const source of [prWorkflow, workflow, emergencyWorkflow]) {
      expect(source).toContain('group: theologai-shared-preview-mutation');
      expect(source).toContain('cancel-in-progress: false');
      expect(source).not.toContain('theologai-shared-preview-deploy-and-audit');
      expect(source).not.toContain('theologai-ccel-live-preview-canary');
    }
  });
});
