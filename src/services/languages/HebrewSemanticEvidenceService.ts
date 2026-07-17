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

export const HEBREW_SEMANTIC_EVIDENCE_LIMITS = Object.freeze({
  candidates: 8,
  sensesInspected: 16,
  trustedAlignments: 8,
  morphologyTokenIdentityCharacters: 512,
  entryLemmaCharacters: 2_000,
  entryTransliterationCharacters: 2_000,
  entryPartOfSpeechCharacters: 512,
  verifierVersionMaximum: 1_000_000,
} as const);

export type HebrewSemanticEvidenceAudience = 'beginner' | 'expert';

/** A separately versioned verifier must explicitly attest this exact row. */
export interface TrustedHebrewTokenAlignment {
  status: 'verified_token_alignment';
  morphologyTokenIdentity: string;
  verifierVersion: number;
  sourceIdentity: UbsInternalHebrewLexicalIdentity;
  normalizedReference: string;
  sourceId: string;
  entryId: string;
  senseId: string;
  evidenceId: string;
}

export interface HebrewSemanticEvidenceRequest {
  publicStrongs: string;
  normalizedReference: string;
  audience: HebrewSemanticEvidenceAudience;
  /** Internal repository continuation only; this is not a public result cursor. */
  entryPage?: UbsSemanticPageRequest;
  trustedAlignments?: readonly TrustedHebrewTokenAlignment[];
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
  trustedAlignments: unknown;
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
    const trustedAlignments = validateTrustedAlignments(
      requestSnapshot.trustedAlignments, identity.sourceIdentity, normalizedReference,
    );
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
      for (const sense of prioritizeTrustedSenses(senses.items, entry, trustedAlignments)) {
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
        if (domains.items.length === 0) continue;

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
      if (trustedAlignments.length > 0) throw new Error('trusted alignment does not match publishable repository evidence');
      if (evidenceIncomplete) {
        throw new Error('incomplete repository evidence cannot establish that publishable semantic evidence is unavailable');
      }
      return result(identity, normalizedReference, audience, {
        status: 'unavailable', reason: 'no_publishable_semantic_evidence',
      }, coverage, []);
    }

    const matches = matchTrustedAlignments(candidates, trustedAlignments);
    if (matches.length !== trustedAlignments.length) {
      throw new Error('every trusted alignment must match one exact returned entry, sense, reference evidence row, and query scope');
    }
    const provenanceSources = await loadExactCandidateProvenance(this.repository, candidates);
    const matchedCandidateCount = new Set(matches.map(match => [
      match.candidate.entry.sourceId, match.candidate.entry.entryId, match.candidate.sense.senseId,
    ].join('\0'))).size;
    if (matchedCandidateCount === 1) {
      const match = [...matches].sort((left, right) => compare(
        [left.referenceEvidence.sourceOrdinal, left.referenceEvidence.evidenceId],
        [right.referenceEvidence.sourceOrdinal, right.referenceEvidence.evidenceId],
      ))[0]!;
      return result(identity, normalizedReference, audience, {
        status: 'reference_aligned_source_candidate',
        sense: match.candidate.sense,
        domains: [...match.candidate.domains],
        referenceEvidence: match.referenceEvidence,
        alignmentEvidence: {
          status: 'verified_token_alignment',
          morphologyTokenIdentity: match.alignment.morphologyTokenIdentity,
          verifierVersion: match.alignment.verifierVersion,
        },
      }, coverage, provenanceSources);
    }

    const hasReferenceEvidence = candidates.some(candidate => candidate.matchingReferences.length > 0);
    return result(identity, normalizedReference, audience, {
      status: 'lexical_candidates',
      candidates: candidates.map(({ sense, domains }) => ({ sense, domains: [...domains] })),
      reason: matchedCandidateCount > 1
        ? 'ambiguous_reference_alignment'
        : hasReferenceEvidence || evidenceIncomplete ? 'reference_alignment_unproven' : 'no_reference_evidence',
    }, coverage, provenanceSources);
  }
}

