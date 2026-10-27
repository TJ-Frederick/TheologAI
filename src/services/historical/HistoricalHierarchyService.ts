/**
 * Dormant service seam for future hierarchy-node delivery.
 *
 * Nothing constructs this service in the Node or Worker composition roots.
 * Its presence establishes one identical service contract over the Node and
 * D1 repositories without registering any public MCP behavior.
 */

import {
  decodeHistoricalHierarchyCursor,
  encodeHistoricalHierarchyCursor,
} from '../../kernel/historicalHierarchyDelivery.js';
import {
  buildHistoricalHierarchyResourceUri,
  isHistoricalHierarchyNodeKey,
  isHistoricalHierarchyPublicSlug,
  parseHistoricalHierarchyResourceUri,
} from '../../kernel/historicalHierarchyResource.js';
import { NotFoundError, ValidationError } from '../../kernel/errors.js';
import type {
  HistoricalHierarchyNodeContext,
  HistoricalHierarchyNeighbors,
  HistoricalHierarchyNode,
  HistoricalHierarchyPage,
  HistoricalHierarchyProfile,
  HistoricalHierarchyPublication,
  HistoricalHierarchySearchResult,
  IHistoricalHierarchyRepository,
} from '../../kernel/repositories.js';

export interface HistoricalHierarchyLanding {
  publication: HistoricalHierarchyPublication;
  profile: HistoricalHierarchyProfile;
}

export interface HistoricalHierarchyNodeDelivery extends HistoricalHierarchyLanding {
  context: HistoricalHierarchyNodeContext;
  canonicalUri: string;
}

export interface HistoricalHierarchyChildDelivery extends HistoricalHierarchyLanding {
  parentNodeKey: string | null;
  page: HistoricalHierarchyPage;
  nextCursor: string | undefined;
}

export interface HistoricalHierarchySearchDelivery extends HistoricalHierarchyLanding {
  results: HistoricalHierarchySearchResult[];
}

/** Dormant neighbor seam; it is deliberately not registered or presented by MCP. */
export interface HistoricalHierarchyNeighborDelivery extends HistoricalHierarchyLanding {
  node: HistoricalHierarchyNode;
  neighbors: HistoricalHierarchyNeighbors;
}

/** Generic, deliberately uncomposed future-delivery boundary. */
export class HistoricalHierarchyService {
  constructor(private readonly repository: IHistoricalHierarchyRepository) {}

  async getLanding(publicSlug: string): Promise<HistoricalHierarchyLanding> {
    return await this.landing(publicSlug);
  }

  async getNode(publicSlug: string, nodeKey: string): Promise<HistoricalHierarchyNodeDelivery> {
    if (!isHistoricalHierarchyNodeKey(nodeKey)) throw new ValidationError('node_key', 'node_key must be a canonical hierarchy node key.');
    const landing = await this.landing(publicSlug);
    const context = await this.repository.getHierarchyNodeContext(landing.publication.hierarchyId, nodeKey);
    if (!context) throw new NotFoundError('hierarchy_node', `Hierarchy node not found: "${nodeKey}"`);
    assertContextBinding(context, landing.publication.hierarchyId);
    const canonicalUri = buildHistoricalHierarchyResourceUri(landing.publication.publicSlug, context.node.nodeKey);
    if (!canonicalUri) throw new Error('Historical hierarchy node cannot form a canonical URI');
    return { ...landing, context, canonicalUri };
  }

  async browseChildren(
    publicSlug: string,
    parentNodeKey: string | null,
    cursor: string | undefined,
  ): Promise<HistoricalHierarchyChildDelivery> {
    if (parentNodeKey !== null && !isHistoricalHierarchyNodeKey(parentNodeKey)) {
      throw new ValidationError('parent_node_key', 'parent_node_key must be a canonical hierarchy node key or null.');
    }
    const landing = await this.landing(publicSlug);
    let after;
    try {
      after = cursor === undefined
        ? undefined
        : decodeHistoricalHierarchyCursor(cursor, landing.publication, parentNodeKey);
    } catch (error) {
      throw new ValidationError('cursor', error instanceof Error ? error.message : 'cursor is invalid.');
    }
    const page = await this.repository.listHierarchyChildren(
      landing.publication.hierarchyId,
      parentNodeKey,
      after,
      landing.publication.browsePageSize,
    );
    assertChildPageBinding(page, landing.publication.hierarchyId, parentNodeKey);
    const nextCursor = page.nextAfter === undefined
      ? undefined
      : encodeHistoricalHierarchyCursor(landing.publication, parentNodeKey, page.nextAfter);
    return { ...landing, parentNodeKey, page, nextCursor };
  }

  async search(
    publicSlug: string,
    text: string,
    match: 'all_terms' | 'phrase',
    limit: number,
  ): Promise<HistoricalHierarchySearchDelivery> {
    const landing = await this.landing(publicSlug);
    const results = await this.repository.searchHierarchyBodies({
      hierarchyId: landing.publication.hierarchyId, text, match, limit,
    });
    for (const result of results) assertSearchResultBinding(result, landing.publication.hierarchyId);
    return { ...landing, results };
  }

