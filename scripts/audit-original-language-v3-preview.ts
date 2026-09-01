/**
 * Fixed-endpoint, bounded release audit for the original_language_study v3
 * depth contract. It has no endpoint override or retry loop and emits only
 * sanitized local evidence after every assertion passes.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH,
  ORIGINAL_LANGUAGE_STUDY_MARKDOWN_BYTES,
  ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES,
} from '../src/kernel/originalLanguageStudyV3Contract.js';
import { MORPHOLOGY_USAGE_IDENTITY } from '../src/kernel/morphologyUsageCursor.js';
import {
  originalLanguageStudyV3InputSchema,
  originalLanguageStudyV3OutputSchema,
} from '../src/mcp/schemas/originalLanguageStudyV3.js';

const PREVIEW_ENDPOINT = 'https://preview-mcp.theologai.xyz/mcp';
const PRODUCTION_ENDPOINT = 'https://mcp.theologai.xyz/mcp';
export type OriginalLanguageV3AuditProfile = {
  endpoint: string;
  hostname: string;
  serverVersion: string;
  audit: 'original-language-v3-preview' | 'original-language-v3-production';
  endpointClass: 'preview-custom' | 'production-custom';
  label: 'preview' | 'production';
};
const PREVIEW_PROFILE: OriginalLanguageV3AuditProfile = {
  endpoint: PREVIEW_ENDPOINT, hostname: 'preview-mcp.theologai.xyz', serverVersion: '4.0.0-preview',
  audit: 'original-language-v3-preview', endpointClass: 'preview-custom', label: 'preview',
};
export const PRODUCTION_PROFILE: OriginalLanguageV3AuditProfile = {
  endpoint: PRODUCTION_ENDPOINT, hostname: 'mcp.theologai.xyz', serverVersion: '4.0.0',
  audit: 'original-language-v3-production', endpointClass: 'production-custom', label: 'production',
};

const PROTOCOL_VERSION = '2025-11-25';
/** initialize + tools/list + prompts/list + 3 prompts/get + 15 tools/call. */
const MAX_LOGICAL_OPERATIONS = 21;
/** Logical operations plus the initialized notification. */
const MAX_HTTP_EXCHANGES = 22;
const MAX_DURATION_MS = 180_000;
const MAX_REQUEST_DURATION_MS = 30_000;
const MAX_EVIDENCE_BYTES = 256 * 1024;
export const MAX_MCP_RESPONSE_BYTES = 256 * 1024;
export const MAX_AGGREGATE_MCP_RESPONSE_BYTES = 1024 * 1024;
const FIXTURE_PATH = new URL('../test/fixtures/original-language-v3-preview-audit.json', import.meta.url);
const TOOL_NAMES = [
  'bible_lookup', 'bible_cross_references', 'parallel_passages', 'commentary_lookup',
  'classic_text_lookup', 'primary_source_search', 'original_language_lookup',
  'bible_verse_morphology', 'original_language_study', 'donation_config', 'verify_donation',
] as const;
const PROMPT_NAMES = [
  'word-study', 'passage-exegesis', 'compare-translations',
  'confession-study', 'primary-source-research', 'donate',
] as const;
const DEPTH_PROMPTS = new Set(['word-study', 'passage-exegesis', 'compare-translations']);
const ARTIFACT_IDENTITY = 'bd19fb99f7bbfd13ad68f2184aaded4a6e5587196ad76b68b0c22bf971fc90f6';
export const PINNED_PROVENANCE_SOURCES = [
  { sourceId: 'ubs-hebrew-dictionary-en-v0.9.2', sourceRole: 'dictionary' },
  { sourceId: 'ubs-hebrew-lexical-domains-en-v0.9.2', sourceRole: 'lexical_domains' },
] as const;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type FetchLike = typeof fetch;
type Depth = 'beginner' | 'intermediate' | 'technical';
type AuditMode = 'success' | 'safe-error' | 'input-error';
type CursorMutation = 'flip-final-base64url' | null;

export interface PromptAuditCase {
  id: string;
  name: 'word-study' | 'passage-exegesis' | 'compare-translations';
  arguments: Record<string, unknown>;
  expectedDepth: Depth;
}

export interface AuditCase {
  id: string;
  arguments: Record<string, unknown>;
  mode: AuditMode;
  cursorFrom: 'h3027-intermediate' | 'greek-technical' | null;
  cursorMutation: CursorMutation;
}

export interface AuditFixture {
  schemaVersion: 2;
  kind: 'original-language-v3-depth-preview-audit-fixture';
  authorityAnchors: {
    semanticArtifactIdentity: typeof ARTIFACT_IDENTITY;
    morphologyUsageIdentity: typeof MORPHOLOGY_USAGE_IDENTITY;
    h0216SenseId: 'ubs-sense-000206001001000';
    h3027SenseCount: 78;
  };
  promptCases: PromptAuditCase[];
  cases: AuditCase[];
}

