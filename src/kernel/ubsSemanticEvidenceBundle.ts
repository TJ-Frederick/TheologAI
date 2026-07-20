/**
 * Inactive aggregate-query contract for future UBS Hebrew semantic evidence.
 *
 * This contract deliberately names no table, index, SQL statement, D1 binding,
 * or source artifact path. A future Node or D1 adapter may satisfy the single
 * repository operation without committing the project to a storage layout.
 */
import {
  UBS_SEMANTIC_CURSOR_MAX_LENGTH,
  UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS,
  UBS_SEMANTIC_DEFINITION_EXCLUSION_REASONS,
  requireUbsInternalLexicalIdentity,
  requireUbsSemanticNormalizedReference,
} from './ubsSemanticDomain.js';
import type {
  UbsInternalHebrewLexicalIdentity,
  UbsSemanticDomain,
  UbsSemanticDomainRef,
  UbsSemanticEntry,
  UbsSemanticReferenceEvidence,
  UbsSemanticSense,
  UbsSemanticSource,
} from './ubsSemanticDomain.js';

export const UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS = Object.freeze({
  candidatesPerPage: 8,
  domainsPerSense: 16,
  matchingReferencesPerSense: 16,
  provenanceSources: 2,
  lexicalIdentitiesPerEntry: 16,
} as const);

export const UBS_SEMANTIC_EVIDENCE_BUNDLE_OPERATION = 'getSemanticEvidenceBundle' as const;
export const UBS_SEMANTIC_EVIDENCE_BUNDLE_ORDER =
  'entry_source_id_entry_ordinal_entry_id_sense_ordinal_sense_id' as const;

export interface UbsSemanticEvidenceBundleRequest {
  artifactIdentity: string;
  sourceIdentity: UbsInternalHebrewLexicalIdentity;
  normalizedReference: string;
  /** Internal repository continuation only; never a public authorization token. */
  page?: { cursor?: string };
}

export interface UbsSemanticEvidenceBundleRepositoryQuery {
  artifactIdentity: string;
  sourceIdentity: UbsInternalHebrewLexicalIdentity;
  normalizedReference: string;
  limit: typeof UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS.candidatesPerPage;
  order: typeof UBS_SEMANTIC_EVIDENCE_BUNDLE_ORDER;
  /**
   * Decoded from an opaque caller cursor. This is deliberately untrusted until
   * the repository returns a matching, authoritative boundary attestation.
   */
  after?: {
    keyset: readonly [string, string, string, string, string];
    priorShowing: number;
  };
}

export interface UbsSemanticEvidenceBundleCandidateRow {
  entry: UbsSemanticEntry;
  /** `domainRefs` is this bounded aggregate window, not an unbounded source read. */
  sense: UbsSemanticSense;
  domains: UbsSemanticDomain[];
  /** Authoritative source-attested total before bounded domain refs/details are sliced. */
  domainTotal: number;
  matchingReferences: UbsSemanticReferenceEvidence[];
  /** Honest exact-reference total before the bounded representation is sliced. */
  matchingReferenceTotal: number;
}

/**
 * Evidence produced by the one aggregate repository operation. For a
 * continuation, an adapter must derive `priorShowing` and `after.keyset` from
 * the actual ordered result set—not echo the cursor request. An adapter must
 * reject a missing, stale, or non-boundary keyset rather than return a page.
 */
export interface UbsSemanticEvidenceBundleRepositoryBoundary {
  artifactIdentity: string;
  sourceIdentity: UbsInternalHebrewLexicalIdentity;
  normalizedReference: string;
  order: typeof UBS_SEMANTIC_EVIDENCE_BUNDLE_ORDER;
  /** Authoritative number of candidates before this returned window. */
  priorShowing: number;
  /** Present only after the repository has validated a genuine continuation boundary. */
  after?: {
    keyset: readonly [string, string, string, string, string];
  };
}

export interface UbsSemanticEvidenceBundleRepositoryPage {
  items: UbsSemanticEvidenceBundleCandidateRow[];
  lexicalEntryTotal: number;
  semanticSenseTotal: number;
  /** The repository's authoritative attestation of the requested page boundary. */
  boundary: UbsSemanticEvidenceBundleRepositoryBoundary;
  sources: UbsSemanticSource[];
}

export interface IUbsSemanticEvidenceBundleRepository {
  /** One bounded aggregate operation, independent of the number of returned candidates. */
  getSemanticEvidenceBundle(
    query: Readonly<UbsSemanticEvidenceBundleRepositoryQuery>,
  ): Promise<UbsSemanticEvidenceBundleRepositoryPage>;
}

export interface UbsSemanticEvidenceBundleCoverage {
  lexicalEntryTotal: number;
  semanticSenseTotal: number;
  candidateWindow: {
    priorCount: number;
    returnedCount: number;
    consumedCount: number;
    totalCount: number;
    hasMore: boolean;
    nextCursor?: string;
  };
  completeForReturnedWindow: boolean;
  completeForWholeQuery: boolean;
  incompleteReasons: readonly (
    | 'candidate_window'
    | 'prior_candidate_window'
    | 'domain_evidence'
    | 'reference_evidence'
  )[];
}

export interface UbsSemanticEvidenceBundle {
  operation: typeof UBS_SEMANTIC_EVIDENCE_BUNDLE_OPERATION;
  order: typeof UBS_SEMANTIC_EVIDENCE_BUNDLE_ORDER;
  query: {
    artifactIdentity: string;
    sourceIdentity: UbsInternalHebrewLexicalIdentity;
    normalizedReference: string;
  };
  candidates: readonly UbsSemanticEvidenceBundleCandidateRow[];
  sources: readonly UbsSemanticSource[];
  coverage: UbsSemanticEvidenceBundleCoverage;
}

