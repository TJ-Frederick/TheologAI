/**
 * Public Domain Commentary Adapter
 *
 * Provides access to public domain Bible commentaries via CCEL:
 * - Matthew Henry's Complete Commentary
 * - Matthew Henry's Concise Commentary
 * - Jamieson-Fausset-Brown Commentary
 * - And others
 *
 * Leverages existing CCELApiAdapter for data retrieval.
 */

import { CCELApiAdapter, type CCELWorkSection } from './ccelApi.js';
import {
  mapToMatthewHenry,
  mapToMatthewHenryConcise,
  mapToJFB,
  parseReference
} from '../utils/commentaryMapper.js';

export interface CommentaryOptions {
  reference: string;
  commentator?: 'Matthew Henry' | 'Matthew Henry Concise' | 'JFB' | 'Jamieson-Fausset-Brown';
}

export interface CommentaryResponse {
  reference: string;
  commentator: string;
  chapterCommentary: string;
  verseCommentary?: string;
  fullText: string;
  work: string;
  section: string;
  url: string;
}

/**
 * Public Domain Commentary Adapter
 * Fetches and parses commentary from CCEL
 */
export class PublicCommentaryAdapter {
  private ccel: CCELApiAdapter;

  constructor() {
    this.ccel = new CCELApiAdapter();
  }

  /**
   * Get Matthew Henry's Complete Commentary for a Bible reference
   *
   * @param reference - Bible reference (e.g., "John 3:16")
   * @returns Commentary response with full chapter and verse-specific content
   */
  async getMatthewHenry(reference: string): Promise<CommentaryResponse> {
    const mapping = mapToMatthewHenry(reference);
    const parsed = parseReference(reference);

    // Fetch the chapter commentary from CCEL
    const result = await this.ccel.getWorkSection({
      work: mapping.work,
      section: mapping.section
    });

    // Extract verse-specific commentary if verse number provided
    let verseCommentary: string | undefined;
    if (mapping.verse) {
      verseCommentary = this.extractVerseCommentary(result.content, mapping.verse);
    }

    return {
      reference,
      commentator: 'Matthew Henry',
      chapterCommentary: result.content,
      verseCommentary,
      fullText: verseCommentary || result.content,
      work: mapping.work,
      section: mapping.section,
      url: `https://ccel.org/ccel/${mapping.work}/${mapping.section}.html`
    };
  }

  /**
   * Get Matthew Henry's Concise Commentary for a Bible reference
   *
   * @param reference - Bible reference (e.g., "John 3:16")
   * @returns Commentary response
   */
  async getMatthewHenryConcise(reference: string): Promise<CommentaryResponse> {
    const mapping = mapToMatthewHenryConcise(reference);

    const result = await this.ccel.getWorkSection({
      work: mapping.work,
      section: mapping.section
    });

    let verseCommentary: string | undefined;
    if (mapping.verse) {
      verseCommentary = this.extractVerseCommentary(result.content, mapping.verse);
    }

    return {
      reference,
      commentator: 'Matthew Henry (Concise)',
      chapterCommentary: result.content,
      verseCommentary,
      fullText: verseCommentary || result.content,
      work: mapping.work,
      section: mapping.section,
      url: `https://ccel.org/ccel/${mapping.work}/${mapping.section}.html`
    };
  }

  /**
   * Get Jamieson-Fausset-Brown Commentary for a Bible reference
   * Note: This is experimental - JFB structure on CCEL may differ
   *
   * @param reference - Bible reference (e.g., "John 3:16")
   * @returns Commentary response
   */
  async getJFB(reference: string): Promise<CommentaryResponse> {
    const mapping = mapToJFB(reference);

    try {
      const result = await this.ccel.getWorkSection({
        work: mapping.work,
        section: mapping.section
      });

      let verseCommentary: string | undefined;
      if (mapping.verse) {
        verseCommentary = this.extractVerseCommentary(result.content, mapping.verse);
      }

      return {
        reference,
        commentator: 'Jamieson-Fausset-Brown',
        chapterCommentary: result.content,
        verseCommentary,
        fullText: verseCommentary || result.content,
        work: mapping.work,
        section: mapping.section,
        url: `https://ccel.org/ccel/${mapping.work}/${mapping.section}.html`
      };
    } catch (error) {
      throw new Error(
        `JFB Commentary not available for ${reference}. ` +
        `JFB commentary may use a different CCEL structure. ` +
        `Try Matthew Henry instead.`
      );
    }
  }

