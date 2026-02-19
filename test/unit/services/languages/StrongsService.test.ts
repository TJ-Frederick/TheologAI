import { describe, it, expect, vi } from 'vitest';
import { StrongsService } from '../../../../src/services/languages/StrongsService.js';
import { ValidationError, NotFoundError } from '../../../../src/kernel/errors.js';

// ── Mock repository ──

const mockEntry = {
  strongs_number: 'G26',
  testament: 'NT' as const,
  lemma: 'ἀγάπη',
  transliteration: 'agapē',
  pronunciation: 'ag-ah-pay',
  definition: 'love, goodwill',
  derivation: 'from G25',
};

const mockLexicon = {
  strongs_number: 'G26',
  source: 'abbott-smith',
  extended_data: {
    extendedStrongs: 'G0026',
    senses: { '1': { gloss: 'love', count: 85, usage: 'divine love' } },
  },
};

function makeMockRepo() {
  return {
    lookup: vi.fn().mockReturnValue(mockEntry),
    search: vi.fn().mockReturnValue([mockEntry]),
    getLexiconEntry: vi.fn().mockReturnValue(mockLexicon),
    getStats: vi.fn().mockReturnValue({ greek: 5624, hebrew: 8674 }),
  };
}

describe('StrongsService', () => {
  describe('lookup', () => {
    it('normalizes input to uppercase', () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      service.lookup('g26');
      expect(repo.lookup).toHaveBeenCalledWith('G26');
    });

    it('trims whitespace from input', () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      service.lookup('  G26  ');
      expect(repo.lookup).toHaveBeenCalledWith('G26');
    });

    it('throws ValidationError for invalid format', () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      expect(() => service.lookup('XYZ')).toThrow(ValidationError);
    });

    it('throws ValidationError for empty string', () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      expect(() => service.lookup('')).toThrow(ValidationError);
    });

    it('throws NotFoundError when repo returns undefined', () => {
      const repo = makeMockRepo();
      repo.lookup.mockReturnValue(undefined);
      const service = new StrongsService(repo as any);
      expect(() => service.lookup('G9999')).toThrow(NotFoundError);
    });

    it('maps repo entry to EnhancedStrongsResult with citation', () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      const result = service.lookup('G26');
      expect(result.strongs_number).toBe('G26');
      expect(result.testament).toBe('NT');
      expect(result.lemma).toBe('ἀγάπη');
      expect(result.citation.source).toBe("Strong's Concordance");
    });

    it('does not include extended data when includeExtended is false', () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      const result = service.lookup('G26', false);
      expect(result.extended).toBeUndefined();
    });

    it('includes extended data from lexicon when includeExtended is true', () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      const result = service.lookup('G26', true);
      expect(result.extended).toBeDefined();
      expect(result.extended!.strongsExtended).toBe('G0026');
      expect(repo.getLexiconEntry).toHaveBeenCalledWith('G26');
    });

    it('handles missing lexicon entry gracefully', () => {
      const repo = makeMockRepo();
      repo.getLexiconEntry.mockReturnValue(undefined);
      const service = new StrongsService(repo as any);
      const result = service.lookup('G26', true);
      expect(result.extended).toBeUndefined();
    });

    it('converts null optional fields to undefined', () => {
      const repo = makeMockRepo();
      repo.lookup.mockReturnValue({ ...mockEntry, transliteration: null, pronunciation: null, derivation: null });
      const service = new StrongsService(repo as any);
      const result = service.lookup('G26');
      expect(result.transliteration).toBeUndefined();
      expect(result.pronunciation).toBeUndefined();
      expect(result.derivation).toBeUndefined();
    });
  });

  describe('search', () => {
    it('delegates to repository', () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      const results = service.search('agape', 10);
      expect(repo.search).toHaveBeenCalledWith('agape', 10);
      expect(results).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    it('delegates to repository', () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      const stats = service.getStats();
      expect(repo.getStats).toHaveBeenCalled();
      expect(stats).toEqual({ greek: 5624, hebrew: 8674 });
    });
  });
});
