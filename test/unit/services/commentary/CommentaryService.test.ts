import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentaryService } from '../../../../src/services/commentary/CommentaryService.js';
import type { CommentaryAdapter } from '../../../../src/adapters/commentary/CommentaryAdapter.js';
import type { CommentaryAdapterResult } from '../../../../src/kernel/types.js';
import { APIError, NotFoundError, ValidationError } from '../../../../src/kernel/errors.js';

const exactJfb = (overrides: Partial<CommentaryAdapterResult> = {}): CommentaryAdapterResult => ({
  reference: 'John 3:16',
  commentator: 'Jamieson-Fausset-Brown',
  text: 'Commentary text here.',
  citation: { source: 'Jamieson-Fausset-Brown Commentary' },
  coverage: {
    requestedScope: 'verse', returnedGranularity: 'exact_verse',
    identityBasis: 'provider_verse_number',
    providerIdentity: { field: 'verseNumber', value: 16 },
  },
  ...overrides,
});

function makeAdapter(overrides: Partial<CommentaryAdapter> = {}): CommentaryAdapter {
  return {
    supportedCommentators: ['Matthew Henry', 'Jamieson-Fausset-Brown', 'John Gill'],
    getCommentary: vi.fn().mockResolvedValue(exactJfb()),
    supportsBook: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

describe('CommentaryService', () => {
  let adapter: CommentaryAdapter;
  let service: CommentaryService;

  beforeEach(() => {
    adapter = makeAdapter();
    service = new CommentaryService([adapter]);
  });

  describe('lookup', () => {
    it('routes exact commentary and retains provider-attested verse identity', async () => {
      const result = await service.lookup({ reference: 'John 3:16', commentator: 'Jamieson-Fausset-Brown' });
      expect(adapter.getCommentary).toHaveBeenCalled();
      expect(result).toMatchObject({
        resolvedReference: 'John 3:16', canonicalCommentator: 'Jamieson-Fausset-Brown',
        commentary: { commentator: 'Jamieson-Fausset-Brown' },
        coverage: {
          requestedScope: 'verse', returnedGranularity: 'exact_verse',
          identityBasis: 'provider_verse_number',
          providerIdentity: { field: 'verseNumber', value: 16 },
        },
        textWindow: {
          unit: 'unicode_code_points', returnedCharacters: 21, sourceCharacters: 21, truncated: false,
        },
      });
    });

    it('matches commentator case-insensitively', async () => {
      await service.lookup({ reference: 'John 3:16', commentator: 'jamieson-fausset-brown' });
      expect(adapter.getCommentary).toHaveBeenCalled();
    });

    it('defaults to Matthew Henry for a chapter request', async () => {
      vi.mocked(adapter.getCommentary).mockResolvedValue({
        reference: 'John 3', commentator: 'Matthew Henry', text: 'Chapter notes',
        citation: { source: 'Matthew Henry Commentary' },
        coverage: {
          requestedScope: 'chapter', returnedGranularity: 'chapter_aggregate',
          identityBasis: 'provider_chapter_payload',
          providerIdentity: { field: 'chapter_payload', chapter: 3 },
        },
      });
      const result = await service.lookup({ reference: 'John 3' });
      expect(adapter.getCommentary).toHaveBeenCalledWith(expect.anything(), 'Matthew Henry');
      expect(result.coverage.returnedGranularity).toBe('chapter_aggregate');
    });

    it('canonicalizes a semantically equal provider reference spelling', async () => {
      vi.mocked(adapter.getCommentary).mockResolvedValue(exactJfb({ reference: 'Jn 3.16' }));
      const result = await service.lookup({ reference: 'John 3:16', commentator: 'Jamieson-Fausset-Brown' });
      expect(result.commentary.reference).toBe('Jn 3.16');
      expect(result.resolvedReference).toBe('John 3:16');
    });

    it('rejects verse ranges before calling an adapter', async () => {
      await expect(service.lookup({ reference: 'John 3:16-17', commentator: 'John Gill' }))
        .rejects.toEqual(new ValidationError(
          'reference', 'Commentary verse ranges are not supported; request one verse or a full chapter.',
        ));
      expect(adapter.getCommentary).not.toHaveBeenCalled();
    });

    it('truncates commentary text by Unicode code point with truthful counts', async () => {
      const providerResult = exactJfb({ text: '𐐷'.repeat(500) });
      vi.mocked(adapter.getCommentary).mockResolvedValue(providerResult);
      const result = await service.lookup({ reference: 'John 3:16', commentator: 'Jamieson-Fausset-Brown', maxLength: 100 });
      expect(Array.from(result.commentary.text)).toHaveLength(100);
      expect(result.commentary.text.endsWith('…')).toBe(true);
      expect(result.textWindow).toEqual({
        unit: 'unicode_code_points', returnedCharacters: 100, sourceCharacters: 500, truncated: true,
      });
      expect(Array.from(providerResult.text)).toHaveLength(500);
    });

    it('keeps a one-character content budget truthful', async () => {
      const result = await service.lookup({ reference: 'John 3:16', commentator: 'Jamieson-Fausset-Brown', maxLength: 1 });
      expect(result.commentary.text).toBe('…');
      expect(result.textWindow.returnedCharacters).toBe(1);
    });

    it('does not truncate text below the budget', async () => {
      const result = await service.lookup({ reference: 'John 3:16', commentator: 'Jamieson-Fausset-Brown', maxLength: 1000 });
      expect(result.commentary.text).toBe('Commentary text here.');
      expect(result.textWindow.truncated).toBe(false);
    });

    it('throws NotFoundError for an unknown commentator', async () => {
      await expect(service.lookup({ reference: 'John 3:16', commentator: 'Unknown Author' }))
        .rejects.toThrow(NotFoundError);
    });

    it('rejects a provider result for a different reference before relabeling it', async () => {
      const providerResult = exactJfb({ reference: 'John 3:17' });
      vi.mocked(adapter.getCommentary).mockResolvedValue(providerResult);
      await expect(service.lookup({ reference: 'John 3:16', commentator: 'Jamieson-Fausset-Brown' }))
        .rejects.toEqual(new APIError(502, 'Commentary provider returned commentary for a different reference.'));
      expect(providerResult.text).toBe('Commentary text here.');
    });

    it('rejects a provider result for a different commentator', async () => {
      vi.mocked(adapter.getCommentary).mockResolvedValue(exactJfb({ commentator: 'John Gill' }));
      await expect(service.lookup({ reference: 'John 3:16', commentator: 'Jamieson-Fausset-Brown' }))
        .rejects.toEqual(new APIError(502, 'Commentary provider returned commentary for a different commentator.'));
    });

    it('rejects request-derived exact claims for chapter-only Matthew Henry', async () => {
      vi.mocked(adapter.getCommentary).mockResolvedValue({
        ...exactJfb(), commentator: 'Matthew Henry', citation: { source: 'Matthew Henry Commentary' },
      });
      await expect(service.lookup({ reference: 'John 3:16', commentator: 'Matthew Henry' }))
        .rejects.toEqual(new APIError(502, 'Commentary provider returned exact-verse coverage for a chapter-only work.'));
    });

    it('rejects a typed number as John Gill exact identity', async () => {
      vi.mocked(adapter.getCommentary).mockResolvedValue({
        ...exactJfb(), commentator: 'John Gill', citation: { source: 'John Gill Commentary' },
        coverage: {
          requestedScope: 'verse', returnedGranularity: 'exact_verse',
          identityBasis: 'provider_typed_verse_number',
          providerIdentity: { field: 'number', value: 16, entryType: 'verse' },
        },
      });
      await expect(service.lookup({ reference: 'John 3:16', commentator: 'John Gill' }))
        .rejects.toEqual(new APIError(502, 'Commentary provider returned untrusted numbered-entry evidence.'));
    });

    it('accepts John Gill exact identity only from verseNumber', async () => {
      vi.mocked(adapter.getCommentary).mockResolvedValue({
        ...exactJfb(), commentator: 'John Gill', citation: { source: 'John Gill Commentary' },
      });
      const result = await service.lookup({ reference: 'John 3:16', commentator: 'John Gill' });
      expect(result.coverage.identityBasis).toBe('provider_verse_number');
    });

    it('rejects an identity value for an adjacent verse', async () => {
      vi.mocked(adapter.getCommentary).mockResolvedValue(exactJfb({
        coverage: {
          requestedScope: 'verse', returnedGranularity: 'exact_verse',
          identityBasis: 'provider_verse_number',
          providerIdentity: { field: 'verseNumber', value: 17 },
        },
      }));
      await expect(service.lookup({ reference: 'John 3:16', commentator: 'Jamieson-Fausset-Brown' }))
        .rejects.toEqual(new APIError(502, 'Commentary provider returned invalid exact-verse coverage evidence.'));
    });

    it('rejects a mismatched chapter payload identity', async () => {
      vi.mocked(adapter.getCommentary).mockResolvedValue({
        reference: 'John 3', commentator: 'Matthew Henry', text: 'Chapter notes',
        citation: { source: 'Matthew Henry Commentary' },
        coverage: {
          requestedScope: 'chapter', returnedGranularity: 'chapter_aggregate',
          identityBasis: 'provider_chapter_payload',
          providerIdentity: { field: 'chapter_payload', chapter: 4 },
        },
      });
      await expect(service.lookup({ reference: 'John 3' }))
        .rejects.toEqual(new APIError(502, 'Commentary provider returned invalid chapter coverage evidence.'));
    });

    it('fails closed above the 2 MiB upstream safety ceiling', async () => {
      vi.mocked(adapter.getCommentary).mockResolvedValue(exactJfb({ text: 'x'.repeat(2 * 1024 * 1024 + 1) }));
      await expect(service.lookup({ reference: 'John 3:16', commentator: 'Jamieson-Fausset-Brown' }))
        .rejects.toEqual(new APIError(502, 'Commentary provider returned an oversized commentary payload.'));
    });
  });

  describe('getAvailableCommentators', () => {
    it('aggregates commentators from all adapters', () => {
      const adapter2 = makeAdapter({ supportedCommentators: ['Adam Clarke'] });
      const multi = new CommentaryService([adapter, adapter2]);
      expect(multi.getAvailableCommentators())
        .toEqual(expect.arrayContaining(['Matthew Henry', 'John Gill', 'Adam Clarke']));
    });
  });
});
