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

    it('rejects a null stored title instead of normalizing evidence', async () => {
      const db = createSimpleD1([{ ...sampleSectionRow, title: null }]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      await expect(repo.getSections('test')).rejects.toThrow('title must contain');
    });

    it.each([
      ['non-text content', { content: 42 }],
      ['malformed topics', { topics: '[' }],
      ['non-array topics', { topics: '{}' }],
      ['non-string topic', { topics: '["topic",1]' }],
    ])('rejects corrupt stored section %s', async (_label, corruption) => {
      const db = createSimpleD1([{ ...sampleSectionRow, ...corruption }]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      await expect(repo.getSections('test')).rejects.toThrow(/Stored classic-text section/);
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
    it('uses controlled literal all-term FTS for punctuation and multiple terms', async () => {
      const db = createSimpleD1([]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      await repo.search("Lord's Supper");
      const bindArgs = db.prepare.mock.results[0].value.bind.mock.calls[0];
      expect(bindArgs[0]).toBe('"Lord\'s" AND "Supper"');
    });

    it('unwraps { results } from FTS join query', async () => {
      const db = createSimpleD1([sampleSectionRow]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const result = await repo.search('trinity');
      expect(result).toHaveLength(1);
      expect(result[0].document_id).toBe('nicene-creed');
    });

    it('returns empty array on FTS error', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('does not conceal a non-syntax backend failure as no results', async () => {
      const db = {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockRejectedValue(new Error('D1 database unavailable')),
          }),
        })),
      };
      await expect(new D1HistoricalDocumentRepository(db as any).search('grace'))
        .rejects.toThrow('D1 database unavailable');
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

  describe('searchPrimarySources', () => {
    it('uses the shared controlled FTS query and maps document metadata', async () => {
      const row = {
        ...sampleSectionRow,
        document_title: sampleDocRow.title,
        document_type: sampleDocRow.type,
        document_date: sampleDocRow.date,
        document_metadata: sampleDocRow.metadata,
      };
      const db = createSimpleD1([row]);
      const result = await new D1HistoricalDocumentRepository(db as any).searchPrimarySources({
        text: 'grace OR faith', match: 'all_terms', documentIds: ['nicene-creed'], limit: 8,
      });
      expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith(
        '"grace" AND "OR" AND "faith"', JSON.stringify(['nicene-creed']), 8,
      );
      expect(result[0]).toMatchObject({
        document: { id: 'nicene-creed', title: 'Nicene Creed', topics: ['trinity', 'christology'] },
        section: { section_number: '1', content: 'We believe in one God...' },
      });
    });

    it('uses the same deterministic work-diverse SQL and bindings as SQLite', async () => {
      const db = createSimpleD1([]);
      await new D1HistoricalDocumentRepository(db as any).searchPrimarySources({
        text: 'grace', match: 'all_terms', selection: 'work_diversity', documentIds: ['nicene-creed'], limit: 9,
      });
      const sql = db.prepare.mock.calls[0][0] as string;
      expect(sql).toMatch(/ROW_NUMBER\(\) OVER \([\s\S]*PARTITION BY document_id/);
      expect(sql).toMatch(/ds\.document_id IN \(SELECT value FROM json_each\(\?\) WHERE type = 'text'\)[\s\S]*ORDER BY work_rank, relevance_rank, id/);
      expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith(
        '"grace"', JSON.stringify(['nicene-creed']), 9,
      );
    });

    it('accepts a 100-work scope and rejects 101 works before querying D1', async () => {
      const db = createSimpleD1([]);
      const repo = new D1HistoricalDocumentRepository(db as any);
      const documentIds = Array.from({ length: 100 }, (_, index) => `doc-${index + 1}`);

      await expect(repo.searchPrimarySources({ text: 'grace', match: 'all_terms', documentIds, limit: 8 }))
        .resolves.toEqual([]);
      expect((db.prepare.mock.calls[0][0] as string).match(/\?/g)).toHaveLength(3);
      expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith(
        '"grace"', JSON.stringify(documentIds), 8,
      );

      await expect(repo.searchPrimarySources({
        text: 'grace', match: 'all_terms', selection: 'work_diversity', documentIds, limit: 8,
      })).resolves.toEqual([]);
      expect((db.prepare.mock.calls[1][0] as string).match(/\?/g)).toHaveLength(3);
      expect(db.prepare.mock.results[1].value.bind).toHaveBeenCalledWith(
        '"grace"', JSON.stringify(documentIds), 8,
      );

      const preparesBeforeInvalid = db.prepare.mock.calls.length;
      await expect(repo.searchPrimarySources({
        text: 'grace', match: 'all_terms', documentIds: [...documentIds, 'doc-101'], limit: 8,
      })).rejects.toThrow('Primary-source document scope is invalid');
      await expect(repo.searchPrimarySources({
        text: 'grace', match: 'all_terms', documentIds: ['doc-1', 42] as unknown as string[], limit: 8,
      })).rejects.toThrow('Primary-source document scope is invalid');
      expect(db.prepare).toHaveBeenCalledTimes(preparesBeforeInvalid);
    });
  });
});
