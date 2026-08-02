-- Generic pre-acquisition candidate schema. Not a migration or seed.
PRAGMA foreign_keys = ON;

CREATE TABLE source_file (
  source_file_id TEXT NOT NULL CHECK (length(source_file_id) = 35 AND substr(source_file_id,1,3) = 'sf:' AND substr(source_file_id,4) NOT GLOB '*[^0-9a-f]*'),
  corpus TEXT NOT NULL CHECK (corpus IN ('greek', 'hebrew')),
  synthetic_path TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
  byte_count INTEGER NOT NULL CHECK (byte_count > 0),
  PRIMARY KEY (source_file_id, corpus),
  UNIQUE (corpus, synthetic_path)
) WITHOUT ROWID;

CREATE TABLE reference_context (
  reference_context_id TEXT NOT NULL CHECK (length(reference_context_id) = 35 AND substr(reference_context_id,1,3) = 'rc:' AND substr(reference_context_id,4) NOT GLOB '*[^0-9a-f]*'),
  corpus TEXT NOT NULL CHECK (corpus IN ('greek', 'hebrew')),
  book INTEGER NOT NULL CHECK (book BETWEEN 1 AND 66),
  chapter INTEGER NOT NULL CHECK (chapter > 0),
  verse INTEGER NOT NULL CHECK (verse >= 0),
  orthographic_word_ordinal INTEGER NOT NULL CHECK (orthographic_word_ordinal > 0),
  source_segment_count INTEGER NOT NULL CHECK (source_segment_count >= 0),
  runtime_segment_count INTEGER CHECK (runtime_segment_count IS NULL OR runtime_segment_count >= 0),
  runtime_candidate_count INTEGER NOT NULL CHECK (runtime_candidate_count >= 0),
  alignment_classification TEXT NOT NULL CHECK (alignment_classification IN (
    'validated_normalized_alignment', 'missing_runtime', 'ambiguous_runtime',
    'segmentation_conflict', 'text_conflict', 'runtime_only'
  )),
  CHECK ((corpus = 'hebrew' AND book BETWEEN 1 AND 39) OR (corpus = 'greek' AND book BETWEEN 40 AND 66)),
  CHECK (
    (alignment_classification = 'validated_normalized_alignment' AND source_segment_count > 0 AND runtime_segment_count = source_segment_count AND runtime_candidate_count = 1)
    OR (alignment_classification = 'missing_runtime' AND source_segment_count > 0 AND runtime_segment_count = 0 AND runtime_candidate_count = 0)
    OR (alignment_classification = 'ambiguous_runtime' AND source_segment_count > 0 AND runtime_segment_count IS NULL AND runtime_candidate_count > 1)
    OR (alignment_classification = 'segmentation_conflict' AND source_segment_count > 0 AND runtime_segment_count > 0 AND source_segment_count <> runtime_segment_count AND runtime_candidate_count = 1)
    OR (alignment_classification = 'text_conflict' AND source_segment_count > 0 AND runtime_segment_count = source_segment_count AND runtime_candidate_count = 1)
    OR (alignment_classification = 'runtime_only' AND source_segment_count = 0 AND runtime_segment_count > 0 AND runtime_candidate_count = 1)
  ),
  PRIMARY KEY (reference_context_id, corpus),
  UNIQUE (corpus, book, chapter, verse, orthographic_word_ordinal)
) WITHOUT ROWID;

CREATE TABLE syntax_group (
  syntax_group_id TEXT NOT NULL CHECK (length(syntax_group_id) = 35 AND substr(syntax_group_id,1,3) = 'sg:' AND substr(syntax_group_id,4) NOT GLOB '*[^0-9a-f]*'),
  source_file_id TEXT NOT NULL,
  corpus TEXT NOT NULL,
  parent_syntax_group_id TEXT,
  source_group_id TEXT NOT NULL,
  group_ordinal INTEGER NOT NULL CHECK (group_ordinal > 0),
  class TEXT,
  role TEXT,
  rule TEXT,
  head TEXT,
  PRIMARY KEY (syntax_group_id, source_file_id, corpus),
  UNIQUE (source_file_id, corpus, source_group_id),
  UNIQUE (source_file_id, corpus, group_ordinal),
  FOREIGN KEY (source_file_id, corpus) REFERENCES source_file(source_file_id, corpus),
  FOREIGN KEY (parent_syntax_group_id, source_file_id, corpus)
    REFERENCES syntax_group(syntax_group_id, source_file_id, corpus),
  CHECK (parent_syntax_group_id IS NULL OR parent_syntax_group_id <> syntax_group_id)
) WITHOUT ROWID;

CREATE TABLE token (
  token_id TEXT NOT NULL CHECK (length(token_id) = 35 AND substr(token_id,1,3) = 'tk:' AND substr(token_id,4) NOT GLOB '*[^0-9a-f]*'),
  source_file_id TEXT NOT NULL,
  corpus TEXT NOT NULL,
  syntax_group_id TEXT NOT NULL,
  reference_context_id TEXT NOT NULL,
  source_token_id TEXT NOT NULL,
  source_morph_ordinal INTEGER NOT NULL CHECK (source_morph_ordinal > 0),
  class TEXT,
  role TEXT,
  lang TEXT CHECK (lang IS NULL OR (corpus = 'hebrew' AND lang IN ('H', 'A'))),
  PRIMARY KEY (token_id, source_file_id, corpus),
  UNIQUE (source_file_id, corpus, source_token_id),
  UNIQUE (reference_context_id, corpus, source_morph_ordinal),
  FOREIGN KEY (source_file_id, corpus) REFERENCES source_file(source_file_id, corpus),
  FOREIGN KEY (syntax_group_id, source_file_id, corpus)
    REFERENCES syntax_group(syntax_group_id, source_file_id, corpus),
  FOREIGN KEY (reference_context_id, corpus)
    REFERENCES reference_context(reference_context_id, corpus)
) WITHOUT ROWID;

