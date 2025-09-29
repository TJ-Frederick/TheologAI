/**
 * Simple in-memory cache with TTL and LRU eviction
 */

interface CacheEntry<T> {
  value: T;
  expiry: number;
  lastAccessed: number;
}

export class Cache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number = 100, ttlMs: number = 60 * 60 * 1000) { // Default: 100 entries, 1 hour TTL
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Get a value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    // Update last accessed time for LRU
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  /**
   * Set a value in cache
   */
  set(key: string, value: T): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      expiry: now + this.ttlMs,
      lastAccessed: now
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Evict the least recently used entry
   */
  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }
}