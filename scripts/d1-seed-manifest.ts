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
  computeD1CorpusIdentity,
  computeSourceInventoryIdentity,
  parseDataManifest,
  verifyD1Schema,
  type DataManifest,
} from './d1-corpus-identity.js';

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
  schema: { version: string; path: string; sha256: string };
  limits: { maximumStatementBytes: number; targetFileBytes: number };
  tableOrder: string[];
  expectedCounts: Record<string, number>;
  files: SeedManifestFile[];
  totals: { fileCount: number; byteSize: number; statementCount: number; rowCount: number };
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
  if (seed.schema.version !== source.schemaVersion
    || seed.schema.path !== d1.schema.path
    || seed.schema.sha256 !== d1.schema.sha256) {
    throw new Error('D1 seed schema identity is stale');
  }
  const canonicalCounts = (value: Record<string, number>) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  if (canonicalCounts(seed.expectedCounts) !== canonicalCounts(source.expectedCounts)) {
    throw new Error('D1 seed expectedCounts differ from the canonical materialization');
  }
}

export function loadAndVerifyD1SeedManifest(root: string, seedRoot: string): SeedManifest {
  const sourcePath = join(root, 'data', 'data-manifest.json');
  const sourceBytes = readFileSync(sourcePath);
  const source = parseDataManifest(sourceBytes);
  verifyD1Schema(root, source);
  const manifestPath = join(seedRoot, 'seed-manifest.json');
  if (!existsSync(manifestPath)) throw new Error('D1 seed is absent; run npm run d1:seed:export first');
  const seed = JSON.parse(readFileSync(manifestPath, 'utf8')) as SeedManifest;
  assertSeedManifestBinding(seed, sourceBytes, source);
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
