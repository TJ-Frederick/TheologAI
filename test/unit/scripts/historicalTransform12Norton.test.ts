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
      const audit = auditNortonTransform12Authority(ROOT, sql => {
        const rows = db.prepare(sql).all();
        return { rows, responseBytes: Buffer.byteLength(JSON.stringify(rows), 'utf8') };
      });
      expect(audit).toMatchObject({
        pages: 157, rows: 1_250, packageSha256: NORTON_TRANSFORM12.packageSha256,
        orderedTextSha256: NORTON_TRANSFORM12.orderedTextSha256,
      });
      expect(audit.boundaryHashes.map(row => row.sourceOrdinal)).toEqual([1, 625, 1_250]);
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
