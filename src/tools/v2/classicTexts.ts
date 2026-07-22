/**
 * classic_text_lookup tool handler (v2).
 *
 * Local historical-document search and browsing.
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { HistoricalDocumentService } from '../../services/historical/HistoricalDocumentService.js';
import {
  formatDocumentList,
  formatDocumentSections,
  formatSearchResults,
  formatCompleteDocumentSectionIndex,
} from '../../formatters/historicalFormatter.js';
import { handleToolError, ValidationError } from '../../kernel/errors.js';
import { classicTextsOutputSchema } from '../../mcp/schemas/classicTexts.js';
import {
  presentClassicTextCatalog,
  presentClassicTextDirectory,
  presentClassicTextSearch,
  presentClassicTextSectionedLanding,
  presentClassicTextWork,
  validateClassicTextsOutputSemantics,
} from '../../presenters/classicTextsStructured.js';
import type { ResourceLink } from '@modelcontextprotocol/sdk/types.js';
import { CLASSIC_TEXT_LIMITS } from '../../kernel/classicTextContract.js';
import {
  decodeHistoricalSectionedOnlyCursor,
  encodeHistoricalSectionedOnlyCursor,
  HISTORICAL_SECTIONED_ONLY_LOOKAHEAD,
  HISTORICAL_SECTIONED_ONLY_PAGE_SIZE,
} from '../../kernel/historicalSectionedDelivery.js';
import { formatSectionedDocumentDirectory, formatSectionedDocumentLanding } from '../../formatters/historicalFormatter.js';

export function createClassicTextsHandler(historicalService: HistoricalDocumentService): ToolHandler {
  return {
    name: 'classic_text_lookup',
      description: 'Search and browse the locally indexed historical-document collection. Every public section locator uses its canonical Transform-8 section key and source ordinal. A future reviewed sectioned-only edition would return a bounded landing or 32-entry metadata directory; only exact-section resources deliver bodies. Remote CCEL document bodies are not retrieved or republished.',
    inputSchema: {
      type: 'object',
      description: 'Flat mode fields are intentionally shown together for client discoverability; choose exactly one mode, with cross-field validity enforced strictly by the handler.',
      minProperties: 1,
      properties: {
        work: { type: 'string', minLength: 1, maxLength: 256, description: 'Named local document slug or title (e.g., "nicene-creed").' },
        query: { type: 'string', minLength: 1, maxLength: 500, description: 'Literal all-term search across the local historical-document collection. Use alone; returned snippets are discovery-only.' },
        listWorks: { type: 'boolean', const: true, description: 'List locally indexed historical documents. Use alone and set true.' },
        browseSections: { type: 'boolean', const: true, description: 'List a compact exact-section resource index for a local work. Use with a work identifier and no section or query.' },
        cursor: { type: 'string', minLength: 1, maxLength: 2048, pattern: '^[A-Za-z0-9_-]+$', description: 'Opaque continuation cursor for a sectioned-only directory page. Use only with work and browseSections=true; preserve it unchanged.' },
      },
      additionalProperties: false,
    },
    outputSchema: classicTextsOutputSchema,
    validateStructuredOutput: validateClassicTextsOutputSemantics,
    annotations: {
      readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
    },

    handler: async (params) => {
      try {
        validateMode(params);
        // List works
        if (params.listWorks) {
          const docs = await historicalService.listDocuments();
          const profiles = await Promise.all(docs.map(async document => ({
            document, profile: await historicalService.getDeliveryProfile(document.id),
          })));
          const presented = presentClassicTextCatalog(profiles);
          return {
            content: [{ type: 'text', text: formatDocumentList(docs) }],
            structuredContent: presented,
          };
        }

        // Browse a specific document
        if (params.work && params.browseSections) {
          const doc = await historicalService.getDocument(params.work as string);
          const profile = await historicalService.getDeliveryProfile(doc.id);
          if (profile.deliveryMode === 'sectioned_only') {
            const after = params.cursor === undefined
              ? undefined
              : decodeHistoricalSectionedOnlyCursor(params.cursor as string, profile);
            if (after && !await historicalService.hasHistoricalSectionBoundary(doc.id, after)) {
              throw new ValidationError('cursor', 'Historical section browse cursor does not name a current section boundary.');
            }
            const rows = await historicalService.browseHistoricalSectionSummaries(doc.id, after, HISTORICAL_SECTIONED_ONLY_LOOKAHEAD);
            const page = rows.slice(0, HISTORICAL_SECTIONED_ONLY_PAGE_SIZE);
            const last = page.at(-1);
            const nextCursor = rows.length > page.length && last
              ? encodeHistoricalSectionedOnlyCursor(profile, last)
              : undefined;
            const presented = presentClassicTextDirectory({ document: doc, profile, sections: page, nextCursor });
            return {
              content: [
                { type: 'text', text: formatSectionedDocumentDirectory(doc, page, nextCursor) },
                ...sectionResourceLinks(presented.directory.sections),
              ],
              structuredContent: presented,
            };
          }
          const sections = await historicalService.browseHistoricalSectionSummaries(doc.id, undefined, CLASSIC_TEXT_LIMITS.sectionsPerWork + 1);
          const presented = presentClassicTextDirectory({ document: doc, profile, sections });
          return {
            content: [
              { type: 'text', text: formatCompleteDocumentSectionIndex(doc, sections) },
              ...sectionResourceLinks(presented.directory.sections),
            ],
            structuredContent: presented,
          };
        }

        // Look up a specific local document
        if (params.work && !params.query) {
          const doc = await historicalService.findDocument(params.work as string);
          if (!doc) {
            throw new ValidationError('work', `No locally indexed historical document matches "${params.work}".`);
          }
          const profile = await historicalService.getDeliveryProfile(doc.id);
          if (profile.deliveryMode === 'sectioned_only') {
            const presented = presentClassicTextSectionedLanding(doc, profile);
            return {
              content: [
                { type: 'text', text: formatSectionedDocumentLanding(doc, profile) },
                resourceLink(presented.landing.work.resource, doc.title, 'Bounded historical-document landing metadata.'),
              ],
              structuredContent: presented,
            };
          }
          const sections = await historicalService.getSections(doc.id);
          const presented = presentClassicTextWork({ document: doc, sections });
          return {
            content: [
              { type: 'text', text: formatDocumentSections(doc, sections) },
              resourceLink(presented.document.work.resource, doc.title, 'Complete local historical document.'),
            ],
            structuredContent: presented,
          };
        }

        // Search by query
        if (params.query) {
          // Search local docs first
          const query = params.query as string;
          const localResults = await historicalService.searchResolvedSections(query, CLASSIC_TEXT_LIMITS.searchLookahead);
          const profiles = new Map(await Promise.all([...new Set(localResults.map(result => result.document.id))]
            .map(async id => [id, await historicalService.getDeliveryProfile(id)] as const)));
          const presented = presentClassicTextSearch(query, localResults, profiles);
          if (localResults.length > 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: formatSearchResults(
                    query,
                    localResults,
                    [],
                    presented.search.hits.map(hit => hit.discoverySnippet),
                  ),
                },
                ...searchResourceLinks(presented.search.hits),
              ],
              structuredContent: presented,
            };
          }

          return {
            content: [{ type: 'text', text: `No results found for "${query}".` }],
            structuredContent: presented,
          };
        }

        throw new ValidationError('mode', 'Choose exactly one mode: list local works, search local documents, or browse a local work.');
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}

type Locator = { uri: string; resourceSizeBytes?: number };
type SectionWithResource = { sectionKey: string; sourceOrdinal: number; legacyDisplayLabel: string; heading: string; resource: Locator };

function sectionResourceLinks(sections: SectionWithResource[]): ResourceLink[] {
  return sections.slice(0, CLASSIC_TEXT_LIMITS.nativeDirectoryLinks).map(section => resourceLink(
    section.resource,
    section.heading || section.legacyDisplayLabel || `Section ${section.sourceOrdinal}`,
    'Exact locally hosted historical-document section.',
  ));
}

function searchResourceLinks(hits: Array<{ section: SectionWithResource }>): ResourceLink[] {
  return hits.map(hit => resourceLink(
    hit.section.resource,
    hit.section.heading || hit.section.legacyDisplayLabel || `Section ${hit.section.sourceOrdinal}`,
    'Exact local section selected by classic-text discovery.',
  ));
}

function resourceLink(locator: Locator, title: string, description: string): ResourceLink {
  // The declared MCP SDK exposes standard Resource.size. Retain it at runtime
  // even if a stale local SDK type definition omits the optional field.
  return {
    type: 'resource_link',
    uri: locator.uri,
    name: locator.uri.replace('theologai://documents/', 'classic-text/'),
    title,
    description,
    mimeType: 'text/markdown',
    ...(locator.resourceSizeBytes === undefined ? {} : { size: locator.resourceSizeBytes }),
    ...(locator.resourceSizeBytes === undefined
      ? {}
      : { _meta: { 'theologai/resourceSizeBytes': locator.resourceSizeBytes } }),
    annotations: { audience: ['assistant'] },
  } as ResourceLink & { size?: number };
}

function validateMode(params: Record<string, unknown>): void {
  const keys = Object.keys(params);
  const allowed = new Set(['work', 'query', 'listWorks', 'browseSections', 'cursor']);
  const unknown = keys.find(key => !allowed.has(key));
  if (unknown) {
    throw new ValidationError(unknown, `Unknown argument "${unknown}". Choose one of the advertised classic-text modes.`);
  }

  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(params, key);
  if (keys.length === 0) {
    throw new ValidationError('mode', 'Choose a classic-text lookup mode.');
  }

  if (has('listWorks')) {
    if (params.listWorks !== true || keys.length !== 1) {
      throw new ValidationError('listWorks', 'listWorks must be true and cannot be combined with another mode.');
    }
    return;
  }

  if (has('query')) {
    if (typeof params.query !== 'string' || params.query.trim().length < 1 || params.query.length > 500) {
      throw new ValidationError('query', 'query must be a non-empty string of no more than 500 characters.');
    }
    if (keys.length !== 1) {
      throw new ValidationError('mode', 'query is the local-search mode and cannot be combined with work, listWorks, or browseSections.');
    }
    return;
  }

  if (has('browseSections')) {
    if (params.browseSections !== true || typeof params.work !== 'string' || params.work.trim().length < 1
      || !has('work') || keys.length < 2 || keys.length > 3
      || (has('cursor') && (typeof params.cursor !== 'string' || !/^[A-Za-z0-9_-]{1,2048}$/.test(params.cursor)))) {
      throw new ValidationError('browseSections', 'browseSections=true requires a local work identifier and optional opaque cursor only.');
    }
    return;
  }

  if (!has('work') || typeof params.work !== 'string' || params.work.trim().length < 1 || params.work.length > 256) {
    throw new ValidationError('work', 'work must be a non-empty named local document slug or title.');
  }
}
