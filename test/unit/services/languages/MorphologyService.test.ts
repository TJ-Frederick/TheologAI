import { describe, it, expect, vi } from 'vitest';
import { MorphologyService } from '../../../../src/services/languages/MorphologyService.js';
import { NotFoundError } from '../../../../src/kernel/errors.js';
import type { MorphWord } from '../../../../src/adapters/data/MorphologyRepository.js';

// ── Mock repository ──

const mockWords: MorphWord[] = [
  { position: 1, word_text: 'Ἐν', lemma: 'ἐν', strongs_number: 'G1722', morph_code: 'PREP', gloss: 'In' },
  { position: 2, word_text: 'ἀρχῇ', lemma: 'ἀρχή', strongs_number: 'G746', morph_code: 'N-DSF', gloss: 'beginning' },
];

function makeMockRepo() {
  return {
    getVerseMorphology: vi.fn().mockReturnValue(mockWords),
    expandMorphCode: vi.fn().mockImplementation((code: string) => {
      const map: Record<string, string> = {
        'PREP': 'Preposition',
        'N-DSF': 'Noun, Dative, Singular, Feminine',
      };
      return map[code];
    }),
    getAvailableBooks: vi.fn().mockReturnValue(['Genesis', 'John', 'Romans']),
    hasVerse: vi.fn().mockReturnValue(true),
  };
}

describe('MorphologyService', () => {
  describe('getVerseMorphology', () => {
    it('parses reference and calls repo with StepBible format', () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      service.getVerseMorphology('John 1:1');
      expect(repo.getVerseMorphology).toHaveBeenCalledWith('John', 1, 1);
    });

    it('throws NotFoundError for chapter-only reference', () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      expect(() => service.getVerseMorphology('John 1')).toThrow(NotFoundError);
    });

    it('throws NotFoundError when repo returns empty array', () => {
      const repo = makeMockRepo();
      repo.getVerseMorphology.mockReturnValue([]);
      const service = new MorphologyService(repo as any);
      expect(() => service.getVerseMorphology('John 1:1')).toThrow(NotFoundError);
    });

    it('maps MorphWord to VerseWord correctly', () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      const result = service.getVerseMorphology('John 1:1');
      expect(result.words).toHaveLength(2);
      expect(result.words[0]).toMatchObject({
        position: 1,
        text: 'Ἐν',
        lemma: 'ἐν',
        strong: 'G1722',
        morph: 'PREP',
        gloss: 'In',
      });
    });

    it('sets morphExpanded when expandMorphology is true', () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      const result = service.getVerseMorphology('John 1:1', true);
      expect(result.words[0].morphExpanded).toBe('Preposition');
      expect(result.words[1].morphExpanded).toBe('Noun, Dative, Singular, Feminine');
    });

    it('does not expand when expandMorphology is false', () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      const result = service.getVerseMorphology('John 1:1', false);
      expect(result.words[0].morphExpanded).toBeUndefined();
    });

    it('handles null strongs_number and morph_code', () => {
      const repo = makeMockRepo();
      repo.getVerseMorphology.mockReturnValue([
        { position: 1, word_text: 'word', lemma: 'lem', strongs_number: null, morph_code: null, gloss: null },
      ]);
      const service = new MorphologyService(repo as any);
      const result = service.getVerseMorphology('John 1:1');
      expect(result.words[0].strong).toBe('');
      expect(result.words[0].morph).toBe('');
      expect(result.words[0].gloss).toBe('');
    });

    it('returns correct metadata', () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      const result = service.getVerseMorphology('John 1:1');
      expect(result.reference).toBe('John 1:1');
      expect(result.testament).toBe('NT');
      expect(result.book).toBe('John');
      expect(result.chapter).toBe(1);
      expect(result.verse).toBe(1);
      expect(result.citation.source).toBe('STEPBible TAGNT/TAHOT');
    });
  });

  describe('getAvailableBooks', () => {
    it('delegates to repository', () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      const books = service.getAvailableBooks();
      expect(repo.getAvailableBooks).toHaveBeenCalled();
      expect(books).toEqual(['Genesis', 'John', 'Romans']);
    });
  });
});
