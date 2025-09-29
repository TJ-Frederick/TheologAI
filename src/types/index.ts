export interface BibleLookupParams {
  reference: string;
  translation?: string;
  includeCrossRefs?: boolean;
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

export interface BibleResult {
  reference: string;
  translation: string;
  text: string;
  crossReferences?: Reference[];
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