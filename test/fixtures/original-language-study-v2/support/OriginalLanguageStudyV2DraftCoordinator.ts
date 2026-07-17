import {
  queryUbsSemanticEvidenceBundle,
  type IUbsSemanticEvidenceBundleRepository,
  type UbsSemanticEvidenceBundle,
  type UbsSemanticEvidenceBundleCandidateRow,
} from '../../../../src/kernel/ubsSemanticEvidenceBundle.js';
import {
  parseUbsPublicHebrewIdentity,
  requireUbsSemanticNormalizedReference,
  type UbsPublicHebrewStrongs,
  type UbsSemanticSource,
} from '../../../../src/kernel/ubsSemanticDomain.js';
import { presentOriginalLanguageStudy } from '../../../../src/presenters/originalLanguageStudyStructured.js';
import type { OriginalLanguageStudyDomainResult } from '../../../../src/services/languages/OriginalLanguageStudyService.js';
import {
  ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_OPERATION,
  ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_RESPONSE_BYTES,
  ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_SCHEMA_VERSION,
  createOriginalLanguageStudyV2DraftCursor,
  parseOriginalLanguageStudyV2DraftCursor,
  type IOriginalLanguageStudyV2DraftContextProvider,
  type OriginalLanguageStudyV2DraftAuthoritativeContext,
  type OriginalLanguageStudyV2DraftCandidate,
  type OriginalLanguageStudyV2DraftCursorBinding,
  type OriginalLanguageStudyV2DraftDetail,
  type OriginalLanguageStudyV2DraftProvenanceSource,
  type OriginalLanguageStudyV2DraftResolvedRequest,
  type OriginalLanguageStudyV2DraftResult,
  type OriginalLanguageStudyV2DraftResultWindow,
  type OriginalLanguageStudyV2DraftSemanticEvidence,
  type ServerVerifiedHebrewSemanticAlignment,
} from './originalLanguageStudyV2DraftContract.js';
import {
  finalizeOriginalLanguageStudyV2DraftOutput,
  type OriginalLanguageStudyV2DraftPresentation,
} from './originalLanguageStudyV2DraftStructured.js';

export type {
  IOriginalLanguageStudyV2DraftContextProvider,
  OriginalLanguageStudyV2DraftAuthoritativeContext,
  OriginalLanguageStudyV2DraftResolvedRequest,
} from './originalLanguageStudyV2DraftContract.js';

const WITHHELD_EVIDENCE = Object.freeze([
  Object.freeze({ source: 'TBESH' as const, field: 'Meaning' as const, status: 'withheld_rights_boundary' as const }),
  Object.freeze({
    source: 'UBS Hebrew dictionary' as const,
    field: 'A#### lexical identities' as const,
    status: 'withheld_public_v2_scope' as const,
  }),
] as const);

/**
 * Synthetic-only coordinator. It composes the exact current v1 structured
 * result and adds a separate Hebrew semantic layer. Eligible Hebrew calls make
 * exactly one aggregate repository call.
 */
export class OriginalLanguageStudyV2DraftCoordinator {
  constructor(
    private readonly contextProvider: IOriginalLanguageStudyV2DraftContextProvider,
    private readonly evidenceRepository: IUbsSemanticEvidenceBundleRepository,
  ) {}

  async study(input: unknown): Promise<OriginalLanguageStudyV2DraftPresentation> {
    const request = snapshotRequest(input);
    const authoritative = snapshotAuthoritativeContext(await this.contextProvider.resolve(request));
    validateV1ResultAgainstRequest(authoritative.v1Result, request);
    const study = presentOriginalLanguageStudy(authoritative.v1Result, request.position);
    const semanticEvidence = await this.semanticEvidence(request, authoritative);
    const output: OriginalLanguageStudyV2DraftResult = {
      schemaVersion: ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_SCHEMA_VERSION,
      kind: 'original_language_study',
      detail: request.detail,
      request: {
        reference: request.reference,
        target: request.target,
        ...(request.position === undefined ? {} : { position: request.position }),
      },
      study,
      semanticEvidence,
      responseWindow: {
        unit: 'utf8_bytes', maximum: ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_RESPONSE_BYTES,
        used: 0, truncated: false,
      },
    };
    return finalizeOriginalLanguageStudyV2DraftOutput(output);
  }

