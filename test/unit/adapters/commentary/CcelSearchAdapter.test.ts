import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CCEL_SEARCH_LIMITS,
  CcelSearchAdapter,
  composeCcelSearchRequest,
  normalizeCcelSectionLocator,
} from '../../../../src/adapters/commentary/CcelSearchAdapter.js';
import {
  DEFAULT_PRIMARY_SOURCE_FEATURE_FLAGS,
  readPrimarySourceFeatureFlags,
} from '../../../../src/kernel/featureFlags.js';

const resultsFixture = readFileSync(new URL('../../../fixtures/ccel-search/search-results.html', import.meta.url), 'utf8');
const noResultsFixture = readFileSync(new URL('../../../fixtures/ccel-search/no-results.html', import.meta.url), 'utf8');
const driftFixture = readFileSync(new URL('../../../fixtures/ccel-search/interface-drift.html', import.meta.url), 'utf8');
const policyFixture = readFileSync(new URL('../../../fixtures/ccel-search/policy-page.html', import.meta.url), 'utf8');
const maliciousFixture = readFileSync(new URL('../../../fixtures/ccel-search/malicious.html', import.meta.url), 'utf8');

const htmlResponse = (body: string, status = 200, headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' }): Response => new Response(body, {
  status,
  headers,
});

const query = (overrides: Record<string, unknown> = {}) => ({ text: 'union with Christ', ...overrides });

const resultCard = (index: number, options: {
  author?: string;
  work?: string;
  title?: string;
  snippet?: string;
} = {}): string => {
  const author = options.author ?? 'Calvin, John';
  const work = options.work ?? 'institutes';
  const title = options.title ?? 'Institutes of the Christian Religion';
  const snippet = options.snippet ?? `A bounded discovery result ${index}.`;
  return `<div class="card mb-3"><a href="/ccel/calvin/${work}/cover.html"><img alt="cover"></a><div class="card-body"><h5 class="card-title"><span class="title">${title}</span><span class="author">by ${author}</span></h5><p class="card-text">${snippet}</p><a class="btn" href="/ccel/calvin/${work}/section${index}.html?token=synthetic&amp;queryID=query&amp;resultID=${index}#match">Read online</a></div></div>`;
};

const resultPage = (cards: string): string => `<html><body><main id="search-results"><h2 id="CCEL_Search_results">CCEL Search results</h2>${cards}</main></body></html>`;

function discardableResponse(status: number, headers: Record<string, string> = {}): { response: Response; cancel: ReturnType<typeof vi.spyOn> } {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('discardable upstream body'));
    },
  });
  const response = new Response(body, { status, headers });
  const cancel = vi.spyOn(response.body!, 'cancel');
  return { response, cancel };
}

describe('primary-source feature flags', () => {
  it('defaults only new live search off and does not gate legacy exact retrieval', () => {
    expect(DEFAULT_PRIMARY_SOURCE_FEATURE_FLAGS).toEqual({ ccelLiveSearch: false });
    expect(readPrimarySourceFeatureFlags()).toEqual({ ccelLiveSearch: false });
    expect(readPrimarySourceFeatureFlags({
      THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: 'TRUE',
    })).toEqual({ ccelLiveSearch: true });
  });
});

describe('composeCcelSearchRequest', () => {
  it('uses URLSearchParams encoding and escapes Lucene syntax as literals', () => {
    const composed = composeCcelSearchRequest({ text: '  (grace) + truth  ', match: 'all_terms', page: 1, limit: 5 });
    const url = new URL(composed.url);
    expect(url.origin).toBe('https://ccel.org');
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('text')).toBe('\\(grace\\) AND \\+ AND truth');
    expect(composed.url).not.toContain('(grace)');
    expect(composeCcelSearchRequest({ text: 'love OR truth' }).luceneQuery).toBe('love AND "OR" AND truth');
  });

  it('supports phrase mode and only uses reviewed safe IDs for ID fields', () => {
    const phrase = composeCcelSearchRequest({ text: 'Lord\'s Supper', match: 'phrase', author: 'Calvin', work: 'Institutes' });
    expect(phrase.luceneQuery).toBe('"Lord\'s Supper" AND author:"Calvin" AND title:"Institutes"');

    const ids = composeCcelSearchRequest({ text: 'grace', author: 'calvin', work: 'institutes' });
    expect(ids.luceneQuery).toBe('grace AND authorID:calvin AND bookID:institutes');
  });

  it('normalizes NFC/control whitespace and enforces the finite query budget', () => {
    expect(composeCcelSearchRequest({ text: 'e\u0301\n  grace\ttruth' }).normalizedText).toBe('é grace truth');
    expect(() => composeCcelSearchRequest({ text: '\u0000bad' })).toThrow('NUL');
    expect(() => composeCcelSearchRequest({ text: 'one two three four five six seven eight nine ten eleven twelve thirteen' })).toThrow('12 terms');
    expect(composeCcelSearchRequest({
      text: 'one two three four five six seven eight nine ten eleven twelve thirteen',
      match: 'phrase',
    }).luceneQuery).toBe('"one two three four five six seven eight nine ten eleven twelve thirteen"');
    expect(() => composeCcelSearchRequest({ text: 'x'.repeat(201) })).toThrow('safe length');
    expect(() => composeCcelSearchRequest({ text: 'x', page: 2 })).toThrow('page');
    expect(() => composeCcelSearchRequest({ text: 'x', limit: 6 })).toThrow('limit');
    expect(() => composeCcelSearchRequest({ text: 'x', bogus: true } as never)).toThrow('Unknown');
  });

  it('rejects empty semantic restrictions, including punctuation-only values', () => {
    expect(() => composeCcelSearchRequest({ text: 'grace', author: '---' })).toThrow('semantic');
    expect(() => composeCcelSearchRequest({ text: 'grace', work: '!!!' })).toThrow('semantic');
  });
});

