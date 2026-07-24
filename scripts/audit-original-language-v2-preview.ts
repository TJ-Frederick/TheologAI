/**
 * Fixed-endpoint, bounded preview audit for the active original_language_study
 * v2 contract. This runner is intentionally not a general MCP client: it
 * cannot accept a URL override, has no retry loop, and only emits sanitized
 * local evidence after all assertions pass.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  originalLanguageStudyV2InputSchema,
  originalLanguageStudyV2OutputSchema,
} from '../src/mcp/schemas/originalLanguageStudyV2.js';
import { serializeValidatedOriginalLanguageStudyV2Output } from '../src/presenters/originalLanguageStudyV2Structured.js';

const PREVIEW_ENDPOINT = 'https://preview-mcp.theologai.xyz/mcp';
const PROTOCOL_VERSION = '2025-11-25';
const MAX_LOGICAL_OPERATIONS = 13;
/** initialize + initialized notification + tools/list + eleven tool calls. */
const MAX_HTTP_EXCHANGES = 14;
const MAX_DURATION_MS = 180_000;
const MAX_REQUEST_DURATION_MS = 30_000;
const MAX_EVIDENCE_BYTES = 256 * 1024;
/** Tools/list is ~198 KiB today; this covers it and a 32 KiB v2 result with Markdown. */
export const MAX_MCP_RESPONSE_BYTES = 256 * 1024;
const RESPONSE_MAXIMUM = 32 * 1024;
const CURSOR_MAXIMUM = 12 * 1024;
const FIXTURE_PATH = new URL('../test/fixtures/original-language-v2-preview-audit.json', import.meta.url);
const TOOL_NAMES = [
  'bible_lookup', 'bible_cross_references', 'parallel_passages', 'commentary_lookup',
  'classic_text_lookup', 'primary_source_search', 'original_language_lookup',
  'bible_verse_morphology', 'original_language_study', 'donation_config', 'verify_donation',
] as const;
const ARTIFACT_IDENTITY = 'bd19fb99f7bbfd13ad68f2184aaded4a6e5587196ad76b68b0c22bf971fc90f6';
const PINNED_MODIFICATION_NOTE = 'Deterministic migration-free normalization: canonical source IDs, NFC text, safe definitions, retained POS arrays, domain links, and coordinate-only native-to-normalized bridge references.';
export const PINNED_PROVENANCE_SOURCES = [
  {
    sourceId: 'ubs-hebrew-dictionary-en-v0.9.2', sourceRole: 'dictionary',
    artifactName: 'UBSHebrewDic-v0.9.2-en.JSON', artifactVersion: '0.9.2',
    artifactIdentity: ARTIFACT_IDENTITY,
    sourceUrl: 'https://raw.githubusercontent.com/ubsicap/ubs-open-license/3a6edd8212df2e1189037ad39687726990c80d56/dictionaries/hebrew/JSON/UBSHebrewDic-v0.9.2-en.JSON',
    sourceCommit: '3a6edd8212df2e1189037ad39687726990c80d56',
    sourceBlob: '39e218d17f1961495ea7052e342bd9707432cdc0',
    sourceSha256: '1686a25dd31dc9afb7b932927e160070667c73caedad11aa7e4482c21f800e8e',
    publisher: 'United Bible Societies', license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    transformVersion: 7, modified: true, modificationNote: PINNED_MODIFICATION_NOTE,
  },
  {
    sourceId: 'ubs-hebrew-lexical-domains-en-v0.9.2', sourceRole: 'lexical_domains',
    artifactName: 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON', artifactVersion: '0.9.2',
    artifactIdentity: ARTIFACT_IDENTITY,
    sourceUrl: 'https://raw.githubusercontent.com/ubsicap/ubs-open-license/3a6edd8212df2e1189037ad39687726990c80d56/dictionaries/hebrew/JSON/UBSHebrewDicLexicalDomains-v0.9.2-en.JSON',
    sourceCommit: '3a6edd8212df2e1189037ad39687726990c80d56',
    sourceBlob: '88b69b48b00d8306c6d596107b3123de1d41574b',
    sourceSha256: 'fbc862b2c46966cf7f3bf19c2f3e79a7391c34f8c737e1979fa5178ac603d0df',
    publisher: 'United Bible Societies', license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    transformVersion: 7, modified: true, modificationNote: PINNED_MODIFICATION_NOTE,
  },
] as const;
const H3027_FIRST = Array.from({ length: 8 }, (_, index) => `ubs-sense-00279100100${index + 1}000`);
const H3027_SECOND = Array.from({ length: 8 }, (_, index) => `ubs-sense-0027910010${String(index + 9).padStart(2, '0')}000`);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type FetchLike = typeof fetch;

export interface V1Baseline {
  prefixUtf8Bytes: number;
  prefixSha256: string;
  canonicalStudySha256: string;
}

export interface AuditCase {
  id: string;
  arguments: Record<string, unknown>;
  mode: 'success' | 'safe-error' | 'input-error';
  /** Explicit nulls keep all mode/cursor/baseline metadata immutable per case. */
  v1Baseline: string | null;
  cursorFrom: 'h3027-summary' | null;
  cursorMutation: 'flip-final-hex' | null;
}