  private async semanticEvidence(
    request: OriginalLanguageStudyV2DraftResolvedRequest,
    authoritative: OriginalLanguageStudyV2DraftAuthoritativeContext,
  ): Promise<OriginalLanguageStudyV2DraftSemanticEvidence> {
    const v1 = authoritative.v1Result;
    if (v1.language === 'Greek') {
      if (request.cursor !== undefined) throw new Error('original_language_study v2 semantic continuation is Hebrew-only');
      return {
        language: 'Greek', status: 'not_applicable', reason: 'hebrew_semantic_evidence_not_applicable',
        plainLanguage: 'The added UBS semantic layer is Hebrew-only. The complete existing Greek evidence remains in study and is not replaced or reduced.',
      };
    }
    if (v1.status === 'needs_disambiguation' || !v1.selectedToken) {
      if (request.cursor !== undefined) throw new Error('original_language_study v2 cursor requires one server-selected Hebrew token');
      return {
        language: 'Hebrew', status: 'unavailable', reason: 'selected_token_required',
        plainLanguage: 'Choose one of the verse-token positions in study before requesting Hebrew semantic candidates.',
      };
    }
    const publicStrongs = v1.identity?.publicStrongs ?? v1.selectedToken.strongsNumber;
    const identity = typeof publicStrongs === 'string' ? parseUbsPublicHebrewIdentity(publicStrongs) : undefined;
    if (!identity || identity.publicStrongs !== publicStrongs) {
      if (request.cursor !== undefined) throw new Error('original_language_study v2 cursor requires one canonical public Hebrew H-number');
      return {
        language: 'Hebrew', status: 'unavailable', reason: 'no_usable_hebrew_identity',
        plainLanguage: 'The selected Hebrew token has no canonical public H-number, so the added semantic repository is not queried.',
      };
    }
    if (authoritative.semanticArtifactIdentity === undefined) {
      throw new Error('server-authoritative Hebrew semantic context must provide the exact artifact identity');
    }
    const normalizedReference = requireUbsSemanticNormalizedReference(
      v1.reference,
      'server-authoritative original-language normalized reference',
    );
    const binding: OriginalLanguageStudyV2DraftCursorBinding = {
      requestReference: request.reference,
      requestTarget: request.target,
      requestPosition: request.position ?? null,
      canonicalReference: v1.reference,
      selectedToken: snapshotSelectedToken(v1.selectedToken),
      publicStrongs: identity.publicStrongs,
      sourceIdentity: identity.sourceIdentity,
      normalizedReference,
      artifactIdentity: authoritative.semanticArtifactIdentity,
    };
    const repositoryCursor = request.cursor === undefined
      ? undefined : parseOriginalLanguageStudyV2DraftCursor(request.cursor, binding);
    const bundle = await queryUbsSemanticEvidenceBundle(this.evidenceRepository, {
      artifactIdentity: authoritative.semanticArtifactIdentity,
      sourceIdentity: identity.sourceIdentity,
      normalizedReference,
      ...(repositoryCursor === undefined ? {} : { page: { cursor: repositoryCursor } }),
    });
    return buildHebrewEvidence(bundle, request.detail, identity.publicStrongs,
      authoritative.serverVerifiedAlignment, binding);
  }
}

