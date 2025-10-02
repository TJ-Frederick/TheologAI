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

export interface ESVFootnote {
  marker: string;       // Footnote marker (e.g., "1", "2")
  reference: string;    // Verse reference (e.g., "8:28")
  text: string;         // Footnote content
  type: 'variant' | 'translation' | 'other';  // Note type
}

export interface ESVCrossReference {
  verse: string;        // Reference verse (e.g., "Genesis 50:20")
  text?: string;        // Optional preview text
}

export interface ESVPassageWithNotesResponse extends ESVPassageResponse {
  footnotes: ESVFootnote[];
  crossReferences: ESVCrossReference[];
  html: string;         // Raw HTML response
}

export class ESVAdapter {
  private baseURL = 'https://api.esv.org/v3/passage/text/';
  private htmlURL = 'https://api.esv.org/v3/passage/html/';
  private apiKey: string;
  private cache: Cache<ESVPassageResponse>;
  private htmlCache: Cache<ESVPassageWithNotesResponse>;

  // ESV API Guidelines compliance
  private readonly MAX_VERSES_PER_QUERY = 500;
  private readonly COPYRIGHT_NOTICE = 'ESV® Bible (English Standard Version®), copyright © 2001 by Crossway';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ESV_API_KEY || '';
    this.cache = new Cache<ESVPassageResponse>(100, 60 * 60 * 1000); // 100 entries, 1 hour TTL
    this.htmlCache = new Cache<ESVPassageWithNotesResponse>(100, 60 * 60 * 1000); // 100 entries, 1 hour TTL
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

  /**
   * Get passage with footnotes and cross-references from HTML endpoint
   * Used by Commentary Service for detailed study
   */
  async getPassageWithNotes(reference: string): Promise<ESVPassageWithNotesResponse> {
    if (!this.apiKey) {
      throw new APIError(401, 'ESV API key not configured');
    }

    this.validateRequest(reference);

    // Check cache first
    const cacheKey = `html:${reference}`;
    const cached = this.htmlCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const params = new URLSearchParams({
      q: reference,
      'include-footnotes': 'true',
      'include-footnote-body': 'true',
      'include-headings': 'false',
      'include-short-copyright': 'false',
      'include-passage-references': 'true',
      'include-verse-numbers': 'true',
      'include-first-verse-numbers': 'true',
      'include-selahs': 'true'
    });

    const url = `${this.htmlURL}?${params.toString()}`;

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

      const data: any = await response.json();

      if (!data.passages || data.passages.length === 0) {
        throw new APIError(404, `No passages found for reference: ${reference}`);
      }

      const html = data.passages[0];

      // Parse footnotes and cross-references from HTML
      const footnotes = this.parseFootnotes(html);
      const crossReferences = this.parseCrossReferences(html);

      const result: ESVPassageWithNotesResponse = {
        query: data.query,
        canonical: data.canonical,
        parsed: data.parsed,
        passage_meta: data.passage_meta,
        passages: data.passages,
        footnotes,
        crossReferences,
        html
      };

      // Store in cache
      this.htmlCache.set(cacheKey, result);

      return result;
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

  /**
   * Parse footnotes from ESV HTML response
   */
  private parseFootnotes(html: string): ESVFootnote[] {
    const footnotes: ESVFootnote[] = [];

    // Extract footnotes section: <div class="footnotes ...">...</div>
    const footnotesMatch = html.match(/<div class="footnotes[^>]*>(.*?)<\/div>/s);
    if (!footnotesMatch) {
      return footnotes;
    }

    const footnotesSection = footnotesMatch[1];

    // Match individual footnotes: <p><span class="footnote">...</span> ... <note>content</note></p>
    const footnotePattern = /<span class="footnote"><a[^>]*>\[(\d+)\]<\/a><\/span>\s*<span class="footnote-ref">([^<]*)<\/span>\s*<note[^>]*>(.*?)<\/note>/g;

    let match;
    while ((match = footnotePattern.exec(footnotesSection)) !== null) {
      const [, marker, reference, noteContent] = match;

      // Clean up the note content (remove HTML tags)
      let text = noteContent
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Determine note type from content
      let type: 'variant' | 'translation' | 'other' = 'other';
      if (text.toLowerCase().includes('some manuscripts')) {
        type = 'variant';
      } else if (text.toLowerCase().includes('or ') || text.toLowerCase().includes('hebrew') || text.toLowerCase().includes('greek')) {
        type = 'translation';
      }

      footnotes.push({
        marker,
        reference: reference.trim(),
        text,
        type
      });
    }

    return footnotes;
  }

  /**
   * Parse cross-references from ESV HTML response
   * Note: ESV API HTML doesn't include cross-references by default
   * This is a placeholder for future enhancement
   */
  private parseCrossReferences(html: string): ESVCrossReference[] {
    const crossRefs: ESVCrossReference[] = [];

    // ESV HTML API doesn't include cross-references in the current format
    // This would require a separate API endpoint or enhancement
    // For now, return empty array

    return crossRefs;
  }
}