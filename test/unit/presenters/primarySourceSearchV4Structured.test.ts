import { describe, expect, it } from 'vitest';
import { presentPrimarySourceSearchV4 } from '../../../src/presenters/primarySourceSearchV4Structured.js';
import type { PrimarySourceSearchPlanResult } from '../../../src/services/historical/primarySourceTypes.js';
import { CCEL_COMPOSITION_DATE_NOTICE } from '../../../src/services/historical/primarySourceTypes.js';

function localHit(queryId: string, rank: number, marker = '') {
  const sectionId = `${queryId}-${rank}`;
  return {
    queryId,
    provider: 'local' as const,
    title: `${marker}${'T'.repeat(290)}`,
    author: 'A'.repeat(200),
    sectionLabel: 'S'.repeat(300),
    snippet: 'N'.repeat(500),
    rankWithinProvider: rank,
    page: 1,
    snippetOnly: true as const,
    attribution: 'R'.repeat(300),
    documentType: 'D'.repeat(100),
    documentDate: 'Y'.repeat(100),
    creators: Array.from({ length: 8 }, (_, index) => ({ name: `${index}${'C'.repeat(158)}`, role: 'author' as const })),
    metadataStatus: 'reviewed' as const,
    metadataProvenanceIds: ['hist-meta-one', 'hist-meta-two', 'hist-meta-three', 'hist-meta-four'],
    locator: { kind: 'local_section' as const, documentId: 'doc', sectionId, url: `theologai://documents/doc#section-${sectionId}` },
    resourceSizeBytes: 100,
  };
}

function externalProvider(queryId: string, count: number) {
  return {
    provider: 'ccel_live' as const,
    status: 'ok' as const,
    searched: true,
    page: 1,
    hitCount: count,
    resultWindow: { returnedHitCount: count, additionalMatchStatus: 'no_additional_match_observed' as const },
    hits: Array.from({ length: count }, (_, index) => ({
      queryId,
      provider: 'ccel_live' as const,
      title: `External ${index + 1}`,
      snippet: 'Discovery only',
      rankWithinProvider: index + 1,
      page: 1,
      snippetOnly: true as const,
      attribution: 'CCEL',
      locator: {
        kind: 'ccel_section' as const,
        work: 'calvin/institutes',
        section: `section${index + 1}`,
        url: `https://ccel.org/ccel/calvin/institutes/section${index + 1}.html`,
      },
    })),
    notices: [],
  };
}

function largePlan(): PrimarySourceSearchPlanResult {
  return {
    planStatus: 'complete',
    queries: Array.from({ length: 4 }, (_, queryIndex) => {
      const id = `q${queryIndex + 1}`;
      return {
        id,
        normalizedMode: 'all_terms' as const,
        normalizedSelection: 'relevance' as const,
        providers: [{
          provider: 'local' as const,
          status: 'ok' as const,
          searched: true,
          page: 1,
          hitCount: 8,
          resultWindow: { returnedHitCount: 8, additionalMatchStatus: 'no_additional_match_observed' as const },
          hits: Array.from({ length: 8 }, (_, index) => localHit(id, index + 1, queryIndex === 3 && index === 7 ? 'FINAL_MARKER' : '')),
          notices: Array.from({ length: 8 }, (_, index) => `${index}${'Z'.repeat(300)}`),
          scope: {
            status: 'matched' as const,
            requested: {},
            eligibleDocumentCount: 17,
            eligibleDocuments: Array.from({ length: 17 }, (_, index) => ({ id: `doc-${index}`, title: 'E'.repeat(300), metadataStatus: 'reviewed' as const })),
            eligibleDocumentsTruncated: false,
          },
        }],
      };
    }),
    coverage: { localAttempted: true, localStatus: 'ok', localHitCount: 32, ccelAttempted: false, ccelHitCount: 0, notices: [] },
  };
}

