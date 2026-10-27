/**
 * Fixed, zero-retry release audit for the ten Transform-11 historical-spine
 * works.  It deliberately reuses the core audit's bounded MCP transport and
 * atomic sanitized-evidence publisher; this is a protected release gate, not
 * a general MCP client or a corpus crawler.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildLocalDocumentResourceUri } from '../src/kernel/documentResource.js';
import {
  AuditDeadline,
  assertAuditOutputAbsent,
  canonicalJson,
  FixedAuditMcp,
  HISTORICAL_CORE_EXPECTED_RESOURCE_URIS,
  MAX_MCP_RESPONSE_BYTES,
  PREVIEW_PROFILE,
  PRODUCTION_PROFILE,
  publishAuditEvidence,
  type HistoricalCoreAuditProfile,
} from './audit-historical-core-preview.js';

const FIXTURE_PATH = new URL('../test/fixtures/historical-spine-preview-audit.json', import.meta.url);
const PROTOCOL_VERSION = '2025-11-25';
const MAX_LOGICAL_OPERATIONS = 82;
const MAX_HTTP_EXCHANGES = 83;
const MAX_DURATION_MS = 180_000;
const MAX_REQUEST_DURATION_MS = 30_000;
const MAX_EVIDENCE_BYTES = 128 * 1024;
const MAX_AGGREGATE_MCP_RESPONSE_BYTES = 2 * 1024 * 1024;
const PAGE_SIZE = 32;

const EXPECTED_FIXTURE = {
  schemaVersion: 1,
  kind: 'historical-spine-preview-audit-fixture',
  baseline: { workCount: 10, sectionedOnlyWorkCount: 10, catalogWorkCount: 35 },
  probes: [
    { workId: 'augustine-on-christian-doctrine', editionId: 'augustine-on-christian-doctrine-shaw-npnf1-v2-1887', sourcePackId: 'theologai-historical-spine-early', query: 'rules interpretation Scripture', sectionCount: 120, firstSection: { sectionKey: 'section-preface-001', sourceOrdinal: 1 }, requiresPagination: true },
    { workId: 'basil-on-the-holy-spirit', editionId: 'basil-on-the-holy-spirit-jackson-npnf2-v8-1895', sourcePackId: 'theologai-historical-spine-early', query: 'Holy Spirit Arius', sectionCount: 30, firstSection: { sectionKey: 'section-preface-001', sourceOrdinal: 1 }, requiresPagination: false },
    { workId: 'gregory-nazianzen-five-theological-orations', editionId: 'gregory-nazianzen-five-theological-orations-browne-swallow-npnf2-v7-1894', sourcePackId: 'theologai-historical-spine-early', query: 'Theological Oration Eunomians', sectionCount: 5, firstSection: { sectionKey: 'section-the-first-theological-oration-a-preliminary-discours-001', sourceOrdinal: 1 }, requiresPagination: false },
    { workId: 'gregory-nyssa-great-catechism', editionId: 'gregory-nyssa-great-catechism-moore-wilson-npnf2-v5-1893', sourcePackId: 'theologai-historical-spine-early', query: 'Great Catechism belief God', sectionCount: 42, firstSection: { sectionKey: 'section-summary-001', sourceOrdinal: 1 }, requiresPagination: true },
    { workId: 'justin-martyr-apologies', editionId: 'justin-martyr-apologies-dods-reith-anf1-1885', sourcePackId: 'theologai-historical-spine-early', query: 'Emperor Antoninus philosopher', sectionCount: 86, firstSection: { sectionKey: 'section-chapter-i-address-001', sourceOrdinal: 1 }, requiresPagination: true },
    { workId: 'origen-de-principiis', editionId: 'origen-de-principiis-crombie-anf4-1885', sourcePackId: 'theologai-historical-spine-early', query: 'uncompounded intellectual nature', sectionCount: 32, firstSection: { sectionKey: 'section-on-god-001', sourceOrdinal: 1 }, requiresPagination: false },
    { workId: 'hooker-laws-of-ecclesiastical-polity-book-1', editionId: 'hooker-laws-of-ecclesiastical-polity-book-1-keble-1888', sourcePackId: 'theologai-historical-spine-later', query: 'persuade multitude governed', sectionCount: 16, firstSection: { sectionKey: 'section-001', sourceOrdinal: 1 }, requiresPagination: false },
    { workId: 'julian-revelations-of-divine-love', editionId: 'julian-revelations-of-divine-love-warrack-1901-gutenberg', sourcePackId: 'theologai-historical-spine-later', query: 'Revelation Love Sixteen Shewings', sectionCount: 86, firstSection: { sectionKey: 'section-001', sourceOrdinal: 1 }, requiresPagination: true },
    { workId: 'kempis-imitation-of-christ', editionId: 'kempis-imitation-of-christ-benham-gutenberg', sourcePackId: 'theologai-historical-spine-later', query: 'imitation Christ contempt world', sectionCount: 114, firstSection: { sectionKey: 'section-001', sourceOrdinal: 1 }, requiresPagination: true },
    { workId: 'pascal-pensees', editionId: 'pascal-pensees-trotter-1910', sourcePackId: 'theologai-historical-spine-later', query: 'mathematical intuitive mind', sectionCount: 14, firstSection: { sectionKey: 'section-001', sourceOrdinal: 1 }, requiresPagination: false },
  ],
} as const;

export type HistoricalSpineAuditFixture = typeof EXPECTED_FIXTURE;
type ObjectRecord = Record<string, unknown>;
type RawToolResult = Readonly<{ isError: boolean; structuredContent?: ObjectRecord; text: string[]; raw: ObjectRecord }>;
type SpineProfile = Omit<HistoricalCoreAuditProfile, 'audit'> & Readonly<{
  audit: 'historical-spine-preview' | 'historical-spine-production';
  endpointClass: 'preview-custom' | 'production-custom';
}>;

export const SPINE_PREVIEW_PROFILE: SpineProfile = { ...PREVIEW_PROFILE, audit: 'historical-spine-preview' };
export const SPINE_PRODUCTION_PROFILE: SpineProfile = { ...PRODUCTION_PROFILE, audit: 'historical-spine-production' };

function fail(message: string): never { throw new Error(message); }
function assert(value: unknown, message: string): asserts value { if (!value) fail(message); }
function object(value: unknown): ObjectRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectRecord : undefined;
}
function array(value: unknown, label: string): unknown[] { assert(Array.isArray(value), `${label} must be an array`); return value; }
function string(value: unknown, label: string): string { assert(typeof value === 'string', `${label} must be a string`); return value; }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
function result(message: ObjectRecord, label: string): ObjectRecord {
  assert(message.error === undefined, `${label} returned a JSON-RPC error`);
  const output = object(message.result); assert(output !== undefined, `${label} result missing`); return output;
}
function structured(raw: RawToolResult, label: string): ObjectRecord {
  assert(!raw.isError && raw.structuredContent !== undefined, `${label} must succeed with structured content`);
  return raw.structuredContent;
}
function resourceText(message: ObjectRecord, expectedUri: string, expectedMimeType: string, label: string): string {
  const contents = array(result(message, label).contents, `${label}.contents`).map(object);
  assert(contents.length === 1 && contents[0]?.uri === expectedUri && contents[0]?.mimeType === expectedMimeType, `${label} resource identity/mime drifted`);
  return string(contents[0]!.text, `${label} text`);
}
function contentText(message: ObjectRecord, expectedUri: string, label: string): string {
  return resourceText(message, expectedUri, 'text/markdown', label);
}

/** A fixture edit is a protected inventory change, never a casual test-data update. */
export function validateHistoricalSpineFixture(value: unknown): HistoricalSpineAuditFixture {
  assert(canonicalJson(value) === canonicalJson(EXPECTED_FIXTURE), 'historical-spine fixture identity or probe inventory drifted');
  return structuredClone(EXPECTED_FIXTURE);
}