describe('normalizeCcelSectionLocator', () => {
  it('canonicalizes approved exact section URLs and extracts work/section IDs', () => {
    expect(normalizeCcelSectionLocator('/ccel/calvin/institutes/iv.xvii.html')).toEqual({
      kind: 'ccel_section',
      url: 'https://ccel.org/ccel/calvin/institutes/iv.xvii.html',
      work: 'calvin/institutes',
      section: 'iv.xvii',
    });
    expect(normalizeCcelSectionLocator('https://www.ccel.org/ccel/schaff/hcc3/hcc3.iii.xii.iv.html')?.url)
      .toBe('https://ccel.org/ccel/schaff/hcc3/hcc3.iii.xii.iv.html');
    expect(normalizeCcelSectionLocator('/ccel/example/work/section.html?token=opaque%2Fvalue&queryID=q&resultID=r#match')).toEqual({
      kind: 'ccel_section',
      url: 'https://ccel.org/ccel/example/work/section.html',
      work: 'example/work',
      section: 'section',
    });
  });

  it.each([
    'http://ccel.org/ccel/a/b/c.html',
    'https://evil.example/ccel/a/b/c.html',
    'javascript:alert(1)',
    '/ccel/a/../b/c.html',
    '/ccel/a/%2e%2e/b/c.html',
    '/ccel/a/b.html',
    '/ccel/a/b/c/d.html',
    `/ccel/${'a'.repeat(CCEL_SEARCH_LIMITS.maxLocatorSegmentCharacters + 1)}/b/c.html`,
    '/ccel/a/b/.html',
    '/ccel/a/b/c.html/extra',
  ])('rejects unsafe locator %s', input => {
    expect(normalizeCcelSectionLocator(input)).toBeUndefined();
  });
});

