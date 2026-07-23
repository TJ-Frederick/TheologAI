/**
 * Read-only Transform-9 authority audit for reviewed historical source packs.
 *
 * The normal readiness predicate proves that a D1 database is structurally
 * complete. This audit separately regenerates the approved source-pack
 * projection from the checksum-bound inputs, then compares every persisted
 * authority row through bounded, ordered SELECT pages. It intentionally does
 * not fetch source artifacts or rely on a database metadata marker.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDataManifest } from './d1-corpus-identity.js';
import {
  CORE_EIGHT_SOURCE_PACK_COUNTS,
  assertCoreEightSourcePackRelease,
  buildHistoricalSourcePackDocumentMetadata,
  loadHistoricalSourcePacks,
} from './historical-source-packs.js';
import { readHistoricalSectionSources, sha256Canonical } from './historical-section-key-plan.js';
import {
  parseHistoricalTransform8D1Page,
  type HistoricalTransform8AuthorityPage,
} from './historical-transform8-authority-audit.js';

/** A conservative page limit keeps full-text authority reads well below D1 limits. */
export const HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_SIZE = 64;
export const HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_MAX_BYTES = 1_000_000;
/** Full historical bodies use a tighter page to remain below D1's response cap. */
export const HISTORICAL_TRANSFORM9_SECTION_PAGE_SIZE = 8;

export type HistoricalTransform9AuthorityReader = (sql: string) => HistoricalTransform8AuthorityPage;

type PackProjection = {
  packId: string; revision: string; schemaVersion: string; manifestSha256: string; sourcePath: string;
};
type WorkProjection = {
  workId: string; title: string; creatorMetadataStatus: string; creatorsJson: string;
};
type EditionProjection = {
  editionId: string; workId: string; packId: string; language: string; contributorGroupsJson: string;
  publication: string; version: string; provenanceStatus: string; provenanceUncertainty: string | null;
  provenanceReviewedAt: string; underlyingWorkRightsJson: string; exactArtifactRightsJson: string;
  normalizedTextRightsJson: string;
};
type ArtifactProjection = {
  artifactId: string; editionId: string; role: string; locator: string; pinKind: string; pinValue: string;
  sha256: string; bytes: number; acquiredAt: string;
};
type DocumentProjection = {
  documentId: string; title: string; type: string; date: string | null; metadata: string;
};
type ProfileProjection = {
  documentId: string; workId: string; editionId: string; immutableCorpusIdentity: string;
  sectionPackageIdentity: string; deliveryMode: string; sectionCount: number; landingMaxBytes: number;
  browsePageSize: number; cursorVersion: number; provenanceJson: string; rightsJson: string;
};
type SectionProjection = {
  editionId: string; sectionKey: string; sourceOrdinal: number; displayLabel: string; heading: string;
  content: string;
};
type ProjectionProjection = {
  editionId: string; sectionKey: string; sourceOrdinal: number; documentId: string | null;
  documentSectionId: number | null; profileSelectionValid: number; identityLinkValid: number;
  documentSectionParity: number; editionFtsParity: number; runtimeFtsParity: number;
};

export interface HistoricalTransform9ExpectedAuthority {
  packs: PackProjection[];
  works: WorkProjection[];
  editions: EditionProjection[];
  artifacts: ArtifactProjection[];
  documents: DocumentProjection[];
  profiles: ProfileProjection[];
  sections: SectionProjection[];
  projections: ProjectionProjection[];
}

export interface HistoricalTransform9AuthorityAuditResult {
  hashes: Readonly<Record<keyof HistoricalTransform9ExpectedAuthority, string>>;
  pages: Readonly<Record<keyof HistoricalTransform9ExpectedAuthority, number>>;
}

interface PageSpec<Row> {
  readonly name: keyof HistoricalTransform9ExpectedAuthority;
  readonly expected: readonly Row[];
  readonly sql: (last: Row | undefined) => string;
  readonly parse: (value: unknown) => Row;
  readonly compare: (left: Row, right: Row) => number;
  readonly pageSize?: number;
}

