import { describe, expect, it, vi } from 'vitest';
import type { ICrossReferenceRepository } from '../../../../src/kernel/repositories.js';
import { UBS_PARALLEL_PASSAGE_PROVENANCE } from '../../../../src/kernel/ubsParallelSource.js';
import { ParallelPassageService } from '../../../../src/services/bible/ParallelPassageService.js';
import { ubsFixture } from '../../../fixtures/ubsParallelCorpus.js';

function crossReferences(references: Array<{ reference: string; votes: number }> = []): ICrossReferenceRepository {
  return {
    getCrossReferences: vi.fn().mockResolvedValue({ references, total: references.length, showing: references.length, hasMore: false }),
    hasReferences: vi.fn(), getChapterStatistics: vi.fn(),
  } as ICrossReferenceRepository;
}

function sourceService() {
  const group = (ubsFixture() as any).groups[0];
  return {
    lookup: vi.fn().mockResolvedValue({ reference: 'Luke 6:35', groups: [group] }),
    getProvenance: vi.fn().mockResolvedValue(UBS_PARALLEL_PASSAGE_PROVENANCE),
  };
}

function legacyFixture() {
  return {
    description: 'fixture', version: '1', parallels: {
      'luke_6_35': { event: 'legacy', relationship: 'thematic' as const, confidence: 0.8, parallels: ['matthew_5_44'], notes: 'legacy note', uniqueDetails: {} },
    },
  };
}

describe('ParallelPassageService hard-cutover contract', () => {
  it('defaults only to complete UBS groups with alignment omitted', async () => {
    const source = sourceService();
    const service = new ParallelPassageService(crossReferences(), undefined, undefined, legacyFixture(), source as any);
    const result = await service.lookup({ reference: 'Luke 6:35' });

    expect(result.corpora).toEqual(['ubs_source_attested']);
    expect(result.sourceAttestedGroups).toHaveLength(1);
    expect(result.legacyParallels).toEqual([]);
    expect(result.openBibleCrossReferences).toEqual([]);
    expect(result.sourceAttestedGroups[0].members.map(member => member.matched)).toEqual([true, false]);
    expect(result.sourceAttestedGroups[0].members[0]).not.toHaveProperty('alignmentRaw');
  });

  it('preserves legacy edge items only under the explicit legacy selector', async () => {
    const service = new ParallelPassageService(crossReferences(), undefined, undefined, legacyFixture(), sourceService() as any);
    const result = await service.lookup({ reference: 'Luke 6:35', corpora: ['theologai_legacy'], mode: 'thematic' });
    expect(result.sourceAttestedGroups).toEqual([]);
    expect(result.legacyParallels).toEqual([{
      reference: 'Matthew 5:44', relationship: 'thematic', confidence: 0.8, notes: 'legacy note',
    }]);
  });

  it('keeps OpenBible separate and off unless explicitly requested', async () => {
    const repo = crossReferences([{ reference: 'Rom.1.20', votes: 42 }]);
    const service = new ParallelPassageService(repo, undefined, undefined, legacyFixture(), sourceService() as any);
    const result = await service.lookup({ reference: 'Luke 6:35', includeOpenBibleCrossReferences: true });
    expect(result.openBibleCrossReferences).toEqual([{ reference: 'Romans 1:20', votes: 42 }]);
    expect(result.legacyParallels).toEqual([]);
  });

  it('enriches every UBS member while retaining the matched member in structured data', async () => {
    const lookup = vi.fn().mockImplementation(async ({ reference }) => ({ reference, translation: 'WEB', text: `Text ${reference}`, citation: { source: 'fixture' } }));
    const service = new ParallelPassageService(crossReferences(), { lookup } as any, undefined, legacyFixture(), sourceService() as any);
    const result = await service.lookup({ reference: 'Luke 6:35', includeText: true, translation: 'WEB', includeAlignment: true });
    expect(result.sourceAttestedGroups[0].members.every(member => member.text?.startsWith('Text '))).toBe(true);
    expect(result.sourceAttestedGroups[0].members[0]).toMatchObject({ matched: true, alignmentBasis: 'UBSGNT5', alignmentRaw: '012345678' });
  });

  it.each([
    [{ mode: 'auto' }, "corpora: ['theologai_legacy']"],
    [{ maxParallels: 3 }, "corpora: ['theologai_legacy']"],
    [{ corpora: ['theologai_legacy'], includeAlignment: true }, 'includeAlignment requires'],
    [{ includeOpenBibleCrossReferences: true, useCrossReferences: false }, 'conflicts'],
  ] as const)('rejects invalid source-specific controls %#', async (params, message) => {
    const service = new ParallelPassageService(crossReferences(), undefined, undefined, legacyFixture(), sourceService() as any);
    await expect(service.lookup({ reference: 'Luke 6:35', ...params } as any)).rejects.toThrow(message);
  });
});
