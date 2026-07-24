-- Reviewed, normalized public-domain historical source packs (transform 9).
--
-- These tables are the authority record for the eight approved editions.  The
-- build projects each reviewed section into the existing document tables only
-- after its manifest, package identity, rights screen, and artifacts validate.

CREATE TABLE historical_source_packs (
  pack_id TEXT PRIMARY KEY,
  revision TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL CHECK (
    length(manifest_sha256) = 64 AND manifest_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  source_path TEXT NOT NULL UNIQUE
);

CREATE TABLE historical_works (
  work_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  creator_metadata_status TEXT NOT NULL,
  creators_json TEXT NOT NULL CHECK (json_valid(creators_json) AND json_type(creators_json) = 'array')
);

CREATE TABLE historical_editions (
  edition_id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES historical_works(work_id) ON DELETE RESTRICT,
  pack_id TEXT NOT NULL REFERENCES historical_source_packs(pack_id) ON DELETE RESTRICT,
  language TEXT NOT NULL,
  contributor_groups_json TEXT NOT NULL CHECK (json_valid(contributor_groups_json) AND json_type(contributor_groups_json) = 'object'),
  publication TEXT NOT NULL,
  version TEXT NOT NULL,
  provenance_status TEXT NOT NULL CHECK (provenance_status IN ('verified', 'verified_with_uncertainty')),
  provenance_uncertainty TEXT,
  provenance_reviewed_at TEXT NOT NULL,
  underlying_work_rights_json TEXT NOT NULL CHECK (json_valid(underlying_work_rights_json) AND json_type(underlying_work_rights_json) = 'object'),
  exact_artifact_rights_json TEXT NOT NULL CHECK (json_valid(exact_artifact_rights_json) AND json_type(exact_artifact_rights_json) = 'object'),
  normalized_text_rights_json TEXT NOT NULL CHECK (json_valid(normalized_text_rights_json) AND json_type(normalized_text_rights_json) = 'object')
);

CREATE TABLE historical_source_artifacts (
  artifact_id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES historical_editions(edition_id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('authority', 'comparator')),
  locator TEXT NOT NULL,
  pin_kind TEXT NOT NULL CHECK (pin_kind = 'sha256'),
  pin_value TEXT NOT NULL CHECK (length(pin_value) = 64 AND pin_value NOT GLOB '*[^0-9a-f]*'),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  acquired_at TEXT NOT NULL,
  CHECK (pin_value = sha256)
);

CREATE TABLE historical_edition_sections (
  edition_id TEXT NOT NULL REFERENCES historical_editions(edition_id) ON DELETE RESTRICT,
  section_key TEXT NOT NULL,
  source_ordinal INTEGER NOT NULL CHECK (source_ordinal > 0),
  display_label TEXT NOT NULL,
  heading TEXT NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (edition_id, section_key),
  UNIQUE (edition_id, source_ordinal)
);

CREATE VIRTUAL TABLE historical_edition_sections_fts USING fts5(
  edition_id UNINDEXED,
  section_key UNINDEXED,
  heading,
  content
);

CREATE INDEX idx_historical_editions_work
  ON historical_editions(work_id, edition_id);
CREATE INDEX idx_historical_editions_pack
  ON historical_editions(pack_id, work_id);
CREATE INDEX idx_historical_source_artifacts_edition
  ON historical_source_artifacts(edition_id, artifact_id);
CREATE INDEX idx_historical_edition_sections_order
  ON historical_edition_sections(edition_id, source_ordinal);

-- A currently active source-pack document is exactly one selected edition for
-- its stable work identity.  Future editions may coexist in historical_editions
-- without silently becoming another active projection.
CREATE TRIGGER historical_sectioned_profile_requires_matching_edition
BEFORE INSERT ON historical_document_delivery_profiles
WHEN NEW.delivery_mode = 'sectioned_only'
 AND (
   NEW.document_id != NEW.work_id
   OR NEW.work_id IS NULL
   OR NEW.edition_id IS NULL
   OR NOT EXISTS (
     SELECT 1 FROM historical_editions
     WHERE edition_id = NEW.edition_id AND work_id = NEW.work_id
   )
 )
BEGIN
  SELECT RAISE(ABORT, 'sectioned delivery profile must select one matching edition for its work');
END;

CREATE TRIGGER historical_sectioned_profile_update_requires_matching_edition
BEFORE UPDATE OF document_id, work_id, edition_id, delivery_mode
ON historical_document_delivery_profiles
WHEN NEW.delivery_mode = 'sectioned_only'
 AND (
   NEW.document_id != NEW.work_id
   OR NEW.work_id IS NULL
   OR NEW.edition_id IS NULL
   OR NOT EXISTS (
     SELECT 1 FROM historical_editions
     WHERE edition_id = NEW.edition_id AND work_id = NEW.work_id
   )
 )
BEGIN
  SELECT RAISE(ABORT, 'sectioned delivery profile must select one matching edition for its work');
END;
