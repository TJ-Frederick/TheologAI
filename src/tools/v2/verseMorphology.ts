/**
 * bible_verse_morphology tool handler (v2).
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { MorphologyService } from '../../services/languages/MorphologyService.js';
import { formatMorphologyResult } from '../../formatters/languagesFormatter.js';
import { handleToolError } from '../../kernel/errors.js';
import { verseMorphologyOutputSchema } from '../../mcp/schemas/verseMorphology.js';
import { presentVerseMorphologyStructured } from '../../presenters/verseMorphologyStructured.js';

export function createVerseMorphologyHandler(service: MorphologyService): ToolHandler {
  return {
    name: 'bible_verse_morphology',
    description: 'Get word-by-word grammatical analysis (Greek/Hebrew) for one Bible verse. Ranges are not supported. Shows text, lemma, Strong\'s number, morphology code, and English gloss.',
    inputSchema: {
      type: 'object',
      properties: {
        reference: { type: 'string', minLength: 1, maxLength: 100, description: 'One Bible verse reference (e.g., "John 1:1", "Genesis 1:1"); verse ranges are not supported' },
        expand_morphology: { type: 'boolean', default: false, description: 'Expand morphology codes to full descriptions' },
      },
      required: ['reference'],
      additionalProperties: false,
    },
    outputSchema: verseMorphologyOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        const result = await service.getVerseMorphology(
          params.reference as string,
          params.expand_morphology as boolean,
        );
        return {
          content: [{ type: 'text', text: formatMorphologyResult(result) }],
          structuredContent: presentVerseMorphologyStructured(result),
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}