export interface AuditFixture {
  schemaVersion: 1;
  kind: 'original-language-v2-preview-audit-fixture';
  baseline: {
    cleanMainCommit: '7974b15';
    rebuiltDatabase: 'npm run build:db';
    authorityAnchors: {
      semanticReferenceCoordinates: 250393;
      providerStyleCoordinateKeys: 0;
      h0216: { entries: 1; senses: 1; genesis13Evidence: 2 };
      h3027: { entries: 1; senses: 78; genesis322EvidenceSense: 54 };
      h1961: { entries: 0 };
    };
    v1: Record<string, V1Baseline>;
  };
  cases: AuditCase[];
}

type RawToolResult = {
  isError: boolean;
  structuredContent?: Record<string, unknown>;
  text: string[];
  raw: Record<string, unknown>;
};

type RequestCounters = { logical: number; http: number };
type SanitizedRecord = {
  id: string;
  mode: AuditCase['mode'];
  durationMs: number;
  passed: true;
  request: Record<string, unknown>;
  result: Record<string, unknown>;
};

type SchemaHashes = { inputSchemaSha256: string; outputSchemaSha256: string };

function fail(message: string): never { throw new Error(message); }
function assert(value: unknown, message: string): asserts value { if (!value) fail(message); }
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function array(value: unknown, label: string): unknown[] { assert(Array.isArray(value), `${label} must be an array`); return value; }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
function isSha256(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value); }

function exactKeys(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  const record = object(value);
  assert(record !== undefined, `${label} must be an object`);
  assert(JSON.stringify(Object.keys(record).sort()) === JSON.stringify([...keys].sort()), `${label} keys drifted`);
}

/** Canonical object ordering keeps nested-v1 hashing independent of wire order. */
export function canonicalJson(value: unknown): string {
  const visit = (input: unknown): Json => {
    if (input === null || typeof input === 'boolean' || typeof input === 'number' || typeof input === 'string') return input;
    if (Array.isArray(input)) return input.map(visit);
    const record = object(input);
    assert(record !== undefined, 'canonical JSON received a non-JSON value');
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, visit(record[key])]));
  };
  return JSON.stringify(visit(value));
}

function requireString(value: unknown, label: string): string { assert(typeof value === 'string', `${label} must be a string`); return value; }

const EXPECTED_CASE_IDS = [
  'greek-not-applicable', 'h0216-position-required', 'h0216-summary', 'h3027-summary',
  'h3027-detailed', 'h3027-continuation', 'cursor-wrong-reference', 'cursor-wrong-detail',
  'h1961-unavailable', 'forbidden-artifact-identity', 'cursor-corrupt',
] as const;

const EXPECTED_ARGUMENTS: Record<string, Record<string, unknown>> = {
  'greek-not-applicable': { reference: 'John 1:1', target: 'G3056', position: 5 },
  'h0216-position-required': { reference: 'Genesis 1:3', target: 'H0216' },
  'h0216-summary': { reference: 'Genesis 1:3', target: 'H0216', position: 4 },
  'h3027-summary': { reference: 'Genesis 3:22', target: 'H3027', position: 15 },
  'h3027-detailed': { reference: 'Genesis 3:22', target: 'H3027', position: 15, detail: 'detailed' },
  'h3027-continuation': { reference: 'Genesis 3:22', target: 'H3027', position: 15 },
  'cursor-wrong-reference': { reference: 'Genesis 4:11', target: 'H3027', position: 14 },
  'cursor-wrong-detail': { reference: 'Genesis 3:22', target: 'H3027', position: 15, detail: 'detailed' },
  'h1961-unavailable': { reference: 'Genesis 1:2', target: 'H1961', position: 2 },
  'forbidden-artifact-identity': { reference: 'Genesis 1:3', target: 'H0216', position: 4, artifactIdentity: 'forged' },
  'cursor-corrupt': { reference: 'Genesis 3:22', target: 'H3027', position: 15 },
};

const EXPECTED_CASE_METADATA: Record<string, Pick<AuditCase, 'mode' | 'v1Baseline' | 'cursorFrom' | 'cursorMutation'>> = {
  'greek-not-applicable': { mode: 'success', v1Baseline: 'greek', cursorFrom: null, cursorMutation: null },
  'h0216-position-required': { mode: 'success', v1Baseline: 'h0216-unpositioned', cursorFrom: null, cursorMutation: null },
  'h0216-summary': { mode: 'success', v1Baseline: 'h0216', cursorFrom: null, cursorMutation: null },
  'h3027-summary': { mode: 'success', v1Baseline: 'h3027', cursorFrom: null, cursorMutation: null },
  'h3027-detailed': { mode: 'success', v1Baseline: 'h3027', cursorFrom: null, cursorMutation: null },
  'h3027-continuation': { mode: 'success', v1Baseline: 'h3027', cursorFrom: 'h3027-summary', cursorMutation: null },
  'cursor-wrong-reference': { mode: 'safe-error', v1Baseline: null, cursorFrom: 'h3027-summary', cursorMutation: null },
  'cursor-wrong-detail': { mode: 'safe-error', v1Baseline: null, cursorFrom: 'h3027-summary', cursorMutation: null },
  'h1961-unavailable': { mode: 'success', v1Baseline: 'h1961', cursorFrom: null, cursorMutation: null },
  'forbidden-artifact-identity': { mode: 'input-error', v1Baseline: null, cursorFrom: null, cursorMutation: null },
  'cursor-corrupt': { mode: 'safe-error', v1Baseline: null, cursorFrom: 'h3027-summary', cursorMutation: 'flip-final-hex' },
};

