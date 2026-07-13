#!/usr/bin/env tsx
/** Verify a generated TheologAI SQLite database without modifying it. */

import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { buildD1ReadinessSql } from './check-remote-d1-readiness.js';
import {
  assertGenesisOneOneDatabase,
  assertHebrewLemmaCoverageDatabase,
  assertJohnOneOneDatabase,
} from './data-integrity.js';
import { computeD1CorpusIdentity, parseDataManifest, verifyD1Migrations } from './d1-corpus-identity.js';
import { verifyBiblicalLanguageUnicodeD1 } from './verify-biblical-language-unicode-d1.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'data', 'data-manifest.json');

function getDatabasePath(argv: string[]): string {
  const equalsArg = argv.find(arg => arg.startsWith('--database='));
  if (equalsArg) {
    const value = equalsArg.slice('--database='.length);
    if (!value) throw new Error('--database requires a path');
    return isAbsolute(value) ? value : resolve(ROOT, value);
  }

  const databaseIndex = argv.indexOf('--database');
  if (databaseIndex >= 0) {
    const value = argv[databaseIndex + 1];
    if (!value || value.startsWith('--')) throw new Error('--database requires a path');
    return isAbsolute(value) ? value : resolve(ROOT, value);
  }

  return join(ROOT, 'data', 'theologai.db');
}

const databasePath = getDatabasePath(process.argv.slice(2));
if (!existsSync(databasePath)) throw new Error(`Database not found: ${databasePath}`);

const manifest = parseDataManifest(readFileSync(MANIFEST_PATH));
verifyD1Migrations(ROOT, manifest);
const expectedTables = Object.keys(manifest.expectedCounts).sort();
  const expectedIndexes = ['idx_morph_strongs', 'idx_morph_strongs_canonical', 'idx_morph_verse', 'idx_strongs_book_stats_order', 'idx_strongs_form_stats_rank', 'idx_ubs_groups_source_order', 'idx_ubs_segments_lookup', 'idx_xref_from', 'idx_xref_votes'];
const db = new Database(databasePath, { readonly: true, fileMustExist: true });

try {
  const integrityRows = db.pragma('integrity_check') as Array<Record<string, string>>;
  if (integrityRows.length !== 1 || Object.values(integrityRows[0])[0] !== 'ok') {
    throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrityRows)}`);
  }

  const foreignKeyViolations = db.pragma('foreign_key_check') as unknown[];
  if (foreignKeyViolations.length > 0) {
    throw new Error(`Foreign-key check failed: ${JSON.stringify(foreignKeyViolations)}`);
  }

  const tables = (db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  ).all() as Array<{ name: string }>)
    .map(row => row.name)
    .filter(name => !/_((data)|(idx)|(content)|(docsize)|(config))$/.test(name))
    .sort();
  if (JSON.stringify(tables) !== JSON.stringify(expectedTables)) {
    throw new Error(`Unexpected table set: expected ${expectedTables.join(', ')}, received ${tables.join(', ')}`);
  }

  const indexes = (db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'"
  ).all() as Array<{ name: string }>).map(row => row.name).sort();
  for (const expectedIndex of expectedIndexes) {
    if (!indexes.includes(expectedIndex)) throw new Error(`Required index is missing: ${expectedIndex}`);
  }

  for (const [table, expected] of Object.entries(manifest.expectedCounts)) {
    if (!/^[a-z_]+$/.test(table)) throw new Error(`Invalid table name in manifest: ${table}`);
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
    if (row.count !== expected) {
      throw new Error(`Unexpected ${table} count: expected ${expected}, received ${row.count}`);
    }
  }

  const metadata = Object.fromEntries(
    (db.prepare('SELECT key, value FROM theologai_metadata').all() as Array<{ key: string; value: string }>)
      .map(row => [row.key, row.value]),
  );
  if (metadata.schema_version !== manifest.schemaVersion) {
    throw new Error(`Schema version marker mismatch: ${metadata.schema_version ?? 'missing'}`);
  }
  const d1CorpusIdentity = computeD1CorpusIdentity(manifest);
  if (metadata.corpus_manifest_sha256 !== d1CorpusIdentity) {
    throw new Error('D1 corpus identity marker mismatch');
  }
  const readiness = db.prepare(
    buildD1ReadinessSql(manifest.expectedCounts, manifest.schemaVersion, d1CorpusIdentity),
  ).get() as { readiness?: string } | undefined;
  if (readiness?.readiness !== 'ready') {
    throw new Error('Production D1 readiness SQL did not accept the complete derived database');
  }
  assertJohnOneOneDatabase(db, 'Verified SQLite morphology');
  assertGenesisOneOneDatabase(db, 'Verified SQLite morphology');
  assertHebrewLemmaCoverageDatabase(db, 'Verified SQLite morphology');
  verifyBiblicalLanguageUnicodeD1(ROOT, db, manifest.expectedCounts);

  const representativeQueries = [
    ["SELECT 1 FROM cross_references WHERE from_verse = 'John.3.16' LIMIT 1", 'John 3:16 cross-references'],
    ["SELECT 1 FROM strongs WHERE strongs_number = 'G25' LIMIT 1", "Strong's G25"],
    ["SELECT 1 FROM morphology WHERE book = 'Genesis' AND chapter = 1 AND verse = 1 LIMIT 1", 'Genesis 1:1 morphology'],
    ["SELECT 1 FROM documents WHERE id = 'nicene-creed' LIMIT 1", 'Nicene Creed'],
    ["SELECT 1 FROM documents WHERE id = 'nicene-creed' AND json_extract(metadata, '$.catalog.composition.startYear') = 381 AND json_extract(metadata, '$.catalog.composition.endYear') = 381 AND json_extract(metadata, '$.catalog.creators[0].role') = 'revising_body' LIMIT 1", 'Nicene Creed reviewed catalog metadata'],
    ['SELECT 1 FROM morph_codes LIMIT 1', 'morphology-code data'],
  ] as const;
  for (const [query, label] of representativeQueries) {
    if (!db.prepare(query).get()) throw new Error(`Representative record is missing: ${label}`);
  }

  const queryPlans = [
    {
      label: 'canonical token occurrence page',
      sql: `SELECT book, book_order, chapter, verse, position FROM morphology
            WHERE strongs_number = 'G0025'
            ORDER BY book_order, chapter, verse, position LIMIT 101`,
      index: 'idx_morph_strongs_canonical',
    },
    {
      label: 'canonical per-book usage',
      sql: `SELECT book, book_order, token_count, verse_count FROM strongs_book_stats
            WHERE strongs_key = 'G0025' ORDER BY book_order`,
      index: 'idx_strongs_book_stats_order',
    },
    {
      label: 'ranked attested forms',
      sql: `SELECT form_text, token_count, verse_count FROM strongs_form_stats
            WHERE strongs_key = 'G0025'
            ORDER BY token_count DESC, verse_count DESC, form_text LIMIT 100`,
      index: 'idx_strongs_form_stats_rank',
    },
  ] as const;
  for (const plan of queryPlans) {
    const details = (db.prepare(`EXPLAIN QUERY PLAN ${plan.sql}`).all() as Array<{ detail: string }>)
      .map(row => row.detail).join('\n');
    if (!details.includes(plan.index) || details.includes('USE TEMP B-TREE')) {
      throw new Error(`${plan.label} does not use ${plan.index} without a temporary sort: ${details}`);
    }
  }
} finally {
  db.close();
}

console.error(`[verify-database] Verified ${databasePath}.`);
