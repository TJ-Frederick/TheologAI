#!/usr/bin/env tsx
/** Generate deterministic, data-only SQL for seeding an empty D1 database. */

import { execFileSync } from 'child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import {
  D1_MAX_STATEMENT_BYTES,
  D1_SEED_FILE_BYTES,
  assertSafeStatement,
  batchInsertValueTuples,
  insertedRows,
  sha256Buffer,
  sha256File,
  splitGeneratedSql,
  statementBytes,
} from './d1-seed-utils.js';
import { genesisOneOneLemmaReadinessPredicate, johnOneOneReadinessPredicate } from './data-integrity.js';
import {
  computeD1CorpusIdentity,
  computeSourceInventoryIdentity,
  parseDataManifest,
  verifyD1Migrations,
  type DataManifest,
} from './d1-corpus-identity.js';

interface SeedStatement {
  sql: string;
  rows: number;
}

interface SeedFile {
  path: string;
  table: string;
  chunk: number;
  sha256: string;
  byteSize: number;
  statementCount: number;
  rowCount: number;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'scripts', 'd1-seed');
const SOURCE_MANIFEST_PATH = join(ROOT, 'data', 'data-manifest.json');
const BASE_TABLES = [
  'theologai_metadata',
  'morph_codes',
  'documents',
  'document_sections',
  'historical_document_delivery_profiles',
  'historical_section_identities',
  'historical_section_aliases',
  'strongs',
  'stepbible_lexicons',
  'cross_references',
  'morphology',
  'strongs_usage_stats',
  'strongs_book_stats',
  'strongs_form_stats',
  'ubs_parallel_sources',
  'ubs_parallel_groups',
  'ubs_parallel_members',
  'ubs_parallel_segments',
  'ubs_semantic_artifacts',
  'ubs_semantic_sources',
  'ubs_semantic_domains',
  'ubs_semantic_entries',
  'ubs_semantic_entry_identities',
  'ubs_semantic_senses',
  'ubs_semantic_sense_domains',
  'ubs_semantic_reference_evidence',
  'ubs_semantic_normalized_coordinates',
] as const;
const EXPORT_ORDER = [...BASE_TABLES, 'fts'] as const;
const CONTENT_CHARS_PER_STATEMENT = 10_000;

function parseArguments(argv: string[]): { database: string; clean: boolean } {
  let database: string | undefined;
  let clean = false;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--clean') {
      if (clean) throw new Error('--clean may only be specified once');
      clean = true;
    } else if (argument === '--database') {
      if (database !== undefined) throw new Error('--database may only be specified once');
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--database requires an explicit path');
      database = value;
    } else if (argument.startsWith('--database=')) {
      if (database !== undefined) throw new Error('--database may only be specified once');
      database = argument.slice('--database='.length);
      if (!database) throw new Error('--database requires an explicit path');
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  const resolved = database
    ? (isAbsolute(database) ? database : resolve(ROOT, database))
    : join(ROOT, 'data', 'theologai.db');
  if (!resolved.endsWith('.db')) throw new Error(`Refusing non-.db source: ${resolved}`);
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new Error(`Source database not found: ${resolved}. Run npm run build:db first.`);
  }
  if (lstatSync(resolved).isSymbolicLink()) throw new Error(`Refusing symlinked source database: ${resolved}`);
  if (resolved === OUTPUT || resolved.startsWith(`${OUTPUT}${sep}`)) {
    throw new Error('Source database cannot be inside the generated seed directory');
  }
  return { database: resolved, clean };
}

function prepareOutput(clean: boolean): void {
  if (existsSync(OUTPUT)) {
    if (lstatSync(OUTPUT).isSymbolicLink()) throw new Error(`Refusing symlinked output directory: ${OUTPUT}`);
    const entries = readdirSync(OUTPUT);
    if (entries.length > 0 && !clean) {
      throw new Error(`${relative(ROOT, OUTPUT)} is not empty; inspect it, then rerun with --clean`);
    }
    if (clean) rmSync(OUTPUT, { recursive: true });
  }
  mkdirSync(OUTPUT, { recursive: true });
}

