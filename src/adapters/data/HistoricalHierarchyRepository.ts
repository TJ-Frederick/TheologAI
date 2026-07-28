/** Local SQLite access for dormant generic edition-hierarchy authority records. */

import type Database from 'better-sqlite3';
import { getDatabase } from '../shared/Database.js';
import type {
  HistoricalHierarchyArtifact,
  HistoricalHierarchyBody,
  HistoricalHierarchyBodySummary,
  HistoricalHierarchyCursor,
  HistoricalHierarchyNeighbors,
  HistoricalHierarchyNode,
  HistoricalHierarchyNodeContext,
  HistoricalHierarchyPage,
  HistoricalHierarchyProfile,
  HistoricalHierarchyPublication,
  HistoricalHierarchySearchOptions,
  HistoricalHierarchySearchResult,
  IHistoricalHierarchyRepository,
} from '../../kernel/repositories.js';

const PROFILE_COLUMNS = `hierarchy_id AS hierarchyId, pack_id AS packId, work_id AS workId, edition_id AS editionId,
  availability, hierarchy_schema_version AS hierarchySchemaVersion, level_spec_json AS levelSpecJson,
  source_manifest_sha256 AS sourceManifestSha256, aggregate_sha256 AS aggregateSha256,
  ordered_question_keys_sha256 AS orderedQuestionKeysSha256, ordered_article_keys_sha256 AS orderedArticleKeysSha256,
  source_lock_sha256 AS sourceLockSha256, local_receipt_sha256 AS localReceiptSha256,
  topology_lock_sha256 AS topologyLockSha256, discrepancy_ledger_sha256 AS discrepancyLedgerSha256,
  authority_bodies_sha256 AS authorityBodiesSha256, navigation_preorder_sha256 AS navigationPreorderSha256,
  body_count AS bodyCount, node_count AS nodeCount, coverage_json AS coverageJson, provenance_json AS provenanceJson`;
const NODE_COLUMNS = `hierarchy_id AS hierarchyId, node_key AS nodeKey, parent_node_key AS parentNodeKey,
  node_kind AS nodeKind, body_key AS bodyKey, depth, flat_ordinal AS flatOrdinal,
  sibling_ordinal AS siblingOrdinal, label, heading`;
const BODY_COLUMNS = `hierarchy_id AS hierarchyId, body_key AS bodyKey, body_kind AS bodyKind, source_ordinal AS sourceOrdinal,
  heading, content_sha256 AS contentSha256, content_utf8_bytes AS contentUtf8Bytes, content`;
const PUBLICATION_COLUMNS = `publication_id AS publicationId, hierarchy_id AS hierarchyId, public_slug AS publicSlug,
  title, metadata_json AS metadataJson, delivery_kind AS deliveryKind, coverage_json AS coverageJson,
  cursor_contract AS cursorContract, cursor_identity AS cursorIdentity, browse_page_size AS browsePageSize,
  landing_max_bytes AS landingMaxBytes, directory_max_bytes AS directoryMaxBytes,
  node_max_bytes AS nodeMaxBytes, search_max_bytes AS searchMaxBytes,
  canonical_uri AS canonicalUri, activation_state AS activationState`;

