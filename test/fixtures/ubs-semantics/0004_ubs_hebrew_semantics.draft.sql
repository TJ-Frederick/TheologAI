-- DESIGN FIXTURE ONLY. NOT AN EXECUTABLE MIGRATION.
-- Source bytes, license boundary, table names, and materialization remain unapproved.
-- Compiler validation guarantees parent domains precede children before ordered inserts.

CREATE TABLE ubs_semantic_sources (
  source_id TEXT PRIMARY KEY CHECK (
    source_id = trim(source_id) AND length(source_id) > 0
    AND substr(source_id, 1, 1) GLOB '[a-z]'
    AND substr(source_id, -1, 1) GLOB '[a-z0-9]'
    AND source_id = lower(source_id)
    AND source_id NOT GLOB '*[^a-z0-9._-]*'
    AND source_id NOT GLOB '*[-._][-._]*'
  ),
  source_role TEXT NOT NULL UNIQUE CHECK (source_role IN ('dictionary', 'lexical_domains')),
  schema_version TEXT NOT NULL CHECK (schema_version = 'ubs-semantics.v1'),
  artifact_identity TEXT NOT NULL CHECK (
    length(artifact_identity) = 64 AND artifact_identity NOT GLOB '*[^0-9a-f]*'
  ),
  title TEXT NOT NULL CHECK (title = trim(title) AND length(title) > 0),
  artifact_name TEXT NOT NULL CHECK (
    (source_role = 'dictionary' AND artifact_name = 'UBSHebrewDic-v0.9.2-en.JSON')
    OR (source_role = 'lexical_domains' AND artifact_name = 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON')
  ),
  artifact_version TEXT NOT NULL CHECK (artifact_version = '0.9.2'),
  language TEXT NOT NULL CHECK (language = 'Hebrew'),
  publisher TEXT NOT NULL CHECK (publisher = 'United Bible Societies'),
  license TEXT NOT NULL CHECK (license = 'CC BY-SA 4.0'),
  license_url TEXT NOT NULL CHECK (license_url = 'https://creativecommons.org/licenses/by-sa/4.0/'),
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%' AND source_url = trim(source_url)),
  source_commit TEXT NOT NULL CHECK (
    length(source_commit) = 40 AND source_commit NOT GLOB '*[^0-9a-f]*'
  ),
  source_blob TEXT NOT NULL CHECK (
    length(source_blob) = 40 AND source_blob NOT GLOB '*[^0-9a-f]*'
  ),
  source_sha256 TEXT NOT NULL CHECK (
    length(source_sha256) = 64 AND source_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  transform_version INTEGER NOT NULL CHECK (transform_version = 7),
  modified INTEGER NOT NULL CHECK (modified = 1),
  modification_note TEXT NOT NULL CHECK (
    modification_note = trim(modification_note) AND length(modification_note) > 0
  ),
  UNIQUE (source_id, source_role)
);

CREATE TABLE ubs_semantic_domains (
  source_id TEXT NOT NULL,
  source_role TEXT NOT NULL CHECK (source_role = 'lexical_domains'),
  domain_id TEXT NOT NULL CHECK (
    domain_id = trim(domain_id) AND length(domain_id) > 0
    AND substr(domain_id, 1, 1) GLOB '[a-z]'
    AND substr(domain_id, -1, 1) GLOB '[a-z0-9]'
    AND domain_id = lower(domain_id)
    AND domain_id NOT GLOB '*[^a-z0-9._-]*'
    AND domain_id NOT GLOB '*[-._][-._]*'
  ),
  source_ordinal INTEGER NOT NULL CHECK (source_ordinal > 0),
  parent_domain_id TEXT,
  label TEXT NOT NULL CHECK (label = trim(label) AND length(label) > 0),
  description TEXT CHECK (description = trim(description) AND length(description) > 0),
  PRIMARY KEY (source_id, domain_id),
  UNIQUE (source_id, source_ordinal),
  UNIQUE (source_id, domain_id, source_role),
  FOREIGN KEY (source_id, source_role)
    REFERENCES ubs_semantic_sources(source_id, source_role),
  FOREIGN KEY (source_id, parent_domain_id)
    REFERENCES ubs_semantic_domains(source_id, domain_id)
);

CREATE TABLE ubs_semantic_entries (
  source_id TEXT NOT NULL,
  source_role TEXT NOT NULL CHECK (source_role = 'dictionary'),
  entry_id TEXT NOT NULL CHECK (
    entry_id = trim(entry_id) AND length(entry_id) > 0
    AND substr(entry_id, 1, 1) GLOB '[a-z]'
    AND substr(entry_id, -1, 1) GLOB '[a-z0-9]'
    AND entry_id = lower(entry_id)
    AND entry_id NOT GLOB '*[^a-z0-9._-]*'
    AND entry_id NOT GLOB '*[-._][-._]*'
  ),
  source_ordinal INTEGER NOT NULL CHECK (source_ordinal > 0),
  lemma TEXT NOT NULL CHECK (lemma = trim(lemma) AND length(lemma) > 0),
  transliteration TEXT CHECK (transliteration = trim(transliteration) AND length(transliteration) > 0),
  part_of_speech TEXT CHECK (part_of_speech = trim(part_of_speech) AND length(part_of_speech) > 0),
  PRIMARY KEY (source_id, entry_id),
  UNIQUE (source_id, source_ordinal),
  UNIQUE (source_id, entry_id, source_role),
  FOREIGN KEY (source_id, source_role)
    REFERENCES ubs_semantic_sources(source_id, source_role)
);

CREATE TABLE ubs_semantic_entry_identities (
  source_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  lexical_identity TEXT NOT NULL CHECK (
    length(lexical_identity) = 5
    AND substr(lexical_identity, 1, 1) IN ('H', 'A')
    AND substr(lexical_identity, 2) NOT GLOB '*[^0-9]*'
    AND CAST(substr(lexical_identity, 2) AS INTEGER) > 0
  ),
  PRIMARY KEY (source_id, entry_id, lexical_identity),
  FOREIGN KEY (source_id, entry_id)
    REFERENCES ubs_semantic_entries(source_id, entry_id)
);

CREATE TABLE ubs_semantic_senses (
  source_id TEXT NOT NULL,
  source_role TEXT NOT NULL CHECK (source_role = 'dictionary'),
  entry_id TEXT NOT NULL,
  sense_id TEXT NOT NULL CHECK (
    sense_id = trim(sense_id) AND length(sense_id) > 0
    AND substr(sense_id, 1, 1) GLOB '[a-z]'
    AND substr(sense_id, -1, 1) GLOB '[a-z0-9]'
    AND sense_id = lower(sense_id)
    AND sense_id NOT GLOB '*[^a-z0-9._-]*'
    AND sense_id NOT GLOB '*[-._][-._]*'
  ),
  source_ordinal INTEGER NOT NULL CHECK (source_ordinal > 0),
  definition TEXT NOT NULL CHECK (definition = trim(definition) AND length(definition) > 0),
  glosses_json TEXT NOT NULL CHECK (
    json_valid(glosses_json)
    AND json_type(glosses_json) = 'array'
    AND json_array_length(glosses_json) > 0
  ),
  PRIMARY KEY (source_id, sense_id),
  UNIQUE (source_id, entry_id, source_ordinal),
  UNIQUE (source_id, sense_id, source_role),
  FOREIGN KEY (source_id, entry_id, source_role)
    REFERENCES ubs_semantic_entries(source_id, entry_id, source_role)
);

CREATE TABLE ubs_semantic_sense_domains (
  sense_source_id TEXT NOT NULL,
  sense_source_role TEXT NOT NULL CHECK (sense_source_role = 'dictionary'),
  sense_id TEXT NOT NULL,
  domain_source_id TEXT NOT NULL,
  domain_source_role TEXT NOT NULL CHECK (domain_source_role = 'lexical_domains'),
  domain_id TEXT NOT NULL,
  PRIMARY KEY (sense_source_id, sense_id, domain_source_id, domain_id),
  FOREIGN KEY (sense_source_id, sense_id, sense_source_role)
    REFERENCES ubs_semantic_senses(source_id, sense_id, source_role),
  FOREIGN KEY (domain_source_id, domain_id, domain_source_role)
    REFERENCES ubs_semantic_domains(source_id, domain_id, source_role)
);

CREATE TABLE ubs_semantic_reference_evidence (
  source_id TEXT NOT NULL,
  source_role TEXT NOT NULL CHECK (source_role = 'dictionary'),
  sense_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL CHECK (
    evidence_id = trim(evidence_id) AND length(evidence_id) > 0
    AND substr(evidence_id, 1, 1) GLOB '[a-z]'
    AND substr(evidence_id, -1, 1) GLOB '[a-z0-9]'
    AND evidence_id = lower(evidence_id)
    AND evidence_id NOT GLOB '*[^a-z0-9._-]*'
    AND evidence_id NOT GLOB '*[-._][-._]*'
  ),
  source_ordinal INTEGER NOT NULL CHECK (source_ordinal > 0),
  source_reference TEXT NOT NULL CHECK (source_reference = trim(source_reference) AND length(source_reference) > 0),
  normalized_reference TEXT NOT NULL CHECK (
    normalized_reference = trim(normalized_reference) AND length(normalized_reference) > 0
  ),
  evidence_kind TEXT NOT NULL CHECK (evidence_kind = 'source_attested_sense_reference'),
  PRIMARY KEY (source_id, evidence_id),
  UNIQUE (source_id, sense_id, source_ordinal),
  FOREIGN KEY (source_id, sense_id, source_role)
    REFERENCES ubs_semantic_senses(source_id, sense_id, source_role)
);

CREATE INDEX idx_ubs_semantic_identity_lookup
  ON ubs_semantic_entry_identities(lexical_identity, source_id, entry_id);
CREATE INDEX idx_ubs_semantic_sense_order
  ON ubs_semantic_senses(source_id, entry_id, source_ordinal, sense_id);
CREATE INDEX idx_ubs_semantic_domain_order
  ON ubs_semantic_domains(source_id, source_ordinal, domain_id);
CREATE INDEX idx_ubs_semantic_reference_lookup
  ON ubs_semantic_reference_evidence(normalized_reference, source_id, sense_id, source_ordinal);
