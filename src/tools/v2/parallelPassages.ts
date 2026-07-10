/**
 * parallel_passages tool handler (v2).
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { ParallelPassageService } from '../../services/bible/ParallelPassageService.js';
import { formatParallelPassages } from '../../formatters/bibleFormatter.js';
import { handleToolError } from '../../kernel/errors.js';

export function createParallelPassagesHandler(service: ParallelPassageService): ToolHandler {
  return {
    name: 'parallel_passages',
    description: 'Find parallel passages: synoptic parallels, OT→NT quotations, and thematic connections.',
    inputSchema: {
      type: 'object',
      properties: {
        reference: { type: 'string', minLength: 1, maxLength: 100, description: 'Bible reference (e.g., "Matthew 26:26-28")' },
        mode: { type: 'string', enum: ['auto', 'synoptic', 'quotation', 'thematic'], default: 'auto' },
        includeText: { type: 'boolean', default: false, description: 'Include a clearly labeled text excerpt of up to 200 characters for each parallel' },
        translation: { type: 'string', enum: ['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY'], default: 'ESV' },
        maxParallels: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        useCrossReferences: { type: 'boolean', default: true },
      },
      required: ['reference'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        const result = await service.lookup({
          reference: params.reference as string,
          mode: params.mode as any,
          includeText: params.includeText as boolean,
          translation: params.translation as string,
          maxParallels: params.maxParallels as number,
          useCrossReferences: params.useCrossReferences as boolean,
        });
        return { content: [{ type: 'text', text: formatParallelPassages(result) }] };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}
