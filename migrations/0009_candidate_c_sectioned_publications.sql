-- Transform 12: Candidate-C corpus storage plus dormant sectioned-publication infrastructure.
--
-- This migration is a local storage/materialization successor to machine D1
-- transform version 10. It is corpus-neutral: it creates no source pack,
-- edition, section, publication, document, or delivery-profile rows and does
-- not authorize any historical work for publication.

-- Candidate C removes the body-bearing FTS shadow copies for the two section
-- indexes. Base rows are seeded first; the deterministic seed lifecycle then
-- rebuilds every FTS index once, integrity-checks it, and seals its base tables.
DROP TABLE historical_edition_sections_fts;
CREATE VIRTUAL TABLE historical_edition_sections_fts USING fts5(
  edition_id UNINDEXED,
  section_key UNINDEXED,
  heading,
  content,
  content='historical_edition_sections',
  content_rowid='rowid'
);

DROP TABLE sections_fts;
CREATE VIRTUAL TABLE sections_fts USING fts5(
  title,
  content,
  topics,
  content='document_sections',
  content_rowid='id'
);

CREATE TABLE historical_corpus_seal (
  seal_id INTEGER PRIMARY KEY CHECK (seal_id = 1),
  transform_version INTEGER NOT NULL CHECK (transform_version = 12),
  storage_contract TEXT NOT NULL CHECK (
    storage_contract = 'candidate_c_seed_base_rebuild_all_fts_integrity_check_then_seal_v1'
  )
);

-- The four FTS base tables are mutable only during the deterministic build or
-- seed. Once the singleton seal exists, incremental index maintenance is
-- deliberately unsupported.
CREATE TRIGGER transform12_strongs_sealed_insert BEFORE INSERT ON strongs
WHEN EXISTS (SELECT 1 FROM historical_corpus_seal WHERE seal_id = 1)
BEGIN SELECT RAISE(ABORT, 'Transform 12 corpus is sealed'); END;
CREATE TRIGGER transform12_strongs_sealed_update BEFORE UPDATE ON strongs
WHEN EXISTS (SELECT 1 FROM historical_corpus_seal WHERE seal_id = 1)
BEGIN SELECT RAISE(ABORT, 'Transform 12 corpus is sealed'); END;
CREATE TRIGGER transform12_strongs_sealed_delete BEFORE DELETE ON strongs
WHEN EXISTS (SELECT 1 FROM historical_corpus_seal WHERE seal_id = 1)
BEGIN SELECT RAISE(ABORT, 'Transform 12 corpus is sealed'); END;

CREATE TRIGGER transform12_document_sections_sealed_insert BEFORE INSERT ON document_sections
WHEN EXISTS (SELECT 1 FROM historical_corpus_seal WHERE seal_id = 1)
BEGIN SELECT RAISE(ABORT, 'Transform 12 corpus is sealed'); END;
CREATE TRIGGER transform12_document_sections_sealed_update BEFORE UPDATE ON document_sections
WHEN EXISTS (SELECT 1 FROM historical_corpus_seal WHERE seal_id = 1)
BEGIN SELECT RAISE(ABORT, 'Transform 12 corpus is sealed'); END;
CREATE TRIGGER transform12_document_sections_sealed_delete BEFORE DELETE ON document_sections
WHEN EXISTS (SELECT 1 FROM historical_corpus_seal WHERE seal_id = 1)
BEGIN SELECT RAISE(ABORT, 'Transform 12 corpus is sealed'); END;

CREATE TRIGGER transform12_edition_sections_sealed_insert BEFORE INSERT ON historical_edition_sections
WHEN EXISTS (SELECT 1 FROM historical_corpus_seal WHERE seal_id = 1)
BEGIN SELECT RAISE(ABORT, 'Transform 12 corpus is sealed'); END;
CREATE TRIGGER transform12_edition_sections_sealed_update BEFORE UPDATE ON historical_edition_sections
WHEN EXISTS (SELECT 1 FROM historical_corpus_seal WHERE seal_id = 1)
BEGIN SELECT RAISE(ABORT, 'Transform 12 corpus is sealed'); END;
CREATE TRIGGER transform12_edition_sections_sealed_delete BEFORE DELETE ON historical_edition_sections
WHEN EXISTS (SELECT 1 FROM historical_corpus_seal WHERE seal_id = 1)
BEGIN SELECT RAISE(ABORT, 'Transform 12 corpus is sealed'); END;

CREATE TRIGGER transform12_hierarchy_bodies_sealed_insert BEFORE INSERT ON historical_edition_hierarchy_bodies
WHEN EXISTS (SELECT 1 FROM historical_corpus_seal WHERE seal_id = 1)
BEGIN SELECT RAISE(ABORT, 'Transform 12 corpus is sealed'); END;
CREATE TRIGGER transform12_hierarchy_bodies_sealed_update BEFORE UPDATE ON historical_edition_hierarchy_bodies
WHEN EXISTS (SELECT 1 FROM historical_corpus_seal WHERE seal_id = 1)
BEGIN SELECT RAISE(ABORT, 'Transform 12 corpus is sealed'); END;
CREATE TRIGGER transform12_hierarchy_bodies_sealed_delete BEFORE DELETE ON historical_edition_hierarchy_bodies
WHEN EXISTS (SELECT 1 FROM historical_corpus_seal WHERE seal_id = 1)
BEGIN SELECT RAISE(ABORT, 'Transform 12 corpus is sealed'); END;

