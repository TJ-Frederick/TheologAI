#!/usr/bin/env tsx
/** Verify an ignored D1 seed artifact without contacting Cloudflare. */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  D1_MAX_STATEMENT_BYTES,
  assertSafeStatement,
  insertedRows,
  sha256File,
  splitGeneratedSql,
  statementBytes,
} from './d1-seed-utils.js';
import { computeD1CorpusIdentity, parseDataManifest, verifyD1Schema } from './d1-corpus-identity.js';

interface SeedManifest {
  manifestVersion: number;
  algorithm: 'sha256';
  sourceManifest: { path: string; sha256: string };
  d1Materialization: { identityVersion: number; transformVersion: number; sha256: string };
  schema: { version: string; path: string; sha256: string };
  limits: { maximumStatementBytes: number; targetFileBytes: number };
  tableOrder: string[];
  expectedCounts: Record<string, number>;
  files: Array<{
    path: string;
    table: string;
    chunk: number;
    sha256: string;
    byteSize: number;
    statementCount: number;
    rowCount: number;
  }>;
  totals: { fileCount: number; byteSize: number; statementCount: number; rowCount: number };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'scripts', 'd1-seed');
const MANIFEST_PATH = join(OUTPUT, 'seed-manifest.json');
if (!existsSync(MANIFEST_PATH)) throw new Error('D1 seed is absent; run npm run d1:seed:export first');

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as SeedManifest;
if (manifest.manifestVersion !== 2 || manifest.algorithm !== 'sha256') {
  throw new Error('Unsupported D1 seed manifest');
}
if (manifest.limits.maximumStatementBytes !== D1_MAX_STATEMENT_BYTES) {
  throw new Error('Seed manifest was generated for a different D1 statement limit');
}

for (const tracked of [manifest.sourceManifest, manifest.schema]) {
  if (tracked.path.startsWith('/') || tracked.path.split('/').includes('..')) {
    throw new Error(`Unsafe tracked path in seed manifest: ${tracked.path}`);
  }
  const path = join(ROOT, tracked.path);
  if (!existsSync(path) || !statSync(path).isFile() || sha256File(path) !== tracked.sha256) {
    throw new Error(`Tracked input changed after seed generation: ${tracked.path}`);
  }
}
const sourceManifest = parseDataManifest(readFileSync(join(ROOT, manifest.sourceManifest.path)));
verifyD1Schema(ROOT, sourceManifest);
if (manifest.d1Materialization.identityVersion !== sourceManifest.materializations.d1.identityVersion
  || manifest.d1Materialization.transformVersion !== sourceManifest.materializations.d1.transformVersion
  || manifest.d1Materialization.sha256 !== computeD1CorpusIdentity(sourceManifest)) {
  throw new Error('Seed manifest D1 materialization identity is stale');
}
if (manifest.schema.path !== sourceManifest.materializations.d1.schema.path
  || manifest.schema.sha256 !== sourceManifest.materializations.d1.schema.sha256) {
  throw new Error('Seed manifest schema identity differs from D1 materialization identity');
}

const listedFiles = manifest.files.map(file => file.path);
if (new Set(listedFiles).size !== listedFiles.length) throw new Error('Seed manifest contains duplicate files');
const actualFiles = readdirSync(OUTPUT).filter(path => path !== 'seed-manifest.json').sort();
if (JSON.stringify(actualFiles) !== JSON.stringify([...listedFiles].sort())) {
  throw new Error('Generated seed directory has missing or unlisted files');
}

let previousTable = -1;
const nextChunk = new Map<string, number>();
let byteSize = 0;
let statementCount = 0;
let rowCount = 0;
for (const file of manifest.files) {
  if (!/^[0-9]{2}-[a-z0-9-]+-[0-9]{3}\.sql$/.test(file.path)) {
    throw new Error(`Unsafe seed filename: ${file.path}`);
  }
  const tableIndex = file.table === 'empty-target-check' ? -1 : manifest.tableOrder.indexOf(file.table);
  if (tableIndex < previousTable || (tableIndex === -1 && file.table !== 'empty-target-check')) {
    throw new Error(`Seed files are not in declared table order at ${file.path}`);
  }
  previousTable = tableIndex;
  const expectedChunk = nextChunk.get(file.table) ?? 0;
  if (file.chunk !== expectedChunk) throw new Error(`Non-sequential chunk number for ${file.path}`);
  nextChunk.set(file.table, expectedChunk + 1);

  const path = join(OUTPUT, file.path);
  if (sha256File(path) !== file.sha256) throw new Error(`Checksum mismatch: ${file.path}`);
  const sql = readFileSync(path, 'utf8');
  if (statementBytes(sql) !== file.byteSize) throw new Error(`Byte-size mismatch: ${file.path}`);
  const statements = splitGeneratedSql(sql);
  if (statements.length !== file.statementCount) throw new Error(`Statement-count mismatch: ${file.path}`);
  for (const [index, statement] of statements.entries()) {
    assertSafeStatement(statement, `${file.path} statement ${index + 1}`);
  }
  const rows = statements.reduce(
    (sum, statement) => sum + insertedRows(statement, manifest.expectedCounts),
    0,
  );
  if (rows !== file.rowCount) throw new Error(`Row-count mismatch: ${file.path}`);
  byteSize += file.byteSize;
  statementCount += file.statementCount;
  rowCount += file.rowCount;
}

const totals = { fileCount: manifest.files.length, byteSize, statementCount, rowCount };
if (JSON.stringify(totals) !== JSON.stringify(manifest.totals)) {
  throw new Error(`Seed totals mismatch: expected ${JSON.stringify(manifest.totals)}, received ${JSON.stringify(totals)}`);
}
console.error(`[verify-d1-seed] Verified ${totals.fileCount} local seed files and ${totals.rowCount.toLocaleString()} rows.`);