interface BundleCursorPayload {
  version: 1;
  operation: typeof UBS_SEMANTIC_EVIDENCE_BUNDLE_OPERATION;
  order: typeof UBS_SEMANTIC_EVIDENCE_BUNDLE_ORDER;
  artifactIdentity: string;
  sourceIdentity: UbsInternalHebrewLexicalIdentity;
  normalizedReference: string;
  keyset: [string, string, string, string, string];
  priorShowing: number;
}

export async function queryUbsSemanticEvidenceBundle(
  repository: IUbsSemanticEvidenceBundleRepository,
  request: UbsSemanticEvidenceBundleRequest,
): Promise<UbsSemanticEvidenceBundle> {
  const query = snapshotQuery(request);
  const page = await repository.getSemanticEvidenceBundle(query);
  return validateAndBuildBundle(page, query);
}

export function createUbsSemanticEvidenceBundleCursor(
  query: Pick<UbsSemanticEvidenceBundleRepositoryQuery,
    'artifactIdentity' | 'sourceIdentity' | 'normalizedReference'>,
  candidate: UbsSemanticEvidenceBundleCandidateRow,
  priorShowing: number,
): string {
  const binding = snapshotCursorBinding(query);
  positiveSafeInteger(priorShowing, 'bundle cursor prior showing');
  const keyset = snapshotCandidateKeyset(candidate);
  const payload: BundleCursorPayload = {
    version: 1,
    operation: UBS_SEMANTIC_EVIDENCE_BUNDLE_OPERATION,
    order: UBS_SEMANTIC_EVIDENCE_BUNDLE_ORDER,
    artifactIdentity: binding.artifactIdentity,
    sourceIdentity: binding.sourceIdentity,
    normalizedReference: binding.normalizedReference,
    keyset,
    priorShowing,
  };
  const encoded = [...new TextEncoder().encode(JSON.stringify(payload))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  const cursor = `ubsa1_${encoded}`;
  if (cursor.length > UBS_SEMANTIC_CURSOR_MAX_LENGTH) {
    throw new Error('UBS semantic aggregate cursor exceeds the shared cursor bound');
  }
  return cursor;
}

export function parseUbsSemanticEvidenceBundleCursor(
  cursor: string,
  expected: Pick<UbsSemanticEvidenceBundleRepositoryQuery,
    'artifactIdentity' | 'sourceIdentity' | 'normalizedReference'>,
): { keyset: [string, string, string, string, string]; priorShowing: number } {
  const binding = snapshotCursorBinding(expected);
  if (typeof cursor !== 'string' || cursor.length > UBS_SEMANTIC_CURSOR_MAX_LENGTH
    || !/^ubsa1_(?:[0-9a-f]{2})+$/.test(cursor)) {
    throw new Error('UBS semantic aggregate cursor has an invalid bounded encoding');
  }
  let value: unknown;
  try {
    const bytes = cursor.slice(6).match(/../g)!.map(byte => Number.parseInt(byte, 16));
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)));
  } catch {
    throw new Error('UBS semantic aggregate cursor has an invalid payload');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('UBS semantic aggregate cursor payload must be an object');
  }
  const payload = value as Partial<BundleCursorPayload>;
  if (Object.keys(payload).join(',') !== [
    'version', 'operation', 'order', 'artifactIdentity', 'sourceIdentity',
    'normalizedReference', 'keyset', 'priorShowing',
  ].join(',')
    || payload.version !== 1
    || payload.operation !== UBS_SEMANTIC_EVIDENCE_BUNDLE_OPERATION
    || payload.order !== UBS_SEMANTIC_EVIDENCE_BUNDLE_ORDER
    || payload.artifactIdentity !== binding.artifactIdentity
    || payload.sourceIdentity !== binding.sourceIdentity
    || payload.normalizedReference !== binding.normalizedReference
    || !Array.isArray(payload.keyset)) {
    throw new Error('UBS semantic aggregate cursor does not match its exact query and artifact binding');
  }
  const keyset = validateCandidateKeyset(payload.keyset);
  positiveSafeInteger(payload.priorShowing, 'bundle cursor prior showing');
  const canonical = createCursorFromKeyset(binding, keyset, payload.priorShowing);
  if (canonical !== cursor) throw new Error('UBS semantic aggregate cursor is not canonical');
  return { keyset, priorShowing: payload.priorShowing };
}

function snapshotQuery(request: UbsSemanticEvidenceBundleRequest): Readonly<UbsSemanticEvidenceBundleRepositoryQuery> {
  if (!request || typeof request !== 'object') throw new Error('UBS semantic aggregate request must be a record');
  const artifactIdentity = request.artifactIdentity;
  const sourceIdentity = requireHebrewIdentity(request.sourceIdentity);
  const normalizedReference = requireUbsSemanticNormalizedReference(request.normalizedReference);
  const rawPage = request.page;
  const cursor = rawPage?.cursor;
  validateArtifactIdentity(artifactIdentity);
  const base = { artifactIdentity, sourceIdentity, normalizedReference };
  const after = cursor === undefined
    ? undefined
    : parseUbsSemanticEvidenceBundleCursor(cursor, base);
  return Object.freeze({
    ...base,
    limit: UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS.candidatesPerPage,
    order: UBS_SEMANTIC_EVIDENCE_BUNDLE_ORDER,
    ...(after ? { after: Object.freeze({ keyset: Object.freeze(after.keyset), priorShowing: after.priorShowing }) } : {}),
  });
}

