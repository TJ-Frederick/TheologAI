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
import { buildLocalDocumentResourceUri } from '../src/kernel/documentResource.js';
import { classicTextsOutputSchema } from '../src/mcp/schemas/classicTexts.js';
import { primarySourceSearchV6OutputSchema, primarySourceSearchV7OutputSchema } from '../src/mcp/schemas/primarySourceSearchV4.js';
import { createPrimarySourceSearchHandler } from '../src/tools/v2/primarySourceSearch.js';

const PREVIEW_ENDPOINT = 'https://preview-mcp.theologai.xyz/mcp';
const PRODUCTION_ENDPOINT = 'https://mcp.theologai.xyz/mcp';

/**
 * The Transform-9 fixture is shared, but primary-source search has two
 * intentionally different public contracts. Keep every difference explicit
 * here so an audit cannot accidentally project the preview discovery shape on
 * to the production local-only release (or vice versa).
 */
type PrimarySourceAuditContract = Readonly<{
  contractVersion: '6' | '7';
  schemaVersion: '6' | '7';
  openWorldHint: boolean;
  inputPropertyOrder: readonly string[];
  providerEnum?: readonly ('local' | 'ccel')[];
  providerMaximum?: 1 | 2;
  searchDepthEnum?: readonly ('standard' | 'expanded')[];
  expandedLimitMaximum?: number;
  inputSchema: ObjectRecord;
  outputSchema: ObjectRecord;
  inputSchemaSha256: string;
  outputSchemaSha256: string;
  primarySourceResearchPrompt: Readonly<{ required: readonly string[]; absent: readonly string[] }>;
  confessionStudyPrompt: Readonly<{ required: readonly string[]; absent: readonly string[] }>;
  /** Preview keeps a catalog result plus a disabled external group; production rejects external input. */
  externalDiscoveryBoundary: 'catalog_plus_disabled_expansion' | 'rejected_at_input_schema';
}>;

function primaryInputSchemaFor(contractVersion: '6' | '7'): ObjectRecord {
  const contract = contractVersion === '7'
    ? { exposeCcelDiscovery: true, ccelLiveSearch: false, ccelCoordinator: false, contractVersion: '7' as const, liveCcelEnabled: false }
    : { exposeCcelDiscovery: false, ccelLiveSearch: false, ccelCoordinator: false, contractVersion: '6' as const, liveCcelEnabled: false };
  const schema = createPrimarySourceSearchHandler({} as never, contract).inputSchema;
  const record = schema !== null && typeof schema === 'object' && !Array.isArray(schema) ? schema as ObjectRecord : undefined;
  if (!record) throw new Error(`primary-source v${contractVersion} input schema is not an object`);
  return record;
}

const PRIMARY_SOURCE_V7_AUDIT_CONTRACT: PrimarySourceAuditContract = {
  contractVersion: '7', schemaVersion: '7', openWorldHint: true,
  inputPropertyOrder: ['id', 'text', 'searchDepth', 'expandedLimit', 'match', 'selection', 'author', 'work', 'startYear', 'endYear', 'page', 'limit'],
  searchDepthEnum: ['standard', 'expanded'], expandedLimitMaximum: 5,
  inputSchema: primaryInputSchemaFor('7'), outputSchema: primarySourceSearchV7OutputSchema as ObjectRecord,
  inputSchemaSha256: '14a5a782e951fc0814092e90f0e1b78ab955cbb42a4242e818c0c03e188b47a5',
  outputSchemaSha256: '005977f15f3db2d661314055f61ee61d27aee1ae153c86f3a844d199bb477cef',
  primarySourceResearchPrompt: {
    required: [
      'Inspect catalog scope', 'Run one provider-neutral search plan',
      '"searchDepth":"expanded"', '"searchDepth":"standard"',
      'At most one query may be expanded per call.',
      'Expanded discovery deliberately omits the requested catalog composition-year bounds; any returned broader hit cannot establish membership in that requested range.',
      'Use MCP `resources/read` for `mcp_resource` URIs.',
      'Open external `external_url` pages directly', 'name disabled, unavailable, or unsupported searches',
    ],
    absent: [
      'This workflow is local-only', 'Use the v6 structured result',
      'This workflow supports a topic survey', '"providers"',
    ],
  },
  confessionStudyPrompt: {
    required: [
      'provider-neutral expanded depth', 'For an `external_url` locator',
      'it is not an MCP resource', 'rights status is not determined',
      'Name any disabled, unavailable, or unsupported provider',
    ],
    absent: ['Run bounded local discovery', 'canonical `resource_link` blocks', '"providers"'],
  },
  externalDiscoveryBoundary: 'catalog_plus_disabled_expansion',
};

