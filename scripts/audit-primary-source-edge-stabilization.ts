/**
 * Fixed-endpoint, bounded pre-audit edge-stabilization gate.
 *
 * A Workers deployment can be authoritative in the control plane a few
 * seconds before every edge observes the new tool and resource registrations.
 * This gate is intentionally separate from either protected audit: it makes
 * its limited attempts explicit, records only schema/identity hashes, and
 * never retries an audit.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  PREVIEW_PROFILE,
  PRODUCTION_PROFILE,
  HISTORICAL_CORE_EXPECTED_RESOURCE_URIS,
  type HistoricalCoreAuditProfile,
} from './audit-historical-core-preview.js';

const PROTOCOL_VERSION = '2025-11-25';
/** Six probes over at most fifty-five seconds covers normal edge convergence without becoming an audit retry loop. */
export const MAX_ATTEMPTS = 6;
export const MAX_DURATION_MS = 55_000;
export const RETRY_DELAY_MS = 4_000;
export const MAX_REQUEST_DURATION_MS = 10_000;
/** tools/list is the largest stabilization response; retain the same strict per-response ceiling as the protected audit. */
export const MAX_RESPONSE_BYTES = 256 * 1024;
export const MAX_AGGREGATE_RESPONSE_BYTES = 1024 * 1024;
export const MAX_EVIDENCE_BYTES = 32 * 1024;

type ObjectRecord = Record<string, unknown>;
type FetchLike = typeof fetch;
type Now = () => number;
type Sleep = (milliseconds: number) => Promise<void>;

export type StabilizationProfile = HistoricalCoreAuditProfile;
export type StabilizationAttempt = Readonly<{
  attempt: number;
  elapsedMs: number;
  outcome: 'matched' | 'contract_mismatch' | 'transport_failure';
  requestCount: number;
  responseBytes: number;
  observed?: Readonly<{
    inputSchemaSha256?: string;
    outputSchemaSha256?: string;
    annotationsMatch?: boolean;
    initializeIdentityMatch?: boolean;
    resourceUrisSha256?: string;
    resourcesMatch?: boolean;
  }>;
}>;
export type StabilizationEvidence = Readonly<{
  schemaVersion: 1;
  audit: 'primary-source-edge-stabilization-preview' | 'primary-source-edge-stabilization-production';
  endpointClass: 'preview-custom' | 'production-custom';
  contract: Readonly<{
    version: '6' | '7';
    inputSchemaSha256: string;
    outputSchemaSha256: string;
    openWorldHint: boolean;
    resourceUrisSha256: string;
  }>;
  bounds: Readonly<{
    maximumAttempts: number;
    maximumDurationMs: number;
    retryDelayMs: number;
    maximumRequestDurationMs: number;
    maximumResponseBytes: number;
    maximumAggregateResponseBytes: number;
    auditRetries: 0;
  }>;
  durationMs: number;
  aggregateResponseBytes: number;
  attempts: readonly StabilizationAttempt[];
  passed: boolean;
  matchedAttempt: number | null;
}>;

export type StabilizationDependencies = Readonly<{
  fetchImpl?: FetchLike;
  now?: Now;
  sleep?: Sleep;
}>;

function fail(message: string): never { throw new Error(message); }
function assert(value: unknown, message: string): asserts value { if (!value) fail(message); }
function object(value: unknown): ObjectRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectRecord : undefined;
}
function array(value: unknown, label: string): unknown[] { assert(Array.isArray(value), `${label} must be an array`); return value; }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
function delay(milliseconds: number): Promise<void> { return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds)); }

function endpoint(profile: StabilizationProfile): URL {
  const target = new URL(profile.endpoint);
  assert(target.toString() === profile.endpoint && target.protocol === 'https:' && target.hostname === profile.hostname
    && target.pathname === '/mcp' && !target.search && !target.hash, `${profile.label} edge-stabilization endpoint allowlist drifted`);
  return target;
}

async function abortAndCancel(response: Response, controller: AbortController): Promise<void> {
  controller.abort();
  await response.body?.cancel().catch(() => undefined);
}

/** Consume bounded UTF-8 JSON/SSE input without retaining any remote body in evidence. */
async function readBoundedBody(
  response: Response,
  controller: AbortController,
  label: string,
  maximumBytes: number,
): Promise<string> {
  assert(Number.isSafeInteger(maximumBytes) && maximumBytes >= 0 && maximumBytes <= MAX_RESPONSE_BYTES,
    'edge-stabilization response ceiling configuration drifted');
  const advertisedLength = response.headers.get('content-length');
  if (advertisedLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(advertisedLength) || Number(advertisedLength) > maximumBytes) {
      await abortAndCancel(response, controller);
      fail(`${label} response body exceeds its fixed remaining ceiling`);
    }
  }
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let exceeded = false;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        exceeded = true;
        await reader.cancel().catch(() => undefined);
        controller.abort();
        break;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  assert(!exceeded, `${label} response body exceeds its fixed remaining ceiling`);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return fail(`${label} response body is not valid UTF-8`); }
}

