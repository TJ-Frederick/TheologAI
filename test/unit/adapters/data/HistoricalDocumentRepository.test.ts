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
    expect(db.prepare).toHaveBeenCalledTimes(6);
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

  it('uses controlled literal FTS and exact work filtering for primary-source discovery', () => {
    const row = {
      ...sectionRow,
      document_title: documentRow.title,
      document_type: documentRow.type,
      document_date: documentRow.date,
      document_metadata: documentRow.metadata,
    };
    const db = new FakeSqliteDatabase([{ match: 'JOIN documents d', all: [row] }]);
    const repo = new HistoricalDocumentRepository(db.asDatabase());
    expect(repo.searchPrimarySources({ text: 'grace OR faith', match: 'all_terms', documentIds: [documentRow.id], limit: 8 })).toEqual([{
      document: { id: documentRow.id, title: documentRow.title, type: documentRow.type, date: documentRow.date, topics: ['Scripture', 'God'] },
      section: { id: 7, document_id: documentRow.id, section_number: '1.1', title: '', content: sectionRow.content, topics: ['revelation'] },
    }]);
    expect(db.statement('AND ds.document_id IN (?)').all).toHaveBeenCalledWith('"grace" AND "OR" AND "faith"', documentRow.id, 8);
    repo.searchPrimarySources({ text: 'union with Christ', match: 'phrase', limit: 3 });
    expect(db.statement(/JOIN documents d[\s\S]*ORDER BY rank/).all).toHaveBeenCalledWith('"union with Christ"', 3);
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
