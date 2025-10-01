/**
 * CCEL (Christian Classics Ethereal Library) API Adapter
 *
 * Provides access to classic Christian texts including:
 * - Scripture passages (alternative Bible source)
 * - Classic work fragments (quotations from Augustine, Calvin, Luther, etc.)
 * - Full work sections (complete chapters/sections)
 *
 * API Documentation: https://www.ccel.org/webtools.html
 */

export interface CCELScriptureOptions {
  version?: string;  // Bible translation (e.g., 'kjv', 'nrsv', 'asv')
  passage: string;   // Book, chapter, verse range (e.g., 'matt_1:1-5', 'john_3:16')
}

export interface CCELWorkFragment {
  work: string;      // Work identifier (e.g., 'augustine/confessions')
  section: string;   // Section identifier (e.g., 'confessions.ii')
  fragments: string[]; // Fragment selectors (e.g., ['ii-p2 39 92', 'ii-p3 297 68'])
}

export interface CCELWorkSection {
  work: string;      // Work identifier
  section: string;   // Section identifier
}

export interface CCELScriptureResponse {
  passage: string;
  version: string;
  text: string;
  html: string;
}

export interface CCELWorkResponse {
  work: string;
  section: string;
  content: string;
  html: string;
}

/**
 * CCEL API Adapter
 */
export class CCELApiAdapter {
  private readonly baseUrl = 'https://ccel.org';
  private readonly scriptureEndpoint = '/ajax/scripture';

