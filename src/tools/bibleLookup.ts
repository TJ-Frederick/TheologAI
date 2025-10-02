import { ToolHandler, BibleLookupParams } from '../types/index.js';
import { BibleService } from '../services/bibleService.js';
import { formatBibleResponse, formatToolResponse } from '../utils/formatter.js';
import { handleToolError } from '../utils/errors.js';

const bibleService = new BibleService();

export const bibleLookupHandler: ToolHandler = {
  name: 'bible_lookup',
  description: 'Look up Bible verses by reference. Returns clean Scripture text without footnotes or notes. For study notes, use commentary_lookup instead.',
  inputSchema: {
    type: 'object',
    properties: {
      reference: {
        type: 'string',
        description: 'Bible verse reference (e.g., "John 3:16", "Genesis 1:1-3", "Romans 8:28-30")'
      },
      translation: {
        type: 'string',
        default: 'ESV',
        enum: ['ESV', 'NET'],
        description: 'Bible translation (ESV = English Standard Version, NET = New English Translation). Default: ESV'
      },
      includeCrossRefs: {
        type: 'boolean',
        default: false,
        description: 'Include cross-references to related verses (currently not implemented)'
      }
    },
    required: ['reference']
  },
  handler: async (params: BibleLookupParams) => {
    try {
      const result = await bibleService.lookup(params);
      const formattedResponse = formatBibleResponse(result);
      return formatToolResponse(formattedResponse);
    } catch (error) {
      return handleToolError(error as Error);
    }
  }
};