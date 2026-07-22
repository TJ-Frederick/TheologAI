import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import {
  CCEL_SEARCH_LIMITS,
  CcelSearchAdapter,
  composeCcelSearchRequest,
  normalizeCcelSectionLocator,
  parseCcelSearchHtml,
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

function createAlwaysAdmittedCoordinator() {
  let attemptId = 0;
  return {
    admit: vi.fn(async () => ({
      kind: 'admitted' as const,
      token: { attemptId: ++attemptId, operatorEpoch: 0 },
      admittedAtMs: 1,
      nextAllowedAtMs: 10_001,
      probe: false,
    })),
    recordOutcome: vi.fn(async () => ({
      applied: true,
      disposition: 'applied' as const,
      state: 'closed' as const,
    })),
    snapshot: vi.fn(),
  };
}

function testAdapter(options: ConstructorParameters<typeof CcelSearchAdapter>[0] = {}) {
  const adapter = new CcelSearchAdapter(options);
  const defaultCoordinator = createAlwaysAdmittedCoordinator();
  return {
    search: (input: Parameters<CcelSearchAdapter['search']>[0], coordinator = defaultCoordinator) => adapter.search(input, coordinator),
    getCacheStats: () => adapter.getCacheStats(),
    clearCache: () => adapter.clearCache(),
  };
}

describe('CcelSearchAdapter coordinated execution', () => {
  function coordinator(options: {
    admission?: unknown;
    record?: unknown;
    recordError?: Error;
    events?: string[];
  } = {}) {
    const events = options.events ?? [];
    return {
      admit: vi.fn(async () => {
        events.push('admit');
        return options.admission ?? {
          kind: 'admitted' as const,
          token: { attemptId: 1, operatorEpoch: 0 },
          admittedAtMs: 1,
          nextAllowedAtMs: 10_001,
          probe: false,
        };
      }),
      recordOutcome: vi.fn(async () => {
        events.push('record');
        if (options.recordError) throw options.recordError;
        return options.record ?? { applied: true, disposition: 'applied' as const, state: 'closed' as const };
      }),
      snapshot: vi.fn(),
    } as any;
  }

  it('orders cache/capacity before admission and records exactly once before caching', async () => {
    const events: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      events.push('fetch');
      return htmlResponse(noResultsFixture);
    });
    const gate = coordinator({ events });
    const adapter = testAdapter({ enabled: true, fetchImpl });

    await expect(adapter.search(query(), gate)).resolves.toMatchObject({ status: 'no_results' });
    expect(events).toEqual(['admit', 'fetch', 'record']);
    expect(gate.recordOutcome).toHaveBeenCalledOnce();
    expect(gate.recordOutcome).toHaveBeenCalledWith(expect.anything(), { kind: 'success' });

    await expect(adapter.search(query(), gate)).resolves.toMatchObject({ status: 'no_results' });
    expect(events).toEqual(['admit', 'fetch', 'record']);
    expect(gate.admit).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    ['no results', () => htmlResponse(noResultsFixture), { kind: 'success' }],
    ['restriction rejection', () => htmlResponse(resultsFixture), { kind: 'success' }],
    ['429', () => htmlResponse('limited', 429), { kind: 'rate_limited', retryAfterSeconds: 1 }],
    ['403', () => htmlResponse('forbidden', 403), { kind: 'policy_failure' }],
    ['redirect', () => htmlResponse('', 302, { location: 'https://ccel.org/' }), { kind: 'policy_failure' }],
    ['policy marker', () => htmlResponse(policyFixture), { kind: 'policy_failure' }],
    ['content type drift', () => htmlResponse('{}', 200, { 'content-type': 'application/json' }), { kind: 'interface_failure' }],
    ['parser drift', () => htmlResponse(driftFixture), { kind: 'interface_failure' }],
    ['5xx', () => htmlResponse('failed', 503), { kind: 'transient_failure' }],
  ] as const)('maps admitted %s to one terminal outcome', async (_name, response, expectedOutcome) => {
    const gate = coordinator();
    const adapter = testAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockImplementation(async () => response()) });
    await adapter.search(query({ author: _name === 'restriction rejection' ? 'Definitely Absent' : undefined }), gate);
    expect(gate.recordOutcome).toHaveBeenCalledOnce();
    expect(gate.recordOutcome).toHaveBeenCalledWith(expect.anything(), expectedOutcome);
  });

  it.each([
    ['missing', undefined, 1],
    ['zero', '0', 1],
    ['past HTTP date', 'Thu, 01 Jan 1970 00:00:00 GMT', 1],
    ['huge numeric', '9'.repeat(400), 86_400],
    ['maximum', '86400', 86_400],
  ])('bounds Retry-After for %s values', async (_name, retryAfter, expectedSeconds) => {
    const gate = coordinator();
    const headers = retryAfter === undefined ? {} : { 'retry-after': retryAfter };
    const adapter = testAdapter({
      enabled: true,
      now: () => Date.parse('2026-07-16T00:00:00Z'),
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse('limited', 429, headers)),
    });
    const result = await adapter.search(query(), gate);
    expect(result).toMatchObject({ status: 'rate_limited', retryAfterSeconds: expectedSeconds });
    expect(gate.recordOutcome).toHaveBeenCalledWith(expect.anything(), {
      kind: 'rate_limited',
      retryAfterSeconds: expectedSeconds,
    });
  });

  it('returns the coordinator busy interval without an upstream request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await testAdapter({ enabled: true, fetchImpl }).search(query(), coordinator({
      admission: { kind: 'busy', reason: 'minimum_interval', retryAfterSeconds: 7 },
    }));
    expect(result).toMatchObject({ status: 'rate_limited', searched: false, retryAfterSeconds: 7 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('emits only bounded content-free admission/outcome telemetry and ignores sink failure', async () => {
    const events: unknown[] = [];
    const gate = coordinator();
    const adapter = testAdapter({
      enabled: true,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(noResultsFixture)),
      telemetry: event => events.push(event),
    });
    await expect(adapter.search(query({ author: 'Private Author', work: 'Private Work' }), gate))
      .resolves.toMatchObject({ status: 'no_results' });
    expect(events).toEqual([
      { event: 'theologai.ccel.coordinator.admission', decision: 'admitted', probe: false },
      { event: 'theologai.ccel.coordinator.outcome', outcome: 'success', applied: true, state: 'closed' },
    ]);
    const serialized = JSON.stringify(events);
    for (const forbidden of [
      'Private Author', 'Private Work', 'query', 'url', 'ccel.org', 'snippet',
      'workId', 'sectionId', 'attemptId', 'operatorEpoch', 'token', 'ip', 'IP',
      'userAgent', 'user-agent', 'fingerprint',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    const throwing = testAdapter({
      enabled: true,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(noResultsFixture)),
      telemetry: () => { throw new Error('observability failed'); },
    });
    await expect(throwing.search(query(), coordinator())).resolves.toMatchObject({ status: 'no_results' });

    const asynchronouslyRejecting = testAdapter({
      enabled: true,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(noResultsFixture)),
      telemetry: async () => { throw new Error('asynchronous observability failure'); },
    });
    await expect(asynchronouslyRejecting.search(query(), coordinator())).resolves.toMatchObject({ status: 'no_results' });
    await Promise.resolve();
  });

  it('cannot fetch when the required coordinator is absent at runtime', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const adapter = new CcelSearchAdapter({ enabled: true, fetchImpl });
    await expect(adapter.search(query(), undefined as never)).resolves.toMatchObject({ status: 'unavailable' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'disabled' as const },
    { kind: 'busy' as const, reason: 'minimum_interval' as const, retryAfterSeconds: 10 },
    { kind: 'latched' as const, reason: 'policy' as const, operatorAction: 'reset_after_review' as const },
    { kind: 'latched' as const, reason: 'interface' as const, operatorAction: 'reset_after_review' as const },
  ])('never fetches or records for an unadmitted $kind decision', async admission => {
    const fetchImpl = vi.fn<typeof fetch>();
    const gate = coordinator({ admission });
    const adapter = testAdapter({ enabled: true, fetchImpl });
    await adapter.search(query(), gate);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(gate.recordOutcome).not.toHaveBeenCalled();
  });

  it('fails closed without caching or a second terminal record when persistence is ambiguous', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(noResultsFixture));
    const gate = coordinator({ recordError: new Error('ambiguous persistence') });
    const adapter = testAdapter({ enabled: true, fetchImpl });
    await expect(adapter.search(query(), gate)).resolves.toMatchObject({ status: 'unavailable', searched: false });
    expect(gate.recordOutcome).toHaveBeenCalledOnce();
    expect(adapter.getCacheStats().entries).toBe(0);
    await adapter.search(query(), gate);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(gate.recordOutcome).toHaveBeenCalledTimes(2);
  });

  it.each([
    { applied: false, disposition: 'stale_epoch' as const, state: 'closed' as const },
    { applied: false, disposition: 'conflict' as const, state: 'closed' as const },
    { applied: true, disposition: 'applied' as const, state: 'latched_policy' as const },
  ])('does not publish or cache a stale, conflicting, or concurrently latched success', async record => {
    const gate = coordinator({ record });
    const adapter = testAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(noResultsFixture)) });
    await expect(adapter.search(query(), gate)).resolves.toMatchObject({ status: 'unavailable', searched: false });
    expect(gate.recordOutcome).toHaveBeenCalledOnce();
    expect(adapter.getCacheStats().entries).toBe(0);
  });
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
  it('defaults all three rollout gates off and derives one live predicate', () => {
    expect(DEFAULT_PRIMARY_SOURCE_FEATURE_FLAGS).toEqual({
      exposeCcelDiscovery: false, ccelLiveSearch: false, ccelCoordinator: false,
      contractVersion: '6', liveCcelEnabled: false,
    });
    expect(readPrimarySourceFeatureFlags()).toEqual(DEFAULT_PRIMARY_SOURCE_FEATURE_FLAGS);
    expect(readPrimarySourceFeatureFlags({
      THEOLOGAI_EXPOSE_CCEL_DISCOVERY: 'TRUE',
      THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: 'TRUE',
      THEOLOGAI_ENABLE_CCEL_COORDINATOR: 'TRUE',
    })).toEqual({
      exposeCcelDiscovery: true, ccelLiveSearch: true, ccelCoordinator: true,
      contractVersion: '7', liveCcelEnabled: true,
    });
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
    const adapter = testAdapter({ fetchImpl });
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
    const adapter = testAdapter({ enabled: true, fetchImpl });
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
    const duplicateSnippet = resultCard(1).replace('</p>', '</p><p class="card-text">second snippet</p>');
    const duplicateReadLink = resultCard(1).replace(
      '</div></div>',
      '<a href="/ccel/example/duplicate/section.html">Read online</a></div></div>',
    );
    for (const [index, card] of [ambiguous, duplicateSnippet, duplicateReadLink].entries()) {
      await expect(testAdapter({
        enabled: true,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(card))),
      }).search(query({ text: `ambiguous card ${index}` }))).resolves.toMatchObject({ status: 'interface_changed', hits: [] });
    }

    const foreign = resultCard(1).replace(
      /href="\/ccel\/calvin\/institutes\/section1\.html[^"]*"/u,
      'href="https://evil.example/ccel/calvin/institutes/section1.html?token=secret"',
    );
    await expect(testAdapter({
      enabled: true,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(foreign))),
    }).search(query({ text: 'foreign locator' }))).resolves.toMatchObject({ status: 'interface_changed', hits: [] });
  });

  it('uses explicit span roles and rejects swapped, missing, wrong, or duplicate role classes', async () => {
    const swappedOrder = resultCard(1).replace(
      /(<span class="title">[\s\S]*?<\/span>)(<span class="author">[\s\S]*?<\/span>)/u,
      '$2$1',
    );
    const orderIndependent = await testAdapter({
      enabled: true,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(swappedOrder))),
    }).search(query({ text: 'role order' }));
    expect(orderIndependent.hits[0]).toMatchObject({
      title: 'Institutes of the Christian Religion',
      author: 'Calvin, John',
    });

    const swappedRoles = resultCard(1)
      .replace('class="title"', 'class="temporary-role"')
      .replace('class="author"', 'class="title"')
      .replace('class="temporary-role"', 'class="author"');
    const invalidCards = [
      swappedRoles,
      resultCard(1).replace('class="title"', 'class="subtitle"'),
      resultCard(1).replace('class="author"', 'class="creator"'),
      resultCard(1).replace('class="author"', 'class="title"'),
      resultCard(1).replace('class="author"', 'class="title author"'),
    ];
    for (const [index, card] of invalidCards.entries()) {
      await expect(testAdapter({
        enabled: true,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(card))),
      }).search(query({ text: `invalid role ${index}` }))).resolves.toMatchObject({ status: 'interface_changed', hits: [] });
    }
  });

  it('rejects balanced trailing result metadata and nested or unbalanced card/div ambiguity', async () => {
    const trailing = `${resultCard(1)}<h5 class="card-title"><span class="title">Trailing title</span><span class="author">by Trailing Author</span></h5><p class="card-text">Trailing snippet.</p><a href="/ccel/example/trailing/section.html">Read online</a>`;
    const nestedCard = resultCard(1)
      .replace('<div class="card-body">', '<div class="card-body"><div class="card">')
      .replace('</div></div>', '</div></div></div>');
    const unbalancedDiv = resultCard(1).replace('<h5 class="card-title">', '<div><h5 class="card-title">');
    for (const [index, markup] of [trailing, nestedCard, unbalancedDiv].entries()) {
      await expect(testAdapter({
        enabled: true,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(markup))),
      }).search(query({ text: `structural ambiguity ${index}` }))).resolves.toMatchObject({ status: 'interface_changed', hits: [] });
    }
  });

  it('uses the HTML5 tree while excluding inert, raw-text, foreign, and hidden subtrees', () => {
    const decoy = '<h5 class="card-title"><span class="title">Decoy</span><span class="author">by Decoy</span></h5><p class="card-text">Decoy.</p><a href="/ccel/decoy/work/section.html">Read online</a>';
    const inertSubtrees = [
      `<template>${decoy}</template>`,
      `<noscript>${decoy}</noscript>`,
      `<textarea>${decoy}</textarea>`,
      '<svg xmlns="http://www.w3.org/2000/svg"><g><text>Read online Decoy</text></g></svg>',
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><mtext>Read online Decoy</mtext></math>',
      `<div hidden>${decoy}</div>`,
      `<div aria-hidden="TRUE">${decoy}</div>`,
    ].join('');
    const parsed = parseCcelSearchHtml(resultPage(`${inertSubtrees}${resultCard(1)}`), 1);
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.hits[0]).toMatchObject({
      title: 'Institutes of the Christian Religion',
      author: 'Calvin, John',
    });
  });

  it('treats boolean inert and ASCII-trimmed aria-hidden on result ancestry as excluded', async () => {
    const inertCard = resultCard(1).replace('<div class="card mb-3">', '<div class="card mb-3" inert>');
    const inertBody = resultCard(1).replace('<div class="card-body">', '<div class="card-body" inert>');
    const inertAncestor = resultPage(resultCard(1)).replace('<main id="search-results">', '<main id="search-results" inert>');
    const whitespaceAriaHidden = resultCard(1).replace(
      '<div class="card mb-3">',
      '<div class="card mb-3" aria-hidden=" \tTRUE\n ">',
    );
    for (const [index, markup] of [
      resultPage(inertCard),
      resultPage(inertBody),
      inertAncestor,
      resultPage(whitespaceAriaHidden),
    ].entries()) {
      await expect(testAdapter({
        enabled: true,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(markup)),
      }).search(query({ text: `inert ancestry ${index}` }))).resolves.toMatchObject({ status: 'interface_changed', hits: [] });
    }
  });

  it('fails closed when an unreviewed section changes the heading-to-card or card-to-body path', async () => {
    const wrappedCard = `<section>${resultCard(1)}</section>`;
    const wrappedBody = resultCard(1)
      .replace('<div class="card-body">', '<section><div class="card-body">')
      .replace('</div></div>', '</div></section></div>');
    for (const [index, markup] of [wrappedCard, wrappedBody].entries()) {
      await expect(testAdapter({
        enabled: true,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(markup))),
      }).search(query({ text: `wrapper drift ${index}` }))).resolves.toMatchObject({ status: 'interface_changed', hits: [] });
    }
  });

  it('rejects duplicate attributes instead of accepting the HTML5 first-value recovery', async () => {
    const duplicateClass = resultCard(1).replace('class="card-body"', 'class="card-body" class="ignored"');
    await expect(testAdapter({
      enabled: true,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(duplicateClass))),
    }).search(query({ text: 'duplicate attribute' }))).resolves.toMatchObject({ status: 'interface_changed', hits: [] });
  });

  it('rejects table-source foster parenting and ignored table-context wrappers after the heading', async () => {
    const fosterParentedCard = `<table>${resultCard(1)}</table>`;
    const ignoredTableContext = `<tr><td>ignored by the HTML parser</td></tr>${resultCard(1)}`;
    for (const [index, markup] of [fosterParentedCard, ignoredTableContext].entries()) {
      await expect(testAdapter({
        enabled: true,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(markup))),
      }).search(query({ text: `table repair ${index}` }))).resolves.toMatchObject({ status: 'interface_changed', hits: [] });
    }
  });

  it('rejects adoption-agency repair that creates a direct card path absent from source', async () => {
    const repairedCard = resultCard(1).replace('<div class="card-body">', '<div class="card-body"></i>');
    const adoptionSourceWrapper = `<b><i>formatting wrapper</b>${repairedCard}</i>`;
    await expect(testAdapter({
      enabled: true,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(adoptionSourceWrapper))),
    }).search(query({ text: 'adoption source wrapper' }))).resolves.toMatchObject({ status: 'interface_changed', hits: [] });
  });

  it('matches a browser DOM oracle for HTML5 entity decoding before plain-text escaping', () => {
    const encodedTitle = 'Fish &amp; Bread &#x1F642; &notin; &lt;Witness&gt;';
    const markup = resultPage(resultCard(1, { title: encodedTitle }));
    const oracleWindow = new Window();
    oracleWindow.document.write(markup);
    const oracleText = oracleWindow.document.querySelector('span.title')?.textContent ?? '';
    const expected = oracleText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    expect(parseCcelSearchHtml(markup, 1).hits[0].title).toBe(expected);
  });

  it('bounds parse5 input and tree work for 100k attributes, deep wrappers, text, and nested headings', () => {
    const hundredThousandAttributes = Array.from({ length: 100_000 }, (_, index) => ` a${index}=""`).join('');
    const oversizedAttributeMarkup = `<html><body><main${hundredThousandAttributes}></main></body></html>`;
    const startedAt = performance.now();
    expect(() => parseCcelSearchHtml(oversizedAttributeMarkup, 1)).toThrow();
    expect(performance.now() - startedAt).toBeLessThan(2_000);

    const tooManyAttributes = `<main ${Array.from({ length: CCEL_SEARCH_LIMITS.maxAttributesPerElement + 1 }, (_, index) => `a${index}=""`).join(' ')}></main>`;
    expect(() => parseCcelSearchHtml(tooManyAttributes, 1)).toThrow();

    const deeplyWrapped = `${'<section>'.repeat(CCEL_SEARCH_LIMITS.maxTreeDepth + 1)}${resultPage(resultCard(1))}${'</section>'.repeat(CCEL_SEARCH_LIMITS.maxTreeDepth + 1)}`;
    expect(() => parseCcelSearchHtml(deeplyWrapped, 1)).toThrow();

    const excessiveText = `<html><body><div>${'x'.repeat(CCEL_SEARCH_LIMITS.maxTreeTextCharacters + 1)}</div></body></html>`;
    expect(() => parseCcelSearchHtml(excessiveText, 1)).toThrow();

    const nestedHeadings = `${'<h2>'.repeat(CCEL_SEARCH_LIMITS.maxTreeNodes)}${'</h2>'.repeat(CCEL_SEARCH_LIMITS.maxTreeNodes)}`;
    const headingsStartedAt = performance.now();
    expect(() => parseCcelSearchHtml(nestedHeadings, 1)).toThrow();
    expect(performance.now() - headingsStartedAt).toBeLessThan(2_000);
  });

  it('caps the current-shape card output at five 240-code-point snippets without leaking tracking values', async () => {
    const cards = Array.from({ length: 6 }, (_, index) => resultCard(index, { snippet: '🙂'.repeat(241) })).join('');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(cards)));
    const adapter = testAdapter({ enabled: true, fetchImpl });
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
    const adapter = testAdapter({ enabled: true, fetchImpl });
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
    const adapter = testAdapter({ enabled: true, fetchImpl });
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
    const adapter = testAdapter({ enabled: true, fetchImpl });
    await expect(adapter.search(query({ text: 'absent term' }))).resolves.toMatchObject({ status: 'no_results', hitCount: 0 });
    await expect(adapter.search(query({ text: 'drift one' }))).resolves.toMatchObject({ status: 'interface_changed' });
    await expect(adapter.search(query({ text: 'drift two' }))).resolves.toMatchObject({ status: 'interface_changed' });
  });

  it('recognizes no-results only when the unique heading/adjacent marker has no contradictory result structure', async () => {
    const validCard = resultCard(1);
    const competingHeading = '<h2 id="CCEL_Search_results">CCEL Search results</h2>';
    const duplicateEmpty = '<p>No results found.</p>';
    const malformedCard = '<div class="card"><div class="card-body"><h5 class="card-title">';
    const contradictions = [
      noResultsFixture.replace('</main>', `${validCard}</main>`),
      noResultsFixture.replace('</main>', `${competingHeading}</main>`),
      noResultsFixture.replace('</main>', `${duplicateEmpty}</main>`),
      noResultsFixture.replace('</main>', `${malformedCard}</main>`),
      resultPage(`${validCard}<p>No results found.</p>`),
    ];
    for (const [index, markup] of contradictions.entries()) {
      await expect(testAdapter({
        enabled: true,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(markup)),
      }).search(query({ text: `empty contradiction ${index}` }))).resolves.toMatchObject({ status: 'interface_changed', hits: [] });
    }

    const contradictoryThenEmpty = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse(contradictions[0]))
      .mockResolvedValueOnce(htmlResponse(noResultsFixture));
    const adapter = testAdapter({ enabled: true, fetchImpl: contradictoryThenEmpty });
    await expect(adapter.search(query({ text: 'not negative cached' }))).resolves.toMatchObject({ status: 'interface_changed' });
    await expect(adapter.search(query({ text: 'not negative cached' }))).resolves.toMatchObject({ status: 'no_results' });
    expect(contradictoryThenEmpty).toHaveBeenCalledTimes(2);
  });

  it('caches successful and negative metadata briefly, but not failures', async () => {
    let now = 1_000_000;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse(resultsFixture))
      .mockResolvedValueOnce(htmlResponse(noResultsFixture))
      .mockResolvedValueOnce(htmlResponse(policyFixture));
    const adapter = testAdapter({ enabled: true, fetchImpl, now: () => now });

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

    // Policy failures are never inserted into or allowed to clear the
    // metadata cache; latch/cache invalidation authority belongs upstream.
    expect(adapter.getCacheStats().entries).toBe(1);
  });


  it('fails closed on policy pages, wrong content types, foreign redirects, and oversized responses', async () => {
    const policy = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(policyFixture));
    await expect(testAdapter({ enabled: true, fetchImpl: policy }).search(query())).resolves.toMatchObject({ status: 'unavailable' });

    const wrongType = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html></html>', { headers: { 'content-type': 'application/json' } }));
    await expect(testAdapter({ enabled: true, fetchImpl: wrongType }).search(query())).resolves.toMatchObject({ status: 'interface_changed' });

    const redirect = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 302, headers: { location: 'https://evil.example/' } }));
    await expect(testAdapter({ enabled: true, fetchImpl: redirect }).search(query())).resolves.toMatchObject({ status: 'unavailable' });
    expect(redirect).toHaveBeenCalledOnce();

    const tooLarge = vi.fn<typeof fetch>().mockResolvedValue(new Response('small', { headers: {
      'content-type': 'text/html',
      'content-length': String(CCEL_SEARCH_LIMITS.maxResponseBytes + 1),
    } }));
    await expect(testAdapter({ enabled: true, fetchImpl: tooLarge }).search(query())).resolves.toMatchObject({ status: 'interface_changed' });
    expect(testAdapter({ enabled: true, fetchImpl: tooLarge }).getCacheStats().entries).toBe(0);
  });


  it('cancels every discarded redirect, non-2xx, wrong-type, and 5xx response body', async () => {
    for (const status of [403, 429, 404]) {
      const cancels: Array<ReturnType<typeof vi.spyOn>> = [];
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
        const discarded = discardableResponse(status, status === 429 ? { 'retry-after': '60' } : {});
        cancels.push(discarded.cancel);
        return discarded.response;
      });
      await testAdapter({ enabled: true, fetchImpl }).search(query({ text: `status ${status}` }));
      expect(cancels).toHaveLength(1);
      expect(cancels[0]).toHaveBeenCalled();
    }

    const failureCancels: Array<ReturnType<typeof vi.spyOn>> = [];
    const failureFetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      const discarded = discardableResponse(503);
      failureCancels.push(discarded.cancel);
      return discarded.response;
    });
    await testAdapter({ enabled: true, fetchImpl: failureFetch }).search(query({ text: 'single failure body' }));
    expect(failureCancels).toHaveLength(1);
    expect(failureCancels[0]).toHaveBeenCalled();

    const wrongType = discardableResponse(200, { 'content-type': 'application/json' });
    await testAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(wrongType.response) }).search(query({ text: 'wrong type body' }));
    expect(wrongType.cancel).toHaveBeenCalled();

    const redirect = discardableResponse(302, { location: 'https://ccel.org/?page=1&text=redirected' });
    const redirectFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(redirect.response)
      .mockImplementationOnce(async () => htmlResponse(resultsFixture));
    await testAdapter({ enabled: true, fetchImpl: redirectFetch }).search(query({ text: 'same host redirect' }));
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
    await expect(testAdapter({ enabled: true, fetchImpl }).search(query({ text: 'redirect cap' })))
      .resolves.toMatchObject({ status: 'unavailable' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(cancels.every(cancel => cancel.mock.calls.length > 0)).toBe(true);
  });

  it('does not treat result text as structural no-results or policy state', async () => {
    const resultText = resultPage(resultCard(1, {
      snippet: 'No results found is a phrase inside a legitimate discovery snippet about maintenance and terms of use.',
    }));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultText));
    await expect(testAdapter({ enabled: true, fetchImpl }).search(query({ text: 'phrase state' })))
      .resolves.toMatchObject({ status: 'ok', hitCount: 1 });

    const unmarked = htmlResponse('<html><body><main id="search-results"><h2>No results found.</h2></main></body></html>');
    await expect(testAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(unmarked) }).search(query({ text: 'unmarked empty' })))
      .resolves.toMatchObject({ status: 'interface_changed' });
  });

  it('sanitizes scripts, forms, hidden content, event attributes, and encoded markup', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(maliciousFixture));
    const result = await testAdapter({ enabled: true, fetchImpl }).search(query());
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
    const bounded = await testAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(longCard))) }).search(query({ text: 'field caps' }));
    expect(bounded).toMatchObject({ status: 'ok', hitCount: 1 });
    expect(bounded.hits[0].title.length).toBeLessThanOrEqual(CCEL_SEARCH_LIMITS.maxTitleCharacters);
    expect(bounded.hits[0].author?.length).toBeLessThanOrEqual(CCEL_SEARCH_LIMITS.maxAuthorResultCharacters);
    expect(bounded.hits[0].snippet.length).toBeLessThanOrEqual(CCEL_SEARCH_LIMITS.maxSnippetCharacters);

    const nineCards = Array.from({ length: 9 }, (_, index) => resultCard(index)).join('');
    await expect(testAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(nineCards))) }).search(query({ text: 'result cap', limit: 5 })))
      .resolves.toMatchObject({ status: 'ok', hitCount: 5 });

    const fiftyCards = Array.from({ length: 50 }, (_, index) => resultCard(index)).join('');
    await expect(testAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(resultPage(fiftyCards))) }).search(query({ text: 'candidate cap' })))
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
    await expect(testAdapter({ enabled: true, fetchImpl }).search(query({ text: 'stream overflow' })))
      .resolves.toMatchObject({ status: 'interface_changed' });
    expect(testAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>() }).getCacheStats().entries).toBe(0);
  });

  it('cancels and settles a stalled stream on timeout without late reader errors or retries', async () => {
    vi.useFakeTimers();
    let cancelCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => {}),
      cancel: () => { cancelCount++; },
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'text/html' } }));
    const adapter = testAdapter({ enabled: true, fetchImpl });
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
    await expect(testAdapter({ enabled: true, fetchImpl }).search(query({ text: 'cleanup classification' })))
      .resolves.toMatchObject({ status: 'interface_changed' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not wait for never-settling discarded-response cancellation', async () => {
    const response = htmlResponse('forbidden', 403);
    const cancel = vi.spyOn(response.body!, 'cancel').mockImplementation(() => new Promise<void>(() => {}));
    const adapter = testAdapter({ enabled: true, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response) });

    await expect(adapter.search(query({ text: 'detached discard' }))).resolves.toMatchObject({ status: 'unavailable' });
    expect(cancel).toHaveBeenCalledOnce();
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
    const adapter = testAdapter({
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
    const adapter = testAdapter({ enabled: true, fetchImpl, cacheMaxEntries: 2, cacheMaxBytes: 5_000 });
    await adapter.search(query({ limit: 5 }));
    await adapter.search(query({ limit: 1 }));
    await adapter.search(query({ match: 'phrase' }));
    await adapter.search(query({ author: 'Calvin' }));
    await adapter.search(query({ work: 'Institutes' }));
    expect(fetchImpl.mock.calls.length).toBe(4);

    let ttlNow = 60_000;
    const ttlFetch = vi.fn<typeof fetch>().mockImplementation(async () => htmlResponse(single));
    const ttl = testAdapter({ enabled: true, fetchImpl: ttlFetch, now: () => ttlNow });
    await ttl.search(query({ text: 'ttl isolation' }));
    await ttl.search(query({ text: 'ttl isolation' }));
    expect(ttlFetch).toHaveBeenCalledOnce();
    ttlNow += CCEL_SEARCH_LIMITS.cacheTtlMs + 1;
    await ttl.search(query({ text: 'ttl isolation' }));
    expect(ttlFetch).toHaveBeenCalledTimes(2);

    const lruFetch = vi.fn<typeof fetch>().mockImplementation(async () => htmlResponse(single));
    const lru = testAdapter({ enabled: true, fetchImpl: lruFetch, cacheMaxEntries: 2 });
    await lru.search({ text: 'a' });
    await lru.search({ text: 'b' });
    await lru.search({ text: 'a' });
    await lru.search({ text: 'c' });
    await lru.search({ text: 'b' });
    expect(lruFetch).toHaveBeenCalledTimes(4);
    expect(lru.getCacheStats().entries).toBeLessThanOrEqual(2);

    const byteFetch = vi.fn<typeof fetch>().mockImplementation(async () => htmlResponse(single));
    const byteBounded = testAdapter({ enabled: true, fetchImpl: byteFetch, cacheMaxBytes: 1 });
    await byteBounded.search(query());
    await byteBounded.search(query());
    expect(byteFetch).toHaveBeenCalledTimes(2);
    expect(byteBounded.getCacheStats().entries).toBe(0);

    const sizingFetch = vi.fn<typeof fetch>().mockImplementation(async () => htmlResponse(single));
    const sizing = testAdapter({ enabled: true, fetchImpl: sizingFetch });
    await sizing.search({ text: 'size one' });
    const oneEntryBytes = sizing.getCacheStats().bytes;
    const pressureFetch = vi.fn<typeof fetch>().mockImplementation(async () => htmlResponse(single));
    const pressure = testAdapter({
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

});
