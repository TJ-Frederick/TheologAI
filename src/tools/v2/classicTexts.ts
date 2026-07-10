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
    description: 'Search and browse the local creed, confession, and catechism collection. If a named work is not local, retrieve that specific CCEL work section when available; catalog-wide CCEL search is not supported.',
    inputSchema: {
      type: 'object',
      properties: {
        work: { type: 'string', minLength: 1, maxLength: 256, description: 'Document ID or CCEL work path (e.g., "nicene-creed", "calvin/institutes")' },
        section: { type: 'string', minLength: 1, maxLength: 256, description: 'Exact CCEL section identifier for bounded named-section retrieval' },
        query: { type: 'string', minLength: 1, maxLength: 500, description: 'Search query across all documents' },
        listWorks: { type: 'boolean', description: 'Set true to list locally indexed historical documents' },
        browseSections: { type: 'boolean', description: 'Set true with work to show all sections of a local document' },
      },
      oneOf: [
        { required: ['listWorks'], properties: { listWorks: { const: true } }, not: { anyOf: [{ required: ['work'] }, { required: ['section'] }, { required: ['query'] }, { required: ['browseSections'] }] } },
        { required: ['query'], not: { anyOf: [{ required: ['work'] }, { required: ['section'] }, { required: ['listWorks'] }, { required: ['browseSections'] }] } },
        { required: ['work', 'browseSections'], properties: { browseSections: { const: true } }, not: { anyOf: [{ required: ['section'] }, { required: ['query'] }, { required: ['listWorks'] }] } },
        { required: ['work'], not: { anyOf: [{ required: ['query'] }, { required: ['listWorks'] }, { required: ['browseSections'] }] } },
      ],
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
  if (keys.length === 0) {
    throw new ValidationError('mode', 'Choose a classic-text lookup mode.');
  }
  if (params.listWorks === true && keys.some(key => key !== 'listWorks')) {
    throw new ValidationError('mode', 'listWorks cannot be combined with another mode.');
  }
  if (params.query !== undefined && keys.some(key => key !== 'query')) {
    throw new ValidationError('mode', 'Local document search accepts only query; CCEL retrieval requires an explicit work and optional section.');
  }
  if (params.browseSections !== undefined && (params.browseSections !== true || typeof params.work !== 'string' || keys.some(key => !['work', 'browseSections'].includes(key)))) {
    throw new ValidationError('browseSections', 'browseSections=true requires only a local work identifier.');
  }
  if (params.section !== undefined && typeof params.work !== 'string') {
    throw new ValidationError('section', 'section requires a named CCEL work.');
  }
}

function formatCcelResult(result: Awaited<ReturnType<CcelService['getWorkSection']>>): string {
  return `**${result.title}**\n\n${result.content}\n\n*Source: [${result.source}](${result.url})*`;
}
