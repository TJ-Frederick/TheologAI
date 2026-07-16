/**
 * classic_text_lookup tool handler (v2).
 *
 * Local historical-document search and browsing.
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { HistoricalDocumentService } from '../../services/historical/HistoricalDocumentService.js';
import {
  formatDocumentList,
  formatDocumentSectionIndex,
  formatDocumentSections,
  formatSearchResults,
} from '../../formatters/historicalFormatter.js';
import { handleToolError, ValidationError } from '../../kernel/errors.js';
import { classicTextsOutputSchema } from '../../mcp/schemas/classicTexts.js';
import {
  presentClassicTextCatalog,
  presentClassicTextDirectory,
  presentClassicTextSearch,
  presentClassicTextWork,
  validateClassicTextsOutputSemantics,
} from '../../presenters/classicTextsStructured.js';
import type { ResourceLink } from '@modelcontextprotocol/sdk/types.js';

export function createClassicTextsHandler(historicalService: HistoricalDocumentService): ToolHandler {
  return {
    name: 'classic_text_lookup',
    description: 'Search and browse the locally indexed historical-document collection. Search returns discovery-only snippets with canonical exact-section resource links; browseSections returns a compact section index; work alone preserves full-document lookup. Use exactly one mode: listWorks, query, work, or work with browseSections=true. Remote CCEL document bodies are not retrieved or republished.',
    inputSchema: {
      type: 'object',
      description: 'Flat mode fields are intentionally shown together for client discoverability; choose exactly one mode, with cross-field validity enforced strictly by the handler.',
      minProperties: 1,
      properties: {
        work: { type: 'string', minLength: 1, maxLength: 256, description: 'Named local document slug or title (e.g., "nicene-creed").' },
        query: { type: 'string', minLength: 1, maxLength: 500, description: 'Literal all-term search across the local historical-document collection. Use alone; returned snippets are discovery-only.' },
        listWorks: { type: 'boolean', const: true, description: 'List locally indexed historical documents. Use alone and set true.' },
        browseSections: { type: 'boolean', const: true, description: 'List a compact exact-section resource index for a local work. Use with a work identifier and no section or query.' },
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
          const presented = presentClassicTextCatalog(docs);
          return {
            content: [{ type: 'text', text: formatDocumentList(docs) }],
            structuredContent: presented,
          };
        }

        // Browse a specific document
        if (params.work && params.browseSections) {
          const doc = await historicalService.getDocument(params.work as string);
          const sections = await historicalService.getSections(doc.id);
          const presented = presentClassicTextDirectory({ document: doc, sections });
          return {
            content: [
              { type: 'text', text: formatDocumentSectionIndex(doc, sections) },
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
          const localResults = await historicalService.search(query, 11);
          const documents = localResults.length > 0 ? await historicalService.listDocuments() : [];
          const presented = presentClassicTextSearch(query, localResults, documents);
          if (localResults.length > 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: formatSearchResults(
                    query,
                    localResults,
                    documents,
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
type SectionWithResource = { sectionNumber: string; title: string; resource: Locator };

function sectionResourceLinks(sections: SectionWithResource[]): ResourceLink[] {
  return sections.slice(0, 32).map(section => resourceLink(
    section.resource,
    section.title || `Section ${section.sectionNumber}`,
    'Exact locally hosted historical-document section.',
  ));
}

function searchResourceLinks(hits: Array<{ section: SectionWithResource }>): ResourceLink[] {
  return hits.map(hit => resourceLink(
    hit.section.resource,
    hit.section.title || `Section ${hit.section.sectionNumber}`,
    'Exact local section selected by classic-text discovery.',
  ));
}

function resourceLink(locator: Locator, title: string, description: string): ResourceLink {
  return {
    type: 'resource_link',
    uri: locator.uri,
    name: locator.uri.replace('theologai://documents/', 'classic-text/'),
    title,
    description,
    mimeType: 'text/markdown',
    ...(locator.resourceSizeBytes === undefined ? {} : { size: locator.resourceSizeBytes }),
    annotations: { audience: ['assistant'] },
  };
}

function validateMode(params: Record<string, unknown>): void {
  const keys = Object.keys(params);
  const allowed = new Set(['work', 'query', 'listWorks', 'browseSections']);
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
    if (params.browseSections !== true || typeof params.work !== 'string' || params.work.trim().length < 1 || keys.length !== 2 || !has('work')) {
      throw new ValidationError('browseSections', 'browseSections=true requires only a non-empty local work identifier.');
    }
    return;
  }

  if (!has('work') || typeof params.work !== 'string' || params.work.trim().length < 1 || params.work.length > 256) {
    throw new ValidationError('work', 'work must be a non-empty named local document slug or title.');
  }
}
