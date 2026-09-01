import { describe, expect, it, vi } from 'vitest';
import type { IMorphologyRepository, IStrongsRepository } from '../../../../src/kernel/repositories.js';
import { StrongsService } from '../../../../src/services/languages/StrongsService.js';
import { encodeMorphologyUsageCursor, MORPHOLOGY_USAGE_IDENTITY } from '../../../../src/kernel/morphologyUsageCursor.js';
import {
  ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION,
  createOriginalLanguageStudyV3Cursor,
  decodeOriginalLanguageStudyV3Cursor,
  type OriginalLanguageStudyV3CursorBinding,
} from '../../../../src/kernel/originalLanguageStudyV3Contract.js';

const strongsRepo = {
  lookup: () => undefined,
  search: () => [],
  getLexiconEntry: () => undefined,
  getStats: () => ({ greek: 0, hebrew: 0, total: 0 }),
} satisfies IStrongsRepository;

function morphology(overrides: Partial<IMorphologyRepository> = {}): IMorphologyRepository {
  return {
    getVerseMorphology: () => [], expandMorphCode: () => undefined, getAvailableBooks: () => [],
    hasVerse: () => false, getOccurrences: () => [], getDistribution: () => [],
    getUsageStats: () => undefined, getBookUsage: () => [], getFormUsage: () => [],
    getTokenOccurrences: () => ({ occurrences: [] }),
    ...overrides,
  };
}

