import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CrossReferenceService, CrossReference } from './crossReferenceService.js';
import { BibleService } from './bibleService.js';
import {
  ParallelPassageLookupParams,
  ParallelPassageResult,
  ParallelPassage,
  ParallelPassageAnalysis
} from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ParallelDatabase {
  description: string;
  version: string;
  parallels: Record<string, ParallelEntry>;
}

interface ParallelEntry {
  event: string;
  relationship: 'synoptic' | 'quotation' | 'allusion' | 'thematic';
  confidence: number;
  parallels: string[];
  notes: string;
  uniqueDetails: Record<string, string[]>;
}

/**
 * Service for discovering and analyzing parallel passages across Scripture.
 * Combines curated database with cross-reference data for comprehensive discovery.
 */
export class ParallelPassageService {
  private database: ParallelDatabase;
  private crossRefService: CrossReferenceService;
  private bibleService: BibleService;

  constructor(
    crossRefService?: CrossReferenceService,
    bibleService?: BibleService,
    databasePath?: string
  ) {
    this.crossRefService = crossRefService || new CrossReferenceService();
    this.bibleService = bibleService || new BibleService();

    const dbPath = databasePath || join(__dirname, '..', 'data', 'parallel-passages.json');
    this.database = JSON.parse(readFileSync(dbPath, 'utf-8'));

    console.error(`Loaded ${Object.keys(this.database.parallels).length} parallel passage entries (v${this.database.version})`);
  }

  /**
   * Find parallel passages for a given reference
   */
  async findParallels(params: ParallelPassageLookupParams): Promise<ParallelPassageResult> {
    const {
      reference,
      mode = 'auto',
      translation = 'ESV',
      showDifferences = true,
      useCrossReferences = true,
      maxParallels = 10
    } = params;

    // Smart default for includeText: false for long passages (>5 verses), true for short
    let includeText = params.includeText;
    if (includeText === undefined) {
      includeText = this.shouldIncludeTextByDefault(reference);
    }

    // Normalize the reference to database key format
    const normalizedKey = this.normalizeToKey(reference);

    // Step 1: Check curated database (with fuzzy matching for chapter-only refs)
    const curatedParallels = this.findCuratedParallels(normalizedKey, mode, reference);

    // Step 2: Augment with cross-references if enabled
    let augmentedParallels: ParallelPassage[] = [...curatedParallels];
    if (useCrossReferences) {
      const crossRefParallels = this.findCrossRefParallels(reference, mode, curatedParallels);
      augmentedParallels = this.mergeParallels(curatedParallels, crossRefParallels);
    }

    // Step 3: Limit results
    const limitedParallels = augmentedParallels.slice(0, maxParallels);

    // Step 4: Fetch text if requested
    let primaryText: string | undefined;
    let primaryContext: string | undefined;

    if (includeText) {
      try {
        const primaryResult = await this.bibleService.lookup({ reference, translation });
        primaryText = primaryResult.text;

        // Get context from database if available
        const dbEntry = this.database.parallels[normalizedKey];
        if (dbEntry) {
          primaryContext = dbEntry.event;
        }

        // Fetch text for each parallel
        for (const parallel of limitedParallels) {
          try {
            const result = await this.bibleService.lookup({
              reference: parallel.reference,
              translation
            });
            parallel.text = result.text;
            parallel.translation = translation;
          } catch (error) {
            console.error(`Failed to fetch text for ${parallel.reference}:`, error);
            parallel.text = undefined;
          }
        }

        // Add unique elements if requested
        if (showDifferences) {
          this.addUniqueElements(normalizedKey, reference, limitedParallels);
        }
      } catch (error) {
        console.error(`Failed to fetch primary text for ${reference}:`, error);
      }
    }

    // Step 5: Build analysis if we have text
    let analysis: ParallelPassageAnalysis | undefined;
    if (includeText && showDifferences && primaryText) {
      analysis = this.analyzeParallels(normalizedKey, limitedParallels);
    }

    // Step 6: Build result
    const result: ParallelPassageResult = {
      primary: {
        reference,
        text: primaryText,
        translation: includeText ? translation : undefined,
        context: primaryContext
      },
      parallels: limitedParallels,
      analysis,
      citation: {
        source: 'Parallel Passages Database v' + this.database.version,
        url: useCrossReferences ? 'Combined with OpenBible.info cross-references (CC-BY)' : undefined
      }
    };

    // Add suggested workflow if text not included
    if (!includeText) {
      result.suggestedWorkflow = 'Use bible_lookup tool to fetch verse text for detailed comparison';
    }

    return result;
  }

