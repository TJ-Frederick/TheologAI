import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  capturePreviewPredecessorAnchor,
  reconcilePreviewPostMutation,
} from '../../../scripts/preview-release-reconciliation.js';

const root = new URL('../../../', import.meta.url);
const predecessorVersion = '123e4567-e89b-42d3-a456-426614174000';
const candidateVersion = '223e4567-e89b-42d3-a456-426614174000';
const predecessorDeployment = '323e4567-e89b-42d3-a456-426614174000';
const candidateDeployment = '423e4567-e89b-42d3-a456-426614174000';

function deployments(id = predecessorDeployment, version = predecessorVersion): string {
  return JSON.stringify([{
    id, created_on: '2026-07-23T12:00:00.000Z', versions: [{ version_id: version, percentage: 100 }],
  }]);
}

describe('preview release reconciliation evidence', () => {
  it('captures the exact pre-mutation active Worker and checked-out preview D1 binding', async () => {
    const config = await readFile(new URL('wrangler.toml', root), 'utf8');
    const anchor = capturePreviewPredecessorAnchor({ deploymentsText: deployments(), wranglerConfigText: config });
    expect(anchor).toMatchObject({
      schemaVersion: 1,
      worker: 'theologai-preview',
      predecessorVersionId: predecessorVersion,
      predecessorDeploymentId: predecessorDeployment,
      previewD1: { binding: 'THEOLOGAI_DB', databaseName: 'theologai-preview-20260722-b', databaseId: '94c4938b-7800-4d68-9097-0df33c31fdc1' },
    });
    expect(anchor.predecessorDeploymentsSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records candidate state after an unsuccessful release without attempting rollback or cleanup', async () => {
    const config = await readFile(new URL('wrangler.toml', root), 'utf8');
    const anchor = capturePreviewPredecessorAnchor({ deploymentsText: deployments(), wranglerConfigText: config });
    const result = reconcilePreviewPostMutation({
      predecessorAnchorText: JSON.stringify(anchor),
      postMutationDeploymentsText: deployments(candidateDeployment, candidateVersion),
      wranglerConfigText: config,
    });
    expect(result).toMatchObject({
      worker: 'theologai-preview', predecessorVersionId: predecessorVersion, predecessorDeploymentId: predecessorDeployment,
      observedActiveVersionId: candidateVersion, observedActiveDeploymentId: candidateDeployment, activeMatchesPredecessor: false,
      previewD1: anchor.previewD1,
    });
    expect(result.predecessorAnchorSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.postMutationDeploymentsSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails closed for a non-sole deployment, malformed predecessor, or changed D1 binding', async () => {
    const config = await readFile(new URL('wrangler.toml', root), 'utf8');
    expect(() => capturePreviewPredecessorAnchor({
      deploymentsText: JSON.stringify([{ id: predecessorDeployment, created_on: '2026-07-23T12:00:00.000Z', versions: [{ version_id: predecessorVersion, percentage: 99 }] }]),
      wranglerConfigText: config,
    })).toThrow('not a sole 100% version');

    const anchor = capturePreviewPredecessorAnchor({ deploymentsText: deployments(), wranglerConfigText: config });
    expect(() => reconcilePreviewPostMutation({
      predecessorAnchorText: JSON.stringify({ ...anchor, unexpected: true }), postMutationDeploymentsText: deployments(), wranglerConfigText: config,
    })).toThrow('predecessor anchor keys are malformed');
    expect(() => reconcilePreviewPostMutation({
      predecessorAnchorText: JSON.stringify(anchor), postMutationDeploymentsText: deployments(),
      wranglerConfigText: config.replace('database_name = "theologai-preview-20260722-b"', 'database_name = "different-preview"'),
    })).toThrow('no longer matches the captured predecessor compatibility anchor');
  });
});
