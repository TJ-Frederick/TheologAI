import {
  ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION,
  ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_PAGE_SIZE,
  ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES,
  ORIGINAL_LANGUAGE_STUDY_SCHEMA_VERSION,
  ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION,
  createOriginalLanguageStudyV3Cursor,
  type OriginalLanguageStudyLexicalRange,
  type OriginalLanguageStudyV3Result,
  type OriginalLanguageStudyV3SemanticEvidence,
} from '../kernel/originalLanguageStudyV3Contract.js';
import type { OriginalLanguageStudyV2SemanticEvidence } from '../kernel/originalLanguageStudyV2Contract.js';
import type { OriginalLanguageStudyV3ApplicationResult } from '../services/languages/OriginalLanguageStudyV3ApplicationResult.js';
import { originalLanguageStudyV3CursorBinding } from '../services/languages/OriginalLanguageStudyV3Coordinator.js';
import { presentOriginalLanguageStudyV2 } from './originalLanguageStudyV2Presentation.js';
import { finalizeOriginalLanguageStudyV3Output, type OriginalLanguageStudyV3StructuredPresentation } from './originalLanguageStudyV3Structured.js';
import { formatOriginalLanguageStudyV3 } from '../formatters/originalLanguageStudyV3Formatter.js';

export interface OriginalLanguageStudyV3Presentation extends OriginalLanguageStudyV3StructuredPresentation {
  markdown: string;
}

export function presentOriginalLanguageStudyV3(
  result: OriginalLanguageStudyV3ApplicationResult,
): OriginalLanguageStudyV3Presentation {
  const v2 = presentOriginalLanguageStudyV2(result.evidence);
  const study = structuredClone(v2.output.study);
  const semanticEvidence = presentSemanticEvidence(result, v2.output.semanticEvidence);
  const output: OriginalLanguageStudyV3Result = {
    schemaVersion: ORIGINAL_LANGUAGE_STUDY_SCHEMA_VERSION,
    kind: 'original_language_study',
    depth: result.request.depth,
    request: {
      reference: result.request.reference,
      target: result.request.target,
      ...(result.request.position === undefined ? {} : { position: result.request.position }),
    },
    study,
    lexicalRange: presentLexicalRange(study),
    englishTranslationComparison: {
      status: 'not_performed', responsibility: 'guided_prompt',
      reason: 'english_translations_are_retrieved_separately',
    },
    contextualInterpretation: {
      status: 'not_performed', responsibility: 'guided_prompt',
      reason: 'deterministic_tool_does_not_select_contextual_meaning',
    },
    semanticEvidence,
    ...(result.request.depth === 'technical'
      ? { corpusOccurrences: presentCorpusOccurrences(result) }
      : {}),
    responseWindow: {
      unit: 'utf8_bytes', maximum: ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES,
      used: 0, truncated: false,
    },
  };
  const presentation = finalizeOriginalLanguageStudyV3Output(output);
  return {
    ...presentation,
    markdown: formatOriginalLanguageStudyV3(presentation.output, result.evidence.v1Result),
  };
}

function presentSemanticEvidence(
  application: OriginalLanguageStudyV3ApplicationResult,
  input: OriginalLanguageStudyV2SemanticEvidence,
): OriginalLanguageStudyV3SemanticEvidence {
  const evidence = structuredClone(input) as OriginalLanguageStudyV3SemanticEvidence;
  if ('withheldEvidence' in evidence) {
    const [first, second] = evidence.withheldEvidence;
    evidence.withheldEvidence = [
      { ...first, status: 'withheld_rights_boundary' },
      { ...second, status: 'withheld_public_scope' },
    ];
  }
  if ('resultWindow' in evidence && evidence.resultWindow.continuation) {
    evidence.resultWindow.continuation = {
      operation: ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION,
      cursor: createOriginalLanguageStudyV3Cursor(
        evidence.resultWindow.continuation.cursor,
        originalLanguageStudyV3CursorBinding(
          application.request,
          application.evidence,
          ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION,
        ),
      ),
    };
  }
  return evidence;
}

function presentLexicalRange(study: Record<string, unknown>): OriginalLanguageStudyLexicalRange {
  const rows = Array.isArray(study.lexiconEvidence) ? study.lexiconEvidence : [];
  const cues: Array<Extract<OriginalLanguageStudyLexicalRange, { status: 'available' }>['cues'][number]> = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const evidence = row as Record<string, unknown>;
    const sourceId = typeof evidence.sourceId === 'string' ? evidence.sourceId : undefined;
    const sourceKind = evidence.kind === 'dictionary' || evidence.kind === 'stepbible_lexicon' ? evidence.kind : undefined;
    const provenanceIds = Array.isArray(evidence.provenanceIds)
      ? evidence.provenanceIds.filter((id): id is string => typeof id === 'string')
      : [];
    if (!sourceId || !sourceKind || provenanceIds.length === 0) continue;
    for (const evidenceKind of ['definition', 'gloss'] as const) {
      const text = evidence[evidenceKind];
      if (typeof text === 'string' && text.trim() && cues.length < 4) {
        cues.push({ sourceId, sourceKind, evidenceKind, text, provenanceIds });
      }
    }
  }
  const notice = 'These source-attributed cues describe a non-exhaustive lexical range. They are separate from English translation comparison and do not select the meaning in this verse.';
  return cues.length
    ? { status: 'available', scope: 'source_attested_non_exhaustive', cues, notice }
    : { status: 'unavailable', scope: 'source_attested_non_exhaustive', reason: 'no_publishable_lexical_cues', cues: [], notice };
}

function presentCorpusOccurrences(result: OriginalLanguageStudyV3ApplicationResult) {
  const corpus = result.corpusOccurrences;
  if (!corpus) throw new Error('technical original_language_study must resolve corpus occurrence status');
  if ('status' in corpus) return corpus;
  const binding = originalLanguageStudyV3CursorBinding(
    result.request,
    result.evidence,
    ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION,
  );
  return {
    status: 'available' as const,
    publicStrongs: corpus.publicStrongs,
    exactMorphologyKey: corpus.exactMorphologyKey,
    corpusIdentity: corpus.corpusIdentity,
    attested: corpus.attested,
    totals: corpus.totals,
    occurrences: corpus.occurrences,
    resultWindow: {
      returnedCount: corpus.occurrences.length,
      maximumReturned: ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_PAGE_SIZE as 20,
      hasMore: corpus.nextOccurrenceCursor !== undefined,
      ...(corpus.nextOccurrenceCursor === undefined ? {} : {
        continuation: {
          cursor: createOriginalLanguageStudyV3Cursor(corpus.nextOccurrenceCursor, binding),
          operation: ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION,
        },
      }),
    },
    cautions: corpus.cautions,
  };
}
