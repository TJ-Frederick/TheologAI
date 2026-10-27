/** Complete source-cell comparison. Transport, authentication and accounting are injected. */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDataManifest, verifyD1Migrations } from './d1-corpus-identity.js';

export type ProofRow = Record<string, unknown>;
export type ProofQuery = { kind: 'select' | 'quick-check' | 'fts-integrity'; label: string; sql: string; readCeiling: number; writeCeiling: number };
export type ProofExecute = (query: ProofQuery) => Promise<ProofRow[]>;
const EXTERNAL_FTS = ['sections_fts', 'historical_edition_sections_fts', 'historical_edition_hierarchy_bodies_fts'];
export const ALL_FTS = ['strongs_fts', ...EXTERNAL_FTS] as const;
export const CATALOG_SQL = "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name";
export const LEDGER_SQL = 'SELECT id,name,applied_at FROM d1_migrations ORDER BY id LIMIT 11';
const MAX_PAGE_BYTES = 900_000;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(`Corpus proof refused: ${message}`); }
function same(a: unknown, b: unknown, message: string): void { check(JSON.stringify(a) === JSON.stringify(b), message); }
function id(value: string): string { check(/^[a-z_][a-z0-9_]*$/.test(value), 'identifier'); return `"${value}"`; }
function literal(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  check(typeof value === 'string' && !value.includes('\0'), 'key storage type'); return `'${value.replaceAll("'", "''")}'`;
}
function cells(row: ProofRow, columns: string[]): unknown[] {
  same(Object.keys(row).sort(), [...columns].sort(), 'returned columns');
  return columns.map(k => { const v = row[k]; check(v === null || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v), 'cell storage type'); return v; });
}
type Column = { name: string; pk: number };
export function canonicalTableDigest(db: Database.Database, table: string): { rows: number; sha256: string } {
  const columns = db.prepare(`PRAGMA table_info(${id(table)})`).all() as Column[];
  check(columns.length, 'missing canonical table'); const names = columns.map(c => c.name);
  const keys = columns.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
  const digest = createHash('sha256').update(`${JSON.stringify(names)}\n`); let rows = 0;
  for (const row of db.prepare(`SELECT ${names.map(id)} FROM ${id(table)} ORDER BY ${(keys.length ? keys : names).map(id)}`).iterate() as Iterable<ProofRow>) {
    digest.update(`${JSON.stringify(cells(row, names))}\n`); rows++;
  }
  return { rows, sha256: digest.digest('hex') };
}

export function buildCorpusProofSource(root: string, source: Database.Database) {
  const manifest = parseDataManifest(readFileSync(join(root, 'data/data-manifest.json')));
  const migrations = verifyD1Migrations(root, manifest);
  const replay = new Database(':memory:');
  try {
    for (const sql of migrations) replay.exec(sql.toString());
    const catalog = source.prepare(CATALOG_SQL).all() as ProofRow[];
    same(catalog, replay.prepare(CATALOG_SQL).all(), 'source schema differs from independent raw migrations');
    same(source.prepare('PRAGMA foreign_key_check').all(), [], 'source foreign keys');
    same(source.prepare('PRAGMA quick_check').all(), [{ quick_check: 'ok' }], 'source physical integrity');
    const tables = Object.keys(manifest.expectedCounts).filter(t => !EXTERNAL_FTS.includes(t)).sort();
    const foreignKeys: Record<string, ProofRow[]> = {};
    for (const { name } of replay.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]) {
      const fks = replay.prepare(`PRAGMA foreign_key_list(${id(name)})`).all() as ProofRow[];
      if (!fks.length) continue;
      check(tables.includes(name), 'FK child absent from complete proof');
      for (const fk of fks) check(typeof fk.table === 'string' && tables.includes(fk.table), 'FK parent absent from complete proof');
      same(source.prepare(`PRAGMA foreign_key_list(${id(name)})`).all(), fks, 'FK definition differs'); foreignKeys[name] = fks;
    }
    for (const table of ALL_FTS) source.prepare(`INSERT INTO ${id(table)}(${id(table)},rank) VALUES('integrity-check',1)`).run();
    const digests = Object.fromEntries(tables.map(t => [t, canonicalTableDigest(source, t)]));
    for (const table of tables) check(digests[table]!.rows === manifest.expectedCounts[table], 'source count differs from manifest');
    // quick_check visits physical table rows, not every secondary-index cell.
    // Include FTS shadow tables; local Workerd measurement validates this proxy.
    const physicalRows = (source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND sql NOT LIKE 'CREATE VIRTUAL TABLE%'").all() as { name: string }[])
      .reduce((n, { name }) => n + (source.prepare(`SELECT count(*) n FROM ${id(name)}`).get() as { n: number }).n, 0);
    check(Number.isSafeInteger(physicalRows) && physicalRows > 0, 'physical population unavailable');
    return { tables, catalog, digests, foreignKeyWitnessSha256: sha(JSON.stringify(foreignKeys)),
      schemaVersion: manifest.schemaVersion, migrationNames: manifest.materializations.d1.migrations.map(m => m.path.split('/').at(-1)!),
      quickCheckReadCeiling: Math.ceil(physicalRows * 1.1) + 8192 };
  } finally { replay.close(); }
}
export type CorpusProofSource = ReturnType<typeof buildCorpusProofSource>;

