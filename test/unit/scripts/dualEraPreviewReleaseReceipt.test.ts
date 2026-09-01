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
    protocolVersion, serverName: 'theologai-bible-server', serverVersion: '4.0.0-preview', counts, fingerprints,
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
const originalLanguageAuditText = `${JSON.stringify({
  schemaVersion: 2, audit: 'original-language-v3-preview', endpointClass: 'preview-custom',
  fixtureSha256: '85cc334e1980d9959521b3a59f316d8fa0373407f7aa12e822160be75d5acfc5', durationMs: 100,
  negotiated: {
    protocolVersion: '2025-11-25', serverName: 'theologai-bible-server', serverVersion: '4.0.0-preview',
  },
  schemas: {
    inputSchemaSha256: '4e8d3406f59d9f4bd488a4ac7b22148b186b1b57268ec4382e3f3193dd4249c0',
    outputSchemaSha256: '5560dc82255ed7eb2847c783884ae57d8d08ff8038d9775eff3cc9063bf1a35d',
    promptsSha256: '5cdaaed864d234e0ac04fd66c7cb1bb44d3d7bb8ee601abcc4726e62c4406d63',
  },
  promptRecords: [
    ['word-study-beginner', 'beginner'],
    ['passage-exegesis-technical', 'technical'],
    ['compare-translations-default', 'intermediate'],
  ].map(([id, expectedDepth], index) => ({ id, expectedDepth, passed: true, generatedPromptSha256: String(index + 1).repeat(64) })),
  budgets: {
    logicalOperations: 21, maximumLogicalOperations: 21, httpExchanges: 22, maximumHttpExchanges: 22,
    aggregateMcpResponseBytes: 500_000, maximumAggregateMcpResponseBytes: 1024 * 1024, retryCount: 0,
    perRequestMaximumDurationMs: 30_000, maximumDurationMs: 180_000, maximumMcpResponseBytes: 256 * 1024,
  },
  records: [
    ['greek-beginner', 'success'], ['greek-default-intermediate', 'success'],
    ['greek-technical', 'success'], ['hebrew-position-required', 'success'],
    ['h0216-beginner', 'success'], ['h3027-intermediate', 'success'],
    ['h3027-technical', 'success'], ['semantic-continuation', 'success'],
    ['occurrence-continuation', 'success'], ['h1961-unavailable', 'success'],
    ['stale-v2-cursor', 'safe-error'], ['removed-detail', 'input-error'],
    ['cursor-wrong-depth', 'safe-error'], ['cursor-corrupt', 'safe-error'],
    ['forbidden-artifact-identity', 'input-error'],
  ].map(([id, mode]) => ({ id, mode, durationMs: 1, passed: true, request: {}, result: {} })),
})}\n`;

function receipt() {
  return createDualEraPreviewReleaseReceipt({
    repository: 'owner/TheologAI', pullRequest: 150, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
    auditText, originalLanguageAuditText, workerIdentityText, cutoverText, d1ReadinessText: readinessText,
  });
}

describe('dual-era protected preview receipt', () => {
  it('binds a fresh dual-era audit to exact source, Worker, and D1 identities', () => {
    const value = receipt();
    expect(verifyDualEraPreviewReleaseReceipt(value, {
      repository: 'owner/TheologAI', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      serverVersion: '4.0.0-preview', originalLanguageAuditText,
      now: new Date('2026-09-07T11:59:59.000Z'),
    })).toEqual(value);
    expect(value.protocols).toEqual(['2025-11-25', '2026-07-28']);
    expect(value.worker.versionNumber).toBe(151);
    expect(value.originalLanguageAuditSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() => verifyDualEraPreviewReleaseReceipt(value, {
      repository: 'owner/TheologAI', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      serverVersion: '4.0.0', originalLanguageAuditText, now: new Date(capturedAt),
    })).toThrow(/contract evidence/);
  });

  it('fails closed when evidence is stale or belongs to another source tree', () => {
    const value = receipt();
    expect(() => verifyDualEraPreviewReleaseReceipt(value, {
      repository: 'owner/TheologAI', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      serverVersion: '4.0.0-preview', originalLanguageAuditText, now: new Date('2026-09-07T12:00:01.000Z'),
    })).toThrow(/seven-day freshness/);
    expect(() => verifyDualEraPreviewReleaseReceipt(value, {
      repository: 'owner/TheologAI', sourceCommit: 'a'.repeat(40), sourceTree: 'c'.repeat(40),
      serverVersion: '4.0.0-preview', originalLanguageAuditText, now: new Date(capturedAt),
    })).toThrow(/identity/);
  });

  it('rejects a cutover whose observed D1 differs from the readiness-tested candidate', () => {
    const changed = JSON.stringify({
      ...JSON.parse(cutoverText),
      observedActiveD1: { binding: 'THEOLOGAI_DB', databaseId: '44444444-4444-4444-8444-444444444444' },
    });
    expect(() => createDualEraPreviewReleaseReceipt({
      repository: 'owner/TheologAI', pullRequest: 150, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      auditText, originalLanguageAuditText, workerIdentityText, cutoverText: changed, d1ReadinessText: readinessText,
    })).toThrow(/cutover identity/);
  });

  it('fails closed when the bound original-language audit changes or is incomplete', () => {
    const value = receipt();
    const changed = originalLanguageAuditText.replace('500000', '500001');
    expect(() => verifyDualEraPreviewReleaseReceipt(value, {
      repository: 'owner/TheologAI', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      serverVersion: '4.0.0-preview', originalLanguageAuditText: changed, now: new Date(capturedAt),
    })).toThrow(/contract evidence/);
    const incomplete = originalLanguageAuditText.replace('"passed":true', '"passed":false');
    expect(() => createDualEraPreviewReleaseReceipt({
      repository: 'owner/TheologAI', pullRequest: 150, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      auditText, originalLanguageAuditText: incomplete, workerIdentityText, cutoverText, d1ReadinessText: readinessText,
    })).toThrow(/malformed or incomplete/);

    type MutableOriginalLanguageAudit = {
      fixtureSha256: string;
      promptRecords: Array<{ id: string }>;
      records: unknown[];
      budgets: { maximumMcpResponseBytes: number };
    };
    for (const mutate of [
      (value: MutableOriginalLanguageAudit) => { value.fixtureSha256 = 'f'.repeat(64); },
      (value: MutableOriginalLanguageAudit) => { value.promptRecords[0]!.id = 'arbitrary-prompt'; },
      (value: MutableOriginalLanguageAudit) => { value.records.reverse(); },
      (value: MutableOriginalLanguageAudit) => { value.budgets.maximumMcpResponseBytes = 1; },
    ]) {
      const value = JSON.parse(originalLanguageAuditText) as MutableOriginalLanguageAudit;
      mutate(value);
      expect(() => createDualEraPreviewReleaseReceipt({
        repository: 'owner/TheologAI', pullRequest: 150, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
        auditText, originalLanguageAuditText: JSON.stringify(value), workerIdentityText, cutoverText,
        d1ReadinessText: readinessText,
      })).toThrow(/malformed or incomplete/);
    }
  });
});