/** Regenerate the complete reviewed core-eight projection from pinned inputs. */
export function buildHistoricalTransform9ExpectedAuthority(root: string): HistoricalTransform9ExpectedAuthority {
  const manifest = parseDataManifest(readFileSync(join(root, 'data', 'data-manifest.json')));
  const records = loadHistoricalSourcePacks(manifest.materializations.d1.inputs, {
    read: path => readFileSync(join(root, path), 'utf8'),
  });
  assertCoreEightSourcePackRelease(records);

  const packs = new Map<string, PackProjection>();
  const works = new Map<string, WorkProjection>();
  const editions: EditionProjection[] = [];
  const artifacts: ArtifactProjection[] = [];
  const documents: DocumentProjection[] = [];
  const profiles: ProfileProjection[] = [];
  const sections: SectionProjection[] = [];
  const projections: ProjectionProjection[] = [];
  let nextDocumentSectionId = readHistoricalSectionSources(root)
    .reduce((total, source) => total + source.value.sections.length, 0) + 1;
  for (const record of records) {
    const { work, edition, sections: editionSections } = record.compiled.package;
    packs.set(record.packId, {
      packId: record.packId, revision: record.revision, schemaVersion: record.manifestSchemaVersion,
      manifestSha256: record.manifestSha256 ?? record.compiled.sha256, sourcePath: record.sourcePath,
    });
    works.set(work.workId, {
      workId: work.workId, title: work.title, creatorMetadataStatus: work.creatorMetadataStatus,
      creatorsJson: JSON.stringify(work.creators),
    });
    editions.push({
      editionId: edition.editionId, workId: work.workId, packId: record.packId, language: edition.language,
      contributorGroupsJson: JSON.stringify(edition.contributorGroups), publication: edition.publication,
      version: edition.version, provenanceStatus: edition.provenance.status,
      provenanceUncertainty: edition.provenance.uncertainty, provenanceReviewedAt: edition.provenance.reviewedAt,
      underlyingWorkRightsJson: JSON.stringify(edition.underlyingWorkRights),
      exactArtifactRightsJson: JSON.stringify(edition.exactArtifactRights),
      normalizedTextRightsJson: JSON.stringify(record.normalizedTextRights),
    });
    for (const artifact of record.artifacts) {
      artifacts.push({
        artifactId: artifact.artifactId, editionId: edition.editionId, role: artifact.role,
        locator: artifact.locator, pinKind: 'sha256', pinValue: artifact.sha256, sha256: artifact.sha256,
        bytes: artifact.bytes, acquiredAt: artifact.acquiredAt,
      });
    }
    const metadata = JSON.stringify(buildHistoricalSourcePackDocumentMetadata(
      record.packId, record.compiled, record.normalizedTextRights, record.catalog, record.artifacts,
    ));
    documents.push({ documentId: work.workId, title: work.title, type: 'historical_work', date: null, metadata });
    profiles.push({
      documentId: work.workId, workId: work.workId, editionId: edition.editionId,
      immutableCorpusIdentity: record.compiled.sha256, sectionPackageIdentity: record.compiled.sha256,
      deliveryMode: 'sectioned_only', sectionCount: editionSections.length, landingMaxBytes: 16_384,
      browsePageSize: 32, cursorVersion: 1,
      provenanceJson: JSON.stringify({
        status: 'reviewed_edition_aligned_normalized_transcription', sourcePackId: record.packId,
        revision: record.revision, manifestSha256: record.manifestSha256 ?? record.compiled.sha256,
        packageSha256: record.compiled.sha256, sourcePath: record.sourcePath,
      }),
      rightsJson: JSON.stringify({
        status: 'reviewed_normalized_public_domain_text', normalizedTextRights: record.normalizedTextRights,
        underlyingWorkRights: edition.underlyingWorkRights, exactArtifactRights: edition.exactArtifactRights,
      }),
    });
    for (const section of editionSections) {
      sections.push({
        editionId: edition.editionId, sectionKey: section.sectionKey, sourceOrdinal: section.sourceOrdinal,
        displayLabel: section.displayLabel, heading: section.heading, content: section.content,
      });
      projections.push({
        editionId: edition.editionId, sectionKey: section.sectionKey, sourceOrdinal: section.sourceOrdinal,
        documentId: work.workId, documentSectionId: nextDocumentSectionId++, profileSelectionValid: 1,
        identityLinkValid: 1, documentSectionParity: 1, editionFtsParity: 1, runtimeFtsParity: 1,
      });
    }
  }

  const expected: HistoricalTransform9ExpectedAuthority = {
    packs: [...packs.values()].sort(comparePack),
    works: [...works.values()].sort(compareWork),
    editions: editions.sort(compareEdition),
    artifacts: artifacts.sort(compareArtifact),
    documents: documents.sort(compareDocument),
    profiles: profiles.sort(compareProfile),
    sections: sections.sort(compareSection),
    projections: projections.sort(compareProjection),
  };
  if (expected.packs.length !== CORE_EIGHT_SOURCE_PACK_COUNTS.packs
    || expected.works.length !== CORE_EIGHT_SOURCE_PACK_COUNTS.works
    || expected.editions.length !== CORE_EIGHT_SOURCE_PACK_COUNTS.editions
    || expected.artifacts.length !== CORE_EIGHT_SOURCE_PACK_COUNTS.artifacts
    || expected.documents.length !== CORE_EIGHT_SOURCE_PACK_COUNTS.works
    || expected.profiles.length !== CORE_EIGHT_SOURCE_PACK_COUNTS.deliveryProfiles
    || expected.sections.length !== CORE_EIGHT_SOURCE_PACK_COUNTS.sections
    || expected.projections.length !== CORE_EIGHT_SOURCE_PACK_COUNTS.sections) {
    throw new Error('Transform 9 regenerated authority no longer matches the reviewed core-eight 1/8/8/25/512 inventory');
  }
  return expected;
}