function landingUri(workId: string): string { return `theologai://documents/${workId}`; }

function assertInitialize(message: ObjectRecord, profile: SpineProfile): ObjectRecord {
  const output = result(message, 'initialize'); const server = object(output.serverInfo); const capabilities = object(output.capabilities);
  assert(output.protocolVersion === PROTOCOL_VERSION && server?.name === 'theologai-bible-server' && server.version === profile.serverVersion,
    `${profile.label} historical-spine initialize identity/version drifted`);
  assert(JSON.stringify(Object.keys(capabilities ?? {}).sort()) === JSON.stringify(['prompts', 'resources', 'tools']),
    `${profile.label} historical-spine initialize capability drifted`);
  return { protocolVersion: PROTOCOL_VERSION, serverName: 'theologai-bible-server', serverVersion: profile.serverVersion };
}

function assertTools(message: ObjectRecord): void {
  const tools = array(result(message, 'tools/list').tools, 'tools/list.tools').map(object);
  const classic = tools.find(tool => tool?.name === 'classic_text_lookup');
  const primary = tools.find(tool => tool?.name === 'primary_source_search');
  assert(tools.length === 11 && classic !== undefined && primary !== undefined, 'historical-spine tool registration drifted');
  for (const tool of [classic, primary]) {
    const annotations = object(tool!.annotations);
    assert(annotations?.readOnlyHint === true && annotations.destructiveHint === false && annotations.idempotentHint === true,
      `historical-spine ${tool!.name} annotation drifted`);
  }
}

