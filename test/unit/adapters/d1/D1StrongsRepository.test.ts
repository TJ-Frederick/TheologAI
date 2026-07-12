import { describe, it, expect, vi } from 'vitest';
import { D1StrongsRepository } from '../../../../src/adapters/d1/D1StrongsRepository.js';
import { createMockD1, createSimpleD1 } from '../../../helpers/mockD1.js';

const sampleEntry = {
  strongs_number: 'G0025',
  testament: 'NT',
  lemma: 'ἀγαπάω',
  transliteration: 'agapaō',
  pronunciation: "ag-ap-ah'-o",
  definition: 'to love',
  derivation: null,
};

describe('D1StrongsRepository', () => {
  describe('lookup', () => {
    it('returns entry on exact match via .first()', async () => {
      const db = createSimpleD1([], sampleEntry);
      const repo = new D1StrongsRepository(db as any);
      const result = await repo.lookup('G0025');
      expect(result).toEqual(sampleEntry);
    });

    it('normalizes input to uppercase', async () => {
      const db = createSimpleD1([], sampleEntry);
      const repo = new D1StrongsRepository(db as any);
      await repo.lookup('g25');
      expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith('G25');
    });

    it('tries padded number when exact match returns null', async () => {
      let callCount = 0;
      const db = {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockImplementation((...args: any[]) => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
            first: vi.fn().mockResolvedValue(callCount++ === 0 ? null : sampleEntry),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      const repo = new D1StrongsRepository(db as any);
      const result = await repo.lookup('G25');
      expect(result).toEqual(sampleEntry);
      expect(db.prepare).toHaveBeenCalledTimes(2);
    });

    it('preserves suffix identity before falling back to the base entry', async () => {
      const binds: unknown[] = [];
      const db = {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockImplementation((value: unknown) => {
            binds.push(value);
            return { first: vi.fn().mockResolvedValue(value === 'G1722' ? sampleEntry : null) };
          }),
        })),
      };
      expect(await new D1StrongsRepository(db as any).lookup('g01722A')).toEqual(sampleEntry);
      expect(binds).toEqual(['G1722a', 'G1722']);
    });

    it('returns undefined when both exact and padded fail', async () => {
      const db = createSimpleD1([], null);
      const repo = new D1StrongsRepository(db as any);
      const result = await repo.lookup('G25');
      expect(result).toBeUndefined();
    });

    it('canonicalizes padded input and retains padded-database compatibility', async () => {
      const db = createSimpleD1([], null);
      const repo = new D1StrongsRepository(db as any);
      await repo.lookup('G0025');
      expect(db.prepare).toHaveBeenCalledTimes(2);
      expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith('G25');
      expect(db.prepare.mock.results[1].value.bind).toHaveBeenCalledWith('G0025');
    });
  });

  describe('search', () => {
    it('escapes quotes and asterisks from query', async () => {
      const db = createSimpleD1([]);
      const repo = new D1StrongsRepository(db as any);
      await repo.search("test'*\"");
      const bindArgs = db.prepare.mock.results[0].value.bind.mock.calls[0];
      expect(bindArgs[0]).toBe('"test"*');
    });

    it('unwraps { results } from .all()', async () => {
      const db = createSimpleD1([
        sampleEntry,
        { ...sampleEntry, strongs_number: 'G0026', lemma: 'ἀγάπη', transliteration: 'agapē', definition: 'love' },
      ]);
      const repo = new D1StrongsRepository(db as any);
      const results = await repo.search('agape');
      expect(results).toHaveLength(2);
      expect(results[0].strongs_number).toBe('G0025');
      expect(results[0]).toHaveProperty('testament', 'NT');
      expect(results[0]).toHaveProperty('pronunciation');
    });

    it('passes limit parameter to bind', async () => {
      const db = createSimpleD1([]);
      const repo = new D1StrongsRepository(db as any);
      await repo.search('agape', 20);
      const bindArgs = db.prepare.mock.results[0].value.bind.mock.calls[0];
      expect(bindArgs[1]).toBe(20);
    });

    it('defaults limit to 10', async () => {
      const db = createSimpleD1([]);
      const repo = new D1StrongsRepository(db as any);
      await repo.search('agape');
      const bindArgs = db.prepare.mock.results[0].value.bind.mock.calls[0];
      expect(bindArgs[1]).toBe(10);
    });
  });

  describe('getLexiconEntry', () => {
    it('pads strongs number before query', async () => {
      const db = createSimpleD1([], null);
      const repo = new D1StrongsRepository(db as any);
      await repo.getLexiconEntry('G25');
      expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith('G0025');
    });

    it('parses JSON extended_data correctly', async () => {
      const db = createSimpleD1([], {
        strongs_number: 'G0025',
        source: 'abbott-smith',
        extended_data: '{"senses":{"1":{"gloss":"love","count":100}}}',
      });
      const repo = new D1StrongsRepository(db as any);
      const result = await repo.getLexiconEntry('G25');
      expect(result).toBeDefined();
      expect(result!.extended_data).toEqual({ senses: { '1': { gloss: 'love', count: 100 } } });
      expect(typeof result!.extended_data).toBe('object');
    });

    it('preserves suffix identity before falling back to the base morphology key', async () => {
      const binds: unknown[] = [];
      const row = { strongs_number: 'H0430', source: 'BDB', extended_data: '{}' };
      const db = {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockImplementation((value: unknown) => {
            binds.push(value);
            return { first: vi.fn().mockResolvedValue(value === 'H0430' ? row : null) };
          }),
        })),
      };
      expect(await new D1StrongsRepository(db as any).getLexiconEntry('h430A')).toMatchObject({ strongs_number: 'H0430' });
      expect(binds).toEqual(['H0430a', 'H0430']);
    });

    it('returns undefined when row is null', async () => {
      const db = createSimpleD1([], null);
      const repo = new D1StrongsRepository(db as any);
      const result = await repo.getLexiconEntry('G9999');
      expect(result).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('uses Promise.all and returns correct counts', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: [] }),
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn().mockResolvedValue({}),
          }),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockImplementation(async () => {
            return callIdx++ === 0 ? { c: 5624 } : { c: 8674 };
          }),
          run: vi.fn().mockResolvedValue({}),
        })),
      };
      const repo = new D1StrongsRepository(db as any);
      const result = await repo.getStats();
      expect(result).toEqual({ greek: 5624, hebrew: 8674, total: 14298 });
    });

    it('handles null rows gracefully', async () => {
      const db = createSimpleD1([], null);
      const repo = new D1StrongsRepository(db as any);
      const result = await repo.getStats();
      expect(result).toEqual({ greek: 0, hebrew: 0, total: 0 });
    });
  });
});
