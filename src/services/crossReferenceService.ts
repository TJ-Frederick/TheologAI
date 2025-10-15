import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface CrossReference {
  reference: string;
  votes: number;
}

export interface CrossReferenceResult {
  references: CrossReference[];
  total: number;
  showing: number;
  hasMore: boolean;
}

export interface CrossReferenceOptions {
  maxResults?: number;
  minVotes?: number;
}

/**
 * Service for looking up Bible cross-references from OpenBible.info data
 * Data source: https://www.openbible.info/labs/cross-references/
 * License: CC-BY (requires attribution)
 */
export class CrossReferenceService {
  private crossRefsMap: Map<string, CrossReference[]> = new Map();
  private totalReferences = 0;

  constructor(dataPath?: string) {
    const filePath = dataPath || join(__dirname, '..', '..', 'data', 'cross-references', 'cross_references.txt');
    this.loadCrossReferences(filePath);
  }

  /**
   * Load and parse cross-reference data from TSV file
   */
  private loadCrossReferences(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split('\t');
        if (parts.length < 3) continue;

        const fromVerse = parts[0];
        const toVerse = parts[1];
        const votes = parseInt(parts[2], 10) || 0;

        // Normalize verse reference (e.g., "Gen.1.1" → "Genesis 1:1")
        const normalizedFrom = this.normalizeReference(fromVerse);
        const normalizedTo = this.normalizeReference(toVerse);

        // Add to map
        if (!this.crossRefsMap.has(normalizedFrom)) {
          this.crossRefsMap.set(normalizedFrom, []);
        }

        this.crossRefsMap.get(normalizedFrom)!.push({
          reference: normalizedTo,
          votes
        });

        this.totalReferences++;
      }

      // Sort all cross-reference arrays by votes (descending)
      for (const refs of this.crossRefsMap.values()) {
        refs.sort((a, b) => b.votes - a.votes);
      }

      console.error(`Loaded ${this.totalReferences} cross-references for ${this.crossRefsMap.size} verses`);
    } catch (error) {
      console.error('Error loading cross-references:', error);
      throw error;
    }
  }

  /**
   * Normalize verse reference format
   * Converts "Gen.1.1" or "Gen 1:1" → "Genesis 1:1"
   */
  private normalizeReference(ref: string): string {
    // Handle verse ranges (e.g., "Ps.148.4-Ps.148.5")
    if (ref.includes('-')) {
      const parts = ref.split('-');
      return parts.map(p => this.normalizeSingleReference(p.trim())).join('-');
    }

    return this.normalizeSingleReference(ref);
  }

  private normalizeSingleReference(ref: string): string {
    // Replace dots with spaces and colons
    let normalized = ref.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();

    // Convert book abbreviations to full names
    const bookMap: Record<string, string> = {
      'Gen': 'Genesis', 'Exod': 'Exodus', 'Lev': 'Leviticus', 'Num': 'Numbers', 'Deut': 'Deuteronomy',
      'Josh': 'Joshua', 'Judg': 'Judges', 'Ruth': 'Ruth', '1Sam': '1 Samuel', '2Sam': '2 Samuel',
      '1Kgs': '1 Kings', '2Kgs': '2 Kings', '1Chr': '1 Chronicles', '2Chr': '2 Chronicles',
      'Ezra': 'Ezra', 'Neh': 'Nehemiah', 'Esth': 'Esther', 'Job': 'Job', 'Ps': 'Psalms',
      'Prov': 'Proverbs', 'Eccl': 'Ecclesiastes', 'Song': 'Song of Solomon', 'Isa': 'Isaiah',
      'Jer': 'Jeremiah', 'Lam': 'Lamentations', 'Ezek': 'Ezekiel', 'Dan': 'Daniel',
      'Hos': 'Hosea', 'Joel': 'Joel', 'Amos': 'Amos', 'Obad': 'Obadiah', 'Jonah': 'Jonah',
      'Mic': 'Micah', 'Nah': 'Nahum', 'Hab': 'Habakkuk', 'Zeph': 'Zephaniah', 'Hag': 'Haggai',
      'Zech': 'Zechariah', 'Mal': 'Malachi',
      'Matt': 'Matthew', 'Mark': 'Mark', 'Luke': 'Luke', 'John': 'John', 'Acts': 'Acts',
      'Rom': 'Romans', '1Cor': '1 Corinthians', '2Cor': '2 Corinthians', 'Gal': 'Galatians',
      'Eph': 'Ephesians', 'Phil': 'Philippians', 'Col': 'Colossians', '1Thess': '1 Thessalonians',
      '2Thess': '2 Thessalonians', '1Tim': '1 Timothy', '2Tim': '2 Timothy', 'Titus': 'Titus',
      'Phlm': 'Philemon', 'Heb': 'Hebrews', 'Jas': 'James', '1Pet': '1 Peter', '2Pet': '2 Peter',
      '1John': '1 John', '2John': '2 John', '3John': '3 John', 'Jude': 'Jude', 'Rev': 'Revelation'
    };

    // Match book abbreviation at start
    for (const [abbr, full] of Object.entries(bookMap)) {
      if (normalized.startsWith(abbr + ' ')) {
        normalized = full + normalized.slice(abbr.length);
        break;
      }
    }

    // Ensure chapter:verse format (replace space before verse number with colon)
    // e.g., "Genesis 1 1" → "Genesis 1:1"
    const parts = normalized.split(' ');
    if (parts.length >= 3) {
      // Book name (may be multiple words) + chapter + verse
      const versePart = parts[parts.length - 1];
      const chapterPart = parts[parts.length - 2];
      const bookPart = parts.slice(0, -2).join(' ');
      normalized = `${bookPart} ${chapterPart}:${versePart}`;
    }

    return normalized;
  }

  /**
   * Get cross-references for a given verse
   */
  getCrossReferences(
    reference: string,
    options: CrossReferenceOptions = {}
  ): CrossReferenceResult {
    const { maxResults = 5, minVotes = 0 } = options;

    // Normalize the input reference
    const normalized = this.normalizeReference(reference);

    // Get cross-references for this verse
    const allRefs = this.crossRefsMap.get(normalized) || [];

    // Filter by minimum votes
    const filtered = allRefs.filter(ref => ref.votes >= minVotes);

    // Limit results
    const limited = filtered.slice(0, maxResults);

    return {
      references: limited,
      total: filtered.length,
      showing: limited.length,
      hasMore: filtered.length > maxResults
    };
  }

  /**
   * Get total number of cross-references loaded
   */
  getTotalCount(): number {
    return this.totalReferences;
  }

  /**
   * Check if a verse has cross-references
   */
  hasReferences(reference: string): boolean {
    const normalized = this.normalizeReference(reference);
    return this.crossRefsMap.has(normalized);
  }
}
