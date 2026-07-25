/**
 * Fixed-endpoint, bounded release audit for the reviewed Transform-9 historical
 * core. This is deliberately a release gate, not a reusable MCP client: the
 * endpoint and probe inventory are immutable and it emits sanitized evidence
 * only after every assertion passes.
 */
import { createHash } from 'node:crypto';
import { link, lstat, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HISTORICAL_SECTIONED_ONLY_LANDING_MAX_BYTES } from '../src/kernel/historicalSectionedDelivery.js';
import { classicTextsOutputSchema } from '../src/mcp/schemas/classicTexts.js';
import { primarySourceSearchV7OutputSchema } from '../src/mcp/schemas/primarySourceSearchV4.js';

const PREVIEW_ENDPOINT = 'https://preview-mcp.theologai.xyz/mcp';
const PRODUCTION_ENDPOINT = 'https://mcp.theologai.xyz/mcp';
export type HistoricalCoreAuditProfile = {
  endpoint: string;
  hostname: string;
  serverVersion: string;
  audit: 'historical-core-preview' | 'historical-core-production';
  endpointClass: 'preview-custom' | 'production-custom';
  label: 'preview' | 'production';
};
const PREVIEW_PROFILE: HistoricalCoreAuditProfile = {
  endpoint: PREVIEW_ENDPOINT, hostname: 'preview-mcp.theologai.xyz', serverVersion: '3.6.0-preview',
  audit: 'historical-core-preview', endpointClass: 'preview-custom', label: 'preview',
};
export const PRODUCTION_PROFILE: HistoricalCoreAuditProfile = {
  endpoint: PRODUCTION_ENDPOINT, hostname: 'mcp.theologai.xyz', serverVersion: '3.6.0',
  audit: 'historical-core-production', endpointClass: 'production-custom', label: 'production',
};
const PROTOCOL_VERSION = '2025-11-25';
const MAX_LOGICAL_OPERATIONS = 54;
/** initialize + initialized notification + 53 request/response operations. */
const MAX_HTTP_EXCHANGES = 55;
const MAX_DURATION_MS = 300_000;
const MAX_REQUEST_DURATION_MS = 30_000;
const MAX_EVIDENCE_BYTES = 256 * 1024;
const MAX_AGGREGATE_MCP_RESPONSE_BYTES = 2 * 1024 * 1024;
/** A tool inventory is currently the largest response; all reads are bounded too. */
export const MAX_MCP_RESPONSE_BYTES = 256 * 1024;
const FIXTURE_PATH = new URL('../test/fixtures/historical-core-preview-audit.json', import.meta.url);

const TOOL_NAMES = [
  'bible_lookup', 'bible_cross_references', 'parallel_passages', 'commentary_lookup',
  'classic_text_lookup', 'primary_source_search', 'original_language_lookup',
  'bible_verse_morphology', 'original_language_study', 'donation_config', 'verify_donation',
] as const;
const PROMPT_NAMES = [
  'word-study', 'passage-exegesis', 'compare-translations', 'confession-study', 'primary-source-research', 'donate',
] as const;
const LEGACY_WORK_IDS = [
  '39-articles', 'apostles-creed', 'athanasian-creed', 'augsburg-confession', 'baltimore-catechism',
  'belgic-confession', 'canons-of-dort', 'chalcedonian-definition', 'confession-of-dositheus', 'council-of-trent',
  'heidelberg-catechism', 'london-baptist-1689', 'nicene-creed', 'philaret-catechism', 'westminster-confession',
  'westminster-larger-catechism', 'westminster-shorter-catechism',
] as const;
const EXPECTED_CLASSIC_INPUT_SCHEMA_SHA256 = '45124e704b5e0009b5bc3672c52b0d7ed6e8193063b621a7ccf766d1d2ad00d4';
const EXPECTED_CLASSIC_OUTPUT_SCHEMA_SHA256 = 'b8a6af9dff44cf8ad9d964661ca76cbe4ab9bcbdc97d9aca85df4edea73a9a7c';
const EXPECTED_PRIMARY_INPUT_SCHEMA_SHA256 = '5ee3fbbcee8ae6956d154c1b84eccbf0a984011fed7076e2bf3e9c6d03c74d90';
const EXPECTED_PRIMARY_OUTPUT_SCHEMA_SHA256 = '005977f15f3db2d661314055f61ee61d27aee1ae153c86f3a844d199bb477cef';

