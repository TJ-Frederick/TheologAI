import { describe, expect, it } from 'vitest';
import generatedCorpus from '../../../../src/data/ubs-parallel-passages.generated.json';
import { UbsParallelPassageRepository } from '../../../../src/adapters/shared/UbsParallelPassageRepository.js';
import { loadUbsParallelPassageRepository } from '../../../../src/adapters/data/loadUbsParallelPassages.js';
import { ubsFixture } from '../../../fixtures/ubsParallelCorpus.js';

describe('UbsParallelPassageRepository', () => {
  it('validates and indexes the complete pinned artifact', () => {
    const repository = new UbsParallelPassageRepository(generatedCorpus);
    expect(repository.getProvenance()).toMatchObject({
      sourceId: 'ubs_paratext_parallel_passages',
      sourceCommit: 'fd7bcf88b20a1522d3916f437f012c561466fe7b',
      license: 'CC BY-SA 4.0',
    });
    expect(repository.findGroups('Matthew 3:16-17', 1)[0].members.map(member => member.normalizedReference)).toEqual([
      'Matthew 3:16-17', 'Mark 1:10-11', 'Luke 3:21-22', 'John 1:32',
    ]);
    expect(repository.findGroups('2 Kings 18:13', 1)[0].members.map(member => member.normalizedReference)).toEqual([
      '2 Kings 18:13', '2 Chronicles 32:1', 'Isaiah 36:1',
    ]);
    expect(repository.findGroups('Psalm 18:51', 1)[0].members.map(member => member.normalizedReference)).toContain('Psalms 18:51');

    const cases: Array<[string, string[]]> = [
      ['Matthew 14:20', ['Matthew 14:20', 'Mark 6:42-43', 'Luke 9:17', 'John 6:12-13']],
      ['Matthew 26:26', ['Matthew 26:26', 'Mark 14:22', 'Luke 22:19', '1 Corinthians 11:23-24']],
      ['1 Kings 8:27', ['1 Kings 8:27', '2 Chronicles 2:5', '2 Chronicles 6:18']],
      ['Isaiah 40:3', ['Isaiah 40:3', 'Matthew 3:3', 'Mark 1:3', 'Luke 3:4', 'John 1:23']],
    ];
    for (const [reference, members] of cases) {
      const group = repository.findGroups(reference).find(candidate => members.every(member => candidate.members.some(item => item.normalizedReference === member)));
      expect(group?.members.map(member => member.normalizedReference)).toEqual(members);
      expect(group).toMatchObject({ label: 'source_attested_parallel', directionality: 'unspecified' });
      expect(group).not.toHaveProperty('confidence');
    }
    expect(repository.findGroups('Matthew 3:3').length).toBeGreaterThanOrEqual(2);
    expect(repository.findGroups('Luke 6:35').some(group => group.members.some(member => member.sourceReference.includes(',')))).toBe(true);
  });

  it('supports exact, overlap, reverse, discontinuous, deduplicated, source-ordered lookup', () => {
    const repository = new UbsParallelPassageRepository(ubsFixture());
    const exact = repository.findGroups('Luke 6:35');
    expect(exact.map(group => group.sourceOrdinal)).toEqual([1, 2]);
    expect(exact[0].members).toHaveLength(2);
    expect(repository.findGroups('Luke 6:29-34')).toEqual([]);
    expect(repository.findGroups('Luke 6:27-28,35').map(group => group.sourceOrdinal)).toEqual([1, 2]);
    expect(repository.findGroups('Luke 6:28-35').map(group => group.sourceOrdinal)).toEqual([1, 2]);
    expect(repository.findGroups('Matthew 5:44')[0].groupId).toBe(exact[0].groupId);
    expect(repository.findGroups('Luke 6', 1).map(group => group.sourceOrdinal)).toEqual([1]);
    expect(() => repository.findGroups('Luke 6:35', 0)).toThrow('positive safe integer');
  });

  it('returns immutable complete groups and provenance', () => {
    const repository = new UbsParallelPassageRepository(ubsFixture());
    const group = repository.findGroups('Luke 6:35')[0];
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
      mutate(value => { value.groups[0].provenance.sourceSha256 = 'd'.repeat(64); }),
      mutate(value => { value.groups[0].sourceOrdinal = 2; }),
      mutate(value => { value.groups[0].members[0].sourceOrder = 2; }),
      mutate(value => { value.groups[0].members[0].alignmentRaw = '9'; }),
      mutate(value => { value.groups[0].members[0].alignmentBasis = 'BHS'; }),
      mutate(value => { value.groups[0].members[0].normalizedReference = 'Luke 6:27-35'; }),
      mutate(value => { value.groups[0].members[0].sourceReference = 'LUK 6:27-35'; }),
      mutate(value => { value.groups[0].members[0].sourceReference += ' '; }),
      mutate(value => { value.groups[0].members[0].segments[0].bookNumber = 67; }),
      mutate(value => { value.groups[0].members[0].segments[0].chapter = 99; }),
      mutate(value => { value.referenceIndex['42:6'][0].startVerse = 26; }),
      mutate(value => { delete value.referenceIndex['40:5']; }),
      mutate(value => { value.groups.push(structuredClone(value.groups[0])); }),
    ];
    for (const artifact of cases) expect(() => new UbsParallelPassageRepository(artifact)).toThrow('[ubs-repository]');
  });

  it('loads identical bytes through Node and Worker-safe injected paths', () => {
    const node = loadUbsParallelPassageRepository(new URL('../../../../src/data/ubs-parallel-passages.generated.json', import.meta.url).pathname);
    const worker = new UbsParallelPassageRepository(generatedCorpus);
    for (const reference of ['Matthew 3:3', 'Isaiah 40:3', 'Luke 6:35', '2 Kings 18:13']) {
      expect(node.findGroups(reference).map(group => group.groupId)).toEqual(worker.findGroups(reference).map(group => group.groupId));
      expect(node.findGroups(reference).map(group => group.provenance)).toEqual(worker.findGroups(reference).map(group => group.provenance));
    }
  });
});
