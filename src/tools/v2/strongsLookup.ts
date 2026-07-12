/**
 * original_language_lookup tool handler (v2).
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { StrongsService } from '../../services/languages/StrongsService.js';
import { formatStrongsResult, formatStrongsSearchResults } from '../../formatters/languagesFormatter.js';
import { handleToolError, ValidationError } from '../../kernel/errors.js';
import { originalLanguageOutputSchema } from '../../mcp/schemas/originalLanguage.js';
import {
  presentOriginalLanguageEntry,
  presentOriginalLanguageSearch,
} from '../../presenters/originalLanguageStructured.js';
import { parseStrongsIdentity } from '../../kernel/strongs.js';

export function createStrongsLookupHandler(service: StrongsService): ToolHandler {
  return {
    name: 'original_language_lookup',
    description: "Look up an exact Strong's number or search Greek/Hebrew lemmas, transliterations, and definitions. Use exactly one mode: strongs_number for an exact lookup, or query for a search. Exact lookup can include extended STEPBible lexicon data.",
    inputSchema: {
      type: 'object',
      description: 'Flat mode fields are intentionally shown together for client discoverability; choose exactly one mode, with cross-field validity enforced strictly by the handler.',
      minProperties: 1,
      properties: {
        strongs_number: {
          type: 'string',
          minLength: 2,
          maxLength: 6,
          description: "Strong's number (e.g., G25 for Greek agapaō, H430 for Hebrew Elohim)",
          pattern: '^[GHgh]0*[1-9]\\d*[A-Za-z]?$',
        },
        detail_level: { type: 'string', enum: ['simple', 'detailed'], description: 'Exact strongs_number lookups only; choose the amount of entry detail. Defaults to simple when omitted.' },
        include_extended: { type: 'boolean', description: 'Exact strongs_number lookups only; include STEPBible extended data. Defaults to false when omitted.' },
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
          description: 'Search query only; maximum number of matching entries to return. Defaults to 10 when omitted.',
        },
      },
      additionalProperties: false,
    },
    outputSchema: originalLanguageOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        validateLookupMode(params);

        if (Object.prototype.hasOwnProperty.call(params, 'query')) {
          const limit = typeof params.limit === 'number' ? params.limit : 10;
          const query = params.query as string;
          const results = await service.search(query, limit);
          return {
            content: [{ type: 'text', text: formatStrongsSearchResults(query, results) }],
            structuredContent: presentOriginalLanguageSearch(query, results),
          };
        }

        const result = await service.lookup(
          params.strongs_number as string,
          params.include_extended === true,
        );
        const text = formatStrongsResult(result, params.detail_level as string);
        return {
          content: [{ type: 'text', text }],
          structuredContent: presentOriginalLanguageEntry(
            result,
            params.detail_level === 'detailed' ? 'detailed' : 'simple',
          ),
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}

function validateLookupMode(params: Record<string, unknown>): void {
  const keys = Object.keys(params);
  const allowed = new Set(['strongs_number', 'detail_level', 'include_extended', 'query', 'limit']);
  const unknown = keys.find(key => !allowed.has(key));
  if (unknown) {
    throw new ValidationError(unknown, `Unknown argument "${unknown}". Use strongs_number for an exact lookup or query for a search.`);
  }

  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(params, key);
  const hasStrong = has('strongs_number');
  const hasQuery = has('query');

  if (hasStrong === hasQuery) {
    throw new ValidationError('mode', 'Provide exactly one of strongs_number (exact lookup) or query (search); do not provide both.');
  }

  if (hasQuery) {
    if (typeof params.query !== 'string' || params.query.trim().length < 2 || params.query.length > 100) {
      throw new ValidationError('query', 'query must be between 2 and 100 characters.');
    }
    if (has('detail_level') || has('include_extended')) {
      throw new ValidationError('mode', 'detail_level and include_extended apply only to exact strongs_number lookups; remove them when searching.');
    }
    if (has('limit') && (!Number.isInteger(params.limit) || (params.limit as number) < 1 || (params.limit as number) > 20)) {
      throw new ValidationError('limit', 'limit must be an integer between 1 and 20.');
    }
    return;
  }

  if (typeof params.strongs_number !== 'string'
    || params.strongs_number.length < 2
    || params.strongs_number.length > 6
    || params.strongs_number !== params.strongs_number.trim()
    || !parseStrongsIdentity(params.strongs_number)) {
    throw new ValidationError('strongs_number', "strongs_number must match a Strong's number such as G25 or H430.");
  }
  if (has('limit')) {
    throw new ValidationError('mode', 'limit is only valid with query search; remove it for an exact strongs_number lookup.');
  }
  if (has('detail_level') && params.detail_level !== 'simple' && params.detail_level !== 'detailed') {
    throw new ValidationError('detail_level', 'detail_level must be simple or detailed.');
  }
  if (has('include_extended') && typeof params.include_extended !== 'boolean') {
    throw new ValidationError('include_extended', 'include_extended must be true or false.');
  }
}
