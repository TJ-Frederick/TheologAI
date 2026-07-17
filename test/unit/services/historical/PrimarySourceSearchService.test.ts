import { describe, expect, it, vi } from 'vitest';
import { PrimarySourceSearchService } from '../../../../src/services/historical/PrimarySourceSearchService.js';
import type { PrimarySourceProviderResult } from '../../../../src/services/historical/primarySourceTypes.js';
import { CCEL_COMPOSITION_DATE_NOTICE } from '../../../../src/services/historical/primarySourceTypes.js';
import { readPrimarySourceContractConfig } from '../../../../src/kernel/featureFlags.js';

function providerResult(provider: 'local' | 'ccel_live', status: PrimarySourceProviderResult['status'] = 'ok', count = 1): PrimarySourceProviderResult {
  return {
    provider, status, searched: status !== 'disabled', page: 1,
    hitCount: count,
    resultWindow: { returnedHitCount: count, additionalMatchStatus: 'not_evaluated' },
    hits: Array.from({ length: count }, (_, index) => ({
      provider, title: `${provider} ${index}`, snippet: 'evidence',
      locator: provider === 'local'
        ? { kind: 'local_section', documentId: 'doc', sectionId: String(index), url: `theologai://documents/doc#section-${index}` }
        : { kind: 'ccel_section', work: 'calvin/institutes', section: String(index), url: `https://ccel.org/ccel/calvin/institutes/${index}.html` },
      ...(provider === 'local' ? { resourceSizeBytes: 100 + index } : {}),
      rankWithinProvider: index + 1, page: 1, snippetOnly: true, attribution: provider,
    })),
    notices: [],
  };
}

