-- Transform 10: generic inactive edition hierarchy authority storage.
--
-- A hierarchy is anchored to one existing source-pack/work/edition lineage.
-- It intentionally creates neither a document projection nor an MCP/runtime
-- registration.  Its level specification, rather than SQL enums, declares
-- the legal node/body kinds and parent transitions for each hierarchy.

CREATE TABLE historical_edition_hierarchies (
  hierarchy_id TEXT PRIMARY KEY CHECK (
    hierarchy_id = trim(hierarchy_id) AND length(hierarchy_id) BETWEEN 1 AND 160
    AND hierarchy_id GLOB '[A-Za-z0-9]*' AND hierarchy_id NOT GLOB '*[^A-Za-z0-9._:-]*'
    AND hierarchy_id NOT IN ('.', '..')
  ),
  pack_id TEXT NOT NULL REFERENCES historical_source_packs(pack_id) ON DELETE RESTRICT,
  work_id TEXT NOT NULL REFERENCES historical_works(work_id) ON DELETE RESTRICT,
  edition_id TEXT NOT NULL UNIQUE REFERENCES historical_editions(edition_id) ON DELETE RESTRICT,
  availability TEXT NOT NULL CHECK (
    availability = trim(availability) AND length(availability) BETWEEN 1 AND 80
    AND availability GLOB '[A-Za-z0-9]*' AND availability NOT GLOB '*[^A-Za-z0-9._:-]*'
  ),
  hierarchy_schema_version TEXT NOT NULL CHECK (
    hierarchy_schema_version = trim(hierarchy_schema_version) AND length(hierarchy_schema_version) BETWEEN 1 AND 80
    AND hierarchy_schema_version GLOB '[A-Za-z0-9]*' AND hierarchy_schema_version NOT GLOB '*[^A-Za-z0-9._:-]*'
  ),
  level_spec_json TEXT NOT NULL CHECK (json_valid(level_spec_json) AND json_type(level_spec_json) = 'object'),
  source_manifest_sha256 TEXT NOT NULL CHECK (length(source_manifest_sha256) = 64 AND source_manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  aggregate_sha256 TEXT NOT NULL CHECK (length(aggregate_sha256) = 64 AND aggregate_sha256 NOT GLOB '*[^0-9a-f]*'),
  ordered_question_keys_sha256 TEXT NOT NULL CHECK (length(ordered_question_keys_sha256) = 64 AND ordered_question_keys_sha256 NOT GLOB '*[^0-9a-f]*'),
  ordered_article_keys_sha256 TEXT NOT NULL CHECK (length(ordered_article_keys_sha256) = 64 AND ordered_article_keys_sha256 NOT GLOB '*[^0-9a-f]*'),
  source_lock_sha256 TEXT NOT NULL CHECK (length(source_lock_sha256) = 64 AND source_lock_sha256 NOT GLOB '*[^0-9a-f]*'),
  local_receipt_sha256 TEXT NOT NULL CHECK (length(local_receipt_sha256) = 64 AND local_receipt_sha256 NOT GLOB '*[^0-9a-f]*'),
  topology_lock_sha256 TEXT NOT NULL CHECK (length(topology_lock_sha256) = 64 AND topology_lock_sha256 NOT GLOB '*[^0-9a-f]*'),
  discrepancy_ledger_sha256 TEXT NOT NULL CHECK (length(discrepancy_ledger_sha256) = 64 AND discrepancy_ledger_sha256 NOT GLOB '*[^0-9a-f]*'),
  authority_bodies_sha256 TEXT NOT NULL CHECK (length(authority_bodies_sha256) = 64 AND authority_bodies_sha256 NOT GLOB '*[^0-9a-f]*'),
  navigation_preorder_sha256 TEXT NOT NULL CHECK (length(navigation_preorder_sha256) = 64 AND navigation_preorder_sha256 NOT GLOB '*[^0-9a-f]*'),
  body_count INTEGER NOT NULL CHECK (body_count > 0),
  node_count INTEGER NOT NULL CHECK (node_count > 0),
  coverage_json TEXT NOT NULL CHECK (json_valid(coverage_json) AND json_type(coverage_json) = 'object'),
  provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json) AND json_type(provenance_json) = 'object')
);