const EXPECTED_FIXTURE = {
  schemaVersion: 1,
  kind: 'historical-core-preview-audit-fixture',
  baseline: {
    manifestSchemaVersion: '0006_historical_source_packs',
    d1TransformVersion: 9,
    expectedCatalogIdentity: { workCount: 25, legacyWorkCount: 17, coreWorkCount: 8, coreSectionCount: 512 },
    sourcePackId: 'theologai-core-eight',
    expectedCoreEditionProvenanceStatus: 'verified_with_uncertainty',
  },
  probes: [
    { workId: 'augustine-confessions', editionId: 'augustine-confessions-pusey-1838', query: 'restless heart', sectionCount: 13, landingResourceUri: 'theologai://documents/augustine-confessions', firstSection: { sectionKey: 'book-01', sourceOrdinal: 1, resourceUri: 'theologai://documents/augustine-confessions#section-book-01' }, primarySearch: { sectionKey: 'book-02', sourceOrdinal: 2, resourceUri: 'theologai://documents/augustine-confessions#section-book-02' } },
    { workId: 'john-damascene-exact-exposition', editionId: 'john-damascene-exposition-salmond-npnf2-v9', query: 'two natures', sectionCount: 100, landingResourceUri: 'theologai://documents/john-damascene-exact-exposition', firstSection: { sectionKey: 'book-1-chapter-01', sourceOrdinal: 1, resourceUri: 'theologai://documents/john-damascene-exact-exposition#section-book-1-chapter-01' }, primarySearch: { sectionKey: 'book-3-chapter-16', sourceOrdinal: 60, resourceUri: 'theologai://documents/john-damascene-exact-exposition#section-book-3-chapter-16' } },
    { workId: 'calvin-institutes', editionId: 'calvin-institutes-beveridge-1845', query: 'promises law gospel reconciled', sectionCount: 84, landingResourceUri: 'theologai://documents/calvin-institutes', firstSection: { sectionKey: 'book-1-chapter-01', sourceOrdinal: 1, resourceUri: 'theologai://documents/calvin-institutes#section-book-1-chapter-01' }, primarySearch: { sectionKey: 'book-3-chapter-17', sourceOrdinal: 54, resourceUri: 'theologai://documents/calvin-institutes#section-book-3-chapter-17' } },
    { workId: 'wesley-standard-sermons', editionId: 'wesley-standard-sermons-1771', query: 'salvation by faith', sectionCount: 55, landingResourceUri: 'theologai://documents/wesley-standard-sermons', firstSection: { sectionKey: 'sermon-01', sourceOrdinal: 1, resourceUri: 'theologai://documents/wesley-standard-sermons#section-sermon-01' }, primarySearch: { sectionKey: 'sermon-01', sourceOrdinal: 1, resourceUri: 'theologai://documents/wesley-standard-sermons#section-sermon-01' } },
    { workId: 'bunyan-pilgrims-progress-part-1', editionId: 'bunyan-pilgrims-progress-part-1', query: 'Christian', sectionCount: 3, landingResourceUri: 'theologai://documents/bunyan-pilgrims-progress-part-1', firstSection: { sectionKey: 'part-01-part-01', sourceOrdinal: 1, resourceUri: 'theologai://documents/bunyan-pilgrims-progress-part-1#section-part-01-part-01' }, primarySearch: { sectionKey: 'part-01-part-01', sourceOrdinal: 1, resourceUri: 'theologai://documents/bunyan-pilgrims-progress-part-1#section-part-01-part-01' } },
    { workId: 'athanasius-on-incarnation', editionId: 'athanasius-on-incarnation-robertson-npnf2-v4', query: 'renewal creation', sectionCount: 57, landingResourceUri: 'theologai://documents/athanasius-on-incarnation', firstSection: { sectionKey: 'section-001', sourceOrdinal: 1, resourceUri: 'theologai://documents/athanasius-on-incarnation#section-section-001' }, primarySearch: { sectionKey: 'section-001', sourceOrdinal: 1, resourceUri: 'theologai://documents/athanasius-on-incarnation#section-section-001' } },
    { workId: 'irenaeus-against-heresies', editionId: 'irenaeus-against-heresies-anf1-1885', query: 'heresies', sectionCount: 173, landingResourceUri: 'theologai://documents/irenaeus-against-heresies', firstSection: { sectionKey: 'book-1-preface', sourceOrdinal: 1, resourceUri: 'theologai://documents/irenaeus-against-heresies#section-book-1-preface' }, primarySearch: { sectionKey: 'book-1-chapter-28', sourceOrdinal: 29, resourceUri: 'theologai://documents/irenaeus-against-heresies#section-book-1-chapter-28' } },
    { workId: 'anselm-proslogion', editionId: 'anselm-proslogion-deane-1903', query: 'that than which nothing greater', sectionCount: 27, landingResourceUri: 'theologai://documents/anselm-proslogion', firstSection: { sectionKey: 'preface', sourceOrdinal: 1, resourceUri: 'theologai://documents/anselm-proslogion#section-preface' }, primarySearch: { sectionKey: 'chapter-02', sourceOrdinal: 3, resourceUri: 'theologai://documents/anselm-proslogion#section-chapter-02' } },
  ],
  legacyRegression: { workId: 'apostles-creed', deliveryMode: 'complete_document' },
} as const;

export type AuditFixture = typeof EXPECTED_FIXTURE;
type FetchLike = typeof fetch;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type ObjectRecord = Record<string, unknown>;
type RawToolResult = { isError: boolean; structuredContent?: ObjectRecord; text: string[]; raw: ObjectRecord };
type RequestCounters = { logical: number; http: number };

/** One budget owns preflight, transport, evidence construction, and publication. */
export class AuditDeadline {
  constructor(private readonly now: () => number = Date.now, private readonly startedAt = now()) {}

  remaining(label: string): number {
    const remaining = MAX_DURATION_MS - (this.now() - this.startedAt);
    assert(remaining > 0, `historical preview audit exceeded its 300-second total deadline during ${label}`);
    return remaining;
  }

  assertRemaining(label: string): void { this.remaining(label); }
  elapsed(): number { return this.now() - this.startedAt; }
}

function fail(message: string): never { throw new Error(message); }
function assert(value: unknown, message: string): asserts value { if (!value) fail(message); }
function object(value: unknown): ObjectRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectRecord : undefined;
}
function array(value: unknown, label: string): unknown[] { assert(Array.isArray(value), `${label} must be an array`); return value; }
function requireString(value: unknown, label: string): string { assert(typeof value === 'string', `${label} must be a string`); return value; }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }

/** Canonical object ordering makes schema and fixture comparisons wire-order independent. */
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

/** Reject any fixture edit that could silently alter the protected release inventory. */
export function validateFixture(value: unknown): AuditFixture {
  assert(canonicalJson(value) === canonicalJson(EXPECTED_FIXTURE), 'historical preview fixture identity or probe inventory drifted');
  return structuredClone(EXPECTED_FIXTURE);
}

