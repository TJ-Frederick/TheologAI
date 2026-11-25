import { describe, it, expect, vi } from 'vitest';
import { MorphologyService } from '../../../../src/services/languages/MorphologyService.js';
import { NotFoundError, ValidationError } from '../../../../src/kernel/errors.js';
import type { MorphWord } from '../../../../src/adapters/data/MorphologyRepository.js';

// ── Mock repository ──

const mockWords: MorphWord[] = [
  { position: 1, word_text: 'Ἐν', lemma: 'ἐν', strongs_number: 'G1722', morph_code: 'PREP', gloss: 'In' },
  { position: 2, word_text: 'ἀρχῇ', lemma: 'ἀρχή', strongs_number: 'G746', morph_code: 'N-DSF', gloss: 'beginning' },
];

function makeMockRepo() {
  return {
    getVerseMorphology: vi.fn().mockReturnValue(mockWords),
    getExpandedVerseMorphology: vi.fn().mockReturnValue([
      { ...mockWords[0], expansion: 'Preposition' },
      { ...mockWords[1], expansion: 'Noun, Dative, Singular, Feminine' },
    ]),
    expandMorphCode: vi.fn(),
    getAvailableBooks: vi.fn().mockReturnValue(['Genesis', 'John', 'Romans']),
    hasVerse: vi.fn().mockReturnValue(true),
  };
}

describe('MorphologyService', () => {
  describe('getVerseMorphology', () => {
    it('parses reference and calls repo with StepBible format', async () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      await service.getVerseMorphology('John 1:1');
      expect(repo.getVerseMorphology).toHaveBeenCalledWith('John', 1, 1);
      expect(repo.getExpandedVerseMorphology).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for chapter-only reference', async () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      await expect(service.getVerseMorphology('John 1')).rejects.toThrow(NotFoundError);
    });

    it('rejects verse ranges because the service returns one verse', async () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);

      await expect(service.getVerseMorphology('John 1:1-2', true)).rejects.toThrow(ValidationError);
      expect(repo.getVerseMorphology).not.toHaveBeenCalled();
      expect(repo.getExpandedVerseMorphology).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when repo returns empty array', async () => {
      const repo = makeMockRepo();
      repo.getVerseMorphology.mockReturnValue([]);
      repo.getExpandedVerseMorphology.mockReturnValue([]);
      const service = new MorphologyService(repo as any);
      await expect(service.getVerseMorphology('John 1:1')).rejects.toThrow(NotFoundError);
      await expect(service.getVerseMorphology('John 1:1', true)).rejects.toThrow(NotFoundError);
    });

    it('maps MorphWord to VerseWord correctly', async () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      const result = await service.getVerseMorphology('John 1:1');
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

    it('sets morphExpanded when expandMorphology is true', async () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      const result = await service.getVerseMorphology('John 1:1', true);
      expect(result.words[0].morphExpanded).toBe('Preposition');
      expect(result.words[1].morphExpanded).toBe('Noun, Dative, Singular, Feminine');
      expect(repo.getExpandedVerseMorphology).toHaveBeenCalledExactlyOnceWith('John', 1, 1);
      expect(repo.getVerseMorphology).not.toHaveBeenCalled();
      expect(repo.expandMorphCode).not.toHaveBeenCalled();
    });

    it('does not expand when expandMorphology is false', async () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      const result = await service.getVerseMorphology('John 1:1', false);
      expect(result.words[0].morphExpanded).toBeUndefined();
      expect(repo.getExpandedVerseMorphology).not.toHaveBeenCalled();
    });

    it('handles null strongs_number and morph_code', async () => {
      const repo = makeMockRepo();
      repo.getVerseMorphology.mockReturnValue([
        { position: 1, word_text: 'word', lemma: 'lem', strongs_number: null, morph_code: null, gloss: null },
      ]);
      const service = new MorphologyService(repo as any);
      const result = await service.getVerseMorphology('John 1:1');
      expect(result.words[0].strong).toBe('');
      expect(result.words[0].morph).toBe('');
      expect(result.words[0].gloss).toBe('');
    });

    it('returns correct metadata', async () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      const result = await service.getVerseMorphology('John 1:1');
      expect(result.reference).toBe('John 1:1');
      expect(result.testament).toBe('NT');
      expect(result.book).toBe('John');
      expect(result.chapter).toBe(1);
      expect(result.verse).toBe(1);
      expect(result.citation.source).toBe('STEPBible TAGNT/TAHOT');
      expect(result.lemmaCitation).toBeUndefined();
    });

    it('attributes Hebrew lemmas to the separately tracked TBESH lexicon', async () => {
      const repo = makeMockRepo();
      repo.getVerseMorphology.mockReturnValue([
        { position: 3, word_text: 'אֱלֹהִ֑ים', lemma: 'אֱלֹהִים', strongs_number: 'H0430', morph_code: 'HNcmpa', gloss: 'God' },
      ]);
      const result = await new MorphologyService(repo as any).getVerseMorphology('Genesis 1:1');

      expect(result.words[0].lemma).toBe('אֱלֹהִים');
      expect(result.lemmaCitation).toMatchObject({
        source: 'STEPBible TBESH Hebrew lexicon',
        copyright: 'CC BY 4.0 (Tyndale House, Cambridge)',
      });
    });

    it('propagates compound Hebrew morphology expansion into verse output', async () => {
      const repo = makeMockRepo();
      repo.getExpandedVerseMorphology.mockReturnValue([
        {
          position: 5, word_text: 'הַ/שָּׁמַ֖יִם', lemma: 'שָׁמַיִם', strongs_number: 'H8064', morph_code: 'HTd/Ncmpa', gloss: 'the/ heavens',
          expansion: 'Particle Definite Article / Noun Common Masculine Plural Absolute',
        },
      ]);
      const result = await new MorphologyService(repo as any).getVerseMorphology('Genesis 1:1', true);
      expect(result.words[0].morphExpanded)
        .toBe('Particle Definite Article / Noun Common Masculine Plural Absolute');
    });

    it('propagates the joined read failure without retrying through point reads', async () => {
      const repo = makeMockRepo();
      const error = new Error('database read failed');
      repo.getExpandedVerseMorphology.mockRejectedValue(error);
      await expect(new MorphologyService(repo as any).getVerseMorphology('Genesis 1:1', true)).rejects.toBe(error);
      expect(repo.getVerseMorphology).not.toHaveBeenCalled();
      expect(repo.expandMorphCode).not.toHaveBeenCalled();
    });
  });

  describe('getAvailableBooks', () => {
    it('delegates to repository', async () => {
      const repo = makeMockRepo();
      const service = new MorphologyService(repo as any);
      const books = await service.getAvailableBooks();
      expect(repo.getAvailableBooks).toHaveBeenCalled();
      expect(books).toEqual(['Genesis', 'John', 'Romans']);
    });
  });
});