CREATE TABLE historical_edition_hierarchy_bodies (
  hierarchy_id TEXT NOT NULL REFERENCES historical_edition_hierarchies(hierarchy_id) ON DELETE RESTRICT,
  body_key TEXT NOT NULL CHECK (
    body_key = trim(body_key) AND length(body_key) BETWEEN 1 AND 160
    AND body_key NOT GLOB '*[^A-Za-z0-9._:-]*'
  ),
  body_kind TEXT NOT NULL CHECK (
    body_kind = trim(body_kind) AND length(body_kind) BETWEEN 1 AND 80
    AND body_kind GLOB '[A-Za-z0-9]*' AND body_kind NOT GLOB '*[^A-Za-z0-9._:-]*'
  ),
  source_ordinal INTEGER NOT NULL CHECK (source_ordinal > 0),
  heading TEXT NOT NULL CHECK (length(trim(heading)) > 0),
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
  content_utf8_bytes INTEGER NOT NULL CHECK (content_utf8_bytes > 0),
  content TEXT NOT NULL CHECK (length(content) > 0),
  PRIMARY KEY (hierarchy_id, body_key),
  UNIQUE (hierarchy_id, source_ordinal)
);

CREATE INDEX idx_historical_edition_hierarchy_bodies_order
  ON historical_edition_hierarchy_bodies(hierarchy_id, source_ordinal, body_key);

CREATE TABLE historical_edition_hierarchy_nodes (
  hierarchy_id TEXT NOT NULL REFERENCES historical_edition_hierarchies(hierarchy_id) ON DELETE RESTRICT,
  node_key TEXT NOT NULL CHECK (
    node_key = trim(node_key) AND length(node_key) BETWEEN 1 AND 160
    AND node_key NOT GLOB '*[^A-Za-z0-9._:-]*'
  ),
  parent_node_key TEXT,
  node_kind TEXT NOT NULL CHECK (
    node_kind = trim(node_kind) AND length(node_kind) BETWEEN 1 AND 80
    AND node_kind GLOB '[A-Za-z0-9]*' AND node_kind NOT GLOB '*[^A-Za-z0-9._:-]*'
  ),
  body_key TEXT,
  depth INTEGER NOT NULL CHECK (depth > 0),
  flat_ordinal INTEGER NOT NULL CHECK (flat_ordinal > 0),
  sibling_ordinal INTEGER NOT NULL CHECK (sibling_ordinal > 0),
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  heading TEXT NOT NULL CHECK (length(trim(heading)) > 0),
  PRIMARY KEY (hierarchy_id, node_key),
  UNIQUE (hierarchy_id, flat_ordinal),
  UNIQUE (hierarchy_id, body_key),
  FOREIGN KEY (hierarchy_id, parent_node_key)
    REFERENCES historical_edition_hierarchy_nodes(hierarchy_id, node_key) ON DELETE RESTRICT,
  FOREIGN KEY (hierarchy_id, body_key)
    REFERENCES historical_edition_hierarchy_bodies(hierarchy_id, body_key) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_historical_edition_hierarchy_root_siblings
  ON historical_edition_hierarchy_nodes(hierarchy_id, sibling_ordinal) WHERE parent_node_key IS NULL;
CREATE UNIQUE INDEX idx_historical_edition_hierarchy_child_siblings
  ON historical_edition_hierarchy_nodes(hierarchy_id, parent_node_key, sibling_ordinal) WHERE parent_node_key IS NOT NULL;
CREATE INDEX idx_historical_edition_hierarchy_nodes_parent
  ON historical_edition_hierarchy_nodes(hierarchy_id, parent_node_key, sibling_ordinal, node_key);
CREATE INDEX idx_historical_edition_hierarchy_nodes_flat
  ON historical_edition_hierarchy_nodes(hierarchy_id, flat_ordinal, node_key);

-- External-content FTS deliberately carries no _content shadow/body copy.
CREATE VIRTUAL TABLE historical_edition_hierarchy_bodies_fts USING fts5(
  hierarchy_id UNINDEXED,
  body_key UNINDEXED,
  heading,
  content,
  content='historical_edition_hierarchy_bodies',
  content_rowid='rowid'
);

-- The three lineage keys must describe one existing edition relationship,
-- not merely three independently valid foreign keys.
CREATE TRIGGER historical_edition_hierarchy_anchor_insert
BEFORE INSERT ON historical_edition_hierarchies
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM historical_editions edition
  WHERE edition.edition_id = NEW.edition_id
    AND edition.work_id = NEW.work_id
    AND edition.pack_id = NEW.pack_id
)
BEGIN
  SELECT RAISE(ABORT, 'historical edition hierarchy anchor does not match its edition lineage');
