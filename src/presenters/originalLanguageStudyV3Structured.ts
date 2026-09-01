import { MORPHOLOGY_USAGE_IDENTITY, decodeMorphologyUsageCursor } from '../kernel/morphologyUsageCursor.js';
import { parseStrongsIdentity } from '../kernel/strongs.js';
import {
  ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION,
  ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES,
  ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION,
  parseOriginalLanguageStudyV3Cursor,
  selectedTokenWitnessFromStudy,
  type OriginalLanguageStudyV3CursorBinding,
  type OriginalLanguageStudyV3Result,
} from '../kernel/originalLanguageStudyV3Contract.js';
import { parseOriginalLanguageStudyV2Cursor, type OriginalLanguageStudyV2Candidate } from '../kernel/originalLanguageStudyV2Contract.js';
import { originalLanguageStudyV3OutputSchema } from '../mcp/schemas/originalLanguageStudyV3.js';
import { validatorFor, type SchemaValidator } from '../mcp/validation.js';

let validateSchema: SchemaValidator<Record<string, unknown>> | undefined;

function getSchemaValidator(): SchemaValidator<Record<string, unknown>> {
  validateSchema ??= validatorFor(originalLanguageStudyV3OutputSchema);
  return validateSchema;
}

export interface OriginalLanguageStudyV3StructuredPresentation {
  output: OriginalLanguageStudyV3Result;
  serialized: string;
}

export function finalizeOriginalLanguageStudyV3Output(
  input: OriginalLanguageStudyV3Result,
): OriginalLanguageStudyV3StructuredPresentation {
  const output = structuredClone(input);
  const candidates = repositoryCandidates(output);
  if (candidates) {
    for (let index = candidates.length - 1; index >= 0 && !fitsByteWindow(output); index -= 1) {
      const candidate = candidates[index]!;
      if (candidate.detailStatus === 'detailed') candidates[index] = omitCandidateDetails(candidate);
    }
  }
  const serialized = stableSerializeWithTruthfulWindow(output);
  validateOriginalLanguageStudyV3Output(output);
  return { output, serialized };
}

export function serializeValidatedOriginalLanguageStudyV3Output(output: unknown): string {
  const cloned = structuredClone(output) as OriginalLanguageStudyV3Result;
  validateOriginalLanguageStudyV3Output(cloned);
  return stableSerializeWithTruthfulWindow(cloned, false);
}

function validateOriginalLanguageStudyV3Output(output: OriginalLanguageStudyV3Result): void {
  const validator = getSchemaValidator();
  const validation = validator(output as unknown as Record<string, unknown>);
  if (!validation.valid) throw new Error(`original_language_study v3 output violates its schema: ${validation.errorMessage}`);
  const study = objectOf(output.study, 'study');
  const request = objectOf(study.request, 'study.request');
  const context = objectOf(study.context, 'study.context');
  if (study.schemaVersion !== '1' || study.kind !== 'original_language_study'
    || request.target !== output.request.target
    || (request.position ?? undefined) !== (output.request.position ?? undefined)
    || context.reference !== request.reference) {
    throw new Error('v3 must compose the complete matching v1 study');
  }
  if ((output.depth === 'technical') !== (output.corpusOccurrences !== undefined)) {
    throw new Error('only technical depth may contain corpus occurrences');
  }
  const evidence = output.semanticEvidence;
  if (context.language !== evidence.language) throw new Error('semantic evidence language must match study language');
  if ('resultWindow' in evidence) {
    const window = evidence.resultWindow;
    if (window.priorCount + window.returnedCount !== window.consumedCount
      || window.consumedCount > window.totalCount
      || window.hasMore !== (window.consumedCount < window.totalCount)
      || window.hasMore !== (window.continuation !== undefined)
      || ('candidates' in evidence && window.returnedCount !== evidence.candidates.length)) {
      throw new Error('v3 semantic continuation window is inconsistent');
    }
    if (window.continuation) {
      const binding = cursorBinding(output, ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION);
      const inner = parseOriginalLanguageStudyV3Cursor(window.continuation.cursor, binding);
      parseOriginalLanguageStudyV2Cursor(inner, {
        requestReference: output.request.reference,
        requestTarget: output.request.target,
        requestPosition: output.request.position ?? null,
        detail: output.depth === 'technical' ? 'detailed' : 'summary',
        canonicalReference: binding.canonicalReference,
        selectedToken: binding.selectedToken,
        publicStrongs: evidence.identity.publicStrongs as `H${number}`,
        sourceIdentity: evidence.identity.sourceIdentity as never,
        normalizedReference: evidence.normalizedReference,
        artifactIdentity: evidence.provenance.artifactIdentity,
      });
    }
  }
  const corpus = output.corpusOccurrences;
  if (corpus?.status === 'available') {
    if (corpus.corpusIdentity !== MORPHOLOGY_USAGE_IDENTITY
      || corpus.occurrences.length !== corpus.resultWindow.returnedCount
      || corpus.occurrences.length > corpus.resultWindow.maximumReturned
      || corpus.resultWindow.hasMore !== (corpus.resultWindow.continuation !== undefined)
      || corpus.occurrences.some(row => row.exactMorphologyKey !== corpus.exactMorphologyKey)) {
      throw new Error('v3 corpus occurrence identity or window is inconsistent');
    }
    if (corpus.resultWindow.continuation) {
      const binding = cursorBinding(output, ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION);
      const inner = parseOriginalLanguageStudyV3Cursor(corpus.resultWindow.continuation.cursor, binding);
      decodeMorphologyUsageCursor(inner, corpus.exactMorphologyKey);
    }
  }
}

