import Ajv2020 from 'ajv/dist/2020.js';
import { parseUbsPublicHebrewIdentity } from '../../../../src/kernel/ubsSemanticDomain.js';
import { parseUbsSemanticEvidenceBundleCursor } from '../../../../src/kernel/ubsSemanticEvidenceBundle.js';
import {
  ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_RESPONSE_BYTES,
  deriveOriginalLanguageStudyV2MorphologyTokenIdentity,
  parseOriginalLanguageStudyV2DraftCursor,
  type OriginalLanguageStudyV2DraftCandidate,
  type OriginalLanguageStudyV2DraftCursorBinding,
  type OriginalLanguageStudyV2DraftProvenanceSource,
  type OriginalLanguageStudyV2DraftResult,
  type OriginalLanguageStudyV2DraftResultWindow,
  type OriginalLanguageStudyV2DraftSelectedTokenWitness,
  type ServerVerifiedHebrewSemanticAlignment,
} from './originalLanguageStudyV2DraftContract.js';
import { originalLanguageStudyV2DraftOutputSchema } from './originalLanguageStudyV2DraftSchema.js';

const validateSchema = new Ajv2020({ strict: true, strictTypes: false, allErrors: true })
  .compile(originalLanguageStudyV2DraftOutputSchema);

export interface OriginalLanguageStudyV2DraftPresentation {
  output: OriginalLanguageStudyV2DraftResult;
  serialized: string;
}

/**
 * Fits detailed evidence deterministically, validates the fully discriminated
 * schema and relational contracts, then reports the exact serialized byte
 * count before returning to the coordinator.
 */
export function finalizeOriginalLanguageStudyV2DraftOutput(
  input: OriginalLanguageStudyV2DraftResult,
): OriginalLanguageStudyV2DraftPresentation {
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
  if (!validateSchema(output)) {
    throw new Error(`original_language_study v2 output violates its draft schema: ${JSON.stringify(validateSchema.errors)}`);
  }
  validateRelationalContract(output);
  return { output, serialized };
}

export function serializeValidatedOriginalLanguageStudyV2DraftOutput(output: unknown): string {
  const cloned = structuredClone(output) as OriginalLanguageStudyV2DraftResult;
  if (!validateSchema(cloned)) {
    throw new Error(`original_language_study v2 output violates its draft schema: ${JSON.stringify(validateSchema.errors)}`);
  }
  validateRelationalContract(cloned);
  return stableSerializeWithTruthfulWindow(cloned, false);
}

function stableSerializeWithTruthfulWindow(
  output: OriginalLanguageStudyV2DraftResult,
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
    if (actual > ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_RESPONSE_BYTES) {
      throw new Error(`original_language_study v2 output exceeds ${ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_RESPONSE_BYTES} serialized UTF-8 bytes`);
    }
    if (actual === expected) return serialized;
    if (!permitRepair) throw new Error('original_language_study v2 response window used bytes are not truthful');
    expected = actual;
  }
  throw new Error('original_language_study v2 response byte accounting did not stabilize');
}

function fitsByteWindow(output: OriginalLanguageStudyV2DraftResult): boolean {
  const candidate = structuredClone(output);
  try {
    stableSerializeWithTruthfulWindow(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('serialized UTF-8 bytes')) return false;
    throw error;
  }
}

function hasRepositoryCandidates(output: OriginalLanguageStudyV2DraftResult): output is OriginalLanguageStudyV2DraftResult & {
  semanticEvidence: Extract<OriginalLanguageStudyV2DraftResult['semanticEvidence'], { status: 'lexical_candidates' | 'reference_aligned_source_candidate' }>;
} {
  return output.semanticEvidence.status === 'lexical_candidates'
    || output.semanticEvidence.status === 'reference_aligned_source_candidate';
}

function omitCandidateDetails(candidate: OriginalLanguageStudyV2DraftCandidate): OriginalLanguageStudyV2DraftCandidate {
  const identity = {
    sourceId: candidate.sourceId, sourceRole: candidate.sourceRole, entryId: candidate.entryId,
    senseId: candidate.senseId, sourceAttestedReferenceCount: candidate.sourceAttestedReferenceCount,
    referenceEvidenceIds: [...candidate.referenceEvidenceIds],
  };
  return { ...identity, detailStatus: 'omitted_response_byte_budget' };
}