type RawToolResult = {
  isError: boolean;
  structuredContent?: Record<string, unknown>;
  text: string[];
  raw: Record<string, unknown>;
};
type Counters = { logical: number; http: number; aggregateResponseBytes: number };
type SchemaHashes = { inputSchemaSha256: string; outputSchemaSha256: string; promptsSha256: string };

function fail(message: string): never { throw new Error(message); }
function assert(value: unknown, message: string): asserts value { if (!value) fail(message); }
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function array(value: unknown, label: string): unknown[] { assert(Array.isArray(value), `${label} must be an array`); return value; }
function requireString(value: unknown, label: string): string { assert(typeof value === 'string', `${label} must be a string`); return value; }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
function exactKeys(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  const record = object(value); assert(record !== undefined, `${label} must be an object`);
  assert(JSON.stringify(Object.keys(record).sort()) === JSON.stringify([...keys].sort()), `${label} keys drifted`);
}

export function canonicalJson(value: unknown): string {
  const visit = (input: unknown): Json => {
    if (input === null || typeof input === 'boolean' || typeof input === 'number' || typeof input === 'string') return input;
    if (Array.isArray(input)) return input.map(visit);
    const record = object(input); assert(record !== undefined, 'canonical JSON received a non-JSON value');
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, visit(record[key])])) as { [key: string]: Json };
  };
  return JSON.stringify(visit(value));
}

const EXPECTED_PROMPTS: PromptAuditCase[] = [
  { id: 'word-study-beginner', name: 'word-study', arguments: { word: 'G3056', reference: 'John 1:1', depth: 'beginner' }, expectedDepth: 'beginner' },
  { id: 'passage-exegesis-technical', name: 'passage-exegesis', arguments: { reference: 'Genesis 3:22', depth: 'technical' }, expectedDepth: 'technical' },
  { id: 'compare-translations-default', name: 'compare-translations', arguments: { reference: 'John 1:1' }, expectedDepth: 'intermediate' },
];

const EXPECTED_CASES: AuditCase[] = [
  { id: 'greek-beginner', arguments: { reference: 'John 1:1', target: 'G3056', position: 5, depth: 'beginner' }, mode: 'success', cursorFrom: null, cursorMutation: null },
  { id: 'greek-default-intermediate', arguments: { reference: 'John 1:1', target: 'G3056', position: 5 }, mode: 'success', cursorFrom: null, cursorMutation: null },
  { id: 'greek-technical', arguments: { reference: 'John 1:1', target: 'G3056', position: 5, depth: 'technical' }, mode: 'success', cursorFrom: null, cursorMutation: null },
  { id: 'hebrew-position-required', arguments: { reference: 'Genesis 1:3', target: 'H0216' }, mode: 'success', cursorFrom: null, cursorMutation: null },
  { id: 'h0216-beginner', arguments: { reference: 'Genesis 1:3', target: 'H0216', position: 4, depth: 'beginner' }, mode: 'success', cursorFrom: null, cursorMutation: null },
  { id: 'h3027-intermediate', arguments: { reference: 'Genesis 3:22', target: 'H3027', position: 15, depth: 'intermediate' }, mode: 'success', cursorFrom: null, cursorMutation: null },
  { id: 'h3027-technical', arguments: { reference: 'Genesis 3:22', target: 'H3027', position: 15, depth: 'technical' }, mode: 'success', cursorFrom: null, cursorMutation: null },
  { id: 'semantic-continuation', arguments: { reference: 'Genesis 3:22', target: 'H3027', position: 15, depth: 'intermediate' }, mode: 'success', cursorFrom: 'h3027-intermediate', cursorMutation: null },
  { id: 'occurrence-continuation', arguments: { reference: 'John 1:1', target: 'G3056', position: 5, depth: 'technical' }, mode: 'success', cursorFrom: 'greek-technical', cursorMutation: null },
  { id: 'h1961-unavailable', arguments: { reference: 'Genesis 1:2', target: 'H1961', position: 2 }, mode: 'success', cursorFrom: null, cursorMutation: null },
  { id: 'stale-v2-cursor', arguments: { reference: 'Genesis 3:22', target: 'H3027', position: 15, cursor: 'olsv2c1_7b7d' }, mode: 'safe-error', cursorFrom: null, cursorMutation: null },
  { id: 'removed-detail', arguments: { reference: 'Genesis 3:22', target: 'H3027', position: 15, detail: 'detailed' }, mode: 'input-error', cursorFrom: null, cursorMutation: null },
  { id: 'cursor-wrong-depth', arguments: { reference: 'Genesis 3:22', target: 'H3027', position: 15, depth: 'technical' }, mode: 'safe-error', cursorFrom: 'h3027-intermediate', cursorMutation: null },
  { id: 'cursor-corrupt', arguments: { reference: 'Genesis 3:22', target: 'H3027', position: 15, depth: 'intermediate' }, mode: 'safe-error', cursorFrom: 'h3027-intermediate', cursorMutation: 'flip-final-base64url' },
  { id: 'forbidden-artifact-identity', arguments: { reference: 'Genesis 1:3', target: 'H0216', position: 4, artifactIdentity: 'forged' }, mode: 'input-error', cursorFrom: null, cursorMutation: null },
];