/**
 * Read every reviewed projection through ordered keyset pages. Any extra row,
 * missing row, altered JSON, or broken section/FTS/identity join changes a
 * canonical hash and fails the gate.
 */
export function auditHistoricalTransform9Authority(
  root: string,
  readPage: HistoricalTransform9AuthorityReader,
  expected = buildHistoricalTransform9ExpectedAuthority(root),
): HistoricalTransform9AuthorityAuditResult {
  const results = {
    packs: readPaged(readPage, packSpec(expected.packs)),
    works: readPaged(readPage, workSpec(expected.works)),
    editions: readPaged(readPage, editionSpec(expected.editions)),
    artifacts: readPaged(readPage, artifactSpec(expected.artifacts)),
    documents: readPaged(readPage, documentSpec(expected.documents)),
    profiles: readPaged(readPage, profileSpec(expected.profiles)),
    sections: readPaged(readPage, sectionSpec(expected.sections)),
    projections: readPaged(readPage, projectionSpec(expected.projections)),
  };
  const hashes = {} as Record<keyof HistoricalTransform9ExpectedAuthority, string>;
  const pages = {} as Record<keyof HistoricalTransform9ExpectedAuthority, number>;
  for (const name of Object.keys(results) as Array<keyof HistoricalTransform9ExpectedAuthority>) {
    const actual = results[name].rows as never[];
    const wanted = expected[name] as never[];
    if (actual.length !== wanted.length || sha256Canonical(actual) !== sha256Canonical(wanted)) {
      throw new Error(`Transform 9 ${name} authority projection does not match regenerated source-pack authority`);
    }
    hashes[name] = sha256Canonical(actual);
    pages[name] = results[name].pages;
  }
  return { hashes, pages };
}

/** The Transform-8 envelope decoder is transport-generic and bounds JSON before parsing. */
export const parseHistoricalTransform9D1Page = parseHistoricalTransform8D1Page;

