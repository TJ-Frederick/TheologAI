import type { ToolHandler } from '../../kernel/types.js';
import { handleToolError } from '../../kernel/errors.js';
import type { PrimarySourceSearchService } from '../../services/historical/PrimarySourceSearchService.js';
import { formatPrimarySourceSearch } from '../../formatters/primarySourceFormatter.js';
import { primarySourceSearchOutputSchema } from '../../mcp/schemas/primarySourceSearch.js';
import { primarySourceSearchV4OutputSchema } from '../../mcp/schemas/primarySourceSearchV4.js';
import {
  presentPrimarySourceSearch,
  type PresentedPrimarySourceSearch,
} from '../../presenters/primarySourceSearchStructured.js';
import { buildLocalDocumentResourceUri } from '../../kernel/documentResource.js';
import type { ResourceLink } from '@modelcontextprotocol/sdk/types.js';
import type { PrimarySourceContractConfig } from '../../kernel/featureFlags.js';
import { DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG } from '../../kernel/featureFlags.js';
import {
  presentPrimarySourceSearchV4,
  type PresentedPrimarySourceSearchV4,
} from '../../presenters/primarySourceSearchV4Structured.js';

export function createPrimarySourceSearchHandler(
  service: Pick<PrimarySourceSearchService, 'search'>,
  contract: PrimarySourceContractConfig = DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG,
): ToolHandler {
  const v4 = contract.contractVersion === '4';
  return {
    name: 'primary_source_search',
    description: v4
      ? 'Execute a bounded primary-source discovery plan across the local collection and optional CCEL discovery metadata. Local hits are readable MCP resources; external snippets are unreviewed discovery leads with direct URLs only and must not be quoted or compared as evidence.'
      : 'Execute an explicit, bounded query plan against the locally indexed historical-document collection. Supports exact catalog work aliases, exact reviewed creator names, and inclusive overlapping composition-year ranges. Returns catalog scope, snippets, and exact local section locators only; read selected exact resources before quotation or comparison.',
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
                type: 'array', minItems: 1, maxItems: v4 ? 2 : 1, uniqueItems: true,
                items: { type: 'string', enum: v4 ? ['local', 'ccel'] : ['local'] },
                description: v4
                  ? 'Unique providers from local and ccel. At most one query in a tool call may include ccel.'
                  : 'Current public provider contract. Only the locally indexed collection is available.',
              },
              match: { type: 'string', enum: ['all_terms', 'phrase'], default: 'all_terms' },
              selection: {
                type: 'string', enum: ['relevance', 'work_diversity'], default: 'relevance',
                description: v4
                  ? 'Local provider: relevance locates within a work; work_diversity round-robins across hosted works. CCEL discovery preserves the field but uses provider result order.'
                  : 'Use relevance for within-work location; use work_diversity for deterministic research bundles that round-robin across matching hosted works.',
              },
              author: {
                type: 'string', minLength: 1, maxLength: 100,
                description: v4
                  ? 'Local: one exact reviewed creator name. CCEL: an unreviewed provider search restriction. Use sequential tool calls for different external creators.'
                  : 'One exact reviewed creator name. Use separate query-plan items for different creators; creator roles are not relabeled as authorship.',
              },
              work: {
                type: 'string', minLength: 1, maxLength: 160,
                description: v4
                  ? 'Local: exact hosted slug, title, or routing alias. CCEL: an unreviewed provider title/work restriction, not reviewed metadata.'
                  : 'Exact hosted work slug, title, or lookup-only alias.',
              },
              startYear: {
                type: 'integer', minimum: -5000, maximum: 3000,
                description: v4
                  ? 'Local inclusive composition-overlap lower bound. Unsupported for CCEL and reported as unsupported_filter without an upstream request.'
                  : 'Inclusive lower bound. A work is eligible when its reviewed composition interval overlaps the requested interval.',
              },
              endYear: {
                type: 'integer', minimum: -5000, maximum: 3000,
                description: v4
                  ? 'Local inclusive composition-overlap upper bound; must be >= startYear. Unsupported for CCEL and never silently ignored.'
                  : 'Inclusive upper bound. Must be greater than or equal to startYear when both are provided.',
              },
              page: {
                type: 'integer', minimum: 1, maximum: 3, default: 1,
                description: v4
                  ? 'Both providers support page 1 only in this contract; values above 1 return unsupported_filter without CCEL admission.'
                  : 'Preserved planner field. The local provider supports only page 1 and reports unsupported_filter otherwise.',
              },
              limit: {
                type: 'integer', minimum: 1, maximum: 8, default: 5,
                ...(v4 ? { description: 'Local maximum is 8; external CCEL results are always capped at 5.' } : {}),
              },
            },
            required: ['id', 'text', 'providers'],
            additionalProperties: false,
          },
        },
      },
      required: ['queries'],
      additionalProperties: false,
    },
    outputSchema: v4 ? primarySourceSearchV4OutputSchema : primarySourceSearchOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: v4 },
    handler: async params => {
      try {
        const queries = !v4 && Array.isArray(params.queries)
          ? params.queries.map(query => ({
              ...(query as Record<string, unknown>),
              providers: ['local'],
            }))
          : params.queries;
        const result = await service.search({ ...params, queries });
        if (v4) {
          const presented = presentPrimarySourceSearchV4(result);
          return {
            content: [
              { type: 'text', text: JSON.stringify(presented) },
              ...localV4ResourceLinks(presented),
            ],
            structuredContent: presented,
            ...(presented.planStatus === 'unavailable' ? { isError: true } : {}),
          };
        }
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

function localV4ResourceLinks(presented: PresentedPrimarySourceSearchV4): ResourceLink[] {
  const links: ResourceLink[] = [];
  const seen = new Set<string>();
  for (const query of presented.queries) {
    for (const provider of query.providers) {
      for (const candidate of provider.hits) {
        if (candidate.provider !== 'local') continue;
        const { locator } = candidate;
        const canonical = buildLocalDocumentResourceUri(locator.documentId, locator.sectionId);
        if (!canonical || canonical !== locator.uri || seen.has(canonical)) continue;
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
      }
    }
  }
  return links;
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