/**
 * Cursor payloads bind a request but do not authorize a position. The sole
 * repository call must therefore return an independently derived boundary
 * attestation before this coordinator may publish its result window.
 */
function validateRepositoryBoundary(
  raw: UbsSemanticEvidenceBundleRepositoryBoundary,
  query: Readonly<UbsSemanticEvidenceBundleRepositoryQuery>,
): number {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('UBS semantic aggregate repository omitted its authoritative page boundary');
  }
  const hasContinuation = query.after !== undefined;
  const expectedKeys = hasContinuation
    ? ['artifactIdentity', 'sourceIdentity', 'normalizedReference', 'order', 'priorShowing', 'after']
    : ['artifactIdentity', 'sourceIdentity', 'normalizedReference', 'order', 'priorShowing'];
  if (!hasExactOwnKeys(raw, expectedKeys)) {
    throw new Error('UBS semantic aggregate repository returned a malformed authoritative page boundary');
  }
  const {
    artifactIdentity,
    sourceIdentity: rawSourceIdentity,
    normalizedReference,
    order,
    priorShowing,
    after: rawAfter,
  } = raw;
  validateArtifactIdentity(artifactIdentity);
  const sourceIdentity = requireHebrewIdentity(rawSourceIdentity);
  const canonicalReference = requireUbsSemanticNormalizedReference(normalizedReference);
  nonNegativeSafeInteger(priorShowing, 'bundle authoritative prior showing');
  if (artifactIdentity !== query.artifactIdentity || sourceIdentity !== query.sourceIdentity
    || canonicalReference !== query.normalizedReference || order !== query.order) {
    throw new Error('UBS semantic aggregate repository boundary does not attest the exact query and order');
  }
  if (!hasContinuation) {
    if (priorShowing !== 0 || rawAfter !== undefined) {
      throw new Error('UBS semantic aggregate first page has a nonzero or continuation boundary');
    }
    return priorShowing;
  }
  if (!rawAfter || typeof rawAfter !== 'object' || Array.isArray(rawAfter)
    || !hasExactOwnKeys(rawAfter, ['keyset'])) {
    throw new Error('UBS semantic aggregate repository did not validate the requested continuation boundary');
  }
  const authoritativeKeyset = validateCandidateKeyset(rawAfter.keyset);
  if (priorShowing !== query.after!.priorShowing
    || compareKeysets(authoritativeKeyset, query.after!.keyset) !== 0) {
    throw new Error('UBS semantic aggregate repository boundary does not match the requested cursor position');
  }
  return priorShowing;
}

function validateAndBuildBundle(
  raw: UbsSemanticEvidenceBundleRepositoryPage,
  query: Readonly<UbsSemanticEvidenceBundleRepositoryQuery>,
): UbsSemanticEvidenceBundle {
  if (!raw || !Array.isArray(raw.items) || !Array.isArray(raw.sources)
    || raw.items.length > UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS.candidatesPerPage) {
    throw new Error('UBS semantic aggregate repository returned a malformed bounded page');
  }
  nonNegativeSafeInteger(raw.lexicalEntryTotal, 'bundle lexical entry total');
  nonNegativeSafeInteger(raw.semanticSenseTotal, 'bundle semantic sense total');
  const priorShowing = validateRepositoryBoundary(raw.boundary, query);
  const consumed = priorShowing + raw.items.length;
  if (!Number.isSafeInteger(consumed) || consumed > raw.semanticSenseTotal
    || (consumed < raw.semanticSenseTotal && raw.items.length === 0)) {
    throw new Error('UBS semantic aggregate page violates its honest candidate window');
  }
  if ((raw.semanticSenseTotal > 0 && raw.lexicalEntryTotal === 0)
    || (raw.semanticSenseTotal === 0 && raw.items.length > 0)) {
    throw new Error('UBS semantic aggregate entry and sense totals are internally inconsistent');
  }
  const sources = cloneAndValidateSources(raw.sources, query.artifactIdentity);
  const items = raw.items.map(item => cloneAndValidateCandidate(item, query.normalizedReference));
  validateCandidateOrder(items, query.sourceIdentity, sources, raw.lexicalEntryTotal);
  if (query.after && items.length > 0 && compareKeysets(candidateKeyset(items[0]!), query.after.keyset) <= 0) {
    throw new Error('UBS semantic aggregate page did not advance beyond its exact cursor keyset');
  }
  const hasMore = consumed < raw.semanticSenseTotal;
  const nextCursor = hasMore
    ? createCursorFromKeyset(query, snapshotCandidateKeyset(items.at(-1)!), consumed)
    : undefined;
  const incompleteReasons = new Set<UbsSemanticEvidenceBundleCoverage['incompleteReasons'][number]>();
  if (hasMore) incompleteReasons.add('candidate_window');
  if (priorShowing > 0) incompleteReasons.add('prior_candidate_window');
  for (const item of items) {
    if (item.domains.length !== item.domainTotal) incompleteReasons.add('domain_evidence');
    if (item.matchingReferences.length !== item.matchingReferenceTotal) incompleteReasons.add('reference_evidence');
  }
  const completeForReturnedWindow = !incompleteReasons.has('domain_evidence')
    && !incompleteReasons.has('reference_evidence');
  return {
    operation: UBS_SEMANTIC_EVIDENCE_BUNDLE_OPERATION,
    order: UBS_SEMANTIC_EVIDENCE_BUNDLE_ORDER,
    query: {
      artifactIdentity: query.artifactIdentity,
      sourceIdentity: query.sourceIdentity,
      normalizedReference: query.normalizedReference,
    },
    candidates: items,
    sources,
    coverage: {
      lexicalEntryTotal: raw.lexicalEntryTotal,
      semanticSenseTotal: raw.semanticSenseTotal,
      candidateWindow: {
        priorCount: priorShowing,
        returnedCount: items.length,
        consumedCount: consumed,
        totalCount: raw.semanticSenseTotal,
        hasMore,
        ...(nextCursor ? { nextCursor } : {}),
      },
      completeForReturnedWindow,
      completeForWholeQuery: priorShowing === 0 && !hasMore && completeForReturnedWindow,
      incompleteReasons: [...incompleteReasons],
    },
  };
}

