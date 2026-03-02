import { describe, it, expect, vi } from 'vitest';
import { D1HistoricalDocumentRepository } from '../../../../src/adapters/d1/D1HistoricalDocumentRepository.js';
import { createMockD1, createSimpleD1 } from '../../../helpers/mockD1.js';

const sampleDocRow = {
  id: 'nicene-creed',
  title: 'Nicene Creed',
  type: 'creed',
  date: '325',
  metadata: '{"topics":["trinity","christology"]}',
};

const sampleSectionRow = {
  id: 1,
  document_id: 'nicene-creed',
  section_number: '1',
  title: 'Article I',
  content: 'We believe in one God...',
  topics: '["trinity","god"]',
};

describe('D1HistoricalDocumentRepository', () => {
  describe('listDocuments', () => {
    it('unwraps { results } and parses JSON metadata.topics', async () => {
      const db = createSimpleD1([sampleDocRow]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.listDocuments();
      expect(result).toEqual([{
        id: 'nicene-creed',
        title: 'Nicene Creed',
        type: 'creed',
        date: '325',
        topics: ['trinity', 'christology'],
      }]);
    });

    it('handles null metadata gracefully', async () => {
      const db = createSimpleD1([{ ...sampleDocRow, metadata: null }]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.listDocuments();
      expect(result[0].topics).toEqual([]);
    });

    it('handles metadata without topics key', async () => {
      const db = createSimpleD1([{ ...sampleDocRow, metadata: '{}' }]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.listDocuments();
      expect(result[0].topics).toEqual([]);
    });
  });

  describe('getDocument', () => {
    it('returns DocumentInfo via .first() when found', async () => {
      const db = createSimpleD1([], sampleDocRow);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.getDocument('nicene-creed');
      expect(result).toEqual({
        id: 'nicene-creed',
        title: 'Nicene Creed',
        type: 'creed',
        date: '325',
        topics: ['trinity', 'christology'],
      });
    });

    it('returns undefined when .first() returns null', async () => {
      const db = createSimpleD1([], null);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.getDocument('nonexistent');
      expect(result).toBeUndefined();
    });

    it('parses JSON metadata.topics correctly', async () => {
      const db = createSimpleD1([], {
        ...sampleDocRow,
        metadata: '{"topics":["salvation","grace","faith"]}',
      });
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.getDocument('test');
      expect(result!.topics).toEqual(['salvation', 'grace', 'faith']);
    });
  });

  describe('getSections', () => {
    it('unwraps { results } and maps rows to DocumentSection[]', async () => {
      const db = createSimpleD1([sampleSectionRow]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.getSections('nicene-creed');
      expect(result).toEqual([{
        id: 1,
        document_id: 'nicene-creed',
        section_number: '1',
        title: 'Article I',
        content: 'We believe in one God...',
        topics: ['trinity', 'god'],
      }]);
    });

    it('parses JSON topics column', async () => {
      const db = createSimpleD1([{ ...sampleSectionRow, topics: '["grace","salvation"]' }]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.getSections('test');
      expect(result[0].topics).toEqual(['grace', 'salvation']);
    });

    it('handles null topics column', async () => {
      const db = createSimpleD1([{ ...sampleSectionRow, topics: null }]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.getSections('test');
      expect(result[0].topics).toEqual([]);
    });

    it('handles empty/null title', async () => {
      const db = createSimpleD1([{ ...sampleSectionRow, title: null }]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.getSections('test');
      expect(result[0].title).toBe('');
    });
  });

  describe('getSection', () => {
    it('returns single DocumentSection via .first()', async () => {
      const db = createSimpleD1([], sampleSectionRow);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.getSection('nicene-creed', '1');
      expect(result).toEqual({
        id: 1,
        document_id: 'nicene-creed',
        section_number: '1',
        title: 'Article I',
        content: 'We believe in one God...',
        topics: ['trinity', 'god'],
      });
    });

    it('returns undefined when .first() returns null', async () => {
      const db = createSimpleD1([], null);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.getSection('test', '999');
      expect(result).toBeUndefined();
    });
  });

  describe('search', () => {
    it('escapes quotes and asterisks from query', async () => {
      const db = createSimpleD1([]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      await repo.search("test'*\"");
      const bindArgs = db.prepare.mock.results[0].value.bind.mock.calls[0];
      expect(bindArgs[0]).toBe('"test"*');
    });

    it('unwraps { results } from FTS join query', async () => {
      const db = createSimpleD1([sampleSectionRow]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.search('trinity');
      expect(result).toHaveLength(1);
      expect(result[0].document_id).toBe('nicene-creed');
    });

    it('returns empty array on FTS error', async () => {
      const db = {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockRejectedValue(new Error('FTS5 syntax error')),
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn().mockResolvedValue({}),
          }),
        })),
      };
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.search('invalid query!!!');
      expect(result).toEqual([]);
    });

    it('passes limit to .bind()', async () => {
      const db = createSimpleD1([]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      await repo.search('grace', 10);
      const bindArgs = db.prepare.mock.results[0].value.bind.mock.calls[0];
      expect(bindArgs[1]).toBe(10);
    });
  });

  describe('findDocumentByName', () => {
    const docs = [
      { ...sampleDocRow, id: 'nicene-creed', title: 'Nicene Creed' },
      { ...sampleDocRow, id: 'westminster-confession', title: 'Westminster Confession of Faith' },
      { ...sampleDocRow, id: 'heidelberg-catechism', title: 'Heidelberg Catechism' },
    ];

    it('resolves by exact id match first', async () => {
      const db = createSimpleD1(docs);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.findDocumentByName('nicene-creed');
      expect(result!.id).toBe('nicene-creed');
    });

    it('resolves by title includes when no exact id match', async () => {
      const db = createSimpleD1(docs);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.findDocumentByName('Westminster');
      expect(result!.id).toBe('westminster-confession');
    });

    it('resolves by id includes as last resort', async () => {
      const db = createSimpleD1(docs);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.findDocumentByName('heidelberg');
      expect(result!.id).toBe('heidelberg-catechism');
    });

    it('returns undefined when no match found', async () => {
      const db = createSimpleD1(docs);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.findDocumentByName('nonexistent-document');
      expect(result).toBeUndefined();
    });
  });
});
