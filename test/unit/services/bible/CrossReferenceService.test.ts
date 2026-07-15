import { describe, it, expect, vi } from 'vitest';
import { CrossReferenceService } from '../../../../src/services/bible/CrossReferenceService.js';
import { AdapterIntegrityError } from '../../../../src/kernel/errors.js';

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
    expect(result.resolvedReference).toBe('John 3:16');
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

  it.each([
    ['unknown book', 'NotABook 1:1', 'Unknown Bible book'],
    ['out-of-range chapter', 'John 99:1', 'Chapter 99 is out of range'],
    ['out-of-range verse', 'John 3:99', 'Verse 99 is out of range'],
    ['chapter', 'John 3', 'requires exactly one Bible verse'],
    ['range', 'John 3:16-17', 'requires exactly one Bible verse'],
  ])('rejects %s input before querying the repository', async (_case, reference, message) => {
    const repo = makeMockRepo();
    const service = new CrossReferenceService(repo as any);

    await expect(service.getCrossReferences(reference)).rejects.toThrow(message);
    expect(repo.getCrossReferences).not.toHaveBeenCalled();
  });

  it('canonicalizes accepted aliases before repository lookup', async () => {
    const repo = makeMockRepo();
    const service = new CrossReferenceService(repo as any);

    const result = await service.getCrossReferences('Jn 3.16');

    expect(repo.getCrossReferences).toHaveBeenCalledWith('John 3:16', undefined);
    expect(result.resolvedReference).toBe('John 3:16');
  });

  it('does not allow a structurally wider repository result to replace resolvedReference', async () => {
    const repo = makeMockRepo();
    repo.getCrossReferences.mockReturnValue({
      ...repo.getCrossReferences(),
      resolvedReference: 'Genesis 1:1',
    });
    const service = new CrossReferenceService(repo as any);

    const result = await service.getCrossReferences('Jn 3.16');

    expect(result.resolvedReference).toBe('John 3:16');
    expect(Object.keys(result)).toEqual([
      'references', 'total', 'showing', 'hasMore', 'resolvedReference',
    ]);
  });

  it('accepts deterministic vote-descending, source-key-ascending repository order', async () => {
    const repo = makeMockRepo();
    repo.getCrossReferences.mockReturnValue({
      references: [
        { reference: 'Psalms 22:1', votes: 40 },
        { reference: '1 John 4:9', votes: 30 },
        { reference: 'Romans 5:8', votes: 30 },
      ],
      total: 3,
      showing: 3,
      hasMore: false,
    });
    const service = new CrossReferenceService(repo as any);

    await expect(service.getCrossReferences('John 3:16')).resolves.toMatchObject({
      references: [
        { reference: 'Psalms 22:1', votes: 40 },
        { reference: '1 John 4:9', votes: 30 },
        { reference: 'Romans 5:8', votes: 30 },
      ],
    });
  });

  it.each([
    ['an alias instead of a canonical reference', {
      references: [{ reference: 'Rom.5.8', votes: 42 }], total: 1, showing: 1, hasMore: false,
    }],
    ['a chapter instead of a scalar reference', {
      references: [{ reference: 'Romans 5', votes: 42 }], total: 1, showing: 1, hasMore: false,
    }],
    ['a negative vote total', {
      references: [{ reference: 'Romans 5:8', votes: -1 }], total: 1, showing: 1, hasMore: false,
    }],
    ['a fractional vote total', {
      references: [{ reference: 'Romans 5:8', votes: 1.5 }], total: 1, showing: 1, hasMore: false,
    }],
    ['a row below the requested threshold', {
      references: [{ reference: 'Romans 5:8', votes: 9 }], total: 1, showing: 1, hasMore: false,
    }],
    ['ascending vote order', {
      references: [
        { reference: 'Romans 5:8', votes: 20 },
        { reference: '1 John 4:9', votes: 30 },
      ], total: 2, showing: 2, hasMore: false,
    }],
    ['reverse source-key tie order', {
      references: [
        { reference: 'Romans 5:8', votes: 30 },
        { reference: '1 John 4:9', votes: 30 },
      ], total: 2, showing: 2, hasMore: false,
    }],
    ['duplicate source keys in one ranking', {
      references: [
        { reference: 'Romans 5:8', votes: 30 },
        { reference: 'Romans 5:8', votes: 30 },
      ], total: 2, showing: 2, hasMore: false,
    }],
  ])('rejects repository integrity failure: %s', async (_case, repositoryResult) => {
    const repo = makeMockRepo();
    repo.getCrossReferences.mockReturnValue(repositoryResult);
    const service = new CrossReferenceService(repo as any);

    await expect(service.getCrossReferences(
      'John 3:16',
      _case === 'a row below the requested threshold' ? { minVotes: 10 } : undefined,
    )).rejects.toBeInstanceOf(AdapterIntegrityError);
  });

  it.each([
    ['showing does not equal the returned row count', {
      references: [{ reference: 'Romans 5:8', votes: 42 }], total: 1, showing: 0, hasMore: false,
    }],
    ['total is smaller than showing', {
      references: [{ reference: 'Romans 5:8', votes: 42 }], total: 0, showing: 1, hasMore: false,
    }],
    ['hasMore disagrees with the result window', {
      references: [{ reference: 'Romans 5:8', votes: 42 }], total: 2, showing: 1, hasMore: false,
    }],
    ['a non-integer total', {
      references: [], total: 0.5, showing: 0, hasMore: false,
    }],
    ['a truncated window smaller than its requested limit', {
      references: [{ reference: 'Romans 5:8', votes: 42 }], total: 2, showing: 1, hasMore: true,
    }],
  ])('rejects inconsistent repository window metadata: %s', async (_case, repositoryResult) => {
    const repo = makeMockRepo();
    repo.getCrossReferences.mockReturnValue(repositoryResult);
    const service = new CrossReferenceService(repo as any);

    await expect(service.getCrossReferences('John 3:16')).rejects.toBeInstanceOf(AdapterIntegrityError);
  });

  it('delegates getChapterStatistics to repository', async () => {
    const repo = makeMockRepo();
    const service = new CrossReferenceService(repo as any);
    const result = await service.getChapterStatistics('John 3');
    expect(repo.getChapterStatistics).toHaveBeenCalledWith('John 3');
    expect(result).toHaveLength(1);
  });
});
