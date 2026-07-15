/**
 * commentary_lookup tool handler (v2).
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { CommentaryService } from '../../services/commentary/CommentaryService.js';
import { formatCommentaryResponse } from '../../formatters/commentaryFormatter.js';
import { handleToolError } from '../../kernel/errors.js';
import { CANONICAL_COMMENTATORS } from '../../kernel/commentaryCatalog.js';
import { commentaryOutputSchema } from '../../mcp/schemas/commentary.js';
import { presentCommentaryStructured } from '../../presenters/commentaryStructured.js';

export function createCommentaryHandler(service: CommentaryService): ToolHandler {
  return {
    name: 'commentary_lookup',
    description: `Look up Bible commentary for one verse or a full chapter. Verse ranges are not supported. Exact-verse (scalar) coverage varies by commentary provider: an exact verse is returned only when its identity is trustworthy; otherwise request the full chapter or another commentator. Matthew Henry and Keil-Delitzsch are currently chapter-level because their numbered entries can span multiple verses. John Gill scalar lookup requires stronger exact-verse metadata: specifically a genuine verseNumber that its current feed normally does not supply, so use chapter lookup. Chapter results remain chapter-level commentary, not exact-verse commentary. ${CANONICAL_COMMENTATORS.length} commentators: ${CANONICAL_COMMENTATORS.join(', ')}; Keil-Delitzsch is Old Testament only.`,
    inputSchema: {
      type: 'object',
      properties: {
        reference: { type: 'string', minLength: 1, maxLength: 100, description: 'One Bible verse or full chapter (e.g., "John 3:16" or "John 3"); verse ranges are not supported.' },
        commentator: {
          type: 'string',
          enum: [...CANONICAL_COMMENTATORS],
          default: 'Matthew Henry',
        },
        maxLength: { type: 'integer', minimum: 1, maximum: 100000, description: 'Maximum total formatted Markdown response length in Unicode characters. Very small limits can omit citation text.' },
      },
      required: ['reference'],
      additionalProperties: false,
    },
    outputSchema: commentaryOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        const requestedReference = params.reference as string;
        const maxLength = params.maxLength as number | undefined;
        const result = await service.lookup({
          reference: requestedReference,
          commentator: params.commentator as string,
          maxLength,
        });
        return {
          content: [{
            type: 'text',
            text: formatCommentaryResponse(result.commentary, maxLength),
          }],
          structuredContent: presentCommentaryStructured(
            requestedReference,
            maxLength ?? null,
            result,
          ),
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}
