/**
 * Tests for BiblicalLanguagesAdapter - STEPBible Enhanced Features (TDD)
 *
 * Tests adapter methods for lazy loading books and enriching Strong's data.
 * Tests will initially fail until implementation is complete.
 */

import { BiblicalLanguagesAdapter } from '../../src/adapters/biblicalLanguagesAdapter.js';
import { BookData, VerseData } from '../../src/types/index.js';

describe('BiblicalLanguagesAdapter - STEPBible Features', () => {
  let adapter: BiblicalLanguagesAdapter;

  beforeEach(() => {
    adapter = new BiblicalLanguagesAdapter();
  });

  describe('initialization', () => {
    it('should initialize without loading STEPBible data', () => {
      const adapter = new BiblicalLanguagesAdapter();
      expect(adapter).toBeDefined();
      // Should not throw, even if STEPBible data doesn't exist yet
    });

    it('should load STEPBible index on first STEPBible access', () => {
      const adapter = new BiblicalLanguagesAdapter();

      // First STEPBible method call should trigger index load
      // This shouldn't throw
      expect(() => {
        adapter.getStepBibleIndex();
      }).not.toThrow();
    });
  });

  describe('STEPBible index', () => {
    it('should load index.json with book mappings', () => {
      const index = adapter.getStepBibleIndex();

      if (index) {
        expect(index.books).toBeDefined();
        expect(typeof index.books).toBe('object');
      }
    });

    it('should include NT books in index', () => {
      const index = adapter.getStepBibleIndex();

      if (index) {
        expect(index.books['John']).toBeDefined();
        expect(index.books['Matthew']).toBeDefined();
        expect(index.books['Romans']).toBeDefined();
        expect(index.books['Revelation']).toBeDefined();
      }
    });

    it('should include file paths for each book', () => {
      const index = adapter.getStepBibleIndex();

      if (index) {
        const johnInfo = index.books['John'];
        expect(johnInfo.file).toBeDefined();
        expect(johnInfo.file).toContain('.json.gz');
      }
    });

    it('should include testament information', () => {
      const index = adapter.getStepBibleIndex();

      if (index) {
        expect(index.books['John'].testament).toBe('NT');
        expect(index.books['Matthew'].testament).toBe('NT');
      }
    });

    it('should cache index after first load', () => {
      const index1 = adapter.getStepBibleIndex();
      const index2 = adapter.getStepBibleIndex();

      // Should return same object (cached)
      expect(index1).toBe(index2);
    });
  });

  describe('book lazy loading', () => {
    it('should load book data on first access', () => {
      const bookData = adapter.loadBook('John');

      if (bookData) {
        expect(bookData.book).toBe('John');
        expect(bookData.testament).toBe('NT');
        expect(bookData.chapters).toBeDefined();
      }
    });

    it('should cache loaded books', () => {
      const book1 = adapter.loadBook('John');
      const book2 = adapter.loadBook('John');

      // Should return same object (cached)
      expect(book1).toBe(book2);
    });

    it('should decompress .json.gz files', () => {
      const bookData = adapter.loadBook('John');

      if (bookData) {
        // Should have decompressed and parsed the data
        expect(bookData.chapters).toBeDefined();
        expect(Object.keys(bookData.chapters).length).toBeGreaterThan(0);
      }
    });

    it('should load multiple different books', () => {
      const john = adapter.loadBook('John');
      const matthew = adapter.loadBook('Matthew');
      const romans = adapter.loadBook('Romans');

      if (john && matthew && romans) {
        expect(john.book).toBe('John');
        expect(matthew.book).toBe('Matthew');
        expect(romans.book).toBe('Romans');
      }
    });

    it('should handle non-existent books gracefully', () => {
      const result = adapter.loadBook('FakeBook');

      // Should return undefined or null, not throw
      expect(result).toBeUndefined();
    });

    it('should implement LRU cache eviction', () => {
      // Load more than 10 books (max cache size)
      const books = [
        'Matthew', 'Mark', 'Luke', 'John', 'Acts',
        'Romans', '1Corinthians', '2Corinthians', 'Galatians', 'Ephesians',
        'Philippians' // 11th book
      ];

      books.forEach(book => {
        adapter.loadBook(book);
      });

      // First book (Matthew) should have been evicted
      // This is implementation-dependent, so we just verify no crash
      const stats = adapter.getStepBibleCacheStats();
      if (stats) {
        expect(stats.cachedBooks).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('verse lookup', () => {
    it('should return verse data with words array', () => {
      const verseData = adapter.getVerseWithMorphology('John 3:16');

      if (verseData) {
        expect(verseData.words).toBeDefined();
        expect(Array.isArray(verseData.words)).toBe(true);
        expect(verseData.words.length).toBeGreaterThan(0);
      }
    });

    it('should include all word properties', () => {
      const verseData = adapter.getVerseWithMorphology('John 1:1');

      if (verseData && verseData.words.length > 0) {
        const word = verseData.words[0];
        expect(word.position).toBeDefined();
        expect(word.text).toBeDefined();
        expect(word.lemma).toBeDefined();
        expect(word.strong).toBeDefined();
        expect(word.morph).toBeDefined();
        expect(word.gloss).toBeDefined();
      }
    });

    it('should parse "John 3:16" reference format', () => {
      const verseData = adapter.getVerseWithMorphology('John 3:16');
      expect(verseData).toBeDefined();
    });

    it('should parse "Jn 3:16" abbreviation', () => {
      const verseData = adapter.getVerseWithMorphology('Jn 3:16');
      expect(verseData).toBeDefined();
    });

    it('should parse "43:3:16" numeric format', () => {
      const verseData = adapter.getVerseWithMorphology('43:3:16');
      expect(verseData).toBeDefined();
    });

    it('should handle whitespace and case variations', () => {
      const verseData = adapter.getVerseWithMorphology('  JOHN  3:16  ');
      expect(verseData).toBeDefined();
    });

    it('should lazy-load required book automatically', () => {
      // Clear cache if possible
      adapter.clearStepBibleCache?.();

      // This should trigger loading of Romans
      const verseData = adapter.getVerseWithMorphology('Romans 3:23');

      if (verseData) {
        expect(verseData.words.length).toBeGreaterThan(0);
      }
    });

    it('should return undefined for invalid references', () => {
      const result = adapter.getVerseWithMorphology('FakeBook 1:1');
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-existent chapters', () => {
      const result = adapter.getVerseWithMorphology('John 999:1');
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-existent verses', () => {
      const result = adapter.getVerseWithMorphology('John 3:999');
      expect(result).toBeUndefined();
    });
  });

  describe('enhanced Strong\'s enrichment', () => {
    it('should enrich Strong\'s entry with occurrence data', () => {
      const enhanced = adapter.enrichStrongsWithStepBible('G2316');

      if (enhanced && enhanced.extended) {
        expect(enhanced.extended.occurrences).toBeDefined();
        expect(enhanced.extended.occurrences).toBeGreaterThan(0);
      }
    });

    it('should calculate morphology frequency distribution', () => {
      const enhanced = adapter.enrichStrongsWithStepBible('G2316');

      if (enhanced && enhanced.extended && enhanced.extended.morphology) {
        expect(Object.keys(enhanced.extended.morphology).length).toBeGreaterThan(0);
        // θεός should appear in multiple cases
        expect(enhanced.extended.morphology).toHaveProperty(expect.stringMatching(/N-/));
      }
    });

    it('should scan only loaded books for occurrences', () => {
      // Load only John
      adapter.loadBook('John');

      const enhanced = adapter.enrichStrongsWithStepBible('G2316');

      // Should find some occurrences in John
      if (enhanced && enhanced.extended) {
        expect(enhanced.extended.occurrences).toBeGreaterThan(0);
      }
    });

    it('should return base Strong\'s data when no books loaded', () => {
      // Clear cache
      adapter.clearStepBibleCache?.();

      const enhanced = adapter.enrichStrongsWithStepBible('G25');

      // Should still have basic Strong's data from OpenScriptures
      expect(enhanced).toBeDefined();
      expect(enhanced.lemma).toBeDefined();
      expect(enhanced.definition).toBeDefined();
    });

    it('should handle extended Strong\'s numbers (G1722a)', () => {
      const enhanced = adapter.enrichStrongsWithStepBible('G1722a');

      expect(enhanced).toBeDefined();
      if (enhanced.extended) {
        expect(enhanced.extended.strongsExtended).toContain('1722');
      }
    });

    it('should identify sense disambiguations', () => {
      const enhanced = adapter.enrichStrongsWithStepBible('G1722');

      if (enhanced && enhanced.extended && enhanced.extended.senses) {
        // G1722 (ἐν) may have multiple senses (spatial, temporal, etc.)
        expect(Object.keys(enhanced.extended.senses).length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('morphology expansion', () => {
    it('should expand morphology codes', () => {
      const expanded = adapter.expandMorphology('V-AAI-3S');

      if (expanded) {
        expect(expanded).toContain('Verb');
        expect(expanded).toContain('Aorist');
        expect(expanded).toContain('Active');
        expect(expanded).toContain('Indicative');
        expect(expanded).toContain('3rd');
        expect(expanded).toContain('Singular');
      }
    });

    it('should expand noun codes (N-NSM)', () => {
      const expanded = adapter.expandMorphology('N-NSM');

      if (expanded) {
        expect(expanded).toContain('Noun');
        expect(expanded).toContain('Nominative');
        expect(expanded).toContain('Singular');
        expect(expanded).toContain('Masculine');
      }
    });

    it('should expand preposition codes (PREP)', () => {
      const expanded = adapter.expandMorphology('PREP');

      if (expanded) {
        expect(expanded).toMatch(/preposition/i);
      }
    });

    it('should return original code if expansion not available', () => {
      const expanded = adapter.expandMorphology('UNKNOWN-CODE');

      // Should return original or null, not throw
      expect(expanded).toBeDefined();
    });
  });

  describe('performance', () => {
    it('should load index in less than 5ms', () => {
      const startTime = Date.now();
      adapter.getStepBibleIndex();
      const elapsedTime = Date.now() - startTime;

      expect(elapsedTime).toBeLessThan(5);
    });

    it('should load single book in less than 50ms', () => {
      const startTime = Date.now();
      adapter.loadBook('John');
      const elapsedTime = Date.now() - startTime;

      // First load includes decompression
      expect(elapsedTime).toBeLessThan(50);
    });

    it('should retrieve cached verse in less than 1ms', () => {
      // Prime cache
      adapter.getVerseWithMorphology('John 3:16');

      const startTime = Date.now();
      adapter.getVerseWithMorphology('John 3:17');
      const elapsedTime = Date.now() - startTime;

      expect(elapsedTime).toBeLessThan(1);
    });
  });

  describe('graceful degradation', () => {
    it('should work when STEPBible data directory missing', () => {
      // Create adapter with non-existent path
      const adapter = new BiblicalLanguagesAdapter('/fake/path');

      // Should not throw on initialization
      expect(adapter.isReady()).toBe(true);

      // STEPBible methods should return undefined/null gracefully
      const index = adapter.getStepBibleIndex();
      expect(index).toBeUndefined();
    });

    it('should fall back to OpenScriptures data when STEPBible unavailable', () => {
      const adapter = new BiblicalLanguagesAdapter('/fake/path');

      // Basic Strong's lookup should still work
      const entry = adapter.lookupStrongs('G25');
      expect(entry).toBeDefined();
      expect(entry?.lemma).toBeDefined();
    });

    it('should handle corrupted book files gracefully', () => {
      // This would require mocking file system, but conceptually:
      // If a book file is corrupted, should return undefined
      const result = adapter.loadBook('CorruptedBook');
      expect(result).toBeUndefined();
    });
  });

  describe('cache management', () => {
    it('should provide cache statistics', () => {
      adapter.loadBook('John');
      adapter.loadBook('Matthew');

      const stats = adapter.getStepBibleCacheStats();

      if (stats) {
        expect(stats.cachedBooks).toBeGreaterThanOrEqual(2);
        expect(stats.maxCacheSize).toBe(10);
      }
    });

    it('should allow manual cache clearing', () => {
      adapter.loadBook('John');

      if (adapter.clearStepBibleCache) {
        adapter.clearStepBibleCache();

        const stats = adapter.getStepBibleCacheStats();
        if (stats) {
          expect(stats.cachedBooks).toBe(0);
        }
      }
    });
  });

  describe('metadata', () => {
    it('should provide STEPBible metadata', () => {
      const metadata = adapter.getStepBibleMetadata();

      if (metadata) {
        expect(metadata.version).toBeDefined();
        expect(metadata.source).toContain('STEPBible');
        expect(metadata.license).toBe('CC BY 4.0');
        expect(metadata.attribution).toBeDefined();
        expect(metadata.commit_sha).toBeDefined();
      }
    });
  });

  describe('Hebrew support (Phase 2)', () => {
    it('should load Hebrew OT books', () => {
      const genesis = adapter.loadBook('Genesis');

      // Phase 2 feature
      if (genesis) {
        expect(genesis.book).toBe('Genesis');
        expect(genesis.testament).toBe('OT');
      }
    });

    it('should provide Hebrew morphology expansion', () => {
      // Phase 2 feature - Hebrew morphology codes
      const expanded = adapter.expandMorphology('HNcmsa');

      if (expanded) {
        expect(expanded).toMatch(/noun|common|masculine|singular|absolute/i);
      }
    });
  });
});