  /**
   * Get commentary from any available commentator
   *
   * @param options - Commentary options with reference and optional commentator
   * @returns Commentary response
   */
  async getCommentary(options: CommentaryOptions): Promise<CommentaryResponse> {
    const { reference, commentator = 'Matthew Henry' } = options;

    const normalized = commentator.toLowerCase();

    if (normalized.includes('concise')) {
      return this.getMatthewHenryConcise(reference);
    }

    if (normalized.includes('jfb') || normalized.includes('jamieson')) {
      return this.getJFB(reference);
    }

    // Default to Matthew Henry Complete
    return this.getMatthewHenry(reference);
  }

  /**
   * Extract verse-specific commentary from chapter commentary
   *
   * Matthew Henry's commentary often has verse-range headings like:
   * - "Verses 1-5"
   * - "Verses 16-21"
   * - "Ver. 16"
   *
   * This method attempts to find and extract the relevant section.
   *
   * @param chapterText - Full chapter commentary text
   * @param verseNumber - Target verse number
   * @returns Extracted verse commentary or undefined if not found
   */
  private extractVerseCommentary(chapterText: string, verseNumber: number): string | undefined {
    // Split into paragraphs
    const paragraphs = chapterText.split('\n\n');

    // Look for verse headings (various formats)
    const versePatterns = [
      // "Verses 16-21"
      new RegExp(`Verses?\\s+(\\d+)-(\\d+)`, 'i'),
      // "Ver. 16" or "V. 16"
      new RegExp(`Ver?\\.?\\s+(\\d+)`, 'i'),
      // "16-21."
      new RegExp(`^(\\d+)-(\\d+)\\.?\\s*$`, 'i'),
      // "16."
      new RegExp(`^(\\d+)\\.?\\s*$`, 'i')
    ];

    let currentSection: string[] = [];
    let inTargetSection = false;

    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      if (!para) continue;

      // Check if this paragraph is a verse heading
      let isHeading = false;
      let containsTargetVerse = false;

      for (const pattern of versePatterns) {
        const match = para.match(pattern);
        if (match) {
          isHeading = true;

          // Extract verse range or single verse
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : start;

          // Check if target verse is in this range
          if (verseNumber >= start && verseNumber <= end) {
            containsTargetVerse = true;
            break;
          }
        }
      }

      if (isHeading) {
        // If we were in target section and hit a new heading, we're done
        if (inTargetSection && !containsTargetVerse) {
          break;
        }

        // Start new section if this is our target
        if (containsTargetVerse) {
          inTargetSection = true;
          currentSection = [para];
        } else {
          inTargetSection = false;
          currentSection = [];
        }
      } else if (inTargetSection) {
        // Add paragraph to current section
        currentSection.push(para);
      }
    }

    // Return extracted section if found
    if (currentSection.length > 0) {
      return currentSection.join('\n\n');
    }

    // Fallback: return first ~500 characters with ellipsis
    // This provides some context even if we can't find verse-specific section
    const preview = chapterText.substring(0, 800).trim();
    if (preview.length < chapterText.length) {
      return preview + '\n\n[Commentary continues for entire chapter...]';
    }

    return undefined;
  }

  /**
   * Get list of available commentators
   */
  getAvailableCommentators(): string[] {
    return [
      'Matthew Henry',
      'Matthew Henry Concise',
      'Jamieson-Fausset-Brown'
    ];
  }

  /**
   * Check if a commentator is available
   */
  isCommentatorAvailable(commentator: string): boolean {
    const available = this.getAvailableCommentators();
    return available.some(c => c.toLowerCase().includes(commentator.toLowerCase()));
  }
}
