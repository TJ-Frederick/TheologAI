/** Read-only, source-replayed authority audit for inactive Norton Transform 12. */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NORTON_NORMALIZED_TEXT_RIGHTS_PENDING,
  NORTON_TRANSFORM12,
  loadNortonTransform12Authority,
  nortonTransform12BoundaryHashes,
  type NortonTransform12Section,
} from './historical-transform12-norton.js';

export interface NortonTransform12AuditPage {
  rows: readonly unknown[];
  responseBytes: number;
}

export type NortonTransform12AuditReader = (sql: string) => NortonTransform12AuditPage;

export interface NortonTransform12AuthorityAuditResult {
  pages: number;
  rows: number;
  packageSha256: string;
  orderedTextSha256: string;
  sectionsSha256: string;
  boundaryHashes: ReturnType<typeof nortonTransform12BoundaryHashes>;
}

type StoredSection = NortonTransform12Section & { ftsParity: number };

const MAX_RESPONSE_BYTES = 1_000_000;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function readBounded(reader: NortonTransform12AuditReader, sql: string, maxRows: number): unknown[] {
  if (!/^\s*SELECT\b/i.test(sql) || /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|PRAGMA|ATTACH|DETACH)\b/i.test(sql)) {
    throw new Error('Transform 12 Norton authority audit query is not read-only');
  }
  const page = reader(sql);
  if (!Array.isArray(page.rows) || page.rows.length > maxRows) {
    throw new Error(`Transform 12 Norton authority page exceeds ${maxRows} rows`);
  }
  if (!Number.isSafeInteger(page.responseBytes) || page.responseBytes < 0
    || page.responseBytes > MAX_RESPONSE_BYTES) {
    throw new Error(`Transform 12 Norton authority page exceeds ${MAX_RESPONSE_BYTES} bytes`);
  }
  return page.rows;
}

function parseSection(value: unknown): StoredSection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Transform 12 Norton authority section is not an object');
  }
  const row = value as Record<string, unknown>;
  const keys = ['sectionKey', 'sourceOrdinal', 'displayLabel', 'heading', 'content', 'ftsParity'];
  if (canonical(Object.keys(row).sort()) !== canonical(keys.sort())) {
    throw new Error('Transform 12 Norton authority section projection shape drifted');
  }
  if (typeof row.sectionKey !== 'string' || !Number.isSafeInteger(row.sourceOrdinal)
    || typeof row.displayLabel !== 'string' || typeof row.heading !== 'string'
    || typeof row.content !== 'string' || row.ftsParity !== 1) {
    throw new Error('Transform 12 Norton authority section or external-content FTS parity drifted');
  }
  return {
    sectionKey: row.sectionKey,
    sourceOrdinal: row.sourceOrdinal as number,
    displayLabel: row.displayLabel,
    heading: row.heading,
    content: row.content,
    ftsParity: 1,
  };
}

/**
 * Replays the pinned XML normalization and reads every exact body in eight-row
 * keyset pages. 1,250 rows therefore require exactly 157 ordered pages.
 */
