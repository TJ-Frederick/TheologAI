import { describe, expect, it, vi } from 'vitest';
import type { ICrossReferenceRepository } from '../../../../src/kernel/repositories.js';
import { UBS_PARALLEL_PASSAGE_PROVENANCE } from '../../../../src/kernel/ubsParallelSource.js';
import { ParallelPassageService } from '../../../../src/services/bible/ParallelPassageService.js';
import { presentParallelPassagesStructured } from '../../../../src/presenters/parallelPassagesStructured.js';
import { loadUbsParallelPassageRepository } from '../../../../src/adapters/data/loadUbsParallelPassages.js';
import { SourceAttestedParallelService } from '../../../../src/services/bible/SourceAttestedParallelService.js';

function crossReferences(): ICrossReferenceRepository {
  return {
    getCrossReferences: vi.fn().mockResolvedValue({ references: [], total: 0, showing: 0, hasMore: false }),
    hasReferences: vi.fn(), getChapterStatistics: vi.fn(),
  } as ICrossReferenceRepository;
}

function sourceService(memberCount = 13) {
  const group = {
    groupId: 'ubs-budget-fixture', sourceOrdinal: 1,
    label: 'source_attested_parallel' as const, directionality: 'unspecified' as const,
    members: Array.from({ length: memberCount }, (_, index) => {
      const verse = index + 1;
      return {
        sourceOrder: verse,
        sourceReference: `MAT 1:${verse}`,
        normalizedReference: `Matthew 1:${verse}`,
        segments: [{ bookNumber: 40, chapter: 1, startVerse: verse, endVerse: verse }],
        languageMarker: 'GRK' as const,
        alignmentBasis: 'UBSGNT5' as const,
        alignmentRaw: `${verse}`,
      };
    }),
    provenance: UBS_PARALLEL_PASSAGE_PROVENANCE,
  };
  return {
    lookup: vi.fn().mockResolvedValue({
      reference: 'Matthew 1:1', groups: [group], requestedLimit: 5, additionalMatchObserved: false,
    }),
    getProvenance: vi.fn().mockResolvedValue(UBS_PARALLEL_PASSAGE_PROVENANCE),
  };
}

function legacyFixture() {
  return {
    description: 'fixture', version: '1', parallels: {
      'matthew_1_1': {
        event: 'budget', relationship: 'thematic' as const, confidence: 0.8,
        parallels: ['matthew_1_12', 'mark_1_1'], notes: 'fixture', uniqueDetails: {},
      },
    },
  };
}

function successfulLookup(delays: Record<string, number> = {}) {
  return vi.fn().mockImplementation(async ({ reference, translation }) => {
    const delay = delays[reference] ?? 0;
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    return {
      reference, translation, text: `Text ${reference}`,
      citation: { source: 'Fixture Provider', copyright: 'Public Domain' },
    };
  });
}

function service(lookup: ReturnType<typeof vi.fn>) {
  return new ParallelPassageService(
    crossReferences(), { lookup } as any, undefined, legacyFixture(), sourceService() as any,
  );
}

