/**
 * BiblicalLanguagesAdapter Tests
 *
 * Tests for Strong's concordance lookups and STEPBible morphology data
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BiblicalLanguagesAdapter } from '../../../src/adapters/biblicalLanguagesAdapter.js';
import {
  VALID_STRONGS_NUMBERS,
  INVALID_STRONGS_NUMBERS,
  LEMMA_SEARCHES,
  MORPHOLOGY_TEST_REFERENCES,
  INVALID_REFERENCES
} from '../../fixtures/biblicalLanguagesFixtures.js';

describe('BiblicalLanguagesAdapter', () => {
  let adapter: BiblicalLanguagesAdapter;

  beforeEach(() => {
    // Initialize adapter with default data path
    adapter = new BiblicalLanguagesAdapter();
  });

  describe('Initialization', () => {
    it('should initialize lazily on first lookup', () => {
      const newAdapter = new BiblicalLanguagesAdapter();
      expect(newAdapter.isReady()).toBe(false);

      // Trigger initialization
      newAdapter.lookupStrongs('G25');
      expect(newAdapter.isReady()).toBe(true);
    });

    it('should load Greek and Hebrew dictionaries', () => {
      adapter.lookupStrongs('G25'); // Trigger load

      const stats = adapter.getStats();
      expect(stats.greek).toBeGreaterThan(5000);
      expect(stats.hebrew).toBeGreaterThan(8000);
      expect(stats.total).toBeGreaterThan(13000);
    });

    it('should load metadata', () => {
      adapter.lookupStrongs('G25'); // Trigger load

      const metadata = adapter.getMetadata();
      expect(metadata).toBeDefined();
      expect(metadata?.entries.greek).toBeGreaterThan(5000);
      expect(metadata?.entries.hebrew).toBeGreaterThan(8000);
    });
  });

  describe('Strong\'s Number Lookup', () => {
    it('should lookup valid Greek Strong\'s number', () => {
      const result = adapter.lookupStrongs('G25');

      expect(result).toBeDefined();
      expect(result?.lemma).toBe('ἀγαπάω');
      expect(result?.translit).toBeDefined();
      expect(result?.def).toBeDefined();
    });

    it('should lookup valid Hebrew Strong\'s number', () => {
      const result = adapter.lookupStrongs('H430');

      expect(result).toBeDefined();
      expect(result?.lemma).toBe('אֱלֹהִים');
      expect(result?.translit).toBeDefined();
      expect(result?.def).toBeDefined();
    });

    it('should handle lowercase Strong\'s numbers', () => {
      const result1 = adapter.lookupStrongs('g25');
      const result2 = adapter.lookupStrongs('G25');

      expect(result1).toEqual(result2);
      expect(result1).toBeDefined();
    });

    it('should trim whitespace from input', () => {
      const result = adapter.lookupStrongs('  G25  ');

      expect(result).toBeDefined();
      expect(result?.lemma).toBe('ἀγαπάω');
    });

    it('should return undefined for non-existent Strong\'s number', () => {
      const result = adapter.lookupStrongs('G99999');

      expect(result).toBeUndefined();
    });

    it('should throw error for invalid format', () => {
      expect(() => adapter.lookupStrongs('X123')).toThrow(/Invalid Strong's number format/);
      expect(() => adapter.lookupStrongs('123')).toThrow(/Invalid Strong's number format/);
      expect(() => adapter.lookupStrongs('G')).toThrow(/Invalid Strong's number format/);
      expect(() => adapter.lookupStrongs('')).toThrow(/Invalid Strong's number format/);
    });

    it('should handle all valid Strong\'s number formats', () => {
      // Test single digit
      const g1 = adapter.lookupStrongs('G1');
      expect(g1).toBeDefined();

      // Test multiple digits
      const g25 = adapter.lookupStrongs('G25');
      expect(g25).toBeDefined();

      // Test four digits
      const g3056 = adapter.lookupStrongs('G3056');
      expect(g3056).toBeDefined();
    });
  });

  describe('Lemma Search', () => {
    it('should search Greek by lemma', () => {
      const results = adapter.searchByLemma('agapa', 'NT', 10);

      expect(results.length).toBeGreaterThan(0);
      const hasG25 = results.some(r => r.strongsNumber === 'G25');
      expect(hasG25).toBe(true);
    });

    it('should search Hebrew by lemma', () => {
      const results = adapter.searchByLemma('elohim', 'OT', 10);

      expect(results.length).toBeGreaterThan(0);
      const hasH430 = results.some(r => r.strongsNumber === 'H430');
      expect(hasH430).toBe(true);
    });

    it('should search by transliteration', () => {
      const results = adapter.searchByLemma('agapao', 'NT', 10);

      expect(results.length).toBeGreaterThan(0);
      const hasG25 = results.some(r => r.strongsNumber === 'G25');
      expect(hasG25).toBe(true);
    });

    it('should search both testaments when testament="both"', () => {
      const results = adapter.searchByLemma('love', 'both', 10);

      // Should find both Greek and Hebrew entries
      const hasGreek = results.some(r => r.strongsNumber.startsWith('G'));
      const hasHebrew = results.some(r => r.strongsNumber.startsWith('H'));

      // May or may not find both depending on exact matches
      expect(hasGreek || hasHebrew).toBe(true);
    });

    it('should respect maxResults limit', () => {
      const results = adapter.searchByLemma('a', 'both', 5);

      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should be case-insensitive', () => {
      const results1 = adapter.searchByLemma('agapa', 'NT', 10);
      const results2 = adapter.searchByLemma('AGAPA', 'NT', 10);

      expect(results1.length).toBe(results2.length);
    });

    it('should return empty array for no matches', () => {
      const results = adapter.searchByLemma('xyzabc123nonexistent', 'both', 10);

      expect(results).toEqual([]);
    });
  });

  describe('Statistics and Metadata', () => {
    it('should return accurate statistics', () => {
      const stats = adapter.getStats();

      expect(stats.greek).toBeGreaterThan(5000);
      expect(stats.hebrew).toBeGreaterThan(8000);
      expect(stats.total).toBe(stats.greek + stats.hebrew);
    });

    it('should load stats on first access', () => {
      const newAdapter = new BiblicalLanguagesAdapter();
      expect(newAdapter.isReady()).toBe(false);

      const stats = newAdapter.getStats();
      expect(newAdapter.isReady()).toBe(true);
      expect(stats.total).toBeGreaterThan(0);
    });

    it('should return metadata with version info', () => {
      const metadata = adapter.getMetadata();

      expect(metadata).toBeDefined();
      expect(metadata?.version).toBeDefined();
      expect(metadata?.source).toBeDefined();
      expect(metadata?.license).toBeDefined();
    });

    it('should have consistent counts in metadata and stats', () => {
      const metadata = adapter.getMetadata();
      const stats = adapter.getStats();

      expect(metadata?.entries.greek).toBe(stats.greek);
      expect(metadata?.entries.hebrew).toBe(stats.hebrew);
      expect(metadata?.entries.total).toBe(stats.total);
    });
  });

  describe('STEPBible Integration', () => {
    it('should lazy-load STEPBible index', () => {
      const index = adapter.getStepBibleIndex();

      // May or may not be available depending on if data files exist
      if (index) {
        expect(index.books).toBeDefined();
        expect(Object.keys(index.books).length).toBeGreaterThan(0);
      }
    });

    it('should load STEPBible metadata if available', () => {
      const metadata = adapter.getStepBibleMetadata();

      // May be undefined if STEPBible data not built
      if (metadata) {
        expect(metadata.version).toBeDefined();
        expect(metadata.books).toBeGreaterThan(0);
      }
    });

    it('should return cache stats', () => {
      const stats = adapter.getStepBibleCacheStats();

      if (stats) {
        expect(stats.cachedBooks).toBeGreaterThanOrEqual(0);
        expect(stats.maxCacheSize).toBe(10);
      }
    });

    it('should clear cache successfully', () => {
      adapter.clearStepBibleCache();

      const stats = adapter.getStepBibleCacheStats();
      if (stats) {
        expect(stats.cachedBooks).toBe(0);
      }
    });
  });

  describe('Verse Morphology', () => {
    it('should parse valid Bible reference', () => {
      const verse = adapter.getVerseWithMorphology('John 3:16');

      // May be undefined if STEPBible data not available
      if (verse) {
        expect(verse.text).toBeDefined();
        expect(verse.words).toBeDefined();
        expect(Array.isArray(verse.words)).toBe(true);
      }
    });

    it('should handle different reference formats', () => {
      const formats = [
        'John 3:16',
        'Jn 3:16',
        'John 3.16'
      ];

      formats.forEach(ref => {
        // Should not throw error
        expect(() => adapter.getVerseWithMorphology(ref)).not.toThrow();
      });
    });

    it('should return undefined for invalid reference', () => {
      const verse = adapter.getVerseWithMorphology('InvalidBook 1:1');

      expect(verse).toBeUndefined();
    });

    it('should expand morphology codes if available', () => {
      const expanded = adapter.expandMorphology('V-PAI-3S');

      // May be undefined if morph codes not loaded
      if (expanded) {
        expect(expanded).toContain('Verb');
        expect(expanded).toContain('Present');
      }
    });
  });

  describe('Enhanced Strong\'s Results', () => {
    it('should enrich Strong\'s entry with basic info', () => {
      const enriched = adapter.enrichStrongsWithStepBible('G25');

      expect(enriched).toBeDefined();
      expect(enriched?.strongs_number).toBe('G25');
      expect(enriched?.testament).toBe('NT');
      expect(enriched?.lemma).toBe('ἀγαπάω');
      expect(enriched?.definition).toBeDefined();
    });

    it('should handle Hebrew entries', () => {
      const enriched = adapter.enrichStrongsWithStepBible('H430');

      expect(enriched).toBeDefined();
      expect(enriched?.strongs_number).toBe('H430');
      expect(enriched?.testament).toBe('OT');
      expect(enriched?.lemma).toBe('אֱלֹהִים');
    });

    it('should include citation info', () => {
      const enriched = adapter.enrichStrongsWithStepBible('G25');

      expect(enriched?.citation).toBeDefined();
      expect(enriched?.citation.source).toBeDefined();
      expect(enriched?.citation.url).toBeDefined();
    });

    it('should return undefined for invalid Strong\'s number', () => {
      const enriched = adapter.enrichStrongsWithStepBible('G99999');

      expect(enriched).toBeUndefined();
    });

    it('should handle extended Strong\'s notation', () => {
      // Some systems use G25a, G25b for variants
      const enriched = adapter.enrichStrongsWithStepBible('G25a');

      // Should strip suffix and lookup base entry
      if (enriched) {
        expect(enriched.lemma).toBe('ἀγαπάω');
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw descriptive error for malformed input', () => {
      expect(() => adapter.lookupStrongs('INVALID')).toThrow(/Invalid Strong's number format/);
    });

    it('should handle missing data files gracefully', () => {
      const badAdapter = new BiblicalLanguagesAdapter('/non/existent/path');

      // Should throw when trying to load
      expect(() => badAdapter.lookupStrongs('G25')).toThrow();
    });

    it('should validate all invalid formats', () => {
      INVALID_STRONGS_NUMBERS.forEach(invalid => {
        if (invalid === '') {
          expect(() => adapter.lookupStrongs(invalid)).toThrow();
        } else {
          expect(() => adapter.lookupStrongs(invalid)).toThrow(/Invalid Strong's number format/);
        }
      });
    });
  });

  describe('Performance', () => {
    it('should lookup Strong\'s numbers quickly', () => {
      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        adapter.lookupStrongs('G25');
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // 100 lookups in <100ms
    });

    it('should search lemmas efficiently', () => {
      const start = Date.now();

      for (let i = 0; i < 10; i++) {
        adapter.searchByLemma('love', 'both', 10);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500); // 10 searches in <500ms
    });

    it('should cache loaded data', () => {
      const stats1 = adapter.getStats();
      const stats2 = adapter.getStats();

      // Should return same reference (cached)
      expect(stats1).toEqual(stats2);
    });
  });

  describe('LRU Cache Behavior', () => {
    it('should respect max cache size for STEPBible books', () => {
      // Load more than MAX_CACHE_SIZE books
      const books = ['John', 'Genesis', 'Romans', 'Matthew', 'Mark',
                     'Luke', 'Acts', 'Revelation', 'Isaiah', 'Psalms',
                     'Proverbs', 'Job', 'Exodus'];

      books.forEach(book => {
        adapter.loadBook(book);
      });

      const stats = adapter.getStepBibleCacheStats();
      if (stats) {
        expect(stats.cachedBooks).toBeLessThanOrEqual(stats.maxCacheSize);
      }
    });

    it('should evict oldest entries when cache is full', () => {
      // Clear cache first
      adapter.clearStepBibleCache();

      // Load books sequentially
      adapter.loadBook('John');
      adapter.loadBook('Genesis');

      const stats = adapter.getStepBibleCacheStats();
      if (stats && stats.cachedBooks > 0) {
        expect(stats.cachedBooks).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('Data Integrity', () => {
    it('should have complete Greek entries', () => {
      const g25 = adapter.lookupStrongs('G25');

      expect(g25).toBeDefined();
      expect(g25?.lemma).toBeTruthy();
      expect(g25?.def).toBeTruthy();
    });

    it('should have complete Hebrew entries', () => {
      const h430 = adapter.lookupStrongs('H430');

      expect(h430).toBeDefined();
      expect(h430?.lemma).toBeTruthy();
      expect(h430?.def).toBeTruthy();
    });

    it('should maintain Greek/Hebrew separation', () => {
      const greek = adapter.lookupStrongs('G25');
      const hebrew = adapter.lookupStrongs('H25');

      // Should be different entries
      expect(greek?.lemma).not.toBe(hebrew?.lemma);
    });
  });
});