function cloneAndValidateCandidate(
  raw: UbsSemanticEvidenceBundleCandidateRow,
  normalizedReference: string,
): UbsSemanticEvidenceBundleCandidateRow {
  if (!raw || typeof raw !== 'object') {
    throw new Error('UBS semantic aggregate candidate row is malformed');
  }
  const {
    entry: rawEntry,
    sense: rawSense,
    domains: rawDomains,
    domainTotal,
    matchingReferences: rawMatchingReferences,
    matchingReferenceTotal,
  } = raw;
  if (!rawEntry || !rawSense || !Array.isArray(rawDomains) || !Array.isArray(rawMatchingReferences)) {
    throw new Error('UBS semantic aggregate candidate row is malformed');
  }
  nonNegativeSafeInteger(domainTotal, 'bundle domain total');
  nonNegativeSafeInteger(matchingReferenceTotal, 'bundle matching-reference total');
  if (rawDomains.length > UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS.domainsPerSense
    || rawMatchingReferences.length > UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS.matchingReferencesPerSense) {
    throw new Error('UBS semantic aggregate nested evidence violates deterministic caps or honest totals');
  }
  const entry = cloneAndValidateEntry(rawEntry);
  const sense = cloneAndValidateSense(rawSense);
  if (sense.sourceId !== entry.sourceId || sense.entryId !== entry.entryId) {
    throw new Error('UBS semantic aggregate sense does not belong to its bundled entry');
  }
  const domains = rawDomains.map(domain => cloneAndValidateDomain(domain)).sort(compareDomains);
  const matchingReferences = rawMatchingReferences.map(evidence =>
    cloneAndValidateReferenceEvidence(evidence, normalizedReference, sense.sourceId, sense.senseId),
  ).sort(compareReferenceEvidence);
  if (domains.length > domainTotal || sense.domainRefs.length > domainTotal
    || matchingReferences.length > matchingReferenceTotal) {
    throw new Error('UBS semantic aggregate nested evidence exceeds its authoritative total');
  }
  const expectedDomains = new Set(sense.domainRefs.map(domainReferenceIdentity));
  if (expectedDomains.size !== sense.domainRefs.length
    || expectedDomains.size !== domains.length
    || domains.some(domain => !expectedDomains.has(domainIdentity(domain)))) {
    throw new Error('UBS semantic aggregate domain evidence does not match its bounded source-attested references');
  }
  const domainIdentities = new Set<string>();
  const domainOrdinals = new Set<number>();
  for (const domain of domains) {
    const identity = domainIdentity(domain);
    if (domainIdentities.has(identity)) throw new Error('UBS semantic aggregate contains a duplicate domain identity');
    domainIdentities.add(identity);
    if (domainOrdinals.has(domain.sourceOrdinal)) throw new Error('UBS semantic aggregate contains a duplicate domain ordinal');
    domainOrdinals.add(domain.sourceOrdinal);
  }
  const referenceIdentities = new Set<string>();
  const referenceOrdinals = new Set<number>();
  for (const evidence of matchingReferences) {
    const identity = `${evidence.sourceId}\0${evidence.evidenceId}`;
    if (referenceIdentities.has(identity)) throw new Error('UBS semantic aggregate contains duplicate reference evidence');
    referenceIdentities.add(identity);
    if (referenceOrdinals.has(evidence.sourceOrdinal)) throw new Error('UBS semantic aggregate contains a duplicate reference ordinal');
    referenceOrdinals.add(evidence.sourceOrdinal);
  }
  return {
    entry,
    sense,
    domains,
    domainTotal,
    matchingReferences,
    matchingReferenceTotal,
  };
}

function cloneAndValidateEntry(raw: UbsSemanticEntry): UbsSemanticEntry {
  if (!raw || typeof raw !== 'object') throw new Error('UBS semantic aggregate entry is malformed');
  const {
    entryId, sourceId, sourceOrdinal, lemma, transliteration, partOfSpeech,
    lexicalIdentities: rawLexicalIdentities,
  } = raw;
  identifier(sourceId, 'bundle entry source ID');
  identifier(entryId, 'bundle entry ID');
  positiveSafeInteger(sourceOrdinal, 'bundle entry ordinal');
  boundedText(lemma, 2_000, 'bundle entry lemma');
  if (transliteration !== undefined) boundedText(transliteration, 2_000, 'bundle entry transliteration');
  if (partOfSpeech !== undefined) {
    if (!Array.isArray(partOfSpeech) || partOfSpeech.length > 16) {
      throw new Error('bundle entry parts of speech are malformed or unbounded');
    }
    for (const [index, value] of partOfSpeech.entries()) {
      boundedText(value, 512, `bundle entry part of speech ${index + 1}`);
    }
    if (new Set(partOfSpeech).size !== partOfSpeech.length) {
      throw new Error('bundle entry parts of speech are duplicated');
    }
  }
  if (!Array.isArray(rawLexicalIdentities)
    || rawLexicalIdentities.length > UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS.lexicalIdentitiesPerEntry) {
    throw new Error('UBS semantic aggregate entry lexical identities are malformed or unbounded');
  }
  const lexicalIdentities = rawLexicalIdentities.map(identity => requireUbsInternalLexicalIdentity(identity))
    .sort(compareCodePoints);
  if (new Set(lexicalIdentities).size !== lexicalIdentities.length) {
    throw new Error('UBS semantic aggregate entry lexical identities are duplicated');
  }
  return {
    entryId,
    sourceId,
    sourceOrdinal,
    lemma,
    ...(transliteration === undefined ? {} : { transliteration }),
    ...(partOfSpeech === undefined ? {} : { partOfSpeech: [...partOfSpeech].sort(compareCodePoints) }),
    lexicalIdentities,
  };
}

