/**
 * Bible Lookup Integration Tests
 *
 * Tests the complete flow: bibleLookupHandler → BibleService → Adapters → formatBibleResponse
 * Uses real BibleService with mock data (no adapter mocking)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bibleLookupHandler } from '../../src/tools/bibleLookup.js';
import type { BibleLookupParams } from '../../src/types/index.js';

describe('Bible Lookup Integration Tests', () => {
  describe('Single Translation Lookups', () => {
    it('should fetch ESV translation by default', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('John 3:16');
      expect(result.content[0].text).toContain('ESV');
      expect(result.content[0].text).toContain('For God so loved the world');
    });

    it('should fetch ESV translation explicitly', async () => {
      const params: BibleLookupParams = {
        reference: 'Genesis 1:1',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Genesis 1:1');
      expect(result.content[0].text).toContain('ESV');
      expect(result.content[0].text).toContain('In the beginning, God created');
    });

    it('should fetch NET translation', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'NET'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('John 3:16');
      expect(result.content[0].text).toContain('NET');
      expect(result.content[0].text).toContain('Source: NET Bible');
    });

    it('should fetch KJV translation from HelloAO', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'KJV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('John 3:16');
      expect(result.content[0].text).toContain('KJV');
    });

    it('should fetch WEB translation from HelloAO', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'WEB'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('John 3:16');
      expect(result.content[0].text).toContain('WEB');
    });

    it('should fetch BSB translation from HelloAO', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'BSB'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('John 3:16');
      expect(result.content[0].text).toContain('BSB');
    });
  });

  describe('Multiple Translation Comparisons', () => {
    it('should compare ESV and KJV translations', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: ['ESV', 'KJV']
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('John 3:16');
      expect(result.content[0].text).toContain('2 translations');
      expect(result.content[0].text).toContain('ESV:');
      expect(result.content[0].text).toContain('KJV:');
    });

    it('should compare three translations (ESV, KJV, WEB)', async () => {
      const params: BibleLookupParams = {
        reference: 'Genesis 1:1',
        translation: ['ESV', 'KJV', 'WEB']
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Genesis 1:1');
      expect(result.content[0].text).toContain('3 translations');
      expect(result.content[0].text).toContain('ESV:');
      expect(result.content[0].text).toContain('KJV:');
      expect(result.content[0].text).toContain('WEB:');
    });

    it('should handle JSON-stringified translation array', async () => {
      const params: BibleLookupParams = {
        reference: 'Romans 8:28',
        translation: '["ESV", "NET"]' as any
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Romans 8:28');
      expect(result.content[0].text).toContain('ESV:');
      expect(result.content[0].text).toContain('NET:');
    });

    it('should compare all available translations', async () => {
      const params: BibleLookupParams = {
        reference: 'Psalm 23:1',
        translation: ['ESV', 'NET', 'KJV', 'WEB', 'BSB']
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Psalm 23:1');
      expect(result.content[0].text).toContain('5 translations');
      expect(result.content[0].text).toContain('ESV:');
      expect(result.content[0].text).toContain('NET:');
      expect(result.content[0].text).toContain('KJV:');
      expect(result.content[0].text).toContain('WEB:');
      expect(result.content[0].text).toContain('BSB:');
    });
  });

  describe('Verse Ranges', () => {
    it('should fetch verse range (Genesis 1:1-3)', async () => {
      const params: BibleLookupParams = {
        reference: 'Genesis 1:1-3',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Genesis 1:1');
      expect(result.content[0].text).toContain('In the beginning');
      expect(result.content[0].text).toContain('darkness');
      expect(result.content[0].text).toContain('light');
    });

    it('should fetch multi-verse passage (Philippians 2:6-11)', async () => {
      const params: BibleLookupParams = {
        reference: 'Philippians 2:6-11',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Philippians 2:6');
      expect(result.content[0].text).toContain('form of God');
      expect(result.content[0].text).toContain('every knee should bow');
    });

    it('should fetch Great Commission (Matthew 28:19-20)', async () => {
      const params: BibleLookupParams = {
        reference: 'Matthew 28:19-20',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Matthew 28:19');
      expect(result.content[0].text).toContain('make disciples');
      expect(result.content[0].text).toContain('baptizing');
    });
  });

  describe('Footnotes', () => {
    it('should request footnotes when enabled', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'KJV',
        includeFootnotes: true
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('John 3:16');
      // Footnotes may or may not be present depending on the translation/verse
      // but the request should not fail
      expect(result.content).toBeDefined();
    });

    it('should not include footnotes by default', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      // Default behavior - no footnotes section unless explicitly enabled
      expect(result.content[0].text).toContain('John 3:16');
    });
  });

  describe('Cross-References', () => {
    it('should request cross-references when enabled (mock data)', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV',
        includeCrossRefs: true
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('John 3:16');
      // Cross-refs included in mock data
      expect(result.content[0].text).toContain('Cross References');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid reference gracefully', async () => {
      const params: BibleLookupParams = {
        reference: 'InvalidBook 1:1',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('error');
    });

    it('should handle non-existent verse in mock data', async () => {
      const params: BibleLookupParams = {
        reference: 'Revelation 22:21', // Not in mock data
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      // Should fall back to API or return error
      expect(result.content).toBeDefined();
    });

    it('should handle malformed translation parameter', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: '' as any
      };

      const result = await bibleLookupHandler.handler(params);

      // Should default to ESV
      expect(result.content[0].text).toContain('John 3:16');
    });

    it('should handle chapter-only reference error', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3', // Chapter only, no verse
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      // Behavior depends on adapter - should either fetch or error
      expect(result.content).toBeDefined();
    });
  });

  describe('Mock Data Coverage', () => {
    it('should fetch Romans 8:28 from mock data', async () => {
      const params: BibleLookupParams = {
        reference: 'Romans 8:28',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Romans 8:28');
      expect(result.content[0].text).toContain('all things work together for good');
    });

    it('should fetch Isaiah 53:5 from mock data', async () => {
      const params: BibleLookupParams = {
        reference: 'Isaiah 53:5',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Isaiah 53:5');
      expect(result.content[0].text).toContain('pierced for our transgressions');
    });

    it('should fetch Jeremiah 29:11 from mock data', async () => {
      const params: BibleLookupParams = {
        reference: 'Jeremiah 29:11',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Jeremiah 29:11');
      expect(result.content[0].text).toContain('plans for welfare');
    });

    it('should fetch Ephesians 2:8-9 from mock data', async () => {
      const params: BibleLookupParams = {
        reference: 'Ephesians 2:8-9',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Ephesians 2:8');
      expect(result.content[0].text).toContain('by grace you have been saved');
      expect(result.content[0].text).toContain('not a result of works');
    });

    it('should fetch Philippians 4:13 from mock data', async () => {
      const params: BibleLookupParams = {
        reference: 'Philippians 4:13',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Philippians 4:13');
      expect(result.content[0].text).toContain('I can do all things');
    });
  });

  describe('Response Formatting', () => {
    it('should include proper citation for ESV', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Source:');
      expect(result.content[0].text).toContain('ESV');
    });

    it('should include proper citation for NET', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'NET'
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Source:');
      expect(result.content[0].text).toContain('NET');
    });

    it('should format multi-translation response with sources', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: ['ESV', 'KJV']
      };

      const result = await bibleLookupHandler.handler(params);

      expect(result.content[0].text).toContain('Sources:');
    });
  });
});
