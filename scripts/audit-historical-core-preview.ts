/**
 * Fixed-endpoint, bounded release audit for the reviewed Transform-9 historical
 * core. This is deliberately a release gate, not a reusable MCP client: the
 * endpoint and probe inventory are immutable and it emits sanitized evidence
 * only after every assertion passes.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { classicTextsOutputSchema } from '../src/mcp/schemas/classicTexts.js';
import { primarySourceSearchV7OutputSchema } from '../src/mcp/schemas/primarySourceSearchV4.js';

const PREVIEW_ENDPOINT = 'https://preview-mcp.theologai.xyz/mcp';
const PROTOCOL_VERSION = '2025-11-25';
const MAX_LOGICAL_OPERATIONS = 49;
/** initialize + initialized notification + 48 request/response operations. */
const MAX_HTTP_EXCHANGES = 50;
const MAX_DURATION_MS = 300_000;
const MAX_REQUEST_DURATION_MS = 30_000;
const MAX_EVIDENCE_BYTES = 256 * 1024;
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

const EXPECTED_FIXTURE = {
  schemaVersion: 1,
  kind: 'historical-core-preview-audit-fixture',
  baseline: {
    manifestSchemaVersion: '0006_historical_source_packs',
    d1TransformVersion: 9,
    expectedCatalogIdentity: { workCount: 25, legacyWorkCount: 17, coreWorkCount: 8, coreSectionCount: 512 },
    sourcePackId: 'theologai-core-eight',
  },
  probes: [
    { workId: 'augustine-confessions', editionId: 'augustine-confessions-pusey-1838', query: 'restless heart' },
    { workId: 'john-damascene-exact-exposition', editionId: 'john-damascene-exposition-salmond-npnf2-v9', query: 'two natures' },
    { workId: 'calvin-institutes', editionId: 'calvin-institutes-beveridge-1845', query: 'justification' },
    { workId: 'wesley-standard-sermons', editionId: 'wesley-standard-sermons-1771', query: 'salvation' },
    { workId: 'bunyan-pilgrims-progress-part-1', editionId: 'bunyan-pilgrims-progress-part-1', query: 'Christian' },
    { workId: 'athanasius-on-incarnation', editionId: 'athanasius-on-incarnation-robertson-npnf2-v4', query: 'renewal creation' },
    { workId: 'irenaeus-against-heresies', editionId: 'irenaeus-against-heresies-anf1-1885', query: 'heresies' },
    { workId: 'anselm-proslogion', editionId: 'anselm-proslogion-deane-1903', query: 'that than which nothing greater' },
  ],
  legacyRegression: { workId: 'apostles-creed', deliveryMode: 'complete_document' },
} as const;

