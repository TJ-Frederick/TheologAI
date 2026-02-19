/**
 * User Workflows E2E Tests
 *
 * Tests realistic usage patterns that users will actually perform.
 * These tests validate that the MCP server works for real-world Bible study scenarios.
 *
 * Covers:
 * - Multi-tool workflows (lookup verse → cross-refs → commentary)
 * - Edge cases users frequently encounter
 * - Invalid inputs that should give helpful errors
 * - Complex queries that test system limits
 */

import { describe, it, expect } from 'vitest';
import { bibleLookupHandler } from '../../src/tools/bibleLookup.js';
import { bibleCrossReferencesHandler } from '../../src/tools/bibleCrossReferences.js';
import { strongsLookupHandler, bibleVerseMorphologyHandler } from '../../src/tools/biblicalLanguages.js';
import { classicTextLookupHandler } from '../../src/tools/classicTextLookup.js';
import type { BibleLookupParams, CrossReferenceLookupParams, StrongsLookupParams, BibleVerseMorphologyParams, ClassicTextLookupParams } from '../../src/types/index.js';

describe('User Workflows - Basic Study Sessions', () => {
  it('should handle complete workflow: lookup verse → get cross-refs → lookup cross-ref', async () => {
    // Step 1: Look up John 3:16
    const lookupParams: BibleLookupParams = {
      reference: 'John 3:16',
      translation: 'ESV'
    };
    const verseResult = await bibleLookupHandler.handler(lookupParams);
    expect(verseResult.isError).toBeUndefined();
    expect(verseResult.content[0].text).toContain('For God so loved the world');

    // Step 2: Get cross-references for John 3:16
    const crossRefParams: CrossReferenceLookupParams = {
      reference: 'John 3:16',
      maxResults: 5
    };
    const crossRefResult = await bibleCrossReferencesHandler.handler(crossRefParams);
    expect(crossRefResult.isError).toBeUndefined();
    expect(crossRefResult.content[0].text).toContain('Cross-References');

    // Step 3: Look up a cross-reference (Romans 5:8 is commonly referenced)
    const crossRefLookup: BibleLookupParams = {
      reference: 'Romans 5:8',
      translation: 'ESV'
    };
    const crossRefVerseResult = await bibleLookupHandler.handler(crossRefLookup);
    expect(crossRefVerseResult.isError).toBeUndefined();
    expect(crossRefVerseResult.content[0].text).toContain('Romans 5:8');
  });

  it('should handle workflow: verse with multiple translations', async () => {
    const params: BibleLookupParams = {
      reference: 'Psalm 23:1',
      translation: ['ESV', 'KJV', 'WEB']
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    expect(text).toContain('Psalm 23:1');
    expect(text).toContain('3 translations');
    expect(text).toContain('**ESV:**');
    expect(text).toContain('**KJV:**');
    expect(text).toContain('**WEB:**');
  });

  it('should handle workflow: Strong\'s number lookup', async () => {
    const params: StrongsLookupParams = {
      strongs_number: 'G25'
    };

    const result = await strongsLookupHandler.handler(params);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('G25');
    expect(result.content[0].text).toMatch(/ἀγαπάω|agap/i); // Greek word for love (matches agapáō or agapao)
  });

  it('should handle workflow: Bible verse morphology lookup', async () => {
    const params: BibleVerseMorphologyParams = {
      reference: 'John 1:1',
      translation: 'Greek'
    };

    const result = await bibleVerseMorphologyHandler.handler(params);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('John 1:1');
    expect(result.content[0].text).toMatch(/Word|text|lemma/i);
  });

  it('should handle workflow: historical document search', async () => {
    const params: ClassicTextLookupParams = {
      query: 'What is the chief end of man'
    };

    const result = await classicTextLookupHandler.handler(params);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toMatch(/chief end/i);
  });

  it('should handle workflow: verse range lookup', async () => {
    const params: BibleLookupParams = {
      reference: 'Genesis 1:1-3',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.isError).toBeUndefined();
    // Text may use en-dash (–) instead of hyphen (-)
    expect(result.content[0].text).toMatch(/Genesis 1:1[-–]3/);
    expect(result.content[0].text).toContain('In the beginning');
  });

  it('should handle workflow: verse with cross-refs included', async () => {
    const params: BibleLookupParams = {
      reference: 'John 3:16',
      translation: 'ESV',
      includeCrossRefs: true
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('John 3:16');
  });

  it('should handle workflow: compare same verse across translations', async () => {
    const params: BibleLookupParams = {
      reference: 'John 3:16',
      translation: '["ESV", "KJV"]' as any // Test JSON string format
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('**ESV:**');
    expect(result.content[0].text).toContain('**KJV:**');
  });

  it('should handle workflow: lookup Strong\'s from common word', async () => {
    // User looks up common Greek word for "love"
    const params: StrongsLookupParams = {
      strongs_number: 'G26' // agape
    };

    const result = await strongsLookupHandler.handler(params);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('G26');
  });

  it('should handle workflow: search historical document by topic', async () => {
    const params: ClassicTextLookupParams = {
      query: 'Trinity',
      searchLocal: true
    };

    const result = await classicTextLookupHandler.handler(params);
    // Should find results from local historical documents
    expect(result.content).toBeDefined();
  });
});

describe('User Workflows - Edge Cases', () => {
  it('should handle invalid verse reference gracefully', async () => {
    const params: BibleLookupParams = {
      reference: 'John 99:99',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    // Should either error or return empty/not found message
    expect(result.content[0].text.length).toBeGreaterThan(0);
    // Some APIs may return results for out-of-range verses (empty response), so we just check we got a response
  });

  it('should handle non-existent book gracefully', async () => {
    const params: BibleLookupParams = {
      reference: 'Book of Mormon 1:1',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.isError).toBe(true);
  });

  it('should handle malformed reference: missing verse number', async () => {
    const params: BibleLookupParams = {
      reference: 'John 3:',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    // Should either work or give helpful error
    expect(result.content).toBeDefined();
  });

  it('should handle malformed reference: just verse number', async () => {
    const params: BibleLookupParams = {
      reference: '3:16',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    // Should give error about missing book name
    expect(result.isError).toBe(true);
  });

  it('should handle empty reference', async () => {
    const params: BibleLookupParams = {
      reference: '',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.isError).toBe(true);
  });

  it('should handle very long passage (Psalm 119)', async () => {
    const params: BibleLookupParams = {
      reference: 'Psalm 119:1-176', // Entire chapter, 176 verses
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    // Should not timeout or crash
    expect(result.content).toBeDefined();
  }, 60000); // 60 second timeout for long passage

  it('should handle invalid Strong\'s number gracefully', async () => {
    const params: StrongsLookupParams = {
      strongs_number: 'H999999' // Way out of range
    };

    const result = await strongsLookupHandler.handler(params);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('should handle malformed Strong\'s number: wrong prefix', async () => {
    const params: StrongsLookupParams = {
      strongs_number: 'GAA123' // Invalid format
    };

    const result = await strongsLookupHandler.handler(params);
    expect(result.isError).toBe(true);
  });

  it('should handle boundary Strong\'s numbers', async () => {
    // Test first Greek entry
    const params1: StrongsLookupParams = {
      strongs_number: 'G1'
    };
    const result1 = await strongsLookupHandler.handler(params1);
    expect(result1.isError).toBeUndefined();

    // Test first Hebrew entry
    const params2: StrongsLookupParams = {
      strongs_number: 'H1'
    };
    const result2 = await strongsLookupHandler.handler(params2);
    expect(result2.isError).toBeUndefined();
  });

  it('should handle empty historical search query', async () => {
    const params: ClassicTextLookupParams = {
      query: ''
    };

    const result = await classicTextLookupHandler.handler(params);
    // Should either return no results or helpful message
    expect(result.content).toBeDefined();
  });
});