const PRIMARY_SOURCE_V6_AUDIT_CONTRACT: PrimarySourceAuditContract = {
  contractVersion: '6', schemaVersion: '6', openWorldHint: false,
  inputPropertyOrder: ['id', 'text', 'providers', 'match', 'selection', 'author', 'work', 'startYear', 'endYear', 'page', 'limit'],
  providerEnum: ['local'], providerMaximum: 1,
  inputSchema: primaryInputSchemaFor('6'), outputSchema: primarySourceSearchV6OutputSchema as ObjectRecord,
  inputSchemaSha256: '37849624bac2e884106050fcff39851e40cac31969b4f7511f516f78348fea87',
  outputSchemaSha256: '25758f8d06c43c3f2961fa7b35ba1d62a548df923589b391c65204813a6511b8',
  primarySourceResearchPrompt: {
    required: [
      'Run bounded discovery', 'This workflow is local-only', 'Use the v6 structured result',
      'exact MCP resource', 'This workflow supports a topic survey',
    ],
    absent: [
      'Search one external scope now', 'Use the v7 contract', '"providers":["ccel"]',
      'This prompt authorizes at most one CCEL-bearing call.', 'external `external_url` pages',
    ],
  },
  confessionStudyPrompt: {
    required: [
      'Run bounded local discovery', 'hosted collection', 'canonical `resource_link` blocks', 'resources/read',
    ],
    absent: [
      '"providers":["local","ccel"]', 'external `external_url` locator',
      'rights status is not determined', 'Name any disabled, unavailable, or unsupported provider',
    ],
  },
  externalDiscoveryBoundary: 'rejected_at_input_schema',
};

