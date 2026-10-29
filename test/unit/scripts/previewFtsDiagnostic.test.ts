import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parse } from 'yaml';
import { ACCOUNT, TARGETS, verifyFreshCorpusReceipt } from '../../../scripts/application-release-policy.mjs';
import { FTS_DIAGNOSTIC, requireFtsDiagnosticApproval, runFtsOnlyDiagnostic } from '../../../scripts/preview-fts-diagnostic.js';

const identity = { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), runId: '123', sourceRunId: '122' };
const approval = () => ({ schemaVersion: 'theologai-preview-fts-only-approval.v1', authorization: FTS_DIAGNOSTIC.authorization,
  role: 'preview', accountId: ACCOUNT, databaseId: TARGETS.preview.databaseId, ...identity,
  priorReads: 3_303_879, priorDiagnosticCommands: 1, maxReads: 4096, maxDiagnosticCommands: 1, runAttempt: 1,
  expiresAt: new Date(Date.now() + 240_000).toISOString() });

describe('one-command preview FTS diagnostic', () => {
  it('binds approval to the exact target, source, run, command count and cumulative usage', () => {
    expect(() => requireFtsDiagnosticApproval(approval(), identity)).not.toThrow();
    for (const change of [{ role: 'production' }, { databaseId: TARGETS.production.databaseId }, { priorReads: 0 },
      { priorDiagnosticCommands: 0 }, { maxReads: 4097 }, { maxDiagnosticCommands: 2 }, { runAttempt: 2 },
      { sourceCommit: 'c'.repeat(40) }, { runId: '124' }, { sourceRunId: '121' }, { extra: true },
      { expiresAt: new Date(Date.now() - 1).toISOString() }, { expiresAt: new Date(Date.now() + 301_000).toISOString() }]) {
      expect(() => requireFtsDiagnosticApproval({ ...approval(), ...change }, identity)).toThrow();
    }
  });
  it('has one immutable command, not a rebuild or caller-selected SQL', () => {
    expect(FTS_DIAGNOSTIC.query).toEqual({ kind: 'fts-integrity', label: 'fts-only:strongs_fts', sql: `INSERT INTO "strongs_fts"("strongs_fts",rank) VALUES('integrity-check',1)`, readCeiling: 4096, writeCeiling: 1 });
    expect(Object.isFrozen(FTS_DIAGNOSTIC.query)).toBe(true);
  });
  for (const fault of ['', 'query', 'admission', 'control', 'expired', 'result-shape']) it(`bounds execution and reserves ambiguity (${fault || 'success'})`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'theologai-fts-only-')); const output = join(dir, 'receipt.json');
    const controls = [{ role: 'production', versionId: 'original' }, { role: 'preview', versionId: 'original' }];
    let executes = 0; let factories = 0;
    vi.useFakeTimers({ now: new Date('2026-10-29T12:00:00Z') });
    try {
      const a = approval();
      const result = await runFtsOnlyDiagnostic({ ...identity, token: 'never-record-this-secret', approval: a, output }, options => {
        const observer = factories++ > 0;
        expect(options.readBudget).toBe(observer ? 0 : 4096);
        const metering = { rowsRead: 0, rowsWritten: 0, requests: 0, retries: 0, unknownAttempts: 0, integrityCommands: 0 };
        return {
          metering,
          async start() {
            if (fault === 'admission') throw Error('synthetic failed admission');
            writeFileSync(options.eventFile, JSON.stringify({ kind: 'admitted', controls }) + '\n');
            if (fault === 'expired' && !observer) vi.advanceTimersByTime(300_000);
          },
          async execute(query) {
            expect(observer).toBe(false); expect(query).toEqual(FTS_DIAGNOSTIC.query);
            executes++; metering.requests++; metering.integrityCommands++;
            if (fault === 'query') { metering.unknownAttempts++; throw Error('never-record-this-secret'); }
            metering.rowsRead = 17; metering.rowsWritten = 1;
            return fault === 'result-shape' ? [{ unexpected: 'never-record-this-secret' }] : [];
          },
          async finish() { return { controlsUnchanged: true, controls: fault === 'control' ? [] : controls }; },
        };
      });
      const dispatched = fault !== 'admission' && fault !== 'expired';
      expect(executes).toBe(dispatched ? 1 : 0); expect(factories).toBe(2);
      expect(result.cumulativeReadsSpentOrReserved).toBe(3_303_879 + (dispatched ? 4096 : 0));
      expect(result.cumulativeDiagnosticCommandsSpentOrReserved).toBe(dispatched ? 2 : 1);
      expect(result.cumulativeDiagnosticWritesSpentOrReserved).toBe(dispatched ? 2 : 1);
      expect(result.result).toBe(fault === 'query' || fault === 'result-shape' ? 'FAILED_OR_AMBIGUOUS' : dispatched ? 'PASSED' : 'NOT_DISPATCHED');
      expect(result.controlsUnchanged).toBe(fault !== 'admission' && fault !== 'control');
      expect(result.releaseEligible).toBe(false); expect(result.completeCorpusProof).toBe(false);
      expect(readFileSync(output, 'utf8')).not.toContain('never-record-this-secret');
      expect(() => verifyFreshCorpusReceipt(result, { role: 'preview', ...identity })).toThrow('fresh complete proof required');
    } finally { vi.useRealTimers(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('refuses credential-free CLI execution before file or cloud access', () => {
    const env = { ...process.env }; delete env.APPLICATION_FTS_DIAGNOSTIC_APPROVAL_JSON; delete env.CLOUDFLARE_API_TOKEN;
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/preview-fts-diagnostic.ts', '/unused/receipt.json'], { encoding: 'utf8', env, timeout: 10_000 });
    expect(result.status).toBe(1); expect(result.stderr).toContain('FTS-only diagnostic refused');
  });
  it('executes the exact workflow approval generator without credentials', () => {
    const workflow = parse(readFileSync('.github/workflows/pr.yml', 'utf8')) as { jobs: Record<string, { steps: { id?: string; run?: string }[] }> };
    const command = workflow.jobs['preview-fts-diagnostic']!.steps.find(s => s.id === 'diagnostic')!.run!;
    const generator = command.match(/<<'JS_APPROVAL'\n([\s\S]*?)\nJS_APPROVAL/)![1]!;
    const env: NodeJS.ProcessEnv = { ...process.env, EXPECTED_SOURCE: identity.sourceCommit, EXPECTED_TREE: identity.sourceTree, GITHUB_RUN_ID: identity.runId, FTS_SOURCE_RUN_ID: identity.sourceRunId };
    delete env.CLOUDFLARE_API_TOKEN;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-'], { input: generator, encoding: 'utf8', env, timeout: 10_000 });
    expect(result.status, result.stderr).toBe(0);
    expect(() => requireFtsDiagnosticApproval(JSON.parse(result.stdout), identity)).not.toThrow();
  });
});

describe('diagnostic exact-source normal CI admission', () => {
  const verify = createRequire(import.meta.url)('../../../.github/scripts/verify-fts-diagnostic-source.cjs') as (input: Record<string, unknown>) => Promise<void>;
  function setup() {
    const pr = { state: 'open', draft: false, base: { ref: 'main', sha: 'c'.repeat(40) }, head: { sha: identity.sourceCommit, ref: 'candidate', repo: { full_name: 'TJ-Frederick/TheologAI' } }, labels: [{ name: 'deploy-preview' }] };
    const run = { head_sha: identity.sourceCommit, path: '.github/workflows/pr.yml', event: 'pull_request', run_attempt: 1, pull_requests: [{ number: 167, head: { sha: identity.sourceCommit }, base: { sha: 'c'.repeat(40) } }] };
    const jobs = ['Select Validation', 'Test & Build', 'Fresh Checkout & Data', 'Node HTTP E2E', 'Worker Runtime & D1', 'Applicable MCP Conformance', 'Validation Complete', 'Build preview Worker artifact (no cloud credentials)'].map(name => ({ name, status: 'completed', conclusion: 'success' }));
    const artifacts = ['corpus', 'worker'].map(kind => ({ name: `${kind}-preview-122-attempt-1`, expired: false, expires_at: new Date(Date.now() + 3600_000).toISOString(), workflow_run: { head_sha: identity.sourceCommit, id: 122 }, digest: 'sha256:' + 'd'.repeat(64) }));
    const outputs: Record<string, string> = {};
    const priorArtifacts: { id: number }[] = [];
    const input = { context: { repo: { owner: 'TJ-Frederick', repo: 'TheologAI' }, sha: identity.sourceCommit }, environment: { GITHUB_RUN_ATTEMPT: '1', FTS_SOURCE_RUN_ID: '122', GITHUB_REF: 'refs/heads/candidate' }, core: { setOutput: (key: string, value: string) => { outputs[key] = value; } }, github: { rest: { pulls: { get: async () => ({ data: pr }) }, actions: { listArtifactsForRepo: async () => ({ data: { artifacts: priorArtifacts } }), getWorkflowRun: async () => ({ data: run }), listJobsForWorkflowRun: async () => ({ data: { jobs } }), listWorkflowRunArtifacts: async () => ({ data: { artifacts } }) }, git: { getCommit: async () => ({ data: { tree: { sha: identity.sourceTree } } }) } } } };
    return { pr, run, jobs, artifacts, outputs, input, priorArtifacts };
  }
  it('accepts all normal CI and current source-bound artifacts for the exact live PR', async () => {
    const f = setup(); await verify(f.input); expect(f.outputs).toEqual({ source: identity.sourceCommit, tree: identity.sourceTree, base: 'c'.repeat(40) });
  });
  for (const fault of ['head', 'fork', 'closed', 'draft', 'base', 'label', 'ref', 'rerun', 'failed-CI', 'skipped-CI', 'duplicate-CI', 'expired-artifact', 'wrong-artifact-source', 'wrong-workflow', 'wrong-event', 'stale-base-CI', 'wrong-artifact-run', 'source-rerun', 'replay']) it('rejects ' + fault, async () => {
    const f = setup();
    if (fault === 'head') f.pr.head.sha = 'f'.repeat(40);
    if (fault === 'fork') f.pr.head.repo.full_name = 'other/repo';
    if (fault === 'closed') f.pr.state = 'closed';
    if (fault === 'draft') f.pr.draft = true;
    if (fault === 'base') f.pr.base.ref = 'other';
    if (fault === 'label') f.pr.labels = [];
    if (fault === 'ref') f.input.environment.GITHUB_REF = 'refs/heads/main';
    if (fault === 'rerun') f.input.environment.GITHUB_RUN_ATTEMPT = '2';
    if (fault === 'failed-CI') f.jobs[0]!.conclusion = 'failure';
    if (fault === 'skipped-CI') f.jobs[0]!.conclusion = 'skipped';
    if (fault === 'duplicate-CI') f.jobs.push(f.jobs[0]!);
    if (fault === 'expired-artifact') f.artifacts[0]!.expired = true;
    if (fault === 'wrong-artifact-source') f.artifacts[0]!.workflow_run.head_sha = 'f'.repeat(40);
    if (fault === 'wrong-workflow') f.run.path = '.github/workflows/other.yml';
    if (fault === 'wrong-event') f.run.event = 'workflow_dispatch';
    if (fault === 'stale-base-CI') f.run.pull_requests[0]!.base.sha = 'f'.repeat(40);
    if (fault === 'wrong-artifact-run') f.artifacts[0]!.workflow_run.id = 121;
    if (fault === 'source-rerun') f.run.run_attempt = 2;
    if (fault === 'replay') f.priorArtifacts.push({ id: 1 });
    await expect(verify(f.input)).rejects.toThrow('FTS diagnostic source refused');
  });
});
