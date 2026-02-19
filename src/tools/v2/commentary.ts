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
    description: 'Look up Bible commentary. 6 commentators: Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch (OT only), Tyndale.',
    inputSchema: {
      type: 'object',
      properties: {
        reference: { type: 'string', description: 'Bible reference (e.g., "John 3:16")' },
        commentator: {
          type: 'string',
          enum: ['Matthew Henry', 'Jamieson-Fausset-Brown', 'Adam Clarke', 'John Gill', 'Keil-Delitzsch', 'Tyndale'],
          default: 'Matthew Henry',
        },
        maxLength: { type: 'number', description: 'Max response length in characters' },
      },
      required: ['reference'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        const result = await service.lookup({
          reference: params.reference as string,
          commentator: params.commentator as string,
          maxLength: params.maxLength as number,
        });
        return { content: [{ type: 'text', text: formatCommentaryResponse(result) }] };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}
