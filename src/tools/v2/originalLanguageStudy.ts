import type { ToolHandler } from '../../kernel/types.js';
import type { OriginalLanguageStudyService } from '../../services/languages/OriginalLanguageStudyService.js';
import { handleToolError, ValidationError } from '../../kernel/errors.js';
import { formatOriginalLanguageStudy } from '../../formatters/originalLanguageStudyFormatter.js';
import { presentOriginalLanguageStudy } from '../../presenters/originalLanguageStudyStructured.js';
import { originalLanguageStudyOutputSchema } from '../../mcp/schemas/originalLanguageStudy.js';

export function createOriginalLanguageStudyHandler(service: OriginalLanguageStudyService): ToolHandler {
  return {
    name: 'original_language_study',
    description: 'Study one Greek or Hebrew token in one Bible verse using local morphology and source-separated lexical evidence. Returns candidates rather than guessing when the target is ambiguous.',
    inputSchema: { type: 'object', properties: { reference: { type: 'string', minLength: 1, maxLength: 100 }, target: { type: 'string', minLength: 1, maxLength: 100 }, position: { type: 'integer', minimum: 1, maximum: 200 } }, required: ['reference', 'target'], additionalProperties: false },
    outputSchema: originalLanguageStudyOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async params => {
      try {
        const unknown = Object.keys(params).find(key => !['reference', 'target', 'position'].includes(key));
        if (unknown) throw new ValidationError(unknown, `Unknown argument "${unknown}".`);
        if (typeof params.reference !== 'string' || params.reference.trim().length < 1 || params.reference.length > 100) throw new ValidationError('reference', 'reference must be a string from 1 to 100 characters.');
        if (typeof params.target !== 'string' || params.target.trim().length < 1 || params.target.length > 100) throw new ValidationError('target', 'target must be a string from 1 to 100 characters.');
        if (params.position !== undefined && (!Number.isInteger(params.position) || (params.position as number) < 1 || (params.position as number) > 200)) throw new ValidationError('position', 'position must be an integer from 1 to 200.');
        const position = params.position as number | undefined;
        const result = await service.study({ reference: params.reference, target: params.target, ...(position !== undefined ? { position } : {}) });
        return { content: [{ type: 'text', text: formatOriginalLanguageStudy(result) }], structuredContent: presentOriginalLanguageStudy(result, position) };
      } catch (error) { return handleToolError(error as Error); }
    },
  };
}
