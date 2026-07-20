/**
 * Source-attested semantic evidence planned for the UBS dictionary layer.
 *
 * These types deliberately keep lexical identity, dictionary senses, domains,
 * and reference evidence separate. A reference attached to a dictionary sense
 * is not, by itself, proof that any local morphology token has that sense.
 */

export type UbsSemanticLanguage = 'Hebrew';
export type UbsSemanticPublicLanguage = 'Hebrew';
export type UbsLexicalIdentityPrefix = 'H' | 'A';
declare const UBS_INTERNAL_LEXICAL_IDENTITY: unique symbol;
/** Source/internal identity. A#### never crosses the future public boundary. */
export type UbsInternalLexicalIdentity = (`${UbsLexicalIdentityPrefix}${string}` & {
  readonly [UBS_INTERNAL_LEXICAL_IDENTITY]: true;
});
export type UbsInternalHebrewLexicalIdentity = UbsInternalLexicalIdentity & `H${string}`;
/** Existing user-facing Strong's grammar remains unpadded (for example H430). */
export type UbsPublicHebrewStrongs = `H${number}`;
export const UBS_SEMANTIC_ARTIFACT_VERSION = '0.9.2' as const;
export const UBS_SEMANTIC_TRANSFORM_VERSION = 7 as const;
export const UBS_SEMANTIC_CURSOR_MAX_LENGTH = 4096;
export const UBS_SEMANTIC_NORMALIZED_REFERENCE_MAX_CHARACTERS = 100;

export const UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS = Object.freeze({
  responseBytes: 32 * 1024,
  plainLanguageCharacters: 2_000,
  definitionCharacters: 20_000,
  glossCharacters: 1_000,
  glossesPerSense: 16,
  domainsPerSense: 16,
  candidatesPerResponse: 8,
  identifierCharacters: 128,
  referenceCharacters: UBS_SEMANTIC_NORMALIZED_REFERENCE_MAX_CHARACTERS,
  sourceUrlCharacters: 1_000,
  modificationDescriptionCharacters: 1_000,
} as const);

export interface UbsPublicHebrewIdentityBoundary {
  publicStrongs: UbsPublicHebrewStrongs;
  sourceIdentity: UbsInternalHebrewLexicalIdentity;
}

/**
 * Map the existing public Strong's grammar to the fixed-width UBS source key.
 * This is deliberately Hebrew-only, suffix-free, and limited to the source's
 * four decimal digits. It does not broaden the shared public Strong's parser.
 */
export function parseUbsPublicHebrewIdentity(input: string): UbsPublicHebrewIdentityBoundary | undefined {
  const match = /^H([0-9]{1,4})$/i.exec(input.trim());
  if (!match) return undefined;
  const number = Number(match[1]);
  if (!Number.isSafeInteger(number) || number < 1) return undefined;
  return {
    publicStrongs: `H${number}` as UbsPublicHebrewStrongs,
    sourceIdentity: requireUbsInternalLexicalIdentity(
      `H${String(number).padStart(4, '0')}`,
    ) as UbsInternalHebrewLexicalIdentity,
  };
}

export function isUbsInternalLexicalIdentity(value: string): value is UbsInternalLexicalIdentity {
  return /^[HA](?!0000$)[0-9]{4}$/.test(value);
}

/** Fail-closed constructor used before an untrusted identity reaches a repository. */
export function requireUbsInternalLexicalIdentity(value: string): UbsInternalLexicalIdentity {
  if (!isUbsInternalLexicalIdentity(value)) {
    throw new Error('UBS semantic repository identity must be a canonical fixed-width H#### or A#### source identity');
  }
  return value;
}

