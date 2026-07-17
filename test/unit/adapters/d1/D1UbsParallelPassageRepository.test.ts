import { describe, expect, it } from 'vitest';
import { D1UbsParallelPassageRepository } from '../../../../src/adapters/d1/D1UbsParallelPassageRepository.js';
import { UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY, UBS_PARALLEL_PASSAGE_PROVENANCE } from '../../../../src/kernel/ubsParallelSource.js';
import { ubsFixture } from '../../../fixtures/ubsParallelCorpus.js';
import { createMockD1 } from '../../../helpers/mockD1.js';
import { UbsParallelPassageRepository } from '../../../../src/adapters/shared/UbsParallelPassageRepository.js';

interface FixtureRows {
  groups: any[];
  members: any[];
  segments: any[];
}

function fixtureDb(
  mutate?: (rows: FixtureRows) => void,
  additionalMatch = false,
  sourceOrdinal?: number,
  groupIndex = 0,
  cursorBoundary: { cumulative_group_count: number; boundary_group_count: number } = { cumulative_group_count: 1, boundary_group_count: 1 },
) {
  const artifact = ubsFixture() as any;
  const group = { ...artifact.groups[groupIndex], sourceOrdinal: sourceOrdinal ?? artifact.groups[groupIndex].sourceOrdinal };
  const p = UBS_PARALLEL_PASSAGE_PROVENANCE;
  const rows: FixtureRows = {
    groups: [{ group_id: group.groupId, source_ordinal: group.sourceOrdinal, label: group.label, directionality: group.directionality }],
    members: group.members.map((member: any) => ({
      group_id: group.groupId, source_order: member.sourceOrder, source_reference: member.sourceReference,
      normalized_reference: member.normalizedReference, language_marker: member.languageMarker,
      alignment_basis: member.alignmentBasis, alignment_raw: member.alignmentRaw,
    })),
    segments: group.members.flatMap((member: any) => member.segments.map((segment: any, index: number) => ({
      group_id: group.groupId, member_order: member.sourceOrder, segment_order: index + 1,
      book_number: segment.bookNumber, chapter: segment.chapter, start_verse: segment.startVerse, end_verse: segment.endVerse,
    }))),
  };
  mutate?.(rows);
  return {
    group,
    db: createMockD1([
      { sql: 'COUNT(DISTINCT CASE WHEN g.source_ordinal <= ?', first: cursorBoundary },
      { sql: 'SELECT DISTINCT g.group_id', all: { results: [
        { group_id: group.groupId, source_ordinal: group.sourceOrdinal },
        ...(additionalMatch ? [{ group_id: `ubs-pp-${'f'.repeat(64)}`, source_ordinal: group.sourceOrdinal + 1 }] : []),
      ] } },
      { sql: 'SELECT * FROM ubs_parallel_sources', first: {
        source_id: p.sourceId, schema_version: 'ubs-parallel-passages.v2', transform_version: p.transformVersion,
        artifact_identity: UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY, title: p.title, publisher: p.publisher,
        copyright: p.copyright, license: p.license, license_url: p.licenseUrl, source_url: p.sourceUrl,
        source_path: p.sourcePath, source_commit: p.sourceCommit, source_commit_date: p.sourceCommitDate,
        source_blob: p.sourceBlob, source_bytes: p.sourceBytes, source_sha256: p.sourceSha256,
        modified: 1, modification_note: p.modificationNote, label: 'source_attested_parallel', directionality: 'unspecified',
      } },
      { sql: 'SELECT group_id, source_ordinal', all: { results: rows.groups } },
      { sql: 'SELECT group_id, source_order', all: { results: rows.members } },
      { sql: 'SELECT group_id, member_order', all: { results: rows.segments } },
    ]),
  };
}

