/**
 * NET Bible (New English Translation) API Adapter
 *
 * Provides access to NET Bible text with extensive translator notes.
 * The NET Bible features over 60,000 translators' notes making it ideal
 * for detailed Bible study and commentary.
 *
 * API Documentation: https://labs.bible.org/api_web_service
 */

import { APIError } from '../utils/errors.js';
import { Cache } from '../utils/cache.js';

export interface NETBibleNote {
  marker: string;      // Note marker (e.g., "sn", "tc", "tn")
  text: string;        // Note content
  type: string;        // Note type (study note, textual criticism, translator note)
}

export interface NETBibleResponse {
  reference: string;   // Original reference query
  passage: string;     // Canonical passage text
  text: string;        // Plain text without notes
  notes: NETBibleNote[]; // Array of translator notes
  html: string;        // Full HTML response
}

/**
 * NET Bible API Adapter
 *
 * Free API access to NET Bible with translator notes.
 * No API key required.
 */
export class NETBibleAdapter {
  private readonly baseUrl = 'https://labs.bible.org/api/';
  private cache: Cache<NETBibleResponse>;

  // Copyright compliance
  private readonly COPYRIGHT_NOTICE = 'NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C.';

  constructor() {
    // Cache responses for 1 hour (consistent with ESV adapter)
    this.cache = new Cache<NETBibleResponse>(100, 60 * 60 * 1000);
  }

  /**
   * Fetch a Bible passage with translator notes
   *
   * @param reference - Bible reference (e.g., "John 3:16", "Rom 8:28-30")
   * @returns Passage text with extracted translator notes
   */
  async getPassage(reference: string): Promise<NETBibleResponse> {
    if (!reference || reference.trim().length === 0) {
      throw new APIError(400, 'Bible reference cannot be empty');
    }

    // Check cache first
    const cached = this.cache.get(reference);
    if (cached) {
      return cached;
    }

    // Build API request
    const params = new URLSearchParams({
      passage: reference,
      formatting: 'full',  // Include all HTML tags and notes
      type: 'json'         // Request JSON response
    });

    const url = `${this.baseUrl}?${params.toString()}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 400) {
          throw new APIError(400, `Invalid Bible reference: ${reference}`);
        }
        throw new APIError(response.status, `NET Bible API error: ${response.statusText}`);
      }

      const data = await response.json();

      // API returns array of verse objects
      if (!Array.isArray(data) || data.length === 0) {
        throw new APIError(404, `No passage found for reference: ${reference}`);
      }

      // Combine all verses into single passage
      const html = data.map((verse: any) => {
        const bookname = verse.bookname || '';
        const chapter = verse.chapter || '';
        const verseNum = verse.verse || '';
        const text = verse.text || '';

        return `<span class="verse-ref">${bookname} ${chapter}:${verseNum}</span> ${text}`;
      }).join(' ');

      // Extract notes and clean text
      const notes = this.extractNotes(html);
      const text = this.extractPlainText(html);

      const result: NETBibleResponse = {
        reference,
        passage: text,
        text,
        notes,
        html
      };

      // Cache the result
      this.cache.set(reference, result);

      return result;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('fetch')) {
        throw new APIError(503, 'Unable to connect to NET Bible API');
      }
      throw new APIError(500, `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract translator note markers from HTML
   *
   * The NET Bible API returns note markers (<n id="..." />) but not the actual note content.
   * The notes are available on netbible.org but not via the public API.
   *
   * This method extracts note markers to indicate which verses have translator notes available.
   */
  private extractNotes(html: string): NETBibleNote[] {
    const notes: NETBibleNote[] = [];

    // Match note markers: <n id="1" /> etc
    const notePattern = /<n\s+id=["'](\d+)["']\s*\/>/gi;
    const matches = html.matchAll(notePattern);

    for (const match of matches) {
      const noteId = match[1];

      // We can't get the actual note content from the API
      // But we can indicate that a note exists
      notes.push({
        marker: noteId,
        text: `Translator note #${noteId} available at netbible.org`,
        type: 'study'
      });
    }

    return notes;
  }

  /**
   * Extract plain text from HTML, removing all tags and notes
   */
  private extractPlainText(html: string): string {
    // Remove note tags completely
    let text = html.replace(/<sup[^>]*class=["'](?:note|footnote)["'][^>]*>.*?<\/sup>/gi, '');

    // Remove verse reference spans but keep the text
    text = text.replace(/<span[^>]*class=["']verse-ref["'][^>]*>/gi, '');
    text = text.replace(/<\/span>/gi, '');

    // Remove all remaining HTML tags
    text = text.replace(/<[^>]*>/g, ' ');

    // Decode HTML entities
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

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Get copyright notice for attribution
   */
  getCopyrightNotice(): string {
    return this.COPYRIGHT_NOTICE;
  }

  /**
   * Check if adapter is ready to use
   * NET Bible API doesn't require authentication
   */
  isConfigured(): boolean {
    return true;
  }
}
