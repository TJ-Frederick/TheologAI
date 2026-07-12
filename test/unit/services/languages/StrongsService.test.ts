import { describe, it, expect, vi } from 'vitest';
import { StrongsService } from '../../../../src/services/languages/StrongsService.js';
import { ValidationError, NotFoundError } from '../../../../src/kernel/errors.js';
import { readFileSync } from 'node:fs';

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

const stepBibleGreek = JSON.parse(readFileSync(new URL('../../../../data/biblical-languages/stepbible-lexicons/tbesg-greek.json', import.meta.url), 'utf8')) as Record<string, Record<string, unknown>>;
const stepBibleHebrew = JSON.parse(readFileSync(new URL('../../../../data/biblical-languages/stepbible-lexicons/tbesh-hebrew.json', import.meta.url), 'utf8')) as Record<string, Record<string, unknown>>;

function sourceLexicon(id: string) {
  return {
    strongs_number: id,
    source: 'STEPBible',
    extended_data: (id.startsWith('G') ? stepBibleGreek : stepBibleHebrew)[id],
  };
}

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
    it('normalizes input to uppercase', async () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      await service.lookup('g26');
      expect(repo.lookup).toHaveBeenCalledWith('G26');
    });

    it('trims whitespace from input', async () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      await service.lookup('  G26  ');
      expect(repo.lookup).toHaveBeenCalledWith('G26');
    });

    it('canonicalizes padding while preserving a sense suffix', async () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      await service.lookup(' g02385i ', true);
      expect(repo.lookup).toHaveBeenCalledWith('G2385I');
      expect(repo.getLexiconEntry).toHaveBeenCalledWith('G2385I');
    });

    it('throws ValidationError for invalid format', async () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      await expect(service.lookup('XYZ')).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for empty string', async () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      await expect(service.lookup('')).rejects.toThrow(ValidationError);
    });

    it.each(['G0', 'G100000', 'H999999', 'G9007199254740993'])('rejects zero or out-of-domain identity %s', async input => {
      const repo = makeMockRepo();
      await expect(new StrongsService(repo as any).lookup(input)).rejects.toThrow(ValidationError);
      expect(repo.lookup).not.toHaveBeenCalled();
    });

    it.each(['G6000', 'H9001', 'H9049', 'G21502'])('returns source-backed lexicon-only identity %s without a classical row', async input => {
      const repo = makeMockRepo();
      repo.lookup.mockReturnValue(undefined);
      repo.getLexiconEntry.mockReturnValue(sourceLexicon(input));
      const result = await new StrongsService(repo as any).lookup(input, true);
      expect(repo.lookup).toHaveBeenCalledWith(input);
      expect(repo.getLexiconEntry).toHaveBeenCalledWith(input);
      expect(result).toMatchObject({
        strongs_number: input,
        testament: null,
        language: input.startsWith('G') ? 'Greek' : 'Hebrew',
        sourceKind: 'stepbible_lexicon',
        citation: { source: 'STEPBible lexicon data' },
        lemma: sourceLexicon(input).extended_data.lemma,
        extended: { strongsExtended: input },
      });
      expect(result.definition).not.toMatch(/<[^>]+>/);
    });

    it('does not infer New Testament classification for the LXX-only G21502 identity', async () => {
      const repo = makeMockRepo();
      repo.lookup.mockReturnValue(undefined);
      repo.getLexiconEntry.mockReturnValue(sourceLexicon('G21502'));
      const result = await new StrongsService(repo as any).lookup('G21502');
      expect(result).toMatchObject({ strongs_number: 'G21502', language: 'Greek', testament: null });
      expect(result.definition).toContain('LXX');
    });

    it('keeps lexicon-only summary source-backed without forcing extended detail', async () => {
      const repo = makeMockRepo();
      repo.lookup.mockReturnValue(undefined);
      repo.getLexiconEntry.mockReturnValue(sourceLexicon('G6000'));
      const result = await new StrongsService(repo as any).lookup('G6000', false);
      expect(result.extended).toBeUndefined();
      expect(result.citation).toEqual(expect.objectContaining({ source: 'STEPBible lexicon data', copyright: expect.stringContaining('CC BY 4.0') }));
    });

    it('does not base-join a missing suffixed identity when only the base lexicon exists', async () => {
      const repo = makeMockRepo();
      repo.lookup.mockReturnValue(undefined);
      repo.getLexiconEntry.mockReturnValue(undefined);
      await expect(new StrongsService(repo as any).lookup('G6000A')).rejects.toThrow(NotFoundError);
      expect(repo.getLexiconEntry).toHaveBeenCalledWith('G6000A');
    });

    it('throws NotFoundError when repo returns undefined', async () => {
      const repo = makeMockRepo();
      repo.lookup.mockReturnValue(undefined);
      const service = new StrongsService(repo as any);
      await expect(service.lookup('G5624')).rejects.toThrow(NotFoundError);
    });

    it('maps repo entry to EnhancedStrongsResult with citation', async () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      const result = await service.lookup('G26');
      expect(result.strongs_number).toBe('G26');
      expect(result.testament).toBe('NT');
      expect(result.lemma).toBe('ἀγάπη');
      expect(result.citation.source).toBe("Strong's Concordance");
    });

    it('does not include extended data when includeExtended is false', async () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      const result = await service.lookup('G26', false);
      expect(result.extended).toBeUndefined();
    });

    it('includes extended data from lexicon when includeExtended is true', async () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      const result = await service.lookup('G26', true);
      expect(result.extended).toBeDefined();
      expect(result.extended!.strongsExtended).toBe('G0026');
      expect(result.extendedCitation).toMatchObject({
        source: 'STEPBible lexicon data',
        copyright: 'CC BY 4.0 (Tyndale House, Cambridge)',
      });
      expect(repo.getLexiconEntry).toHaveBeenCalledWith('G26');
    });

    it('maps the real STEPBible lexicon shape', async () => {
      const repo = makeMockRepo();
      repo.getLexiconEntry.mockReturnValue({
        strongs_number: 'G0026',
        source: 'Abbott-Smith',
        extended_data: {
          extendedStrongs: 'G0026',
          gloss: 'love',
          definition: '<b>love, goodwill</b>',
          morph: 'G:N-F',
          source: 'Abbott-Smith',
        },
      });
      const result = await new StrongsService(repo as any).lookup('G26', true);
      expect(result.extended).toMatchObject({
        strongsExtended: 'G0026',
        gloss: 'love',
        definition: '<b>love, goodwill</b>',
        morphologyCode: 'G:N-F',
        source: 'Abbott-Smith',
      });
    });

    it('handles missing lexicon entry gracefully', async () => {
      const repo = makeMockRepo();
      repo.getLexiconEntry.mockReturnValue(undefined);
      const service = new StrongsService(repo as any);
      const result = await service.lookup('G26', true);
      expect(result.extended).toBeUndefined();
      expect(result.extendedCitation).toBeUndefined();
    });

    it('converts null optional fields to undefined', async () => {
      const repo = makeMockRepo();
      repo.lookup.mockReturnValue({ ...mockEntry, transliteration: null, pronunciation: null, derivation: null });
      const service = new StrongsService(repo as any);
      const result = await service.lookup('G26');
      expect(result.transliteration).toBeUndefined();
      expect(result.pronunciation).toBeUndefined();
      expect(result.derivation).toBeUndefined();
    });
  });

  describe('search', () => {
    it('delegates to repository', async () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      const results = await service.search('agape', 10);
      expect(repo.search).toHaveBeenCalledWith('agape', 10);
      expect(results).toHaveLength(1);
    });

    it('trims the query and applies the bounded default', async () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      await service.search('  agape  ');
      expect(repo.search).toHaveBeenCalledWith('agape', 10);
    });

    it.each([
      ['', 10],
      ['x', 10],
      ['love', 0],
      ['love', 21],
      ['love', 1.5],
    ])('rejects an invalid bounded search (%s, %s)', async (query, limit) => {
      const service = new StrongsService(makeMockRepo() as any);
      await expect(service.search(query, limit)).rejects.toThrow(ValidationError);
    });
  });

  describe('getStats', () => {
    it('delegates to repository', async () => {
      const repo = makeMockRepo();
      const service = new StrongsService(repo as any);
      const stats = await service.getStats();
      expect(repo.getStats).toHaveBeenCalled();
      expect(stats).toEqual({ greek: 5624, hebrew: 8674 });
    });
  });
});
