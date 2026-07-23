/**
 * Read-only Transform-8 authority audit shared by SQLite, local Workerd, and
 * remote D1 gates. Metadata markers are useful tripwires, but this audit also
 * re-reads the stored sidecars in a fixed order and compares canonical hashes
 * with projections regenerated from the manifest-bound sources and attestation.
 */

import {
  verifyHistoricalSectionCompatibilityAttestationFromDisk,
} from './historical-section-compatibility-compiler.js';
import {
  readHistoricalSectionSources,
  sha256Canonical,
} from './historical-section-key-plan.js';
import { HISTORICAL_SECTION_TRANSFORM_8_COUNTS } from './historical-section-compatibility-materialization.js';

/** A fixed keyset page keeps remote D1 execution count and response size bounded. */
export const HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_SIZE = 256;
/** Bound the decoded JSON data for one authority page in every verifier. */
export const HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_MAX_BYTES = 1_000_000;
/** Bound the full Wrangler/D1 JSON envelope before parsing it. */
export const HISTORICAL_TRANSFORM8_D1_RESPONSE_MAX_BYTES = 1_250_000;
/** Body/FTS is a deterministic parity sample, not a substitute for source hashing. */
export const HISTORICAL_TRANSFORM8_BODY_FTS_SAMPLE_SIZE = 32;

export interface HistoricalTransform8ProfileProjection {
  documentId: string;
  workId: string | null;
  editionId: string | null;
  immutableCorpusIdentity: string;
  sectionPackageIdentity: string | null;
  deliveryMode: string;
  sectionCount: number;
  landingMaxBytes: number;
  browsePageSize: number;
  cursorVersion: number;
  provenanceJson: string;
  rightsJson: string;
}

export interface HistoricalTransform8IdentityProjection {
  documentId: string;
  sectionKey: string;
  sourceOrdinal: number;
  /** Internal storage link, bound to this exact source ordinal by Transform 8. */
  documentSectionId: number;
}

export interface HistoricalTransform8AliasProjection {
  documentId: string;
  legacySectionId: string;
  sectionKey: string;
  sourceOrdinal: number;
}

export interface HistoricalTransform8BodyFtsParityProjection {
  documentId: string;
  sectionKey: string;
  sourceOrdinal: number;
  legacySectionId: string;
  title: string;
  content: string;
  topics: string;
  ftsTitle: string;
  ftsContent: string;
  ftsTopics: string;
}

export interface HistoricalTransform8AuthorityPage {
  rows: readonly unknown[];
  /** UTF-8 bytes in the decoded response representation supplied by the reader. */
  responseBytes: number;
}

export type HistoricalTransform8AuthorityReader = (sql: string) => HistoricalTransform8AuthorityPage;

export interface HistoricalTransform8AuthorityAuditResult {
  attestationSha256: string;
  profilesSha256: string;
  identitiesSha256: string;
  aliasesSha256: string;
  bodyFtsSampleSha256: string;
  pages: Readonly<Record<'profiles' | 'identities' | 'aliases', number>>;
}

export interface HistoricalTransform8ExpectedAuthority {
  attestationSha256: string;
  profiles: HistoricalTransform8ProfileProjection[];
  identities: HistoricalTransform8IdentityProjection[];
  aliases: HistoricalTransform8AliasProjection[];
  bodyFtsSample: HistoricalTransform8BodyFtsParityProjection[];
}

interface PageSpec<Row> {
  name: 'profiles' | 'identities' | 'aliases';
  expected: readonly Row[];
  sql: (last: Row | undefined) => string;
  parse: (value: unknown) => Row;
  compare: (left: Row, right: Row) => number;
}

/**
 * Regenerate the complete Transform-8 sidecar authority from the reviewed
 * key plan, sources, evidence, and attestation. No D1 metadata is trusted as
 * an authority for this calculation.
 */