function assertResources(message: ObjectRecord): void {
  const resources = array(result(message, 'resources/list').resources, 'resources/list.resources').map(object);
  const uris = resources.map(resource => string(resource?.uri, 'resources/list URI')).sort();
  assert(resources.length === HISTORICAL_CORE_EXPECTED_RESOURCE_URIS.length && new Set(uris).size === uris.length
    && JSON.stringify(uris) === JSON.stringify(HISTORICAL_CORE_EXPECTED_RESOURCE_URIS), 'historical-spine exact resource inventory drifted');
}

type AuthoritativeWork = Readonly<{ editionId: string; readiness: ObjectRecord }>;
function assertAuthoritativeCatalog(message: ObjectRecord, fixture: HistoricalSpineAuditFixture): ReadonlyMap<string, AuthoritativeWork> {
  const text = resourceText(message, 'theologai://primary-sources/catalog', 'application/json', 'historical-spine primary-source catalog');
  const catalog = object(JSON.parse(text)); const works = array(catalog?.works, 'historical-spine primary-source catalog works').map(object);
  assert(catalog?.schemaVersion === '2' && catalog.kind === 'local_primary_source_catalog' && catalog.workCount === fixture.baseline.catalogWorkCount
    && works.length === fixture.baseline.catalogWorkCount && works.every(Boolean), 'historical-spine authoritative catalog drifted');
  const observed = new Map<string, AuthoritativeWork>();
  for (const probe of fixture.probes) {
    const work = works.find(candidate => candidate?.id === probe.workId); const provenance = object(work?.editionProvenance); const readiness = object(work?.editionReadiness);
    assert(provenance?.editionId === probe.editionId && provenance.sourcePackId === probe.sourcePackId
      && provenance?.provenance !== undefined && provenance?.normalizedTextRights !== undefined
      && readiness?.editionIdentity === 'established' && readiness.provenance === 'verified_with_uncertainty'
      && readiness.normalizedTextRights === 'no_known_conflict', `${probe.workId} authoritative edition/provenance/readiness drifted`);
    observed.set(probe.workId, { editionId: provenance.editionId as string, readiness });
  }
  return observed;
}

