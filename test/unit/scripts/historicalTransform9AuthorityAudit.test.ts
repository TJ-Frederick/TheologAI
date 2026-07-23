import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  auditHistoricalTransform9Authority,
  buildHistoricalTransform9ExpectedAuthority,
  HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_SIZE,
  HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_MAX_BYTES,
  HISTORICAL_TRANSFORM9_SECTION_PAGE_SIZE,
  parseHistoricalTransform9D1Page,
  type HistoricalTransform9ExpectedAuthority,
} from '../../../scripts/historical-transform9-authority-audit.js';
import { HISTORICAL_TRANSFORM8_D1_RESPONSE_MAX_BYTES } from '../../../scripts/historical-transform8-authority-audit.js';

const ROOT = process.cwd();

function authorityDatabase(expected: HistoricalTransform9ExpectedAuthority): Database.Database {
  const database = new Database(':memory:');
  database.exec(`CREATE TABLE historical_source_packs (pack_id TEXT, revision TEXT, schema_version TEXT, manifest_sha256 TEXT, source_path TEXT);
    CREATE TABLE historical_works (work_id TEXT, title TEXT, creator_metadata_status TEXT, creators_json TEXT);
    CREATE TABLE historical_editions (edition_id TEXT, work_id TEXT, pack_id TEXT, language TEXT, contributor_groups_json TEXT, publication TEXT, version TEXT, provenance_status TEXT, provenance_uncertainty TEXT, provenance_reviewed_at TEXT, underlying_work_rights_json TEXT, exact_artifact_rights_json TEXT, normalized_text_rights_json TEXT);
    CREATE TABLE historical_source_artifacts (artifact_id TEXT, edition_id TEXT, role TEXT, locator TEXT, pin_kind TEXT, pin_value TEXT, sha256 TEXT, bytes INTEGER, acquired_at TEXT);
    CREATE TABLE documents (id TEXT, title TEXT, type TEXT, date TEXT, metadata TEXT);
    CREATE TABLE historical_document_delivery_profiles (document_id TEXT, work_id TEXT, edition_id TEXT, immutable_corpus_identity TEXT, section_package_identity TEXT, delivery_mode TEXT, section_count INTEGER, landing_max_bytes INTEGER, browse_page_size INTEGER, cursor_version INTEGER, provenance_json TEXT, rights_json TEXT);
    CREATE TABLE historical_edition_sections (edition_id TEXT, section_key TEXT, source_ordinal INTEGER, display_label TEXT, heading TEXT, content TEXT);
    CREATE TABLE historical_section_identities (document_id TEXT, section_key TEXT, source_ordinal INTEGER, document_section_id INTEGER);
    CREATE TABLE document_sections (id INTEGER PRIMARY KEY, document_id TEXT, section_number TEXT, title TEXT, content TEXT, topics TEXT);
    CREATE TABLE historical_edition_sections_fts (edition_id TEXT, section_key TEXT, heading TEXT, content TEXT);
    CREATE TABLE sections_fts (title TEXT, content TEXT, topics TEXT);`);
  const insert = (sql: string, values: readonly unknown[]) => database.prepare(sql).run(...values);
  for (const row of expected.packs) insert('INSERT INTO historical_source_packs VALUES (?, ?, ?, ?, ?)', [row.packId, row.revision, row.schemaVersion, row.manifestSha256, row.sourcePath]);
  for (const row of expected.works) insert('INSERT INTO historical_works VALUES (?, ?, ?, ?)', [row.workId, row.title, row.creatorMetadataStatus, row.creatorsJson]);
  for (const row of expected.editions) insert('INSERT INTO historical_editions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [row.editionId, row.workId, row.packId, row.language, row.contributorGroupsJson, row.publication, row.version, row.provenanceStatus, row.provenanceUncertainty, row.provenanceReviewedAt, row.underlyingWorkRightsJson, row.exactArtifactRightsJson, row.normalizedTextRightsJson]);
  for (const row of expected.artifacts) insert('INSERT INTO historical_source_artifacts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [row.artifactId, row.editionId, row.role, row.locator, row.pinKind, row.pinValue, row.sha256, row.bytes, row.acquiredAt]);
  for (const row of expected.documents) insert('INSERT INTO documents VALUES (?, ?, ?, ?, ?)', [row.documentId, row.title, row.type, row.date, row.metadata]);
  for (const row of expected.profiles) insert('INSERT INTO historical_document_delivery_profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [row.documentId, row.workId, row.editionId, row.immutableCorpusIdentity, row.sectionPackageIdentity, row.deliveryMode, row.sectionCount, row.landingMaxBytes, row.browsePageSize, row.cursorVersion, row.provenanceJson, row.rightsJson]);
  for (const row of expected.sections) insert('INSERT INTO historical_edition_sections VALUES (?, ?, ?, ?, ?, ?)', [row.editionId, row.sectionKey, row.sourceOrdinal, row.displayLabel, row.heading, row.content]);
  for (const row of expected.projections) {
    const section = expected.sections.find(candidate => candidate.editionId === row.editionId && candidate.sectionKey === row.sectionKey)!;
    insert('INSERT INTO historical_section_identities VALUES (?, ?, ?, ?)', [row.documentId, row.sectionKey, row.sourceOrdinal, row.documentSectionId]);
    insert('INSERT INTO document_sections VALUES (?, ?, ?, ?, ?, ?)', [row.documentSectionId, row.documentId, row.sectionKey, section.heading, section.content, '[]']);
    insert('INSERT INTO historical_edition_sections_fts VALUES (?, ?, ?, ?)', [row.editionId, row.sectionKey, section.heading, section.content]);
    insert('INSERT INTO sections_fts(rowid, title, content, topics) VALUES (?, ?, ?, ?)', [row.documentSectionId, section.heading, section.content, '[]']);
  }
  return database;
}

function audit(database: Database.Database, expected: HistoricalTransform9ExpectedAuthority, sql?: string[]) {
  return auditHistoricalTransform9Authority(ROOT, query => {
    sql?.push(query);
    const rows = database.prepare(query).all();
    return { rows, responseBytes: Buffer.byteLength(JSON.stringify(rows), 'utf8') };
  }, expected);
}

function withinSavepoint(database: Database.Database, mutate: () => void): void {
  database.exec('SAVEPOINT transform9_authority_mutation');
  try {
    mutate();
  } finally {
    database.exec('ROLLBACK TO transform9_authority_mutation');
    database.exec('RELEASE transform9_authority_mutation');
  }
}

describe('Transform 9 ordered authority audit', () => {
  it('reads direct normalized authority separately from compact runtime projections', () => {
    const expected = buildHistoricalTransform9ExpectedAuthority(ROOT);
    const database = authorityDatabase(expected);
    try {
      const sql: string[] = [];
      const result = audit(database, expected, sql);
      expect(result.pages.sections).toBe(65); // 512 full bodies at 8 rows plus a terminating empty page.
      expect(result.pages.projections).toBe(9); // 512 compact rows at 64 plus a terminating empty page.
      expect(sql.every(query => /^\s*SELECT\b/i.test(query) && !/\bOFFSET\b/i.test(query))).toBe(true);
      const authorityQueries = sql.filter(query => query.includes('FROM historical_edition_sections')
        && !query.includes('LEFT JOIN historical_editions'));
      expect(authorityQueries).toHaveLength(65);
      expect(authorityQueries.every(query => query.includes(`LIMIT ${HISTORICAL_TRANSFORM9_SECTION_PAGE_SIZE}`))).toBe(true);
      expect(authorityQueries.every(query => !query.includes('historical_document_delivery_profiles'))).toBe(true);
      const projectionQueries = sql.filter(query => query.includes('profileSelectionValid'));
      expect(projectionQueries).toHaveLength(9);
      expect(projectionQueries.every(query => query.includes(`LIMIT ${HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_SIZE}`))).toBe(true);
      expect(projectionQueries.every(query => query.includes('LEFT JOIN sections_fts runtime_fts'))).toBe(true);

      withinSavepoint(database, () => {
        // No matching identity/profile/FTS row is created. A join-driven audit
        // would omit it; direct authority pagination must reject it.
        database.prepare(`INSERT INTO historical_edition_sections VALUES
          ('wesley-standard-sermons-1771', 'audit-orphan-extra', 999, 'Audit orphan', 'Audit orphan', 'Extra normalized authority.')`).run();
        expect(() => audit(database, expected)).toThrow('sections authority projection');
      });

      withinSavepoint(database, () => {
        const row = expected.projections[0]!;
        database.prepare('DELETE FROM sections_fts WHERE rowid = ?').run(row.documentSectionId);
        expect(() => audit(database, expected)).toThrow('projections authority projection');
      });
    } finally {
      database.close();
    }
  });

  it('fails closed on source metadata, artifact, authority, pagination, and transport drift', () => {
    const expected = buildHistoricalTransform9ExpectedAuthority(ROOT);
    const database = authorityDatabase(expected);
    try {
      withinSavepoint(database, () => {
        database.prepare(`UPDATE historical_source_packs SET revision = 'tampered'
          WHERE pack_id = 'theologai-core-eight'`).run();
        expect(() => audit(database, expected)).toThrow('packs authority projection');
      });
      withinSavepoint(database, () => {
        database.prepare(`UPDATE historical_source_artifacts SET locator = 'https://example.invalid/tampered'
          WHERE artifact_id = (SELECT artifact_id FROM historical_source_artifacts ORDER BY artifact_id LIMIT 1)`).run();
        expect(() => audit(database, expected)).toThrow('artifacts authority projection');
      });
      withinSavepoint(database, () => {
        database.prepare(`DELETE FROM historical_edition_sections
          WHERE edition_id = ? AND section_key = ?`).run(expected.sections[0]!.editionId, expected.sections[0]!.sectionKey);
        expect(() => audit(database, expected)).toThrow('sections authority projection');
      });
      withinSavepoint(database, () => {
        database.prepare(`INSERT INTO historical_edition_sections VALUES
          ('wesley-standard-sermons-1771', 'audit-tail-extra', 1000, 'Audit tail', 'Audit tail', 'Tail-only authority row.')`).run();
        expect(() => audit(database, expected)).toThrow('sections authority projection');
      });

      const duplicatePack = expected.packs[0]!;
      expect(() => auditHistoricalTransform9Authority(ROOT, () => ({
        rows: [duplicatePack, duplicatePack], responseBytes: 0,
      }), expected)).toThrow('packs authority page is not strictly ordered');
      expect(() => auditHistoricalTransform9Authority(ROOT, () => ({
        rows: [], responseBytes: HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_MAX_BYTES + 1,
      }), expected)).toThrow('byte response limit');
      expect(() => auditHistoricalTransform9Authority(ROOT, () => ({
        rows: [{ ...duplicatePack, packId: 1 }], responseBytes: 0,
      }), expected)).toThrow('pack.packId must be a string');
      expect(() => auditHistoricalTransform9Authority(ROOT, () => ({
        rows: Array.from({ length: HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_SIZE + 1 }, () => duplicatePack),
        responseBytes: 0,
      }), expected)).toThrow(`${HISTORICAL_TRANSFORM9_AUTHORITY_PAGE_SIZE}-row limit`);
      expect(() => parseHistoricalTransform9D1Page(' '.repeat(HISTORICAL_TRANSFORM8_D1_RESPONSE_MAX_BYTES + 1)))
        .toThrow('envelope limit');
    } finally {
      database.close();
    }
  });
});
