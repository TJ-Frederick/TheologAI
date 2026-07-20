/**
 * Inactive, source-free resolution seam for future UBS Hebrew evidence.
 *
 * This file is intentionally absent from every composition root and public
 * export. It coordinates already-attested repository evidence; it never
 * infers a contextual sense from morphology, frequency, gloss similarity, or
 * any separately withheld TBESH field.
 */
import {
  UBS_SEMANTIC_REPOSITORY_LIMITS,
  UBS_SEMANTIC_REPOSITORY_ORDER,
  UBS_SEMANTIC_DEFINITION_EXCLUSION_REASONS,
  parseUbsPublicHebrewIdentity,
  requireUbsInternalLexicalIdentity,
  requireUbsSemanticNormalizedReference,
} from '../../kernel/ubsSemanticDomain.js';
import type {
  IUbsSemanticRepository,
  UbsInternalHebrewLexicalIdentity,
  UbsLexicalSenseCandidate,
  UbsPublicHebrewIdentityBoundary,
  UbsSemanticDomain,
  UbsSemanticEntry,
  UbsSemanticPageRequest,
  UbsSemanticReferenceEvidence,
  UbsSemanticRepositoryCollection,
  UbsSemanticRepositoryOrder,
  UbsSemanticResolution,
  UbsSemanticSense,
  UbsSemanticSource,
} from '../../kernel/ubsSemanticDomain.js';

export type { FutureExactHebrewTokenAlignmentProof } from '../../kernel/ubsSemanticDomain.js';

export const HEBREW_SEMANTIC_EVIDENCE_LIMITS = Object.freeze({
  candidates: 8,
  sensesInspected: 16,
  morphologyTokenIdentityCharacters: 512,
  entryLemmaCharacters: 2_000,
  entryTransliterationCharacters: 2_000,
  entryPartOfSpeechCharacters: 512,
} as const);

const REVIEWED_TAHOT_PINS = Object.freeze([
  { id: 'tahot-gen-deu', sha256: 'e9b8546ee48fe0bfc57c3b70f5f40e98d96580e803526d19026224e31753368b', gitBlobSha1: 'eb051292f8cee648c4f3eaf1b48cd0f1f30dc1d5' },
  { id: 'tahot-isa-mal', sha256: 'f3ded203d2a74d6368932c97ae550d1d0754b271af491dc0dedf36fe3ba0bcc5', gitBlobSha1: '1cfe6718a1dae0d5d45a57a942d3f7f716ac6342' },
  { id: 'tahot-job-sng', sha256: '84e118a97e5725e3847cdfdd593873513021c790c63cc91a0d41fca2b5db2ed5', gitBlobSha1: '3d7af689417b54ebc468700b2bd86a8ba5377530' },
  { id: 'tahot-jos-est', sha256: '195fee1dc3653bab33701f170734eb894ed647c10cd08cc61749375fe8b73775', gitBlobSha1: 'e3824344f6dea1a3f51932d1b0a53537c3c2023e' },
] as const);
const REVIEWED_USFMTC = Object.freeze({
  commit: 'a222dd3e78360f8e275ca56f4307af7e02b2430a',
  referenceBlob: '16cd6fc2a42664a494a5989b8587247a27331cb6',
  referenceSha256: 'eaff130bef0b6f6dde52386acb8c7a2e5111be11f1ca104522cffef72ea42b69',
  licenseBlob: '94b86440d4155c330b5fc17459effd133044064f',
  licenseSha256: '8d67696c8d8dca45ebed80adf43d53a8c5f4ebc563ace89da23d1af3b3e50be9',
} as const);

export type HebrewSemanticEvidenceAudience = 'beginner' | 'expert';

/**
 * A raw-coordinate observation. It is intentionally not a token alignment:
 * a UBS anchor and a TAHOT token can share a verse coordinate without proving
 * that the token, lexical identity, or sense is the same.
 */
export interface CoordinateOnlyHebrewReferenceAttestation {
  status: 'coordinate_attested_unpromoted';
  coordinateAttestation: {
    schemaVersion: 'theologai-ubs-tahot-coordinate-attestation.v1';
    verifierVersion: number;
    artifactIdentity: string;
    sourceId: string;
    entryId: string;
    senseId: string;
    evidenceId: string;
    rawAnchor: string;
    footnoteSuffix: string;
    nativeCoordinate: { bookNumber: number; bookCode: string; chapter: number; verse: number };
    normalizedCoordinate: { bookNumber: number; bookCode: string; chapter: number; verse: number };
    normalizedReference: string;
    tahotTokenIdentity: string;
    tahotWordElement: string;
    tahotFileId: string;
    tahotFileLine: number;
    tahotCorpus: readonly { id: string; sha256: string; gitBlobSha1: string }[];
    usfmtc: { commit: string; referenceBlob: string; referenceSha256: string; licenseBlob: string; licenseSha256: string };
    limitation: 'coordinate_and_explicit_pair_only_not_token_alignment_or_lexical_sense_adjudication';
  };
}

