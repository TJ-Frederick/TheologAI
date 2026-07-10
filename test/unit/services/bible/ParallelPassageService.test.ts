import { describe, expect, it, vi } from 'vitest';
import type { BibleService } from '../../../../src/services/bible/BibleService.js';
import type { ICrossReferenceRepository } from '../../../../src/kernel/repositories.js';
import { ParallelPassageService } from '../../../../src/services/bible/ParallelPassageService.js';

function repository(references: Array<{ reference: string; votes: number }> = []): ICrossReferenceRepository {
  return {
    getCrossReferences: vi.fn().mockResolvedValue({ references, total: references.length, showing: references.length, hasMore: false }),
    hasReferences: vi.fn().mockResolvedValue(references.length > 0),
    getChapterStatistics: vi.fn().mockResolvedValue({ totalVerses: 0, totalCrossRefs: 0, verseStats: [] }),
  };
}

function fixture() {
  return {
    description: 'fixture',
    version: '1',
    parallels: {
      'matthew_1_1': { event: 'synoptic', relationship: 'synoptic' as const, confidence: 95, parallels: ['luke_3_23-38', 'john_1_1'], notes: 'synoptic note', uniqueDetails: {} },
      'isaiah_53_5': { event: 'quotation', relationship: 'quotation' as const, confidence: 0.9, parallels: ['1peter_2_24'], notes: 'quotation note', uniqueDetails: {} },
      'genesis_1_1': { event: 'allusion', relationship: 'allusion' as const, confidence: 0.8, parallels: ['john_1_1'], notes: 'allusion note', uniqueDetails: {} },
    },
  };
}

