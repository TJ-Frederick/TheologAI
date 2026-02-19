/**
 * Tests for Original Language Lookup Tool (formerly Strong's Concordance Lookup)
 *
 * These tests define the expected behavior.
 */

import { originalLanguageLookupHandler } from '../../src/tools/biblicalLanguages.js';

describe('original_language_lookup tool', () => {
  describe('Greek Strong\'s lookups', () => {
    it('should return correct entry for G25 (agapaō - to love)', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G25'
      });

      expect(result.content).toBeDefined();
      const content = result.content[0];
      expect(content.type).toBe('text');

      const data = JSON.parse(content.text);
      expect(data.strongs_number).toBe('G25');
      expect(data.testament).toBe('NT');
      expect(data.lemma).toBeDefined();
      expect(data.transliteration).toBeDefined();
      expect(data.definition).toBeDefined();
      expect(data.definition.length).toBeGreaterThan(0);
    });

    it('should return correct entry for G2316 (theos - God)', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G2316'
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.strongs_number).toBe('G2316');
      expect(data.testament).toBe('NT');
      expect(data.lemma).toContain('θεός');
    });
  });

  describe('Hebrew Strong\'s lookups', () => {
    it('should return correct entry for H430 (elohim - God)', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'H430'
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.strongs_number).toBe('H430');
      expect(data.testament).toBe('OT');
      expect(data.lemma).toBeDefined();
      expect(data.transliteration).toBeDefined();
      expect(data.definition).toBeDefined();
    });

    it('should return correct entry for H7225 (reshith - beginning)', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'H7225'
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.strongs_number).toBe('H7225');
      expect(data.testament).toBe('OT');
    });
  });

  describe('Error handling', () => {
    it('should return error for invalid Strong\'s number format', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'invalid'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid');
    });

    it('should return error for non-existent Strong\'s number', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G99999'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should return error for missing strongs_number parameter', async () => {
      const result = await originalLanguageLookupHandler.handler({});

      expect(result.isError).toBe(true);
    });
  });

  describe('Response format', () => {
    it('should include all required fields', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G25'
      });

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('strongs_number');
      expect(data).toHaveProperty('testament');
      expect(data).toHaveProperty('lemma');
      expect(data).toHaveProperty('definition');
      expect(data).toHaveProperty('citation');
    });

    it('should include proper citation', async () => {
      const result = await originalLanguageLookupHandler.handler({
        strongs_number: 'G25'
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.citation).toBeDefined();
      expect(data.citation.source).toContain('OpenScriptures');
      expect(data.citation.license).toBe('Public Domain');
    });
  });
});
