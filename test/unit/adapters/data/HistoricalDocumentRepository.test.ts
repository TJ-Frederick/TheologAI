import { describe, expect, it } from 'vitest';
import { HistoricalDocumentRepository } from '../../../../src/adapters/data/HistoricalDocumentRepository.js';
import { FakeSqliteDatabase } from './fakeSqlite.js';

const documentRow = {
  id: 'westminster-confession',
  title: 'Westminster Confession of Faith',
  type: 'confession',
  date: '1646',
  metadata: JSON.stringify({ topics: ['Scripture', 'God'] }),
};

const sectionRow = {
  id: 7,
  document_id: documentRow.id,
  section_number: '1.1',
  title: '',
  content: 'The light of nature...',
  topics: JSON.stringify(['revelation']),
};

describe('HistoricalDocumentRepository', () => {
  it('prepares all reusable document and FTS queries', () => {
    const db = new FakeSqliteDatabase();
    new HistoricalDocumentRepository(db.asDatabase());
    expect(db.prepare).toHaveBeenCalledTimes(12);
    expect(db.statement('sections_fts MATCH').sql).toMatch(/ORDER BY rank, ds\.id\s+LIMIT \?/);
  });

  it('lists and gets documents while applying metadata defaults', () => {
    const withoutMetadata = { ...documentRow, id: 'apostles-creed', metadata: '', date: null };
    const db = new FakeSqliteDatabase([
      { match: 'ORDER BY title', all: [documentRow, withoutMetadata] },
      { match: 'documents WHERE id', get: (id: unknown) => id === documentRow.id ? documentRow : undefined },
    ]);
    const repo = new HistoricalDocumentRepository(db.asDatabase());

    expect(repo.listDocuments()).toEqual([
      { id: documentRow.id, title: documentRow.title, type: documentRow.type, date: '1646', topics: ['Scripture', 'God'] },
      { id: 'apostles-creed', title: documentRow.title, type: documentRow.type, date: null, topics: [] },
    ]);
    expect(repo.getDocument(documentRow.id)?.topics).toEqual(['Scripture', 'God']);
    expect(repo.getDocument('missing')).toBeUndefined();
  });

  it('maps section rows, including empty title and topic defaults', () => {
    const plainSection = { ...sectionRow, id: 8, title: 'Chapter', topics: '' };
    const db = new FakeSqliteDatabase([
      { match: 'document_sections WHERE document_id = ? ORDER', all: [sectionRow, plainSection] },
      { match: 'section_number = ?', get: (doc: unknown, section: unknown) => doc === documentRow.id && section === '1.1' ? sectionRow : undefined },
    ]);
    const repo = new HistoricalDocumentRepository(db.asDatabase());

    expect(repo.getSections(documentRow.id)).toEqual([
      { id: 7, document_id: documentRow.id, section_number: '1.1', title: '', content: sectionRow.content, topics: ['revelation'] },
      { id: 8, document_id: documentRow.id, section_number: '1.1', title: 'Chapter', content: sectionRow.content, topics: [] },
    ]);
    expect(repo.getSection(documentRow.id, '1.1')?.title).toBe('');
    expect(repo.getSection(documentRow.id, '9.9')).toBeUndefined();
  });

  it.each([
    ['non-text content', { content: 42 }],
    ['malformed topics', { topics: '[' }],
    ['non-array topics', { topics: '{}' }],
    ['non-string topic', { topics: '["topic",1]' }],
  ])('rejects corrupt stored section %s', (_label, corruption) => {
    const db = new FakeSqliteDatabase([{
      match: 'document_sections WHERE document_id = ? ORDER',
      all: [{ ...sectionRow, ...corruption }],
    }]);
    expect(() => new HistoricalDocumentRepository(db.asDatabase()).getSections(documentRow.id))
      .toThrow(/Stored classic-text section/);
  });

  it('uses controlled literal all-term FTS, the default limit, and maps search rows', () => {
    const db = new FakeSqliteDatabase([{
      match: 'sections_fts MATCH',
      all: [{
        id: 11,
        document_id: documentRow.id,
        section_number: '2.1',
        title: '',
        content: 'grace alone',
        topics: '',
      }],
    }]);
    const repo = new HistoricalDocumentRepository(db.asDatabase());

    expect(repo.search(`Lord's Supper`)).toEqual([{
      id: 11,
      document_id: documentRow.id,
      section_number: '2.1',
      title: '',
      content: 'grace alone',
      topics: [],
    }]);
    expect(db.statement('sections_fts MATCH').all).toHaveBeenCalledWith('"Lord\'s" AND "Supper"', 20);
  });

  it('returns an empty result when FTS execution fails', () => {
    const db = new FakeSqliteDatabase([{ match: 'sections_fts MATCH', all: new Error('bad FTS syntax') }]);
    expect(new HistoricalDocumentRepository(db.asDatabase()).search('(', 4)).toEqual([]);
  });

  it('does not conceal a non-syntax backend failure as no results', () => {
    const db = new FakeSqliteDatabase([{ match: 'sections_fts MATCH', all: new Error('database unavailable') }]);
    expect(() => new HistoricalDocumentRepository(db.asDatabase()).search('grace', 4))
      .toThrow('database unavailable');
  });

  it('uses controlled literal FTS and exact work filtering for primary-source discovery', () => {
    const row = {
      ...sectionRow,
      document_title: documentRow.title,
      document_type: documentRow.type,
      document_date: documentRow.date,
      document_metadata: documentRow.metadata,
      section_key: 'source-0001',
      source_ordinal: 1,
    };
    const db = new FakeSqliteDatabase([{ match: 'JOIN documents d', all: [row] }]);
    const repo = new HistoricalDocumentRepository(db.asDatabase());
    expect(repo.searchPrimarySources({ text: 'grace OR faith', match: 'all_terms', documentIds: [documentRow.id], limit: 8 })).toEqual([{
      document: { id: documentRow.id, title: documentRow.title, type: documentRow.type, date: documentRow.date, topics: ['Scripture', 'God'] },
      section: { id: 7, document_id: documentRow.id, section_number: '1.1', title: '', content: sectionRow.content, topics: ['revelation'] },
      sectionKey: 'source-0001', sourceOrdinal: 1,
    }]);
    expect(db.statement('json_each(?)').all).toHaveBeenCalledWith(
      '"grace" AND "OR" AND "faith"', JSON.stringify([documentRow.id]), 8,
    );
    repo.searchPrimarySources({ text: 'union with Christ', match: 'phrase', limit: 3 });
    expect(db.prepare.mock.results.some(result => result.value.all.mock.calls.some((args: unknown[]) => (
      JSON.stringify(args) === JSON.stringify(['"union with Christ"', 3])
    )))).toBe(true);
  });

  it('uses deterministic round-robin SQL for work-diverse selection', () => {
    const db = new FakeSqliteDatabase([{ match: 'ranked_sections', all: [] }]);
    const repo = new HistoricalDocumentRepository(db.asDatabase());

    repo.searchPrimarySources({ text: 'grace', match: 'all_terms', selection: 'work_diversity', limit: 9 });

    const statement = db.statement('ranked_sections');
    expect(statement.sql).toMatch(/ROW_NUMBER\(\) OVER \([\s\S]*PARTITION BY document_id[\s\S]*ORDER BY relevance_rank, id/);
    expect(statement.sql).toMatch(/ORDER BY work_rank, relevance_rank, id/);
    expect(statement.all).toHaveBeenCalledWith('"grace"', 9);
  });

  it('accepts a 100-work primary-source scope and rejects 101 works', () => {
    const db = new FakeSqliteDatabase([{ match: 'JOIN documents d', all: [] }]);
    const repo = new HistoricalDocumentRepository(db.asDatabase());
    const documentIds = Array.from({ length: 100 }, (_, index) => `doc-${index + 1}`);

    expect(repo.searchPrimarySources({ text: 'grace', match: 'all_terms', documentIds, limit: 8 })).toEqual([]);
    const relevance = db.statement('json_each(?)');
    expect(relevance.sql.match(/\?/g)).toHaveLength(3);
    expect(relevance.all).toHaveBeenCalledWith('"grace"', JSON.stringify(documentIds), 8);

    repo.searchPrimarySources({
      text: 'grace', match: 'all_terms', selection: 'work_diversity', documentIds, limit: 8,
    });
    const diverse = db.statement('ranked_sections');
    expect(diverse.sql.match(/\?/g)).toHaveLength(3);
    expect(diverse.all).toHaveBeenCalledWith('"grace"', JSON.stringify(documentIds), 8);

    const preparesBeforeInvalid = db.prepare.mock.calls.length;
    expect(() => repo.searchPrimarySources({
      text: 'grace', match: 'all_terms', documentIds: [...documentIds, 'doc-101'], limit: 8,
    })).toThrow('Primary-source document scope is invalid');
    expect(() => repo.searchPrimarySources({
      text: 'grace', match: 'all_terms', documentIds: ['doc-1', 42] as unknown as string[], limit: 8,
    })).toThrow('Primary-source document scope is invalid');
    expect(db.prepare).toHaveBeenCalledTimes(preparesBeforeInvalid);
  });

  it('finds documents by exact id, title fragment, then id fragment', () => {
    const docs = [
      documentRow,
      { ...documentRow, id: 'heidelberg-catechism', title: 'Heidelberg Catechism' },
    ];
    const db = new FakeSqliteDatabase([{ match: 'ORDER BY title', all: docs }]);
    const repo = new HistoricalDocumentRepository(db.asDatabase());

    expect(repo.findDocumentByName(' WESTMINSTER-CONFESSION ')?.id).toBe(documentRow.id);
    expect(repo.findDocumentByName('catechism')?.id).toBe('heidelberg-catechism');
    expect(repo.findDocumentByName('heidelberg-')?.id).toBe('heidelberg-catechism');
    expect(repo.findDocumentByName('missing')).toBeUndefined();
  });

  it('propagates invalid stored JSON instead of concealing corrupt data', () => {
    const db = new FakeSqliteDatabase([{ match: 'ORDER BY title', all: [{ ...documentRow, metadata: '{' }] }]);
    expect(() => new HistoricalDocumentRepository(db.asDatabase()).listDocuments()).toThrow(SyntaxError);
  });
});
