import type { ToolHandler } from '../../kernel/types.js';
import { handleToolError } from '../../kernel/errors.js';
import type { PrimarySourceSearchService } from '../../services/historical/PrimarySourceSearchService.js';
import { formatPrimarySourceSearchFallback, PRIMARY_SOURCE_FALLBACK_MAX_BYTES } from '../../formatters/primarySourceFormatter.js';
import { primarySourceSearchV6OutputSchema, primarySourceSearchV7OutputSchema } from '../../mcp/schemas/primarySourceSearchV4.js';
import { buildLocalDocumentResourceUri } from '../../kernel/documentResource.js';
import type { ResourceLink } from '@modelcontextprotocol/sdk/types.js';
import type { PrimarySourceContractConfig } from '../../kernel/featureFlags.js';
import { DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG } from '../../kernel/featureFlags.js';
import {
  presentPrimarySourceSearchV6,
  type PresentedPrimarySourceSearchV4,
  presentPrimarySourceSearchV7,
  type PresentedPrimarySourceSearchV5,
  PRIMARY_SOURCE_V4_MAX_BYTES,
} from '../../presenters/primarySourceSearchV4Structured.js';

export function createPrimarySourceSearchHandler(
  service: Pick<PrimarySourceSearchService, 'search'>,
  contract: PrimarySourceContractConfig = DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG,
): ToolHandler {
  const v5 = contract.contractVersion === '7';
  return {
    name: 'primary_source_search',
    description: v5
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
                type: 'array', minItems: 1, maxItems: v5 ? 2 : 1, uniqueItems: true,
                items: { type: 'string', enum: v5 ? ['local', 'ccel'] : ['local'] },
                description: v5
                  ? 'Unique providers from local and ccel. At most one query in a tool call may include ccel.'
                  : 'Current public provider contract. Only the locally indexed collection is available.',
              },
              match: { type: 'string', enum: ['all_terms', 'phrase'], default: 'all_terms' },
              selection: {
                type: 'string', enum: ['relevance', 'work_diversity'], default: 'relevance',
                description: v5
                  ? 'Local provider: relevance locates within a work; work_diversity round-robins across hosted works. CCEL discovery preserves the field but uses provider result order.'
                  : 'Use relevance for within-work location; use work_diversity for deterministic research bundles that round-robin across matching hosted works.',
              },
              author: {
                type: 'string', minLength: 1, maxLength: 100,
                description: v5
                  ? 'Local: one exact reviewed creator name. CCEL: an unreviewed provider search restriction. Use sequential tool calls for different external creators.'
                  : 'One exact reviewed creator name. Use separate query-plan items for different creators; creator roles are not relabeled as authorship.',
              },
              work: {
                type: 'string', minLength: 1, maxLength: 160,
                description: v5
                  ? 'Local: exact hosted slug, title, or routing alias. CCEL: an unreviewed provider title/work restriction, not reviewed metadata.'
                  : 'Exact hosted work slug, title, or lookup-only alias.',
              },
              startYear: {
                type: 'integer', minimum: -5000, maximum: 3000,
                description: v5
                  ? 'Hosted-local inclusive composition-overlap lower bound. A direct query whose providers include ccel cannot use this field: it returns unsupported_filter before adapter or coordinator admission.'
                  : 'Inclusive lower bound. A work is eligible when its reviewed composition interval overlaps the requested interval.',
              },
              endYear: {
                type: 'integer', minimum: -5000, maximum: 3000,
                description: v5
                  ? 'Hosted-local inclusive composition-overlap upper bound; must be >= startYear. A direct query whose providers include ccel cannot use this field: it returns unsupported_filter before adapter or coordinator admission.'
                  : 'Inclusive upper bound. Must be greater than or equal to startYear when both are provided.',
              },
              page: {
                type: 'integer', minimum: 1, maximum: 3, default: 1,
                description: v5
                  ? 'Both providers support page 1 only in this contract; values above 1 return unsupported_filter without CCEL admission.'
                  : 'Preserved planner field. The local provider supports only page 1 and reports unsupported_filter otherwise.',
              },
              limit: {
                type: 'integer', minimum: 1, maximum: 8, default: 5,
                ...(v5 ? { description: 'Local maximum is 8; external CCEL results are always capped at 5.' } : {}),
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
    outputSchema: v5 ? primarySourceSearchV7OutputSchema : primarySourceSearchV6OutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: v5 },
    handler: async params => {
      try {
        const queries = !v5 && Array.isArray(params.queries)
          ? params.queries.map(query => ({
              ...(query as Record<string, unknown>),
              providers: ['local'],
            }))
          : params.queries;
        const result = await service.search({ ...params, queries });
        const presented = v5 ? presentPrimarySourceSearchV7(result) : presentPrimarySourceSearchV6(result);
        const links = localSectionResourceLinks(presented);
        const fallback = formatPrimarySourceSearchFallback(presented);
        const unavailable = presented.planStatus === 'unavailable';
        // Native links are supplemental: the structured locator is
        // authoritative. Trim only the final links if their metadata would
        // exceed the shared delivery budget, rather than failing an otherwise
        // valid bounded research result.
        while (links.length > 0 && deliveryBytes(presented, fallback, links, unavailable) > PRIMARY_SOURCE_V4_MAX_BYTES) {
          links.pop();
        }
        assertDeliveryBudget(presented, fallback, links, unavailable);
        return {
          content: [
            { type: 'text', text: fallback },
            ...links,
          ],
          structuredContent: presented,
          ...(unavailable ? { isError: true } : {}),
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}

/** Build links only from validated presentation data, never directly from provider locators. */
function localSectionResourceLinks(presented: PresentedPrimarySourceSearchV4 | PresentedPrimarySourceSearchV5): ResourceLink[] {
  const links: ResourceLink[] = [];
  const seen = new Set<string>();
  for (const query of presented.queries) {
    for (const provider of query.providers) {
      for (const candidate of provider.hits) {
        if (candidate.provider !== 'local') continue;
        const { locator } = candidate;
        const canonical = buildLocalDocumentResourceUri(locator.documentId, locator.sectionKey);
        if (!canonical || canonical !== locator.uri || seen.has(canonical)) continue;
        seen.add(canonical);
        const section = candidate.sectionLabel ? ` — ${candidate.sectionLabel}` : '';
        const metadata = [candidate.documentType, candidate.documentDate].filter(Boolean).join(', ');
        // The repository's declared MCP SDK supports `Resource.size`. The
        // local compatibility intersection keeps that standard field intact
        // when an older installed SDK type definition is being used.
        links.push({
          type: 'resource_link',
          uri: canonical,
          name: clip(`local-primary-source/${locator.documentId}/${locator.sectionKey}`, 180),
          title: clip(`${candidate.title}${section}`, 180),
          description: clip(`${metadata ? `${metadata}. ` : ''}Exact local section selected by primary-source discovery.`, 180),
          mimeType: 'text/markdown',
          // `size` is the interoperable MCP resource byte hint. Keep the same
          // fact in namespaced metadata for older clients that retain `_meta`
          // but (incorrectly) strip the standard field in transit.
          size: candidate.resourceSizeBytes,
          _meta: { 'theologai/resourceSizeBytes': candidate.resourceSizeBytes },
          annotations: { audience: ['assistant'] },
        } as ResourceLink & { size: number });
        if (links.length === 8) return links;
      }
    }
  }
  return links;
}

function assertDeliveryBudget(
  structuredContent: PresentedPrimarySourceSearchV4 | PresentedPrimarySourceSearchV5,
  fallback: string,
  links: ResourceLink[],
  isError: boolean,
): void {
  const fallbackBytes = new TextEncoder().encode(fallback).byteLength;
  const bytes = deliveryBytes(structuredContent, fallback, links, isError);
  if (fallbackBytes > PRIMARY_SOURCE_FALLBACK_MAX_BYTES || bytes > PRIMARY_SOURCE_V4_MAX_BYTES) {
    throw new Error('Primary-source response delivery budget was exceeded.');
  }
}

function deliveryBytes(
  structuredContent: PresentedPrimarySourceSearchV4 | PresentedPrimarySourceSearchV5,
  fallback: string,
  links: ResourceLink[],
  isError: boolean,
): number {
  const delivery = {
    content: [{ type: 'text', text: fallback }, ...links],
    structuredContent,
    ...(isError ? { isError: true } : {}),
  };
  return new TextEncoder().encode(JSON.stringify(delivery)).byteLength;
}

function clip(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join('');
}