function packSpec(expected: readonly PackProjection[]): PageSpec<PackProjection> {
  return {
    name: 'packs', expected, compare: comparePack, parse: value => parseRow(value, ['packId', 'revision', 'schemaVersion', 'manifestSha256', 'sourcePath'], 'pack', {
      packId: string, revision: string, schemaVersion: string, manifestSha256: string, sourcePath: string,
    }),
    sql: last => `SELECT pack_id AS packId, revision, schema_version AS schemaVersion, manifest_sha256 AS manifestSha256, source_path AS sourcePath
      FROM historical_source_packs${last ? ` WHERE pack_id > ${literal(last.packId)}` : ''} ORDER BY pack_id LIMIT ${HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_SIZE}`,
  };
}

function workSpec(expected: readonly WorkProjection[]): PageSpec<WorkProjection> {
  return {
    name: 'works', expected, compare: compareWork, parse: value => parseRow(value, ['workId', 'title', 'creatorMetadataStatus', 'creatorsJson'], 'work', {
      workId: string, title: string, creatorMetadataStatus: string, creatorsJson: string,
    }),
    sql: last => `SELECT work_id AS workId, title, creator_metadata_status AS creatorMetadataStatus, creators_json AS creatorsJson
      FROM historical_works${last ? ` WHERE work_id > ${literal(last.workId)}` : ''} ORDER BY work_id LIMIT ${HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_SIZE}`,
  };
}

function editionSpec(expected: readonly EditionProjection[]): PageSpec<EditionProjection> {
  return {
    name: 'editions', expected, compare: compareEdition, parse: value => parseRow(value, editionKeys, 'edition', editionParsers),
    sql: last => `SELECT edition_id AS editionId, work_id AS workId, pack_id AS packId, language,
      contributor_groups_json AS contributorGroupsJson, publication, version, provenance_status AS provenanceStatus,
      provenance_uncertainty AS provenanceUncertainty, provenance_reviewed_at AS provenanceReviewedAt,
      underlying_work_rights_json AS underlyingWorkRightsJson, exact_artifact_rights_json AS exactArtifactRightsJson,
      normalized_text_rights_json AS normalizedTextRightsJson
      FROM historical_editions${last ? ` WHERE edition_id > ${literal(last.editionId)}` : ''} ORDER BY edition_id LIMIT ${HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_SIZE}`,
  };
}

function artifactSpec(expected: readonly ArtifactProjection[]): PageSpec<ArtifactProjection> {
  return {
    name: 'artifacts', expected, compare: compareArtifact, parse: value => parseRow(value, artifactKeys, 'artifact', artifactParsers),
    sql: last => `SELECT artifact_id AS artifactId, edition_id AS editionId, role, locator, pin_kind AS pinKind,
      pin_value AS pinValue, sha256, bytes, acquired_at AS acquiredAt
      FROM historical_source_artifacts${last ? ` WHERE artifact_id > ${literal(last.artifactId)}` : ''} ORDER BY artifact_id LIMIT ${HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_SIZE}`,
  };
}

function documentSpec(expected: readonly DocumentProjection[]): PageSpec<DocumentProjection> {
  return {
    name: 'documents', expected, compare: compareDocument, parse: value => parseRow(value, documentKeys, 'document', documentParsers),
    sql: last => `SELECT document.id AS documentId, document.title, document.type, document.date, document.metadata
      FROM documents document JOIN historical_document_delivery_profiles profile
        ON profile.document_id = document.id AND profile.delivery_mode = 'sectioned_only'${last ? ` WHERE document.id > ${literal(last.documentId)}` : ''}
      ORDER BY document.id LIMIT ${HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_SIZE}`,
  };
}