export function auditNortonTransform12Authority(
  root: string,
  reader: NortonTransform12AuditReader,
): NortonTransform12AuthorityAuditResult {
  const expected = loadNortonTransform12Authority({
    read(path: string, encoding?: BufferEncoding): Buffer | string {
      return encoding === undefined
        ? readFileSync(join(root, path))
        : readFileSync(join(root, path), encoding);
    },
  } as never);
  const actual: NortonTransform12Section[] = [];
  let lastOrdinal = 0;
  let lastKey = '';
  let pages = 0;
  while (actual.length < NORTON_TRANSFORM12.sectionCount) {
    const rows = readBounded(reader, `SELECT section.section_key AS sectionKey,
      section.source_ordinal AS sourceOrdinal, section.display_label AS displayLabel,
      section.heading, section.content,
      CASE WHEN fts.rowid = section.rowid AND fts.edition_id IS section.edition_id
        AND fts.section_key IS section.section_key AND fts.heading IS section.heading
        AND fts.content IS section.content
        AND section.rowid - section.source_ordinal = (
          SELECT MIN(first.rowid) - 1 FROM historical_edition_sections first
          WHERE first.edition_id = section.edition_id
        ) THEN 1 ELSE 0 END AS ftsParity
      FROM historical_edition_sections section
      LEFT JOIN historical_edition_sections_fts fts ON fts.rowid = section.rowid
      WHERE section.edition_id = ${literal(NORTON_TRANSFORM12.editionId)}
        AND (section.source_ordinal > ${lastOrdinal}
          OR (section.source_ordinal = ${lastOrdinal} AND section.section_key > ${literal(lastKey)}))
      ORDER BY section.source_ordinal, section.section_key
      LIMIT ${NORTON_TRANSFORM12.authorityPageSize}`, NORTON_TRANSFORM12.authorityPageSize).map(parseSection);
    const remaining = NORTON_TRANSFORM12.sectionCount - actual.length;
    const wantedPageRows = Math.min(NORTON_TRANSFORM12.authorityPageSize, remaining);
    if (rows.length !== wantedPageRows) {
      throw new Error(`Transform 12 Norton authority page ${pages + 1} has ${rows.length}; expected ${wantedPageRows}`);
    }
    for (const row of rows) {
      if (row.sourceOrdinal <= lastOrdinal || row.sectionKey !== `a17662-source-ordinal-${String(row.sourceOrdinal).padStart(4, '0')}`) {
        throw new Error('Transform 12 Norton authority sections are not strictly ordered by frozen identity');
      }
      const { ftsParity: _, ...section } = row;
      actual.push(section);
      lastOrdinal = row.sourceOrdinal;
      lastKey = row.sectionKey;
    }
    pages++;
  }
  if (pages !== NORTON_TRANSFORM12.authorityPages
    || hash(canonical(actual)) !== hash(canonical(expected.sections))) {
    throw new Error('Transform 12 Norton complete ordered body authority drifted');
  }

  const metadataRows = readBounded(reader, `SELECT
    pack.revision, pack.schema_version AS schemaVersion, pack.manifest_sha256 AS packageSha256,
    pack.source_path AS packagePath, work.title, work.creator_metadata_status AS creatorMetadataStatus,
    work.creators_json AS creatorsJson, edition.work_id AS workId, edition.pack_id AS packId,
    edition.provenance_uncertainty AS provenanceUncertainty,
    edition.normalized_text_rights_json AS normalizedTextRightsJson,
    artifact.locator, artifact.pin_value AS sourceXmlSha256, artifact.bytes AS sourceXmlBytes,
    publication.document_id AS documentId, publication.immutable_corpus_identity AS immutableCorpusIdentity,
    publication.section_package_identity AS sectionPackageIdentity,
    publication.section_count AS sectionCount, publication.landing_max_bytes AS landingMaxBytes,
    publication.browse_page_size AS browsePageSize, publication.cursor_contract AS cursorContract,
    publication.cursor_version AS cursorVersion, publication.cursor_identity AS cursorIdentity,
    publication.body_delivery AS bodyDelivery, publication.canonical_uri AS canonicalUri,
    publication.activation_state AS activationState,
    (SELECT COUNT(*) FROM historical_editions WHERE pack_id = pack.pack_id) AS authorityEditions,
    (SELECT COUNT(*) FROM historical_source_artifacts WHERE edition_id = publication.edition_id) AS authorityArtifacts,
    (SELECT COUNT(*) FROM historical_edition_sections WHERE edition_id = publication.edition_id) AS authoritySections,
    (SELECT COUNT(*) FROM historical_edition_sections_fts
      WHERE edition_id = publication.edition_id) AS authorityFtsRows,
    (SELECT COUNT(*) FROM documents WHERE id = publication.document_id) AS publicDocuments,
    (SELECT COUNT(*) FROM document_sections WHERE document_id = publication.document_id) AS publicSections,
    (SELECT COUNT(*) FROM historical_document_delivery_profiles WHERE document_id = publication.document_id
      OR edition_id = publication.edition_id) AS publicProfiles,
    (SELECT COUNT(*) FROM historical_section_identities WHERE document_id = publication.document_id) AS publicIdentities,
    (SELECT COUNT(*) FROM historical_section_aliases WHERE document_id = publication.document_id) AS publicAliases
    FROM historical_source_packs pack
    JOIN historical_editions edition ON edition.pack_id = pack.pack_id
    JOIN historical_works work ON work.work_id = edition.work_id
    JOIN historical_source_artifacts artifact ON artifact.edition_id = edition.edition_id
    JOIN historical_sectioned_publications publication ON publication.edition_id = edition.edition_id
    WHERE pack.pack_id = ${literal(NORTON_TRANSFORM12.packId)} LIMIT 1`, 1);
  const expectedMetadata = {
    revision: '1', schemaVersion: 'norton-transform12-inactive.v1',
    packageSha256: NORTON_TRANSFORM12.packageSha256, packagePath: NORTON_TRANSFORM12.packagePath,
    title: expected.work.title, creatorMetadataStatus: expected.work.creatorMetadataStatus,
    creatorsJson: JSON.stringify(expected.work.creators), workId: NORTON_TRANSFORM12.workId,
    packId: NORTON_TRANSFORM12.packId,
    provenanceUncertainty: expected.edition.provenance.uncertainty,
    normalizedTextRightsJson: JSON.stringify(NORTON_NORMALIZED_TEXT_RIGHTS_PENDING),
    locator: expected.edition.source.locator, sourceXmlSha256: NORTON_TRANSFORM12.sourceXmlSha256,
    sourceXmlBytes: NORTON_TRANSFORM12.sourceXmlBytes, documentId: NORTON_TRANSFORM12.editionId,
    immutableCorpusIdentity: NORTON_TRANSFORM12.orderedTextSha256,
    sectionPackageIdentity: NORTON_TRANSFORM12.packageSha256,
    sectionCount: NORTON_TRANSFORM12.sectionCount, landingMaxBytes: NORTON_TRANSFORM12.landingMaxBytes,
    browsePageSize: NORTON_TRANSFORM12.browsePageSize, cursorContract: NORTON_TRANSFORM12.cursorContract,
    cursorVersion: NORTON_TRANSFORM12.cursorVersion, cursorIdentity: expected.publication.cursorIdentity,
    bodyDelivery: 'exact_section_only', canonicalUri: expected.publication.canonicalUri,
    activationState: 'dormant', authorityEditions: 1, authorityArtifacts: 1,
    authoritySections: 1_250, authorityFtsRows: 1_250,
    publicDocuments: 0, publicSections: 0, publicProfiles: 0,
    publicIdentities: 0, publicAliases: 0,
  };
  if (metadataRows.length !== 1 || canonical(metadataRows[0]) !== canonical(expectedMetadata)) {
    throw new Error('Transform 12 Norton lineage, rights, dormant seam, or public-inertness authority drifted');
  }
  return {
    pages,
    rows: actual.length,
    packageSha256: expected.packageSha256,
    orderedTextSha256: expected.orderedTextSha256,
    sectionsSha256: hash(canonical(actual)),
    boundaryHashes: nortonTransform12BoundaryHashes(expected),
  };
}
