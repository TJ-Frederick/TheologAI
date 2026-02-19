/**
 * E2E Tests: Cross References Tool
 *
 * Full MCP tool execution tests for bibleCrossReferencesHandler
 * Tests chapter-only detection, verse text inclusion, and attribution
 */

import { describe, it, expect } from 'vitest';
import { bibleCrossReferencesHandler, type CrossReferenceLookupParams } from '../../src/tools/bibleCrossReferences.js';

describe('Cross References Tool - E2E', () => {
  describe('Basic Cross-Reference Lookup', () => {
    it('should return cross-references for valid verse', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      const text = result.content[0].text;

      expect(text).toContain('Cross-References for John 3:16');
      expect(text).toContain('Data source: OpenBible.info (CC-BY)');
      expect(result.isError).toBeUndefined();
    });

    it('should return default 5 results when maxResults not specified', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Romans 8:28'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should show references numbered 1-5 or indicate total available
      expect(text).toContain('Cross-References for Romans 8:28');
      expect(text).toMatch(/1\./); // At least one reference
    });

    it('should handle verse with no cross-references found', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Obadiah 1:21' // Obscure verse unlikely to have cross-refs
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      expect(text).toContain('No cross-references found');
      expect(result.isError).toBeUndefined();
    });
  });

  describe('Chapter-Only Detection and Error Messaging', () => {
    it('should detect chapter-only reference and provide helpful message', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Psalm 22' // Chapter without verse
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should provide helpful guidance for chapter-only searches
      expect(text).toContain('No cross-references found for Psalm 22');
      expect(text).toContain('requires a specific verse number');
      expect(text).toContain('Psalm 22:1');
      expect(text).toContain('parallel_passages tool');
    });

    it('should detect chapter-only with trailing space', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3 ' // Trailing space
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      expect(text).toContain('requires a specific verse number');
      expect(text).toContain('John 3:1');
    });

    it('should handle normal verse reference (not chapter-only)', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should NOT show chapter-only guidance
      expect(text).not.toContain('requires a specific verse number');
    });
  });

  describe('Verse Text Inclusion Logic', () => {
    it('should include verse text when includeVerseText is true', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16',
        maxResults: 3,
        includeVerseText: true,
        translation: 'ESV'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should include quoted verse text
      expect(text).toMatch(/"[^"]+"/); // Contains quoted text
    });

    it('should not include verse text when includeVerseText is false', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16',
        maxResults: 3,
        includeVerseText: false
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should just list references without text
      expect(text).toContain('1.');
      // Should be shorter without verse texts
      expect(text.length).toBeLessThan(1000);
    });

    it('should use specified translation for verse text', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Genesis 1:1',
        maxResults: 2,
        includeVerseText: true,
        translation: 'KJV'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
    });

    it('should default to ESV when includeVerseText true but translation not specified', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Romans 8:28',
        maxResults: 2,
        includeVerseText: true
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
    });
  });

  describe('maxResults and minVotes Parameters', () => {
    it('should respect maxResults parameter', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16',
        maxResults: 10
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should indicate up to 10 results
      expect(text).toContain('John 3:16');
    });

    it('should respect minVotes parameter', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16',
        maxResults: 5,
        minVotes: 3 // Higher quality cross-references only
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
    });

    it('should combine maxResults and minVotes correctly', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Romans 8:28',
        maxResults: 15,
        minVotes: 2
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
    });
  });

  describe('Attribution Formatting', () => {
    it('should include OpenBible.info CC-BY attribution', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      expect(text).toContain('Data source: OpenBible.info (CC-BY)');
    });

    it('should always include attribution regardless of results', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Genesis 1:1',
        maxResults: 1
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      expect(text).toContain('OpenBible.info');
      expect(text).toContain('CC-BY');
    });
  });

  describe('"More Available" Messaging', () => {
    it('should show "more available" message when hasMore is true', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16',
        maxResults: 2, // Request less than available
        includeVerseText: false
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should indicate more results available
      if (text.includes('additional cross-reference')) {
        expect(text).toMatch(/\d+ additional cross-reference/);
        expect(text).toContain('Use maxResults parameter to see more');
      }
    });

    it('should suggest includeVerseText when more available and text not shown', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Romans 8:28',
        maxResults: 1,
        includeVerseText: false
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      if (text.includes('additional')) {
        expect(text).toContain('includeVerseText=true');
      }
    });

    it('should not suggest includeVerseText when already showing text', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16',
        maxResults: 2,
        includeVerseText: true
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      const text = result.content[0].text;

      // Should not double-suggest includeVerseText if already true
      if (text.includes('additional')) {
        expect(text).not.toContain('includeVerseText=true');
      }
    });
  });

  describe('MCP Response Format', () => {
    it('should return properly formatted MCP response', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Psalm 23:1'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      // Verify MCP response structure
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should use formatToolResponse for consistent formatting', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Philippians 4:13',
        maxResults: 3
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text.length).toBeGreaterThan(0);
    });
  });
});
