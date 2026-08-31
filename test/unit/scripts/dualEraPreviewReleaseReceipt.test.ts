import { describe, expect, it } from 'vitest';
import {
  createDualEraPreviewReleaseReceipt,
  verifyDualEraPreviewReleaseReceipt,
} from '../../../scripts/dual-era-preview-release-receipt.js';

const capturedAt = '2026-08-31T12:00:00.000Z';
const fingerprints = {
  capabilities: '1'.repeat(64), tools: '2'.repeat(64), prompts: '3'.repeat(64),
  resourceTemplates: '4'.repeat(64), staticResources: '5'.repeat(64),
};
const counts = { tools: 11, prompts: 6, resourceTemplates: 2, staticResources: 3 };
const auditText = `${JSON.stringify({
  schemaVersion: 'theologai-dual-era-mcp-preview-audit.v1', capturedAt,
  endpoint: 'https://preview-mcp.theologai.xyz/mcp', productProfile: '7',
  eras: ['2025-11-25', '2026-07-28'].map(protocolVersion => ({
    protocolVersion, serverName: 'theologai-bible-server', serverVersion: '3.6.0', counts, fingerprints,
  })),
  crossEraContractSha256: '6'.repeat(64),
})}\n`;
const workerIdentityText = JSON.stringify({
  schemaVersion: 2, worker: 'theologai-preview',
  deployedVersionId: '11111111-1111-4111-8111-111111111111', deployedVersionNumber: 151,
  deploymentId: '22222222-2222-4222-8222-222222222222',
});
const cutoverText = JSON.stringify({
  worker: 'theologai-preview', candidateBindingMatches: true,
  observedActiveVersionId: '11111111-1111-4111-8111-111111111111',
  observedActiveDeploymentId: '22222222-2222-4222-8222-222222222222',
  candidateD1: {
    binding: 'THEOLOGAI_DB', databaseName: 'theologai-preview-20260811-schema0009-a',
    databaseId: '33333333-3333-4333-8333-333333333333',
  },
  observedActiveD1: { binding: 'THEOLOGAI_DB', databaseId: '33333333-3333-4333-8333-333333333333' },
});
const readinessText = JSON.stringify({
  schemaVersion: 'theologai-remote-d1-readiness-receipt.v1',
  database: 'theologai-preview-20260811-schema0009-a', environment: 'preview',
});

function receipt() {
  return createDualEraPreviewReleaseReceipt({
    repository: 'owner/TheologAI', pullRequest: 150, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
    auditText, workerIdentityText, cutoverText, d1ReadinessText: readinessText,
  });
}

describe('dual-era protected preview receipt', () => {
  it('binds a fresh dual-era audit to exact source, Worker, and D1 identities', () => {
    const value = receipt();
    expect(verifyDualEraPreviewReleaseReceipt(value, {
      repository: 'owner/TheologAI', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      serverVersion: '3.6.0', now: new Date('2026-09-07T11:59:59.000Z'),
    })).toEqual(value);
    expect(value.protocols).toEqual(['2025-11-25', '2026-07-28']);
    expect(value.worker.versionNumber).toBe(151);
  });

  it('fails closed when evidence is stale or belongs to another source tree', () => {
    const value = receipt();
    expect(() => verifyDualEraPreviewReleaseReceipt(value, {
      repository: 'owner/TheologAI', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      serverVersion: '3.6.0', now: new Date('2026-09-07T12:00:01.000Z'),
    })).toThrow(/seven-day freshness/);
    expect(() => verifyDualEraPreviewReleaseReceipt(value, {
      repository: 'owner/TheologAI', sourceCommit: 'a'.repeat(40), sourceTree: 'c'.repeat(40),
      serverVersion: '3.6.0', now: new Date(capturedAt),
    })).toThrow(/identity/);
  });

  it('rejects a cutover whose observed D1 differs from the readiness-tested candidate', () => {
    const changed = JSON.stringify({
      ...JSON.parse(cutoverText),
      observedActiveD1: { binding: 'THEOLOGAI_DB', databaseId: '44444444-4444-4444-8444-444444444444' },
    });
    expect(() => createDualEraPreviewReleaseReceipt({
      repository: 'owner/TheologAI', pullRequest: 150, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      auditText, workerIdentityText, cutoverText: changed, d1ReadinessText: readinessText,
    })).toThrow(/cutover identity/);
  });
});
