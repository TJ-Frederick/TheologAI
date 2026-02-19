/**
 * original_language_lookup tool handler (v2).
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { StrongsService } from '../../services/languages/StrongsService.js';
import { formatStrongsResult } from '../../formatters/languagesFormatter.js';
import { handleToolError } from '../../kernel/errors.js';

export function createStrongsLookupHandler(service: StrongsService): ToolHandler {
  return {
    name: 'original_language_lookup',
    description: "Look up Greek/Hebrew words by Strong's number. Returns lemma, definition, transliteration, and extended data from STEPBible lexicons.",
    inputSchema: {
      type: 'object',
      properties: {
        strongs_number: {
          type: 'string',
          description: "Strong's number (e.g., G25 for Greek agapaō, H430 for Hebrew Elohim)",
          pattern: '^[GHgh]\\d+[a-z]?$',
        },
        detail_level: { type: 'string', enum: ['simple', 'detailed'], default: 'simple' },
        include_extended: { type: 'boolean', default: false, description: 'Include STEPBible extended data' },
      },
      required: ['strongs_number'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        const result = service.lookup(
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
