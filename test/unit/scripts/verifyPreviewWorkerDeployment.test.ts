import { describe, expect, it } from 'vitest';
import {
  verifyPreviewWorkerAuditStability,
  verifyPreviewWorkerDeployment,
} from '../../../scripts/verify-preview-worker-deployment.js';

const baseline = '123e4567-e89b-42d3-a456-426614174000';
const deployed = '223e4567-e89b-42d3-a456-426614174000';
const deployment = '323e4567-e89b-42d3-a456-426614174000';

function versions(entries: Array<{
  id: string; number: number; triggeredBy?: 'secret' | 'version_upload'; createdOn?: string;
}>): string {
  return JSON.stringify(entries.map(entry => ({
    id: entry.id,
    number: entry.number,
    metadata: { created_on: entry.createdOn ?? `2026-07-23T00:00:${String(entry.number % 60).padStart(2, '0')}.000Z` },
    ...(entry.triggeredBy === undefined ? {} : { annotations: { 'workers/triggered_by': entry.triggeredBy } }),
  })));
}

function commandOutput(versionId = deployed): string {
  return `Published theologai-preview\nCurrent Version ID: ${versionId}\n`;
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
      beforeVersionsText: versions([{ id: baseline, number: 1, triggeredBy: 'version_upload' }]),
      afterVersionsText: versions([
        { id: baseline, number: 1, triggeredBy: 'version_upload' },
        { id: deployed, number: 2, triggeredBy: 'version_upload' },
      ]),
      afterDeploymentsText: active(),
      commandOutput: commandOutput(),
    });

    expect(identity).toMatchObject({
      schemaVersion: 1,
      worker: 'theologai-preview',
      deployedVersionId: deployed,
      deployedVersionNumber: 2,
      deploymentId: deployment,
      commandReportedVersionId: deployed,
      addedVersionIds: [deployed],
    });
    expect(identity.commandOutputSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails closed for concurrent versions, inactive versions, and malformed control-plane state', () => {
    const input = {
      beforeVersionsText: versions([{ id: baseline, number: 1, triggeredBy: 'version_upload' }]),
      afterVersionsText: versions([
        { id: baseline, number: 1, triggeredBy: 'version_upload' },
        { id: deployed, number: 2, triggeredBy: 'version_upload' },
      ]),
      afterDeploymentsText: active(),
      commandOutput: commandOutput(),
    };
    expect(() => verifyPreviewWorkerDeployment({
      ...input,
      afterVersionsText: versions([
        { id: baseline, number: 1, triggeredBy: 'version_upload' }, { id: deployed, number: 2, triggeredBy: 'version_upload' },
        { id: '423e4567-e89b-42d3-a456-426614174000', number: 3, triggeredBy: 'secret' },
      ]),
    })).toThrow('not the latest uploaded Worker version');
    expect(() => verifyPreviewWorkerDeployment({ ...input, afterDeploymentsText: active(baseline) }))
      .toThrow('sole 100% active preview deployment');
    expect(() => verifyPreviewWorkerDeployment({ ...input, afterDeploymentsText: active(deployed, 99) }))
      .toThrow('sole 100% active preview deployment');
  });

  it('binds the audit to a second observation of the exact same active deployment', () => {
    const preAudit = verifyPreviewWorkerDeployment({
      beforeVersionsText: versions([{ id: baseline, number: 1, triggeredBy: 'version_upload' }]),
      afterVersionsText: versions([
        { id: baseline, number: 1, triggeredBy: 'version_upload' },
        { id: deployed, number: 2, triggeredBy: 'version_upload' },
      ]),
      afterDeploymentsText: active(),
      commandOutput: commandOutput(),
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

  it('permits only a secret-annotated intermediate version before the command-reported final deploy', () => {
    const secretVersion = '423e4567-e89b-42d3-a456-426614174000';
    const identity = verifyPreviewWorkerDeployment({
      beforeVersionsText: versions([{ id: baseline, number: 108, triggeredBy: 'version_upload' }]),
      afterVersionsText: versions([
        { id: baseline, number: 108, triggeredBy: 'version_upload' },
        { id: secretVersion, number: 109, triggeredBy: 'secret' },
        { id: deployed, number: 110, triggeredBy: 'version_upload' },
      ]),
      afterDeploymentsText: active(),
      commandOutput: commandOutput(),
    });
    expect(identity.addedVersionIds).toEqual([secretVersion, deployed]);
    expect(identity.commandReportedVersionId).toBe(deployed);

    expect(() => verifyPreviewWorkerDeployment({
      beforeVersionsText: versions([{ id: baseline, number: 108, triggeredBy: 'version_upload' }]),
      afterVersionsText: versions([
        { id: baseline, number: 108, triggeredBy: 'version_upload' },
        { id: secretVersion, number: 109, triggeredBy: 'version_upload' },
        { id: deployed, number: 110, triggeredBy: 'version_upload' },
      ]),
      afterDeploymentsText: active(), commandOutput: commandOutput(),
    })).toThrow('sole intermediate Worker version must be explicitly annotated as a secret update');
    expect(() => verifyPreviewWorkerDeployment({
      beforeVersionsText: versions([{ id: baseline, number: 108, triggeredBy: 'version_upload' }]),
      afterVersionsText: versions([
        { id: baseline, number: 108, triggeredBy: 'version_upload' },
        { id: secretVersion, number: 109, triggeredBy: 'secret' },
        { id: deployed, number: 110, triggeredBy: 'secret' },
      ]),
      afterDeploymentsText: active(), commandOutput: commandOutput(),
    })).toThrow('not annotated as a version_upload');
    expect(() => verifyPreviewWorkerDeployment({
      beforeVersionsText: versions([{ id: baseline, number: 108, triggeredBy: 'version_upload' }]),
      afterVersionsText: versions([{ id: baseline, number: 108, triggeredBy: 'version_upload' }]),
      afterDeploymentsText: active(), commandOutput: commandOutput(),
    })).toThrow('not newly added');
    expect(() => verifyPreviewWorkerDeployment({
      beforeVersionsText: versions([{ id: baseline, number: 108, triggeredBy: 'version_upload' }]),
      afterVersionsText: versions([
        { id: baseline, number: 108, triggeredBy: 'version_upload' },
        { id: secretVersion, number: 109, triggeredBy: 'secret' },
        { id: deployed, number: 110, triggeredBy: 'version_upload' },
      ]),
      afterDeploymentsText: active(), commandOutput: `${commandOutput()}Current Version ID: ${deployed}\n`,
    })).toThrow('exactly one Current Version ID line');
  });

  it('rejects more than one intermediate, nonconsecutive numbers, and reversed intermediate timing', () => {
    const secretOne = '423e4567-e89b-42d3-a456-426614174000';
    const secretTwo = '523e4567-e89b-42d3-a456-426614174000';
    const before = versions([{
      id: baseline, number: 108, triggeredBy: 'version_upload', createdOn: '2026-07-23T00:00:00.000Z',
    }]);
    expect(() => verifyPreviewWorkerDeployment({
      beforeVersionsText: before,
      afterVersionsText: versions([
        { id: baseline, number: 108, triggeredBy: 'version_upload' },
        { id: secretOne, number: 109, triggeredBy: 'secret' },
        { id: secretTwo, number: 110, triggeredBy: 'secret' },
        { id: deployed, number: 111, triggeredBy: 'version_upload' },
      ]), afterDeploymentsText: active(), commandOutput: commandOutput(),
    })).toThrow('only the final version or one secret-update intermediate');
    expect(() => verifyPreviewWorkerDeployment({
      beforeVersionsText: before,
      afterVersionsText: versions([
        { id: baseline, number: 108, triggeredBy: 'version_upload' },
        { id: secretOne, number: 109, triggeredBy: 'secret' },
        { id: deployed, number: 111, triggeredBy: 'version_upload' },
      ]), afterDeploymentsText: active(), commandOutput: commandOutput(),
    })).toThrow('not continuous from the highest pre-deploy version');
    expect(() => verifyPreviewWorkerDeployment({
      beforeVersionsText: before,
      afterVersionsText: versions([
        { id: baseline, number: 108, triggeredBy: 'version_upload' },
        { id: secretOne, number: 109, triggeredBy: 'secret', createdOn: '2026-07-23T00:00:20.000Z' },
        { id: deployed, number: 110, triggeredBy: 'version_upload', createdOn: '2026-07-23T00:00:10.000Z' },
      ]), afterDeploymentsText: active(), commandOutput: commandOutput(),
    })).toThrow('must precede the final deploy version');
    expect(() => verifyPreviewWorkerDeployment({
      beforeVersionsText: versions([{
        id: baseline, number: 108, triggeredBy: 'version_upload', createdOn: '2026-07-23T00:00:20.000Z',
      }]),
      afterVersionsText: versions([
        { id: baseline, number: 108, triggeredBy: 'version_upload', createdOn: '2026-07-23T00:00:20.000Z' },
        { id: deployed, number: 109, triggeredBy: 'version_upload', createdOn: '2026-07-23T00:00:10.000Z' },
      ]), afterDeploymentsText: active(), commandOutput: commandOutput(),
    })).toThrow('must follow the highest pre-deploy version in time');
    expect(() => verifyPreviewWorkerDeployment({
      beforeVersionsText: versions([{
        id: baseline, number: 108, triggeredBy: 'version_upload', createdOn: '2026-07-23T00:00:20.000Z',
      }]),
      afterVersionsText: versions([
        { id: baseline, number: 108, triggeredBy: 'version_upload', createdOn: '2026-07-23T00:00:20.000Z' },
        { id: secretOne, number: 109, triggeredBy: 'secret', createdOn: '2026-07-23T00:00:10.000Z' },
        { id: deployed, number: 110, triggeredBy: 'version_upload', createdOn: '2026-07-23T00:00:30.000Z' },
      ]), afterDeploymentsText: active(), commandOutput: commandOutput(),
    })).toThrow('must follow the highest pre-deploy version in time');
  });

  it('rejects malformed, duplicate, and misordered retained added-version evidence', () => {
    const secretVersion = '423e4567-e89b-42d3-a456-426614174000';
    const preAudit = verifyPreviewWorkerDeployment({
      beforeVersionsText: versions([{ id: baseline, number: 108, triggeredBy: 'version_upload' }]),
      afterVersionsText: versions([
        { id: baseline, number: 108, triggeredBy: 'version_upload' },
        { id: secretVersion, number: 109, triggeredBy: 'secret' },
        { id: deployed, number: 110, triggeredBy: 'version_upload' },
      ]), afterDeploymentsText: active(), commandOutput: commandOutput(),
    });
    for (const addedVersionIds of [
      [deployed, secretVersion],
      [secretVersion, secretVersion],
      ['not-a-uuid'],
      [secretVersion, deployed, '623e4567-e89b-42d3-a456-426614174000'],
    ]) {
      expect(() => verifyPreviewWorkerAuditStability({ ...preAudit, addedVersionIds } as never, active()))
        .toThrow('added-version evidence is malformed');
    }
  });
});
