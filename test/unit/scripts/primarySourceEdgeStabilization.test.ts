import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_ATTEMPTS,
  MAX_DURATION_MS,
  MAX_RESPONSE_BYTES,
  MAX_AGGREGATE_RESPONSE_BYTES,
  REQUIRED_CONSECUTIVE_MATCHES,
  RETRY_DELAY_MS,
  runPrimarySourceEdgeStabilization,
  runPrimarySourceEdgeStabilizationCli,
} from '../../../scripts/audit-primary-source-edge-stabilization.js';
import {
  HISTORICAL_CORE_EXPECTED_RESOURCE_URIS,
  PREVIEW_PROFILE,
  PRODUCTION_PROFILE,
  type HistoricalCoreAuditProfile,
} from '../../../scripts/audit-historical-core-preview.js';

const root = new URL('../../../', import.meta.url);

type RecordValue = Record<string, unknown>;

function json(body: RecordValue, status = 200, paddingBytes = 0): Response {
  return new Response(JSON.stringify({ ...body, ...(paddingBytes === 0 ? {} : { _edgePadding: 'x'.repeat(paddingBytes) }) }), {
    status, headers: { 'content-type': 'application/json' },
  });
}

function fetchFor(
  profile: HistoricalCoreAuditProfile,
  staleAttempts: number | readonly number[] = 0,
  paddingBytes = 0,
): typeof fetch {
  let toolsLists = 0;
  const staleAttemptLimit = typeof staleAttempts === 'number' ? staleAttempts : undefined;
  const staleToolLists = typeof staleAttempts === 'number' ? undefined : new Set(staleAttempts);
  const stale = () => staleToolLists?.has(toolsLists) ?? toolsLists <= (staleAttemptLimit ?? 0);
  return (async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as RecordValue;
    if (request.method === 'notifications/initialized') return new Response('', { status: 202 });
    if (request.method === 'initialize') {
      return json({ jsonrpc: '2.0', id: request.id, result: {
        protocolVersion: '2025-11-25', serverInfo: { name: 'theologai-bible-server', version: profile.serverVersion },
        capabilities: { tools: {}, resources: {}, prompts: {} },
      } }, 200, paddingBytes);
    }
    if (request.method === 'tools/list') {
      toolsLists += 1;
      const source = stale() ? PRODUCTION_PROFILE.primarySource : profile.primarySource;
      return json({ jsonrpc: '2.0', id: request.id, result: { tools: [{
        name: 'primary_source_search', inputSchema: source.inputSchema, outputSchema: source.outputSchema,
        annotations: {
          readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: source.openWorldHint,
        },
      }] } }, 200, paddingBytes);
    }
    if (request.method === 'resources/list') {
      const uris = stale()
        ? HISTORICAL_CORE_EXPECTED_RESOURCE_URIS.slice(0, -1)
        : HISTORICAL_CORE_EXPECTED_RESOURCE_URIS;
      return json({ jsonrpc: '2.0', id: request.id, result: {
        resources: uris.map(uri => ({ uri })),
      } }, 200, paddingBytes);
    }
    throw new Error('unexpected fixed edge-stabilization request');
  }) as typeof fetch;
}

