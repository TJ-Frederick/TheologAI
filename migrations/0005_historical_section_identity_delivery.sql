-- Historical source-first section identities (transform 8).
--
-- The existing document_sections rows and their FTS projection remain intact.
-- These sidecars establish stable document + section_key / source_ordinal
-- identities and read-only legacy aliases without copying any section body.

CREATE TABLE historical_document_delivery_profiles (
  document_id TEXT PRIMARY KEY
    REFERENCES documents(id) ON DELETE RESTRICT,
  work_id TEXT CHECK (
    work_id = trim(work_id) AND length(work_id) BETWEEN 1 AND 160
    AND work_id GLOB '[A-Za-z0-9]*' AND work_id NOT GLOB '*[^A-Za-z0-9._:-]*'
    AND work_id NOT IN ('.', '..')
  ),
  edition_id TEXT CHECK (
    edition_id = trim(edition_id) AND length(edition_id) BETWEEN 1 AND 160
    AND edition_id GLOB '[A-Za-z0-9]*' AND edition_id NOT GLOB '*[^A-Za-z0-9._:-]*'
    AND edition_id NOT IN ('.', '..')
  ),
  immutable_corpus_identity TEXT NOT NULL CHECK (
    length(immutable_corpus_identity) = 64
    AND immutable_corpus_identity NOT GLOB '*[^0-9a-f]*'
  ),
  section_package_identity TEXT CHECK (
    length(section_package_identity) = 64
    AND section_package_identity NOT GLOB '*[^0-9a-f]*'
  ),
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('complete_document', 'sectioned_only')),
  section_count INTEGER NOT NULL CHECK (section_count > 0),
  landing_max_bytes INTEGER NOT NULL CHECK (landing_max_bytes IN (0, 16384)),
  browse_page_size INTEGER NOT NULL CHECK (browse_page_size IN (0, 32)),
  cursor_version INTEGER NOT NULL CHECK (cursor_version IN (0, 1)),
  provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json) AND json_type(provenance_json) = 'object'),
  rights_json TEXT NOT NULL CHECK (json_valid(rights_json) AND json_type(rights_json) = 'object'),
  -- Complete documents retain their current whole-work behavior. A future
  -- sectioned edition must opt into the exact bounded landing/browse contract.
  CHECK (
    (delivery_mode = 'complete_document'
      AND work_id IS NULL AND edition_id IS NULL AND section_package_identity IS NULL
      AND landing_max_bytes = 0 AND browse_page_size = 0 AND cursor_version = 0)
    OR
    (delivery_mode = 'sectioned_only'
      AND work_id IS NOT NULL AND edition_id IS NOT NULL AND section_package_identity IS NOT NULL
      AND landing_max_bytes = 16384 AND browse_page_size = 32 AND cursor_version = 1)
  ),
  UNIQUE (work_id, edition_id)
);

-- Enables a same-document storage foreign key while retaining the legacy
-- integer row as an internal link only.
CREATE UNIQUE INDEX idx_document_sections_id_document
  ON document_sections(id, document_id);

CREATE TABLE historical_section_identities (
  document_id TEXT NOT NULL
    REFERENCES historical_document_delivery_profiles(document_id) ON DELETE RESTRICT,
  section_key TEXT NOT NULL CHECK (
    section_key = trim(section_key)
    AND length(section_key) BETWEEN 1 AND 160
    AND section_key GLOB '[A-Za-z0-9]*'
    AND section_key NOT GLOB '*[^A-Za-z0-9._:-]*'
    AND section_key NOT IN ('.', '..')
  ),
  source_ordinal INTEGER NOT NULL CHECK (source_ordinal > 0),
  -- This is a storage link only. Public and semantic identity is document_id +
  -- section_key / source_ordinal, never this legacy AUTOINCREMENT value.
  document_section_id INTEGER NOT NULL UNIQUE,
  PRIMARY KEY (document_id, section_key),
  UNIQUE (document_id, source_ordinal),
  UNIQUE (document_id, section_key, source_ordinal),
  FOREIGN KEY (document_section_id, document_id)
    REFERENCES document_sections(id, document_id) ON DELETE RESTRICT
);

CREATE TABLE historical_section_aliases (
  document_id TEXT NOT NULL,
  legacy_section_id TEXT NOT NULL CHECK (
    legacy_section_id = trim(legacy_section_id)
    AND length(legacy_section_id) BETWEEN 1 AND 160
    AND legacy_section_id GLOB '[A-Za-z0-9]*'
    AND legacy_section_id NOT GLOB '*[^A-Za-z0-9._:-]*'
    AND legacy_section_id NOT IN ('.', '..')
  ),
  section_key TEXT NOT NULL,
  source_ordinal INTEGER NOT NULL CHECK (source_ordinal > 0),
  PRIMARY KEY (document_id, legacy_section_id),
  FOREIGN KEY (document_id, section_key, source_ordinal)
    REFERENCES historical_section_identities(document_id, section_key, source_ordinal)
    ON DELETE RESTRICT
);

-- SQLite cannot express these cross-table invariants as CHECK clauses.
CREATE TRIGGER historical_section_identity_same_document_insert
BEFORE INSERT ON historical_section_identities
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM document_sections
  WHERE id = NEW.document_section_id AND document_id = NEW.document_id
)
BEGIN
  SELECT RAISE(ABORT, 'document section identity must retain its source document');
END;

CREATE TRIGGER historical_section_alias_non_shadowing_insert
BEFORE INSERT ON historical_section_aliases
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM historical_section_identities
  WHERE document_id = NEW.document_id
    AND section_key = NEW.legacy_section_id
    AND section_key != NEW.section_key
)
BEGIN
  SELECT RAISE(ABORT, 'legacy alias may not shadow a different canonical section key');
END;

-- Transform-8 sidecars are deterministic corpus facts, not mutable runtime
-- state. New transforms must add new rows through reviewed migrations instead.
CREATE TRIGGER historical_document_delivery_profile_immutable_update
BEFORE UPDATE ON historical_document_delivery_profiles
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'historical delivery profiles are immutable');
END;

CREATE TRIGGER historical_document_delivery_profile_immutable_delete
BEFORE DELETE ON historical_document_delivery_profiles
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'historical delivery profiles cannot be deleted');
END;

CREATE TRIGGER historical_section_identity_immutable_update
BEFORE UPDATE ON historical_section_identities
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'historical section identities are immutable');
END;

CREATE TRIGGER historical_section_identity_immutable_delete
BEFORE DELETE ON historical_section_identities
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'historical section identities cannot be deleted');
END;

CREATE TRIGGER historical_section_alias_immutable_update
BEFORE UPDATE ON historical_section_aliases
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'historical section aliases are immutable');
END;

CREATE TRIGGER historical_section_alias_immutable_delete
BEFORE DELETE ON historical_section_aliases
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'historical section aliases cannot be deleted');
END;

CREATE INDEX idx_historical_section_identities_browse
  ON historical_section_identities(document_id, source_ordinal, section_key);

CREATE INDEX idx_historical_section_aliases_target
  ON historical_section_aliases(document_id, section_key, source_ordinal);