function buildHebrewEvidence(
  bundle: UbsSemanticEvidenceBundle,
  detail: OriginalLanguageStudyV2DraftDetail,
  publicStrongs: UbsPublicHebrewStrongs,
  alignment: ServerVerifiedHebrewSemanticAlignment | undefined,
  binding: OriginalLanguageStudyV2DraftCursorBinding,
): OriginalLanguageStudyV2DraftSemanticEvidence {
  const candidateWindow = bundle.coverage.candidateWindow;
  const resultWindow: OriginalLanguageStudyV2DraftResultWindow = {
    priorCount: candidateWindow.priorCount,
    returnedCount: candidateWindow.returnedCount,
    consumedCount: candidateWindow.consumedCount,
    totalCount: candidateWindow.totalCount,
    hasMore: candidateWindow.hasMore,
    ...(candidateWindow.nextCursor === undefined ? {} : {
      continuation: {
        cursor: createOriginalLanguageStudyV2DraftCursor(candidateWindow.nextCursor, binding),
        operation: ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_OPERATION,
      },
    }),
  };
  const sources = bundle.sources.map(presentProvenanceSource);
  if (sources.length !== 2) throw new Error('semantic aggregate must retain exactly two provenance sources');
  const common = {
    language: 'Hebrew' as const,
    identity: { publicStrongs, sourceIdentity: bundle.query.sourceIdentity },
    normalizedReference: bundle.query.normalizedReference,
    resultWindow,
    provenance: {
      artifactIdentity: bundle.query.artifactIdentity,
      sources: sources as [OriginalLanguageStudyV2DraftProvenanceSource, OriginalLanguageStudyV2DraftProvenanceSource],
    },
    withheldEvidence: WITHHELD_EVIDENCE,
  };
  if (bundle.coverage.semanticSenseTotal === 0) {
    return {
      ...common,
      status: 'unavailable',
      reason: bundle.coverage.lexicalEntryTotal === 0 ? 'no_lexical_entry' : 'no_publishable_semantic_evidence',
      plainLanguage: bundle.coverage.lexicalEntryTotal === 0
        ? 'No publishable Hebrew semantic entry is available for the selected token identity.'
        : 'A Hebrew lexical entry exists, but no publishable semantic sense is available.',
      candidates: [],
    };
  }
  const candidates = bundle.candidates.map(candidate => presentCandidate(candidate, detail));
  const aligned = exactServerVerifiedCandidate(bundle, alignment);
  if (aligned) {
    return {
      ...common,
      status: 'reference_aligned_source_candidate',
      plainLanguage: 'One source candidate is attested at this reference and server-verified against the selected token. It remains a candidate, not an adjudicated contextual meaning.',
      candidates: [candidates[0]!],
      alignmentEvidence: aligned,
    };
  }
  if (alignment !== undefined) {
    throw new Error('server-authoritative alignment does not match one complete exact aggregate candidate');
  }
  const reason = candidateReason(bundle);
  return {
    ...common,
    status: 'lexical_candidates',
    reason,
    plainLanguage: reason === 'no_reference_evidence'
      ? 'The lexical candidates have no source-attested evidence for this exact reference. No contextual meaning has been resolved.'
      : reason === 'ambiguous_reference_alignment'
        ? 'More than one candidate or source-reference row remains. No contextual meaning has been resolved.'
        : 'Candidate evidence is available, but no single server-verified alignment is available. No contextual meaning has been resolved.',
    candidates,
  };
}

function presentCandidate(
  candidate: UbsSemanticEvidenceBundleCandidateRow,
  detail: OriginalLanguageStudyV2DraftDetail,
): OriginalLanguageStudyV2DraftCandidate {
  const identity = {
    sourceId: candidate.sense.sourceId,
    sourceRole: 'dictionary' as const,
    entryId: candidate.entry.entryId,
    senseId: candidate.sense.senseId,
    sourceAttestedReferenceCount: candidate.matchingReferenceTotal,
    referenceEvidenceIds: candidate.matchingReferences.map(evidence => evidence.evidenceId),
  };
  if (detail === 'summary') return { ...identity, detailStatus: 'summary' };
  return {
    ...identity,
    detailStatus: 'detailed',
    lemma: candidate.entry.lemma,
    definition: candidate.sense.definition,
    glosses: [...candidate.sense.glosses],
    domains: candidate.domains.map(domain => ({
      sourceId: domain.sourceId, sourceRole: 'lexical_domains' as const,
      domainId: domain.domainId, label: domain.label,
      ...(domain.description === undefined ? {} : { description: domain.description }),
    })),
    domainTotal: candidate.domainTotal,
    referenceEvidence: candidate.matchingReferences.map(evidence => ({
      sourceId: evidence.sourceId, sourceRole: 'dictionary' as const,
      senseId: evidence.senseId, evidenceId: evidence.evidenceId,
      sourceReference: evidence.sourceReference, normalizedReference: evidence.normalizedReference,
      kind: evidence.evidenceKind,
    })),
    referenceEvidenceTotal: candidate.matchingReferenceTotal,
  };
}