export interface HebrewSemanticEvidenceRequest {
  publicStrongs: string;
  normalizedReference: string;
  audience: HebrewSemanticEvidenceAudience;
  /** Internal repository continuation only; this is not a public result cursor. */
  entryPage?: UbsSemanticPageRequest;
  /** Optional design-time coordinate observation; never promotes a candidate. */
  coordinateOnlyAttestation?: CoordinateOnlyHebrewReferenceAttestation;
}

export interface HebrewSemanticEvidenceCoverage {
  entryWindow: {
    priorCount: number;
    returnedCount: number;
    consumedCount: number;
    totalCount: number;
    hasMore: boolean;
    nextCursor?: string;
  };
  inspectedEntryCount: number;
  inspectedSenseCount: number;
  publishableCandidateCount: number;
  candidateLimit: typeof HEBREW_SEMANTIC_EVIDENCE_LIMITS.candidates;
  senseInspectionLimit: typeof HEBREW_SEMANTIC_EVIDENCE_LIMITS.sensesInspected;
  completeForReturnedEntryWindow: boolean;
}

export interface HebrewSemanticEvidenceResult {
  audience: HebrewSemanticEvidenceAudience;
  plainLanguage: string;
  identity: UbsPublicHebrewIdentityBoundary;
  normalizedReference: string;
  resolution: UbsSemanticResolution;
  coverage: HebrewSemanticEvidenceCoverage;
  /** Exact source records required by every returned candidate. */
  provenanceSources: readonly UbsSemanticSource[];
}

interface CandidateEvidence extends UbsLexicalSenseCandidate {
  entry: UbsSemanticEntry;
  matchingReferences: UbsSemanticReferenceEvidence[];
}

interface HebrewSemanticEvidenceRequestSnapshot {
  publicStrongs: string;
  normalizedReference: string;
  audience: HebrewSemanticEvidenceAudience;
  entryPage?: Readonly<UbsSemanticPageRequest>;
  coordinateOnlyAttestation: unknown;
}

export class HebrewSemanticEvidenceService {
  constructor(private readonly repository: IUbsSemanticRepository) {}