describe('ParallelPassageService fixed text-enrichment budget', () => {
  it('keeps the executable preview sentinel above the real 12-target corpus boundary', async () => {
    const source = new SourceAttestedParallelService(loadUbsParallelPassageRepository());
    const lookup = successfulLookup();
    const result = await new ParallelPassageService(
      crossReferences(), { lookup } as any, undefined, undefined, source,
    ).lookup({ reference: 'Mark 10:19', maxGroups: 10, includeText: true, translation: 'WEB' });

    expect(result.sourceAttestedGroups).toHaveLength(7);
    expect(result.textEnrichment).toMatchObject({
      scheduledLookupCount: 12, succeededLookupCount: 12, failedLookupCount: 0,
      completionStatus: 'incomplete',
    });
    expect(result.textEnrichment.uniqueTargetCount).toBeGreaterThan(12);
    expect(result.textEnrichment.omittedLookupCount)
      .toBe(result.textEnrichment.uniqueTargetCount - 12);
    expect(lookup).toHaveBeenCalledTimes(12);
    expect(result.sourceAttestedGroups.flatMap(group => group.members)).toEqual(
      expect.arrayContaining([expect.objectContaining({ textEnrichmentStatus: 'budget_omitted' })]),
    );
  });

  it('reports all deduplicated targets without scheduling work when text is not requested', async () => {
    const lookup = successfulLookup();
    const result = await service(lookup).lookup({
      reference: 'Matthew 1:1', corpora: ['ubs_source_attested', 'theologai_legacy'], includeText: false,
    });

    expect(lookup).not.toHaveBeenCalled();
    expect(result.textEnrichment).toEqual({
      requested: false, translation: null,
      budget: { unit: 'unique_canonical_passage_lookups', maximum: 12 },
      uniqueTargetCount: 14, scheduledLookupCount: 0, succeededLookupCount: 0,
      failedLookupCount: 0, omittedLookupCount: 0, completionStatus: 'not_requested',
    });
    expect(result.sourceAttestedGroups[0].members.every(member => member.textEnrichmentStatus === 'not_requested')).toBe(true);
    expect(result.legacyParallels.every(item => item.textEnrichmentStatus === 'not_requested')).toBe(true);
  });

  it('spends exactly 12 slots in UBS order, deduplicates across corpora, and never refunds a fast cache-like hit', async () => {
    const lookup = successfulLookup();
    const result = await service(lookup).lookup({
      reference: 'Matthew 1:1', corpora: ['ubs_source_attested', 'theologai_legacy'],
      includeText: true, translation: 'WEB',
    });

    expect(lookup).toHaveBeenCalledTimes(12);
    expect(lookup.mock.calls.map(([params]) => params.reference)).toEqual(
      Array.from({ length: 12 }, (_, index) => `Matthew 1:${index + 1}`),
    );
    expect(result.textEnrichment).toEqual({
      requested: true, translation: 'WEB',
      budget: { unit: 'unique_canonical_passage_lookups', maximum: 12 },
      uniqueTargetCount: 14, scheduledLookupCount: 12, succeededLookupCount: 12,
      failedLookupCount: 0, omittedLookupCount: 2, completionStatus: 'incomplete',
    });
    expect(result.sourceAttestedGroups[0].members.at(11)?.textEnrichmentStatus).toBe('complete');
    expect(result.sourceAttestedGroups[0].members.at(12)?.textEnrichmentStatus).toBe('budget_omitted');
    expect(result.legacyParallels.map(item => [item.reference, item.textEnrichmentStatus])).toEqual([
      ['Matthew 1:12', 'complete'],
      ['Mark 1:1', 'budget_omitted'],
    ]);
    expect(result.warnings).toEqual([
      'Text enrichment omitted 2 of 14 unique passage lookups because the per-request budget is 12.',
    ]);
  });

  it('does not backfill after failures and bounds deterministic failure examples', async () => {
    const lookup = vi.fn().mockImplementation(async ({ reference }) => {
      throw new Error(`Unavailable ${reference}`);
    });
    const result = await service(lookup).lookup({
      reference: 'Matthew 1:1', corpora: ['ubs_source_attested', 'theologai_legacy'], includeText: true,
    });

    expect(lookup).toHaveBeenCalledTimes(12);
    expect(lookup.mock.calls.map(([params]) => params.reference)).not.toContain('Matthew 1:13');
    expect(lookup.mock.calls.map(([params]) => params.reference)).not.toContain('Mark 1:1');
    expect(result.textEnrichment).toMatchObject({
      uniqueTargetCount: 14, scheduledLookupCount: 12, succeededLookupCount: 0,
      failedLookupCount: 12, omittedLookupCount: 2, completionStatus: 'incomplete',
    });
    expect(result.sourceAttestedGroups[0].members.at(0)?.textEnrichmentStatus).toBe('unavailable');
    expect(result.sourceAttestedGroups[0].members.at(12)?.textEnrichmentStatus).toBe('budget_omitted');
    expect(result.warnings).toEqual([
      'Text enrichment omitted 2 of 14 unique passage lookups because the per-request budget is 12.',
      'Text enrichment failed for 12 scheduled lookups: Matthew 1:1; Matthew 1:2; Matthew 1:3; and 9 more.',
    ]);
  });

  it('never exceeds concurrency four', async () => {
    let active = 0;
    let maximumActive = 0;
    const lookup = vi.fn().mockImplementation(async ({ reference, translation }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return { reference, translation, text: reference, citation: { source: 'Fixture' } };
    });
    const result = await service(lookup).lookup({
      reference: 'Matthew 1:1', corpora: ['ubs_source_attested', 'theologai_legacy'], includeText: true,
    });

    expect(maximumActive).toBe(4);
    expect(result.textEnrichment.scheduledLookupCount).toBe(12);
  });

  it('is byte-deterministic when provider completion order reverses', async () => {
    const run = async (reverse: boolean) => {
      const delays = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
        `Matthew 1:${index + 1}`,
        reverse ? index : 11 - index,
      ]));
      return presentParallelPassagesStructured(await service(successfulLookup(delays)).lookup({
        reference: 'Matthew 1:1', corpora: ['ubs_source_attested', 'theologai_legacy'],
        includeText: true, translation: 'WEB',
      }));
    };

    expect(JSON.stringify(await run(true))).toBe(JSON.stringify(await run(false)));
  });

  it('derives partial status and emits excerpts only for successful member segments', async () => {
    const source = sourceService(2);
    const firstMember = (await source.lookup()).groups[0].members[0];
    firstMember.sourceReference = 'MAT 1:1-2';
    firstMember.normalizedReference = 'Matthew 1:1-2';
    firstMember.segments = [
      { bookNumber: 40, chapter: 1, startVerse: 1, endVerse: 1 },
      { bookNumber: 40, chapter: 1, startVerse: 2, endVerse: 2 },
    ];
    const lookup = vi.fn().mockImplementation(async ({ reference, translation }) => {
      if (reference === 'Matthew 1:2') throw new Error('unavailable');
      return { reference, translation, text: reference, citation: { source: 'Fixture' } };
    });
    const result = await new ParallelPassageService(
      crossReferences(), { lookup } as any, undefined, legacyFixture(), source as any,
    ).lookup({ reference: 'Matthew 1:1', includeText: true });

    const member = result.sourceAttestedGroups[0].members[0];
    expect(member.textEnrichmentStatus).toBe('partial');
    expect(member.excerpts?.map(excerpt => excerpt.reference)).toEqual(['Matthew 1:1']);
    expect(result.sourceAttestedGroups[0].members[1].textEnrichmentStatus).toBe('unavailable');
    expect(result.textEnrichment).toMatchObject({
      uniqueTargetCount: 2, scheduledLookupCount: 2, succeededLookupCount: 1, failedLookupCount: 1,
    });
  });
});