/** Reject every fixture edit that could accidentally weaken or enlarge the audit. */
export function validateFixture(value: unknown): AuditFixture {
  exactKeys(value, ['schemaVersion', 'kind', 'baseline', 'cases'], 'fixture');
  const fixture = value as unknown as AuditFixture;
  assert(fixture.schemaVersion === 1 && fixture.kind === 'original-language-v2-preview-audit-fixture', 'fixture identity drifted');
  exactKeys(fixture.baseline, ['cleanMainCommit', 'rebuiltDatabase', 'authorityAnchors', 'v1'], 'fixture baseline');
  assert(fixture.baseline.cleanMainCommit === '7974b15' && fixture.baseline.rebuiltDatabase === 'npm run build:db', 'fixture baseline provenance drifted');
  exactKeys(fixture.baseline.authorityAnchors, ['semanticReferenceCoordinates', 'providerStyleCoordinateKeys', 'h0216', 'h3027', 'h1961'], 'fixture authority anchors');
  assert(fixture.baseline.authorityAnchors.semanticReferenceCoordinates === 250393 && fixture.baseline.authorityAnchors.providerStyleCoordinateKeys === 0, 'fixture coordinate anchors drifted');
  exactKeys(fixture.baseline.authorityAnchors.h0216, ['entries', 'senses', 'genesis13Evidence'], 'fixture H0216 anchors');
  exactKeys(fixture.baseline.authorityAnchors.h3027, ['entries', 'senses', 'genesis322EvidenceSense'], 'fixture H3027 anchors');
  exactKeys(fixture.baseline.authorityAnchors.h1961, ['entries'], 'fixture H1961 anchors');
  assert(JSON.stringify(fixture.baseline.authorityAnchors.h0216) === JSON.stringify({ entries: 1, senses: 1, genesis13Evidence: 2 }), 'fixture H0216 anchors drifted');
  assert(JSON.stringify(fixture.baseline.authorityAnchors.h3027) === JSON.stringify({ entries: 1, senses: 78, genesis322EvidenceSense: 54 }), 'fixture H3027 anchors drifted');
  assert(JSON.stringify(fixture.baseline.authorityAnchors.h1961) === JSON.stringify({ entries: 0 }), 'fixture H1961 anchor drifted');
  const expectedBaselines = ['greek', 'h0216-unpositioned', 'h0216', 'h3027', 'h1961'];
  assert(JSON.stringify(Object.keys(fixture.baseline.v1).sort()) === JSON.stringify(expectedBaselines.slice().sort()), 'fixture v1 baseline membership drifted');
  for (const [name, baseline] of Object.entries(fixture.baseline.v1)) {
    exactKeys(baseline, ['prefixUtf8Bytes', 'prefixSha256', 'canonicalStudySha256'], `fixture v1 baseline ${name}`);
    assert(Number.isSafeInteger(baseline.prefixUtf8Bytes) && baseline.prefixUtf8Bytes > 0 && isSha256(baseline.prefixSha256) && isSha256(baseline.canonicalStudySha256), `fixture v1 baseline ${name} is malformed`);
  }
  assert(Array.isArray(fixture.cases) && fixture.cases.length === EXPECTED_CASE_IDS.length, 'fixture must contain exactly 11 audit cases');
  assert(JSON.stringify(fixture.cases.map(item => item.id)) === JSON.stringify(EXPECTED_CASE_IDS), 'fixture case order/membership drifted');
  for (const item of fixture.cases) {
    exactKeys(item, ['id', 'arguments', 'mode', 'v1Baseline', 'cursorFrom', 'cursorMutation'], `fixture case ${item.id}`);
    assert(JSON.stringify(item.arguments) === JSON.stringify(EXPECTED_ARGUMENTS[item.id]), `fixture arguments drifted for ${item.id}`);
    assert(JSON.stringify({ mode: item.mode, v1Baseline: item.v1Baseline, cursorFrom: item.cursorFrom, cursorMutation: item.cursorMutation })
      === JSON.stringify(EXPECTED_CASE_METADATA[item.id]), `fixture mode/baseline/cursor metadata drifted for ${item.id}`);
    if (item.mode === 'success') assert(typeof item.v1Baseline === 'string' && Object.hasOwn(fixture.baseline.v1, item.v1Baseline), `fixture success baseline missing for ${item.id}`);
    else assert(item.v1Baseline === null, `fixture error case must not carry a v1 baseline for ${item.id}`);
  }
  return fixture;
}

class FixedPreviewMcp {
  private readonly endpoint = new URL(PREVIEW_ENDPOINT);
  private readonly startedAt = Date.now();
  private sessionId: string | undefined;
  private id = 1;
  readonly counters: RequestCounters = { logical: 0, http: 0 };

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  private remaining(): number {
    const remaining = MAX_DURATION_MS - (Date.now() - this.startedAt);
    assert(remaining > 0, 'preview audit exceeded its 180-second total deadline');
    return remaining;
  }

  private reserve(logical: boolean): void {
    if (logical) {
      this.counters.logical += 1;
      assert(this.counters.logical <= MAX_LOGICAL_OPERATIONS, 'preview audit logical-operation budget exceeded');
    }
    this.counters.http += 1;
    assert(this.counters.http <= MAX_HTTP_EXCHANGES, 'preview audit HTTP-exchange budget exceeded');
  }

