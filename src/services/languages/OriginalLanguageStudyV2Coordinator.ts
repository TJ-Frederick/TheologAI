import {
  queryUbsSemanticEvidenceBundle,
  type IUbsSemanticEvidenceBundleRepository,
  type UbsSemanticEvidenceBundle,
  type UbsSemanticEvidenceBundleCandidateRow,
} from '../../kernel/ubsSemanticEvidenceBundle.js';
import {
  parseUbsPublicHebrewIdentity,
  requireUbsSemanticNormalizedReference,
  type UbsInternalHebrewLexicalIdentity,
  type UbsPublicHebrewStrongs,
  type UbsSemanticSource,
} from '../../kernel/ubsSemanticDomain.js';
import { formatReference, parseReference, referencesEqual, toHelloAO } from '../../kernel/reference.js';
import {
  ORIGINAL_LANGUAGE_STUDY_V2_CURSOR_OPERATION,
  ORIGINAL_LANGUAGE_STUDY_V2_RESPONSE_BYTES,
  ORIGINAL_LANGUAGE_STUDY_V2_SCHEMA_VERSION,
  createOriginalLanguageStudyV2Cursor,
  deriveOriginalLanguageStudyV2MorphologyTokenIdentity,
  parseOriginalLanguageStudyV2Cursor,
  type IOriginalLanguageStudyV2ContextProvider,
  type OriginalLanguageStudyV2AuthoritativeContext,
  type OriginalLanguageStudyV2Candidate,
  type OriginalLanguageStudyV2CursorBinding,
  type OriginalLanguageStudyV2Detail,
  type OriginalLanguageStudyV2ProvenanceSource,
  type OriginalLanguageStudyV2ResolvedRequest,
  type OriginalLanguageStudyV2Result,
  type OriginalLanguageStudyV2ResultWindow,
  type OriginalLanguageStudyV2SemanticEvidence,
  type ServerVerifiedHebrewSemanticAlignment,
} from '../../kernel/originalLanguageStudyV2Contract.js';
import { presentOriginalLanguageStudy } from '../../presenters/originalLanguageStudyStructured.js';
import {
  finalizeOriginalLanguageStudyV2Output,
  type OriginalLanguageStudyV2StructuredPresentation,
} from '../../presenters/originalLanguageStudyV2Structured.js';
import { formatOriginalLanguageStudyV2 } from '../../formatters/originalLanguageStudyV2Formatter.js';
import type { OriginalLanguageStudyDomainResult } from './OriginalLanguageStudyService.js';

export type {
  IOriginalLanguageStudyV2ContextProvider,
  OriginalLanguageStudyV2AuthoritativeContext,
  OriginalLanguageStudyV2ResolvedRequest,
} from '../../kernel/originalLanguageStudyV2Contract.js';

/**
 * The coordinator returns both the closed structured v2 packet and a
 * textual rendering that begins with the complete existing v1 rendering.  The
 * latter is intentionally composed only after the v2 result has passed its
 * own exact-byte validation; it is not a second, lossy v1 projection.
 */
export interface OriginalLanguageStudyV2Presentation extends OriginalLanguageStudyV2StructuredPresentation {
  markdown: string;
}

const WITHHELD_EVIDENCE = Object.freeze([
  Object.freeze({ source: 'TBESH' as const, field: 'Meaning' as const, status: 'withheld_rights_boundary' as const }),
  Object.freeze({
    source: 'UBS Hebrew dictionary' as const,
    field: 'A#### lexical identities' as const,
    status: 'withheld_public_v2_scope' as const,
  }),
] as const);

/**
 * Active v2 coordinator. Eligible Hebrew calls execute one aggregate
 * repository operation; neither source identity nor alignment proof is
 * caller-controlled.
 */
export class OriginalLanguageStudyV2Coordinator {
  constructor(
    private readonly contextProvider: IOriginalLanguageStudyV2ContextProvider,
    private readonly evidenceRepository: IUbsSemanticEvidenceBundleRepository,
  ) {}

