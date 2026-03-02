/**
 * Async repository interfaces for dual-target (Node.js + Workers) support.
 *
 * Data types previously defined in src/adapters/data/* are re-exported here
 * so that services and tools can depend on this file alone — no need to
 * import from concrete adapter implementations.
 */

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
  getCrossReferences(reference: string, options?: CrossRefOptions): Promise<CrossRefResult>;
  hasReferences(reference: string): Promise<boolean>;
  getChapterStatistics(bookChapter: string): Promise<{
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
  lookup(strongsNumber: string): Promise<StrongsEntry | undefined>;
  search(query: string, limit?: number): Promise<StrongsEntry[]>;
  getLexiconEntry(strongsNumber: string): Promise<LexiconEntry | undefined>;
  getStats(): Promise<{ greek: number; hebrew: number; total: number }>;
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

export interface IMorphologyRepository {
  getVerseMorphology(book: string, chapter: number, verse: number): Promise<MorphWord[]>;
  expandMorphCode(code: string): Promise<string | undefined>;
  getAvailableBooks(): Promise<string[]>;
  hasVerse(book: string, chapter: number, verse: number): Promise<boolean>;
  getOccurrences(strongsNumber: string, limit?: number): Promise<WordOccurrence[]>;
  getDistribution(strongsNumber: string): Promise<BookDistribution[]>;
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

export interface IHistoricalDocumentRepository {
  listDocuments(): Promise<DocumentInfo[]>;
  getDocument(id: string): Promise<DocumentInfo | undefined>;
  getSections(documentId: string): Promise<DocumentSection[]>;
  getSection(documentId: string, sectionNumber: string): Promise<DocumentSection | undefined>;
  search(query: string, limit?: number): Promise<DocumentSection[]>;
  findDocumentByName(name: string): Promise<DocumentInfo | undefined>;
}
