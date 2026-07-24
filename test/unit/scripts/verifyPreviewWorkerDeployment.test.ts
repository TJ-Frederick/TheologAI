import { describe, expect, it } from 'vitest';
import {
  verifyPreviewWorkerAuditStability,
  verifyPreviewWorkerDeployment,
} from '../../../scripts/verify-preview-worker-deployment.js';

const baseline = '123e4567-e89b-42d3-a456-426614174000';
const deployed = '223e4567-e89b-42d3-a456-426614174000';
const deployment = '323e4567-e89b-42d3-a456-426614174000';

function versions(entries: Array<{ id: string; number: number }>): string {
  return JSON.stringify(entries.map(entry => ({
    id: entry.id,
    number: entry.number,
    metadata: { created_on: `2026-07-23T00:00:0${entry.number}.000Z` },
  })));
}

function active(versionId = deployed, percentage = 100): string {
  return JSON.stringify([{
    id: deployment,
    created_on: '2026-07-23T00:01:00.000Z',
    versions: [{ version_id: versionId, percentage }],
  }]);
}

describe('preview Worker deployment identity verification', () => {
  it('requires one new version to become the latest sole 100% preview deployment', () => {
    const identity = verifyPreviewWorkerDeployment({
      beforeVersionsText: versions([{ id: baseline, number: 1 }]),
      afterVersionsText: versions([{ id: baseline, number: 1 }, { id: deployed, number: 2 }]),
      afterDeploymentsText: active(),
      commandOutput: 'wrangler deploy output retained only by SHA-256',
    });

    expect(identity).toMatchObject({
      schemaVersion: 1,
      worker: 'theologai-preview',
      deployedVersionId: deployed,
      deployedVersionNumber: 2,
      deploymentId: deployment,
    });
    expect(identity.commandOutputSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails closed for concurrent versions, inactive versions, and malformed control-plane state', () => {
    const input = {
      beforeVersionsText: versions([{ id: baseline, number: 1 }]),
      afterVersionsText: versions([{ id: baseline, number: 1 }, { id: deployed, number: 2 }]),
      afterDeploymentsText: active(),
      commandOutput: 'stdout',
    };
    expect(() => verifyPreviewWorkerDeployment({
      ...input,
      afterVersionsText: versions([
        { id: baseline, number: 1 }, { id: deployed, number: 2 },
        { id: '423e4567-e89b-42d3-a456-426614174000', number: 3 },
      ]),
    })).toThrow('exactly one new Worker version');
    expect(() => verifyPreviewWorkerDeployment({ ...input, afterDeploymentsText: active(baseline) }))
      .toThrow('sole 100% active preview deployment');
    expect(() => verifyPreviewWorkerDeployment({ ...input, afterDeploymentsText: active(deployed, 99) }))
      .toThrow('sole 100% active preview deployment');
  });

  it('binds the audit to a second observation of the exact same active deployment', () => {
    const preAudit = verifyPreviewWorkerDeployment({
      beforeVersionsText: versions([{ id: baseline, number: 1 }]),
      afterVersionsText: versions([{ id: baseline, number: 1 }, { id: deployed, number: 2 }]),
      afterDeploymentsText: active(),
      commandOutput: 'stdout',
    });
    const stable = verifyPreviewWorkerAuditStability(preAudit, active());
    expect(stable).toMatchObject({
      schemaVersion: 2,
      deployedVersionId: deployed,
      deploymentId: deployment,
    });
    expect(stable.postAuditDeploymentsSha256).toMatch(/^[0-9a-f]{64}$/);

    expect(() => verifyPreviewWorkerAuditStability(preAudit, JSON.stringify([{
      id: '423e4567-e89b-42d3-a456-426614174000',
      created_on: '2026-07-23T00:02:00.000Z',
      versions: [{ version_id: deployed, percentage: 100 }],
    }]))).toThrow('post-audit latest preview deployment changed');
    expect(() => verifyPreviewWorkerAuditStability(preAudit, active(baseline)))
      .toThrow('sole 100% active preview deployment');
  });
});
