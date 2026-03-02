import { describe, it, expect, vi } from 'vitest';
import { D1CrossReferenceRepository } from '../../../../src/adapters/d1/D1CrossReferenceRepository.js';
import { createMockD1 } from '../../../helpers/mockD1.js';

describe('D1CrossReferenceRepository', () => {
  describe('getCrossReferences', () => {
    it('unwraps { results } from .all() and maps references', async () => {
      const db = createMockD1([
        { sql: /SELECT to_verse/, all: { results: [{ to_verse: 'Rom.5.8', votes: 42 }] } },
        { sql: /COUNT/, first: { count: 1 } },
      ]);
      const repo = new D1CrossReferenceRepository(db as any);
      const result = await repo.getCrossReferences('Gen.1.1');
      expect(result.references).toEqual([{ reference: 'Rom.5.8', votes: 42 }]);
      expect(result.total).toBe(1);
      expect(result.showing).toBe(1);
    });

    it('uses Promise.all to parallelize .all() and .first()', async () => {
      const db = createMockD1([
        { sql: /SELECT to_verse/, all: { results: [] } },
        { sql: /COUNT/, first: { count: 0 } },
      ]);
      const repo = new D1CrossReferenceRepository(db as any);
      await repo.getCrossReferences('Gen.1.1');
      expect(db.prepare).toHaveBeenCalledTimes(2);
    });

    it('respects maxResults option', async () => {
      const db = createMockD1([
        { sql: /SELECT to_verse/, all: { results: [] } },
        { sql: /COUNT/, first: { count: 0 } },
      ]);
      const repo = new D1CrossReferenceRepository(db as any);
      await repo.getCrossReferences('Gen.1.1', { maxResults: 10 });
      const prepareCall = db.prepare.mock.calls.find((c: string[]) => c[0].includes('LIMIT'));
      const bindCall = db.prepare.mock.results.find(
        (_r: any, i: number) => db.prepare.mock.calls[i][0].includes('LIMIT'),
      );
      expect(bindCall?.value.bind).toHaveBeenCalledWith(expect.any(String), 0, 10);
    });

    it('respects minVotes option', async () => {
      const db = createMockD1([
        { sql: /SELECT to_verse/, all: { results: [] } },
        { sql: /COUNT/, first: { count: 0 } },
      ]);
      const repo = new D1CrossReferenceRepository(db as any);
      await repo.getCrossReferences('Gen.1.1', { minVotes: 5 });
      const bindCall = db.prepare.mock.results.find(
        (_r: any, i: number) => db.prepare.mock.calls[i][0].includes('LIMIT'),
      );
      expect(bindCall?.value.bind).toHaveBeenCalledWith(expect.any(String), 5, 5);
    });

    it('defaults maxResults to 5 and minVotes to 0', async () => {
      const db = createMockD1([
        { sql: /SELECT to_verse/, all: { results: [] } },
        { sql: /COUNT/, first: { count: 0 } },
      ]);
      const repo = new D1CrossReferenceRepository(db as any);
      await repo.getCrossReferences('Gen.1.1');
      const bindCall = db.prepare.mock.results.find(
        (_r: any, i: number) => db.prepare.mock.calls[i][0].includes('LIMIT'),
      );
      expect(bindCall?.value.bind).toHaveBeenCalledWith(expect.any(String), 0, 5);
    });

    it('computes hasMore when total > maxResults', async () => {
      const db = createMockD1([
        { sql: /SELECT to_verse/, all: { results: [{ to_verse: 'Rom.5.8', votes: 42 }] } },
        { sql: /COUNT/, first: { count: 10 } },
      ]);
      const repo = new D1CrossReferenceRepository(db as any);
      const result = await repo.getCrossReferences('Gen.1.1', { maxResults: 5 });
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(10);
    });

    it('handles null count row gracefully', async () => {
      const db = createMockD1([
        { sql: /SELECT to_verse/, all: { results: [] } },
        { sql: /COUNT/, first: null },
      ]);
      const repo = new D1CrossReferenceRepository(db as any);
      const result = await repo.getCrossReferences('Gen.1.1');
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('hasReferences', () => {
    it('returns true when count > 0', async () => {
      const db = createMockD1([{ sql: /COUNT/, first: { count: 3 } }]);
      const repo = new D1CrossReferenceRepository(db as any);
      expect(await repo.hasReferences('Gen.1.1')).toBe(true);
    });

    it('returns false when count is 0', async () => {
      const db = createMockD1([{ sql: /COUNT/, first: { count: 0 } }]);
      const repo = new D1CrossReferenceRepository(db as any);
      expect(await repo.hasReferences('Gen.1.1')).toBe(false);
    });

    it('returns false when first() returns null', async () => {
      const db = createMockD1([{ sql: /COUNT/, first: null }]);
      const repo = new D1CrossReferenceRepository(db as any);
      expect(await repo.hasReferences('Gen.1.1')).toBe(false);
    });
  });

  describe('getChapterStatistics', () => {
    it('destructures { results } and maps verse stats', async () => {
      const db = createMockD1([{
        sql: /GROUP BY/,
        all: { results: [
          { from_verse: 'Gen.1.1', ref_count: 5 },
          { from_verse: 'Gen.1.2', ref_count: 3 },
        ] },
      }]);
      const repo = new D1CrossReferenceRepository(db as any);
      const result = await repo.getChapterStatistics('Gen.1');
      expect(result.verseStats).toEqual([
        { verse: 1, refCount: 5 },
        { verse: 2, refCount: 3 },
      ]);
      expect(result.totalVerses).toBe(2);
      expect(result.totalCrossRefs).toBe(8);
    });

    it('filters out entries with no verse number match', async () => {
      const db = createMockD1([{
        sql: /GROUP BY/,
        all: { results: [
          { from_verse: 'Gen.1.1', ref_count: 5 },
          { from_verse: 'Genesis', ref_count: 2 }, // no .\d+ at end
        ] },
      }]);
      const repo = new D1CrossReferenceRepository(db as any);
      const result = await repo.getChapterStatistics('Gen.1');
      expect(result.verseStats).toHaveLength(1);
      expect(result.verseStats[0].verse).toBe(1);
    });
  });

  describe('normalizeKey', () => {
    it('passes through already-normalized OpenBible format', async () => {
      const db = createMockD1([
        { sql: /SELECT to_verse/, all: { results: [] } },
        { sql: /COUNT/, first: { count: 0 } },
      ]);
      const repo = new D1CrossReferenceRepository(db as any);
      await repo.getCrossReferences('Gen.1.1');
      // The first prepare call's bind should receive the normalized key
      const limitResult = db.prepare.mock.results.find(
        (_r: any, i: number) => db.prepare.mock.calls[i][0].includes('LIMIT'),
      );
      expect(limitResult?.value.bind).toHaveBeenCalledWith('Gen.1.1', 0, 5);
    });

    it('normalizes human-readable references via parseReference', async () => {
      const db = createMockD1([
        { sql: /SELECT to_verse/, all: { results: [] } },
        { sql: /COUNT/, first: { count: 0 } },
      ]);
      const repo = new D1CrossReferenceRepository(db as any);
      await repo.getCrossReferences('John 3:16');
      // parseReference('John 3:16') should normalize to something like 'John.3.16'
      const limitResult = db.prepare.mock.results.find(
        (_r: any, i: number) => db.prepare.mock.calls[i][0].includes('LIMIT'),
      );
      const bindCall = limitResult?.value.bind.mock.calls[0];
      // The key should be normalized (contain dots, not colons)
      expect(bindCall[0]).toMatch(/\.\d+\.\d+$/);
    });
  });
});
