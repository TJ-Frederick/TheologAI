-- Transform 13: activate the already attested four-part Aquinas hierarchy.
--
-- Migration 0008 preserved a dormant publication contract. This successor
-- retains any historical dormant record, adds an active state, and requires a
-- publication to match its hierarchy availability. It changes no source lock,
-- body, node, or physical Transform-12 storage lifecycle.

DROP TRIGGER historical_hierarchy_publication_requires_inactive_authority_insert;
DROP TRIGGER historical_hierarchy_publications_immutable_update;
DROP TRIGGER historical_hierarchy_publications_immutable_delete;

ALTER TABLE historical_hierarchy_publications RENAME TO historical_hierarchy_publications_transform10;

CREATE TABLE historical_hierarchy_publications (
  publication_id TEXT PRIMARY KEY CHECK (
    publication_id = trim(publication_id) AND length(publication_id) BETWEEN 1 AND 160
    AND publication_id GLOB '[A-Za-z0-9]*' AND publication_id NOT GLOB '*[^A-Za-z0-9._:-]*'
    AND publication_id NOT IN ('.', '..')
  ),
  hierarchy_id TEXT NOT NULL UNIQUE
    REFERENCES historical_edition_hierarchies(hierarchy_id) ON DELETE RESTRICT,
  public_slug TEXT NOT NULL UNIQUE CHECK (
    public_slug = trim(public_slug) AND length(public_slug) BETWEEN 1 AND 160
    AND public_slug GLOB '[A-Za-z0-9]*' AND public_slug NOT GLOB '*[^A-Za-z0-9._-]*'
    AND public_slug NOT IN ('.', '..')
  ),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  delivery_kind TEXT NOT NULL CHECK (delivery_kind = 'hierarchy_nodes_v1'),
  coverage_json TEXT NOT NULL CHECK (json_valid(coverage_json) AND json_type(coverage_json) = 'object'),
  cursor_contract TEXT NOT NULL CHECK (cursor_contract = 'historical-hierarchy-browse-cursor-v1'),
  cursor_identity TEXT NOT NULL CHECK (length(cursor_identity) = 64 AND cursor_identity NOT GLOB '*[^0-9a-f]*'),
  browse_page_size INTEGER NOT NULL CHECK (browse_page_size BETWEEN 1 AND 32),
  landing_max_bytes INTEGER NOT NULL CHECK (landing_max_bytes BETWEEN 1024 AND 65536),
  directory_max_bytes INTEGER NOT NULL CHECK (directory_max_bytes BETWEEN 1024 AND 65536),
  node_max_bytes INTEGER NOT NULL CHECK (node_max_bytes BETWEEN 1024 AND 131072),
  search_max_bytes INTEGER NOT NULL CHECK (search_max_bytes BETWEEN 1024 AND 65536),
  canonical_uri TEXT NOT NULL UNIQUE CHECK (
    canonical_uri = 'theologai://documents/' || public_slug
    AND length(canonical_uri) <= 384
  ),
  activation_state TEXT NOT NULL CHECK (activation_state IN ('dormant', 'active'))
);

INSERT INTO historical_hierarchy_publications (
  publication_id, hierarchy_id, public_slug, title, metadata_json, delivery_kind,
  coverage_json, cursor_contract, cursor_identity, browse_page_size,
  landing_max_bytes, directory_max_bytes, node_max_bytes, search_max_bytes,
  canonical_uri, activation_state
)
SELECT
  publication_id, hierarchy_id, public_slug, title, metadata_json, delivery_kind,
  coverage_json, cursor_contract, cursor_identity, browse_page_size,
  landing_max_bytes, directory_max_bytes, node_max_bytes, search_max_bytes,
  canonical_uri, activation_state
FROM historical_hierarchy_publications_transform10;

DROP TABLE historical_hierarchy_publications_transform10;

CREATE TRIGGER historical_hierarchy_publication_requires_matching_authority_insert
BEFORE INSERT ON historical_hierarchy_publications
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM historical_edition_hierarchies hierarchy
  WHERE hierarchy.hierarchy_id = NEW.hierarchy_id
    AND (
      (NEW.activation_state = 'dormant' AND hierarchy.availability = 'local_only_inactive')
      OR (NEW.activation_state = 'active' AND hierarchy.availability = 'local_only_active')
    )
)
BEGIN
  SELECT RAISE(ABORT, 'historical hierarchy publication must match authority availability');
END;

CREATE TRIGGER historical_hierarchy_publications_immutable_update
BEFORE UPDATE ON historical_hierarchy_publications
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'historical hierarchy publications are immutable');
END;

CREATE TRIGGER historical_hierarchy_publications_immutable_delete
BEFORE DELETE ON historical_hierarchy_publications
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'historical hierarchy publications cannot be deleted');
END;
