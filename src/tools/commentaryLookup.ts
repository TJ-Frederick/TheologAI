import { ToolHandler, CommentaryLookupParams } from '../types/index.js';
import { CommentaryService } from '../services/commentaryService.js';
import { formatCommentaryResponse, formatToolResponse } from '../utils/formatter.js';
import { handleToolError } from '../utils/errors.js';

const commentaryService = new CommentaryService();

export const commentaryLookupHandler: ToolHandler = {
  name: 'commentary_lookup',
  description: 'Get theological commentary and exposition on Bible verses from public domain sources. Returns Matthew Henry\'s complete commentary (default), providing verse-by-verse theological exposition and practical application. Also available: Matthew Henry Concise and Jamieson-Fausset-Brown. Use this when the user asks for commentary, study help, exposition, or theological insight on a verse.',
  inputSchema: {
    type: 'object',
    properties: {
      reference: {
        type: 'string',
        description: 'Bible verse reference (e.g., "John 3:16", "Romans 8:28", "Psalm 23:1")'
      },
      commentator: {
        type: 'string',
        description: 'Preferred commentator. Options: "Matthew Henry" (default - most comprehensive), "Matthew Henry Concise" (shorter), "Jamieson-Fausset-Brown" (JFB), "ESV" (textual variants only)',
        enum: ['Matthew Henry', 'Matthew Henry Concise', 'Jamieson-Fausset-Brown', 'JFB', 'ESV']
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