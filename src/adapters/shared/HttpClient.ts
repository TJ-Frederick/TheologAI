/**
 * Shared HTTP client with caching, retry, and error normalization.
 *
 * Replaces per-adapter fetch implementations.
 */

import { AdapterError } from '../../kernel/errors.js';

const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_CACHE_BYTES = 8 * 1024 * 1024;

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
  /** Maximum accepted upstream response body. Default: 2 MiB. */
  maxResponseBytes?: number;
  /** Maximum aggregate UTF-8 cache weight. Default: 8 MiB. */
  maxCacheBytes?: number;
}

export class HttpClient {
  private cache: ResponseCache | null;
  private readonly source: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(options: HttpClientOptions) {
    this.source = options.source;
    this.baseUrl = options.baseUrl ?? '';
    this.maxRetries = options.maxRetries ?? 2;
    this.headers = options.headers ?? {};
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    if (!Number.isSafeInteger(this.maxResponseBytes) || this.maxResponseBytes < 1) {
      throw new Error('maxResponseBytes must be a positive safe integer');
    }

    const ttl = options.cacheTtlMs ?? 60 * 60 * 1000;
    this.cache = ttl > 0
      ? new ResponseCache(
        options.cacheMaxSize ?? 200,
        ttl,
        options.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES,
      )
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      let shouldRetry = false;

      try {
        const response = await fetch(url, {
          headers: { ...this.headers, ...extraHeaders },
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status >= 500 && attempt < this.maxRetries) {
            shouldRetry = true;
          } else {
            throw new AdapterError(
              this.source,
              `HTTP ${response.status}: ${response.statusText} for ${url}`
            );
          }
        } else {
          return await readBoundedResponseText(response, this.maxResponseBytes, this.source);
        }
      } catch (error) {
        if (error instanceof AdapterError) throw error;

        lastError = error as Error;
        if (attempt < this.maxRetries) {
          shouldRetry = true;
        }
      } finally {
        clearTimeout(timeout);
      }

      if (shouldRetry) {
        await this.backoff(attempt);
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

/** Read an upstream body without allowing a provider to exhaust Worker memory. */
export async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
  source: string,
): Promise<string> {
  const declared = response.headers?.get('Content-Length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel();
    throw new AdapterError(source, `Upstream response exceeds ${maxBytes} bytes`);
  }
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('Upstream response exceeds configured limit');
        throw new AdapterError(source, `Upstream response exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

class ResponseCache {
  private readonly values = new Map<string, { value: string; expiry: number; bytes: number }>();
  private totalBytes = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly maxBytes: number,
  ) {}

  get(key: string): string | undefined {
    const entry = this.values.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.delete(key, entry);
      return undefined;
    }
    this.values.delete(key);
    this.values.set(key, entry);
    return entry.value;
  }

  set(key: string, value: string): void {
    const bytes = new TextEncoder().encode(value).byteLength;
    const previous = this.values.get(key);
    if (previous) this.delete(key, previous);
    if (bytes > this.maxBytes) return;
    while (this.values.size >= this.maxEntries || this.totalBytes + bytes > this.maxBytes) {
      const oldest = this.values.entries().next().value as [string, { value: string; expiry: number; bytes: number }] | undefined;
      if (!oldest) break;
      this.delete(oldest[0], oldest[1]);
    }
    this.values.set(key, { value, bytes, expiry: Date.now() + this.ttlMs });
    this.totalBytes += bytes;
  }

  clear(): void {
    this.values.clear();
    this.totalBytes = 0;
  }

  dispose(): void { this.clear(); }

  private delete(key: string, entry: { bytes: number }): void {
    if (this.values.delete(key)) this.totalBytes -= entry.bytes;
  }
}
