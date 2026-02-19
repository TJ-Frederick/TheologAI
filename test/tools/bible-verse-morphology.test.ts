/**
 * Tests for Bible Verse Morphology Tool (TDD)
 *
 * Tests word-by-word morphological analysis of Bible verses.
 * Tests will initially fail until implementation is complete.
 */

import { bibleVerseMorphologyHandler } from '../../src/tools/biblicalLanguages.js';

describe('bible_verse_morphology tool', () => {
  describe('basic functionality', () => {
    it('should return word-by-word analysis for John 3:16', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 3:16'
      });

      expect(result.isError).toBeUndefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');

      const text = result.content[0].text;
      expect(text).toContain('John 3:16');
      expect(text).toContain('θεός'); // "God" in Greek
    });

    it('should include original text for each word', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1'
      });

      const text = result.content[0].text;
      // First words: "In the beginning was the Word"
      expect(text).toContain('Ἐν'); // "In"
      expect(text).toContain('ἀρχῇ'); // "beginning"
      expect(text).toContain('λόγος'); // "Word"
    });

    it('should include lemma for each word', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1'
      });

      const text = result.content[0].text;
      expect(text).toMatch(/lemma|root/i);
    });

    it('should include Strong\'s numbers', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 3:16'
      });

      const text = result.content[0].text;
      // Should include Strong's numbers like G2316 (θεός)
      expect(text).toMatch(/G\d{1,4}/);
    });

    it('should include morphology codes', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1'
      });

      const text = result.content[0].text;
      // Should include codes like "PREP", "N-DSF", "V-IIA-3S"
      expect(text).toMatch(/[A-Z]-[A-Z0-9]{2,4}/);
    });

    it('should include English glosses', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 3:16'
      });

      const text = result.content[0].text;
      expect(text).toContain('God');
      expect(text).toContain('world');
      expect(text).toContain('loved');
    });
  });

  describe('morphology parsing', () => {
    it('should include morphology codes without expansion by default', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1'
      });

      const text = result.content[0].text;
      // Should have codes like "PREP" or "V-IIA-3S"
      expect(text).toMatch(/[A-Z]-[A-Z]{2,4}/);
    });

    it('should expand morphology codes when expand_morphology=true', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1',
        expand_morphology: true
      });

      const text = result.content[0].text;
      // Should have expanded descriptions like "Preposition" or "Verb, Imperfect, Indicative, Active, 3rd person, Singular"
      expect(text).toMatch(/preposition|noun|verb|article/i);
      expect(text).toMatch(/nominative|genitive|accusative|dative|singular|plural/i);
    });

    it('should handle Greek morphology codes (PREP, N-NSM, V-AAI-3S)', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1',
        expand_morphology: true
      });

      const text = result.content[0].text;
      // Various morphology terms
      expect(text).toMatch(/noun|verb|preposition|article/i);
    });

    it('should preserve word order', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1'
      });

      const text = result.content[0].text;
      // "In the beginning" - Ἐν ἀρχῇ should appear in that order
      const enIndex = text.indexOf('Ἐν');
      const archeIndex = text.indexOf('ἀρχῇ');
      expect(enIndex).toBeGreaterThan(-1);
      expect(archeIndex).toBeGreaterThan(-1);
      expect(enIndex).toBeLessThan(archeIndex);
    });
  });

  describe('reference parsing', () => {
    it('should accept "John 3:16" format', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 3:16'
      });

      expect(result.isError).toBeUndefined();
    });

    it('should accept "Jn 3:16" abbreviation', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'Jn 3:16'
      });

      expect(result.isError).toBeUndefined();
    });

    it('should accept "John 3.16" period separator', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 3.16'
      });

      expect(result.isError).toBeUndefined();
    });

    it('should normalize whitespace and case', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: '  JOHN  3:16  '
      });

      expect(result.isError).toBeUndefined();
    });

    it('should handle single-chapter books (e.g., Jude 1:3)', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'Jude 1:3'
      });

      expect(result.isError).toBeUndefined();
    });

    it('should support book number format (43:3:16 for John 3:16)', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: '43:3:16'
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('John 3:16');
    });
  });

  describe('output formatting', () => {
    it('should format output as readable table or list', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1'
      });

      const text = result.content[0].text;
      // Should be structured with clear word boundaries
      expect(text).toMatch(/\n/); // Multiple lines
      expect(text.split('\n').length).toBeGreaterThan(5); // Multiple words
    });

    it('should include position numbers for each word', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1'
      });

      const text = result.content[0].text;
      // Should have word positions like "1.", "2.", etc.
      expect(text).toMatch(/\b[1-9]\d*\b/);
    });

    it('should be readable in markdown format', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1'
      });

      const text = result.content[0].text;
      // Should use markdown formatting (headers, lists, tables, etc.)
      expect(text).toMatch(/^#|^\*|^\||^\d+\./m);
    });
  });

  describe('error handling', () => {
    it('should return error for invalid reference format', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'invalid'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid');
    });

    it('should return error for non-existent book', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'FakeBook 1:1'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/not found|invalid|unknown/i);
    });

    it('should return error for non-existent chapter', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 999:1'
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for non-existent verse', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 3:999'
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for missing reference parameter', async () => {
      const result = await bibleVerseMorphologyHandler.handler({});

      expect(result.isError).toBe(true);
    });
  });

  describe('graceful degradation', () => {
    it('should work when STEPBible data is available', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1'
      });

      // Should work with STEPBible data
      expect(result.isError).toBeUndefined();
    });

    it('should provide helpful error when STEPBible data unavailable', async () => {
      // This test ensures graceful failure if data not loaded
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1'
      });

      // Should either work or provide clear error about data availability
      if (result.isError) {
        expect(result.content[0].text).toMatch(/data|available|loaded/i);
      }
    });
  });

  describe('lazy loading', () => {
    it('should load book data on first access', async () => {
      // First call to John - should trigger book load
      const result1 = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1'
      });

      expect(result1.isError).toBeUndefined();

      // Second call to John - should use cached data
      const result2 = await bibleVerseMorphologyHandler.handler({
        reference: 'John 3:16'
      });

      expect(result2.isError).toBeUndefined();
    });

    it('should handle multiple different books', async () => {
      const result1 = await bibleVerseMorphologyHandler.handler({
        reference: 'Matthew 5:3'
      });
      expect(result1.isError).toBeUndefined();

      const result2 = await bibleVerseMorphologyHandler.handler({
        reference: 'Romans 3:23'
      });
      expect(result2.isError).toBeUndefined();

      const result3 = await bibleVerseMorphologyHandler.handler({
        reference: 'Revelation 22:21'
      });
      expect(result3.isError).toBeUndefined();
    });
  });

  describe('STEPBible attribution', () => {
    it('should include STEPBible attribution in output', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1'
      });

      const text = result.content[0].text;
      expect(text).toContain('STEPBible');
      expect(text).toContain('CC BY 4.0');
    });

    it('should include link to STEPBible.org', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'John 1:1'
      });

      const text = result.content[0].text;
      expect(text).toMatch(/STEPBible\.org|www\.stepbible\.org/i);
    });
  });

  describe('performance', () => {
    it('should complete verse lookup in reasonable time', async () => {
      const startTime = Date.now();

      await bibleVerseMorphologyHandler.handler({
        reference: 'John 3:16'
      });

      const elapsedTime = Date.now() - startTime;

      // Should complete in less than 100ms (after initial load)
      expect(elapsedTime).toBeLessThan(100);
    });
  });

  describe('Hebrew support (Phase 2)', () => {
    it('should support Hebrew Old Testament verses', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'Genesis 1:1'
      });

      // Phase 2 feature - may not be implemented yet
      if (!result.isError) {
        const text = result.content[0].text;
        expect(text).toContain('Genesis 1:1');
        // Hebrew text should be present
        expect(text).toMatch(/[\u0590-\u05FF]/); // Hebrew Unicode range
      }
    });

    it('should handle Hebrew right-to-left text', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'Psalm 23:1'
      });

      // Phase 2 feature
      if (!result.isError) {
        const text = result.content[0].text;
        expect(text).toMatch(/[\u0590-\u05FF]/); // Hebrew Unicode range
      }
    });

    it('should handle Aramaic portions (Daniel 2:4)', async () => {
      const result = await bibleVerseMorphologyHandler.handler({
        reference: 'Daniel 2:4'
      });

      // Phase 2 feature - Aramaic uses Hebrew script
      if (!result.isError) {
        const text = result.content[0].text;
        expect(text).toContain('Daniel 2:4');
      }
    });
  });
});
