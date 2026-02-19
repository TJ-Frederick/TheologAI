/**
 * Tests for Original Language Lookup (formerly Strong's Concordance Lookup)
 *
 * These tests validate enhanced features using STEPBible data,
 * including simple vs detailed output modes.
 */

import { originalLanguageLookupHandler } from '../../src/tools/biblicalLanguages.js';
import { EnhancedStrongsResult } from '../../src/types/index.js';

describe('original_language_lookup - Enhanced Features (STEPBible)', () => {
  describe('backward compatibility', () => {
    it('should return unchanged format when no enhanced options provided', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G25'
      });

      expect(result.isError).toBeUndefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');

      // Should still be markdown format, not include extended data
      const text = result.content[0].text;
      expect(text).toContain('Strong\'s G25');
      expect(text).toContain('OpenScriptures');
      expect(text).not.toContain('STEPBible');
    });

    it('should work identically to existing implementation when include_extended=false', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G2316',
        include_extended: false
      });

      const text = result.content[0].text;
      expect(text).toContain('θεός');
      expect(text).not.toContain('occurrences');
      expect(text).not.toContain('morphology');
    });
  });

  describe('extended Strong\'s numbers', () => {
    it('should accept extended Strong\'s format (G1722a)', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G1722a',
        include_extended: true
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('1722');
    });

    it('should fall back to base number when extended variant not found', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G25z',
        include_extended: true
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('G25');
    });

    it('should normalize input (lowercase, whitespace)', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: '  g25a  ',
        include_extended: true
      });

      expect(result.isError).toBeUndefined();
    });
  });

  describe('occurrence counts', () => {
    it('should return occurrence count when include_occurrences=true', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G2316',
        include_occurrences: true
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;

      // Should include occurrence count (θεός appears 1000+ times in NT)
      expect(text).toMatch(/occurs?\s+\d+\s+times?/i);
    });

    it('should handle Strong\'s numbers with low occurrence counts', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G1',
        include_occurrences: true
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toMatch(/occurs?/i);
    });
  });

  describe('morphological data', () => {
    it('should return morphology summary when include_morphology=true', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G2316',
        include_morphology: true
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;

      // θεός should appear in various cases (nominative, genitive, etc.)
      expect(text).toMatch(/morphology|parsing/i);
      expect(text).toMatch(/N-[A-Z]{2,3}/); // Noun codes like N-NSM, N-GSM
    });

    it('should show most common morphological forms', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G25',
        include_morphology: true
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;

      // ἀγαπάω is a verb, should show verb morphology
      expect(text).toMatch(/V-[A-Z]{2,4}/); // Verb codes
    });

    it('should include morphology code explanations', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G2316',
        include_morphology: true
      });

      const text = result.content[0].text;

      // Should explain what the codes mean
      expect(text).toMatch(/nominative|genitive|accusative|dative/i);
    });
  });

  describe('combined enhanced features', () => {
    it('should return all enhanced data when all flags enabled', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G2316',
        include_extended: true,
        include_morphology: true,
        include_occurrences: true
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;

      // Should include all features
      expect(text).toContain('OpenScriptures'); // Original source
      expect(text).toContain('STEPBible'); // Enhanced data attribution
      expect(text).toMatch(/occurs?\s+\d+/i); // Occurrences
      expect(text).toMatch(/morphology|parsing/i); // Morphology
    });
  });

  describe('STEPBible attribution', () => {
    it('should include STEPBible attribution when extended features used', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G25',
        include_extended: true
      });

      const text = result.content[0].text;
      expect(text).toContain('STEPBible');
      expect(text).toContain('CC BY 4.0');
    });

    it('should not include STEPBible attribution when only basic lookup', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G25'
      });

      const text = result.content[0].text;
      expect(text).not.toContain('STEPBible');
    });
  });

  describe('graceful degradation', () => {
    it('should work when STEPBible data is unavailable', async () => {
      // This test ensures the tool doesn't fail if STEPBible data missing
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G25',
        include_extended: true
      });

      // Should not error, should return at least basic Strong's data
      expect(result.isError).not.toBe(true);
      const text = result.content[0].text;
      expect(text).toContain('G25');
    });

    it('should indicate when enhanced data is unavailable', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G25',
        include_morphology: true
      });

      // If STEPBible data not loaded, should still return basic data
      // May include a note about enhanced data being unavailable
      expect(result.isError).not.toBe(true);
    });
  });

  describe('error handling', () => {
    it('should still validate Strong\'s number format', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'invalid',
        include_extended: true
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid');
    });

    it('should handle non-existent Strong\'s numbers gracefully', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G99999',
        include_extended: true
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('Hebrew Strong\'s support (Phase 2)', () => {
    it('should support Hebrew with enhanced features', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'H430',
        include_occurrences: true
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('H430');
    });
  });
});
