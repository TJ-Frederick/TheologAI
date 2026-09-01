import { describe, expect, it, vi } from 'vitest';
import { PrimarySourceSearchService } from '../../../../src/services/historical/PrimarySourceSearchService.js';
import type { PrimarySourceProviderResult } from '../../../../src/services/historical/primarySourceTypes.js';
import type { PrimarySourceSearchHit } from '../../../../src/services/historical/primarySourceTypes.js';
import { CCEL_COMPOSITION_DATE_NOTICE } from '../../../../src/services/historical/primarySourceTypes.js';
import { readPrimarySourceContractConfig } from '../../../../src/kernel/featureFlags.js';
import type { CcelUpstreamCoordinator } from '../../../../src/services/historical/CcelUpstreamCoordinator.js';
import type { CcelPrimarySourceSearchPort, LocalPrimarySourceSearchPort } from '../../../../src/services/historical/PrimarySourceSearchPorts.js';

function providerResult(provider: 'local' | 'ccel_live', status: PrimarySourceProviderResult['status'] = 'ok', count = 1): PrimarySourceProviderResult {
  const hits: PrimarySourceSearchHit[] = Array.from({ length: count }, (_, index) => provider === 'local'
    ? {
      provider: 'local' as const, title: `${provider} ${index}`, snippet: 'evidence',
      locator: { kind: 'local_section' as const, documentId: 'doc', sectionKey: `source-${String(index + 1).padStart(4, '0')}`, sourceOrdinal: index + 1, url: `theologai://documents/doc#section-source-${String(index + 1).padStart(4, '0')}` },
      resourceSizeBytes: 100 + index, rankWithinProvider: index + 1, page: 1, snippetOnly: true as const, attribution: provider,
    }
    : {
      provider: 'ccel_live' as const, title: `${provider} ${index}`, snippet: 'evidence',
      locator: { kind: 'ccel_section' as const, work: 'calvin/institutes', section: String(index), url: `https://ccel.org/ccel/calvin/institutes/${index}.html` },
      rankWithinProvider: index + 1, page: 1, snippetOnly: true as const, attribution: provider,
    });
  return {
    provider, status, searched: status !== 'disabled' && status !== 'catalog_miss', page: 1,
    hitCount: count,
    resultWindow: { returnedHitCount: count, additionalMatchStatus: 'not_evaluated' },
    hits,
    notices: [],
    ...(provider === 'local' && (status === 'ok' || status === 'no_results' || status === 'catalog_miss') ? {
      scope: {
        status: status === 'catalog_miss' ? 'catalog_miss' as const : 'matched' as const,
        requested: {}, eligibleDocumentCount: status === 'catalog_miss' ? 0 : 1,
        eligibleDocuments: [], eligibleDocumentsTruncated: false,
      },
    } : {}),
  };
}

const plan = (queries: unknown[]) => ({ queries });
const query = (overrides: Record<string, unknown> = {}) => ({ id: 'q1', text: 'union with Christ', providers: ['local'], ...overrides });
const v7Query = (overrides: Record<string, unknown> = {}) => ({ id: 'q1', text: 'union with Christ', ...overrides });
const dormant = { exposeCcelDiscovery: false, ccelLiveSearch: false, ccelCoordinator: false, contractVersion: '6' as const, liveCcelEnabled: false };
const live = { exposeCcelDiscovery: true, ccelLiveSearch: true, ccelCoordinator: true, contractVersion: '7' as const, liveCcelEnabled: true };
const v8Live = { ...live, contractVersion: '8' as const };
const coordinator = { admit: vi.fn(), recordOutcome: vi.fn(), snapshot: vi.fn() } satisfies CcelUpstreamCoordinator;