/** Shared fail-closed boundary for every normalized-reference seam. */
export function requireUbsSemanticNormalizedReference(value: unknown, label = 'UBS semantic normalized reference'): string {
  if (typeof value !== 'string'
    || !value
    || value !== value.trim()
    || [...value].length > UBS_SEMANTIC_NORMALIZED_REFERENCE_MAX_CHARACTERS
    || value !== value.normalize('NFC')) {
    throw new Error(`${label} must be non-empty, trimmed, NFC, and at most ${UBS_SEMANTIC_NORMALIZED_REFERENCE_MAX_CHARACTERS} Unicode characters`);
  }
  if (/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)) {
    throw new Error(`${label} contains a forbidden control, format, bidi, line-separator, or non-scalar character`);
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if ((codePoint >= 0xfdd0 && codePoint <= 0xfdef) || (codePoint & 0xffff) >= 0xfffe) {
      throw new Error(`${label} contains a forbidden Unicode noncharacter`);
    }
  }
  return value;
}

interface UbsSemanticSourceCommonProvenance {
  sourceId: string;
  title: string;
  artifactVersion: typeof UBS_SEMANTIC_ARTIFACT_VERSION;
  language: UbsSemanticLanguage;
  publisher: 'United Bible Societies';
  license: 'CC BY-SA 4.0';
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/';
  sourceUrl: string;
  sourceCommit: string;
  sourceBlob: string;
  sourceSha256: string;
  transformVersion: typeof UBS_SEMANTIC_TRANSFORM_VERSION;
  modified: true;
  modificationNote: string;
}

