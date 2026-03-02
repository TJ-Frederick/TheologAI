import { describe, it, expect, vi } from 'vitest';
import { CrossReferenceService } from '../../../../src/services/bible/CrossReferenceService.js';

// ── Mock repository ──

function makeMockRepo() {
  return {
    getCrossReferences: vi.fn().mockReturnValue({
      references: [{ reference: 'Romans 5:8', votes: 42 }],
      total: 1,
      showing: 1,
      hasMore: false,
    }),
    hasReferences: vi.fn().mockReturnValue(true),
    getChapterStatistics: vi.fn().mockReturnValue([
      { from_verse: 'John 3:16', ref_count: 5 },
    ]),
  };
}

describe('CrossReferenceService', () => {
  it('delegates getCrossReferences to repository', async () => {
    const repo = makeMockRepo();
    const service = new CrossReferenceService(repo as any);
    const result = await service.getCrossReferences('John 3:16');
    expect(repo.getCrossReferences).toHaveBeenCalledWith('John 3:16', undefined);
    expect(result.references).toHaveLength(1);
  });

  it('passes options through to repository', async () => {
    const repo = makeMockRepo();
    const service = new CrossReferenceService(repo as any);
    await service.getCrossReferences('John 3:16', { maxResults: 5, minVotes: 10 });
    expect(repo.getCrossReferences).toHaveBeenCalledWith('John 3:16', { maxResults: 5, minVotes: 10 });
  });

  it('delegates hasReferences to repository', async () => {
    const repo = makeMockRepo();
    const service = new CrossReferenceService(repo as any);
    const result = await service.hasReferences('John 3:16');
    expect(repo.hasReferences).toHaveBeenCalledWith('John 3:16');
    expect(result).toBe(true);
  });

  it('delegates getChapterStatistics to repository', async () => {
    const repo = makeMockRepo();
    const service = new CrossReferenceService(repo as any);
    const result = await service.getChapterStatistics('John 3');
    expect(repo.getChapterStatistics).toHaveBeenCalledWith('John 3');
    expect(result).toHaveLength(1);
  });
});
