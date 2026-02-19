/**
 * Shared HTTP client with caching, retry, and error normalization.
 *
 * Replaces per-adapter fetch implementations.
 */

import { Cache } from '../../kernel/cache.js';
import { AdapterError } from '../../kernel/errors.js';

export interface HttpClientOptions {
  /** Base URL prepended to all requests */
  baseUrl?: string;
  /** Source name for error messages (e.g. "ESV", "HelloAO") */
  source: string;
  /** Cache TTL in ms (0 = no caching). Default: 1 hour */
  cacheTtlMs?: number;
  /** Max cache entries. Default: 200 */
  cacheMaxSize?: number;
  /** Max retries on 5xx / network errors. Default: 2 */
  maxRetries?: number;
  /** Default headers for all requests */
  headers?: Record<string, string>;
  /** Request timeout in ms. Default: 15000 */
  timeoutMs?: number;
}

export class HttpClient {
  private cache: Cache<string> | null;
  private readonly source: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(options: HttpClientOptions) {
    this.source = options.source;
    this.baseUrl = options.baseUrl ?? '';
    this.maxRetries = options.maxRetries ?? 2;
    this.headers = options.headers ?? {};
    this.timeoutMs = options.timeoutMs ?? 15000;

    const ttl = options.cacheTtlMs ?? 60 * 60 * 1000;
    this.cache = ttl > 0
      ? new Cache<string>(options.cacheMaxSize ?? 200, ttl)
      : null;
  }

  /** GET request, returning parsed JSON */
  async getJSON<T = unknown>(path: string, options?: { headers?: Record<string, string> }): Promise<T> {
    const url = this.baseUrl + path;
    const cacheKey = url;

    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) return JSON.parse(cached) as T;
    }

    const body = await this.fetchWithRetry(url, options?.headers);

    if (this.cache) {
      this.cache.set(cacheKey, body);
    }

    return JSON.parse(body) as T;
  }

  /** GET request, returning raw text */
  async getText(path: string, options?: { headers?: Record<string, string> }): Promise<string> {
    const url = this.baseUrl + path;
    const cacheKey = `text:${url}`;

    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) return cached;
    }

    const body = await this.fetchWithRetry(url, options?.headers);

    if (this.cache) {
      this.cache.set(cacheKey, body);
    }

    return body;
  }

  clearCache(): void {
    this.cache?.clear();
  }

  dispose(): void {
    this.cache?.dispose();
  }

  private async fetchWithRetry(url: string, extraHeaders?: Record<string, string>): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          headers: { ...this.headers, ...extraHeaders },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          if (response.status >= 500 && attempt < this.maxRetries) {
            await this.backoff(attempt);
            continue;
          }
          throw new AdapterError(
            this.source,
            `HTTP ${response.status}: ${response.statusText} for ${url}`
          );
        }

        return await response.text();
      } catch (error) {
        if (error instanceof AdapterError) throw error;

        lastError = error as Error;
        if (attempt < this.maxRetries) {
          await this.backoff(attempt);
          continue;
        }
      }
    }

    throw new AdapterError(
      this.source,
      `Request failed after ${this.maxRetries + 1} attempts: ${lastError?.message ?? 'unknown error'}`,
      lastError,
    );
  }

  private backoff(attempt: number): Promise<void> {
    const delay = Math.min(1000 * 2 ** attempt, 10000);
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}
