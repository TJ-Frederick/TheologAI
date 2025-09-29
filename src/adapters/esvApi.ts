import { APIError } from '../utils/errors.js';
import { Cache } from '../utils/cache.js';

export interface ESVPassageResponse {
  query: string;
  canonical: string;
  parsed: Array<Array<number>>;
  passage_meta: Array<{
    canonical: string;
    chapter_start: [number, number];
    chapter_end: [number, number];
    prev_verse?: number;
    next_verse?: number;
    prev_chapter?: [number, number];
    next_chapter?: [number, number];
  }>;
  passages: string[];
}

export class ESVAdapter {
  private baseURL = 'https://api.esv.org/v3/passage/text/';
  private apiKey: string;
  private cache: Cache<ESVPassageResponse>;

  // ESV API Guidelines compliance
  private readonly MAX_VERSES_PER_QUERY = 500;
  private readonly COPYRIGHT_NOTICE = 'ESV® Bible (English Standard Version®), copyright © 2001 by Crossway';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ESV_API_KEY || '';
    this.cache = new Cache<ESVPassageResponse>(100, 60 * 60 * 1000); // 100 entries, 1 hour TTL
    if (!this.apiKey) {
      console.warn('ESV API key not provided. Using mock data fallback.');
    }
  }

  async getPassage(reference: string, options: {
    includeHeadings?: boolean;
    includeFootnotes?: boolean;
    includeVerseNumbers?: boolean;
    includeShortCopyright?: boolean;
  } = {}): Promise<ESVPassageResponse> {
    if (!this.apiKey) {
      throw new APIError(401, 'ESV API key not configured');
    }

    // Validate request according to ESV API guidelines
    this.validateRequest(reference);

    // Create cache key from reference and options
    const cacheKey = `${reference}:${JSON.stringify(options)}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const params = new URLSearchParams({
      q: reference,
      'include-headings': String(options.includeHeadings || false),
      'include-footnotes': String(options.includeFootnotes || false),
      'include-verse-numbers': String(options.includeVerseNumbers || true),
      'include-short-copyright': String(options.includeShortCopyright || false) // We'll add our own full copyright
    });

    const url = `${this.baseURL}?${params.toString()}`;

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new APIError(401, 'Invalid ESV API key');
        }
        if (response.status === 429) {
          throw new APIError(429, 'ESV API rate limit exceeded');
        }
        if (response.status === 400) {
          throw new APIError(400, `Invalid reference: ${reference}`);
        }
        throw new APIError(response.status, `ESV API error: ${response.statusText}`);
      }

      const data: ESVPassageResponse = await response.json();

      if (!data.passages || data.passages.length === 0) {
        throw new APIError(404, `No passages found for reference: ${reference}`);
      }

      // Store in cache
      this.cache.set(cacheKey, data);

      return data;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('fetch')) {
        throw new APIError(503, 'Unable to connect to ESV API');
      }
      throw new APIError(500, `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  getCopyrightNotice(): string {
    return this.COPYRIGHT_NOTICE;
  }

  private validateRequest(reference: string): void {
    // Basic validation - the ESV API will handle detailed validation
    if (!reference || reference.trim().length === 0) {
      throw new APIError(400, 'Bible reference cannot be empty');
    }
  }
}