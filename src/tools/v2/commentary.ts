/**
 * commentary_lookup tool handler (v2).
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { CommentaryService } from '../../services/commentary/CommentaryService.js';
import { formatCommentaryResponse } from '../../formatters/commentaryFormatter.js';
import { handleToolError } from '../../kernel/errors.js';

export function createCommentaryHandler(service: CommentaryService): ToolHandler {
  return {
    name: 'commentary_lookup',
    description: 'Look up Bible commentary for one verse or a full chapter. Verse ranges are not supported. Exact-verse (scalar) coverage varies by commentary provider: an exact verse is returned only when its identity is trustworthy; otherwise request the full chapter or another commentator. Chapter results remain chapter-level commentary, not exact-verse commentary. 6 commentators: Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch (OT only), Tyndale.',
    inputSchema: {
      type: 'object',
      properties: {
        reference: { type: 'string', minLength: 1, maxLength: 100, description: 'One Bible verse or full chapter (e.g., "John 3:16" or "John 3"); verse ranges are not supported.' },
        commentator: {
          type: 'string',
          enum: ['Matthew Henry', 'Jamieson-Fausset-Brown', 'Adam Clarke', 'John Gill', 'Keil-Delitzsch', 'Tyndale'],
          default: 'Matthew Henry',
        },
        maxLength: { type: 'integer', minimum: 1, maximum: 100000, description: 'Maximum total formatted Markdown response length in Unicode characters. Very small limits can omit citation text.' },
      },
      required: ['reference'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        const result = await service.lookup({
          reference: params.reference as string,
          commentator: params.commentator as string,
          maxLength: params.maxLength as number,
        });
        return {
          content: [{
            type: 'text',
            text: formatCommentaryResponse(result, params.maxLength as number | undefined),
          }],
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}
