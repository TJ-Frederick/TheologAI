/** D1 equivalent of the dormant generic edition-hierarchy repository. */

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

function parseObject(value: string, label: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must be an object`);
  return parsed as Record<string, unknown>;
}
function profile(row: Record<string, unknown>): HistoricalHierarchyProfile {
  return {
    hierarchyId: String(row.hierarchyId), packId: String(row.packId), workId: String(row.workId), editionId: String(row.editionId),
    availability: String(row.availability), hierarchySchemaVersion: String(row.hierarchySchemaVersion), levelSpec: parseObject(String(row.levelSpecJson), 'hierarchy level specification'),
    sourceManifestSha256: String(row.sourceManifestSha256), aggregateSha256: String(row.aggregateSha256),
    orderedQuestionKeysSha256: String(row.orderedQuestionKeysSha256), orderedArticleKeysSha256: String(row.orderedArticleKeysSha256),
    sourceLockSha256: String(row.sourceLockSha256), localReceiptSha256: String(row.localReceiptSha256), topologyLockSha256: String(row.topologyLockSha256),
    discrepancyLedgerSha256: String(row.discrepancyLedgerSha256), authorityBodiesSha256: String(row.authorityBodiesSha256), navigationPreorderSha256: String(row.navigationPreorderSha256),
    bodyCount: Number(row.bodyCount), nodeCount: Number(row.nodeCount), coverage: parseObject(String(row.coverageJson), 'hierarchy coverage'), provenance: parseObject(String(row.provenanceJson), 'hierarchy provenance'),
  };
}
function node(row: Record<string, unknown>, prefix = ''): HistoricalHierarchyNode {
  const field = (name: string) => row[`${prefix}${name}`];
  return { hierarchyId: String(field('hierarchyId')), nodeKey: String(field('nodeKey')), parentNodeKey: field('parentNodeKey') as string | null,
    nodeKind: String(field('nodeKind')), bodyKey: field('bodyKey') as string | null, depth: Number(field('depth')), flatOrdinal: Number(field('flatOrdinal')),
    siblingOrdinal: Number(field('siblingOrdinal')), label: String(field('label')), heading: String(field('heading')) };
}
function body(row: Record<string, unknown>, prefix = ''): HistoricalHierarchyBody | undefined {
  const field = (name: string) => row[`${prefix}${name}`];
  if (field('bodyKey') === null || field('bodyKey') === undefined) return undefined;
  return { hierarchyId: String(field('hierarchyId')), bodyKey: String(field('bodyKey')), bodyKind: String(field('bodyKind')), sourceOrdinal: Number(field('sourceOrdinal')),
    heading: String(field('heading')), contentSha256: String(field('contentSha256')), contentUtf8Bytes: Number(field('contentUtf8Bytes')), content: String(field('content')) };
}
function bodySummary(row: Record<string, unknown>, prefix = ''): HistoricalHierarchyBodySummary {
  const field = (name: string) => row[`${prefix}${name}`];
  return { hierarchyId: String(field('hierarchyId')), bodyKey: String(field('bodyKey')), bodyKind: String(field('bodyKind')), sourceOrdinal: Number(field('sourceOrdinal')),
    heading: String(field('heading')), contentSha256: String(field('contentSha256')), contentUtf8Bytes: Number(field('contentUtf8Bytes')) };
}
function navigationLimit(limit: number): number { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 32) throw new Error('Historical hierarchy navigation limit must be 1..32'); return limit; }
function searchLimit(limit: number): number { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 9) throw new Error('Historical hierarchy search limit must be 1..9'); return limit; }
function ftsQuery(text: string, match: 'all_terms' | 'phrase'): string {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 500) throw new Error('Historical hierarchy search text is invalid');
  const terms = trimmed.split(/\s+/).filter(Boolean);
  if (terms.length > 16) throw new Error('Historical hierarchy search text has too many terms');
  const literal = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return match === 'phrase' ? literal(trimmed) : terms.map(literal).join(' AND ');
}
function validatedCursor(after: HistoricalHierarchyCursor | undefined): HistoricalHierarchyCursor | undefined {
  if (!after) return undefined;
  if (!Number.isSafeInteger(after.siblingOrdinal) || after.siblingOrdinal < 1 || typeof after.nodeKey !== 'string' || after.nodeKey.length === 0) throw new Error('Historical hierarchy cursor is invalid');
  return after;
}
function maxDepth(value: HistoricalHierarchyProfile): number {
  const depth = value.levelSpec.maxDepth;
  if (typeof depth !== 'number' || !Number.isSafeInteger(depth) || depth < 1 || depth > 32) throw new Error('Historical hierarchy profile maxDepth is invalid');
  return depth;
}

/** Not exported from Worker composition; this is a deferred persistence seam. */
export class D1HistoricalHierarchyRepository implements IHistoricalHierarchyRepository {
  constructor(private readonly db: D1Database) {}

  async getHierarchyProfile(hierarchyId: string): Promise<HistoricalHierarchyProfile | undefined> {
    const row = await this.db.prepare(`SELECT ${PROFILE_COLUMNS} FROM historical_edition_hierarchies WHERE hierarchy_id = ?`).bind(hierarchyId).first<Record<string, unknown>>();
    return row ? profile(row) : undefined;
  }

  async listHierarchyArtifacts(hierarchyId: string): Promise<HistoricalHierarchyArtifact[]> {
    const { results } = await this.db.prepare(`SELECT artifact_id AS artifactId, edition_id AS editionId, role, locator, sha256, bytes, acquired_at AS acquiredAt
      FROM historical_source_artifacts WHERE edition_id = (SELECT edition_id FROM historical_edition_hierarchies WHERE hierarchy_id = ?) ORDER BY artifact_id`).bind(hierarchyId).all<HistoricalHierarchyArtifact>();
    return results;
  }

  private async getNode(hierarchyId: string, nodeKey: string): Promise<HistoricalHierarchyNode | undefined> {
    const row = await this.db.prepare(`SELECT ${NODE_COLUMNS} FROM historical_edition_hierarchy_nodes WHERE hierarchy_id = ? AND node_key = ?`).bind(hierarchyId, nodeKey).first<Record<string, unknown>>();
    return row ? node(row) : undefined;
  }

  private async ancestors(hierarchyId: string, current: HistoricalHierarchyNode, profileValue: HistoricalHierarchyProfile): Promise<HistoricalHierarchyNode[]> {
    const result: HistoricalHierarchyNode[] = [];
    let parentKey = current.parentNodeKey;
    for (let remaining = maxDepth(profileValue) - 1; parentKey !== null && remaining > 0; remaining--) {
      const parent = await this.getNode(hierarchyId, parentKey);
      if (!parent) throw new Error('Historical hierarchy ancestor chain is broken');
      result.push(parent); parentKey = parent.parentNodeKey;
    }
    if (parentKey !== null) throw new Error('Historical hierarchy ancestor depth exceeds profile maxDepth');
    return result.reverse();
  }

  async getHierarchyNodeContext(hierarchyId: string, nodeKey: string): Promise<HistoricalHierarchyNodeContext | undefined> {
    const row = await this.db.prepare(`SELECT
      n.hierarchy_id AS node_hierarchyId, n.node_key AS node_nodeKey, n.parent_node_key AS node_parentNodeKey,
      n.node_kind AS node_nodeKind, n.body_key AS node_bodyKey, n.depth AS node_depth, n.flat_ordinal AS node_flatOrdinal,
      n.sibling_ordinal AS node_siblingOrdinal, n.label AS node_label, n.heading AS node_heading,
      b.hierarchy_id AS body_hierarchyId, b.body_key AS body_bodyKey, b.body_kind AS body_bodyKind, b.source_ordinal AS body_sourceOrdinal,
      b.heading AS body_heading, b.content_sha256 AS body_contentSha256, b.content_utf8_bytes AS body_contentUtf8Bytes, b.content AS body_content
      FROM historical_edition_hierarchy_nodes n LEFT JOIN historical_edition_hierarchy_bodies b
        ON b.hierarchy_id = n.hierarchy_id AND b.body_key = n.body_key
      WHERE n.hierarchy_id = ? AND n.node_key = ?`).bind(hierarchyId, nodeKey).first<Record<string, unknown>>();
    if (!row) return undefined;
    const profileValue = await this.getHierarchyProfile(hierarchyId);
    if (!profileValue) throw new Error('Historical hierarchy profile is missing');
    const current = node(row, 'node_');
    return { node: current, body: body(row, 'body_'), ancestors: await this.ancestors(hierarchyId, current, profileValue) };
  }

  async listHierarchyChildren(hierarchyId: string, parentNodeKey: string | null, after: HistoricalHierarchyCursor | undefined, limit: number): Promise<HistoricalHierarchyPage> {
    const bounded = navigationLimit(limit); const boundary = validatedCursor(after);
    if (boundary) {
      const stored = await this.db.prepare(`SELECT sibling_ordinal AS siblingOrdinal FROM historical_edition_hierarchy_nodes WHERE hierarchy_id = ? AND parent_node_key IS ? AND node_key = ?`).bind(hierarchyId, parentNodeKey, boundary.nodeKey).first<{ siblingOrdinal?: number }>();
      if (!stored) throw new Error('Historical hierarchy cursor was not found under this parent');
      if (stored.siblingOrdinal !== boundary.siblingOrdinal) throw new Error('Historical hierarchy cursor does not match its stored boundary');
    }
    const query = boundary === undefined
      ? this.db.prepare(`SELECT ${NODE_COLUMNS} FROM historical_edition_hierarchy_nodes WHERE hierarchy_id = ? AND parent_node_key IS ? ORDER BY sibling_ordinal, node_key LIMIT ?`).bind(hierarchyId, parentNodeKey, bounded + 1)
      : this.db.prepare(`SELECT ${NODE_COLUMNS} FROM historical_edition_hierarchy_nodes WHERE hierarchy_id = ? AND parent_node_key IS ? AND (sibling_ordinal > ? OR (sibling_ordinal = ? AND node_key > ?)) ORDER BY sibling_ordinal, node_key LIMIT ?`).bind(hierarchyId, parentNodeKey, boundary.siblingOrdinal, boundary.siblingOrdinal, boundary.nodeKey, bounded + 1);
    const { results } = await query.all<Record<string, unknown>>();
    const values = results.map(row => node(row)); const hasMore = values.length > bounded; const nodes = hasMore ? values.slice(0, bounded) : values; const last = nodes.at(-1);
    return { nodes, hasMore, nextAfter: hasMore && last ? { siblingOrdinal: last.siblingOrdinal, nodeKey: last.nodeKey } : undefined };
  }

  async getHierarchyNeighbors(hierarchyId: string, nodeKey: string): Promise<HistoricalHierarchyNeighbors | undefined> {
    const current = await this.getNode(hierarchyId, nodeKey); if (!current) return undefined;
    const previous = await this.db.prepare(`SELECT ${NODE_COLUMNS} FROM historical_edition_hierarchy_nodes WHERE hierarchy_id = ? AND parent_node_key IS ? AND sibling_ordinal < ? ORDER BY sibling_ordinal DESC, node_key DESC LIMIT 1`).bind(hierarchyId, current.parentNodeKey, current.siblingOrdinal).first<Record<string, unknown>>();
    const next = await this.db.prepare(`SELECT ${NODE_COLUMNS} FROM historical_edition_hierarchy_nodes WHERE hierarchy_id = ? AND parent_node_key IS ? AND sibling_ordinal > ? ORDER BY sibling_ordinal, node_key LIMIT 1`).bind(hierarchyId, current.parentNodeKey, current.siblingOrdinal).first<Record<string, unknown>>();
    return { previous: previous ? node(previous) : undefined, next: next ? node(next) : undefined };
  }

  async searchHierarchyBodies(options: HistoricalHierarchySearchOptions): Promise<HistoricalHierarchySearchResult[]> {
    const profileValue = await this.getHierarchyProfile(options.hierarchyId); if (!profileValue) return [];
    const { results } = await this.db.prepare(`SELECT
      n.hierarchy_id AS node_hierarchyId, n.node_key AS node_nodeKey, n.parent_node_key AS node_parentNodeKey, n.node_kind AS node_nodeKind,
      n.body_key AS node_bodyKey, n.depth AS node_depth, n.flat_ordinal AS node_flatOrdinal, n.sibling_ordinal AS node_siblingOrdinal, n.label AS node_label, n.heading AS node_heading,
      b.hierarchy_id AS body_hierarchyId, b.body_key AS body_bodyKey, b.body_kind AS body_bodyKind, b.source_ordinal AS body_sourceOrdinal,
      b.heading AS body_heading, b.content_sha256 AS body_contentSha256, b.content_utf8_bytes AS body_contentUtf8Bytes,
      bm25(historical_edition_hierarchy_bodies_fts, 0.0, 0.0, 8.0, 1.0) AS rank,
      substr(snippet(historical_edition_hierarchy_bodies_fts, 3, '<mark>', '</mark>', '…', 18), 1, 900) AS snippet
      FROM historical_edition_hierarchy_bodies_fts JOIN historical_edition_hierarchy_bodies b ON b.rowid = historical_edition_hierarchy_bodies_fts.rowid
      JOIN historical_edition_hierarchy_nodes n ON n.hierarchy_id = b.hierarchy_id AND n.body_key = b.body_key
      WHERE historical_edition_hierarchy_bodies_fts MATCH ? AND b.hierarchy_id = ? ORDER BY rank, b.source_ordinal LIMIT ?`)
      .bind(ftsQuery(options.text, options.match), options.hierarchyId, searchLimit(options.limit)).all<Record<string, unknown>>();
    return Promise.all(results.map(async row => {
      const resultNode = node(row, 'node_');
      return { node: resultNode, body: bodySummary(row, 'body_'), rank: Number(row.rank), snippet: String(row.snippet), breadcrumb: [...await this.ancestors(options.hierarchyId, resultNode, profileValue), resultNode] };
    }));
  }
}
