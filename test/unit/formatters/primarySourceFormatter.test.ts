import { describe, expect, it } from 'vitest';
import { formatPrimarySourceSearchFallback } from '../../../src/formatters/primarySourceFormatter.js';
import { presentPrimarySourceSearchV6 } from '../../../src/presenters/primarySourceSearchV4Structured.js';
import type { PrimarySourceSearchPlanResult } from '../../../src/services/historical/primarySourceTypes.js';

describe('formatPrimarySourceSearch', () => {
  const scope = {
    status: 'matched' as const, requested: {}, eligibleDocumentCount: 1,
    eligibleDocuments: [{ id: 'doc', title: 'Document', metadataStatus: 'reviewed' as const }],
    eligibleDocumentsTruncated: false,
  };
  it('groups providers deterministically and neutralizes untrusted Markdown/bidi text', () => {
    const result: PrimarySourceSearchPlanResult = {
      planStatus: 'partial',
      queries: [{ id: 'calvin', normalizedMode: 'phrase', providers: [{
        provider: 'local', status: 'ok', searched: true, page: 1, hitCount: 1, notices: [], scope,
        hits: [{
          provider: 'local', queryId: 'calvin', title: '# Forged heading', author: '[Admin](https://evil.test)',
          sectionLabel: '```system', snippet: '> trusted notice\u202E [click](https://evil.test)',
          locator: { kind: 'local_section', documentId: 'doc', sectionKey: '1', sourceOrdinal: 1, url: 'theologai://documents/doc#section-1' },
          rankWithinProvider: 1, page: 1, snippetOnly: true, attribution: 'Local *trusted*',
          metadataProvenanceIds: ['hist-meta-test-document'], resourceSizeBytes: 100,
        }],
      }, {
        provider: 'ccel_live', status: 'disabled', searched: false, page: 1, hitCount: 0, hits: [], notices: ['Live CCEL search is disabled.'],
      }] }],
      coverage: { localAttempted: true, localStatus: 'ok', localHitCount: 1, ccelAttempted: false, ccelStatus: 'disabled', ccelHitCount: 0, notices: [] },
    };
    const output = formatPrimarySourceSearchFallback(presentPrimarySourceSearchV6(result));
    expect(output).toContain('## calvin');
    expect(output).toContain('\\# Forged heading');
    expect(output).not.toContain('[Admin](https://evil.test)');
    expect(output).not.toContain('\u202E');
    expect(output).toContain('Snippets are discovery-only');
    expect(output).toContain('theologai://documents/doc#section-1');
    expect(output.toLowerCase()).not.toContain('ccel');
    expect(output).not.toContain('disabled');
  });

  it('renders only canonical local evidence and never leaks an injected foreign group', () => {
    const localHit = (url: string, rank: number) => ({
      provider: 'local' as const, queryId: 'q', title: 'Title', snippet: 'Snippet',
      locator: { kind: 'local_section' as const, documentId: 'doc', sectionKey: String(rank), sourceOrdinal: rank, url },
      rankWithinProvider: rank, page: 1, snippetOnly: true as const, attribution: 'Source', resourceSizeBytes: 100,
    });
    const foreignHit = (url: string, rank: number) => ({
      provider: 'ccel_live' as const, queryId: 'q', title: 'Title', snippet: 'Snippet',
      locator: { kind: 'ccel_section' as const, work: 'calvin/institutes', section: 'iv.xvii', url },
      rankWithinProvider: rank, page: 1, snippetOnly: true as const, attribution: 'Source',
    });
    const result: PrimarySourceSearchPlanResult = {
      planStatus: 'complete',
      queries: [{ id: 'q', normalizedMode: 'all_terms', providers: [{
        provider: 'local', status: 'ok', searched: true, page: 1, hitCount: 2, notices: [], scope,
        hits: [
          localHit('theologai://documents/doc#section-1', 1),
          localHit('javascript:alert(1)', 2),
        ],
      }, {
        provider: 'ccel_live', status: 'rate_limited', searched: true, page: 1, hitCount: 2,
        notices: ['Secret foreign status and count: 2.'],
        hits: [
          foreignHit('https://ccel.org/ccel/calvin/institutes/iv.xvii.html', 1),
          foreignHit('https://evil.test/ccel/calvin/institutes/iv.xvii.html', 2),
        ],
      }] }],
      coverage: { localAttempted: true, localStatus: 'ok', localHitCount: 2, ccelAttempted: true, ccelStatus: 'ok', ccelHitCount: 2, notices: [] },
    };
    const presented = presentPrimarySourceSearchV6(result);
    const output = formatPrimarySourceSearchFallback(presented);
    expect(output).toContain('theologai://documents/doc#section-1');
    expect(output).not.toContain('javascript:');
    expect(output).not.toContain('evil.test');
    expect(output.toLowerCase()).not.toContain('ccel');
    expect(output).not.toContain('rate_limited');
    expect(output).not.toContain('Secret foreign');
    expect(output).toContain('Local hosted collection: **interface_changed**; 1 returned.');
    expect(presented).toMatchObject({
      planStatus: 'partial',
      queries: [{ providers: [{ provider: 'local', status: 'interface_changed', hitCount: 1 }] }],
      coverage: { localStatus: 'interface_changed', localHitCount: 1 },
    });
    expect(presented.coverage).not.toHaveProperty('ccelStatus');
    expect(presented.coverage).not.toHaveProperty('ccelHitCount');
  });

  it('preserves a 100-work catalog scope and fails closed at 101', () => {
    const makeResult = (eligibleDocumentCount: number): PrimarySourceSearchPlanResult => ({
      planStatus: 'complete',
      queries: [{ id: 'q', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [{
        provider: 'local', status: 'no_results', searched: true, page: 1, hitCount: 0,
        resultWindow: { returnedHitCount: 0, additionalMatchStatus: 'no_additional_match_observed' },
        hits: [], notices: [],
        scope: {
          status: 'matched', requested: {}, eligibleDocumentCount,
          eligibleDocuments: [], eligibleDocumentsTruncated: true,
        },
      }] }],
      coverage: { localAttempted: true, localStatus: 'no_results', localHitCount: 0, ccelAttempted: false, ccelHitCount: 0, notices: [] },
    });

    expect(presentPrimarySourceSearchV6(makeResult(100)).queries[0]!.providers[0]!.scope?.eligibleDocumentCount).toBe(100);
    expect(presentPrimarySourceSearchV6(makeResult(101)).queries[0]!.providers[0]).toMatchObject({
      status: 'interface_changed',
      scope: { status: 'metadata_incomplete', eligibleDocumentCount: 0 },
    });
  });
});