  async resolve(request: HebrewSemanticEvidenceRequest): Promise<HebrewSemanticEvidenceResult> {
    const requestSnapshot = snapshotRequest(request);
    const identity = parseUbsPublicHebrewIdentity(requestSnapshot.publicStrongs);
    if (!identity) throw new Error('UBS Hebrew semantic evidence requires an existing public H-number from H1 through H9999');
    const audience = requestSnapshot.audience;
    if (audience !== 'beginner' && audience !== 'expert') {
      throw new Error('UBS Hebrew semantic evidence audience must be beginner or expert');
    }
    const normalizedReference = requireUbsSemanticNormalizedReference(requestSnapshot.normalizedReference);
    validateCoordinateOnlyAttestation(requestSnapshot.coordinateOnlyAttestation, normalizedReference);
    const entryPage = requestSnapshot.entryPage;
    const entries = await this.repository.getEntriesByLexicalIdentity(identity.sourceIdentity, entryPage);
    validateCollection(entries, UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity, 'entry');
    validateEntries(entries.items, identity.sourceIdentity);

    const candidates: CandidateEvidence[] = [];
    let inspectedEntryCount = 0;
    let inspectedSenseCount = 0;
    let evidenceIncomplete = entryPage !== undefined || entries.priorShowing > 0 || entries.hasMore;
    const seenSenseIdentities = new Set<string>();
    const seenEvidenceIdentities = new Set<string>();

    outer: for (const entry of entries.items) {
      inspectedEntryCount += 1;
      const senses = await this.repository.getSensesForEntry(entry.sourceId, entry.entryId);
      validateCollection(senses, UBS_SEMANTIC_REPOSITORY_ORDER.sensesPerEntry,
        UBS_SEMANTIC_REPOSITORY_LIMITS.sensesPerEntry, 'sense');
      validateCompleteFirstPage(senses, 'sense');
      validateSenses(senses.items, entry, seenSenseIdentities);
      if (senses.hasMore) evidenceIncomplete = true;
      for (const sense of senses.items) {
        if (candidates.length >= HEBREW_SEMANTIC_EVIDENCE_LIMITS.candidates) {
          evidenceIncomplete = true;
          break outer;
        }
        if (inspectedSenseCount >= HEBREW_SEMANTIC_EVIDENCE_LIMITS.sensesInspected) {
          evidenceIncomplete = true;
          break outer;
        }
        inspectedSenseCount += 1;
        const domains = await this.repository.getDomainsForSense(sense.sourceId, sense.senseId);
        validateCollection(domains, UBS_SEMANTIC_REPOSITORY_ORDER.domainsPerSense,
          UBS_SEMANTIC_REPOSITORY_LIMITS.domainsPerSense, 'domain');
        validateCompleteFirstPage(domains, 'domain');
        validateDomains(domains.items, sense);
        if (domains.priorShowing !== 0 || domains.total !== sense.domainRefs.length) {
          throw new Error('repository domain collection does not completely represent the sense domain references');
        }
        if (domains.hasMore) evidenceIncomplete = true;
        const references = await this.repository.findReferenceEvidence(
          sense.sourceId, sense.senseId, normalizedReference,
        );
        validateCollection(references, UBS_SEMANTIC_REPOSITORY_ORDER.matchingReferenceEvidence,
          UBS_SEMANTIC_REPOSITORY_LIMITS.matchingReferenceEvidence, 'reference evidence');
        validateCompleteFirstPage(references, 'reference evidence');
        validateReferences(references.items, sense, normalizedReference, seenEvidenceIdentities);
        if (references.hasMore) evidenceIncomplete = true;
        candidates.push({ entry, sense, domains: [...domains.items], matchingReferences: [...references.items] });
      }
    }
    if (inspectedEntryCount < entries.items.length) evidenceIncomplete = true;
    candidates.sort((left, right) => compare(
      [left.entry.sourceId, left.entry.sourceOrdinal, left.entry.entryId, left.sense.sourceOrdinal, left.sense.senseId],
      [right.entry.sourceId, right.entry.sourceOrdinal, right.entry.entryId, right.sense.sourceOrdinal, right.sense.senseId],
    ));

    const coverage = coverageFor(entries, inspectedEntryCount, inspectedSenseCount, candidates.length, evidenceIncomplete);
    if (entries.items.length === 0) {
      if (entryPage !== undefined || entries.priorShowing !== 0 || entries.total !== 0 || entries.hasMore) {
        throw new Error('incomplete entry evidence cannot establish that no lexical entry exists');
      }
      return result(identity, normalizedReference, audience, {
        status: 'unavailable', reason: 'no_lexical_entry',
      }, coverage, []);
    }
    if (candidates.length === 0) {
      if (evidenceIncomplete) {
        throw new Error('incomplete repository evidence cannot establish that publishable semantic evidence is unavailable');
      }
      return result(identity, normalizedReference, audience, {
        status: 'unavailable', reason: 'no_publishable_semantic_evidence',
      }, coverage, []);
    }

    const provenanceSources = await loadExactCandidateProvenance(this.repository, candidates);
    const hasReferenceEvidence = candidates.some(candidate => candidate.matchingReferences.length > 0);
    return result(identity, normalizedReference, audience, {
      status: 'lexical_candidates',
      candidates: candidates.map(({ sense, domains }) => ({ sense, domains: [...domains] })),
      reason: hasReferenceEvidence || evidenceIncomplete ? 'reference_alignment_unproven' : 'no_reference_evidence',
    }, coverage, provenanceSources);
  }
}

function snapshotRequest(request: HebrewSemanticEvidenceRequest): Readonly<HebrewSemanticEvidenceRequestSnapshot> {
  if (!request || typeof request !== 'object') throw new Error('UBS Hebrew semantic evidence request must be a record');
  if (Object.keys(request).some(key => ![
    'publicStrongs', 'normalizedReference', 'audience', 'entryPage', 'coordinateOnlyAttestation',
  ].includes(key))) {
    throw new Error('UBS Hebrew semantic evidence request contains an unsupported field');
  }
  const publicStrongs = request.publicStrongs;
  const normalizedReference = request.normalizedReference;
  const audience = request.audience;
  const rawCoordinateOnlyAttestation = request.coordinateOnlyAttestation;
  const coordinateOnlyAttestation = rawCoordinateOnlyAttestation === undefined
    ? undefined : structuredClone(rawCoordinateOnlyAttestation);
  const rawEntryPage = request.entryPage;
  let entryPage: Readonly<UbsSemanticPageRequest> | undefined;
  if (rawEntryPage !== undefined) {
    if (!rawEntryPage || typeof rawEntryPage !== 'object') {
      throw new Error('UBS Hebrew semantic entry page must be a record');
    }
    const cursor = rawEntryPage.cursor;
    entryPage = Object.freeze({ cursor });
  }
  return Object.freeze({
    publicStrongs,
    normalizedReference,
    audience,
    coordinateOnlyAttestation,
    ...(entryPage ? { entryPage } : {}),
  });
}