function assertCatalog(raw: RawToolResult, fixture: HistoricalSpineAuditFixture, authoritative: ReadonlyMap<string, AuthoritativeWork>): void {
  const output = structured(raw, 'historical-spine list works'); const catalog = object(output.catalog); const works = array(catalog?.works, 'historical-spine catalog works').map(object);
  assert(output.schemaVersion === '2' && output.kind === 'classic_text_lookup' && output.mode === 'list_works'
    && catalog?.coverage === 'complete_local_work_inventory' && works.length === fixture.baseline.catalogWorkCount, 'historical-spine catalog envelope drifted');
  const ids = works.map(work => string(work?.id, 'historical-spine work id'));
  for (const probe of fixture.probes) {
    const work = works.find(candidate => candidate?.id === probe.workId);
    const locator = object(work?.resource);
    assert(authoritative.get(probe.workId)?.editionId === probe.editionId
      && work?.deliveryMode === 'sectioned_only' && locator?.kind === 'mcp_resource' && locator.uri === landingUri(probe.workId),
      `${probe.workId} catalog/resource coherence drifted`);
  }
  assert(new Set(ids).size === fixture.baseline.catalogWorkCount, 'historical-spine catalog identities are not unique');
}

type Directory = Readonly<{ firstUri: string; firstKey: string; nextCursor?: string; firstKeys: readonly string[] }>;
function assertLanding(raw: RawToolResult, probe: HistoricalSpineAuditFixture['probes'][number]): number {
  const output = structured(raw, `${probe.workId} landing`); const landing = object(output.landing); const work = object(landing?.work); const resource = object(work?.resource);
  assert(output.schemaVersion === '2' && output.kind === 'classic_text_lookup' && output.mode === 'landing'
    && work?.id === probe.workId && work.deliveryMode === 'sectioned_only' && landing?.bodyDelivery === 'exact_section_resource_only'
    && landing?.sectionCount === probe.sectionCount && object(landing?.browse)?.pageSize === PAGE_SIZE
    && resource?.kind === 'mcp_resource' && resource.uri === landingUri(probe.workId)
    && typeof resource.resourceSizeBytes === 'number' && resource.resourceSizeBytes > 0,
  `${probe.workId} landing contract drifted`);
  return resource.resourceSizeBytes as number;
}

function assertLandingRead(message: ObjectRecord, probe: HistoricalSpineAuditFixture['probes'][number], expectedBytes: number): void {
  const text = contentText(message, landingUri(probe.workId), `${probe.workId} direct landing`);
  assert(text.length > 0 && bytes(text) === expectedBytes && bytes(text) <= 16 * 1024 && !/<img\b|data:/iu.test(text),
    `${probe.workId} direct landing is not bounded normalized local metadata`);
}

function assertDirectory(raw: RawToolResult, probe: HistoricalSpineAuditFixture['probes'][number]): Directory {
  const output = structured(raw, `${probe.workId} browse`); const directory = object(output.directory); const work = object(directory?.work);
  const sections = array(directory?.sections, `${probe.workId} sections`).map(object);
  const pagination = object(directory?.pagination);
  assert(output.mode === 'browse_sections' && work?.id === probe.workId && directory?.coverage === 'bounded_section_directory'
    && pagination?.pageSize === PAGE_SIZE && sections.length === Math.min(PAGE_SIZE, probe.sectionCount) && sections.every(Boolean),
  `${probe.workId} first browse page drifted`);
  const first = sections[0]!; const locator = object(first.resource); const expectedUri = buildLocalDocumentResourceUri(probe.workId, probe.firstSection.sectionKey)!;
  assert(first.sectionKey === probe.firstSection.sectionKey && first.sourceOrdinal === probe.firstSection.sourceOrdinal
    && locator?.kind === 'mcp_resource' && locator.uri === expectedUri, `${probe.workId} first directory locator drifted`);
  const firstKeys = sections.map(section => string(section!.sectionKey, `${probe.workId} section key`));
  for (const section of sections) {
    const sectionLocator = object(section!.resource); const key = string(section!.sectionKey, `${probe.workId} section key`);
    assert(sectionLocator?.kind === 'mcp_resource' && sectionLocator.uri === buildLocalDocumentResourceUri(probe.workId, key),
      `${probe.workId} directory canonical locator drifted`);
  }
  const nextCursor = pagination?.nextCursor;
  assert(probe.requiresPagination === (typeof nextCursor === 'string' && nextCursor.length > 0), `${probe.workId} pagination availability drifted`);
  return { firstUri: expectedUri, firstKey: probe.firstSection.sectionKey, ...(typeof nextCursor === 'string' ? { nextCursor } : {}), firstKeys };
}