function validateRelationalContract(output: OriginalLanguageStudyV2DraftResult): void {
  const study = objectOf(output.study, 'output.study');
  const studyRequest = objectOf(study.request, 'output.study.request');
  const context = objectOf(study.context, 'output.study.context');
  if (study.kind !== 'original_language_study' || study.schemaVersion !== '1'
    || studyRequest.reference !== output.request.reference
    || context.reference !== output.request.reference
    || studyRequest.target !== output.request.target
    || (studyRequest.position ?? undefined) !== (output.request.position ?? undefined)) {
    throw new Error('v2 must compose one exact reference-, target-, and position-matching complete v1 study result');
  }
  const language = context.language;
  const evidence = output.semanticEvidence;
  if (language !== evidence.language) throw new Error('semantic evidence language must match the composed v1 study');
  if (language === 'Greek') {
    if (evidence.status !== 'not_applicable') throw new Error('Greek semantic evidence must be not_applicable');
    return;
  }
  if (evidence.status === 'unavailable' && (evidence.reason === 'selected_token_required'
    || evidence.reason === 'no_usable_hebrew_identity')) {
    if (evidence.reason === 'selected_token_required' && study.status !== 'needs_disambiguation') {
      throw new Error('selected_token_required must correspond to v1 needs_disambiguation');
    }
    if (evidence.reason === 'no_usable_hebrew_identity' && !context.selectedToken) {
      throw new Error('no_usable_hebrew_identity requires a selected v1 token');
    }
    return;
  }
  if (!('identity' in evidence) || !('resultWindow' in evidence) || !('provenance' in evidence)) {
    throw new Error('repository semantic evidence is incomplete');
  }
  const selectedToken = objectOf(context.selectedToken, 'output.study.context.selectedToken');
  const identity = parseUbsPublicHebrewIdentity(evidence.identity.publicStrongs);
  if (!identity || identity.publicStrongs !== evidence.identity.publicStrongs
    || identity.sourceIdentity !== evidence.identity.sourceIdentity) {
    throw new Error('semantic evidence identity must be one canonical public/source H-number pair');
  }
  const studyIdentity = study.identity === undefined ? undefined : objectOf(study.identity, 'output.study.identity');
  if ((studyIdentity?.publicStrongs ?? selectedToken.strongsNumber) !== evidence.identity.publicStrongs) {
    throw new Error('semantic identity must match the selected token in the composed v1 study');
  }
  validateWindow(output, evidence.resultWindow, selectedToken, evidence);
  const sources = evidence.provenance.sources;
  const dictionary = sources[0];
  const domains = sources[1];
  if (dictionary.sourceRole !== 'dictionary' || domains.sourceRole !== 'lexical_domains'
    || dictionary.artifactIdentity !== evidence.provenance.artifactIdentity
    || domains.artifactIdentity !== evidence.provenance.artifactIdentity) {
    throw new Error('provenance must retain exact dictionary/domain roles under one artifact identity');
  }
  if ('candidates' in evidence) {
    if (evidence.resultWindow.returnedCount !== evidence.candidates.length) {
      throw new Error('candidate count must equal resultWindow.returnedCount');
    }
    for (const candidate of evidence.candidates) {
      validateCandidateRoles(candidate, dictionary.sourceId, domains.sourceId, evidence.normalizedReference);
    }
  }
  if (evidence.status === 'reference_aligned_source_candidate') {
    if (evidence.candidates.length !== 1 || evidence.resultWindow.priorCount !== 0
      || evidence.resultWindow.totalCount !== 1 || evidence.resultWindow.hasMore) {
      throw new Error('reference-aligned status requires one complete terminal candidate');
    }
    const candidate = evidence.candidates[0]!;
    const alignment = evidence.alignmentEvidence;
    if (alignment.sourceId !== candidate.sourceId || alignment.entryId !== candidate.entryId
      || alignment.senseId !== candidate.senseId || candidate.referenceEvidenceIds.length !== 1
      || alignment.evidenceId !== candidate.referenceEvidenceIds[0]
      || alignment.sourceIdentity !== evidence.identity.sourceIdentity
      || alignment.normalizedReference !== evidence.normalizedReference
      || alignment.artifactIdentity !== evidence.provenance.artifactIdentity
      || alignment.artifactVersion !== dictionary.artifactVersion
      || !sameAlignmentArtifactSource(alignment.artifactSources.dictionary, dictionary)
      || !sameAlignmentArtifactSource(alignment.artifactSources.lexicalDomains, domains)
      || alignment.morphologyTokenCoordinates.canonicalReference !== context.reference
      || alignment.morphologyTokenCoordinates.normalizedReference !== evidence.normalizedReference
      || alignment.morphologyTokenCoordinates.position !== selectedToken.position
      || alignment.morphologyTokenWitness.text !== selectedToken.text
      || alignment.morphologyTokenWitness.lemma !== selectedToken.lemma
      || alignment.morphologyTokenWitness.strongsNumber !== selectedToken.strongsNumber
      || alignment.morphologyTokenWitness.morphologyCode !== selectedToken.morphologyCode
      || alignment.morphologyTokenWitness.gloss !== selectedToken.gloss
      || alignment.morphologyTokenIdentity !== deriveOriginalLanguageStudyV2MorphologyTokenIdentity({
        canonicalReference: context.reference as string,
        normalizedReference: evidence.normalizedReference,
        selectedToken: {
          position: selectedToken.position, text: selectedToken.text, lemma: selectedToken.lemma,
          strongsNumber: selectedToken.strongsNumber, morphologyCode: selectedToken.morphologyCode,
          gloss: selectedToken.gloss,
        } as OriginalLanguageStudyV2DraftSelectedTokenWitness,
      })) {
      throw new Error('alignment must bind the exact candidate and reference-evidence identity');
    }
  }
}