function cloneAndValidateSense(raw: UbsSemanticSense): UbsSemanticSense {
  if (!raw || typeof raw !== 'object') throw new Error('UBS semantic aggregate sense is malformed');
  const {
    senseId, sourceId, entryId, sourceOrdinal, definitionStatus, definition,
    definitionExclusionReasons: rawDefinitionExclusionReasons,
    glosses: rawGlosses, domainRefs: rawDomainRefs,
  } = raw;
  identifier(sourceId, 'bundle sense source ID');
  identifier(entryId, 'bundle sense entry ID');
  identifier(senseId, 'bundle sense ID');
  positiveSafeInteger(sourceOrdinal, 'bundle sense ordinal');
  if (!['published', 'absent_in_source', 'excluded_unresolved_markup'].includes(definitionStatus)) {
    throw new Error('UBS semantic aggregate sense definition status is invalid');
  }
  if (definition === undefined) {
    if (definitionStatus === 'published') throw new Error('published bundle sense definition is missing');
  } else {
    boundedText(definition, UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.definitionCharacters, 'bundle sense definition');
    if (definitionStatus !== 'published') throw new Error('unpublished bundle sense must not expose definition text');
  }
  if (!Array.isArray(rawDefinitionExclusionReasons) || rawDefinitionExclusionReasons.length > 8) {
    throw new Error('UBS semantic aggregate sense definition exclusion reasons are malformed or unbounded');
  }
  const definitionExclusionReasons = rawDefinitionExclusionReasons.map(reason => {
    if (!UBS_SEMANTIC_DEFINITION_EXCLUSION_REASONS.includes(reason)) {
      throw new Error('UBS semantic aggregate sense definition exclusion reason is unsupported');
    }
    return reason;
  });
  if (new Set(definitionExclusionReasons).size !== definitionExclusionReasons.length
    || (definitionStatus === 'excluded_unresolved_markup') !== (definitionExclusionReasons.length > 0)) {
    throw new Error('UBS semantic aggregate sense definition exclusion reasons are inconsistent');
  }
  if (!Array.isArray(rawGlosses) || rawGlosses.length < 1
    || rawGlosses.length > UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.glossesPerSense
    || new Set(rawGlosses).size !== rawGlosses.length) {
    throw new Error('UBS semantic aggregate sense glosses are malformed, duplicated, or unbounded');
  }
  const glosses = rawGlosses.map(gloss => {
    boundedText(gloss, UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.glossCharacters, 'bundle sense gloss');
    return gloss;
  });
  if (!Array.isArray(rawDomainRefs)
    || rawDomainRefs.length > UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS.domainsPerSense) {
    throw new Error('UBS semantic aggregate bounded domain references are malformed or unbounded');
  }
  const domainRefs = rawDomainRefs.map(domainRef => cloneAndValidateDomainRef(domainRef))
    .sort(compareDomainRefs);
  if (new Set(domainRefs.map(domainReferenceIdentity)).size !== domainRefs.length) {
    throw new Error('UBS semantic aggregate bounded domain references are duplicated');
  }
  return {
    senseId, sourceId, entryId, sourceOrdinal, definitionStatus,
    ...(definition === undefined ? {} : { definition }),
    definitionExclusionReasons, glosses, domainRefs,
  };
}

function cloneAndValidateDomainRef(raw: UbsSemanticDomainRef): UbsSemanticDomainRef {
  if (!raw || typeof raw !== 'object') throw new Error('UBS semantic aggregate domain reference is malformed');
  const { sourceId, domainId } = raw;
  identifier(sourceId, 'bundle domain-reference source ID');
  identifier(domainId, 'bundle domain-reference domain ID');
  return { sourceId, domainId };
}

function cloneAndValidateDomain(raw: UbsSemanticDomain): UbsSemanticDomain {
  if (!raw || typeof raw !== 'object') throw new Error('UBS semantic aggregate domain is malformed');
  const { domainId, sourceId, sourceOrdinal, parentDomainId, label, description } = raw;
  identifier(sourceId, 'bundle domain source ID');
  identifier(domainId, 'bundle domain ID');
  positiveSafeInteger(sourceOrdinal, 'bundle domain ordinal');
  boundedText(label, 1_000, 'bundle domain label');
  if (description !== undefined) boundedText(description, 5_000, 'bundle domain description');
  if (parentDomainId !== undefined) identifier(parentDomainId, 'bundle parent domain ID');
  return {
    domainId,
    sourceId,
    sourceOrdinal,
    ...(parentDomainId === undefined ? {} : { parentDomainId }),
    label,
    ...(description === undefined ? {} : { description }),
  };
}