describe('primary-source edge-stabilization gate', () => {
  it('uses fixed preview-v7 and production-v6 profiles with a bounded explicit convergence window', () => {
    expect(PREVIEW_PROFILE.primarySource.contractVersion).toBe('7');
    expect(PRODUCTION_PROFILE.primarySource.contractVersion).toBe('6');
    expect(MAX_ATTEMPTS).toBe(6);
    expect(MAX_DURATION_MS).toBe(55_000);
    expect(RETRY_DELAY_MS).toBe(4_000);
    expect(REQUIRED_CONSECUTIVE_MATCHES).toBe(2);
  });

  it('records a stale predecessor contract before two delayed matches of the checked-out preview v7 contract', async () => {
    let clock = 0;
    const delays: number[] = [];
    const evidence = await runPrimarySourceEdgeStabilization(PREVIEW_PROFILE, {
      fetchImpl: fetchFor(PREVIEW_PROFILE, 1), now: () => clock,
      sleep: async milliseconds => { delays.push(milliseconds); clock += milliseconds; },
    });
    expect(evidence).toMatchObject({
      audit: 'primary-source-edge-stabilization-preview', passed: true, matchedAttempt: 3,
      contract: {
        version: '7', inputSchemaSha256: PREVIEW_PROFILE.primarySource.inputSchemaSha256,
        resourceUrisSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      bounds: { auditRetries: 0, maximumAttempts: 6, requiredConsecutiveMatchingProbes: 2 },
    });
    expect(evidence.attempts).toHaveLength(3);
    expect(evidence.attempts[0]).toMatchObject({
      outcome: 'contract_mismatch', requestCount: 4, observed: { resourcesMatch: false },
    });
    expect(evidence.attempts[1]).toMatchObject({
      outcome: 'matched', requestCount: 4, observed: { resourcesMatch: true },
    });
    expect(evidence.attempts[2]).toMatchObject({
      outcome: 'matched', requestCount: 4, observed: { resourcesMatch: true },
    });
    expect(evidence.attempts.map(attempt => attempt.elapsedMs)).toEqual([0, RETRY_DELAY_MS, RETRY_DELAY_MS * 2]);
    expect(delays).toEqual([RETRY_DELAY_MS, RETRY_DELAY_MS]);
    expect(JSON.stringify(evidence)).not.toContain('providers');
  });

  it('proves the actual fixed production v6 contract without projecting preview v7 onto it', async () => {
    let clock = 0;
    const delays: number[] = [];
    const evidence = await runPrimarySourceEdgeStabilization(PRODUCTION_PROFILE, {
      fetchImpl: fetchFor(PRODUCTION_PROFILE), now: () => clock,
      sleep: async milliseconds => { delays.push(milliseconds); clock += milliseconds; },
    });
    expect(evidence).toMatchObject({
      audit: 'primary-source-edge-stabilization-production', endpointClass: 'production-custom',
      passed: true, matchedAttempt: 2,
      contract: { version: '6', inputSchemaSha256: PRODUCTION_PROFILE.primarySource.inputSchemaSha256, openWorldHint: false },
    });
    expect(evidence.attempts.map(attempt => attempt.elapsedMs)).toEqual([0, RETRY_DELAY_MS]);
    expect(delays).toEqual([RETRY_DELAY_MS]);
  });

  it('resets the matching streak after an intervening registration mismatch', async () => {
    let clock = 0;
    const delays: number[] = [];
    const evidence = await runPrimarySourceEdgeStabilization(PREVIEW_PROFILE, {
      fetchImpl: fetchFor(PREVIEW_PROFILE, [2]), now: () => clock,
      sleep: async milliseconds => { delays.push(milliseconds); clock += milliseconds; },
    });
    expect(evidence).toMatchObject({ passed: true, matchedAttempt: 4 });
    expect(evidence.attempts.map(attempt => attempt.outcome)).toEqual([
      'matched', 'contract_mismatch', 'matched', 'matched',
    ]);
    expect(delays).toEqual([RETRY_DELAY_MS, RETRY_DELAY_MS, RETRY_DELAY_MS]);
    expect(evidence.attempts.map(attempt => attempt.elapsedMs)).toEqual([
      0, RETRY_DELAY_MS, RETRY_DELAY_MS * 2, RETRY_DELAY_MS * 3,
    ]);
  });

  it('fails closed when a first late match cannot be followed by the required full delay', async () => {
    let clock = 0;
    let resourcesLists = 0;
    const fixedFetch = fetchFor(PREVIEW_PROFILE);
    const evidence = await runPrimarySourceEdgeStabilization(PREVIEW_PROFILE, {
      now: () => clock,
      sleep: async milliseconds => { clock += milliseconds; },
      fetchImpl: async (input, init) => {
        const request = JSON.parse(String(init?.body)) as RecordValue;
        const response = await fixedFetch(input, init);
        if (request.method === 'resources/list' && ++resourcesLists === 1) {
          clock = MAX_DURATION_MS - RETRY_DELAY_MS;
        }
        return response;
      },
    });
    expect(evidence).toMatchObject({ passed: false, matchedAttempt: null });
    expect(evidence.attempts).toEqual([
      expect.objectContaining({ outcome: 'matched', elapsedMs: MAX_DURATION_MS - RETRY_DELAY_MS }),
    ]);
  });

  it('fails closed only after publishing bounded sanitized evidence when no edge ever matches', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'theologai-edge-stabilization-'));
    const output = join(temporary, 'evidence.json');
    try {
      await expect(runPrimarySourceEdgeStabilizationCli(['--output', output], PREVIEW_PROFILE, {
        fetchImpl: fetchFor(PREVIEW_PROFILE, MAX_ATTEMPTS), sleep: async () => undefined,
      })).rejects.toThrow('did not observe the checked-out preview primary-source/resource contracts');
      const evidence = JSON.parse(await readFile(output, 'utf8')) as RecordValue;
      expect(evidence).toMatchObject({ passed: false, matchedAttempt: null });
      expect(evidence.attempts).toHaveLength(MAX_ATTEMPTS);
      expect(JSON.stringify(evidence)).not.toContain('providers');
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('does not retry rate limits, malformed responses, or other transport failures', async () => {
    const evidence = await runPrimarySourceEdgeStabilization(PREVIEW_PROFILE, {
      fetchImpl: async () => new Response('', { status: 429 }), sleep: async () => undefined,
    });
    expect(evidence).toMatchObject({ passed: false, matchedAttempt: null });
    expect(evidence.attempts).toEqual([expect.objectContaining({ attempt: 1, outcome: 'transport_failure', requestCount: 1, responseBytes: 0 })]);
  });

  it('fails terminally on an oversized response without claiming received bytes', async () => {
    const evidence = await runPrimarySourceEdgeStabilization(PREVIEW_PROFILE, {
      fetchImpl: async () => new Response(null, { status: 200, headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) } }),
      sleep: async () => undefined,
    });
    expect(evidence).toMatchObject({ aggregateResponseBytes: 0, passed: false });
    expect(evidence.attempts).toEqual([expect.objectContaining({ outcome: 'transport_failure', requestCount: 1, responseBytes: 0 })]);
  });

  it('enforces one truthful global aggregate ceiling across predecessor-contract probes', async () => {
    const evidence = await runPrimarySourceEdgeStabilization(PREVIEW_PROFILE, {
      fetchImpl: fetchFor(PREVIEW_PROFILE, MAX_ATTEMPTS, 210_000), sleep: async () => undefined,
    });
    const attemptBytes = evidence.attempts.reduce((sum, attempt) => sum + attempt.responseBytes, 0);
    expect(evidence).toMatchObject({ passed: false, matchedAttempt: null });
    expect(evidence.aggregateResponseBytes).toBeLessThanOrEqual(MAX_AGGREGATE_RESPONSE_BYTES);
    expect(evidence.aggregateResponseBytes).toBe(attemptBytes);
    expect(evidence.attempts.at(-1)).toMatchObject({ outcome: 'transport_failure' });
  });

  it('treats an aborted request deadline as one terminal attempt', async () => {
    let nowCalls = 0;
    const now = () => (nowCalls++ === 0 ? 0 : MAX_DURATION_MS - 1);
    const evidence = await runPrimarySourceEdgeStabilization(PREVIEW_PROFILE, {
      now,
      fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        (init?.signal as AbortSignal).addEventListener('abort', () => reject(new Error('aborted')));
      }),
      sleep: async () => undefined,
    });
    expect(evidence).toMatchObject({ passed: false, durationMs: MAX_DURATION_MS - 1, aggregateResponseBytes: 0 });
    expect(evidence.attempts).toEqual([expect.objectContaining({ outcome: 'transport_failure', requestCount: 1, responseBytes: 0 })]);
  });

  it('wires explicit preview evidence and a strict gate before either protected preview audit', async () => {
    const workflow = await readFile(new URL('.github/workflows/pr.yml', root), 'utf8');
    const stabilize = workflow.indexOf('Stabilize preview release registrations at edge (read-only)');
    const upload = workflow.indexOf('Upload preview edge-stabilization evidence');
    const gate = workflow.indexOf('Require stable preview release registrations before audits');
    const language = workflow.indexOf('Audit original-language v2 contract on preview');
    const historical = workflow.indexOf('Audit Transform-9 historical core contract on preview');
    expect(stabilize).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(stabilize);
    expect(gate).toBeGreaterThan(upload);
    expect(language).toBeGreaterThan(gate);
    expect(historical).toBeGreaterThan(language);
    expect(workflow).toContain('continue-on-error: true');
    expect(workflow).toContain("if: ${{ steps.preview-worker-candidate-cutover.outcome == 'success' }}");
    expect(workflow).toContain('edge_stabilization_sha256');
    expect(workflow).toContain('preview-primary-source-edge-stabilization.json');
  });
});