END;

-- Level-spec validation is generic: profile JSON supplies node/body kinds,
-- allowed parents, maximum depth, and whether a body is required.
CREATE TRIGGER historical_edition_hierarchy_node_level_insert
BEFORE INSERT ON historical_edition_hierarchy_nodes
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM historical_edition_hierarchies hierarchy,
       json_each(hierarchy.level_spec_json, '$.levels') level
  WHERE hierarchy.hierarchy_id = NEW.hierarchy_id
    AND NEW.depth <= CAST(json_extract(hierarchy.level_spec_json, '$.maxDepth') AS INTEGER)
    AND CAST(json_extract(level.value, '$.depth') AS INTEGER) = NEW.depth
    AND json_extract(level.value, '$.nodeKind') = NEW.node_kind
    AND (
      (NEW.parent_node_key IS NULL
        AND json_array_length(json_extract(level.value, '$.parentNodeKinds')) = 0)
      OR
      (NEW.parent_node_key IS NOT NULL AND EXISTS (
        SELECT 1
        FROM historical_edition_hierarchy_nodes parent,
             json_each(level.value, '$.parentNodeKinds') allowed_parent
        WHERE parent.hierarchy_id = NEW.hierarchy_id
          AND parent.node_key = NEW.parent_node_key
          AND parent.depth = NEW.depth - 1
          AND parent.node_kind = allowed_parent.value
      ))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'historical edition hierarchy node violates its generic level specification');
END;

CREATE TRIGGER historical_edition_hierarchy_node_body_insert
BEFORE INSERT ON historical_edition_hierarchy_nodes
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM historical_edition_hierarchies hierarchy,
       json_each(hierarchy.level_spec_json, '$.levels') level
  WHERE hierarchy.hierarchy_id = NEW.hierarchy_id
    AND CAST(json_extract(level.value, '$.depth') AS INTEGER) = NEW.depth
    AND json_extract(level.value, '$.nodeKind') = NEW.node_kind
    AND (
      (NEW.body_key IS NULL AND COALESCE(CAST(json_extract(level.value, '$.bodyRequired') AS INTEGER), 0) = 0)
      OR
      (NEW.body_key IS NOT NULL AND EXISTS (
        SELECT 1
        FROM historical_edition_hierarchy_bodies body,
             json_each(level.value, '$.bodyKinds') allowed_body
        WHERE body.hierarchy_id = NEW.hierarchy_id
          AND body.body_key = NEW.body_key
          AND body.body_kind = allowed_body.value
      ))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'historical edition hierarchy node body violates its generic level specification');
END;

-- New nodes are append-only build facts. The next flat ordinal and the next
-- sibling ordinal within the same parent are the only legal insert positions.
CREATE TRIGGER historical_edition_hierarchy_node_flat_ordinal_insert
BEFORE INSERT ON historical_edition_hierarchy_nodes
FOR EACH ROW
WHEN NEW.flat_ordinal != (
  SELECT COALESCE(MAX(node.flat_ordinal), 0) + 1
  FROM historical_edition_hierarchy_nodes node
  WHERE node.hierarchy_id = NEW.hierarchy_id
)
BEGIN
  SELECT RAISE(ABORT, 'historical edition hierarchy flat ordinals must be contiguous');
END;

