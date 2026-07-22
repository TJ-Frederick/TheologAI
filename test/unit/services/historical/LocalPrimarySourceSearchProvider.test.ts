import { describe, expect, it, vi } from 'vitest';
import type { IHistoricalDocumentRepository } from '../../../../src/kernel/repositories.js';
import { LocalPrimarySourceSearchProvider } from '../../../../src/services/historical/LocalPrimarySourceSearchProvider.js';
import { formatLocalDocumentSectionResourceWithIdentity } from '../../../../src/formatters/historicalFormatter.js';

function repository(overrides: Partial<IHistoricalDocumentRepository> = {}): IHistoricalDocumentRepository {
  const catalog = {
    lookupAliases: ['Institutes of the Christian Religion'],
    composition: { startYear: 1536, endYear: 1559, label: '1536-1559' },
    creators: [{ name: 'John Calvin', role: 'author' }],
    metadataStatus: 'reviewed' as const,
    metadataProvenanceIds: ['hist-meta-test-calvin'],
  };
  return {
    listDocuments: vi.fn().mockReturnValue([{ id: 'institutes', title: 'Institutes', type: 'treatise', date: '1559', topics: [], catalog }]),
    getDocument: vi.fn(), getSections: vi.fn(), getSection: vi.fn(), search: vi.fn(), findDocumentByName: vi.fn(),
    searchPrimarySources: vi.fn().mockReturnValue([{
      document: { id: 'institutes', title: 'Institutes', type: 'treatise', date: '1559', topics: [], catalog },
      section: { id: 1, document_id: 'institutes', section_number: '3.1', title: 'Union', content: 'Grace\n\nwith [forged](https://evil.test) # heading', topics: [] },
      sectionKey: 'source-0001', sourceOrdinal: 1,
    }]),
    ...overrides,
  };
}