export function validateFixture(value: unknown): AuditFixture {
  exactKeys(value, ['schemaVersion', 'kind', 'authorityAnchors', 'promptCases', 'cases'], 'fixture');
  const fixture = value as unknown as AuditFixture;
  assert(fixture.schemaVersion === 2 && fixture.kind === 'original-language-v3-depth-preview-audit-fixture', 'fixture identity drifted');
  exactKeys(fixture.authorityAnchors, ['semanticArtifactIdentity', 'morphologyUsageIdentity', 'h0216SenseId', 'h3027SenseCount'], 'fixture authority anchors');
  assert(fixture.authorityAnchors.semanticArtifactIdentity === ARTIFACT_IDENTITY
    && fixture.authorityAnchors.morphologyUsageIdentity === MORPHOLOGY_USAGE_IDENTITY
    && fixture.authorityAnchors.h0216SenseId === 'ubs-sense-000206001001000'
    && fixture.authorityAnchors.h3027SenseCount === 78, 'fixture authority anchors drifted');
  assert(canonicalJson(fixture.promptCases) === canonicalJson(EXPECTED_PROMPTS), 'fixture prompt cases drifted');
  assert(canonicalJson(fixture.cases) === canonicalJson(EXPECTED_CASES), 'fixture tool cases drifted');
  return fixture;
}

class FixedMcpClient {
  private readonly endpoint: URL;
  private readonly startedAt = Date.now();
  private sessionId: string | undefined;
  private id = 1;
  readonly counters: Counters = { logical: 0, http: 0, aggregateResponseBytes: 0 };

  constructor(private readonly fetchImpl: FetchLike, private readonly profile: OriginalLanguageV3AuditProfile) {
    this.endpoint = new URL(profile.endpoint);
  }

  private remaining(): number {
    const remaining = MAX_DURATION_MS - (Date.now() - this.startedAt);
    assert(remaining > 0, `${this.profile.label} audit exceeded its 180-second total deadline`);
    return remaining;
  }

  private reserve(logical: boolean): void {
    if (logical) {
      this.counters.logical += 1;
      assert(this.counters.logical <= MAX_LOGICAL_OPERATIONS, `${this.profile.label} audit logical-operation budget exceeded`);
    }
    this.counters.http += 1;
    assert(this.counters.http <= MAX_HTTP_EXCHANGES, `${this.profile.label} audit HTTP-exchange budget exceeded`);
  }

