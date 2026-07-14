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
    expect(db.prepare).toHaveBeenCalledTimes(11);
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
    expect(repo.expandMorphCode('HTd/Ncmpa')).toBe('Particle Definite Article / Noun Common Masculine Plural Absolute');
    expect(repo.expandMorphCode('Hc/Vqw3ms')).toBe('Sequential Conjunction / Verb Qal Sequential Imperfect 3rd Masculine Singular');
    expect(repo.expandMorphCode('HNpl')).toBe('Noun Proper Name Location');
    expect(repo.expandMorphCode('HTd/Ncmpa/UNKNOWN')).toBeUndefined();
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

  it.each(['G6000', 'H9001', 'H9049', 'G21502'])('uses extended morphology identity %s unchanged', identity => {
    const db = new FakeSqliteDatabase([{ match: 'SELECT DISTINCT book, chapter, verse', all: [] }]);
    const repo = new MorphologyRepository(db.asDatabase());
    expect(repo.getOccurrences(identity)).toEqual([]);
    expect(db.statement('SELECT DISTINCT book, chapter, verse').all).toHaveBeenCalledWith(identity, 100);
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

  it('returns deterministic usage, book, and surface-form aggregates', () => {
    const db = new FakeSqliteDatabase([
      { match: 'FROM strongs_usage_stats', get: { strongs_key: 'G0025', token_count: 3, verse_count: 2, book_count: 2, form_count: 1 } },
      { match: 'FROM strongs_book_stats', all: [{ book: 'John', book_order: 43, token_count: 3, verse_count: 2 }] },
      { match: 'FROM strongs_form_stats', all: [{ form_text: 'ἠγάπησεν', token_count: 3, verse_count: 2, first_book: 'John', first_book_order: 43, first_chapter: 3, first_verse: 16, first_position: 1 }] },
    ]);
    const repo = new MorphologyRepository(db.asDatabase());
    expect(repo.getUsageStats('g25')).toMatchObject({ strongs_key: 'G0025', token_count: 3 });
    expect(repo.getBookUsage('G25')).toEqual([{ book: 'John', book_order: 43, token_count: 3, verse_count: 2 }]);
    expect(repo.getFormUsage('G25')).toEqual([{
      form_text: 'ἠγάπησεν', token_count: 3, verse_count: 2,
      first: { book: 'John', book_order: 43, chapter: 3, verse: 16, position: 1 },
    }]);
    expect(repo.getFormUsage('G25', 1)).toHaveLength(1);
    expect(db.statement(/strongs_form_stats[\s\S]*LIMIT/).all).toHaveBeenCalledWith('G0025', 1);
  });

  it('paginates raw tokens without rejecting a verse-zero cursor', () => {
    const rows = [
      { book: 'Psalms', book_order: 19, chapter: 3, verse: 0, position: 1, word_text: 'a', lemma: 'a', strongs_number: 'H9998', morph_code: null, gloss: null },
      { book: 'Psalms', book_order: 19, chapter: 3, verse: 0, position: 2, word_text: 'b', lemma: 'b', strongs_number: 'H9998', morph_code: null, gloss: null },
      { book: 'Psalms', book_order: 19, chapter: 3, verse: 1, position: 1, word_text: 'c', lemma: 'c', strongs_number: 'H9998', morph_code: null, gloss: null },
    ];
    const db = new FakeSqliteDatabase([
      { match: /FROM morphology WHERE strongs_number = \?[\s\S]*LIMIT/, all: rows },
      { match: /\(book_order, chapter, verse, position\) >/, all: [rows[2]] },
    ]);
    const repo = new MorphologyRepository(db.asDatabase());
    const first = repo.getTokenOccurrences('H9998', undefined, 2);
    expect(first.occurrences).toHaveLength(2);
    expect(first.next_after).toEqual({ book_order: 19, chapter: 3, verse: 0, position: 2 });
    expect(repo.getTokenOccurrences('H9998', first.next_after, 2)).toEqual({ occurrences: [rows[2]] });
  });
});
