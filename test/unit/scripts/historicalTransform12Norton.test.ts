import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditNortonTransform12Authority } from '../../../scripts/historical-transform12-authority-audit.js';
import {
  NORTON_NORMALIZED_TEXT_RIGHTS_PENDING,
  NORTON_TRANSFORM12,
  assertStoredNortonTransform12Authority,
  loadNortonTransform12Authority,
  materializeNortonTransform12Authority,
} from '../../../scripts/historical-transform12-norton.js';
import {
  assertTransform12CandidateCSchema,
  assertTransform12CorpusSealed,
  rebuildIntegrityCheckAndSealTransform12,
} from '../../../scripts/transform12-candidate-c-storage.js';

const ROOT = process.cwd();
const MIGRATIONS = [
  '0001_initial_schema.sql', '0002_ubs_parallel_passages.sql', '0003_original_language_usage.sql',
  '0004_ubs_hebrew_semantics.sql', '0005_historical_section_identity_delivery.sql',
  '0006_historical_source_packs.sql', '0007_historical_hierarchy.sql',
  '0008_historical_hierarchy_publications.sql', '0009_norton_transform12_inactive.sql',
] as const;

function database(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) db.exec(readFileSync(join(ROOT, 'migrations', migration), 'utf8'));
  return db;
}

function authority() {
  return loadNortonTransform12Authority({
    read(path: string, encoding?: BufferEncoding): Buffer | string {
      return encoding === undefined ? readFileSync(join(ROOT, path)) : readFileSync(join(ROOT, path), encoding);
    },
  } as never);
}

function audit(db: Database.Database) {
  return auditNortonTransform12Authority(ROOT, sql => {
    const rows = db.prepare(sql).all();
    return { rows, responseBytes: Buffer.byteLength(JSON.stringify(rows), 'utf8') };
  });
}

