import { describe, expect, it, vi } from 'vitest';
import type { ISourceAttestedParallelRepository } from '../../../../src/kernel/sourceAttestedParallels.js';
import { UbsParallelPassageRepository } from '../../../../src/adapters/shared/UbsParallelPassageRepository.js';
import { SourceAttestedParallelService } from '../../../../src/services/bible/SourceAttestedParallelService.js';
import { ubsFixture } from '../../../fixtures/ubsParallelCorpus.js';

describe('SourceAttestedParallelService', () => {
  it('normalizes a reference and applies the bounded group default', () => {
    const repository = new UbsParallelPassageRepository(ubsFixture());
    const findGroups = vi.spyOn(repository, 'findGroups');
    const result = new SourceAttestedParallelService(repository).lookup({ reference: 'lk 6:35' });
    expect(result.reference).toBe('Luke 6:35');
    expect(result.groups.map(group => group.sourceOrdinal)).toEqual([1, 2]);
    expect(findGroups).toHaveBeenCalledWith('Luke 6:35', 5);
  });

  it('passes an explicit limit without flattening or changing source evidence', () => {
    const repository = new UbsParallelPassageRepository(ubsFixture());
    const result = new SourceAttestedParallelService(repository).lookup({ reference: 'Luke 6:35', maxGroups: 1 });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ label: 'source_attested_parallel', directionality: 'unspecified' });
    expect(result.groups[0].members.map(member => member.normalizedReference)).toEqual(['Luke 6:27-28,35', 'Matthew 5:44']);
    expect(result.groups[0]).not.toHaveProperty('confidence');
    expect(result.groups[0]).not.toHaveProperty('relationship');
  });

  it.each([0, 11, 1.5, Number.NaN])('rejects invalid maxGroups %s before repository lookup', maxGroups => {
    const repository: ISourceAttestedParallelRepository = {
      findGroups: vi.fn(),
      getProvenance: vi.fn(),
    };
    expect(() => new SourceAttestedParallelService(repository).lookup({ reference: 'John 1:1', maxGroups })).toThrow('1 to 10');
    expect(repository.findGroups).not.toHaveBeenCalled();
  });

  it('returns a typed validation error for an invalid reference', () => {
    const repository: ISourceAttestedParallelRepository = {
      findGroups: vi.fn(),
      getProvenance: vi.fn(),
    };
    expect(() => new SourceAttestedParallelService(repository).lookup({ reference: 'not a passage' })).toThrow('reference must identify');
    expect(repository.findGroups).not.toHaveBeenCalled();
  });
});
