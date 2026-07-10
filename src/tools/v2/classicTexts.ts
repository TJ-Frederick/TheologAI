/**
 * classic_text_lookup tool handler (v2).
 *
 * Local historical-document search plus bounded retrieval of named CCEL works.
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { HistoricalDocumentService } from '../../services/historical/HistoricalDocumentService.js';
import type { CcelService } from '../../services/commentary/CcelService.js';
import { formatDocumentList, formatDocumentSections, formatSearchResults } from '../../formatters/historicalFormatter.js';
import { handleToolError, ValidationError } from '../../kernel/errors.js';

export function createClassicTextsHandler(
  historicalService: HistoricalDocumentService,
  ccelService: CcelService,
): ToolHandler {
  return {
    name: 'classic_text_lookup',
    description: 'Search and browse local historical documents, or retrieve one explicitly named CCEL work section. Use exactly one mode: listWorks, query, work (optionally with section), or work with browseSections=true. Catalog-wide CCEL search is not supported.',
    inputSchema: {
      type: 'object',
      description: 'Choose exactly one mode. The mode fields are intentionally shown together for clients that do not render conditional schemas; invalid combinations receive an actionable error from the handler.',
      properties: {
        work: { type: 'string', minLength: 1, maxLength: 256, description: 'Named local document or CCEL work path (e.g., "nicene-creed", "calvin/institutes"). Use alone for a work, or with section for a bounded CCEL section.' },
        section: { type: 'string', minLength: 1, maxLength: 256, description: 'Exact CCEL section identifier; valid only with work (e.g., "book-one").' },
        query: { type: 'string', minLength: 1, maxLength: 500, description: 'Search query across the local historical-document collection. Use alone.' },
        listWorks: { type: 'boolean', const: true, description: 'List locally indexed historical documents. Use alone and set true.' },
        browseSections: { type: 'boolean', const: true, description: 'List sections for a local work. Use with a work identifier and no section or query.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        validateMode(params);
        // List works
        if (params.listWorks) {
          const docs = await historicalService.listDocuments();
          return { content: [{ type: 'text', text: formatDocumentList(docs) }] };
        }

        // Browse a specific document
        if (params.work && params.browseSections) {
          const doc = await historicalService.getDocument(params.work as string);
          const sections = await historicalService.getSections(doc.id);
          return { content: [{ type: 'text', text: formatDocumentSections(doc, sections) }] };
        }

        // Look up a specific local document
        if (params.work && !params.query) {
          const doc = params.section
            ? undefined
            : await historicalService.findDocument(params.work as string);
          if (doc) {
            const sections = await historicalService.getSections(doc.id);
            return { content: [{ type: 'text', text: formatDocumentSections(doc, sections) }] };
          }

          // Try CCEL
          const result = await ccelService.getWorkSection({
            work: params.work as string,
            ...(params.section ? { section: params.section as string } : {}),
          });
          return { content: [{ type: 'text', text: formatCcelResult(result) }] };
        }

        // Search by query
        if (params.query) {
          // Search local docs first
          const localResults = await historicalService.search(params.query as string);
          if (localResults.length > 0) {
            return { content: [{ type: 'text', text: formatSearchResults(params.query as string, localResults) }] };
          }

          return { content: [{ type: 'text', text: `No results found for "${params.query}".` }] };
        }

        throw new ValidationError('mode', 'Choose exactly one mode: list local works, search local documents, browse a local work, or retrieve a named work/section.');
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}

function validateMode(params: Record<string, unknown>): void {
  const keys = Object.keys(params);
  const allowed = new Set(['work', 'section', 'query', 'listWorks', 'browseSections']);
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
      throw new ValidationError('mode', 'query is the local-search mode and cannot be combined with work, section, listWorks, or browseSections.');
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
    throw new ValidationError('work', 'work must be a non-empty named local document or CCEL work path.');
  }
  if (has('section') && (typeof params.section !== 'string' || params.section.trim().length < 1 || params.section.length > 256)) {
    throw new ValidationError('section', 'section must be a non-empty CCEL section identifier no longer than 256 characters.');
  }
}

function formatCcelResult(result: Awaited<ReturnType<CcelService['getWorkSection']>>): string {
  return `**${result.title}**\n\n${result.content}\n\n*Source: [${result.source}](${result.url})*`;
}
