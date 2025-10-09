/**
 * CCEL Catalog Scraper
 *
 * Scrapes CCEL's author and title index pages to discover ALL available works,
 * not just the curated list of 40 popular works.
 *
 * CCEL provides browse pages at:
 * - https://ccel.org/index/author/{letter} (A-Z)
 * - https://ccel.org/index/title/{letter} (A-Z)
 *
 * These pages list all works with author names, titles, and work IDs.
 */

import { Cache } from '../utils/cache.js';

export interface CatalogEntry {
  author: string;        // Author name (e.g., "John Calvin")
  lifespan?: string;     // Birth-death years (e.g., "1509-1564")
  title: string;         // Work title
  workId: string;        // Work identifier for CCEL API (e.g., "calvin/institutes")
}

export class CCELCatalogScraper {
  private readonly baseUrl = 'https://ccel.org';
  private cache: Cache<CatalogEntry[]>;

  constructor() {
    // Cache catalog entries for 5 minutes to avoid hammering CCEL
    this.cache = new Cache<CatalogEntry[]>(30, 5 * 60 * 1000); // 30 entries, 5 min TTL
  }

  /**
   * Scrape the author index page for a specific letter
   *
   * @param letter - Letter to scrape (a-z)
   * @returns Array of catalog entries
   *
   * @example
   * ```typescript
   * const entries = await scraper.scrapeAuthorIndex('c');
   * // Returns entries for Calvin, Chrysostom, etc.
   * ```
   */
  async scrapeAuthorIndex(letter: string): Promise<CatalogEntry[]> {
    const letterLower = letter.toLowerCase();
    const cacheKey = `catalog:author:${letterLower}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `${this.baseUrl}/index/author/${letterLower}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch author index: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const entries = this.parseAuthorIndexHtml(html);

      // Cache the results
      this.cache.set(cacheKey, entries);

      return entries;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Failed to scrape author index for letter ${letter}: ${error.message}`);
      }
      return [];
    }
  }

  /**
   * Scrape all author index pages (A-Z)
   *
   * @returns Array of all catalog entries
   */
  async scrapeAllAuthors(): Promise<CatalogEntry[]> {
    const cacheKey = 'catalog:author:all';

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const allEntries: CatalogEntry[] = [];

    // Scrape all letters in parallel (but with reasonable concurrency)
    const batchSize = 5; // Scrape 5 letters at a time to avoid overwhelming CCEL
    for (let i = 0; i < letters.length; i += batchSize) {
      const batch = letters.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(letter => this.scrapeAuthorIndex(letter))
      );

      for (const entries of results) {
        allEntries.push(...entries);
      }
    }

    // Cache the full catalog
    this.cache.set(cacheKey, allEntries);

    return allEntries;
  }

  /**
   * Search the catalog for works matching a query
   *
   * @param query - Search query (author name, work title, or keyword)
   * @returns Array of matching catalog entries, ranked by relevance
   *
   * @example
   * ```typescript
   * const results = await scraper.searchCatalog('calvin');
   * // Returns all works by Calvin
   *
   * const results = await scraper.searchCatalog('institutes');
   * // Returns works with "institutes" in the title
   * ```
   */
  async searchCatalog(query: string): Promise<CatalogEntry[]> {
    const queryLower = query.toLowerCase().trim();

    if (!queryLower) {
      return [];
    }

    // Try to determine if this is an author search or title search
    // If query has multiple words, search all letters
    // If query is short (<=2 chars), just search that letter
    let entries: CatalogEntry[] = [];

    if (queryLower.length <= 2) {
      // Single letter search
      entries = await this.scrapeAuthorIndex(queryLower[0]);
    } else {
      // Check if query looks like an author name (common pattern)
      // If it contains spaces, it's likely "First Last" - search by first letter of first word
      const firstLetter = queryLower[0];
      entries = await this.scrapeAuthorIndex(firstLetter);

      // If we don't find good matches in that letter, expand search
      const initialMatches = this.filterAndRankEntries(entries, queryLower);
      if (initialMatches.length < 3) {
        // Expand to all authors for better coverage
        entries = await this.scrapeAllAuthors();
      }
    }

    // Filter and rank entries by relevance
    return this.filterAndRankEntries(entries, queryLower);
  }

  /**
   * Filter and rank catalog entries by relevance to query
   */
  private filterAndRankEntries(entries: CatalogEntry[], query: string): CatalogEntry[] {
    const matches: Array<{ entry: CatalogEntry; score: number }> = [];

    for (const entry of entries) {
      const authorLower = entry.author.toLowerCase();
      const titleLower = entry.title.toLowerCase();
      let score = 0;

      // Author exact match (highest score)
      if (authorLower === query) {
        score = 1000;
      }
      // Author starts with query (high score)
      else if (authorLower.startsWith(query)) {
        score = 900;
      }
      // Author contains query as a word (high score)
      else if (authorLower.includes(` ${query} `) ||
               authorLower.startsWith(`${query} `) ||
               authorLower.endsWith(` ${query}`)) {
        score = 800;
      }
      // Author contains query anywhere (medium score)
      else if (authorLower.includes(query)) {
        score = 600;
      }

      // Title exact match (very high score)
      if (titleLower === query) {
        score = Math.max(score, 950);
      }
      // Title starts with query (high score)
      else if (titleLower.startsWith(query)) {
        score = Math.max(score, 700);
      }
      // Title contains query as a word (medium score)
      else if (titleLower.includes(` ${query} `) ||
               titleLower.startsWith(`${query} `) ||
               titleLower.endsWith(` ${query}`)) {
        score = Math.max(score, 500);
      }
      // Title contains query anywhere (lower score)
      else if (titleLower.includes(query)) {
        score = Math.max(score, 300);
      }

      // Multi-word query: check if all words appear
      const queryWords = query.split(/\s+/).filter(w => w.length > 2);
      if (queryWords.length > 1) {
        const matchingWords = queryWords.filter(word =>
          authorLower.includes(word) || titleLower.includes(word)
        );
        if (matchingWords.length === queryWords.length) {
          score = Math.max(score, 400);
        } else if (matchingWords.length > 0) {
          score = Math.max(score, 200);
        }
      }

      if (score > 0) {
        matches.push({ entry, score });
      }
    }

    // Sort by score (highest first)
    matches.sort((a, b) => b.score - a.score);

    return matches.map(m => m.entry);
  }

  /**
   * Parse HTML from author index page to extract catalog entries
   */
  private parseAuthorIndexHtml(html: string): CatalogEntry[] {
    const entries: CatalogEntry[] = [];

    try {
      // CCEL author index structure (as of 2025):
      // <h5><a href="/ccel/authorslug" title="...">Author, Name (lifespan)...</a></h5>
      // <div class="author_bookList" id="author_bookList_authorslug">
      //   <div id="works_of_authorslug">
      //     <div><a href="https://ccel.org/ccel/author/work">Work Title</a></div>
      //   </div>
      // </div>

      // Strategy: Extract all works_of_ divs separately, then match them to authors

      // Step 1: Extract author information from h5 headers
      // Match pattern: <a id="author_link_calvin">Calvin, John (1509-1564)...</a>
      const authorInfoMap = new Map<string, { name: string; lifespan?: string }>();
      const authorHeaderRegex = /<a\s+id="author_link_([^"]+)"[^>]*>\s*([^<]+?)\s*\(([^)]+)\)/gi;

      let authorMatch;
      while ((authorMatch = authorHeaderRegex.exec(html)) !== null) {
        const slug = authorMatch[1];
        const name = authorMatch[2].trim();
        const lifespan = authorMatch[3].trim();

        authorInfoMap.set(slug, { name, lifespan });
      }

      // Step 2: Find all works_of_ div positions and extract content between them
      const worksDivRegex = /<div[^>]*id="works_of_([^"]+)"[^>]*>/gi;

      // Collect all div positions first
      const divMatches: Array<{ slug: string; startPos: number }> = [];
      let worksMatch;
      while ((worksMatch = worksDivRegex.exec(html)) !== null) {
        divMatches.push({
          slug: worksMatch[1],
          startPos: worksMatch.index + worksMatch[0].length
        });
      }

      // Extract content for each works div
      for (let i = 0; i < divMatches.length; i++) {
        const authorSlug = divMatches[i].slug;
        const startPos = divMatches[i].startPos;

        // End position is either the next works_of_ div or a reasonable chunk (5000 chars)
        const endPos = i < divMatches.length - 1
          ? divMatches[i + 1].startPos
          : startPos + 10000;

        const worksHtml = html.substring(startPos, endPos);

        const authorInfo = authorInfoMap.get(authorSlug);
        if (!authorInfo) {
          continue; // Skip if we don't have author info
        }

        // Extract work links from this works section
        // Note: CCEL HTML has newlines between href= and the URL, so use \s* to match whitespace
        const workLinkRegex = /<a\s+href=\s*"https?:\/\/ccel\.org\/ccel\/([^"]+)"[^>]*>\s*([^<]+)<\/a>/gi;
        let workMatch;

        while ((workMatch = workLinkRegex.exec(worksHtml)) !== null) {
          const workId = workMatch[1];
          const title = workMatch[2]
            .trim()
            .replace(/&#039;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&nbsp;/g, ' ');

          // Skip author info links and navigation
          if (title.toLowerCase().includes('[author') ||
              title.toLowerCase().includes('info]') ||
              title.toLowerCase().includes('more info') ||
              workId === authorSlug || // Skip bare author page links
              workId.includes('/index') ||
              workId.includes('.toc')) {
            continue;
          }

          // Skip meta-works that are just indexes/hubs (not actual retrievable content)
          if (this.isMetaWork(workId, title)) {
            continue;
          }

          entries.push({
            author: authorInfo.name,
            lifespan: authorInfo.lifespan,
            title,
            workId
          });
        }
      }

    } catch (error) {
      console.error('Error parsing author index HTML:', error);
    }

    return entries;
  }

  /**
   * Check if a work is a meta-work (index/hub) rather than actual content
   */
  private isMetaWork(workId: string, title: string): boolean {
    // Calvin's "Commentaries—Complete" and "Commentaries" are just indexes
    // The actual commentaries are in calcom01-calcom45
    if (workId === 'calvin/commentaries' || workId === 'calvin/calcom') {
      return true;
    }

    // General patterns for meta-works
    const metaPatterns = [
      /complete$/i,           // "Commentaries—Complete"
      /\bcomplete\b.*commentar/i,  // "Complete Commentaries"
      /^commentaries$/i,      // Just "Commentaries" (bare title)
    ];

    for (const pattern of metaPatterns) {
      if (pattern.test(title)) {
        // Additional check: if it's a commentary collection, it's likely a meta-work
        // unless it's a specific volume (has "Volume" or "Vol" in title)
        if (!title.match(/volume|vol\.|vol\s+\d/i)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Clear all cached catalog data
   */
  clearCache(): void {
    this.cache.clear();
  }
}
