import { describe, expect, it, vi } from 'vitest';
import type { ISourceAttestedParallelRepository } from '../../../../src/kernel/sourceAttestedParallels.js';
import { UbsParallelPassageRepository } from '../../../../src/adapters/shared/UbsParallelPassageRepository.js';
import { SourceAttestedParallelService } from '../../../../src/services/bible/SourceAttestedParallelService.js';
import { encodeParallelGroupCursor } from '../../../../src/kernel/parallelGroupCursor.js';
import { parseSourceAttestedLookupReference } from '../../../../src/kernel/sourceAttestedReference.js';
import { ubsFixture } from '../../../fixtures/ubsParallelCorpus.js';

describe('SourceAttestedParallelService', () => {
  const fixtureRepository = (): UbsParallelPassageRepository => {
    const artifact = ubsFixture();
    return new UbsParallelPassageRepository(artifact, (artifact as { artifactIdentity: string }).artifactIdentity);
  };
  it('normalizes a reference and applies the bounded group default', async () => {
    const repository = fixtureRepository();
    const findGroups = vi.spyOn(repository, 'findGroups');
    const result = await new SourceAttestedParallelService(repository).lookup({ reference: 'lk 6:35' });
    expect(result.reference).toBe('Luke 6:35');
    expect(result.groups.map(group => group.sourceOrdinal)).toEqual([1, 2]);
    expect(result).toMatchObject({ requestedLimit: 5, additionalMatchObserved: false });
    expect(findGroups).toHaveBeenCalledWith('Luke 6:35', 5, 0);
  });

  it('carries the repository lookahead observation without exposing the lookahead group', async () => {
    const groups = fixtureRepository().findGroups('Luke 6:35', 2).groups;
    const repository: ISourceAttestedParallelRepository = {
      findGroups: vi.fn().mockResolvedValue({ groups: groups.slice(0, 1), additionalMatchObserved: true }),
      hasValidGroupCursorBoundary: vi.fn().mockResolvedValue(true),
      getProvenance: vi.fn(),
    };
    const result = await new SourceAttestedParallelService(repository).lookup({ reference: 'Luke 6:35', maxGroups: 1 });
    expect(result.groups).toHaveLength(1);
    expect(result).toMatchObject({ requestedLimit: 1, additionalMatchObserved: true });
    expect(result.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result).not.toHaveProperty('lookaheadGroup');
  });

  it('continues strictly after the prior source ordinal and emits no terminal cursor', async () => {
    const repository = fixtureRepository();
    const service = new SourceAttestedParallelService(repository);
    const first = await service.lookup({ reference: 'Luke 6:35', maxGroups: 1 });
    expect(first.groups.map(group => group.sourceOrdinal)).toEqual([1]);
    expect(first.nextCursor).toBeDefined();
    const second = await service.lookup({ reference: 'lk 6:35', maxGroups: 1, groupCursor: first.nextCursor });
    expect(second.groups.map(group => group.sourceOrdinal)).toEqual([2]);
    expect(second.additionalMatchObserved).toBe(false);
    expect(second).not.toHaveProperty('nextCursor');
  });

  it('paginates a chapter-only query with a cursor-safe finite upper bound', async () => {
    const repository = fixtureRepository();
    const service = new SourceAttestedParallelService(repository);
    const first = await service.lookup({ reference: 'Luke 6', maxGroups: 1 });
    expect(first.reference).toBe('Luke 6');
    expect(first.groups.map(group => group.sourceOrdinal)).toEqual([1]);
    expect(first.nextCursor).toBeDefined();

    const second = await service.lookup({ reference: 'Luke 6', maxGroups: 1, groupCursor: first.nextCursor });
    expect(second.groups.map(group => group.sourceOrdinal)).toEqual([2]);
    expect(second.additionalMatchObserved).toBe(false);
    expect(second).not.toHaveProperty('nextCursor');

    const parsed = parseSourceAttestedLookupReference('Luke 6');
    expect(parsed.segments).toEqual([{
      bookNumber: 42,
      chapter: 6,
      startVerse: 1,
      endVerse: Number.MAX_SAFE_INTEGER,
    }]);
  });

  it('rejects a cursor replayed against a different normalized ordered query', async () => {
    const service = new SourceAttestedParallelService(fixtureRepository());
    const first = await service.lookup({ reference: 'Luke 6:35', maxGroups: 1 });
    await expect(service.lookup({ reference: 'Matthew 5:44', maxGroups: 1, groupCursor: first.nextCursor }))
      .rejects.toThrow('different normalized passage query');
  });

  it('uses the current repository data to reject forged, stale, and false-terminal boundaries before lookup', async () => {
    const repository = fixtureRepository();
    const service = new SourceAttestedParallelService(repository);
    const segments = parseSourceAttestedLookupReference('Luke 6:35').segments;
    const forged = encodeParallelGroupCursor(segments, {
      pageSize: 1, afterSourceOrdinal: 99, cumulativeGroupCount: 99,
    });
    const findGroups = vi.spyOn(repository, 'findGroups');
    await expect(service.lookup({ reference: 'Luke 6:35', maxGroups: 1, groupCursor: forged }))
      .rejects.toThrow('valid page boundary');
    expect(findGroups).not.toHaveBeenCalled();
  });

  it('rejects false-terminal and mismatched cursors for a chapter-only query', async () => {
    const service = new SourceAttestedParallelService(fixtureRepository());
    const segments = parseSourceAttestedLookupReference('Luke 6').segments;
    const falseTerminal = encodeParallelGroupCursor(segments, {
      pageSize: 1, afterSourceOrdinal: 2, cumulativeGroupCount: 1,
    });
    await expect(service.lookup({ reference: 'Luke 6', maxGroups: 1, groupCursor: falseTerminal }))
      .rejects.toThrow('valid page boundary');

    const first = await service.lookup({ reference: 'Luke 6', maxGroups: 1 });
    await expect(service.lookup({ reference: 'Luke 6:35', maxGroups: 1, groupCursor: first.nextCursor }))
      .rejects.toThrow('different normalized passage query');
  });

  it('requires the continuation request to retain the page size encoded by the cursor', async () => {
    const service = new SourceAttestedParallelService(fixtureRepository());
    const first = await service.lookup({ reference: 'Luke 6:35', maxGroups: 1 });
    await expect(service.lookup({ reference: 'Luke 6:35', maxGroups: 2, groupCursor: first.nextCursor }))
      .rejects.toThrow('different maxGroups');
  });

  it('permits a deliberately synthesized but genuine terminal boundary without treating a false one as terminal', async () => {
    const service = new SourceAttestedParallelService(fixtureRepository());
    const segments = parseSourceAttestedLookupReference('Luke 6:35').segments;
    const genuineTerminal = encodeParallelGroupCursor(segments, {
      pageSize: 1, afterSourceOrdinal: 2, cumulativeGroupCount: 2,
    });
    await expect(service.lookup({ reference: 'Luke 6:35', maxGroups: 1, groupCursor: genuineTerminal }))
      .resolves.toMatchObject({ groups: [], additionalMatchObserved: false });
  });

  it.each([
    { ordinals: [] as number[], additional: true, label: 'lookahead without a full page' },
    { ordinals: [1, 2], additional: false, label: 'over-limit page' },
    { ordinals: [2, 1], additional: false, label: 'non-increasing page' },
  ])('fails closed on an invalid repository keyset window: $label', async ({ ordinals, additional }) => {
    const groups = fixtureRepository().findGroups('Luke 6:35').groups;
    const repository: ISourceAttestedParallelRepository = {
      findGroups: vi.fn().mockResolvedValue({
        groups: ordinals.map(ordinal => ({ ...groups[ordinal === 2 ? 1 : 0], sourceOrdinal: ordinal })),
        additionalMatchObserved: additional,
      }),
      hasValidGroupCursorBoundary: vi.fn().mockResolvedValue(true),
      getProvenance: vi.fn(),
    };
    await expect(new SourceAttestedParallelService(repository).lookup({ reference: 'Luke 6:35', maxGroups: 1 }))
      .rejects.toThrow('invalid keyset window');
  });

  it('passes an explicit limit without flattening or changing source evidence', async () => {
    const repository = fixtureRepository();
    const result = await new SourceAttestedParallelService(repository).lookup({ reference: 'Luke 6:35', maxGroups: 1 });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ label: 'source_attested_parallel', directionality: 'unspecified' });
    expect(result.groups[0].members.map(member => member.normalizedReference)).toEqual(['Luke 6:27-28,35', 'Matthew 5:44']);
    expect(result.groups[0]).not.toHaveProperty('confidence');
    expect(result.groups[0]).not.toHaveProperty('relationship');
  });

  it.each([0, 11, 1.5, Number.NaN])('rejects invalid maxGroups %s before repository lookup', async maxGroups => {
    const repository: ISourceAttestedParallelRepository = {
      findGroups: vi.fn(),
      hasValidGroupCursorBoundary: vi.fn().mockResolvedValue(true),
      getProvenance: vi.fn(),
    };
    await expect(new SourceAttestedParallelService(repository).lookup({ reference: 'John 1:1', maxGroups })).rejects.toThrow('1 to 10');
    expect(repository.findGroups).not.toHaveBeenCalled();
  });

  it('returns a typed validation error for an invalid reference', async () => {
    const repository: ISourceAttestedParallelRepository = {
      findGroups: vi.fn(),
      hasValidGroupCursorBoundary: vi.fn().mockResolvedValue(true),
      getProvenance: vi.fn(),
    };
    await expect(new SourceAttestedParallelService(repository).lookup({ reference: 'not a passage' })).rejects.toThrow('reference must identify');
    expect(repository.findGroups).not.toHaveBeenCalled();
  });

  it('rejects oversized and over-segmented references before repository lookup', async () => {
    const repository: ISourceAttestedParallelRepository = {
      findGroups: vi.fn(), hasValidGroupCursorBoundary: vi.fn().mockResolvedValue(true), getProvenance: vi.fn(),
    };
    const service = new SourceAttestedParallelService(repository);
    await expect(service.lookup({ reference: `John 1:1${',2'.repeat(60)}` })).rejects.toThrow('100 characters');
    await expect(service.lookup({ reference: 'John 1:1,2,3,4,5,6,7,8,9' })).rejects.toThrow('8 passage segments');
    expect(repository.findGroups).not.toHaveBeenCalled();
  });
});
