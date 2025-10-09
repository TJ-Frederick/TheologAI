/**
 * Section Resolver Service
 *
 * Resolves natural language queries to CCEL section identifiers
 */

import { CCELTocParser, type ParsedToc, type TocEntry, type VerseRange } from '../adapters/ccelToc.js';
import { parseReference } from '../utils/commentaryMapper.js';
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

    // Priority 1: Try Bible verse matching (for commentaries)
    if (this.isBibleVerseQuery(query)) {
      const verseMatch = this.findSectionByBibleVerse(toc.entries, query);
      if (verseMatch) {
        return {
          sectionId: verseMatch.sectionId,
          title: verseMatch.title,
          confidence: 'exact'
        };
      }
    }

    // Priority 2: Try structured/title/keyword matching (existing logic)
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
   * Check if query looks like a Bible verse reference
   * Examples: "John 3:16", "1 Timothy 2:14", "Genesis 1:1-3"
   */
  private isBibleVerseQuery(query: string): boolean {
    // Pattern: Optional number + Book name + Chapter:Verse
    // Matches: "John 3:16", "1 Timothy 2:14", "2 Corinthians 5:17"
    const bibleVersePattern = /^([1-3]?\s*[A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+):(\d+)(?:-(\d+))?$/;
    return bibleVersePattern.test(query.trim());
  }

  /**
   * Find TOC section by Bible verse reference
   * Matches single verse to section with verse range
   * Example: "1 Timothy 2:14" matches section titled "1 Timothy 2:11-15"
   *
   * @param entries - TOC entries to search
   * @param query - Bible verse query (e.g., "1 Timothy 2:14")
   * @returns Matching TOC entry or undefined
   */
  private findSectionByBibleVerse(entries: TocEntry[], query: string): TocEntry | undefined {
    try {
      // Parse the query verse using existing utility
      const queryVerse = parseReference(query);

      // Normalize book name for comparison (lowercase, trim)
      const normalizeBook = (book: string) => book.toLowerCase().trim();
      const queryBookNorm = normalizeBook(queryVerse.book);

      // Search through TOC entries
      for (const entry of entries) {
        // Parse verse range from entry title
        const entryRange = this.tocParser.parseVerseRangeFromTitle(entry.title);

        if (!entryRange) {
          continue; // Not a Bible verse entry
        }

        const entryBookNorm = normalizeBook(entryRange.book);

        // Check if book and chapter match
        if (entryBookNorm !== queryBookNorm || entryRange.chapter !== queryVerse.chapter) {
          continue;
        }

        // If query has no verse specified, match chapter only
        if (queryVerse.verse === undefined) {
          return entry;
        }

        // Check if query verse falls within entry's verse range
        if (queryVerse.verse >= entryRange.startVerse && queryVerse.verse <= entryRange.endVerse) {
          return entry;
        }

        // If query has a verse range (e.g., "1 Timothy 2:11-15"), check for overlap
        if (queryVerse.endVerse !== undefined) {
          const queryOverlaps =
            (queryVerse.verse >= entryRange.startVerse && queryVerse.verse <= entryRange.endVerse) ||
            (queryVerse.endVerse >= entryRange.startVerse && queryVerse.endVerse <= entryRange.endVerse) ||
            (queryVerse.verse <= entryRange.startVerse && queryVerse.endVerse >= entryRange.endVerse);

          if (queryOverlaps) {
            return entry;
          }
        }
      }

      return undefined;
    } catch (error) {
      // If parsing fails, return undefined (not a valid Bible reference)
      return undefined;
    }
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
   * Search sections by topic/keyword within a work
   * Searches TOC entry titles for keyword matches
   *
   * @param work - Work identifier (e.g., "calvin/institutes")
   * @param topic - Topic or keyword to search for (e.g., "predestination", "trinity")
   * @returns Array of matching TOC entries, ranked by relevance
   *
   * @example
   * ```typescript
   * const results = await resolver.searchSectionsByTopic('calvin/institutes', 'predestination');
   * // Returns sections with "predestination" in the title
   * ```
   */
  async searchSectionsByTopic(work: string, topic: string): Promise<TocEntry[]> {
    const toc = await this.getToc(work);
    const topicLower = topic.toLowerCase();

    // Find all sections that match the topic
    const matches: Array<{ entry: TocEntry; score: number }> = [];

    for (const entry of toc.entries) {
      const titleLower = entry.title.toLowerCase();

      // Calculate relevance score
      let score = 0;

      // Exact match in title (highest score)
      if (titleLower === topicLower) {
        score = 100;
      }
      // Topic appears as a word in title (high score)
      else if (titleLower.includes(` ${topicLower} `) ||
               titleLower.startsWith(`${topicLower} `) ||
               titleLower.endsWith(` ${topicLower}`)) {
        score = 80;
      }
      // Topic appears anywhere in title (medium score)
      else if (titleLower.includes(topicLower)) {
        score = 60;
      }
      // Check for partial word matches (lower score)
      else {
        const topicWords = topicLower.split(/\s+/);
        const titleWords = titleLower.split(/\s+/);

        let matchingWords = 0;
        for (const topicWord of topicWords) {
          if (topicWord.length > 3) { // Only check words longer than 3 chars
            // Only match if title word contains topic word (not vice versa)
            // This prevents nonsense long strings from matching short title words
            if (titleWords.some(tw => tw.length >= topicWord.length && tw.includes(topicWord))) {
              matchingWords++;
            }
          }
        }

        if (matchingWords > 0) {
          score = Math.min(50, matchingWords * 20);
        }
      }

      if (score > 0) {
        matches.push({ entry, score });
      }
    }

    // Sort by score (highest first), then by order in TOC
    matches.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      // Maintain original TOC order for same scores
      return toc.entries.indexOf(a.entry) - toc.entries.indexOf(b.entry);
    });

    return matches.map(m => m.entry);
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