class FixedPreviewMcp {
  readonly counters: RequestCounters = { logical: 0, http: 0 };
  private responseBytes = 0;
  private id = 1;
  private sessionId: string | undefined;

  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly deadline: AuditDeadline,
    private readonly profile: HistoricalCoreAuditProfile = PREVIEW_PROFILE,
  ) {}

  private reserve(logical: boolean): void {
    if (logical) {
      this.counters.logical += 1;
      assert(this.counters.logical <= MAX_LOGICAL_OPERATIONS, 'historical preview audit logical-operation budget exceeded');
    }
    this.counters.http += 1;
    assert(this.counters.http <= MAX_HTTP_EXCHANGES, 'historical preview audit HTTP-exchange budget exceeded');
  }

  private async post(payload: ObjectRecord, label: string, logical: boolean): Promise<ObjectRecord | undefined> {
    this.reserve(logical);
    const target = new URL(this.profile.endpoint);
    assert(target.toString() === this.profile.endpoint && target.protocol === 'https:' && target.hostname === this.profile.hostname
      && target.pathname === '/mcp' && !target.search && !target.hash, `${this.profile.label} audit endpoint allowlist drifted`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(MAX_REQUEST_DURATION_MS, this.deadline.remaining(`${label} request`)));
    try {
      const response = await this.fetchImpl(target, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: {
          Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
          'Mcp-Protocol-Version': PROTOCOL_VERSION, 'User-Agent': `TheologAI-HistoricalCore-${this.profile.label}-Audit/1.0`,
          ...(this.sessionId === undefined ? {} : { 'Mcp-Session-Id': this.sessionId }),
        },
        body: JSON.stringify(payload),
      });
      if (response.status === 429) {
        await abortAndCancel(response, controller);
        fail(`historical preview audit stopped at HTTP 429 during ${label}`);
      }
      if (response.status < 200 || response.status >= 300) {
        await abortAndCancel(response, controller);
        fail(`historical preview audit received non-success HTTP status during ${label}`);
      }
      const body = await readBoundedResponseBody(response, controller, label);
      this.responseBytes += utf8Bytes(body);
      assert(this.responseBytes <= MAX_AGGREGATE_MCP_RESPONSE_BYTES,
        `historical preview audit aggregate response budget exceeded (${MAX_AGGREGATE_MCP_RESPONSE_BYTES} bytes)`);
      const session = response.headers.get('Mcp-Session-Id'); if (session) this.sessionId = session;
      if ('method' in payload && !('id' in payload)) {
        assert(response.status === 202 && body === '', `${label} notification contract drifted`);
        return undefined;
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

  async initialize(): Promise<ObjectRecord> {
    const message = await this.post({ jsonrpc: '2.0', id: this.id++, method: 'initialize', params: {
      protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: `theologai-historical-core-${this.profile.label}-audit`, version: '1.0.0' },
    } }, 'initialize', true);
    assert(message !== undefined, 'initialize must return a response'); return message;
  }

  async initialized(): Promise<void> {
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, 'initialized notification', false);
  }

  async request(method: string, params: ObjectRecord = {}): Promise<ObjectRecord> {
    const message = await this.post({ jsonrpc: '2.0', id: this.id++, method, params }, method, true);
    assert(message !== undefined, `${method} must return a response`); return message;
  }

  async toolsList(): Promise<ObjectRecord> { return this.request('tools/list'); }
  async promptsList(): Promise<ObjectRecord> { return this.request('prompts/list'); }
  async getPrompt(name: string, args: ObjectRecord): Promise<ObjectRecord> { return this.request('prompts/get', { name, arguments: args }); }
  async resourcesList(): Promise<ObjectRecord> { return this.request('resources/list'); }
  async resourceTemplatesList(): Promise<ObjectRecord> { return this.request('resources/templates/list'); }
  async readResource(uri: string): Promise<ObjectRecord> { return this.request('resources/read', { uri }); }

  async callTool(name: string, args: ObjectRecord): Promise<RawToolResult> {
    const message = await this.request('tools/call', { name, arguments: args });
    const rpcError = object(message.error);
    if (rpcError) return { isError: true, text: [requireString(rpcError.message, 'MCP error message')], raw: rpcError };
    const result = object(message.result); assert(result !== undefined, `${name} result missing`);
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content.flatMap(item => typeof object(item)?.text === 'string' ? [object(item)!.text as string] : []);
    const structuredContent = object(result.structuredContent);
    return { isError: result.isError === true, ...(structuredContent === undefined ? {} : { structuredContent }), text, raw: result };
  }

  complete(): void {
    assert(this.counters.logical === MAX_LOGICAL_OPERATIONS, `historical preview logical inventory drifted: ${this.counters.logical}/${MAX_LOGICAL_OPERATIONS}`);
    assert(this.counters.http === MAX_HTTP_EXCHANGES, `historical preview HTTP inventory drifted: ${this.counters.http}/${MAX_HTTP_EXCHANGES}`);
    assert(this.responseBytes <= MAX_AGGREGATE_MCP_RESPONSE_BYTES, 'historical preview aggregate response budget drifted');
  }

  aggregateResponseBytes(): number { return this.responseBytes; }
}

async function abortAndCancel(response: Response, controller: AbortController): Promise<void> {
  controller.abort();
  await response.body?.cancel().catch(() => undefined);
}

/** Incremental response consumption prevents a malformed endpoint from filling runner memory. */
export async function readBoundedResponseBody(response: Response, controller: AbortController, label: string): Promise<string> {
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
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return fail(`${label} response body is not valid UTF-8`); }
}

function decodeMessage(body: string, expectedId: unknown, label: string): ObjectRecord {
  const trimmed = body.trim(); assert(trimmed.length > 0, `${label} response body was empty`);
  const values: unknown[] = [];
  if (/^(?:event:|data:|:)/m.test(trimmed)) {
    for (const event of trimmed.split(/\r?\n\r?\n/)) {
      const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
      if (data) values.push(JSON.parse(data));
    }
  } else values.push(JSON.parse(trimmed));
  const message = values.map(object).find(value => value?.id === expectedId);
  assert(message !== undefined && message.jsonrpc === '2.0', `${label} JSON-RPC response drifted`);
  return message;
}

function result(message: ObjectRecord, label: string): ObjectRecord {
  assert(message.error === undefined, `${label} returned a JSON-RPC error`);
  const output = object(message.result); assert(output !== undefined, `${label} result missing`); return output;
}

function assertInitialize(message: ObjectRecord, profile: HistoricalCoreAuditProfile): ObjectRecord {
  const output = result(message, 'initialize');
  const server = object(output.serverInfo); const capabilities = object(output.capabilities);
  assert(output.protocolVersion === PROTOCOL_VERSION && server?.name === 'theologai-bible-server' && server?.version === profile.serverVersion, `${profile.label} initialize identity/version drifted`);
  assert(JSON.stringify(Object.keys(capabilities ?? {}).sort()) === JSON.stringify(['prompts', 'resources', 'tools']), `${profile.label} initialize capabilities drifted`);
  return { protocolVersion: PROTOCOL_VERSION, serverName: 'theologai-bible-server', serverVersion: profile.serverVersion };
}