export function buildHistoricalTransform8ExpectedAuthority(root: string): HistoricalTransform8ExpectedAuthority {
  const compilation = verifyHistoricalSectionCompatibilityAttestationFromDisk(root);
  const sourcesByDocument = new Map(readHistoricalSectionSources(root).map(source => [source.documentId, source]));
  const profiles: HistoricalTransform8ProfileProjection[] = [];
  const identities: HistoricalTransform8IdentityProjection[] = [];
  const aliases: HistoricalTransform8AliasProjection[] = [];
  const bodyFts: HistoricalTransform8BodyFtsParityProjection[] = [];

  // Build-database materializes the 17 source files in the same bytewise
  // filename order used by readHistoricalSectionSources, into an otherwise
  // empty document_sections table. The resulting storage link is internal,
  // but it must remain bound to this exact source row so a canonical key can
  // never be redirected to a different section body.
  const storageIdBySourceRow = new Map<string, number>();
  let nextDocumentSectionId = 1;
  for (const source of sourcesByDocument.values()) {
    for (let sourceOrdinal = 1; sourceOrdinal <= source.value.sections.length; sourceOrdinal++) {
      storageIdBySourceRow.set(`${source.documentId}\u0000${sourceOrdinal}`, nextDocumentSectionId++);
    }
  }

  for (const document of compilation.map.documents) {
    const source = sourcesByDocument.get(document.documentId);
    if (!source || source.value.sections.length !== document.sections.length) {
      throw new Error(`Transform 8 authoritative source coverage drift for ${document.documentId}`);
    }
    const immutableCorpusIdentity = sha256Canonical(source.value);
    profiles.push({
      documentId: document.documentId,
      workId: null,
      editionId: null,
      immutableCorpusIdentity,
      sectionPackageIdentity: null,
      deliveryMode: 'complete_document',
      sectionCount: document.sections.length,
      landingMaxBytes: 0,
      browsePageSize: 0,
      cursorVersion: 0,
      provenanceJson: JSON.stringify({
        status: 'legacy_local_document_without_edition_assertion',
        sourcePath: source.sourcePath,
        sourceCanonicalSha256: immutableCorpusIdentity,
        sectionKeyPlanCanonicalSha256: compilation.attestation.inputs.historicalSectionKeyPlanCanonicalSha256,
      }),
      rightsJson: JSON.stringify({
        status: 'not_retroactively_asserted',
        editionRights: 'not_established',
        redistributionApproval: 'not_asserted',
      }),
    });
    for (const section of document.sections) {
      const raw = source.value.sections[section.sourceOrdinal - 1] as Record<string, unknown>;
      const title = String(raw.title || raw.question || raw.chapter || raw.q || '');
      const content = String(raw.content || raw.answer || raw.a || '');
      const topics = JSON.stringify(raw.topics || []);
      const documentSectionId = storageIdBySourceRow.get(`${document.documentId}\u0000${section.sourceOrdinal}`);
      if (!Number.isSafeInteger(documentSectionId) || documentSectionId < 1) {
        throw new Error(`Transform 8 has no deterministic storage link for ${document.documentId} source ordinal ${section.sourceOrdinal}`);
      }
      identities.push({
        documentId: document.documentId,
        sectionKey: section.sectionKey,
        sourceOrdinal: section.sourceOrdinal,
        documentSectionId,
      });
      bodyFts.push({
        documentId: document.documentId,
        sectionKey: section.sectionKey,
        sourceOrdinal: section.sourceOrdinal,
        legacySectionId: section.legacySectionId,
        title,
        content,
        topics,
        ftsTitle: title,
        ftsContent: content,
        ftsTopics: topics,
      });
    }
    for (const alias of document.legacyAliases) {
      aliases.push({
        documentId: document.documentId,
        legacySectionId: alias.legacySectionId,
        sectionKey: alias.targetSectionKey,
        sourceOrdinal: alias.targetSourceOrdinal,
      });
    }
  }

  const expected: HistoricalTransform8ExpectedAuthority = {
    attestationSha256: sha256Canonical(compilation.attestation),
    profiles: profiles.sort(compareProfiles),
    identities: identities.sort(compareIdentities),
    aliases: aliases.sort(compareAliases),
    bodyFtsSample: bodyFts.sort(compareIdentities).slice(0, HISTORICAL_TRANSFORM8_BODY_FTS_SAMPLE_SIZE),
  };
  if (expected.profiles.length !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.historical_document_delivery_profiles
    || expected.identities.length !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.historical_section_identities
    || expected.aliases.length !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.historical_section_aliases
    || compilation.attestation.exactCounts.collisionGroups !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.collisionGroups
    || compilation.attestation.exactCounts.affectedSections !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.affectedSections
    || compilation.attestation.exactCounts.newlyAddressableSections !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.newlyAddressableSections) {
    throw new Error('Transform 8 authoritative inventory no longer matches the frozen 17/3054/2821 and 23/256/233 contract');
  }
  return expected;
}

/**
 * Re-read all stored sidecars through bounded keyset pages and compare their
 * canonical projections with newly regenerated authority. The body/FTS sample
 * is deliberately only a 32-row parity tripwire; full body source authority is
 * proved by the existing local database verifier.
 */