  /** Verify sibling navigation against the same immutable hierarchy before any future exposure. */
  async getNeighbors(publicSlug: string, nodeKey: string): Promise<HistoricalHierarchyNeighborDelivery> {
    if (!isHistoricalHierarchyNodeKey(nodeKey)) throw new ValidationError('node_key', 'node_key must be a canonical hierarchy node key.');
    const landing = await this.landing(publicSlug);
    const context = await this.repository.getHierarchyNodeContext(landing.publication.hierarchyId, nodeKey);
    if (!context) throw new NotFoundError('hierarchy_node', `Hierarchy node not found: "${nodeKey}"`);
    assertContextBinding(context, landing.publication.hierarchyId);
    const neighbors = await this.repository.getHierarchyNeighbors(landing.publication.hierarchyId, nodeKey);
    if (!neighbors) throw new NotFoundError('hierarchy_node', `Hierarchy node not found: "${nodeKey}"`);
    for (const neighbor of [neighbors.previous, neighbors.next]) {
      if (neighbor && (neighbor.hierarchyId !== landing.publication.hierarchyId
        || neighbor.parentNodeKey !== context.node.parentNodeKey
        || neighbor.nodeKey === context.node.nodeKey)) {
        throw new Error('Historical hierarchy neighbor violates its publication binding');
      }
    }
    return { ...landing, node: context.node, neighbors };
  }

  /** Parse a canonical dormant URI, but do not register it with MCP. */
  async resolveCanonicalUri(uri: string): Promise<HistoricalHierarchyLanding | HistoricalHierarchyNodeDelivery> {
    const resource = parseHistoricalHierarchyResourceUri(uri);
    if (!resource) throw new ValidationError('uri', 'uri must be a canonical hierarchy landing or node resource URI.');
    return resource.nodeKey === undefined
      ? await this.getLanding(resource.publicSlug)
      : await this.getNode(resource.publicSlug, resource.nodeKey);
  }

  private async landing(publicSlug: string): Promise<HistoricalHierarchyLanding> {
    if (!isHistoricalHierarchyPublicSlug(publicSlug)) throw new ValidationError('slug', 'slug must be a canonical hierarchy publication slug.');
    const publication = await this.repository.getHierarchyPublicationBySlug(publicSlug);
    if (!publication) throw new NotFoundError('hierarchy_publication', `Hierarchy publication not found: "${publicSlug}"`);
    if (publication.activationState !== 'dormant' || publication.publicSlug !== publicSlug
      || publication.canonicalUri !== buildHistoricalHierarchyResourceUri(publicSlug)) {
      throw new Error('Historical hierarchy publication contract is invalid');
    }
    const profile = await this.repository.getHierarchyProfile(publication.hierarchyId);
    if (!profile) throw new NotFoundError('hierarchy', `Hierarchy authority not found: "${publication.hierarchyId}"`);
    if (profile.hierarchyId !== publication.hierarchyId || profile.availability !== 'local_only_inactive') {
      throw new Error('Historical hierarchy publication must retain local_only_inactive authority');
    }
    return { publication, profile };
  }
}

function assertNodeBinding(node: HistoricalHierarchyNode, hierarchyId: string): void {
  if (node.hierarchyId !== hierarchyId) throw new Error('Historical hierarchy node violates its publication binding');
}

function assertRootToNodePath(nodes: readonly HistoricalHierarchyNode[], hierarchyId: string): void {
  if (nodes.length === 0) throw new Error('Historical hierarchy breadcrumb is empty');
  for (const [index, node] of nodes.entries()) {
    assertNodeBinding(node, hierarchyId);
    if (index === 0) {
      if (node.parentNodeKey !== null) throw new Error('Historical hierarchy breadcrumb does not begin at a root');
    } else if (node.parentNodeKey !== nodes[index - 1]?.nodeKey) {
      throw new Error('Historical hierarchy breadcrumb is not publication-bound');
    }
  }
}

function assertContextBinding(context: HistoricalHierarchyNodeContext, hierarchyId: string): void {
  assertNodeBinding(context.node, hierarchyId);
  const path = [...context.ancestors, context.node];
  assertRootToNodePath(path, hierarchyId);
  if (context.body && (context.body.hierarchyId !== hierarchyId
    || context.node.bodyKey !== context.body.bodyKey)) {
    throw new Error('Historical hierarchy direct body violates its publication binding');
  }
  if (!context.body && context.node.bodyKey !== null) {
    throw new Error('Historical hierarchy direct node is missing its bound body');
  }
}

function assertChildPageBinding(
  page: HistoricalHierarchyPage,
  hierarchyId: string,
  parentNodeKey: string | null,
): void {
  if (page.nodes.some(node => node.hierarchyId !== hierarchyId || node.parentNodeKey !== parentNodeKey)) {
    throw new Error('Historical hierarchy child page violates its publication binding');
  }
  const last = page.nodes.at(-1);
  if ((page.hasMore && (page.nextAfter === undefined || !last
    || page.nextAfter.nodeKey !== last.nodeKey || page.nextAfter.siblingOrdinal !== last.siblingOrdinal))
    || (!page.hasMore && page.nextAfter !== undefined)) {
    throw new Error('Historical hierarchy child page pagination violates its publication binding');
  }
}

function assertSearchResultBinding(result: HistoricalHierarchySearchResult, hierarchyId: string): void {
  assertNodeBinding(result.node, hierarchyId);
  if (result.body.hierarchyId !== hierarchyId || result.body.bodyKey !== result.node.bodyKey) {
    throw new Error('Historical hierarchy search body violates its publication binding');
  }
  assertRootToNodePath(result.breadcrumb, hierarchyId);
  if (result.breadcrumb.at(-1)?.nodeKey !== result.node.nodeKey) {
    throw new Error('Historical hierarchy search result violates its publication binding');
  }
}
