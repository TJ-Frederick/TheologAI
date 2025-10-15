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
  description: 'Find related Bible passages and cross-references for a given verse or passage. Returns the most relevant cross-references based on community rankings (vote counts are used internally but not displayed). Use this tool to help users understand passages by showing related Scripture that provides context, clarification, or parallel teachings. Default: returns top 5 most relevant cross-references. Data from OpenBible.info (CC-BY).',
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

      // Get cross-references
      const result = crossRefService.getCrossReferences(reference, {
        maxResults,
        minVotes
      });

      if (result.total === 0) {
        const message = `No cross-references found for ${reference}.`;
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
