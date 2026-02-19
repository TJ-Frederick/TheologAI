/**
 * Test Helper Utilities
 *
 * Shared utilities for writing cleaner, more maintainable tests
 */

import type { BibleResult, CommentaryResult, Footnote } from '../../src/types/index.js';

/**
 * Create a mock BibleResult for testing
 */
export function createMockBibleResult(overrides?: Partial<BibleResult>): BibleResult {
  return {
    reference: 'John 3:16',
    translation: 'ESV',
    text: 'For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.',
    citation: {
      source: 'ESV Bible',
      copyright: '© 2001 Crossway Bibles',
      url: 'https://api.esv.org'
    },
    ...overrides
  };
}

/**
 * Create a mock CommentaryResult for testing
 */
export function createMockCommentaryResult(overrides?: Partial<CommentaryResult>): CommentaryResult {
  return {
    reference: 'John 3:16',
    commentator: 'Matthew Henry',
    text: 'God so loved the world - A comprehensive commentary on this famous verse...',
    citation: {
      source: 'Matthew Henry\'s Complete Commentary',
      url: 'https://helloao.org'
    },
    ...overrides
  };
}

/**
 * Create a mock Footnote for testing
 */
export function createMockFootnote(overrides?: Partial<Footnote>): Footnote {
  return {
    id: 1,
    caller: 'a',
    text: 'Or only begotten',
    reference: {
      chapter: 3,
      verse: 16
    },
    ...overrides
  };
}

/**
 * Wait for a specific time (useful for cache/timing tests)
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Assert that a string contains a substring (case-insensitive)
 */
export function assertContains(text: string, substring: string): void {
  const lowerText = text.toLowerCase();
  const lowerSubstring = substring.toLowerCase();
  if (!lowerText.includes(lowerSubstring)) {
    throw new Error(`Expected "${text}" to contain "${substring}"`);
  }
}

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Expected value to be defined');
  }
}

/**
 * Create a mock fetch response
 */
export function createMockResponse(data: any, status = 200, ok = true): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => data,
    text: async () => typeof data === 'string' ? data : JSON.stringify(data),
    headers: new Headers({
      'content-type': 'application/json'
    })
  } as Response;
}

/**
 * Generate a random book/chapter/verse reference
 */
export function randomReference(): string {
  const books = ['Genesis', 'John', 'Romans', 'Psalm', 'Revelation'];
  const book = books[Math.floor(Math.random() * books.length)];
  const chapter = Math.floor(Math.random() * 10) + 1;
  const verse = Math.floor(Math.random() * 20) + 1;
  return `${book} ${chapter}:${verse}`;
}

/**
 * Verify that an object has required properties
 */
export function hasRequiredProperties<T extends object>(
  obj: T,
  properties: (keyof T)[]
): boolean {
  return properties.every(prop => prop in obj && obj[prop] !== undefined);
}