describe('ParallelPassageService', () => {
  it('decodes the production slug corpus and normalizes percentage confidence', async () => {
    const service = new ParallelPassageService(repository());
    const result = await service.lookup({ reference: 'Matthew 3:13-17', mode: 'synoptic', useCrossReferences: false });

    expect(result.parallels.map(item => item.reference)).toEqual([
      'Mark 1:9-11',
      'Luke 3:21-22',
      'John 1:29-34',
    ]);
    expect(result.parallels.every(item => item.confidence === 0.95)).toBe(true);
  });

  it('reverse-indexes every group member and never returns the query as its own parallel', async () => {
    const service = new ParallelPassageService(repository());
    const result = await service.lookup({ reference: 'Mark 1:9-11', mode: 'synoptic', useCrossReferences: false });

    expect(result.parallels.map(item => item.reference)).toEqual([
      'Matthew 3:13-17',
      'Luke 3:21-22',
      'John 1:29-34',
    ]);
    expect(result.parallels.some(item => item.reference === 'Mark 1:9-11')).toBe(false);
  });

  it.each([
    ['Matthew 26:26', ['Mark 14:22-25', 'Luke 22:14-23', '1 Corinthians 11:23-26']],
    ['Mark 14:22', ['Matthew 26:26-29', 'Luke 22:14-23', '1 Corinthians 11:23-26']],
    ['Luke 22:19', ['Matthew 26:26-29', 'Mark 14:22-25', '1 Corinthians 11:23-26']],
  ] as const)('discovers the Last Supper group from canonical verse %s', async (reference, expected) => {
    const service = new ParallelPassageService(repository());
    const result = await service.lookup({ reference, mode: 'synoptic', useCrossReferences: false });

    expect(result.parallels.map(item => item.reference)).toEqual(expected);
    expect(result.parallels.every(item => item.relationship === 'synoptic')).toBe(true);
  });

  it('discovers a curated group from overlapping ranges without returning the matched member', async () => {
    const service = new ParallelPassageService(repository());
    const result = await service.lookup({
      reference: 'Matthew 26:27-30',
      mode: 'synoptic',
      useCrossReferences: false,
    });

    expect(result.parallels.map(item => item.reference)).toEqual([
      'Mark 14:22-25',
      'Luke 22:14-23',
      '1 Corinthians 11:23-26',
    ]);
    expect(result.parallels.some(item => item.reference.startsWith('Matthew 26:'))).toBe(false);
  });

  it('supports reverse lookup from every canonical Last Supper member', async () => {
    const service = new ParallelPassageService(repository());
    for (const reference of ['Matthew 26:26-29', 'Mark 14:22-25', 'Luke 22:14-23', '1 Corinthians 11:23-26']) {
      const result = await service.lookup({ reference, mode: 'synoptic', useCrossReferences: false });
      expect(result.parallels).toHaveLength(3);
      expect(result.parallels.some(item => item.reference === reference)).toBe(false);
    }
  });

  it('keeps explicit synoptic mode curated, bounded, and isolated from cross-references', async () => {
    const repo = repository([{ reference: 'Romans 1:20', votes: 100 }]);
    const service = new ParallelPassageService(repo);
    const result = await service.lookup({
      reference: 'Matthew 26:26',
      mode: 'synoptic',
      maxParallels: 1,
    });

    expect(result.parallels).toHaveLength(1);
    expect(result.parallels[0]).toMatchObject({ reference: 'Mark 14:22-25', relationship: 'synoptic' });
    expect(repo.getCrossReferences).not.toHaveBeenCalled();
  });

  it.each([
    ['synoptic', 'Matthew 1:1', ['Luke 3:23-38', 'John 1:1']],
    ['quotation', 'Isaiah 53:5', ['1 Peter 2:24']],
    ['thematic', 'Genesis 1:1', ['John 1:1', 'Romans 1:20']],
  ] as const)('implements %s mode', async (mode, reference, expected) => {
    const repo = repository([{ reference: 'Rom.1.20', votes: 60 }]);
    const service = new ParallelPassageService(repo, undefined, undefined, fixture());
    const result = await service.lookup({ reference, mode });
    expect(result.parallels.map(item => item.reference)).toEqual(expected);
    expect(repo.getCrossReferences).toHaveBeenCalledTimes(mode === 'thematic' ? 1 : 0);
  });

  it('discovers the Isaiah 7:14 quotation in both directions', async () => {
    const repo = repository([{ reference: 'Romans 1:20', votes: 100 }]);
    const service = new ParallelPassageService(repo);

    const fromIsaiah = await service.lookup({ reference: 'Isaiah 7:14', mode: 'quotation', maxParallels: 1 });
    expect(fromIsaiah.parallels).toEqual([expect.objectContaining({
      reference: 'Matthew 1:23',
      relationship: 'quotation',
      confidence: 0.95,
      notes: expect.stringContaining('Immanuel'),
    })]);

    const fromMatthew = await service.lookup({ reference: 'Matthew 1:23', mode: 'quotation', maxParallels: 1 });
    expect(fromMatthew.parallels).toEqual([expect.objectContaining({
      reference: 'Isaiah 7:14',
      relationship: 'quotation',
      confidence: 0.95,
    })]);
    expect(repo.getCrossReferences).not.toHaveBeenCalled();
  });

  it('auto mode merges canonicalized cross-references without duplicates', async () => {
    const repo = repository([
      { reference: 'Luke 3:23-38', votes: 100 },
      { reference: 'Rom.1.20', votes: 40 },
    ]);
    const service = new ParallelPassageService(repo, undefined, undefined, fixture());
    const result = await service.lookup({ reference: 'Matthew 1:1', mode: 'auto' });
    expect(result.parallels.map(item => item.reference)).toEqual(['Luke 3:23-38', 'John 1:1', 'Romans 1:20']);
  });

  it('loads parallel excerpts without an unused primary lookup, with bounded concurrency and partial warnings', async () => {
    let active = 0;
    let maximum = 0;
    const lookup = vi.fn<BibleService['lookup']>().mockImplementation(async params => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      if (params.reference === 'John 1:1') throw new Error('provider unavailable');
      return {
        reference: params.reference,
        translation: 'WEB',
        text: `Text for ${params.reference}`,
        citation: { source: 'fixture' },
      };
    });
    const service = new ParallelPassageService(repository(), { lookup }, undefined, fixture());

    const result = await service.lookup({ reference: 'Matthew 1:1', includeText: true, translation: 'WEB', useCrossReferences: false });

    expect(result.primary).toEqual({ reference: 'Matthew 1:1' });
    expect(result.parallels[0]).toMatchObject({ text: 'Text for Luke 3:23-38', translation: 'WEB' });
    expect(result.parallels[1]).not.toHaveProperty('text');
    expect(result.warnings).toContain('Text unavailable for John 1:1.');
    expect(maximum).toBeLessThanOrEqual(4);
    expect(lookup).not.toHaveBeenCalledWith({ reference: 'Matthew 1:1', translation: 'WEB' });
  });

  it('warns without failing when text support is unavailable', async () => {
    const service = new ParallelPassageService(repository(), undefined, undefined, fixture());
    const result = await service.lookup({ reference: 'Isaiah 53:5', includeText: true, useCrossReferences: false });
    expect(result.parallels).toHaveLength(1);
    expect(result.warnings).toEqual(['Passage text is unavailable in this runtime.']);
  });
});