-- Generic dormant sectioned-publication seam. It is deliberately parallel to
-- historical_hierarchy_publications and does not reuse the active delivery-
-- profile table whose migration-0006 identity constraint remains unchanged.
CREATE TABLE historical_sectioned_publications (
  publication_id TEXT PRIMARY KEY CHECK (
    publication_id = trim(publication_id) AND length(publication_id) BETWEEN 1 AND 160
    AND publication_id GLOB '[A-Za-z0-9]*'
    AND publication_id NOT GLOB '*[^A-Za-z0-9._:-]*'
  ),
  document_id TEXT NOT NULL UNIQUE CHECK (
    document_id = trim(document_id) AND length(document_id) BETWEEN 1 AND 160
    AND document_id GLOB '[A-Za-z0-9]*'
    AND document_id NOT GLOB '*[^A-Za-z0-9._:-]*'
  ),
  pack_id TEXT NOT NULL REFERENCES historical_source_packs(pack_id) ON DELETE RESTRICT,
  work_id TEXT NOT NULL REFERENCES historical_works(work_id) ON DELETE RESTRICT,
  edition_id TEXT NOT NULL UNIQUE REFERENCES historical_editions(edition_id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  immutable_corpus_identity TEXT NOT NULL CHECK (
    length(immutable_corpus_identity) = 64
    AND immutable_corpus_identity NOT GLOB '*[^0-9a-f]*'
  ),
  section_package_identity TEXT NOT NULL CHECK (
    length(section_package_identity) = 64
    AND section_package_identity NOT GLOB '*[^0-9a-f]*'
  ),
  delivery_kind TEXT NOT NULL CHECK (delivery_kind = 'sectioned_only_v1'),
  section_count INTEGER NOT NULL CHECK (section_count > 0),
  landing_max_bytes INTEGER NOT NULL CHECK (landing_max_bytes = 16384),
  browse_page_size INTEGER NOT NULL CHECK (browse_page_size = 32),
  cursor_contract TEXT NOT NULL CHECK (cursor_contract = 'historical-sectioned-only-cursor-v1'),
  cursor_version INTEGER NOT NULL CHECK (cursor_version = 1),
  cursor_identity TEXT NOT NULL CHECK (
    length(cursor_identity) = 64 AND cursor_identity NOT GLOB '*[^0-9a-f]*'
  ),
  body_delivery TEXT NOT NULL CHECK (body_delivery = 'exact_section_only'),
  canonical_uri TEXT NOT NULL UNIQUE CHECK (
    canonical_uri = 'theologai://documents/' || document_id AND length(canonical_uri) <= 384
  ),
  activation_state TEXT NOT NULL CHECK (activation_state = 'dormant')
);

CREATE TRIGGER historical_sectioned_publication_requires_inactive_lineage
BEFORE INSERT ON historical_sectioned_publications
FOR EACH ROW
WHEN NEW.document_id != NEW.edition_id
  OR NOT EXISTS (
    SELECT 1 FROM historical_editions edition
    WHERE edition.edition_id = NEW.edition_id
      AND edition.work_id = NEW.work_id
      AND edition.pack_id = NEW.pack_id
  )
  OR EXISTS (SELECT 1 FROM documents WHERE id = NEW.document_id)
  OR EXISTS (
    SELECT 1 FROM historical_document_delivery_profiles
    WHERE document_id = NEW.document_id OR edition_id = NEW.edition_id
  )
BEGIN
  SELECT RAISE(ABORT, 'dormant sectioned publication must bind inactive edition lineage');
END;

CREATE TRIGGER historical_sectioned_publications_immutable_update
BEFORE UPDATE ON historical_sectioned_publications
BEGIN SELECT RAISE(ABORT, 'historical sectioned publications are immutable'); END;
CREATE TRIGGER historical_sectioned_publications_immutable_delete
BEFORE DELETE ON historical_sectioned_publications
BEGIN SELECT RAISE(ABORT, 'historical sectioned publications cannot be deleted'); END;

-- Dormancy is fail-closed in both directions: a later write cannot smuggle a
-- dormant authority row into the existing runtime document/profile surface.
CREATE TRIGGER historical_sectioned_publication_blocks_document_insert
BEFORE INSERT ON documents
WHEN EXISTS (SELECT 1 FROM historical_sectioned_publications WHERE document_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'dormant sectioned publication cannot become a runtime document'); END;
CREATE TRIGGER historical_sectioned_publication_blocks_document_update
BEFORE UPDATE OF id ON documents
WHEN EXISTS (SELECT 1 FROM historical_sectioned_publications WHERE document_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'dormant sectioned publication cannot become a runtime document'); END;
CREATE TRIGGER historical_sectioned_publication_blocks_profile_insert
BEFORE INSERT ON historical_document_delivery_profiles
WHEN EXISTS (
  SELECT 1 FROM historical_sectioned_publications
  WHERE document_id = NEW.document_id OR edition_id = NEW.edition_id
)
BEGIN SELECT RAISE(ABORT, 'dormant sectioned publication cannot become a delivery profile'); END;
CREATE TRIGGER historical_sectioned_publication_blocks_profile_update
BEFORE UPDATE OF document_id, edition_id ON historical_document_delivery_profiles
WHEN EXISTS (
  SELECT 1 FROM historical_sectioned_publications
  WHERE document_id = NEW.document_id OR edition_id = NEW.edition_id
)
BEGIN SELECT RAISE(ABORT, 'dormant sectioned publication cannot become a delivery profile'); END;