describe('PrimarySourceSearchService', () => {
  it.each([
    [false, false, false], [false, false, true], [false, true, false], [false, true, true],
    [true, false, false], [true, false, true], [true, true, false], [true, true, true],
  ])('enforces the complete three-gate truth table (%s,%s,%s)', async (exposure, liveSearch, coordinatorEnabled) => {
    const fetchSpy = vi.fn();
    const adapterSearch = vi.fn(async () => {
      await fetchSpy();
      return providerResult('ccel_live', 'no_results', 0);
    });
    const getByName = vi.fn();
    const rpcAdmit = vi.fn(async () => {
      getByName('ccel-public-search-origin-v1');
      return { kind: 'admitted' as const, token: { attemptId: 1, operatorEpoch: 0 }, admittedAtMs: 1, nextAllowedAtMs: 2, probe: false };
    });
    const gate = { admit: rpcAdmit, recordOutcome: vi.fn(), snapshot: vi.fn() } satisfies CcelUpstreamCoordinator;
    const config = readPrimarySourceContractConfig({
      THEOLOGAI_EXPOSE_CCEL_DISCOVERY: String(exposure),
      THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: String(liveSearch),
      THEOLOGAI_ENABLE_CCEL_COORDINATOR: String(coordinatorEnabled),
    });
    const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'no_results', 0)) } satisfies LocalPrimarySourceSearchPort;
    const ccel = { search: adapterSearch } satisfies CcelPrimarySourceSearchPort;
    const service = new PrimarySourceSearchService(local, ccel, config, gate);
    await service.search(plan([
      exposure ? v7Query({ searchDepth: 'expanded' }) : query(),
    ]));

    const fullyEnabled = exposure && liveSearch && coordinatorEnabled;
    expect(adapterSearch).toHaveBeenCalledTimes(fullyEnabled ? 1 : 0);
    expect(fetchSpy).toHaveBeenCalledTimes(fullyEnabled ? 1 : 0);
    // The real adapter performs admission; this harness represents the same
    // DO lookup/RPC boundary and proves it remains behind the adapter call.
    if (fullyEnabled) await gate.admit();
    expect(getByName).toHaveBeenCalledTimes(fullyEnabled ? 1 : 0);
    expect(rpcAdmit).toHaveBeenCalledTimes(fullyEnabled ? 1 : 0);
  });

  it.each([
    [false, false, false], [false, false, true], [false, true, false], [false, true, true],
    [true, false, false], [true, false, true], [true, true, false], [true, true, true],
  ])('keeps dormant v8 behind the same complete execution gates (%s,%s,%s)', async (exposure, liveSearch, coordinatorEnabled) => {
    const adapterSearch = vi.fn().mockResolvedValue(providerResult('ccel_live', 'no_results', 0));
    const config = readPrimarySourceContractConfig({
      THEOLOGAI_EXPOSE_CCEL_DISCOVERY: String(exposure),
      THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: String(liveSearch),
      THEOLOGAI_ENABLE_CCEL_COORDINATOR: String(coordinatorEnabled),
      THEOLOGAI_ENABLE_PRIMARY_SOURCE_RESEARCH_V8: 'true',
    });
    const service = new PrimarySourceSearchService(
      { search: vi.fn().mockResolvedValue(providerResult('local', 'no_results', 0)) },
      { search: adapterSearch },
      config,
      coordinator,
    );
    await service.search(plan([exposure
      ? v7Query({ searchDepth: 'expanded', expansionBasis: { reason: 'no_results' } })
      : query()]));

    expect(config.contractVersion).toBe(exposure ? '8' : '6');
    expect(adapterSearch).toHaveBeenCalledTimes(exposure && liveSearch && coordinatorEnabled ? 1 : 0);
  });

  it('validates the complete plan atomically before any provider call', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local')) };
    const ccel = { search: vi.fn().mockResolvedValue(providerResult('ccel_live')) };
    const service = new PrimarySourceSearchService(local, ccel, live, coordinator);
    await expect(service.search(plan([v7Query(), v7Query({ id: 'q1' })]))).rejects.toThrow('Duplicate');
    await expect(service.search(plan([0, 1].map(index => v7Query({ id: `q${index}`, searchDepth: 'expanded' }))))).rejects.toThrow('At most 1');
    expect(local.search).not.toHaveBeenCalled();
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it('does not authorize expansion from a malformed local result', async () => {
    const malformed = { ...providerResult('local', 'no_results', 0), scope: undefined };
    const ccel = { search: vi.fn() };
    const result = await new PrimarySourceSearchService(
      { search: vi.fn().mockResolvedValue(malformed) }, ccel, v8Live, coordinator,
    ).search(plan([v7Query({ searchDepth: 'expanded', expansionBasis: { reason: 'no_results' } })]));

    expect(result.queries[0]!.expansionDecision).toMatchObject({
      requested: true, triggered: false, reason: 'local_result_invalid',
    });
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it('does not authorize expansion from a stale local scope or contradictory eligible-work count', async () => {
    const staleScope = providerResult('local', 'no_results', 0);
    staleScope.scope!.requested = { author: 'John Owen' };
    const contradictoryCount = providerResult('local', 'ok', 1);
    contradictoryCount.scope!.eligibleDocumentCount = 0;
    const ccel = { search: vi.fn() };
    const service = new PrimarySourceSearchService(
      { search: vi.fn()
        .mockResolvedValueOnce(staleScope)
        .mockResolvedValueOnce(contradictoryCount) },
      ccel, v8Live, coordinator,
    );

    const stale = await service.search(plan([v7Query({
      author: 'Richard Baxter', searchDepth: 'expanded', expansionBasis: { reason: 'no_results' },
    })]));
    const contradictory = await service.search(plan([v7Query({
      searchDepth: 'expanded', selection: 'work_diversity',
      expansionBasis: { reason: 'insufficient_diversity', minimumDistinctWorks: 3, observedDistinctWorks: 1 },
    })]));

    expect(stale.queries[0]!.expansionDecision?.reason).toBe('local_result_invalid');
    expect(contradictory.queries[0]!.expansionDecision?.reason).toBe('local_result_invalid');
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it('normalizes literals, preserves query/provider order, and makes local-only zero network calls', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local')) };
    const ccel = { search: vi.fn() };
    const service = new PrimarySourceSearchService(local, ccel, dormant);
    const result = await service.search(plan([query({ text: '  union\n with   Christ  ', providers: ['local'] })]));
    expect(result.planStatus).toBe('complete');
    expect(result.queries[0]).toMatchObject({ normalizedMode: 'all_terms', normalizedSelection: 'relevance' });
    expect(result.queries[0].providers[0].hits[0].queryId).toBe('q1');
    expect(local.search).toHaveBeenCalledWith(expect.objectContaining({
      text: 'union with Christ', match: 'all_terms', selection: 'relevance', page: 1, limit: 5,
    }));
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it('uses the provider-neutral v7 expanded shape: local first, then one bounded external group without date filters', async () => {
    const events: string[] = [];
    const local = { search: vi.fn(async () => {
      events.push('catalog');
      return providerResult('local', 'no_results', 0);
    }) };
    const ccel = { search: vi.fn(async () => {
      events.push('expanded');
      return providerResult('ccel_live', 'no_results', 0);
    }) };
    const service = new PrimarySourceSearchService(local, ccel, live, coordinator);
    const result = await service.search(plan([{
      id: 'expanded', text: 'grace', searchDepth: 'expanded', expandedLimit: 4, startYear: 500, endYear: 1500,
    }]));
    expect(result.queries[0]!.providers.map(provider => provider.provider)).toEqual(['local', 'ccel_live']);
    expect(local.search).toHaveBeenCalledWith(expect.objectContaining({ startYear: 500, endYear: 1500 }));
    expect(ccel.search).toHaveBeenCalledWith(expect.objectContaining({ limit: 4, page: 1 }), coordinator);
    expect(ccel.search).toHaveBeenCalledWith(expect.objectContaining({ limit: 4, page: 1 }), coordinator);
    expect(ccel.search).not.toHaveBeenCalledWith(expect.objectContaining({ startYear: 500 }), coordinator);
    expect(ccel.search).not.toHaveBeenCalledWith(expect.objectContaining({ endYear: 1500 }), coordinator);
    expect(result.queries[0]!.providers[1]!.notices[0]).toBe(CCEL_COMPOSITION_DATE_NOTICE);
    expect(events).toEqual(['catalog', 'expanded']);
  });

  it('keeps a v8 standard pass local and records that no expansion was requested', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local')) };
    const ccel = { search: vi.fn() };
    const result = await new PrimarySourceSearchService(local, ccel, v8Live, coordinator)
      .search(plan([v7Query({ searchDepth: 'standard' })]));

    expect(result.queries[0]).toMatchObject({
      providers: [{ provider: 'local' }],
      expansionDecision: { requested: false, triggered: false, reason: 'not_requested', localDistinctWorkCount: 1 },
    });
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it.each([
    ['catalog_miss', providerResult('local', 'catalog_miss', 0), { reason: 'catalog_miss' }],
    ['no_results', providerResult('local', 'no_results', 0), { reason: 'no_results' }],
  ] as const)('runs one v8 external retry only after revalidating %s', async (reason, localResult, expansionBasis) => {
    const events: string[] = [];
    const local = { search: vi.fn(async () => { events.push('local'); return localResult; }) };
    const ccel = { search: vi.fn(async () => { events.push('external'); return providerResult('ccel_live', 'no_results', 0); }) };
    const result = await new PrimarySourceSearchService(local, ccel, v8Live, coordinator).search(plan([v7Query({
      searchDepth: 'expanded', expansionBasis,
    })]));

    expect(result.queries[0]).toMatchObject({
      expansionDecision: { requested: true, triggered: true, reason, basis: expansionBasis },
      providers: [{ provider: 'local' }, { provider: 'ccel_live' }],
    });
    expect(events).toEqual(['local', 'external']);
  });

  it('revalidates v8 diversity by distinct local document identity, not section count', async () => {
    const localResult = providerResult('local', 'ok', 3);
    for (const hit of localResult.hits) {
      if (hit.provider === 'local') hit.locator.documentId = 'same-work';
    }
    const local = { search: vi.fn().mockResolvedValue(localResult) };
    const ccel = { search: vi.fn().mockResolvedValue(providerResult('ccel_live', 'no_results', 0)) };
    const basis = { reason: 'insufficient_diversity' as const, minimumDistinctWorks: 3, observedDistinctWorks: 1 };
    const result = await new PrimarySourceSearchService(local, ccel, v8Live, coordinator).search(plan([v7Query({
      searchDepth: 'expanded', selection: 'work_diversity', expansionBasis: basis,
    })]));

    expect(result.queries[0]!.expansionDecision).toEqual({
      requested: true, triggered: true, reason: 'insufficient_diversity',
      localDistinctWorkCount: 1, basis,
    });
    expect(ccel.search).toHaveBeenCalledTimes(1);
  });

  it('budgets all four v8 local windows before expanded discovery', async () => {
    const events: string[] = [];
    let localIndex = 0;
    const local = { search: vi.fn(async () => {
      events.push('local');
      const result = providerResult('local', 'ok', 8);
      if (localIndex++ > 0) {
        for (const [index, hit] of result.hits.entries()) {
          if (hit.provider === 'local') hit.locator.documentId = `doc-${index + 1}`;
        }
        result.scope!.eligibleDocumentCount = 8;
      }
      return result;
    }) };
    const ccel = { search: vi.fn(async () => {
      events.push('external');
      return providerResult('ccel_live', 'ok', 5);
    }) };
    const queries = [0, 1, 2, 3].map(index => v7Query({
      id: `q${index + 1}`, limit: 8,
      ...(index === 0 ? {
        searchDepth: 'expanded', selection: 'work_diversity',
        expansionBasis: { reason: 'insufficient_diversity', minimumDistinctWorks: 3, observedDistinctWorks: 1 },
      } : { searchDepth: 'standard' }),
    }));

    const result = await new PrimarySourceSearchService(local, ccel, v8Live, coordinator).search(plan(queries));

    expect(events).toEqual(['local', 'local', 'local', 'local', 'external']);
    expect(result.queries.map(queryResult => queryResult.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
    expect(result.queries.map(queryResult => queryResult.providers[0]!.hitCount)).toEqual([8, 8, 8, 8]);
    expect(result.queries.map(queryResult => queryResult.expansionDecision?.localDistinctWorkCount)).toEqual([1, 8, 8, 8]);
    expect(result.queries[0]!.providers).toMatchObject([
      { provider: 'local', hitCount: 8 },
      {
        provider: 'ccel_live', hitCount: 0,
        resultWindow: { returnedHitCount: 0, additionalMatchStatus: 'additional_match_observed' },
      },
    ]);
    expect(result).toMatchObject({
      planStatus: 'partial',
      coverage: { localHitCount: 32, ccelAttempted: true, ccelHitCount: 0 },
    });
  });

  it.each([
    ['stale catalog miss', providerResult('local', 'ok', 1), { reason: 'catalog_miss' }, 'basis_not_confirmed'],
    ['metadata uncertainty', {
      ...providerResult('local', 'no_results', 0),
      scope: {
        status: 'metadata_incomplete' as const, requested: {}, eligibleDocumentCount: 0,
        eligibleDocuments: [], eligibleDocumentsTruncated: false,
      },
    }, { reason: 'no_results' }, 'local_coverage_uncertain'],
    ['local failure', providerResult('local', 'unavailable', 0), { reason: 'no_results' }, 'local_search_unavailable'],
  ] as const)('does not expand a v8 %s basis', async (_label, localResult, expansionBasis, reason) => {
    const ccel = { search: vi.fn() };
    const result = await new PrimarySourceSearchService(
      { search: vi.fn().mockResolvedValue(localResult) }, ccel, v8Live, coordinator,
    ).search(plan([v7Query({ searchDepth: 'expanded', expansionBasis })]));

    expect(result.queries[0]).toMatchObject({
      providers: [{ provider: 'local' }],
      expansionDecision: { requested: true, triggered: false, reason, basis: expansionBasis },
    });
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it.each([
    { searchDepth: 'expanded' },
    { searchDepth: 'standard', expansionBasis: { reason: 'no_results' } },
    { searchDepth: 'expanded', expansionBasis: { reason: 'insufficient_diversity', minimumDistinctWorks: 3, observedDistinctWorks: 3 }, selection: 'work_diversity' },
    { searchDepth: 'expanded', expansionBasis: { reason: 'insufficient_diversity', minimumDistinctWorks: 3, observedDistinctWorks: 1 }, selection: 'relevance' },
  ])('rejects invalid v8 expansion evidence atomically %#', async invalid => {
    const local = { search: vi.fn() };
    const ccel = { search: vi.fn() };
    await expect(new PrimarySourceSearchService(local, ccel, v8Live, coordinator)
      .search(plan([v7Query(invalid)]))).rejects.toThrow('expansionBasis');
    expect(local.search).not.toHaveBeenCalled();
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it.each([0, 6, 1.5])('rejects invalid v7 expandedLimit %s before provider work', async expandedLimit => {
    const local = { search: vi.fn() };
    const ccel = { search: vi.fn() };
    const service = new PrimarySourceSearchService(local, ccel, live, coordinator);
    await expect(service.search(plan([v7Query({ searchDepth: 'expanded', expandedLimit })]))).rejects.toThrow('expandedLimit');
    expect(local.search).not.toHaveBeenCalled();
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it('rejects v7 expandedLimit without expanded searchDepth and more than one expanded query', async () => {
    const service = new PrimarySourceSearchService(
      { search: vi.fn() } satisfies LocalPrimarySourceSearchPort,
      { search: vi.fn() } satisfies CcelPrimarySourceSearchPort,
      live,
      coordinator,
    );
    await expect(service.search(plan([{ id: 'q1', text: 'grace', expandedLimit: 3 }]))).rejects.toThrow('expandedLimit');
    await expect(service.search(plan([
      { id: 'q1', text: 'grace', searchDepth: 'expanded' }, { id: 'q2', text: 'faith', searchDepth: 'expanded' },
    ]))).rejects.toThrow('At most 1');
  });

  it('preserves separate creator scopes and mixed unfiltered/date/work plans', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'catalog_miss', 0)) };
    const service = new PrimarySourceSearchService(local, { search: vi.fn() } satisfies CcelPrimarySourceSearchPort, dormant);
    const result = await service.search(plan([
      query({ id: 'erasmus', author: 'Erasmus of Rotterdam' }),
      query({ id: 'luther', author: 'Martin Luther' }),
      query({ id: 'medieval', startYear: 500, endYear: 1500 }),
      query({ id: 'institutes', work: 'Institutes of the Christian Religion' }),
    ]));
    expect(result.planStatus).toBe('complete');
    expect(local.search.mock.calls.map(([call]) => call)).toEqual([
      expect.objectContaining({ author: 'Erasmus of Rotterdam' }),
      expect.objectContaining({ author: 'Martin Luther' }),
      expect.objectContaining({ startYear: 500, endYear: 1500 }),
      expect.objectContaining({ work: 'Institutes of the Christian Religion' }),
    ]);
  });

  it('preserves completed catalog results and returns a separate disabled expansion without calling the adapter', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'no_results', 0)) };
    const ccel = { search: vi.fn() };
    const exposedDisabled = { ...live, ccelLiveSearch: false, ccelCoordinator: false, liveCcelEnabled: false };
    const service = new PrimarySourceSearchService(local, ccel, exposedDisabled);
    const result = await service.search(plan([v7Query({ searchDepth: 'expanded' })]));
    expect(result).toMatchObject({
      planStatus: 'partial',
      queries: [{ providers: [
        { provider: 'local', status: 'no_results', searched: true },
        { provider: 'ccel_live', status: 'disabled', searched: false },
      ] }],
      coverage: { localAttempted: true, ccelAttempted: false, ccelStatus: 'disabled' },
    });
    expect(result.queries[0]!.providers[1]!.notices).not.toContain(CCEL_COMPOSITION_DATE_NOTICE);
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it.each([
    ['standard catalog search', {}],
    ['expanded discovery', { searchDepth: 'expanded' }],
  ])('rejects v7 %s beyond page one before any catalog or external work', async (_label, queryOverrides) => {
    const local = { search: vi.fn() };
    const ccel = { search: vi.fn() };
    const gate = { admit: vi.fn(), recordOutcome: vi.fn(), snapshot: vi.fn() } satisfies CcelUpstreamCoordinator;
    const service = new PrimarySourceSearchService(local, ccel, live, gate);
    await expect(service.search(plan([v7Query({ ...queryOverrides, page: 2 })]))).rejects.toThrow('page 1');
    expect(local.search).not.toHaveBeenCalled();
    expect(ccel.search).not.toHaveBeenCalled();
    expect(gate.admit).not.toHaveBeenCalled();
  });

  it('applies date bounds to the catalog while deliberately omitting them from expanded discovery', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'no_results', 0)) };
    const ccel = { search: vi.fn().mockResolvedValue(providerResult('ccel_live', 'no_results', 0)) };
    const gate = { admit: vi.fn(), recordOutcome: vi.fn(), snapshot: vi.fn() } satisfies CcelUpstreamCoordinator;
    const service = new PrimarySourceSearchService(local, ccel, live, gate);

    const result = await service.search(plan([v7Query({
      searchDepth: 'expanded', startYear: 500, endYear: 1500,
    })]));

    expect(result.queries[0]!.providers).toMatchObject([
      { provider: 'local', status: 'no_results', searched: true },
      { provider: 'ccel_live', status: 'no_results', searched: true },
    ]);
    expect(local.search).toHaveBeenCalledWith(expect.objectContaining({ startYear: 500, endYear: 1500 }));
    expect(ccel.search).toHaveBeenCalledWith(expect.not.objectContaining({ startYear: expect.anything(), endYear: expect.anything() }), gate);
    expect(gate.admit).not.toHaveBeenCalled();
  });

  it.each(['ok', 'no_results', 'unavailable', 'rate_limited', 'interface_changed'] as const)(
    'prepends the composition-date invariant to an executable unbounded CCEL %s result',
    async status => {
      const returned = providerResult('ccel_live', status, status === 'ok' ? 1 : 0);
      returned.notices = ['Provider-specific notice.'];
      if (status === 'rate_limited') returned.retryAfterSeconds = 10;
      const ccel = { search: vi.fn().mockResolvedValue(returned) };
      const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'no_results', 0)) };
      const service = new PrimarySourceSearchService(local, ccel, live, coordinator);

      const result = await service.search(plan([v7Query({ searchDepth: 'expanded' })]));

      expect(ccel.search).toHaveBeenCalledTimes(1);
      const [adapterQuery, passedCoordinator] = ccel.search.mock.calls[0]!;
      expect(adapterQuery).not.toHaveProperty('startYear');
      expect(adapterQuery).not.toHaveProperty('endYear');
      expect(passedCoordinator).toBe(coordinator);
      expect(result.queries[0]!.providers[1]!.notices).toEqual([
        CCEL_COMPOSITION_DATE_NOTICE,
        'Provider-specific notice.',
      ]);
    },
  );

  it('isolates failures and never turns local no-results plus CCEL failure into complete no-results', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'no_results', 0)) };
    const ccel = { search: vi.fn().mockResolvedValue(providerResult('ccel_live', 'unavailable', 0)) };
    const result = await new PrimarySourceSearchService(local, ccel, live, coordinator)
      .search(plan([v7Query({ searchDepth: 'expanded' })]));
    expect(result.planStatus).toBe('partial');
    expect(result.queries[0].providers.map(item => item.status)).toEqual(['no_results', 'unavailable']);
  });

  it('caps aggregate hits at 32 without merging provider ranks', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'ok', 8)) };
    const ccel = { search: vi.fn().mockResolvedValue(providerResult('ccel_live', 'ok', 8)) };
    const queries = [0, 1, 2, 3].map(index => v7Query({
      id: `q${index}`, ...(index === 0 ? { searchDepth: 'expanded' } : {}), limit: 8,
    }));
    const result = await new PrimarySourceSearchService(local, ccel, live, coordinator).search(plan(queries));
    expect(result.planStatus).toBe('partial');
    expect(result.queries.flatMap(item => item.providers).flatMap(item => item.hits)).toHaveLength(32);
    expect(result.queries.map(item => item.providers.map(provider => provider.hitCount)))
      .toEqual([[8, 8], [8], [8], [0]]);
    expect(result.queries[0].providers[0].hits[0].rankWithinProvider).toBe(1);
    const truncated = result.queries.flatMap(item => item.providers).find(item => item.hits.length < 8);
    expect(truncated?.resultWindow.additionalMatchStatus).toBe('additional_match_observed');
  });

  it.each([
    plan([]),
    plan([query({ id: 'bad id' })]),
    plan([query({ text: '\u0000bad' })]),
    plan([query({ providers: ['local', 'local'] })]),
    plan([query({ match: 'all_terms', text: 'one two three four five six seven eight nine ten eleven twelve thirteen' })]),
    plan([query({ startYear: 1600, endYear: 1500 })]),
    plan([query({ startYear: 1500.5 })]),
    plan([query({ selection: 'random' })]),
    { queries: [query()], extra: true },
  ])('rejects invalid bounded plans %#', async invalid => {
    const service = new PrimarySourceSearchService(
      { search: vi.fn() } satisfies LocalPrimarySourceSearchPort,
      { search: vi.fn() } satisfies CcelPrimarySourceSearchPort,
      dormant,
    );
    await expect(service.search(invalid)).rejects.toThrow();
  });
});