function profileSpec(expected: readonly ProfileProjection[]): PageSpec<ProfileProjection> {
  return {
    name: 'profiles', expected, compare: compareProfile, parse: value => parseRow(value, profileKeys, 'profile', profileParsers),
    sql: last => `SELECT document_id AS documentId, work_id AS workId, edition_id AS editionId,
      immutable_corpus_identity AS immutableCorpusIdentity, section_package_identity AS sectionPackageIdentity,
      delivery_mode AS deliveryMode, section_count AS sectionCount, landing_max_bytes AS landingMaxBytes,
      browse_page_size AS browsePageSize, cursor_version AS cursorVersion, provenance_json AS provenanceJson,
      rights_json AS rightsJson
      FROM historical_document_delivery_profiles WHERE delivery_mode = 'sectioned_only'${last ? ` AND document_id > ${literal(last.documentId)}` : ''}
      ORDER BY document_id LIMIT ${HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_SIZE}`,
  };
}

function sectionSpec(expected: readonly SectionProjection[]): PageSpec<SectionProjection> {
  return {
    name: 'sections', expected, compare: compareSection, parse: value => parseRow(value, sectionKeys, 'section', sectionParsers),
    pageSize: HISTORICAL_TRANSFORM9_SECTION_PAGE_SIZE,
    sql: last => `SELECT edition_id AS editionId, section_key AS sectionKey, source_ordinal AS sourceOrdinal,
      display_label AS displayLabel, heading, content
      FROM historical_edition_sections${last ? ` WHERE edition_id > ${literal(last.editionId)}
        OR (edition_id = ${literal(last.editionId)} AND (source_ordinal > ${last.sourceOrdinal}
          OR (source_ordinal = ${last.sourceOrdinal} AND section_key > ${literal(last.sectionKey)})))` : ''}
      ORDER BY edition_id, source_ordinal, section_key LIMIT ${HISTORICAL_TRANSFORM9_SECTION_PAGE_SIZE}`,
  };
}

function projectionSpec(expected: readonly ProjectionProjection[]): PageSpec<ProjectionProjection> {
  return {
    name: 'projections', expected, compare: compareProjection,
    parse: value => parseRow(value, projectionKeys, 'projection', projectionParsers),
    sql: last => `SELECT edition.edition_id AS editionId, edition.section_key AS sectionKey,
      edition.source_ordinal AS sourceOrdinal, profile.document_id AS documentId,
      identity.document_section_id AS documentSectionId,
      CASE WHEN profile.document_id = profile.work_id AND profile.edition_id = selected.edition_id
        AND profile.work_id = selected.work_id THEN 1 ELSE 0 END AS profileSelectionValid,
      CASE WHEN identity.document_id = profile.document_id AND identity.section_key = edition.section_key
        AND identity.source_ordinal = edition.source_ordinal AND identity.document_section_id IS NOT NULL
        THEN 1 ELSE 0 END AS identityLinkValid,
      CASE WHEN section.id = identity.document_section_id AND section.document_id = identity.document_id
        AND section.section_number = edition.section_key AND section.title IS edition.heading
        AND section.content IS edition.content AND section.topics = '[]' THEN 1 ELSE 0 END AS documentSectionParity,
      CASE WHEN edition_fts.rowid IS NOT NULL AND edition_fts.heading IS edition.heading
        AND edition_fts.content IS edition.content THEN 1 ELSE 0 END AS editionFtsParity,
      CASE WHEN runtime_fts.rowid = section.id AND runtime_fts.title IS section.title
        AND runtime_fts.content IS section.content AND runtime_fts.topics IS section.topics
        THEN 1 ELSE 0 END AS runtimeFtsParity
      FROM historical_edition_sections edition
      LEFT JOIN historical_editions selected ON selected.edition_id = edition.edition_id
      LEFT JOIN historical_document_delivery_profiles profile
        ON profile.edition_id = selected.edition_id AND profile.work_id = selected.work_id
          AND profile.delivery_mode = 'sectioned_only'
      LEFT JOIN historical_section_identities identity
        ON identity.document_id = profile.document_id AND identity.section_key = edition.section_key
          AND identity.source_ordinal = edition.source_ordinal
      LEFT JOIN document_sections section ON section.id = identity.document_section_id
      LEFT JOIN historical_edition_sections_fts edition_fts
        ON edition_fts.edition_id = edition.edition_id AND edition_fts.section_key = edition.section_key
      LEFT JOIN sections_fts runtime_fts ON runtime_fts.rowid = section.id${last ? ` WHERE edition.edition_id > ${literal(last.editionId)}
        OR (edition.edition_id = ${literal(last.editionId)} AND (edition.source_ordinal > ${last.sourceOrdinal}
          OR (edition.source_ordinal = ${last.sourceOrdinal} AND edition.section_key > ${literal(last.sectionKey)})))` : ''}
      ORDER BY edition.edition_id, edition.source_ordinal, edition.section_key LIMIT ${HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_SIZE}`,
  };
}