export type UbsSemanticSourceProvenance = UbsSemanticSourceCommonProvenance & (
  | { sourceRole: 'dictionary'; artifactName: 'UBSHebrewDic-v0.9.2-en.JSON' }
  | { sourceRole: 'lexical_domains'; artifactName: 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON' }
);

export type UbsSemanticSource = UbsSemanticSourceProvenance & {
  schemaVersion: 'ubs-semantics.v1';
  artifactIdentity: string;
};

/**
 * The server-only proof shape required before a future semantic candidate may
 * be described as aligned with one morphology token.  This is intentionally
 * more specific than a coordinate observation: every source artifact, the
 * source row, and the exact selected-token witness must be re-bound to the
 * current request before promotion.
 *
 * It is a contract only.  No current composition root accepts or produces
 * this proof, and a coordinate-only UBS/TAHOT attestation never satisfies it.
 */
export interface FutureExactHebrewTokenAlignmentProof {
  status: 'verified_token_alignment';
  proofContract: 'theologai-exact-hebrew-token-alignment.v1';
  verifierVersion: number;
  /** Fixed-width internal H#### identity selected for the current request. */
  sourceIdentity: UbsInternalHebrewLexicalIdentity;
  /** Current query reference, normalized at the shared semantic boundary. */
  normalizedReference: string;
  /** Exact transformed artifact and both pinned input-artifact witnesses. */
  artifactIdentity: string;
  artifactVersion: typeof UBS_SEMANTIC_ARTIFACT_VERSION;
  artifactSources: {
    dictionary: FutureExactHebrewTokenAlignmentArtifactSource;
    lexicalDomains: FutureExactHebrewTokenAlignmentArtifactSource;
  };
  /** Canonical UBS source row identity for the one selected candidate. */
  sourceId: string;
  entryId: string;
  senseId: string;
  evidenceId: string;
  /**
   * Server-derived stable identity for the selected morphology token.  It is
   * also checked against the token coordinates and complete local witness.
   */
  morphologyTokenIdentity: string;
  morphologyTokenCoordinates: {
    canonicalReference: string;
    normalizedReference: string;
    position: number;
  };
  morphologyTokenWitness: {
    text: string;
    lemma: string;
    strongsNumber: string | null;
    morphologyCode: string | null;
    gloss: string | null;
  };
}

export interface FutureExactHebrewTokenAlignmentArtifactSource {
  sourceId: string;
  sourceRole: 'dictionary' | 'lexical_domains';
  artifactName: 'UBSHebrewDic-v0.9.2-en.JSON' | 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON';
  artifactIdentity: string;
  artifactVersion: typeof UBS_SEMANTIC_ARTIFACT_VERSION;
  sourceSha256: string;
}

export interface UbsSemanticEntry {
  entryId: string;
  sourceId: string;
  sourceOrdinal: number;
  lemma: string;
  transliteration?: string;
  /**
   * Source values are a set, not a display string.  Retaining the canonical
   * array prevents a future materializer from silently dropping a secondary
   * part-of-speech (the inspected UBS input contains multi-value entries).
   */
  partOfSpeech?: readonly string[];
  /** One Hebrew source entry can retain multiple H#### and/or A#### identities. */
  lexicalIdentities: UbsInternalLexicalIdentity[];
}

export interface UbsSemanticSense {
  senseId: string;
  sourceId: string;
  entryId: string;
  sourceOrdinal: number;
  definitionStatus: 'published' | 'absent_in_source' | 'excluded_unresolved_markup';
  definition?: string;
  /** Bounded machine-readable reasons; empty unless unresolved source markup was excluded. */
  definitionExclusionReasons: UbsSemanticDefinitionExclusionReason[];
  glosses: string[];
  domainRefs: UbsSemanticDomainRef[];
}

export const UBS_SEMANTIC_DEFINITION_EXCLUSION_REASONS = Object.freeze([
  'unsafe_attribution_markup',
  'unsafe_note_markup',
  'malformed_lexical_link_markup',
  'unvalidated_scripture_link_markup',
  'malformed_or_unknown_markup',
] as const);
export type UbsSemanticDefinitionExclusionReason =
  typeof UBS_SEMANTIC_DEFINITION_EXCLUSION_REASONS[number];

export interface UbsSemanticDomainRef {
  sourceId: string;
  domainId: string;
}

export interface UbsSemanticDomain {
  domainId: string;
  sourceId: string;
  sourceOrdinal: number;
  parentDomainId?: string;
  label: string;
  description?: string;
}

export interface UbsSemanticReferenceEvidence {
  evidenceId: string;
  sourceId: string;
  senseId: string;
  sourceOrdinal: number;
  sourceReference: string;
  normalizedReference: string;
  evidenceKind: 'source_attested_sense_reference';
}

export const UBS_SEMANTIC_REPOSITORY_LIMITS = Object.freeze({
  entriesByLexicalIdentity: 16,
  sensesPerEntry: 64,
  domainsPerSense: 16,
  referenceEvidencePerSense: 128,
  matchingReferenceEvidence: 16,
} as const);

export const UBS_SEMANTIC_REPOSITORY_ORDER = Object.freeze({
  entriesByLexicalIdentity: 'source_id_source_ordinal_entry_id',
  sensesPerEntry: 'source_ordinal_sense_id',
  domainsPerSense: 'source_ordinal_domain_id',
  referenceEvidencePerSense: 'source_ordinal_evidence_id',
  matchingReferenceEvidence: 'source_ordinal_evidence_id',
} as const);

export type UbsSemanticRepositoryOrder =
  typeof UBS_SEMANTIC_REPOSITORY_ORDER[keyof typeof UBS_SEMANTIC_REPOSITORY_ORDER];

export interface UbsSemanticRepositoryCollection<
  T,
  Order extends UbsSemanticRepositoryOrder,
  Limit extends number,
> {
  items: T[];
  total: number;
  showing: number;
  priorShowing: number;
  consumed: number;
  hasMore: boolean;
  nextCursor?: string;
  order: Order;
  limit: Limit;
}

export function createUbsSemanticRepositoryCollection<
  T,
  Order extends UbsSemanticRepositoryOrder,
  Limit extends number,
>(
  items: readonly T[],
  total: number,
  order: Order,
  limit: Limit,
  page: {
    /** Number of rows returned by all preceding pages for this exact query. */
    priorShowing: number;
    continuation?: {
      nextCursor: string;
      operation: UbsSemanticPaginatedOperation;
      artifactIdentity: string;
      queryScope: readonly string[];
    };
  },
): UbsSemanticRepositoryCollection<T, Order, Limit> {
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('UBS semantic repository limit must be a positive safe integer');
  if (items.length > limit) throw new Error(`UBS semantic repository returned ${items.length} items above its ${limit}-item cap`);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error('UBS semantic repository total must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(page.priorShowing) || page.priorShowing < 0) {
    throw new Error('UBS semantic repository priorShowing must be a non-negative safe integer');
  }
  const consumed = page.priorShowing + items.length;
  if (!Number.isSafeInteger(consumed) || consumed > total) {
    throw new Error('UBS semantic repository prior and current windows cannot exceed total matches');
  }
  const hasMore = consumed < total;
  const continuation = page.continuation;
  if (hasMore !== (continuation !== undefined)) {
    throw new Error('UBS semantic repository continuation must be present if and only if more matches remain');
  }
  if (continuation !== undefined) {
    if (CURSOR_OPERATION_CONTRACT[continuation.operation].order !== order) {
      throw new Error('UBS semantic cursor operation does not match the collection order');
    }
    const parsedContinuation = parseUbsSemanticCursor(
      continuation.nextCursor, continuation.operation, continuation.artifactIdentity, continuation.queryScope,
    );
    if (parsedContinuation.priorShowing !== consumed) {
      throw new Error('UBS semantic continuation prior position must equal the consumed result count');
    }
    if (items.length === 0) throw new Error('UBS semantic repository cannot continue an empty page');
  }
  return {
    items: [...items], total, showing: items.length, priorShowing: page.priorShowing,
    consumed, hasMore, order, limit,
    ...(continuation === undefined ? {} : { nextCursor: continuation.nextCursor }),
  };
}

export interface UbsSemanticPageRequest { cursor?: string }

export type UbsSemanticPaginatedOperation =
  | 'getEntriesByLexicalIdentity'
  | 'getSensesForEntry'
  | 'getDomainsForSense'
  | 'getReferenceEvidenceForSense'
  | 'findReferenceEvidence';

const CURSOR_OPERATION_CONTRACT = Object.freeze({
  getEntriesByLexicalIdentity: { order: UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity, queryArity: 1, keysetArity: 3 },
  getSensesForEntry: { order: UBS_SEMANTIC_REPOSITORY_ORDER.sensesPerEntry, queryArity: 2, keysetArity: 2 },
  getDomainsForSense: { order: UBS_SEMANTIC_REPOSITORY_ORDER.domainsPerSense, queryArity: 2, keysetArity: 2 },
  getReferenceEvidenceForSense: { order: UBS_SEMANTIC_REPOSITORY_ORDER.referenceEvidencePerSense, queryArity: 2, keysetArity: 2 },
  findReferenceEvidence: { order: UBS_SEMANTIC_REPOSITORY_ORDER.matchingReferenceEvidence, queryArity: 3, keysetArity: 2 },
} satisfies Record<UbsSemanticPaginatedOperation, {
  order: UbsSemanticRepositoryOrder; queryArity: number; keysetArity: number;
}>);

/** Deterministic cursor bound to one operation, exact query scope, and keyset. */
export function createUbsSemanticCursor(
  operation: UbsSemanticPaginatedOperation,
  artifactIdentity: string,
  queryScope: readonly string[],
  keyset: readonly string[],
  priorShowing: number,
): string {
  const contract = CURSOR_OPERATION_CONTRACT[operation];
  validateArtifactIdentity(artifactIdentity);
  validateOperationCursorValues(operation, queryScope, keyset);
  validateCursorPriorShowing(priorShowing);
  const payload = JSON.stringify({
    version: 1, operation, order: contract.order, artifactIdentity, queryScope, keyset, priorShowing,
  });
  const cursor = `ubs1_${[...new TextEncoder().encode(payload)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
  if (cursor.length > UBS_SEMANTIC_CURSOR_MAX_LENGTH) throw new Error('UBS semantic cursor exceeds the 4096-character limit');
  return cursor;
}

export function parseUbsSemanticCursor(
  cursor: string,
  expectedOperation: UbsSemanticPaginatedOperation,
  expectedArtifactIdentity: string,
  expectedQueryScope: readonly string[],
): { keyset: string[]; priorShowing: number } {
  validateArtifactIdentity(expectedArtifactIdentity);
  if (cursor.length > UBS_SEMANTIC_CURSOR_MAX_LENGTH) throw new Error('UBS semantic cursor exceeds the 4096-character limit');
  if (!/^ubs1_(?:[0-9a-f]{2})+$/.test(cursor)) throw new Error('UBS semantic cursor has an invalid encoding');
  const bytes = cursor.slice(5).match(/../g)!.map(byte => Number.parseInt(byte, 16));
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)));
  } catch {
    throw new Error('UBS semantic cursor has an invalid payload');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('UBS semantic cursor payload must be an object');
  const record = value as Record<string, unknown>;
  const contract = CURSOR_OPERATION_CONTRACT[expectedOperation];
  if (JSON.stringify(Object.keys(record)) !== JSON.stringify([
    'version', 'operation', 'order', 'artifactIdentity', 'queryScope', 'keyset', 'priorShowing',
  ])
    || record.version !== 1 || record.operation !== expectedOperation || record.order !== contract.order
    || record.artifactIdentity !== expectedArtifactIdentity
    || !Array.isArray(record.queryScope) || !Array.isArray(record.keyset)) {
    throw new Error('UBS semantic cursor does not match the requested operation or semantic artifact');
  }
  validateOperationCursorValues(expectedOperation, record.queryScope, record.keyset);
  validateCursorPriorShowing(record.priorShowing);
  if (JSON.stringify(record.queryScope) !== JSON.stringify(expectedQueryScope)) {
    throw new Error('UBS semantic cursor does not match the requested query scope');
  }
  const keyset = record.keyset as string[];
  const priorShowing = record.priorShowing as number;
  if (createUbsSemanticCursor(
    expectedOperation, expectedArtifactIdentity, expectedQueryScope, keyset, priorShowing,
  ) !== cursor) {
    throw new Error('UBS semantic cursor is not canonical');
  }
  return { keyset: [...keyset], priorShowing };
}

function validateCursorPriorShowing(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error('UBS semantic cursor priorShowing must be a positive safe integer');
  }
}

function validateCursorValues(values: readonly unknown[], expectedArity: number, label: string): asserts values is string[] {
  if (values.length !== expectedArity || values.some(value => typeof value !== 'string'
    || !value || value !== value.trim() || value.length > 512)) {
    throw new Error(`UBS semantic cursor ${label} must contain exactly ${expectedArity} bounded canonical values`);
  }
}

function validateArtifactIdentity(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('UBS semantic cursor artifact identity must be a lowercase SHA-256');
}

function validateOperationCursorValues(
  operation: UbsSemanticPaginatedOperation,
  queryScope: readonly unknown[],
  keyset: readonly unknown[],
): asserts queryScope is string[] {
  const contract = CURSOR_OPERATION_CONTRACT[operation];
  validateCursorValues(queryScope, contract.queryArity, 'query scope');
  validateCursorValues(keyset, contract.keysetArity, 'keyset');
  const id = (value: string, label: string): void => {
    if (!/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value)) throw new Error(`UBS semantic cursor ${label} is not a canonical identifier`);
  };
  const ordinal = (value: string): void => {
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new Error('UBS semantic cursor ordinal is not a canonical positive decimal');
    }
  };
  if (operation === 'getEntriesByLexicalIdentity') {
    if (!isUbsInternalLexicalIdentity(queryScope[0]!)) {
      throw new Error('UBS semantic internal cursor requires a canonical H#### or A#### source identity');
    }
    id(keyset[0] as string, 'source ID'); ordinal(keyset[1] as string); id(keyset[2] as string, 'entry ID');
  } else if (operation === 'getSensesForEntry') {
    id(queryScope[0]!, 'source ID'); id(queryScope[1]!, 'entry ID');
    ordinal(keyset[0] as string); id(keyset[1] as string, 'sense ID');
  } else if (operation === 'getDomainsForSense') {
    id(queryScope[0]!, 'source ID'); id(queryScope[1]!, 'sense ID');
    ordinal(keyset[0] as string); id(keyset[1] as string, 'domain ID');
  } else {
    id(queryScope[0]!, 'source ID'); id(queryScope[1]!, 'sense ID');
    if (operation === 'findReferenceEvidence') {
      requireUbsSemanticNormalizedReference(queryScope[2], 'UBS semantic cursor normalized reference');
    }
    ordinal(keyset[0] as string); id(keyset[1] as string, 'evidence ID');
  }
}

/**
 * A repository exposes evidence; it does not perform word-sense disambiguation.
 * Every operation is async so Node SQLite and Worker D1 adapters share one
 * honest contract.
 */
export interface IUbsSemanticRepository {
  getSource(sourceId: string): Promise<UbsSemanticSource | undefined>;
  getEntry(sourceId: string, entryId: string): Promise<UbsSemanticEntry | undefined>;
  getEntriesByLexicalIdentity(identity: UbsInternalLexicalIdentity, page?: UbsSemanticPageRequest): Promise<UbsSemanticRepositoryCollection<
    UbsSemanticEntry,
    typeof UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
    typeof UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity
  >>;
  getSense(sourceId: string, senseId: string): Promise<UbsSemanticSense | undefined>;
  getSensesForEntry(sourceId: string, entryId: string, page?: UbsSemanticPageRequest): Promise<UbsSemanticRepositoryCollection<
    UbsSemanticSense,
    typeof UBS_SEMANTIC_REPOSITORY_ORDER.sensesPerEntry,
    typeof UBS_SEMANTIC_REPOSITORY_LIMITS.sensesPerEntry
  >>;
  getDomain(sourceId: string, domainId: string): Promise<UbsSemanticDomain | undefined>;
  getDomainsForSense(sourceId: string, senseId: string, page?: UbsSemanticPageRequest): Promise<UbsSemanticRepositoryCollection<
    UbsSemanticDomain,
    typeof UBS_SEMANTIC_REPOSITORY_ORDER.domainsPerSense,
    typeof UBS_SEMANTIC_REPOSITORY_LIMITS.domainsPerSense
  >>;
  getReferenceEvidenceForSense(sourceId: string, senseId: string, page?: UbsSemanticPageRequest): Promise<UbsSemanticRepositoryCollection<
    UbsSemanticReferenceEvidence,
    typeof UBS_SEMANTIC_REPOSITORY_ORDER.referenceEvidencePerSense,
    typeof UBS_SEMANTIC_REPOSITORY_LIMITS.referenceEvidencePerSense
  >>;
  findReferenceEvidence(
    sourceId: string,
    senseId: string,
    normalizedReference: string,
    page?: UbsSemanticPageRequest,
  ): Promise<UbsSemanticRepositoryCollection<
    UbsSemanticReferenceEvidence,
    typeof UBS_SEMANTIC_REPOSITORY_ORDER.matchingReferenceEvidence,
    typeof UBS_SEMANTIC_REPOSITORY_LIMITS.matchingReferenceEvidence
  >>;
}

export interface UbsLexicalSenseCandidate {
  sense: UbsSemanticSense;
  domains: UbsSemanticDomain[];
}

export type UbsSemanticResolution =
  | {
      /** A source candidate is attested at the reference and aligned locally; it is not an adjudicated meaning. */
      status: 'reference_aligned_source_candidate';
      sense: UbsSemanticSense;
      domains: UbsSemanticDomain[];
      referenceEvidence: UbsSemanticReferenceEvidence;
      /** Not satisfied by UBS/TAHOT coordinate equality or coordinate attestation. */
      alignmentEvidence: FutureExactHebrewTokenAlignmentProof;
    }
  | {
      status: 'lexical_candidates';
      candidates: UbsLexicalSenseCandidate[];
      reason: 'no_reference_evidence' | 'reference_alignment_unproven' | 'ambiguous_reference_alignment';
    }
  | {
      status: 'unavailable';
      reason: 'no_lexical_entry' | 'no_publishable_semantic_evidence';
    };