  private async post(payload: Record<string, unknown>, label: string, logical = true): Promise<Record<string, unknown> | undefined> {
    this.reserve(logical);
    const target = new URL(this.endpoint);
    assert(target.toString() === this.profile.endpoint && target.protocol === 'https:'
      && target.hostname === this.profile.hostname && target.pathname === '/mcp'
      && !target.search && !target.hash, `${this.profile.label} audit endpoint allowlist drifted`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(MAX_REQUEST_DURATION_MS, this.remaining()));
    try {
      const response = await this.fetchImpl(target, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: {
          Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
          'Mcp-Protocol-Version': PROTOCOL_VERSION,
          'User-Agent': `TheologAI-OriginalLanguageV3-${this.profile.label}-Audit/1.0`,
          ...(this.sessionId === undefined ? {} : { 'Mcp-Session-Id': this.sessionId }),
        },
        body: JSON.stringify(payload),
      });
      if (response.status === 429) { await abortAndCancel(response, controller); fail(`${label} stopped at HTTP 429`); }
      if (response.status < 200 || response.status >= 300) { await abortAndCancel(response, controller); fail(`${label} returned non-success HTTP status`); }
      const body = await readBoundedResponseBody(response, controller, label);
      this.counters.aggregateResponseBytes += utf8Bytes(body);
      assert(this.counters.aggregateResponseBytes <= MAX_AGGREGATE_MCP_RESPONSE_BYTES,
        `${this.profile.label} audit aggregate MCP response body exceeded 1 MiB`);
      const session = response.headers.get('Mcp-Session-Id'); if (session) this.sessionId = session;
      if ('method' in payload && !('id' in payload)) {
        assert(response.status === 202 && body === '', `${label} notification contract drifted`);
        return undefined;
      }
      const contentType = response.headers.get('content-type') ?? '';
      assert(/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)
        || /^text\/event-stream(?:;\s*charset=utf-8)?$/i.test(contentType), `${label} content type drifted`);
      return decodeMessage(body, payload.id, label);
    } catch (error) {
      if (controller.signal.aborted) fail(`${label} request exceeded its deadline or response ceiling`);
      throw error;
    } finally { clearTimeout(timeout); }
  }

  initialize(): Promise<Record<string, unknown> | undefined> {
    return this.post({ jsonrpc: '2.0', id: this.id++, method: 'initialize', params: {
      protocolVersion: PROTOCOL_VERSION, capabilities: {},
      clientInfo: { name: `theologai-original-language-v3-${this.profile.label}-audit`, version: '1.0.0' },
    } }, 'initialize');
  }
  initialized(): Promise<Record<string, unknown> | undefined> {
    return this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, 'initialized notification', false);
  }
  toolsList(): Promise<Record<string, unknown> | undefined> {
    return this.post({ jsonrpc: '2.0', id: this.id++, method: 'tools/list' }, 'tools/list');
  }
  promptsList(): Promise<Record<string, unknown> | undefined> {
    return this.post({ jsonrpc: '2.0', id: this.id++, method: 'prompts/list' }, 'prompts/list');
  }
  promptGet(name: string, args: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
    return this.post({ jsonrpc: '2.0', id: this.id++, method: 'prompts/get', params: { name, arguments: args } }, `prompts/get ${name}`);
  }
  async callTool(args: Record<string, unknown>): Promise<RawToolResult> {
    const message = await this.post({ jsonrpc: '2.0', id: this.id++, method: 'tools/call', params: {
      name: 'original_language_study', arguments: args,
    } }, 'original_language_study');
    assert(message !== undefined, 'tools/call response missing');
    const rpcError = object(message.error);
    if (rpcError) return { isError: true, text: [requireString(rpcError.message, 'MCP error message')], raw: rpcError };
    const resultValue = object(message.result); assert(resultValue !== undefined, 'tools/call result missing');
    const content = Array.isArray(resultValue.content) ? resultValue.content : [];
    const text = content.flatMap(item => typeof object(item)?.text === 'string' ? [object(item)!.text as string] : []);
    return { isError: resultValue.isError === true, structuredContent: object(resultValue.structuredContent), text, raw: resultValue };
  }
  complete(): void {
    assert(this.counters.logical === MAX_LOGICAL_OPERATIONS, 'logical-operation count drifted');
    assert(this.counters.http === MAX_HTTP_EXCHANGES, 'HTTP-exchange count drifted');
    this.remaining();
  }
}

async function abortAndCancel(response: Response, controller: AbortController): Promise<void> {
  await response.body?.cancel().catch(() => undefined); controller.abort();
}

export async function readBoundedResponseBody(response: Response, controller: AbortController, label: string): Promise<string> {
  const advertised = response.headers.get('content-length');
  if (advertised !== null && (!/^(?:0|[1-9][0-9]*)$/.test(advertised) || Number(advertised) > MAX_MCP_RESPONSE_BYTES)) {
    await abortAndCancel(response, controller); fail(`${label} response body exceeds the fixed ${MAX_MCP_RESPONSE_BYTES}-byte ceiling`);
  }
  if (response.body === null) return '';
  const reader = response.body.getReader(); const chunks: Uint8Array[] = [];
  let total = 0; let exceeded = false;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_MCP_RESPONSE_BYTES) { exceeded = true; await reader.cancel().catch(() => undefined); controller.abort(); break; }
      chunks.push(next.value);
    }
  } catch { if (!exceeded) fail(`${label} response body could not be read`); }
  finally { reader.releaseLock(); }
  assert(!exceeded, `${label} response body exceeds the fixed ${MAX_MCP_RESPONSE_BYTES}-byte ceiling`);
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail(`${label} response body is not valid UTF-8`); }
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
  assert(message?.jsonrpc === '2.0', `${label} JSON-RPC response drifted`); return message;
}

function result(message: Record<string, unknown> | undefined, label: string): Record<string, unknown> {
  assert(message !== undefined && message.error === undefined, `${label} returned a JSON-RPC error`);
  const value = object(message.result); assert(value !== undefined, `${label} result missing`); return value;
}

function assertInitialize(message: Record<string, unknown> | undefined, profile: OriginalLanguageV3AuditProfile) {
  const value = result(message, 'initialize'); const server = object(value.serverInfo); const capabilities = object(value.capabilities);
  assert(value.protocolVersion === PROTOCOL_VERSION && server?.name === 'theologai-bible-server'
    && server.version === profile.serverVersion, `${profile.label} initialize identity/version drifted`);
  assert(JSON.stringify(Object.keys(capabilities ?? {}).sort()) === JSON.stringify(['prompts', 'resources', 'tools']), 'initialize capabilities drifted');
  return { protocolVersion: PROTOCOL_VERSION, serverName: 'theologai-bible-server', serverVersion: profile.serverVersion };
}

