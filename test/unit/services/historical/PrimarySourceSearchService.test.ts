import { describe, expect, it, vi } from 'vitest';
import { PrimarySourceSearchService } from '../../../../src/services/historical/PrimarySourceSearchService.js';
import type { PrimarySourceProviderResult } from '../../../../src/services/historical/primarySourceTypes.js';

function providerResult(provider: 'local' | 'ccel_live', status: PrimarySourceProviderResult['status'] = 'ok', count = 1): PrimarySourceProviderResult {
  return {
    provider, status, searched: status !== 'disabled', page: 1,
    hitCount: count,
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

describe('PrimarySourceSearchService', () => {
  it('validates the complete plan atomically before any provider call', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local')) };
    const ccel = { search: vi.fn().mockResolvedValue(providerResult('ccel_live')) };
    const service = new PrimarySourceSearchService(local as any, ccel as any, { ccelLiveSearch: true });
    await expect(service.search(plan([query(), query({ id: 'q1' })]))).rejects.toThrow('Duplicate');
    await expect(service.search(plan([0, 1, 2, 3].map(index => query({ id: `q${index}`, providers: ['ccel'] }))))).rejects.toThrow('At most 3');
    expect(local.search).not.toHaveBeenCalled();
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it('normalizes literals, preserves query/provider order, and makes local-only zero network calls', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local')) };
    const ccel = { search: vi.fn() };
    const service = new PrimarySourceSearchService(local as any, ccel as any, { ccelLiveSearch: false });
    const result = await service.search(plan([query({ text: '  union\n with   Christ  ', providers: ['local'] })]));
    expect(result.planStatus).toBe('complete');
    expect(result.queries[0].providers[0].hits[0].queryId).toBe('q1');
    expect(local.search).toHaveBeenCalledWith(expect.objectContaining({ text: 'union with Christ', match: 'all_terms', page: 1, limit: 5 }));
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it('preserves separate creator scopes and mixed unfiltered/date/work plans', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'catalog_miss', 0)) };
    const service = new PrimarySourceSearchService(local as any, { search: vi.fn() } as any, { ccelLiveSearch: false });
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
    const service = new PrimarySourceSearchService({ search: vi.fn() } as any, ccel as any, { ccelLiveSearch: false });
    const result = await service.search(plan([query({ providers: ['ccel'] })]));
    expect(result).toMatchObject({ planStatus: 'unavailable', coverage: { ccelAttempted: false, ccelStatus: 'disabled' } });
    expect(ccel.search).not.toHaveBeenCalled();
  });

  it('isolates failures and never turns local no-results plus CCEL failure into complete no-results', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'no_results', 0)) };
    const ccel = { search: vi.fn().mockResolvedValue(providerResult('ccel_live', 'unavailable', 0)) };
    const result = await new PrimarySourceSearchService(local as any, ccel as any, { ccelLiveSearch: true })
      .search(plan([query({ providers: ['local', 'ccel'] })]));
    expect(result.planStatus).toBe('partial');
    expect(result.queries[0].providers.map(item => item.status)).toEqual(['no_results', 'unavailable']);
  });

  it('caps aggregate hits at 32 without merging provider ranks', async () => {
    const local = { search: vi.fn().mockResolvedValue(providerResult('local', 'ok', 8)) };
    const ccel = { search: vi.fn().mockResolvedValue(providerResult('ccel_live', 'ok', 8)) };
    const queries = [0, 1, 2, 3].map(index => query({ id: `q${index}`, providers: ['local', ...(index < 3 ? ['ccel'] : [])], limit: 8 }));
    const result = await new PrimarySourceSearchService(local as any, ccel as any, { ccelLiveSearch: true }).search(plan(queries));
    expect(result.queries.flatMap(item => item.providers).flatMap(item => item.hits)).toHaveLength(32);
    expect(result.queries[0].providers[0].hits[0].rankWithinProvider).toBe(1);
  });

  it.each([
    plan([]),
    plan([query({ id: 'bad id' })]),
    plan([query({ text: '\u0000bad' })]),
    plan([query({ providers: ['local', 'local'] })]),
    plan([query({ match: 'all_terms', text: 'one two three four five six seven eight nine ten eleven twelve thirteen' })]),
    plan([query({ startYear: 1600, endYear: 1500 })]),
    plan([query({ startYear: 1500.5 })]),
    { queries: [query()], extra: true },
  ])('rejects invalid bounded plans %#', async invalid => {
    const service = new PrimarySourceSearchService({ search: vi.fn() } as any, { search: vi.fn() } as any, { ccelLiveSearch: false });
    await expect(service.search(invalid)).rejects.toThrow();
  });
});