function parseObject(value: string, label: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must be an object`);
  return parsed as Record<string, unknown>;
}

function profile(row: Record<string, unknown>): HistoricalHierarchyProfile {
  return {
    hierarchyId: String(row.hierarchyId), packId: String(row.packId), workId: String(row.workId), editionId: String(row.editionId),
    availability: String(row.availability), hierarchySchemaVersion: String(row.hierarchySchemaVersion),
    levelSpec: parseObject(String(row.levelSpecJson), 'hierarchy level specification'),
    sourceManifestSha256: String(row.sourceManifestSha256), aggregateSha256: String(row.aggregateSha256),
    orderedQuestionKeysSha256: String(row.orderedQuestionKeysSha256), orderedArticleKeysSha256: String(row.orderedArticleKeysSha256),
    sourceLockSha256: String(row.sourceLockSha256), localReceiptSha256: String(row.localReceiptSha256),
    topologyLockSha256: String(row.topologyLockSha256), discrepancyLedgerSha256: String(row.discrepancyLedgerSha256),
    authorityBodiesSha256: String(row.authorityBodiesSha256), navigationPreorderSha256: String(row.navigationPreorderSha256),
    bodyCount: Number(row.bodyCount), nodeCount: Number(row.nodeCount),
    coverage: parseObject(String(row.coverageJson), 'hierarchy coverage'),
    provenance: parseObject(String(row.provenanceJson), 'hierarchy provenance') as unknown as HistoricalHierarchyProfile['provenance'],
  };
}

function publication(row: Record<string, unknown>): HistoricalHierarchyPublication {
  const deliveryKind = String(row.deliveryKind);
  const cursorContract = String(row.cursorContract);
  const activationState = String(row.activationState);
  if (deliveryKind !== 'hierarchy_nodes_v1'
    || cursorContract !== 'historical-hierarchy-browse-cursor-v1'
    || activationState !== 'dormant') throw new Error('Historical hierarchy publication contract is invalid');
  return {
    publicationId: String(row.publicationId), hierarchyId: String(row.hierarchyId), publicSlug: String(row.publicSlug),
    title: String(row.title), metadata: parseObject(String(row.metadataJson), 'hierarchy publication metadata') as unknown as HistoricalHierarchyPublication['metadata'],
    deliveryKind, coverage: parseObject(String(row.coverageJson), 'hierarchy publication coverage') as unknown as HistoricalHierarchyPublication['coverage'],
    cursorContract, cursorIdentity: String(row.cursorIdentity), browsePageSize: Number(row.browsePageSize),
    landingMaxBytes: Number(row.landingMaxBytes), directoryMaxBytes: Number(row.directoryMaxBytes),
    nodeMaxBytes: Number(row.nodeMaxBytes), searchMaxBytes: Number(row.searchMaxBytes),
    canonicalUri: String(row.canonicalUri), activationState,
  };
}

function node(row: Record<string, unknown>, prefix = ''): HistoricalHierarchyNode {
  const field = (name: string) => row[`${prefix}${name}`];
  return {
    hierarchyId: String(field('hierarchyId')), nodeKey: String(field('nodeKey')), parentNodeKey: field('parentNodeKey') as string | null,
    nodeKind: String(field('nodeKind')), bodyKey: field('bodyKey') as string | null, depth: Number(field('depth')),
    flatOrdinal: Number(field('flatOrdinal')), siblingOrdinal: Number(field('siblingOrdinal')),
    label: String(field('label')), heading: String(field('heading')),
  };
}

function body(row: Record<string, unknown>, prefix = ''): HistoricalHierarchyBody | undefined {
  const field = (name: string) => row[`${prefix}${name}`];
  if (field('bodyKey') === null || field('bodyKey') === undefined) return undefined;
  return {
    hierarchyId: String(field('hierarchyId')), bodyKey: String(field('bodyKey')), bodyKind: String(field('bodyKind')),
    sourceOrdinal: Number(field('sourceOrdinal')), heading: String(field('heading')), contentSha256: String(field('contentSha256')),
    contentUtf8Bytes: Number(field('contentUtf8Bytes')), content: String(field('content')),
  };
}

function bodySummary(row: Record<string, unknown>, prefix = ''): HistoricalHierarchyBodySummary {
  const field = (name: string) => row[`${prefix}${name}`];
  return {
    hierarchyId: String(field('hierarchyId')), bodyKey: String(field('bodyKey')), bodyKind: String(field('bodyKind')),
    sourceOrdinal: Number(field('sourceOrdinal')), heading: String(field('heading')), contentSha256: String(field('contentSha256')),
    contentUtf8Bytes: Number(field('contentUtf8Bytes')),
  };
}
function assertNodeHierarchy(nodeValue: HistoricalHierarchyNode, hierarchyId: string): HistoricalHierarchyNode {
  if (nodeValue.hierarchyId !== hierarchyId) throw new Error('Historical hierarchy repository received a cross-hierarchy node');
  return nodeValue;
}
function assertBodyHierarchy<T extends HistoricalHierarchyBody | HistoricalHierarchyBodySummary>(bodyValue: T, hierarchyId: string): T {
  if (bodyValue.hierarchyId !== hierarchyId) throw new Error('Historical hierarchy repository received a cross-hierarchy body');
  return bodyValue;
}

function navigationLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 32) throw new Error('Historical hierarchy navigation limit must be 1..32');
  return limit;
}
function searchLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 9) throw new Error('Historical hierarchy search limit must be 1..9');
  return limit;
}
function ftsQuery(text: string, match: 'all_terms' | 'phrase'): string {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 500) throw new Error('Historical hierarchy search text is invalid');
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length > 16) throw new Error('Historical hierarchy search text has too many terms');
  const literal = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return match === 'phrase' ? literal(trimmed) : tokens.map(literal).join(' AND ');
}
function cursor(after: HistoricalHierarchyCursor | undefined): HistoricalHierarchyCursor | undefined {
  if (after === undefined) return undefined;
  if (!Number.isSafeInteger(after.siblingOrdinal) || after.siblingOrdinal < 1 || typeof after.nodeKey !== 'string' || after.nodeKey.length === 0) {
    throw new Error('Historical hierarchy cursor is invalid');
  }
  return after;
}
function maxDepth(profile: HistoricalHierarchyProfile): number {
  const value = profile.levelSpec.maxDepth;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 32) throw new Error('Historical hierarchy profile maxDepth is invalid');
  return value;
}

/** Not wired into the server composition root; activation remains separately reviewed. */
export class HistoricalHierarchyRepository implements IHistoricalHierarchyRepository {
  constructor(private readonly db: Database.Database = getDatabase()) {}

  getHierarchyProfile(hierarchyId: string): HistoricalHierarchyProfile | undefined {
    const row = this.db.prepare(`SELECT ${PROFILE_COLUMNS} FROM historical_edition_hierarchies WHERE hierarchy_id = ?`)
      .get(hierarchyId) as Record<string, unknown> | undefined;
    return row === undefined ? undefined : profile(row);
  }

  getHierarchyPublication(publicationId: string): HistoricalHierarchyPublication | undefined {
    const row = this.db.prepare(`SELECT ${PUBLICATION_COLUMNS} FROM historical_hierarchy_publications WHERE publication_id = ?`)
      .get(publicationId) as Record<string, unknown> | undefined;
    return row === undefined ? undefined : publication(row);
  }

  getHierarchyPublicationBySlug(publicSlug: string): HistoricalHierarchyPublication | undefined {
    const row = this.db.prepare(`SELECT ${PUBLICATION_COLUMNS} FROM historical_hierarchy_publications WHERE public_slug = ?`)
      .get(publicSlug) as Record<string, unknown> | undefined;
    return row === undefined ? undefined : publication(row);
  }

  listHierarchyArtifacts(hierarchyId: string): HistoricalHierarchyArtifact[] {
    return this.db.prepare(`SELECT artifact_id AS artifactId, edition_id AS editionId, role, locator, sha256, bytes, acquired_at AS acquiredAt
      FROM historical_source_artifacts WHERE edition_id = (SELECT edition_id FROM historical_edition_hierarchies WHERE hierarchy_id = ?)
      ORDER BY artifact_id`).all(hierarchyId) as HistoricalHierarchyArtifact[];
  }

  private getNode(hierarchyId: string, nodeKey: string): HistoricalHierarchyNode | undefined {
    const row = this.db.prepare(`SELECT ${NODE_COLUMNS} FROM historical_edition_hierarchy_nodes WHERE hierarchy_id = ? AND node_key = ?`)
      .get(hierarchyId, nodeKey) as Record<string, unknown> | undefined;
    return row === undefined ? undefined : assertNodeHierarchy(node(row), hierarchyId);
  }

  private ancestors(hierarchyId: string, nodeValue: HistoricalHierarchyNode, profileValue: HistoricalHierarchyProfile): HistoricalHierarchyNode[] {
    const result: HistoricalHierarchyNode[] = [];
    let parentKey = nodeValue.parentNodeKey;
    for (let remaining = maxDepth(profileValue) - 1; parentKey !== null && remaining > 0; remaining--) {
      const parent = this.getNode(hierarchyId, parentKey);
      if (!parent) throw new Error('Historical hierarchy ancestor chain is broken');
      result.push(parent); parentKey = parent.parentNodeKey;
    }
    if (parentKey !== null) throw new Error('Historical hierarchy ancestor depth exceeds profile maxDepth');
    return result.reverse();
  }

  getHierarchyNodeContext(hierarchyId: string, nodeKey: string): HistoricalHierarchyNodeContext | undefined {
    const row = this.db.prepare(`SELECT
      n.hierarchy_id AS node_hierarchyId, n.node_key AS node_nodeKey, n.parent_node_key AS node_parentNodeKey,
      n.node_kind AS node_nodeKind, n.body_key AS node_bodyKey, n.depth AS node_depth, n.flat_ordinal AS node_flatOrdinal,
      n.sibling_ordinal AS node_siblingOrdinal, n.label AS node_label, n.heading AS node_heading,
      b.hierarchy_id AS body_hierarchyId, b.body_key AS body_bodyKey, b.body_kind AS body_bodyKind,
      b.source_ordinal AS body_sourceOrdinal, b.heading AS body_heading, b.content_sha256 AS body_contentSha256,
      b.content_utf8_bytes AS body_contentUtf8Bytes, b.content AS body_content
      FROM historical_edition_hierarchy_nodes n
      LEFT JOIN historical_edition_hierarchy_bodies b ON b.hierarchy_id = n.hierarchy_id AND b.body_key = n.body_key
      WHERE n.hierarchy_id = ? AND n.node_key = ?`).get(hierarchyId, nodeKey) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const profileValue = this.getHierarchyProfile(hierarchyId);
    if (!profileValue) throw new Error('Historical hierarchy profile is missing');
    const current = assertNodeHierarchy(node(row, 'node_'), hierarchyId);
    const directBody = body(row, 'body_');
    if (directBody) assertBodyHierarchy(directBody, hierarchyId);
    if (directBody && directBody.bodyKey !== current.bodyKey) throw new Error('Historical hierarchy repository received a mismatched direct body');
    return { node: current, body: directBody, ancestors: this.ancestors(hierarchyId, current, profileValue) };
  }

  listHierarchyChildren(hierarchyId: string, parentNodeKey: string | null, after: HistoricalHierarchyCursor | undefined, limit: number): HistoricalHierarchyPage {
    const bounded = navigationLimit(limit);
    const boundary = cursor(after);
    if (boundary) {
      const stored = this.db.prepare(`SELECT sibling_ordinal AS siblingOrdinal FROM historical_edition_hierarchy_nodes
        WHERE hierarchy_id = ? AND parent_node_key IS ? AND node_key = ?`).get(hierarchyId, parentNodeKey, boundary.nodeKey) as { siblingOrdinal?: number } | undefined;
      if (!stored) throw new Error('Historical hierarchy cursor was not found under this parent');
      if (stored.siblingOrdinal !== boundary.siblingOrdinal) throw new Error('Historical hierarchy cursor does not match its stored boundary');
    }
    const rows = boundary === undefined
      ? this.db.prepare(`SELECT ${NODE_COLUMNS} FROM historical_edition_hierarchy_nodes
          WHERE hierarchy_id = ? AND parent_node_key IS ? ORDER BY sibling_ordinal, node_key LIMIT ?`).all(hierarchyId, parentNodeKey, bounded + 1)
      : this.db.prepare(`SELECT ${NODE_COLUMNS} FROM historical_edition_hierarchy_nodes
          WHERE hierarchy_id = ? AND parent_node_key IS ? AND (sibling_ordinal > ? OR (sibling_ordinal = ? AND node_key > ?))
          ORDER BY sibling_ordinal, node_key LIMIT ?`).all(hierarchyId, parentNodeKey, boundary.siblingOrdinal, boundary.siblingOrdinal, boundary.nodeKey, bounded + 1);
    const values = (rows as Record<string, unknown>[]).map(row => assertNodeHierarchy(node(row), hierarchyId));
    const hasMore = values.length > bounded;
    const nodes = hasMore ? values.slice(0, bounded) : values;
    const last = nodes.at(-1);
    return { nodes, hasMore, nextAfter: hasMore && last ? { siblingOrdinal: last.siblingOrdinal, nodeKey: last.nodeKey } : undefined };
  }

  getHierarchyNeighbors(hierarchyId: string, nodeKey: string): HistoricalHierarchyNeighbors | undefined {
    const current = this.getNode(hierarchyId, nodeKey);
    if (!current) return undefined;
    const previous = this.db.prepare(`SELECT ${NODE_COLUMNS} FROM historical_edition_hierarchy_nodes
      WHERE hierarchy_id = ? AND parent_node_key IS ? AND sibling_ordinal < ? ORDER BY sibling_ordinal DESC, node_key DESC LIMIT 1`)
      .get(hierarchyId, current.parentNodeKey, current.siblingOrdinal) as Record<string, unknown> | undefined;
    const next = this.db.prepare(`SELECT ${NODE_COLUMNS} FROM historical_edition_hierarchy_nodes
      WHERE hierarchy_id = ? AND parent_node_key IS ? AND sibling_ordinal > ? ORDER BY sibling_ordinal, node_key LIMIT 1`)
      .get(hierarchyId, current.parentNodeKey, current.siblingOrdinal) as Record<string, unknown> | undefined;
    const previousNode = previous ? assertNodeHierarchy(node(previous), hierarchyId) : undefined;
    const nextNode = next ? assertNodeHierarchy(node(next), hierarchyId) : undefined;
    return { previous: previousNode, next: nextNode };
  }

  searchHierarchyBodies(options: HistoricalHierarchySearchOptions): HistoricalHierarchySearchResult[] {
    const profileValue = this.getHierarchyProfile(options.hierarchyId);
    if (!profileValue) return [];
    const rows = this.db.prepare(`SELECT
      n.hierarchy_id AS node_hierarchyId, n.node_key AS node_nodeKey, n.parent_node_key AS node_parentNodeKey,
      n.node_kind AS node_nodeKind, n.body_key AS node_bodyKey, n.depth AS node_depth, n.flat_ordinal AS node_flatOrdinal,
      n.sibling_ordinal AS node_siblingOrdinal, n.label AS node_label, n.heading AS node_heading,
      b.hierarchy_id AS body_hierarchyId, b.body_key AS body_bodyKey, b.body_kind AS body_bodyKind,
      b.source_ordinal AS body_sourceOrdinal, b.heading AS body_heading, b.content_sha256 AS body_contentSha256,
      b.content_utf8_bytes AS body_contentUtf8Bytes,
      bm25(historical_edition_hierarchy_bodies_fts, 0.0, 0.0, 8.0, 1.0) AS rank,
      substr(snippet(historical_edition_hierarchy_bodies_fts, 3, '<mark>', '</mark>', '…', 18), 1, 900) AS snippet
      FROM historical_edition_hierarchy_bodies_fts
      JOIN historical_edition_hierarchy_bodies b ON b.rowid = historical_edition_hierarchy_bodies_fts.rowid
      JOIN historical_edition_hierarchy_nodes n ON n.hierarchy_id = b.hierarchy_id AND n.body_key = b.body_key
      WHERE historical_edition_hierarchy_bodies_fts MATCH ? AND b.hierarchy_id = ?
      ORDER BY rank, b.source_ordinal LIMIT ?`).all(ftsQuery(options.text, options.match), options.hierarchyId, searchLimit(options.limit)) as Record<string, unknown>[];
    return rows.map(row => {
      const resultNode = assertNodeHierarchy(node(row, 'node_'), options.hierarchyId);
      return {
        node: resultNode,
        body: assertBodyHierarchy(bodySummary(row, 'body_'), options.hierarchyId),
        rank: Number(row.rank),
        snippet: String(row.snippet),
        breadcrumb: [...this.ancestors(options.hierarchyId, resultNode, profileValue), resultNode],
      };
    });
  }
}