describe('primary-source v4 structured presentation', () => {
  it('defensively prepends the date invariant to every executable external provider result', () => {
    const plan = largePlan();
    const external = externalProvider('external', 1);
    external.notices = ['Provider-specific notice.'];
    plan.queries = [{ id: 'external', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [external] }];
    plan.coverage = { localAttempted: false, localHitCount: 0, ccelAttempted: true, ccelStatus: 'ok', ccelHitCount: 1, notices: [] };

    const presented = presentPrimarySourceSearchV4(plan);

    expect(presented.queries[0]!.providers[0]!.notices).toEqual([
      CCEL_COMPOSITION_DATE_NOTICE,
      'Provider-specific notice.',
    ]);
    expect(presented.coverage.notices[0]).toBe(CCEL_COMPOSITION_DATE_NOTICE);
  });

  it('does not attach the unbounded-search warning to a rejected date-filtered CCEL query', () => {
    const plan = largePlan();
    const external = externalProvider('external', 0);
    external.status = 'unsupported_filter';
    external.searched = false;
    external.notices = ['Live CCEL discovery does not expose reviewed composition-date bounds.'];
    plan.queries = [{ id: 'external', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [external] }];

    const provider = presentPrimarySourceSearchV4(plan).queries[0]!.providers[0]!;
    expect(provider.notices).not.toContain(CCEL_COMPOSITION_DATE_NOTICE);
  });

  it('does not imply an unbounded search occurred when the external provider is disabled', () => {
    const plan = largePlan();
    const external = externalProvider('external', 0);
    external.status = 'disabled' as never;
    external.searched = false;
    external.notices = ['Live CCEL search is disabled. No remote request was made.'];
    plan.queries = [{ id: 'external', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [external] }];

    const provider = presentPrimarySourceSearchV4(plan).queries[0]!.providers[0]!;
    expect(provider.notices).not.toContain(CCEL_COMPOSITION_DATE_NOTICE);
  });

  it('preserves a 100-work local scope and rejects 101 as interface drift', () => {
    const plan = largePlan();
    plan.queries = [plan.queries[0]!];
    const provider = plan.queries[0]!.providers[0]!;
    provider.status = 'no_results';
    provider.hitCount = 0;
    provider.hits = [];
    provider.resultWindow = { returnedHitCount: 0, additionalMatchStatus: 'no_additional_match_observed' };
    provider.scope!.eligibleDocumentCount = 100;
    provider.scope!.eligibleDocuments = [];
    provider.scope!.eligibleDocumentsTruncated = true;

    expect(presentPrimarySourceSearchV4(plan).queries[0]!.providers[0]!.scope?.eligibleDocumentCount).toBe(100);
    provider.scope!.eligibleDocumentCount = 101;
    const rejected = presentPrimarySourceSearchV4(plan).queries[0]!.providers[0]!;
    expect(rejected.status).toBe('interface_changed');
    expect(rejected).not.toHaveProperty('scope');
  });

  it('publishes bounded retry guidance only for a rate-limited external provider', () => {
    const plan = largePlan();
    const external = externalProvider('external', 0) as ReturnType<typeof externalProvider> & { retryAfterSeconds?: number };
    external.status = 'rate_limited' as never;
    external.searched = false;
    external.retryAfterSeconds = 11;
    plan.queries = [{ id: 'external', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [external] }];
    const provider = presentPrimarySourceSearchV4(plan).queries[0]!.providers[0]!;
    expect(provider).toMatchObject({ status: 'rate_limited', retryAfterSeconds: 11 });

    external.retryAfterSeconds = 0;
    const invalid = presentPrimarySourceSearchV4(plan).queries[0]!.providers[0]!;
    expect(invalid.status).toBe('interface_changed');
    expect(invalid).not.toHaveProperty('retryAfterSeconds');
  });

  it('stops at the first non-fitting hit and recomputes every public count within 32 KiB', () => {
    const presented = presentPrimarySourceSearchV4(largePlan());
    const json = JSON.stringify(presented);
    expect(new TextEncoder().encode(json).byteLength).toBeLessThanOrEqual(32768);
    expect(presented).toMatchObject({ planStatus: 'partial', responseWindow: { unit: 'utf8_bytes', maximum: 32768, truncated: true } });
    expect(json).not.toContain('FINAL_MARKER');
    const providers = presented.queries.flatMap(query => query.providers);
    for (const provider of providers) {
      expect(provider.hitCount).toBe(provider.hits.length);
      expect(provider.resultWindow.returnedHitCount).toBe(provider.hits.length);
    }
    expect(presented.coverage.localHitCount).toBe(providers.reduce((sum, provider) => sum + provider.hits.length, 0));
    expect(providers.some(provider => provider.resultWindow.additionalMatchStatus === 'additional_match_observed')).toBe(true);
    expect(providers.every(provider => provider.notices.length <= 4 && provider.notices.every(notice => Array.from(notice).length <= 240))).toBe(true);
    expect(presented.coverage.notices.length).toBeLessThanOrEqual(8);
    expect(providers[0]?.scope?.eligibleDocuments).toHaveLength(5);
    expect(providers[0]?.scope?.eligibleDocumentsTruncated).toBe(true);
  });

  it('budgets against the larger complete, non-truncated envelope at the exact byte boundary', () => {
    const boundaryPlan = (twoByteCharacters: number) => {
      const plan = largePlan();
      plan.queries = [plan.queries[0]!];
      const provider = plan.queries[0]!.providers[0]!;
      provider.hits = provider.hits.slice(0, 8);
      provider.hits[7]!.snippet = `${'é'.repeat(twoByteCharacters)}${'N'.repeat(240 - twoByteCharacters)}`;
      provider.hitCount = 8;
      provider.resultWindow.returnedHitCount = 8;
      plan.coverage.localHitCount = 8;
      return plan;
    };

    const exact = presentPrimarySourceSearchV4(boundaryPlan(118));
    expect(exact.responseWindow.truncated).toBe(false);
    expect(exact.planStatus).toBe('complete');
    expect(exact.queries[0]!.providers[0]!.hits).toHaveLength(8);
    expect(new TextEncoder().encode(JSON.stringify(exact)).byteLength).toBe(32768);

    // One additional UTF-8 byte makes the non-truncated all-eight-hit envelope
    // exactly 32,769 bytes. The truncated/partial tentative form is two bytes
    // smaller, so probing against that form would admit the hit and then throw.
    const overflow = presentPrimarySourceSearchV4(boundaryPlan(119));
    expect(overflow.responseWindow.truncated).toBe(true);
    expect(overflow.planStatus).toBe('partial');
    expect(overflow.queries[0]!.providers[0]!.hits).toHaveLength(7);
    expect(new TextEncoder().encode(JSON.stringify(overflow)).byteLength).toBeLessThanOrEqual(32768);
  });

  it('uses stable query/provider order and rank order without leaking external routing fields', () => {
    const plan = largePlan();
    plan.queries = [plan.queries[1]!, plan.queries[0]!];
    plan.queries[0]!.providers[0]!.hits = [localHit('q2', 2), localHit('q2', 1)];
    plan.queries[0]!.providers[0]!.hitCount = 2;
    plan.queries[0]!.providers[0]!.resultWindow.returnedHitCount = 2;
    const presented = presentPrimarySourceSearchV4(plan);
    expect(presented.queries.map(query => query.id)).toEqual(['q2', 'q1']);
    expect(presented.queries[0]!.providers[0]!.hits.map(hit => hit.rankWithinProvider)).toEqual([1, 2]);
    expect(JSON.stringify(presented)).not.toContain('ccel_section');
  });

  it('omits control-only optional metadata and marks the sanitized result partial', () => {
    const plan = largePlan();
    const query = plan.queries[0]!;
    const provider = query.providers[0]!;
    const hit = localHit(query.id, 1);
    hit.author = '\u0001';
    hit.sectionLabel = '\u0002';
    hit.documentType = '\u0003';
    hit.documentDate = '\u0004';
    provider.hits = [hit];
    provider.hitCount = 1;
    provider.resultWindow.returnedHitCount = 1;
    plan.queries = [query];
    plan.coverage.localHitCount = 1;

    const presented = presentPrimarySourceSearchV4(plan);
    const sanitized = presented.queries[0]!.providers[0]!.hits[0]!;
    expect(sanitized).not.toHaveProperty('author');
    expect(sanitized).not.toHaveProperty('sectionLabel');
    expect(sanitized).not.toHaveProperty('documentType');
    expect(sanitized).not.toHaveProperty('documentDate');
    expect(presented.queries[0]!.providers[0]!.status).toBe('interface_changed');
    expect(presented.queries[0]!.providers[0]!.notices).toEqual(expect.arrayContaining([
      'One or more empty optional metadata fields were omitted after sanitization.',
    ]));
    expect(presented).toMatchObject({ planStatus: 'partial', responseWindow: { truncated: true } });
  });

  it('defensively keeps only one global CCEL group and at most five external hits', () => {
    const plan = largePlan();
    plan.queries = [
      { id: 'external-1', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [externalProvider('external-1', 8)] },
      { id: 'external-2', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [externalProvider('external-2', 5)] },
    ];
    plan.coverage = { localAttempted: false, localHitCount: 0, ccelAttempted: true, ccelStatus: 'ok', ccelHitCount: 13, notices: [] };

    const presented = presentPrimarySourceSearchV4(plan);
    const externalProviders = presented.queries.flatMap(query => query.providers)
      .filter(provider => provider.provider === 'ccel_live');
    expect(externalProviders).toHaveLength(1);
    expect(externalProviders[0]!.hits).toHaveLength(5);
    expect(presented.queries.map(query => query.id)).toEqual(['external-1']);
    expect(presented.coverage.ccelHitCount).toBe(5);
    expect(presented).toMatchObject({ planStatus: 'partial', responseWindow: { truncated: true } });
  });
});
