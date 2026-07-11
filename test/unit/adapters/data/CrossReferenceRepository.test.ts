import { describe, expect, it } from 'vitest';
import { CrossReferenceRepository } from '../../../../src/adapters/data/CrossReferenceRepository.js';
import { FakeSqliteDatabase } from './fakeSqlite.js';

describe('CrossReferenceRepository', () => {
  it('prepares its reusable queries at construction', () => {
    const db = new FakeSqliteDatabase();
    new CrossReferenceRepository(db.asDatabase());

    expect(db.prepare).toHaveBeenCalledTimes(3);
    expect(db.statement('SELECT to_verse').sql).toContain('ORDER BY votes DESC, to_verse ASC LIMIT ?');
    expect(db.statement('COUNT(*)').sql).toContain('votes >= ?');
    expect(db.statement('GROUP BY from_verse').sql).toContain("LIKE ? || '.%'");
  });

  it('normalizes input and output references and reports pagination', () => {
    const db = new FakeSqliteDatabase([
      { match: 'SELECT to_verse', all: [{ to_verse: 'Rom.5.8', votes: 42 }, { to_verse: 'not-a-ref', votes: 2 }] },
      { match: 'COUNT(*)', get: { count: 9 } },
    ]);
    const repo = new CrossReferenceRepository(db.asDatabase());

    expect(repo.getCrossReferences('Genesis 1:1', { maxResults: 2, minVotes: 2 })).toEqual({
      references: [
        { reference: 'Romans 5:8', votes: 42 },
        { reference: 'not-a-ref', votes: 2 },
      ],
      total: 9,
      showing: 2,
      hasMore: true,
    });
    expect(db.statement('SELECT to_verse').all).toHaveBeenCalledWith('Gen.1.1', 2, 2);
    expect(db.statement('COUNT(*)').get).toHaveBeenCalledWith('Gen.1.1', 2);
  });

  it('uses defaults, passes OpenBible keys through, and detects references', () => {
    const db = new FakeSqliteDatabase([
      { match: 'SELECT to_verse', all: [] },
      { match: 'COUNT(*)', get: { count: 1 } },
    ]);
    const repo = new CrossReferenceRepository(db.asDatabase());

    expect(repo.getCrossReferences(' Gen.1.1 ')).toEqual({ references: [], total: 1, showing: 0, hasMore: false });
    expect(db.statement('SELECT to_verse').all).toHaveBeenCalledWith('Gen.1.1', 0, 5);
    expect(repo.hasReferences('unparseable')).toBe(true);
    expect(db.statement('COUNT(*)').get).toHaveBeenLastCalledWith('unparseable', 0);
  });

  it('returns false for a zero count', () => {
    const db = new FakeSqliteDatabase([{ match: 'COUNT(*)', get: { count: 0 } }]);
    expect(new CrossReferenceRepository(db.asDatabase()).hasReferences('Gen.1.1')).toBe(false);
  });

  it('maps chapter statistics, filters malformed rows, and totals counts', () => {
    const db = new FakeSqliteDatabase([{
      match: 'GROUP BY from_verse',
      all: [
        { from_verse: 'Gen.1.2', ref_count: 3 },
        { from_verse: 'Gen.1.10', ref_count: 4 },
        { from_verse: 'bad', ref_count: 100 },
      ],
    }]);
    const repo = new CrossReferenceRepository(db.asDatabase());

    expect(repo.getChapterStatistics('Genesis 1')).toEqual({
      totalVerses: 2,
      totalCrossRefs: 7,
      verseStats: [{ verse: 2, refCount: 3 }, { verse: 10, refCount: 4 }],
    });
    expect(db.statement('GROUP BY from_verse').all).toHaveBeenCalledWith('Gen.1');
  });
});