export type AuditFixture = typeof EXPECTED_FIXTURE;
type FetchLike = typeof fetch;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type ObjectRecord = Record<string, unknown>;
type RawToolResult = { isError: boolean; structuredContent?: ObjectRecord; text: string[]; raw: ObjectRecord };
type RequestCounters = { logical: number; http: number };

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
  private id = 1;
  private readonly startedAt = Date.now();
  private sessionId: string | undefined;

  constructor(private readonly fetchImpl: FetchLike) {}

  private remaining(): number {
    const remaining = MAX_DURATION_MS - (Date.now() - this.startedAt);
    assert(remaining > 0, 'historical preview audit exceeded total duration budget');
    return remaining;
  }

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
    const target = new URL(PREVIEW_ENDPOINT);
    assert(target.toString() === PREVIEW_ENDPOINT && target.protocol === 'https:' && target.hostname === 'preview-mcp.theologai.xyz'
      && target.pathname === '/mcp' && !target.search && !target.hash, 'preview audit endpoint allowlist drifted');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(MAX_REQUEST_DURATION_MS, this.remaining()));
    try {
      const response = await this.fetchImpl(target, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: {
          Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
          'Mcp-Protocol-Version': PROTOCOL_VERSION, 'User-Agent': 'TheologAI-HistoricalCore-Preview-Audit/1.0',
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
      protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'theologai-historical-core-preview-audit', version: '1.0.0' },
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
  async resourcesList(): Promise<ObjectRecord> { return this.request('resources/list'); }
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
  }
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

function assertInitialize(message: ObjectRecord): ObjectRecord {
  const output = result(message, 'initialize');
  const server = object(output.serverInfo); const capabilities = object(output.capabilities);
  assert(output.protocolVersion === PROTOCOL_VERSION && server?.name === 'theologai-bible-server' && server?.version === '3.6.0-preview', 'preview initialize identity/version drifted');
  assert(JSON.stringify(Object.keys(capabilities ?? {}).sort()) === JSON.stringify(['prompts', 'resources', 'tools']), 'preview initialize capabilities drifted');
  return { protocolVersion: PROTOCOL_VERSION, serverName: 'theologai-bible-server', serverVersion: '3.6.0-preview' };
}

function assertToolRegistration(message: ObjectRecord): ObjectRecord {
  const listed = array(result(message, 'tools/list').tools, 'tools/list.tools').map(object);
  assert(listed.every(Boolean) && JSON.stringify(listed.map(tool => tool!.name)) === JSON.stringify(TOOL_NAMES), 'exact 11-tool registration/order drifted');
  for (const tool of listed) {
    const annotations = object(tool!.annotations);
    assert(annotations?.readOnlyHint === true && annotations.destructiveHint === false && annotations.idempotentHint === true, `${tool!.name} annotations drifted`);
  }
  const classic = listed.find(tool => tool?.name === 'classic_text_lookup');
  const primary = listed.find(tool => tool?.name === 'primary_source_search');
  assert(classic !== undefined && primary !== undefined, 'historical tools are not registered');
  const classicInput = object(classic.inputSchema); const classicOutput = object(classic.outputSchema);
  const primaryInput = object(primary.inputSchema); const primaryOutput = object(primary.outputSchema);
  assert(classicInput !== undefined && classicOutput !== undefined && primaryInput !== undefined && primaryOutput !== undefined, 'historical tool schemas missing');
  assert(classicInput.type === 'object' && classicInput.minProperties === 1 && classicInput.additionalProperties === false
    && JSON.stringify(Object.keys(object(classicInput.properties) ?? {})) === JSON.stringify(['work', 'query', 'listWorks', 'browseSections', 'cursor']), 'classic-text input contract drifted');
  assert(canonicalJson(classicOutput) === canonicalJson(classicTextsOutputSchema), 'advertised classic-text output schema differs from the checked-out contract');
  const queries = object(primaryInput.properties)?.queries as ObjectRecord | undefined;
  const queryItem = object(queries?.items); const properties = object(queryItem?.properties);
  assert(primaryInput.type === 'object' && primaryInput.additionalProperties === false && JSON.stringify(primaryInput.required) === JSON.stringify(['queries'])
    && queries?.minItems === 1 && queries.maxItems === 4 && queryItem?.additionalProperties === false
    && JSON.stringify(Object.keys(properties ?? {})) === JSON.stringify(['id', 'text', 'providers', 'match', 'selection', 'author', 'work', 'startYear', 'endYear', 'page', 'limit']), 'primary-source input contract drifted');
  const providers = object(properties?.providers); const providerItems = object(providers?.items);
  assert(providers?.minItems === 1 && providers?.maxItems === 2 && JSON.stringify(providerItems?.enum) === JSON.stringify(['local', 'ccel']), 'preview provider contract drifted');
  assert(canonicalJson(primaryOutput) === canonicalJson(primarySourceSearchV7OutputSchema), 'advertised preview primary-source output schema differs from the checked-out contract');
  return {
    classicTextOutputSchemaSha256: sha256(canonicalJson(classicOutput)),
    primarySourceOutputSchemaSha256: sha256(canonicalJson(primaryOutput)),
  };
}

function assertPrompts(message: ObjectRecord): void {
  const prompts = array(result(message, 'prompts/list').prompts, 'prompts/list.prompts').map(object);
  assert(prompts.every(Boolean) && JSON.stringify(prompts.map(prompt => prompt!.name)) === JSON.stringify(PROMPT_NAMES), 'prompt registration/order drifted');
}

function assertResources(message: ObjectRecord): void {
  const resources = array(result(message, 'resources/list').resources, 'resources/list.resources').map(object);
  const catalog = resources.filter(resource => resource?.uri === 'theologai://primary-sources/catalog');
  assert(catalog.length === 1 && catalog[0]?.mimeType === 'application/json', 'primary-source catalog resource registration drifted');
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
    assert(readiness?.editionIdentity === 'established' && readiness.provenance === 'verified' && readiness.normalizedTextRights === 'no_known_conflict', `${probe.workId} edition readiness drifted`);
  }
  const policies = object(catalog.policies);
  assert(policies?.scope === 'hosted_collection_only' && policies.editionProvenance === 'mixed_legacy_and_reviewed_source_packs'
    && policies.rightsStatus === 'mixed_not_established_and_no_known_conflict', 'catalog mixed-inventory provenance policy drifted');
  return { workCount: works.length, legacyWorkCount: LEGACY_WORK_IDS.length, coreWorkCount: core.length, sourcePackId: fixture.baseline.sourcePackId };
}