function result(
  identity: UbsPublicHebrewIdentityBoundary,
  normalizedReference: string,
  audience: HebrewSemanticEvidenceAudience,
  resolution: UbsSemanticResolution,
  coverage: HebrewSemanticEvidenceCoverage,
  provenanceSources: readonly UbsSemanticSource[],
): HebrewSemanticEvidenceResult {
  return {
    audience,
    plainLanguage: explanation(resolution, audience),
    identity,
    normalizedReference,
    resolution,
    coverage,
    provenanceSources: [...provenanceSources],
  };
}

function explanation(resolution: UbsSemanticResolution, audience: HebrewSemanticEvidenceAudience): string {
  if (resolution.status === 'reference_aligned_source_candidate') {
    return audience === 'beginner'
      ? 'This dictionary sense is attested at the passage and separately aligned to the selected Hebrew token, but that does not by itself prove its meaning in context.'
      : 'This source candidate has exact sense-reference evidence plus separately versioned token alignment; it remains a candidate, not an adjudicated contextual sense.';
  }
  if (resolution.status === 'lexical_candidates') {
    if (resolution.reason === 'no_reference_evidence') {
      return 'The dictionary has possible senses for this Hebrew identity, but none is source-attested at the exact requested reference.';
    }
    if (resolution.reason === 'ambiguous_reference_alignment') {
      return 'More than one exact source candidate is aligned to the selected token, so the available evidence does not settle which candidate applies.';
    }
    return 'The dictionary has source candidates, but no trusted token alignment proves which candidate applies here.';
  }
  return resolution.reason === 'no_lexical_entry'
    ? 'No dictionary entry is available for this Hebrew identity.'
    : 'No complete, publishable semantic evidence is available for this Hebrew identity.';
}

function validateCoordinateOnlyAttestation(
  value: unknown,
  normalizedReference: string,
): Readonly<CoordinateOnlyHebrewReferenceAttestation> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'coordinateAttestation,status') {
    throw new Error('coordinate-only attestation must be one exact reviewed assertion');
  }
  const caller = value as CoordinateOnlyHebrewReferenceAttestation;
  if (caller.status !== 'coordinate_attested_unpromoted') {
    throw new Error('coordinate-only attestation must not claim verified token alignment');
  }
  const attestation = caller.coordinateAttestation;
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)
    || Object.keys(attestation).sort().join(',') !== [
      'artifactIdentity', 'entryId', 'evidenceId', 'footnoteSuffix', 'limitation',
      'nativeCoordinate', 'normalizedCoordinate', 'normalizedReference', 'rawAnchor',
      'schemaVersion', 'senseId', 'sourceId', 'tahotCorpus', 'tahotFileId',
      'tahotFileLine', 'tahotTokenIdentity', 'tahotWordElement', 'usfmtc', 'verifierVersion',
    ].sort().join(',')) {
    throw new Error('coordinate-only attestation is incomplete');
  }
  if (attestation.schemaVersion !== 'theologai-ubs-tahot-coordinate-attestation.v1'
    || attestation.limitation !== 'coordinate_and_explicit_pair_only_not_token_alignment_or_lexical_sense_adjudication'
    || attestation.verifierVersion !== 1
    || !/^[0-9a-f]{64}$/.test(attestation.artifactIdentity)
    || requireUbsSemanticNormalizedReference(attestation.normalizedReference, 'coordinate-only normalized reference') !== normalizedReference) {
    throw new Error('coordinate-only attestation coordinate, reference, or verifier binding is invalid');
  }
  for (const [label, identifier] of [
    ['source', attestation.sourceId], ['entry', attestation.entryId],
    ['sense', attestation.senseId], ['evidence', attestation.evidenceId],
    ['TAHOT file', attestation.tahotFileId],
  ] as const) requireIdentifier(identifier, `coordinate-only ${label} ID`);
  boundedText(attestation.rawAnchor, 512, 'coordinate-only raw anchor');
  boundedPossiblyEmptyText(attestation.footnoteSuffix, 128, 'coordinate-only footnote suffix');
  boundedText(attestation.tahotTokenIdentity, HEBREW_SEMANTIC_EVIDENCE_LIMITS.morphologyTokenIdentityCharacters,
    'coordinate-only TAHOT token identity');
  boundedText(attestation.tahotWordElement, 512, 'coordinate-only TAHOT word element');
  positiveInteger(attestation.tahotFileLine, 'coordinate-only TAHOT file line');
  validateCoordinate(attestation.nativeCoordinate, 'coordinate-only native');
  validateCoordinate(attestation.normalizedCoordinate, 'coordinate-only normalized');
  if (!Array.isArray(attestation.tahotCorpus) || attestation.tahotCorpus.length !== 4) {
    throw new Error('coordinate-only attestation must bind the exact four-file TAHOT corpus');
  }
  const corpusIds = new Set<string>();
  for (const pin of attestation.tahotCorpus) {
    if (!pin || typeof pin !== 'object' || Object.keys(pin).sort().join(',') !== 'gitBlobSha1,id,sha256'
      || !/^[a-z0-9][a-z0-9_.-]*$/.test(pin.id) || !/^[0-9a-f]{64}$/.test(pin.sha256)
      || !/^[0-9a-f]{40}$/.test(pin.gitBlobSha1) || corpusIds.has(pin.id)) {
      throw new Error('coordinate-only TAHOT corpus pins are malformed or duplicated');
    }
    corpusIds.add(pin.id);
  }
  if (JSON.stringify(attestation.tahotCorpus) !== JSON.stringify(REVIEWED_TAHOT_PINS)) {
    throw new Error('coordinate-only TAHOT corpus differs from the exact reviewed pin set');
  }
  const usfmtc = attestation.usfmtc;
  if (!usfmtc || typeof usfmtc !== 'object'
    || Object.keys(usfmtc).sort().join(',') !== 'commit,licenseBlob,licenseSha256,referenceBlob,referenceSha256'
    || !/^[0-9a-f]{40}$/.test(usfmtc.commit) || !/^[0-9a-f]{40}$/.test(usfmtc.referenceBlob)
    || !/^[0-9a-f]{64}$/.test(usfmtc.referenceSha256) || !/^[0-9a-f]{40}$/.test(usfmtc.licenseBlob)
    || !/^[0-9a-f]{64}$/.test(usfmtc.licenseSha256)
    || JSON.stringify(usfmtc) !== JSON.stringify(REVIEWED_USFMTC)) {
    throw new Error('coordinate-only usfmtc pins are malformed');
  }
  return Object.freeze(structuredClone(caller));
}