function cursorBinding(
  output: OriginalLanguageStudyV3Result,
  operation: typeof ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION | typeof ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION,
): OriginalLanguageStudyV3CursorBinding {
  const study = objectOf(output.study, 'study');
  const context = objectOf(study.context, 'study.context');
  const selectedToken = selectedTokenWitnessFromStudy(study);
  if (!selectedToken) throw new Error('v3 continuation requires one selected token witness');
  const identityValue = study.identity === undefined ? selectedToken.strongsNumber : objectOf(study.identity, 'study.identity').publicStrongs;
  const identity = typeof identityValue === 'string' ? parseStrongsIdentity(identityValue) : undefined;
  if (!identity) throw new Error('v3 continuation requires one canonical identity');
  const semantic = output.semanticEvidence;
  const repository = 'identity' in semantic && 'provenance' in semantic;
  return {
    requestReference: output.request.reference,
    requestTarget: output.request.target,
    requestPosition: output.request.position ?? null,
    depth: output.depth,
    operation,
    canonicalReference: context.reference as string,
    selectedToken,
    publicStrongs: identity.publicId,
    morphologyKey: identity.morphologyKey,
    semanticArtifactIdentity: repository ? semantic.provenance.artifactIdentity : null,
    semanticSourceIdentity: repository ? semantic.identity.sourceIdentity : null,
    semanticNormalizedReference: repository ? semantic.normalizedReference : null,
    corpusIdentity: MORPHOLOGY_USAGE_IDENTITY,
  };
}

function stableSerializeWithTruthfulWindow(output: OriginalLanguageStudyV3Result, permitRepair = true): string {
  let expected = permitRepair ? 1 : output.responseWindow.used;
  if (!Number.isSafeInteger(expected) || expected < 1) throw new Error('v3 response window used bytes must be truthful');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    output.responseWindow.used = expected;
    const serialized = JSON.stringify(output);
    const actual = new TextEncoder().encode(serialized).byteLength;
    if (actual > ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES) throw new Error(`original_language_study v3 output exceeds ${ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES} serialized UTF-8 bytes`);
    if (actual === expected) return serialized;
    if (!permitRepair) throw new Error('v3 response window used bytes are not truthful');
    expected = actual;
  }
  throw new Error('v3 response byte accounting did not stabilize');
}

function fitsByteWindow(output: OriginalLanguageStudyV3Result): boolean {
  try { stableSerializeWithTruthfulWindow(structuredClone(output)); return true; }
  catch (error) {
    if (error instanceof Error && error.message.includes('serialized UTF-8 bytes')) return false;
    throw error;
  }
}

function repositoryCandidates(output: OriginalLanguageStudyV3Result): OriginalLanguageStudyV2Candidate[] | undefined {
  const evidence = output.semanticEvidence;
  return evidence.status === 'lexical_candidates' || evidence.status === 'reference_aligned_source_candidate'
    ? evidence.candidates as OriginalLanguageStudyV2Candidate[]
    : undefined;
}

function omitCandidateDetails(candidate: OriginalLanguageStudyV2Candidate): OriginalLanguageStudyV2Candidate {
  return {
    sourceId: candidate.sourceId,
    sourceRole: candidate.sourceRole,
    entryId: candidate.entryId,
    senseId: candidate.senseId,
    sourceAttestedReferenceCount: candidate.sourceAttestedReferenceCount,
    referenceEvidenceIds: [...candidate.referenceEvidenceIds],
    detailStatus: 'omitted_response_byte_budget',
  };
}

function objectOf(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
