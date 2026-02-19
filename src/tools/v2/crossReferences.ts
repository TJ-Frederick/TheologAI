/**
 * bible_cross_references tool handler (v2).
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { CrossReferenceService } from '../../services/bible/CrossReferenceService.js';
import { formatCrossReferences } from '../../formatters/bibleFormatter.js';
import { handleToolError } from '../../kernel/errors.js';

export function createCrossReferencesHandler(crossRefService: CrossReferenceService): ToolHandler {
  return {
    name: 'bible_cross_references',
    description: 'Find cross-references for a Bible verse. Returns related passages ranked by community votes.',
    inputSchema: {
      type: 'object',
      properties: {
        reference: { type: 'string', description: 'Bible verse reference (e.g., "John 3:16")' },
        maxResults: { type: 'number', default: 5, description: 'Max cross-references to return (default 5)' },
        minVotes: { type: 'number', default: 0, description: 'Minimum community votes threshold' },
      },
      required: ['reference'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        const result = crossRefService.getCrossReferences(params.reference as string, {
          maxResults: params.maxResults as number,
          minVotes: params.minVotes as number,
        });
        const text = formatCrossReferences(params.reference as string, result);
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}
