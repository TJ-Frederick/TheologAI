/** Public bounded lookup for active edition-scoped historical hierarchies. */

import type { ResourceLink } from '@modelcontextprotocol/server';
import { handleToolError, ValidationError } from '../../kernel/errors.js';
import { buildHistoricalHierarchyResourceUri } from '../../kernel/historicalHierarchyResource.js';
import type { ToolHandler } from '../../kernel/types.js';
import { historicalHierarchyOutputSchema } from '../../mcp/schemas/historicalHierarchy.js';
import {
  formatHistoricalHierarchyChildren,
  formatHistoricalHierarchyLanding,
  formatHistoricalHierarchyNode,
  formatHistoricalHierarchySearch,
} from '../../formatters/historicalHierarchyFormatter.js';
import {
  presentHistoricalHierarchyChildren,
  presentHistoricalHierarchyLanding,
  presentHistoricalHierarchyNode,
  presentHistoricalHierarchySearch,
} from '../../presenters/historicalHierarchyStructured.js';
import type { HistoricalHierarchyService } from '../../services/historical/HistoricalHierarchyService.js';

const SEARCH_LIMIT = 9;

export function createHistoricalHierarchyHandler(historicalHierarchyService: HistoricalHierarchyService): ToolHandler {
  return {
    name: 'historical_hierarchy_lookup',
    description: 'Browse and search active local historical works with a nested authority structure. Choose one mode: a work landing, one exact node, immediate children, or bounded discovery search. Bodies appear only for one exact node; child browsing and search never include descendant or full-text bodies.',
    inputSchema: {
      type: 'object',
      minProperties: 1,
      properties: {
        slug: { type: 'string', minLength: 1, maxLength: 160, description: 'Canonical active hierarchy publication slug.' },
        nodeKey: { type: 'string', minLength: 1, maxLength: 160, description: 'Canonical exact node key. Use with slug only.' },
        browseChildren: { type: 'boolean', const: true, description: 'List immediate child nodes. Use with slug and optional parentNodeKey/cursor.' },
        parentNodeKey: { oneOf: [{ type: 'string', minLength: 1, maxLength: 160 }, { type: 'null' }], description: 'Parent node key, or null for work-root children.' },
        cursor: { type: 'string', minLength: 1, maxLength: 2048, pattern: '^[A-Za-z0-9_-]+$', description: 'Opaque immediate-child continuation cursor. Preserve unchanged.' },
        query: { type: 'string', minLength: 1, maxLength: 500, description: 'Local hierarchy discovery query. Search snippets do not deliver bodies.' },
        match: { type: 'string', enum: ['all_terms', 'phrase'], description: 'Search matching mode; defaults to all_terms.' },
      },
      required: ['slug'],
      additionalProperties: false,
    },
    outputSchema: historicalHierarchyOutputSchema,
    annotations: {
      readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
    },
    handler: async params => {
      try {
        const mode = validateMode(params);
        const slug = params.slug as string;
        if (mode === 'landing') {
          const delivery = await historicalHierarchyService.getLanding(slug);
          const structuredContent = presentHistoricalHierarchyLanding(delivery);
          return {
            content: [
              { type: 'text', text: formatHistoricalHierarchyLanding(delivery) },
              resourceLink(delivery.publication.canonicalUri, delivery.publication.title, 'Active local hierarchy landing.'),
            ],
            structuredContent,
          };
        }
        if (mode === 'node') {
          const delivery = await historicalHierarchyService.getNode(slug, params.nodeKey as string);
          const structuredContent = presentHistoricalHierarchyNode(delivery);
          return {
            content: [
              { type: 'text', text: formatHistoricalHierarchyNode(delivery) },
              resourceLink(delivery.canonicalUri, delivery.context.node.heading, 'Exact local hierarchy node.'),
            ],
            structuredContent,
          };
        }
        if (mode === 'children') {
          const delivery = await historicalHierarchyService.browseChildren(
            slug,
            (params.parentNodeKey as string | null | undefined) ?? null,
            params.cursor as string | undefined,
          );
          const structuredContent = presentHistoricalHierarchyChildren(delivery);
          return {
            content: [
              { type: 'text', text: formatHistoricalHierarchyChildren(delivery) },
              ...delivery.page.nodes.map(node => resourceLink(
                nodeUri(delivery.publication.publicSlug, node.nodeKey),
                node.heading,
                'Exact local hierarchy node.',
              )),
            ],
            structuredContent,
          };
        }
        const delivery = await historicalHierarchyService.search(
          slug,
          params.query as string,
          (params.match as 'all_terms' | 'phrase' | undefined) ?? 'all_terms',
          SEARCH_LIMIT,
        );
        const structuredContent = presentHistoricalHierarchySearch(delivery);
        return {
          content: [
            { type: 'text', text: formatHistoricalHierarchySearch(delivery) },
            ...delivery.results.map(result => resourceLink(
              nodeUri(delivery.publication.publicSlug, result.node.nodeKey),
              result.node.heading,
              'Exact local hierarchy node selected by discovery.',
            )),
          ],
          structuredContent,
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}

type Mode = 'landing' | 'node' | 'children' | 'search';

function validateMode(params: Record<string, unknown>): Mode {
  const allowed = new Set(['slug', 'nodeKey', 'browseChildren', 'parentNodeKey', 'cursor', 'query', 'match']);
  const unknown = Object.keys(params).find(key => !allowed.has(key));
  if (unknown) throw new ValidationError(unknown, `Unknown argument "${unknown}". Choose one advertised hierarchy mode.`);
  if (typeof params.slug !== 'string' || params.slug.trim().length === 0 || params.slug.length > 160) {
    throw new ValidationError('slug', 'slug must name an active hierarchy publication.');
  }
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(params, key);
  if (has('nodeKey')) {
    if (typeof params.nodeKey !== 'string' || params.nodeKey.length === 0 || params.nodeKey.length > 160
      || Object.keys(params).length !== 2) {
      throw new ValidationError('nodeKey', 'nodeKey is the exact-node mode and can only be combined with slug.');
    }
    return 'node';
  }
  if (has('browseChildren')) {
    if (params.browseChildren !== true
      || has('query') || has('match')
      || (has('parentNodeKey') && params.parentNodeKey !== null
        && (typeof params.parentNodeKey !== 'string' || params.parentNodeKey.length === 0 || params.parentNodeKey.length > 160))
      || (has('cursor') && (typeof params.cursor !== 'string' || !/^[A-Za-z0-9_-]{1,2048}$/.test(params.cursor)))) {
      throw new ValidationError('browseChildren', 'browseChildren=true accepts slug and optional parentNodeKey/cursor only.');
    }
    return 'children';
  }
  if (has('query')) {
    if (typeof params.query !== 'string' || params.query.trim().length === 0 || params.query.length > 500
      || Object.keys(params).some(key => !['slug', 'query', 'match'].includes(key))
      || (has('match') && params.match !== 'all_terms' && params.match !== 'phrase')) {
      throw new ValidationError('query', 'query is the bounded hierarchy-search mode and accepts only slug plus optional match.');
    }
    return 'search';
  }
  if (Object.keys(params).length !== 1) {
    throw new ValidationError('mode', 'Choose a hierarchy landing, exact node, immediate-child browse, or search mode.');
  }
  return 'landing';
}

function resourceLink(uri: string, title: string, description: string): ResourceLink {
  return {
    type: 'resource_link',
    uri,
    name: uri.replace('theologai://documents/', 'historical-hierarchy/'),
    title,
    description,
    mimeType: 'text/markdown',
    annotations: { audience: ['assistant'] },
  };
}

function nodeUri(publicSlug: string, nodeKey: string): string {
  const uri = buildHistoricalHierarchyResourceUri(publicSlug, nodeKey);
  if (!uri) throw new Error('Historical hierarchy node cannot form a canonical resource URI');
  return uri;
}
