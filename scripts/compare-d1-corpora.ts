#!/usr/bin/env tsx
/** Compare every D1-materialized row while ignoring only the scoped identity marker. */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import Database from 'better-sqlite3';

const TABLE_QUERIES = {
  theologai_metadata: "SELECT key, value FROM theologai_metadata WHERE key <> 'corpus_manifest_sha256' ORDER BY key",
  cross_references: 'SELECT * FROM cross_references ORDER BY from_verse, to_verse',
  strongs: 'SELECT * FROM strongs ORDER BY strongs_number',
  strongs_fts: 'SELECT strongs_number, lemma, transliteration, definition FROM strongs_fts ORDER BY strongs_number',
  morphology: 'SELECT * FROM morphology ORDER BY book, chapter, verse, position, word_text, strongs_number',
  stepbible_lexicons: 'SELECT * FROM stepbible_lexicons ORDER BY strongs_number',
  documents: 'SELECT * FROM documents ORDER BY id',
  document_sections: 'SELECT * FROM document_sections ORDER BY id',
  sections_fts: 'SELECT title, content, topics FROM sections_fts ORDER BY rowid',
  historical_source_packs: 'SELECT * FROM historical_source_packs ORDER BY pack_id',
  historical_works: 'SELECT * FROM historical_works ORDER BY work_id',
  historical_editions: 'SELECT * FROM historical_editions ORDER BY edition_id',
  historical_source_artifacts: 'SELECT * FROM historical_source_artifacts ORDER BY artifact_id',
  historical_edition_sections: 'SELECT * FROM historical_edition_sections ORDER BY edition_id, source_ordinal',
  historical_edition_sections_fts: 'SELECT edition_id, section_key, heading, content FROM historical_edition_sections_fts ORDER BY rowid',
  morph_codes: 'SELECT * FROM morph_codes ORDER BY code',
} as const;

interface TableDigest {
  rows: number;
  sha256: string;
}

function parseArguments(argv: string[]): { before: string; after: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key !== '--before' && key !== '--after') throw new Error(`Unknown argument: ${key}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a path`);
    values.set(key, isAbsolute(value) ? value : resolve(value));
  }
  const before = values.get('--before');
  const after = values.get('--after');
  if (!before || !after) throw new Error('--before and --after are required');
  for (const path of [before, after]) {
    if (!existsSync(path) || !path.endsWith('.db')) throw new Error(`Database is missing or unsafe: ${path}`);
  }
  return { before, after };
}

function tableDigest(db: Database.Database, sql: string): TableDigest {
  const hash = createHash('sha256');
  let rows = 0;
  for (const row of db.prepare(sql).iterate() as Iterable<Record<string, unknown>>) {
    hash.update(JSON.stringify(Object.values(row)));
    hash.update('\n');
    rows++;
  }
  return { rows, sha256: hash.digest('hex') };
}

function identityMarker(db: Database.Database): string | undefined {
  return (db.prepare("SELECT value FROM theologai_metadata WHERE key = 'corpus_manifest_sha256'").get() as { value?: string } | undefined)?.value;
}

const { before, after } = parseArguments(process.argv.slice(2));
const beforeDb = new Database(before, { readonly: true, fileMustExist: true });
const afterDb = new Database(after, { readonly: true, fileMustExist: true });
try {
  const tableDigests: Record<string, { before: TableDigest; after: TableDigest }> = {};
  for (const [table, sql] of Object.entries(TABLE_QUERIES)) {
    const pair = { before: tableDigest(beforeDb, sql), after: tableDigest(afterDb, sql) };
    tableDigests[table] = pair;
    if (pair.before.rows !== pair.after.rows || pair.before.sha256 !== pair.after.sha256) {
      throw new Error(`D1 corpus differs in ${table}: ${JSON.stringify(pair)}`);
    }
  }
  process.stdout.write(`${JSON.stringify({
    equivalent: true,
    ignoredMetadataKey: 'corpus_manifest_sha256',
    identityMarkers: { before: identityMarker(beforeDb), after: identityMarker(afterDb) },
    tables: tableDigests,
  }, null, 2)}\n`);
} finally {
  beforeDb.close();
  afterDb.close();
}
