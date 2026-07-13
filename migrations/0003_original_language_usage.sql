-- Deterministic original-language usage aggregates and canonical occurrence order.
--
-- The corpus builder materializes these tables from the corrected morphology
-- source. Migrations remain schema-only so fresh SQLite and D1 builds share the
-- same deterministic seed path.

-- Intentionally no DEFAULT: a populated pre-0003 database must fail this
-- migration rather than silently acquire invalid placeholder ordering. The
-- deterministic corpus build applies migrations to an empty schema, then
-- inserts morphology rows with their canonical order.
ALTER TABLE morphology ADD COLUMN book_order INTEGER NOT NULL
  CHECK (book_order BETWEEN 1 AND 66);

CREATE INDEX idx_morph_strongs_canonical
  ON morphology(strongs_number, book_order, chapter, verse, position);

CREATE TABLE strongs_usage_stats (
  strongs_key TEXT PRIMARY KEY,
  token_count INTEGER NOT NULL CHECK (token_count > 0),
  verse_count INTEGER NOT NULL CHECK (verse_count > 0),
  book_count INTEGER NOT NULL CHECK (book_count > 0),
  form_count INTEGER NOT NULL CHECK (form_count > 0)
);

CREATE TABLE strongs_book_stats (
  strongs_key TEXT NOT NULL,
  book TEXT NOT NULL,
  book_order INTEGER NOT NULL CHECK (book_order BETWEEN 1 AND 66),
  token_count INTEGER NOT NULL CHECK (token_count > 0),
  verse_count INTEGER NOT NULL CHECK (verse_count > 0),
  PRIMARY KEY (strongs_key, book)
);

CREATE INDEX idx_strongs_book_stats_order
  ON strongs_book_stats(strongs_key, book_order);

CREATE TABLE strongs_form_stats (
  strongs_key TEXT NOT NULL,
  form_text TEXT NOT NULL,
  token_count INTEGER NOT NULL CHECK (token_count > 0),
  verse_count INTEGER NOT NULL CHECK (verse_count > 0),
  first_book TEXT NOT NULL,
  first_book_order INTEGER NOT NULL CHECK (first_book_order BETWEEN 1 AND 66),
  first_chapter INTEGER NOT NULL CHECK (first_chapter > 0),
  -- STEPBible represents Hebrew Psalm superscriptions as verse 0.
  first_verse INTEGER NOT NULL CHECK (first_verse >= 0),
  first_position INTEGER NOT NULL CHECK (first_position > 0),
  PRIMARY KEY (strongs_key, form_text)
);

CREATE INDEX idx_strongs_form_stats_rank
  ON strongs_form_stats(
    strongs_key,
    token_count DESC,
    verse_count DESC,
    form_text
  );