export type HistoricalCoreAuditProfile = {
  endpoint: string;
  hostname: string;
  serverVersion: string;
  audit: 'historical-core-preview' | 'historical-core-production';
  endpointClass: 'preview-custom' | 'production-custom';
  label: 'preview' | 'production';
  primarySource: PrimarySourceAuditContract;
};
export const PREVIEW_PROFILE: HistoricalCoreAuditProfile = {
  endpoint: PREVIEW_ENDPOINT, hostname: 'preview-mcp.theologai.xyz', serverVersion: '3.6.0-preview',
  audit: 'historical-core-preview', endpointClass: 'preview-custom', label: 'preview', primarySource: PRIMARY_SOURCE_V7_AUDIT_CONTRACT,
};
export const PRODUCTION_PROFILE: HistoricalCoreAuditProfile = {
  endpoint: PRODUCTION_ENDPOINT, hostname: 'mcp.theologai.xyz', serverVersion: '3.6.0',
  audit: 'historical-core-production', endpointClass: 'production-custom', label: 'production', primarySource: PRIMARY_SOURCE_V6_AUDIT_CONTRACT,
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
const TRANSFORM11_WORK_IDS = [
  'augustine-on-christian-doctrine',
  'basil-on-the-holy-spirit',
  'gregory-nazianzen-five-theological-orations',
  'gregory-nyssa-great-catechism',
  'justin-martyr-apologies',
  'origen-de-principiis',
  'hooker-laws-of-ecclesiastical-polity-book-1',
  'julian-revelations-of-divine-love',
  'kempis-imitation-of-christ',
  'pascal-pensees',
] as const;
const EXPECTED_CLASSIC_INPUT_SCHEMA_SHA256 = '45124e704b5e0009b5bc3672c52b0d7ed6e8193063b621a7ccf766d1d2ad00d4';
const EXPECTED_CLASSIC_OUTPUT_SCHEMA_SHA256 = 'b8a6af9dff44cf8ad9d964661ca76cbe4ab9bcbdc97d9aca85df4edea73a9a7c';

const EXPECTED_FIXTURE = {
  schemaVersion: 1,
  kind: 'historical-core-preview-audit-fixture',
  baseline: {
    manifestSchemaVersion: '0006_historical_source_packs',
    d1TransformVersion: 9,
    expectedCatalogIdentity: { workCount: 35, legacyWorkCount: 17, coreWorkCount: 8, coreSectionCount: 512 },
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
/** Exact release resource identity shared with the pre-audit edge-convergence gate. */
export const HISTORICAL_CORE_EXPECTED_RESOURCE_URIS = Object.freeze(
  expectedResourceUris(EXPECTED_FIXTURE),
);
type FetchLike = typeof fetch;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type ObjectRecord = Record<string, unknown>;
type RawToolResult = { isError: boolean; structuredContent?: ObjectRecord; text: string[]; raw: ObjectRecord };
type RequestCounters = { logical: number; http: number };

/** One budget owns preflight, transport, evidence construction, and publication. */
export class AuditDeadline {
  private profileLabel: HistoricalCoreAuditProfile['label'] | 'release' = 'release';
  constructor(private readonly now: () => number = Date.now, private readonly startedAt = now()) {}

  setProfile(profile: HistoricalCoreAuditProfile): void { this.profileLabel = profile.label; }

  remaining(label: string): number {
    const remaining = MAX_DURATION_MS - (this.now() - this.startedAt);
    assert(remaining > 0, `historical ${this.profileLabel} audit exceeded its 300-second total deadline during ${label}`);
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
  assert(canonicalJson(value) === canonicalJson(EXPECTED_FIXTURE), 'historical core fixture identity or probe inventory drifted');
  return structuredClone(EXPECTED_FIXTURE);
}

class FixedAuditMcp {
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
      assert(this.counters.logical <= MAX_LOGICAL_OPERATIONS, `historical ${this.profile.label} audit logical-operation budget exceeded`);
    }
    this.counters.http += 1;
    assert(this.counters.http <= MAX_HTTP_EXCHANGES, `historical ${this.profile.label} audit HTTP-exchange budget exceeded`);
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
        fail(`historical ${this.profile.label} audit stopped at HTTP 429 during ${label}`);
      }
      if (response.status < 200 || response.status >= 300) {
        await abortAndCancel(response, controller);
        fail(`historical ${this.profile.label} audit received non-success HTTP status during ${label}`);
      }
      const body = await readBoundedResponseBody(response, controller, label);
      this.responseBytes += utf8Bytes(body);
      assert(this.responseBytes <= MAX_AGGREGATE_MCP_RESPONSE_BYTES,
        `historical ${this.profile.label} audit aggregate response budget exceeded (${MAX_AGGREGATE_MCP_RESPONSE_BYTES} bytes)`);
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
    assert(this.counters.logical === MAX_LOGICAL_OPERATIONS, `historical ${this.profile.label} logical inventory drifted: ${this.counters.logical}/${MAX_LOGICAL_OPERATIONS}`);
    assert(this.counters.http === MAX_HTTP_EXCHANGES, `historical ${this.profile.label} HTTP inventory drifted: ${this.counters.http}/${MAX_HTTP_EXCHANGES}`);
    assert(this.responseBytes <= MAX_AGGREGATE_MCP_RESPONSE_BYTES, `historical ${this.profile.label} aggregate response budget drifted`);
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

function assertToolRegistration(message: ObjectRecord, profile: HistoricalCoreAuditProfile): ObjectRecord {
  const listed = array(result(message, 'tools/list').tools, 'tools/list.tools').map(object);
  assert(listed.every(Boolean) && JSON.stringify(listed.map(tool => tool!.name)) === JSON.stringify(TOOL_NAMES), 'exact 11-tool registration/order drifted');
  for (const tool of listed) {
    const annotations = object(tool!.annotations);
    assert(annotations?.readOnlyHint === true && annotations.destructiveHint === false && annotations.idempotentHint === true, `${tool!.name} annotations drifted`);
    const expectedOpenWorld = tool!.name === 'primary_source_search' ? profile.primarySource.openWorldHint : tool!.name === 'classic_text_lookup' ? false : undefined;
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
    && JSON.stringify(Object.keys(properties ?? {})) === JSON.stringify(profile.primarySource.inputPropertyOrder), 'primary-source input contract drifted');
  if (profile.primarySource.contractVersion === '7') {
    const searchDepth = object(properties?.searchDepth); const expandedLimit = object(properties?.expandedLimit);
    const page = object(properties?.page);
    const allOf = queryItem?.allOf;
    assert(JSON.stringify(queryItem?.required) === JSON.stringify(['id', 'text']) && !Object.hasOwn(properties ?? {}, 'providers')
      && JSON.stringify(searchDepth?.enum) === JSON.stringify(profile.primarySource.searchDepthEnum)
      && searchDepth?.default === 'standard'
      && expandedLimit?.minimum === 1 && expandedLimit?.maximum === profile.primarySource.expandedLimitMaximum && expandedLimit?.default === 3
      && page?.const === 1 && page?.default === 1
      && Array.isArray(allOf) && allOf.length === 2, 'primary-source expanded-depth contract drifted');
  } else {
    const providers = object(properties?.providers); const providerItems = object(providers?.items);
    assert(JSON.stringify(queryItem?.required) === JSON.stringify(['id', 'text', 'providers'])
      && providers?.minItems === 1 && providers?.maxItems === profile.primarySource.providerMaximum
      && JSON.stringify(providerItems?.enum) === JSON.stringify(profile.primarySource.providerEnum), 'primary-source provider contract drifted');
  }
  assert(canonicalJson(primaryInput) === canonicalJson(profile.primarySource.inputSchema), 'advertised primary-source input schema differs from the checked-out contract');
  assert(sha256(canonicalJson(profile.primarySource.inputSchema)) === profile.primarySource.inputSchemaSha256
    && sha256(canonicalJson(primaryInput)) === profile.primarySource.inputSchemaSha256, 'primary-source input schema hash drifted');
  assert(canonicalJson(primaryOutput) === canonicalJson(profile.primarySource.outputSchema), 'advertised primary-source output schema differs from the checked-out contract');
  assert(sha256(canonicalJson(profile.primarySource.outputSchema)) === profile.primarySource.outputSchemaSha256
    && sha256(canonicalJson(primaryOutput)) === profile.primarySource.outputSchemaSha256, 'primary-source output schema hash drifted');
  return {
    classicTextInputSchemaSha256: EXPECTED_CLASSIC_INPUT_SCHEMA_SHA256,
    classicTextOutputSchemaSha256: EXPECTED_CLASSIC_OUTPUT_SCHEMA_SHA256,
    primarySourceContractVersion: profile.primarySource.contractVersion,
    primarySourceOpenWorldHint: profile.primarySource.openWorldHint,
    ...(profile.primarySource.providerMaximum === undefined ? {} : { primarySourceProviderMaximum: profile.primarySource.providerMaximum }),
    primarySourceExternalDiscoveryBoundary: profile.primarySource.externalDiscoveryBoundary,
    primarySourceInputSchemaSha256: profile.primarySource.inputSchemaSha256,
    primarySourceOutputSchemaSha256: profile.primarySource.outputSchemaSha256,
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

function assertPromptContract(
  message: ObjectRecord,
  label: string,
  expected: PrimarySourceAuditContract['primarySourceResearchPrompt'],
  profile: HistoricalCoreAuditProfile,
): void {
  const text = promptText(message, label);
  for (const required of expected.required) {
    assert(text.includes(required), `${profile.label} ${label} required behavior drifted`);
  }
  for (const absent of expected.absent) {
    assert(!text.includes(absent), `${profile.label} ${label} local-only boundary drifted`);
  }
}

function assertPrimarySourceResearchPrompt(message: ObjectRecord, profile: HistoricalCoreAuditProfile): void {
  assertPromptContract(message, 'primary-source-research prompt', profile.primarySource.primarySourceResearchPrompt, profile);
}

function assertConfessionStudyPrompt(message: ObjectRecord, profile: HistoricalCoreAuditProfile): void {
  assertPromptContract(message, 'confession-study prompt', profile.primarySource.confessionStudyPrompt, profile);
}

function expectedResourceUris(fixture: AuditFixture): string[] {
  return [
    'theologai://translations', 'theologai://commentaries', 'theologai://primary-sources/catalog',
    ...LEGACY_WORK_IDS.map(id => `theologai://documents/${id}`),
    ...fixture.probes.map(probe => probe.landingResourceUri),
    ...TRANSFORM11_WORK_IDS.map(id => `theologai://documents/${id}`),
  ].sort();
}

function assertResources(message: ObjectRecord, fixture: AuditFixture): void {
  const resources = array(result(message, 'resources/list').resources, 'resources/list.resources').map(object);
  assert(resources.length === HISTORICAL_CORE_EXPECTED_RESOURCE_URIS.length && resources.every(Boolean),
    `resources/list must expose exactly ${HISTORICAL_CORE_EXPECTED_RESOURCE_URIS.length} resources`);
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
  const transform11 = TRANSFORM11_WORK_IDS.map(id => works.find(work => work?.id === id));
  assert(core.every(Boolean) && transform11.every(Boolean)
    && works.length === LEGACY_WORK_IDS.length + core.length + transform11.length,
  'catalog no longer has the exact 35=17+8+10 historical identity');
  for (const [index, work] of core.entries()) {
    const probe = fixture.probes[index]!;
    const provenance = object(work!.editionProvenance); const readiness = object(work!.editionReadiness);
    assert(provenance?.sourcePackId === fixture.baseline.sourcePackId && provenance.editionId === probe.editionId, `${probe.workId} source-pack provenance drifted`);
    assert(readiness?.editionIdentity === 'established'
      && readiness.provenance === fixture.baseline.expectedCoreEditionProvenanceStatus
      && readiness.normalizedTextRights === 'no_known_conflict', `${probe.workId} edition readiness drifted`);
  }
  for (const [index, work] of transform11.entries()) {
    const readiness = object(work!.editionReadiness);
    assert(readiness?.editionIdentity === 'established'
      && readiness.provenance === fixture.baseline.expectedCoreEditionProvenanceStatus
      && readiness.normalizedTextRights === 'no_known_conflict',
    `${TRANSFORM11_WORK_IDS[index]} Transform 11 edition readiness drifted`);
  }
  const policies = object(catalog.policies);
  assert(policies?.scope === 'hosted_collection_only' && policies.editionProvenance === 'mixed_legacy_and_reviewed_source_packs'
    && policies.rightsStatus === 'mixed_not_established_and_no_known_conflict', 'catalog mixed-inventory provenance policy drifted');
  return {
    workCount: works.length,
    legacyWorkCount: LEGACY_WORK_IDS.length,
    coreWorkCount: core.length,
    sourcePackId: fixture.baseline.sourcePackId,
  };
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

function assertPrimarySearch(
  raw: RawToolResult,
  probe: AuditFixture['probes'][number],
  profile: HistoricalCoreAuditProfile,
): { uri: string; evidence: ObjectRecord } {
  const { workId } = probe;
  const output = structured(raw, `${workId} primary search`);
  const queries = array(output.queries, `${workId} primary queries`).map(object);
  assert(output.schemaVersion === profile.primarySource.schemaVersion && output.kind === 'primary_source_search'
    && output.planStatus === 'complete' && queries.length === 1 && queries[0] !== undefined,
  `${workId} primary v${profile.primarySource.contractVersion} envelope drifted`);
  const responseWindow = object(output.responseWindow);
  assert(responseWindow?.unit === 'utf8_bytes' && responseWindow.maximum === 32768 && typeof responseWindow.truncated === 'boolean',
    `${workId} primary response-window evidence drifted`);
  assert(queries[0]!.normalizedMode === 'all_terms' && queries[0]!.normalizedSelection === 'relevance',
    `${workId} primary local query-normalization drifted`);
  const providers = array(queries[0]!.providers, `${workId} primary providers`).map(object);
  assert(providers.length === 1 && providers[0]?.provider === 'local' && providers[0]?.status === 'ok'
    && providers[0]?.searched === true && providers[0]?.page === 1 && Array.isArray(providers[0]?.notices),
  `${workId} local provider execution drifted`);
  const resultWindow = object(providers[0]?.resultWindow);
  assert(resultWindow !== undefined && typeof resultWindow.returnedHitCount === 'number'
    && ['additional_match_observed', 'no_additional_match_observed', 'not_evaluated'].includes(resultWindow.additionalMatchStatus as string),
  `${workId} local provider result-window evidence drifted`);
  const hits = array(providers[0]!.hits, `${workId} local hits`).map(object);
  const hit = hits[0];
  assert(hit !== undefined, `${workId} natural local query returned no relevance-ranked hit`);
  for (const candidate of hits) {
    const candidateLocator = object(candidate?.locator);
    assert(candidate?.provider === 'local' && candidateLocator?.kind === 'mcp_resource'
      && typeof candidateLocator.uri === 'string' && candidateLocator.uri.startsWith('theologai://documents/'),
    `${workId} primary local provider hit-scope drifted`);
    const documentId = candidateLocator.documentId;
    const sectionKey = candidateLocator.sectionKey;
    const canonicalUri = typeof documentId === 'string' && typeof sectionKey === 'string'
      ? buildLocalDocumentResourceUri(documentId, sectionKey)
      : undefined;
    assert(canonicalUri !== undefined && candidateLocator.uri === canonicalUri,
      `${workId} primary local provider canonical locator drifted`);
  }
  const locator = object(hit.locator); const readiness = object(hit.editionReadiness);
  assert(locator?.kind === 'mcp_resource' && locator.documentId === workId
    && locator.sectionKey === probe.primarySearch.sectionKey && locator.sourceOrdinal === probe.primarySearch.sourceOrdinal
    && locator.uri === probe.primarySearch.resourceUri
    && readiness?.editionIdentity === 'established' && readiness.normalizedTextRights === 'no_known_conflict', `${workId} primary local evidence identity/readiness drifted`);
  const policy = object(output.evidencePolicy); const coverage = object(output.coverage);
  const serverObserved = object(coverage?.serverObserved);
  const searched = array(serverObserved?.searched, `${workId} primary searched ledger`).map(object);
  const notSearched = array(serverObserved?.notSearched, `${workId} primary not-searched ledger`).map(object);
  assert(policy?.snippetUse === 'discovery_only' && policy.localSectionAccess === 'mcp_resource_read'
    && policy.coverageScope === 'bounded_non_exhaustive'
    && policy.lookupAliasUse === 'exact_routing_only_not_metadata_evidence'
    && coverage?.localAttempted === true && coverage.localStatus === 'ok'
    && typeof coverage.localHitCount === 'number' && Number.isSafeInteger(coverage.localHitCount) && coverage.localHitCount >= 1
    && Array.isArray(coverage.notices)
    && searched.length === 1 && searched[0]?.provider === 'local' && searched[0]?.status === 'ok'
    && typeof searched[0]?.returnedHitCount === 'number' && notSearched.length === 0,
  `${workId} primary evidence policy drifted`);
  if (profile.primarySource.contractVersion === '7') {
    assert(policy.externalSectionAccess === 'direct_url_only' && policy.externalRightsStatus === 'not_determined'
      && coverage.ccelAttempted === false && coverage.ccelHitCount === 0 && !Object.hasOwn(coverage, 'ccelStatus')
      && searched.every(entry => entry?.provider === 'local') && notSearched.every(entry => entry?.provider === 'local'),
    `${workId} preview external-discovery evidence boundary drifted`);
  } else {
    assert(!Object.hasOwn(policy, 'externalSectionAccess') && !Object.hasOwn(policy, 'externalRightsStatus')
      && !Object.hasOwn(coverage, 'ccelAttempted') && !Object.hasOwn(coverage, 'ccelHitCount') && !Object.hasOwn(coverage, 'ccelStatus')
      && searched.every(entry => entry?.provider === 'local') && notSearched.every(entry => entry?.provider === 'local'),
    `${workId} production local-only evidence boundary drifted`);
  }
  return {
    uri: locator.uri as string,
    evidence: {
      localHitCount: coverage.localHitCount as number,
      exactWorkObserved: true,
      localReadiness: 'established',
      primarySourceContractVersion: profile.primarySource.contractVersion,
    },
  };
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

function assertExpandedDiscoveryDisabled(raw: RawToolResult, profile: HistoricalCoreAuditProfile): ObjectRecord {
  assert(raw.isError === false && raw.structuredContent !== undefined,
    'expanded discovery disabled regression must preserve a successful catalog result and structured diagnostic');
  const output = raw.structuredContent; const queries = array(output.queries, 'expanded-discovery queries').map(object);
  const providers = array(queries[0]?.providers, 'expanded-discovery providers').map(object);
  const local = providers[0]; const external = providers[1]; const coverage = object(output.coverage);
  assert(output.schemaVersion === '7' && output.kind === 'primary_source_search' && output.planStatus === 'partial'
    && queries.length === 1 && providers.length === 2
    && local?.provider === 'local' && local.searched === true && typeof local.hitCount === 'number' && Array.isArray(local.hits)
    && external?.provider === 'ccel_live' && external.status === 'disabled' && external.searched === false
    && external.hitCount === 0 && Array.isArray(external.hits) && external.hits.length === 0
    && coverage?.localAttempted === true && coverage.ccelAttempted === false && coverage.ccelStatus === 'disabled' && coverage.ccelHitCount === 0,
  `${profile.label} expanded-discovery/catalog execution invariant drifted`);
  return { provider: 'ccel_live', status: 'disabled', searched: false, hitCount: 0 };
}

/** Production must reject an external provider in JSON Schema before any provider can execute. */
function assertCcelRejectedAtInputSchema(raw: RawToolResult, profile: HistoricalCoreAuditProfile): ObjectRecord {
  assert(raw.isError === true && raw.structuredContent === undefined,
    `${profile.label} CCEL input-boundary regression must be a safe unstructured validation error`);
  assert(raw.text.length === 1 && raw.text[0]!.startsWith('Invalid arguments for primary_source_search:'),
    `${profile.label} CCEL input-boundary regression must be classified by schema validation`);
  const serialized = JSON.stringify(raw.raw);
  assertNoSensitiveErrorText(serialized, `${profile.label} CCEL input-boundary regression`);
  assert(!serialized.includes('ccel_live') && !serialized.includes('"searched"') && !serialized.includes('"providers"'),
    `${profile.label} CCEL input-boundary regression exposed provider execution`);
  return { provider: 'ccel', status: 'rejected_at_input_schema', searched: false, hitCount: 0 };
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
    'primarySourceContractVersion', 'primarySourceOpenWorldHint', 'primarySourceProviderMaximum', 'primarySourceExternalDiscoveryBoundary',
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
  deadline.setProfile(profile);
  validateFixture(fixture);
  deadline.assertRemaining('fixed fixture preflight');
  const client = new FixedAuditMcp(fetchImpl, deadline, profile);
  const negotiated = assertInitialize(await client.initialize(), profile);
  await client.initialized();
  const schemas = assertToolRegistration(await client.toolsList(), profile);
  assertPrompts(await client.promptsList());
  assertResources(await client.resourcesList(), fixture);
  assertResourceTemplates(await client.resourceTemplatesList());
  assertPrimarySourceResearchPrompt(await client.getPrompt('primary-source-research', {
    topic: 'eucharist', authors: 'Erasmus of Rotterdam,Martin Luther', startYear: '500', endYear: '1500', maxSections: '2',
  }), profile);
  assertConfessionStudyPrompt(await client.getPrompt('confession-study', { topic: 'justification' }), profile);
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
      id: `core-${probe.workId}`, text: probe.query,
      ...(profile.primarySource.contractVersion === '7' ? { searchDepth: 'standard' } : { providers: ['local'] }),
      work: probe.workId, match: 'all_terms', selection: 'relevance', limit: 5,
    }] }), probe, profile);
    const section = assertExactSection(await client.readResource(primary.uri), primary.uri, probe.workId);
    records.push({ workId: probe.workId, editionId: probe.editionId, passed: true, durationMs: Date.now() - started, landing, directory, classicSearch, primary: primary.evidence, section });
  }
  assert(observedCoreSectionCount === fixture.baseline.expectedCatalogIdentity.coreSectionCount, 'reviewed core section-count identity drifted');
  const legacy = assertLegacyRegression(await client.callTool('classic_text_lookup', { work: fixture.legacyRegression.workId }), fixture);
  const ccelRaw = await client.callTool('primary_source_search', {
    queries: [{
      id: 'ccel-disabled', text: 'Lord Supper',
      ...(profile.primarySource.contractVersion === '7' ? { searchDepth: 'expanded', expandedLimit: 1 } : { providers: ['ccel'] }),
      match: 'all_terms', selection: 'relevance', limit: 1,
    }],
  });
  const ccel = profile.primarySource.externalDiscoveryBoundary === 'catalog_plus_disabled_expansion'
    ? assertExpandedDiscoveryDisabled(ccelRaw, profile)
    : assertCcelRejectedAtInputSchema(ccelRaw, profile);
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
  fail('historical core audit output violates no-clobber policy: destination already exists');
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
  const temporaryRoot = await mkdtemp(join(parent, `.${basename(output)}.historical-core-audit-`));
  const staged = join(temporaryRoot, 'evidence.json');
  try {
    await writeFile(staged, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    deadline.assertRemaining('true no-clobber evidence publication');
    try {
      await link(staged, output);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        fail('historical core audit output violates no-clobber policy: destination appeared during audit');
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
    'historical core audit cannot safely remove a post-expiry output that is no longer its final link');
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
  deadline.setProfile(profile);
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