function assertToolRegistration(message: Record<string, unknown> | undefined): Omit<SchemaHashes, 'promptsSha256'> {
  const listed = array(result(message, 'tools/list').tools, 'tools/list.tools').map(object);
  assert(listed.every(Boolean) && JSON.stringify(listed.map(tool => tool!.name)) === JSON.stringify(TOOL_NAMES), 'exact 11-tool registration/order drifted');
  for (const tool of listed) {
    const annotations = object(tool!.annotations);
    assert(annotations?.readOnlyHint === true && annotations.destructiveHint === false && annotations.idempotentHint === true,
      `${tool!.name} tool annotations drifted`);
  }
  const target = listed.find(tool => tool?.name === 'original_language_study'); assert(target !== undefined, 'original_language_study registration missing');
  const input = object(target.inputSchema); const output = object(target.outputSchema);
  assert(input !== undefined && output !== undefined, 'v3 schemas missing');
  assert(canonicalJson(input) === canonicalJson(originalLanguageStudyV3InputSchema), 'advertised v3 input schema differs from checked-out contract');
  assert(canonicalJson(output) === canonicalJson(originalLanguageStudyV3OutputSchema), 'advertised v3 output schema differs from checked-out contract');
  assert(JSON.stringify(Object.keys(object(input.properties) ?? {})) === JSON.stringify(['reference', 'target', 'position', 'depth', 'cursor'])
    && input.additionalProperties === false && !canonicalJson(input).includes('detail'), 'v3 input hard-cutover boundary drifted');
  const branches = array(output.oneOf, 'v3 output oneOf').map(object);
  assert(branches.length === 3 && branches.every(Boolean)
    && JSON.stringify(branches.map(branch => object(object(branch!.properties)?.depth)?.const))
      === JSON.stringify(['beginner', 'intermediate', 'technical']), 'v3 output depth branches drifted');
  return { inputSchemaSha256: sha256(canonicalJson(input)), outputSchemaSha256: sha256(canonicalJson(output)) };
}

function assertPromptRegistration(message: Record<string, unknown> | undefined): string {
  const prompts = array(result(message, 'prompts/list').prompts, 'prompts/list.prompts').map(object);
  assert(prompts.every(Boolean) && JSON.stringify(prompts.map(prompt => prompt!.name)) === JSON.stringify(PROMPT_NAMES), 'exact six-prompt registration/order drifted');
  for (const prompt of prompts) {
    const args = array(prompt!.arguments, `${prompt!.name} prompt arguments`).map(object);
    const depth = args.find(argument => argument?.name === 'depth');
    if (DEPTH_PROMPTS.has(String(prompt!.name))) {
      assert(depth?.required === false && typeof depth.description === 'string'
        && /beginner/i.test(depth.description) && /intermediate/i.test(depth.description)
        && /technical/i.test(depth.description) && /default[^.]*intermediate/i.test(depth.description),
      `${prompt!.name} depth descriptor drifted`);
    } else assert(depth === undefined, `${prompt!.name} must not advertise depth`);
  }
  return sha256(canonicalJson(prompts));
}

function promptText(message: Record<string, unknown> | undefined, auditCase: PromptAuditCase): string {
  const messages = array(result(message, `prompts/get ${auditCase.name}`).messages, `${auditCase.name} messages`).map(object);
  assert(messages.length > 0 && messages.every(Boolean), `${auditCase.name} prompt returned no messages`);
  const text = messages.map(item => object(item!.content)?.text).filter((item): item is string => typeof item === 'string').join('\n');
  assert(text.includes('original_language_study'), `${auditCase.name} does not invoke original_language_study`);
  assert(new RegExp(`depth[^\\n]{0,32}${auditCase.expectedDepth}`, 'i').test(text), `${auditCase.name} resolved depth drifted`);
  assert(!text.includes('corpusUsage.resultWindow.continuation.cursor')
    && !text.includes('corpusUsage.occurrences'), `${auditCase.name} retained a stale v2 corpus field`);
  if (auditCase.name === 'word-study') {
    assert(text.includes('corpusOccurrences.resultWindow.continuation.cursor'), 'word-study continuation surface drifted');
  }
  if (auditCase.expectedDepth === 'beginner') {
    assert(/evidence[- ]label|label[^\n]{0,160}evidence/i.test(text) && /interpret/i.test(text), 'beginner prompt interpretation boundary drifted');
  }
  if (auditCase.expectedDepth === 'technical') {
    assert(/raw source (?:identity|evidence)|technical evidence/i.test(text)
      && /contextual verdict|(?:does not|do not|never)[^\n]{0,80}(?:select|claim|choose)[^\n]{0,40}(?:meaning|sense|interpret)/i.test(text),
    'technical prompt evidence boundary drifted');
    assert(text.includes('corpusOccurrences'), 'technical prompt does not name the v3 corpus-occurrence surface');
  }
  return text;
}

