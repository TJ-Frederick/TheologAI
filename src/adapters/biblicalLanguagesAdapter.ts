/**
 * Biblical Languages Adapter
 *
 * Loads and provides access to Strong's Concordance data for Greek and Hebrew.
 * Follows the same pattern as LocalDataAdapter.ts for consistency.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';
import type {
  BookData,
  VerseData,
  StepBibleIndex,
  StepBibleMetadata,
  EnhancedStrongsResult
} from '../types/index.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface StrongsEntry {
  lemma: string;           // Greek/Hebrew word
  translit?: string;       // Transliteration
  pronunciation?: string;  // Pronunciation guide
  def: string;             // Definition
  derivation?: string;     // Word derivation/etymology
}

export interface StrongsMetadata {
  version: string;
  source: string;
  source_url: string;
  license: string;
  attribution: string;
  build_date: string;
  entries: {
    greek: number;
    hebrew: number;
    total: number;
  };
}

export class BiblicalLanguagesAdapter {
  private greekCache: Map<string, StrongsEntry> = new Map();
  private hebrewCache: Map<string, StrongsEntry> = new Map();
  private metadata: StrongsMetadata | null = null;
  private dataPath: string;
  private initialized: boolean = false;

  // STEPBible lexicon data structures
  private stepbibleLexiconPath: string;
  private stepbibleGreekLexicon: Map<string, any> = new Map();
  private stepbibleHebrewLexicon: Map<string, any> = new Map();
  private stepbibleLexiconInitialized: boolean = false;

  // STEPBible morphology data structures
  private stepbiblePath: string;
  private stepbibleIndex: StepBibleIndex | null = null;
  private stepbibleCache: Map<string, BookData> = new Map();
  private stepbibleMetadata: StepBibleMetadata | null = null;
  private morphExpansions: Record<string, string> = {};
  private stepbibleInitialized: boolean = false;
  private readonly MAX_CACHE_SIZE = 10; // LRU cache max books

  constructor(dataPath?: string) {
    if (dataPath) {
      this.dataPath = dataPath;
      this.stepbiblePath = join(dataPath, 'stepbible');
      this.stepbibleLexiconPath = join(dataPath, 'stepbible-lexicons');
    } else {
      // Use path relative to this file: src/adapters/../.. = project root
      this.dataPath = join(__dirname, '..', '..', 'data', 'biblical-languages');
      this.stepbiblePath = join(this.dataPath, 'stepbible');
      this.stepbibleLexiconPath = join(this.dataPath, 'stepbible-lexicons');
    }
  }

  /**
   * Load Strong's data from JSON files into memory
   */
  private loadData(): void {
    if (this.initialized) return;

    try {
      console.error(`Loading Strong's Concordance data from: ${this.dataPath}`);

      // Load Greek dictionary
      try {
        const greekPath = join(this.dataPath, 'strongs-greek.json');
        const greekContent = readFileSync(greekPath, 'utf-8');
        const greekData = JSON.parse(greekContent);

        for (const [key, value] of Object.entries(greekData)) {
          this.greekCache.set(key, value as StrongsEntry);
        }

        console.error(`✓ Loaded ${this.greekCache.size} Greek Strong's entries`);
      } catch (err) {
        console.error(`Error loading Greek Strong's dictionary: ${err}`);
      }

      // Load Hebrew dictionary
      try {
        const hebrewPath = join(this.dataPath, 'strongs-hebrew.json');
        const hebrewContent = readFileSync(hebrewPath, 'utf-8');
        const hebrewData = JSON.parse(hebrewContent);

        for (const [key, value] of Object.entries(hebrewData)) {
          this.hebrewCache.set(key, value as StrongsEntry);
        }

        console.error(`✓ Loaded ${this.hebrewCache.size} Hebrew Strong's entries`);
      } catch (err) {
        console.error(`Error loading Hebrew Strong's dictionary: ${err}`);
      }

      // Load metadata
      try {
        const metadataPath = join(this.dataPath, 'strongs-metadata.json');
        const metadataContent = readFileSync(metadataPath, 'utf-8');
        this.metadata = JSON.parse(metadataContent);
      } catch (err) {
        console.error(`Error loading metadata: ${err}`);
      }

      this.initialized = true;
      console.error(`✓ Biblical Languages adapter initialized successfully`);
    } catch (error) {
      console.error('Error loading Strong\'s Concordance data:', error);
      throw new Error('Failed to load Strong\'s Concordance data. Run "npm run build:strongs" to generate the data files.');
    }
  }

  /**
   * Load STEPBible lexicons (TBESG for Greek, TBESH for Hebrew)
   * These provide enhanced definitions from Abbott-Smith and abridged BDB
   */
  private loadStepBibleLexicons(): void {
    if (this.stepbibleLexiconInitialized) return;

    try {
      console.error(`Loading STEPBible lexicons from: ${this.stepbibleLexiconPath}`);

      // Load Greek lexicon (TBESG)
      const greekPath = join(this.stepbibleLexiconPath, 'tbesg-greek.json');
      if (existsSync(greekPath)) {
        const greekContent = readFileSync(greekPath, 'utf-8');
        const greekData = JSON.parse(greekContent);
        this.stepbibleGreekLexicon = new Map(Object.entries(greekData));
        console.error(`✓ Loaded ${this.stepbibleGreekLexicon.size} Greek lexicon entries (Abbott-Smith)`);
      } else {
        console.error(`⚠ STEPBible Greek lexicon not found at: ${greekPath}`);
      }

      // Load Hebrew lexicon (TBESH)
      const hebrewPath = join(this.stepbibleLexiconPath, 'tbesh-hebrew.json');
      if (existsSync(hebrewPath)) {
        const hebrewContent = readFileSync(hebrewPath, 'utf-8');
        const hebrewData = JSON.parse(hebrewContent);
        this.stepbibleHebrewLexicon = new Map(Object.entries(hebrewData));
        console.error(`✓ Loaded ${this.stepbibleHebrewLexicon.size} Hebrew lexicon entries (abridged BDB)`);
      } else {
        console.error(`⚠ STEPBible Hebrew lexicon not found at: ${hebrewPath}`);
      }

      this.stepbibleLexiconInitialized = true;
    } catch (error) {
      console.error('Error loading STEPBible lexicons:', error);
      console.error('Falling back to basic Strong\'s definitions');
      this.stepbibleLexiconInitialized = true; // Don't try again
    }
  }

  /**
   * Look up a Strong's number
   * Preferentially uses STEPBible lexicons (Abbott-Smith/BDB), falls back to basic Strong's
   *
   * @param strongsNumber Strong's number (e.g., "G25", "H430")
   * @returns StrongsEntry or undefined if not found
   */
  lookupStrongs(strongsNumber: string): StrongsEntry | undefined {
    // Ensure data is loaded
    if (!this.initialized) {
      this.loadData();
    }
    if (!this.stepbibleLexiconInitialized) {
      this.loadStepBibleLexicons();
    }

    // Normalize input: ensure uppercase, remove whitespace
    const normalized = strongsNumber.toUpperCase().trim();

    // Validate format
    if (!/^[GH]\d+[a-z]?$/.test(normalized)) {
      throw new Error(`Invalid Strong's number format: ${strongsNumber}. Expected format: G#### or H####`);
    }

    // Remove letter suffixes for lookup (G0025a -> G0025)
    const baseNumber = normalized.replace(/[a-z]$/, '');

    // Pad with zeros for STEPBible lookup (G25 -> G0025, H430 -> H0430)
    const paddedNumber = baseNumber.replace(/^([GH])(\d+)$/, (match, prefix, num) => {
      return prefix + num.padStart(4, '0');
    });

    // Try STEPBible lexicons first (enhanced definitions)
    let stepbibleEntry;
    if (paddedNumber.startsWith('G')) {
      stepbibleEntry = this.stepbibleGreekLexicon.get(paddedNumber);
    } else {
      stepbibleEntry = this.stepbibleHebrewLexicon.get(paddedNumber);
    }

    // If found in STEPBible lexicon, convert to StrongsEntry format
    if (stepbibleEntry) {
      return {
        lemma: stepbibleEntry.lemma,
        translit: stepbibleEntry.translit,
        pronunciation: stepbibleEntry.gloss, // Use gloss as brief pronunciation guide
        def: stepbibleEntry.definition, // Full definition from Abbott-Smith/BDB
        derivation: stepbibleEntry.source ? `Source: ${stepbibleEntry.source}` : undefined
      };
    }

    // Fallback to basic Strong's data
    if (baseNumber.startsWith('G')) {
      return this.greekCache.get(baseNumber);
    } else {
      return this.hebrewCache.get(baseNumber);
    }
  }

  /**
   * Search by lemma (Greek or Hebrew word)
   *
   * @param lemma Word to search for
   * @param testament 'OT' for Hebrew, 'NT' for Greek, or 'both'
   * @param limit Maximum number of results
   * @returns Array of matching entries with their Strong's numbers
   */
  searchByLemma(
    lemma: string,
    testament: 'OT' | 'NT' | 'both' = 'both',
    limit: number = 10
  ): Array<{ strongsNumber: string; entry: StrongsEntry }> {
    if (!this.initialized) {
      this.loadData();
    }

    const results: Array<{ strongsNumber: string; entry: StrongsEntry }> = [];
    const searchTerm = lemma.toLowerCase();

    // Search Greek
    if (testament === 'NT' || testament === 'both') {
      for (const [key, entry] of this.greekCache) {
        if (entry.lemma.toLowerCase().includes(searchTerm) ||
            entry.translit?.toLowerCase().includes(searchTerm)) {
          results.push({ strongsNumber: key, entry });
          if (results.length >= limit) break;
        }
      }
    }

    // Search Hebrew
    if (testament === 'OT' || testament === 'both') {
      for (const [key, entry] of this.hebrewCache) {
        if (entry.lemma.toLowerCase().includes(searchTerm) ||
            entry.translit?.toLowerCase().includes(searchTerm)) {
          results.push({ strongsNumber: key, entry });
          if (results.length >= limit) break;
        }
      }
    }

    return results;
  }

  /**
   * Get metadata about the Strong's database
   */
  getMetadata(): StrongsMetadata | null {
    if (!this.initialized) {
      this.loadData();
    }
    return this.metadata;
  }

  /**
   * Get statistics about loaded data
   */
  getStats(): { greek: number; hebrew: number; total: number } {
    if (!this.initialized) {
      this.loadData();
    }

    return {
      greek: this.greekCache.size,
      hebrew: this.hebrewCache.size,
      total: this.greekCache.size + this.hebrewCache.size
    };
  }

  /**
   * Check if the adapter is initialized and ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // STEPBible Enhanced Features
  // ============================================================================

  /**
   * Load STEPBible index file (lazy initialization)
   */
  private loadStepBibleIndex(): void {
    if (this.stepbibleInitialized) return;

    try {
      const indexPath = join(this.stepbiblePath, 'index.json');

      if (!existsSync(indexPath)) {
        console.error('STEPBible data not found. Run "npm run build:stepbible" to generate it.');
        this.stepbibleInitialized = true;
        return;
      }

      const indexContent = readFileSync(indexPath, 'utf-8');
      this.stepbibleIndex = JSON.parse(indexContent);

      // Load metadata
      const metadataPath = join(this.stepbiblePath, 'stepbible-metadata.json');
      if (existsSync(metadataPath)) {
        const metadataContent = readFileSync(metadataPath, 'utf-8');
        this.stepbibleMetadata = JSON.parse(metadataContent);
      }

      // Load morphology expansions
      const morphPath = join(this.stepbiblePath, 'morph-codes.json');
      if (existsSync(morphPath)) {
        const morphContent = readFileSync(morphPath, 'utf-8');
        this.morphExpansions = JSON.parse(morphContent);
      }

      this.stepbibleInitialized = true;
      console.error(`✓ STEPBible index loaded (${Object.keys(this.stepbibleIndex?.books || {}).length} books available)`);
    } catch (error) {
      console.error('Error loading STEPBible index:', error);
      this.stepbibleInitialized = true; // Mark as initialized even on error to prevent repeated attempts
    }
  }

  /**
   * Get STEPBible index
   */
  getStepBibleIndex(): StepBibleIndex | undefined {
    if (!this.stepbibleInitialized) {
      this.loadStepBibleIndex();
    }
    return this.stepbibleIndex || undefined;
  }

  /**
   * Load a book's data from STEPBible (with gzip decompression)
   */
  loadBook(bookName: string): BookData | undefined {
    if (!this.stepbibleInitialized) {
      this.loadStepBibleIndex();
    }

    if (!this.stepbibleIndex) {
      return undefined;
    }

    // Check cache first
    if (this.stepbibleCache.has(bookName)) {
      return this.stepbibleCache.get(bookName)!;
    }

    // Get book info from index
    const bookInfo = this.stepbibleIndex.books[bookName];
    if (!bookInfo) {
      return undefined;
    }

    try {
      const bookPath = join(this.stepbiblePath, bookInfo.file);
      if (!existsSync(bookPath)) {
        return undefined;
      }

      // Read and decompress
      const compressed = readFileSync(bookPath);
      const decompressed = gunzipSync(compressed);
      const bookData: BookData = JSON.parse(decompressed.toString('utf-8'));

      // Add to cache with LRU eviction
      this.stepbibleCache.set(bookName, bookData);

      // Implement simple LRU: if cache exceeds max size, remove oldest
      if (this.stepbibleCache.size > this.MAX_CACHE_SIZE) {
        const firstKey = this.stepbibleCache.keys().next().value;
        if (firstKey) {
          this.stepbibleCache.delete(firstKey);
        }
      }

      return bookData;
    } catch (error) {
      console.error(`Error loading book ${bookName}:`, error);
      return undefined;
    }
  }

  /**
   * Parse Bible reference to book, chapter, verse
   */
  private parseReference(reference: string): { book: string; chapter: string; verse: string } | null {
    // Normalize: trim, handle different separators
    const normalized = reference.trim().replace(/\s+/g, ' ');

    // Try formats: "John 3:16", "Jn 3:16", "John 3.16"
    const match = normalized.match(/^([1-3]?\s?[A-Za-z]+)[\s.]+(\d+)[:.]+(\d+)$/);
    if (!match) {
      return null;
    }

    const bookAbbr = match[1].trim();
    const chapter = match[2];
    const verse = match[3];

    // Map common abbreviations to full book names (66 books: 39 OT + 27 NT)
    const bookMap: Record<string, string> = {
      // Old Testament (39 books)
      'gen': 'Genesis', 'genesis': 'Genesis',
      'exo': 'Exodus', 'exod': 'Exodus', 'exodus': 'Exodus',
      'lev': 'Leviticus', 'leviticus': 'Leviticus',
      'num': 'Numbers', 'numb': 'Numbers', 'numbers': 'Numbers',
      'deu': 'Deuteronomy', 'deut': 'Deuteronomy', 'deuteronomy': 'Deuteronomy',
      'jos': 'Joshua', 'josh': 'Joshua', 'joshua': 'Joshua',
      'jdg': 'Judges', 'judg': 'Judges', 'judges': 'Judges',
      'rut': 'Ruth', 'ruth': 'Ruth',
      '1sa': '1Samuel', '1sam': '1Samuel', '1samuel': '1Samuel',
      '2sa': '2Samuel', '2sam': '2Samuel', '2samuel': '2Samuel',
      '1ki': '1Kings', '1kin': '1Kings', '1kings': '1Kings',
      '2ki': '2Kings', '2kin': '2Kings', '2kings': '2Kings',
      '1ch': '1Chronicles', '1chr': '1Chronicles', '1chronicles': '1Chronicles',
      '2ch': '2Chronicles', '2chr': '2Chronicles', '2chronicles': '2Chronicles',
      'ezr': 'Ezra', 'ezra': 'Ezra',
      'neh': 'Nehemiah', 'nehemiah': 'Nehemiah',
      'est': 'Esther', 'esth': 'Esther', 'esther': 'Esther',
      'job': 'Job',
      'psa': 'Psalms', 'ps': 'Psalms', 'psalm': 'Psalms', 'psalms': 'Psalms',
      'pro': 'Proverbs', 'prov': 'Proverbs', 'proverbs': 'Proverbs',
      'ecc': 'Ecclesiastes', 'eccl': 'Ecclesiastes', 'ecclesiastes': 'Ecclesiastes',
      'son': 'SongOfSolomon', 'song': 'SongOfSolomon', 'songofsolomon': 'SongOfSolomon', 'sos': 'SongOfSolomon',
      'isa': 'Isaiah', 'isaiah': 'Isaiah',
      'jer': 'Jeremiah', 'jeremiah': 'Jeremiah',
      'lam': 'Lamentations', 'lamentations': 'Lamentations',
      'eze': 'Ezekiel', 'ezek': 'Ezekiel', 'ezekiel': 'Ezekiel',
      'dan': 'Daniel', 'daniel': 'Daniel',
      'hos': 'Hosea', 'hosea': 'Hosea',
      'joe': 'Joel', 'joel': 'Joel',
      'amo': 'Amos', 'amos': 'Amos',
      'oba': 'Obadiah', 'obad': 'Obadiah', 'obadiah': 'Obadiah',
      'jon': 'Jonah', 'jonah': 'Jonah',
      'mic': 'Micah', 'micah': 'Micah',
      'nah': 'Nahum', 'nahum': 'Nahum',
      'hab': 'Habakkuk', 'habakkuk': 'Habakkuk',
      'zep': 'Zephaniah', 'zeph': 'Zephaniah', 'zephaniah': 'Zephaniah',
      'hag': 'Haggai', 'haggai': 'Haggai',
      'zec': 'Zechariah', 'zech': 'Zechariah', 'zechariah': 'Zechariah',
      'mal': 'Malachi', 'malachi': 'Malachi',

      // New Testament (27 books)
      'mt': 'Matthew', 'mat': 'Matthew', 'matt': 'Matthew', 'matthew': 'Matthew',
      'mk': 'Mark', 'mrk': 'Mark', 'mark': 'Mark',
      'lk': 'Luke', 'luk': 'Luke', 'luke': 'Luke',
      'jn': 'John', 'john': 'John',
      'acts': 'Acts',
      'rom': 'Romans', 'romans': 'Romans',
      '1co': '1Corinthians', '1cor': '1Corinthians', '1corinthians': '1Corinthians',
      '2co': '2Corinthians', '2cor': '2Corinthians', '2corinthians': '2Corinthians',
      'gal': 'Galatians', 'galatians': 'Galatians',
      'eph': 'Ephesians', 'ephesians': 'Ephesians',
      'php': 'Philippians', 'phil': 'Philippians', 'philippians': 'Philippians',
      'col': 'Colossians', 'colossians': 'Colossians',
      '1th': '1Thessalonians', '1thess': '1Thessalonians', '1thessalonians': '1Thessalonians',
      '2th': '2Thessalonians', '2thess': '2Thessalonians', '2thessalonians': '2Thessalonians',
      '1ti': '1Timothy', '1tim': '1Timothy', '1timothy': '1Timothy',
      '2ti': '2Timothy', '2tim': '2Timothy', '2timothy': '2Timothy',
      'tit': 'Titus', 'titus': 'Titus',
      'phm': 'Philemon', 'philemon': 'Philemon',
      'heb': 'Hebrews', 'hebrews': 'Hebrews',
      'jas': 'James', 'james': 'James',
      '1pe': '1Peter', '1pet': '1Peter', '1peter': '1Peter',
      '2pe': '2Peter', '2pet': '2Peter', '2peter': '2Peter',
      '1jn': '1John', '1john': '1John',
      '2jn': '2John', '2john': '2John',
      '3jn': '3John', '3john': '3John',
      'jud': 'Jude', 'jude': 'Jude',
      'rev': 'Revelation', 'revelation': 'Revelation'
    };

    const book = bookMap[bookAbbr.toLowerCase().replace(/\s+/g, '')];
    if (!book) {
      return null;
    }

    return { book, chapter, verse };
  }

  /**
   * Get verse data with morphology
   */
  getVerseWithMorphology(reference: string): VerseData | undefined {
    const parsed = this.parseReference(reference);
    if (!parsed) {
      return undefined;
    }

    const bookData = this.loadBook(parsed.book);
    if (!bookData) {
      return undefined;
    }

    const chapter = bookData.chapters[parsed.chapter];
    if (!chapter) {
      return undefined;
    }

    return chapter[parsed.verse];
  }

  /**
   * Expand morphology code to human-readable form
   * Handles both Greek (e.g., "V-AAI-3S") and Hebrew (e.g., "HVqp3ms") codes
   */
  expandMorphology(code: string): string | undefined {
    if (!this.stepbibleInitialized) {
      this.loadStepBibleIndex();
    }

    // Check if it's in the loaded expansions (Greek codes)
    if (this.morphExpansions[code]) {
      return this.morphExpansions[code];
    }

    // Handle Hebrew morphology codes (format: HVqp3ms, HNcfsa, etc.)
    if (code.startsWith('H')) {
      return this.expandHebrewMorphology(code);
    }

    return undefined;
  }

  /**
   * Expand Hebrew morphology codes
   * Format: H + part of speech + detailed grammar
   * Examples: HVqp3ms = Hebrew Verb qal perfect 3ms
   *           HNcfsa = Hebrew Noun common feminine singular absolute
   */
  private expandHebrewMorphology(code: string): string | undefined {
    if (code.length < 2) return undefined;

    const parts: string[] = ['Hebrew'];
    let pos = 1; // Start after 'H'

    // Part of speech (2nd character)
    const partOfSpeech = code[pos++];
    switch (partOfSpeech) {
      case 'V': parts.push('Verb'); break;
      case 'N': parts.push('Noun'); break;
      case 'A': parts.push('Adjective'); break;
      case 'R': parts.push('Preposition'); break;
      case 'C': parts.push('Conjunction'); break;
      case 'D': parts.push('Adverb'); break;
      case 'T': parts.push('Particle'); break;
      case 'P': parts.push('Pronoun'); break;
      case 'S': parts.push('Suffix'); break;
      default: return undefined;
    }

    // Process remaining characters based on part of speech
    if (partOfSpeech === 'V' && pos < code.length) {
      // Verb stem (qal, niphal, piel, etc.)
      const stem = code[pos++];
      switch (stem) {
        case 'q': parts.push('Qal'); break;
        case 'N': parts.push('Niphal'); break;
        case 'p': parts.push('Piel'); break;
        case 'P': parts.push('Pual'); break;
        case 'h': parts.push('Hiphil'); break;
        case 'H': parts.push('Hophal'); break;
        case 't': parts.push('Hithpael'); break;
      }

      // Verb form
      if (pos < code.length) {
        const form = code[pos++];
        switch (form) {
          case 'p': parts.push('Perfect'); break;
          case 'i': parts.push('Imperfect'); break;
          case 'w': parts.push('Waw-consecutive'); break;
          case 'v': parts.push('Imperative'); break;
          case 'j': parts.push('Jussive'); break;
          case 'c': parts.push('Cohortative'); break;
          case 'a': parts.push('Infinitive absolute'); break;
          case 'r': parts.push('Participle'); break;
        }
      }

      // Person/Gender/Number
      if (pos < code.length) {
        const pgn = code.substring(pos);
        const person = pgn[0];
        if (person === '1') parts.push('1st person');
        else if (person === '2') parts.push('2nd person');
        else if (person === '3') parts.push('3rd person');

        if (pgn.length > 1) {
          const gender = pgn[1];
          if (gender === 'm') parts.push('masculine');
          else if (gender === 'f') parts.push('feminine');
          else if (gender === 'c') parts.push('common');
        }

        if (pgn.length > 2) {
          const number = pgn[2];
          if (number === 's') parts.push('singular');
          else if (number === 'p') parts.push('plural');
          else if (number === 'd') parts.push('dual');
        }
      }
    } else if (partOfSpeech === 'N' && pos < code.length) {
      // Noun type
      const type = code[pos++];
      if (type === 'c') parts.push('common');
      else if (type === 'p') parts.push('proper');

      // Gender
      if (pos < code.length) {
        const gender = code[pos++];
        if (gender === 'm') parts.push('masculine');
        else if (gender === 'f') parts.push('feminine');
        else if (gender === 'c') parts.push('common');
      }

      // Number
      if (pos < code.length) {
        const number = code[pos++];
        if (number === 's') parts.push('singular');
        else if (number === 'p') parts.push('plural');
        else if (number === 'd') parts.push('dual');
      }

      // State
      if (pos < code.length) {
        const state = code[pos];
        if (state === 'a') parts.push('absolute');
        else if (state === 'c') parts.push('construct');
        else if (state === 'd') parts.push('determined');
      }
    }

    return parts.join(', ');
  }

  /**
   * Enrich Strong's entry with STEPBible occurrence data
   */
  enrichStrongsWithStepBible(strongsNumber: string): EnhancedStrongsResult | undefined {
    // Get base Strong's entry
    const baseStrong = strongsNumber.replace(/[a-z]$/, ''); // Remove extended notation
    const baseEntry = this.lookupStrongs(baseStrong);

    if (!baseEntry) {
      return undefined;
    }

    // Start with basic entry
    const result: EnhancedStrongsResult = {
      strongs_number: strongsNumber,
      testament: strongsNumber.startsWith('G') ? 'NT' : 'OT',
      lemma: baseEntry.lemma,
      transliteration: baseEntry.translit,
      pronunciation: baseEntry.pronunciation,
      definition: baseEntry.def,
      derivation: baseEntry.derivation,
      citation: {
        source: 'OpenScriptures Strong\'s Dictionary',
        url: 'https://github.com/openscriptures/strongs',
        copyright: 'Public Domain'
      }
    };

    // Auto-load a representative book if cache is empty (lazy initialization)
    if (this.stepbibleCache.size === 0) {
      // Load one book to enable morphology analysis
      // For Hebrew: load Genesis, for Greek: load John
      const bookToLoad = strongsNumber.startsWith('G') ? 'John' : 'Genesis';
      this.loadBook(bookToLoad);

      // If loading failed, return base result without extended data
      if (this.stepbibleCache.size === 0) {
        return result;
      }
    }

    // Helper to normalize Strong's numbers (G25 -> G0025, H8034 -> H8034)
    const normalizeStrong = (s: string): string => {
      if (!s || s.length < 2) return s;
      const prefix = s[0]; // G or H
      const num = s.substring(1); // numeric portion
      return prefix + num.padStart(4, '0'); // pad to 4 digits
    };

    // Scan loaded books for occurrences
    let occurrences = 0;
    const morphCounts: Record<string, number> = {};

    const normalizedBase = normalizeStrong(baseStrong);
    const normalizedExtended = normalizeStrong(strongsNumber);

    for (const bookData of this.stepbibleCache.values()) {
      for (const chapter of Object.values(bookData.chapters)) {
        for (const verse of Object.values(chapter)) {
          for (const word of verse.words) {
            // Match both with and without leading zeros (G25 vs G0025)
            const normalizedWord = normalizeStrong(word.strong);

            if (normalizedWord === normalizedBase || normalizedWord === normalizedExtended) {
              occurrences++;
              if (word.morph) {
                morphCounts[word.morph] = (morphCounts[word.morph] || 0) + 1;
              }
            }
          }
        }
      }
    }

    if (occurrences > 0) {
      result.extended = {
        strongsExtended: strongsNumber,
        occurrences,
        morphology: morphCounts
      };
    }

    return result;
  }

  /**
   * Get STEPBible cache statistics
   */
  getStepBibleCacheStats(): { cachedBooks: number; maxCacheSize: number } | undefined {
    if (!this.stepbibleInitialized) {
      return undefined;
    }

    return {
      cachedBooks: this.stepbibleCache.size,
      maxCacheSize: this.MAX_CACHE_SIZE
    };
  }

  /**
   * Clear STEPBible cache
   */
  clearStepBibleCache(): void {
    this.stepbibleCache.clear();
  }

  /**
   * Get STEPBible metadata
   */
  getStepBibleMetadata(): StepBibleMetadata | undefined {
    if (!this.stepbibleInitialized) {
      this.loadStepBibleIndex();
    }
    return this.stepbibleMetadata || undefined;
  }
}
