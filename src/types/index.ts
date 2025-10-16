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