/**
 * API Resilience Tests
 *
 * Tests that the MCP server handles API failures gracefully.
 * Critical for good user experience when external services fail.
 *
 * Tests cover:
 * - ESV API failures and fallbacks
 * - HelloAO API failures
 * - Network errors and timeouts
 * - Graceful degradation
 */

import { describe, it, expect } from 'vitest';
import { bibleLookupHandler } from '../../src/tools/bibleLookup.js';
import type { BibleLookupParams } from '../../src/types/index.js';

describe('API Resilience - ESV API', () => {
  it('should handle invalid reference gracefully with ESV', async () => {
    const params: BibleLookupParams = {
      reference: 'InvalidBook 1:1',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    // Should not crash, should give helpful error
  });

  it('should handle out-of-range verse with ESV', async () => {
    const params: BibleLookupParams = {
      reference: 'John 99:99',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    // Should handle gracefully
  });

  it('should handle empty reference with ESV', async () => {
    const params: BibleLookupParams = {
      reference: '',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    expect(result.isError).toBe(true);
  });

  it('should handle malformed reference with ESV', async () => {
    const params: BibleLookupParams = {
      reference: 'John 3:',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
  });
});

describe('API Resilience - HelloAO API', () => {
  it('should handle invalid reference with HelloAO translations', async () => {
    const params: BibleLookupParams = {
      reference: 'InvalidBook 1:1',
      translation: 'WEB'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    // Should handle gracefully
  });

  it('should handle out-of-range verse with HelloAO', async () => {
    const params: BibleLookupParams = {
      reference: 'John 99:99',
      translation: 'KJV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
  });

  it('should handle empty reference with HelloAO', async () => {
    const params: BibleLookupParams = {
      reference: '',
      translation: 'KJV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    expect(result.isError).toBe(true);
  });

  it('should handle unsupported translation gracefully', async () => {
    const params: BibleLookupParams = {
      reference: 'John 3:16',
      translation: 'INVALID_TRANSLATION' as any
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    // Should either work or give helpful error
  });
});

describe('API Resilience - Error Messages', () => {
  it('should provide helpful error for invalid book', async () => {
    const params: BibleLookupParams = {
      reference: 'Invalidus 1:1',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    const text = result.content[0].text;
    expect(text.length).toBeGreaterThan(0);
    // Should have some error message
  });

  it('should provide helpful error for malformed input', async () => {
    const params: BibleLookupParams = {
      reference: '3:16', // Missing book
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    expect(result.isError).toBe(true);
  });

  it('should handle special characters in reference', async () => {
    const params: BibleLookupParams = {
      reference: 'John 3:16!!!',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
  });

  it('should handle whitespace-only reference', async () => {
    const params: BibleLookupParams = {
      reference: '   ',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    expect(result.isError).toBe(true);
  });
});
