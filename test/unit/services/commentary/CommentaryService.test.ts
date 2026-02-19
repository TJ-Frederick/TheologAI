import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommentaryService } from '../../../../src/services/commentary/CommentaryService.js';
import type { CommentaryAdapter } from '../../../../src/adapters/commentary/CommentaryAdapter.js';
import type { CommentaryResult } from '../../../../src/kernel/types.js';
import { NotFoundError } from '../../../../src/kernel/errors.js';

// ── Mock adapter factory ──

function makeAdapter(overrides: Partial<CommentaryAdapter> = {}): CommentaryAdapter {
  return {
    supportedCommentators: ['Matthew Henry', 'John Gill'],
    getCommentary: vi.fn().mockResolvedValue({
      reference: 'John 3:16',
      commentator: 'Matthew Henry',
      text: 'Commentary text here.',
      citation: { source: 'HelloAO Commentary API' },
    } satisfies CommentaryResult),
    supportsBook: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

describe('CommentaryService', () => {
  let henryAdapter: CommentaryAdapter;
  let service: CommentaryService;

  beforeEach(() => {
    henryAdapter = makeAdapter();
    service = new CommentaryService([henryAdapter]);
  });

  describe('lookup', () => {
    it('routes to adapter that supports the commentator', async () => {
      const result = await service.lookup({ reference: 'John 3:16', commentator: 'Matthew Henry' });
      expect(henryAdapter.getCommentary).toHaveBeenCalled();
      expect(result.commentator).toBe('Matthew Henry');
    });

    it('matches commentator case-insensitively', async () => {
      await service.lookup({ reference: 'John 3:16', commentator: 'matthew henry' });
      expect(henryAdapter.getCommentary).toHaveBeenCalled();
    });

    it('defaults to "Matthew Henry" when commentator not specified', async () => {
      await service.lookup({ reference: 'John 3:16' });
      expect(henryAdapter.getCommentary).toHaveBeenCalled();
    });

    it('truncates text at maxLength with ellipsis', async () => {
      (henryAdapter.getCommentary as ReturnType<typeof vi.fn>).mockResolvedValue({
        reference: 'John 3:16',
        commentator: 'Matthew Henry',
        text: 'x'.repeat(500),
        citation: { source: 'Test' },
      });
      const result = await service.lookup({ reference: 'John 3:16', maxLength: 100 });
      expect(result.text).toHaveLength(103); // 100 + '...'
      expect(result.text.endsWith('...')).toBe(true);
    });

    it('does not truncate when text is shorter than maxLength', async () => {
      const result = await service.lookup({ reference: 'John 3:16', maxLength: 1000 });
      expect(result.text).toBe('Commentary text here.');
    });

    it('throws NotFoundError for unknown commentator', async () => {
      await expect(
        service.lookup({ reference: 'John 3:16', commentator: 'Unknown Author' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getAvailableCommentators', () => {
    it('aggregates commentators from all adapters', () => {
      const adapter2 = makeAdapter({ supportedCommentators: ['Adam Clarke'] });
      const multi = new CommentaryService([henryAdapter, adapter2]);
      const commentators = multi.getAvailableCommentators();
      expect(commentators).toEqual(expect.arrayContaining(['Matthew Henry', 'John Gill', 'Adam Clarke']));
    });
  });
});
