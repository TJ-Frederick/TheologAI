/**
 * Section Resolver Service
 *
 * Resolves natural language queries to CCEL section identifiers
 */

import { CCELTocParser, type ParsedToc, type TocEntry } from '../adapters/ccelToc.js';
import { Cache } from '../utils/cache.js';

export interface SectionResolution {
  sectionId: string;
  title: string;
  confidence: 'exact' | 'high' | 'medium' | 'low';
  alternatives?: TocEntry[];
}

export class SectionResolver {
  private tocParser: CCELTocParser;
  private tocCache: Cache<ParsedToc>;

  constructor() {
    this.tocParser = new CCELTocParser();
    // Cache TOCs for 24 hours
    this.tocCache = new Cache<ParsedToc>(50, 24 * 60 * 60 * 1000);
  }

  /**
   * Resolve a natural language query to a section ID
   *
   * @param work - Work identifier (e.g., "calvin/institutes")
   * @param query - Natural language query (e.g., "Book 1 Chapter 1", "Introduction")
   * @returns Section resolution with ID and confidence
   *
   * @example
   * ```typescript
   * const result = await resolver.resolve('calvin/institutes', 'Book 1 Chapter 1');
   * // Returns: { sectionId: 'institutes.iii.ii', title: 'CHAPTER 1...', confidence: 'exact' }
   * ```
   */
  async resolve(work: string, query: string): Promise<SectionResolution> {
    // Get TOC (cached if available)
    const toc = await this.getToc(work);

    if (toc.entries.length === 0) {
      throw new Error(`No TOC entries found for ${work}`);
    }

    // Try to find best match
    const match = this.tocParser.searchToc(toc.entries, query);

    if (!match) {
      // Return first entry as fallback
      return {
        sectionId: toc.entries[0].sectionId,
        title: toc.entries[0].title,
        confidence: 'low',
        alternatives: toc.entries.slice(1, 6)
      };
    }

    // Determine confidence based on match quality
    const confidence = this.calculateConfidence(query, match);

    // Find alternatives if confidence is not exact
    const alternatives = confidence !== 'exact'
      ? this.tocParser.findMatches(toc.entries, query, 5).filter(e => e.sectionId !== match.sectionId)
      : undefined;

    return {
      sectionId: match.sectionId,
      title: match.title,
      confidence,
      alternatives
    };
  }

  /**
   * Get TOC for a work (cached)
   */
  private async getToc(work: string): Promise<ParsedToc> {
    const cacheKey = `toc:${work}`;

    // Check cache first
    const cached = this.tocCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch and parse TOC
    const toc = await this.tocParser.parseToc(work);

    // Cache it
    this.tocCache.set(cacheKey, toc);

    return toc;
  }

  /**
   * Calculate confidence score for a match
   */
  private calculateConfidence(query: string, match: TocEntry): 'exact' | 'high' | 'medium' | 'low' {
    const queryLower = query.toLowerCase();
    const titleLower = match.title.toLowerCase();

    // Exact title match
    if (titleLower === queryLower || titleLower.includes(queryLower)) {
      return 'exact';
    }

    // Structured match (Book X Chapter Y)
    const structuredMatch = this.parseStructuredQuery(query);
    if (structuredMatch) {
      const { book, chapter, part } = structuredMatch;

      let matchCount = 0;
      let totalCriteria = 0;

      if (book !== undefined) {
        totalCriteria++;
        if (match.book === book) matchCount++;
      }

      if (chapter !== undefined) {
        totalCriteria++;
        if (match.chapter === chapter) matchCount++;
      }

      if (part !== undefined) {
        totalCriteria++;
        if (match.part === part) matchCount++;
      }

      if (totalCriteria > 0) {
        const matchRatio = matchCount / totalCriteria;
        if (matchRatio === 1) return 'exact';
        if (matchRatio >= 0.5) return 'high';
        return 'medium';
      }
    }

    // Keyword match
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
    const titleWords = titleLower.split(/\s+/);

    const matchingWords = queryWords.filter(qw =>
      titleWords.some(tw => tw.includes(qw) || qw.includes(tw))
    );

    if (matchingWords.length >= queryWords.length / 2) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Parse structured query
   */
  private parseStructuredQuery(query: string): { book?: number; chapter?: number; part?: number } | null {
    const result: { book?: number; chapter?: number; part?: number } = {};

    // Book pattern
    const bookMatch = query.match(/\bbook\s+(\d+|i{1,3}v?|first|second|third|fourth)/i);
    if (bookMatch) {
      result.book = this.parseNumber(bookMatch[1]);
    }

    // Chapter pattern
    const chapterMatch = query.match(/\bchapter\s+(\d+|i{1,3}v?x?)/i);
    if (chapterMatch) {
      result.chapter = this.parseNumber(chapterMatch[1]);
    }

    // Part pattern
    const partMatch = query.match(/\bpart\s+(\d+|i{1,3}v?)/i);
    if (partMatch) {
      result.part = this.parseNumber(partMatch[1]);
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  /**
   * Convert number word/roman numeral to number
   */
  private parseNumber(str: string): number {
    const num = parseInt(str);
    if (!isNaN(num)) {
      return num;
    }

    const romanMap: Record<string, number> = {
      'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
      'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10
    };

    if (romanMap[str.toUpperCase()]) {
      return romanMap[str.toUpperCase()];
    }

    const wordMap: Record<string, number> = {
      'FIRST': 1, 'SECOND': 2, 'THIRD': 3, 'FOURTH': 4,
      'FIFTH': 5, 'SIXTH': 6
    };

    return wordMap[str.toUpperCase()] || 1;
  }

  /**
   * List all sections for a work
   */
  async listSections(work: string): Promise<TocEntry[]> {
    const toc = await this.getToc(work);
    return toc.entries;
  }

  /**
   * Clear cached TOC for a work
   */
  clearCache(work?: string): void {
    if (work) {
      this.tocCache.clear();
    } else {
      this.tocCache.clear();
    }
  }
}
