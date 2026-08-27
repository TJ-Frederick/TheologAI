import { describe, expect, it } from 'vitest';
import {
  ROLLBACK_REHEARSAL_CONFIRMATION,
  ROLLBACK_REHEARSAL_TARGET,
  createRollbackRehearsalReceipt,
  parseRollbackRehearsalReceipt,
  serializeRollbackRehearsalReceipt,
} from '../../../scripts/production-rollback-rehearsal.js';

const productionDeployment = '423e4567-e89b-42d3-a456-426614174000';
const previewDeployment = '523e4567-e89b-42d3-a456-426614174000';
const productionVersion = '623e4567-e89b-42d3-a456-426614174000';
const previewVersion = '723e4567-e89b-42d3-a456-426614174000';
const productionD1 = '823e4567-e89b-42d3-a456-426614174000';
const previewD1 = '923e4567-e89b-42d3-a456-426614174000';

function deployments(deploymentId: string, versionId: string): string {
  return JSON.stringify([
    {
      id: deploymentId,
      created_on: '2026-08-27T10:00:00.000Z',
      versions: [{ version_id: versionId, percentage: 100 }],
    },
    {
      id: ROLLBACK_REHEARSAL_TARGET.deploymentId,
      created_on: '2026-07-29T00:00:00.000Z',
      versions: [{ version_id: ROLLBACK_REHEARSAL_TARGET.workerVersionId, percentage: 100 }],
    },
  ]);
}

function versionView(versionId: string, d1Id: string): string {
  return JSON.stringify({
    id: versionId,
    resources: {
      bindings: [{ name: 'THEOLOGAI_DB', type: 'd1', id: d1Id, database_id: d1Id }],
    },
  });
}

const inventory = JSON.stringify([
  { name: ROLLBACK_REHEARSAL_TARGET.d1Name, uuid: ROLLBACK_REHEARSAL_TARGET.d1Id },
  { name: 'theologai-production-20260811-schema0009-a', uuid: productionD1 },
  { name: 'theologai-preview-20260811-schema0009-a', uuid: previewD1 },
]);

function input(overrides: Partial<Parameters<typeof createRollbackRehearsalReceipt>[0]> = {}) {
  return {
    confirmation: ROLLBACK_REHEARSAL_CONFIRMATION,
    sourceCommit: ROLLBACK_REHEARSAL_TARGET.sourceCommit,
    sourceTree: ROLLBACK_REHEARSAL_TARGET.sourceTree,
    expectedProductionDeploymentId: productionDeployment,
    expectedProductionVersionId: productionVersion,
    expectedPreviewDeploymentId: previewDeployment,
    expectedPreviewVersionId: previewVersion,
    productionBeforeText: deployments(productionDeployment, productionVersion),
    productionAfterText: deployments(productionDeployment, productionVersion),
    productionVersionBeforeText: versionView(productionVersion, productionD1),
    productionVersionAfterText: versionView(productionVersion, productionD1),
    previewBeforeText: deployments(previewDeployment, previewVersion),
    previewAfterText: deployments(previewDeployment, previewVersion),
    previewVersionBeforeText: versionView(previewVersion, previewD1),
    previewVersionAfterText: versionView(previewVersion, previewD1),
    d1InventoryBeforeText: inventory,
    d1InventoryAfterText: inventory,
    targetVersionText: versionView(ROLLBACK_REHEARSAL_TARGET.workerVersionId, ROLLBACK_REHEARSAL_TARGET.d1Id),
    readinessOutputText: '{"status":"passed"}\n',
    runtimeOutputText: 'worker runtime passed\n',
    dryRunOutputText: 'dry run completed\n',
    ...overrides,
  };
}

describe('production rollback rehearsal verifier', () => {
  it('emits a bounded sanitized receipt for an unchanged control plane', () => {
    const receipt = createRollbackRehearsalReceipt(input());
    expect(receipt.status).toBe('passed');
    expect(receipt.target).toEqual({
      deploymentId: ROLLBACK_REHEARSAL_TARGET.deploymentId,
      workerVersionId: ROLLBACK_REHEARSAL_TARGET.workerVersionId,
      d1Name: ROLLBACK_REHEARSAL_TARGET.d1Name,
      d1Id: ROLLBACK_REHEARSAL_TARGET.d1Id,
    });
    expect(receipt.trafficMutation).toBe(false);
    expect(receipt.evidence.dryRunOutputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(serializeRollbackRehearsalReceipt(input()).length).toBeLessThan(32 * 1024);
    expect(() => parseRollbackRehearsalReceipt({ ...receipt, unexpected: true })).toThrow(/keys are malformed/);
  });

  it.each([
    ['wrong confirmation', { confirmation: 'REHEARSE' }],
    ['wrong source commit', { sourceCommit: 'a'.repeat(40) }],
    ['wrong source tree', { sourceTree: 'b'.repeat(40) }],
    ['wrong target version', { targetVersionText: versionView(productionVersion, ROLLBACK_REHEARSAL_TARGET.d1Id) }],
    ['wrong target D1', { targetVersionText: versionView(ROLLBACK_REHEARSAL_TARGET.workerVersionId, productionD1) }],
    ['wrong D1 inventory', { d1InventoryBeforeText: JSON.stringify([{ name: 'other', uuid: productionD1 }]) }],
    ['production traffic drift', { productionAfterText: deployments(productionDeployment, 'a23e4567-e89b-42d3-a456-426614174000') }],
    ['preview D1 drift', { previewVersionAfterText: versionView(previewVersion, productionD1) }],
  ])('fails closed for %s', (_label, override) => {
    expect(() => createRollbackRehearsalReceipt(input(override))).toThrow(/refused/);
  });

  it('rejects a target that appears in either active deployment list', () => {
    expect(() => createRollbackRehearsalReceipt(input({
      productionAfterText: deployments(productionDeployment, ROLLBACK_REHEARSAL_TARGET.workerVersionId),
    }))).toThrow(/refused/);
  });
});
