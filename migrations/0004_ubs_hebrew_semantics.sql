-- Deterministic UBS Hebrew semantic layer (transform 7).
--
-- This migration intentionally stores source-attested lexical candidates and
-- coordinate evidence only.  It does not assert a morphology-token alignment
-- or adjudicate a contextual meaning.  The derived semantic layer and bridge
-- are CC BY-SA 4.0; see docs/UBS-HEBREW-V0.9.2-DERIVED-NOTICE.md.

CREATE TABLE ubs_semantic_artifacts (
  artifact_identity TEXT PRIMARY KEY CHECK (length(artifact_identity) = 64 AND artifact_identity NOT GLOB '*[^0-9a-f]*'),
  schema_version TEXT NOT NULL CHECK (schema_version = 'theologai-ubs-hebrew-semantic-compiled.v1'),
  compiler_version INTEGER NOT NULL CHECK (compiler_version = 1),
  transform_version INTEGER NOT NULL CHECK (transform_version = 7),
  rights_notice_json TEXT NOT NULL CHECK (json_valid(rights_notice_json) AND json_type(rights_notice_json) = 'object'),
  provenance_notice_json TEXT NOT NULL CHECK (json_valid(provenance_notice_json) AND json_type(provenance_notice_json) = 'object'),
  transformation_witness_json TEXT NOT NULL CHECK (json_valid(transformation_witness_json) AND json_type(transformation_witness_json) = 'object')
);

CREATE TABLE ubs_semantic_sources (
  artifact_identity TEXT NOT NULL,
  source_id TEXT NOT NULL CHECK (source_id = trim(source_id) AND source_id NOT GLOB '*[^a-z0-9._-]*'),
  source_role TEXT NOT NULL CHECK (source_role IN ('dictionary', 'lexical_domains')),
  schema_version TEXT NOT NULL CHECK (schema_version = 'ubs-semantics.v1'),
  transform_version INTEGER NOT NULL CHECK (transform_version = 7),
  title TEXT NOT NULL CHECK (title = trim(title) AND length(title) > 0),
  artifact_name TEXT NOT NULL CHECK (
    (source_role = 'dictionary' AND artifact_name = 'UBSHebrewDic-v0.9.2-en.JSON')
    OR (source_role = 'lexical_domains' AND artifact_name = 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON')
  ),
  artifact_version TEXT NOT NULL CHECK (artifact_version = '0.9.2'),
  language TEXT NOT NULL CHECK (language = 'Hebrew'),
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%' AND source_url = trim(source_url)),
  source_commit TEXT NOT NULL CHECK (length(source_commit) = 40 AND source_commit NOT GLOB '*[^0-9a-f]*'),
  source_blob TEXT NOT NULL CHECK (length(source_blob) = 40 AND source_blob NOT GLOB '*[^0-9a-f]*'),
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64 AND source_sha256 NOT GLOB '*[^0-9a-f]*'),
  license TEXT NOT NULL CHECK (license = 'CC BY-SA 4.0'),
  license_url TEXT NOT NULL CHECK (license_url = 'https://creativecommons.org/licenses/by-sa/4.0/'),
  publisher TEXT NOT NULL CHECK (publisher = 'United Bible Societies'),
  modified INTEGER NOT NULL CHECK (modified = 1),
  modification_description TEXT NOT NULL CHECK (modification_description = trim(modification_description) AND length(modification_description) > 0),
  PRIMARY KEY (artifact_identity, source_id),
  UNIQUE (artifact_identity, source_role),
  FOREIGN KEY (artifact_identity) REFERENCES ubs_semantic_artifacts(artifact_identity)
);

CREATE TABLE ubs_semantic_domains (
  artifact_identity TEXT NOT NULL,
  source_id TEXT NOT NULL,
  domain_id TEXT NOT NULL CHECK (domain_id = trim(domain_id) AND domain_id NOT GLOB '*[^a-z0-9._-]*'),
  source_ordinal INTEGER NOT NULL CHECK (source_ordinal > 0),
  parent_domain_id TEXT,
  label TEXT NOT NULL CHECK (label = trim(label) AND length(label) > 0),
  description TEXT CHECK (description = trim(description) AND length(description) > 0),
  PRIMARY KEY (artifact_identity, domain_id),
  UNIQUE (artifact_identity, source_id, source_ordinal),
  FOREIGN KEY (artifact_identity, source_id) REFERENCES ubs_semantic_sources(artifact_identity, source_id),
  FOREIGN KEY (artifact_identity, parent_domain_id) REFERENCES ubs_semantic_domains(artifact_identity, domain_id)
);

