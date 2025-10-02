/**
 * Public Domain Commentary Adapter
 *
 * Provides access to public domain Bible commentaries via HelloAO Bible API:
 * - Matthew Henry's Complete Commentary
 * - Jamieson-Fausset-Brown Commentary
 * - Adam Clarke Commentary
 * - John Gill Commentary
 * - Keil-Delitzsch Commentary (OT only)
 * - Tyndale Open Study Notes
 *
 * Uses HelloAO API (bible.helloao.org) for clean JSON data instead of HTML scraping.
 *
 * Previous implementation used CCEL HTML parsing - that has been replaced for commentary
 * with this cleaner HelloAO JSON approach. CCEL is still used for classic texts (Augustine, Calvin, etc.)
 */

import { HelloAOApiAdapter } from './helloaoApi.js';
import {
  mapReferenceToHelloAO,
  getHelloAOCommentaryId,
  validateCommentatorSupportsBook,
  getAvailableHelloAOCommentators,
  type HelloAOReference
} from '../utils/helloaoMapper.js';

export interface CommentaryOptions {
  reference: string;
  commentator?: string; // Any HelloAO commentator name
}

export interface CommentaryResponse {
  reference: string;
  commentator: string;
  verseCommentary?: string;
  chapterCommentary: string;
  fullText: string;
  url: string;
}

/**
 * Public Domain Commentary Adapter
 * Fetches and parses commentary from HelloAO Bible API
 */
export class PublicCommentaryAdapter {
  private helloao: HelloAOApiAdapter;

  constructor() {
    this.helloao = new HelloAOApiAdapter();
  }

  /**
   * Get commentary for any Bible reference from any available commentator
   *
   * @param options - Commentary options with reference and optional commentator
   * @returns Commentary response with verse-specific and chapter content
   *
   * @example
   * ```typescript
   * const adapter = new PublicCommentaryAdapter();
   * const result = await adapter.getCommentary({
   *   reference: 'John 3:16',
   *   commentator: 'Matthew Henry'
   * });
   * ```
   */
  async getCommentary(options: CommentaryOptions): Promise<CommentaryResponse> {
    const { reference, commentator = 'Matthew Henry' } = options;

    // Map reference to HelloAO format
    const helloaoRef = mapReferenceToHelloAO(reference);

    // Get HelloAO commentary ID
    const commentaryId = getHelloAOCommentaryId(commentator);

    // Validate commentator supports this book (e.g., Keil-Delitzsch is OT only)
    validateCommentatorSupportsBook(commentator, helloaoRef.book);

    // Fetch chapter commentary from HelloAO (uses book code for commentaries)
    const chapterResponse = await this.helloao.getCommentaryChapter(
      commentaryId,
      helloaoRef.bookCode,
      helloaoRef.chapter
    );

    // Build URL for reference
    const url = `https://bible.helloao.org/api/c/${commentaryId}/${helloaoRef.bookCode}/${helloaoRef.chapter}.json`;

    // Extract verse-specific commentary if verse number provided
    let verseCommentary: string | undefined;
    if (helloaoRef.verse) {
      verseCommentary = HelloAOApiAdapter.getCommentaryForVerse(
        chapterResponse,
        helloaoRef.verse
      );
    }

    // Build full chapter commentary text
    const chapterCommentary = this.buildChapterCommentary(chapterResponse);

    // Determine which text to use as primary
    const fullText = verseCommentary || chapterCommentary;

    return {
      reference,
      commentator: chapterResponse.commentary.name,
      verseCommentary,
      chapterCommentary,
      fullText,
      url
    };
  }

  /**
   * Get Matthew Henry's Commentary
   */
  async getMatthewHenry(reference: string): Promise<CommentaryResponse> {
    return this.getCommentary({ reference, commentator: 'Matthew Henry' });
  }

  /**
   * Get Jamieson-Fausset-Brown Commentary
   */
  async getJFB(reference: string): Promise<CommentaryResponse> {
    return this.getCommentary({ reference, commentator: 'Jamieson-Fausset-Brown' });
  }

  /**
   * Get Adam Clarke Commentary
   */
  async getAdamClarke(reference: string): Promise<CommentaryResponse> {
    return this.getCommentary({ reference, commentator: 'Adam Clarke' });
  }

  /**
   * Get John Gill Commentary
   */
  async getJohnGill(reference: string): Promise<CommentaryResponse> {
    return this.getCommentary({ reference, commentator: 'John Gill' });
  }

  /**
   * Get Keil-Delitzsch Commentary (Old Testament only)
   */
  async getKeilDelitzsch(reference: string): Promise<CommentaryResponse> {
    return this.getCommentary({ reference, commentator: 'Keil-Delitzsch' });
  }

  /**
   * Get Tyndale Open Study Notes
   */
  async getTyndale(reference: string): Promise<CommentaryResponse> {
    return this.getCommentary({ reference, commentator: 'Tyndale' });
  }

  /**
   * Build chapter commentary text from HelloAO response
   * Combines all verse commentaries into readable chapter text
   */
  private buildChapterCommentary(response: any): string {
    const parts: string[] = [];

    for (const verseContent of response.chapter.content) {
      const verseNum = verseContent.verseNumber;
      const annotations = verseContent.content;

      // Build verse commentary
      const verseParts: string[] = [];

      for (const annotation of annotations) {
        if (annotation.type === 'heading') {
          verseParts.push(`**${annotation.content.join(' ')}**`);
        } else if (annotation.type === 'text') {
          verseParts.push(annotation.content.join(' '));
        }
      }

      if (verseParts.length > 0) {
        parts.push(`**Verse ${verseNum}:**\n${verseParts.join('\n\n')}`);
      }
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Get list of available commentators
   */
  getAvailableCommentators(): string[] {
    return getAvailableHelloAOCommentators();
  }

  /**
   * Check if a commentator is available
   */
  isCommentatorAvailable(commentator: string): boolean {
    try {
      getHelloAOCommentaryId(commentator);
      return true;
    } catch {
      return false;
    }
  }
}