function cloneAndValidateReferenceEvidence(
  raw: UbsSemanticReferenceEvidence,
  normalizedReference: string,
  expectedSourceId: string,
  expectedSenseId: string,
): UbsSemanticReferenceEvidence {
  if (!raw || typeof raw !== 'object') throw new Error('UBS semantic aggregate reference evidence is malformed');
  const {
    evidenceId, sourceId, senseId, sourceOrdinal, sourceReference,
    normalizedReference: evidenceNormalizedReference, evidenceKind,
  } = raw;
  identifier(sourceId, 'bundle reference source ID');
  identifier(senseId, 'bundle reference sense ID');
  identifier(evidenceId, 'bundle reference evidence ID');
  positiveSafeInteger(sourceOrdinal, 'bundle reference ordinal');
  requireUbsSemanticNormalizedReference(sourceReference, 'bundle evidence source reference');
  if (sourceId !== expectedSourceId || senseId !== expectedSenseId
    || evidenceNormalizedReference !== normalizedReference
    || evidenceKind !== 'source_attested_sense_reference') {
    throw new Error('UBS semantic aggregate reference evidence does not belong to its sense or exact query identity');
  }
  requireUbsSemanticNormalizedReference(evidenceNormalizedReference, 'bundle evidence normalized reference');
  return {
    evidenceId,
    sourceId,
    senseId,
    sourceOrdinal,
    sourceReference,
    normalizedReference: evidenceNormalizedReference,
    evidenceKind,
  };
}

function validateCandidateOrder(
  items: readonly UbsSemanticEvidenceBundleCandidateRow[],
  identity: UbsInternalHebrewLexicalIdentity,
  sources: readonly UbsSemanticSource[],
  lexicalEntryTotal: number,
): void {
  const senses = new Set<string>();
  const evidence = new Set<string>();
  const entryOrdinals = new Map<string, string>();
  const entrySignatures = new Map<string, string>();
  const senseOrdinals = new Set<string>();
  const domainSignatures = new Map<string, string>();
  const domainOrdinals = new Map<string, string>();
  let prior: [string, string, string, string, string] | undefined;
  for (const item of items) {
    if (!item.entry.lexicalIdentities.includes(identity)) {
      throw new Error('UBS semantic aggregate entry is not attached to the exact query identity');
    }
    if (item.entry.sourceId !== sources[0]!.sourceId || item.sense.sourceId !== sources[0]!.sourceId
      || item.sense.domainRefs.some(ref => ref.sourceId !== sources[1]!.sourceId)
      || item.domains.some(domain => domain.sourceId !== sources[1]!.sourceId)) {
      throw new Error('UBS semantic aggregate candidate rows do not match their exact provenance source roles');
    }
    const entryIdentity = `${item.entry.sourceId}\0${item.entry.entryId}`;
    const entrySignature = JSON.stringify([
      item.entry.sourceOrdinal,
      item.entry.lemma,
      item.entry.transliteration ?? null,
      item.entry.partOfSpeech ?? null,
      item.entry.lexicalIdentities,
    ]);
    const existingEntry = entrySignatures.get(entryIdentity);
    if (existingEntry !== undefined && existingEntry !== entrySignature) {
      throw new Error('UBS semantic aggregate repeats an entry with inconsistent evidence');
    }
    entrySignatures.set(entryIdentity, entrySignature);
    const entryOrdinal = `${item.entry.sourceId}\0${item.entry.sourceOrdinal}`;
    const ordinalEntry = entryOrdinals.get(entryOrdinal);
    if (ordinalEntry !== undefined && ordinalEntry !== item.entry.entryId) {
      throw new Error('UBS semantic aggregate reuses an entry source ordinal');
    }
    entryOrdinals.set(entryOrdinal, item.entry.entryId);
    const senseIdentity = `${item.sense.sourceId}\0${item.sense.senseId}`;
    if (senses.has(senseIdentity)) throw new Error('UBS semantic aggregate contains a duplicate sense identity');
    senses.add(senseIdentity);
    const senseOrdinal = `${entryIdentity}\0${item.sense.sourceOrdinal}`;
    if (senseOrdinals.has(senseOrdinal)) throw new Error('UBS semantic aggregate reuses a sense ordinal within an entry');
    senseOrdinals.add(senseOrdinal);
    for (const row of item.matchingReferences) {
      const evidenceIdentity = `${row.sourceId}\0${row.evidenceId}`;
      if (evidence.has(evidenceIdentity)) throw new Error('UBS semantic aggregate repeats reference evidence across candidates');
      evidence.add(evidenceIdentity);
    }
    for (const domain of item.domains) {
      const domainIdentity = `${domain.sourceId}\0${domain.domainId}`;
      const signature = JSON.stringify([
        domain.sourceOrdinal,
        domain.parentDomainId ?? null,
        domain.label,
        domain.description ?? null,
      ]);
      const existingSignature = domainSignatures.get(domainIdentity);
      if (existingSignature !== undefined && existingSignature !== signature) {
        throw new Error('UBS semantic aggregate repeats a domain identity with inconsistent evidence');
      }
      domainSignatures.set(domainIdentity, signature);
      const ordinalIdentity = `${domain.sourceId}\0${domain.sourceOrdinal}`;
      const existingDomainId = domainOrdinals.get(ordinalIdentity);
      if (existingDomainId !== undefined && existingDomainId !== domain.domainId) {
        throw new Error('UBS semantic aggregate reuses a domain source ordinal for another domain ID');
      }
      domainOrdinals.set(ordinalIdentity, domain.domainId);
    }
    const current = candidateKeyset(item);
    if (prior && compareKeysets(prior, current) >= 0) {
      throw new Error('UBS semantic aggregate candidates are not in strict canonical order');
    }
    prior = current;
  }
  if (entrySignatures.size > lexicalEntryTotal) {
    throw new Error('UBS semantic aggregate exposes more distinct bundled entries than its lexical entry total');
  }
}

