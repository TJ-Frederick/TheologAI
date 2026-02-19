/**
 * E2E Tests: Bible Lookup Tool
 *
 * Full MCP tool execution tests for bibleLookupHandler
 * Tests input validation, translation handling, and formatted output
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bibleLookupHandler } from '../../src/tools/bibleLookup.js';
import type { BibleLookupParams } from '../../src/types/index.js';

describe('Bible Lookup Tool - E2E', () => {
  describe('Single Translation Requests', () => {
    it('should handle basic single verse lookup with ESV', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('John 3:16');
      expect(result.content[0].text).toContain('ESV');
      expect(result.content[0].text).toContain('For God so loved the world');
      expect(result.isError).toBeUndefined();
    });

    it('should handle single verse with KJV translation', async () => {
      const params: BibleLookupParams = {
        reference: 'Genesis 1:1',
        translation: 'KJV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Genesis 1:1');
      expect(result.content[0].text).toContain('KJV');
      expect(result.content[0].text).toContain('In the beginning');
    });

    it('should handle verse range with single translation', async () => {
      const params: BibleLookupParams = {
        reference: 'Genesis 1:1-3',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Genesis 1:1-3');
      expect(result.content[0].text).toContain('In the beginning');
      expect(result.content[0].text).toContain('ESV');
    });

    it('should default to ESV when translation not specified', async () => {
      const params: BibleLookupParams = {
        reference: 'Psalm 23:1'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Psalm 23:1');
      expect(result.content[0].text).toContain('ESV');
      expect(result.content[0].text).toContain('The Lord is my shepherd');
    });
  });

  describe('Multiple Translation Comparison', () => {
    it('should handle array of translations', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: ['ESV', 'KJV']
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should show multiple translations
      expect(text).toContain('John 3:16');
      expect(text).toContain('2 translations');
      expect(text).toContain('**ESV:**');
      expect(text).toContain('**KJV:**');
      expect(text).toContain('For God so loved the world');
    });

    it('should handle JSON-stringified array (Claude MCP compatibility)', async () => {
      const params: BibleLookupParams = {
        reference: 'Romans 8:28',
        translation: '["ESV", "NET", "KJV"]' as any
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should parse stringified array and show all three translations
      expect(text).toContain('Romans 8:28');
      expect(text).toContain('3 translations');
      expect(text).toContain('**ESV:**');
      expect(text).toContain('**NET:**');
      expect(text).toContain('**KJV:**');
    });

    it('should handle three translations comparison', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: ['ESV', 'KJV', 'WEB']
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      expect(text).toContain('3 translations');
      expect(text).toContain('**ESV:**');
      expect(text).toContain('**KJV:**');
      expect(text).toContain('**WEB:**');
    });
  });

  describe('Input Validation Against Schema', () => {
    it('should validate reference is required', async () => {
      const params = {
        translation: 'ESV'
      } as BibleLookupParams;

      const result = await bibleLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);
    });

    it('should handle invalid stringified array gracefully', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: '[ESV, KJV]' as any // Invalid JSON - missing quotes
      };

      const result = await bibleLookupHandler.handler(params);

      // Should treat as single translation string when parsing fails
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('should validate translation enum values', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      // Valid translation should succeed
      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
    });
  });

  describe('Error Response Formatting', () => {
    it('should format error via handleToolError for invalid reference', async () => {
      const params: BibleLookupParams = {
        reference: 'InvalidBook 1:1',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.isError).toBe(true);
    });

    it('should provide helpful error message', async () => {
      const params: BibleLookupParams = {
        reference: 'Book of Mormon 1:1',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      // Error message should be user-friendly
      expect(result.content[0].text.length).toBeGreaterThan(0);
    });
  });

  describe('formatToolResponse Integration', () => {
    it('should return properly formatted MCP response structure', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      // Verify MCP response structure
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should include citation in formatted response', async () => {
      const params: BibleLookupParams = {
        reference: 'Romans 8:28',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should include source citation
      expect(text).toContain('Source:');
      expect(text.toLowerCase()).toMatch(/esv|bible/i);
    });
  });

  describe('Advanced Features', () => {
    it('should handle includeFootnotes parameter', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'NET',
        includeFootnotes: true
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
      // Footnotes may or may not be present depending on translation
      expect(result.content[0].text).toContain('John 3:16');
    });

    it('should handle includeCrossRefs parameter', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV',
        includeCrossRefs: true
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('John 3:16');
    });
  });
});