export function auditHistoricalTransform8Authority(
  root: string,
  readPage: HistoricalTransform8AuthorityReader,
  expectedAuthority = buildHistoricalTransform8ExpectedAuthority(root),
): HistoricalTransform8AuthorityAuditResult {
  const expected = expectedAuthority;
  const profiles = readPaged(readPage, {
    name: 'profiles',
    expected: expected.profiles,
    sql: last => `SELECT document_id AS documentId, work_id AS workId, edition_id AS editionId,
      immutable_corpus_identity AS immutableCorpusIdentity,
      section_package_identity AS sectionPackageIdentity, delivery_mode AS deliveryMode,
      section_count AS sectionCount, landing_max_bytes AS landingMaxBytes,
      browse_page_size AS browsePageSize, cursor_version AS cursorVersion,
      provenance_json AS provenanceJson, rights_json AS rightsJson
      FROM historical_document_delivery_profiles WHERE delivery_mode = 'complete_document'${last ? ` AND document_id > ${sqlLiteral(last.documentId)}` : ''}
      ORDER BY document_id LIMIT ${HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_SIZE}`,
    parse: parseProfile,
    compare: compareProfiles,
  });
  const identities = readPaged(readPage, {
    name: 'identities',
    expected: expected.identities,
    sql: last => `SELECT identity.document_id AS documentId, identity.section_key AS sectionKey, identity.source_ordinal AS sourceOrdinal,
      identity.document_section_id AS documentSectionId
      FROM historical_section_identities identity
      JOIN historical_document_delivery_profiles profile
        ON profile.document_id = identity.document_id AND profile.delivery_mode = 'complete_document'${last ? ` WHERE identity.document_id > ${sqlLiteral(last.documentId)}
        OR (identity.document_id = ${sqlLiteral(last.documentId)} AND (identity.source_ordinal > ${last.sourceOrdinal}
          OR (identity.source_ordinal = ${last.sourceOrdinal} AND identity.section_key > ${sqlLiteral(last.sectionKey)})))` : ''}
      ORDER BY identity.document_id, identity.source_ordinal, identity.section_key LIMIT ${HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_SIZE}`,
    parse: parseIdentity,
    compare: compareIdentities,
  });
  const aliases = readPaged(readPage, {
    name: 'aliases',
    expected: expected.aliases,
    sql: last => `SELECT document_id AS documentId, legacy_section_id AS legacySectionId,
      section_key AS sectionKey, source_ordinal AS sourceOrdinal
      FROM historical_section_aliases${last ? ` WHERE document_id > ${sqlLiteral(last.documentId)}
        OR (document_id = ${sqlLiteral(last.documentId)} AND legacy_section_id > ${sqlLiteral(last.legacySectionId)})` : ''}
      ORDER BY document_id, legacy_section_id LIMIT ${HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_SIZE}`,
    parse: parseAlias,
    compare: compareAliases,
  });
  const bodyFtsSample = readSample(readPage, expected.bodyFtsSample);

  assertProjectionHash('profiles', profiles.rows, expected.profiles);
  assertProjectionHash('identities', identities.rows, expected.identities);
  assertProjectionHash('aliases', aliases.rows, expected.aliases);
  assertProjectionHash('body/FTS sample', bodyFtsSample, expected.bodyFtsSample);

  return {
    attestationSha256: expected.attestationSha256,
    profilesSha256: sha256Canonical(profiles.rows),
    identitiesSha256: sha256Canonical(identities.rows),
    aliasesSha256: sha256Canonical(aliases.rows),
    bodyFtsSampleSha256: sha256Canonical(bodyFtsSample),
    pages: { profiles: profiles.pages, identities: identities.pages, aliases: aliases.pages },
  };
}

/**
 * Decode the one-statement JSON envelope emitted by `wrangler d1 execute
 * --json`. The wrapper layout has changed across Wrangler releases, so locate
 * the successful statement result structurally instead of trusting a fixed
 * array offset. The page byte cap is checked before JSON parsing.
 */