function decodeMessage(body: string, expectedId: number, label: string): ObjectRecord {
  const trimmed = body.trim();
  assert(trimmed.length > 0, `${label} response body was empty`);
  const values: unknown[] = [];
  if (/^(?:event:|data:|:)/m.test(trimmed)) {
    for (const event of trimmed.split(/\r?\n\r?\n/)) {
      const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
      if (data) values.push(JSON.parse(data));
    }
  } else values.push(JSON.parse(trimmed));
  const message = values.map(object).find(value => value?.id === expectedId);
  assert(message?.jsonrpc === '2.0', `${label} JSON-RPC response drifted`);
  return message;
}

function result(message: ObjectRecord, label: string): ObjectRecord {
  assert(message.error === undefined, `${label} returned a JSON-RPC error`);
  const output = object(message.result);
  assert(output !== undefined, `${label} result missing`);
  return output;
}

type ProbeResult = Readonly<{
  requestCount: number;
  responseBytes: number;
  initializeIdentityMatch: boolean;
  inputSchemaSha256: string;
  outputSchemaSha256: string;
  annotationsMatch: boolean;
  resourceUrisSha256: string;
  resourcesMatch: boolean;
  matched: boolean;
}> | Readonly<{
  terminalFailure: true;
  requestCount: number;
  responseBytes: number;
}>;

type ResponseBudget = { aggregateResponseBytes: number };

