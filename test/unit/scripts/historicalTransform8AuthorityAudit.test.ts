import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  auditHistoricalTransform8Authority,
  HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_MAX_BYTES,
  buildHistoricalTransform8ExpectedAuthority,
  HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_SIZE,
  HISTORICAL_TRANSFORM8_D1_RESPONSE_MAX_BYTES,
  parseHistoricalTransform8D1Page,
  type HistoricalTransform8ExpectedAuthority,
} from '../../../scripts/historical-transform8-authority-audit.js';
import { verifyHistoricalSectionCompatibilityAttestationFromDisk } from '../../../scripts/historical-section-compatibility-compiler.js';

const ROOT = process.cwd();

function authorityDatabase(expected: HistoricalTransform8ExpectedAuthority): Database.Database {
  const database = new Database(':memory:');
  database.exec(`CREATE TABLE historical_document_delivery_profiles (
      document_id TEXT, work_id TEXT, edition_id TEXT, immutable_corpus_identity TEXT,
      section_package_identity TEXT, delivery_mode TEXT, section_count INTEGER,
      landing_max_bytes INTEGER, browse_page_size INTEGER, cursor_version INTEGER,
      provenance_json TEXT, rights_json TEXT
    );
    CREATE TABLE historical_section_identities (
      document_id TEXT, section_key TEXT, source_ordinal INTEGER, document_section_id INTEGER
    );
    CREATE TABLE historical_section_aliases (
      document_id TEXT, legacy_section_id TEXT, section_key TEXT, source_ordinal INTEGER
    );
    CREATE TABLE document_sections (
      id INTEGER PRIMARY KEY, document_id TEXT, section_number TEXT, title TEXT, content TEXT, topics TEXT
    );
    CREATE TABLE sections_fts (title TEXT, content TEXT, topics TEXT);`);
  const insertProfile = database.prepare('INSERT INTO historical_document_delivery_profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of expected.profiles) {
    insertProfile.run(row.documentId, row.workId, row.editionId, row.immutableCorpusIdentity,
      row.sectionPackageIdentity, row.deliveryMode, row.sectionCount, row.landingMaxBytes,
      row.browsePageSize, row.cursorVersion, row.provenanceJson, row.rightsJson);
  }
  const insertIdentity = database.prepare('INSERT INTO historical_section_identities VALUES (?, ?, ?, ?)');
  for (const [index, row] of expected.identities.entries()) {
    insertIdentity.run(row.documentId, row.sectionKey, row.sourceOrdinal, index + 1);
  }
  const insertAlias = database.prepare('INSERT INTO historical_section_aliases VALUES (?, ?, ?, ?)');
  for (const row of expected.aliases) insertAlias.run(row.documentId, row.legacySectionId, row.sectionKey, row.sourceOrdinal);
  const insertSection = database.prepare('INSERT INTO document_sections VALUES (?, ?, ?, ?, ?, ?)');
  const insertFts = database.prepare('INSERT INTO sections_fts(rowid, title, content, topics) VALUES (?, ?, ?, ?)');
  for (const [index, row] of expected.bodyFtsSample.entries()) {
    insertSection.run(index + 1, row.documentId, row.legacySectionId, row.title, row.content, row.topics);
    insertFts.run(index + 1, row.ftsTitle, row.ftsContent, row.ftsTopics);
  }
  return database;
}

function audit(
  database: Database.Database,
  expected: HistoricalTransform8ExpectedAuthority,
  sql?: string[],
): ReturnType<typeof auditHistoricalTransform8Authority> {
  return auditHistoricalTransform8Authority(ROOT, query => {
    sql?.push(query);
    const rows = database.prepare(query).all();
    return { rows, responseBytes: Buffer.byteLength(JSON.stringify(rows), 'utf8') };
  }, expected);
}

function withinSavepoint(database: Database.Database, mutate: () => void): void {
  database.exec('SAVEPOINT transform8_authority_mutation');
  try {
    mutate();
  } finally {
    database.exec('ROLLBACK TO transform8_authority_mutation');
    database.exec('RELEASE transform8_authority_mutation');
  }
}