function sameAlignmentArtifactSource(
  proof: ServerVerifiedHebrewSemanticAlignment['artifactSources']['dictionary'],
  source: OriginalLanguageStudyV2DraftProvenanceSource,
): boolean {
  return proof.sourceId === source.sourceId
    && proof.sourceRole === source.sourceRole
    && proof.artifactName === source.artifactName
    && proof.artifactIdentity === source.artifactIdentity
    && proof.artifactVersion === source.artifactVersion
    && proof.sourceSha256 === source.sourceSha256;
}

function validateWindow(
  output: OriginalLanguageStudyV2DraftResult,
  window: OriginalLanguageStudyV2DraftResultWindow,
  selectedToken: Record<string, unknown>,
  evidence: Extract<OriginalLanguageStudyV2DraftResult['semanticEvidence'], { identity: unknown }>,
): void {
  if (window.priorCount + window.returnedCount !== window.consumedCount
    || window.consumedCount > window.totalCount
    || window.hasMore !== (window.consumedCount < window.totalCount)
    || window.hasMore !== (window.continuation !== undefined)) {
    throw new Error('semantic result-window arithmetic or terminal state is inconsistent');
  }
  if (!window.continuation) return;
  const binding: OriginalLanguageStudyV2DraftCursorBinding = {
    requestReference: output.request.reference,
    requestTarget: output.request.target,
    requestPosition: output.request.position ?? null,
    canonicalReference: objectOf(
      objectOf(output.study, 'output.study').context,
      'output.study.context',
    ).reference as string,
    selectedToken: {
      position: selectedToken.position as number, text: selectedToken.text as string,
      lemma: selectedToken.lemma as string, strongsNumber: selectedToken.strongsNumber as string | null,
      morphologyCode: selectedToken.morphologyCode as string | null, gloss: selectedToken.gloss as string | null,
    },
    publicStrongs: evidence.identity.publicStrongs,
    sourceIdentity: evidence.identity.sourceIdentity,
    normalizedReference: evidence.normalizedReference,
    artifactIdentity: evidence.provenance.artifactIdentity,
  };
  const repositoryCursor = parseOriginalLanguageStudyV2DraftCursor(window.continuation.cursor, binding);
  const parsed = parseUbsSemanticEvidenceBundleCursor(repositoryCursor, {
    artifactIdentity: evidence.provenance.artifactIdentity,
    sourceIdentity: evidence.identity.sourceIdentity,
    normalizedReference: evidence.normalizedReference,
  });
  if (parsed.priorShowing !== window.consumedCount) {
    throw new Error('context-bound continuation position must equal consumed results');
  }
}

function validateCandidateRoles(
  candidate: OriginalLanguageStudyV2DraftCandidate,
  dictionarySourceId: string,
  domainSourceId: string,
  normalizedReference: string,
): void {
  if (candidate.sourceRole !== 'dictionary' || candidate.sourceId !== dictionarySourceId
    || candidate.referenceEvidenceIds.length > candidate.sourceAttestedReferenceCount
    || new Set(candidate.referenceEvidenceIds).size !== candidate.referenceEvidenceIds.length) {
    throw new Error('candidate identity does not belong to the dictionary provenance source');
  }
  if (candidate.detailStatus !== 'detailed') return;
  if (candidate.domains.some(domain => domain.sourceRole !== 'lexical_domains' || domain.sourceId !== domainSourceId)
    || candidate.referenceEvidence.some(reference => reference.sourceRole !== 'dictionary'
      || reference.sourceId !== dictionarySourceId || reference.senseId !== candidate.senseId
      || reference.normalizedReference !== normalizedReference)
    || candidate.referenceEvidence.length !== candidate.referenceEvidenceIds.length
    || candidate.referenceEvidence.some((reference, index) => reference.evidenceId !== candidate.referenceEvidenceIds[index])) {
    throw new Error('candidate nested evidence does not match provenance roles and source identities');
  }
}

function objectOf(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