function structured(raw: RawToolResult, label: string): ObjectRecord {
  assert(!raw.isError && raw.structuredContent !== undefined, `${label} must succeed with structured content`);
  return raw.structuredContent;
}

function assertClassicLanding(raw: RawToolResult, workId: string): ObjectRecord {
  const output = structured(raw, `${workId} landing`); const landing = object(output.landing); const work = object(landing?.work);
  const policy = object(output.evidencePolicy);
  assert(output.schemaVersion === '2' && output.kind === 'classic_text_lookup' && output.mode === 'landing'
    && work?.id === workId && work.deliveryMode === 'sectioned_only' && landing?.bodyDelivery === 'exact_section_resource_only'
    && object(landing?.browse)?.pageSize === 32 && policy?.providerScope === 'local_only' && policy.remoteDocumentBodies === 'disabled'
    && policy.selectedContentAccess === 'mcp_resource_read', `${workId} sectioned landing/privacy contract drifted`);
  const locator = object(work.resource);
  assert(locator?.kind === 'mcp_resource' && typeof locator.uri === 'string', `${workId} landing locator drifted`);
  return { sectionCount: landing!.sectionCount, landingResourceBytes: locator.resourceSizeBytes };
}

function assertClassicDirectory(raw: RawToolResult, workId: string): ObjectRecord {
  const output = structured(raw, `${workId} browse`); const directory = object(output.directory); const work = object(directory?.work);
  const sections = array(directory?.sections, `${workId} sections`).map(object);
  assert(output.mode === 'browse_sections' && work?.id === workId && directory?.coverage === 'bounded_section_directory'
    && object(directory?.pagination)?.pageSize === 32 && sections.length > 0 && sections.length <= 32 && sections.every(Boolean), `${workId} bounded directory contract drifted`);
  for (const section of sections) {
    const locator = object(section!.resource);
    assert(Number.isSafeInteger(section!.sourceOrdinal) && (section!.sourceOrdinal as number) >= 1 && typeof section!.sectionKey === 'string'
      && locator?.kind === 'mcp_resource' && typeof locator.uri === 'string', `${workId} directory exact-section locator drifted`);
  }
  return { firstPageEntryCount: sections.length, pageSize: 32 };
}

function assertClassicSearch(raw: RawToolResult, workId: string): ObjectRecord {
  const output = structured(raw, `${workId} classic search`); const search = object(output.search);
  const hits = array(search?.hits, `${workId} classic hits`).map(object);
  assert(output.mode === 'search' && search?.status === 'ok' && hits.length > 0 && hits.every(Boolean)
    && hits.some(hit => object(hit!.work)?.id === workId) && hits.every(hit => hit!.snippetOnly === true), `${workId} natural classic-text probe drifted`);
  return { returnedHitCount: hits.length, matchingWorkObserved: true, snippetsDiscoveryOnly: true };
}

function assertPrimarySearch(raw: RawToolResult, workId: string): { uri: string; evidence: ObjectRecord } {
  const output = structured(raw, `${workId} primary search`);
  const queries = array(output.queries, `${workId} primary queries`).map(object);
  assert(output.schemaVersion === '7' && output.kind === 'primary_source_search' && output.planStatus === 'complete' && queries.length === 1 && queries[0] !== undefined, `${workId} primary envelope drifted`);
  const providers = array(queries[0]!.providers, `${workId} primary providers`).map(object);
  assert(providers.length === 1 && providers[0]?.provider === 'local' && providers[0]?.status === 'ok' && providers[0]?.searched === true, `${workId} local provider execution drifted`);
  const hits = array(providers[0]!.hits, `${workId} local hits`).map(object);
  const hit = hits.find(candidate => object(candidate?.locator)?.documentId === workId);
  assert(hit !== undefined, `${workId} natural local query did not return its exact hosted work`);
  const locator = object(hit.locator); const readiness = object(hit.editionReadiness);
  assert(locator?.kind === 'mcp_resource' && typeof locator.uri === 'string' && locator.documentId === workId
    && readiness?.editionIdentity === 'established' && readiness.normalizedTextRights === 'no_known_conflict', `${workId} primary local evidence identity/readiness drifted`);
  const policy = object(output.evidencePolicy); const coverage = object(output.coverage);
  assert(policy?.snippetUse === 'discovery_only' && policy.localSectionAccess === 'mcp_resource_read'
    && policy.externalSectionAccess === 'direct_url_only' && coverage?.localAttempted === true && coverage.localHitCount >= 1, `${workId} primary evidence policy drifted`);
  return { uri: locator.uri as string, evidence: { localHitCount: coverage.localHitCount, exactWorkObserved: true, localReadiness: 'established' } };
}

