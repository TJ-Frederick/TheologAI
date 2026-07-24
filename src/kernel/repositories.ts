/**
 * Async repository interfaces for dual-target (Node.js + Workers) support.
 *
 * Data types previously defined in src/adapters/data/* are re-exported here
 * so that services and tools can depend on this file alone — no need to
 * import from concrete adapter implementations.
 */

/** Repository operations may be synchronous locally or asynchronous on Workers. */
export type RepositoryResult<T> = T | Promise<T>;

// ── Cross-reference types & interface ──

export interface CrossRefRow {
  reference: string;
  votes: number;
}

export interface CrossRefResult {
  references: CrossRefRow[];
  total: number;
  showing: number;
  hasMore: boolean;
}

export interface CrossRefOptions {
  maxResults?: number;
  minVotes?: number;
}

export interface ICrossReferenceRepository {
  getCrossReferences(reference: string, options?: CrossRefOptions): RepositoryResult<CrossRefResult>;
  hasReferences(reference: string): RepositoryResult<boolean>;
  getChapterStatistics(bookChapter: string): RepositoryResult<{
    totalVerses: number;
    totalCrossRefs: number;
    verseStats: Array<{ verse: number; refCount: number }>;
  }>;
}

// ── Strong's concordance types & interface ──

export interface StrongsEntry {
  strongs_number: string;
  testament: 'OT' | 'NT';
  lemma: string;
  transliteration: string | null;
  pronunciation: string | null;
  definition: string;
  derivation: string | null;
}

export interface LexiconEntry {
  strongs_number: string;
  source: string;
  extended_data: Record<string, unknown>;
}

export interface IStrongsRepository {
  lookup(strongsNumber: string): RepositoryResult<StrongsEntry | undefined>;
  search(query: string, limit?: number): RepositoryResult<StrongsEntry[]>;
  getLexiconEntry(strongsNumber: string): RepositoryResult<LexiconEntry | undefined>;
  getStats(): RepositoryResult<{ greek: number; hebrew: number; total: number }>;
}

// ── Morphology types & interface ──

export interface MorphWord {
  position: number;
  word_text: string;
  lemma: string;
  strongs_number: string | null;
  morph_code: string | null;
  gloss: string | null;
}

export interface WordOccurrence {
  book: string;
  chapter: number;
  verse: number;
  word_text: string;
  gloss: string | null;
}

export interface BookDistribution {
  book: string;
  verse_count: number;
}

export interface UsageStats {
  strongs_key: string;
  token_count: number;
  verse_count: number;
  book_count: number;
  /** Exact source surface-token variants; punctuation/cantillation are significant. */
  form_count: number;
}

export interface BookUsage {
  book: string;
  book_order: number;
  token_count: number;
  verse_count: number;
}

export interface FormUsage {
  /** Exact source word_text, not a linguistically normalized inflected form. */
  form_text: string;
  token_count: number;
  verse_count: number;
  first: CanonicalOccurrencePosition & { book: string };
}

export interface CanonicalOccurrencePosition {
  book_order: number;
  chapter: number;
  verse: number;
  position: number;
}

export interface TokenOccurrence extends CanonicalOccurrencePosition {
  book: string;
  word_text: string;
  lemma: string;
  strongs_number: string;
  morph_code: string | null;
  gloss: string | null;
}

export interface TokenOccurrencePage {
  occurrences: TokenOccurrence[];
  next_after?: CanonicalOccurrencePosition;
}

export interface IMorphologyRepository {
  getVerseMorphology(book: string, chapter: number, verse: number): RepositoryResult<MorphWord[]>;
  expandMorphCode(code: string): RepositoryResult<string | undefined>;
  getAvailableBooks(): RepositoryResult<string[]>;
  hasVerse(book: string, chapter: number, verse: number): RepositoryResult<boolean>;
  getOccurrences(strongsNumber: string, limit?: number): RepositoryResult<WordOccurrence[]>;
  getDistribution(strongsNumber: string): RepositoryResult<BookDistribution[]>;
  getUsageStats(strongsNumber: string): RepositoryResult<UsageStats | undefined>;
  getBookUsage(strongsNumber: string): RepositoryResult<BookUsage[]>;
  getFormUsage(strongsNumber: string, limit?: number): RepositoryResult<FormUsage[]>;
  getTokenOccurrences(
    strongsNumber: string,
    after?: CanonicalOccurrencePosition,
    limit?: number,
  ): RepositoryResult<TokenOccurrencePage>;
}

// ── Historical document types & interface ──

export interface DocumentInfo {
  id: string;
  title: string;
  type: string;
  date: string | null;
  topics: string[];
  catalog?: HistoricalDocumentCatalogMetadata;
  /** Present only for a reviewed edition-aligned normalized source-pack projection. */
  editionProvenance?: ExactEditionProvenance;
}