export function corruptCursor(value: string): string {
  assert(/^olsv3c1_[A-Za-z0-9_-]+$/.test(value), 'v3 continuation cursor encoding drifted before corruption');
  const final = value.at(-1)!; return `${value.slice(0, -1)}${final === 'A' ? 'B' : 'A'}`;
}

function expectedDepth(item: AuditCase): Depth {
  const value = item.arguments.depth; return value === 'beginner' || value === 'technical' ? value : 'intermediate';
}

function continuation(value: Record<string, unknown> | undefined): string | undefined {
  const item = object(value?.continuation);
  if (typeof item?.cursor !== 'string') return undefined;
  assert(item.cursor.length <= ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH, 'continuation cursor exceeds its fixed bound');
  return item.cursor;
}

function occurrenceKey(value: unknown): string {
  const item = object(value); assert(item !== undefined, 'occurrence must be an object');
  return [item.canonicalOrder, item.chapter, item.verse, item.position, item.sourceForm].join(':');
}

function assertSuccess(
  item: AuditCase,
  raw: RawToolResult,
  fixture: AuditFixture,
  cursors: Map<string, string>,
  priorPages: Map<string, string[]>,
): Record<string, unknown> {
  assert(!raw.isError && raw.structuredContent !== undefined && raw.text.length === 1, `${item.id} must succeed with one Markdown block and structured output`);
  const output = raw.structuredContent; const depth = expectedDepth(item);
  assert(output.schemaVersion === '3' && output.kind === 'original_language_study' && output.depth === depth && !Object.hasOwn(output, 'detail'), `${item.id} v3 depth envelope drifted`);
  const request = object(output.request);
  assert(request !== undefined && request.reference === item.arguments.reference
    && request.target === item.arguments.target, `${item.id} request echo drifted`);
  const translation = object(output.englishTranslationComparison); const interpretation = object(output.contextualInterpretation);
  assert(translation?.status === 'not_performed' && translation.responsibility === 'guided_prompt'
    && interpretation?.status === 'not_performed' && interpretation.responsibility === 'guided_prompt', `${item.id} guided-prompt responsibility drifted`);
  const lexicalRange = object(output.lexicalRange);
  assert(lexicalRange?.scope === 'source_attested_non_exhaustive', `${item.id} lexical range source boundary drifted`);
  const window = object(output.responseWindow);
  assert(window?.unit === 'utf8_bytes' && window.maximum === ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES
    && window.truncated === false && window.used === utf8Bytes(JSON.stringify(output)), `${item.id} truthful response window drifted`);
  assert(utf8Bytes(raw.text[0]!) <= ORIGINAL_LANGUAGE_STUDY_MARKDOWN_BYTES, `${item.id} Markdown exceeds its bounded window`);

  const semantic = object(output.semanticEvidence); assert(semantic !== undefined, `${item.id} semantic evidence missing`);
  const language = item.arguments.target?.toString().startsWith('G') ? 'Greek' : 'Hebrew';
  assert(semantic.language === language, `${item.id} semantic language drifted`);
  if (language === 'Greek') assert(semantic.status === 'not_applicable', `${item.id} Greek semantic layer must be not applicable`);
  if (item.id === 'hebrew-position-required') assert(semantic.status === 'unavailable' && semantic.reason === 'selected_token_required', `${item.id} disambiguation state drifted`);
  if (item.id === 'h1961-unavailable') assert(semantic.status === 'unavailable' && semantic.reason === 'no_lexical_entry', `${item.id} unavailable state drifted`);
  if (Object.hasOwn(semantic, 'provenance')) {
    const provenance = object(semantic.provenance); const sources = array(provenance?.sources, `${item.id} provenance sources`).map(object);
    assert(provenance?.artifactIdentity === fixture.authorityAnchors.semanticArtifactIdentity
      && sources.length === 2 && PINNED_PROVENANCE_SOURCES.every((source, index) => sources[index]?.sourceId === source.sourceId && sources[index]?.sourceRole === source.sourceRole), `${item.id} semantic provenance drifted`);
  }
  if (item.id === 'h0216-beginner') {
    const candidates = array(semantic.candidates, `${item.id} candidates`).map(object);
    assert(candidates[0]?.senseId === fixture.authorityAnchors.h0216SenseId, `${item.id} exact sense identity drifted`);
  }
  const semanticWindow = object(semantic.resultWindow); const semanticCursor = continuation(semanticWindow);
  if (item.id === 'h3027-intermediate') {
    assert(semanticWindow?.totalCount === fixture.authorityAnchors.h3027SenseCount && semanticCursor !== undefined, `${item.id} semantic continuation drifted`);
    cursors.set(item.id, semanticCursor);
    priorPages.set(item.id, array(semantic.candidates, `${item.id} candidates`).map(candidate => requireString(object(candidate)?.senseId, 'sense ID')));
  }
  if (item.id === 'semantic-continuation') {
    const initial = priorPages.get('h3027-intermediate') ?? [];
    const next = array(semantic.candidates, `${item.id} candidates`).map(candidate => requireString(object(candidate)?.senseId, 'sense ID'));
    assert(semanticWindow?.priorCount === initial.length && next.every(id => !initial.includes(id)), `${item.id} canonical semantic page drifted`);
  }

  if (depth === 'technical') {
    const usage = object(output.corpusOccurrences); assert(usage !== undefined, `${item.id} technical corpus occurrences missing`);
    if (usage.status === 'available') {
      assert(!Object.hasOwn(usage, 'level') && usage.corpusIdentity === fixture.authorityAnchors.morphologyUsageIdentity, `${item.id} corpus identity or hard-cutover shape drifted`);
      const occurrences = array(usage.occurrences ?? [], `${item.id} occurrences`);
      assert(occurrences.length <= 20 && occurrences.every(value => requireString(object(value)?.sourceForm, `${item.id} source form`).length > 0), `${item.id} occurrence bounds/source forms drifted`);
      const usageWindow = object(usage.resultWindow); const occurrenceCursor = continuation(usageWindow);
      assert(usageWindow?.returnedCount === occurrences.length, `${item.id} occurrence result window drifted`);
      if (item.id === 'greek-technical') {
        assert(occurrenceCursor !== undefined, `${item.id} occurrence continuation missing`);
        cursors.set(item.id, occurrenceCursor); priorPages.set(item.id, occurrences.map(occurrenceKey));
      }
      if (item.id === 'occurrence-continuation') {
        const initial = priorPages.get('greek-technical') ?? [];
        assert(occurrences.length > 0 && occurrences.map(occurrenceKey).every(key => !initial.includes(key)),
          `${item.id} occurrence page did not advance beyond the prior page`);
      }
    }
  } else assert(!Object.hasOwn(output, 'corpusOccurrences'), `${item.id} non-technical depth exposed corpus occurrences`);
  return {
    schemaVersion: output.schemaVersion, kind: output.kind, depth: output.depth,
    responseWindow: output.responseWindow,
    semantic: { language: semantic.language, status: semantic.status, ...(semantic.reason === undefined ? {} : { reason: semantic.reason }) },
    corpusOccurrences: depth === 'technical' ? { status: object(output.corpusOccurrences)?.status } : undefined,
  };
}

