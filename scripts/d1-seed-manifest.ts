import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  D1_MAX_STATEMENT_BYTES,
  assertSafeStatement,
  insertedRows,
  sha256File,
  splitGeneratedSql,
  statementBytes,
} from './d1-seed-utils.js';
import {
  D1_EXPECTED_TABLES,
  computeD1CorpusIdentity,
  computeSourceInventoryIdentity,
  parseDataManifest,
  verifyD1Migrations,
  type DataManifest,
} from './d1-corpus-identity.js';
import { D1_SEED_EXPORT_ORDER } from './d1-seed-order.js';

export interface SeedManifestFile {
  path: string;
  table: string;
  chunk: number;
  sha256: string;
  byteSize: number;
  statementCount: number;
  rowCount: number;
}

export interface SeedManifest {
  manifestVersion: number;
  algorithm: 'sha256';
  sourceManifest: { path: string; sha256: string };
  d1Materialization: { identityVersion: number; transformVersion: number; sha256: string };
  migrations: Array<{ path: string; sha256: string }>;
  limits: { maximumStatementBytes: number; targetFileBytes: number };
  tableOrder: string[];
  expectedCounts: Record<string, number>;
  files: SeedManifestFile[];
  totals: { fileCount: number; byteSize: number; statementCount: number; rowCount: number };
}

const EMPTY_TARGET_GUARD = {
  path: '00-empty-target-check-000.sql',
  table: 'empty-target-check',
  chunk: 0,
} as const;

const FTS_SEED_TABLES = [
  'strongs_fts',
  'sections_fts',
  'historical_edition_sections_fts',
] as const;

function canonicalTableOrder(): string[] {
  return [...D1_SEED_EXPORT_ORDER];
}

function expectedRows(seed: SeedManifest, table: string): number {
  const count = seed.expectedCounts[table];
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`D1 seed expected count is invalid for ${table}`);
  }
  return count;
}

function expectedRowsForSeedTable(seed: SeedManifest, table: string): number {
  if (table !== 'fts') return expectedRows(seed, table);
  return FTS_SEED_TABLES.reduce((sum, ftsTable) => sum + expectedRows(seed, ftsTable), 0);
}

function assertSeedManifestRowCountTotals(seed: SeedManifest): void {
  const rowsBySeedTable = new Map(canonicalTableOrder().map(table => [table, 0]));
  for (const file of seed.files.slice(1)) {
    if (!Number.isSafeInteger(file.rowCount) || file.rowCount < 0) {
      throw new Error(`D1 seed file has an invalid row count: ${file.path}`);
    }
    rowsBySeedTable.set(file.table, rowsBySeedTable.get(file.table)! + file.rowCount);
  }
  for (const table of canonicalTableOrder()) {
    const actual = rowsBySeedTable.get(table)!;
    const expected = expectedRowsForSeedTable(seed, table);
    if (actual !== expected) {
      throw new Error(`D1 seed row-count total for ${table} is ${actual}; canonical expected count is ${expected}`);
    }
  }
}

/**
 * The generated seed is an executable sequence, not a directory of
 * interchangeable SQL files. Keep that sequence closed over the reviewed
 * exporter order before any local or remote runner is allowed to consume it.
 */
export function assertSeedManifestApplicationOrder(seed: SeedManifest): void {
  if (!Array.isArray(seed.files) || seed.files.length === 0) {
    throw new Error('D1 seed manifest must start with the empty-target guard');
  }

  const guard = seed.files[0];
  if (guard.path !== EMPTY_TARGET_GUARD.path
    || guard.table !== EMPTY_TARGET_GUARD.table
    || guard.chunk !== EMPTY_TARGET_GUARD.chunk) {
    throw new Error('D1 seed manifest must begin with 00-empty-target-check-000.sql');
  }
  if (seed.files.filter(file => file.table === EMPTY_TARGET_GUARD.table).length !== 1) {
    throw new Error('D1 seed manifest must contain exactly one empty-target guard');
  }
  if (!Number.isSafeInteger(guard.rowCount) || guard.rowCount !== 0) {
    throw new Error('D1 seed empty-target guard must not insert rows');
  }

  const order = new Map(canonicalTableOrder().map((table, index) => [table, index]));
  let previousTableIndex = -1;
  let activeTable: string | undefined;
  let expectedChunk = 0;

  for (const file of seed.files.slice(1)) {
    if (!Number.isSafeInteger(file.chunk) || file.chunk < 0) {
      throw new Error(`D1 seed file has an invalid chunk number: ${file.path}`);
    }
    const tableIndex = order.get(file.table);
    if (tableIndex === undefined) {
      throw new Error(`D1 seed file has an unexpected table: ${file.table}`);
    }
    if (file.table !== activeTable) {
      if (tableIndex <= previousTableIndex) {
        throw new Error(`D1 seed table order is not canonical at ${file.path}`);
      }
      activeTable = file.table;
      previousTableIndex = tableIndex;
      expectedChunk = 0;
    }
    if (file.chunk !== expectedChunk) {
      throw new Error(`D1 seed chunks are not contiguous for ${file.table}`);
    }
    const expectedPath =
      `${String(tableIndex + 1).padStart(2, '0')}-${file.table.replaceAll('_', '-')}-${String(file.chunk).padStart(3, '0')}.sql`;
    if (file.path !== expectedPath) {
      throw new Error(`D1 seed file name is not canonical: ${file.path}`);
    }
    expectedChunk++;
  }
  assertSeedManifestRowCountTotals(seed);
}