function snapshotRequest(request: HebrewSemanticEvidenceRequest): Readonly<HebrewSemanticEvidenceRequestSnapshot> {
  if (!request || typeof request !== 'object') throw new Error('UBS Hebrew semantic evidence request must be a record');
  const publicStrongs = request.publicStrongs;
  const normalizedReference = request.normalizedReference;
  const audience = request.audience;
  const trustedAlignments = request.trustedAlignments;
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
    trustedAlignments: trustedAlignments ?? Object.freeze([]),
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

function validateTrustedAlignments(
  values: unknown,
  sourceIdentity: UbsInternalHebrewLexicalIdentity,
  normalizedReference: string,
): readonly Readonly<TrustedHebrewTokenAlignment>[] {
  if (!Array.isArray(values)) {
    throw new Error('trusted alignments exceed the reviewed eight-assertion bound');
  }
  const length = values.length;
  if (!Number.isSafeInteger(length) || length < 0
    || length > HEBREW_SEMANTIC_EVIDENCE_LIMITS.trustedAlignments) {
    throw new Error('trusted alignments must have an honest safe-integer length from zero through eight');
  }
  for (const key of Reflect.ownKeys(values)) {
    if (typeof key !== 'string' || !isCanonicalArrayIndex(key)) continue;
    if (Number(key) >= length) {
      throw new Error('trusted alignments must be a dense array with no assertion hidden beyond its reported length');
    }
  }
  const callerRecords: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(values, index)) {
      throw new Error('trusted alignments must be a dense array with every reported index present');
    }
    callerRecords.push(values[index]);
  }
  const snapshots: Readonly<TrustedHebrewTokenAlignment>[] = [];
  const tokenIdentities = new Set<string>();
  const exactKeys = new Set<string>();
  for (const value of callerRecords) {
    if (!value || typeof value !== 'object') {
      throw new Error('trusted alignment is not bound to the exact token, source identity, normalized reference, and verifier version');
    }
    const caller = value as Record<keyof TrustedHebrewTokenAlignment, unknown>;
    const status = caller.status;
    const morphologyTokenIdentity = caller.morphologyTokenIdentity;
    const verifierVersion = caller.verifierVersion;
    const callerSourceIdentity = caller.sourceIdentity;
    const callerNormalizedReference = caller.normalizedReference;
    const sourceId = caller.sourceId;
    const entryId = caller.entryId;
    const senseId = caller.senseId;
    const evidenceId = caller.evidenceId;
    if (typeof status !== 'string' || typeof morphologyTokenIdentity !== 'string'
      || typeof verifierVersion !== 'number' || typeof callerSourceIdentity !== 'string'
      || typeof callerNormalizedReference !== 'string' || typeof sourceId !== 'string'
      || typeof entryId !== 'string' || typeof senseId !== 'string' || typeof evidenceId !== 'string') {
      throw new Error('trusted alignment exact-key fields must be primitive strings plus one numeric verifier version');
    }
    const snapshot = Object.freeze({
      status,
      morphologyTokenIdentity,
      verifierVersion,
      sourceIdentity: callerSourceIdentity,
      normalizedReference: callerNormalizedReference,
      sourceId,
      entryId,
      senseId,
      evidenceId,
    }) as Readonly<TrustedHebrewTokenAlignment>;
    if (Object.keys(value).sort().join(',') !== 'entryId,evidenceId,morphologyTokenIdentity,normalizedReference,senseId,sourceId,sourceIdentity,status,verifierVersion'
      || snapshot.status !== 'verified_token_alignment'
      || snapshot.sourceIdentity !== sourceIdentity
      || requireUbsSemanticNormalizedReference(snapshot.normalizedReference, 'trusted alignment normalized reference') !== normalizedReference
      || !Number.isSafeInteger(snapshot.verifierVersion) || snapshot.verifierVersion < 1
      || snapshot.verifierVersion > HEBREW_SEMANTIC_EVIDENCE_LIMITS.verifierVersionMaximum) {
      throw new Error('trusted alignment is not bound to the exact token, source identity, normalized reference, and verifier version');
    }
    boundedText(
      snapshot.morphologyTokenIdentity,
      HEBREW_SEMANTIC_EVIDENCE_LIMITS.morphologyTokenIdentityCharacters,
      'trusted alignment morphology token identity',
    );
    for (const [label, identifier] of [
      ['source', snapshot.sourceId], ['entry', snapshot.entryId], ['sense', snapshot.senseId], ['evidence', snapshot.evidenceId],
    ] as const) requireIdentifier(identifier, `trusted alignment ${label} ID`);
    tokenIdentities.add(snapshot.morphologyTokenIdentity);
    const exactKey = [snapshot.sourceId, snapshot.entryId, snapshot.senseId, snapshot.evidenceId].join('\0');
    if (exactKeys.has(exactKey)) throw new Error('trusted alignments contain a duplicate exact assertion');
    exactKeys.add(exactKey);
    snapshots.push(snapshot);
  }
  if (tokenIdentities.size > 1) throw new Error('trusted alignments must describe one exact local morphology token');
  return Object.freeze(snapshots);
}