export interface ExactEditionProvenance {
  foundation: 'edition-provenance-foundation.v1';
  sourcePackId: string;
  editionId: string;
  language: string;
  publication: string;
  version: string;
  sourceArtifacts: Array<{
    artifactId: string;
    role: 'authority' | 'comparator';
    locator: string;
    sha256: string;
    bytes: number;
    acquiredAt: string;
  }>;
  normalizedTextRights: {
    status: 'no_known_conflict';
    scope: 'normalized_public_domain_text_only';
    basis: string;
    reviewedAt: string;
  };
  provenance: {
    status: 'verified' | 'verified_with_uncertainty';
    uncertainty: string | null;
    reviewedAt: string;
  };
}

export type HistoricalMetadataStatus = 'reviewed' | 'anonymous' | 'collective' | 'unknown';

export interface HistoricalDocumentCreator {
  name: string;
  role: 'author' | 'issuing_body' | 'drafting_body' | 'revising_body' | 'compiler';
}

export interface HistoricalDocumentCatalogMetadata {
  lookupAliases: string[];
  composition: { startYear?: number; endYear?: number; label: string };
  creators: HistoricalDocumentCreator[];
  metadataStatus: HistoricalMetadataStatus;
  metadataProvenanceIds: string[];
}

export interface DocumentSection {
  id: number;
  document_id: string;
  section_number: string;
  title: string;
  content: string;
  topics: string[];
}

/** Immutable Transform-8 delivery facts for one hosted historical document. */
export interface HistoricalDocumentDeliveryProfile {
  documentId: string;
  workId: string | null;
  editionId: string | null;
  immutableCorpusIdentity: string;
  sectionPackageIdentity: string | null;
  deliveryMode: 'complete_document' | 'sectioned_only';
  sectionCount: number;
  landingMaxBytes: 0 | 16_384;
  browsePageSize: 0 | 32;
  cursorVersion: 0 | 1;
  provenance: Record<string, unknown>;
  rights: Record<string, unknown>;
}

/**
 * A section resolved through the Transform-8 source-first sidecars.  The
 * legacy storage id and legacy section number remain implementation details;
 * public producers must use sectionKey/sourceOrdinal instead.
 */
export interface ResolvedHistoricalSection {
  document: DocumentInfo;
  section: DocumentSection;
  sectionKey: string;
  sourceOrdinal: number;
  requestedSectionId: string;
  resolution: 'canonical' | 'legacy_alias';
}

export interface HistoricalSectionBrowseBoundary {
  sourceOrdinal: number;
  sectionKey: string;
}

/** Metadata-only row for sectioned-only directory pages; deliberately no body. */
export interface HistoricalSectionSummary extends HistoricalSectionBrowseBoundary {
  documentId: string;
  /** Legacy display-only label; it is never a routable identity. */
  legacyDisplayLabel: string;
  heading: string;
}

export interface PrimarySourceLocalSearchOptions {
  text: string;
  match: 'all_terms' | 'phrase';
  selection?: 'relevance' | 'work_diversity';
  documentIds?: string[];
  limit: number;
}

export interface PrimarySourceLocalSearchRow {
  document: DocumentInfo;
  section: DocumentSection;
  sectionKey: string;
  sourceOrdinal: number;
}

export interface IHistoricalDocumentRepository {
  listDocuments(): RepositoryResult<DocumentInfo[]>;
  getDocument(id: string): RepositoryResult<DocumentInfo | undefined>;
  getSections(documentId: string): RepositoryResult<DocumentSection[]>;
  getSection(documentId: string, sectionNumber: string): RepositoryResult<DocumentSection | undefined>;
  getDeliveryProfile(documentId: string): RepositoryResult<HistoricalDocumentDeliveryProfile | undefined>;
  /** Canonical key lookup first; legacy aliases are considered only on a miss. */
  resolveSection(documentId: string, sectionId: string): RepositoryResult<ResolvedHistoricalSection | undefined>;
  /** Ordered metadata-only rows for the bounded sectioned-only browser. */
  browseHistoricalSectionSummaries(
    documentId: string,
    after: HistoricalSectionBrowseBoundary | undefined,
    limit: number,
  ): RepositoryResult<HistoricalSectionSummary[]>;
  /** Metadata-only cursor-boundary proof; it must never fetch a section body. */
  hasHistoricalSectionBoundary(documentId: string, boundary: HistoricalSectionBrowseBoundary): RepositoryResult<boolean>;
  search(query: string, limit?: number): RepositoryResult<DocumentSection[]>;
  /** FTS discovery rows with the canonical Transform-8 identity attached. */
  searchResolvedSections(query: string, limit?: number): RepositoryResult<ResolvedHistoricalSection[]>;
  searchPrimarySources(options: PrimarySourceLocalSearchOptions): RepositoryResult<PrimarySourceLocalSearchRow[]>;
  findDocumentByName(name: string): RepositoryResult<DocumentInfo | undefined>;
}