  /**
   * Fetch a Bible passage from CCEL
   *
   * @param options - Scripture lookup options
   * @returns Scripture response with HTML content
   *
   * @example
   * ```typescript
   * const result = await adapter.getScripture({
   *   version: 'kjv',
   *   passage: 'john_3:16'
   * });
   * ```
   */
  async getScripture(options: CCELScriptureOptions): Promise<CCELScriptureResponse> {
    const { version = 'nrsv', passage } = options;

    // Build query parameters
    const params = new URLSearchParams({
      version,
      passage
    });

    const url = `${this.baseUrl}${this.scriptureEndpoint}?${params.toString()}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`CCEL API error: ${response.status} ${response.statusText}`);
      }

      const xml = await response.text();

      // Extract HTML from XML body tag and unescape it
      const bodyMatch = xml.match(/<body>([\s\S]*?)<\/body>/);
      if (!bodyMatch) {
        throw new Error('Could not parse CCEL Scripture API response');
      }

      // Unescape the HTML entities
      const html = bodyMatch[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');

      return {
        passage,
        version,
        text: this.extractScriptureText(html),
        html
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch scripture from CCEL: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch specific fragments (quotations) from a classic work
   *
   * @param options - Work fragment options
   * @returns Work response with selected fragments
   *
   * @example
   * ```typescript
   * const result = await adapter.getWorkFragments({
   *   work: 'augustine/confessions',
   *   section: 'confessions.ii',
   *   fragments: ['ii-p2 39 92', 'ii-p3 297 68']
   * });
   * ```
   */
  async getWorkFragments(options: CCELWorkFragment): Promise<CCELWorkResponse> {
    const { work, section, fragments } = options;

    // Build fragment parameter: (fragment1)(fragment2)...
    const fragmentParam = fragments.map(f => `(${f})`).join('');

    const url = `${this.baseUrl}/ccel/${work}/${section}.html?fragment=${fragmentParam}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`CCEL API error: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();

      return {
        work,
        section,
        content: this.extractTextFromHtml(html),
        html
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch work fragments from CCEL: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch a complete section of a classic work
   *
   * @param options - Work section options
   * @returns Work response with full section content
   *
   * @example
   * ```typescript
   * const result = await adapter.getWorkSection({
   *   work: 'augustine/confessions',
   *   section: 'confessions.ii'
   * });
   * ```
   */
  async getWorkSection(options: CCELWorkSection): Promise<CCELWorkResponse> {
    const { work, section } = options;

    const url = `${this.baseUrl}/ccel/${work}/${section}.html?html=true`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`CCEL API error: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();

      return {
        work,
        section,
        content: this.extractTextFromHtml(html),
        html
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch work section from CCEL: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Extract text from Scripture API HTML
   * Scripture API returns simpler HTML without book-content div
   *
   * @param html - HTML content from Scripture API
   * @returns Plain text content
   */
  private extractScriptureText(html: string): string {
    // Remove all HTML tags
    let text = html.replace(/<[^>]*>/g, ' ');

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Extract plain text from HTML
   * Extracts only content from the book-content div
   *
   * @param html - HTML content
   * @returns Plain text content
   */
  private extractTextFromHtml(html: string): string {
    // Check if this is an error page
    if (html.includes('Something went wrong') ||
        html.includes('VIEWNAME is 500') ||
        html.includes('Error -') ||
        html.length < 100) {
      throw new Error('CCEL returned an error page. The section identifier may be incorrect. Visit https://ccel.org to find the correct section ID.');
    }

    // Extract only the book-content div
    const bookContentMatch = html.match(/<div[^>]*class="book-content"[^>]*>([\s\S]*?)<\/div>/i);

    if (!bookContentMatch) {
      // Fallback: try xmlns version
      const xhtmlMatch = html.match(/<div xmlns="http:\/\/www\.w3\.org\/1999\/xhtml" class="book-content">([\s\S]*?)<\/div>/i);
      if (!xhtmlMatch) {
        throw new Error('Could not find book content in CCEL response. The section identifier may be incorrect.');
      }
      html = xhtmlMatch[1];
    } else {
      html = bookContentMatch[1];
    }

    // Remove script and style tags entirely
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // Remove navigation tables
    text = text.replace(/<table[^>]*class="book_navbar"[^>]*>[\s\S]*?<\/table>/gi, '');

    // Remove footnote references but keep the text
    text = text.replace(/<sup[^>]*class="Note"[^>]*>[\s\S]*?<\/sup>/gi, '');
    text = text.replace(/<span[^>]*class="mnote"[^>]*>[\s\S]*?<\/span>/gi, '');

    // Remove HTML tags but preserve spacing
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<[^>]*>/g, ' ');

    // Decode common HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–');

    // Normalize whitespace but preserve paragraph breaks
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n\s*\n\s*\n+/g, '\n\n');
    text = text.trim();

    // Check if resulting text is suspiciously short or looks like JavaScript
    if (text.length < 50) {
      throw new Error('CCEL returned very short content. The section may not exist or the identifier may be incorrect.');
    }

    if (text.includes('function(') || text.includes('jQuery') || text.includes('dataLayer')) {
      throw new Error('CCEL returned JavaScript instead of content. The section identifier is likely incorrect.');
    }

    return text;
  }

  /**
   * Convert a standard Bible reference to CCEL format
   * Examples:
   * - "John 3:16" -> "john_3:16"
   * - "Matthew 5:1-10" -> "matt_5:1-10"
   * - "1 Corinthians 13:1-13" -> "1cor_13:1-13"
   *
   * @param reference - Standard Bible reference
   * @returns CCEL-formatted passage string
   */
  static formatPassageReference(reference: string): string {
    // Common book abbreviations for CCEL
    const bookMappings: Record<string, string> = {
      'genesis': 'gen', 'gen': 'gen',
      'exodus': 'exod', 'exod': 'exod', 'ex': 'exod',
      'leviticus': 'lev', 'lev': 'lev',
      'numbers': 'num', 'num': 'num',
      'deuteronomy': 'deut', 'deut': 'deut',
      'joshua': 'josh', 'josh': 'josh',
      'judges': 'judg', 'judg': 'judg',
      'ruth': 'ruth',
      '1 samuel': '1sam', '1sam': '1sam',
      '2 samuel': '2sam', '2sam': '2sam',
      '1 kings': '1kgs', '1kgs': '1kgs',
      '2 kings': '2kgs', '2kgs': '2kgs',
      'matthew': 'matt', 'matt': 'matt', 'mt': 'matt',
      'mark': 'mark', 'mk': 'mark',
      'luke': 'luke', 'lk': 'luke',
      'john': 'john', 'jn': 'john',
      'acts': 'acts',
      'romans': 'rom', 'rom': 'rom',
      '1 corinthians': '1cor', '1cor': '1cor',
      '2 corinthians': '2cor', '2cor': '2cor',
      'galatians': 'gal', 'gal': 'gal',
      'ephesians': 'eph', 'eph': 'eph',
      'philippians': 'phil', 'phil': 'phil',
      'colossians': 'col', 'col': 'col',
      '1 thessalonians': '1thess', '1thess': '1thess',
      '2 thessalonians': '2thess', '2thess': '2thess',
      'revelation': 'rev', 'rev': 'rev'
    };

    // Parse reference: "Book Chapter:Verse" or "Book Chapter:Verse-Verse"
    const match = reference.match(/^([1-3]?\s*[a-z]+)\s+(\d+):(\d+(?:-\d+)?)$/i);

    if (!match) {
      throw new Error(`Invalid Bible reference format: ${reference}`);
    }

    const [, book, chapter, verses] = match;
    const normalizedBook = book.toLowerCase().trim();
    const ccelBook = bookMappings[normalizedBook] || normalizedBook.replace(/\s+/g, '');

    return `${ccelBook}_${chapter}:${verses}`;
  }
}