function assertPagination(raw: RawToolResult, probe: HistoricalSpineAuditFixture['probes'][number], directory: Directory): void {
  assert(directory.nextCursor !== undefined, `${probe.workId} missing fixed pagination cursor`);
  const output = structured(raw, `${probe.workId} pagination`); const page = object(output.directory); const sections = array(page?.sections, `${probe.workId} continuation sections`).map(object);
  const pagination = object(page?.pagination);
  const expectedCount = Math.min(PAGE_SIZE, probe.sectionCount - PAGE_SIZE);
  const expectsAnotherPage = probe.sectionCount > PAGE_SIZE * 2;
  assert(output.mode === 'browse_sections' && object(page?.work)?.id === probe.workId
    && sections.length === expectedCount && sections.every(Boolean) && pagination?.pageSize === PAGE_SIZE
    && expectsAnotherPage === (typeof pagination?.nextCursor === 'string' && pagination.nextCursor.length > 0),
  `${probe.workId} continuation page count/cursor contract drifted`);
  const keys = sections.map(section => string(section!.sectionKey, `${probe.workId} continuation key`));
  assert(new Set(keys).size === keys.length && keys.every(key => !directory.firstKeys.includes(key)), `${probe.workId} continuation keys overlap or repeat`);
  for (const [index, section] of sections.entries()) {
    const key = keys[index]!; const locator = object(section!.resource);
    assert(section!.sourceOrdinal === PAGE_SIZE + index + 1 && locator?.kind === 'mcp_resource' && locator.uri === buildLocalDocumentResourceUri(probe.workId, key),
      `${probe.workId} continuation locator drifted`);
  }
}

function assertClassicSearch(raw: RawToolResult, probe: HistoricalSpineAuditFixture['probes'][number], authoritative: AuthoritativeWork): string {
  const output = structured(raw, `${probe.workId} global classic search`); const search = object(output.search); const hits = array(search?.hits, `${probe.workId} global classic hits`).map(object);
  const hit = hits.find(candidate => object(candidate?.work)?.id === probe.workId); const work = object(hit?.work); const section = object(hit?.section); const locator = object(section?.resource);
  const sectionKey = section?.sectionKey;
  assert(output.mode === 'search' && search?.status === 'ok' && hits.length > 0 && hit !== undefined,
    `${probe.workId} natural global classic search omitted the work`);
  assert(hits.every(hit => hit?.snippetOnly === true), `${probe.workId} global classic search leaked selected text`);
  const uri = locator?.uri;
  assert(authoritative.editionId === probe.editionId && work?.deliveryMode === 'sectioned_only'
    && typeof sectionKey === 'string' && Number.isSafeInteger(section?.sourceOrdinal) && (section?.sourceOrdinal as number) >= 1
    && locator?.kind === 'mcp_resource' && locator.uri === buildLocalDocumentResourceUri(probe.workId, sectionKey),
  `${probe.workId} global classic search locator/readiness coherence drifted`);
  return uri as string;
}

