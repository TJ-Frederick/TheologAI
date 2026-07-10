#!/usr/bin/env tsx
/** Semantically reconstruct the generated D1 seed in disposable SQLite. */

import { createHash } from 'crypto';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { sha256File } from './d1-seed-utils.js';
import { assertJohnOneOneDatabase } from './data-integrity.js';

interface SeedManifest {
  manifestVersion: number;
  algorithm: 'sha256';
  schema: { version: string; path: string; sha256: string };
  expectedCounts: Record<string, number>;
  files: Array<{
    path: string;
    table: string;
    sha256: string;
    byteSize: number;
  }>;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_DIRECTORY = join(ROOT, 'scripts', 'd1-seed');
const SEED_MANIFEST_PATH = join(SEED_DIRECTORY, 'seed-manifest.json');

function databaseArgument(argv: string[]): string {
  let value: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--database') {
      if (value !== undefined) throw new Error('--database may only be specified once');
      value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--database requires a path');
    } else if (argument.startsWith('--database=')) {
      if (value !== undefined) throw new Error('--database may only be specified once');
      value = argument.slice('--database='.length);
      if (!value) throw new Error('--database requires a path');
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  const path = value
    ? (isAbsolute(value) ? value : resolve(ROOT, value))
    : join(ROOT, 'data', 'theologai.db');
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Source database not found: ${path}`);
  }
  return path;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_]+$/.test(identifier)) throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  return `"${identifier}"`;
}

function tableDigest(db: Database.Database, table: string): { rows: number; sha256: string } {
  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{
    name: string;
    pk: number;
  }>;
  if (columns.length === 0) throw new Error(`Cannot hash missing table: ${table}`);

  const selected = columns.map(column => quoteIdentifier(column.name)).join(',');
  const primaryKey = columns.filter(column => column.pk > 0).sort((a, b) => a.pk - b.pk);
  const order = primaryKey.length > 0
    ? primaryKey.map(column => quoteIdentifier(column.name)).join(',')
    : columns.map(column => quoteIdentifier(column.name)).join(',');
  const hash = createHash('sha256');
  hash.update(columns.map(column => column.name).join('\0'));
  let rows = 0;

  for (const row of db.prepare(
    `SELECT ${selected} FROM ${quoteIdentifier(table)} ORDER BY ${order}`,
  ).iterate() as Iterable<Record<string, unknown>>) {
    rows++;
    for (const column of columns) {
      const value = row[column.name];
      if (value === null) {
        hash.update('n;');
      } else if (typeof value === 'number') {
        hash.update(`d${value};`);
      } else if (typeof value === 'bigint') {
        hash.update(`i${value};`);
      } else if (typeof value === 'string') {
        hash.update(`s${Buffer.byteLength(value, 'utf8')}:`);
        hash.update(value);
        hash.update(';');
      } else if (Buffer.isBuffer(value)) {
        hash.update(`b${value.byteLength}:`);
        hash.update(value);
        hash.update(';');
      } else {
        throw new Error(`Unsupported ${table}.${column.name} value type: ${typeof value}`);
      }
    }
  }
  return { rows, sha256: hash.digest('hex') };
}

function assertDatabaseHealth(db: Database.Database, expectedCounts: Record<string, number>): void {
  const integrity = db.pragma('integrity_check') as Array<Record<string, string>>;
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') {
    throw new Error(`Imported database integrity check failed: ${JSON.stringify(integrity)}`);
  }
  const foreignKeys = db.pragma('foreign_key_check') as unknown[];
  if (foreignKeys.length > 0) {
    throw new Error(`Imported database foreign-key check failed: ${JSON.stringify(foreignKeys)}`);
  }
  for (const [table, expected] of Object.entries(expectedCounts)) {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get() as { count: number };
    if (row.count !== expected) {
      throw new Error(`Imported ${table} count is ${row.count}; expected ${expected}`);
    }
  }

  const sectionFtsMismatches = db.prepare(
    `SELECT COUNT(*) AS count
       FROM sections_fts
       JOIN document_sections ds ON ds.id = sections_fts.rowid
      WHERE sections_fts.title IS NOT ds.title
         OR sections_fts.content IS NOT ds.content
         OR sections_fts.topics IS NOT ds.topics`,
  ).get() as { count: number };
  if (sectionFtsMismatches.count !== 0) {
    throw new Error(`Imported historical FTS has ${sectionFtsMismatches.count} rowid/content mismatches`);
  }
}

function assertRepresentativeFts(db: Database.Database): void {
  const strongs = db.prepare(
    `SELECT strongs_number FROM strongs_fts
     WHERE strongs_fts MATCH '"love"*'
     ORDER BY strongs_number LIMIT 1`,
  ).get();
  if (!strongs) throw new Error("Imported Strong's FTS has no representative 'love' result");

  const sections = db.prepare(
    `SELECT rowid FROM sections_fts
     WHERE sections_fts MATCH '"almighty"*'
     ORDER BY rowid LIMIT 1`,
  ).get();
  if (!sections) throw new Error("Imported historical FTS has no representative 'almighty' result");
}

const sourcePath = databaseArgument(process.argv.slice(2));
if (!existsSync(SEED_MANIFEST_PATH)) {
  throw new Error('D1 seed is absent; run npm run d1:seed:export first');
}
const manifest = JSON.parse(readFileSync(SEED_MANIFEST_PATH, 'utf8')) as SeedManifest;
if (manifest.manifestVersion !== 1 || manifest.algorithm !== 'sha256') {
  throw new Error('Unsupported D1 seed manifest');
}

const schemaPath = join(ROOT, manifest.schema.path);
if (!existsSync(schemaPath) || sha256File(schemaPath) !== manifest.schema.sha256) {
  throw new Error('Tracked schema does not match the D1 seed manifest');
}
for (const file of manifest.files) {
  const path = join(SEED_DIRECTORY, file.path);
  if (!existsSync(path) || statSync(path).size !== file.byteSize || sha256File(path) !== file.sha256) {
    throw new Error(`Seed file does not match its manifest: ${file.path}`);
  }
}

const workspace = mkdtempSync(join(tmpdir(), 'theologai-d1-seed-import-'));
const targetPath = join(workspace, 'imported.db');
const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
const target = new Database(targetPath);

try {
  target.pragma('journal_mode = OFF');
  target.pragma('synchronous = OFF');
  target.pragma('foreign_keys = ON');
  target.exec(readFileSync(schemaPath, 'utf8'));

  for (const file of manifest.files) {
    const sql = readFileSync(join(SEED_DIRECTORY, file.path), 'utf8');
    try {
      target.exec('BEGIN');
      target.exec(sql);
      target.exec('COMMIT');
    } catch (error) {
      if (target.inTransaction) target.exec('ROLLBACK');
      throw new Error(`Failed to apply ${file.path}`, { cause: error });
    }
  }

  assertDatabaseHealth(target, manifest.expectedCounts);
  assertJohnOneOneDatabase(source, 'Source SQLite morphology');
  assertJohnOneOneDatabase(target, 'Imported D1 morphology');
  assertRepresentativeFts(target);

  for (const table of Object.keys(manifest.expectedCounts)) {
    const sourceDigest = tableDigest(source, table);
    const targetDigest = tableDigest(target, table);
    if (JSON.stringify(targetDigest) !== JSON.stringify(sourceDigest)) {
      throw new Error(
        `Imported ${table} differs from source: expected ${JSON.stringify(sourceDigest)}, ` +
        `received ${JSON.stringify(targetDigest)}`,
      );
    }
  }

  const longestSource = source.prepare(
    'SELECT id, content FROM document_sections ORDER BY length(content) DESC, id LIMIT 1',
  ).get() as { id: number; content: string };
  const longestTarget = target.prepare(
    'SELECT id, content FROM document_sections WHERE id = ?',
  ).get(longestSource.id) as { id: number; content: string } | undefined;
  if (longestSource.content.length <= 10_000) {
    throw new Error('Source fixture has no long historical section to exercise seed reconstruction');
  }
  if (!longestTarget || longestTarget.content !== longestSource.content) {
    throw new Error(`Long historical section ${longestSource.id} was not reconstructed exactly`);
  }

  const guard = manifest.files.find(file => file.table === 'empty-target-check');
  if (!guard) throw new Error('Seed manifest has no empty-target guard');
  let guardRejected = false;
  try {
    target.exec(readFileSync(join(SEED_DIRECTORY, guard.path), 'utf8'));
  } catch {
    guardRejected = true;
  }
  if (!guardRejected) throw new Error('Empty-target guard accepted a populated database');

  console.error(
    `[verify-d1-seed-import] Reconstructed and compared ${Object.keys(manifest.expectedCounts).length} ` +
    `tables from ${manifest.files.length} ordered seed files.`,
  );
} finally {
  source.close();
  target.close();
  rmSync(workspace, { recursive: true, force: true });
}
