/**
 * bible_cross_references tool handler (v2).
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { CrossReferenceService } from '../../services/bible/CrossReferenceService.js';
import { formatCrossReferences } from '../../formatters/bibleFormatter.js';
import { handleToolError } from '../../kernel/errors.js';
import { crossReferencesOutputSchema } from '../../mcp/schemas/crossReferences.js';
import { presentCrossReferencesStructured } from '../../presenters/crossReferencesStructured.js';

export function createCrossReferencesHandler(crossRefService: CrossReferenceService): ToolHandler {
  return {
    name: 'bible_cross_references',
    description: 'Find OpenBible.info cross-reference discovery leads for one Bible verse, ranked by raw source votes. Relationship classification and directionality are unspecified.',
    inputSchema: {
      type: 'object',
      properties: {
        reference: { type: 'string', minLength: 1, maxLength: 100, description: 'Exactly one Bible verse (e.g., "John 3:16"); chapters and verse ranges are not supported.' },
        maxResults: { type: 'integer', minimum: 1, maximum: 100, default: 5, description: 'Max cross-references to return (default 5)' },
        minVotes: { type: 'integer', minimum: 0, maximum: 1000000, default: 0, description: 'Minimum community votes threshold' },
      },
      required: ['reference'],
      additionalProperties: false,
    },
    outputSchema: crossReferencesOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        const requestedReference = params.reference as string;
        const query = {
          maxResults: typeof params.maxResults === 'number' ? params.maxResults : 5,
          minVotes: typeof params.minVotes === 'number' ? params.minVotes : 0,
        };
        const result = await crossRefService.getCrossReferences(params.reference as string, {
          maxResults: query.maxResults,
          minVotes: query.minVotes,
        });
        const text = formatCrossReferences(requestedReference, result);
        return {
          content: [{ type: 'text', text }],
          structuredContent: presentCrossReferencesStructured(requestedReference, query, result),
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}