  private async post(payload: Record<string, unknown>, label: string, logical: boolean): Promise<Record<string, unknown> | undefined> {
    this.reserve(logical);
    const target = new URL(this.endpoint);
    assert(target.toString() === PREVIEW_ENDPOINT && target.protocol === 'https:' && target.hostname === 'preview-mcp.theologai.xyz' && target.pathname === '/mcp' && !target.search && !target.hash, 'preview audit endpoint allowlist drifted');
    const controller = new AbortController();
    const timeoutMs = Math.min(MAX_REQUEST_DURATION_MS, this.remaining());
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(target, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: {
          Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
          'Mcp-Protocol-Version': PROTOCOL_VERSION, 'User-Agent': 'TheologAI-OriginalLanguageV2-Preview-Audit/1.0',
          ...(this.sessionId === undefined ? {} : { 'Mcp-Session-Id': this.sessionId }),
        },
        body: JSON.stringify(payload),
      });
      if (response.status === 429) {
        await abortAndCancel(response, controller);
        fail(`preview audit stopped at HTTP 429 during ${label}`);
      }
      if (response.status < 200 || response.status >= 300) {
        await abortAndCancel(response, controller);
        fail(`preview audit received non-success HTTP status during ${label}`);
      }
      const body = await readBoundedResponseBody(response, controller, label);
      const session = response.headers.get('Mcp-Session-Id'); if (session) this.sessionId = session;
      if ('method' in payload && !('id' in payload)) {
        assert(response.status === 202 && body === '', `${label} notification contract drifted`); return undefined;
      }
      const contentType = response.headers.get('content-type') ?? '';
      assert(/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType) || /^text\/event-stream(?:;\s*charset=utf-8)?$/i.test(contentType), `${label} content type drifted`);
      return decodeMessage(body, payload.id, label);
    } catch (error) {
      if (controller.signal.aborted) fail(`${label} request exceeded its bounded deadline or response-body ceiling`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async initialize(): Promise<Record<string, unknown>> {
    const message = await this.post({ jsonrpc: '2.0', id: this.id++, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'theologai-original-language-v2-preview-audit', version: '1.0.0' } } }, 'initialize', true);
    assert(message !== undefined, 'initialize must return a response'); return message;
  }

  async initialized(): Promise<void> { await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, 'initialized notification', false); }

  async toolsList(): Promise<Record<string, unknown>> {
    const message = await this.post({ jsonrpc: '2.0', id: this.id++, method: 'tools/list' }, 'tools/list', true);
    assert(message !== undefined, 'tools/list must return a response'); return message;
  }

  async callTool(args: Record<string, unknown>): Promise<RawToolResult> {
    const message = await this.post({ jsonrpc: '2.0', id: this.id++, method: 'tools/call', params: { name: 'original_language_study', arguments: args } }, 'original_language_study', true);
    assert(message !== undefined, 'tools/call must return a response');
    const rpcError = object(message.error);
    if (rpcError) return { isError: true, text: [requireString(rpcError.message, 'MCP error message')], raw: rpcError };
    const result = object(message.result); assert(result !== undefined, 'tools/call result missing');
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content.flatMap(item => typeof object(item)?.text === 'string' ? [object(item)!.text as string] : []);
    const structuredContent = object(result.structuredContent);
    return { isError: result.isError === true, ...(structuredContent === undefined ? {} : { structuredContent }), text, raw: result };
  }

  complete(): void {
    assert(this.counters.logical === MAX_LOGICAL_OPERATIONS, `preview audit logical inventory drifted: ${this.counters.logical}/${MAX_LOGICAL_OPERATIONS}`);
    assert(this.counters.http === MAX_HTTP_EXCHANGES, `preview audit HTTP inventory drifted: ${this.counters.http}/${MAX_HTTP_EXCHANGES}`);
  }
}

async function abortAndCancel(response: Response, controller: AbortController): Promise<void> {
  controller.abort();
  await response.body?.cancel().catch(() => undefined);
}

/**
 * Reads JSON/SSE incrementally. Neither a lying Content-Length header nor a
 * chunked response can make this release gate retain an unbounded body.
 */