  /**
   * Find parallels from curated database
   * Supports fuzzy matching for chapter-only references (e.g., "Psalm 22" matches "Psalm 22:1")
   */
  private findCuratedParallels(normalizedKey: string, mode: string, originalReference: string): ParallelPassage[] {
    // First try exact match
    let entry = this.database.parallels[normalizedKey];

    // If no exact match and reference looks like chapter-only (e.g., "Psalm 22")
    if (!entry && this.isChapterOnlyReference(originalReference)) {
      // Try fuzzy match: find any entry that starts with this chapter
      const chapterPrefix = normalizedKey + '_';
      const matchingKeys = Object.keys(this.database.parallels).filter(key =>
        key.startsWith(chapterPrefix)
      );

      // If we found matches, use the first one (most likely the most significant verse)
      if (matchingKeys.length > 0) {
        entry = this.database.parallels[matchingKeys[0]];
        console.error(`Fuzzy matched "${originalReference}" to database entry: ${matchingKeys[0]}`);
      }
    }

    if (!entry) {
      return [];
    }

    // Filter by mode if specified
    if (mode !== 'auto' && entry.relationship !== mode) {
      return [];
    }

    // Convert database entries to ParallelPassage objects
    return entry.parallels.map(ref => ({
      reference: this.denormalizeReference(ref),
      relationship: entry.relationship,
      confidence: entry.confidence,
      notes: entry.event
    }));
  }

  /**
   * Check if reference is chapter-only (e.g., "Psalm 22", "John 3")
   * Returns true if no verse number is specified
   */
  private isChapterOnlyReference(reference: string): boolean {
    // Has chapter number but no colon (no verse)
    return /\d+$/.test(reference.trim());
  }

  /**
   * Find additional parallels using cross-reference data
   */
  private findCrossRefParallels(
    reference: string,
    mode: string,
    existingParallels: ParallelPassage[]
  ): ParallelPassage[] {
    // Get cross-references with high vote threshold
    const crossRefs = this.crossRefService.getCrossReferences(reference, {
      maxResults: 20,
      minVotes: 10
    });

    if (crossRefs.total === 0) {
      return [];
    }

    // Filter cross-refs that look like parallels
    const existingRefs = new Set(existingParallels.map(p => this.normalizeReference(p.reference)));

    return crossRefs.references
      .filter(ref => !existingRefs.has(this.normalizeReference(ref.reference)))
      .map(ref => this.crossRefToParallel(reference, ref, mode))
      .filter(p => p !== null) as ParallelPassage[];
  }

  /**
   * Convert cross-reference to parallel passage if it seems like a valid parallel
   */
  private crossRefToParallel(
    primaryRef: string,
    crossRef: CrossReference,
    mode: string
  ): ParallelPassage | null {
    const primaryBook = this.extractBook(primaryRef);
    const crossRefBook = this.extractBook(crossRef.reference);

    // Detect relationship type
    let relationship: ParallelPassage['relationship'];
    let confidence: number;

    // Check if it's a synoptic parallel
    const synopticGospels = ['matthew', 'mark', 'luke', 'john'];
    if (synopticGospels.includes(primaryBook.toLowerCase()) &&
        synopticGospels.includes(crossRefBook.toLowerCase()) &&
        primaryBook.toLowerCase() !== crossRefBook.toLowerCase()) {
      relationship = 'synoptic';
      confidence = Math.min(85, 50 + (crossRef.votes * 2)); // Scale by votes
    }
    // Check if it's OT -> NT quotation
    else if (this.isOldTestament(primaryBook) && this.isNewTestament(crossRefBook)) {
      relationship = 'quotation';
      confidence = Math.min(80, 50 + (crossRef.votes * 2));
    }
    // Check if it's NT -> OT allusion
    else if (this.isNewTestament(primaryBook) && this.isOldTestament(crossRefBook)) {
      relationship = 'allusion';
      confidence = Math.min(75, 50 + (crossRef.votes * 2));
    }
    // Otherwise thematic
    else {
      relationship = 'thematic';
      confidence = Math.min(70, 40 + (crossRef.votes * 2));
    }

    // Filter by mode if specified
    if (mode !== 'auto' && relationship !== mode) {
      return null;
    }

    // Require minimum confidence
    if (confidence < 50) {
      return null;
    }

    return {
      reference: crossRef.reference,
      relationship,
      confidence,
      notes: `Cross-reference (${crossRef.votes} votes)`
    };
  }

