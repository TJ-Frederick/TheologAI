/**
 * CCEL Table of Contents Parser
 *
 * Fetches and parses TOC pages to extract section identifiers and titles
 */

export interface TocEntry {
  sectionId: string;    // e.g., "institutes.iii.ii"
  title: string;        // e.g., "CHAPTER 1. - THE KNOWLEDGE OF GOD..."
  book?: number;        // Book number if applicable
  chapter?: number;     // Chapter number if applicable
  part?: number;        // Part number if applicable
  question?: number;    // Question number if applicable (e.g., Summa Theologica)
  article?: number;     // Article number if applicable (e.g., Summa Theologica)
  level: number;        // Nesting level (1 = book, 2 = chapter, etc.)
}

/**
 * Bible verse range parsed from TOC entry title
 * Used for Bible commentary sections
 */
export interface VerseRange {
  book: string;         // e.g., "1 Timothy", "John"
  chapter: number;      // Chapter number
  startVerse: number;   // Starting verse
  endVerse: number;     // Ending verse (same as startVerse for single verse)
}

export interface ParsedToc {
  work: string;
  entries: TocEntry[];
  fetchedAt: number;
}

export class CCELTocParser {
  private readonly baseUrl = 'https://ccel.org';

  /**
   * Fetch and parse the TOC for a work
   *
   * @param work - Work identifier (e.g., "calvin/institutes")
   * @returns Parsed TOC with all sections
   */
  async parseToc(work: string): Promise<ParsedToc> {
    const workName = work.split('/')[1];
    const url = `${this.baseUrl}/ccel/${work}/${workName}.toc.html`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch TOC: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const entries = this.extractTocEntries(html, workName);

      return {
        work,
        entries,
        fetchedAt: Date.now()
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse TOC for ${work}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Extract TOC entries from HTML
   */
  private extractTocEntries(html: string, workName: string): TocEntry[] {
    const entries: TocEntry[] = [];

    // Find all TOC links - pattern: <a class="TOC" href="filename.html" title="...">text</a>
    const linkPattern = /<a\s+class="TOC"\s+href="([^"]+)"\s+(?:title="([^"]*)")?>([^<]+)<\/a>/gi;
    const tocPattern = /<p class="TOC(\d+)">[\s\S]*?<a class="TOC" href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;

    let match;
    let currentBook: number | undefined;
    let currentPart: number | undefined;

    // Try the structured TOC pattern first
    while ((match = tocPattern.exec(html)) !== null) {
      const level = parseInt(match[1]);
      const href = match[2];
      const title = match[3].trim();

      // Extract section ID from href (remove .html)
      const sectionId = href.replace(/\.html$/, '');

      // Skip if it's just the toc itself, index pages, or prefatory material
      // Note: Use word boundaries to avoid filtering nested sections like "calcom43.iv.ii.iii"
      if (sectionId.endsWith('.toc') ||
          sectionId.includes('index') ||
          /^[^.]+\.ii($|\.)/.test(sectionId) || // Prefatory material at second level only (e.g., "work.ii" or "work.ii.x")
          title.toLowerCase().includes('table of') ||
          title.toLowerCase().includes('index of')) {
        continue;
      }

      const structureInfo = this.extractStructureInfo(title, level);

      // Track current book for inheriting to chapters
      if (structureInfo.book !== undefined) {
        currentBook = structureInfo.book;
      }

      // Track current part for inheriting to questions (for Summa structure)
      if (structureInfo.part !== undefined) {
        currentPart = structureInfo.part;
      }

      // If this is a chapter and we have a current book, inherit it
      if (structureInfo.chapter !== undefined && structureInfo.book === undefined && currentBook !== undefined) {
        structureInfo.book = currentBook;
      }

      // If this is a question and we have a current part, inherit it (for Summa structure)
      if (structureInfo.question !== undefined && structureInfo.part === undefined && currentPart !== undefined) {
        structureInfo.part = currentPart;
      }

      const entry: TocEntry = {
        sectionId,
        title,
        level,
        ...structureInfo
      };

      entries.push(entry);
    }

    // If no structured entries found, try simple link pattern
    if (entries.length === 0) {
      while ((match = linkPattern.exec(html)) !== null) {
        const href = match[1];
        const title = (match[2] || match[3] || '').trim();

        if (!title || href.endsWith('.toc.html')) {
          continue;
        }

        const sectionId = href.replace(/\.html$/, '');

        entries.push({
          sectionId,
          title,
          level: 1,
          ...this.extractStructureInfo(title, 1)
        });
      }
    }

    return entries;
  }

  /**
   * Extract book, chapter, part, question, article numbers from title
   */
  private extractStructureInfo(title: string, level: number): Partial<TocEntry> {
    const info: Partial<TocEntry> = {};

    // Match patterns like "BOOK FIRST", "Book 1", "BOOK I"
    const bookMatch = title.match(/\bBOOK\s+(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|I{1,3}V?|VI{0,3}|\d+)/i);
    if (bookMatch) {
      info.book = this.parseNumber(bookMatch[1]);
    }

    // Match patterns like "CHAPTER 1", "Chapter I", "Ch. 5"
    const chapterMatch = title.match(/\b(?:CHAPTER|Ch\.?)\s+(\d+|I{1,3}V?X?|VI{0,3}|XI{0,3})/i);
    if (chapterMatch) {
      info.chapter = this.parseNumber(chapterMatch[1]);
    }

    // Match patterns like "PART 1", "Part I", or "First Part"
    let partMatch = title.match(/\bPART\s+(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|I{1,3}V?|VI{0,3}|\d+)/i);
    if (!partMatch) {
      // Try reverse pattern: "First Part", "Second Part"
      partMatch = title.match(/\b(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|I{1,3}V?|VI{0,3}|\d+)\s+PART/i);
    }
    if (partMatch) {
      info.part = this.parseNumber(partMatch[1]);
    }

    // Match patterns like "Question. 1", "Question 2" (for Summa Theologica)
    const questionMatch = title.match(/\bQUESTION\.?\s+(\d+|I{1,3}V?X?|VI{0,3})/i);
    if (questionMatch) {
      info.question = this.parseNumber(questionMatch[1]);
    }

    // Match patterns like "Article. 1", "Article 2" (for Summa Theologica)
    const articleMatch = title.match(/\bARTICLE\.?\s+(\d+|I{1,3}V?X?|VI{0,3})/i);
    if (articleMatch) {
      info.article = this.parseNumber(articleMatch[1]);
    }

    return info;
  }

  /**
   * Convert number word/roman numeral to number
   */
  private parseNumber(str: string): number {
    // Try parsing as regular number first
    const num = parseInt(str);
    if (!isNaN(num)) {
      return num;
    }

    // Roman numerals
    const romanMap: Record<string, number> = {
      'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
      'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10,
      'XI': 11, 'XII': 12, 'XIII': 13, 'XIV': 14, 'XV': 15
    };

    if (romanMap[str.toUpperCase()]) {
      return romanMap[str.toUpperCase()];
    }

    // Word numbers
    const wordMap: Record<string, number> = {
      'FIRST': 1, 'SECOND': 2, 'THIRD': 3, 'FOURTH': 4,
      'FIFTH': 5, 'SIXTH': 6, 'SEVENTH': 7, 'EIGHTH': 8
    };

    return wordMap[str.toUpperCase()] || 1;
  }

  /**
   * Search TOC entries by query
   *
   * @param entries - TOC entries to search
   * @param query - Search query (e.g., "Book 1 Chapter 1", "Introduction")
   * @returns Best matching entry or undefined
   */
  searchToc(entries: TocEntry[], query: string): TocEntry | undefined {
    const queryLower = query.toLowerCase();

    // Try structured search FIRST: "Book X Chapter Y" or "Part X Question Y"
    // This ensures queries like "Part 1 Question 2" use structured matching
    const structuredMatch = this.parseStructuredQuery(query);
    if (structuredMatch) {
      const { book, chapter, part, question, article } = structuredMatch;

      // Find all matches - require exact matches for all specified criteria
      const matches = entries.filter(e => {
        // If book is specified in query, entry must have that book number
        if (book !== undefined) {
          if (e.book !== book) return false;
        }

        // If chapter is specified in query, entry MUST have that chapter
        if (chapter !== undefined) {
          if (e.chapter !== chapter) return false;
        }

        // If part is specified in query, entry must have that part
        if (part !== undefined) {
          if (e.part !== part) return false;
        }

        // If question is specified in query, entry MUST have that question
        if (question !== undefined) {
          if (e.question !== question) return false;
        }

        // If article is specified in query, entry MUST have that article
        if (article !== undefined) {
          if (e.article !== article) return false;
        }

        // If query specifies chapter but entry doesn't have one, skip it
        if (chapter !== undefined && e.chapter === undefined) {
          return false;
        }

        // If query specifies question but entry doesn't have one, skip it
        if (question !== undefined && e.question === undefined) {
          return false;
        }

        // If query specifies article but entry doesn't have one, skip it
        if (article !== undefined && e.article === undefined) {
          return false;
        }

        return true;
      });

      if (matches.length > 0) {
        // Prefer more specific matches (with chapter/question/article) over general ones (just book/part)
        if (chapter !== undefined) {
          const chapterMatch = matches.find(m => m.chapter === chapter);
          if (chapterMatch) return chapterMatch;
        }

        if (question !== undefined) {
          const questionMatch = matches.find(m => m.question === question);
          if (questionMatch) return questionMatch;
        }

        if (article !== undefined) {
          const articleMatch = matches.find(m => m.article === article);
          if (articleMatch) return articleMatch;
        }

        // Return first match
        return matches[0];
      }
    }

    // Try exact title match (after structured search to prioritize structured queries)
    const exactMatch = entries.find(e =>
      e.title.toLowerCase().includes(queryLower)
    );
    if (exactMatch) {
      return exactMatch;
    }

    // Try keyword search in title
    const keywords = queryLower.split(/\s+/).filter(w => w.length > 3);
    if (keywords.length > 0) {
      const keywordMatch = entries.find(e =>
        keywords.some(keyword => e.title.toLowerCase().includes(keyword))
      );
      if (keywordMatch) {
        return keywordMatch;
      }
    }

    // If nothing found, return first entry (often introduction)
    return entries[0];
  }

  /**
   * Parse structured query like "Book 1 Chapter 2" or "Part 1 Question 2"
   */
  private parseStructuredQuery(query: string): { book?: number; chapter?: number; part?: number; question?: number; article?: number } | null {
    const result: { book?: number; chapter?: number; part?: number; question?: number; article?: number } = {};

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

    // Question pattern (for Summa Theologica)
    const questionMatch = query.match(/\bquestion\.?\s+(\d+|i{1,3}v?x?)/i);
    if (questionMatch) {
      result.question = this.parseNumber(questionMatch[1]);
    }

    // Article pattern (for Summa Theologica)
    const articleMatch = query.match(/\barticle\.?\s+(\d+|i{1,3}v?x?)/i);
    if (articleMatch) {
      result.article = this.parseNumber(articleMatch[1]);
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  /**
   * Find multiple possible matches
   */
  findMatches(entries: TocEntry[], query: string, limit: number = 5): TocEntry[] {
    const matches: TocEntry[] = [];
    const queryLower = query.toLowerCase();

    // Try exact and partial matches
    for (const entry of entries) {
      if (entry.title.toLowerCase().includes(queryLower)) {
        matches.push(entry);
        if (matches.length >= limit) break;
      }
    }

    return matches;
  }

  /**
   * Parse Bible verse range from TOC entry title
   * Examples:
   * - "1 Timothy 2:11-15" -> { book: "1 Timothy", chapter: 2, startVerse: 11, endVerse: 15 }
   * - "John 3:16" -> { book: "John", chapter: 3, startVerse: 16, endVerse: 16 }
   * - "Introduction" -> null
   *
   * @param title - TOC entry title
   * @returns Parsed verse range or null if not a Bible verse reference
   */
  parseVerseRangeFromTitle(title: string): VerseRange | null {
    // Pattern: [Number] Book Chapter:Verse[-EndVerse]
    // Matches: "1 Timothy 2:11-15", "John 3:16", "2 Corinthians 5:17-21"
    const versePattern = /^([1-3]?\s*[A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+):(\d+)(?:-(\d+))?/;
    const match = title.match(versePattern);

    if (!match) {
      return null;
    }

    const [, book, chapter, startVerse, endVerse] = match;

    return {
      book: book.trim(),
      chapter: parseInt(chapter, 10),
      startVerse: parseInt(startVerse, 10),
      endVerse: endVerse ? parseInt(endVerse, 10) : parseInt(startVerse, 10)
    };
  }
}
