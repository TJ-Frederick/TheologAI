/**
 * bible_lookup tool handler (v2).
 * Thin: schema → validate → service → format.
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { BibleService } from '../../services/bible/BibleService.js';
import { formatBibleResponse, formatMultiBibleResponse } from '../../formatters/bibleFormatter.js';
import { handleToolError } from '../../kernel/errors.js';
import { bibleLookupOutputSchema } from '../../mcp/schemas/bibleLookup.js';
import { presentBibleLookupStructured } from '../../presenters/bibleStructured.js';

export function createBibleLookupHandler(bibleService: BibleService): ToolHandler {
  return {
    name: 'bible_lookup',
    description: 'Look up Bible verses by reference. Supports 8 translations: ESV, NET, KJV, WEB, BSB, ASV, YLT, DBY. Pass a single translation or an array to compare.',
    inputSchema: {
      type: 'object',
      properties: {
        reference: { type: 'string', minLength: 1, maxLength: 100, description: 'Bible verse reference (e.g., "John 3:16", "Genesis 1:1-3")' },
        translation: {
          oneOf: [
            { type: 'string', enum: ['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY'] },
            { type: 'array', minItems: 1, maxItems: 8, uniqueItems: true, items: { type: 'string', enum: ['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY'] } },
          ],
          default: 'ESV',
          description: 'Translation(s). Single: "ESV". Compare: ["ESV","KJV","WEB"].',
        },
        includeFootnotes: { type: 'boolean', default: false, description: 'Include footnotes and translation notes' },
      },
      required: ['reference'],
      additionalProperties: false,
    },
    outputSchema: bibleLookupOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        const translations = resolveTranslations(params.translation);

        if (translations.length === 1) {
          const result = await bibleService.lookup({
            reference: params.reference as string,
            translation: translations[0],
            includeFootnotes: params.includeFootnotes as boolean,
          });
          return {
            content: [{ type: 'text', text: formatBibleResponse(result) }],
            structuredContent: presentBibleLookupStructured(
              result,
              params.reference as string,
              translations,
            ),
          };
        }

        const results = await bibleService.lookupMultiple(params.reference as string, translations);
        return {
          content: [{ type: 'text', text: formatMultiBibleResponse(results) }],
          structuredContent: presentBibleLookupStructured(
            results,
            params.reference as string,
            translations,
          ),
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}

function resolveTranslations(input: unknown): string[] {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch { /* fall through */ }
    }
    return [trimmed];
  }
  return ['ESV'];
}
