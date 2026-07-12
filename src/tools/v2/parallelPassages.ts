/**
 * parallel_passages tool handler (v2).
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { ParallelPassageService } from '../../services/bible/ParallelPassageService.js';
import { formatParallelPassageResearch } from '../../formatters/bibleFormatter.js';
import { handleToolError } from '../../kernel/errors.js';
import { parallelPassagesOutputSchema } from '../../mcp/schemas/parallelPassages.js';
import { presentParallelPassagesStructured } from '../../presenters/parallelPassagesStructured.js';

export function createParallelPassagesHandler(service: ParallelPassageService): ToolHandler {
  return {
    name: 'parallel_passages',
    description: 'Find source-attested UBS parallel-passage groups by default. TheologAI legacy curated edges and OpenBible.info cross references require explicit opt-in.',
    inputSchema: {
      type: 'object',
      properties: {
        reference: { type: 'string', minLength: 1, maxLength: 100, description: 'Bible reference (e.g., "Matthew 26:26-28")' },
        corpora: {
          type: 'array', minItems: 1, maxItems: 2, uniqueItems: true,
          items: { type: 'string', enum: ['ubs_source_attested', 'theologai_legacy'] },
          default: ['ubs_source_attested'],
          description: 'Parallel corpora to query. Omission searches only UBS source-attested groups.',
        },
        mode: { type: 'string', enum: ['auto', 'synoptic', 'quotation', 'thematic'], description: 'TheologAI legacy corpus only; requires corpora to include theologai_legacy. Omission uses auto internally when legacy is selected.' },
        includeText: { type: 'boolean', default: false, description: 'Enrich every returned UBS group member and legacy item with passage text when available.' },
        translation: { type: 'string', enum: ['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY'], default: 'ESV' },
        maxGroups: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'Maximum complete UBS groups.' },
        includeAlignment: { type: 'boolean', default: false, description: 'Include raw UBS alignment metadata; UBS corpus only.' },
        maxParallels: { type: 'integer', minimum: 1, maximum: 50, description: 'TheologAI legacy corpus only. Omission uses 10 internally when legacy is selected.' },
        includeOpenBibleCrossReferences: { type: 'boolean', default: false, description: 'Return OpenBible.info cross references in a separate collection.' },
        useCrossReferences: { type: 'boolean', description: 'Deprecated alias for includeOpenBibleCrossReferences. Omission is false; conflicting supplied values are rejected.' },
      },
      required: ['reference'],
      additionalProperties: false,
    },
    outputSchema: parallelPassagesOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },

    handler: async (params) => {
      try {
        const result = await service.lookup({
          reference: params.reference as string,
          corpora: params.corpora as any,
          mode: params.mode as any,
          includeText: params.includeText as boolean,
          translation: params.translation as string,
          maxParallels: params.maxParallels as number,
          maxGroups: params.maxGroups as number,
          includeAlignment: params.includeAlignment as boolean,
          includeOpenBibleCrossReferences: params.includeOpenBibleCrossReferences as boolean,
          useCrossReferences: params.useCrossReferences as boolean,
        });
        return {
          content: [{ type: 'text', text: formatParallelPassageResearch(result) }],
          structuredContent: presentParallelPassagesStructured(result),
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}
