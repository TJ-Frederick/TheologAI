import { ToolHandler, CommentaryLookupParams } from '../types/index.js';
import { CommentaryService } from '../services/commentaryService.js';
import { formatCommentaryResponse, formatToolResponse } from '../utils/formatter.js';
import { handleToolError } from '../utils/errors.js';

const commentaryService = new CommentaryService();

export const commentaryLookupHandler: ToolHandler = {
  name: 'commentary_lookup',
  description: 'Get theological commentary and exposition on Bible verses from public domain sources via HelloAO Bible API. Returns verse-by-verse theological exposition and practical application from classic commentaries. Default: Matthew Henry (most comprehensive). Use this when the user asks for commentary, study help, exposition, or theological insight on a verse.',
  inputSchema: {
    type: 'object',
    properties: {
      reference: {
        type: 'string',
        description: 'Bible verse reference (e.g., "John 3:16", "Romans 8:28", "Psalm 23:1")'
      },
      commentator: {
        type: 'string',
        description: 'Preferred commentator. Options: "Matthew Henry" (default, comprehensive), "Jamieson-Fausset-Brown" (JFB, concise), "Adam Clarke" (detailed), "John Gill" (Baptist perspective), "Keil-Delitzsch" (OT only, scholarly), "Tyndale" (modern notes)',
        enum: ['Matthew Henry', 'Jamieson-Fausset-Brown', 'JFB', 'Adam Clarke', 'John Gill', 'Keil-Delitzsch', 'Tyndale', 'ESV']
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