export function assertSeedManifestBinding(
  seed: SeedManifest,
  sourceBytes: Buffer,
  source: DataManifest,
): void {
  if (seed.manifestVersion !== 2 || seed.algorithm !== 'sha256') throw new Error('Unsupported D1 seed manifest');
  if (seed.sourceManifest.path !== 'data/data-manifest.json'
    || seed.sourceManifest.sha256 !== computeSourceInventoryIdentity(sourceBytes)) {
    throw new Error('D1 seed source-inventory identity is stale');
  }
  const d1 = source.materializations.d1;
  if (seed.d1Materialization.identityVersion !== d1.identityVersion
    || seed.d1Materialization.transformVersion !== d1.transformVersion
    || seed.d1Materialization.sha256 !== computeD1CorpusIdentity(source)) {
    throw new Error('D1 seed materialization identity is stale');
  }
  if (JSON.stringify(seed.migrations) !== JSON.stringify(d1.migrations)) {
    throw new Error('D1 seed migration identity is stale');
  }
  const canonicalCounts = (value: Record<string, number>) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  if (canonicalCounts(seed.expectedCounts) !== canonicalCounts(source.expectedCounts)) {
    throw new Error('D1 seed expectedCounts differ from the canonical materialization');
  }
  if (JSON.stringify(seed.tableOrder) !== JSON.stringify(canonicalTableOrder())) {
    throw new Error('D1 seed table order differs from the canonical export order');
  }
  if (JSON.stringify(Object.keys(seed.expectedCounts).sort()) !== JSON.stringify(D1_EXPECTED_TABLES)) {
    throw new Error('D1 seed expectedCounts registry differs from the canonical table registry');
  }
}

export function loadAndVerifyD1SeedManifest(root: string, seedRoot: string): SeedManifest {
  const sourcePath = join(root, 'data', 'data-manifest.json');
  const sourceBytes = readFileSync(sourcePath);
  const source = parseDataManifest(sourceBytes);
  verifyD1Migrations(root, source);
  const manifestPath = join(seedRoot, 'seed-manifest.json');
  if (!existsSync(manifestPath)) throw new Error('D1 seed is absent; run npm run d1:seed:export first');
  const seed = JSON.parse(readFileSync(manifestPath, 'utf8')) as SeedManifest;
  assertSeedManifestBinding(seed, sourceBytes, source);
  assertSeedManifestApplicationOrder(seed);
  if (seed.limits.maximumStatementBytes !== D1_MAX_STATEMENT_BYTES) {
    throw new Error('D1 seed statement limit differs from the reviewed runtime limit');
  }
  const listedFiles = seed.files.map(file => file.path);
  const actualFiles = readdirSync(seedRoot).filter(path => path !== 'seed-manifest.json').sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify([...listedFiles].sort())) {
    throw new Error('D1 seed directory has missing or unlisted files');
  }
  const seen = new Set<string>();
  let byteSize = 0;
  let statementCount = 0;
  let rowCount = 0;
  for (const file of seed.files) {
    if (!/^[0-9]{2}-[a-z0-9-]+-[0-9]{3}\.sql$/.test(file.path) || seen.has(file.path)) {
      throw new Error(`Unsafe or duplicate D1 seed file: ${file.path}`);
    }
    seen.add(file.path);
    const path = join(seedRoot, file.path);
    if (!existsSync(path) || statSync(path).size !== file.byteSize || sha256File(path) !== file.sha256) {
      throw new Error(`D1 seed file does not match its manifest: ${file.path}`);
    }
    const sql = readFileSync(path, 'utf8');
    if (statementBytes(sql) !== file.byteSize) throw new Error(`D1 seed byte-size mismatch: ${file.path}`);
    const statements = splitGeneratedSql(sql);
    if (statements.length !== file.statementCount) throw new Error(`D1 seed statement-count mismatch: ${file.path}`);
    for (const [index, statement] of statements.entries()) assertSafeStatement(statement, `${file.path} statement ${index + 1}`);
    const rows = statements.reduce((sum, statement) => sum + insertedRows(statement, seed.expectedCounts), 0);
    if (rows !== file.rowCount) throw new Error(`D1 seed row-count mismatch: ${file.path}`);
    byteSize += file.byteSize;
    statementCount += file.statementCount;
    rowCount += file.rowCount;
  }
  const totals = { fileCount: seed.files.length, byteSize, statementCount, rowCount };
  if (JSON.stringify(totals) !== JSON.stringify(seed.totals)) throw new Error('D1 seed totals mismatch');
  return seed;
}
