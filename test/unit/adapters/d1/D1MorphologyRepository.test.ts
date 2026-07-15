import { describe, it, expect, vi } from 'vitest';
import { D1MorphologyRepository } from '../../../../src/adapters/d1/D1MorphologyRepository.js';
import { createMockD1, createSimpleD1 } from '../../../helpers/mockD1.js';

const sampleMorphWord = {
  position: 1,
  word_text: 'Ἐν',
  lemma: 'ἐν',
  strongs_number: 'G1722',
  morph_code: 'PREP',
  gloss: 'In',
};

describe('D1MorphologyRepository', () => {
  describe('getVerseMorphology', () => {
    it('unwraps { results } from .all() and returns MorphWord[]', async () => {
      const db = createSimpleD1([sampleMorphWord]);
      const repo = new D1MorphologyRepository(db as any);
      const result = await repo.getVerseMorphology('John', 1, 1);
      expect(result).toEqual([sampleMorphWord]);
    });

    it('passes book, chapter, verse to .bind()', async () => {
      const db = createSimpleD1([]);
      const repo = new D1MorphologyRepository(db as any);
      await repo.getVerseMorphology('John', 3, 16);
      expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith('John', 3, 16);
    });

    it('returns empty array when no results', async () => {
      const db = createSimpleD1([]);
      const repo = new D1MorphologyRepository(db as any);
      const result = await repo.getVerseMorphology('John', 99, 99);
      expect(result).toEqual([]);
    });
  });

  describe('expandMorphCode', () => {
    it('returns expansion from database lookup', async () => {
      const db = createSimpleD1([], { expansion: 'Preposition' });
      const repo = new D1MorphologyRepository(db as any);
      const result = await repo.expandMorphCode('PREP');
      expect(result).toBe('Preposition');
    });

    it('falls back to expandHebrewMorphCode for Hebrew codes when DB returns null', async () => {
      const db = createSimpleD1([], null);
      const repo = new D1MorphologyRepository(db as any);
      const result = await repo.expandMorphCode('HVqp3ms');
      // expandHebrewMorphCode('HVqp3ms') -> 'Verb Qal Perfect 3rd Masculine Singular'
      expect(result).toBe('Verb Qal Perfect 3rd Masculine Singular');
    });

    it('uses the same strict slash-delimited Hebrew expansion as Node', async () => {
      const db = createSimpleD1([], null);
      const repo = new D1MorphologyRepository(db as any);
      await expect(repo.expandMorphCode('HTd/Ncfsa'))
        .resolves.toBe('Particle Definite Article / Noun Common Feminine Singular Absolute');
      await expect(repo.expandMorphCode('HTd/Ncfsa/UNKNOWN')).resolves.toBeUndefined();
    });

    it('uses the same documented TEHMC extensions as Node', async () => {
      const db = createSimpleD1([], null);
      const repo = new D1MorphologyRepository(db as any);
      await expect(repo.expandMorphCode('Hc/Vqw3ms'))
        .resolves.toBe('Sequential Conjunction / Verb Qal Sequential Imperfect 3rd Masculine Singular');
      await expect(repo.expandMorphCode('HTc')).resolves.toBe('Particle Condition or Consequence');
      await expect(repo.expandMorphCode('HNpl')).resolves.toBe('Noun Proper Name Location');
      await expect(repo.expandMorphCode('HNpt')).resolves.toBe('Noun Proper Name Title');
    });

    it('returns undefined for non-Hebrew code when DB returns null', async () => {
      const db = createSimpleD1([], null);
      const repo = new D1MorphologyRepository(db as any);
      const result = await repo.expandMorphCode('UNKNOWN');
      expect(result).toBeUndefined();
    });
  });

  describe('getAvailableBooks', () => {
    it('unwraps { results } and maps to canonical book order', async () => {
      const db = createSimpleD1([{ book: 'John' }, { book: 'Genesis' }]);
      const repo = new D1MorphologyRepository(db as any);
      const result = await repo.getAvailableBooks();
      expect(result).toEqual(['Genesis', 'John']);
    });
  });

  describe('hasVerse', () => {
    it('returns true when getVerseMorphology returns non-empty', async () => {
      const db = createSimpleD1([sampleMorphWord]);
      const repo = new D1MorphologyRepository(db as any);
      expect(await repo.hasVerse('John', 1, 1)).toBe(true);
    });

    it('returns false when getVerseMorphology returns empty', async () => {
      const db = createSimpleD1([]);
      const repo = new D1MorphologyRepository(db as any);
      expect(await repo.hasVerse('John', 99, 99)).toBe(false);
    });
  });

  describe('getOccurrences', () => {
    it('unwraps { results } from .all()', async () => {
      const occurrence = { book: 'John', chapter: 3, verse: 16, word_text: 'ἠγάπησεν', gloss: 'loved' };
      const db = createSimpleD1([occurrence]);
      const repo = new D1MorphologyRepository(db as any);
      const result = await repo.getOccurrences('G25');
      expect(result).toEqual([occurrence]);
    });

    it.each(['G6000', 'H9001', 'H9049', 'G21502'])('uses extended morphology identity %s unchanged', async identity => {
      const db = createSimpleD1([]);
      await expect(new D1MorphologyRepository(db as any).getOccurrences(identity)).resolves.toEqual([]);
      expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith(identity, 100);
    });

    it('passes strongsNumber and limit to .bind()', async () => {
      const db = createSimpleD1([]);
      const repo = new D1MorphologyRepository(db as any);
      await repo.getOccurrences('G25', 50);
      expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith('G0025', 50);

      await repo.getOccurrences('g25i');
      expect(db.prepare.mock.results[1].value.bind).toHaveBeenCalledWith('G0025I', 100);
      expect(await repo.getOccurrences('G0')).toEqual([]);
    });
  });

  describe('getDistribution', () => {
    it('unwraps { results } from .all() in canonical book order', async () => {
      const db = createSimpleD1([
        { book: 'Romans', verse_count: 3 },
        { book: 'John', verse_count: 15 },
      ]);
      const repo = new D1MorphologyRepository(db as any);
      const result = await repo.getDistribution('G25');
      expect(result).toEqual([
        { book: 'John', verse_count: 15 },
        { book: 'Romans', verse_count: 3 },
      ]);
    });

    it('passes strongsNumber to .bind()', async () => {
      const db = createSimpleD1([]);
      const repo = new D1MorphologyRepository(db as any);
      await repo.getDistribution('G25');
      expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith('G0025');
    });
  });

  describe('usage foundation', () => {
    it('returns aggregate rows without dropping surface-form provenance', async () => {
      const db = createMockD1([
        { sql: 'FROM strongs_usage_stats', first: { strongs_key: 'G0025', token_count: 3, verse_count: 2, book_count: 2, form_count: 1 } },
        { sql: 'FROM strongs_book_stats', all: { results: [{ book: 'John', book_order: 43, token_count: 3, verse_count: 2 }] } },
        { sql: 'FROM strongs_form_stats', all: { results: [{ form_text: 'ἠγάπησεν', token_count: 3, verse_count: 2, first_book: 'John', first_book_order: 43, first_chapter: 3, first_verse: 16, first_position: 1 }] } },
      ]);
      const repo = new D1MorphologyRepository(db as any);
      await expect(repo.getUsageStats('g25')).resolves.toMatchObject({ strongs_key: 'G0025', token_count: 3 });
      await expect(repo.getBookUsage('G25')).resolves.toHaveLength(1);
      await expect(repo.getFormUsage('G25')).resolves.toEqual([{
        form_text: 'ἠγάπησεν', token_count: 3, verse_count: 2,
        first: { book: 'John', book_order: 43, chapter: 3, verse: 16, position: 1 },
      }]);
    });

    it('round-trips a verse-zero keyset position', async () => {
      const rows = [
        { book: 'Psalms', book_order: 19, chapter: 3, verse: 0, position: 1, word_text: 'a', lemma: 'a', strongs_number: 'H9998', morph_code: null, gloss: null },
        { book: 'Psalms', book_order: 19, chapter: 3, verse: 0, position: 2, word_text: 'b', lemma: 'b', strongs_number: 'H9998', morph_code: null, gloss: null },
        { book: 'Psalms', book_order: 19, chapter: 3, verse: 1, position: 1, word_text: 'c', lemma: 'c', strongs_number: 'H9998', morph_code: null, gloss: null },
      ];
      const db = createMockD1([
        { sql: /FROM morphology WHERE strongs_number = \?[\s\S]*LIMIT/, all: { results: rows } },
        { sql: /\(book_order, chapter, verse, position\) >/, all: { results: [rows[2]] } },
      ]);
      const repo = new D1MorphologyRepository(db as any);
      const first = await repo.getTokenOccurrences('H9998', undefined, 2);
      expect(first.next_after).toEqual({ book_order: 19, chapter: 3, verse: 0, position: 2 });
      await expect(repo.getTokenOccurrences('H9998', first.next_after, 2)).resolves.toEqual({ occurrences: [rows[2]] });
    });
  });
});