CREATE TABLE ubs_semantic_entries (
  artifact_identity TEXT NOT NULL,
  source_id TEXT NOT NULL,
  entry_id TEXT NOT NULL CHECK (entry_id = trim(entry_id) AND entry_id NOT GLOB '*[^a-z0-9._-]*'),
  source_entry_id TEXT NOT NULL CHECK (source_entry_id = trim(source_entry_id) AND length(source_entry_id) > 0),
  source_ordinal INTEGER NOT NULL CHECK (source_ordinal > 0),
  lemma TEXT NOT NULL CHECK (lemma = trim(lemma) AND length(lemma) > 0),
  part_of_speech_json TEXT NOT NULL CHECK (json_valid(part_of_speech_json) AND json_type(part_of_speech_json) = 'array'),
  PRIMARY KEY (artifact_identity, entry_id),
  UNIQUE (artifact_identity, source_id, source_ordinal),
  -- A sense must retain the dictionary source that owns its entry.
  UNIQUE (artifact_identity, source_id, entry_id),
  FOREIGN KEY (artifact_identity, source_id) REFERENCES ubs_semantic_sources(artifact_identity, source_id)
);

CREATE TABLE ubs_semantic_entry_identities (
  artifact_identity TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  lexical_identity TEXT NOT NULL CHECK (
    length(lexical_identity) = 5 AND substr(lexical_identity, 1, 1) IN ('H', 'A')
    AND substr(lexical_identity, 2) NOT GLOB '*[^0-9]*' AND CAST(substr(lexical_identity, 2) AS INTEGER) > 0
  ),
  PRIMARY KEY (artifact_identity, entry_id, lexical_identity),
  FOREIGN KEY (artifact_identity, entry_id) REFERENCES ubs_semantic_entries(artifact_identity, entry_id)
);

CREATE TABLE ubs_semantic_senses (
  artifact_identity TEXT NOT NULL,
  source_id TEXT NOT NULL,
  sense_id TEXT NOT NULL CHECK (sense_id = trim(sense_id) AND sense_id NOT GLOB '*[^a-z0-9._-]*'),
  source_sense_id TEXT NOT NULL CHECK (source_sense_id = trim(source_sense_id) AND length(source_sense_id) > 0),
  entry_id TEXT NOT NULL,
  source_ordinal INTEGER NOT NULL CHECK (source_ordinal > 0),
  definition_status TEXT NOT NULL CHECK (definition_status IN ('published', 'absent_in_source', 'excluded_unresolved_markup')),
  definition TEXT,
  definition_exclusion_reasons_json TEXT NOT NULL CHECK (json_valid(definition_exclusion_reasons_json) AND json_type(definition_exclusion_reasons_json) = 'array'),
  glosses_json TEXT NOT NULL CHECK (json_valid(glosses_json) AND json_type(glosses_json) = 'array' AND json_array_length(glosses_json) > 0),
  PRIMARY KEY (artifact_identity, sense_id),
  UNIQUE (artifact_identity, source_id, entry_id, source_ordinal),
  UNIQUE (artifact_identity, source_id, sense_id),
  CHECK ((definition_status = 'published') = (definition IS NOT NULL)),
  FOREIGN KEY (artifact_identity, source_id) REFERENCES ubs_semantic_sources(artifact_identity, source_id),
  FOREIGN KEY (artifact_identity, entry_id) REFERENCES ubs_semantic_entries(artifact_identity, entry_id),
  FOREIGN KEY (artifact_identity, source_id, entry_id)
    REFERENCES ubs_semantic_entries(artifact_identity, source_id, entry_id)
);

