import type { ToolHandler } from '../../kernel/types.js';
import { handleToolError } from '../../kernel/errors.js';
import type { PrimarySourceSearchService } from '../../services/historical/PrimarySourceSearchService.js';
import { formatPrimarySourceSearch } from '../../formatters/primarySourceFormatter.js';

export function createPrimarySourceSearchHandler(service: Pick<PrimarySourceSearchService, 'search'>): ToolHandler {
  return {
    name: 'primary_source_search',
    description: 'Execute an explicit, bounded query plan against the local historical index and optional live CCEL discovery. Returns snippets and exact locators only; fetch selected exact sections before quotation. The server does not expand queries, choose evidence, or synthesize conclusions.',
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
                type: 'array', minItems: 1, maxItems: 2, uniqueItems: true,
                items: { type: 'string', enum: ['local', 'ccel'] },
              },
              match: { type: 'string', enum: ['all_terms', 'phrase'], default: 'all_terms' },
              author: { type: 'string', minLength: 1, maxLength: 100 },
              work: { type: 'string', minLength: 1, maxLength: 160 },
              page: { type: 'integer', minimum: 1, maximum: 3, default: 1 },
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
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async params => {
      try {
        const result = await service.search(params);
        return {
          content: [{ type: 'text', text: formatPrimarySourceSearch(result) }],
          ...(result.planStatus === 'unavailable' ? { isError: true } : {}),
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}
