/**
 * classic_text_lookup tool handler (v2).
 *
 * Unified access to local historical documents + CCEL classic texts.
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { HistoricalDocumentService } from '../../services/historical/HistoricalDocumentService.js';
import type { CcelService } from '../../services/commentary/CcelService.js';
import { formatDocumentList, formatDocumentSections, formatSearchResults } from '../../formatters/historicalFormatter.js';
import { handleToolError } from '../../kernel/errors.js';

export function createClassicTextsHandler(
  historicalService: HistoricalDocumentService,
  ccelService: CcelService,
): ToolHandler {
  return {
    name: 'classic_text_lookup',
    description: 'Look up historical Christian documents (creeds, confessions, catechisms) and CCEL classic texts. Searches local documents first, then CCEL.',
    inputSchema: {
      type: 'object',
      properties: {
        work: { type: 'string', description: 'Document ID or CCEL work path (e.g., "nicene-creed", "calvin/institutes")' },
        query: { type: 'string', description: 'Search query across all documents' },
        listWorks: { type: 'boolean', default: false, description: 'List all available documents' },
        browseSections: { type: 'boolean', default: false, description: 'Show all sections of a document' },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        // List works
        if (params.listWorks) {
          const docs = historicalService.listDocuments();
          return { content: [{ type: 'text', text: formatDocumentList(docs) }] };
        }

        // Browse a specific document
        if (params.work && params.browseSections) {
          const doc = historicalService.getDocument(params.work as string);
          const sections = historicalService.getSections(doc.id);
          return { content: [{ type: 'text', text: formatDocumentSections(doc, sections) }] };
        }

        // Look up a specific local document
        if (params.work && !params.query) {
          const doc = historicalService.findDocument(params.work as string);
          if (doc) {
            const sections = historicalService.getSections(doc.id);
            return { content: [{ type: 'text', text: formatDocumentSections(doc, sections) }] };
          }

          // Try CCEL
          const result = await ccelService.getWorkSection({ work: params.work as string });
          return { content: [{ type: 'text', text: `**${result.title}**\n\n${result.content}\n\n*Source: ${result.source}*` }] };
        }

        // Search by query
        if (params.query) {
          // Search local docs first
          const localResults = historicalService.search(params.query as string);
          if (localResults.length > 0) {
            return { content: [{ type: 'text', text: formatSearchResults(params.query as string, localResults) }] };
          }

          // If work specified, try CCEL with query
          if (params.work) {
            const result = await ccelService.getWorkSection({
              work: params.work as string,
              query: params.query as string,
            });
            return { content: [{ type: 'text', text: `**${result.title}**\n\n${result.content}\n\n*Source: ${result.source}*` }] };
          }

          return { content: [{ type: 'text', text: `No results found for "${params.query}".` }] };
        }

        return { content: [{ type: 'text', text: 'Please provide a work ID, query, or set listWorks=true.' }] };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}
