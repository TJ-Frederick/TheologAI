/**
 * original_language_lookup tool handler (v2).
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { StrongsService } from '../../services/languages/StrongsService.js';
import { formatStrongsResult, formatStrongsSearchResults } from '../../formatters/languagesFormatter.js';
import { handleToolError } from '../../kernel/errors.js';

export function createStrongsLookupHandler(service: StrongsService): ToolHandler {
  return {
    name: 'original_language_lookup',
    description: "Look up an exact Strong's number or search Greek/Hebrew lemmas, transliterations, and definitions. Exact lookup can include extended STEPBible lexicon data.",
    inputSchema: {
      type: 'object',
      properties: {
        strongs_number: {
          type: 'string',
          minLength: 2,
          maxLength: 16,
          description: "Strong's number (e.g., G25 for Greek agapaō, H430 for Hebrew Elohim)",
          pattern: '^[GHgh]\\d+[a-z]?$',
        },
        detail_level: { type: 'string', enum: ['simple', 'detailed'], default: 'simple' },
        include_extended: { type: 'boolean', default: false, description: 'Include STEPBible extended data' },
        query: {
          type: 'string',
          minLength: 2,
          maxLength: 100,
          description: 'Bounded search across lemma, transliteration, and definition (e.g. love, agape)',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          default: 10,
          description: 'Maximum search results',
        },
      },
      oneOf: [
        {
          required: ['strongs_number'],
          not: { anyOf: [{ required: ['query'] }, { required: ['limit'] }] },
        },
        {
          required: ['query'],
          not: {
            anyOf: [
              { required: ['strongs_number'] },
              { required: ['detail_level'] },
              { required: ['include_extended'] },
            ],
          },
        },
      ],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        if (typeof params.query === 'string') {
          const limit = typeof params.limit === 'number' ? params.limit : 10;
          const results = await service.search(params.query, limit);
          return { content: [{ type: 'text', text: formatStrongsSearchResults(params.query, results) }] };
        }

        const result = await service.lookup(
          params.strongs_number as string,
          params.include_extended as boolean,
        );
        const text = formatStrongsResult(result, params.detail_level as string);
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}
