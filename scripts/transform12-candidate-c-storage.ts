import type Database from 'better-sqlite3';

export const TRANSFORM12_STORAGE_CONTRACT =
  'candidate_c_seed_base_rebuild_all_fts_integrity_check_then_seal_v1';

export const TRANSFORM12_FTS_TABLES = Object.freeze([
  'strongs_fts',
  'sections_fts',
  'historical_edition_sections_fts',
  'historical_edition_hierarchy_bodies_fts',
] as const);

export const TRANSFORM12_SEALED_BASE_TABLES = Object.freeze([
  'strongs',
  'document_sections',
  'historical_edition_sections',
  'historical_edition_hierarchy_bodies',
] as const);

function tableSql(db: Database.Database, table: string): string {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(table) as { sql: string | null } | undefined;
  if (!row?.sql) throw new Error(`Transform 12 required table is missing: ${table}`);
  return row.sql;
}

export function isExternalContentFts(db: Database.Database, table: string): boolean {
  return /\bcontent\s*=\s*'[^']+'/i.test(tableSql(db, table));
}

/** Prove the checked-in migration, rather than experiment-time rewriting, owns Candidate C. */
export function assertTransform12CandidateCSchema(db: Database.Database): void {
  const runtime = tableSql(db, 'sections_fts');
  const historical = tableSql(db, 'historical_edition_sections_fts');
  const hierarchy = tableSql(db, 'historical_edition_hierarchy_bodies_fts');
  const strongs = tableSql(db, 'strongs_fts');
  if (!/content\s*=\s*'document_sections'/i.test(runtime)
    || !/content_rowid\s*=\s*'id'/i.test(runtime)
    || !/content\s*=\s*'historical_edition_sections'/i.test(historical)
    || !/content_rowid\s*=\s*'rowid'/i.test(historical)
    || !/content\s*=\s*'historical_edition_hierarchy_bodies'/i.test(hierarchy)
    || /\bcontent\s*=/i.test(strongs)) {
    throw new Error('Transform 12 Candidate-C FTS schema drifted');
  }
  const forbidden = db.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name IN ('sections_fts_content', 'historical_edition_sections_fts_content')
    ORDER BY name`).all() as Array<{ name: string }>;
  if (forbidden.length > 0) {
    throw new Error(`Transform 12 converted FTS indexes retained body shadows: ${forbidden.map(row => row.name).join(', ')}`);
  }
}

function assertCountParity(db: Database.Database, fts: string, base: string): void {
  const row = db.prepare(`SELECT
    (SELECT COUNT(*) FROM "${fts}") AS fts_count,
    (SELECT COUNT(*) FROM "${base}") AS base_count`).get() as {
    fts_count: number;
    base_count: number;
  };
  if (row.fts_count !== row.base_count) {
    throw new Error(`Transform 12 ${fts} count ${row.fts_count} differs from ${base} count ${row.base_count}`);
  }
}

/**
 * Finalize one fresh SQLite build: populate the unchanged Strong's FTS once,
 * rebuild all external-content indexes once, integrity-check all four, then
 * insert the singleton seal. No incremental FTS maintenance is supported.
 */
export function rebuildIntegrityCheckAndSealTransform12(db: Database.Database): void {
  assertTransform12CandidateCSchema(db);
  const sealCount = (db.prepare('SELECT COUNT(*) AS count FROM historical_corpus_seal').get() as { count: number }).count;
  const strongsFtsCount = (db.prepare('SELECT COUNT(*) AS count FROM strongs_fts').get() as { count: number }).count;
  if (sealCount !== 0 || strongsFtsCount !== 0) {
    throw new Error('Transform 12 lifecycle requires unsealed base rows and an empty Strong\'s FTS');
  }

  db.exec(`
    INSERT INTO strongs_fts(strongs_number, lemma, transliteration, definition)
      SELECT strongs_number, lemma, transliteration, definition
      FROM strongs ORDER BY strongs_number;
    INSERT INTO sections_fts(sections_fts) VALUES ('rebuild');
    INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts) VALUES ('rebuild');
    INSERT INTO historical_edition_hierarchy_bodies_fts(historical_edition_hierarchy_bodies_fts) VALUES ('rebuild');

    INSERT INTO strongs_fts(strongs_fts, rank) VALUES ('integrity-check', 1);
    INSERT INTO sections_fts(sections_fts, rank) VALUES ('integrity-check', 1);
    INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts, rank) VALUES ('integrity-check', 1);
    INSERT INTO historical_edition_hierarchy_bodies_fts(historical_edition_hierarchy_bodies_fts, rank)
      VALUES ('integrity-check', 1);
  `);

  assertCountParity(db, 'strongs_fts', 'strongs');
  assertCountParity(db, 'sections_fts', 'document_sections');
  assertCountParity(db, 'historical_edition_sections_fts', 'historical_edition_sections');
  assertCountParity(db, 'historical_edition_hierarchy_bodies_fts', 'historical_edition_hierarchy_bodies');

  const runtimeMismatch = db.prepare(`SELECT COUNT(*) AS count
    FROM document_sections section
    LEFT JOIN sections_fts fts ON fts.rowid = section.id
    WHERE fts.rowid IS NULL OR fts.title IS NOT section.title
      OR fts.content IS NOT section.content OR fts.topics IS NOT section.topics`).get() as { count: number };
  const editionMismatch = db.prepare(`SELECT COUNT(*) AS count
    FROM historical_edition_sections section
    LEFT JOIN historical_edition_sections_fts fts ON fts.rowid = section.rowid
    WHERE fts.rowid IS NULL OR fts.edition_id IS NOT section.edition_id
      OR fts.section_key IS NOT section.section_key OR fts.heading IS NOT section.heading
      OR fts.content IS NOT section.content`).get() as { count: number };
  if (runtimeMismatch.count !== 0 || editionMismatch.count !== 0) {
    throw new Error(`Transform 12 external-content FTS parity failed: runtime=${runtimeMismatch.count}, edition=${editionMismatch.count}`);
  }

  db.prepare(`INSERT INTO historical_corpus_seal (seal_id, transform_version, storage_contract)
    VALUES (1, 12, ?)`).run(TRANSFORM12_STORAGE_CONTRACT);
  const triggerCount = (db.prepare(`SELECT COUNT(*) AS count FROM sqlite_master
    WHERE type = 'trigger' AND name GLOB 'transform12_*_sealed_*'`).get() as { count: number }).count;
  if (triggerCount !== TRANSFORM12_SEALED_BASE_TABLES.length * 3) {
    throw new Error(`Transform 12 corpus seal trigger inventory drifted: ${triggerCount}`);
  }
}

export function assertTransform12CorpusSealed(db: Database.Database): void {
  const row = db.prepare(`SELECT transform_version AS transformVersion, storage_contract AS storageContract
    FROM historical_corpus_seal WHERE seal_id = 1`).get() as {
    transformVersion: number;
    storageContract: string;
  } | undefined;
  if (row?.transformVersion !== 12 || row.storageContract !== TRANSFORM12_STORAGE_CONTRACT) {
    throw new Error('Transform 12 corpus seal is absent or drifted');
  }
  assertTransform12CandidateCSchema(db);
}