function isCanonicalArrayIndex(value: string): boolean {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return false;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 && numeric < 0xffff_ffff
    && String(numeric) === value;
}

function prioritizeTrustedSenses(
  senses: readonly UbsSemanticSense[],
  entry: UbsSemanticEntry,
  alignments: readonly TrustedHebrewTokenAlignment[],
): UbsSemanticSense[] {
  const trustedSenseIds = new Set(alignments
    .filter(alignment => alignment.sourceId === entry.sourceId && alignment.entryId === entry.entryId)
    .map(alignment => alignment.senseId));
  return [
    ...senses.filter(sense => trustedSenseIds.has(sense.senseId)),
    ...senses.filter(sense => !trustedSenseIds.has(sense.senseId)),
  ];
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
    if (entry.partOfSpeech !== undefined) boundedText(
      entry.partOfSpeech,
      HEBREW_SEMANTIC_EVIDENCE_LIMITS.entryPartOfSpeechCharacters,
      'entry part of speech',
    );
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
    boundedText(sense.definition, 20_000, 'sense definition');
    if (!Array.isArray(sense.glosses) || sense.glosses.length < 1 || sense.glosses.length > 16) {
      throw new Error('sense glosses must contain one to sixteen publishable values');
    }
    for (const gloss of sense.glosses) boundedText(gloss, 1_000, 'sense gloss');
    if (new Set(sense.glosses).size !== sense.glosses.length) throw new Error('sense glosses must be unique');
    if (!Array.isArray(sense.domainRefs) || sense.domainRefs.length < 1 || sense.domainRefs.length > 16
      || new Set(sense.domainRefs.map(ref => `${ref.sourceId}\0${ref.domainId}`)).size !== sense.domainRefs.length) {
      throw new Error('sense domain references must contain one to sixteen unique source/domain identities');
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
  if (ids.length !== 2) throw new Error('publishable semantic candidates require exactly the dictionary and lexical-domain sources');
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
  if (sources[0]?.sourceRole !== 'dictionary' || sources[1]?.sourceRole !== 'lexical_domains') {
    throw new Error('publishable semantic provenance must contain dictionary then lexical-domain source roles');
  }
  if (sources[0].artifactIdentity !== sources[1].artifactIdentity) {
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

function matchTrustedAlignments(candidates: readonly CandidateEvidence[], alignments: readonly TrustedHebrewTokenAlignment[]) {
  return alignments.flatMap(alignment => candidates.flatMap(candidate => {
    if (candidate.entry.sourceId !== alignment.sourceId || candidate.entry.entryId !== alignment.entryId
      || candidate.sense.senseId !== alignment.senseId) return [];
    const referenceEvidence = candidate.matchingReferences.find(evidence => evidence.evidenceId === alignment.evidenceId);
    return referenceEvidence ? [{ candidate, referenceEvidence, alignment }] : [];
  }));
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
