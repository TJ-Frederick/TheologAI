import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { ACCOUNT, CORPUS, SCHEMA, TARGETS } from '../../../scripts/application-release-policy.mjs';
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
    protocolVersion, serverName: 'theologai-bible-server', serverVersion: '3.6.0-preview', counts, fingerprints,
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
  it('keeps a complete fresh proof distinct and binds it to its source plan and preview UUID', () => {
    const now = new Date().toISOString();
    const tables = Object.fromEntries(Array.from({ length: 39 }, (_, i) => [`table_${i}`, { rows: 1, sha256: 'a'.repeat(64) }]));
    const planText = JSON.stringify({ schemaVersion: 'theologai-application-corpus-source-plan.v1', classification: { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40) }, expected: { digests: tables } });
    const proof = { schemaVersion: 'theologai-fresh-complete-corpus-proof.v1', role: 'preview', accountId: ACCOUNT, ...TARGETS.preview,
      sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), corpusIdentity: CORPUS, schema: SCHEMA,
      startedAt: now, completedAt: now, sourcePlanSha256: createHash('sha256').update(planText).digest('hex'), approvalSha256: 'a'.repeat(64),
      proof: { method: 'fresh_complete_cells_physical_and_rank1_fts.v1', tables, quickCheck: 'ok', sourceRows: 39, catalogSha256: 'c'.repeat(64), ledgerSha256: 'd'.repeat(64),
        ftsIntegrity: ['strongs_fts','sections_fts','historical_edition_sections_fts','historical_edition_hierarchy_bodies_fts'],
        foreignKeys: { method: 'local_clean_raw_schema_plus_all_child_parent_cells', witnessSha256: 'b'.repeat(64) } },
      readBudget: 3500000, metering: { rowsRead: 3300000, rowsWritten: 4, requests: 3293, integrityCommands: 4, retries: 0, unknownAttempts: 0 }, controlsUnchanged: true,
      operationalAssumption: 'owner_reserves_target_data_writes_during_proof_not_an_enforced_provider_lease' };
    const cutover = JSON.parse(cutoverText); cutover.candidateD1.databaseId = TARGETS.preview.databaseId; cutover.observedActiveD1.databaseId = TARGETS.preview.databaseId;
    const input = { repository: 'owner/TheologAI', pullRequest: 167, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      auditText: JSON.stringify({ ...JSON.parse(auditText), capturedAt: now }), workerIdentityText, cutoverText: JSON.stringify(cutover), d1ReadinessText: JSON.stringify(proof), d1SourcePlanText: planText };
    const value = createDualEraPreviewReleaseReceipt(input);
    expect(value.schemaVersion).toBe('theologai-dual-era-preview-release-receipt.v2');
    expect(value.d1ReadinessKind).toBe('fresh-complete-corpus-proof');
    expect(verifyDualEraPreviewReleaseReceipt(value, { repository: input.repository, sourceCommit: input.sourceCommit, sourceTree: input.sourceTree, serverVersion: '3.6.0-preview' })).toEqual(value);
    for (const change of [{ role: 'production' }, { databaseId: TARGETS.production.databaseId }, { sourceTree: 'c'.repeat(40) }, { metering: { ...proof.metering, unknownAttempts: 1 } }]) {
      expect(() => createDualEraPreviewReleaseReceipt({ ...input, d1ReadinessText: JSON.stringify({ ...proof, ...change }) })).toThrow();
    }
    expect(() => createDualEraPreviewReleaseReceipt({ ...input, d1SourcePlanText: planText + ' ' })).toThrow('plan digest');
    expect(() => createDualEraPreviewReleaseReceipt({ ...input, d1SourcePlanText: undefined })).toThrow('source plan');
    expect(() => verifyDualEraPreviewReleaseReceipt({ ...value, d1ReadinessKind: 'historical-custody' }, { repository: input.repository, sourceCommit: input.sourceCommit, sourceTree: input.sourceTree, serverVersion: '3.6.0-preview' })).toThrow();
  });
  it('binds a fresh dual-era audit to exact source, Worker, and D1 identities', () => {
    const value = receipt();
    expect(verifyDualEraPreviewReleaseReceipt(value, {
      repository: 'owner/TheologAI', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      serverVersion: '3.6.0-preview', now: new Date('2026-09-07T11:59:59.000Z'),
    })).toEqual(value);
    expect(value.protocols).toEqual(['2025-11-25', '2026-07-28']);
    expect(value.worker.versionNumber).toBe(151);
    expect(() => verifyDualEraPreviewReleaseReceipt(value, {
      repository: 'owner/TheologAI', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      serverVersion: '3.6.0', now: new Date(capturedAt),
    })).toThrow(/contract evidence/);
  });

  it('fails closed when evidence is stale or belongs to another source tree', () => {
    const value = receipt();
    expect(() => verifyDualEraPreviewReleaseReceipt(value, {
      repository: 'owner/TheologAI', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      serverVersion: '3.6.0-preview', now: new Date('2026-09-07T12:00:01.000Z'),
    })).toThrow(/seven-day freshness/);
    expect(() => verifyDualEraPreviewReleaseReceipt(value, {
      repository: 'owner/TheologAI', sourceCommit: 'a'.repeat(40), sourceTree: 'c'.repeat(40),
      serverVersion: '3.6.0-preview', now: new Date(capturedAt),
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