describe('Transform 8 ordered authority audit', () => {
  it('uses bounded read-only keyset pages and detects canonical, profile, and collision-topology corruption', () => {
    const expected = buildHistoricalTransform8ExpectedAuthority(ROOT);
    const database = authorityDatabase(expected);
    try {
      const sql: string[] = [];
      const result = audit(database, expected, sql);
      expect(result.pages).toEqual({ profiles: 1, identities: 12, aliases: 12 });
      expect(sql).toHaveLength(26); // 25 complete-sidecar pages plus the parity sample.
      expect(sql.every(query => /^\s*SELECT\b/i.test(query))).toBe(true);
      expect(sql.every(query => !/\bOFFSET\b/i.test(query))).toBe(true);
      expect(sql.filter(query => /historical_document_delivery_profiles/.test(query))).toHaveLength(1);
      expect(sql.filter(query => /historical_section_identities/.test(query))).toHaveLength(13); // 12 identity pages + sample.
      expect(sql.filter(query => /historical_section_aliases/.test(query))).toHaveLength(12);
      expect(sql.every(query => query.includes(`LIMIT ${HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_SIZE}`)
        || query.includes('LIMIT 32'))).toBe(true);

      withinSavepoint(database, () => {
        const canonical = database.prepare(`SELECT i.document_id AS documentId, i.section_key AS sectionKey
          FROM historical_section_identities i
          WHERE NOT EXISTS (SELECT 1 FROM historical_section_aliases a
            WHERE a.document_id = i.document_id AND a.section_key = i.section_key)
          ORDER BY i.document_id, i.source_ordinal LIMIT 1`).get() as { documentId: string; sectionKey: string };
        expect(canonical).toBeDefined();
        database.prepare(`UPDATE historical_section_identities SET section_key = ?
          WHERE document_id = ? AND section_key = ?`)
          .run('audit-unaliased-canonical-rename', canonical.documentId, canonical.sectionKey);
        expect(() => audit(database, expected)).toThrow('identities authority projection');
      });

      withinSavepoint(database, () => {
        const profile = database.prepare(`SELECT document_id AS documentId
          FROM historical_document_delivery_profiles ORDER BY document_id LIMIT 1`).get() as { documentId: string };
        database.prepare(`UPDATE historical_document_delivery_profiles
          SET immutable_corpus_identity = ?, provenance_json = ? WHERE document_id = ?`)
          .run('f'.repeat(64), '{"status":"corrupted_profile_provenance"}', profile.documentId);
        expect(() => audit(database, expected)).toThrow('profiles authority projection');
      });

      withinSavepoint(database, () => {
        const compilation = verifyHistoricalSectionCompatibilityAttestationFromDisk(ROOT);
        const collisionDocument = compilation.map.documents.find(document => {
          const counts = new Map<string, number>();
          for (const section of document.sections) {
            counts.set(section.legacySectionId, (counts.get(section.legacySectionId) ?? 0) + 1);
          }
          return [...counts.values()].some(count => count > 1);
        })!;
        const collisionLegacyId = collisionDocument.sections.find(section =>
          collisionDocument.sections.filter(candidate => candidate.legacySectionId === section.legacySectionId).length > 1,
        )!.legacySectionId;
        const collision = database.prepare(`SELECT document_id AS documentId, legacy_section_id AS legacySectionId,
          section_key AS sectionKey, source_ordinal AS sourceOrdinal FROM historical_section_aliases
          WHERE document_id = ? AND legacy_section_id = ?`).get(collisionDocument.documentId, collisionLegacyId) as {
            documentId: string; legacySectionId: string; sectionKey: string; sourceOrdinal: number;
          };
        const replacement = database.prepare(`SELECT section_key AS sectionKey, source_ordinal AS sourceOrdinal
          FROM historical_section_identities
          WHERE document_id = ? AND section_key != ? ORDER BY source_ordinal DESC LIMIT 1`)
          .get(collision.documentId, collision.sectionKey) as { sectionKey: string; sourceOrdinal: number };
        database.prepare(`UPDATE historical_section_aliases SET section_key = ?, source_ordinal = ?
          WHERE document_id = ? AND legacy_section_id = ?`)
          .run(replacement.sectionKey, replacement.sourceOrdinal, collision.documentId, collision.legacySectionId);
        expect(() => audit(database, expected)).toThrow('aliases authority projection');
      });
    } finally {
      database.close();
    }
  });

  it('strictly decodes one bounded successful Wrangler D1 JSON statement result', () => {
    expect(parseHistoricalTransform8D1Page(JSON.stringify([
      { success: true, results: [{ documentId: 'doc' }] },
    ]))).toEqual({
      rows: [{ documentId: 'doc' }],
      responseBytes: Buffer.byteLength(JSON.stringify([{ success: true, results: [{ documentId: 'doc' }] }]), 'utf8'),
    });
    expect(() => parseHistoricalTransform8D1Page('{"success":true,"results":[]} {'))
      .toThrow('not valid JSON');
    expect(() => parseHistoricalTransform8D1Page(JSON.stringify([
      { success: true, results: [] }, { success: true, results: [] },
    ]))).toThrow('exactly one successful statement result');
    expect(() => parseHistoricalTransform8D1Page(' '.repeat(HISTORICAL_TRANSFORM8_D1_RESPONSE_MAX_BYTES + 1)))
      .toThrow('envelope limit');
  });

  it('fails closed on authority-page row or decoded-byte overflow before trusting page values', () => {
    const expected = buildHistoricalTransform8ExpectedAuthority(ROOT);
    expect(() => auditHistoricalTransform8Authority(ROOT, () => ({
      rows: Array.from({ length: HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_SIZE + 1 }, () => ({})),
      responseBytes: 0,
    }), expected)).toThrow(`${HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_SIZE}-row limit`);
    expect(() => auditHistoricalTransform8Authority(ROOT, () => ({
      rows: [],
      responseBytes: HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_MAX_BYTES + 1,
    }), expected)).toThrow(`${HISTORICAL_TRANSFORM8_AUTHORITY_PAGE_MAX_BYTES}-byte response limit`);
  });
});
