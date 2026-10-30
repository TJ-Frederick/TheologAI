/**
 * Dormant structured-output contracts for hierarchy-node delivery.
 * No MCP handler imports these presenters in Transform-10 PR A.
 */

import { OutputLimitError } from '../kernel/errors.js';
import { buildHistoricalHierarchyResourceUri } from '../kernel/historicalHierarchyResource.js';
import type { HistoricalHierarchyNode } from '../kernel/repositories.js';
import type {
  HistoricalHierarchyChildDelivery,
  HistoricalHierarchyLanding,
  HistoricalHierarchyNodeDelivery,
  HistoricalHierarchySearchDelivery,
} from '../services/historical/HistoricalHierarchyService.js';

const encoder = new TextEncoder();
// Search may return up to nine metadata-rich hits. Keep excerpts compact so the
// reviewed search window remains useful without ever becoming a body-delivery path.
const DISCOVERY_SNIPPET_MAX_CODE_UNITS = 320;

export const HISTORICAL_HIERARCHY_OUTPUT_SCHEMA_VERSION = '1' as const;
export const HISTORICAL_HIERARCHY_OUTPUT_KIND = 'historical_hierarchy' as const;

export function presentHistoricalHierarchyLanding(delivery: HistoricalHierarchyLanding) {
  const { publication, profile } = delivery;
  return bounded(publication.landingMaxBytes, 'landing', {
    schemaVersion: HISTORICAL_HIERARCHY_OUTPUT_SCHEMA_VERSION,
    kind: HISTORICAL_HIERARCHY_OUTPUT_KIND,
    mode: 'landing' as const,
    publication: publicationSummary(delivery),
    authority: authoritySummary(profile),
    bodyDelivery: 'direct_node_only' as const,
    browse: { pageSize: publication.browsePageSize, cursor: 'opaque_hierarchy_bound_keyset_cursor' as const },
    responseWindow: window(publication.landingMaxBytes),
  });
}

/** Exact one-node body only; descendants are intentionally absent. */
export function presentHistoricalHierarchyNode(delivery: HistoricalHierarchyNodeDelivery) {
  const { publication, context } = delivery;
  return bounded(publication.nodeMaxBytes, 'node', {
    schemaVersion: HISTORICAL_HIERARCHY_OUTPUT_SCHEMA_VERSION,
    kind: HISTORICAL_HIERARCHY_OUTPUT_KIND,
    mode: 'node' as const,
    publication: publicationSummary(delivery),
    node: {
      ...nodeSummary(publication.publicSlug, context.node),
      canonicalUri: delivery.canonicalUri,
      breadcrumb: [...context.ancestors, context.node].map(node => nodeSummary(publication.publicSlug, node)),
      body: context.body === undefined ? null : {
        bodyKey: context.body.bodyKey,
        bodyKind: context.body.bodyKind,
        sourceOrdinal: context.body.sourceOrdinal,
        heading: context.body.heading,
        contentSha256: context.body.contentSha256,
        contentUtf8Bytes: context.body.contentUtf8Bytes,
        content: context.body.content,
      },
    },
    descendants: 'not_included' as const,
    responseWindow: window(publication.nodeMaxBytes),
  });
}

/** Metadata-only immediate children with a canonical, publication-bound cursor. */
export function presentHistoricalHierarchyChildren(delivery: HistoricalHierarchyChildDelivery) {
  const { publication, page } = delivery;
  if (page.nodes.length > publication.browsePageSize) throw new OutputLimitError('Historical hierarchy directory exceeds its reviewed page size.');
  return bounded(publication.directoryMaxBytes, 'directory', {
    schemaVersion: HISTORICAL_HIERARCHY_OUTPUT_SCHEMA_VERSION,
    kind: HISTORICAL_HIERARCHY_OUTPUT_KIND,
    mode: 'children' as const,
    publication: publicationSummary(delivery),
    parentNodeKey: delivery.parentNodeKey,
    nodes: page.nodes.map(node => nodeSummary(publication.publicSlug, node)),
    resultWindow: {
      returnedCount: page.nodes.length,
      additionalChildStatus: page.hasMore ? 'additional_child_observed' as const : 'no_additional_child_observed' as const,
    },
    pagination: {
      pageSize: publication.browsePageSize,
      ...(delivery.nextCursor === undefined ? {} : { nextCursor: delivery.nextCursor }),
    },
    bodyDelivery: 'not_included' as const,
    responseWindow: window(publication.directoryMaxBytes),
  });
}