function exactServerVerifiedCandidate(
  bundle: UbsSemanticEvidenceBundle,
  alignment: ServerVerifiedHebrewSemanticAlignment | undefined,
): ServerVerifiedHebrewSemanticAlignment | undefined {
  if (alignment === undefined || !bundle.coverage.completeForWholeQuery || bundle.candidates.length !== 1
    || bundle.coverage.semanticSenseTotal !== 1) return undefined;
  const candidate = bundle.candidates[0]!;
  const evidence = candidate.matchingReferences[0];
  if (candidate.matchingReferenceTotal !== 1 || candidate.matchingReferences.length !== 1 || !evidence
    || alignment.sourceId !== candidate.sense.sourceId || alignment.entryId !== candidate.entry.entryId
    || alignment.senseId !== candidate.sense.senseId || alignment.evidenceId !== evidence.evidenceId) return undefined;
  return { ...alignment };
}

function candidateReason(bundle: UbsSemanticEvidenceBundle):
  'no_reference_evidence' | 'reference_alignment_unproven' | 'ambiguous_reference_alignment' {
  if (!bundle.coverage.completeForWholeQuery) return 'reference_alignment_unproven';
  const total = bundle.candidates.reduce((sum, candidate) => sum + candidate.matchingReferenceTotal, 0);
  if (total === 0) return 'no_reference_evidence';
  return bundle.candidates.length !== 1 || total !== 1
    ? 'ambiguous_reference_alignment' : 'reference_alignment_unproven';
}

function presentProvenanceSource(source: UbsSemanticSource): OriginalLanguageStudyV2DraftProvenanceSource {
  return {
    sourceId: source.sourceId, sourceRole: source.sourceRole, artifactName: source.artifactName,
    artifactVersion: source.artifactVersion, artifactIdentity: source.artifactIdentity,
    sourceUrl: source.sourceUrl, sourceCommit: source.sourceCommit, sourceBlob: source.sourceBlob,
    sourceSha256: source.sourceSha256, publisher: source.publisher, license: source.license,
    licenseUrl: source.licenseUrl, transformVersion: source.transformVersion, modified: source.modified,
    modificationNote: source.modificationNote,
  };
}

function snapshotRequest(input: unknown): Readonly<OriginalLanguageStudyV2DraftResolvedRequest> {
  const record = objectOf(input, 'original_language_study v2 request');
  exactKeys(record, ['reference', 'target', 'position', 'detail', 'cursor'], ['reference', 'target']);
  const reference = text(record.reference, 100, 'request.reference');
  const target = text(record.target, 100, 'request.target');
  const position = record.position;
  if (position !== undefined && (typeof position !== 'number' || !Number.isSafeInteger(position)
    || position < 1 || position > 200)) throw new Error('request.position must be an integer from 1 through 200');
  const detail = record.detail;
  if (detail !== undefined && detail !== 'summary' && detail !== 'detailed') {
    throw new Error('request.detail must be summary or detailed');
  }
  const cursor = record.cursor;
  if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > 12 * 1024)) {
    throw new Error('request.cursor must be a bounded opaque string');
  }
  return Object.freeze({
    reference, target, ...(position === undefined ? {} : { position }), detail: detail ?? 'summary',
    ...(cursor === undefined ? {} : { cursor }),
  });
}

