import type { ToolHandler } from '../../kernel/types.js';
import type { OriginalLanguageStudyV2Coordinator } from '../../services/languages/OriginalLanguageStudyV2Coordinator.js';
import { handleToolError, ValidationError } from '../../kernel/errors.js';
import {
  originalLanguageStudyV2InputSchema,
  originalLanguageStudyV2OutputSchema,
} from '../../mcp/schemas/originalLanguageStudyV2.js';
import { ORIGINAL_LANGUAGE_STUDY_V2_CURSOR_MAX_LENGTH } from '../../kernel/originalLanguageStudyV2Contract.js';

export function createOriginalLanguageStudyHandler(coordinator: OriginalLanguageStudyV2Coordinator): ToolHandler {
  return {
    name: 'original_language_study',
    description: 'Study one Greek or Hebrew token in one Bible verse. Returns the complete prior study under study plus bounded Hebrew semantic candidates when eligible; use detail for candidate detail and return an opaque cursor unchanged for the next candidate page.',
    inputSchema: originalLanguageStudyV2InputSchema,
    outputSchema: originalLanguageStudyV2OutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async params => {
      try {
        const unknown = Object.keys(params).find(key => !['reference', 'target', 'position', 'detail', 'cursor'].includes(key));
        if (unknown) throw new ValidationError(unknown, `Unknown argument "${unknown}".`);
        if (typeof params.reference !== 'string' || params.reference.trim().length < 1 || params.reference.length > 100) throw new ValidationError('reference', 'reference must be a string from 1 to 100 characters.');
        if (typeof params.target !== 'string' || params.target.trim().length < 1 || params.target.length > 100) throw new ValidationError('target', 'target must be a string from 1 to 100 characters.');
        if (params.position !== undefined && (!Number.isInteger(params.position) || (params.position as number) < 1 || (params.position as number) > 200)) throw new ValidationError('position', 'position must be an integer from 1 to 200.');
        if (params.detail !== undefined && params.detail !== 'summary' && params.detail !== 'detailed') throw new ValidationError('detail', 'detail must be summary or detailed.');
        if (params.cursor !== undefined && (typeof params.cursor !== 'string' || params.cursor.length < 1 || params.cursor.length > ORIGINAL_LANGUAGE_STUDY_V2_CURSOR_MAX_LENGTH)) {
          throw new ValidationError('cursor', `cursor must be an opaque string from 1 to ${ORIGINAL_LANGUAGE_STUDY_V2_CURSOR_MAX_LENGTH} characters.`);
        }
        const position = params.position as number | undefined;
        const presentation = await coordinator.study({
          reference: params.reference,
          target: params.target,
          ...(position === undefined ? {} : { position }),
          ...(params.detail === undefined ? {} : { detail: params.detail }),
          ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
        });
        return { content: [{ type: 'text', text: presentation.markdown }], structuredContent: presentation.output };
      } catch (error) { return handleToolError(error as Error); }
    },
  };
}
