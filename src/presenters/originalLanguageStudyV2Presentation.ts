import {
  ORIGINAL_LANGUAGE_STUDY_V2_RESPONSE_BYTES,
  ORIGINAL_LANGUAGE_STUDY_V2_SCHEMA_VERSION,
  type OriginalLanguageStudyV2Result,
} from '../kernel/originalLanguageStudyV2Contract.js';
import type { OriginalLanguageStudyV2ApplicationResult } from '../services/languages/OriginalLanguageStudyV2ApplicationResult.js';
import { formatOriginalLanguageStudyV2 } from '../formatters/originalLanguageStudyV2Formatter.js';
import { presentOriginalLanguageStudy } from './originalLanguageStudyStructured.js';
import {
  finalizeOriginalLanguageStudyV2Output,
  type OriginalLanguageStudyV2StructuredPresentation,
} from './originalLanguageStudyV2Structured.js';

export interface OriginalLanguageStudyV2Presentation extends OriginalLanguageStudyV2StructuredPresentation {
  markdown: string;
}

/**
 * Reconstructs the established public v2 packet from the validated language
 * application result. Property order and response-window initialization are
 * intentionally kept identical to the original assembly path.
 */
export function presentOriginalLanguageStudyV2(
  result: OriginalLanguageStudyV2ApplicationResult,
): OriginalLanguageStudyV2Presentation {
  const output: OriginalLanguageStudyV2Result = {
    schemaVersion: ORIGINAL_LANGUAGE_STUDY_V2_SCHEMA_VERSION,
    kind: 'original_language_study',
    detail: result.request.detail,
    request: {
      // Keep the supplied spelling as an auditable request record. The
      // composed v1 study and semantic reference are canonical, while this
      // raw value remains part of the continuation binding.
      reference: result.request.reference,
      target: result.request.target,
      ...(result.request.position === undefined ? {} : { position: result.request.position }),
    },
    study: presentOriginalLanguageStudy(result.v1Result, result.request.position),
    semanticEvidence: result.semanticEvidence,
    responseWindow: {
      unit: 'utf8_bytes', maximum: ORIGINAL_LANGUAGE_STUDY_V2_RESPONSE_BYTES,
      used: 0, truncated: false,
    },
  };
  const presentation = finalizeOriginalLanguageStudyV2Output(output);
  return {
    ...presentation,
    markdown: formatOriginalLanguageStudyV2(presentation.output, result.v1Result),
  };
}