export function parseHistoricalTransform8D1Page(raw: string): HistoricalTransform8AuthorityPage {
  const responseBytes = Buffer.byteLength(raw, 'utf8');
  if (responseBytes > HISTORICAL_TRANSFORM8_D1_RESPONSE_MAX_BYTES) {
    throw new Error(`Transform 8 D1 authority response exceeds the ${HISTORICAL_TRANSFORM8_D1_RESPONSE_MAX_BYTES}-byte envelope limit`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Transform 8 D1 authority response is not valid JSON');
  }
  const candidates: Array<{ results: unknown[]; success: unknown }> = [];
  collectD1StatementResults(parsed, candidates);
  if (candidates.length !== 1 || candidates[0]!.success !== true) {
    throw new Error('Transform 8 D1 authority response must contain exactly one successful statement result');
  }
  return { rows: candidates[0]!.results, responseBytes };
}

function readPaged<Row>(
  readPage: HistoricalTransform8AuthorityReader,
  spec: PageSpec<Row>,
): { rows: Row[]; pages: number } {
  const rows: Row[] = [];
  let last: Row | undefined;
  let pages = 0;
  const maxPages = Math.ceil(spec.expected.length / HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_SIZE) + 1;
  while (true) {
    if (pages >= maxPages) throw new Error(`Transform 8 ${spec.name} authority pagination exceeded its exact bound`);
    const page = readAndValidatePage(readPage, spec.name, spec.sql(last));
    const parsed = page.rows.map(spec.parse);
    for (const row of parsed) {
      if (last && spec.compare(last, row) >= 0) {
        throw new Error(`Transform 8 ${spec.name} authority page is not strictly ordered`);
      }
      last = row;
      rows.push(row);
    }
    pages++;
    if (page.rows.length < HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_SIZE) return { rows, pages };
  }
}

function collectD1StatementResults(
  value: unknown,
  candidates: Array<{ results: unknown[]; success: unknown }>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectD1StatementResults(item, candidates);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.results) && 'success' in record) {
    candidates.push({ results: record.results, success: record.success });
    return;
  }
  for (const child of Object.values(record)) collectD1StatementResults(child, candidates);
}

function readSample(
  readPage: HistoricalTransform8AuthorityReader,
  expected: readonly HistoricalTransform8BodyFtsParityProjection[],
): HistoricalTransform8BodyFtsParityProjection[] {
  const page = readAndValidatePage(readPage, 'body/FTS sample', `SELECT
    identity.document_id AS documentId, identity.section_key AS sectionKey,
    identity.source_ordinal AS sourceOrdinal, section.section_number AS legacySectionId,
    section.title AS title, section.content AS content, section.topics AS topics,
    fts.title AS ftsTitle, fts.content AS ftsContent, fts.topics AS ftsTopics
    FROM historical_section_identities identity
    JOIN document_sections section
      ON section.id = identity.document_section_id AND section.document_id = identity.document_id
    JOIN historical_document_delivery_profiles profile
      ON profile.document_id = identity.document_id AND profile.delivery_mode = 'complete_document'
    LEFT JOIN sections_fts fts ON fts.rowid = section.id
    ORDER BY identity.document_id, identity.source_ordinal, identity.section_key
    LIMIT ${HISTORICAL_TRANSFORM8_BODY_FTS_SAMPLE_SIZE}`);
  if (page.rows.length !== expected.length) {
    throw new Error(`Transform 8 body/FTS sample count mismatch: expected ${expected.length}, received ${page.rows.length}`);
  }
  return page.rows.map(parseBodyFtsParity);
}

function readAndValidatePage(
  readPage: HistoricalTransform8AuthorityReader,
  name: string,
  sql: string,
): HistoricalTransform8AuthorityPage {
  if (!/^\s*SELECT\b/i.test(sql) || /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|PRAGMA|ATTACH|DETACH)\b/i.test(sql)) {
    throw new Error(`Transform 8 ${name} authority query is not read-only`);
  }
  const page = readPage(sql);
  if (!Number.isSafeInteger(page.responseBytes) || page.responseBytes < 0
    || page.responseBytes > HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_MAX_BYTES) {
    throw new Error(`Transform 8 ${name} authority page exceeds the ${HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_MAX_BYTES}-byte response limit`);
  }
  if (!Array.isArray(page.rows) || page.rows.length > HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_SIZE) {
    throw new Error(`Transform 8 ${name} authority page exceeds the ${HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_SIZE}-row limit`);
  }
  return page;
}

function parseProfile(value: unknown): HistoricalTransform8ProfileProjection {
  const row = exactRecord(value, [
    'documentId', 'workId', 'editionId', 'immutableCorpusIdentity', 'sectionPackageIdentity', 'deliveryMode',
    'sectionCount', 'landingMaxBytes', 'browsePageSize', 'cursorVersion', 'provenanceJson', 'rightsJson',
  ], 'profile');
  return {
    documentId: stringValue(row.documentId, 'profile.documentId'),
    workId: nullableStringValue(row.workId, 'profile.workId'),
    editionId: nullableStringValue(row.editionId, 'profile.editionId'),
    immutableCorpusIdentity: stringValue(row.immutableCorpusIdentity, 'profile.immutableCorpusIdentity'),
    sectionPackageIdentity: nullableStringValue(row.sectionPackageIdentity, 'profile.sectionPackageIdentity'),
    deliveryMode: stringValue(row.deliveryMode, 'profile.deliveryMode'),
    sectionCount: positiveInteger(row.sectionCount, 'profile.sectionCount'),
    landingMaxBytes: nonNegativeInteger(row.landingMaxBytes, 'profile.landingMaxBytes'),
    browsePageSize: nonNegativeInteger(row.browsePageSize, 'profile.browsePageSize'),
    cursorVersion: nonNegativeInteger(row.cursorVersion, 'profile.cursorVersion'),
    provenanceJson: stringValue(row.provenanceJson, 'profile.provenanceJson'),
    rightsJson: stringValue(row.rightsJson, 'profile.rightsJson'),
  };
}

