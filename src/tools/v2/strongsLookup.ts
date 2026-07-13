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
import { parseStrongsIdentity, STRONGS_IDENTITY_PATTERN } from '../../kernel/strongs.js';
import type { CanonicalStrongsIdentity } from '../../kernel/strongs.js';
import type { CorpusUsageLevel } from '../../kernel/types.js';
import { MORPHOLOGY_USAGE_CURSOR_MAX_LENGTH } from '../../kernel/morphologyUsageCursor.js';

export function createStrongsLookupHandler(service: StrongsService): ToolHandler {
  return {
    name: 'original_language_lookup',
    description: "Look up an exact Strong's number or search Greek/Hebrew lemmas, transliterations, and definitions. Use exactly one mode: strongs_number for an exact lookup, or query for a search. Exact lookup can opt into extended STEPBible lexicon data or exact corrected-corpus usage evidence.",
    inputSchema: {
      type: 'object',
      description: 'Flat mode fields are intentionally shown together for client discoverability; choose exactly one mode, with cross-field validity enforced strictly by the handler.',
      minProperties: 1,
      properties: {
        strongs_number: {
          type: 'string',
          minLength: 2,
          maxLength: 7,
          description: "Strong's number (e.g., G25 for Greek agapaō, H430 for Hebrew Elohim)",
          pattern: STRONGS_IDENTITY_PATTERN,
        },
        detail_level: { type: 'string', enum: ['simple', 'detailed'], description: 'Exact strongs_number lookups only; choose the amount of entry detail. Defaults to simple when omitted.' },
        include_extended: { type: 'boolean', description: 'Exact strongs_number lookups only; include STEPBible extended data. Defaults to false when omitted.' },
        usage_level: { type: 'string', enum: ['overview', 'study', 'technical'], description: 'Exact strongs_number lookups only; opt into counted morphology-corpus usage. overview returns totals and complete canonical-book distribution only; study adds the top 10 exact source variants and a default 8-token page; technical adds the top 25 variants and a default 20-token page. Omit to preserve the legacy response.' },
        occurrence_limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Study/technical usage only; bounded raw-token page size. Maximum 12 for study or 25 for technical.' },
        occurrence_cursor: { type: 'string', minLength: 1, maxLength: MORPHOLOGY_USAGE_CURSOR_MAX_LENGTH, pattern: '^[A-Za-z0-9_-]+$', description: 'Study/technical usage only; opaque cursor returned by the preceding page for this exact identity and corpus.' },
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
        const exactIdentity = validateLookupMode(params);

        if (Object.prototype.hasOwnProperty.call(params, 'query')) {
          const limit = typeof params.limit === 'number' ? params.limit : 10;
          const query = params.query as string;
          const results = await service.search(query, limit);
          return {
            content: [{ type: 'text', text: formatStrongsSearchResults(query, results) }],
            structuredContent: presentOriginalLanguageSearch(query, results),
          };
        }

        const usageLevel = params.usage_level as CorpusUsageLevel | undefined;
        const [result, corpusUsage] = await Promise.all([
          service.lookup(exactIdentity!.publicId, params.include_extended === true),
          usageLevel
            ? service.getCorpusUsage(
              exactIdentity!.publicId,
              usageLevel,
              params.occurrence_limit as number | undefined,
              params.occurrence_cursor as string | undefined,
            )
            : undefined,
        ]);
        const text = formatStrongsResult(result, params.detail_level as string, corpusUsage);
        return {
          content: [{ type: 'text', text }],
          structuredContent: presentOriginalLanguageEntry(
            result,
            params.detail_level === 'detailed' ? 'detailed' : 'simple',
            corpusUsage,
          ),
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}

function validateLookupMode(params: Record<string, unknown>): CanonicalStrongsIdentity | undefined {
  const keys = Object.keys(params);
  const allowed = new Set([
    'strongs_number', 'detail_level', 'include_extended', 'usage_level', 'occurrence_limit',
    'occurrence_cursor', 'query', 'limit',
  ]);
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
    if (has('detail_level') || has('include_extended') || has('usage_level') || has('occurrence_limit') || has('occurrence_cursor')) {
      throw new ValidationError('mode', 'detail_level, include_extended, and corpus usage arguments apply only to exact strongs_number lookups; remove them when searching.');
    }
    if (has('limit') && (!Number.isInteger(params.limit) || (params.limit as number) < 1 || (params.limit as number) > 20)) {
      throw new ValidationError('limit', 'limit must be an integer between 1 and 20.');
    }
    return undefined;
  }

  const identity = typeof params.strongs_number === 'string'
    ? parseStrongsIdentity(params.strongs_number)
    : undefined;
  if (typeof params.strongs_number !== 'string'
    || params.strongs_number.length < 2
    || params.strongs_number.length > 7
    || params.strongs_number !== params.strongs_number.trim()
    || !identity) {
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
  if (has('usage_level') && !['overview', 'study', 'technical'].includes(params.usage_level as string)) {
    throw new ValidationError('usage_level', 'usage_level must be overview, study, or technical.');
  }
  const hasOccurrenceArguments = has('occurrence_limit') || has('occurrence_cursor');
  if (hasOccurrenceArguments && params.usage_level !== 'study' && params.usage_level !== 'technical') {
    throw new ValidationError('usage_level', 'occurrence_limit and occurrence_cursor require usage_level study or technical.');
  }
  const occurrenceMaximum = params.usage_level === 'study' ? 12 : 25;
  if (has('occurrence_limit') && (!Number.isInteger(params.occurrence_limit)
    || (params.occurrence_limit as number) < 1 || (params.occurrence_limit as number) > occurrenceMaximum)) {
    throw new ValidationError('occurrence_limit', `occurrence_limit must be an integer between 1 and ${occurrenceMaximum} for ${String(params.usage_level)} usage.`);
  }
  if (has('occurrence_cursor') && (typeof params.occurrence_cursor !== 'string'
    || params.occurrence_cursor.length < 1
    || params.occurrence_cursor.length > MORPHOLOGY_USAGE_CURSOR_MAX_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(params.occurrence_cursor))) {
    throw new ValidationError('occurrence_cursor', 'occurrence_cursor is malformed or oversized.');
  }
  return identity;
}