async function probeContract(
  profile: StabilizationProfile,
  fetchImpl: FetchLike,
  now: Now,
  startedAt: number,
  responseBudget: ResponseBudget,
): Promise<ProbeResult> {
  let id = 1;
  let sessionId: string | undefined;
  let responseBytes = 0;
  let requestCount = 0;
  const post = async (payload: ObjectRecord, label: string, notification = false): Promise<ObjectRecord | undefined> => {
    requestCount += 1;
    assert(requestCount <= 4, 'edge-stabilization request inventory drifted');
    const remaining = MAX_DURATION_MS - (now() - startedAt);
    assert(remaining > 0, `edge-stabilization exceeded its ${MAX_DURATION_MS}-ms total deadline during ${label}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(MAX_REQUEST_DURATION_MS, remaining));
    try {
      const response = await fetchImpl(endpoint(profile), {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: {
          Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
          'Mcp-Protocol-Version': PROTOCOL_VERSION,
          'User-Agent': `TheologAI-PrimarySourceEdgeStabilization-${profile.label}/1.0`,
          ...(sessionId === undefined ? {} : { 'Mcp-Session-Id': sessionId }),
        },
        body: JSON.stringify(payload),
      });
      if (response.status === 429) {
        await abortAndCancel(response, controller);
        fail(`edge-stabilization stopped at HTTP 429 during ${label}`);
      }
      if (response.status < 200 || response.status >= 300) {
        await abortAndCancel(response, controller);
        fail(`edge-stabilization received non-success HTTP status during ${label}`);
      }
      const globalRemainingBytes = MAX_AGGREGATE_RESPONSE_BYTES - responseBudget.aggregateResponseBytes;
      assert(globalRemainingBytes >= 0, 'edge-stabilization aggregate response accounting drifted');
      // A dynamic streaming ceiling prevents a terminal probe from consuming
      // past the global budget before evidence is constructed.
      const body = await readBoundedBody(response, controller, label, Math.min(MAX_RESPONSE_BYTES, globalRemainingBytes));
      const bodyBytes = utf8Bytes(body);
      assert(responseBytes + bodyBytes <= MAX_AGGREGATE_RESPONSE_BYTES,
        `edge-stabilization attempt response budget exceeded (${MAX_AGGREGATE_RESPONSE_BYTES} bytes)`);
      // Check before mutation: terminal evidence must never claim an
      // aggregate above its advertised ceiling, including on a failed probe.
      assert(responseBudget.aggregateResponseBytes + bodyBytes <= MAX_AGGREGATE_RESPONSE_BYTES,
        `edge-stabilization aggregate response budget exceeded (${MAX_AGGREGATE_RESPONSE_BYTES} bytes)`);
      responseBytes += bodyBytes;
      responseBudget.aggregateResponseBytes += bodyBytes;
      const session = response.headers.get('Mcp-Session-Id');
      if (session) sessionId = session;
      if (notification) {
        assert(response.status === 202 && body === '', `${label} notification contract drifted`);
        return undefined;
      }
      const contentType = response.headers.get('content-type') ?? '';
      assert(/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType) || /^text\/event-stream(?:;\s*charset=utf-8)?$/i.test(contentType), `${label} content type drifted`);
      return decodeMessage(body, payload.id as number, label);
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    const initialized = await post({ jsonrpc: '2.0', id: id++, method: 'initialize', params: {
      protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: `theologai-primary-source-edge-stabilization-${profile.label}`, version: '1.0.0' },
    } }, 'initialize');
    assert(initialized !== undefined, 'initialize must return a response');
    const initializeResult = result(initialized, 'initialize');
    const server = object(initializeResult.serverInfo);
    const capabilities = object(initializeResult.capabilities);
    const initializeIdentityMatch = initializeResult.protocolVersion === PROTOCOL_VERSION
      && server?.name === 'theologai-bible-server' && server.version === profile.serverVersion
      && JSON.stringify(Object.keys(capabilities ?? {}).sort()) === JSON.stringify(['prompts', 'resources', 'tools']);

    await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, 'initialized notification', true);
    const toolsResponse = await post({ jsonrpc: '2.0', id: id++, method: 'tools/list' }, 'tools/list');
    assert(toolsResponse !== undefined, 'tools/list must return a response');
    const tools = array(result(toolsResponse, 'tools/list').tools, 'tools/list.tools').map(object);
    const primary = tools.filter(tool => tool?.name === 'primary_source_search');
    assert(primary.length === 1 && primary[0] !== undefined, 'primary-source tool registration drifted');
    const inputSchema = object(primary[0].inputSchema);
    const outputSchema = object(primary[0].outputSchema);
    assert(inputSchema !== undefined && outputSchema !== undefined, 'primary-source tool schemas missing');
    const annotations = object(primary[0].annotations);
    const inputSchemaSha256 = sha256(canonicalJson(inputSchema));
    const outputSchemaSha256 = sha256(canonicalJson(outputSchema));
    const annotationsMatch = annotations?.readOnlyHint === true && annotations.destructiveHint === false && annotations.idempotentHint === true
      && annotations.openWorldHint === profile.primarySource.openWorldHint
      && JSON.stringify(Object.keys(annotations).sort()) === JSON.stringify(['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'].sort());
    const resourcesResponse = await post({ jsonrpc: '2.0', id: id++, method: 'resources/list' }, 'resources/list');
    assert(resourcesResponse !== undefined, 'resources/list must return a response');
    const resources = array(result(resourcesResponse, 'resources/list').resources, 'resources/list.resources').map(object);
    const resourceUris = resources.map(resource => {
      assert(typeof resource?.uri === 'string', 'resource URI missing');
      return resource.uri;
    }).sort();
    const resourceUrisSha256 = sha256(canonicalJson(resourceUris));
    const expectedResourceUrisSha256 = sha256(canonicalJson(HISTORICAL_CORE_EXPECTED_RESOURCE_URIS));
    const resourcesMatch = resourceUris.length === HISTORICAL_CORE_EXPECTED_RESOURCE_URIS.length
      && new Set(resourceUris).size === resourceUris.length
      && canonicalJson(resourceUris) === canonicalJson(HISTORICAL_CORE_EXPECTED_RESOURCE_URIS)
      && resourceUrisSha256 === expectedResourceUrisSha256;
    const matched = initializeIdentityMatch
      && canonicalJson(inputSchema) === canonicalJson(profile.primarySource.inputSchema)
      && canonicalJson(outputSchema) === canonicalJson(profile.primarySource.outputSchema)
      && inputSchemaSha256 === profile.primarySource.inputSchemaSha256
      && outputSchemaSha256 === profile.primarySource.outputSchemaSha256
      && annotationsMatch
      && resourcesMatch;
    return {
      requestCount, responseBytes, initializeIdentityMatch, inputSchemaSha256, outputSchemaSha256,
      annotationsMatch, resourceUrisSha256, resourcesMatch, matched,
    };
  } catch {
    return { terminalFailure: true, requestCount, responseBytes };
  }
}

/**
 * Probe only the tool/resource edge convergence boundary. Its attempts are intentionally
 * recorded and bounded; successful protected audits still have zero retries.
 */
export async function runPrimarySourceEdgeStabilization(
  profile: StabilizationProfile,
  dependencies: StabilizationDependencies = {},
): Promise<StabilizationEvidence> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? delay;
  const startedAt = now();
  const attempts: StabilizationAttempt[] = [];
  const responseBudget: ResponseBudget = { aggregateResponseBytes: 0 };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const elapsedMs = now() - startedAt;
    if (elapsedMs >= MAX_DURATION_MS) break;
    const probe = await probeContract(profile, fetchImpl, now, startedAt, responseBudget);
    if ('terminalFailure' in probe) {
      const record: StabilizationAttempt = {
        attempt, elapsedMs: now() - startedAt, outcome: 'transport_failure',
        requestCount: probe.requestCount, responseBytes: probe.responseBytes,
      };
      attempts.push(record);
      console.log(`edge-stabilization ${profile.label} attempt ${attempt}/${MAX_ATTEMPTS}: transport_failure`);
      return evidence(profile, startedAt, now, responseBudget.aggregateResponseBytes, attempts, null);
    }
    {
      const record: StabilizationAttempt = {
        attempt, elapsedMs: now() - startedAt, outcome: probe.matched ? 'matched' : 'contract_mismatch',
        requestCount: probe.requestCount, responseBytes: probe.responseBytes,
        observed: {
          inputSchemaSha256: probe.inputSchemaSha256, outputSchemaSha256: probe.outputSchemaSha256,
          annotationsMatch: probe.annotationsMatch, initializeIdentityMatch: probe.initializeIdentityMatch,
          resourceUrisSha256: probe.resourceUrisSha256, resourcesMatch: probe.resourcesMatch,
        },
      };
      attempts.push(record);
      console.log(`edge-stabilization ${profile.label} attempt ${attempt}/${MAX_ATTEMPTS}: ${record.outcome}`);
      if (probe.matched) return evidence(profile, startedAt, now, responseBudget.aggregateResponseBytes, attempts, attempt);
    }
    if (attempt < MAX_ATTEMPTS && now() - startedAt + RETRY_DELAY_MS < MAX_DURATION_MS) await sleep(RETRY_DELAY_MS);
  }
  return evidence(profile, startedAt, now, responseBudget.aggregateResponseBytes, attempts, null);
}

function evidence(
  profile: StabilizationProfile,
  startedAt: number,
  now: Now,
  aggregateResponseBytes: number,
  attempts: readonly StabilizationAttempt[],
  matchedAttempt: number | null,
): StabilizationEvidence {
  const output: StabilizationEvidence = {
    schemaVersion: 1,
    audit: profile.label === 'preview' ? 'primary-source-edge-stabilization-preview' : 'primary-source-edge-stabilization-production',
    endpointClass: profile.endpointClass,
    contract: {
      version: profile.primarySource.contractVersion, inputSchemaSha256: profile.primarySource.inputSchemaSha256,
      outputSchemaSha256: profile.primarySource.outputSchemaSha256, openWorldHint: profile.primarySource.openWorldHint,
      resourceUrisSha256: sha256(canonicalJson(HISTORICAL_CORE_EXPECTED_RESOURCE_URIS)),
    },
    bounds: {
      maximumAttempts: MAX_ATTEMPTS, maximumDurationMs: MAX_DURATION_MS, retryDelayMs: RETRY_DELAY_MS,
      maximumRequestDurationMs: MAX_REQUEST_DURATION_MS, maximumResponseBytes: MAX_RESPONSE_BYTES,
      maximumAggregateResponseBytes: MAX_AGGREGATE_RESPONSE_BYTES, auditRetries: 0,
    },
    durationMs: now() - startedAt, aggregateResponseBytes, attempts, passed: matchedAttempt !== null, matchedAttempt,
  };
  assert(utf8Bytes(JSON.stringify(output)) <= MAX_EVIDENCE_BYTES, 'edge-stabilization evidence exceeds 32 KiB ceiling');
  return output;
}

async function assertOutputAbsent(output: string): Promise<void> {
  try { await readFile(output); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  fail('edge-stabilization output violates no-clobber policy: destination already exists');
}

export async function runPrimarySourceEdgeStabilizationCli(
  args: string[],
  profile: StabilizationProfile,
  dependencies: StabilizationDependencies = {},
): Promise<{ output: string; evidence: StabilizationEvidence }> {
  assert(args.length === 2 && args[0] === '--output' && typeof args[1] === 'string' && args[1].length > 0,
    `usage: audit:primary-source-edge-stabilization-${profile.label} --output path`);
  const output = resolve(args[1]!);
  await assertOutputAbsent(output);
  const evidence = await runPrimarySourceEdgeStabilization(profile, dependencies);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  assert(evidence.passed,
    `edge-stabilization did not observe the checked-out ${profile.label} primary-source/resource contracts within bounded attempts`);
  return { output, evidence };
}

async function main(): Promise<void> {
  const { output, evidence } = await runPrimarySourceEdgeStabilizationCli(process.argv.slice(2), PREVIEW_PROFILE);
  console.log(`PASS: preview primary-source/resource contracts stabilized on attempt ${evidence.matchedAttempt}; evidence: ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
