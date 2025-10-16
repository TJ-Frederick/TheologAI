import { ToolHandler, ParallelPassageLookupParams } from '../types/index.js';
import { ParallelPassageService } from '../services/parallelPassageService.js';
import { formatToolResponse } from '../utils/formatter.js';
import { handleToolError } from '../utils/errors.js';

const parallelPassageService = new ParallelPassageService();

export const parallelPassagesHandler: ToolHandler = {
  name: 'parallel_passages',
  description: 'Find QUOTATIONS, CITATIONS, and PARALLEL accounts across Scripture. Specifically designed for: OT quotations in NT (e.g., "How is Psalm 22 quoted in the NT?"), Gospel parallels (same event across Matthew, Mark, Luke, John), and thematic parallels (same topic by different biblical authors). COMPREHENSIVE RESULTS: This tool combines a curated database with cross-reference data internally. Results are COMPLETE - do not follow up with bible_cross_references for quotation queries unless user specifically requests broader thematic connections. WHEN TO USE: User asks "quotations", "citations", "where is [passage] quoted", finding parallel Gospel accounts (e.g., "resurrection in all 4 Gospels"), discovering how OT passages are used in NT. includeText PARAMETER: false (PREFERRED) for discovery queries ("find quotations") → reference list only; true for comparison queries ("compare differences") → full text with analysis. Note: For THEMATIC/RELATED verses (not quotations), use bible_cross_references.',
  inputSchema: {
    type: 'object',
    properties: {
      reference: {
        type: 'string',
        description: 'Bible verse or passage to find parallels for (e.g., "Matthew 14:13-21", "Isaiah 53:5", "John 3:16")'
      },
      mode: {
        type: 'string',
        enum: ['auto', 'synoptic', 'quotation', 'thematic'],
        default: 'auto',
        description: 'Type of parallels to find: auto (let tool decide based on context), synoptic (Gospel parallels only - same event in different Gospels), quotation (OT passages quoted in NT), thematic (same topic across different authors). Default: auto'
      },
      includeText: {
        type: 'boolean',
        description: 'Controls whether to fetch full verse text. IMPORTANT - When to use each: \n• false (PREFERRED for discovery): User asks "find", "which passages", "what quotes", "citations", "references" → Returns list of references only (fast, concise)\n• true (only for comparison): User asks "compare", "show differences", "contrast", "display text" OR explicitly requests full text → Fetches full verse text for all parallels\n\nSmart default: false for discovery queries and long passages (>5 verses), true only when user clearly wants detailed comparison. When in doubt, use false.'
      },
      translation: {
        type: 'string',
        enum: ['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY'],
        default: 'ESV',
        description: 'Bible translation to use when includeText=true. Default: ESV'
      },
      showDifferences: {
        type: 'boolean',
        default: true,
        description: 'Highlight unique elements in each parallel account (what makes each version distinctive). Only applicable when includeText=true. Default: true'
      },
      useCrossReferences: {
        type: 'boolean',
        default: true,
        description: 'Augment curated parallels with OpenBible.info cross-reference data to discover additional connections. Disable for faster results with only high-confidence curated parallels. Default: true'
      },
      maxParallels: {
        type: 'number',
        default: 10,
        description: 'Maximum number of parallel passages to return. Default: 10'
      }
    },
    required: ['reference']
  },
  handler: async (params: ParallelPassageLookupParams) => {
    try {
      const result = await parallelPassageService.findParallels(params);

      // Format the response
      let response = formatParallelPassagesResponse(result, params);

      return formatToolResponse(response);
    } catch (error) {
      return handleToolError(error as Error);
    }
  }
};

/**
 * Format parallel passages result into readable text
 */
function formatParallelPassagesResponse(
  result: any,
  params: ParallelPassageLookupParams
): string {
  let response = '';

  // Header
  if (result.primary.context) {
    response += `**${result.primary.context}**\n`;
    response += `Parallel Passages for ${result.primary.reference}\n\n`;
  } else {
    response += `**Parallel Passages for ${result.primary.reference}**\n\n`;
  }

  // Check if any parallels found
  if (result.parallels.length === 0) {
    response += `No parallel passages found for ${result.primary.reference}.\n\n`;
    if (params.mode && params.mode !== 'auto') {
      response += `Try using mode="auto" to discover parallels of different types.\n`;
    }
    if (!params.useCrossReferences) {
      response += `Try enabling useCrossReferences=true to discover additional connections.\n`;
    }
    response += `\n${result.citation.source}`;
    return response;
  }

  // Primary passage text (if included)
  if (result.primary.text) {
    response += `**PRIMARY: ${result.primary.reference}** (${result.primary.translation})\n`;
    response += `${'─'.repeat(70)}\n`;
    response += `${result.primary.text}\n\n`;
  }

  // Parallels
  response += `**PARALLEL ACCOUNTS** (${result.parallels.length} found):\n\n`;

  result.parallels.forEach((parallel: any, index: number) => {
    const relationshipLabel = parallel.relationship.toUpperCase();
    response += `**[${index + 1}] ${parallel.reference}** (${relationshipLabel} - ${parallel.confidence}% confidence)\n`;

    if (parallel.text) {
      response += `${'─'.repeat(70)}\n`;
      response += `${parallel.text}\n`;

      // Show unique elements if available
      if (parallel.uniqueElements && parallel.uniqueElements.length > 0) {
        response += `\n*UNIQUE DETAILS:*\n`;
        parallel.uniqueElements.forEach((element: string) => {
          response += `• ${element}\n`;
        });
      }

      response += '\n';
    } else {
      // Metadata only
      if (parallel.notes) {
        response += `  ${parallel.notes}\n`;
      }
      response += '\n';
    }
  });

  // Analysis section (if available)
  if (result.analysis) {
    response += `**ANALYSIS:**\n\n`;

    if (result.analysis.commonElements && result.analysis.commonElements.length > 0) {
      response += `*Common Elements Across Accounts:*\n`;
      result.analysis.commonElements.forEach((element: string) => {
        response += `✓ ${element}\n`;
      });
      response += '\n';
    }

    if (result.analysis.variations && Object.keys(result.analysis.variations).length > 0) {
      response += `*Distinctive Features by Account:*\n`;
      for (const [book, details] of Object.entries(result.analysis.variations)) {
        if (Array.isArray(details) && details.length > 0) {
          response += `• **${book}:** ${details.join(', ')}\n`;
        }
      }
      response += '\n';
    }
  }

  // Suggested workflow for metadata-only mode
  if (result.suggestedWorkflow) {
    response += `*Tip: ${result.suggestedWorkflow}*\n\n`;
  }

  // Citation
  response += `*${result.citation.source}`;
  if (result.citation.url) {
    response += ` - ${result.citation.url}`;
  }
  response += '*';

  return response;
}
