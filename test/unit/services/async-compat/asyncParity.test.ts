/**
 * Async/Sync Repository Parity Tests
 *
 * Proves the dual-target guarantee: services using `await this.repo.method()`
 * work identically whether the repo returns synchronously (better-sqlite3)
 * or asynchronously (D1). In JavaScript, `await syncValue === syncValue`.
 *
 * If anyone changes a service to skip `await`, these tests catch the regression.
 */

import { describe, it, expect, vi } from 'vitest';
import { CrossReferenceService } from '../../../../src/services/bible/CrossReferenceService.js';
import { StrongsService } from '../../../../src/services/languages/StrongsService.js';
import { MorphologyService } from '../../../../src/services/languages/MorphologyService.js';
import { HistoricalDocumentService } from '../../../../src/services/historical/HistoricalDocumentService.js';

// ── Shared test data ──

const crossRefResult = {
  references: [{ reference: 'Rom.5.8', votes: 42 }],
  total: 1,
  showing: 1,
  hasMore: false,
};

const strongsEntry = {
  strongs_number: 'G0025',
  testament: 'NT',
  lemma: 'ἀγαπάω',
  transliteration: 'agapaō',
  pronunciation: null,
  definition: 'to love',
  derivation: null,
};

const morphWords = [
  { position: 1, word_text: 'Ἐν', lemma: 'ἐν', strongs_number: 'G1722', morph_code: 'PREP', gloss: 'In' },
];

const documents = [
  { id: 'nicene-creed', title: 'Nicene Creed', type: 'creed', date: '325', topics: ['trinity'] },
];

describe('Async/Sync Repository Parity', () => {
  describe('CrossReferenceService', () => {
    it('works with sync repo (mockReturnValue — better-sqlite3 pattern)', async () => {
      const repo = {
        getCrossReferences: vi.fn().mockReturnValue(crossRefResult),
        hasReferences: vi.fn().mockReturnValue(true),
        getChapterStatistics: vi.fn().mockReturnValue([]),
      };
      const service = new CrossReferenceService(repo as any);
      const result = await service.getCrossReferences('John 3:16');
      expect(result.references).toHaveLength(1);
      expect(result.references[0].reference).toBe('Rom.5.8');
    });

    it('works with async repo (mockResolvedValue — D1 pattern)', async () => {
      const repo = {
        getCrossReferences: vi.fn().mockResolvedValue(crossRefResult),
        hasReferences: vi.fn().mockResolvedValue(true),
        getChapterStatistics: vi.fn().mockResolvedValue([]),
      };
      const service = new CrossReferenceService(repo as any);
      const result = await service.getCrossReferences('John 3:16');
      expect(result.references).toHaveLength(1);
      expect(result.references[0].reference).toBe('Rom.5.8');
    });
  });

  describe('StrongsService', () => {
    it('works with sync repo (mockReturnValue — better-sqlite3 pattern)', async () => {
      const repo = {
        lookup: vi.fn().mockReturnValue(strongsEntry),
        search: vi.fn().mockReturnValue([]),
        getLexiconEntry: vi.fn().mockReturnValue(undefined),
        getStats: vi.fn().mockReturnValue({ greek: 0, hebrew: 0, total: 0 }),
      };
      const service = new StrongsService(repo as any);
      const result = await service.lookup('G25');
      expect(result.strongs_number).toBe('G0025');
    });

    it('works with async repo (mockResolvedValue — D1 pattern)', async () => {
      const repo = {
        lookup: vi.fn().mockResolvedValue(strongsEntry),
        search: vi.fn().mockResolvedValue([]),
        getLexiconEntry: vi.fn().mockResolvedValue(undefined),
        getStats: vi.fn().mockResolvedValue({ greek: 0, hebrew: 0, total: 0 }),
      };
      const service = new StrongsService(repo as any);
      const result = await service.lookup('G25');
      expect(result.strongs_number).toBe('G0025');
    });
  });

  describe('MorphologyService', () => {
    it('works with sync repo (mockReturnValue — better-sqlite3 pattern)', async () => {
      const repo = {
        getVerseMorphology: vi.fn().mockReturnValue(morphWords),
        expandMorphCode: vi.fn().mockReturnValue('Preposition'),
        getAvailableBooks: vi.fn().mockReturnValue(['John']),
        hasVerse: vi.fn().mockReturnValue(true),
        getOccurrences: vi.fn().mockReturnValue([]),
        getDistribution: vi.fn().mockReturnValue([]),
      };
      const service = new MorphologyService(repo as any);
      const result = await service.getVerseMorphology('John 1:1');
      expect(result.words).toHaveLength(1);
      expect(result.words[0].text).toBe('Ἐν');
    });

    it('works with async repo (mockResolvedValue — D1 pattern)', async () => {
      const repo = {
        getVerseMorphology: vi.fn().mockResolvedValue(morphWords),
        expandMorphCode: vi.fn().mockResolvedValue('Preposition'),
        getAvailableBooks: vi.fn().mockResolvedValue(['John']),
        hasVerse: vi.fn().mockResolvedValue(true),
        getOccurrences: vi.fn().mockResolvedValue([]),
        getDistribution: vi.fn().mockResolvedValue([]),
      };
      const service = new MorphologyService(repo as any);
      const result = await service.getVerseMorphology('John 1:1');
      expect(result.words).toHaveLength(1);
      expect(result.words[0].text).toBe('Ἐν');
    });
  });

  describe('HistoricalDocumentService', () => {
    it('works with sync repo (mockReturnValue — better-sqlite3 pattern)', async () => {
      const repo = {
        listDocuments: vi.fn().mockReturnValue(documents),
        getDocument: vi.fn().mockReturnValue(documents[0]),
        getSections: vi.fn().mockReturnValue([]),
        getSection: vi.fn().mockReturnValue(undefined),
        search: vi.fn().mockReturnValue([]),
        findDocumentByName: vi.fn().mockReturnValue(documents[0]),
      };
      const service = new HistoricalDocumentService(repo as any);
      const result = await service.listDocuments();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('nicene-creed');
    });

    it('works with async repo (mockResolvedValue — D1 pattern)', async () => {
      const repo = {
        listDocuments: vi.fn().mockResolvedValue(documents),
        getDocument: vi.fn().mockResolvedValue(documents[0]),
        getSections: vi.fn().mockResolvedValue([]),
        getSection: vi.fn().mockResolvedValue(undefined),
        search: vi.fn().mockResolvedValue([]),
        findDocumentByName: vi.fn().mockResolvedValue(documents[0]),
      };
      const service = new HistoricalDocumentService(repo as any);
      const result = await service.listDocuments();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('nicene-creed');
    });
  });
});
