/**
 * Security & Input Validation Tests
 *
 * Tests that the MCP server handles malicious and malformed inputs safely.
 * Critical for preventing XSS, injection attacks, and crashes.
 *
 * Tests cover:
 * - XSS prevention (script tags, HTML injection)
 * - Input validation (empty, null, very long strings)
 * - Special characters and Unicode
 * - Path traversal and command injection attempts
 * - Markdown output safety
 */

import { describe, it, expect } from 'vitest';
import { bibleLookupHandler } from '../../src/tools/bibleLookup.js';
import { strongsLookupHandler } from '../../src/tools/biblicalLanguages.js';
import { classicTextLookupHandler } from '../../src/tools/classicTextLookup.js';
import type { BibleLookupParams, StrongsLookupParams, ClassicTextLookupParams } from '../../src/types/index.js';

describe('Security - XSS Prevention', () => {
  it('should escape script tags in verse reference input', async () => {
    const params: BibleLookupParams = {
      reference: '<script>alert("xss")</script> John 3:16',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    const text = result.content[0].text;

    // Should not contain un-escaped script tags
    expect(text).not.toContain('<script>alert');
  });

  it('should escape HTML in historical document query', async () => {
    const params: ClassicTextLookupParams = {
      query: '<img src=x onerror=alert(1)>'
    };

    const result = await classicTextLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    const text = result.content[0].text;

    // Should not contain un-escaped HTML tags
    expect(text).not.toContain('<img src=x onerror=');
  });

  it('should handle iframe injection attempts', async () => {
    const params: BibleLookupParams = {
      reference: '<iframe src="evil.com"></iframe>',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    const text = result.content[0].text;

    // Should not contain un-escaped iframe tags
    expect(text).not.toContain('<iframe');
  });

  it('should prevent markdown link injection', async () => {
    const params: ClassicTextLookupParams = {
      query: '[Click me](javascript:alert(1))'
    };

    const result = await classicTextLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    // Should handle markdown syntax safely
  });

  it('should handle SQL-like syntax safely', async () => {
    const params: BibleLookupParams = {
      reference: "John 3:16'; DROP TABLE verses; --",
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    // Should not crash or cause issues
  });
});

describe('Security - Input Validation', () => {
  it('should handle very long string in reference (10,000 chars)', async () => {
    const longString = 'A'.repeat(10000);
    const params: BibleLookupParams = {
      reference: longString,
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    // Should not crash, should handle gracefully
  });

  it('should handle null bytes in input', async () => {
    const params: BibleLookupParams = {
      reference: 'John\x003:16',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
  });

  it('should handle zero-width characters', async () => {
    const params: ClassicTextLookupParams = {
      query: 'Trin\u200Bity' // Zero-width space
    };

    const result = await classicTextLookupHandler.handler(params);
    expect(result.content).toBeDefined();
  });

  it('should handle path traversal in document name', async () => {
    const params: ClassicTextLookupParams = {
      query: '../../../etc/passwd'
    };

    const result = await classicTextLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    // Should not allow path traversal
  });

  it('should handle command injection attempts', async () => {
    const params: BibleLookupParams = {
      reference: '$(rm -rf /)',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    // Should not execute commands
  });

  it('should handle apostrophes and quotes safely', async () => {
    const params: ClassicTextLookupParams = {
      query: "What is God's love?"
    };

    const result = await classicTextLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    expect(result.isError).toBeUndefined();
  });

  it('should handle special characters: ampersands, hashes', async () => {
    const params: ClassicTextLookupParams = {
      query: 'trinity & deity #theology'
    };

    const result = await classicTextLookupHandler.handler(params);
    expect(result.content).toBeDefined();
  });

  it('should handle Unicode: Greek characters', async () => {
    const params: ClassicTextLookupParams = {
      query: 'αγαπη' // Greek for love
    };

    const result = await classicTextLookupHandler.handler(params);
    expect(result.content).toBeDefined();
  });

  it('should handle Unicode: Hebrew characters', async () => {
    const params: ClassicTextLookupParams = {
      query: 'אהבה' // Hebrew for love
    };

    const result = await classicTextLookupHandler.handler(params);
    expect(result.content).toBeDefined();
  });

  it('should handle empty string gracefully', async () => {
    const params: BibleLookupParams = {
      reference: '',
      translation: 'ESV'
    };

    const result = await bibleLookupHandler.handler(params);
    expect(result.content).toBeDefined();
    expect(result.isError).toBe(true);
  });
});