function parseIdentity(value: unknown): HistoricalTransform8IdentityProjection {
  const row = exactRecord(value, ['documentId', 'sectionKey', 'sourceOrdinal', 'documentSectionId'], 'identity');
  return {
    documentId: stringValue(row.documentId, 'identity.documentId'),
    sectionKey: stringValue(row.sectionKey, 'identity.sectionKey'),
    sourceOrdinal: positiveInteger(row.sourceOrdinal, 'identity.sourceOrdinal'),
    documentSectionId: positiveInteger(row.documentSectionId, 'identity.documentSectionId'),
  };
}

function parseAlias(value: unknown): HistoricalTransform8AliasProjection {
  const row = exactRecord(value, ['documentId', 'legacySectionId', 'sectionKey', 'sourceOrdinal'], 'alias');
  return {
    documentId: stringValue(row.documentId, 'alias.documentId'),
    legacySectionId: stringValue(row.legacySectionId, 'alias.legacySectionId'),
    sectionKey: stringValue(row.sectionKey, 'alias.sectionKey'),
    sourceOrdinal: positiveInteger(row.sourceOrdinal, 'alias.sourceOrdinal'),
  };
}

function parseBodyFtsParity(value: unknown): HistoricalTransform8BodyFtsParityProjection {
  const row = exactRecord(value, [
    'documentId', 'sectionKey', 'sourceOrdinal', 'legacySectionId', 'title', 'content', 'topics',
    'ftsTitle', 'ftsContent', 'ftsTopics',
  ], 'body/FTS sample');
  return {
    documentId: stringValue(row.documentId, 'body/FTS sample.documentId'),
    sectionKey: stringValue(row.sectionKey, 'body/FTS sample.sectionKey'),
    sourceOrdinal: positiveInteger(row.sourceOrdinal, 'body/FTS sample.sourceOrdinal'),
    legacySectionId: stringValue(row.legacySectionId, 'body/FTS sample.legacySectionId'),
    title: stringValue(row.title, 'body/FTS sample.title'),
    content: stringValue(row.content, 'body/FTS sample.content'),
    topics: stringValue(row.topics, 'body/FTS sample.topics'),
    ftsTitle: stringValue(row.ftsTitle, 'body/FTS sample.ftsTitle'),
    ftsContent: stringValue(row.ftsContent, 'body/FTS sample.ftsContent'),
    ftsTopics: stringValue(row.ftsTopics, 'body/FTS sample.ftsTopics'),
  };
}

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Transform 8 ${label} authority row is not an object`);
  }
  const row = value as Record<string, unknown>;
  const actual = Object.keys(row).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Transform 8 ${label} authority row has an unexpected projection shape`);
  }
  return row;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Transform 8 ${label} must be a string`);
  return value;
}

function nullableStringValue(value: unknown, label: string): string | null {
  if (value === null) return null;
  return stringValue(value, label);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`Transform 8 ${label} must be a positive integer`);
  return value as number;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`Transform 8 ${label} must be a non-negative integer`);
  return value as number;
}

function assertProjectionHash<Row>(name: string, actual: readonly Row[], expected: readonly Row[]): void {
  if (actual.length !== expected.length || sha256Canonical(actual) !== sha256Canonical(expected)) {
    throw new Error(`Transform 8 ${name} authority projection does not match regenerated attested authority`);
  }
}

function compareProfiles(left: HistoricalTransform8ProfileProjection, right: HistoricalTransform8ProfileProjection): number {
  return compareStrings(left.documentId, right.documentId);
}

function compareIdentities(left: HistoricalTransform8IdentityProjection, right: HistoricalTransform8IdentityProjection): number {
  return compareStrings(left.documentId, right.documentId)
    || left.sourceOrdinal - right.sourceOrdinal
    || compareStrings(left.sectionKey, right.sectionKey);
}

function compareAliases(left: HistoricalTransform8AliasProjection, right: HistoricalTransform8AliasProjection): number {
  return compareStrings(left.documentId, right.documentId)
    || compareStrings(left.legacySectionId, right.legacySectionId);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