export function sourcePage(source: Database.Database, table: string, cursor: unknown[] | null, limit = 512) {
  check(Number.isInteger(limit) && limit > 0 && limit <= 512, 'page bound');
  const columns = source.prepare(`PRAGMA table_info(${id(table)})`).all() as Column[];
  const names = columns.map(c => c.name); check(names.length, 'missing source table');
  const keys = columns.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
  const owned = table === 'strongs_fts';
  if (owned) {
    same(names, ['strongs_number', 'lemma', 'transliteration', 'definition'], 'owned FTS columns');
    same((source.prepare('PRAGMA table_info(strongs_fts_content)').all() as Column[]).map(c => c.name), ['id', 'c0', 'c1', 'c2', 'c3'], 'owned FTS shadow schema');
    keys.push('_cursor');
  }
  check(keys.length && (cursor === null || cursor.length === keys.length), 'unindexed source or cursor');
  const order = owned ? ['b."id"'] : keys.map(k => `b.${id(k)}`);
  const projection = owned ? 'b."id" AS _cursor,' + names.map((n, i) => `b."c${i}" AS ${id(n)}`).join(',') : names.map(n => `b.${id(n)}`).join(',');
  const where = cursor ? ` WHERE (${order.join(',')}) > (${cursor.map(literal).join(',')})` : '';
  const sql = `SELECT ${projection} FROM ${id(owned ? 'strongs_fts_content' : table)} b${where} ORDER BY ${order.join(',')} LIMIT ${limit}`;
  const plans = source.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[];
  check(plans.length > 0 && plans.every(p => /^(?:SCAN b(?: USING (?:COVERING )?INDEX [a-z0-9_]+)?|SEARCH b USING (?:COVERING )?(?:INDEX [a-z0-9_]+|INTEGER PRIMARY KEY)|SEARCH b USING PRIMARY KEY)/i.test(p.detail)), 'keyset plan scans/sorts unexpectedly');
  return { sql, names, keys, owned, expected: source.prepare(sql).all() as ProofRow[], readCeiling: 4 * limit + 256 };
}

async function compareTable(source: Database.Database, expected: CorpusProofSource, table: string, execute: ProofExecute) {
  let cursor: unknown[] | null = null; let count = 0;
  const first = sourcePage(source, table, null); const digest = createHash('sha256').update(`${JSON.stringify(first.names)}\n`);
  const captured = first.owned ? new Database(':memory:') : null;
  captured?.exec(`CREATE TABLE captured(${first.names.map(id)})`);
  const insert = captured?.prepare(`INSERT INTO captured VALUES(${first.names.map(() => '?')})`);
  const maxOwnedBytes = first.owned ? (source.prepare('SELECT * FROM strongs_fts').all() as ProofRow[]).reduce((n, r) => Math.max(n, Buffer.byteLength(JSON.stringify(r)) + 96), 1) : 1;
  let previousOwnedId = 0;
  try {
    for (;;) {
      let limit = first.owned ? Math.max(1, Math.min(512, Math.floor(MAX_PAGE_BYTES / maxOwnedBytes))) : 512;
      let page = sourcePage(source, table, cursor, limit);
      while (Buffer.byteLength(JSON.stringify(page.expected)) > MAX_PAGE_BYTES && limit > 1) { limit = Math.floor(limit / 2); page = sourcePage(source, table, cursor, limit); }
      check(Buffer.byteLength(JSON.stringify(page.expected)) <= MAX_PAGE_BYTES, 'one source row exceeds response bound');
      const actual = await execute({ kind: 'select', label: `canonical:${table}`, sql: page.sql, readCeiling: page.readCeiling, writeCeiling: 0 });
      check(actual.length <= limit && (page.owned || JSON.stringify(actual.map(r => cells(r, page.names))) === JSON.stringify(page.expected.map(r => cells(r, page.names)))), 'source page mismatch');
      for (const row of actual) {
        const names = page.owned ? ['_cursor', ...page.names] : page.names; cells(row, names);
        if (page.owned) {
          check(Number.isSafeInteger(row._cursor) && (row._cursor as number) > previousOwnedId, 'FTS cursor');
          previousOwnedId = row._cursor as number;
        }
        const projected = Object.fromEntries(page.names.map(n => [n, row[n]])); const values = cells(projected, page.names);
        if (insert) insert.run(...values as (string | number | null)[]); else digest.update(`${JSON.stringify(values)}\n`);
        count++;
      }
      check(count <= expected.digests[table]!.rows, 'extra remote rows');
      if (!actual.length) break;
      const next = page.keys.map(k => actual.at(-1)![k]); check(JSON.stringify(next) !== JSON.stringify(cursor), 'nonadvancing cursor'); cursor = next;
    }
    if (captured) for (const row of captured.prepare(`SELECT * FROM captured ORDER BY ${first.names.map(id)}`).iterate() as Iterable<ProofRow>) digest.update(`${JSON.stringify(cells(row, first.names))}\n`);
    const result = { rows: count, sha256: digest.digest('hex') }; same(result, expected.digests[table], `complete table digest: ${table}`); return result;
  } finally { captured?.close(); }
}

