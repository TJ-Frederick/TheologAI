import { describe, expect, it } from 'vitest';
import generatedCorpus from '../../../../src/data/ubs-parallel-passages.generated.json';
import { UbsParallelPassageRepository } from '../../../../src/adapters/shared/UbsParallelPassageRepository.js';
import { loadUbsParallelPassageRepository } from '../../../../src/adapters/data/loadUbsParallelPassages.js';
import { ubsFixture } from '../../../fixtures/ubsParallelCorpus.js';
import {
  computeUbsParallelArtifactIdentity,
  deriveUbsParallelGroupId,
  UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY,
} from '../../../../src/kernel/ubsParallelSource.js';

describe('UbsParallelPassageRepository', () => {
  const fixtureIdentity = (ubsFixture() as { artifactIdentity: string }).artifactIdentity;
  const fixtureRepository = (artifact = ubsFixture()): UbsParallelPassageRepository =>
    new UbsParallelPassageRepository(artifact, fixtureIdentity);

  it('validates and indexes the complete pinned artifact', () => {
    const repository = new UbsParallelPassageRepository(generatedCorpus);
    expect(repository.getProvenance()).toMatchObject({
      sourceId: 'ubs_paratext_parallel_passages',
      sourceCommit: 'fd7bcf88b20a1522d3916f437f012c561466fe7b',
      license: 'CC BY-SA 4.0',
    });
    expect(generatedCorpus.artifactIdentity).toBe(UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY);
    expect(repository.findGroups('Matthew 3:16-17', 1).groups[0].members.map(member => member.normalizedReference)).toEqual([
      'Matthew 3:16-17', 'Mark 1:10-11', 'Luke 3:21-22', 'John 1:32',
    ]);
    expect(repository.findGroups('2 Kings 18:13', 1).groups[0].members.map(member => member.normalizedReference)).toEqual([
      '2 Kings 18:13', '2 Chronicles 32:1', 'Isaiah 36:1',
    ]);
    expect(repository.findGroups('Psalm 18:51', 1).groups[0].members.map(member => member.normalizedReference)).toContain('Psalms 18:51');

    const cases: Array<[string, string[]]> = [
      ['Matthew 14:20', ['Matthew 14:20', 'Mark 6:42-43', 'Luke 9:17', 'John 6:12-13']],
      ['Matthew 26:26', ['Matthew 26:26', 'Mark 14:22', 'Luke 22:19', '1 Corinthians 11:23-24']],
      ['1 Kings 8:27', ['1 Kings 8:27', '2 Chronicles 2:5', '2 Chronicles 6:18']],
      ['Isaiah 40:3', ['Isaiah 40:3', 'Matthew 3:3', 'Mark 1:3', 'Luke 3:4', 'John 1:23']],
    ];
    for (const [reference, members] of cases) {
      const group = repository.findGroups(reference).groups.find(candidate => members.every(member => candidate.members.some(item => item.normalizedReference === member)));
      expect(group?.members.map(member => member.normalizedReference)).toEqual(members);
      expect(group).toMatchObject({ label: 'source_attested_parallel', directionality: 'unspecified' });
      expect(group).not.toHaveProperty('confidence');
    }
    expect(repository.findGroups('Matthew 3:3').groups.length).toBeGreaterThanOrEqual(2);
    expect(repository.findGroups('Luke 6:35').groups.some(group => group.members.some(member => member.sourceReference.includes(',')))).toBe(true);
  });

  it('rejects a fully coordinated but unreviewed artifact rewrite at the pinned root', () => {
    const artifact = ubsFixture() as any;
    const member = artifact.groups[0].members[0];
    member.sourceReference = 'LUK 6:29';
    member.normalizedReference = 'Luke 6:29';
    member.segments = [{ bookNumber: 42, chapter: 6, startVerse: 29, endVerse: 29 }];
    artifact.groups[0].groupId = deriveUbsParallelGroupId(artifact.groups[0].members);
    artifact.referenceIndex = {};
    for (const group of artifact.groups) {
      for (const groupMember of group.members) {
        groupMember.segments.forEach((segment: any, index: number) => {
          const key = `${segment.bookNumber}:${segment.chapter}`;
          (artifact.referenceIndex[key] ??= []).push({
            groupId: group.groupId,
            memberOrder: groupMember.sourceOrder,
            segmentOrder: index + 1,
            startVerse: segment.startVerse,
            endVerse: segment.endVerse,
          });
        });
      }
    }
    artifact.referenceIndex = Object.fromEntries(Object.entries(artifact.referenceIndex).sort(([a], [b]) => a.localeCompare(b)));
    const { artifactIdentity: _old, ...projection } = artifact;
    artifact.artifactIdentity = computeUbsParallelArtifactIdentity(projection);
    expect(artifact.artifactIdentity).not.toBe(fixtureIdentity);
    expect(() => fixtureRepository(artifact)).toThrow('artifactIdentity pin');
  });

  it('supports exact, overlap, reverse, discontinuous, deduplicated, source-ordered lookup', () => {
    const repository = fixtureRepository();
    const exact = repository.findGroups('Luke 6:35');
    expect(exact.groups.map(group => group.sourceOrdinal)).toEqual([1, 2]);
    expect(exact.groups[0].members).toHaveLength(2);
    expect(repository.findGroups('Luke 6:29-34')).toEqual({ groups: [], additionalMatchObserved: false });
    expect(repository.findGroups('Luke 6:27-28,35').groups.map(group => group.sourceOrdinal)).toEqual([1, 2]);
    expect(repository.findGroups('Luke 6:28-35').groups.map(group => group.sourceOrdinal)).toEqual([1, 2]);
    expect(repository.findGroups('Matthew 5:44').groups[0].groupId).toBe(exact.groups[0].groupId);
    expect(repository.findGroups('Luke 6', 1).groups.map(group => group.sourceOrdinal)).toEqual([1]);
    expect(() => repository.findGroups('Luke 6:35', 0)).toThrow('1 to 10');
  });

  it('returns immutable complete groups and provenance', () => {
    const repository = fixtureRepository();
    const result = repository.findGroups('Luke 6:35');
    const group = result.groups[0];
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.groups)).toBe(true);
    expect(Object.isFrozen(group)).toBe(true);
    expect(Object.isFrozen(group.members)).toBe(true);
    expect(Object.isFrozen(group.members[0].segments)).toBe(true);
    expect(Object.isFrozen(repository.getProvenance())).toBe(true);
  });

  it('rejects structural, provenance, alignment, segment, and index drift', () => {
    const mutate = (apply: (fixture: any) => void): unknown => {
      const fixture = ubsFixture() as any;
      apply(fixture);
      return fixture;
    };
    const cases: unknown[] = [
      mutate(value => { value.unknown = true; }),
      mutate(value => { value.schemaVersion = 'v2'; }),
      mutate(value => { value.provenance.sourceId = 'other'; }),
      mutate(value => {
        value.provenance.sourceCommit = 'd'.repeat(40);
        value.provenance.sourceUrl = 'https://evil.example/fabricated';
        for (const group of value.groups) {
          group.provenance.sourceCommit = 'd'.repeat(40);
          group.provenance.sourceUrl = 'https://evil.example/fabricated';
        }
      }),
      mutate(value => { value.groups[0].provenance.sourceSha256 = 'd'.repeat(64); }),
      mutate(value => { value.groups[0].sourceOrdinal = 2; }),
      mutate(value => { value.groups[0].members[0].sourceOrder = 2; }),
      mutate(value => { value.groups[0].members[0].alignmentRaw = '9'; }),
      mutate(value => { value.groups[0].members[0].alignmentRaw = '112345678'; }),
      mutate(value => { value.groups[0].members[0].alignmentBasis = 'BHS'; }),
      mutate(value => { value.groups[0].members[0].normalizedReference = 'Luke 6:27-35'; }),
      mutate(value => { value.groups[0].members[0].sourceReference = 'LUK 6:27-35'; }),
      mutate(value => { value.groups[0].members[0].sourceReference += ' '; }),
      mutate(value => { value.groups[0].members[0].segments[0].bookNumber = 67; }),
      mutate(value => { value.groups[0].members[0].segments[0].chapter = 99; }),
      mutate(value => { value.referenceIndex['42:6'][0].startVerse = 26; }),
      mutate(value => {
        const replacement = `ubs-pp-${'d'.repeat(64)}`;
        const original = value.groups[0].groupId;
        value.groups[0].groupId = replacement;
        for (const entries of Object.values(value.referenceIndex) as any[][]) {
          for (const entry of entries) if (entry.groupId === original) entry.groupId = replacement;
        }
      }),
      mutate(value => { delete value.referenceIndex['40:5']; }),
      mutate(value => { value.groups.push(structuredClone(value.groups[0])); }),
    ];
    for (const artifact of cases) expect(() => fixtureRepository(artifact as Record<string, unknown>)).toThrow('[ubs-repository]');
  });

  it('loads identical bytes through Node and Worker-safe injected paths', () => {
    const node = loadUbsParallelPassageRepository(new URL('../../../../src/data/ubs-parallel-passages.generated.json', import.meta.url).pathname);
    const worker = new UbsParallelPassageRepository(generatedCorpus);
    for (const reference of ['Matthew 3:3', 'Isaiah 40:3', 'Luke 6:35', '2 Kings 18:13']) {
      expect(node.findGroups(reference).groups.map(group => group.groupId)).toEqual(worker.findGroups(reference).groups.map(group => group.groupId));
      expect(node.findGroups(reference).groups.map(group => group.provenance)).toEqual(worker.findGroups(reference).groups.map(group => group.provenance));
    }
  });

  it('reports only a one-group lookahead without returning or implying a total', () => {
    const repository = new UbsParallelPassageRepository(generatedCorpus);
    const bounded = repository.findGroups('Mark 10:19', 5);
    expect(bounded.groups).toHaveLength(5);
    expect(bounded.additionalMatchObserved).toBe(true);
    expect(bounded).not.toHaveProperty('total');
    expect(bounded).not.toHaveProperty('cursor');

    const reviewedMaximum = repository.findGroups('Mark 10:19', 10);
    expect(reviewedMaximum.groups).toHaveLength(7);
    expect(reviewedMaximum.additionalMatchObserved).toBe(false);
  });

  it('uses a source-ordinal keyset and never returns or reconstructs lookahead', () => {
    const repository = fixtureRepository();
    const first = repository.findGroups('Luke 6:35', 1);
    expect(first.groups.map(group => group.sourceOrdinal)).toEqual([1]);
    expect(first.additionalMatchObserved).toBe(true);
    const second = repository.findGroups('Luke 6:35', 1, first.groups[0].sourceOrdinal);
    expect(second.groups.map(group => group.sourceOrdinal)).toEqual([2]);
    expect(second.additionalMatchObserved).toBe(false);
    expect(repository.findGroups('Luke 6:35', 1, 2)).toEqual({ groups: [], additionalMatchObserved: false });
    expect(() => repository.findGroups('Luke 6:35', 1, -1)).toThrow('non-negative integer');
  });

  it('validates a cursor position against the exact current query and cumulative page boundary', () => {
    const repository = fixtureRepository();
    expect(repository.hasValidGroupCursorBoundary('Luke 6:35', {
      pageSize: 1, afterSourceOrdinal: 1, cumulativeGroupCount: 1,
    })).toBe(true);
    expect(repository.hasValidGroupCursorBoundary('Luke 6:35', {
      pageSize: 1, afterSourceOrdinal: 2, cumulativeGroupCount: 2,
    })).toBe(true);
    expect(repository.hasValidGroupCursorBoundary('Luke 6:35', {
      pageSize: 1, afterSourceOrdinal: 2, cumulativeGroupCount: 1,
    })).toBe(false);
    expect(repository.hasValidGroupCursorBoundary('Luke 6:35', {
      pageSize: 1, afterSourceOrdinal: 99, cumulativeGroupCount: 2,
    })).toBe(false);
    expect(repository.hasValidGroupCursorBoundary('Matthew 5:44', {
      pageSize: 1, afterSourceOrdinal: 2, cumulativeGroupCount: 2,
    })).toBe(false);
  });

  it('preserves complete source groups and distinct source attestations in the honest window', () => {
    const repository = new UbsParallelPassageRepository(generatedCorpus);
    expect(repository.findGroups('2 Kings 18:13', 5).groups[0].members.map(member => member.normalizedReference)).toEqual([
      '2 Kings 18:13', '2 Chronicles 32:1', 'Isaiah 36:1',
    ]);
    const matthew = repository.findGroups('Matthew 3:3', 5);
    expect(matthew.groups).toHaveLength(2);
    expect(new Set(matthew.groups.map(group => group.groupId)).size).toBe(2);
    expect(matthew.groups.map(group => group.sourceOrdinal)).toEqual([1316, 1436]);
  });
});
