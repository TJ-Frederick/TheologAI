import { describe, it, expect, vi, afterEach } from 'vitest';
import { Cache } from '../../../src/kernel/cache.js';

describe('Cache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores and retrieves values', () => {
    const cache = new Cache<string>(10);
    cache.set('a', 'hello');
    expect(cache.get('a')).toBe('hello');
  });

  it('returns undefined for missing keys', () => {
    const cache = new Cache<string>(10);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts LRU entry when full', () => {
    const cache = new Cache<string>(2);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3'); // should evict 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });

  it('promotes accessed entries', () => {
    const cache = new Cache<string>(2);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.get('a'); // access 'a', making 'b' the LRU
    cache.set('c', '3'); // should evict 'b'
    expect(cache.get('a')).toBe('1');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('3');
  });

  it('expires entries after TTL', () => {
    vi.useFakeTimers();
    const cache = new Cache<string>(10, 1000); // 1 second TTL
    cache.set('a', 'hello');
    expect(cache.get('a')).toBe('hello');

    vi.advanceTimersByTime(1001);
    expect(cache.get('a')).toBeUndefined();
    vi.useRealTimers();
  });

  it('has() returns false for expired entries', () => {
    vi.useFakeTimers();
    const cache = new Cache<string>(10, 100);
    cache.set('a', 'hello');
    expect(cache.has('a')).toBe(true);

    vi.advanceTimersByTime(101);
    expect(cache.has('a')).toBe(false);
    vi.useRealTimers();
  });

  it('clear() removes all entries', () => {
    const cache = new Cache<string>(10);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('updates existing entries in place', () => {
    const cache = new Cache<string>(10);
    cache.set('a', '1');
    cache.set('a', '2');
    expect(cache.get('a')).toBe('2');
    expect(cache.size()).toBe(1);
  });

  it('cleanup() removes expired entries', () => {
    vi.useFakeTimers();
    const cache = new Cache<string>(10, 100);
    cache.set('a', '1');
    cache.set('b', '2');
    vi.advanceTimersByTime(101);
    cache.cleanup();
    expect(cache.size()).toBe(0);
    vi.useRealTimers();
  });

  it('getOrSet() caches computed values', async () => {
    const cache = new Cache<string>(10);
    const compute = vi.fn(async () => 'computed');

    const v1 = await cache.getOrSet('key', compute);
    expect(v1).toBe('computed');
    expect(compute).toHaveBeenCalledTimes(1);

    const v2 = await cache.getOrSet('key', compute);
    expect(v2).toBe('computed');
    expect(compute).toHaveBeenCalledTimes(1); // not called again
  });

  it('dispose() cleans up', () => {
    const cache = new Cache<string>(10, 1000, 500);
    cache.set('a', '1');
    cache.dispose();
    expect(cache.size()).toBe(0);
  });
});