function assertExactSection(message: ObjectRecord, expectedUri: string, workId: string): ObjectRecord {
  const text = contentText(message, expectedUri, 'text/markdown', `${workId} exact section`);
  assert(text.length > 0 && !/data:(?:image|application)\//iu.test(text) && !/<img\b|<!doctype\b|\.(?:jpe?g|png|gif|webp|pdf)\b/iu.test(text), `${workId} resource must remain normalized text rather than a scan artifact`);
  return { bodyBytes: utf8Bytes(text), normalizedTextOnly: true };
}

function assertLegacyRegression(raw: RawToolResult, fixture: AuditFixture): ObjectRecord {
  const output = structured(raw, 'legacy regression'); const document = object(output.document); const work = object(document?.work);
  assert(output.schemaVersion === '2' && output.mode === 'work' && work?.id === fixture.legacyRegression.workId
    && document?.deliveryMode === fixture.legacyRegression.deliveryMode && document.bodyDelivery === 'markdown_only', 'legacy complete-document behavior regressed');
  return { workId: fixture.legacyRegression.workId, deliveryMode: fixture.legacyRegression.deliveryMode, preserved: true };
}

function assertCcelDisabled(raw: RawToolResult): ObjectRecord {
  const output = structured(raw, 'CCEL disabled regression'); const queries = array(output.queries, 'CCEL queries').map(object);
  const provider = object(queries[0]?.providers && array(queries[0]!.providers, 'CCEL providers')[0]); const coverage = object(output.coverage);
  assert(output.schemaVersion === '7' && output.planStatus === 'unavailable' && queries.length === 1 && provider?.provider === 'ccel_live'
    && provider.status === 'disabled' && provider.searched === false && provider.hitCount === 0 && Array.isArray(provider.hits) && provider.hits.length === 0
    && coverage?.localAttempted === false && coverage.ccelAttempted === false && coverage.ccelStatus === 'disabled' && coverage.ccelHitCount === 0, 'preview CCEL-disabled/local-only execution invariant drifted');
  return { provider: 'ccel_live', status: 'disabled', searched: false, hitCount: 0 };
}

function assertSafeToolError(raw: RawToolResult, label: string): void {
  assert(raw.isError && raw.structuredContent === undefined, `${label} must fail safely without structured output`);
  assert(raw.text.length >= 1 && raw.text.every(text => !/https?:\/\/|theologai:\/\/|stack|sql|d1|token/iu.test(text)), `${label} error leaked internal locator or implementation detail`);
}

function assertRpcError(message: ObjectRecord, label: string): void {
  const error = object(message.error);
  assert(error !== undefined && typeof error.message === 'string', `${label} must return a JSON-RPC error`);
}

function evidenceTextIsSafe(value: unknown): void {
  const forbidden = new Set(['text', 'content', 'markdown', 'cursor', 'headers', 'sessionId', 'stack', 'url', 'uri', 'sql', 'd1', 'token', 'snippet']);
  const visit = (input: unknown): void => {
    if (Array.isArray(input)) { input.forEach(visit); return; }
    const record = object(input); if (!record) return;
    for (const [key, item] of Object.entries(record)) {
      assert(!forbidden.has(key), `sanitized historical evidence leaked forbidden ${key} field`);
      visit(item);
    }
  };
  visit(value);
}

export async function runPreviewAudit(fixture: AuditFixture, fetchImpl: FetchLike = fetch): Promise<ObjectRecord> {
  validateFixture(fixture);
  const startedAt = Date.now(); const client = new FixedPreviewMcp(fetchImpl);
  const negotiated = assertInitialize(await client.initialize());
  await client.initialized();
  const schemas = assertToolRegistration(await client.toolsList());
  assertPrompts(await client.promptsList());
  assertResources(await client.resourcesList());
  const catalog = assertCatalog(await client.readResource('theologai://primary-sources/catalog'), fixture);
  const records: ObjectRecord[] = [];
  let observedCoreSectionCount = 0;
  for (const probe of fixture.probes) {
    const started = Date.now();
    const landing = assertClassicLanding(await client.callTool('classic_text_lookup', { work: probe.workId }), probe.workId);
    assert(Number.isSafeInteger(landing.sectionCount) && (landing.sectionCount as number) > 0, `${probe.workId} landing section count drifted`);
    observedCoreSectionCount += landing.sectionCount as number;
    const directory = assertClassicDirectory(await client.callTool('classic_text_lookup', { work: probe.workId, browseSections: true }), probe.workId);
    const classicSearch = assertClassicSearch(await client.callTool('classic_text_lookup', { query: probe.query }), probe.workId);
    const primary = assertPrimarySearch(await client.callTool('primary_source_search', { queries: [{
      id: `core-${probe.workId}`, text: probe.query, providers: ['local'], work: probe.workId, match: 'all_terms', selection: 'relevance', limit: 5,
    }] }), probe.workId);
    const section = assertExactSection(await client.readResource(primary.uri), primary.uri, probe.workId);
    records.push({ workId: probe.workId, editionId: probe.editionId, passed: true, durationMs: Date.now() - started, landing, directory, classicSearch, primary: primary.evidence, section });
  }
  assert(observedCoreSectionCount === fixture.baseline.expectedCatalogIdentity.coreSectionCount, 'reviewed core section-count identity drifted');
  const legacy = assertLegacyRegression(await client.callTool('classic_text_lookup', { work: fixture.legacyRegression.workId }), fixture);
  const ccel = assertCcelDisabled(await client.callTool('primary_source_search', { queries: [{ id: 'ccel-disabled', text: 'Lord Supper', providers: ['ccel'], match: 'all_terms', selection: 'relevance', limit: 1 }] }));
  assertRpcError(await client.readResource('theologai://documents/does-not-exist#section-not-real'), 'invalid resource regression');
  assertSafeToolError(await client.callTool('classic_text_lookup', { work: fixture.probes[0].workId, browseSections: true, cursor: 'not-a-valid-cursor' }), 'invalid cursor regression');
  client.complete();
  const evidence = {
    schemaVersion: 1, audit: 'historical-core-preview', endpointClass: 'preview-custom',
    fixtureSha256: sha256(await readFile(FIXTURE_PATH, 'utf8')), durationMs: Date.now() - startedAt,
    negotiated, schemas,
    budgets: {
      logicalOperations: client.counters.logical, maximumLogicalOperations: MAX_LOGICAL_OPERATIONS,
      httpExchanges: client.counters.http, maximumHttpExchanges: MAX_HTTP_EXCHANGES, retryCount: 0,
      perRequestMaximumDurationMs: MAX_REQUEST_DURATION_MS, maximumDurationMs: MAX_DURATION_MS, maximumMcpResponseBytes: MAX_MCP_RESPONSE_BYTES,
    },
    catalog: { ...catalog, coreSectionCount: observedCoreSectionCount },
    records,
    regressions: { legacy, ccel, invalidResourceRejected: true, invalidCursorRejected: true },
  };
  evidenceTextIsSafe(evidence);
  assert(utf8Bytes(JSON.stringify(evidence)) <= MAX_EVIDENCE_BYTES, 'sanitized historical evidence exceeds 256 KiB ceiling');
  return evidence;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--output' && typeof args[1] === 'string' && args[1].length > 0), 'usage: npm run audit:historical-core-preview -- [--output path]');
  const output = resolve(args.length === 0 ? `test-output/historical-core-preview-audit-${new Date().toISOString().replaceAll(':', '-')}.json` : args[1]!);
  const fixture = validateFixture(JSON.parse(await readFile(FIXTURE_PATH, 'utf8')));
  const evidence = await runPreviewAudit(fixture);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(`PASS: ${fixture.probes.length} reviewed core historical works; evidence: ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
