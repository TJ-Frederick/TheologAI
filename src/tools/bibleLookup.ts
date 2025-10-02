import { ToolHandler, BibleLookupParams } from '../types/index.js';
import { BibleService } from '../services/bibleService.js';
import { formatBibleResponse, formatMultiBibleResponse, formatToolResponse } from '../utils/formatter.js';
import { handleToolError } from '../utils/errors.js';

const bibleService = new BibleService();

export const bibleLookupHandler: ToolHandler = {
  name: 'bible_lookup',
  description: 'Look up Bible verses by reference. Supports single or multiple translations (ESV, NET, KJV, WEB, BSB, ASV, YLT, DBY). Pass a single translation string or an array of translations to compare multiple versions. Can optionally include footnotes with translation notes and textual variants. IMPORTANT: When multiple translations are requested, ALWAYS display the full returned text verbatim first so the user can see each translation. After showing the translations, you may optionally provide analysis or highlight differences if helpful.',
  inputSchema: {
    type: 'object',
    properties: {
      reference: {
        type: 'string',
        description: 'Bible verse reference (e.g., "John 3:16", "Genesis 1:1-3", "Romans 8:28-30")'
      },
      translation: {
        oneOf: [
          {
            type: 'string',
            enum: ['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY']
          },
          {
            type: 'array',
            items: {
              type: 'string',
              enum: ['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY']
            }
          }
        ],
        default: 'ESV',
        description: 'Bible translation or array of translations for comparison. Single: "ESV". Multiple: ["ESV", "KJV", "WEB"]. Options: ESV (English Standard Version), NET (New English Translation), KJV (King James Version), WEB (World English Bible), BSB (Berean Standard Bible), ASV (American Standard Version), YLT (Young\'s Literal Translation), DBY (Darby Translation). Default: ESV'
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
      // Robust translation parameter handling
      // Claude AI sometimes sends arrays as JSON-stringified strings: "[\"ESV\", \"KJV\"]"
      // We need to handle: actual arrays, stringified arrays, and single strings
      let translations: string[];

      if (typeof params.translation === 'string') {
        const translationStr = params.translation.trim();
        // Check if it's a JSON-stringified array
        if (translationStr.startsWith('[') && translationStr.endsWith(']')) {
          try {
            const parsed = JSON.parse(translationStr);
            translations = Array.isArray(parsed) ? parsed : [translationStr];
          } catch (e) {
            // If parsing fails, treat as single translation
            translations = [translationStr];
          }
        } else {
          translations = [translationStr];
        }
      } else if (Array.isArray(params.translation)) {
        translations = params.translation;
      } else {
        translations = ['ESV'];
      }

      // Fetch all translations in parallel
      const results = await Promise.all(
        translations.map(translation =>
          bibleService.lookup({ ...params, translation })
        )
      );

      // Format response
      let formattedResponse: string;
      if (results.length === 1) {
        // Single translation - use standard formatter
        formattedResponse = formatBibleResponse(results[0]);
      } else {
        // Multiple translations - use multi-translation formatter
        formattedResponse = formatMultiBibleResponse(results);
      }

      return formatToolResponse(formattedResponse);
    } catch (error) {
      return handleToolError(error as Error);
    }
  }
};