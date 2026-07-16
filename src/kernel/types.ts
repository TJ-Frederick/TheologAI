/**
 * Shared TypeScript interfaces for TheologAI.
 *
 * Migrated from src/types/index.ts with cleanup:
 *   - ToolHandler.inputSchema properly typed
 *   - Removed unimplemented params (includeCrossRefs, include_cross_references)
 */

import type { CallToolResult, ContentBlock, TextContent, Tool } from '@modelcontextprotocol/sdk/types.js';

// ── Tool infrastructure ──

export interface ToolHandler {
  name: string;
  description: string;
  inputSchema: Tool['inputSchema'];
  outputSchema?: Tool['outputSchema'];
  annotations?: Tool['annotations'];
  handler: (params: Record<string, unknown>) => Promise<ToolResult>;
}

export type ToolResult = Omit<CallToolResult, 'content'> & {
  /** A text fallback is always first; later blocks may use the native MCP union. */
  content: [TextContent, ...ContentBlock[]];
};

// ── Bible types ──

export interface BibleLookupParams {
  reference: string;
  translation?: string | string[];
  includeFootnotes?: boolean;
}

export interface Citation {
  source: string;
  copyright?: string;
  url?: string;
}

export interface Reference {
  reference: string;
  text?: string;
}

export interface Footnote {
  id: number;
  caller: string;
  text: string;
  reference: {
    chapter: number;
    verse: number;
  };
}

export interface BibleResult {
  reference: string;
  translation: string;
  text: string;
  crossReferences?: Reference[];
  footnotes?: Footnote[];
  citation: Citation;
}

export interface BibleTranslationFailure {
  translation: string;
  reason: string;
}

export interface BibleLookupMultipleResult {
  reference: string;
  results: BibleResult[];
  failures: BibleTranslationFailure[];
}

// ── Commentary types ──

export interface CommentaryLookupParams {
  reference: string;
  commentator?: string;
  maxLength?: number;
}

export interface CommentaryResult {
  reference: string;
  commentator: string;
  text: string;
  citation: Citation;
}

export type CanonicalCommentator =
  | 'Matthew Henry'
  | 'Jamieson-Fausset-Brown'
  | 'Adam Clarke'
  | 'John Gill'
  | 'Keil-Delitzsch'
  | 'Tyndale';

/** Provider evidence for the granularity and identity of returned commentary. */
export type CommentaryCoverageEvidence =
  | {
    requestedScope: 'chapter';
    returnedGranularity: 'chapter_aggregate';
    identityBasis: 'provider_chapter_payload';
    providerIdentity: { field: 'chapter_payload'; chapter: number };
  }
  | {
    requestedScope: 'verse';
    returnedGranularity: 'exact_verse';
    identityBasis: 'provider_verse_number';
    providerIdentity: { field: 'verseNumber'; value: number };
  }
  | {
    requestedScope: 'verse';
    returnedGranularity: 'exact_verse';
    identityBasis: 'provider_typed_verse_number';
    providerIdentity: { field: 'number'; value: number; entryType: 'verse' };
  };

/** Adapter output carries its evidence rather than leaving the service to infer it. */
export interface CommentaryAdapterResult extends CommentaryResult {
  coverage: CommentaryCoverageEvidence;
  /** Validated provider corpus fingerprint reported by the response container. */
  providerRevision: `sha256:${string}`;
}

/** Service-owned identity, evidence, and text-window facts for MCP presentation. */
export interface CommentaryLookupResult {
  commentary: CommentaryResult;
  resolvedReference: string;
  canonicalCommentator: CanonicalCommentator;
  coverage: CommentaryCoverageEvidence;
  providerRevision: `sha256:${string}`;
  textWindow: {
    unit: 'unicode_code_points';
    returnedCharacters: number;
    sourceCharacters: number;
    truncated: boolean;
  };
}

// ── Historical documents ──