function cloneAndValidateSources(
  rawSources: readonly UbsSemanticSource[],
  artifactIdentity: string,
): UbsSemanticSource[] {
  if (rawSources.length !== UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS.provenanceSources) {
    throw new Error('UBS semantic aggregate provenance must contain the exact dictionary/domain artifact pair');
  }
  const sources = [
    cloneAndValidateSource(rawSources[0]!, artifactIdentity, 'dictionary'),
    cloneAndValidateSource(rawSources[1]!, artifactIdentity, 'lexical_domains'),
  ];
  if (sources[0]!.sourceId === sources[1]!.sourceId) {
    throw new Error('UBS semantic aggregate provenance source IDs must be unique');
  }
  return sources;
}

function cloneAndValidateSource(
  raw: UbsSemanticSource,
  artifactIdentity: string,
  expectedRole: UbsSemanticSource['sourceRole'],
): UbsSemanticSource {
  if (!raw || typeof raw !== 'object') throw new Error('UBS semantic aggregate provenance source is malformed');
  const {
    sourceId, sourceRole, schemaVersion, artifactIdentity: sourceArtifactIdentity,
    title, artifactName, artifactVersion, language, publisher, license, licenseUrl,
    sourceUrl, sourceCommit, sourceBlob, sourceSha256, transformVersion, modified, modificationNote,
  } = raw;
  identifier(sourceId, 'bundle provenance source ID');
  boundedText(title, 1_000, 'bundle provenance title');
  boundedText(modificationNote, UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.modificationDescriptionCharacters,
    'bundle provenance modification note');
  boundedText(sourceUrl, UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.sourceUrlCharacters,
    'bundle provenance source URL');
  if (sourceArtifactIdentity !== artifactIdentity || sourceRole !== expectedRole
    || schemaVersion !== 'ubs-semantics.v1' || artifactVersion !== '0.9.2'
    || language !== 'Hebrew' || publisher !== 'United Bible Societies'
    || license !== 'CC BY-SA 4.0'
    || licenseUrl !== 'https://creativecommons.org/licenses/by-sa/4.0/'
    || transformVersion !== 7 || modified !== true
    || (sourceRole === 'dictionary' && artifactName !== 'UBSHebrewDic-v0.9.2-en.JSON')
    || (sourceRole === 'lexical_domains' && artifactName !== 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON')
    || !validHttpsUrl(sourceUrl)
    || !/^[0-9a-f]{40}$/.test(sourceCommit)
    || !/^[0-9a-f]{40}$/.test(sourceBlob)
    || !/^[0-9a-f]{64}$/.test(sourceSha256)) {
    throw new Error('UBS semantic aggregate provenance is malformed or incompatible');
  }
  if (sourceRole === 'dictionary') {
    return {
      sourceId,
      sourceRole,
      schemaVersion,
      artifactIdentity: sourceArtifactIdentity,
      title,
      artifactName,
      artifactVersion,
      language,
      publisher,
      license,
      licenseUrl,
      sourceUrl,
      sourceCommit,
      sourceBlob,
      sourceSha256,
      transformVersion,
      modified,
      modificationNote,
    };
  }
  return {
    sourceId,
    sourceRole,
    schemaVersion,
    artifactIdentity: sourceArtifactIdentity,
    title,
    artifactName,
    artifactVersion,
    language,
    publisher,
    license,
    licenseUrl,
    sourceUrl,
    sourceCommit,
    sourceBlob,
    sourceSha256,
    transformVersion,
    modified,
    modificationNote,
  };
}

function domainReferenceIdentity(value: UbsSemanticDomainRef): string {
  return `${value.sourceId}\0${value.domainId}`;
}

function domainIdentity(value: UbsSemanticDomain): string {
  return `${value.sourceId}\0${value.domainId}`;
}

function compareDomainRefs(left: UbsSemanticDomainRef, right: UbsSemanticDomainRef): number {
  return compareCodePoints(left.sourceId, right.sourceId)
    || compareCodePoints(left.domainId, right.domainId);
}

function compareDomains(left: UbsSemanticDomain, right: UbsSemanticDomain): number {
  return left.sourceOrdinal - right.sourceOrdinal
    || compareCodePoints(left.sourceId, right.sourceId)
    || compareCodePoints(left.domainId, right.domainId);
}

function compareReferenceEvidence(
  left: UbsSemanticReferenceEvidence,
  right: UbsSemanticReferenceEvidence,
): number {
  return left.sourceOrdinal - right.sourceOrdinal
    || compareCodePoints(left.sourceId, right.sourceId)
    || compareCodePoints(left.senseId, right.senseId)
    || compareCodePoints(left.evidenceId, right.evidenceId);
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = [...left].map(character => character.codePointAt(0)!);
  const rightPoints = [...right].map(character => character.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index]! - rightPoints[index]!;
  }
  return leftPoints.length - rightPoints.length;
}

function candidateKeyset(candidate: UbsSemanticEvidenceBundleCandidateRow): [string, string, string, string, string] {
  return validateCandidateKeyset([
    candidate.entry.sourceId,
    String(candidate.entry.sourceOrdinal),
    candidate.entry.entryId,
    String(candidate.sense.sourceOrdinal),
    candidate.sense.senseId,
  ]);
}