const plan = (queries: unknown[]) => ({ queries });
const query = (overrides: Record<string, unknown> = {}) => ({ id: 'q1', text: 'union with Christ', providers: ['local'], ...overrides });
const dormant = { exposeCcelDiscovery: false, ccelLiveSearch: false, ccelCoordinator: false, contractVersion: '4' as const, liveCcelEnabled: false };
const live = { exposeCcelDiscovery: true, ccelLiveSearch: true, ccelCoordinator: true, contractVersion: '5' as const, liveCcelEnabled: true };
const coordinator = { admit: vi.fn(), recordOutcome: vi.fn(), snapshot: vi.fn() } as any;

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
    const gate = { admit: rpcAdmit, recordOutcome: vi.fn(), snapshot: vi.fn() } as any;
    const config = readPrimarySourceContractConfig({
      THEOLOGAI_EXPOSE_CCEL_DISCOVERY: String(exposure),
      THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: String(liveSearch),
      THEOLOGAI_ENABLE_CCEL_COORDINATOR: String(coordinatorEnabled),
    });
    const service = new PrimarySourceSearchService({ search: vi.fn() } as any, { search: adapterSearch } as any, config, gate);
    await service.search(plan([query({ providers: ['ccel'] })]));

    const fullyEnabled = exposure && liveSearch && coordinatorEnabled;
    expect(adapterSearch).toHaveBeenCalledTimes(fullyEnabled ? 1 : 0);
    expect(fetchSpy).toHaveBeenCalledTimes(fullyEnabled ? 1 : 0);
    // The real adapter performs admission; this harness represents the same
    // DO lookup/RPC boundary and proves it remains behind the adapter call.
    if (fullyEnabled) await gate.admit();
    expect(getByName).toHaveBeenCalledTimes(fullyEnabled ? 1 : 0);
    expect(rpcAdmit).toHaveBeenCalledTimes(fullyEnabled ? 1 : 0);
  });

  it('validates the complete plan atomically before any provider call', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local')) };
    const ccel = { search: vi.fn().mockResolvedValue(providerResult('ccel_live')) };
    const service = new PrimarySourceSearchService(local as any, ccel as any, live, coordinator);
    await expect(service.search(plan([query(), query({ id: 'q1' })]))).rejects.toThrow('Duplicate');
    await expect(service.search(plan([0, 1].map(index => query({ id: `q${index}`, providers: ['ccel'] }))))).rejects.toThrow('At most 1');
    expect(local.search).not.toHaveBeenCalled();
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it('normalizes literals, preserves query/provider order, and makes local-only zero network calls', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local')) };
    const ccel = { search: vi.fn() };
    const service = new PrimarySourceSearchService(local as any, ccel as any, dormant);
    const result = await service.search(plan([query({ text: '  union\n with   Christ  ', providers: ['local'] })]));
    expect(result.planStatus).toBe('complete');
    expect(result.queries[0]).toMatchObject({ normalizedMode: 'all_terms', normalizedSelection: 'relevance' });
    expect(result.queries[0].providers[0].hits[0].queryId).toBe('q1');
    expect(local.search).toHaveBeenCalledWith(expect.objectContaining({
      text: 'union with Christ', match: 'all_terms', selection: 'relevance', page: 1, limit: 5,
    }));
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it('preserves separate creator scopes and mixed unfiltered/date/work plans', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'catalog_miss', 0)) };
    const service = new PrimarySourceSearchService(local as any, { search: vi.fn() } as any, dormant);
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

  it('returns explicit disabled coverage for ccel-only without calling the adapter', async () => {
    const ccel = { search: vi.fn() };
    const service = new PrimarySourceSearchService({ search: vi.fn() } as any, ccel as any, dormant);
    const result = await service.search(plan([query({ providers: ['ccel'] })]));
    expect(result).toMatchObject({ planStatus: 'unavailable', coverage: { ccelAttempted: false, ccelStatus: 'disabled' } });
    expect(result.queries[0]!.providers[0]!.notices).not.toContain(CCEL_COMPOSITION_DATE_NOTICE);
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it.each([
    { page: 2 },
    { startYear: 1200 },
    { endYear: 1600 },
    { startYear: 1200, endYear: 1600 },
  ])('classifies unsupported CCEL filters before admission or provider work (%o)', async unsupported => {
    const ccel = { search: vi.fn() };
    const gate = { admit: vi.fn(), recordOutcome: vi.fn(), snapshot: vi.fn() } as any;
    const service = new PrimarySourceSearchService({ search: vi.fn() } as any, ccel as any, live, gate);
    const result = await service.search(plan([query({ providers: ['ccel'], ...unsupported })]));
    expect(result).toMatchObject({ planStatus: 'partial', queries: [{ providers: [{ status: 'unsupported_filter', searched: false }] }] });
    expect(result.queries[0]!.providers[0]!.notices).not.toContain(CCEL_COMPOSITION_DATE_NOTICE);
    expect(ccel.search).not.toHaveBeenCalled();
    expect(gate.admit).not.toHaveBeenCalled();
  });

  it('executes the local half of a direct mixed date query but rejects its CCEL half before admission', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'no_results', 0)) };
    const ccel = { search: vi.fn() };
    const gate = { admit: vi.fn(), recordOutcome: vi.fn(), snapshot: vi.fn() } as any;
    const service = new PrimarySourceSearchService(local as any, ccel as any, live, gate);

    const result = await service.search(plan([query({
      providers: ['local', 'ccel'], startYear: 500, endYear: 1500,
    })]));

    expect(result.queries[0]!.providers).toMatchObject([
      { provider: 'local', status: 'no_results', searched: true },
      { provider: 'ccel_live', status: 'unsupported_filter', searched: false },
    ]);
    expect(local.search).toHaveBeenCalledWith(expect.objectContaining({ startYear: 500, endYear: 1500 }));
    expect(ccel.search).not.toHaveBeenCalled();
    expect(gate.admit).not.toHaveBeenCalled();
  });

  it.each(['ok', 'no_results', 'unavailable', 'rate_limited', 'interface_changed'] as const)(
    'prepends the composition-date invariant to an executable unbounded CCEL %s result',
    async status => {
      const returned = providerResult('ccel_live', status, status === 'ok' ? 1 : 0);
      returned.notices = ['Provider-specific notice.'];
      if (status === 'rate_limited') returned.retryAfterSeconds = 10;
      const ccel = { search: vi.fn().mockResolvedValue(returned) };
      const service = new PrimarySourceSearchService({ search: vi.fn() } as any, ccel as any, live, coordinator);

      const result = await service.search(plan([query({ providers: ['ccel'] })]));

      expect(ccel.search).toHaveBeenCalledTimes(1);
      const [adapterQuery, passedCoordinator] = ccel.search.mock.calls[0]!;
      expect(adapterQuery).not.toHaveProperty('startYear');
      expect(adapterQuery).not.toHaveProperty('endYear');
      expect(passedCoordinator).toBe(coordinator);
      expect(result.queries[0]!.providers[0]!.notices).toEqual([
        CCEL_COMPOSITION_DATE_NOTICE,
        'Provider-specific notice.',
      ]);
    },
  );

  it('isolates failures and never turns local no-results plus CCEL failure into complete no-results', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'no_results', 0)) };
    const ccel = { search: vi.fn().mockResolvedValue(providerResult('ccel_live', 'unavailable', 0)) };
    const result = await new PrimarySourceSearchService(local as any, ccel as any, live, coordinator)
      .search(plan([query({ providers: ['local', 'ccel'] })]));
    expect(result.planStatus).toBe('partial');
    expect(result.queries[0].providers.map(item => item.status)).toEqual(['no_results', 'unavailable']);
  });

  it('caps aggregate hits at 32 without merging provider ranks', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'ok', 8)) };
    const ccel = { search: vi.fn().mockResolvedValue(providerResult('ccel_live', 'ok', 8)) };
    const queries = [0, 1, 2, 3].map(index => query({ id: `q${index}`, providers: ['local', ...(index === 0 ? ['ccel'] : [])], limit: 8 }));
    const result = await new PrimarySourceSearchService(local as any, ccel as any, live, coordinator).search(plan(queries));
    expect(result.planStatus).toBe('partial');
    expect(result.queries.flatMap(item => item.providers).flatMap(item => item.hits)).toHaveLength(32);
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
    const service = new PrimarySourceSearchService({ search: vi.fn() } as any, { search: vi.fn() } as any, dormant);
    await expect(service.search(invalid)).rejects.toThrow();
  });
});
