import type { ToolHandler } from '../../kernel/types.js';
import { handleToolError } from '../../kernel/errors.js';
import type { PrimarySourceSearchService } from '../../services/historical/PrimarySourceSearchService.js';
import { formatPrimarySourceSearch } from '../../formatters/primarySourceFormatter.js';
import { primarySourceSearchOutputSchema } from '../../mcp/schemas/primarySourceSearch.js';
import {
  presentPrimarySourceSearch,
  type PresentedPrimarySourceSearch,
} from '../../presenters/primarySourceSearchStructured.js';
import { buildLocalDocumentResourceUri } from '../../kernel/documentResource.js';
import type { ResourceLink } from '@modelcontextprotocol/sdk/types.js';

export function createPrimarySourceSearchHandler(service: Pick<PrimarySourceSearchService, 'search'>): ToolHandler {
  return {
    name: 'primary_source_search',
    description: 'Execute an explicit, bounded query plan against the locally indexed historical-document collection. Supports exact catalog work aliases, exact reviewed creator names, and inclusive overlapping composition-year ranges. Returns catalog scope, snippets, and exact local section locators only; read selected exact resources before quotation or comparison.',
    inputSchema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array', minItems: 1, maxItems: 4,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 40, pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$' },
              text: { type: 'string', minLength: 1, maxLength: 200 },
              providers: {
                type: 'array', minItems: 1, maxItems: 1, uniqueItems: true,
                items: { type: 'string', enum: ['local'] },
                description: 'Current public provider contract. Only the locally indexed collection is available.',
              },
              match: { type: 'string', enum: ['all_terms', 'phrase'], default: 'all_terms' },
              author: { type: 'string', minLength: 1, maxLength: 100, description: 'One exact reviewed creator name. Use separate query-plan items for different creators; creator roles are not relabeled as authorship.' },
              work: { type: 'string', minLength: 1, maxLength: 160, description: 'Exact hosted work slug, title, or lookup-only alias.' },
              startYear: { type: 'integer', minimum: -5000, maximum: 3000, description: 'Inclusive lower bound. A work is eligible when its reviewed composition interval overlaps the requested interval.' },
              endYear: { type: 'integer', minimum: -5000, maximum: 3000, description: 'Inclusive upper bound. Must be greater than or equal to startYear when both are provided.' },
              page: { type: 'integer', minimum: 1, maximum: 3, default: 1, description: 'Preserved planner field. The local provider supports only page 1 and reports unsupported_filter otherwise.' },
              limit: { type: 'integer', minimum: 1, maximum: 8, default: 5 },
            },
            required: ['id', 'text', 'providers'],
            additionalProperties: false,
          },
        },
      },
      required: ['queries'],
      additionalProperties: false,
    },
    outputSchema: primarySourceSearchOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async params => {
      try {
        const queries = Array.isArray(params.queries)
          ? params.queries.map(query => ({
              ...(query as Record<string, unknown>),
              providers: ['local'],
            }))
          : params.queries;
        const result = await service.search({ ...params, queries });
        const presented = presentPrimarySourceSearch(result);
        return {
          content: [
            { type: 'text', text: formatPrimarySourceSearch(presented) },
            ...localSectionResourceLinks(presented),
          ],
          structuredContent: presented,
          ...(presented.planStatus === 'unavailable' ? { isError: true } : {}),
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}

/** Build links only from validated presentation data, never directly from provider locators. */
function localSectionResourceLinks(presented: PresentedPrimarySourceSearch): ResourceLink[] {
  const links: ResourceLink[] = [];
  const seen = new Set<string>();
  for (const query of presented.queries) {
    for (const provider of query.providers) {
      for (const candidate of provider.hits) {
        if (candidate.provider !== 'local') continue;
        const { locator } = candidate;
        const canonical = buildLocalDocumentResourceUri(locator.documentId, locator.sectionId);
        if (!canonical || canonical !== locator.url || seen.has(canonical)) continue;
        seen.add(canonical);
        const section = candidate.sectionLabel ? ` — ${candidate.sectionLabel}` : '';
        const metadata = [candidate.documentType, candidate.documentDate].filter(Boolean).join(', ');
        links.push({
          type: 'resource_link',
          uri: canonical,
          name: `local-primary-source/${locator.documentId}/${locator.sectionId}`,
          title: `${candidate.title}${section}`,
          description: `${metadata ? `${metadata}. ` : ''}Exact local section selected by primary-source discovery.`,
          mimeType: 'text/markdown',
          size: candidate.resourceSizeBytes,
          annotations: { audience: ['assistant'] },
        });
        if (links.length === 32) return links;
      }
    }
  }
  return links;
}