function validateEntries(items: readonly UbsSemanticEntry[], identity: UbsInternalHebrewLexicalIdentity): void {
  let prior: UbsSemanticEntry | undefined;
  const identities = new Set<string>();
  const ordinals = new Set<number>();
  for (const entry of items) {
    requireIdentifier(entry.sourceId, 'entry source ID');
    requireIdentifier(entry.entryId, 'entry ID');
    positiveInteger(entry.sourceOrdinal, 'entry source ordinal');
    boundedText(entry.lemma, HEBREW_SEMANTIC_EVIDENCE_LIMITS.entryLemmaCharacters, 'entry lemma');
    if (entry.transliteration !== undefined) boundedText(
      entry.transliteration,
      HEBREW_SEMANTIC_EVIDENCE_LIMITS.entryTransliterationCharacters,
      'entry transliteration',
    );
    if (entry.partOfSpeech !== undefined) {
      if (!Array.isArray(entry.partOfSpeech) || entry.partOfSpeech.length > 16
        || new Set(entry.partOfSpeech).size !== entry.partOfSpeech.length) {
        throw new Error('repository entry parts of speech must be a bounded unique array');
      }
      for (const [index, partOfSpeech] of entry.partOfSpeech.entries()) boundedText(
        partOfSpeech,
        HEBREW_SEMANTIC_EVIDENCE_LIMITS.entryPartOfSpeechCharacters,
        `entry part of speech ${index + 1}`,
      );
    }
    if (!Array.isArray(entry.lexicalIdentities) || !entry.lexicalIdentities.includes(identity)) {
      throw new Error('repository entry is not attached to the requested branded lexical identity');
    }
    if (new Set(entry.lexicalIdentities).size !== entry.lexicalIdentities.length) {
      throw new Error('repository entry lexical identities must be unique');
    }
    for (const lexicalIdentity of entry.lexicalIdentities) requireUbsInternalLexicalIdentity(lexicalIdentity);
    const exactIdentity = `${entry.sourceId}\0${entry.entryId}`;
    if (identities.has(exactIdentity)) throw new Error('repository entries contain a duplicate exact identity');
    identities.add(exactIdentity);
    if (ordinals.has(entry.sourceOrdinal)) throw new Error('repository entries contain a duplicate source ordinal');
    ordinals.add(entry.sourceOrdinal);
    if (prior && compare([prior.sourceId, prior.sourceOrdinal, prior.entryId], [entry.sourceId, entry.sourceOrdinal, entry.entryId]) >= 0) {
      throw new Error('repository entries are not in strict canonical order');
    }
    prior = entry;
  }
}