function sqlite(database: string, sql: string, json = false): string {
  const args = ['-readonly', '-batch'];
  if (json) args.push('-json');
  args.push(database, `PRAGMA query_only=ON; ${sql}`);
  return execFileSync('sqlite3', args, {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function sqlIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  return `"${identifier}"`;
}

function queryNumber(database: string, sql: string): number {
  const output = sqlite(database, sql).trim();
  if (!/^\d+$/.test(output)) throw new Error(`Expected an integer from SQLite, received: ${output}`);
  return Number(output);
}

function assertSemanticSource(database: string): void {
  const result = sqlite(
    database,
    `SELECT CASE WHEN ${johnOneOneReadinessPredicate()} AND ${genesisOneOneLemmaReadinessPredicate()} THEN 'ok' ELSE 'invalid' END;`,
  ).trim();
  if (result !== 'ok') {
    throw new Error('Source database failed the Greek/Hebrew morphology integrity checks');
  }
}

function validateCanonicalSources(manifest: DataManifest): void {
  const paths = manifest.files.map(file => file.path);
  if (new Set(paths).size !== paths.length) throw new Error('Canonical source manifest has duplicate paths');
  if (JSON.stringify(paths) !== JSON.stringify([...paths].sort())) {
    throw new Error('Canonical source manifest paths must be ordered');
  }
  for (const file of manifest.files) {
    if (isAbsolute(file.path) || file.path.split('/').includes('..')) {
      throw new Error(`Unsafe canonical source path: ${file.path}`);
    }
    const absolute = join(ROOT, file.path);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      throw new Error(`Canonical source is missing: ${file.path}`);
    }
    if (sha256File(absolute) !== file.sha256) {
      throw new Error(`Canonical source checksum mismatch: ${file.path}`);
    }
  }
}

function tableInfo(database: string, table: string): Array<{ name: string; pk: number }> {
  const output = sqlite(
    database,
    `SELECT name, pk FROM pragma_table_info('${table}') ORDER BY cid;`,
    true,
  ).trim();
  const rows = output ? JSON.parse(output) as Array<{ name: string; pk: number }> : [];
  if (rows.length === 0) throw new Error(`Required source table is missing: ${table}`);
  for (const row of rows) sqlIdentifier(row.name);
  return rows;
}

function exportTable(database: string, table: string): SeedStatement[] {
  const info = tableInfo(database, table);
  const columns = info.map(column => column.name);
  const primaryKey = info.filter(column => column.pk > 0).sort((a, b) => a.pk - b.pk);
  if (primaryKey.length === 0) throw new Error(`Table ${table} has no deterministic primary-key order`);

  const columnSql = columns.map(sqlIdentifier).join(',');
  const values = columns.map(column => {
    if (table === 'document_sections' && column === 'content') {
      return `quote(substr(${sqlIdentifier(column)},1,${CONTENT_CHARS_PER_STATEMENT}))`;
    }
    return `quote(${sqlIdentifier(column)})`;
  }).join(` || ',' || `);
  const order = table === 'historical_section_identities'
    ? ['document_id', 'source_ordinal', 'section_key'].map(sqlIdentifier).join(',')
    : primaryKey.map(column => sqlIdentifier(column.name)).join(',');
  const insertPrefix = `INSERT INTO ${sqlIdentifier(table)}(${columnSql}) VALUES`;
  const query =
    `SELECT '(' || ${values} || ');' ` +
    `FROM ${sqlIdentifier(table)} ORDER BY ${order};`;
  const tuples = splitGeneratedSql(sqlite(database, query)).map(sql => sql.slice(0, -1));
  // Historical section identity proof reads the exact one-row statement
  // shape, including its deterministic ordinal. All other ordinary tables use
  // bounded multi-row INSERTs so full local Workerd imports remain practical.
  const statements: SeedStatement[] = table === 'document_sections'
    ? tuples.map(tuple => ({ sql: `${insertPrefix}${tuple};`, rows: 1 }))
    : batchInsertValueTuples(insertPrefix, tuples);

  if (table === 'document_sections') {
    const content = sqlIdentifier('content');
    const updates = `
      WITH RECURSIVE chunks(id, offset) AS (
        SELECT id, ${CONTENT_CHARS_PER_STATEMENT + 1}
          FROM document_sections
         WHERE length(content) > ${CONTENT_CHARS_PER_STATEMENT}
        UNION ALL
        SELECT chunks.id, chunks.offset + ${CONTENT_CHARS_PER_STATEMENT}
          FROM chunks
          JOIN document_sections ON document_sections.id = chunks.id
         WHERE chunks.offset + ${CONTENT_CHARS_PER_STATEMENT} <= length(document_sections.content)
      )
      SELECT 'UPDATE "document_sections" SET ${content} = ${content} || ' ||
             quote(substr(document_sections.content, chunks.offset, ${CONTENT_CHARS_PER_STATEMENT})) ||
             ' WHERE "id" = ' || quote(document_sections.id) || ';'
        FROM chunks
        JOIN document_sections ON document_sections.id = chunks.id
       ORDER BY chunks.id, chunks.offset;
    `;
    statements.push(...splitGeneratedSql(sqlite(database, updates)).map(sql => ({ sql, rows: 0 })));
  }
  return statements;
}

function emptyTargetGuard(): SeedStatement {
  const counts = [...BASE_TABLES, 'strongs_fts', 'sections_fts']
    .map(table => `(SELECT count(*) FROM ${sqlIdentifier(table)})`)
    .join(' + ');
  return {
    sql: `SELECT CASE WHEN (${counts}) = 0 THEN 1 ELSE json_extract('D1 seed requires an empty target', '$') END;`,
    rows: 0,
  };
}

function writeChunks(table: string, ordinal: number, statements: SeedStatement[]): SeedFile[] {
  const files: SeedFile[] = [];
  let chunk: SeedStatement[] = [];
  let chunkBytes = 0;

  const flush = () => {
    if (chunk.length === 0) return;
    const chunkNumber = files.length;
    const filename = `${String(ordinal).padStart(2, '0')}-${table.replaceAll('_', '-')}-${String(chunkNumber).padStart(3, '0')}.sql`;
    const content = `${chunk.map(item => item.sql).join('\n')}\n`;
    const buffer = Buffer.from(content, 'utf8');
    writeFileSync(join(OUTPUT, filename), buffer);
    files.push({
      path: filename,
      table,
      chunk: chunkNumber,
      sha256: sha256Buffer(buffer),
      byteSize: buffer.byteLength,
      statementCount: chunk.length,
      rowCount: chunk.reduce((sum, item) => sum + item.rows, 0),
    });
    chunk = [];
    chunkBytes = 0;
  };

  for (const statement of statements) {
    const bytes = assertSafeStatement(statement.sql, `${table} statement`) + 1;
    if (chunk.length > 0 && chunkBytes + bytes > D1_SEED_FILE_BYTES) flush();
    chunk.push(statement);
    chunkBytes += bytes;
  }
  flush();
  return files;
}

const { database, clean } = parseArguments(process.argv.slice(2));
const sourceManifestBytes = readFileSync(SOURCE_MANIFEST_PATH);
const sourceManifest = parseDataManifest(sourceManifestBytes);
const d1CorpusIdentity = computeD1CorpusIdentity(sourceManifest);
verifyD1Migrations(ROOT, sourceManifest);
validateCanonicalSources(sourceManifest);
assertSemanticSource(database);

for (const table of [...BASE_TABLES, 'strongs_fts', 'sections_fts']) {
  const expected = sourceManifest.expectedCounts[table];
  if (!Number.isSafeInteger(expected) || expected < 0) {
    throw new Error(`Source manifest has no valid expected count for ${table}`);
  }
  const actual = queryNumber(database, `SELECT count(*) FROM ${sqlIdentifier(table)};`);
  if (actual !== expected) {
    throw new Error(`Source database ${table} count is ${actual}; manifest requires ${expected}`);
  }
}

prepareOutput(clean);
const files: SeedFile[] = [];
files.push(...writeChunks('empty-target-check', 0, [emptyTargetGuard()]));

for (let index = 0; index < BASE_TABLES.length; index++) {
  const table = BASE_TABLES[index];
  console.error(`[d1-seed] Exporting ${table}...`);
  const statements = exportTable(database, table);
  const rows = statements.reduce((sum, statement) => sum + statement.rows, 0);
  if (rows !== sourceManifest.expectedCounts[table]) {
    throw new Error(`Exported ${rows} ${table} rows; expected ${sourceManifest.expectedCounts[table]}`);
  }
  files.push(...writeChunks(table, index + 1, statements));
}

const ftsStatements: SeedStatement[] = [
  {
    sql: 'INSERT INTO "strongs_fts"("strongs_number","lemma","transliteration","definition") SELECT "strongs_number","lemma","transliteration","definition" FROM "strongs" ORDER BY "strongs_number";',
    rows: sourceManifest.expectedCounts.strongs_fts,
  },
  {
    sql: 'INSERT INTO "sections_fts"("title","content","topics") SELECT "title","content","topics" FROM "document_sections" ORDER BY "id";',
    rows: sourceManifest.expectedCounts.sections_fts,
  },
];
files.push(...writeChunks('fts', EXPORT_ORDER.length, ftsStatements));

for (const file of files) {
  const sql = readFileSync(join(OUTPUT, file.path), 'utf8');
  const statements = splitGeneratedSql(sql);
  if (statements.length !== file.statementCount) throw new Error(`Internal statement-count error: ${file.path}`);
  for (const [index, statement] of statements.entries()) {
    assertSafeStatement(statement, `${file.path} statement ${index + 1}`);
  }
  const derivedRows = statements.reduce(
    (sum, statement) => sum + insertedRows(statement, sourceManifest.expectedCounts),
    0,
  );
  if (derivedRows !== file.rowCount) throw new Error(`Internal row-count error: ${file.path}`);
  if (statementBytes(sql) !== file.byteSize) throw new Error(`Internal byte-count error: ${file.path}`);
}

const seedManifest = {
  manifestVersion: 2,
  algorithm: 'sha256',
  sourceManifest: {
    path: relative(ROOT, SOURCE_MANIFEST_PATH),
    sha256: computeSourceInventoryIdentity(sourceManifestBytes),
  },
  d1Materialization: {
    identityVersion: sourceManifest.materializations.d1.identityVersion,
    transformVersion: sourceManifest.materializations.d1.transformVersion,
    sha256: d1CorpusIdentity,
  },
  migrations: sourceManifest.materializations.d1.migrations.map(migration => ({ ...migration })),
  limits: {
    maximumStatementBytes: D1_MAX_STATEMENT_BYTES,
    targetFileBytes: D1_SEED_FILE_BYTES,
  },
  tableOrder: EXPORT_ORDER,
  expectedCounts: Object.fromEntries(
    [...BASE_TABLES, 'strongs_fts', 'sections_fts'].map(table => [table, sourceManifest.expectedCounts[table]]),
  ),
  files,
  totals: {
    fileCount: files.length,
    byteSize: files.reduce((sum, file) => sum + file.byteSize, 0),
    statementCount: files.reduce((sum, file) => sum + file.statementCount, 0),
    rowCount: files.reduce((sum, file) => sum + file.rowCount, 0),
  },
};
writeFileSync(join(OUTPUT, 'seed-manifest.json'), `${JSON.stringify(seedManifest, null, 2)}\n`);
console.error(
  `[d1-seed] Wrote ${files.length} files (${seedManifest.totals.rowCount.toLocaleString()} rows) to ` +
  `${relative(ROOT, OUTPUT)}/`,
);
