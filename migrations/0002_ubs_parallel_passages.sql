-- Normalized UBS/Paratext source-attested parallel-passage corpus.

CREATE TABLE ubs_parallel_sources (
  source_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  transform_version INTEGER NOT NULL,
  artifact_identity TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  copyright TEXT NOT NULL,
  license TEXT NOT NULL,
  license_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_commit TEXT NOT NULL,
  source_commit_date TEXT NOT NULL,
  source_blob TEXT NOT NULL,
  source_bytes INTEGER NOT NULL,
  source_sha256 TEXT NOT NULL,
  modified INTEGER NOT NULL CHECK (modified = 1),
  modification_note TEXT NOT NULL,
  label TEXT NOT NULL CHECK (label = 'source_attested_parallel'),
  directionality TEXT NOT NULL CHECK (directionality = 'unspecified')
);

CREATE TABLE ubs_parallel_groups (
  group_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES ubs_parallel_sources(source_id),
  source_ordinal INTEGER NOT NULL CHECK (source_ordinal > 0),
  label TEXT NOT NULL CHECK (label = 'source_attested_parallel'),
  directionality TEXT NOT NULL CHECK (directionality = 'unspecified'),
  UNIQUE (source_id, source_ordinal)
);

CREATE TABLE ubs_parallel_members (
  group_id TEXT NOT NULL REFERENCES ubs_parallel_groups(group_id),
  source_order INTEGER NOT NULL CHECK (source_order > 0),
  source_reference TEXT NOT NULL,
  normalized_reference TEXT NOT NULL,
  language_marker TEXT NOT NULL CHECK (language_marker IN ('HEB', 'GRK')),
  alignment_basis TEXT NOT NULL CHECK (alignment_basis IN ('BHS', 'LXX', 'UBSGNT5')),
  alignment_raw TEXT NOT NULL,
  PRIMARY KEY (group_id, source_order)
);

CREATE TABLE ubs_parallel_segments (
  group_id TEXT NOT NULL,
  member_order INTEGER NOT NULL,
  segment_order INTEGER NOT NULL CHECK (segment_order > 0),
  book_number INTEGER NOT NULL CHECK (book_number BETWEEN 1 AND 66),
  chapter INTEGER NOT NULL CHECK (chapter > 0),
  start_verse INTEGER NOT NULL CHECK (start_verse > 0),
  end_verse INTEGER NOT NULL CHECK (end_verse >= start_verse),
  PRIMARY KEY (group_id, member_order, segment_order),
  FOREIGN KEY (group_id, member_order)
    REFERENCES ubs_parallel_members(group_id, source_order)
);

CREATE INDEX idx_ubs_groups_source_order
  ON ubs_parallel_groups(source_id, source_ordinal, group_id);
CREATE INDEX idx_ubs_segments_lookup
  ON ubs_parallel_segments(book_number, chapter, start_verse, end_verse, group_id);