  async study(input: unknown): Promise<OriginalLanguageStudyV2Presentation> {
    const request = snapshotRequest(input);
    const authoritative = snapshotAuthoritativeContext(await this.contextProvider.resolve(request));
    const canonicalReference = validateV1ResultAgainstRequest(authoritative.v1Result, request);
    const study = presentOriginalLanguageStudy(authoritative.v1Result, request.position);
    const semanticEvidence = await this.semanticEvidence(request, authoritative, canonicalReference);
    const output: OriginalLanguageStudyV2Result = {
      schemaVersion: ORIGINAL_LANGUAGE_STUDY_V2_SCHEMA_VERSION,
      kind: 'original_language_study',
      detail: request.detail,
      request: {
        // Keep the supplied spelling as an auditable request record. The
        // composed v1 study and semantic reference are canonical, while this
        // raw value remains part of the continuation binding.
        reference: request.reference,
        target: request.target,
        ...(request.position === undefined ? {} : { position: request.position }),
      },
      study,
      semanticEvidence,
      responseWindow: {
        unit: 'utf8_bytes', maximum: ORIGINAL_LANGUAGE_STUDY_V2_RESPONSE_BYTES,
        used: 0, truncated: false,
      },
    };
    const presentation = finalizeOriginalLanguageStudyV2Output(output);
    return {
      ...presentation,
      markdown: formatOriginalLanguageStudyV2(presentation.output, authoritative.v1Result),
    };
  }

  private async semanticEvidence(
    request: OriginalLanguageStudyV2ResolvedRequest,
    authoritative: OriginalLanguageStudyV2AuthoritativeContext,
    canonicalReference: CanonicalOriginalLanguageStudyReference,
  ): Promise<OriginalLanguageStudyV2SemanticEvidence> {
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
    const binding: OriginalLanguageStudyV2CursorBinding = {
      requestReference: request.reference,
      requestTarget: request.target,
      requestPosition: request.position ?? null,
      detail: request.detail,
      canonicalReference: canonicalReference.display,
      selectedToken: snapshotSelectedToken(v1.selectedToken),
      publicStrongs: identity.publicStrongs,
      sourceIdentity: identity.sourceIdentity,
      normalizedReference: canonicalReference.semanticKey,
      artifactIdentity: authoritative.semanticArtifactIdentity,
    };
    const repositoryCursor = request.cursor === undefined
      ? undefined : parseOriginalLanguageStudyV2Cursor(request.cursor, binding);
    const bundle = await queryUbsSemanticEvidenceBundle(this.evidenceRepository, {
      artifactIdentity: authoritative.semanticArtifactIdentity,
      sourceIdentity: identity.sourceIdentity,
      normalizedReference: canonicalReference.semanticKey,
      ...(repositoryCursor === undefined ? {} : { page: { cursor: repositoryCursor } }),
    });
    return buildHebrewEvidence(bundle, request.detail, identity.publicStrongs,
      authoritative.serverVerifiedAlignment, binding);
  }
}

