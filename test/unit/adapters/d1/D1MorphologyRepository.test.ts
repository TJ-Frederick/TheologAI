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

    it('returns undefined for non-Hebrew code when DB returns null', async () => {
      const db = createSimpleD1([], null);
      const repo = new D1MorphologyRepository(db as any);
      const result = await repo.expandMorphCode('UNKNOWN');
      expect(result).toBeUndefined();
    });
  });

  describe('getAvailableBooks', () => {
    it('unwraps { results } and maps to string[]', async () => {
      const db = createSimpleD1([{ book: 'Genesis' }, { book: 'John' }]);
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

    it('passes strongsNumber and limit to .bind()', async () => {
      const db = createSimpleD1([]);
      const repo = new D1MorphologyRepository(db as any);
      await repo.getOccurrences('G25', 50);
      expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith('G25', 50);
    });
  });

  describe('getDistribution', () => {
    it('unwraps { results } from .all()', async () => {
      const dist = { book: 'John', verse_count: 15 };
      const db = createSimpleD1([dist]);
      const repo = new D1MorphologyRepository(db as any);
      const result = await repo.getDistribution('G25');
      expect(result).toEqual([dist]);
    });

    it('passes strongsNumber to .bind()', async () => {
      const db = createSimpleD1([]);
      const repo = new D1MorphologyRepository(db as any);
      await repo.getDistribution('G25');
      expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith('G25');
    });
  });
});
