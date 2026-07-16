import { describe, expect, it, vi } from 'vitest';
import type { ICrossReferenceRepository } from '../../../../src/kernel/repositories.js';
import { UBS_PARALLEL_PASSAGE_PROVENANCE } from '../../../../src/kernel/ubsParallelSource.js';
import { ParallelPassageService } from '../../../../src/services/bible/ParallelPassageService.js';
import { BibleService } from '../../../../src/services/bible/BibleService.js';
import { formatReference } from '../../../../src/kernel/reference.js';
import { presentParallelPassagesStructured } from '../../../../src/presenters/parallelPassagesStructured.js';
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
    lookup: vi.fn().mockImplementation(async ({ maxGroups }: { maxGroups?: number }) => ({
      reference: 'Luke 6:35', groups: [group], requestedLimit: maxGroups ?? 5, additionalMatchObserved: false,
    })),
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
    expect(result.sourceAttestedResultWindow).toEqual({
      requestedLimit: 5, returnedGroupCount: 1, additionalMatchStatus: 'no_additional_match_observed',
    });
  });

  it('preserves legacy edge items only under the explicit legacy selector', async () => {
    const service = new ParallelPassageService(crossReferences(), undefined, undefined, legacyFixture(), sourceService() as any);
    const result = await service.lookup({ reference: 'Luke 6:35', corpora: ['theologai_legacy'], mode: 'thematic' });
    expect(result.sourceAttestedGroups).toEqual([]);
    expect(result.sourceAttestedResultWindow).toEqual({
      requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'not_evaluated',
    });
    expect(result.legacyParallels).toEqual([{
      reference: 'Matthew 5:44', relationship: 'thematic', confidence: 0.8, notes: 'legacy note',
      provenanceIds: ['theologai-legacy-parallels'],
    }]);
  });

  it('reports observed lookahead without returning or enriching it', async () => {
    const group = (ubsFixture() as any).groups[0];
    const source = {
      lookup: vi.fn().mockResolvedValue({
        reference: 'Luke 6:35', groups: [group], requestedLimit: 1, additionalMatchObserved: true,
      }),
      getProvenance: vi.fn().mockResolvedValue(UBS_PARALLEL_PASSAGE_PROVENANCE),
    };
    const lookup = vi.fn().mockImplementation(async ({ reference }) => ({
      reference, translation: 'WEB', text: reference, citation: { source: 'fixture' },
    }));
    const result = await new ParallelPassageService(
      crossReferences(), { lookup } as any, undefined, legacyFixture(), source as any,
    ).lookup({ reference: 'Luke 6:35', maxGroups: 1, includeText: true });
    expect(result.sourceAttestedGroups).toHaveLength(1);
    expect(result.sourceAttestedResultWindow).toEqual({
      requestedLimit: 1, returnedGroupCount: 1, additionalMatchStatus: 'additional_match_observed',
    });
    expect(lookup).toHaveBeenCalledTimes(3);
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
    expect(result.sourceAttestedGroups[0].members[0].excerpts?.map(excerpt => excerpt.reference)).toEqual([
      'Luke 6:27-28', 'Luke 6:35',
    ]);
    expect(result.sourceAttestedGroups[0].members.every(member => member.excerpts?.length)).toBeTruthy();
    expect(result.sourceAttestedGroups[0].members[0]).toMatchObject({ matched: true, alignmentBasis: 'UBSGNT5', alignmentRaw: '012345678' });
  });

  it('deduplicates text fetches across corpora and links distinct provider provenance', async () => {
    const lookup = vi.fn().mockImplementation(async ({ reference }) => ({
      reference,
      translation: 'WEB',
      text: `Text ${reference}`,
      citation: reference.startsWith('Matthew')
        ? { source: 'Provider B', copyright: 'Public Domain' }
        : reference === 'Luke 6:35'
          ? { source: 'Provider C', copyright: 'Licensed text C' }
          : { source: 'Provider A', copyright: 'Licensed text A' },
    }));
    const service = new ParallelPassageService(crossReferences(), { lookup } as any, undefined, legacyFixture(), sourceService() as any);
    const result = await service.lookup({
      reference: 'Luke 6:35', corpora: ['ubs_source_attested', 'theologai_legacy'], includeText: true,
    });

    expect(lookup).toHaveBeenCalledTimes(3);
    expect(lookup.mock.calls.map(([params]) => params.reference).sort()).toEqual([
      'Luke 6:27-28', 'Luke 6:35', 'Matthew 5:44',
    ]);
    expect(result.provenance.filter(record => record.kind === 'translation').map(record => record.label).sort())
      .toEqual(['Provider A', 'Provider B', 'Provider C']);
    expect(result.sourceAttestedGroups[0].members[0].provenanceIds).toHaveLength(3);
    const sharedReference = result.sourceAttestedGroups[0].members.find(member => member.normalizedReference === 'Matthew 5:44')!;
    expect(sharedReference.provenanceIds).toHaveLength(2);
    expect(result.legacyParallels[0].provenanceIds).toEqual(sharedReference.provenanceIds.map(id =>
      id === 'ubs-source-attested-parallels' ? 'theologai-legacy-parallels' : id));
  });

  it('keeps successful provider attribution when another unique text fetch fails', async () => {
    const lookup = vi.fn().mockImplementation(async ({ reference }) => {
      if (reference.startsWith('Luke')) throw new Error('unavailable');
      return { reference, translation: 'WEB', text: 'Available', citation: { source: 'Provider B', copyright: 'Public Domain' } };
    });
    const service = new ParallelPassageService(crossReferences(), { lookup } as any, undefined, legacyFixture(), sourceService() as any);
    const result = await service.lookup({ reference: 'Luke 6:35', includeText: true });
    expect(result.warnings).toEqual([
      'Text unavailable for Luke 6:27-28.',
      'Text unavailable for Luke 6:35.',
    ]);
    expect(result.sourceAttestedGroups[0].members[1].text).toBe('Matthew 5:44: Available');
    expect(result.sourceAttestedGroups[0].members[1].excerpts).toEqual([
      expect.objectContaining({ segmentOrder: 1, reference: 'Matthew 5:44', text: 'Available' }),
    ]);
    expect(result.provenance).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Provider B', kind: 'translation' })]));
  });

  it('uses the real BibleService canonical parser for every discontinuous member segment', async () => {
    const requested: string[] = [];
    const bible = new BibleService([{
      supportedTranslations: ['WEB'],
      isConfigured: () => true,
      getCopyright: () => 'Public Domain',
      getPassage: async (reference, translation) => {
        const formatted = formatReference(reference);
        requested.push(formatted);
        return { reference: formatted, translation, text: `Canonical ${formatted}`, citation: { source: 'Fixture WEB', copyright: 'Public Domain' } };
      },
    }]);
    const service = new ParallelPassageService(crossReferences(), bible, undefined, legacyFixture(), sourceService() as any);
    const result = await service.lookup({ reference: 'Luke 6:35', includeText: true, translation: 'WEB' });

    expect(requested).toEqual(['Luke 6:27-28', 'Luke 6:35', 'Matthew 5:44']);
    expect(requested).not.toContain('Luke 6:27-28,35');
    expect(result.sourceAttestedGroups[0].members[0].excerpts).toEqual([
      expect.objectContaining({ segmentOrder: 1, reference: 'Luke 6:27-28', text: 'Canonical Luke 6:27-28' }),
      expect.objectContaining({ segmentOrder: 2, reference: 'Luke 6:35', text: 'Canonical Luke 6:35' }),
    ]);
  });

  it('bounds all structured excerpts and member aggregates to 200 Unicode code points', async () => {
    const lookup = vi.fn().mockImplementation(async ({ reference }) => ({
      reference, translation: 'WEB', text: `😀${'x'.repeat(250)}`, citation: { source: 'Fixture' },
    }));
    const service = new ParallelPassageService(crossReferences(), { lookup } as any, undefined, legacyFixture(), sourceService() as any);
    const result = await service.lookup({
      reference: 'Luke 6:35', corpora: ['ubs_source_attested', 'theologai_legacy'], includeText: true,
    });
    for (const member of result.sourceAttestedGroups[0].members) {
      expect(Array.from(member.text ?? '')).toHaveLength(200);
      expect(member.text?.endsWith('…')).toBe(true);
      for (const excerpt of member.excerpts ?? []) expect(Array.from(excerpt.text)).toHaveLength(200);
    }
    expect(Array.from(result.legacyParallels[0].text ?? '')).toHaveLength(200);
    expect(result.legacyParallels[0].text?.endsWith('…')).toBe(true);
  });

  it('is byte-deterministic across inverted asynchronous provider completion and citation collisions', async () => {
    const run = async (delays: Record<string, number>) => {
      const lookup = vi.fn().mockImplementation(async ({ reference }) => {
        await new Promise(resolve => setTimeout(resolve, delays[reference] ?? 0));
        const shared = reference !== 'Luke 6:35';
        return {
          reference, translation: 'WEB', text: `Text ${reference}`,
          citation: shared
            ? { source: 'Shared Provider', copyright: 'Public Domain' }
            : { source: 'Second Provider', copyright: 'Licensed' },
        };
      });
      const service = new ParallelPassageService(crossReferences(), { lookup } as any, undefined, legacyFixture(), sourceService() as any);
      return presentParallelPassagesStructured(await service.lookup({
        reference: 'Luke 6:35', corpora: ['ubs_source_attested', 'theologai_legacy'], includeText: true,
      }));
    };
    const slowFirst = await run({ 'Luke 6:27-28': 25, 'Luke 6:35': 1, 'Matthew 5:44': 10 });
    const slowLast = await run({ 'Luke 6:27-28': 1, 'Luke 6:35': 20, 'Matthew 5:44': 30 });
    const immediateAsyncShape = await run({});

    expect(slowLast).toEqual(slowFirst);
    expect(JSON.stringify(slowLast)).toBe(JSON.stringify(slowFirst));
    expect(JSON.stringify(immediateAsyncShape)).toBe(JSON.stringify(slowFirst));
    expect(slowFirst.provenance.map(record => [record.id, record.label])).toEqual([
      ['ubs-source-attested-parallels', 'UBS Parallel Passage Database'],
      ['theologai-legacy-parallels', 'TheologAI legacy curated parallel passages'],
      ['translation-3', 'Shared Provider'],
      ['translation-4', 'Second Provider'],
    ]);
    expect((slowFirst.sourceAttestedGroups[0] as any).members[0].excerpts.map((excerpt: any) => excerpt.provenanceIds)).toEqual([
      ['translation-3'], ['translation-4'],
    ]);
    expect((slowFirst.legacyParallels[0] as any).provenanceIds).toEqual([
      'theologai-legacy-parallels', 'translation-3',
    ]);
    expect(slowFirst.provenance[1]).toMatchObject({
      status: 'verified_source',
      attribution: 'TheologAI contributors',
      version: 'db8d323ebca458ae3b8aaed4a747f925b0273770',
      locator: 'src/data/parallel-passages.json',
      license: { label: 'ISC', url: expect.stringContaining('/LICENSE') },
      rightsNotice: 'Copyright (c) 2026 TheologAI contributors',
    });
  });

  it('orders partial warnings canonically rather than by inverted failure completion', async () => {
    const run = async (delays: Record<string, number>) => {
      const lookup = vi.fn().mockImplementation(async ({ reference }) => {
        await new Promise(resolve => setTimeout(resolve, delays[reference] ?? 0));
        if (reference !== 'Luke 6:27-28') throw new Error('unavailable');
        return { reference, translation: 'WEB', text: 'Available', citation: { source: 'Provider' } };
      });
      const service = new ParallelPassageService(crossReferences(), { lookup } as any, undefined, legacyFixture(), sourceService() as any);
      return presentParallelPassagesStructured(await service.lookup({
        reference: 'Luke 6:35', corpora: ['ubs_source_attested', 'theologai_legacy'], includeText: true,
      }));
    };
    const first = await run({ 'Luke 6:27-28': 20, 'Luke 6:35': 15, 'Matthew 5:44': 1 });
    const second = await run({ 'Luke 6:27-28': 1, 'Luke 6:35': 2, 'Matthew 5:44': 20 });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.warnings).toEqual([
      'Text unavailable for Luke 6:35.',
      'Text unavailable for Matthew 5:44.',
    ]);
  });

  it('allows a materialized false alignment default with legacy-only selection', async () => {
    const service = new ParallelPassageService(crossReferences(), undefined, undefined, legacyFixture(), sourceService() as any);
    await expect(service.lookup({
      reference: 'Luke 6:35', corpora: ['theologai_legacy'], includeAlignment: false,
    })).resolves.toMatchObject({ corpora: ['theologai_legacy'] });
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