CREATE TABLE ubs_semantic_sense_domains (
  artifact_identity TEXT NOT NULL,
  sense_id TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  domain_ordinal INTEGER NOT NULL CHECK (domain_ordinal > 0),
  PRIMARY KEY (artifact_identity, sense_id, domain_id),
  UNIQUE (artifact_identity, sense_id, domain_ordinal),
  FOREIGN KEY (artifact_identity, sense_id) REFERENCES ubs_semantic_senses(artifact_identity, sense_id),
  FOREIGN KEY (artifact_identity, domain_id) REFERENCES ubs_semantic_domains(artifact_identity, domain_id)
);

CREATE TABLE ubs_semantic_reference_evidence (
  evidence_key INTEGER PRIMARY KEY,
  artifact_identity TEXT NOT NULL,
  source_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL CHECK (evidence_id = trim(evidence_id) AND evidence_id NOT GLOB '*[^a-z0-9._-]*'),
  sense_id TEXT NOT NULL,
  source_ordinal INTEGER NOT NULL CHECK (source_ordinal > 0),
  source_reference TEXT NOT NULL CHECK (source_reference = trim(source_reference) AND length(source_reference) > 0),
  raw_anchor TEXT NOT NULL CHECK (raw_anchor = trim(raw_anchor) AND length(raw_anchor) = 14 AND raw_anchor NOT GLOB '*[^0-9]*'),
  footnote_suffix TEXT NOT NULL CHECK (footnote_suffix = trim(footnote_suffix)),
  native_book_number INTEGER NOT NULL CHECK (native_book_number BETWEEN 1 AND 66),
  native_book_code TEXT NOT NULL CHECK (native_book_code GLOB '[A-Z0-9][A-Z0-9][A-Z0-9]'),
  native_chapter INTEGER NOT NULL CHECK (native_chapter > 0),
  -- Psalm superscriptions retain the source's verse zero coordinate.
  native_verse INTEGER NOT NULL CHECK (native_verse >= 0),
  UNIQUE (artifact_identity, evidence_key),
  FOREIGN KEY (artifact_identity, source_id) REFERENCES ubs_semantic_sources(artifact_identity, source_id),
  FOREIGN KEY (artifact_identity, sense_id) REFERENCES ubs_semantic_senses(artifact_identity, sense_id),
  FOREIGN KEY (artifact_identity, source_id, sense_id)
    REFERENCES ubs_semantic_senses(artifact_identity, source_id, sense_id)
);

CREATE TABLE ubs_semantic_normalized_coordinates (
  coordinate_key INTEGER PRIMARY KEY,
  artifact_identity TEXT NOT NULL,
  evidence_key INTEGER NOT NULL,
  evidence_id TEXT NOT NULL,
  target_ordinal INTEGER NOT NULL CHECK (target_ordinal > 0),
  normalized_book_number INTEGER NOT NULL CHECK (normalized_book_number BETWEEN 1 AND 66),
  normalized_book_code TEXT NOT NULL CHECK (normalized_book_code GLOB '[A-Z0-9][A-Z0-9][A-Z0-9]'),
  normalized_chapter INTEGER NOT NULL CHECK (normalized_chapter > 0),
  normalized_verse INTEGER NOT NULL CHECK (normalized_verse >= 0),
  normalized_reference TEXT NOT NULL CHECK (normalized_reference = trim(normalized_reference) AND length(normalized_reference) > 0),
  FOREIGN KEY (evidence_key) REFERENCES ubs_semantic_reference_evidence(evidence_key),
  FOREIGN KEY (artifact_identity, evidence_key)
    REFERENCES ubs_semantic_reference_evidence(artifact_identity, evidence_key)
);

CREATE INDEX idx_ubs_semantic_identity_candidate
  ON ubs_semantic_entry_identities(artifact_identity, lexical_identity, entry_id);
CREATE INDEX idx_ubs_semantic_sense_candidate_order
  ON ubs_semantic_senses(artifact_identity, entry_id, source_ordinal, sense_id);
CREATE INDEX idx_ubs_semantic_sense_domain_order
  ON ubs_semantic_sense_domains(artifact_identity, sense_id, domain_ordinal, domain_id);
CREATE INDEX idx_ubs_semantic_coordinate_lookup
  ON ubs_semantic_normalized_coordinates(artifact_identity, normalized_reference, evidence_key);
CREATE INDEX idx_ubs_semantic_evidence_sense_order
  ON ubs_semantic_reference_evidence(artifact_identity, sense_id, source_ordinal, evidence_key);