function validateSenses(
  items: readonly UbsSemanticSense[],
  entry: UbsSemanticEntry,
  resolutionIdentities: Set<string>,
): void {
  let prior: UbsSemanticSense | undefined;
  const ordinals = new Set<number>();
  for (const sense of items) {
    requireIdentifier(sense.senseId, 'sense ID');
    if (sense.sourceId !== entry.sourceId || sense.entryId !== entry.entryId) {
      throw new Error('repository sense does not belong to its requested entry');
    }
    positiveInteger(sense.sourceOrdinal, 'sense source ordinal');
    const exactIdentity = `${sense.sourceId}\0${sense.senseId}`;
    if (resolutionIdentities.has(exactIdentity)) throw new Error('repository senses contain a duplicate cross-resolution identity');
    resolutionIdentities.add(exactIdentity);
    if (ordinals.has(sense.sourceOrdinal)) throw new Error('repository senses contain a duplicate source ordinal within an entry');
    ordinals.add(sense.sourceOrdinal);
    if (!['published', 'absent_in_source', 'excluded_unresolved_markup'].includes(sense.definitionStatus)) {
      throw new Error('sense definition status is invalid');
    }
    if (sense.definition === undefined) {
      if (sense.definitionStatus === 'published') throw new Error('published sense definition is missing');
    } else {
      boundedText(sense.definition, 20_000, 'sense definition');
      if (sense.definitionStatus !== 'published') throw new Error('unpublished sense exposes definition text');
    }
    if (!Array.isArray(sense.definitionExclusionReasons) || sense.definitionExclusionReasons.length > 8
      || new Set(sense.definitionExclusionReasons).size !== sense.definitionExclusionReasons.length
      || (sense.definitionStatus === 'excluded_unresolved_markup') !== (sense.definitionExclusionReasons.length > 0)) {
      throw new Error('sense definition exclusion reasons are malformed, duplicated, unbounded, or inconsistent');
    }
    for (const reason of sense.definitionExclusionReasons) {
      if (!UBS_SEMANTIC_DEFINITION_EXCLUSION_REASONS.includes(reason)) {
        throw new Error('sense definition exclusion reason is unsupported');
      }
    }
    if (!Array.isArray(sense.glosses) || sense.glosses.length < 1 || sense.glosses.length > 16) {
      throw new Error('sense glosses must contain one to sixteen publishable values');
    }
    for (const gloss of sense.glosses) boundedText(gloss, 1_000, 'sense gloss');
    if (new Set(sense.glosses).size !== sense.glosses.length) throw new Error('sense glosses must be unique');
    if (!Array.isArray(sense.domainRefs) || sense.domainRefs.length > 16
      || new Set(sense.domainRefs.map(ref => `${ref.sourceId}\0${ref.domainId}`)).size !== sense.domainRefs.length) {
      throw new Error('sense domain references must contain zero to sixteen unique source/domain identities');
    }
    if (prior && compare([prior.sourceOrdinal, prior.senseId], [sense.sourceOrdinal, sense.senseId]) >= 0) {
      throw new Error('repository senses are not in strict canonical order');
    }
    prior = sense;
  }
}

function validateDomains(items: readonly UbsSemanticDomain[], sense: UbsSemanticSense): void {
  const expected = new Set(sense.domainRefs.map(ref => `${ref.sourceId}\0${ref.domainId}`));
  let prior: UbsSemanticDomain | undefined;
  const identities = new Set<string>();
  const ordinals = new Set<number>();
  for (const domain of items) {
    requireIdentifier(domain.sourceId, 'domain source ID');
    requireIdentifier(domain.domainId, 'domain ID');
    if (!expected.has(`${domain.sourceId}\0${domain.domainId}`)) {
      throw new Error('repository domain is not attested by the requested sense');
    }
    const exactIdentity = `${domain.sourceId}\0${domain.domainId}`;
    if (identities.has(exactIdentity)) throw new Error('repository domains contain a duplicate exact identity');
    identities.add(exactIdentity);
    positiveInteger(domain.sourceOrdinal, 'domain source ordinal');
    if (ordinals.has(domain.sourceOrdinal)) throw new Error('repository domains contain a duplicate source ordinal');
    ordinals.add(domain.sourceOrdinal);
    if (domain.parentDomainId !== undefined) requireIdentifier(domain.parentDomainId, 'parent domain ID');
    boundedText(domain.label, 1_000, 'domain label');
    if (domain.description !== undefined) boundedText(domain.description, 5_000, 'domain description');
    if (prior && compare([prior.sourceOrdinal, prior.domainId], [domain.sourceOrdinal, domain.domainId]) >= 0) {
      throw new Error('repository domains are not in strict canonical order');
    }
    prior = domain;
  }
}