describe('StrongsService corpus usage', () => {
  it('rejects an unknown runtime usage level before corpus access', async () => {
    const getUsageStats = vi.fn<IMorphologyRepository['getUsageStats']>();
    const getTokenOccurrences = vi.fn<IMorphologyRepository['getTokenOccurrences']>();
    const service = new StrongsService(strongsRepo, morphology({ getUsageStats, getTokenOccurrences }));
    await expect(service.getCorpusUsage('G25', 'unreviewed' as never)).rejects.toThrow(/overview, study, or technical/);
    expect(getUsageStats).not.toHaveBeenCalled();
    expect(getTokenOccurrences).not.toHaveBeenCalled();
  });

  it.each([
    ['G25', 'G0025'],
    ['G3056', 'G3056'],
    ['H430', 'H0430'],
    ['H0430', 'H0430'],
  ])('normalizes %s to exact morphology identity %s', async (input, expectedKey) => {
    const getUsageStats = vi.fn<IMorphologyRepository['getUsageStats']>().mockReturnValue(undefined);
    const result = await new StrongsService(strongsRepo, morphology({ getUsageStats }))
      .getCorpusUsage(input, 'overview');
    expect(result).toMatchObject({ exactMorphologyKey: expectedKey, attested: false, totals: { tokenCount: 0 } });
    expect(getUsageStats).toHaveBeenCalledWith(input === 'H0430' ? 'H430' : input);
  });

  it('does not inherit base usage for an unattested extended identity', async () => {
    const getUsageStats = vi.fn<IMorphologyRepository['getUsageStats']>()
      .mockImplementation(key => key === 'H430' ? {
        strongs_key: 'H0430', token_count: 2600, verse_count: 2200, book_count: 39, form_count: 20,
      } : undefined);
    const service = new StrongsService(strongsRepo, morphology({ getUsageStats }));
    await expect(service.getCorpusUsage('H430A', 'overview')).resolves.toMatchObject({
      exactMorphologyKey: 'H0430A', attested: false, totals: { tokenCount: 0 },
    });
    expect(getUsageStats).toHaveBeenCalledWith('H430A');
    expect(getUsageStats).not.toHaveBeenCalledWith('H430');
  });

  it('rejects a wrong-key cursor even when the requested exact identity is unattested', async () => {
    const cursor = encodeMorphologyUsageCursor('H0430', { book_order: 1, chapter: 1, verse: 1, position: 3 });
    await expect(new StrongsService(strongsRepo, morphology()).getCorpusUsage('H430A', 'study', 5, cursor))
      .rejects.toThrow(/different Strong's identity/);
  });

  it('keeps lexicon occurrence metadata outside counted morphology totals', async () => {
    const getFormUsage = vi.fn<IMorphologyRepository['getFormUsage']>();
    const getTokenOccurrences = vi.fn<IMorphologyRepository['getTokenOccurrences']>();
    const service = new StrongsService(strongsRepo, morphology({
      getUsageStats: () => ({ strongs_key: 'G0025', token_count: 17, verse_count: 15, book_count: 4, form_count: 6 }),
      getBookUsage: () => [{ book: 'John', book_order: 43, token_count: 8, verse_count: 7 }],
      getFormUsage,
      getTokenOccurrences,
    }));
    const result = await service.getCorpusUsage('G25', 'overview');
    expect(result.totals.tokenCount).toBe(17);
    expect(result.sourceSurfaceVariants).toEqual([]);
    expect(result).not.toHaveProperty('occurrences');
    expect(getFormUsage).not.toHaveBeenCalled();
    expect(getTokenOccurrences).not.toHaveBeenCalled();
    expect(result.cautions.join(' ')).toMatch(/not counts from the lexicon/);
  });

  it.each([
    ['study' as const, 10, 8],
    ['technical' as const, 25, 20],
  ])('uses approved %s variant and default occurrence budgets', async (level, formLimit, occurrenceLimit) => {
    const getFormUsage = vi.fn<IMorphologyRepository['getFormUsage']>().mockReturnValue([]);
    const getTokenOccurrences = vi.fn<IMorphologyRepository['getTokenOccurrences']>().mockReturnValue({ occurrences: [] });
    const service = new StrongsService(strongsRepo, morphology({
      getUsageStats: () => ({ strongs_key: 'G0025', token_count: 1, verse_count: 1, book_count: 1, form_count: 1 }),
      getFormUsage, getTokenOccurrences,
    }));
    await service.getCorpusUsage('G25', level);
    expect(getFormUsage).toHaveBeenCalledWith('G25', formLimit);
    expect(getTokenOccurrences).toHaveBeenCalledWith('G25', undefined, occurrenceLimit);
  });

  it.each([
    ['overview' as const, 1, undefined, /does not accept occurrence_limit/],
    ['overview' as const, undefined, 'opaque', /does not accept occurrence_limit or occurrence_cursor/],
    ['study' as const, 0, undefined, /between 1 and 12/],
    ['study' as const, 13, undefined, /between 1 and 12/],
    ['technical' as const, 0, undefined, /between 1 and 25/],
    ['technical' as const, 26, undefined, /between 1 and 25/],
  ])('rejects direct %s occurrence budget bypass before token access', async (level, limit, cursor, message) => {
    const getUsageStats = vi.fn<IMorphologyRepository['getUsageStats']>();
    const getTokenOccurrences = vi.fn<IMorphologyRepository['getTokenOccurrences']>();
    const service = new StrongsService(strongsRepo, morphology({ getUsageStats, getTokenOccurrences }));
    await expect(service.getCorpusUsage('G25', level, limit, cursor)).rejects.toThrow(message);
    expect(getUsageStats).not.toHaveBeenCalled();
    expect(getTokenOccurrences).not.toHaveBeenCalled();
  });
});

describe('StrongsService v3 occurrence-only projection', () => {
  it('queries only totals and the bounded occurrence page', async () => {
    const getBookUsage = vi.fn<IMorphologyRepository['getBookUsage']>();
    const getFormUsage = vi.fn<IMorphologyRepository['getFormUsage']>();
    const getTokenOccurrences = vi.fn<IMorphologyRepository['getTokenOccurrences']>().mockReturnValue({
      occurrences: [{
        book: 'John', book_order: 43, chapter: 1, verse: 1, position: 5,
        word_text: 'λόγος', lemma: 'λόγος', strongs_number: 'G3056', morph_code: 'N-NSM', gloss: 'word',
      }],
    });
    const service = new StrongsService(strongsRepo, morphology({
      getUsageStats: () => ({ strongs_key: 'G3056', token_count: 330, verse_count: 300, book_count: 25, form_count: 8 }),
      getBookUsage, getFormUsage, getTokenOccurrences,
    }));
    const result = await service.getCorpusOccurrencePage('G3056', 20);
    expect(result).toMatchObject({
      publicStrongs: 'G3056', exactMorphologyKey: 'G3056', attested: true,
      occurrences: [{ sourceForm: 'λόγος', exactMorphologyKey: 'G3056' }],
    });
    expect(getTokenOccurrences).toHaveBeenCalledWith('G3056', undefined, 20);
    expect(getBookUsage).not.toHaveBeenCalled();
    expect(getFormUsage).not.toHaveBeenCalled();
  });

  it('rejects a forged continuation boundary before corpus reads', async () => {
    const boundary = { book_order: 43, chapter: 1, verse: 1, position: 5 };
    const innerCursor = encodeMorphologyUsageCursor('G3056', boundary);
    const binding: OriginalLanguageStudyV3CursorBinding = {
      requestReference: 'John 1:1', requestTarget: 'G3056', requestPosition: 5,
      depth: 'technical', operation: ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION,
      canonicalReference: 'John 1:1',
      selectedToken: {
        position: 5, text: 'Λόγος', lemma: 'λόγος', strongsNumber: 'G3056',
        morphologyCode: 'N-NSM', gloss: 'word',
      },
      publicStrongs: 'G3056', morphologyKey: 'G3056',
      semanticArtifactIdentity: null, semanticSourceIdentity: null,
      semanticNormalizedReference: null, corpusIdentity: MORPHOLOGY_USAGE_IDENTITY,
    };
    const outerCursor = createOriginalLanguageStudyV3Cursor(innerCursor, binding);
    const cursor = decodeOriginalLanguageStudyV3Cursor(outerCursor).repositoryCursor;
    const getUsageStats = vi.fn<IMorphologyRepository['getUsageStats']>();
    const getTokenOccurrences = vi.fn<IMorphologyRepository['getTokenOccurrences']>();
    const hasTokenOccurrenceBoundary = vi.fn<NonNullable<IMorphologyRepository['hasTokenOccurrenceBoundary']>>()
      .mockReturnValue(false);
    const service = new StrongsService(strongsRepo, morphology({
      getUsageStats, getTokenOccurrences, hasTokenOccurrenceBoundary,
    }));
    await expect(service.getCorpusOccurrencePage('G3056', 20, cursor)).rejects.toThrow(/genuine corpus page boundary/);
    expect(hasTokenOccurrenceBoundary).toHaveBeenCalledWith('G3056', boundary, 20);
    expect(getUsageStats).not.toHaveBeenCalled();
    expect(getTokenOccurrences).not.toHaveBeenCalled();
  });
});
