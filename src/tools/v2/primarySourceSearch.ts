import type { ToolHandler } from '../../kernel/types.js';
import { handleToolError } from '../../kernel/errors.js';
import type { PrimarySourceSearchService } from '../../services/historical/PrimarySourceSearchService.js';
import { formatPrimarySourceSearchFallback, PRIMARY_SOURCE_FALLBACK_MAX_BYTES } from '../../formatters/primarySourceFormatter.js';
import { buildLocalDocumentResourceUri } from '../../kernel/documentResource.js';
import type { ResourceLink } from '@modelcontextprotocol/server';
import { DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG } from '../../kernel/featureFlags.js';
import type { PrimarySourceContractConfig } from '../../kernel/featureFlags.js';
import { createPrimarySourceSearchDescriptor, type PrimarySourceSearchDescriptor } from '../../mcp/primarySourceSearchDescriptor.js';
import {
  presentPrimarySourceSearchV6,
  type PresentedPrimarySourceSearchV4,
  presentPrimarySourceSearchV7,
  type PresentedPrimarySourceSearchV5,
  PRIMARY_SOURCE_V4_MAX_BYTES,
} from '../../presenters/primarySourceSearchV4Structured.js';
import {
  presentPrimarySourceSearchV8,
  type PresentedPrimarySourceSearchV8,
} from '../../presenters/primarySourceSearchV8Structured.js';

export interface PrimarySourceSearchBinding {
  readonly descriptor: PrimarySourceSearchDescriptor;
  readonly tool: ToolHandler;
}

export function bindPrimarySourceSearch(
  service: Pick<PrimarySourceSearchService, 'search'>,
  contract: Pick<PrimarySourceContractConfig, 'contractVersion'> = DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG,
): PrimarySourceSearchBinding {
  const descriptor = createPrimarySourceSearchDescriptor(contract.contractVersion);
  return { descriptor, tool: createPrimarySourceSearchHandler(service, descriptor) };
}

export function createPrimarySourceSearchHandler(
  service: Pick<PrimarySourceSearchService, 'search'>,
  descriptorOrContract: PrimarySourceSearchDescriptor | Pick<PrimarySourceContractConfig, 'contractVersion'> = createPrimarySourceSearchDescriptor(DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG.contractVersion),
): ToolHandler {
  const descriptor = 'inputSchema' in descriptorOrContract
    ? descriptorOrContract
    : createPrimarySourceSearchDescriptor(descriptorOrContract.contractVersion);
  return {
    name: descriptor.name, description: descriptor.description, inputSchema: descriptor.inputSchema,
    outputSchema: descriptor.outputSchema, annotations: descriptor.annotations,
    handler: async params => {
      try {
        const discoveryContract = descriptor.contractVersion !== '6';
        const queries = !discoveryContract && Array.isArray(params.queries)
          ? params.queries.map(query => ({ ...(query as Record<string, unknown>), providers: ['local'] }))
          : params.queries;
        const result = await service.search({ ...params, queries });
        const presented = descriptor.contractVersion === '8'
          ? presentPrimarySourceSearchV8(result)
          : descriptor.contractVersion === '7'
            ? presentPrimarySourceSearchV7(result)
            : presentPrimarySourceSearchV6(result);
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
function localSectionResourceLinks(
  presented: PresentedPrimarySourceSearchV4 | PresentedPrimarySourceSearchV5 | PresentedPrimarySourceSearchV8,
): ResourceLink[] {
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
  structuredContent: PresentedPrimarySourceSearchV4 | PresentedPrimarySourceSearchV5 | PresentedPrimarySourceSearchV8,
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
  structuredContent: PresentedPrimarySourceSearchV4 | PresentedPrimarySourceSearchV5 | PresentedPrimarySourceSearchV8,
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