function snapshotCandidateKeyset(
  candidate: UbsSemanticEvidenceBundleCandidateRow,
): [string, string, string, string, string] {
  if (!candidate || typeof candidate !== 'object') throw new Error('UBS semantic aggregate cursor candidate must be a record');
  const entry = candidate.entry;
  const sense = candidate.sense;
  if (!entry || typeof entry !== 'object' || !sense || typeof sense !== 'object') {
    throw new Error('UBS semantic aggregate cursor candidate entry and sense must be records');
  }
  const sourceId = entry.sourceId;
  const entryOrdinal = entry.sourceOrdinal;
  const entryId = entry.entryId;
  const senseOrdinal = sense.sourceOrdinal;
  const senseId = sense.senseId;
  positiveSafeInteger(entryOrdinal, 'bundle cursor entry ordinal');
  positiveSafeInteger(senseOrdinal, 'bundle cursor sense ordinal');
  return validateCandidateKeyset([
    sourceId, String(entryOrdinal), entryId, String(senseOrdinal), senseId,
  ]);
}

function snapshotCursorBinding(
  query: Pick<UbsSemanticEvidenceBundleRepositoryQuery,
    'artifactIdentity' | 'sourceIdentity' | 'normalizedReference'>,
): Readonly<Pick<UbsSemanticEvidenceBundleRepositoryQuery,
  'artifactIdentity' | 'sourceIdentity' | 'normalizedReference'>> {
  if (!query || typeof query !== 'object') throw new Error('UBS semantic aggregate cursor binding must be a record');
  const artifactIdentity = query.artifactIdentity;
  const rawSourceIdentity = query.sourceIdentity;
  const rawNormalizedReference = query.normalizedReference;
  validateArtifactIdentity(artifactIdentity);
  const sourceIdentity = requireHebrewIdentity(rawSourceIdentity);
  const normalizedReference = requireUbsSemanticNormalizedReference(rawNormalizedReference);
  return Object.freeze({ artifactIdentity, sourceIdentity, normalizedReference });
}

function validateCandidateKeyset(values: readonly unknown[]): [string, string, string, string, string] {
  if (values.length !== 5 || values.some(value => typeof value !== 'string')) {
    throw new Error('UBS semantic aggregate cursor keyset must contain exactly five strings');
  }
  const [sourceId, entryOrdinal, entryId, senseOrdinal, senseId] = values as string[];
  identifier(sourceId, 'bundle cursor entry source ID');
  identifier(entryId, 'bundle cursor entry ID');
  identifier(senseId, 'bundle cursor sense ID');
  canonicalPositiveDecimal(entryOrdinal, 'bundle cursor entry ordinal');
  canonicalPositiveDecimal(senseOrdinal, 'bundle cursor sense ordinal');
  return [sourceId, entryOrdinal, entryId, senseOrdinal, senseId];
}

function createCursorFromKeyset(
  query: Pick<UbsSemanticEvidenceBundleRepositoryQuery,
    'artifactIdentity' | 'sourceIdentity' | 'normalizedReference'>,
  keyset: [string, string, string, string, string],
  priorShowing: number,
): string {
  const payload: BundleCursorPayload = {
    version: 1,
    operation: UBS_SEMANTIC_EVIDENCE_BUNDLE_OPERATION,
    order: UBS_SEMANTIC_EVIDENCE_BUNDLE_ORDER,
    artifactIdentity: query.artifactIdentity,
    sourceIdentity: query.sourceIdentity,
    normalizedReference: query.normalizedReference,
    keyset,
    priorShowing,
  };
  return `ubsa1_${[...new TextEncoder().encode(JSON.stringify(payload))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function requireHebrewIdentity(value: string): UbsInternalHebrewLexicalIdentity {
  const identity = requireUbsInternalLexicalIdentity(value);
  if (!identity.startsWith('H')) throw new Error('UBS semantic aggregate resolution accepts only an internal H#### identity');
  return identity as UbsInternalHebrewLexicalIdentity;
}

function validateArtifactIdentity(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error('UBS semantic aggregate artifact identity must be a lowercase SHA-256');
  }
}

function hasExactOwnKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every(key => actual.includes(key));
}

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length > 128
    || !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value)) {
    throw new Error(`${label} must be a bounded canonical identifier`);
  }
}

function boundedText(value: unknown, maximum: number, label: string): asserts value is string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value !== value.normalize('NFC')
    || [...value].length > maximum || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)
    || hasUnicodeNoncharacter(value)) {
    throw new Error(`${label} must be bounded, trimmed, NFC, and permitted Unicode text`);
  }
}

function validHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || [...value].length > UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.sourceUrlCharacters
    || hasUnicodeNoncharacter(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function hasUnicodeNoncharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if ((codePoint >= 0xfdd0 && codePoint <= 0xfdef) || (codePoint & 0xffff) >= 0xfffe) return true;
  }
  return false;
}

function canonicalPositiveDecimal(value: string, label: string): void {
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${label} must be a canonical positive safe integer`);
  }
}

function positiveSafeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`${label} must be a positive safe integer`);
}

function nonNegativeSafeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative safe integer`);
}

function compareKeysets(left: readonly string[], right: readonly string[]): number {
  const numeric = new Set([1, 3]);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue;
    if (numeric.has(index)) return Number(left[index]) < Number(right[index]) ? -1 : 1;
    return left[index]! < right[index]! ? -1 : 1;
  }
  return 0;
}

function compareOrdinalId(leftOrdinal: number, leftId: string, rightOrdinal: number, rightId: string): number {
  if (leftOrdinal !== rightOrdinal) return leftOrdinal < rightOrdinal ? -1 : 1;
  if (leftId === rightId) return 0;
  return leftId < rightId ? -1 : 1;
}
