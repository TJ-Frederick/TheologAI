import type { ToolHandler } from '../../kernel/types.js';
import type { OriginalLanguageStudyV3Coordinator } from '../../services/languages/OriginalLanguageStudyV3Coordinator.js';
import { presentOriginalLanguageStudyV3 } from '../../presenters/originalLanguageStudyV3Presentation.js';
import { handleToolError, ValidationError } from '../../kernel/errors.js';
import {
  originalLanguageStudyV3InputSchema,
  originalLanguageStudyV3OutputSchema,
} from '../../mcp/schemas/originalLanguageStudyV3.js';
import { ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH } from '../../kernel/originalLanguageStudyV3Contract.js';

export function createOriginalLanguageStudyHandler(coordinator: OriginalLanguageStudyV3Coordinator): ToolHandler {
  return {
    name: 'original_language_study',
    description: 'Study one Greek or Hebrew token in one Bible verse at beginner, intermediate, or technical depth. Omitted depth defaults to intermediate. Lexical range remains source-attributed and separate from English translation comparison; only technical depth returns bounded exact-corpus occurrences. This deterministic tool never chooses the contextual meaning. Schema-v2 cursors are stale and unsupported.',
    inputSchema: originalLanguageStudyV3InputSchema,
    outputSchema: originalLanguageStudyV3OutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async params => {
      try {
        const unknown = Object.keys(params).find(key => !['reference', 'target', 'position', 'depth', 'cursor'].includes(key));
        if (unknown) throw new ValidationError(unknown, `Unknown argument "${unknown}".`);
        if (typeof params.reference !== 'string' || params.reference.trim().length < 1 || params.reference.length > 100) throw new ValidationError('reference', 'reference must be a string from 1 to 100 characters.');
        if (typeof params.target !== 'string' || params.target.trim().length < 1 || params.target.length > 100) throw new ValidationError('target', 'target must be a string from 1 to 100 characters.');
        if (params.position !== undefined && (!Number.isInteger(params.position) || (params.position as number) < 1 || (params.position as number) > 200)) throw new ValidationError('position', 'position must be an integer from 1 to 200.');
        if (params.depth !== undefined && !['beginner', 'intermediate', 'technical'].includes(params.depth as string)) throw new ValidationError('depth', 'depth must be beginner, intermediate, or technical.');
        if (params.cursor !== undefined && (typeof params.cursor !== 'string' || params.cursor.length < 1 || params.cursor.length > ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH)) {
          throw new ValidationError('cursor', `cursor must be an opaque string from 1 to ${ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH} characters.`);
        }
        const position = params.position as number | undefined;
        const applicationResult = await coordinator.study({
          reference: params.reference,
          target: params.target,
          ...(position === undefined ? {} : { position }),
          ...(params.depth === undefined ? {} : { depth: params.depth }),
          ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
        });
        const presentation = presentOriginalLanguageStudyV3(applicationResult);
        return { content: [{ type: 'text', text: presentation.markdown }], structuredContent: presentation.output };
      } catch (error) { return handleToolError(error as Error); }
    },
  };
}
