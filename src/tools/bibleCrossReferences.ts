import { ToolHandler } from '../types/index.js';
import { CrossReferenceService } from '../services/crossReferenceService.js';
import { BibleService } from '../services/bibleService.js';
import { formatToolResponse } from '../utils/formatter.js';
import { handleToolError } from '../utils/errors.js';

const crossRefService = new CrossReferenceService();
const bibleService = new BibleService();

export interface CrossReferenceLookupParams {
  reference: string;
  maxResults?: number;
  minVotes?: number;
  includeVerseText?: boolean;
  translation?: string;
}

export const bibleCrossReferencesHandler: ToolHandler = {
  name: 'bible_cross_references',
  description: 'Find RELATED verses and THEMATIC connections for deeper biblical context. Shows verses that share themes, concepts, or provide background understanding. USE CASES: Finding verses on similar themes (e.g., "verses about faith like Hebrews 11"), discovering contextual background for better understanding, exploring how a concept appears throughout Scripture. IMPORTANT: For finding DIRECT QUOTATIONS or CITATIONS (e.g., "NT quotations of Psalm 22"), use parallel_passages tool instead - it\'s specifically designed for that purpose and provides more accurate results. Requires specific verse reference (e.g., "John 3:16", not "John 3"). Data from OpenBible.info (CC-BY).',
  inputSchema: {
    type: 'object',
    properties: {
      reference: {
        type: 'string',
        description: 'Bible verse reference (e.g., "John 3:16", "Genesis 1:1", "Romans 8:28")'
      },
      maxResults: {
        type: 'number',
        default: 5,
        description: 'Maximum number of cross-references to return (default: 5). Use higher values (10-20) if user asks for "more" cross-references.'
      },
      minVotes: {
        type: 'number',
        default: 0,
        description: 'Minimum vote threshold for filtering cross-references (default: 0). Higher values return only the most highly-ranked references.'
      },
      includeVerseText: {
        type: 'boolean',
        default: false,
        description: 'Include the actual text of each cross-referenced verse (default: false). When true, fetches verse text using the specified translation.'
      },
      translation: {
        type: 'string',
        enum: ['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY'],
        default: 'ESV',
        description: 'Bible translation to use when includeVerseText is true (default: ESV)'
      }
    },
    required: ['reference']
  },
  handler: async (params: CrossReferenceLookupParams) => {
    try {
      const {
        reference,
        maxResults = 5,
        minVotes = 0,
        includeVerseText = false,
        translation = 'ESV'
      } = params;

      // Check if reference is chapter-only (e.g., "Psalm 22" without verse)
      const isChapterOnly = /\d+\s*$/.test(reference.trim());

      // Get cross-references
      const result = crossRefService.getCrossReferences(reference, {
        maxResults,
        minVotes
      });

      if (result.total === 0) {
        let message = `No cross-references found for ${reference}.`;

        // Provide helpful guidance for chapter-only searches
        if (isChapterOnly) {
          message += `\n\nThe cross-reference database requires a specific verse number. Please specify a particular verse within the chapter (e.g., "${reference}:1").`;
          message += `\n\nTip: Use the parallel_passages tool for broader searches, or try a specific verse with this tool.`;
        }

        return formatToolResponse(message);
      }

      // Build response
      let response = `Cross-References for ${reference}`;

      if (result.total > result.showing) {
        response += ` (showing top ${result.showing} of ${result.total})`;
      } else {
        response += ` (${result.total} total)`;
      }
      response += ':\n\n';

      // Add cross-references
      if (includeVerseText) {
        // Fetch verse text for each reference
        for (let i = 0; i < result.references.length; i++) {
          const ref = result.references[i];
          response += `${i + 1}. ${ref.reference}\n`;

          try {
            const verseResult = await bibleService.lookup({
              reference: ref.reference,
              translation
            });
            response += `   "${verseResult.text}"\n\n`;
          } catch (error) {
            response += `   (Text not available)\n\n`;
          }
        }
      } else {
        // Just list references
        result.references.forEach((ref, i) => {
          response += `${i + 1}. ${ref.reference}\n`;
        });
      }

      // Add "more available" note if applicable
      if (result.hasMore) {
        const remaining = result.total - result.showing;
        response += `\n[${remaining} additional cross-reference${remaining !== 1 ? 's' : ''} available`;
        if (!includeVerseText) {
          response += `. Use maxResults parameter to see more, or set includeVerseText=true to see the text of these verses`;
        } else {
          response += `. Use maxResults parameter to see more`;
        }
        response += ']';
      }

      // Add attribution
      response += '\n\nData source: OpenBible.info (CC-BY)';

      return formatToolResponse(response);
    } catch (error) {
      return handleToolError(error as Error);
    }
  }
};
