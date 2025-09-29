import { ToolHandler, CommentaryLookupParams } from '../types/index.js';
import { CommentaryService } from '../services/commentaryService.js';
import { formatCommentaryResponse, formatToolResponse } from '../utils/formatter.js';
import { handleToolError } from '../utils/errors.js';

const commentaryService = new CommentaryService();

export const commentaryLookupHandler: ToolHandler = {
  name: 'commentary_lookup',
  description: 'Get commentary and translation notes on Bible verses',
  inputSchema: {
    type: 'object',
    properties: {
      reference: {
        type: 'string',
        description: 'Bible verse reference (e.g., "John 3:16", "Genesis 1:1")'
      },
      commentator: {
        type: 'string',
        description: 'Preferred commentator (optional, defaults to NET Bible Notes)'
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