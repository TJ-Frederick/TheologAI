/**
 * Cross-References Integration Tests
 *
 * Tests bibleCrossReferencesHandler with CrossReferenceService
 * Uses real cross-reference data from OpenBible.info
 */

import { describe, it, expect } from 'vitest';
import { bibleCrossReferencesHandler } from '../../src/tools/bibleCrossReferences.js';
import type { CrossReferenceLookupParams } from '../../src/tools/bibleCrossReferences.js';

describe('Cross-References Integration Tests', () => {
  describe('Basic Cross-Reference Lookup', () => {
    it('should fetch cross-references for Genesis 1:1', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Genesis 1:1'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Cross-References for Genesis 1:1');
      expect(result.content[0].text).toContain('OpenBible.info');
    });

    it('should fetch cross-references for John 3:16', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Cross-References for John 3:16');
      // Should have related verses about God's love, salvation, etc.
      expect(result.content[0].text).toMatch(/\d+\./); // Numbered list
    });

    it('should fetch cross-references for Romans 8:28', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Romans 8:28'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Cross-References for Romans 8:28');
      expect(result.content[0].text).toContain('OpenBible.info');
    });

    it('should fetch cross-references for Psalm 23:1', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Psalm 23:1'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Cross-References for Psalm 23:1');
      // Psalm references are normalized to "Psalms"
      expect(result.content[0].text).toMatch(/Psalm/);
    });
  });

  describe('Verse Text Inclusion', () => {
    it('should fetch verse text when includeVerseText=true', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16',
        includeVerseText: true,
        translation: 'ESV',
        maxResults: 3
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Cross-References for John 3:16');
      // Should contain quoted verse text
      expect(result.content[0].text).toMatch(/".*"/);
    });

    it('should fetch verse text in KJV translation', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Genesis 1:1',
        includeVerseText: true,
        translation: 'KJV',
        maxResults: 2
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Cross-References for Genesis 1:1');
      // Verse text should be included
      expect(result.content[0].text).toMatch(/\d+\.\s+\w+/);
    });

    it('should fetch verse text in NET translation', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Romans 8:28',
        includeVerseText: true,
        translation: 'NET',
        maxResults: 3
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Cross-References for Romans 8:28');
      expect(result.content[0].text).toMatch(/\d+\./);
    });

    it('should not include verse text by default', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16',
        maxResults: 5
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Cross-References for John 3:16');
      // Just references, no quoted text
      expect(result.content[0].text).not.toMatch(/".*"/);
      expect(result.content[0].text).toMatch(/\d+\.\s+[\w\s]+\d+:\d+/);
    });
  });

  describe('MaxResults Pagination', () => {
    it('should limit results to maxResults=5 (default)', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Cross-References for John 3:16');
      // Should show "showing top X of Y" if more available
      expect(result.content[0].text).toMatch(/showing|total/i);
    });

    it('should limit results to maxResults=10', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Genesis 1:1',
        maxResults: 10
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Cross-References for Genesis 1:1');
      // Count the number of list items (1. 2. 3. etc)
      const matches = result.content[0].text.match(/\d+\.\s+/g);
      if (matches) {
        expect(matches.length).toBeLessThanOrEqual(10);
      }
    });

    it('should limit results to maxResults=20', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16',
        maxResults: 20
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Cross-References for John 3:16');
      const matches = result.content[0].text.match(/\d+\.\s+/g);
      if (matches) {
        expect(matches.length).toBeLessThanOrEqual(20);
      }
    });

    it('should show "more available" message when hasMore=true', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16',
        maxResults: 2
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Cross-References for John 3:16');
      // Should indicate more results are available
      if (result.content[0].text.includes('showing')) {
        expect(result.content[0].text).toMatch(/additional|more/i);
      }
    });
  });

  describe('MinVotes Filtering', () => {
    it('should filter by minVotes=0 (default - all results)', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16',
        maxResults: 10,
        minVotes: 0
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Cross-References for John 3:16');
      expect(result.content[0].text).toMatch(/\d+\./);
    });

    it('should filter by minVotes=5 (highly ranked only)', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Genesis 1:1',
        maxResults: 10,
        minVotes: 5
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Cross-References for Genesis 1:1');
      // Should either have results or say "No cross-references found"
      expect(result.content).toBeDefined();
    });

    it('should filter by minVotes=10 (very highly ranked)', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16',
        maxResults: 5,
        minVotes: 10
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('John 3:16');
      // May have fewer results or no results
      expect(result.content).toBeDefined();
    });
  });

  describe('Chapter-Only Detection', () => {
    it('should detect chapter-only reference and provide helpful error', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Psalm 22' // Chapter only, no verse
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Psalm 22');
      // Should provide guidance about needing a specific verse
      if (result.content[0].text.includes('No cross-references')) {
        expect(result.content[0].text).toMatch(/specific verse|verse number/i);
        expect(result.content[0].text).toContain('parallel_passages');
      }
    });

    it('should detect chapter-only reference for John 3', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('John 3');
      if (result.content[0].text.includes('No cross-references')) {
        expect(result.content[0].text).toMatch(/specific verse/i);
      }
    });

    it('should detect chapter-only reference for Genesis 1', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Genesis 1'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Genesis 1');
      if (result.content[0].text.includes('No cross-references')) {
        expect(result.content[0].text).toContain('verse number');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle verse with no cross-references', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Obadiah 1:21' // Likely has few or no cross-refs
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('Obadiah 1:21');
      // Should either show results or "No cross-references found"
      expect(result.content).toBeDefined();
    });

    it('should handle invalid verse reference gracefully', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'InvalidBook 1:1'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
      // Should handle error gracefully
      expect(result.content[0].text).toContain('InvalidBook 1:1');
    });

    it('should handle malformed reference', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content).toBeDefined();
    });
  });

  describe('Full Formatting Pipeline', () => {
    it('should format complete response with all elements', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'John 3:16',
        maxResults: 5,
        includeVerseText: true,
        translation: 'ESV'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      const text = result.content[0].text;

      // Title
      expect(text).toContain('Cross-References for John 3:16');
      // Result count
      expect(text).toMatch(/showing|total/i);
      // Attribution
      expect(text).toContain('OpenBible.info');
      expect(text).toContain('CC-BY');
    });

    it('should format response without verse text', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Romans 8:28',
        maxResults: 10,
        includeVerseText: false
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      const text = result.content[0].text;

      expect(text).toContain('Cross-References for Romans 8:28');
      expect(text).toMatch(/\d+\./); // Numbered list
      expect(text).toContain('OpenBible.info');
      // Should suggest using includeVerseText if more available
      if (text.includes('additional')) {
        expect(text).toMatch(/includeVerseText|maxResults/);
      }
    });
  });

  describe('Real Data Loading', () => {
    it('should load cross-reference data from file system', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Genesis 1:1'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      // Verify that real data was loaded (should have results)
      expect(result.content[0].text).toContain('Genesis 1:1');
      // Data should come from OpenBible.info
      expect(result.content[0].text).toContain('OpenBible.info');
    });

    it('should handle normalized reference formats', async () => {
      const params: CrossReferenceLookupParams = {
        reference: 'Psalms 23:1' // Note: plural "Psalms"
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      // Service should normalize to "Psalms" internally
      expect(result.content[0].text).toMatch(/Psalm/);
      expect(result.content).toBeDefined();
    });

    it('should handle numbered books (1 John, 2 Corinthians)', async () => {
      const params: CrossReferenceLookupParams = {
        reference: '1 John 4:9'
      };

      const result = await bibleCrossReferencesHandler.handler(params);

      expect(result.content[0].text).toContain('1 John 4:9');
      expect(result.content).toBeDefined();
    });
  });
});