describe('D1UbsParallelPassageRepository', () => {
  it('reconstructs a bounded complete immutable group with exact provenance', async () => {
    const { db, group } = fixtureDb();
    const repository = new D1UbsParallelPassageRepository(db as any);
    const results = await repository.findGroups('Luke 6:35', 1);
    expect(results).toEqual({ groups: [group], additionalMatchObserved: false });
    expect(Object.isFrozen(results.groups[0].members[0].segments)).toBe(true);
    expect(await repository.getProvenance()).toEqual(UBS_PARALLEL_PASSAGE_PROVENANCE);
    expect(db.prepare.mock.calls[0][0]).toContain('LIMIT ?');
    expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith(
      'ubs_paratext_parallel_passages', 0, 42, 6, 35, 35, 2,
    );
  });

  it('binds the source-ordinal keyset before segment parameters without increasing query count', async () => {
    const { db } = fixtureDb(undefined, false, 88);
    await new D1UbsParallelPassageRepository(db as any).findGroups('Luke 6:35', 1, 87);
    expect(db.prepare.mock.calls[0][0]).toContain('g.source_ordinal > ?');
    expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith(
      'ubs_paratext_parallel_passages', 87, 42, 6, 35, 35, 2,
    );
    expect(db.prepare).toHaveBeenCalledTimes(5);
  });

  it('uses one aggregate D1 query to validate the exact query-bound cumulative cursor boundary', async () => {
    const { db } = fixtureDb();
    const repository = new D1UbsParallelPassageRepository(db as any);
    await expect(repository.hasValidGroupCursorBoundary('Luke 6:35', {
      pageSize: 1, afterSourceOrdinal: 1, cumulativeGroupCount: 1,
    })).resolves.toBe(true);
    expect(db.prepare).toHaveBeenCalledTimes(2);
    expect(db.prepare.mock.calls[1][0]).toContain('COUNT(DISTINCT CASE WHEN g.source_ordinal <= ?');
    expect(db.prepare.mock.results[1].value.bind).toHaveBeenCalledWith(
      1, 1, 'ubs_paratext_parallel_passages', 42, 6, 35, 35,
    );

    const falseBoundary = fixtureDb(undefined, false, undefined, 0, {
      cumulative_group_count: 1, boundary_group_count: 0,
    });
    await expect(new D1UbsParallelPassageRepository(falseBoundary.db as any).hasValidGroupCursorBoundary('Luke 6:35', {
      pageSize: 1, afterSourceOrdinal: 99, cumulativeGroupCount: 1,
    })).resolves.toBe(false);
  });

  it('matches Node group boundaries, ordering, and terminal state across keyset pages', async () => {
    const artifact = ubsFixture() as any;
    const node = new UbsParallelPassageRepository(artifact, artifact.artifactIdentity);
    const nodeFirst = node.findGroups('Luke 6:35', 1);
    const nodeSecond = node.findGroups('Luke 6:35', 1, nodeFirst.groups[0].sourceOrdinal);

    const d1FirstFixture = fixtureDb(undefined, true, undefined, 0);
    const d1SecondFixture = fixtureDb(undefined, false, undefined, 1);
    const d1First = await new D1UbsParallelPassageRepository(d1FirstFixture.db as any).findGroups('Luke 6:35', 1);
    const d1Second = await new D1UbsParallelPassageRepository(d1SecondFixture.db as any)
      .findGroups('Luke 6:35', 1, d1First.groups[0].sourceOrdinal);

    expect(d1First).toEqual(nodeFirst);
    expect(d1Second).toEqual(nodeSecond);
  });

  it('rejects requests outside the reviewed group bound before querying D1', async () => {
    const { db } = fixtureDb();
    await expect(new D1UbsParallelPassageRepository(db as any).findGroups('Luke 6:35', 11)).rejects.toThrow('1 to 10');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('returns no groups without issuing reconstruction queries', async () => {
    const db = createMockD1([{ sql: 'SELECT DISTINCT g.group_id', all: { results: [] } }]);
    await expect(new D1UbsParallelPassageRepository(db as any).findGroups('John 1:1', 5)).resolves.toEqual({ groups: [], additionalMatchObserved: false });
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['more than one lookahead', [
      { group_id: `ubs-pp-${'a'.repeat(64)}`, source_ordinal: 1 },
      { group_id: `ubs-pp-${'b'.repeat(64)}`, source_ordinal: 2 },
      { group_id: `ubs-pp-${'c'.repeat(64)}`, source_ordinal: 3 },
    ]],
    ['duplicate IDs', [
      { group_id: `ubs-pp-${'a'.repeat(64)}`, source_ordinal: 1 },
      { group_id: `ubs-pp-${'a'.repeat(64)}`, source_ordinal: 2 },
    ]],
    ['non-increasing source order', [
      { group_id: `ubs-pp-${'a'.repeat(64)}`, source_ordinal: 2 },
      { group_id: `ubs-pp-${'b'.repeat(64)}`, source_ordinal: 1 },
    ]],
    ['row at the cursor boundary', [
      { group_id: `ubs-pp-${'a'.repeat(64)}`, source_ordinal: 1 },
    ]],
  ])('rejects malformed %s from the bounded ID query before reconstruction', async (_name, ids) => {
    const db = createMockD1([{ sql: 'SELECT DISTINCT g.group_id', all: { results: ids } }]);
    const after = _name === 'row at the cursor boundary' ? 1 : 0;
    await expect(new D1UbsParallelPassageRepository(db as any).findGroups('Luke 6:35', 1, after)).rejects.toThrow('lookahead');
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it('observes one extra ID while reconstructing only the returned complete groups', async () => {
    const { db, group } = fixtureDb(undefined, true);
    const result = await new D1UbsParallelPassageRepository(db as any).findGroups('Luke 6:35', 1);
    expect(result).toEqual({ groups: [group], additionalMatchObserved: true });
    expect(db.prepare.mock.calls[2][0]).toContain('ubs_parallel_groups');
    expect(db.prepare.mock.results[2].value.bind).toHaveBeenCalledWith(group.groupId, 1);
    expect(db.prepare.mock.results[3].value.bind).toHaveBeenCalledWith(group.groupId, 400);
    expect(db.prepare.mock.results[4].value.bind).toHaveBeenCalledWith(group.groupId, 800);
  });

  it.each([
    ['group source ordinal', (rows: FixtureRows) => { rows.groups[0].source_ordinal = 2; }],
    ['normalized reference', (rows: FixtureRows) => { rows.members[0].normalized_reference = 'Luke 6:27-35'; }],
    ['source reference', (rows: FixtureRows) => { rows.members[0].source_reference = 'LUK 6:27-35'; }],
    ['parsed segment', (rows: FixtureRows) => { rows.segments[0].start_verse = 26; }],
    ['canonical book bounds', (rows: FixtureRows) => { rows.segments[0].book_number = 67; }],
    ['canonical chapter bounds', (rows: FixtureRows) => { rows.segments[0].chapter = 99; }],
    ['language marker', (rows: FixtureRows) => { rows.members[0].language_marker = 'HEB'; }],
    ['alignment basis', (rows: FixtureRows) => { rows.members[0].alignment_basis = 'BHS'; }],
    ['alignment raw', (rows: FixtureRows) => { rows.members[0].alignment_raw = '9'; }],
    ['member order', (rows: FixtureRows) => { rows.members[0].source_order = 2; }],
    ['segment order', (rows: FixtureRows) => { rows.segments[0].segment_order = 2; }],
  ])('rejects corrupted %s rows', async (_name, mutate) => {
    const { db } = fixtureDb(mutate);
    await expect(new D1UbsParallelPassageRepository(db as any).findGroups('Luke 6:35', 1)).rejects.toThrow();
  });
});
