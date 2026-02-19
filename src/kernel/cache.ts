/**
 * Generic LRU cache with TTL for external API responses.
 *
 * Improvements over previous src/utils/cache.ts:
 *   - O(1) LRU eviction via doubly-linked list
 *   - Optional periodic cleanup interval
 *   - getOrSet() convenience method
 */

interface Node<T> {
  key: string;
  value: T;
  expiry: number;
  prev: Node<T> | null;
  next: Node<T> | null;
}

export class Cache<T> {
  private map = new Map<string, Node<T>>();
  private head: Node<T> | null = null;
  private tail: Node<T> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly maxSize: number = 100,
    private readonly ttlMs: number = 60 * 60 * 1000,
    cleanupIntervalMs?: number,
  ) {
    if (cleanupIntervalMs && cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
      // Don't prevent process exit
      if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
        this.cleanupTimer.unref();
      }
    }
  }

  get(key: string): T | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;

    if (Date.now() > node.expiry) {
      this.removeNode(node);
      this.map.delete(key);
      return undefined;
    }

    // Move to head (most recently used)
    this.moveToHead(node);
    return node.value;
  }

  set(key: string, value: T): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      existing.expiry = Date.now() + this.ttlMs;
      this.moveToHead(existing);
      return;
    }

    // Evict LRU if at capacity
    if (this.map.size >= this.maxSize) {
      this.evictTail();
    }

    const node: Node<T> = {
      key,
      value,
      expiry: Date.now() + this.ttlMs,
      prev: null,
      next: this.head,
    };

    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }

    this.map.set(key, node);
  }

  /** Get value or compute and cache it */
  async getOrSet(key: string, compute: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await compute();
    this.set(key, value);
    return value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  size(): number {
    return this.map.size;
  }

  /** Remove expired entries */
  cleanup(): void {
    const now = Date.now();
    for (const [key, node] of this.map) {
      if (now > node.expiry) {
        this.removeNode(node);
        this.map.delete(key);
      }
    }
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }

  // ── Linked-list operations ──

  private moveToHead(node: Node<T>): void {
    if (node === this.head) return;
    this.removeNode(node);
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private removeNode(node: Node<T>): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }

  private evictTail(): void {
    if (!this.tail) return;
    const evicted = this.tail;
    this.removeNode(evicted);
    this.map.delete(evicted.key);
  }
}
