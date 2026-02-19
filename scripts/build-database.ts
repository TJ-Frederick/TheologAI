#!/usr/bin/env tsx
/**
 * Build script: Populate SQLite database from source data files.
 *
 * Reads existing data files (TSV, JSON, gzip) and creates data/theologai.db.
 * Idempotent: drops and recreates all tables on each run.
 * Source data files remain the source of truth; SQLite is a derived artifact.
 *
 * Usage: npm run build:db
 */

import Database from 'better-sqlite3';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');
const DB_PATH = join(DATA, 'theologai.db');

function log(msg: string) {
  console.error(`[build-db] ${msg}`);
}

// ── Create database ──

log(`Creating database at ${DB_PATH}`);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// ── Schema ──

db.exec(`
  -- Cross-references (Tier 1)
  DROP TABLE IF EXISTS cross_references;
  CREATE TABLE cross_references (
    from_verse TEXT NOT NULL,
    to_verse TEXT NOT NULL,
    votes INTEGER NOT NULL,
    PRIMARY KEY (from_verse, to_verse)
  );
  CREATE INDEX idx_xref_from ON cross_references(from_verse);
  CREATE INDEX idx_xref_votes ON cross_references(votes DESC);

  -- Strong's concordance (Tier 1)
  DROP TABLE IF EXISTS strongs;
  CREATE TABLE strongs (
    strongs_number TEXT PRIMARY KEY,
    testament TEXT NOT NULL,
    lemma TEXT NOT NULL,
    transliteration TEXT,
    pronunciation TEXT,
    definition TEXT NOT NULL,
    derivation TEXT
  );

  -- Strong's FTS index
  DROP TABLE IF EXISTS strongs_fts;
  CREATE VIRTUAL TABLE strongs_fts USING fts5(
    strongs_number UNINDEXED, lemma, transliteration, definition
  );

  -- STEPBible morphology (Tier 2)
  DROP TABLE IF EXISTS morphology;
  CREATE TABLE morphology (
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    position INTEGER NOT NULL,
    word_text TEXT NOT NULL,
    lemma TEXT NOT NULL,
    strongs_number TEXT,
    morph_code TEXT,
    gloss TEXT,
    PRIMARY KEY (book, chapter, verse, position)
  );
  CREATE INDEX idx_morph_verse ON morphology(book, chapter, verse);
  CREATE INDEX idx_morph_strongs ON morphology(strongs_number);

  -- STEPBible lexicons (Tier 2)
  DROP TABLE IF EXISTS stepbible_lexicons;
  CREATE TABLE stepbible_lexicons (
    strongs_number TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    extended_data JSON NOT NULL
  );

  -- Historical documents (Tier 3)
  DROP TABLE IF EXISTS documents;
  DROP TABLE IF EXISTS document_sections;
  DROP TABLE IF EXISTS sections_fts;

  CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    date TEXT,
    metadata JSON
  );

  CREATE TABLE document_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL REFERENCES documents(id),
    section_number TEXT,
    title TEXT,
    content TEXT NOT NULL,
    topics JSON
  );

  CREATE VIRTUAL TABLE sections_fts USING fts5(title, content, topics);

  -- Morphology codes
  DROP TABLE IF EXISTS morph_codes;
  CREATE TABLE morph_codes (
    code TEXT PRIMARY KEY,
    expansion TEXT NOT NULL
  );
`);

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

    const files = readdirSync(dir).filter(f => f.endsWith('.json.gz'));
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

  const files = readdirSync(histDir).filter(f => f.endsWith('.json'));
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

// ── Finalize ──

db.exec('ANALYZE');
db.close();

log('Database build complete!');
