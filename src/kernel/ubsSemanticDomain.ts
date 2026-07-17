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
export const UBS_SEMANTIC_ARTIFACT_VERSION = '0.9.2' as const;
export const UBS_SEMANTIC_TRANSFORM_VERSION = 7 as const;

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

export interface UbsSemanticEntry {
  entryId: string;
  sourceId: string;
  sourceOrdinal: number;
  lemma: string;
  transliteration?: string;
  partOfSpeech?: string;
  /** One Hebrew source entry can retain multiple H#### and/or A#### identities. */
  lexicalIdentities: string[];
}

export interface UbsSemanticSense {
  senseId: string;
  sourceId: string;
  entryId: string;
  sourceOrdinal: number;
  definition: string;
  glosses: string[];
  domainRefs: UbsSemanticDomainRef[];
}

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
  continuation?: {
    nextCursor: string;
    operation: UbsSemanticPaginatedOperation;
    artifactIdentity: string;
    queryScope: readonly string[];
  },
): UbsSemanticRepositoryCollection<T, Order, Limit> {
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('UBS semantic repository limit must be a positive safe integer');
  if (items.length > limit) throw new Error(`UBS semantic repository returned ${items.length} items above its ${limit}-item cap`);
  if (!Number.isSafeInteger(total) || total < items.length) {
    throw new Error('UBS semantic repository total must be a safe integer at least as large as the returned window');
  }
  if (continuation !== undefined) {
    if (total <= items.length) throw new Error('UBS semantic repository continuation requires more total matches than the returned page');
    if (CURSOR_OPERATION_CONTRACT[continuation.operation].order !== order) {
      throw new Error('UBS semantic cursor operation does not match the collection order');
    }
    parseUbsSemanticCursor(
      continuation.nextCursor, continuation.operation, continuation.artifactIdentity, continuation.queryScope,
    );
    if (items.length === 0) throw new Error('UBS semantic repository cannot continue an empty page');
  }
  return {
    items: [...items], total, showing: items.length, hasMore: continuation !== undefined, order, limit,
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
): string {
  const contract = CURSOR_OPERATION_CONTRACT[operation];
  validateArtifactIdentity(artifactIdentity);
  validateOperationCursorValues(operation, queryScope, keyset);
  const payload = JSON.stringify({ version: 1, operation, order: contract.order, artifactIdentity, queryScope, keyset });
  const cursor = `ubs1_${[...new TextEncoder().encode(payload)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
  if (cursor.length > 4096) throw new Error('UBS semantic cursor exceeds the 4096-character limit');
  return cursor;
}

export function parseUbsSemanticCursor(
  cursor: string,
  expectedOperation: UbsSemanticPaginatedOperation,
  expectedArtifactIdentity: string,
  expectedQueryScope: readonly string[],
): string[] {
  validateArtifactIdentity(expectedArtifactIdentity);
  if (cursor.length > 4096) throw new Error('UBS semantic cursor exceeds the 4096-character limit');
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
  if (JSON.stringify(Object.keys(record)) !== JSON.stringify(['version', 'operation', 'order', 'artifactIdentity', 'queryScope', 'keyset'])
    || record.version !== 1 || record.operation !== expectedOperation || record.order !== contract.order
    || record.artifactIdentity !== expectedArtifactIdentity
    || !Array.isArray(record.queryScope) || !Array.isArray(record.keyset)) {
    throw new Error('UBS semantic cursor does not match the requested operation or semantic artifact');
  }
  validateOperationCursorValues(expectedOperation, record.queryScope, record.keyset);
  if (JSON.stringify(record.queryScope) !== JSON.stringify(expectedQueryScope)) {
    throw new Error('UBS semantic cursor does not match the requested query scope');
  }
  const keyset = record.keyset as string[];
  if (createUbsSemanticCursor(expectedOperation, expectedArtifactIdentity, expectedQueryScope, keyset) !== cursor) {
    throw new Error('UBS semantic cursor is not canonical');
  }
  return [...keyset];
}

function validateCursorValues(values: readonly unknown[], expectedArity: number, label: string): asserts values is string[] {
  if (values.length !== expectedArity || values.some(value => typeof value !== 'string'
    || !value || value !== value.trim() || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value))) {
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
  const reference = (value: string): void => {
    if (value !== value.normalize('NFC')) throw new Error('UBS semantic cursor normalized reference must be NFC');
  };
  if (operation === 'getEntriesByLexicalIdentity') {
    if (!/^H(?!0000$)[0-9]{4}$/.test(queryScope[0]!)) throw new Error('UBS semantic cursor requires a canonical H#### identity');
    id(keyset[0] as string, 'source ID'); ordinal(keyset[1] as string); id(keyset[2] as string, 'entry ID');
  } else if (operation === 'getSensesForEntry') {
    id(queryScope[0]!, 'source ID'); id(queryScope[1]!, 'entry ID');
    ordinal(keyset[0] as string); id(keyset[1] as string, 'sense ID');
  } else if (operation === 'getDomainsForSense') {
    id(queryScope[0]!, 'source ID'); id(queryScope[1]!, 'sense ID');
    ordinal(keyset[0] as string); id(keyset[1] as string, 'domain ID');
  } else {
    id(queryScope[0]!, 'source ID'); id(queryScope[1]!, 'sense ID');
    if (operation === 'findReferenceEvidence') reference(queryScope[2]!);
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
  getEntriesByLexicalIdentity(identity: string, page?: UbsSemanticPageRequest): Promise<UbsSemanticRepositoryCollection<
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
      status: 'exact_context';
      sense: UbsSemanticSense;
      domains: UbsSemanticDomain[];
      referenceEvidence: UbsSemanticReferenceEvidence;
      alignmentEvidence: {
        status: 'verified_token_alignment';
        morphologyTokenIdentity: string;
        verifierVersion: number;
      };
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