describe('inactive Norton Transform 12 authority', () => {
  it('replays, materializes, rebuilds Candidate-C FTS once, audits 157 pages, and seals', () => {
    const db = database();
    try {
      assertTransform12CandidateCSchema(db);
      expect(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'
        AND name IN ('sections_fts_content', 'historical_edition_sections_fts_content')`).all()).toEqual([]);

      const expected = authority();
      expect(expected).toMatchObject({
        packageSha256: NORTON_TRANSFORM12.packageSha256,
        orderedTextSha256: NORTON_TRANSFORM12.orderedTextSha256,
        publication: {
          activationState: 'dormant', landingMaxBytes: 16_384, browsePageSize: 32,
          cursorVersion: 1, bodyDelivery: 'exact_section_only',
        },
      });
      expect(expected.sections).toHaveLength(1_250);
      expect(expected.sections[624]).toMatchObject({
        sectionKey: 'a17662-source-ordinal-0625', sourceOrdinal: 625, displayLabel: 'Source segment 625',
      });

      materializeNortonTransform12Authority(db, expected);
      rebuildIntegrityCheckAndSealTransform12(db);
      assertTransform12CorpusSealed(db);
      assertStoredNortonTransform12Authority(db, expected);
      const result = audit(db);
      expect(result).toMatchObject({
        pages: 157, rows: 1_250, packageSha256: NORTON_TRANSFORM12.packageSha256,
        orderedTextSha256: NORTON_TRANSFORM12.orderedTextSha256,
      });
      expect(result.boundaryHashes.map(row => row.sourceOrdinal)).toEqual([1, 625, 1_250]);
      expect(db.prepare(`SELECT normalized_text_rights_json AS rights
        FROM historical_editions WHERE edition_id = ?`).get(NORTON_TRANSFORM12.editionId))
        .toEqual({ rights: JSON.stringify(NORTON_NORMALIZED_TEXT_RIGHTS_PENDING) });

      expect(() => db.prepare(`UPDATE historical_edition_sections SET content = content || 'x'
        WHERE edition_id = ? AND source_ordinal = 1`).run(NORTON_TRANSFORM12.editionId))
        .toThrow('Transform 12 corpus is sealed');
      expect(() => db.prepare('INSERT INTO documents VALUES (?, ?, ?, NULL, ?)').run(
        NORTON_TRANSFORM12.editionId, 'Forbidden Norton runtime row', 'historical_work', '{}',
      )).toThrow('dormant sectioned publication cannot become a runtime document');
      expect(() => db.prepare('UPDATE historical_sectioned_publications SET title = title WHERE publication_id = ?')
        .run(NORTON_TRANSFORM12.publicationId)).toThrow('historical sectioned publications are immutable');
    } finally {
      db.close();
    }
  }, 30_000);

  it('fails both stored and read-only audits for independent authority mutations', () => {
    const db = database();
    const expected = authority();
    try {
      materializeNortonTransform12Authority(db, expected);
      rebuildIntegrityCheckAndSealTransform12(db);
      const mutations = [
        ['underlying rights', `UPDATE historical_editions SET underlying_work_rights_json='{"status":"mutated"}' WHERE edition_id=?`, [NORTON_TRANSFORM12.editionId]],
        ['exact artifact rights', `UPDATE historical_editions SET exact_artifact_rights_json='{"status":"mutated"}' WHERE edition_id=?`, [NORTON_TRANSFORM12.editionId]],
        ['provenance status', `UPDATE historical_editions SET provenance_status='verified' WHERE edition_id=?`, [NORTON_TRANSFORM12.editionId]],
        ['provenance date', `UPDATE historical_editions SET provenance_reviewed_at='2000-01-01T00:00:00Z' WHERE edition_id=?`, [NORTON_TRANSFORM12.editionId]],
        ['provenance uncertainty', `UPDATE historical_editions SET provenance_uncertainty='mutated' WHERE edition_id=?`, [NORTON_TRANSFORM12.editionId]],
        ['language', `UPDATE historical_editions SET language='la' WHERE edition_id=?`, [NORTON_TRANSFORM12.editionId]],
        ['contributors', `UPDATE historical_editions SET contributor_groups_json='{}' WHERE edition_id=?`, [NORTON_TRANSFORM12.editionId]],
        ['publication', `UPDATE historical_editions SET publication='mutated' WHERE edition_id=?`, [NORTON_TRANSFORM12.editionId]],
        ['version', `UPDATE historical_editions SET version='mutated' WHERE edition_id=?`, [NORTON_TRANSFORM12.editionId]],
        ['artifact role', `UPDATE historical_source_artifacts SET role='comparator' WHERE artifact_id=?`, [NORTON_TRANSFORM12.artifactId]],
        ['artifact pin', `UPDATE historical_source_artifacts SET pin_value=?, sha256=? WHERE artifact_id=?`, ['0'.repeat(64), '0'.repeat(64), NORTON_TRANSFORM12.artifactId]],
        ['artifact acquisition', `UPDATE historical_source_artifacts SET acquired_at='2000-01-01T00:00:00Z' WHERE artifact_id=?`, [NORTON_TRANSFORM12.artifactId]],
      ] as const;
      for (const [label, sql, values] of mutations) {
        db.exec('SAVEPOINT authority_mutation');
        db.prepare(sql).run(...values);
        expect(() => assertStoredNortonTransform12Authority(db, expected), label).toThrow();
        expect(() => audit(db), label).toThrow();
        db.exec('ROLLBACK TO authority_mutation; RELEASE authority_mutation');
      }
      db.prepare(`INSERT INTO historical_works(work_id,title,creator_metadata_status,creators_json)
        VALUES ('mutation-fixture-work','Mutation fixture','unknown','[]')`).run();
      const publicationMutations = [
        ['metadata', `UPDATE historical_sectioned_publications SET metadata_json='{"mutated":true}' WHERE publication_id=?`, [NORTON_TRANSFORM12.publicationId]],
        ['lineage', `UPDATE historical_sectioned_publications SET work_id=(SELECT work_id FROM historical_works WHERE work_id != ? ORDER BY work_id LIMIT 1) WHERE publication_id=?`, [NORTON_TRANSFORM12.workId, NORTON_TRANSFORM12.publicationId]],
        ['delivery', `UPDATE historical_sectioned_publications SET cursor_identity=? WHERE publication_id=?`, ['0'.repeat(64), NORTON_TRANSFORM12.publicationId]],
      ] as const;
      for (const [label, sql, values] of publicationMutations) {
        db.exec('SAVEPOINT publication_mutation');
        db.exec('DROP TRIGGER historical_sectioned_publications_immutable_update');
        db.prepare(sql).run(...values);
        expect(() => assertStoredNortonTransform12Authority(db, expected), label).toThrow();
        expect(() => audit(db), label).toThrow();
        db.exec('ROLLBACK TO publication_mutation; RELEASE publication_mutation');
      }
    } finally {
      db.close();
    }
  }, 120_000);

  it('uses the actual Norton FTS index for exact MATCH the coverage', () => {
    const db = database();
    try {
      materializeNortonTransform12Authority(db, authority());
      rebuildIntegrityCheckAndSealTransform12(db);
      expect(audit(db)).toMatchObject({ pages: 157, rows: 1_250 });
      db.prepare(`INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts)
        VALUES ('delete-all')`).run();
      expect(() => audit(db)).toThrow('MATCH the');
    } finally {
      db.close();
    }
  }, 30_000);

  it('keeps Norton out of every runtime/public registration surface', () => {
    const needle = NORTON_TRANSFORM12.editionId;
    for (const path of [
      'src/server.ts', 'src/worker-server.ts', 'src/mcp/tools.ts', 'src/mcp/prompts.ts',
      'src/mcp/primarySourceCatalog.ts', 'src/tools/v2/index.ts', 'src/tools/worker/index.ts',
      'src/adapters/data/HistoricalDocumentRepository.ts', 'src/adapters/d1/D1HistoricalDocumentRepository.ts',
      'data/historical-document-catalog.json',
    ]) {
      expect(readFileSync(join(ROOT, path), 'utf8'), path).not.toContain(needle);
    }
    expect(readFileSync(join(ROOT, 'wrangler.toml'), 'utf8')).not.toContain(NORTON_TRANSFORM12.packId);
  });
});