function assertPrimary(raw: RawToolResult, probe: HistoricalSpineAuditFixture['probes'][number], profile: SpineProfile, authoritative: AuthoritativeWork): string {
  const output = structured(raw, `${probe.workId} scoped primary search`); const queries = array(output.queries, `${probe.workId} primary queries`).map(object);
  assert(output.schemaVersion === profile.primarySource.schemaVersion && output.kind === 'primary_source_search' && output.planStatus === 'complete' && queries.length === 1,
    `${probe.workId} primary-search envelope drifted`);
  const providers = array(queries[0]?.providers, `${probe.workId} primary providers`).map(object);
  assert(providers.length === 1 && providers[0]?.provider === 'local' && providers[0]?.searched === true && providers[0]?.status === 'ok',
    `${probe.workId} primary search left local-only scope`);
  const hits = array(providers[0]?.hits, `${probe.workId} primary hits`).map(object); const hit = hits[0]; const locator = object(hit?.locator);
  const documentId = locator?.documentId as string; const sectionKey = locator?.sectionKey as string;
  const uri = locator?.uri;
  const readiness = object(hit?.editionReadiness);
  assert(hit !== undefined && locator?.kind === 'mcp_resource' && documentId === probe.workId && typeof sectionKey === 'string'
    && locator.uri === buildLocalDocumentResourceUri(documentId, sectionKey)
    && authoritative.editionId === probe.editionId && canonicalJson(readiness) === canonicalJson(authoritative.readiness),
  `${probe.workId} primary locator/edition readiness is not coherent with the authoritative catalog`);
  const coverage = object(output.coverage);
  if (profile.primarySource.contractVersion === '7') {
    assert(coverage?.ccelAttempted === false && coverage.ccelHitCount === 0 && !Object.hasOwn(coverage, 'ccelStatus'),
      `${probe.workId} preview primary search attempted CCEL`);
  } else {
    assert(!Object.hasOwn(coverage ?? {}, 'ccelAttempted') && !Object.hasOwn(coverage ?? {}, 'ccelHitCount') && !Object.hasOwn(coverage ?? {}, 'ccelStatus'),
      `${probe.workId} production primary search exposed CCEL execution`);
  }
  return uri as string;
}

function assertSectionRead(message: ObjectRecord, expectedUri: string, workId: string): void {
  const text = contentText(message, expectedUri, `${workId} direct section`);
  assert(text.length > 0 && !/data:(?:image|application)\/|<img\b|<!doctype\b|\.(?:jpe?g|png|gif|webp|pdf)\b/iu.test(text),
    `${workId} exact local section is not normalized text`);
}

function assertInvalidResource(message: ObjectRecord): void {
  assert(message.result === undefined, 'historical-spine invalid resource returned a result');
  const error = object(message.error);
  assert(error?.code === -32602 && (error.message === 'Resource not found' || error.message === 'MCP error -32602: Resource not found'),
    'historical-spine invalid resource regression drifted');
}

function assertInvalidCursor(raw: RawToolResult): void {
  const serialized = JSON.stringify(raw.raw);
  assert(raw.isError && raw.structuredContent === undefined && raw.text.length >= 1
    && !/https?:\/\/|theologai:\/\/|authorization|bearer|api[\s_-]?key|secret|token|sqlite|sql|d1|database|stack|traceback|not-a-valid-cursor/iu.test(serialized),
  'historical-spine invalid cursor regression leaked implementation detail');
}

function assertSafeEvidence(value: unknown): void {
  const allowed = new Set([
    'schemaVersion', 'audit', 'endpointClass', 'fixtureSha256', 'durationMs', 'negotiated', 'budgets', 'records', 'regressions',
    'protocolVersion', 'serverName', 'serverVersion', 'logicalOperations', 'maximumLogicalOperations', 'httpExchanges', 'maximumHttpExchanges',
    'retryCount', 'perRequestMaximumDurationMs', 'maximumDurationMs', 'maximumMcpResponseBytes', 'aggregateMcpResponseBytes', 'maximumAggregateMcpResponseBytes',
    'workId', 'editionId', 'passed', 'sectionCount', 'paginationChecked', 'landingRead', 'sectionRead', 'naturalGlobalSearch', 'globalSearchRead', 'scopedPrimarySearch',
    'invalidResourceRejected', 'invalidCursorRejected',
  ]);
  const visit = (input: unknown): void => {
    if (typeof input === 'string') {
      assert(!/https?:\/\/|theologai:\/\/|authorization|bearer|api[\s_-]?key|secret|token|password|cookie|sqlite|sql|d1|database|stack|traceback/iu.test(input),
        'sanitized historical-spine evidence leaked a URI, credential-shaped value, storage detail, or stack trace');
      return;
    }
    if (Array.isArray(input)) { input.forEach(visit); return; }
    const record = object(input); if (!record) return;
    for (const [key, item] of Object.entries(record)) { assert(allowed.has(key), `sanitized historical-spine evidence leaked unreviewed ${key} field`); visit(item); }
  };
  visit(value);
}