describe('CcelSearchAdapter', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is fail-closed by default and makes no request when live search is off', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const adapter = new CcelSearchAdapter({ fetchImpl });
    await expect(adapter.search(query())).resolves.toMatchObject({ status: 'disabled', searched: false, hits: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('locks the dormant rollout to page 1, five hits, 240 Unicode snippet characters, and zero retries or redirects', () => {
    expect(CCEL_SEARCH_LIMITS).toMatchObject({
      maxPage: 1,
      maxHitsPerResponse: 5,
      maxSnippetCharacters: 240,
      maxRetries: 0,
      maxRedirects: 0,
    });
  });

  it('parses bounded metadata, sanitizes entities, labels snippets as discovery-only, and never follows links', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultsFixture));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });
    const result = await adapter.search(query({ limit: 2 }));
    expect(result).toMatchObject({ provider: 'ccel_live', status: 'ok', searched: true, hitCount: 2 });
    expect(result.hits[0]).toMatchObject({
      title: 'Treatise on Shared Life',
      author: 'Alex Example',
      snippet: 'A synthetic discovery snippet about shared life & community.',
      snippetOnly: true,
      attribution: 'CCEL (Christian Classics Ethereal Library)',
      locator: { kind: 'ccel_section', url: 'https://ccel.org/ccel/example/treatise/part.one.html', work: 'example/treatise', section: 'part.one' },
    });
    expect(result.hits[0].snippet).not.toContain('<');
    expect(JSON.stringify(result)).not.toMatch(/token|queryID|resultID|synthetic-redacted/);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toMatch(/^https:\/\/ccel\.org\/\?page=1&text=/);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'manual', signal: expect.any(AbortSignal) });
  });

  it('fails closed when a current-shape card has ambiguous anatomy or a noncanonical Read online URL', async () => {
    const ambiguous = resultCard(1).replace('</h5>', '<span class="extra">ambiguous</span></h5>');
    await expect(new CcelSearchAdapter({
      enabled: true,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(ambiguous))),
    }).search(query({ text: 'ambiguous card' }))).resolves.toMatchObject({ status: 'interface_changed', hits: [] });

    const foreign = resultCard(1).replace(
      /href="\/ccel\/calvin\/institutes\/section1\.html[^"]*"/u,
      'href="https://evil.example/ccel/calvin/institutes/section1.html?token=secret"',
    );
    await expect(new CcelSearchAdapter({
      enabled: true,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(foreign))),
    }).search(query({ text: 'foreign locator' }))).resolves.toMatchObject({ status: 'interface_changed', hits: [] });
  });

  it('caps the current-shape card output at five 240-code-point snippets without leaking tracking values', async () => {
    const cards = Array.from({ length: 6 }, (_, index) => resultCard(index, { snippet: '🙂'.repeat(241) })).join('');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(cards)));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });
    const result = await adapter.search(query({ text: 'unicode cap' }));
    expect(result).toMatchObject({ status: 'ok', hitCount: 5 });
    expect(result.hits).toHaveLength(5);
    expect(result.hits.every(hit => Array.from(hit.snippet).length === 240)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/token=|queryID|resultID|#match|synthetic/);
    await expect(adapter.search(query({ text: 'unicode cap' }))).resolves.toEqual(result);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('composes author/work restrictions into the request without broadening them', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultsFixture));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });
    const result = await adapter.search({ text: 'union with Christ', author: 'Example', work: 'Treatise' });
    expect(result).toMatchObject({ status: 'unsupported_filter', hitCount: 1 });
    expect(result.hits[0].locator).toMatchObject({ work: 'example/treatise' });
    const requested = new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('text');
    expect(requested).toContain('author:');
    expect(requested).toContain('title:');
    expect(requested).toContain('Example');
    expect(requested).toContain('Treatise');
  });

  it('verifies unrestricted metadata as an ordered normalized phrase', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => htmlResponse(resultPage(resultCard(1, {
      title: 'Institutes of the Christian Religion',
    }))));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });
    await expect(adapter.search({ text: 'grace', work: 'Religion Institutes' })).resolves.toMatchObject({
      status: 'unsupported_filter',
      hitCount: 0,
    });
    await expect(adapter.search({ text: 'grace', work: 'Christian Religion' })).resolves.toMatchObject({
      status: 'ok',
      hitCount: 1,
    });
  });

  it('distinguishes a recognized no-results page from selector drift', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse(noResultsFixture))
      .mockResolvedValueOnce(htmlResponse(driftFixture))
      .mockResolvedValueOnce(htmlResponse(driftFixture));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });
    await expect(adapter.search(query({ text: 'absent term' }))).resolves.toMatchObject({ status: 'no_results', hitCount: 0 });
    await expect(adapter.search(query({ text: 'drift one' }))).resolves.toMatchObject({ status: 'interface_changed' });
    await expect(adapter.search(query({ text: 'drift two' }))).resolves.toMatchObject({ status: 'interface_changed' });
    expect(adapter.getCircuitState()).toMatchObject({ status: 'open', reason: 'interface_changed' });
  });

  it('caches successful and negative metadata briefly, but not failures', async () => {
    let now = 1_000_000;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse(resultsFixture))
      .mockResolvedValueOnce(htmlResponse(noResultsFixture))
      .mockResolvedValueOnce(htmlResponse(policyFixture));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl, now: () => now });

    await adapter.search(query());
    await adapter.search(query());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(adapter.getCacheStats().entries).toBe(1);

    await adapter.search(query({ text: 'nothing' }));
    await adapter.search(query({ text: 'nothing' }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    now += CCEL_SEARCH_LIMITS.negativeCacheTtlMs + 1;
    await adapter.search(query({ text: 'nothing' }));
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    // Policy failures are never inserted into the metadata cache.
    expect(adapter.getCacheStats().entries).toBe(0);
  });

  it('latches 403/policy signals pending operator reset and handles 429 separately', async () => {
    let now = 2_000_000;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse('denied', 403))
      .mockResolvedValueOnce(htmlResponse(resultsFixture));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl, now: () => now });

    await expect(adapter.search(query())).resolves.toMatchObject({ status: 'unavailable' });
    expect(adapter.getCircuitState()).toMatchObject({ status: 'open', reason: 'policy', operatorReviewRequired: true });
    now += CCEL_SEARCH_LIMITS.policyOpenMs + 1;
    await expect(adapter.search(query({ text: 'blocked while latched' }))).resolves.toMatchObject({ status: 'unavailable', searched: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    adapter.resetCircuitAfterReview();
    await expect(adapter.search(query({ text: 'half open' }))).resolves.toMatchObject({ status: 'ok' });
    expect(adapter.getCircuitState().status).toBe('closed');

    // A fresh adapter demonstrates Retry-After handling independently.
    const limited = new CcelSearchAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse('limited', 429, { 'retry-after': '3600' })), now: () => now });
    await expect(limited.search(query())).resolves.toMatchObject({ status: 'rate_limited' });
    expect(limited.getCircuitState()).toMatchObject({ status: 'open', reason: 'rate_limited' });
    expect(limited.getCircuitState().openUntil).toBe(now + 3_600_000);
  });

  it('does not let a concurrent success erase a policy latch', async () => {
    let resolvePolicy!: (response: Response) => void;
    let resolveSuccess!: (response: Response) => void;
    const policy = new Promise<Response>(resolve => { resolvePolicy = resolve; });
    const success = new Promise<Response>(resolve => { resolveSuccess = resolve; });
    const fetchImpl = vi.fn<typeof fetch>()
      .mockReturnValueOnce(policy)
      .mockReturnValueOnce(success);
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });

    const policyRequest = adapter.search(query({ text: 'policy race' }));
    const successRequest = adapter.search(query({ text: 'success race' }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    resolvePolicy(htmlResponse('forbidden', 403));
    await expect(policyRequest).resolves.toMatchObject({ status: 'unavailable' });
    expect(adapter.getCircuitState()).toMatchObject({ status: 'open', reason: 'policy', operatorReviewRequired: true });

    resolveSuccess(htmlResponse(resultsFixture));
    await expect(successRequest).resolves.toMatchObject({ status: 'unavailable', searched: false });
    expect(adapter.getCircuitState()).toMatchObject({ status: 'open', reason: 'policy', operatorReviewRequired: true });
    expect(adapter.getCacheStats().entries).toBe(0);
  });

  it.each([
    {
      name: 'rate limit',
      laterResponse: () => htmlResponse('limited', 429, { 'retry-after': '3600' }),
    },
    {
      name: 'parser failure',
      laterResponse: () => htmlResponse(driftFixture),
    },
    {
      name: 'network failure',
      laterResponse: () => htmlResponse('server error', 503),
    },
    {
      name: 'oversized cleanup failure',
      laterResponse: () => new Response('discard me', { headers: {
        'content-type': 'text/html',
        'content-length': String(CCEL_SEARCH_LIMITS.maxResponseBytes + 1),
      } }),
    },
  ])('does not let a concurrent $name erase a policy latch', async ({ laterResponse }) => {
    let resolvePolicy!: (response: Response) => void;
    let resolveLater!: (response: Response) => void;
    const policy = new Promise<Response>(resolve => { resolvePolicy = resolve; });
    const later = new Promise<Response>(resolve => { resolveLater = resolve; });
    const fetchImpl = vi.fn<typeof fetch>()
      .mockReturnValueOnce(policy)
      .mockReturnValueOnce(later)
      .mockImplementation(async () => htmlResponse('server error', 503));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });

    const policyRequest = adapter.search(query({ text: 'policy failure race' }));
    const laterRequest = adapter.search(query({ text: 'later failure race' }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    resolvePolicy(htmlResponse('forbidden', 403));
    await expect(policyRequest).resolves.toMatchObject({ status: 'unavailable' });
    expect(adapter.getCircuitState()).toMatchObject({
      status: 'open',
      reason: 'policy',
      operatorReviewRequired: true,
    });

    resolveLater(laterResponse());
    await laterRequest;
    expect(adapter.getCircuitState()).toMatchObject({
      status: 'open',
      reason: 'policy',
      operatorReviewRequired: true,
    });

    await expect(adapter.search(query({ text: 'still blocked' }))).resolves.toMatchObject({
      status: 'unavailable',
      searched: false,
    });
  });

  it('does not let a concurrent timeout erase a policy latch', async () => {
    vi.useFakeTimers();
    let resolvePolicy!: (response: Response) => void;
    const policy = new Promise<Response>(resolve => { resolvePolicy = resolve; });
    const stalled = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => {}),
    });
    const fetchImpl = vi.fn<typeof fetch>()
      .mockReturnValueOnce(policy)
      .mockResolvedValueOnce(new Response(stalled, { headers: { 'content-type': 'text/html' } }));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });

    const policyRequest = adapter.search(query({ text: 'policy timeout race' }));
    const timeoutRequest = adapter.search(query({ text: 'timeout race' }));
    resolvePolicy(htmlResponse('forbidden', 403));
    await expect(policyRequest).resolves.toMatchObject({ status: 'unavailable' });

    await vi.advanceTimersByTimeAsync(CCEL_SEARCH_LIMITS.timeoutMs);
    await expect(timeoutRequest).resolves.toMatchObject({ status: 'unavailable' });
    expect(adapter.getCircuitState()).toMatchObject({
      status: 'open',
      reason: 'policy',
      operatorReviewRequired: true,
    });
  });

  it('does not let a success admitted before a 429 close the newer rate-limit circuit', async () => {
    let now = 20_000;
    let resolveLimited!: (response: Response) => void;
    let resolveSuccess!: (response: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockReturnValueOnce(new Promise(resolve => { resolveLimited = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveSuccess = resolve; }));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl, now: () => now });

    const limited = adapter.search(query({ text: 'rate first' }));
    const success = adapter.search(query({ text: 'success late' }));
    resolveLimited(htmlResponse('limited', 429, { 'retry-after': '3600' }));
    await expect(limited).resolves.toMatchObject({ status: 'rate_limited' });
    const expectedOpenUntil = now + 3_600_000;

    resolveSuccess(htmlResponse(resultsFixture));
    await expect(success).resolves.toMatchObject({ status: 'rate_limited', searched: false });
    expect(adapter.getCircuitState()).toMatchObject({
      status: 'open',
      reason: 'rate_limited',
      openUntil: expectedOpenUntil,
    });
  });

  it.each(['parser', 'network'] as const)('does not let a late %s completion weaken a newer 429', async kind => {
    let now = 30_000;
    let resolveLimited!: (response: Response) => void;
    let resolveLater!: (response: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockReturnValueOnce(new Promise(resolve => { resolveLimited = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveLater = resolve; }))
      .mockImplementation(async () => htmlResponse('server error', 503));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl, now: () => now });

    const limited = adapter.search(query({ text: `rate before ${kind}` }));
    const later = adapter.search(query({ text: `${kind} late` }));
    resolveLimited(htmlResponse('limited', 429, { 'retry-after': '3600' }));
    await limited;
    const expectedOpenUntil = now + 3_600_000;

    resolveLater(kind === 'parser' ? htmlResponse(driftFixture) : htmlResponse('server error', 503));
    await later;
    expect(adapter.getCircuitState()).toMatchObject({
      status: 'open',
      reason: 'rate_limited',
      openUntil: expectedOpenUntil,
    });
  });

  it('merges concurrent Retry-After values without shortening the existing expiry', async () => {
    let now = 35_000;
    let resolveLong!: (response: Response) => void;
    let resolveShort!: (response: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockReturnValueOnce(new Promise(resolve => { resolveLong = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveShort = resolve; }));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl, now: () => now });
    const long = adapter.search(query({ text: 'long retry after' }));
    const short = adapter.search(query({ text: 'short retry after' }));

    resolveLong(htmlResponse('limited', 429, { 'retry-after': '3600' }));
    await long;
    resolveShort(htmlResponse('limited', 429, { 'retry-after': '60' }));
    await short;
    expect(adapter.getCircuitState().openUntil).toBe(now + 3_600_000);
  });

  it('does not let an older success close an interface-change circuit opened by a second parser failure', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(htmlResponse(driftFixture));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });
    await adapter.search(query({ text: 'parser one' }));

    let resolveParser!: (response: Response) => void;
    let resolveSuccess!: (response: Response) => void;
    fetchImpl
      .mockReturnValueOnce(new Promise(resolve => { resolveParser = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveSuccess = resolve; }));
    const parser = adapter.search(query({ text: 'parser two' }));
    const success = adapter.search(query({ text: 'parser race success' }));
    resolveParser(htmlResponse(driftFixture));
    await parser;
    resolveSuccess(htmlResponse(resultsFixture));
    await success;
    expect(adapter.getCircuitState()).toMatchObject({ status: 'open', reason: 'interface_changed' });
  });

  it('does not let an older success close a circuit opened at the network-failure threshold', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse('server error', 503));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });
    await adapter.search(query({ text: 'network count one' }));
    await adapter.search(query({ text: 'network count two' }));

    let resolveFailure!: (response: Response) => void;
    let resolveRetry!: (response: Response) => void;
    let resolveSuccess!: (response: Response) => void;
    fetchImpl
      .mockReturnValueOnce(new Promise(resolve => { resolveFailure = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveSuccess = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveRetry = resolve; }));
    const failure = adapter.search(query({ text: 'network threshold' }));
    const success = adapter.search(query({ text: 'network race success' }));
    resolveFailure(htmlResponse('server error', 503));
    await Promise.resolve();
    resolveRetry(htmlResponse('server error', 503));
    await failure;
    resolveSuccess(htmlResponse(resultsFixture));
    await success;
    expect(adapter.getCircuitState()).toMatchObject({ status: 'open', reason: 'network', recentNetworkFailures: 3 });
  });

  it('treats operator reset as an epoch boundary for older in-flight completions', async () => {
    let resolveFirstPolicy!: (response: Response) => void;
    let resolveLatePolicy!: (response: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockReturnValueOnce(new Promise(resolve => { resolveFirstPolicy = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveLatePolicy = resolve; }));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });
    const first = adapter.search(query({ text: 'policy before reset' }));
    const late = adapter.search(query({ text: 'late policy before reset' }));

    resolveFirstPolicy(htmlResponse('forbidden', 403));
    await first;
    expect(adapter.getCircuitState().operatorReviewRequired).toBe(true);
    adapter.resetCircuitAfterReview();
    resolveLatePolicy(htmlResponse('forbidden', 403));
    await late;
    expect(adapter.getCircuitState()).toMatchObject({ status: 'closed', operatorReviewRequired: false });
  });

  it('never retries network/5xx failures and opens after three admitted failures', async () => {
    let now = 3_000_000;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse('server error', 503));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl, now: () => now });
    await expect(adapter.search(query({ text: 'failure one' }))).resolves.toMatchObject({ status: 'unavailable' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    await adapter.search(query({ text: 'failure two' }));
    await adapter.search(query({ text: 'failure three' }));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(adapter.getCircuitState()).toMatchObject({ status: 'open', reason: 'network', recentNetworkFailures: 3 });
    now += CCEL_SEARCH_LIMITS.networkOpenMs + 1;
    expect(adapter.getCircuitState().status).toBe('half_open');
  });

  it('fails closed on policy pages, wrong content types, foreign redirects, and oversized responses', async () => {
    const policy = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(policyFixture));
    await expect(new CcelSearchAdapter({ enabled: true, fetchImpl: policy }).search(query())).resolves.toMatchObject({ status: 'unavailable' });

    const wrongType = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html></html>', { headers: { 'content-type': 'application/json' } }));
    await expect(new CcelSearchAdapter({ enabled: true, fetchImpl: wrongType }).search(query())).resolves.toMatchObject({ status: 'interface_changed' });

    const redirect = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 302, headers: { location: 'https://evil.example/' } }));
    await expect(new CcelSearchAdapter({ enabled: true, fetchImpl: redirect }).search(query())).resolves.toMatchObject({ status: 'unavailable' });
    expect(redirect).toHaveBeenCalledOnce();

    const tooLarge = vi.fn<typeof fetch>().mockResolvedValue(new Response('small', { headers: {
      'content-type': 'text/html',
      'content-length': String(CCEL_SEARCH_LIMITS.maxResponseBytes + 1),
    } }));
    await expect(new CcelSearchAdapter({ enabled: true, fetchImpl: tooLarge }).search(query())).resolves.toMatchObject({ status: 'unavailable' });
    expect(new CcelSearchAdapter({ enabled: true, fetchImpl: tooLarge }).getCacheStats().entries).toBe(0);
  });

  it('enforces two active requests and a four-request queue without crawling', async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = new Promise<Response>(resolve => { releaseFirst = () => resolve(htmlResponse(resultsFixture)); });
    const second = new Promise<Response>(resolve => { releaseSecond = () => resolve(htmlResponse(resultsFixture)); });
    const fetchImpl = vi.fn<typeof fetch>().mockReturnValueOnce(first).mockReturnValueOnce(second)
      .mockImplementation(() => Promise.resolve(htmlResponse(resultsFixture)));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });
    const requests = Array.from({ length: 7 }, (_, index) => adapter.search(query({ text: `term ${index}` })));
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(await requests[6]).toMatchObject({ status: 'unavailable', searched: false });
    releaseFirst();
    releaseSecond();
    await Promise.all(requests.slice(0, 6));
    expect(fetchImpl.mock.calls.length).toBe(6);
  });

  it('includes queue wait in the wall deadline', async () => {
    let now = 10_000;
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = new Promise<Response>(resolve => { releaseFirst = () => resolve(htmlResponse(resultsFixture)); });
    const second = new Promise<Response>(resolve => { releaseSecond = () => resolve(htmlResponse(resultsFixture)); });
    const fetchImpl = vi.fn<typeof fetch>().mockReturnValueOnce(first).mockReturnValueOnce(second)
      .mockImplementation(() => Promise.resolve(htmlResponse(resultsFixture)));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl, now: () => now });
    const firstRequest = adapter.search(query({ text: 'held one' }));
    const secondRequest = adapter.search(query({ text: 'held two' }));
    const queuedRequest = adapter.search(query({ text: 'expired queue' }));
    await Promise.resolve();
    now += CCEL_SEARCH_LIMITS.totalRequestMs + 1;
    releaseFirst();
    releaseSecond();
    await expect(queuedRequest).resolves.toMatchObject({ status: 'unavailable', searched: false });
    await Promise.all([firstRequest, secondRequest]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('invalidates queued admissions across operator reset while allowing a fresh post-reset call', async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = new Promise<Response>(resolve => { releaseFirst = () => resolve(htmlResponse(resultsFixture)); });
    const second = new Promise<Response>(resolve => { releaseSecond = () => resolve(htmlResponse(resultsFixture)); });
    const fetchImpl = vi.fn<typeof fetch>()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
      .mockImplementation(async () => htmlResponse(resultsFixture));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });
    const activeOne = adapter.search(query({ text: 'pre-reset active one' }));
    const activeTwo = adapter.search(query({ text: 'pre-reset active two' }));
    const queued = adapter.search(query({ text: 'pre-reset queued' }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    adapter.resetCircuitAfterReview();
    releaseFirst();
    await expect(queued).resolves.toMatchObject({ status: 'unavailable', searched: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await expect(adapter.search(query({ text: 'post-reset fresh' }))).resolves.toMatchObject({ status: 'ok' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    releaseSecond();
    await Promise.all([activeOne, activeTwo]);
  });

  it('cancels every discarded redirect, non-2xx, wrong-type, and 5xx response body', async () => {
    for (const status of [403, 429, 404]) {
      const cancels: Array<ReturnType<typeof vi.spyOn>> = [];
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
        const discarded = discardableResponse(status, status === 429 ? { 'retry-after': '60' } : {});
        cancels.push(discarded.cancel);
        return discarded.response;
      });
      await new CcelSearchAdapter({ enabled: true, fetchImpl }).search(query({ text: `status ${status}` }));
      expect(cancels).toHaveLength(1);
      expect(cancels[0]).toHaveBeenCalled();
    }

    const failureCancels: Array<ReturnType<typeof vi.spyOn>> = [];
    const failureFetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      const discarded = discardableResponse(503);
      failureCancels.push(discarded.cancel);
      return discarded.response;
    });
    await new CcelSearchAdapter({ enabled: true, fetchImpl: failureFetch }).search(query({ text: 'single failure body' }));
    expect(failureCancels).toHaveLength(1);
    expect(failureCancels[0]).toHaveBeenCalled();

    const wrongType = discardableResponse(200, { 'content-type': 'application/json' });
    await new CcelSearchAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(wrongType.response) }).search(query({ text: 'wrong type body' }));
    expect(wrongType.cancel).toHaveBeenCalled();

    const redirect = discardableResponse(302, { location: 'https://ccel.org/?page=1&text=redirected' });
    const redirectFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(redirect.response)
      .mockImplementationOnce(async () => htmlResponse(resultsFixture));
    await new CcelSearchAdapter({ enabled: true, fetchImpl: redirectFetch }).search(query({ text: 'same host redirect' }));
    expect(redirect.cancel).toHaveBeenCalled();
    expect(redirectFetch).toHaveBeenCalledOnce();
  });

  it('never follows same-host redirects', async () => {
    const cancels: Array<ReturnType<typeof vi.spyOn>> = [];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
      const redirect = discardableResponse(302, { location: 'https://ccel.org/?page=1&text=redirect' });
      cancels.push(redirect.cancel);
      return redirect.response;
    });
    await expect(new CcelSearchAdapter({ enabled: true, fetchImpl }).search(query({ text: 'redirect cap' })))
      .resolves.toMatchObject({ status: 'unavailable' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(cancels.every(cancel => cancel.mock.calls.length > 0)).toBe(true);
  });

  it('does not treat result text as structural no-results or policy state', async () => {
    const resultText = resultPage(resultCard(1, {
      snippet: 'No results found is a phrase inside a legitimate discovery snippet about maintenance and terms of use.',
    }));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultText));
    await expect(new CcelSearchAdapter({ enabled: true, fetchImpl }).search(query({ text: 'phrase state' })))
      .resolves.toMatchObject({ status: 'ok', hitCount: 1 });

    const unmarked = htmlResponse('<html><body><main id="search-results"><h2>No results found.</h2></main></body></html>');
    await expect(new CcelSearchAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(unmarked) }).search(query({ text: 'unmarked empty' })))
      .resolves.toMatchObject({ status: 'interface_changed' });
  });

  it('sanitizes scripts, forms, hidden content, event attributes, and encoded markup', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(maliciousFixture));
    const result = await new CcelSearchAdapter({ enabled: true, fetchImpl }).search(query());
    expect(result.hits[0].snippet).not.toContain('<script>');
    expect(result.hits[0].snippet).not.toContain('onclick');
    expect(result.hits[0].snippet).not.toContain('Hidden non-result content');
    expect(result.hits[0].snippet).toContain('&lt;script&gt;');
  });

  it('enforces field, result, and candidate output caps', async () => {
    const longCard = resultCard(1, {
      title: 'T'.repeat(CCEL_SEARCH_LIMITS.maxTitleCharacters + 50),
      author: 'A'.repeat(CCEL_SEARCH_LIMITS.maxAuthorResultCharacters + 50),
      snippet: 'N'.repeat(CCEL_SEARCH_LIMITS.maxSnippetCharacters + 50),
    });
    const bounded = await new CcelSearchAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(longCard))) }).search(query({ text: 'field caps' }));
    expect(bounded).toMatchObject({ status: 'ok', hitCount: 1 });
    expect(bounded.hits[0].title.length).toBeLessThanOrEqual(CCEL_SEARCH_LIMITS.maxTitleCharacters);
    expect(bounded.hits[0].author?.length).toBeLessThanOrEqual(CCEL_SEARCH_LIMITS.maxAuthorResultCharacters);
    expect(bounded.hits[0].snippet.length).toBeLessThanOrEqual(CCEL_SEARCH_LIMITS.maxSnippetCharacters);

    const nineCards = Array.from({ length: 9 }, (_, index) => resultCard(index)).join('');
    await expect(new CcelSearchAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(nineCards))) }).search(query({ text: 'result cap', limit: 5 })))
      .resolves.toMatchObject({ status: 'ok', hitCount: 5 });

    const fiftyCardsAndMalformed = `${Array.from({ length: 50 }, (_, index) => resultCard(index)).join('')}<article class="ccel-search-result"><a href="/ccel/calvin/institutes/unclosed.html">unclosed`;
    await expect(new CcelSearchAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(fiftyCardsAndMalformed))) }).search(query({ text: 'candidate cap' })))
      .resolves.toMatchObject({ status: 'ok', hitCount: 5 });

  });

  it('enforces streaming response overflow without retaining the body', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(CCEL_SEARCH_LIMITS.maxResponseBytes));
        controller.enqueue(new Uint8Array(1));
      },
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'text/html' } }));
    await expect(new CcelSearchAdapter({ enabled: true, fetchImpl }).search(query({ text: 'stream overflow' })))
      .resolves.toMatchObject({ status: 'unavailable' });
    expect(new CcelSearchAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>() }).getCacheStats().entries).toBe(0);
  });

  it('cancels and settles a stalled stream on timeout without late reader errors or retries', async () => {
    vi.useFakeTimers();
    let cancelCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => {}),
      cancel: () => { cancelCount++; },
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'text/html' } }));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });
    const pending = adapter.search(query({ text: 'stalled stream' }));
    await vi.advanceTimersByTimeAsync(CCEL_SEARCH_LIMITS.timeoutMs);
    await expect(pending).resolves.toMatchObject({ status: 'unavailable' });
    await Promise.resolve();
    expect(cancelCount).toBe(1);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('keeps too-large classification when response cleanup cancellation rejects', async () => {
    const response = new Response('small', {
      headers: {
        'content-type': 'text/html',
        'content-length': String(CCEL_SEARCH_LIMITS.maxResponseBytes + 1),
      },
    });
    vi.spyOn(response.body!, 'cancel').mockRejectedValue(new Error('cleanup failed'));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(new CcelSearchAdapter({ enabled: true, fetchImpl }).search(query({ text: 'cleanup classification' })))
      .resolves.toMatchObject({ status: 'unavailable' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not wait for never-settling discarded-response cancellation', async () => {
    const response = htmlResponse('forbidden', 403);
    const cancel = vi.spyOn(response.body!, 'cancel').mockImplementation(() => new Promise<void>(() => {}));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response) });

    await expect(adapter.search(query({ text: 'detached discard' }))).resolves.toMatchObject({ status: 'unavailable' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(adapter.getCircuitState()).toMatchObject({ reason: 'policy', operatorReviewRequired: true });
  });

  it('does not wait for never-settling reader cancellation after timeout', async () => {
    vi.useFakeTimers();
    let cancelCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => {}),
      cancel: () => {
        cancelCount++;
        return new Promise<void>(() => {});
      },
    });
    const adapter = new CcelSearchAdapter({
      enabled: true,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'text/html' } })),
    });
    const pending = adapter.search(query({ text: 'detached read cleanup' }));

    await vi.advanceTimersByTimeAsync(CCEL_SEARCH_LIMITS.timeoutMs);
    await expect(pending).resolves.toMatchObject({ status: 'unavailable' });
    expect(cancelCount).toBe(1);
  });

  it('honors cache key dimensions, TTL, LRU entries, and byte bounds', async () => {
    const single = resultPage(resultCard(1));
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => htmlResponse(single));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl, cacheMaxEntries: 2, cacheMaxBytes: 5_000 });
    await adapter.search(query({ limit: 5 }));
    await adapter.search(query({ limit: 1 }));
    await adapter.search(query({ match: 'phrase' }));
    await adapter.search(query({ author: 'Calvin' }));
    await adapter.search(query({ work: 'Institutes' }));
    expect(fetchImpl.mock.calls.length).toBe(4);

    let ttlNow = 60_000;
    const ttlFetch = vi.fn<typeof fetch>().mockImplementation(async () => htmlResponse(single));
    const ttl = new CcelSearchAdapter({ enabled: true, fetchImpl: ttlFetch, now: () => ttlNow });
    await ttl.search(query({ text: 'ttl isolation' }));
    await ttl.search(query({ text: 'ttl isolation' }));
    expect(ttlFetch).toHaveBeenCalledOnce();
    ttlNow += CCEL_SEARCH_LIMITS.cacheTtlMs + 1;
    await ttl.search(query({ text: 'ttl isolation' }));
    expect(ttlFetch).toHaveBeenCalledTimes(2);

    const lruFetch = vi.fn<typeof fetch>().mockImplementation(async () => htmlResponse(single));
    const lru = new CcelSearchAdapter({ enabled: true, fetchImpl: lruFetch, cacheMaxEntries: 2 });
    await lru.search({ text: 'a' });
    await lru.search({ text: 'b' });
    await lru.search({ text: 'a' });
    await lru.search({ text: 'c' });
    await lru.search({ text: 'b' });
    expect(lruFetch).toHaveBeenCalledTimes(4);
    expect(lru.getCacheStats().entries).toBeLessThanOrEqual(2);

    const byteFetch = vi.fn<typeof fetch>().mockImplementation(async () => htmlResponse(single));
    const byteBounded = new CcelSearchAdapter({ enabled: true, fetchImpl: byteFetch, cacheMaxBytes: 1 });
    await byteBounded.search(query());
    await byteBounded.search(query());
    expect(byteFetch).toHaveBeenCalledTimes(2);
    expect(byteBounded.getCacheStats().entries).toBe(0);

    const sizingFetch = vi.fn<typeof fetch>().mockImplementation(async () => htmlResponse(single));
    const sizing = new CcelSearchAdapter({ enabled: true, fetchImpl: sizingFetch });
    await sizing.search({ text: 'size one' });
    const oneEntryBytes = sizing.getCacheStats().bytes;
    const pressureFetch = vi.fn<typeof fetch>().mockImplementation(async () => htmlResponse(single));
    const pressure = new CcelSearchAdapter({
      enabled: true,
      fetchImpl: pressureFetch,
      cacheMaxBytes: oneEntryBytes + Math.floor(oneEntryBytes / 2),
    });
    await pressure.search({ text: 'pressure one' });
    await pressure.search({ text: 'pressure two' });
    expect(pressure.getCacheStats().entries).toBe(1);
    await pressure.search({ text: 'pressure one' });
    expect(pressureFetch).toHaveBeenCalledTimes(3);
  });

  it('allows only one user-triggered half-open probe after a network circuit', async () => {
    let now = 70_000;
    const failures = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse('server error', 503));
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl: failures, now: () => now });
    await adapter.search({ text: 'failure one' });
    await adapter.search({ text: 'failure two' });
    await adapter.search({ text: 'failure three' });
    now += CCEL_SEARCH_LIMITS.networkOpenMs + 1;

    let release!: () => void;
    const pending = new Promise<Response>(resolve => { release = () => resolve(htmlResponse(resultsFixture)); });
    failures.mockImplementationOnce(async () => pending).mockImplementation(async () => htmlResponse(resultsFixture));
    const firstProbe = adapter.search({ text: 'half open one' });
    const secondProbe = adapter.search({ text: 'half open two' });
    await Promise.resolve();
    expect(failures).toHaveBeenCalledTimes(4);
    release();
    await expect(secondProbe).resolves.toMatchObject({ status: 'unavailable', searched: false });
    await expect(firstProbe).resolves.toMatchObject({ status: 'ok' });
    expect(adapter.getCircuitState().status).toBe('closed');
  });

  it.each([
    {
      name: 'upstream 404',
      response: () => htmlResponse('not found', 404),
      reason: 'interface_changed' as const,
      backoffMs: CCEL_SEARCH_LIMITS.policyOpenMs,
      fetchCount: 2,
    },
    {
      name: 'upstream 503',
      response: () => htmlResponse('server error', 503),
      reason: 'network' as const,
      backoffMs: CCEL_SEARCH_LIMITS.networkOpenMs,
      fetchCount: 2,
    },
    {
      name: 'declared oversized response',
      response: () => new Response('discard me', { headers: {
        'content-type': 'text/html',
        'content-length': String(CCEL_SEARCH_LIMITS.maxResponseBytes + 1),
      } }),
      reason: 'interface_changed' as const,
      backoffMs: CCEL_SEARCH_LIMITS.policyOpenMs,
      fetchCount: 2,
    },
    {
      name: 'streaming oversized response',
      response: () => new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(CCEL_SEARCH_LIMITS.maxResponseBytes));
          controller.enqueue(new Uint8Array(1));
        },
      }), { headers: { 'content-type': 'text/html' } }),
      reason: 'interface_changed' as const,
      backoffMs: CCEL_SEARCH_LIMITS.policyOpenMs,
      fetchCount: 2,
    },
  ])('reopens a bounded circuit when a half-open probe receives $name', async ({ response, reason, backoffMs, fetchCount }) => {
    let now = 90_000;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse('limited', 429))
      .mockImplementation(async () => response());
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl, now: () => now });
    await adapter.search(query({ text: 'open before probe' }));
    now += CCEL_SEARCH_LIMITS.policyOpenMs + 1;
    expect(adapter.getCircuitState().status).toBe('half_open');

    await expect(adapter.search(query({ text: 'failing half-open probe' }))).resolves.toMatchObject({ status: 'unavailable' });
    expect(adapter.getCircuitState()).toMatchObject({
      status: 'open',
      reason,
      openUntil: now + backoffMs,
    });
    await expect(adapter.search(query({ text: 'blocked until expiry' }))).resolves.toMatchObject({
      status: reason === 'network' ? 'unavailable' : 'interface_changed',
      searched: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(fetchCount);
  });
});