function buildHebrewEvidence(
  bundle: UbsSemanticEvidenceBundle,
  detail: OriginalLanguageStudyV2Detail,
  publicStrongs: UbsPublicHebrewStrongs,
  alignment: ServerVerifiedHebrewSemanticAlignment | undefined,
  binding: OriginalLanguageStudyV2CursorBinding,
): OriginalLanguageStudyV2SemanticEvidence {
  const candidateWindow = bundle.coverage.candidateWindow;
  const resultWindow: OriginalLanguageStudyV2ResultWindow = {
    priorCount: candidateWindow.priorCount,
    returnedCount: candidateWindow.returnedCount,
    consumedCount: candidateWindow.consumedCount,
    totalCount: candidateWindow.totalCount,
    hasMore: candidateWindow.hasMore,
    ...(candidateWindow.nextCursor === undefined ? {} : {
      continuation: {
        cursor: createOriginalLanguageStudyV2Cursor(candidateWindow.nextCursor, binding),
        operation: ORIGINAL_LANGUAGE_STUDY_V2_CURSOR_OPERATION,
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
      sources: sources as [OriginalLanguageStudyV2ProvenanceSource, OriginalLanguageStudyV2ProvenanceSource],
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
  const aligned = exactServerVerifiedCandidate(bundle, alignment, binding);
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
  detail: OriginalLanguageStudyV2Detail,
): OriginalLanguageStudyV2Candidate {
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
    definitionStatus: candidate.sense.definitionStatus,
    ...(candidate.sense.definition === undefined ? {} : { definition: candidate.sense.definition }),
    definitionExclusionReasons: [...candidate.sense.definitionExclusionReasons],
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
  binding: OriginalLanguageStudyV2CursorBinding,
): ServerVerifiedHebrewSemanticAlignment | undefined {
  if (alignment === undefined || !bundle.coverage.completeForWholeQuery || bundle.candidates.length !== 1
    || bundle.coverage.semanticSenseTotal !== 1) return undefined;
  const candidate = bundle.candidates[0]!;
  const evidence = candidate.matchingReferences[0];
  const dictionary = bundle.sources.find(source => source.sourceRole === 'dictionary');
  const lexicalDomains = bundle.sources.find(source => source.sourceRole === 'lexical_domains');
  if (candidate.matchingReferenceTotal !== 1 || candidate.matchingReferences.length !== 1 || !evidence
    || bundle.sources.length !== 2 || !dictionary || !lexicalDomains
    || alignment.sourceIdentity !== bundle.query.sourceIdentity
    || alignment.normalizedReference !== bundle.query.normalizedReference
    || alignment.normalizedReference !== binding.normalizedReference
    || alignment.artifactIdentity !== bundle.query.artifactIdentity
    || alignment.artifactVersion !== '0.9.2'
    || !sameArtifactSource(alignment.artifactSources.dictionary, dictionary)
    || !sameArtifactSource(alignment.artifactSources.lexicalDomains, lexicalDomains)
    || alignment.morphologyTokenIdentity !== deriveOriginalLanguageStudyV2MorphologyTokenIdentity(binding)
    || alignment.morphologyTokenCoordinates.canonicalReference !== binding.canonicalReference
    || alignment.morphologyTokenCoordinates.normalizedReference !== binding.normalizedReference
    || alignment.morphologyTokenCoordinates.position !== binding.selectedToken.position
    || !sameSelectedTokenWitness(alignment.morphologyTokenWitness, binding.selectedToken)
    || alignment.sourceId !== candidate.sense.sourceId || alignment.entryId !== candidate.entry.entryId
    || alignment.senseId !== candidate.sense.senseId || alignment.evidenceId !== evidence.evidenceId) return undefined;
  return { ...alignment };
}

function sameArtifactSource(
  proof: ServerVerifiedHebrewSemanticAlignment['artifactSources']['dictionary'],
  source: UbsSemanticSource,
): boolean {
  return proof.sourceId === source.sourceId
    && proof.sourceRole === source.sourceRole
    && proof.artifactName === source.artifactName
    && proof.artifactIdentity === source.artifactIdentity
    && proof.artifactVersion === source.artifactVersion
    && proof.sourceSha256 === source.sourceSha256;
}

function sameSelectedTokenWitness(
  proof: ServerVerifiedHebrewSemanticAlignment['morphologyTokenWitness'],
  selected: OriginalLanguageStudyV2CursorBinding['selectedToken'],
): boolean {
  return proof.text === selected.text
    && proof.lemma === selected.lemma
    && proof.strongsNumber === selected.strongsNumber
    && proof.morphologyCode === selected.morphologyCode
    && proof.gloss === selected.gloss;
}

function candidateReason(bundle: UbsSemanticEvidenceBundle):
  'no_reference_evidence' | 'reference_alignment_unproven' | 'ambiguous_reference_alignment' {
  if (!bundle.coverage.completeForWholeQuery) return 'reference_alignment_unproven';
  const total = bundle.candidates.reduce((sum, candidate) => sum + candidate.matchingReferenceTotal, 0);
  if (total === 0) return 'no_reference_evidence';
  return bundle.candidates.length !== 1 || total !== 1
    ? 'ambiguous_reference_alignment' : 'reference_alignment_unproven';
}

function presentProvenanceSource(source: UbsSemanticSource): OriginalLanguageStudyV2ProvenanceSource {
  return {
    sourceId: source.sourceId, sourceRole: source.sourceRole, artifactName: source.artifactName,
    artifactVersion: source.artifactVersion, artifactIdentity: source.artifactIdentity,
    sourceUrl: source.sourceUrl, sourceCommit: source.sourceCommit, sourceBlob: source.sourceBlob,
    sourceSha256: source.sourceSha256, publisher: source.publisher, license: source.license,
    licenseUrl: source.licenseUrl, transformVersion: source.transformVersion, modified: source.modified,
    modificationNote: source.modificationNote,
  };
}

function snapshotRequest(input: unknown): Readonly<OriginalLanguageStudyV2ResolvedRequest> {
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

function snapshotAuthoritativeContext(input: unknown): OriginalLanguageStudyV2AuthoritativeContext {
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

interface CanonicalOriginalLanguageStudyReference {
  display: string;
  semanticKey: string;
  language: 'Greek' | 'Hebrew';
}

function validateV1ResultAgainstRequest(
  result: OriginalLanguageStudyDomainResult,
  request: OriginalLanguageStudyV2ResolvedRequest,
): CanonicalOriginalLanguageStudyReference {
  const requested = canonicalOriginalLanguageStudyReference(request.reference, 'request.reference');
  if (!result || (result.language !== 'Greek' && result.language !== 'Hebrew')
    || result.target !== request.target || result.language !== requested.language) {
    throw new Error('server-authoritative v1 study does not exactly match the caller reference, target, and language contract');
  }
  const resolved = canonicalOriginalLanguageStudyReference(result.reference, 'server-authoritative v1 reference');
  if (!referencesEqual(parseReference(request.reference), parseReference(result.reference))
    || resolved.display !== requested.display || result.reference !== requested.display) {
    throw new Error('server-authoritative v1 study must be semantically equivalent to the caller reference and publish its canonical display reference');
  }
  if (result.status !== 'complete' && result.status !== 'partial' && result.status !== 'needs_disambiguation') {
    throw new Error('server-authoritative v1 study has an unsupported status');
  }
  if (request.position !== undefined && result.selectedToken && result.selectedToken.position !== request.position) {
    throw new Error('server-authoritative selected token does not match the caller position');
  }
  return requested;
}

function canonicalOriginalLanguageStudyReference(
  raw: string,
  label: string,
): CanonicalOriginalLanguageStudyReference {
  let reference;
  try {
    reference = parseReference(raw);
  } catch {
    throw new Error(`${label} must be one canonical Bible verse`);
  }
  if (reference.startVerse === undefined || reference.endVerse !== undefined) {
    throw new Error(`${label} must be exactly one Bible verse`);
  }
  const display = formatReference(reference);
  const semanticKey = requireUbsSemanticNormalizedReference(
    `${toHelloAO(reference).bookCode} ${reference.chapter}:${reference.startVerse}`,
    `${label} UBS semantic key`,
  );
  return {
    display,
    semanticKey,
    language: reference.book.testament === 'NT' ? 'Greek' : 'Hebrew',
  };
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
    [
      'status', 'proofContract', 'verifierVersion', 'sourceIdentity', 'normalizedReference',
      'artifactIdentity', 'artifactVersion', 'artifactSources', 'sourceId', 'entryId', 'senseId', 'evidenceId',
      'morphologyTokenIdentity', 'morphologyTokenCoordinates', 'morphologyTokenWitness',
    ],
    [
      'status', 'proofContract', 'verifierVersion', 'sourceIdentity', 'normalizedReference',
      'artifactIdentity', 'artifactVersion', 'artifactSources', 'sourceId', 'entryId', 'senseId', 'evidenceId',
      'morphologyTokenIdentity', 'morphologyTokenCoordinates', 'morphologyTokenWitness',
    ]);
  if (record.status !== 'verified_token_alignment') throw new Error('alignment status must be verified_token_alignment');
  if (record.proofContract !== 'theologai-exact-hebrew-token-alignment.v1') {
    throw new Error('alignment must use the exact server-side token proof contract');
  }
  if (typeof record.verifierVersion !== 'number' || !Number.isSafeInteger(record.verifierVersion)
    || record.verifierVersion < 1 || record.verifierVersion > 1_000_000) throw new Error('alignment verifier version is invalid');
  return Object.freeze({
    status: 'verified_token_alignment',
    proofContract: 'theologai-exact-hebrew-token-alignment.v1',
    verifierVersion: record.verifierVersion,
    sourceIdentity: hebrewIdentity(record.sourceIdentity, 'alignment.sourceIdentity'),
    normalizedReference: requireUbsSemanticNormalizedReference(
      record.normalizedReference,
      'alignment.normalizedReference',
    ),
    artifactIdentity: sha256(record.artifactIdentity, 'alignment.artifactIdentity'),
    artifactVersion: exactArtifactVersion(record.artifactVersion, 'alignment.artifactVersion'),
    artifactSources: snapshotArtifactSources(record.artifactSources),
    sourceId: identifier(record.sourceId, 'alignment.sourceId'),
    entryId: identifier(record.entryId, 'alignment.entryId'),
    senseId: identifier(record.senseId, 'alignment.senseId'),
    evidenceId: identifier(record.evidenceId, 'alignment.evidenceId'),
    morphologyTokenIdentity: text(record.morphologyTokenIdentity, 512, 'alignment.morphologyTokenIdentity'),
    morphologyTokenCoordinates: snapshotTokenCoordinates(record.morphologyTokenCoordinates),
    morphologyTokenWitness: snapshotTokenWitness(record.morphologyTokenWitness),
  });
}

function snapshotArtifactSources(input: unknown): ServerVerifiedHebrewSemanticAlignment['artifactSources'] {
  const record = objectOf(input, 'alignment.artifactSources');
  exactKeys(record, ['dictionary', 'lexicalDomains'], ['dictionary', 'lexicalDomains']);
  return Object.freeze({
    dictionary: snapshotArtifactSource(record.dictionary, 'dictionary'),
    lexicalDomains: snapshotArtifactSource(record.lexicalDomains, 'lexical_domains'),
  });
}

function snapshotArtifactSource(
  input: unknown,
  expectedRole: 'dictionary' | 'lexical_domains',
): ServerVerifiedHebrewSemanticAlignment['artifactSources']['dictionary'] {
  const record = objectOf(input, `alignment.artifactSources.${expectedRole}`);
  exactKeys(record,
    ['sourceId', 'sourceRole', 'artifactName', 'artifactIdentity', 'artifactVersion', 'sourceSha256'],
    ['sourceId', 'sourceRole', 'artifactName', 'artifactIdentity', 'artifactVersion', 'sourceSha256']);
  if (record.sourceRole !== expectedRole
    || (expectedRole === 'dictionary' && record.artifactName !== 'UBSHebrewDic-v0.9.2-en.JSON')
    || (expectedRole === 'lexical_domains' && record.artifactName !== 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON')) {
    throw new Error(`alignment artifact source must be the exact ${expectedRole} UBS artifact`);
  }
  return Object.freeze({
    sourceId: identifier(record.sourceId, `alignment.${expectedRole}.sourceId`),
    sourceRole: expectedRole,
    artifactName: record.artifactName,
    artifactIdentity: sha256(record.artifactIdentity, `alignment.${expectedRole}.artifactIdentity`),
    artifactVersion: exactArtifactVersion(record.artifactVersion, `alignment.${expectedRole}.artifactVersion`),
    sourceSha256: sha256(record.sourceSha256, `alignment.${expectedRole}.sourceSha256`),
  }) as ServerVerifiedHebrewSemanticAlignment['artifactSources']['dictionary'];
}

function snapshotTokenCoordinates(
  input: unknown,
): ServerVerifiedHebrewSemanticAlignment['morphologyTokenCoordinates'] {
  const record = objectOf(input, 'alignment.morphologyTokenCoordinates');
  exactKeys(record, ['canonicalReference', 'normalizedReference', 'position'],
    ['canonicalReference', 'normalizedReference', 'position']);
  const position = record.position;
  if (typeof position !== 'number' || !Number.isSafeInteger(position) || position < 1 || position > 200) {
    throw new Error('alignment morphology token position is invalid');
  }
  return Object.freeze({
    canonicalReference: text(record.canonicalReference, 100, 'alignment.canonicalReference'),
    normalizedReference: requireUbsSemanticNormalizedReference(
      record.normalizedReference,
      'alignment.morphologyTokenCoordinates.normalizedReference',
    ),
    position,
  });
}

function snapshotTokenWitness(
  input: unknown,
): ServerVerifiedHebrewSemanticAlignment['morphologyTokenWitness'] {
  const record = objectOf(input, 'alignment.morphologyTokenWitness');
  exactKeys(record, ['text', 'lemma', 'strongsNumber', 'morphologyCode', 'gloss'],
    ['text', 'lemma', 'strongsNumber', 'morphologyCode', 'gloss']);
  return Object.freeze({
    text: text(record.text, 2_000, 'alignment morphology token text'),
    lemma: text(record.lemma, 2_000, 'alignment morphology token lemma'),
    strongsNumber: nullableText(record.strongsNumber, 128, 'alignment morphology token Strong\'s number'),
    morphologyCode: nullableText(record.morphologyCode, 512, 'alignment morphology token morphology code'),
    gloss: nullableText(record.gloss, 2_000, 'alignment morphology token gloss'),
  });
}

function hebrewIdentity(value: unknown, label: string): UbsInternalHebrewLexicalIdentity {
  if (typeof value !== 'string' || !/^H(?!0000$)[0-9]{4}$/.test(value)) {
    throw new Error(`${label} must be a canonical fixed-width H#### identity`);
  }
  return value as UbsInternalHebrewLexicalIdentity;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256`);
  }
  return value;
}

function exactArtifactVersion(value: unknown, label: string): '0.9.2' {
  if (value !== '0.9.2') throw new Error(`${label} must be the pinned UBS artifact version`);
  return value;
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

function nullableText(value: unknown, maximum: number, label: string): string | null {
  if (value === null) return null;
  return text(value, maximum, label);
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 128
    || !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value)) throw new Error(`${label} is not canonical`);
  return value;
}