CREATE TRIGGER historical_edition_hierarchy_node_sibling_ordinal_insert
BEFORE INSERT ON historical_edition_hierarchy_nodes
FOR EACH ROW
WHEN NEW.sibling_ordinal != (
  SELECT COUNT(*) + 1 FROM historical_edition_hierarchy_nodes sibling
  WHERE sibling.hierarchy_id = NEW.hierarchy_id
    AND sibling.parent_node_key IS NEW.parent_node_key
)
BEGIN
  SELECT RAISE(ABORT, 'historical edition hierarchy sibling ordinals must be locally contiguous');
END;

-- At every successful insertion, recursively reconstruct preorder from the
-- parent/sibling graph and require it to equal the stored contiguous flat
-- order. This rejects later insertion into a subtree already passed in preorder.
CREATE TRIGGER historical_edition_hierarchy_node_preorder_insert
AFTER INSERT ON historical_edition_hierarchy_nodes
FOR EACH ROW
WHEN NEW.flat_ordinal = (
  SELECT hierarchy.node_count FROM historical_edition_hierarchies hierarchy
  WHERE hierarchy.hierarchy_id = NEW.hierarchy_id
)
BEGIN
  SELECT RAISE(ABORT, 'historical edition hierarchy flat ordinals are not preorder')
  WHERE EXISTS (
    WITH RECURSIVE traversal(node_key, path) AS (
      SELECT root.node_key, printf('%08d', root.sibling_ordinal)
      FROM historical_edition_hierarchy_nodes root
      WHERE root.hierarchy_id = NEW.hierarchy_id AND root.parent_node_key IS NULL
      UNION ALL
      SELECT child.node_key, traversal.path || '.' || printf('%08d', child.sibling_ordinal)
      FROM historical_edition_hierarchy_nodes child
      JOIN traversal ON traversal.node_key = child.parent_node_key
      WHERE child.hierarchy_id = NEW.hierarchy_id
    ), ordered AS (
      SELECT node_key, ROW_NUMBER() OVER (ORDER BY path) AS expected_flat_ordinal
      FROM traversal
    )
    SELECT 1
    FROM historical_edition_hierarchy_nodes node
    LEFT JOIN ordered ON ordered.node_key = node.node_key
    WHERE node.hierarchy_id = NEW.hierarchy_id
      AND (ordered.expected_flat_ordinal IS NULL OR node.flat_ordinal != ordered.expected_flat_ordinal)
  );
END;

-- Transform-10 facts are append-only build products. Future changes require a
-- new reviewed hierarchy record rather than mutation of an authority record.
CREATE TRIGGER historical_edition_hierarchies_immutable_update BEFORE UPDATE ON historical_edition_hierarchies
BEGIN SELECT RAISE(ABORT, 'historical edition hierarchies are immutable'); END;
CREATE TRIGGER historical_edition_hierarchies_immutable_delete BEFORE DELETE ON historical_edition_hierarchies
BEGIN SELECT RAISE(ABORT, 'historical edition hierarchies cannot be deleted'); END;
CREATE TRIGGER historical_edition_hierarchy_bodies_immutable_update BEFORE UPDATE ON historical_edition_hierarchy_bodies
BEGIN SELECT RAISE(ABORT, 'historical edition hierarchy bodies are immutable'); END;
CREATE TRIGGER historical_edition_hierarchy_bodies_immutable_delete BEFORE DELETE ON historical_edition_hierarchy_bodies
BEGIN SELECT RAISE(ABORT, 'historical edition hierarchy bodies cannot be deleted'); END;
CREATE TRIGGER historical_edition_hierarchy_nodes_immutable_update BEFORE UPDATE ON historical_edition_hierarchy_nodes
BEGIN SELECT RAISE(ABORT, 'historical edition hierarchy nodes are immutable'); END;
CREATE TRIGGER historical_edition_hierarchy_nodes_immutable_delete BEFORE DELETE ON historical_edition_hierarchy_nodes
BEGIN SELECT RAISE(ABORT, 'historical edition hierarchy nodes cannot be deleted'); END;