export async function runHistoricalSpineAudit(
  fixture: HistoricalSpineAuditFixture,
  profile: SpineProfile,
  fetchImpl: typeof fetch = fetch,
  deadline = new AuditDeadline(Date.now, Date.now(), MAX_DURATION_MS),
): Promise<ObjectRecord> {
  validateHistoricalSpineFixture(fixture);
  deadline.setProfile(profile);
  const client = new FixedAuditMcp(fetchImpl, deadline, profile, {
    maxLogicalOperations: MAX_LOGICAL_OPERATIONS, maxHttpExchanges: MAX_HTTP_EXCHANGES,
    userAgent: 'TheologAI-HistoricalSpine-{profile}-Audit/1.0',
  });
  const negotiated = assertInitialize(await client.initialize(), profile);
  await client.initialized();
  assertTools(await client.toolsList());
  assertResources(await client.resourcesList());
  const authoritative = assertAuthoritativeCatalog(await client.readResource('theologai://primary-sources/catalog'), fixture);
  assertCatalog(await client.callTool('classic_text_lookup', { listWorks: true }), fixture, authoritative);
  const records: ObjectRecord[] = [];
  for (const [probeIndex, probe] of fixture.probes.entries()) {
    const resourceBytes = assertLanding(await client.callTool('classic_text_lookup', { work: probe.workId }), probe);
    assertLandingRead(await client.readResource(landingUri(probe.workId)), probe, resourceBytes);
    const directory = assertDirectory(await client.callTool('classic_text_lookup', { work: probe.workId, browseSections: true }), probe);
    if (probe.requiresPagination) assertPagination(await client.callTool('classic_text_lookup', { work: probe.workId, browseSections: true, cursor: directory.nextCursor! }), probe, directory);
    const globalSearchUri = assertClassicSearch(await client.callTool('classic_text_lookup', { query: probe.query }), probe, authoritative.get(probe.workId)!);
    assertSectionRead(await client.readResource(globalSearchUri), globalSearchUri, probe.workId);
    const sectionUri = assertPrimary(await client.callTool('primary_source_search', { queries: [{
      // Query IDs are transport identifiers, not work identifiers.  Keep the
      // fixed audit inventory independent of arbitrary catalog-slug length.
      id: `spine-${String(probeIndex + 1).padStart(2, '0')}`, text: probe.query, work: probe.workId, match: 'all_terms', selection: 'relevance', limit: 5,
      ...(profile.primarySource.contractVersion === '7' ? { searchDepth: 'standard' } : { providers: ['local'] }),
    }] }), probe, profile, authoritative.get(probe.workId)!);
    assertSectionRead(await client.readResource(sectionUri), sectionUri, probe.workId);
    records.push({ workId: probe.workId, editionId: authoritative.get(probe.workId)!.editionId, passed: true, sectionCount: probe.sectionCount, paginationChecked: probe.requiresPagination,
      landingRead: true, sectionRead: true, naturalGlobalSearch: true, globalSearchRead: true, scopedPrimarySearch: true });
  }
  const invalidUri = 'theologai://documents/does-not-exist#section-not-real';
  assertInvalidResource(await client.readResource(invalidUri));
  assertInvalidCursor(await client.callTool('classic_text_lookup', { work: fixture.probes[0].workId, browseSections: true, cursor: 'not-a-valid-cursor' }));
  client.complete();
  const evidence = {
    schemaVersion: 1, audit: profile.audit, endpointClass: profile.endpointClass, fixtureSha256: sha256(await readFile(FIXTURE_PATH, 'utf8')),
    durationMs: deadline.elapsed(), negotiated,
    budgets: {
      logicalOperations: client.counters.logical, maximumLogicalOperations: MAX_LOGICAL_OPERATIONS, httpExchanges: client.counters.http, maximumHttpExchanges: MAX_HTTP_EXCHANGES,
      retryCount: 0, perRequestMaximumDurationMs: MAX_REQUEST_DURATION_MS, maximumDurationMs: MAX_DURATION_MS, maximumMcpResponseBytes: MAX_MCP_RESPONSE_BYTES,
      aggregateMcpResponseBytes: client.aggregateResponseBytes(), maximumAggregateMcpResponseBytes: MAX_AGGREGATE_MCP_RESPONSE_BYTES,
    },
    records,
    regressions: { invalidResourceRejected: true, invalidCursorRejected: true },
  };
  assert(client.aggregateResponseBytes() <= MAX_AGGREGATE_MCP_RESPONSE_BYTES, 'historical-spine aggregate response budget exceeded');
  assertSafeEvidence(evidence);
  assert(bytes(JSON.stringify(evidence)) <= MAX_EVIDENCE_BYTES, 'sanitized historical-spine evidence exceeds 128 KiB ceiling');
  return evidence;
}