export interface HistoricalSearchParams {
  query: string;
  document?: string;
  docType?: string;
}

export interface HistoricalResult {
  document: string;
  section: string;
  text: string;
  citation: Citation;
}

// ── Cross references ──

export interface CrossReference {
  reference: string;
  votes: number;
}

export interface CrossReferenceResult {
  references: CrossReference[];
  total: number;
  showing: number;
  hasMore: boolean;
}

export interface CrossReferenceOptions {
  maxResults?: number;
  minVotes?: number;
}

// ── Parallel passages ──

export interface ParallelPassageLookupParams {
  reference: string;
  /** Corpus selection; omission is a hard default to UBS source-attested groups. */
  corpora?: ParallelPassageCorpus[];
  mode?: 'auto' | 'synoptic' | 'quotation' | 'thematic';
  includeText?: boolean;
  translation?: string;
  showDifferences?: boolean;
  maxGroups?: number;
  includeAlignment?: boolean;
  includeOpenBibleCrossReferences?: boolean;
  /** @deprecated Use includeOpenBibleCrossReferences. */
  useCrossReferences?: boolean;
  maxParallels?: number;
}

export type ParallelPassageCorpus = 'ubs_source_attested' | 'theologai_legacy';

export interface ParallelPassage {
  reference: string;
  text?: string;
  translation?: string;
  relationship: 'synoptic' | 'quotation' | 'allusion' | 'thematic';
  confidence: number;
  uniqueElements?: string[];
  notes?: string;
  provenanceIds?: string[];
}

export interface ParallelPassageAnalysis {
  commonElements: string[];
  variations: Record<string, string[]>;
  chronology?: string[];
}

export interface ParallelPassageResult {
  primary: {
    reference: string;
    text?: string;
    translation?: string;
    context?: string;
  };
  parallels: ParallelPassage[];
  analysis?: ParallelPassageAnalysis;
  citation: Citation;
  suggestedWorkflow?: string;
  warnings?: string[];
}

export interface SourceAttestedParallelMemberResult {
  sourceOrder: number;
  sourceReference: string;
  normalizedReference: string;
  segments: Array<{ bookNumber: number; chapter: number; startVerse: number; endVerse: number }>;
  languageMarker: 'HEB' | 'GRK';
  matched: boolean;
  alignmentBasis?: 'BHS' | 'LXX' | 'UBSGNT5';
  alignmentRaw?: string;
  text?: string;
  translation?: string;
  excerpts?: SourceAttestedSegmentExcerpt[];
  provenanceIds: string[];
}

export interface SourceAttestedSegmentExcerpt {
  segmentOrder: number;
  reference: string;
  text: string;
  translation: string;
  provenanceIds: string[];
}

export interface SourceAttestedParallelGroupResult {
  groupId: string;
  sourceOrdinal: number;
  label: 'source_attested_parallel';
  directionality: 'unspecified';
  members: SourceAttestedParallelMemberResult[];
  provenanceIds: string[];
}

/** Versioned public service result before MCP presentation. */
export interface ParallelPassageResearchResult {
  requestedReference: string;
  corpora: ParallelPassageCorpus[];
  sourceAttestedGroups: SourceAttestedParallelGroupResult[];
  legacyParallels: ParallelPassage[];
  openBibleCrossReferences: CrossReference[];
  provenance: import('./provenance.js').ProvenanceRecord[];
  warnings?: string[];
}

// ── Biblical languages ──

export type StrongsLookupParams =
  | {
    strongs_number: string;
    query?: never;
    limit?: never;
    detail_level?: 'simple' | 'detailed';
    include_extended?: boolean;
    usage_level?: 'overview' | 'study' | 'technical';
    occurrence_limit?: number;
    occurrence_cursor?: string;
  }
  | {
    query: string;
    limit?: number;
    strongs_number?: never;
    detail_level?: never;
    include_extended?: never;
    usage_level?: never;
    occurrence_limit?: never;
    occurrence_cursor?: never;
  };