describe('LocalPrimarySourceSearchProvider', () => {
  it('returns bounded snippet-only factual metadata and an exact locator', async () => {
    const repo = repository();
    const result = await new LocalPrimarySourceSearchProvider(repo).search({ text: 'grace', work: 'INSTITUTES', limit: 3 });
    expect(result).toMatchObject({
      provider: 'local', status: 'ok', searched: true, hitCount: 1,
      resultWindow: { returnedHitCount: 1, additionalMatchStatus: 'no_additional_match_observed' },
    });
    expect(result.hits[0]).toMatchObject({
      title: 'Institutes', sectionLabel: 'Union', snippetOnly: true,
      snippet: 'Grace with [forged](https://evil.test) # heading',
      locator: { kind: 'local_section', documentId: 'institutes', sectionKey: 'source-0001', sourceOrdinal: 1, url: 'theologai://documents/institutes#section-source-0001' },
      documentType: 'treatise', documentDate: '1559', metadataProvenanceIds: ['hist-meta-test-calvin'], resourceSizeBytes: expect.any(Number),
    });
    const row = await repo.searchPrimarySources({ text: 'grace', match: 'all_terms', documentIds: ['institutes'], limit: 3 });
    expect(result.hits[0].resourceSizeBytes).toBe(new TextEncoder().encode(
      formatLocalDocumentSectionResourceWithIdentity(row[0].document, row[0].section, {
        sectionKey: row[0].sectionKey, sourceOrdinal: row[0].sourceOrdinal,
        resolution: 'canonical', canonicalUri: 'theologai://documents/institutes#section-source-0001',
      }),
    ).byteLength);
    expect(repo.searchPrimarySources).toHaveBeenCalledWith({
      text: 'grace', match: 'all_terms', selection: 'relevance', documentIds: ['institutes'], limit: 4,
    });
  });

  it('uses one private lookahead row to report an observed additional match without returning it', async () => {
    const base = repository();
    const first = await base.searchPrimarySources({ text: 'grace', match: 'all_terms', limit: 1 });
    const searchPrimarySources = vi.fn().mockReturnValue([first[0], {
      ...first[0], section: { ...first[0].section, id: 2, section_number: '3.2' },
    }]);
    const result = await new LocalPrimarySourceSearchProvider(repository({ searchPrimarySources })).search({
      text: 'grace', selection: 'work_diversity', limit: 1,
    });

    expect(searchPrimarySources).toHaveBeenCalledWith(expect.objectContaining({ selection: 'work_diversity', limit: 2 }));
    expect(result.hits).toHaveLength(1);
    expect(result.resultWindow).toEqual({ returnedHitCount: 1, additionalMatchStatus: 'additional_match_observed' });
  });

  it('applies exact reviewed creator scope and never ignores unsupported pagination', async () => {
    const repo = repository();
    const provider = new LocalPrimarySourceSearchProvider(repo);
    await expect(provider.search({ text: 'grace', author: 'John Calvin' })).resolves.toMatchObject({
      status: 'ok', searched: true, scope: { status: 'matched', eligibleDocumentCount: 1 },
    });
    await expect(provider.search({ text: 'grace', page: 2 })).resolves.toMatchObject({ status: 'unsupported_filter', searched: false });
    expect(repo.searchPrimarySources).toHaveBeenCalledTimes(1);
  });

  it('uses exact work identity and does not broaden a missing work', async () => {
    const repo = repository({ listDocuments: vi.fn().mockReturnValue([{
      id: 'westminster-confession', title: 'Westminster Confession of Faith', type: 'confession', date: '1647', topics: [],
      catalog: { lookupAliases: ['WCF'], composition: { startYear: 1646, endYear: 1647, label: '1646-1647' }, creators: [{ name: 'Westminster Assembly', role: 'drafting_body' }], metadataStatus: 'collective', metadataProvenanceIds: ['hist-meta-test-westminster'] },
    }]) });
    const provider = new LocalPrimarySourceSearchProvider(repo);
    await expect(provider.search({ text: 'grace', work: 'Institutes of the Christian Religion' })).resolves.toMatchObject({
      status: 'catalog_miss', searched: false, hits: [], scope: { status: 'catalog_miss', eligibleDocumentCount: 0 },
    });
    expect(repo.searchPrimarySources).not.toHaveBeenCalled();
  });

  it('discloses an incomplete medieval date scope and applies inclusive interval overlap', async () => {
    const documents = [{
      id: 'athanasian-creed', title: 'Athanasian Creed', type: 'creed', date: '5th-6th century AD', topics: [],
      catalog: { lookupAliases: ['Quicunque Vult'], composition: { startYear: 400, endYear: 599, label: '5th-6th century AD' }, creators: [], metadataStatus: 'anonymous' as const, metadataProvenanceIds: ['hist-meta-test-athanasian'] },
    }, {
      id: 'apostles-creed', title: "The Apostles' Creed", type: 'creed', date: 'c. 390 AD', topics: [],
      catalog: { lookupAliases: ["Apostles' Creed"], composition: { label: 'c. 390 AD' }, creators: [], metadataStatus: 'anonymous' as const, metadataProvenanceIds: ['hist-meta-test-apostles'] },
    }];
    const searchPrimarySources = vi.fn().mockReturnValue([]);
    const provider = new LocalPrimarySourceSearchProvider(repository({ listDocuments: vi.fn().mockReturnValue(documents), searchPrimarySources }));
    const result = await provider.search({ text: "Lord's Supper", startYear: 500, endYear: 1500 });
    expect(result).toMatchObject({
      status: 'no_results', searched: true,
      scope: {
        status: 'metadata_incomplete', eligibleDocumentCount: 1,
        eligibleDocuments: [{ id: 'athanasian-creed' }], eligibleDocumentsTruncated: false,
      },
    });
    expect(searchPrimarySources).toHaveBeenCalledWith(expect.objectContaining({ documentIds: ['athanasian-creed'] }));
  });

  it('treats the 1689 assembly as title/history context, not a continuous composition interval', async () => {
    const document = {
      id: 'london-baptist-1689', title: 'London Baptist Confession of Faith', type: 'confession', date: '1677', topics: [],
      catalog: {
        lookupAliases: ['1689 London Baptist Confession'], composition: { startYear: 1677, endYear: 1677, label: '1677' },
        creators: [{ name: 'Particular Baptist churches of England', role: 'drafting_body' as const }],
        metadataStatus: 'collective' as const, metadataProvenanceIds: ['hist-meta-founders-london-baptist'],
      },
    };
    const searchPrimarySources = vi.fn().mockReturnValue([]);
    const provider = new LocalPrimarySourceSearchProvider(repository({
      listDocuments: vi.fn().mockReturnValue([document]), searchPrimarySources,
    }));

    await expect(provider.search({ text: 'baptism', startYear: 1677, endYear: 1677 })).resolves.toMatchObject({
      status: 'no_results', searched: true, scope: { status: 'matched', eligibleDocumentCount: 1 },
    });
    for (const year of [1680, 1689]) {
      await expect(provider.search({ text: 'baptism', startYear: year, endYear: year })).resolves.toMatchObject({
        status: 'catalog_miss', searched: false, scope: { status: 'catalog_miss', eligibleDocumentCount: 0 },
      });
    }
    expect(searchPrimarySources).toHaveBeenCalledTimes(1);
  });

  it('matches the present Niceno-Constantinopolitan text at 381 only', async () => {
    const document = {
      id: 'nicene-creed', title: 'The Nicene Creed', type: 'creed', date: '381 AD', topics: [],
      catalog: {
        lookupAliases: ['Nicene Creed', 'Niceno-Constantinopolitan Creed'],
        composition: { startYear: 381, endYear: 381, label: '381 AD (present Niceno-Constantinopolitan text)' },
        creators: [{ name: 'First Council of Constantinople', role: 'revising_body' as const }],
        metadataStatus: 'collective' as const, metadataProvenanceIds: ['hist-meta-vatican-nicene'],
      },
    };
    const searchPrimarySources = vi.fn().mockReturnValue([]);
    const provider = new LocalPrimarySourceSearchProvider(repository({
      listDocuments: vi.fn().mockReturnValue([document]), searchPrimarySources,
    }));

    await expect(provider.search({ text: 'one', startYear: 381, endYear: 381 })).resolves.toMatchObject({
      status: 'no_results', searched: true, scope: { status: 'matched', eligibleDocumentCount: 1 },
    });
    for (const year of [325, 350]) {
      await expect(provider.search({ text: 'one', startYear: year, endYear: year })).resolves.toMatchObject({
        status: 'catalog_miss', searched: false, scope: { status: 'catalog_miss', eligibleDocumentCount: 0 },
      });
    }
    expect(searchPrimarySources).toHaveBeenCalledTimes(1);
  });

  it('uses exact lookup-only aliases and does not route a generic label', async () => {
    const document = {
      id: 'westminster-confession', title: 'Westminster Confession of Faith', type: 'confession', date: '1646', topics: [],
      catalog: {
        lookupAliases: ['Westminster Confession', 'WCF'], composition: { startYear: 1646, endYear: 1646, label: '1646' },
        creators: [{ name: 'Westminster Assembly', role: 'drafting_body' as const }],
        metadataStatus: 'collective' as const, metadataProvenanceIds: ['hist-meta-opc-westminster'],
      },
    };
    const searchPrimarySources = vi.fn().mockReturnValue([]);
    const provider = new LocalPrimarySourceSearchProvider(repository({
      listDocuments: vi.fn().mockReturnValue([document]), searchPrimarySources,
    }));

    await expect(provider.search({ text: 'faith', work: 'wcf' })).resolves.toMatchObject({
      status: 'no_results', searched: true, scope: { status: 'matched', eligibleDocumentCount: 1 },
    });
    await expect(provider.search({ text: 'faith', work: 'Confession of Faith' })).resolves.toMatchObject({
      status: 'catalog_miss', searched: false, scope: { status: 'catalog_miss', eligibleDocumentCount: 0 },
    });
    expect(searchPrimarySources).toHaveBeenCalledTimes(1);
  });

  it.each(['John Calvin', 'Erasmus of Rotterdam', 'Martin Luther'])('returns a non-proxy catalog miss for absent creator %s', async author => {
    const provider = new LocalPrimarySourceSearchProvider(repository({ listDocuments: vi.fn().mockReturnValue([]) }));
    await expect(provider.search({ text: 'eucharist', author })).resolves.toMatchObject({
      status: 'catalog_miss', searched: false, scope: { status: 'catalog_miss', eligibleDocumentCount: 0 },
    });
  });

  it('distinguishes a provider catalog miss from incomplete creator metadata', async () => {
    const unknown = {
      id: 'apostles-creed', title: "The Apostles' Creed", type: 'creed', date: 'c. 390 AD', topics: [],
      catalog: { lookupAliases: ["Apostles' Creed"], composition: { label: 'c. 390 AD' }, creators: [], metadataStatus: 'anonymous' as const, metadataProvenanceIds: ['hist-meta-test-apostles'] },
    };
    const provider = new LocalPrimarySourceSearchProvider(repository({ listDocuments: vi.fn().mockReturnValue([unknown]) }));
    await expect(provider.search({ text: 'eucharist', author: 'Erasmus of Rotterdam' })).resolves.toMatchObject({
      status: 'catalog_miss', searched: false,
      scope: { status: 'metadata_incomplete', eligibleDocumentCount: 0, eligibleDocuments: [] },
    });
  });

  it('returns a bounded Unicode-safe excerpt around a practical phrase match', async () => {
    const content = `${'α'.repeat(700)} 😀Covenant of Grace😀 ${'ω'.repeat(700)}`;
    const repo = repository({
      searchPrimarySources: vi.fn().mockReturnValue([{
        document: { id: 'institutes', title: 'Institutes', type: 'treatise', date: '1559', topics: [], catalog: {
          lookupAliases: ['Institutes of the Christian Religion'], composition: { startYear: 1536, endYear: 1559, label: '1536-1559' },
          creators: [{ name: 'John Calvin', role: 'author' }], metadataStatus: 'reviewed', metadataProvenanceIds: ['hist-meta-test-calvin'],
        } },
        section: { id: 1, document_id: 'institutes', section_number: '3.1', title: 'Union', content, topics: [] },
      }]),
    });
    const result = await new LocalPrimarySourceSearchProvider(repo).search({
      text: 'covenant of grace', match: 'phrase', limit: 1,
    });
    const snippet = result.hits[0].snippet;
    expect(snippet).toContain('😀Covenant of Grace😀');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(Array.from(snippet)).toHaveLength(500);
    expect(snippet).not.toContain('\uFFFD');
  });
});