function assertToolRegistration(message: ObjectRecord): ObjectRecord {
  const listed = array(result(message, 'tools/list').tools, 'tools/list.tools').map(object);
  assert(listed.every(Boolean) && JSON.stringify(listed.map(tool => tool!.name)) === JSON.stringify(TOOL_NAMES), 'exact 11-tool registration/order drifted');
  for (const tool of listed) {
    const annotations = object(tool!.annotations);
    assert(annotations?.readOnlyHint === true && annotations.destructiveHint === false && annotations.idempotentHint === true, `${tool!.name} annotations drifted`);
    const expectedOpenWorld = tool!.name === 'primary_source_search' ? true : tool!.name === 'classic_text_lookup' ? false : undefined;
    assert(annotations?.openWorldHint === expectedOpenWorld
      && (expectedOpenWorld === undefined ? !Object.hasOwn(annotations!, 'openWorldHint') : Object.hasOwn(annotations!, 'openWorldHint')),
    `${tool!.name} open-world annotation drifted`);
    assert(JSON.stringify(Object.keys(annotations ?? {}).sort()) === JSON.stringify(
      (expectedOpenWorld === undefined
        ? ['readOnlyHint', 'destructiveHint', 'idempotentHint']
        : ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']).sort(),
    ), `${tool!.name} annotation key set drifted`);
  }
  const classic = listed.find(tool => tool?.name === 'classic_text_lookup');
  const primary = listed.find(tool => tool?.name === 'primary_source_search');
  assert(classic !== undefined && primary !== undefined, 'historical tools are not registered');
  const classicInput = object(classic.inputSchema); const classicOutput = object(classic.outputSchema);
  const primaryInput = object(primary.inputSchema); const primaryOutput = object(primary.outputSchema);
  assert(classicInput !== undefined && classicOutput !== undefined && primaryInput !== undefined && primaryOutput !== undefined, 'historical tool schemas missing');
  assert(classicInput.type === 'object' && classicInput.minProperties === 1 && classicInput.additionalProperties === false
    && JSON.stringify(Object.keys(object(classicInput.properties) ?? {})) === JSON.stringify(['work', 'query', 'listWorks', 'browseSections', 'cursor']), 'classic-text input contract drifted');
  assert(sha256(canonicalJson(classicInput)) === EXPECTED_CLASSIC_INPUT_SCHEMA_SHA256, 'classic-text input schema hash drifted');
  assert(canonicalJson(classicOutput) === canonicalJson(classicTextsOutputSchema), 'advertised classic-text output schema differs from the checked-out contract');
  assert(sha256(canonicalJson(classicTextsOutputSchema)) === EXPECTED_CLASSIC_OUTPUT_SCHEMA_SHA256
    && sha256(canonicalJson(classicOutput)) === EXPECTED_CLASSIC_OUTPUT_SCHEMA_SHA256, 'classic-text output schema hash drifted');
  const queries = object(primaryInput.properties)?.queries as ObjectRecord | undefined;
  const queryItem = object(queries?.items); const properties = object(queryItem?.properties);
  assert(primaryInput.type === 'object' && primaryInput.additionalProperties === false && JSON.stringify(primaryInput.required) === JSON.stringify(['queries'])
    && queries?.minItems === 1 && queries.maxItems === 4 && queryItem?.additionalProperties === false
    && JSON.stringify(Object.keys(properties ?? {})) === JSON.stringify(['id', 'text', 'providers', 'match', 'selection', 'author', 'work', 'startYear', 'endYear', 'page', 'limit']), 'primary-source input contract drifted');
  const providers = object(properties?.providers); const providerItems = object(providers?.items);
  assert(providers?.minItems === 1 && providers?.maxItems === 2 && JSON.stringify(providerItems?.enum) === JSON.stringify(['local', 'ccel']), 'preview provider contract drifted');
  assert(sha256(canonicalJson(primaryInput)) === EXPECTED_PRIMARY_INPUT_SCHEMA_SHA256, 'primary-source input schema hash drifted');
  assert(canonicalJson(primaryOutput) === canonicalJson(primarySourceSearchV7OutputSchema), 'advertised preview primary-source output schema differs from the checked-out contract');
  assert(sha256(canonicalJson(primarySourceSearchV7OutputSchema)) === EXPECTED_PRIMARY_OUTPUT_SCHEMA_SHA256
    && sha256(canonicalJson(primaryOutput)) === EXPECTED_PRIMARY_OUTPUT_SCHEMA_SHA256, 'primary-source output schema hash drifted');
  return {
    classicTextInputSchemaSha256: EXPECTED_CLASSIC_INPUT_SCHEMA_SHA256,
    classicTextOutputSchemaSha256: EXPECTED_CLASSIC_OUTPUT_SCHEMA_SHA256,
    primarySourceInputSchemaSha256: EXPECTED_PRIMARY_INPUT_SCHEMA_SHA256,
    primarySourceOutputSchemaSha256: EXPECTED_PRIMARY_OUTPUT_SCHEMA_SHA256,
  };
}

function assertPrompts(message: ObjectRecord): void {
  const prompts = array(result(message, 'prompts/list').prompts, 'prompts/list.prompts').map(object);
  assert(prompts.every(Boolean) && JSON.stringify(prompts.map(prompt => prompt!.name)) === JSON.stringify(PROMPT_NAMES), 'prompt registration/order drifted');
}

function promptText(message: ObjectRecord, label: string): string {
  const messages = array(result(message, label).messages, `${label}.messages`).map(object);
  assert(messages.length === 1 && messages[0]?.role === 'user', `${label} must return exactly one user message`);
  const content = object(messages[0]!.content);
  assert(content?.type === 'text', `${label} must return text content`);
  return requireString(content.text, `${label} content text`);
}

function assertPrimarySourceResearchPrompt(message: ObjectRecord): void {
  const text = promptText(message, 'primary-source-research prompt');
  assert(text.includes('Search local evidence') && text.includes('Search one external scope now') && text.includes('Use the v7 contract')
    && text.includes('"providers":["local"]') && text.includes('"providers":["ccel"]')
    && text.includes('This prompt authorizes at most one CCEL-bearing call.')
    && text.includes('The external CCEL call deliberately omits the requested local composition-year bounds; any returned CCEL hit cannot establish membership in that requested local range.')
    && text.includes('Use MCP `resources/read` only for local `mcp_resource` URIs.')
    && text.includes('Open external `external_url` pages directly')
    && text.includes('name disabled, unavailable, or unsupported searches'), 'primary-source-research current v7 prompt behavior drifted');
}

function assertConfessionStudyPrompt(message: ObjectRecord): void {
  const text = promptText(message, 'confession-study prompt');
  assert(text.includes('"providers":["local","ccel"]') && text.includes('external `external_url` locator')
    && text.includes('it is not an MCP resource') && text.includes('rights status is not determined')
    && text.includes('Name any disabled, unavailable, or unsupported provider'), 'confession-study current v7 prompt behavior drifted');
}

function expectedResourceUris(fixture: AuditFixture): string[] {
  return [
    'theologai://translations', 'theologai://commentaries', 'theologai://primary-sources/catalog',
    ...LEGACY_WORK_IDS.map(id => `theologai://documents/${id}`),
    ...fixture.probes.map(probe => probe.landingResourceUri),
  ].sort();
}

function assertResources(message: ObjectRecord, fixture: AuditFixture): void {
  const resources = array(result(message, 'resources/list').resources, 'resources/list.resources').map(object);
  assert(resources.length === 28 && resources.every(Boolean), 'resources/list must expose exactly 28 resources');
  assert(new Set(resources.map(resource => resource!.uri)).size === resources.length, 'resources/list resource URIs are not unique');
  assert(JSON.stringify(resources.map(resource => requireString(resource!.uri, 'resource URI')).sort()) === JSON.stringify(expectedResourceUris(fixture)), 'resources/list exact resource identity drifted');
  for (const resource of resources) {
    const uri = requireString(resource!.uri, 'resource URI');
    const expectedMimeType = uri === 'theologai://primary-sources/catalog' ? 'application/json' : 'text/markdown';
    assert(resource!.mimeType === expectedMimeType, `resources/list ${uri} MIME contract drifted`);
  }
  const catalog = resources.filter(resource => resource?.uri === 'theologai://primary-sources/catalog');
  assert(catalog.length === 1 && catalog[0]?.mimeType === 'application/json', 'primary-source catalog resource registration drifted');
}

function assertResourceTemplates(message: ObjectRecord): void {
  const templates = array(result(message, 'resources/templates/list').resourceTemplates, 'resources/templates/list.resourceTemplates').map(object);
  assert(templates.length === 2 && templates.every(Boolean), 'resources/templates/list must expose exactly two templates');
  const observed = templates.map(template => ({ uriTemplate: template!.uriTemplate, name: template!.name, mimeType: template!.mimeType }));
  assert(JSON.stringify(observed) === JSON.stringify([
    { uriTemplate: 'theologai://documents/{slug}', name: 'Historical Document', mimeType: 'text/markdown' },
    { uriTemplate: 'theologai://strongs/{number}', name: "Strong's Dictionary Entry", mimeType: 'text/markdown' },
  ]), 'resources/templates/list exact template contract drifted');
}

function contentText(message: ObjectRecord, expectedUri: string, expectedMimeType: string, label: string): string {
  const contents = array(result(message, label).contents, `${label}.contents`).map(object);
  assert(contents.length === 1 && contents[0] !== undefined, `${label} must return exactly one content block`);
  assert(contents[0]!.uri === expectedUri && contents[0]!.mimeType === expectedMimeType, `${label} resource identity/mime drifted`);
  return requireString(contents[0]!.text, `${label} text`);
}

function assertCatalog(message: ObjectRecord, fixture: AuditFixture): ObjectRecord {
  const text = contentText(message, 'theologai://primary-sources/catalog', 'application/json', 'catalog');
  const catalog = object(JSON.parse(text)); assert(catalog !== undefined, 'catalog JSON is not an object');
  assert(catalog.schemaVersion === '2' && catalog.kind === 'local_primary_source_catalog' && catalog.workCount === fixture.baseline.expectedCatalogIdentity.workCount, 'catalog envelope/count drifted');
  const works = array(catalog.works, 'catalog works').map(object);
  assert(works.length === fixture.baseline.expectedCatalogIdentity.workCount && works.every(Boolean), 'catalog work inventory drifted');
  const ids = works.map(work => requireString(work!.id, 'catalog work id'));
  assert(LEGACY_WORK_IDS.every(id => ids.includes(id)), 'catalog no longer contains the complete 17-work legacy identity');
  const core = fixture.probes.map(probe => works.find(work => work?.id === probe.workId));
  assert(core.every(Boolean) && works.length === LEGACY_WORK_IDS.length + core.length, 'catalog no longer has the exact 25=17+8 historical identity');
  for (const [index, work] of core.entries()) {
    const probe = fixture.probes[index]!;
    const provenance = object(work!.editionProvenance); const readiness = object(work!.editionReadiness);
    assert(provenance?.sourcePackId === fixture.baseline.sourcePackId && provenance.editionId === probe.editionId, `${probe.workId} source-pack provenance drifted`);
    assert(readiness?.editionIdentity === 'established'
      && readiness.provenance === fixture.baseline.expectedCoreEditionProvenanceStatus
      && readiness.normalizedTextRights === 'no_known_conflict', `${probe.workId} edition readiness drifted`);
  }
  const policies = object(catalog.policies);
  assert(policies?.scope === 'hosted_collection_only' && policies.editionProvenance === 'mixed_legacy_and_reviewed_source_packs'
    && policies.rightsStatus === 'mixed_not_established_and_no_known_conflict', 'catalog mixed-inventory provenance policy drifted');
  return { workCount: works.length, legacyWorkCount: LEGACY_WORK_IDS.length, coreWorkCount: core.length, sourcePackId: fixture.baseline.sourcePackId };
}

function assertClassicCatalog(raw: RawToolResult, fixture: AuditFixture): ObjectRecord {
  const output = structured(raw, 'classic-text list works'); const catalog = object(output.catalog);
  const works = array(catalog?.works, 'classic-text catalog works').map(object);
  assert(output.schemaVersion === '2' && output.kind === 'classic_text_lookup' && output.mode === 'list_works'
    && catalog?.coverage === 'complete_local_work_inventory' && catalog.delivery === 'metadata_summary'
    && works.length === fixture.baseline.expectedCatalogIdentity.workCount && works.every(Boolean), 'classic-text reviewed registration inventory drifted');
  const ids = works.map(work => requireString(work!.id, 'classic-text catalog work ID'));
  assert(JSON.stringify(ids.slice().sort()) === JSON.stringify(expectedResourceUris(fixture).filter(uri => uri.startsWith('theologai://documents/'))
    .map(uri => uri.slice('theologai://documents/'.length)).sort()), 'classic-text catalog work identities drifted');
  const core = fixture.probes.map(probe => works.find(work => work?.id === probe.workId));
  assert(core.every(Boolean) && core.every(work => work!.deliveryMode === 'sectioned_only'), 'classic-text reviewed sectioned registrations drifted');
  assert(works.filter(work => work!.deliveryMode === 'complete_document').length === LEGACY_WORK_IDS.length, 'classic-text legacy registrations drifted');
  return { workCount: works.length, reviewedSectionedWorkCount: core.length, legacyCompleteWorkCount: LEGACY_WORK_IDS.length };
}

function structured(raw: RawToolResult, label: string): ObjectRecord {
  assert(!raw.isError && raw.structuredContent !== undefined, `${label} must succeed with structured content`);
  return raw.structuredContent;
}

function assertClassicLanding(
  raw: RawToolResult,
  probe: AuditFixture['probes'][number],
  directLandingResourceBytes?: number,
): ObjectRecord {
  const { workId } = probe;
  const output = structured(raw, `${workId} landing`); const landing = object(output.landing); const work = object(landing?.work);
  const policy = object(output.evidencePolicy);
  assert(output.schemaVersion === '2' && output.kind === 'classic_text_lookup' && output.mode === 'landing'
    && work?.id === workId && work.deliveryMode === 'sectioned_only' && landing?.bodyDelivery === 'exact_section_resource_only'
    && object(landing?.browse)?.pageSize === 32 && policy?.providerScope === 'local_only' && policy.remoteDocumentBodies === 'disabled'
    && policy.selectedContentAccess === 'mcp_resource_read', `${workId} sectioned landing/privacy contract drifted`);
  const locator = object(work.resource);
  const resourceSizeBytes = locator?.resourceSizeBytes;
  assert(locator?.kind === 'mcp_resource' && locator.uri === probe.landingResourceUri
    && typeof resourceSizeBytes === 'number' && Number.isSafeInteger(resourceSizeBytes) && resourceSizeBytes > 0
    && resourceSizeBytes <= HISTORICAL_SECTIONED_ONLY_LANDING_MAX_BYTES,
  `${workId} landing canonical locator/byte contract drifted`);
  assert(directLandingResourceBytes === undefined || resourceSizeBytes === directLandingResourceBytes,
    `${workId} landing resource byte size drifted`);
  assert(landing?.sectionCount === probe.sectionCount, `${workId} exact landing section count drifted`);
  return { sectionCount: probe.sectionCount, canonicalLandingConfirmed: true };
}

function assertClassicDirectory(raw: RawToolResult, probe: AuditFixture['probes'][number]): ObjectRecord {
  const { workId } = probe;
  const output = structured(raw, `${workId} browse`); const directory = object(output.directory); const work = object(directory?.work);
  const sections = array(directory?.sections, `${workId} sections`).map(object);
  assert(output.mode === 'browse_sections' && work?.id === workId && directory?.coverage === 'bounded_section_directory'
    && object(directory?.pagination)?.pageSize === 32 && sections.length > 0 && sections.length <= 32 && sections.every(Boolean), `${workId} bounded directory contract drifted`);
  for (const section of sections) {
    const locator = object(section!.resource);
    assert(Number.isSafeInteger(section!.sourceOrdinal) && (section!.sourceOrdinal as number) >= 1 && typeof section!.sectionKey === 'string'
      && locator?.kind === 'mcp_resource' && typeof locator.uri === 'string', `${workId} directory exact-section locator drifted`);
  }
  const first = sections[0]!;
  const firstResource = object(first.resource);
  assert(first.sectionKey === probe.firstSection.sectionKey && first.sourceOrdinal === probe.firstSection.sourceOrdinal
    && firstResource?.uri === probe.firstSection.resourceUri, `${workId} first canonical section locator drifted`);
  return { firstPageEntryCount: sections.length, pageSize: 32 };
}

function assertDirectLandingResource(message: ObjectRecord, probe: AuditFixture['probes'][number]): number {
  const text = contentText(message, probe.landingResourceUri, 'text/markdown', `${probe.workId} direct landing resource`);
  const bytes = utf8Bytes(text);
  assert(text.length > 0 && bytes <= HISTORICAL_SECTIONED_ONLY_LANDING_MAX_BYTES
    && !/data:(?:image|application)\//iu.test(text) && !/<img\b|<!doctype\b|\.(?:jpe?g|png|gif|webp|pdf)\b/iu.test(text),
  `${probe.workId} direct landing resource is not bounded normalized metadata`);
  return bytes;
}

function assertClassicSearch(raw: RawToolResult, workId: string): ObjectRecord {
  const output = structured(raw, `${workId} classic search`); const search = object(output.search);
  const hits = array(search?.hits, `${workId} classic hits`).map(object);
  assert(output.mode === 'search' && search?.status === 'ok' && hits.length > 0 && hits.every(Boolean)
    && hits.some(hit => object(hit!.work)?.id === workId) && hits.every(hit => hit!.snippetOnly === true), `${workId} natural classic-text probe drifted`);
  return { returnedHitCount: hits.length, matchingWorkObserved: true, snippetsDiscoveryOnly: true };
}

function assertPrimarySearch(raw: RawToolResult, probe: AuditFixture['probes'][number]): { uri: string; evidence: ObjectRecord } {
  const { workId } = probe;
  const output = structured(raw, `${workId} primary search`);
  const queries = array(output.queries, `${workId} primary queries`).map(object);
  assert(output.schemaVersion === '7' && output.kind === 'primary_source_search' && output.planStatus === 'complete' && queries.length === 1 && queries[0] !== undefined, `${workId} primary envelope drifted`);
  const providers = array(queries[0]!.providers, `${workId} primary providers`).map(object);
  assert(providers.length === 1 && providers[0]?.provider === 'local' && providers[0]?.status === 'ok' && providers[0]?.searched === true, `${workId} local provider execution drifted`);
  const hits = array(providers[0]!.hits, `${workId} local hits`).map(object);
  const hit = hits[0];
  assert(hit !== undefined, `${workId} natural local query returned no relevance-ranked hit`);
  const locator = object(hit.locator); const readiness = object(hit.editionReadiness);
  assert(locator?.kind === 'mcp_resource' && locator.documentId === workId
    && locator.sectionKey === probe.primarySearch.sectionKey && locator.sourceOrdinal === probe.primarySearch.sourceOrdinal
    && locator.uri === probe.primarySearch.resourceUri
    && readiness?.editionIdentity === 'established' && readiness.normalizedTextRights === 'no_known_conflict', `${workId} primary local evidence identity/readiness drifted`);
  const policy = object(output.evidencePolicy); const coverage = object(output.coverage);
  assert(policy?.snippetUse === 'discovery_only' && policy.localSectionAccess === 'mcp_resource_read'
    && policy.externalSectionAccess === 'direct_url_only' && coverage?.localAttempted === true && coverage.localHitCount >= 1, `${workId} primary evidence policy drifted`);
  return { uri: locator.uri as string, evidence: { localHitCount: coverage.localHitCount, exactWorkObserved: true, localReadiness: 'established' } };
}

function assertExactSection(message: ObjectRecord, expectedUri: string, workId: string): ObjectRecord {
  const text = contentText(message, expectedUri, 'text/markdown', `${workId} exact section`);
  assert(text.length > 0 && !/data:(?:image|application)\//iu.test(text) && !/<img\b|<!doctype\b|\.(?:jpe?g|png|gif|webp|pdf)\b/iu.test(text), `${workId} resource must remain normalized text rather than a scan artifact`);
  return { sectionBytes: utf8Bytes(text), normalizedTextOnly: true };
}

function assertLegacyRegression(raw: RawToolResult, fixture: AuditFixture): ObjectRecord {
  const output = structured(raw, 'legacy regression'); const document = object(output.document); const work = object(document?.work);
  assert(output.schemaVersion === '2' && output.mode === 'work' && work?.id === fixture.legacyRegression.workId
    && document?.deliveryMode === fixture.legacyRegression.deliveryMode && document.bodyDelivery === 'markdown_only', 'legacy complete-document behavior regressed');
  return { workId: fixture.legacyRegression.workId, deliveryMode: fixture.legacyRegression.deliveryMode, preserved: true };
}

function assertCcelDisabled(raw: RawToolResult): ObjectRecord {
  assert(raw.isError === true && raw.structuredContent !== undefined, 'CCEL disabled regression must be an errored structured response');
  const output = raw.structuredContent; const queries = array(output.queries, 'CCEL queries').map(object);
  const providers = array(queries[0]?.providers, 'CCEL providers').map(object);
  const provider = providers[0]; const coverage = object(output.coverage);
  assert(output.schemaVersion === '7' && output.kind === 'primary_source_search' && output.planStatus === 'unavailable'
    && queries.length === 1 && providers.length === 1 && provider?.provider === 'ccel_live'
    && provider.status === 'disabled' && provider.searched === false && provider.hitCount === 0 && Array.isArray(provider.hits) && provider.hits.length === 0
    && coverage?.localAttempted === false && coverage.ccelAttempted === false && coverage.ccelStatus === 'disabled' && coverage.ccelHitCount === 0, 'preview CCEL-disabled/local-only execution invariant drifted');
  return { provider: 'ccel_live', status: 'disabled', searched: false, hitCount: 0 };
}

function assertNoSensitiveErrorText(value: string, label: string): void {
  assert(!/https?:\/\/|theologai:\/\/|\b(?:authorization|bearer|api[\s_-]?key|secret|token|password|cookie|sqlite|sql|d1|database|stack|traceback|internal)\b/iu.test(value),
    `${label} error leaked a URI, credential-shaped value, storage detail, stack trace, or secret reflection`);
}

function assertNoSensitiveErrorReflection(value: unknown, label: string, rejectedValues: readonly string[]): void {
  const serialized = JSON.stringify(value);
  assertNoSensitiveErrorText(serialized, label);
  for (const rejected of rejectedValues) {
    assert(!serialized.includes(rejected), `${label} error reflected rejected input`);
  }
}

function assertSafeToolError(raw: RawToolResult, label: string, rejectedValues: readonly string[]): void {
  assert(raw.isError && raw.structuredContent === undefined, `${label} must fail safely without structured output`);
  assert(raw.text.length >= 1, `${label} must return a classified safe error`);
  assertNoSensitiveErrorReflection(raw.raw, label, rejectedValues);
}

function assertResourceNotFound(message: ObjectRecord, expectedUri: string): void {
  const label = 'invalid resource regression';
  assert(message.result === undefined, `${label} must not return result alongside error`);
  const error = object(message.error);
  assert(error !== undefined && JSON.stringify(Object.keys(error).sort()) === JSON.stringify(['code', 'data', 'message']),
    `${label} error envelope keys drifted`);
  assert(error.code === -32002, `${label} must return exact resource-not-found code -32002`);
  const errorMessage = requireString(error.message, `${label} error message`);
  assert(errorMessage === 'Resource not found' || errorMessage === 'MCP error -32002: Resource not found',
    `${label} must return an exact safe resource-not-found message`);
  assertNoSensitiveErrorText(errorMessage, label);
  const data = object(error.data);
  assert(data !== undefined && Object.keys(data).length === 1 && Object.hasOwn(data, 'uri') && data.uri === expectedUri,
    `${label} must return only the requested URI in error data`);
}

function evidenceTextIsSafe(value: unknown): void {
  // This is deliberately an allowlist rather than a blacklist. Any future
  // evidence field must be consciously admitted here before it can reach the
  // retained release artifact.
  const allowedEvidenceFields = new Set([
    'schemaVersion', 'audit', 'endpointClass', 'fixtureSha256', 'durationMs', 'negotiated', 'schemas', 'budgets', 'catalog', 'classicCatalog', 'records', 'regressions',
    'protocolVersion', 'serverName', 'serverVersion',
    'classicTextInputSchemaSha256', 'classicTextOutputSchemaSha256', 'primarySourceInputSchemaSha256', 'primarySourceOutputSchemaSha256',
    'logicalOperations', 'maximumLogicalOperations', 'httpExchanges', 'maximumHttpExchanges', 'retryCount', 'perRequestMaximumDurationMs', 'maximumDurationMs', 'maximumMcpResponseBytes', 'aggregateMcpResponseBytes', 'maximumAggregateMcpResponseBytes',
    'workCount', 'legacyWorkCount', 'coreWorkCount', 'sourcePackId', 'coreSectionCount', 'reviewedSectionedWorkCount', 'legacyCompleteWorkCount',
    'workId', 'editionId', 'passed', 'landing', 'directory', 'classicSearch', 'primary', 'section',
    'sectionCount', 'canonicalLandingConfirmed', 'firstPageEntryCount', 'pageSize', 'returnedHitCount', 'matchingWorkObserved', 'snippetsDiscoveryOnly',
    'localHitCount', 'exactWorkObserved', 'localReadiness', 'sectionBytes', 'normalizedTextOnly',
    'legacy', 'ccel', 'invalidResourceRejected', 'invalidCursorRejected', 'deliveryMode', 'preserved', 'provider', 'status', 'searched', 'hitCount',
  ]);
  const visit = (input: unknown): void => {
    if (typeof input === 'string') {
      assert(!/https?:\/\/|theologai:\/\/|\b(?:authorization|bearer|api[\s_-]?key|secret|token|password|cookie|sqlite|sql|d1|database|stack|traceback)\b/iu.test(input),
        'sanitized historical evidence leaked a URI, credential-shaped value, storage detail, stack trace, or secret reflection');
      return;
    }
    if (Array.isArray(input)) { input.forEach(visit); return; }
    const record = object(input); if (!record) return;
    for (const [key, item] of Object.entries(record)) {
      assert(allowedEvidenceFields.has(key), `sanitized historical evidence leaked unreviewed ${key} field`);
      visit(item);
    }
  };
  visit(value);
}

export async function runHistoricalCoreAudit(
  fixture: AuditFixture,
  profile: HistoricalCoreAuditProfile,
  fetchImpl: FetchLike = fetch,
  deadline = new AuditDeadline(),
): Promise<ObjectRecord> {
  validateFixture(fixture);
  deadline.assertRemaining('fixed fixture preflight');
  const client = new FixedPreviewMcp(fetchImpl, deadline, profile);
  const negotiated = assertInitialize(await client.initialize(), profile);
  await client.initialized();
  const schemas = assertToolRegistration(await client.toolsList());
  assertPrompts(await client.promptsList());
  assertResources(await client.resourcesList(), fixture);
  assertResourceTemplates(await client.resourceTemplatesList());
  assertPrimarySourceResearchPrompt(await client.getPrompt('primary-source-research', {
    topic: 'eucharist', authors: 'Erasmus of Rotterdam,Martin Luther', startYear: '500', endYear: '1500', maxSections: '2',
  }));
  assertConfessionStudyPrompt(await client.getPrompt('confession-study', { topic: 'justification' }));
  const catalog = assertCatalog(await client.readResource('theologai://primary-sources/catalog'), fixture);
  const classicCatalog = assertClassicCatalog(await client.callTool('classic_text_lookup', { listWorks: true }), fixture);
  const directLandingResourceBytes = assertDirectLandingResource(
    await client.readResource(fixture.probes[0].landingResourceUri), fixture.probes[0],
  );
  const records: ObjectRecord[] = [];
  let observedCoreSectionCount = 0;
  for (const [index, probe] of fixture.probes.entries()) {
    const started = Date.now();
    const landing = assertClassicLanding(await client.callTool('classic_text_lookup', { work: probe.workId }), probe,
      index === 0 ? directLandingResourceBytes : undefined);
    observedCoreSectionCount += probe.sectionCount;
    const directory = assertClassicDirectory(await client.callTool('classic_text_lookup', { work: probe.workId, browseSections: true }), probe);
    const classicSearch = assertClassicSearch(await client.callTool('classic_text_lookup', { query: probe.query }), probe.workId);
    const primary = assertPrimarySearch(await client.callTool('primary_source_search', { queries: [{
      id: `core-${probe.workId}`, text: probe.query, providers: ['local'], work: probe.workId, match: 'all_terms', selection: 'relevance', limit: 5,
    }] }), probe);
    const section = assertExactSection(await client.readResource(primary.uri), primary.uri, probe.workId);
    records.push({ workId: probe.workId, editionId: probe.editionId, passed: true, durationMs: Date.now() - started, landing, directory, classicSearch, primary: primary.evidence, section });
  }
  assert(observedCoreSectionCount === fixture.baseline.expectedCatalogIdentity.coreSectionCount, 'reviewed core section-count identity drifted');
  const legacy = assertLegacyRegression(await client.callTool('classic_text_lookup', { work: fixture.legacyRegression.workId }), fixture);
  const ccel = assertCcelDisabled(await client.callTool('primary_source_search', { queries: [{ id: 'ccel-disabled', text: 'Lord Supper', providers: ['ccel'], match: 'all_terms', selection: 'relevance', limit: 1 }] }));
  const invalidResourceUri = 'theologai://documents/does-not-exist#section-not-real';
  assertResourceNotFound(await client.readResource(invalidResourceUri), invalidResourceUri);
  const invalidCursor = 'not-a-valid-cursor';
  assertSafeToolError(await client.callTool('classic_text_lookup', { work: fixture.probes[0].workId, browseSections: true, cursor: invalidCursor }), 'invalid cursor regression', [invalidCursor]);
  client.complete();
  deadline.assertRemaining('evidence construction');
  const evidence = {
    schemaVersion: 1, audit: profile.audit, endpointClass: profile.endpointClass,
    fixtureSha256: sha256(await readFile(FIXTURE_PATH, 'utf8')), durationMs: deadline.elapsed(),
    negotiated, schemas,
    budgets: {
      logicalOperations: client.counters.logical, maximumLogicalOperations: MAX_LOGICAL_OPERATIONS,
      httpExchanges: client.counters.http, maximumHttpExchanges: MAX_HTTP_EXCHANGES, retryCount: 0,
      perRequestMaximumDurationMs: MAX_REQUEST_DURATION_MS, maximumDurationMs: MAX_DURATION_MS,
      maximumMcpResponseBytes: MAX_MCP_RESPONSE_BYTES, aggregateMcpResponseBytes: client.aggregateResponseBytes(),
      maximumAggregateMcpResponseBytes: MAX_AGGREGATE_MCP_RESPONSE_BYTES,
    },
    catalog: { ...catalog, coreSectionCount: observedCoreSectionCount },
    classicCatalog,
    records,
    regressions: { legacy, ccel, invalidResourceRejected: true, invalidCursorRejected: true },
  };
  evidenceTextIsSafe(evidence);
  assert(utf8Bytes(JSON.stringify(evidence)) <= MAX_EVIDENCE_BYTES, 'sanitized historical evidence exceeds 256 KiB ceiling');
  deadline.assertRemaining('evidence construction');
  return evidence;
}

export async function runPreviewAudit(
  fixture: AuditFixture,
  fetchImpl: FetchLike = fetch,
  deadline = new AuditDeadline(),
): Promise<ObjectRecord> {
  return runHistoricalCoreAudit(fixture, PREVIEW_PROFILE, fetchImpl, deadline);
}

export async function runProductionAudit(
  fixture: AuditFixture,
  fetchImpl: FetchLike = fetch,
  deadline = new AuditDeadline(),
): Promise<ObjectRecord> {
  return runHistoricalCoreAudit(fixture, PRODUCTION_PROFILE, fetchImpl, deadline);
}

async function assertOutputAbsent(output: string): Promise<void> {
  try {
    await lstat(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  fail('historical preview audit output violates no-clobber policy: destination already exists');
}

/**
 * `link` is an atomic create-only publication on the same filesystem. A
 * checked output may race into existence after preflight, but it can never be
 * replaced by this auditor. The temporary directory is owned solely by this
 * invocation and is always removed after the link attempt. If the shared
 * deadline expires immediately after publication, the final link is removed
 * only after its inode is proven to still be that invocation's staged file.
 */
export async function publishAuditEvidence(
  output: string,
  evidence: ObjectRecord,
  deadline: AuditDeadline,
): Promise<void> {
  const parent = dirname(output);
  deadline.assertRemaining('evidence publication preflight');
  await mkdir(parent, { recursive: true });
  deadline.assertRemaining('evidence publication staging');
  const temporaryRoot = await mkdtemp(join(parent, `.${basename(output)}.historical-core-preview-audit-`));
  const staged = join(temporaryRoot, 'evidence.json');
  try {
    await writeFile(staged, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    deadline.assertRemaining('true no-clobber evidence publication');
    try {
      await link(staged, output);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        fail('historical preview audit output violates no-clobber policy: destination appeared during audit');
      }
      throw error;
    }
    try {
      deadline.assertRemaining('true no-clobber evidence publication finalization');
    } catch (error) {
      await removeInvocationFinalLink(output, staged);
      throw error;
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

/** Never delete a post-publication path unless it is still our hard link. */
async function removeInvocationFinalLink(output: string, staged: string): Promise<void> {
  let published: import('node:fs').Stats;
  try {
    published = await lstat(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const source = await lstat(staged);
  assert(published.isFile() && source.isFile() && published.dev === source.dev && published.ino === source.ino,
    'historical preview audit cannot safely remove a post-expiry output that is no longer its final link');
  await unlink(output);
}

export interface AuditCliDependencies {
  now?: () => number;
  runAudit?: (fixture: AuditFixture, deadline: AuditDeadline) => Promise<ObjectRecord>;
}

export async function runHistoricalCoreAuditCli(
  args: string[],
  profile: HistoricalCoreAuditProfile,
  dependencies: AuditCliDependencies = {},
): Promise<{ output: string; evidence: ObjectRecord; probeCount: number }> {
  const deadline = new AuditDeadline(dependencies.now);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--output' && typeof args[1] === 'string' && args[1].length > 0), `usage: audit:historical-core-${profile.label} [--output path]`);
  const output = resolve(args.length === 0 ? `test-output/historical-core-${profile.label}-audit-${new Date().toISOString().replaceAll(':', '-')}.json` : args[1]!);
  deadline.assertRemaining('fixed output preflight');
  await assertOutputAbsent(output);
  deadline.assertRemaining('fixed fixture preflight');
  const fixture = validateFixture(JSON.parse(await readFile(FIXTURE_PATH, 'utf8')));
  deadline.assertRemaining('fixed fixture preflight');
  const evidence = await (dependencies.runAudit === undefined
    ? runHistoricalCoreAudit(fixture, profile, fetch, deadline)
    : dependencies.runAudit(fixture, deadline));
  deadline.assertRemaining('evidence publication preflight');
  await publishAuditEvidence(output, evidence, deadline);
  return { output, evidence, probeCount: fixture.probes.length };
}

export async function runAuditCli(args: string[], dependencies: AuditCliDependencies = {}): Promise<{ output: string; evidence: ObjectRecord; probeCount: number }> {
  return runHistoricalCoreAuditCli(args, PREVIEW_PROFILE, dependencies);
}

async function main(): Promise<void> {
  const { output, probeCount } = await runAuditCli(process.argv.slice(2));
  console.log(`PASS: ${probeCount} reviewed core historical works; evidence: ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
