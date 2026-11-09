import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { CorpusProofTransport, admitCorpusBudget } from '../../../scripts/corpus-proof-transport.js';
import { corpusTransportFixture } from '../../helpers/corpusTransportFixture.js';
import { boundPreview, cumulativeTask } from '../../helpers/boundPreviewFixture.js';
const authority = createRequire(import.meta.url)('../../../.github/scripts/operator-authorization.cjs');
const now = Date.parse('2026-11-09T12:00:00Z');
function approval() {
  const authorization = { schemaVersion: 'theologai-operator-authorization.v1', scope: 'new-additional-operation',
    exclusiveDataWritesDuringWindow: true, candidateWriteJobsPaused: true, releasePolicy: 'norton-aquinas.v1', liveControlReserve: 100000,
    expectedLedgerSha256: '1'.repeat(64), repository: 'TJ-Frederick/TheologAI', ownerActorId: 40179660, role: 'preview',
    pullRequestNumber: 176, headBranch: 'codex/norton-aquinas-successor', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), baseCommit: 'c'.repeat(40), sourcePlanSha256: 'd'.repeat(64),
    targetRunId: '123', targetRunAttempt: 1, authorizationId: 'operation-bound-fixture', ledgerId: 'operation-bound-fixture',
    notBefore: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 7200000).toISOString(), reservedReads: 3560000, hardReadCap: 3560000,
    diagnosticCommands: 4, maxWrites: 4, previousReadsSpentOrReserved: 0, previousWritesSpentOrReserved: 0, previousDiagnosticCommands: 0,
    outstandingPriorReservationsAccepted: true, boundPreview: structuredClone(boundPreview), cumulativeTask: structuredClone(cumulativeTask) };
  return { authorization, provenance: { runId: '321', artifactId: '654', digest: 'sha256:' + '9'.repeat(64), contentSha256: createHash('sha256').update(JSON.stringify(authorization)).digest('hex') } };
}
it.each(['missing-holds', 'subtract-reads', 'subtract-writes', 'ceiling-reset', 'wrong-version', 'wrong-source', 'expired', 'production'])('rejects bound authority defect %s before provider access', fault => {
  const p = approval(); const context = { sourceCommit: p.authorization.sourceCommit, sourceTree: p.authorization.sourceTree, runId: '123' };
  if (fault === 'missing-holds') delete (p.authorization as any).cumulativeTask;
  if (fault === 'subtract-reads') p.authorization.cumulativeTask.previousReadsHeld--;
  if (fault === 'subtract-writes') p.authorization.cumulativeTask.previousDiagnosticWritesHeld--;
  if (fault === 'ceiling-reset') p.authorization.cumulativeTask.cumulativeReadCeiling = 4400000;
  if (fault === 'wrong-version') p.authorization.boundPreview.previewVersionId = '1'.repeat(36);
  if (fault === 'wrong-source') context.sourceTree = 'e'.repeat(40);
  if (fault === 'expired') p.authorization.expiresAt = new Date(now - 1).toISOString();
  if (fault === 'production') p.authorization.role = 'production';
  expect(() => authority.boundPreviewForPackage(p, context, now)).toThrow();
});
it('keeps cumulative task allowance separate from the 4M daily admission ceiling', () => {
  expect(() => admitCorpusBudget(140000, 3560000, 140000, 0, 4000000, 100000, { role: 'preview', day: '2026-11-09', historicalExceptions: false })).not.toThrow();
  expect(() => admitCorpusBudget(140001, 3560000, 140001, 0, 4000000, 100000, { role: 'preview', day: '2026-11-09', historicalExceptions: false })).toThrow();
});
it.each(['valid', 'unbound-mode', 'wrong-version', 'wrong-deployment', 'wrong-binding', 'production-drift', 'second-scan-drift', 'post-inventory-race', 'additional-worker', 'expired'])('checks complete bound inventory and controls: %s', async fault => {
  const directory = mkdtempSync(join(tmpdir(), 'bound-preview-proof-'));
  let time = now, scans = 0, sql = 0, providerCalls = 0;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => time);
  try {
    const p = approval(); const context = { package: p, sourceCommit: p.authorization.sourceCommit, sourceTree: p.authorization.sourceTree, runId: '123' };
    const fixture = corpusTransportFixture({ role: 'preview', boundPreview: true, advance: () => { time += 1000; }, query: () => { sql++; return { rows: [], rowsRead: 1, rowsWritten: 0 }; } });
    const fetchImpl = (async (input: any, init: any) => {
      providerCalls++; const path = new URL(String(input)).pathname;
      const response = await fixture.fetch(input, init); const v = await response.json() as any;
      if (path.endsWith('/workers/scripts')) { scans++; if (fault === 'additional-worker') v.result.push({ id: 'other' }); }
      if (fault === 'additional-worker' && path.includes('/other/')) throw Error('unexpected candidate binding');
      if (path.includes('/theologai-preview/')) {
        if (path.endsWith('/settings') && fault === 'wrong-binding') v.result.bindings[0].id = boundPreview.productionDatabaseId;
        if (path.endsWith('/deployments') && (fault === 'wrong-deployment' || fault === 'second-scan-drift' && scans > 1)) v.result.deployments[0].id = boundPreview.productionDeploymentId;
        if (path.endsWith('/deployments') && fault === 'post-inventory-race' && scans === 2 && new URL(String(input)).searchParams.get('per_page') === '1') v.result.deployments[0].id = boundPreview.productionDeploymentId;
        if (path.endsWith('/deployments') && fault === 'wrong-version') v.result.deployments[0].versions[0].version_id = boundPreview.productionVersionId;
      }
      if (path.includes('/theologai/deployments') && fault === 'production-drift') v.result.deployments[0].id = boundPreview.previewDeploymentId;
      return Response.json(v);
    }) as typeof fetch;
    const transport = new CorpusProofTransport({ policy: 'norton-aquinas.v1', role: 'preview', token: 'synthetic-only', readBudget: 3560000, eventFile: join(directory, 'events'), fetch: fetchImpl, historicalExceptions: false,
      ...(fault === 'unbound-mode' ? {} : { boundPreviewAuthorization: context }) });
    if (fault === 'expired') time += 7200001;
    if (fault === 'valid') {
      await transport.start(); expect(transport.protectedAdmission().controls).toContainEqual(expect.objectContaining({ kind: 'bound-preview-corpus' }));
      await transport.finish();
    } else await expect(transport.start()).rejects.toThrow(fault === 'post-inventory-race' ? 'owner-pinned bound assignment changed' : undefined);
    expect(sql).toBe(0); if (fault === 'expired') expect(providerCalls).toBe(0);
  } finally { clock.mockRestore(); rmSync(directory, { recursive: true, force: true }); }
});
it.each(['valid', 'preview-drift', 'production-drift', 'binding-drift', 'expired'])('binds existing predeploy anchors to the owner window: %s', fault => {
  const p = approval();
  const preview = { worker: 'theologai-preview', predecessorDeploymentId: boundPreview.previewDeploymentId, predecessorVersionId: boundPreview.previewVersionId,
    predecessorD1: { databaseId: boundPreview.databaseId }, candidateD1: { databaseId: boundPreview.databaseId }, d1Changed: false };
  const production = { worker: 'theologai', deploymentId: boundPreview.productionDeploymentId, workerVersionId: boundPreview.productionVersionId,
    d1: { databaseId: boundPreview.productionDatabaseId }, configuredD1: { databaseId: boundPreview.productionDatabaseId } };
  if (fault === 'preview-drift') preview.predecessorDeploymentId = boundPreview.productionDeploymentId;
  if (fault === 'production-drift') production.workerVersionId = boundPreview.previewVersionId;
  if (fault === 'binding-drift') preview.predecessorD1.databaseId = boundPreview.productionDatabaseId;
  const invoke = () => authority.requireBoundPreviewAnchors(p, preview, production, fault === 'expired' ? now + 7200001 : now);
  if (fault === 'valid') expect(invoke).not.toThrow(); else expect(invoke).toThrow();
});