export async function readBoundedResponseBody(
  response: Response,
  controller: AbortController,
  label: string,
): Promise<string> {
  const advertisedLength = response.headers.get('content-length');
  if (advertisedLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(advertisedLength) || Number(advertisedLength) > MAX_MCP_RESPONSE_BYTES) {
      await abortAndCancel(response, controller);
      fail(`${label} response body exceeds the fixed ${MAX_MCP_RESPONSE_BYTES}-byte ceiling`);
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
      if (total > MAX_MCP_RESPONSE_BYTES) {
        exceeded = true;
        await reader.cancel().catch(() => undefined);
        controller.abort();
        break;
      }
      chunks.push(next.value);
    }
  } catch {
    if (!exceeded) fail(`${label} response body could not be read within its bounded deadline`);
  } finally {
    reader.releaseLock();
  }
  assert(!exceeded, `${label} response body exceeds the fixed ${MAX_MCP_RESPONSE_BYTES}-byte ceiling`);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} response body is not valid UTF-8`);
  }
}

function decodeMessage(body: string, expectedId: unknown, label: string): Record<string, unknown> {
  const trimmed = body.trim(); assert(trimmed.length > 0, `${label} response body was empty`);
  const values: unknown[] = [];
  if (/^(?:event:|data:|:)/m.test(trimmed)) {
    for (const event of trimmed.split(/\r?\n\r?\n/)) {
      const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
      if (data) values.push(JSON.parse(data));
    }
  } else values.push(JSON.parse(trimmed));
  const message = values.map(object).find(value => value?.id === expectedId);
  assert(message !== undefined && message.jsonrpc === '2.0', `${label} JSON-RPC response drifted`); return message;
}

function result(message: Record<string, unknown>, label: string): Record<string, unknown> {
  assert(message.error === undefined, `${label} returned a JSON-RPC error`);
  const output = object(message.result); assert(output !== undefined, `${label} result missing`); return output;
}

function assertInitialize(message: Record<string, unknown>): {
  protocolVersion: typeof PROTOCOL_VERSION;
  serverName: 'theologai-bible-server';
  serverVersion: '3.6.0-preview';
} {
  const output = result(message, 'initialize');
  const server = object(output.serverInfo); const capabilities = object(output.capabilities);
  assert(output.protocolVersion === PROTOCOL_VERSION && server?.name === 'theologai-bible-server' && server?.version === '3.6.0-preview', 'preview initialize identity/version drifted');
  assert(JSON.stringify(Object.keys(capabilities ?? {}).sort()) === JSON.stringify(['prompts', 'resources', 'tools']), 'preview initialize capabilities drifted');
  return { protocolVersion: PROTOCOL_VERSION, serverName: 'theologai-bible-server', serverVersion: '3.6.0-preview' };
}

function assertToolRegistration(message: Record<string, unknown>): SchemaHashes {
  const output = result(message, 'tools/list'); const listed = array(output.tools, 'tools/list.tools').map(object);
  assert(listed.every(Boolean) && JSON.stringify(listed.map(tool => tool!.name)) === JSON.stringify(TOOL_NAMES), 'exact 11-tool registration/order drifted');
  for (const tool of listed) {
    const annotations = object(tool!.annotations);
    assert(annotations?.readOnlyHint === true && annotations.destructiveHint === false && annotations.idempotentHint === true,
      `${tool!.name} tool annotations drifted`);
  }
  const target = listed.find(tool => tool?.name === 'original_language_study'); assert(target !== undefined, 'original_language_study registration missing');
  const annotations = object(target.annotations);
  assert(annotations !== undefined && annotations.readOnlyHint === true && annotations.destructiveHint === false && annotations.idempotentHint === true && !Object.hasOwn(annotations, 'openWorldHint'), 'original_language_study annotations drifted');
  const input = object(target.inputSchema); assert(input !== undefined, 'v2 input schema missing');
  const outputSchema = object(target.outputSchema); assert(outputSchema !== undefined, 'v2 output schema missing');
  assert(canonicalJson(input) === canonicalJson(originalLanguageStudyV2InputSchema), 'advertised v2 input schema differs from the checked-out contract');
  assert(canonicalJson(outputSchema) === canonicalJson(originalLanguageStudyV2OutputSchema), 'advertised v2 output schema differs from the checked-out contract');
  assert(input.type === 'object' && input.additionalProperties === false && JSON.stringify(Object.keys(object(input.properties) ?? {})) === JSON.stringify(['reference', 'target', 'position', 'detail', 'cursor']) && JSON.stringify(input.required) === JSON.stringify(['reference', 'target']), 'v2 input schema boundary drifted');
  assert(outputSchema.type === 'object' && outputSchema.additionalProperties === false && JSON.stringify(Object.keys(object(outputSchema.properties) ?? {})) === JSON.stringify(['schemaVersion', 'kind', 'detail', 'request', 'study', 'semanticEvidence', 'responseWindow']), 'v2 output schema root drifted');
  const branches = array(outputSchema.oneOf, 'v2 output oneOf').map(object); assert(branches.length === 2 && branches.every(Boolean), 'v2 output must contain exactly summary/detailed branches');
  assert(JSON.stringify(branches.map(branch => object(object(branch!.properties)?.detail)?.const).sort()) === JSON.stringify(['detailed', 'summary']), 'v2 output detail branches drifted');
  for (const branch of branches) assert(branch?.type === 'object' && branch.additionalProperties === false && Array.isArray(branch.required) && branch.required.length === 7, 'v2 output branch must remain closed and complete');
  return {
    inputSchemaSha256: sha256(canonicalJson(input)),
    outputSchemaSha256: sha256(canonicalJson(outputSchema)),
  };
}

function structured(raw: RawToolResult, label: string): Record<string, unknown> {
  assert(!raw.isError && raw.structuredContent !== undefined, `${label} must succeed with structured v2 output`); return raw.structuredContent;
}

function semantic(output: Record<string, unknown>, label: string): Record<string, unknown> {
  const value = object(output.semanticEvidence); assert(value !== undefined, `${label} semantic evidence missing`); return value;
}

function assertV1Compatibility(raw: RawToolResult, output: Record<string, unknown>, baseline: V1Baseline, label: string): { prefixBytes: number; prefixSha256: string; canonicalStudySha256: string } {
  assert(raw.text.length === 1, `${label} must return one Markdown block`);
  const marker = '\n### Added Hebrew semantic layer'; const at = raw.text[0]!.indexOf(marker);
  assert(at >= 0, `${label} must retain the semantic suffix delimiter`);
  const prefix = raw.text[0]!.slice(0, at);
  const observed = { prefixBytes: utf8Bytes(prefix), prefixSha256: sha256(prefix), canonicalStudySha256: sha256(canonicalJson(output.study)) };
  assert(observed.prefixBytes === baseline.prefixUtf8Bytes && observed.prefixSha256 === baseline.prefixSha256 && observed.canonicalStudySha256 === baseline.canonicalStudySha256, `${label} changed the established v1 prefix or nested v1 study`);
  return observed;
}

function assertResponseWindow(output: Record<string, unknown>, label: string): void {
  const serialized = serializeValidatedOriginalLanguageStudyV2Output(output);
  const window = object(output.responseWindow);
  assert(window?.unit === 'utf8_bytes' && window.maximum === RESPONSE_MAXIMUM && window.truncated === false && window.used === utf8Bytes(serialized), `${label} response byte window drifted`);
}

function assertPinnedProvenance(value: Record<string, unknown>, label: string): void {
  const identity = object(value.identity); const provenance = object(value.provenance); const sources = array(provenance?.sources, `${label} provenance sources`).map(object);
  assert(identity !== undefined && provenance?.artifactIdentity === ARTIFACT_IDENTITY && sources.length === 2 && sources.every(Boolean), `${label} pinned semantic provenance missing`);
  for (const [index, expected] of PINNED_PROVENANCE_SOURCES.entries()) {
    const source = sources[index];
    assert(source !== undefined && Object.entries(expected).every(([key, pinned]) => source[key] === pinned),
      `${label} source provenance drifted at index ${index}`);
  }
  const withheld = array(value.withheldEvidence, `${label} withheld evidence`).map(object);
  assert(withheld.length === 2 && withheld[0]?.source === 'TBESH' && withheld[0]?.field === 'Meaning' && withheld[1]?.source === 'UBS Hebrew dictionary' && withheld[1]?.field === 'A#### lexical identities', `${label} withheld-evidence boundary drifted`);
}

function candidateIds(value: Record<string, unknown>, label: string): string[] {
  return array(value.candidates, `${label} candidates`).map(candidate => requireString(object(candidate)?.senseId, `${label} candidate sense ID`));
}

function resultWindow(value: Record<string, unknown>, label: string): Record<string, unknown> {
  const window = object(value.resultWindow); assert(window !== undefined, `${label} semantic result window missing`); return window;
}

function assertWindow(value: Record<string, unknown>, expected: { prior: number; returned: number; consumed: number; total: number; hasMore: boolean }, label: string): string | undefined {
  const window = resultWindow(value, label);
  assert(window.priorCount === expected.prior && window.returnedCount === expected.returned && window.consumedCount === expected.consumed && window.totalCount === expected.total && window.hasMore === expected.hasMore, `${label} semantic pagination window drifted`);
  const continuation = object(window.continuation);
  if (expected.hasMore) {
    assert(continuation?.operation === 'original_language_study_semantic_candidates' && typeof continuation.cursor === 'string' && continuation.cursor.length <= CURSOR_MAXIMUM, `${label} semantic continuation drifted`);
    return continuation.cursor;
  }
  assert(continuation === undefined, `${label} terminal semantic page must not carry a continuation`); return undefined;
}

function assertNoFabricatedAlignment(value: Record<string, unknown>, label: string): void {
  assert(!Object.hasOwn(value, 'alignmentEvidence') && value.status !== 'reference_aligned_source_candidate', `${label} must not fabricate a reference-aligned semantic claim`);
}

function assertSemanticIdentity(
  value: Record<string, unknown>,
  expected: { publicStrongs: string; sourceIdentity: string; normalizedReference: string },
  label: string,
): void {
  assert(JSON.stringify(value.identity) === JSON.stringify({
    publicStrongs: expected.publicStrongs, sourceIdentity: expected.sourceIdentity,
  }) && value.normalizedReference === expected.normalizedReference, `${label} semantic identity/reference drifted`);
}

function assertSuccess(id: string, raw: RawToolResult, fixture: AuditFixture, cursorHistory: Map<string, string>, priorCandidates: Map<string, string[]>): Record<string, unknown> {
  const output = structured(raw, id); assert(output.schemaVersion === '2' && output.kind === 'original_language_study', `${id} v2 envelope drifted`); assertResponseWindow(output, id);
  const current = fixture.cases.find(item => item.id === id); assert(current !== undefined && typeof current.v1Baseline === 'string', `${id} v1 baseline missing`);
  const baseline = fixture.baseline.v1[current.v1Baseline]!; const v1 = assertV1Compatibility(raw, output, baseline, id);
  const evidence = semantic(output, id);
  if (id === 'greek-not-applicable') {
    assert(evidence.language === 'Greek' && evidence.status === 'not_applicable' && evidence.reason === 'hebrew_semantic_evidence_not_applicable', `${id} Greek semantic state drifted`);
    for (const key of ['identity', 'normalizedReference', 'resultWindow', 'provenance', 'withheldEvidence', 'candidates']) assert(!Object.hasOwn(evidence, key), `${id} must not query or expose Hebrew repository fields`);
  } else if (id === 'h0216-position-required') {
    assert(evidence.language === 'Hebrew' && evidence.status === 'unavailable' && evidence.reason === 'selected_token_required', `${id} selected-token state drifted`);
    const study = object(output.study); const context = object(study?.context); const positions = array(context?.candidates, `${id} candidates`).map(candidate => object(candidate)?.position);
    assert(study?.status === 'needs_disambiguation' && JSON.stringify(positions) === JSON.stringify([4, 6]), `${id} v1 disambiguation positions drifted`);
    for (const key of ['identity', 'normalizedReference', 'resultWindow', 'provenance', 'withheldEvidence', 'candidates']) assert(!Object.hasOwn(evidence, key), `${id} must not query repository evidence`);
  } else if (id === 'h0216-summary') {
    assert(evidence.language === 'Hebrew' && evidence.status === 'lexical_candidates' && evidence.reason === 'ambiguous_reference_alignment', `${id} semantic status/reason drifted`);
    assertPinnedProvenance(evidence, id); assertNoFabricatedAlignment(evidence, id);
    assertSemanticIdentity(evidence, { publicStrongs: 'H216', sourceIdentity: 'H0216', normalizedReference: 'Genesis 1:3' }, id);
    assert(JSON.stringify(candidateIds(evidence, id)) === JSON.stringify(['ubs-sense-000206001001000']), `${id} exact sense identity drifted`);
    const first = object(array(evidence.candidates, `${id} candidates`)[0]);
    assert(JSON.stringify(first?.referenceEvidenceIds) === JSON.stringify(['ubs-reference-000206001001000-00001', 'ubs-reference-000206001001000-00002']), `${id} exact source-reference identity drifted`);
    assertWindow(evidence, { prior: 0, returned: 1, consumed: 1, total: 1, hasMore: false }, id);
  } else if (id === 'h3027-summary' || id === 'h3027-detailed' || id === 'h3027-continuation') {
    assert(evidence.language === 'Hebrew' && evidence.status === 'lexical_candidates' && evidence.reason === 'reference_alignment_unproven', `${id} semantic status/reason drifted`);
    assertPinnedProvenance(evidence, id); assertNoFabricatedAlignment(evidence, id);
    assertSemanticIdentity(evidence, { publicStrongs: 'H3027', sourceIdentity: 'H3027', normalizedReference: 'Genesis 3:22' }, id);
    const expectedIds = id === 'h3027-continuation' ? H3027_SECOND : H3027_FIRST;
    assert(JSON.stringify(candidateIds(evidence, id)) === JSON.stringify(expectedIds), `${id} candidate page identity/order drifted`);
    const cursor = assertWindow(evidence, id === 'h3027-continuation'
      ? { prior: 8, returned: 8, consumed: 16, total: 78, hasMore: true }
      : { prior: 0, returned: 8, consumed: 8, total: 78, hasMore: true }, id);
    assert(cursor !== undefined, `${id} continuation unexpectedly absent`);
    if (id === 'h3027-summary') cursorHistory.set(id, cursor);
    if (id === 'h3027-detailed') {
      const statuses = array(evidence.candidates, `${id} candidates`).map(candidate => object(candidate)?.detailStatus);
      assert(statuses.every(status => status === 'detailed' || status === 'omitted_response_byte_budget') && statuses.includes('detailed'), `${id} detailed candidate budget/status drifted`);
    }
    if (id === 'h3027-continuation') {
      const initial = priorCandidates.get('h3027-summary') ?? [];
      assert(expectedIds.every(candidate => !initial.includes(candidate)), `${id} overlaps the first candidate page`);
    }
    priorCandidates.set(id, expectedIds);
  } else if (id === 'h1961-unavailable') {
    assert(evidence.language === 'Hebrew' && evidence.status === 'unavailable' && evidence.reason === 'no_lexical_entry', `${id} unavailable state drifted`);
    assertPinnedProvenance(evidence, id); assertNoFabricatedAlignment(evidence, id);
    assertSemanticIdentity(evidence, { publicStrongs: 'H1961', sourceIdentity: 'H1961', normalizedReference: 'Genesis 1:2' }, id);
    assert(array(evidence.candidates, `${id} candidates`).length === 0, `${id} must return zero candidates`);
    assertWindow(evidence, { prior: 0, returned: 0, consumed: 0, total: 0, hasMore: false }, id);
  } else fail(`unhandled success case ${id}`);
  return sanitizeSuccess(output, evidence, v1);
}

function combinedText(raw: RawToolResult): string { return [JSON.stringify(raw.raw), ...raw.text].join('\n'); }

function assertSafeError(id: string, raw: RawToolResult, submittedCursor: string | undefined): void {
  assert(raw.isError && raw.structuredContent === undefined, `${id} must return a safe error without structured output`);
  const observed = combinedText(raw).toLowerCase();
  assert(!/(?:sqlite|\bsql\b|\bd1\b|secret|api[ _-]?key|authorization|bearer|stack|traceback)/.test(observed), `${id} error exposed internal detail`);
  if (submittedCursor !== undefined) assert(!combinedText(raw).includes(submittedCursor), `${id} error reflected the submitted cursor`);
}

function assertInputError(raw: RawToolResult): void {
  assertSafeError('forbidden-artifact-identity', raw, undefined);
  assert(/artifactidentity/i.test(combinedText(raw)), 'forbidden artifact identity was not rejected at the public input boundary');
}

function sanitizeRequest(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(['reference', 'target', 'position', 'detail'].flatMap(key => Object.hasOwn(args, key) ? [[key, args[key]]] : []));
}

function sanitizeSuccess(output: Record<string, unknown>, evidence: Record<string, unknown>, v1: { prefixBytes: number; prefixSha256: string; canonicalStudySha256: string }): Record<string, unknown> {
  const base: Record<string, unknown> = {
    schemaVersion: output.schemaVersion, kind: output.kind, detail: output.detail,
    v1, responseWindow: output.responseWindow,
    semantic: { language: evidence.language, status: evidence.status, ...(Object.hasOwn(evidence, 'reason') ? { reason: evidence.reason } : {}) },
  };
  if (!Object.hasOwn(evidence, 'identity')) return base;
  const identity = object(evidence.identity)!; const window = object(evidence.resultWindow)!; const provenance = object(evidence.provenance)!;
  base.semantic = {
    ...object(base.semantic), identity: { publicStrongs: identity.publicStrongs, sourceIdentity: identity.sourceIdentity },
    normalizedReference: evidence.normalizedReference,
    resultWindow: { priorCount: window.priorCount, returnedCount: window.returnedCount, consumedCount: window.consumedCount, totalCount: window.totalCount, hasMore: window.hasMore },
    artifactIdentity: provenance.artifactIdentity,
    candidateIds: array(evidence.candidates, 'sanitize candidates').map(candidate => object(candidate)?.senseId),
    ...(evidence.status === 'lexical_candidates' ? { detailStatuses: array(evidence.candidates, 'sanitize candidate details').map(candidate => object(candidate)?.detailStatus) } : {}),
  };
  return base;
}

/** Deterministic one-character corruption; it neither decodes nor records the opaque cursor. */
export function corruptCursor(value: string): string {
  assert(/^olsv2c1_(?:[0-9a-f]{2})+$/.test(value), 'continuation cursor encoding drifted before corruption');
  const final = value.at(-1)!; return `${value.slice(0, -1)}${final === '0' ? '1' : '0'}`;
}

function evidenceTextIsSafe(value: unknown): void {
  const visit = (input: unknown): void => {
    if (Array.isArray(input)) { input.forEach(visit); return; }
    const record = object(input); if (!record) return;
    for (const [key, item] of Object.entries(record)) {
      assert(!['text', 'content', 'markdown', 'cursor', 'headers', 'sessionId', 'stack', 'url', 'sql', 'd1', 'token'].includes(key), `sanitized evidence leaked forbidden ${key} field`);
      visit(item);
    }
  };
  visit(value);
}

export async function runPreviewAudit(
  fixture: AuditFixture,
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, unknown>> {
  const startedAt = Date.now(); const client = new FixedPreviewMcp(fetchImpl);
  const negotiated = assertInitialize(await client.initialize()); await client.initialized(); const schemas = assertToolRegistration(await client.toolsList());
  const cursorHistory = new Map<string, string>(); const priorCandidates = new Map<string, string[]>(); const records: SanitizedRecord[] = [];
  for (const item of fixture.cases) {
    const args = structuredClone(item.arguments);
    if (item.cursorFrom) {
      const sourceCursor = cursorHistory.get(item.cursorFrom); assert(sourceCursor !== undefined, `${item.id} source continuation missing`);
      args.cursor = item.cursorMutation === 'flip-final-hex' ? corruptCursor(sourceCursor) : sourceCursor;
    }
    const submittedCursor = typeof args.cursor === 'string' ? args.cursor : undefined;
    const started = Date.now(); const raw = await client.callTool(args); const durationMs = Date.now() - started;
    let result: Record<string, unknown>;
    if (item.mode === 'success') result = assertSuccess(item.id, raw, fixture, cursorHistory, priorCandidates);
    else if (item.mode === 'safe-error') { assertSafeError(item.id, raw, submittedCursor); result = { isError: true, structuredContent: false, privacySafe: true }; }
    else { assertInputError(raw); result = { isError: true, structuredContent: false, inputSchemaRejected: true, privacySafe: true }; }
    records.push({ id: item.id, mode: item.mode, durationMs, passed: true, request: sanitizeRequest(args), result });
  }
  client.complete();
  const evidence = {
    schemaVersion: 1, audit: 'original-language-v2-preview', endpointClass: 'preview-custom',
    fixtureSha256: sha256(await readFile(FIXTURE_PATH, 'utf8')), durationMs: Date.now() - startedAt,
    negotiated,
    schemas,
    budgets: { logicalOperations: client.counters.logical, maximumLogicalOperations: MAX_LOGICAL_OPERATIONS, httpExchanges: client.counters.http, maximumHttpExchanges: MAX_HTTP_EXCHANGES, retryCount: 0, perRequestMaximumDurationMs: MAX_REQUEST_DURATION_MS, maximumDurationMs: MAX_DURATION_MS, maximumMcpResponseBytes: MAX_MCP_RESPONSE_BYTES },
    records,
  };
  evidenceTextIsSafe(evidence);
  assert(utf8Bytes(JSON.stringify(evidence)) <= MAX_EVIDENCE_BYTES, 'sanitized evidence exceeds 256 KiB ceiling');
  return evidence;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--output' && typeof args[1] === 'string' && args[1].length > 0), 'usage: npm run audit:original-language-v2-preview -- [--output path]');
  const output = resolve(args.length === 0 ? `test-output/original-language-v2-preview-audit-${new Date().toISOString().replaceAll(':', '-')}.json` : args[1]!);
  const fixture = validateFixture(JSON.parse(await readFile(FIXTURE_PATH, 'utf8')));
  const evidence = await runPreviewAudit(fixture);
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(`PASS: ${fixture.cases.length}/${fixture.cases.length} original_language_study v2 preview cases; evidence: ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
