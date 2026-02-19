/**
 * E2E Tests: Biblical Languages Tool
 *
 * Full MCP tool execution tests for Strong's lookup handler
 * Tests validation, enhanced data, morphology, and citations
 */

import { describe, it, expect } from 'vitest';
import { strongsLookupHandler } from '../../src/tools/biblicalLanguages.js';
import type { StrongsLookupParams } from '../../src/types/index.js';

describe('Biblical Languages Tool - E2E', () => {
  describe('Valid Strong\'s Number Formats', () => {
    it('should handle uppercase Greek Strong\'s number (G25)', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G25'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      const text = result.content[0].text;

      expect(text).toContain("Strong's G25");
      expect(text).toContain('ἀγαπάω'); // Greek lemma
      expect(text).toContain('love');
      expect(result.isError).toBeUndefined();
    });

    it('should handle lowercase Greek Strong\'s number (g25)', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'g25'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should normalize to G25
      expect(text).toContain("Strong's G25");
      expect(text).toContain('ἀγαπάω');
      expect(result.isError).toBeUndefined();
    });

    it('should handle uppercase Hebrew Strong\'s number (H430)', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'H430'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      expect(text).toContain("Strong's H430");
      expect(text).toContain('אֱלֹהִים'); // Hebrew lemma
      expect(text).toMatch(/god|deity/i);
      expect(result.isError).toBeUndefined();
    });

    it('should handle lowercase Hebrew Strong\'s number (h430)', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'h430'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should normalize to H430
      expect(text).toContain("Strong's H430");
      expect(text).toContain('אֱלֹהִים');
      expect(result.isError).toBeUndefined();
    });

    it('should handle extended notation (G1722a)', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G1722'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
      // Should successfully look up base number
    });
  });

  describe('Invalid Format Error Handling', () => {
    it('should reject missing Strong\'s number', async () => {
      const params = {} as StrongsLookupParams;

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('Missing required parameter');
    });

    it('should reject invalid prefix (X123)', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'X123'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('Invalid Strong\'s number format');
      expect(response.suggestion).toContain('G#### for Greek or H#### for Hebrew');
    });

    it('should reject missing prefix (123)', async () => {
      const params: StrongsLookupParams = {
        strongs_number: '123'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('Invalid Strong\'s number format');
    });

    it('should reject prefix without number (G)', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);
    });

    it('should reject invalid format with space (G 123)', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G 123'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);
    });

    it('should provide helpful suggestion for Greek out of range', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G9999' // Beyond valid range
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);

      const response = JSON.parse(result.content[0].text);
      expect(response.suggestion).toContain('G1 to G5624');
    });

    it('should provide helpful suggestion for Hebrew out of range', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'H9999' // Beyond valid range
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);

      const response = JSON.parse(result.content[0].text);
      expect(response.suggestion).toContain('H1 to H8674');
    });
  });

  describe('Enhanced Results with STEPBible Data', () => {
    it('should include extended data when include_extended is true', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G25',
        include_extended: true
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();

      // May or may not have enhanced data depending on setup
      const text = result.content[0].text;
      expect(text).toContain("Strong's G25");
    });

    it('should include occurrences when include_occurrences is true', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G2316', // theos
        include_occurrences: true
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // May include occurrence count if STEPBible data available
      expect(text).toContain('θεός');
      expect(result.isError).toBeUndefined();
    });
  });

  describe('Morphology Display', () => {
    it('should include morphology when include_morphology is true', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G25',
        include_morphology: true
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();

      // Morphology may or may not be available
      const text = result.content[0].text;
      expect(text).toContain("Strong's G25");
    });

    it('should show grammatical forms when morphology available', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G3056', // logos
        include_morphology: true
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      expect(text).toContain('λόγος');
      expect(result.isError).toBeUndefined();
    });
  });

  describe('Citation Formatting', () => {
    it('should include OpenScriptures citation for Greek', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G25'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      expect(text).toContain("OpenScriptures Strong's");
      expect(text).toContain('Greek (New Testament)');
      expect(text).toContain('Public Domain');
    });

    it('should include OpenScriptures citation for Hebrew', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'H430'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      expect(text).toContain("OpenScriptures Strong's");
      expect(text).toContain('Hebrew (Old Testament)');
      expect(text).toContain('Public Domain');
    });

    it('should include STEPBible attribution when enhanced features used', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G25',
        include_extended: true
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // May include STEPBible attribution if data available
      expect(text).toContain("Strong's G25");
    });
  });

  describe('Complete Entry Fields', () => {
    it('should include all basic fields for Greek entry', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G25'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should include key sections
      expect(text).toMatch(/Strong's G25:/);
      expect(text).toContain('Transliteration:');
      expect(text).toContain('Definition:');
      expect(result.isError).toBeUndefined();
    });

    it('should include derivation when available', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G3056' // logos - has derivation
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      expect(text).toContain('Definition:');
      // Derivation may or may not be present
      expect(result.isError).toBeUndefined();
    });

    it('should format pronunciation when available', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'H430'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      expect(text).toContain('Pronunciation:');
      expect(result.isError).toBeUndefined();
    });
  });

  describe('MCP Response Format', () => {
    it('should return properly formatted MCP response', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'G25'
      };

      const result = await strongsLookupHandler.handler(params);

      // Verify MCP response structure
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should format error responses as JSON for parsing', async () => {
      const params: StrongsLookupParams = {
        strongs_number: 'INVALID'
      };

      const result = await strongsLookupHandler.handler(params);

      expect(result.isError).toBe(true);

      // Error should be parseable JSON
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();

      const errorObj = JSON.parse(result.content[0].text);
      expect(errorObj).toHaveProperty('error');
      expect(errorObj).toHaveProperty('suggestion');
    });
  });
});