function combinedText(raw: RawToolResult): string { return [JSON.stringify(raw.raw), ...raw.text].join('\n'); }

function assertError(item: AuditCase, raw: RawToolResult, submittedCursor: string | undefined): Record<string, unknown> {
  assert(raw.isError && raw.structuredContent === undefined, `${item.id} must fail without structured output`);
  const full = combinedText(raw); const lower = full.toLowerCase();
  assert(!/(?:sqlite|\bsql\b|\bd1\b|secret|api[ _-]?key|authorization|bearer|stack|traceback)/.test(lower), `${item.id} exposed internal detail`);
  if (submittedCursor !== undefined) assert(!full.includes(submittedCursor), `${item.id} reflected the submitted cursor`);
  if (item.id === 'stale-v2-cursor') assert(/(?:unsupported|stale|schema version 2)/i.test(full), 'stale v2 cursor did not fail with an unsupported/stale classification');
  if (item.id === 'removed-detail') assert(/detail/i.test(full), 'removed detail control was not rejected at the public boundary');
  if (item.id === 'forbidden-artifact-identity') assert(/artifactidentity/i.test(full), 'forbidden artifactIdentity was not rejected at the public boundary');
  return { isError: true, structuredContent: false, privacySafe: true, ...(item.mode === 'input-error' ? { inputSchemaRejected: true } : {}) };
}

function sanitizeRequest(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(['reference', 'target', 'position', 'depth'].flatMap(key => Object.hasOwn(args, key) ? [[key, args[key]]] : []));
}

function evidenceTextIsSafe(value: unknown): void {
  const visit = (input: unknown): void => {
    if (Array.isArray(input)) { input.forEach(visit); return; }
    const record = object(input); if (!record) return;
    for (const [key, item] of Object.entries(record)) {
      assert(!['text', 'content', 'markdown', 'cursor', 'headers', 'sessionId', 'stack', 'url', 'sql', 'd1', 'token'].includes(key), `sanitized evidence leaked forbidden ${key} field`);
      visit(item);
    }
  }; visit(value);
}

