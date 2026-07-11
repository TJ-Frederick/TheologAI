-- TheologAI database schema baseline.
--
-- This migration contains schema only. Canonical corpus data is loaded from
-- tracked files under data/ by scripts/build-database.ts or by a separately
-- generated D1 seed artifact.

CREATE TABLE IF NOT EXISTS theologai_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cross_references (
  from_verse TEXT NOT NULL,
  to_verse TEXT NOT NULL,
  votes INTEGER NOT NULL,
  PRIMARY KEY (from_verse, to_verse)
);

CREATE TABLE IF NOT EXISTS strongs (
  strongs_number TEXT PRIMARY KEY,
  testament TEXT NOT NULL,
  lemma TEXT NOT NULL,
  transliteration TEXT,
  pronunciation TEXT,
  definition TEXT NOT NULL,
  derivation TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS strongs_fts USING fts5(
  strongs_number UNINDEXED,
  lemma,
  transliteration,
  definition
);

CREATE TABLE IF NOT EXISTS morphology (
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

CREATE TABLE IF NOT EXISTS stepbible_lexicons (
  strongs_number TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  extended_data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  date TEXT,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS document_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL REFERENCES documents(id),
  section_number TEXT,
  title TEXT,
  content TEXT NOT NULL,
  topics TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5(
  title,
  content,
  topics
);

CREATE TABLE IF NOT EXISTS morph_codes (
  code TEXT PRIMARY KEY,
  expansion TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_xref_from
  ON cross_references(from_verse);
CREATE INDEX IF NOT EXISTS idx_xref_votes
  ON cross_references(votes DESC);
CREATE INDEX IF NOT EXISTS idx_morph_verse
  ON morphology(book, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_morph_strongs
  ON morphology(strongs_number);
