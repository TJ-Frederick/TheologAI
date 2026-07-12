import { describe, expect, it } from 'vitest';
import { MorphologyRepository } from '../../../../src/adapters/data/MorphologyRepository.js';
import { FakeSqliteDatabase } from './fakeSqlite.js';

const word = {
  position: 1,
  word_text: 'Ἐν',
  lemma: 'ἐν',
  strongs_number: 'G1722',
  morph_code: 'PREP',
  gloss: 'in',
};

describe('MorphologyRepository', () => {
  it('prepares all reusable morphology queries', () => {
    const db = new FakeSqliteDatabase();
    new MorphologyRepository(db.asDatabase());
    expect(db.prepare).toHaveBeenCalledTimes(5);
    expect(db.statement('COUNT(DISTINCT').sql).toContain('GROUP BY book');
  });

  it('retrieves morphology and uses it to detect verse availability', () => {
    const db = new FakeSqliteDatabase([{
      match: 'FROM morphology WHERE book',
      all: (book: unknown, chapter: unknown, verse: unknown) => book === 'John' && chapter === 1 && verse === 1 ? [word] : [],
    }]);
    const repo = new MorphologyRepository(db.asDatabase());

    expect(repo.getVerseMorphology('John', 1, 1)).toEqual([word]);
    expect(repo.hasVerse('John', 1, 1)).toBe(true);
    expect(repo.hasVerse('John', 1, 2)).toBe(false);
  });

  it('expands known morphology codes and returns undefined for unknown codes', () => {
    const db = new FakeSqliteDatabase([{
      match: 'FROM morph_codes',
      get: (code: unknown) => code === 'PREP' ? { expansion: 'preposition' } : undefined,
    }]);
    const repo = new MorphologyRepository(db.asDatabase());
    expect(repo.expandMorphCode('PREP')).toBe('preposition');
    expect(repo.expandMorphCode('HVqp3ms')).toBe('Verb Qal Perfect 3rd Masculine Singular');
    expect(repo.expandMorphCode('???')).toBeUndefined();
  });

  it('maps the available book list', () => {
    const db = new FakeSqliteDatabase([{ match: 'SELECT DISTINCT book', all: [{ book: 'Genesis' }, { book: 'John' }] }]);
    expect(new MorphologyRepository(db.asDatabase()).getAvailableBooks()).toEqual(['Genesis', 'John']);
  });

  it('returns occurrences with a default or explicit limit', () => {
    const occurrences = [{ book: 'John', chapter: 1, verse: 1, word_text: 'Ἐν', gloss: 'in' }];
    const db = new FakeSqliteDatabase([{ match: 'SELECT DISTINCT book, chapter, verse', all: occurrences }]);
    const repo = new MorphologyRepository(db.asDatabase());

    expect(repo.getOccurrences('G1722')).toEqual(occurrences);
    expect(repo.getOccurrences('G1722', 3)).toEqual(occurrences);
    expect(db.statement('SELECT DISTINCT book, chapter, verse').all).toHaveBeenNthCalledWith(1, 'G1722', 100);
    expect(db.statement('SELECT DISTINCT book, chapter, verse').all).toHaveBeenNthCalledWith(2, 'G1722', 3);

    repo.getOccurrences('g25i');
    expect(db.statement('SELECT DISTINCT book, chapter, verse').all).toHaveBeenNthCalledWith(3, 'G0025I', 100);
    expect(repo.getOccurrences('G0')).toEqual([]);
  });

  it('returns per-book verse distribution rows unchanged', () => {
    const distribution = [{ book: 'Romans', verse_count: 4 }, { book: 'John', verse_count: 9 }];
    const db = new FakeSqliteDatabase([{ match: 'COUNT(DISTINCT', all: distribution }]);
    const repo = new MorphologyRepository(db.asDatabase());
    expect(repo.getDistribution('G1722')).toEqual([
      { book: 'John', verse_count: 9 },
      { book: 'Romans', verse_count: 4 },
    ]);
    expect(db.statement('COUNT(DISTINCT').all).toHaveBeenCalledWith('G1722');
    repo.getDistribution('h430a');
    expect(db.statement('COUNT(DISTINCT').all).toHaveBeenLastCalledWith('H0430A');
  });

  it('propagates database failures', () => {
    const db = new FakeSqliteDatabase([{ match: 'SELECT DISTINCT book', all: new Error('database unavailable') }]);
    expect(() => new MorphologyRepository(db.asDatabase()).getAvailableBooks()).toThrow('database unavailable');
  });
});