  /**
   * Merge curated and cross-reference parallels, removing duplicates
   */
  private mergeParallels(
    curated: ParallelPassage[],
    crossRef: ParallelPassage[]
  ): ParallelPassage[] {
    const merged = [...curated];
    const existingRefs = new Set(curated.map(p => this.normalizeReference(p.reference)));

    for (const parallel of crossRef) {
      const normalized = this.normalizeReference(parallel.reference);
      if (!existingRefs.has(normalized)) {
        merged.push(parallel);
        existingRefs.add(normalized);
      }
    }

    // Sort by confidence descending
    return merged.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Add unique elements from database to parallel passages
   */
  private addUniqueElements(
    normalizedKey: string,
    primaryRef: string,
    parallels: ParallelPassage[]
  ): void {
    const entry = this.database.parallels[normalizedKey];
    if (!entry || !entry.uniqueDetails) {
      return;
    }

    // Add unique elements to each parallel
    for (const parallel of parallels) {
      const book = this.extractBook(parallel.reference).toLowerCase();
      if (entry.uniqueDetails[book]) {
        parallel.uniqueElements = entry.uniqueDetails[book];
      }
    }
  }

  /**
   * Analyze parallels to find common elements and variations
   */
  private analyzeParallels(
    normalizedKey: string,
    parallels: ParallelPassage[]
  ): ParallelPassageAnalysis | undefined {
    const entry = this.database.parallels[normalizedKey];
    if (!entry || !entry.uniqueDetails) {
      return undefined;
    }

    // Extract all unique elements from all accounts
    const allUniqueElements = Object.values(entry.uniqueDetails).flat();

    // Common elements are those present in the event but not listed as unique to any account
    // This is a simplified heuristic - could be improved with NLP
    const commonElements: string[] = [];

    // For now, we'll derive common elements from the event description
    // In a more sophisticated implementation, we'd use text analysis
    const eventWords = entry.event.toLowerCase().split(/\s+/);
    const significantWords = eventWords.filter(w => w.length > 4);

    if (significantWords.length > 0) {
      commonElements.push(`Event: ${entry.event}`);
    }

    // Build variations record
    const variations: Record<string, string[]> = {};
    for (const [book, details] of Object.entries(entry.uniqueDetails)) {
      variations[book.charAt(0).toUpperCase() + book.slice(1)] = details;
    }

    return {
      commonElements,
      variations
    };
  }

  /**
   * Normalize reference to database key format (e.g., "Matthew 14:13-21" -> "matthew_14_13-21")
   */
  private normalizeToKey(reference: string): string {
    return reference
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/:/g, '_');
  }

  /**
   * Denormalize reference from database key (e.g., "matthew_14_13-21" -> "Matthew 14:13-21")
   */
  private denormalizeReference(key: string): string {
    const parts = key.split('_');
    const book = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);

    if (parts.length === 2) {
      return `${book} ${parts[1]}`;
    } else if (parts.length === 3) {
      return `${book} ${parts[1]}:${parts[2]}`;
    } else if (parts.length === 4 && parts[0].match(/^\d/)) {
      // Handle numbered books like "1 John"
      return `${parts[0]} ${parts[1].charAt(0).toUpperCase() + parts[1].slice(1)} ${parts[2]}:${parts[3]}`;
    }

    return key;
  }

  /**
   * Normalize reference for comparison (handles variations in formatting)
   */
  private normalizeReference(reference: string): string {
    return reference.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Extract book name from reference
   */
  private extractBook(reference: string): string {
    const match = reference.match(/^(\d?\s*[A-Za-z]+)/);
    return match ? match[1].trim() : reference;
  }

  /**
   * Check if book is in Old Testament
   */
  private isOldTestament(book: string): boolean {
    const otBooks = [
      'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy',
      'joshua', 'judges', 'ruth', '1 samuel', '2 samuel', '1 kings', '2 kings',
      '1 chronicles', '2 chronicles', 'ezra', 'nehemiah', 'esther',
      'job', 'psalm', 'psalms', 'proverbs', 'ecclesiastes', 'song of solomon',
      'isaiah', 'jeremiah', 'lamentations', 'ezekiel', 'daniel',
      'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah',
      'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi'
    ];
    return otBooks.includes(book.toLowerCase());
  }

  /**
   * Check if book is in New Testament
   */
  private isNewTestament(book: string): boolean {
    const ntBooks = [
      'matthew', 'mark', 'luke', 'john', 'acts',
      'romans', '1 corinthians', '2 corinthians', 'galatians',
      'ephesians', 'philippians', 'colossians',
      '1 thessalonians', '2 thessalonians',
      '1 timothy', '2 timothy', 'titus', 'philemon',
      'hebrews', 'james', '1 peter', '2 peter',
      '1 john', '2 john', '3 john', 'jude', 'revelation'
    ];
    return ntBooks.includes(book.toLowerCase());
  }

  /**
   * Determine if text should be included by default based on passage length
   * Long passages (>5 verses) default to metadata-only for brevity
   * Short passages (≤5 verses) default to including text
   */
  private shouldIncludeTextByDefault(reference: string): boolean {
    // Extract verse range from reference
    const match = reference.match(/(\d+):(\d+)(?:-(\d+))?/);
    if (!match) {
      // No verse range found (e.g., "Matthew 14"), default to metadata only
      return false;
    }

    const startVerse = parseInt(match[2], 10);
    const endVerse = match[3] ? parseInt(match[3], 10) : startVerse;
    const verseCount = endVerse - startVerse + 1;

    // Default to text only for short passages (≤5 verses)
    // For longer passages, require explicit includeText=true
    return verseCount <= 5;
  }
}