export type CorpusUsageLevel = 'overview' | 'study' | 'technical';

export interface CorpusUsageResult {
  level: CorpusUsageLevel;
  exactMorphologyKey: string;
  corpusIdentity: string;
  attested: boolean;
  totals: {
    tokenCount: number;
    verseCount: number;
    bookCount: number;
    sourceSurfaceVariantCount: number;
  };
  bookDistribution: Array<{
    book: string;
    canonicalOrder: number;
    tokenCount: number;
    verseCount: number;
  }>;
  sourceSurfaceVariants: Array<{
    sourceForm: string;
    tokenCount: number;
    verseCount: number;
    firstOccurrence: { book: string; canonicalOrder: number; chapter: number; verse: number; position: number };
  }>;
  occurrences?: Array<{
    book: string;
    canonicalOrder: number;
    chapter: number;
    verse: number;
    position: number;
    sourceForm: string;
    lemma: string;
    exactMorphologyKey: string;
    morphologyCode: string | null;
    gloss: string | null;
  }>;
  nextOccurrenceCursor?: string;
  cautions: string[];
}

export interface StrongsResult {
  strongs_number: string;
  testament: 'OT' | 'NT' | null;
  lemma: string;
  transliteration?: string;
  pronunciation?: string;
  definition: string;
  derivation?: string;
  citation: Citation;
}

export interface SenseInfo {
  gloss: string;
  usage: string;
  count: number;
}

export interface EnhancedStrongsResult extends StrongsResult {
  /** Identifies the source of the base fields without changing public output. */
  sourceKind?: 'strongs_concordance' | 'stepbible_lexicon';
  /** Known source language does not imply a biblical testament classification. */
  language?: 'Greek' | 'Hebrew';
  extendedCitation?: Citation;
  extended?: {
    strongsExtended?: string;
    gloss?: string;
    definition?: string;
    morphologyCode?: string;
    source?: string;
    occurrences?: number;
    senses?: Record<string, SenseInfo>;
    morphology?: Record<string, number>;
  };
}

// ── Verse morphology ──

export interface VerseWord {
  position: number;
  text: string;
  lemma: string;
  strong: string;
  strongExtended?: string;
  morph: string;
  morphExpanded?: string;
  gloss: string;
}

export interface VerseData {
  words: VerseWord[];
}

export interface VerseMorphologyParams {
  reference: string;
  expand_morphology?: boolean;
}

export interface VerseMorphologyResult {
  reference: string;
  testament: 'OT' | 'NT';
  book: string;
  chapter: number;
  verse: number;
  words: VerseWord[];
  citation: Citation;
  /** Present when Hebrew lemmas were joined from the tracked TBESH lexicon. */
  lemmaCitation?: Citation;
}

// ── STEPBible data structures ──

export interface BookData {
  book: string;
  testament: 'OT' | 'NT';
  chapters: Record<string, Record<string, VerseData>>;
}

export interface StepBibleIndex {
  books: Record<string, {
    file: string;
    verses: number;
    testament: 'OT' | 'NT';
  }>;
}

export interface MorphologyExpansion {
  code: string;
  expansion: string;
  description: string;
}

export interface StepBibleMetadata {
  version: string;
  source: string;
  source_url: string;
  commit_sha: string;
  license: string;
  attribution: string;
  build_date: string;
  books: {
    greek: number;
    hebrew: number;
    total: number;
  };
}

// ── Classic text / CCEL types ──

export interface TopicalSearchParams {
  topic: string;
  resourceTypes?: string[];
  maxResults?: number;
}

export interface ToolResponse<T = unknown> {
  success: boolean;
  data?: {
    primaryContent: string;
    citations: Citation[];
    crossReferences?: Reference[];
    metadata: {
      source: string;
      copyright?: string;
      retrievalTime: number;
    };
  };
  error?: {
    message: string;
    code: string;
    suggestion?: string;
  };
}
