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
function approval(at = now) {
  const authorization = { schemaVersion: 'theologai-operator-authorization.v1', scope: 'new-additional-operation',
    exclusiveDataWritesDuringWindow: true, candidateWriteJobsPaused: true, releasePolicy: 'norton-aquinas.v1', liveControlReserve: 100000,
    expectedLedgerSha256: '1'.repeat(64), repository: 'TJ-Frederick/TheologAI', ownerActorId: 40179660, role: 'preview',
    pullRequestNumber: 176, headBranch: 'codex/norton-aquinas-successor', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), baseCommit: 'c'.repeat(40), sourcePlanSha256: 'd'.repeat(64),
    targetRunId: '123', targetRunAttempt: 1, authorizationId: 'operation-bound-fixture', ledgerId: 'operation-bound-fixture',
    notBefore: new Date(at - 1000).toISOString(), expiresAt: new Date(at + 7200000).toISOString(), reservedReads: 3560000, hardReadCap: 3560000,
    diagnosticCommands: 4, maxWrites: 4, previousReadsSpentOrReserved: 0, previousWritesSpentOrReserved: 0, previousDiagnosticCommands: 0,
    outstandingPriorReservationsAccepted: true, boundPreview: structuredClone(boundPreview), cumulativeTask: structuredClone(cumulativeTask) };
  return { authorization, provenance: { runId: '321', artifactId: '654', digest: 'sha256:' + '9'.repeat(64), contentSha256: createHash('sha256').update(JSON.stringify(authorization)).digest('hex') } };
}
it.each(['missing-holds', 'subtract-reads', 'subtract-writes', 'ceiling-reset', 'wrong-version', 'wrong-source', 'expired', 'production'] as const)('rejects bound authority defect %s before provider access', fault => {
  const p = approval(); const context = { sourceCommit: p.authorization.sourceCommit, sourceTree: p.authorization.sourceTree, runId: '123' };
  if (fault === 'missing-holds') delete (p.authorization as any).cumulativeTask;
  if (fault === 'subtract-reads') p.authorization.cumulativeTask.previousReadsHeld--;
  if (fault === 'subtract-writes') p.authorization.cumulativeTask.previousDiagnosticWritesHeld--;
  if (fault === 'ceiling-reset') p.authorization.cumulativeTask.cumulativeReadCeiling = 4400000;
  if (fault === 'wrong-version') p.authorization.boundPreview.previewVersionId = '1'.repeat(36);
  if (fault === 'wrong-source') context.sourceTree = 'e'.repeat(40);
  if (fault === 'expired') p.authorization.expiresAt = new Date(now - 1).toISOString();
  if (fault === 'production') { p.authorization.role = 'production'; p.authorization.headBranch = 'main'; p.authorization.liveControlReserve = 500000; }
  p.provenance.contentSha256 = createHash('sha256').update(JSON.stringify(p.authorization)).digest('hex');
  const errors = {
    'missing-holds': 'shape', 'subtract-reads': 'cumulative task previousReadsHeld',
    'subtract-writes': 'cumulative task previousDiagnosticWritesHeld', 'ceiling-reset': 'cumulative task cumulativeReadCeiling',
    'wrong-version': 'bound preview previewVersionId', 'wrong-source': 'expected sourceTree',
    expired: 'authorization window', production: 'bound preview scope',
  };
  expect(() => authority.boundPreviewForPackage(p, context, now)).toThrowError(new Error('Operator authorization refused: ' + errors[fault]));
});
it('keeps cumulative task allowance separate from the 4M daily admission ceiling', () => {
  expect(() => admitCorpusBudget(140000, 3560000, 140000, 0, 4000000, 100000, { role: 'preview', day: '2026-11-09', historicalExceptions: false })).not.toThrow();
  expect(() => admitCorpusBudget(140001, 3560000, 140001, 0, 4000000, 100000, { role: 'preview', day: '2026-11-09', historicalExceptions: false })).toThrowError(new Error('Corpus transport refused: insufficient account headroom'));
});
it.each(['valid', 'valid-next-day', 'unbound-mode', 'wrong-version', 'wrong-deployment', 'wrong-binding', 'production-drift', 'second-scan-drift', 'post-inventory-race', 'additional-worker', 'expired'] as const)('checks complete bound inventory and controls: %s', async fault => {
  const directory = mkdtempSync(join(tmpdir(), 'bound-preview-proof-'));
  let time = fault === 'valid-next-day' ? now + 86400000 : now, scans = 0, sql = 0, providerCalls = 0;
  const realDate = Date, realNow = Date.now, realSetTimeout = setTimeout;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(time);
  const authorityCheck = vi.spyOn(authority, 'boundPreviewForPackage');
  try {
    const p = approval(time); const context = { package: p, sourceCommit: p.authorization.sourceCommit, sourceTree: p.authorization.sourceTree, runId: '123' };
    const fixture = corpusTransportFixture({ role: 'preview', boundPreview: true, advance: () => { time += 1000; vi.setSystemTime(time); }, query: () => { sql++; return { rows: [], rowsRead: 1, rowsWritten: 0 }; } });
    const fetchImpl = (async (input: any, init: any) => {
      providerCalls++; const path = new URL(String(input)).pathname;
      // An additional Worker has coherent configured/active candidate bindings;
      // it must fail the complete inventory policy, not an unimplemented route.
      const fixtureInput = fault === 'additional-worker' ? String(input).replace('/other/', '/theologai-preview/') : input;
      const response = await fixture.fetch(fixtureInput, init); const v = await response.json() as any;
      if (path.endsWith('/workers/scripts')) { scans++; if (fault === 'additional-worker') v.result.push({ id: 'other' }); }
      if (path.includes('/theologai-preview/')) {
        if (path.endsWith('/settings') && fault === 'wrong-binding') v.result.bindings[0].id = boundPreview.productionDatabaseId;
        if (path.endsWith('/deployments') && (fault === 'wrong-deployment' || fault === 'second-scan-drift' && scans > 1)) v.result.deployments[0].id = boundPreview.productionDeploymentId;
        if (path.endsWith('/deployments') && fault === 'post-inventory-race' && scans === 2 && new URL(String(input)).searchParams.get('per_page') === '1') v.result.deployments[0].id = boundPreview.productionDeploymentId;
        if (path.endsWith('/deployments') && fault === 'wrong-version') v.result.deployments[0].versions[0].version_id = boundPreview.productionVersionId;
        if (path.endsWith('/versions/' + boundPreview.productionVersionId) && fault === 'wrong-version') v.result.id = boundPreview.productionVersionId;
      }
      if (path.includes('/theologai/deployments') && fault === 'production-drift') v.result.deployments[0].id = boundPreview.previewDeploymentId;
      return Response.json(v);
    }) as typeof fetch;
    const transport = new CorpusProofTransport({ policy: 'norton-aquinas.v1', role: 'preview', token: 'synthetic-only', readBudget: 3560000, eventFile: join(directory, 'events'), fetch: fetchImpl, historicalExceptions: false,
      ...(fault === 'unbound-mode' ? {} : { boundPreviewAuthorization: context }) });
    if (fault === 'expired') { time += 7200001; vi.setSystemTime(time); }
    expect(new Date().getTime()).toBe(Date.now()); expect(setTimeout).toBe(realSetTimeout);
    if (fault === 'valid' || fault === 'valid-next-day') {
      await transport.start(); expect(transport.protectedAdmission().controls).toContainEqual(expect.objectContaining({ kind: 'bound-preview-corpus' }));
      await transport.finish();
    } else {
      const errors = {
        'unbound-mode': 'Corpus control capture refused: candidate_database_is_bound',
        'wrong-version': 'Corpus control capture refused: bound_preview_assignment_changed',
        'wrong-deployment': 'Corpus control capture refused: bound_preview_assignment_changed',
        'wrong-binding': 'Corpus control capture refused: bound_preview_assignment_changed',
        'production-drift': 'Corpus control capture refused: bound_production_assignment_changed',
        'second-scan-drift': 'Corpus control capture refused: bound_preview_assignment_changed',
        'post-inventory-race': 'Corpus transport refused: owner-pinned bound assignment changed',
        'additional-worker': 'Corpus control capture refused: bound_preview_assignment_changed',
        expired: 'Corpus control capture refused: bounded_request_failed',
      };
      await expect(transport.start()).rejects.toThrowError(new Error(errors[fault]));
    }
    expect(sql).toBe(0);
    if (fault === 'expired') {
      expect(providerCalls).toBe(0);
      // The bounded API sanitizes the outward error; verify its actual cause.
      expect(authorityCheck.mock.results.at(-1)).toMatchObject({ type: 'throw', value: new Error('Operator authorization refused: authorization window') });
    }
  } finally { authorityCheck.mockRestore(); vi.useRealTimers(); rmSync(directory, { recursive: true, force: true }); }
  expect(Date).toBe(realDate); expect(Date.now).toBe(realNow); expect(setTimeout).toBe(realSetTimeout);
});
it.each(['valid', 'preview-drift', 'production-drift', 'binding-drift', 'expired'] as const)('binds existing predeploy anchors to the owner window: %s', fault => {
  const p = approval();
  const preview = { worker: 'theologai-preview', predecessorDeploymentId: boundPreview.previewDeploymentId, predecessorVersionId: boundPreview.previewVersionId,
    predecessorD1: { databaseId: boundPreview.databaseId }, candidateD1: { databaseId: boundPreview.databaseId }, d1Changed: false };
  const production = { worker: 'theologai', deploymentId: boundPreview.productionDeploymentId, workerVersionId: boundPreview.productionVersionId,
    d1: { databaseId: boundPreview.productionDatabaseId }, configuredD1: { databaseId: boundPreview.productionDatabaseId } };
  if (fault === 'preview-drift') preview.predecessorDeploymentId = boundPreview.productionDeploymentId;
  if (fault === 'production-drift') production.workerVersionId = boundPreview.previewVersionId;
  if (fault === 'binding-drift') preview.predecessorD1.databaseId = boundPreview.productionDatabaseId;
  const invoke = () => authority.requireBoundPreviewAnchors(p, preview, production, fault === 'expired' ? now + 7200001 : now);
  const errors = {
    'preview-drift': 'bound preview predecessor drift', 'production-drift': 'bound production control drift',
    'binding-drift': 'bound preview predecessor drift', expired: 'authorization window',
  };
  if (fault === 'valid') expect(invoke).not.toThrow();
  else expect(invoke).toThrowError(new Error('Operator authorization refused: ' + errors[fault]));
});