/** Discovery-only FTS presentation; full authority text cannot appear here. */
export function presentHistoricalHierarchySearch(delivery: HistoricalHierarchySearchDelivery) {
  const { publication, results } = delivery;
  if (results.length > 9) throw new OutputLimitError('Historical hierarchy search exceeds its reviewed result limit.');
  return bounded(publication.searchMaxBytes, 'search', {
    schemaVersion: HISTORICAL_HIERARCHY_OUTPUT_SCHEMA_VERSION,
    kind: HISTORICAL_HIERARCHY_OUTPUT_KIND,
    mode: 'search' as const,
    publication: publicationSummary(delivery),
    hits: results.map((result, index) => ({
      rank: index + 1,
      score: result.rank,
      node: discoveryNodeSummary(publication.publicSlug, result.node),
      breadcrumb: result.breadcrumb.map(node => discoveryNodeSummary(publication.publicSlug, node)),
      body: {
        bodyKey: result.body.bodyKey,
        heading: result.body.heading,
        contentSha256: result.body.contentSha256,
      },
      snippet: result.snippet.slice(0, DISCOVERY_SNIPPET_MAX_CODE_UNITS),
      snippetOnly: true as const,
    })),
    bodyDelivery: 'not_included' as const,
    responseWindow: window(publication.searchMaxBytes),
  });
}

function publicationSummary(delivery: HistoricalHierarchyLanding) {
  const { publication } = delivery;
  return {
    publicationId: publication.publicationId,
    slug: publication.publicSlug,
    title: publication.title,
    canonicalUri: publication.canonicalUri,
    deliveryKind: publication.deliveryKind,
    activationState: publication.activationState,
    metadata: publication.metadata,
    coverage: publication.coverage,
  };
}

function authoritySummary(profile: HistoricalHierarchyLanding['profile']) {
  return {
    hierarchyId: profile.hierarchyId,
    editionId: profile.editionId,
    availability: profile.availability,
    provenance: profile.provenance,
  };
}

function nodeSummary(publicSlug: string, node: HistoricalHierarchyNode) {
  const uri = buildHistoricalHierarchyResourceUri(publicSlug, node.nodeKey);
  if (!uri) throw new Error('Historical hierarchy node cannot form a canonical URI');
  return {
    nodeKey: node.nodeKey,
    parentNodeKey: node.parentNodeKey,
    nodeKind: node.nodeKind,
    bodyKey: node.bodyKey,
    depth: node.depth,
    flatOrdinal: node.flatOrdinal,
    siblingOrdinal: node.siblingOrdinal,
    label: node.label,
    heading: node.heading,
    resource: { kind: 'mcp_resource' as const, uri },
  };
}

/** A search hit needs a stable route, not a duplicate navigation record. */
function discoveryNodeSummary(publicSlug: string, node: HistoricalHierarchyNode) {
  const uri = buildHistoricalHierarchyResourceUri(publicSlug, node.nodeKey);
  if (!uri) throw new Error('Historical hierarchy node cannot form a canonical URI');
  return {
    nodeKey: node.nodeKey,
    nodeKind: node.nodeKind,
    label: node.label,
    resource: { kind: 'mcp_resource' as const, uri },
  };
}

function window(maximum: number) {
  return { unit: 'utf8_bytes' as const, maximum };
}

function bounded<T extends Record<string, unknown>>(maximum: number, mode: string, value: T): T {
  if (encoder.encode(JSON.stringify(value)).byteLength > maximum) {
    throw new OutputLimitError(`Historical hierarchy ${mode} output exceeds its reviewed UTF-8 byte budget.`);
  }
  return value;
}
