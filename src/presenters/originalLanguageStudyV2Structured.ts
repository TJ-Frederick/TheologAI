import Ajv2020 from 'ajv/dist/2020.js';
import {
  ORIGINAL_LANGUAGE_STUDY_V2_RESPONSE_BYTES,
  type OriginalLanguageStudyV2Candidate,
  type OriginalLanguageStudyV2Result,
} from '../kernel/originalLanguageStudyV2Contract.js';
import { originalLanguageStudyV2OutputSchema } from '../mcp/schemas/originalLanguageStudyV2.js';
import { validateOriginalLanguageStudyEvidenceTrust } from './originalLanguageStudyEvidenceTrust.js';

const validateSchema = new Ajv2020({ strict: true, strictTypes: false, allErrors: true })
  .compile(originalLanguageStudyV2OutputSchema);

export interface OriginalLanguageStudyV2StructuredPresentation {
  output: OriginalLanguageStudyV2Result;
  serialized: string;
}

/**
 * Deterministically fits detailed candidate evidence, validates every closed
 * schema and cross-field relation, then reports the exact UTF-8 byte total.
 * This is a library seam only; the v2 response remains globally unregistered.
 */
export function finalizeOriginalLanguageStudyV2Output(
  input: OriginalLanguageStudyV2Result,
): OriginalLanguageStudyV2StructuredPresentation {
  const output = structuredClone(input);
  if (output.detail === 'detailed' && hasRepositoryCandidates(output)) {
    const original = output.semanticEvidence.candidates.map(candidate => structuredClone(candidate));
    output.semanticEvidence.candidates = original.map(omitCandidateDetails) as typeof output.semanticEvidence.candidates;
    for (let index = 0; index < original.length; index += 1) {
      const candidate = original[index]!;
      if (candidate.detailStatus !== 'detailed') continue;
      const proposed = [...output.semanticEvidence.candidates];
      proposed[index] = candidate;
      const prior = output.semanticEvidence.candidates;
      output.semanticEvidence.candidates = proposed as typeof prior;
      if (!fitsByteWindow(output)) output.semanticEvidence.candidates = prior;
    }
  }
  const serialized = stableSerializeWithTruthfulWindow(output);
  validateOutput(output);
  return { output, serialized };
}

/** Validates an already materialized output without silently repairing it. */
export function serializeValidatedOriginalLanguageStudyV2Output(output: unknown): string {
  const cloned = structuredClone(output) as OriginalLanguageStudyV2Result;
  validateOutput(cloned);
  return stableSerializeWithTruthfulWindow(cloned, false);
}

function validateOutput(output: OriginalLanguageStudyV2Result): void {
  if (!validateSchema(output)) {
    throw new Error(`original_language_study v2 output violates its schema: ${JSON.stringify(validateSchema.errors)}`);
  }
  validateOriginalLanguageStudyEvidenceTrust(output);
}

function stableSerializeWithTruthfulWindow(
  output: OriginalLanguageStudyV2Result,
  permitRepair = true,
): string {
  if (!output || typeof output !== 'object' || !output.responseWindow) {
    throw new Error('original_language_study v2 output must include a response window');
  }
  if (!permitRepair && (!Number.isSafeInteger(output.responseWindow.used) || output.responseWindow.used < 1)) {
    throw new Error('original_language_study v2 response window used bytes must already be truthful');
  }
  let expected = permitRepair ? 1 : output.responseWindow.used;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    output.responseWindow.used = expected;
    const serialized = JSON.stringify(output);
    const actual = new TextEncoder().encode(serialized).byteLength;
    if (actual > ORIGINAL_LANGUAGE_STUDY_V2_RESPONSE_BYTES) {
      throw new Error(`original_language_study v2 output exceeds ${ORIGINAL_LANGUAGE_STUDY_V2_RESPONSE_BYTES} serialized UTF-8 bytes`);
    }
    if (actual === expected) return serialized;
    if (!permitRepair) throw new Error('original_language_study v2 response window used bytes are not truthful');
    expected = actual;
  }
  throw new Error('original_language_study v2 response byte accounting did not stabilize');
}

function fitsByteWindow(output: OriginalLanguageStudyV2Result): boolean {
  const candidate = structuredClone(output);
  try {
    stableSerializeWithTruthfulWindow(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('serialized UTF-8 bytes')) return false;
    throw error;
  }
}

function hasRepositoryCandidates(output: OriginalLanguageStudyV2Result): output is OriginalLanguageStudyV2Result & {
  semanticEvidence: Extract<OriginalLanguageStudyV2Result['semanticEvidence'], { status: 'lexical_candidates' | 'reference_aligned_source_candidate' }>;
} {
  return output.semanticEvidence.status === 'lexical_candidates'
    || output.semanticEvidence.status === 'reference_aligned_source_candidate';
}

function omitCandidateDetails(candidate: OriginalLanguageStudyV2Candidate): OriginalLanguageStudyV2Candidate {
  const identity = {
    sourceId: candidate.sourceId, sourceRole: candidate.sourceRole, entryId: candidate.entryId,
    senseId: candidate.senseId, sourceAttestedReferenceCount: candidate.sourceAttestedReferenceCount,
    referenceEvidenceIds: [...candidate.referenceEvidenceIds],
  };
  return { ...identity, detailStatus: 'omitted_response_byte_budget' };
}
