import { ToolHandler, CommentaryLookupParams } from '../types/index.js';
import { CommentaryService } from '../services/commentaryService.js';
import { formatCommentaryResponse, formatToolResponse } from '../utils/formatter.js';
import { handleToolError } from '../utils/errors.js';

const commentaryService = new CommentaryService();

export const commentaryLookupHandler: ToolHandler = {
  name: 'commentary_lookup',
  description: 'Get translation notes and textual commentary on Bible verses. Returns ESV textual variants, translation alternatives, and manuscript notes. Use this when the user asks for study help, notes, or commentary on a verse.',
  inputSchema: {
    type: 'object',
    properties: {
      reference: {
        type: 'string',
        description: 'Bible verse reference (e.g., "John 3:16", "Romans 8:28", "Matthew 17:21")'
      },
      commentator: {
        type: 'string',
        description: 'Preferred commentator (optional, defaults to ESV Translation Committee)'
      },
      maxLength: {
        type: 'number',
        description: 'Maximum response length (optional)'
      }
    },
    required: ['reference']
  },
  handler: async (params: CommentaryLookupParams) => {
    try {
      const result = await commentaryService.lookup(params);
      const formattedResponse = formatCommentaryResponse(result);
      return formatToolResponse(formattedResponse);
    } catch (error) {
      return handleToolError(error as Error);
    }
  }
};