CREATE TABLE participant_ref (
  participant_ref_id TEXT NOT NULL CHECK (length(participant_ref_id) = 35 AND substr(participant_ref_id,1,3) = 'pr:' AND substr(participant_ref_id,4) NOT GLOB '*[^0-9a-f]*'),
  source_file_id TEXT NOT NULL,
  corpus TEXT NOT NULL,
  source_token_id TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK (relationship IN ('referent', 'subjref', 'participantref')),
  target_source_id TEXT,
  target_resolution TEXT CHECK (target_resolution IN ('exact_token', 'orthographic_word', 'dangling')),
  target_token_id TEXT,
  target_token_source_file_id TEXT,
  target_token_corpus TEXT,
  target_reference_context_id TEXT,
  target_context_corpus TEXT,
  PRIMARY KEY (participant_ref_id, source_file_id, corpus),
  FOREIGN KEY (source_token_id, source_file_id, corpus)
    REFERENCES token(token_id, source_file_id, corpus),
  FOREIGN KEY (target_token_id, target_token_source_file_id, target_token_corpus)
    REFERENCES token(token_id, source_file_id, corpus),
  FOREIGN KEY (target_reference_context_id, target_context_corpus)
    REFERENCES reference_context(reference_context_id, corpus),
  CHECK (target_token_source_file_id IS NULL OR target_token_source_file_id = source_file_id),
  CHECK (target_token_corpus IS NULL OR target_token_corpus = corpus),
  CHECK (target_context_corpus IS NULL OR target_context_corpus = corpus),
  CHECK (
    (target_resolution = 'exact_token' AND target_source_id IS NOT NULL
      AND target_token_id IS NOT NULL AND target_token_source_file_id IS NOT NULL AND target_token_corpus IS NOT NULL
      AND target_reference_context_id IS NULL AND target_context_corpus IS NULL)
    OR (target_resolution = 'orthographic_word' AND target_source_id IS NOT NULL
      AND target_token_id IS NULL AND target_token_source_file_id IS NULL AND target_token_corpus IS NULL
      AND target_reference_context_id IS NOT NULL AND target_context_corpus IS NOT NULL)
    OR (target_resolution IS NULL AND target_source_id IS NULL
      AND target_token_id IS NULL AND target_token_source_file_id IS NULL AND target_token_corpus IS NULL
      AND target_reference_context_id IS NULL AND target_context_corpus IS NULL)
    OR (target_resolution = 'dangling' AND target_source_id IS NOT NULL
      AND target_token_id IS NULL AND target_token_source_file_id IS NULL AND target_token_corpus IS NULL
      AND target_reference_context_id IS NULL AND target_context_corpus IS NULL)
  )
) WITHOUT ROWID;

CREATE TABLE group_reference (
  group_reference_id TEXT NOT NULL CHECK (length(group_reference_id) = 35 AND substr(group_reference_id,1,3) = 'gr:' AND substr(group_reference_id,4) NOT GLOB '*[^0-9a-f]*'),
  source_file_id TEXT NOT NULL,
  corpus TEXT NOT NULL,
  syntax_group_id TEXT NOT NULL,
  reference_context_id TEXT NOT NULL,
  reference_ordinal INTEGER NOT NULL CHECK (reference_ordinal > 0),
  PRIMARY KEY (group_reference_id, source_file_id, corpus),
  UNIQUE (syntax_group_id, source_file_id, corpus, reference_context_id),
  UNIQUE (syntax_group_id, source_file_id, corpus, reference_ordinal),
  FOREIGN KEY (syntax_group_id, source_file_id, corpus)
    REFERENCES syntax_group(syntax_group_id, source_file_id, corpus),
  FOREIGN KEY (reference_context_id, corpus)
    REFERENCES reference_context(reference_context_id, corpus)
) WITHOUT ROWID;

CREATE INDEX reference_context_coordinate_lookup
  ON reference_context (corpus, book, chapter, verse, orthographic_word_ordinal);
CREATE INDEX token_context_lookup
  ON token (reference_context_id, corpus, source_morph_ordinal);
CREATE INDEX participant_ref_private_resolution
  ON participant_ref (target_resolution, relationship);
CREATE INDEX group_reference_context_lookup
  ON group_reference (reference_context_id, corpus, reference_ordinal);

CREATE VIEW public_resolved_participant_ref AS
SELECT participant_ref_id, source_token_id, relationship, target_resolution,
       target_token_id, target_reference_context_id
FROM participant_ref
WHERE (target_resolution = 'exact_token' AND target_token_id IS NOT NULL)
   OR (target_resolution = 'orthographic_word' AND target_reference_context_id IS NOT NULL);

CREATE VIEW public_validated_reference_context AS
SELECT reference_context_id, corpus, book, chapter, verse, orthographic_word_ordinal
FROM reference_context
WHERE alignment_classification = 'validated_normalized_alignment';