export async function runHistoricalSpinePreviewAudit(fixture: HistoricalSpineAuditFixture, fetchImpl: typeof fetch = fetch, deadline?: AuditDeadline): Promise<ObjectRecord> {
  return runHistoricalSpineAudit(fixture, SPINE_PREVIEW_PROFILE, fetchImpl, deadline);
}
export async function runHistoricalSpineProductionAudit(fixture: HistoricalSpineAuditFixture, fetchImpl: typeof fetch = fetch, deadline?: AuditDeadline): Promise<ObjectRecord> {
  return runHistoricalSpineAudit(fixture, SPINE_PRODUCTION_PROFILE, fetchImpl, deadline);
}

export interface HistoricalSpineAuditCliDependencies {
  now?: () => number;
  runAudit?: (fixture: HistoricalSpineAuditFixture, deadline: AuditDeadline) => Promise<ObjectRecord>;
}
export async function runHistoricalSpineAuditCli(
  args: string[], profile: SpineProfile, dependencies: HistoricalSpineAuditCliDependencies = {},
): Promise<{ output: string; evidence: ObjectRecord; probeCount: number }> {
  assert(args.length === 0 || (args.length === 2 && args[0] === '--output' && typeof args[1] === 'string' && args[1].length > 0),
    `usage: audit:historical-spine-${profile.label} [--output path]`);
  const deadline = new AuditDeadline(dependencies.now, undefined, MAX_DURATION_MS); deadline.setProfile(profile);
  const output = resolve(args.length === 0 ? `test-output/historical-spine-${profile.label}-audit-${new Date().toISOString().replaceAll(':', '-')}.json` : args[1]!);
  await assertAuditOutputAbsent(output);
  const fixture = validateHistoricalSpineFixture(JSON.parse(await readFile(FIXTURE_PATH, 'utf8')));
  const evidence = dependencies.runAudit === undefined
    ? await runHistoricalSpineAudit(fixture, profile, fetch, deadline)
    : await dependencies.runAudit(fixture, deadline);
  await publishAuditEvidence(output, evidence, deadline);
  return { output, evidence, probeCount: fixture.probes.length };
}

export async function runHistoricalSpinePreviewAuditCli(args: string[], dependencies: HistoricalSpineAuditCliDependencies = {}) {
  return runHistoricalSpineAuditCli(args, SPINE_PREVIEW_PROFILE, dependencies);
}

async function main(): Promise<void> {
  const { output, probeCount } = await runHistoricalSpinePreviewAuditCli(process.argv.slice(2));
  console.log(`PASS: ${probeCount} Transform-11 historical-spine works; evidence: ${output}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