function validateReferences(
  items: readonly UbsSemanticReferenceEvidence[],
  sense: UbsSemanticSense,
  normalizedReference: string,
  resolutionIdentities: Set<string>,
): void {
  let prior: UbsSemanticReferenceEvidence | undefined;
  const ordinals = new Set<number>();
  for (const evidence of items) {
    requireIdentifier(evidence.evidenceId, 'reference evidence ID');
    if (evidence.sourceId !== sense.sourceId || evidence.senseId !== sense.senseId
      || evidence.normalizedReference !== normalizedReference
      || evidence.evidenceKind !== 'source_attested_sense_reference') {
      throw new Error('repository reference evidence does not match the exact sense and normalized reference');
    }
    positiveInteger(evidence.sourceOrdinal, 'reference evidence source ordinal');
    const exactIdentity = `${evidence.sourceId}\0${evidence.evidenceId}`;
    if (resolutionIdentities.has(exactIdentity)) throw new Error('repository reference evidence contains a duplicate cross-resolution identity');
    resolutionIdentities.add(exactIdentity);
    if (ordinals.has(evidence.sourceOrdinal)) throw new Error('repository reference evidence contains a duplicate source ordinal within a sense');
    ordinals.add(evidence.sourceOrdinal);
    requireUbsSemanticNormalizedReference(evidence.sourceReference, 'source reference');
    if (prior && compare([prior.sourceOrdinal, prior.evidenceId], [evidence.sourceOrdinal, evidence.evidenceId]) >= 0) {
      throw new Error('repository reference evidence is not in strict canonical order');
    }
    prior = evidence;
  }
}

async function loadExactCandidateProvenance(
  repository: IUbsSemanticRepository,
  candidates: readonly CandidateEvidence[],
): Promise<UbsSemanticSource[]> {
  const ids: string[] = [];
  for (const candidate of candidates) {
    for (const id of [candidate.sense.sourceId, ...candidate.domains.map(domain => domain.sourceId)]) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  if (ids.length < 1 || ids.length > 2) throw new Error('publishable semantic candidates require bounded exact source provenance');
  const sources: UbsSemanticSource[] = [];
  for (const id of ids) {
    const source = await repository.getSource(id);
    if (!source || source.sourceId !== id) {
      throw new Error('publishable semantic candidate provenance is missing or incompatible');
    }
    validateSource(source);
    sources.push(source);
  }
  sources.sort((left, right) => roleOrder(left.sourceRole) - roleOrder(right.sourceRole));
  if (sources[0]?.sourceRole !== 'dictionary'
    || (sources.length === 2 && sources[1]?.sourceRole !== 'lexical_domains')) {
    throw new Error('publishable semantic provenance must contain dictionary and, when used, lexical-domain source roles');
  }
  if (sources.length === 2 && sources[0].artifactIdentity !== sources[1]!.artifactIdentity) {
    throw new Error('publishable semantic provenance sources do not share one exact semantic artifact identity');
  }
  return sources;
}

function validateSource(source: UbsSemanticSource): void {
  requireIdentifier(source.sourceId, 'provenance source ID');
  if (source.schemaVersion !== 'ubs-semantics.v1' || source.artifactVersion !== '0.9.2'
    || source.language !== 'Hebrew' || source.publisher !== 'United Bible Societies'
    || source.license !== 'CC BY-SA 4.0'
    || source.licenseUrl !== 'https://creativecommons.org/licenses/by-sa/4.0/'
    || source.transformVersion !== 7 || source.modified !== true
    || !/^[0-9a-f]{64}$/.test(source.artifactIdentity)
    || !validHttpsUrl(source.sourceUrl)
    || !/^[0-9a-f]{40}$/.test(source.sourceCommit)
    || !/^[0-9a-f]{40}$/.test(source.sourceBlob)
    || !/^[0-9a-f]{64}$/.test(source.sourceSha256)
    || (source.sourceRole === 'dictionary' && source.artifactName !== 'UBSHebrewDic-v0.9.2-en.JSON')
    || (source.sourceRole === 'lexical_domains' && source.artifactName !== 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON')) {
    throw new Error('publishable semantic candidate provenance is missing or incompatible');
  }
  boundedText(source.title, 1_000, 'provenance source title');
  boundedText(source.modificationNote, 1_000, 'provenance modification note');
}

function validHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 1_000 || hasUnicodeNoncharacter(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function coverageFor(
  entries: UbsSemanticRepositoryCollection<UbsSemanticEntry, typeof UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity, typeof UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity>,
  inspectedEntryCount: number,
  inspectedSenseCount: number,
  publishableCandidateCount: number,
  incomplete: boolean,
): HebrewSemanticEvidenceCoverage {
  return {
    entryWindow: {
      priorCount: entries.priorShowing,
      returnedCount: entries.showing,
      consumedCount: entries.consumed,
      totalCount: entries.total,
      hasMore: entries.hasMore,
      ...(entries.nextCursor ? { nextCursor: entries.nextCursor } : {}),
    },
    inspectedEntryCount,
    inspectedSenseCount,
    publishableCandidateCount,
    candidateLimit: HEBREW_SEMANTIC_EVIDENCE_LIMITS.candidates,
    senseInspectionLimit: HEBREW_SEMANTIC_EVIDENCE_LIMITS.sensesInspected,
    completeForReturnedEntryWindow: !incomplete,
  };
}

function validateCollection<T>(
  collection: UbsSemanticRepositoryCollection<T, UbsSemanticRepositoryOrder, number>,
  order: string,
  limit: number,
  label: string,
): void {
  if (!collection || !Array.isArray(collection.items) || collection.order !== order || collection.limit !== limit
    || collection.showing !== collection.items.length || collection.showing > limit
    || !Number.isSafeInteger(collection.total) || collection.total < 0
    || !Number.isSafeInteger(collection.priorShowing) || collection.priorShowing < 0
    || collection.consumed !== collection.priorShowing + collection.showing
    || collection.consumed > collection.total || collection.hasMore !== (collection.consumed < collection.total)
    || collection.hasMore !== (typeof collection.nextCursor === 'string')
    || (collection.hasMore && (collection.items.length === 0 || !collection.nextCursor
      || collection.nextCursor.length > 4_096 || hasUnicodeNoncharacter(collection.nextCursor)))) {
    throw new Error(`repository ${label} collection violates its bounded honest-window contract`);
  }
}

function validateCompleteFirstPage<T>(
  collection: UbsSemanticRepositoryCollection<T, UbsSemanticRepositoryOrder, number>,
  label: string,
): void {
  if (collection.priorShowing !== 0 || collection.consumed !== collection.showing
    || collection.showing !== collection.total || collection.hasMore || collection.nextCursor !== undefined) {
    throw new Error(`repository ${label} first-page collection must be complete before evidence can be resolved`);
  }
}

function requireIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value) || value.length > 128) {
    throw new Error(`${label} must be a bounded canonical identifier`);
  }
}

function positiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`${label} must be a positive safe integer`);
}

function boundedText(value: unknown, maximum: number, label: string): asserts value is string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value !== value.normalize('NFC')
    || [...value].length > maximum || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)
    || hasUnicodeNoncharacter(value)) {
    throw new Error(`${label} must be non-empty, trimmed, NFC, permitted Unicode, and within its character bound`);
  }
}

function boundedPossiblyEmptyText(value: unknown, maximum: number, label: string): asserts value is string {
  if (typeof value !== 'string' || value !== value.trim() || value !== value.normalize('NFC')
    || [...value].length > maximum || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)
    || hasUnicodeNoncharacter(value)) {
    throw new Error(`${label} must be trimmed, NFC, permitted Unicode, and within its character bound`);
  }
}

function validateCoordinate(value: unknown, label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'bookCode,bookNumber,chapter,verse') {
    throw new Error(`trusted alignment ${label} coordinate is incomplete`);
  }
  const coordinate = value as { bookNumber: unknown; bookCode: unknown; chapter: unknown; verse: unknown };
  positiveInteger(coordinate.bookNumber, `trusted alignment ${label} book number`);
  positiveInteger(coordinate.chapter, `trusted alignment ${label} chapter`);
  positiveInteger(coordinate.verse, `trusted alignment ${label} verse`);
  if (typeof coordinate.bookCode !== 'string' || !/^[A-Z0-9]{3}$/.test(coordinate.bookCode)) {
    throw new Error(`trusted alignment ${label} book code is invalid`);
  }
}

function hasUnicodeNoncharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if ((codePoint >= 0xfdd0 && codePoint <= 0xfdef) || (codePoint & 0xffff) >= 0xfffe) return true;
  }
  return false;
}

function compare(left: readonly (string | number)[], right: readonly (string | number)[]): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue;
    return left[index]! < right[index]! ? -1 : 1;
  }
  return 0;
}

function roleOrder(role: UbsSemanticSource['sourceRole']): number {
  return role === 'dictionary' ? 0 : 1;
}
