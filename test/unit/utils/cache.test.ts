/**
 * Cache Utility Tests
 *
 * Tests for in-memory caching with TTL and LRU eviction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Cache } from '../../../src/utils/cache.js';
import { wait } from '../../helpers/testHelpers.js';

describe('Cache', () => {
  let cache: Cache<string>;

  beforeEach(() => {
    cache = new Cache<string>(100, 3600000); // Max 100 entries, 1 hour TTL
  });

  describe('Basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBeUndefined();
    });

    it('should return correct size', () => {
      expect(cache.size()).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire entries after TTL', async () => {
      const shortTtlCache = new Cache<string>(100, 100); // 100ms TTL
      shortTtlCache.set('key1', 'value1');

      expect(shortTtlCache.get('key1')).toBe('value1');

      await wait(150); // Wait for expiration

      expect(shortTtlCache.get('key1')).toBeUndefined();
    });

    it('should not expire entries before TTL', async () => {
      const longTtlCache = new Cache<string>(100, 1000); // 1 second TTL
      longTtlCache.set('key1', 'value1');

      await wait(100); // Wait less than TTL

      expect(longTtlCache.get('key1')).toBe('value1');
    });

    it('should update expiration time on refresh', async () => {
      const testCache = new Cache<string>(100, 500); // 500ms TTL
      testCache.set('key1', 'value1');
      const firstExpiry = (testCache as any).cache.get('key1')?.expiry;

      await wait(100);
      testCache.set('key1', 'value1-updated');

      const secondExpiry = (testCache as any).cache.get('key1')?.expiry;

      expect(secondExpiry).toBeGreaterThan(firstExpiry);
    });
  });

  describe('LRU (Least Recently Used) eviction', () => {
    it('should evict least recently used entries when max size reached', async () => {
      const lruCache = new Cache<string>(3, 3600000); // Max 3 entries

      lruCache.set('key1', 'value1');
      await wait(10); // Ensure different timestamps
      lruCache.set('key2', 'value2');
      await wait(10);
      lruCache.set('key3', 'value3');
      await wait(10);
      lruCache.set('key4', 'value4'); // Should evict key1 (oldest)

      expect(lruCache.get('key1')).toBeUndefined();
      expect(lruCache.get('key2')).toBe('value2');
      expect(lruCache.get('key3')).toBe('value3');
      expect(lruCache.get('key4')).toBe('value4');
    });

    it('should update access time on get', async () => {
      const lruCache = new Cache<string>(3, 3600000);

      lruCache.set('key1', 'value1');
      await wait(10);
      lruCache.set('key2', 'value2');
      await wait(10);
      lruCache.set('key3', 'value3');

      // Access key1 to make it most recently used
      await wait(10);
      lruCache.get('key1');

      await wait(10);
      lruCache.set('key4', 'value4'); // Should evict key2 (least recently used)

      expect(lruCache.get('key1')).toBe('value1'); // Still exists
      expect(lruCache.get('key2')).toBeUndefined(); // Evicted
      expect(lruCache.get('key3')).toBe('value3');
      expect(lruCache.get('key4')).toBe('value4');
    });

    it('should handle large size limit', () => {
      const largeCache = new Cache<string>(1000, 3600000);

      for (let i = 0; i < 100; i++) {
        largeCache.set(`key${i}`, `value${i}`);
      }

      expect(largeCache.size()).toBe(100);
      expect(largeCache.get('key0')).toBe('value0');
      expect(largeCache.get('key99')).toBe('value99');
    });
  });

  describe('Edge cases', () => {
    it('should handle storing null values', () => {
      cache.set('null-key', null as any);
      expect(cache.get('null-key')).toBeNull();
    });

    it('should handle empty string keys', () => {
      cache.set('', 'empty-key-value');
      expect(cache.get('')).toBe('empty-key-value');
    });

    it('should handle overwriting values', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
    });

    it('should handle rapid successive operations', () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      for (let i = 0; i < 100; i++) {
        expect(cache.get(`key${i}`)).toBe(`value${i}`);
      }
    });

    it('should handle complex object values', () => {
      const complexObject = {
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
        date: new Date()
      };

      cache.set('complex', complexObject as any);
      expect(cache.get('complex')).toEqual(complexObject);
    });
  });

  describe('Memory management', () => {
    it('should clean up expired entries when accessed', async () => {
      const cleanupCache = new Cache<string>(100, 100); // 100ms TTL

      cleanupCache.set('key1', 'value1');
      cleanupCache.set('key2', 'value2');
      cleanupCache.set('key3', 'value3');

      expect(cleanupCache.size()).toBe(3);

      await wait(150); // Wait for expiration

      // Accessing expired entries should remove them
      expect(cleanupCache.get('key1')).toBeUndefined();
      expect(cleanupCache.get('key2')).toBeUndefined();
      expect(cleanupCache.get('key3')).toBeUndefined();
    });

    it('should not exceed maxSize limit', () => {
      const limitedCache = new Cache<string>(10, 3600000); // Max 10 entries

      // Add more entries than max size
      for (let i = 0; i < 100; i++) {
        limitedCache.set(`key${i}`, `value${i}`);
      }

      // Should never exceed max size
      expect(limitedCache.size()).toBeLessThanOrEqual(10);
    });

    it('should use cleanup method to remove expired entries', async () => {
      const testCache = new Cache<string>(100, 100); // 100ms TTL

      testCache.set('key1', 'value1');
      testCache.set('key2', 'value2');

      await wait(150);

      testCache.cleanup();

      expect(testCache.size()).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should handle get operations efficiently', () => {
      // Pre-populate cache
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        cache.get(`key${i}`);
      }
      const duration = Date.now() - start;

      // Should complete 100 gets in under 50ms
      expect(duration).toBeLessThan(50);
    });

    it('should handle set operations efficiently', () => {
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      const duration = Date.now() - start;

      // Should complete 100 sets in under 50ms
      expect(duration).toBeLessThan(50);
    });
  });
});
