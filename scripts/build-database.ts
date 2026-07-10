#!/usr/bin/env tsx
/**
 * Build script: Populate SQLite database from source data files.
 *
 * Reads existing data files (TSV, JSON, gzip) and creates data/theologai.db.
 * Builds into a temporary database, validates it, then atomically replaces the
 * requested output. Source data files remain the source of truth.
 *
 * Usage: npm run build:db [-- --output /path/to/theologai.db]
 */

import Database from 'better-sqlite3';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'fs';
import { isAbsolute, join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');
const MANIFEST_PATH = join(DATA, 'data-manifest.json');
const manifestBytes = readFileSync(MANIFEST_PATH);
const manifest = JSON.parse(manifestBytes.toString('utf-8')) as {
  schemaVersion: string;
  expectedCounts: Record<string, number>;
};
const SCHEMA_PATH = join(ROOT, 'migrations', `${manifest.schemaVersion}.sql`);

function getOutputPath(argv: string[]): string {
  const equalsArg = argv.find(arg => arg.startsWith('--output='));
  if (equalsArg) {
    const value = equalsArg.slice('--output='.length);
    if (!value) throw new Error('--output requires a path');
    return isAbsolute(value) ? value : resolve(ROOT, value);
  }

  const outputIndex = argv.indexOf('--output');
  if (outputIndex >= 0) {
    const value = argv[outputIndex + 1];
    if (!value || value.startsWith('--')) throw new Error('--output requires a path');
    return isAbsolute(value) ? value : resolve(ROOT, value);
  }

  return join(DATA, 'theologai.db');
}

const DB_PATH = getOutputPath(process.argv.slice(2));
const TEMP_DB_PATH = `${DB_PATH}.tmp-${process.pid}`;

function removeIfPresent(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

function cleanupTemporaryDatabase(): void {
  removeIfPresent(TEMP_DB_PATH);
  removeIfPresent(`${TEMP_DB_PATH}-shm`);
  removeIfPresent(`${TEMP_DB_PATH}-wal`);
}

function log(msg: string) {
  console.error(`[build-db] ${msg}`);
}

// ── Create temporary database ──

mkdirSync(dirname(DB_PATH), { recursive: true });
cleanupTemporaryDatabase();
log(`Building temporary database for ${DB_PATH}`);
let db: Database.Database | undefined;

try {
db = new Database(TEMP_DB_PATH);
db.pragma('journal_mode = DELETE');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// ── Schema ──

db.exec(readFileSync(SCHEMA_PATH, 'utf-8'));
const insertMetadata = db.prepare('INSERT INTO theologai_metadata (key, value) VALUES (?, ?)');
insertMetadata.run('schema_version', manifest.schemaVersion);
insertMetadata.run('corpus_manifest_sha256', createHash('sha256').update(manifestBytes).digest('hex'));

// ── Tier 1: Cross-references ──

log('Loading cross-references...');
const xrefPath = join(DATA, 'cross-references', 'cross_references.txt');
const xrefContent = readFileSync(xrefPath, 'utf-8');
const xrefLines = xrefContent.split('\n');

const insertXref = db.prepare(
  'INSERT OR IGNORE INTO cross_references (from_verse, to_verse, votes) VALUES (?, ?, ?)'
);

const xrefTx = db.transaction(() => {
  let count = 0;
  for (let i = 1; i < xrefLines.length; i++) {
    const line = xrefLines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    insertXref.run(parts[0], parts[1], parseInt(parts[2], 10) || 0);
    count++;
  }
  return count;
});

const xrefCount = xrefTx();
log(`  Inserted ${xrefCount} cross-references`);

// ── Tier 1: Strong's concordance ──

log("Loading Strong's concordance...");
const insertStrongs = db.prepare(
  'INSERT OR IGNORE INTO strongs (strongs_number, testament, lemma, transliteration, pronunciation, definition, derivation) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const insertStrongsFTS = db.prepare(
  'INSERT INTO strongs_fts (strongs_number, lemma, transliteration, definition) VALUES (?, ?, ?, ?)'
);

const strongsTx = db.transaction(() => {
  let count = 0;

  for (const [testament, prefix, filename] of [
    ['NT', 'G', 'strongs-greek.json'],
    ['OT', 'H', 'strongs-hebrew.json'],
  ] as const) {
    const filePath = join(DATA, 'biblical-languages', filename);
    if (!existsSync(filePath)) {
      log(`  Warning: ${filename} not found, skipping`);
      continue;
    }

    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    for (const [key, entry] of Object.entries(data) as [string, any][]) {
      const def = typeof entry.def === 'string' ? entry.def : JSON.stringify(entry.def);
      const derivation = typeof entry.derivation === 'string'
        ? entry.derivation
        : entry.derivation ? JSON.stringify(entry.derivation) : null;
      insertStrongs.run(key, testament, entry.lemma, entry.translit || null, entry.pronunciation || null, def, derivation);
      insertStrongsFTS.run(key, entry.lemma, entry.translit || null, def);
      count++;
    }
  }

  return count;
});

const strongsCount = strongsTx();
log(`  Inserted ${strongsCount} Strong's entries`);

// ── Tier 2: STEPBible morphology ──

log('Loading STEPBible morphology...');
const stepbibleDir = join(DATA, 'biblical-languages', 'stepbible');
const insertMorph = db.prepare(
  'INSERT OR IGNORE INTO morphology (book, chapter, verse, position, word_text, lemma, strongs_number, morph_code, gloss) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

const morphTx = db.transaction(() => {
  let count = 0;

  for (const subdir of ['greek', 'hebrew']) {
    const dir = join(stepbibleDir, subdir);
    if (!existsSync(dir)) {
      log(`  Warning: ${subdir}/ not found, skipping`);
      continue;
    }

    const files = readdirSync(dir).filter(f => f.endsWith('.json.gz')).sort();
    for (const file of files) {
      const compressed = readFileSync(join(dir, file));
      const json = JSON.parse(gunzipSync(compressed).toString('utf-8'));
      const bookName = json.book as string;

      for (const [ch, verses] of Object.entries(json.chapters as Record<string, Record<string, any>>)) {
        for (const [v, verseData] of Object.entries(verses)) {
          const words = (verseData as any).words as any[];
          if (!words) continue;
          for (const w of words) {
            insertMorph.run(
              bookName,
              parseInt(ch, 10),
              parseInt(v, 10),
              w.position,
              w.text,
              w.lemma || '',
              w.strong || null,
              w.morph || null,
              w.gloss || null,
            );
            count++;
          }
        }
      }
    }
  }

  return count;
});

const morphCount = morphTx();
log(`  Inserted ${morphCount} morphology words`);

// ── Tier 2: Morphology codes ──

log('Loading morphology codes...');
const morphCodesPath = join(stepbibleDir, 'morph-codes.json');
if (existsSync(morphCodesPath)) {
  const morphCodes = JSON.parse(readFileSync(morphCodesPath, 'utf-8'));
  const insertMorphCode = db.prepare('INSERT OR IGNORE INTO morph_codes (code, expansion) VALUES (?, ?)');
  const morphCodeTx = db.transaction(() => {
    let count = 0;
    for (const [code, expansion] of Object.entries(morphCodes)) {
      insertMorphCode.run(code, expansion as string);
      count++;
    }
    return count;
  });
  const codeCount = morphCodeTx();
  log(`  Inserted ${codeCount} morphology codes`);
}

// ── Tier 2: STEPBible lexicons ──

log('Loading STEPBible lexicons...');
const lexiconDir = join(DATA, 'biblical-languages', 'stepbible-lexicons');
const insertLexicon = db.prepare(
  'INSERT OR IGNORE INTO stepbible_lexicons (strongs_number, source, extended_data) VALUES (?, ?, ?)'
);

const lexiconTx = db.transaction(() => {
  let count = 0;

  for (const [filename, defaultSource] of [
    ['tbesg-greek.json', 'Abbott-Smith'],
    ['tbesh-hebrew.json', 'BDB'],
  ] as const) {
    const filePath = join(lexiconDir, filename);
    if (!existsSync(filePath)) {
      log(`  Warning: ${filename} not found, skipping`);
      continue;
    }

    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    for (const [key, entry] of Object.entries(data) as [string, any][]) {
      insertLexicon.run(key, entry.source || defaultSource, JSON.stringify(entry));
      count++;
    }
  }

  return count;
});

const lexiconCount = lexiconTx();
log(`  Inserted ${lexiconCount} lexicon entries`);

// ── Tier 3: Historical documents ──

log('Loading historical documents...');
const histDir = join(DATA, 'historical-documents');
const insertDoc = db.prepare(
  'INSERT OR IGNORE INTO documents (id, title, type, date, metadata) VALUES (?, ?, ?, ?, ?)'
);
const insertSection = db.prepare(
  'INSERT INTO document_sections (document_id, section_number, title, content, topics) VALUES (?, ?, ?, ?, ?)'
);
const insertSectionFTS = db.prepare(
  'INSERT INTO sections_fts (title, content, topics) VALUES (?, ?, ?)'
);

const histTx = db.transaction(() => {
  let docCount = 0;
  let sectionCount = 0;

  const files = readdirSync(histDir).filter(f => f.endsWith('.json')).sort();
  for (const file of files) {
    const id = file.replace('.json', '');
    const doc = JSON.parse(readFileSync(join(histDir, file), 'utf-8'));

    insertDoc.run(
      id,
      doc.title,
      doc.type || 'document',
      doc.date || null,
      JSON.stringify({ topics: doc.topics || [] }),
    );
    docCount++;

    if (Array.isArray(doc.sections)) {
      for (let i = 0; i < doc.sections.length; i++) {
        const s = doc.sections[i];
        const content = s.content || s.answer || s.a || '';
        const title = s.title || s.question || s.chapter || s.q || '';
        const sectionNum = s.question_number || s.section_number || String(i + 1);
        const topics = JSON.stringify(s.topics || []);

        insertSection.run(id, sectionNum, title, content, topics);
        insertSectionFTS.run(title, content, topics);
        sectionCount++;
      }
    }
  }

  return { docCount, sectionCount };
});

const { docCount, sectionCount } = histTx();
log(`  Inserted ${docCount} documents with ${sectionCount} sections`);

// ── Validate and finalize ──

db.exec('ANALYZE');

const integrityRows = db.pragma('integrity_check') as Array<Record<string, string>>;
if (integrityRows.length !== 1 || Object.values(integrityRows[0])[0] !== 'ok') {
  throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrityRows)}`);
}

const foreignKeyViolations = db.pragma('foreign_key_check') as unknown[];
if (foreignKeyViolations.length > 0) {
  throw new Error(`Foreign-key check failed: ${JSON.stringify(foreignKeyViolations)}`);
}

for (const [table, expected] of Object.entries(manifest.expectedCounts)) {
  if (!/^[a-z_]+$/.test(table)) throw new Error(`Invalid table name in manifest: ${table}`);
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  if (row.count !== expected) {
    throw new Error(`Unexpected ${table} count: expected ${expected}, received ${row.count}`);
  }
}

db.close();
db = undefined;

const destinationWal = `${DB_PATH}-wal`;
if (existsSync(destinationWal) && statSync(destinationWal).size > 0) {
  throw new Error(
    `Refusing to replace ${DB_PATH} while a non-empty WAL exists. Stop processes using the database and checkpoint it first.`
  );
}
removeIfPresent(destinationWal);
removeIfPresent(`${DB_PATH}-shm`);
renameSync(TEMP_DB_PATH, DB_PATH);

log(`Database build complete at ${DB_PATH}`);
} catch (error) {
  if (db?.open) db.close();
  cleanupTemporaryDatabase();
  throw error;
}
