import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../../../src/adapters/shared/HttpClient.js';
import { AdapterError } from '../../../../src/kernel/errors.js';

describe('HttpClient timeouts', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the timeout active while consuming a stalled response body', async () => {
    let requestSignal: AbortSignal | undefined;

    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      requestSignal = init?.signal as AbortSignal;

      return Promise.resolve({
        ok: true,
        text: () => new Promise<string>((_resolve, reject) => {
          requestSignal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          }, { once: true });
        }),
      });
    });

    const client = new HttpClient({
      source: 'Test',
      cacheTtlMs: 0,
      maxRetries: 0,
      timeoutMs: 25,
    });
    const request = client.getText('https://example.test/stalled');
    const rejection = expect(request).rejects.toBeInstanceOf(AdapterError);

    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    client.dispose();
  });

  it('clears the timeout after a successful body read', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('complete'),
    });

    const client = new HttpClient({
      source: 'Test',
      cacheTtlMs: 0,
      timeoutMs: 25,
    });

    await expect(client.getText('https://example.test/complete')).resolves.toBe('complete');
    expect(vi.getTimerCount()).toBe(0);
    client.dispose();
  });

  it('clears each request timeout before retry backoff', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network failure'));

    const client = new HttpClient({
      source: 'Test',
      cacheTtlMs: 0,
      maxRetries: 1,
      timeoutMs: 25,
    });
    const request = client.getText('https://example.test/retry');
    const rejection = expect(request).rejects.toBeInstanceOf(AdapterError);

    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    client.dispose();
  });
});

describe('HttpClient requests, caching, and errors', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('combines base URL and headers, parses JSON, and caches it', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('{"answer":42}', { status: 200 }),
    );
    const client = new HttpClient({
      source: 'Test',
      baseUrl: 'https://example.test',
      headers: { authorization: 'Bearer test', shared: 'default' },
      cacheTtlMs: 60_000,
    });

    const first = await client.getJSON<{ answer: number }>('/data', {
      headers: { shared: 'request', accept: 'application/json' },
    });
    const cached = await client.getJSON<{ answer: number }>('/data');

    expect(first).toEqual({ answer: 42 });
    expect(cached).toEqual({ answer: 42 });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toHaveBeenCalledWith('https://example.test/data', {
      headers: {
        authorization: 'Bearer test',
        shared: 'request',
        accept: 'application/json',
      },
      signal: expect.any(AbortSignal),
    });
    client.dispose();
  });

  it('caches text separately from JSON and clearCache forces another request', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('plain text'))
      .mockResolvedValueOnce(new Response('plain text'))
      .mockResolvedValueOnce(new Response('{"kind":"json"}'));
    const client = new HttpClient({ source: 'Test', cacheTtlMs: 60_000 });

    await expect(client.getText('https://example.test/value')).resolves.toBe('plain text');
    await expect(client.getText('https://example.test/value')).resolves.toBe('plain text');
    client.clearCache();
    await expect(client.getText('https://example.test/value')).resolves.toBe('plain text');
    await expect(client.getJSON<{ kind: string }>('https://example.test/value'))
      .resolves.toEqual({ kind: 'json' });

    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    client.dispose();
  });

  it('does not cache when cache TTL is zero', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('one'))
      .mockResolvedValueOnce(new Response('two'));
    const client = new HttpClient({ source: 'Test', cacheTtlMs: 0 });

    await expect(client.getText('https://example.test')).resolves.toBe('one');
    await expect(client.getText('https://example.test')).resolves.toBe('two');
    client.clearCache();
    client.dispose();

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects declared and streamed upstream bodies above the configured limit', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('too large', {
        headers: { 'Content-Length': '9' },
      }))
      .mockResolvedValueOnce(new Response('streamed body'));
    const client = new HttpClient({
      source: 'Test',
      cacheTtlMs: 0,
      maxRetries: 0,
      maxResponseBytes: 8,
    });

    await expect(client.getText('https://example.test/declared')).rejects.toThrow('exceeds 8 bytes');
    await expect(client.getText('https://example.test/streamed')).rejects.toThrow('exceeds 8 bytes');
    client.dispose();
  });

  it('bounds aggregate response-cache bytes with LRU eviction', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('aaaa'))
      .mockResolvedValueOnce(new Response('bbbb'))
      .mockResolvedValueOnce(new Response('aaaa'));
    const client = new HttpClient({
      source: 'Test',
      cacheTtlMs: 60_000,
      maxCacheBytes: 5,
    });

    await client.getText('https://example.test/a');
    await client.getText('https://example.test/b');
    await client.getText('https://example.test/a');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    client.dispose();
  });

  it('surfaces invalid JSON after a successful response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('not-json'));
    const client = new HttpClient({ source: 'Test', cacheTtlMs: 0 });

    await expect(client.getJSON('https://example.test/bad-json'))
      .rejects.toBeInstanceOf(SyntaxError);
    client.dispose();
  });

  it('does not retry a non-retriable HTTP status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('missing', { status: 404, statusText: 'Not Found' }),
    );
    const client = new HttpClient({ source: 'Test', maxRetries: 2, cacheTtlMs: 0 });

    await expect(client.getText('https://example.test/missing')).rejects.toMatchObject({
      name: 'AdapterError',
      message: expect.stringContaining('HTTP 404: Not Found'),
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    client.dispose();
  });

  it('retries a 5xx response and returns the next successful response', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('recovered', { status: 200 }));
    const client = new HttpClient({ source: 'Test', maxRetries: 1, cacheTtlMs: 0 });

    const request = client.getText('https://example.test/retry');
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(request).resolves.toBe('recovered');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    client.dispose();
  });

  it('reports the final network error after retries are exhausted', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('socket closed'));
    const client = new HttpClient({ source: 'Test', maxRetries: 1, cacheTtlMs: 0 });

    const request = client.getText('https://example.test/offline');
    const rejection = expect(request).rejects.toMatchObject({
      name: 'AdapterError',
      message: expect.stringContaining('2 attempts: socket closed'),
      cause: expect.objectContaining({ message: 'socket closed' }),
    });
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    client.dispose();
  });
});