function readPaged<Row>(reader: HistoricalTransform9AuthorityReader, spec: PageSpec<Row>): { rows: Row[]; pages: number } {
  const rows: Row[] = [];
  let last: Row | undefined;
  let pages = 0;
  const pageSize = spec.pageSize ?? HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_SIZE;
  const maxPages = Math.ceil(spec.expected.length / pageSize) + 1;
  while (true) {
    if (pages >= maxPages) throw new Error(`Transform 9 ${spec.name} authority pagination exceeded its exact bound`);
    const page = readAuthorityPage(reader, spec.name, spec.sql(last), pageSize);
    for (const value of page.rows) {
      const row = spec.parse(value);
      if (last && spec.compare(last, row) >= 0) throw new Error(`Transform 9 ${spec.name} authority page is not strictly ordered`);
      rows.push(row);
      last = row;
    }
    pages++;
    if (page.rows.length < pageSize) return { rows, pages };
  }
}

function readAuthorityPage(
  reader: HistoricalTransform9AuthorityReader,
  name: string,
  sql: string,
  rowLimit: number,
): HistoricalTransform8AuthorityPage {
  if (!/^\s*SELECT\b/i.test(sql) || /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|PRAGMA|ATTACH|DETACH)\b/i.test(sql)) {
    throw new Error(`Transform 9 ${name} authority query is not read-only`);
  }
  const page = reader(sql);
  if (!Number.isSafeInteger(page.responseBytes) || page.responseBytes < 0 || page.responseBytes > HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_MAX_BYTES) {
    throw new Error(`Transform 9 ${name} authority page exceeds the ${HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_MAX_BYTES}-byte response limit`);
  }
  if (!Array.isArray(page.rows) || page.rows.length > rowLimit) {
    throw new Error(`Transform 9 ${name} authority page exceeds the ${rowLimit}-row limit`);
  }
  return page;
}

type Parser<T> = (value: unknown, label: string) => T;
const string: Parser<string> = (value, label) => {
  if (typeof value !== 'string') throw new Error(`Transform 9 ${label} must be a string`);
  return value;
};
const nullableString: Parser<string | null> = (value, label) => value === null ? null : string(value, label);
const positiveInteger: Parser<number> = (value, label) => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`Transform 9 ${label} must be a positive integer`);
  return value as number;
};
const nullablePositiveInteger: Parser<number | null> = (value, label) => value === null ? null : positiveInteger(value, label);
const booleanInteger: Parser<number> = (value, label) => {
  if (value !== 0 && value !== 1) throw new Error(`Transform 9 ${label} must be 0 or 1`);
  return value;
};
const nonNegativeInteger: Parser<number> = (value, label) => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`Transform 9 ${label} must be a non-negative integer`);
  return value as number;
};