it('rejects an actual UTC day crossing before provider access and restores the complete clock', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bound-preview-utc-crossing-'));
  const realDate = Date, realNow = Date.now, realSetTimeout = setTimeout;
  const fetchImpl = vi.fn<typeof fetch>();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-09T22:00:00Z'));
  try {
    const transport = new CorpusProofTransport({ policy: 'norton-aquinas.v1', role: 'preview', token: 'synthetic-only',
      readBudget: 0, activated: true, eventFile: join(directory, 'events'), fetch: fetchImpl, historicalExceptions: false });
    expect(new Date().toISOString()).toBe('2026-11-09T22:00:00.000Z');
    // The admitted 90-minute window cannot legally span midnight; crossing it
    // must still hit the unchanged combined expiry/UTC guard before any IO.
    vi.setSystemTime(new Date('2026-11-10T00:00:00Z'));
    expect(Date.now()).toBe(Date.parse('2026-11-10T00:00:00Z'));
    expect(new Date().toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(setTimeout).toBe(realSetTimeout);
    await expect(transport.observeControls()).rejects.toThrowError(new Error('Corpus transport refused: halted, expired or UTC crossing'));
    expect(fetchImpl).not.toHaveBeenCalled(); expect(transport.metering.requests).toBe(0);
  } finally { vi.useRealTimers(); rmSync(directory, { recursive: true, force: true }); }
  expect(Date).toBe(realDate); expect(Date.now).toBe(realNow); expect(setTimeout).toBe(realSetTimeout);
});