export async function runOriginalLanguageV3Audit(
  fixture: AuditFixture,
  profile: OriginalLanguageV3AuditProfile,
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, unknown>> {
  const startedAt = Date.now(); const client = new FixedMcpClient(fetchImpl, profile);
  const negotiated = assertInitialize(await client.initialize(), profile); await client.initialized();
  const toolSchemas = assertToolRegistration(await client.toolsList());
  const promptsSha256 = assertPromptRegistration(await client.promptsList());
  const promptRecords = [];
  for (const item of fixture.promptCases) {
    const text = promptText(await client.promptGet(item.name, item.arguments), item);
    promptRecords.push({ id: item.id, expectedDepth: item.expectedDepth, passed: true, generatedPromptSha256: sha256(text) });
  }
  const cursors = new Map<string, string>(); const priorPages = new Map<string, string[]>(); const records = [];
  for (const item of fixture.cases) {
    const args = structuredClone(item.arguments);
    if (item.cursorFrom) {
      const source = cursors.get(item.cursorFrom); assert(source !== undefined, `${item.id} source continuation missing`);
      args.cursor = item.cursorMutation === 'flip-final-base64url' ? corruptCursor(source) : source;
    }
    const submittedCursor = typeof args.cursor === 'string' ? args.cursor : undefined;
    const caseStartedAt = Date.now(); const raw = await client.callTool(args);
    const resultValue = item.mode === 'success'
      ? assertSuccess(item, raw, fixture, cursors, priorPages)
      : assertError(item, raw, submittedCursor);
    records.push({ id: item.id, mode: item.mode, durationMs: Date.now() - caseStartedAt, passed: true, request: sanitizeRequest(args), result: resultValue });
  }
  client.complete();
  const evidence = {
    schemaVersion: 2, audit: profile.audit, endpointClass: profile.endpointClass,
    fixtureSha256: sha256(await readFile(FIXTURE_PATH, 'utf8')), durationMs: Date.now() - startedAt,
    negotiated, schemas: { ...toolSchemas, promptsSha256 }, promptRecords,
    budgets: {
      logicalOperations: client.counters.logical, maximumLogicalOperations: MAX_LOGICAL_OPERATIONS,
      httpExchanges: client.counters.http, maximumHttpExchanges: MAX_HTTP_EXCHANGES,
      aggregateMcpResponseBytes: client.counters.aggregateResponseBytes,
      maximumAggregateMcpResponseBytes: MAX_AGGREGATE_MCP_RESPONSE_BYTES,
      retryCount: 0, perRequestMaximumDurationMs: MAX_REQUEST_DURATION_MS,
      maximumDurationMs: MAX_DURATION_MS, maximumMcpResponseBytes: MAX_MCP_RESPONSE_BYTES,
    },
    records,
  };
  evidenceTextIsSafe(evidence);
  assert(utf8Bytes(JSON.stringify(evidence)) <= MAX_EVIDENCE_BYTES, 'sanitized evidence exceeds 256 KiB ceiling');
  client.complete();
  return evidence;
}

export function runPreviewAudit(fixture: AuditFixture, fetchImpl: FetchLike = fetch) {
  return runOriginalLanguageV3Audit(fixture, PREVIEW_PROFILE, fetchImpl);
}
export function runProductionAudit(fixture: AuditFixture, fetchImpl: FetchLike = fetch) {
  return runOriginalLanguageV3Audit(fixture, PRODUCTION_PROFILE, fetchImpl);
}

export async function runOriginalLanguageV3AuditCli(args: string[], profile: OriginalLanguageV3AuditProfile) {
  assert(args.length === 0 || (args.length === 2 && args[0] === '--output' && args[1]), `usage: audit:original-language-v3-${profile.label} [--output path]`);
  const output = resolve(args.length === 0
    ? `test-output/original-language-v3-${profile.label}-audit-${new Date().toISOString().replaceAll(':', '-')}.json`
    : args[1]!);
  const fixture = validateFixture(JSON.parse(await readFile(FIXTURE_PATH, 'utf8')));
  const evidence = await runOriginalLanguageV3Audit(fixture, profile);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { output, caseCount: fixture.cases.length, promptCaseCount: fixture.promptCases.length };
}

async function main(): Promise<void> {
  const resultValue = await runOriginalLanguageV3AuditCli(process.argv.slice(2), PREVIEW_PROFILE);
  console.log(`PASS: ${resultValue.caseCount}/${resultValue.caseCount} tool cases and ${resultValue.promptCaseCount}/${resultValue.promptCaseCount} prompt cases; evidence: ${resultValue.output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
