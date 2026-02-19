export interface BibleLookupParams {
  reference: string;
  translation?: string | string[];  // Support single translation or array
  includeCrossRefs?: boolean;
  includeFootnotes?: boolean;
}

export interface CommentaryLookupParams {
  reference: string;
  commentator?: string;
  maxLength?: number;
}

export interface HistoricalSearchParams {
  query: string;
  document?: string;
  docType?: string;
}

export interface TopicalSearchParams {
  topic: string;
  resourceTypes?: string[];
  maxResults?: number;
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

export interface CommentaryResult {
  reference: string;
  commentator: string;
  text: string;
  citation: Citation;
}

export interface HistoricalResult {
  document: string;
  section: string;
  text: string;
  citation: Citation;
}

export interface ToolResponse<T = any> {
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

export interface ToolHandler {
  name: string;
  description: string;
  inputSchema: any;
  handler: (params: any) => Promise<any>;
}

// Parallel Passages Types
export interface ParallelPassageLookupParams {
  reference: string;
  mode?: 'auto' | 'synoptic' | 'quotation' | 'thematic';
  includeText?: boolean;
  translation?: string;
  showDifferences?: boolean;
  useCrossReferences?: boolean;
  maxParallels?: number;
}

export interface ParallelPassage {
  reference: string;
  text?: string;
  translation?: string;
  relationship: 'synoptic' | 'quotation' | 'allusion' | 'thematic';
  confidence: number;
  uniqueElements?: string[];
  notes?: string;
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
}

// Biblical Languages Types
export interface StrongsLookupParams {
  strongs_number: string;
  detail_level?: 'simple' | 'detailed';
  include_cross_references?: boolean;
  include_extended?: boolean;
  include_morphology?: boolean;
  include_occurrences?: boolean;
}

export interface StrongsResult {
  strongs_number: string;
  testament: 'OT' | 'NT';
  lemma: string;
  transliteration?: string;
  pronunciation?: string;
  definition: string;
  derivation?: string;
  citation: Citation;
}

// Enhanced Strong's with STEPBible Data
export interface SenseInfo {
  gloss: string;
  usage: string;
  count: number;
}

export interface EnhancedStrongsResult extends StrongsResult {
  extended?: {
    strongsExtended?: string;
    occurrences?: number;
    senses?: Record<string, SenseInfo>;
    morphology?: Record<string, number>;
  };
}

// Verse Morphology Types
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
}

// STEPBible Data Structures
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