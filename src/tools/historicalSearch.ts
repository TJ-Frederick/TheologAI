import { ToolHandler, HistoricalSearchParams } from '../types/index.js';
import { LocalDataAdapter } from '../adapters/localData.js';
import { formatHistoricalResponse, formatToolResponse } from '../utils/formatter.js';
import { handleToolError } from '../utils/errors.js';

const localDataAdapter = new LocalDataAdapter();

export const historicalSearchHandler: ToolHandler = {
  name: 'historical_search',
  description: 'Search historical Christian documents like creeds, confessions, and catechisms',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search terms or topic (e.g., "scripture", "trinity", "salvation")'
      },
      document: {
        type: 'string',
        description: 'Specific document to search (optional)'
      },
      docType: {
        type: 'string',
        description: 'Type of document: "creed", "confession", or "catechism" (optional)'
      }
    },
    required: ['query']
  },
  handler: async (params: HistoricalSearchParams) => {
    try {
      const results = localDataAdapter.searchDocuments(
        params.query,
        params.document,
        params.docType
      );

      if (results.length === 0) {
        const availableDocs = localDataAdapter.listDocuments();
        const docList = (availableDocs && availableDocs.length > 0)
          ? availableDocs.join(', ')
          : 'None available (documents failed to load)';
        return formatToolResponse(
          `No results found for "${params.query}". Available documents: ${docList}`
        );
      }

      // Format multiple results
      const formattedResults = results
        .slice(0, 5) // Limit to first 5 results
        .map(result => formatHistoricalResponse(result))
        .join('\n\n---\n\n');

      const summary = results.length > 5
        ? `\n\n*Showing first 5 of ${results.length} results*`
        : '';

      return formatToolResponse(formattedResults + summary);
    } catch (error) {
      return handleToolError(error as Error);
    }
  }
};