function parseRow<T extends Record<string, unknown>>(
  value: unknown, keys: readonly string[], label: string, parsers: { [K in keyof T]: Parser<T[K]> },
): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Transform 9 ${label} authority row is not an object`);
  const row = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`Transform 9 ${label} authority row has an unexpected projection shape`);
  }
  return Object.fromEntries(keys.map(key => [key, parsers[key as keyof T](row[key], `${label}.${key}`)])) as T;
}

const editionKeys = ['editionId', 'workId', 'packId', 'language', 'contributorGroupsJson', 'publication', 'version', 'provenanceStatus', 'provenanceUncertainty', 'provenanceReviewedAt', 'underlyingWorkRightsJson', 'exactArtifactRightsJson', 'normalizedTextRightsJson'] as const;
const editionParsers = { editionId: string, workId: string, packId: string, language: string, contributorGroupsJson: string, publication: string, version: string, provenanceStatus: string, provenanceUncertainty: nullableString, provenanceReviewedAt: string, underlyingWorkRightsJson: string, exactArtifactRightsJson: string, normalizedTextRightsJson: string };
const artifactKeys = ['artifactId', 'editionId', 'role', 'locator', 'pinKind', 'pinValue', 'sha256', 'bytes', 'acquiredAt'] as const;
const artifactParsers = { artifactId: string, editionId: string, role: string, locator: string, pinKind: string, pinValue: string, sha256: string, bytes: positiveInteger, acquiredAt: string };
const documentKeys = ['documentId', 'title', 'type', 'date', 'metadata'] as const;
const documentParsers = { documentId: string, title: string, type: string, date: nullableString, metadata: string };
const profileKeys = ['documentId', 'workId', 'editionId', 'immutableCorpusIdentity', 'sectionPackageIdentity', 'deliveryMode', 'sectionCount', 'landingMaxBytes', 'browsePageSize', 'cursorVersion', 'provenanceJson', 'rightsJson'] as const;
const profileParsers = { documentId: string, workId: string, editionId: string, immutableCorpusIdentity: string, sectionPackageIdentity: string, deliveryMode: string, sectionCount: positiveInteger, landingMaxBytes: positiveInteger, browsePageSize: positiveInteger, cursorVersion: positiveInteger, provenanceJson: string, rightsJson: string };
const sectionKeys = ['editionId', 'sectionKey', 'sourceOrdinal', 'displayLabel', 'heading', 'content'] as const;
const sectionParsers = { editionId: string, sectionKey: string, sourceOrdinal: positiveInteger, displayLabel: string, heading: string, content: string };
const projectionKeys = ['editionId', 'sectionKey', 'sourceOrdinal', 'documentId', 'documentSectionId', 'profileSelectionValid', 'identityLinkValid', 'documentSectionParity', 'editionFtsParity', 'runtimeFtsParity'] as const;
const projectionParsers = { editionId: string, sectionKey: string, sourceOrdinal: positiveInteger, documentId: nullableString, documentSectionId: nullablePositiveInteger, profileSelectionValid: booleanInteger, identityLinkValid: booleanInteger, documentSectionParity: booleanInteger, editionFtsParity: booleanInteger, runtimeFtsParity: booleanInteger };

function comparePack(left: PackProjection, right: PackProjection): number { return compareString(left.packId, right.packId); }
function compareWork(left: WorkProjection, right: WorkProjection): number { return compareString(left.workId, right.workId); }
function compareEdition(left: EditionProjection, right: EditionProjection): number { return compareString(left.editionId, right.editionId); }
function compareArtifact(left: ArtifactProjection, right: ArtifactProjection): number { return compareString(left.artifactId, right.artifactId); }
function compareDocument(left: DocumentProjection, right: DocumentProjection): number { return compareString(left.documentId, right.documentId); }
function compareProfile(left: ProfileProjection, right: ProfileProjection): number { return compareString(left.documentId, right.documentId); }
function compareSection(left: SectionProjection, right: SectionProjection): number {
  return compareString(left.editionId, right.editionId) || left.sourceOrdinal - right.sourceOrdinal || compareString(left.sectionKey, right.sectionKey);
}
function compareProjection(left: ProjectionProjection, right: ProjectionProjection): number {
  return compareString(left.editionId, right.editionId) || left.sourceOrdinal - right.sourceOrdinal || compareString(left.sectionKey, right.sectionKey);
}
function compareString(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function literal(value: string): string { return `'${value.replaceAll("'", "''")}'`; }
