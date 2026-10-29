#!/usr/bin/env tsx
/** One approved diagnostic, never a corpus proof or a deployment. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { ACCOUNT, TARGETS, classifyApplicationRelease } from './application-release-policy.mjs';
import { CorpusProofTransport } from './corpus-proof-transport.js';
import type { ProofQuery } from './corpus-source-proof.js';

export const FTS_DIAGNOSTIC = Object.freeze({
  authorization: 'pr167-fts-only-20261029-01',
  priorReads: 3_303_879, priorDiagnosticCommands: 1,
  readReservation: 3_510_997, hardReadCap: 3_800_000, diagnosticCommandLimit: 4,
  query: Object.freeze({ kind: 'fts-integrity', label: 'fts-only:strongs_fts',
    sql: `INSERT INTO "strongs_fts"("strongs_fts",rank) VALUES('integrity-check',1)`, readCeiling: 4096, writeCeiling: 1 } as const),
});
const check = (v: unknown, reason: string): void => { if (!v) throw Error(`FTS-only diagnostic refused: ${reason}`); };
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
type Identity = { sourceCommit: string; sourceTree: string; runId: string; sourceRunId: string };
export function requireFtsDiagnosticApproval(value: unknown, expected: Identity, now = Date.now()): void {
  check(value && typeof value === 'object' && !Array.isArray(value), 'explicit approval');
  const a = value as Record<string, unknown>;
  const required = { schemaVersion: 'theologai-preview-fts-only-approval.v1', authorization: FTS_DIAGNOSTIC.authorization,
    role: 'preview', accountId: ACCOUNT, databaseId: TARGETS.preview.databaseId,
    sourceCommit: expected.sourceCommit, sourceTree: expected.sourceTree, runId: expected.runId, sourceRunId: expected.sourceRunId,
    priorReads: FTS_DIAGNOSTIC.priorReads, priorDiagnosticCommands: FTS_DIAGNOSTIC.priorDiagnosticCommands,
    maxReads: 4096, maxDiagnosticCommands: 1, runAttempt: 1 };
  check(Object.keys(a).sort().join(',') === [...Object.keys(required), 'expiresAt'].sort().join(','), 'approval shape');
  for (const [key, value] of Object.entries(required)) check(a[key] === value, `approval ${key}`);
  check(/^[0-9a-f]{40}$/.test(expected.sourceCommit) && /^[0-9a-f]{40}$/.test(expected.sourceTree)
    && /^[1-9][0-9]*$/.test(expected.runId) && /^[1-9][0-9]*$/.test(expected.sourceRunId), 'identity');
  const expiry = Date.parse(String(a.expiresAt));
  check(Number.isFinite(expiry) && expiry > now && expiry - now <= 300_000, 'five-minute expiry');
  check(FTS_DIAGNOSTIC.priorReads + 4096 <= FTS_DIAGNOSTIC.readReservation
    && FTS_DIAGNOSTIC.priorReads + 4096 <= FTS_DIAGNOSTIC.hardReadCap
    && FTS_DIAGNOSTIC.priorDiagnosticCommands + 1 <= FTS_DIAGNOSTIC.diagnosticCommandLimit, 'cumulative allowance');
}
type Metering = CorpusProofTransport['metering'];
type Transport = Pick<CorpusProofTransport, 'start' | 'execute' | 'finish' | 'metering'>;
type TransportFactory = (options: { role: 'preview'; token: string; readBudget: number; eventFile: string }) => Transport;
export async function runFtsOnlyDiagnostic(input: Identity & { token: string; approval: unknown; output: string }, factory: TransportFactory = o => new CorpusProofTransport(o)) {
  requireFtsDiagnosticApproval(input.approval, input);
  const query: ProofQuery = FTS_DIAGNOSTIC.query;
  const eventFile = input.output + '.events.jsonl';
  const transport = factory({ role: 'preview', token: input.token, readBudget: 4096, eventFile });
  let result = 'NOT_DISPATCHED'; let failureKind: string | null = null; let controlsUnchanged = false;
  try {
    await transport.start();
    check(Date.now() < Date.parse(String((input.approval as Record<string, unknown>).expiresAt)), 'approval expired before dispatch');
    const rows = await transport.execute(query);
    check(rows.length === 0, 'integrity result shape');
    result = 'PASSED';
  } catch (error) {
    result = transport.metering.requests ? 'FAILED_OR_AMBIGUOUS' : 'NOT_DISPATCHED';
    failureKind = error instanceof Error && ['Error', 'AbortError', 'TimeoutError', 'TypeError', 'SyntaxError'].includes(error.name) ? error.name : 'unknown';
  }
  // After a failed query, use a separate zero-SQL observer; the halted query
  // transport must never be resumed. This cannot issue another diagnostic.
  try {
    const observer = factory({ role: 'preview', token: input.token, readBudget: 0, eventFile: input.output + '.controls.jsonl' });
    await observer.start(); const after = await observer.finish();
    const events = readFileSync(eventFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
    const before = events.find(e => e.kind === 'admitted');
    controlsUnchanged = Boolean(before && JSON.stringify(before.controls) === JSON.stringify(after.controls));
  } catch { controlsUnchanged = false; }
  const metering: Metering = { ...transport.metering };
  const dispatched = metering.requests > 0;
  check(metering.requests <= 1 && metering.integrityCommands <= 1, 'one diagnostic only');
  const additionalReads = dispatched ? Math.max(4096, metering.rowsRead) : 0;
  const receipt = { schemaVersion: 'theologai-preview-fts-only-diagnostic.v1', authorization: FTS_DIAGNOSTIC.authorization,
    ...Object.fromEntries(Object.entries(input).filter(([key]) => ['sourceCommit', 'sourceTree', 'runId', 'sourceRunId'].includes(key))),
    role: 'preview', accountId: ACCOUNT, databaseId: TARGETS.preview.databaseId,
    completedAt: new Date().toISOString(), result, failureKind, controlsUnchanged, metering,
    cumulativeReadsSpentOrReserved: FTS_DIAGNOSTIC.priorReads + additionalReads,
    cumulativeDiagnosticCommandsSpentOrReserved: FTS_DIAGNOSTIC.priorDiagnosticCommands + (dispatched ? 1 : 0),
    cumulativeDiagnosticWritesSpentOrReserved: FTS_DIAGNOSTIC.priorDiagnosticCommands + Math.max(dispatched ? 1 : 0, metering.rowsWritten),
    accounting: 'Reserve the full query ceilings even for a confirmed rejection; never release the earlier ambiguous reserve.',
    commandSha256: sha(query.sql), completeCorpusProof: false, releaseEligible: false, deploymentExecuted: false, productionApproved: false, sec06: 'OPEN_PAUSED' };
  writeFileSync(input.output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return receipt;
}

async function main(): Promise<void> {
  check(process.argv.length === 3, 'only output path is accepted');
  const text = process.env.APPLICATION_FTS_DIAGNOSTIC_APPROVAL_JSON;
  check(text && Buffer.byteLength(text) <= 4096, 'explicit approval missing');
  check(process.env.GITHUB_RUN_ATTEMPT === '1' && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'single manual attempt');
  check(process.env.CLOUDFLARE_ACCOUNT_ID === ACCOUNT && process.env.CLOUDFLARE_API_TOKEN, 'existing account/credential');
  const c = classifyApplicationRelease(process.cwd());
  const receipt = await runFtsOnlyDiagnostic({ sourceCommit: c.sourceCommit, sourceTree: c.sourceTree,
    runId: process.env.GITHUB_RUN_ID ?? '', sourceRunId: process.env.FTS_SOURCE_RUN_ID ?? '',
    token: process.env.CLOUDFLARE_API_TOKEN!, approval: JSON.parse(text!), output: resolve(process.argv[2]!) });
  if (receipt.result !== 'PASSED' || !receipt.controlsUnchanged) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write('FTS-only diagnostic refused; inspect sanitized evidence.\n'); process.exitCode = 1; });
}
