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
}

export interface DocumentSection {
  id: number;
  document_id: string;
  section_number: string;
  title: string;
  content: string;
  topics: string[];
}

export interface PrimarySourceLocalSearchOptions {
  text: string;
  match: 'all_terms' | 'phrase';
  documentId?: string;
  limit: number;
}

export interface PrimarySourceLocalSearchRow {
  document: DocumentInfo;
  section: DocumentSection;
}

export interface IHistoricalDocumentRepository {
  listDocuments(): RepositoryResult<DocumentInfo[]>;
  getDocument(id: string): RepositoryResult<DocumentInfo | undefined>;
  getSections(documentId: string): RepositoryResult<DocumentSection[]>;
  getSection(documentId: string, sectionNumber: string): RepositoryResult<DocumentSection | undefined>;
  search(query: string, limit?: number): RepositoryResult<DocumentSection[]>;
  searchPrimarySources(options: PrimarySourceLocalSearchOptions): RepositoryResult<PrimarySourceLocalSearchRow[]>;
  findDocumentByName(name: string): RepositoryResult<DocumentInfo | undefined>;
}