export async function proveCompleteCorpus(source: Database.Database, expected: CorpusProofSource, execute: ProofExecute) {
  const catalogBefore = await execute({ kind: 'select', label: 'catalog-before', sql: CATALOG_SQL, readCeiling: 4096, writeCeiling: 0 });
  const application = catalogBefore.filter(r => r.name !== '_cf_KV' && r.name !== 'd1_migrations');
  same(application, expected.catalog, 'remote schema differs from source');
  const providers = catalogBefore.filter(r => r.name === '_cf_KV' || r.name === 'd1_migrations');
  check(providers.length === 2 && providers.every(r => r.type === 'table' && r.tbl_name === r.name && typeof r.sql === 'string'), 'provider schema unavailable');
  const ledger = await execute({ kind: 'select', label: 'ledger-before', sql: LEDGER_SQL, readCeiling: 128, writeCeiling: 0 });
  same(ledger.map(r => r.name), expected.migrationNames, 'migration ledger source mismatch');
  check(ledger.every((r, i) => Number.isSafeInteger(r.id) && (r.id as number) > 0 && (!i || (r.id as number) > (ledger[i - 1]!.id as number)) && typeof r.applied_at === 'string'), 'migration ledger shape');
  // Fail a wrong corpus identity before scanning content, even on the same schema.
  if (expected.tables.includes('theologai_metadata')) {
    const sql = 'SELECT key,value FROM theologai_metadata ORDER BY key LIMIT 32';
    same(await execute({ kind: 'select', label: 'corpus-identity', sql, readCeiling: 128, writeCeiling: 0 }), source.prepare(sql).all(), 'remote corpus identity differs');
  }
  const tables: Record<string, { rows: number; sha256: string }> = {};
  for (const table of expected.tables) tables[table] = await compareTable(source, expected, table, execute);
  const quick = await execute({ kind: 'quick-check', label: 'physical', sql: 'PRAGMA quick_check', readCeiling: expected.quickCheckReadCeiling, writeCeiling: 0 });
  same(quick, [{ quick_check: 'ok' }], 'physical integrity failure');
  for (const table of ALL_FTS) {
    const rows = await execute({ kind: 'fts-integrity', label: `fts:${table}`, sql: `INSERT INTO ${id(table)}(${id(table)},rank) VALUES('integrity-check',1)`, readCeiling: 4096, writeCeiling: 1 });
    same(rows, [], 'FTS integrity response');
  }
  same(await execute({ kind: 'select', label: 'catalog-after', sql: CATALOG_SQL, readCeiling: 4096, writeCeiling: 0 }), catalogBefore, 'catalog changed during proof');
  same(await execute({ kind: 'select', label: 'ledger-after', sql: LEDGER_SQL, readCeiling: 128, writeCeiling: 0 }), ledger, 'ledger changed during proof');
  return { method: 'fresh_complete_cells_physical_and_rank1_fts.v1' as const, tables, catalogSha256: sha(JSON.stringify(catalogBefore)), ledgerSha256: sha(JSON.stringify(ledger)),
    foreignKeys: { method: 'local_clean_raw_schema_plus_all_child_parent_cells' as const, witnessSha256: expected.foreignKeyWitnessSha256 }, quickCheck: 'ok' as const, ftsIntegrity: [...ALL_FTS], sourceRows: Object.values(tables).reduce((n, t) => n + t.rows, 0) };
}
