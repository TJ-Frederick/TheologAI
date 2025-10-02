import { ToolHandler, BibleLookupParams } from '../types/index.js';
import { BibleService } from '../services/bibleService.js';
import { formatBibleResponse, formatToolResponse } from '../utils/formatter.js';
import { handleToolError } from '../utils/errors.js';

const bibleService = new BibleService();

export const bibleLookupHandler: ToolHandler = {
  name: 'bible_lookup',
  description: 'Look up Bible verses by reference. Supports multiple translations including ESV, NET, KJV, WEB, BSB, ASV, YLT, and DBY. Can optionally include footnotes with translation notes and textual variants.',
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
        enum: ['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY'],
        description: 'Bible translation. Options: ESV (English Standard Version), NET (New English Translation), KJV (King James Version), WEB (World English Bible), BSB (Berean Standard Bible), ASV (American Standard Version), YLT (Young\'s Literal Translation), DBY (Darby Translation). Default: ESV'
      },
      includeCrossRefs: {
        type: 'boolean',
        default: false,
        description: 'Include cross-references to related verses (currently not implemented)'
      },
      includeFootnotes: {
        type: 'boolean',
        default: false,
        description: 'Include footnotes with translation notes, textual variants, and alternative readings (available for most translations)'
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