function snapshotAuthoritativeContext(input: unknown): OriginalLanguageStudyV2DraftAuthoritativeContext {
  const record = objectOf(input, 'server-authoritative v2 context');
  exactKeys(record, ['v1Result', 'semanticArtifactIdentity', 'serverVerifiedAlignment'], ['v1Result']);
  const v1Result = structuredClone(record.v1Result) as OriginalLanguageStudyDomainResult;
  const artifact = record.semanticArtifactIdentity;
  if (artifact !== undefined && (typeof artifact !== 'string' || !/^[0-9a-f]{64}$/.test(artifact))) {
    throw new Error('server-authoritative artifact identity must be a lowercase SHA-256');
  }
  const alignment = record.serverVerifiedAlignment === undefined
    ? undefined : snapshotAlignment(record.serverVerifiedAlignment);
  return Object.freeze({
    v1Result, ...(artifact === undefined ? {} : { semanticArtifactIdentity: artifact }),
    ...(alignment === undefined ? {} : { serverVerifiedAlignment: alignment }),
  });
}

function validateV1ResultAgainstRequest(
  result: OriginalLanguageStudyDomainResult,
  request: OriginalLanguageStudyV2DraftResolvedRequest,
): void {
  if (!result || (result.language !== 'Greek' && result.language !== 'Hebrew')
    || result.target !== request.target || result.reference !== request.reference) {
    throw new Error('server-authoritative v1 study does not exactly match the caller reference, target, and language contract');
  }
  if (result.status !== 'complete' && result.status !== 'partial' && result.status !== 'needs_disambiguation') {
    throw new Error('server-authoritative v1 study has an unsupported status');
  }
  if (request.position !== undefined && result.selectedToken && result.selectedToken.position !== request.position) {
    throw new Error('server-authoritative selected token does not match the caller position');
  }
}

function snapshotSelectedToken(token: NonNullable<OriginalLanguageStudyDomainResult['selectedToken']>) {
  return Object.freeze({
    position: token.position, text: token.text, lemma: token.lemma,
    strongsNumber: token.strongsNumber, morphologyCode: token.morphologyCode, gloss: token.gloss,
  });
}

function snapshotAlignment(input: unknown): ServerVerifiedHebrewSemanticAlignment {
  const record = objectOf(input, 'server-verified alignment');
  exactKeys(record,
    ['status', 'morphologyTokenIdentity', 'verifierVersion', 'sourceId', 'entryId', 'senseId', 'evidenceId'],
    ['status', 'morphologyTokenIdentity', 'verifierVersion', 'sourceId', 'entryId', 'senseId', 'evidenceId']);
  if (record.status !== 'verified_token_alignment') throw new Error('alignment status must be verified_token_alignment');
  if (typeof record.verifierVersion !== 'number' || !Number.isSafeInteger(record.verifierVersion)
    || record.verifierVersion < 1 || record.verifierVersion > 1_000_000) throw new Error('alignment verifier version is invalid');
  return Object.freeze({
    status: 'verified_token_alignment',
    morphologyTokenIdentity: text(record.morphologyTokenIdentity, 512, 'alignment.morphologyTokenIdentity'),
    verifierVersion: record.verifierVersion,
    sourceId: identifier(record.sourceId, 'alignment.sourceId'),
    entryId: identifier(record.entryId, 'alignment.entryId'),
    senseId: identifier(record.senseId, 'alignment.senseId'),
    evidenceId: identifier(record.evidenceId, 'alignment.evidenceId'),
  });
}

function objectOf(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${label} must be an object`);
  return input as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): void {
  if (Object.keys(record).some(key => !allowed.includes(key)) || required.some(key => !(key in record))) {
    throw new Error('original_language_study v2 context has an unexpected or missing field');
  }
}

function text(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value !== value.normalize('NFC')
    || [...value].length > maximum || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)) {
    throw new Error(`${label} must be non-empty, trimmed, NFC, bounded, and control-free`);
  }
  return value;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 128
    || !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value)) throw new Error(`${label} is not canonical`);
  return value;
}
