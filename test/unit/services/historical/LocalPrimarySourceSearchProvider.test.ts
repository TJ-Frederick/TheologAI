import { describe, expect, it, vi } from 'vitest';
import type { IHistoricalDocumentRepository } from '../../../../src/kernel/repositories.js';
import { LocalPrimarySourceSearchProvider } from '../../../../src/services/historical/LocalPrimarySourceSearchProvider.js';

function repository(overrides: Partial<IHistoricalDocumentRepository> = {}): IHistoricalDocumentRepository {
  return {
    listDocuments: vi.fn().mockReturnValue([{ id: 'institutes', title: 'Institutes', type: 'treatise', date: '1559', topics: [] }]),
    getDocument: vi.fn(), getSections: vi.fn(), getSection: vi.fn(), search: vi.fn(), findDocumentByName: vi.fn(),
    searchPrimarySources: vi.fn().mockReturnValue([{
      document: { id: 'institutes', title: 'Institutes', type: 'treatise', date: '1559', topics: [] },
      section: { id: 1, document_id: 'institutes', section_number: '3.1', title: 'Union', content: 'Grace\n\nwith [forged](https://evil.test) # heading', topics: [] },
    }]),
    ...overrides,
  };
}

describe('LocalPrimarySourceSearchProvider', () => {
  it('returns bounded snippet-only factual metadata and an exact locator', async () => {
    const repo = repository();
    const result = await new LocalPrimarySourceSearchProvider(repo).search({ text: 'grace', work: 'INSTITUTES', limit: 3 });
    expect(result).toMatchObject({ provider: 'local', status: 'ok', searched: true, hitCount: 1 });
    expect(result.hits[0]).toMatchObject({
      title: 'Institutes', sectionLabel: 'Union', snippetOnly: true,
      snippet: 'Grace with [forged](https://evil.test) # heading',
      locator: { kind: 'local_section', documentId: 'institutes', sectionId: '3.1', url: 'theologai://documents/institutes#section-3.1' },
    });
    expect(repo.searchPrimarySources).toHaveBeenCalledWith({ text: 'grace', match: 'all_terms', documentId: 'institutes', limit: 3 });
  });

  it('never silently ignores unsupported author or page filters', async () => {
    const repo = repository();
    const provider = new LocalPrimarySourceSearchProvider(repo);
    await expect(provider.search({ text: 'grace', author: 'Calvin' })).resolves.toMatchObject({ status: 'unsupported_filter', searched: false });
    await expect(provider.search({ text: 'grace', page: 2 })).resolves.toMatchObject({ status: 'unsupported_filter', searched: false });
    expect(repo.searchPrimarySources).not.toHaveBeenCalled();
  });

  it('uses exact work identity and does not broaden a missing work', async () => {
    const repo = repository();
    const provider = new LocalPrimarySourceSearchProvider(repo);
    await expect(provider.search({ text: 'grace', work: 'Institute' })).resolves.toMatchObject({ status: 'no_results', searched: true, hits: [] });
    expect(repo.searchPrimarySources).not.toHaveBeenCalled();
  });

  it('returns a bounded Unicode-safe excerpt around a practical phrase match', async () => {
    const content = `${'α'.repeat(700)} 😀Covenant of Grace😀 ${'ω'.repeat(700)}`;
    const repo = repository({
      searchPrimarySources: vi.fn().mockReturnValue([{
        document: { id: 'institutes', title: 'Institutes', type: 'treatise', date: '1559', topics: [] },
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
