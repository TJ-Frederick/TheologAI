import { describe, expect, it } from 'vitest';
import { D1UbsParallelPassageRepository } from '../../../../src/adapters/d1/D1UbsParallelPassageRepository.js';
import { UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY, UBS_PARALLEL_PASSAGE_PROVENANCE } from '../../../../src/kernel/ubsParallelSource.js';
import { ubsFixture } from '../../../fixtures/ubsParallelCorpus.js';
import { createMockD1 } from '../../../helpers/mockD1.js';

function fixtureDb() {
  const artifact = ubsFixture() as any;
  const group = artifact.groups[0];
  const p = UBS_PARALLEL_PASSAGE_PROVENANCE;
  return {
    group,
    db: createMockD1([
      { sql: 'SELECT DISTINCT g.group_id', all: { results: [{ group_id: group.groupId, source_ordinal: group.sourceOrdinal }] } },
      { sql: 'SELECT * FROM ubs_parallel_sources', first: {
        source_id: p.sourceId, schema_version: 'ubs-parallel-passages.v2', transform_version: p.transformVersion,
        artifact_identity: UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY, title: p.title, publisher: p.publisher,
        copyright: p.copyright, license: p.license, license_url: p.licenseUrl, source_url: p.sourceUrl,
        source_path: p.sourcePath, source_commit: p.sourceCommit, source_commit_date: p.sourceCommitDate,
        source_blob: p.sourceBlob, source_bytes: p.sourceBytes, source_sha256: p.sourceSha256,
        modified: 1, modification_note: p.modificationNote, label: 'source_attested_parallel', directionality: 'unspecified',
      } },
      { sql: 'SELECT group_id, source_ordinal', all: { results: [{
        group_id: group.groupId, source_ordinal: group.sourceOrdinal, label: group.label, directionality: group.directionality,
      }] } },
      { sql: 'SELECT group_id, source_order', all: { results: group.members.map((member: any) => ({
        group_id: group.groupId, source_order: member.sourceOrder, source_reference: member.sourceReference,
        normalized_reference: member.normalizedReference, language_marker: member.languageMarker,
        alignment_basis: member.alignmentBasis, alignment_raw: member.alignmentRaw,
      })) } },
      { sql: 'SELECT group_id, member_order', all: { results: group.members.flatMap((member: any) =>
        member.segments.map((segment: any, index: number) => ({
          group_id: group.groupId, member_order: member.sourceOrder, segment_order: index + 1,
          book_number: segment.bookNumber, chapter: segment.chapter, start_verse: segment.startVerse, end_verse: segment.endVerse,
        }))) } },
    ]),
  };
}

describe('D1UbsParallelPassageRepository', () => {
  it('reconstructs a bounded complete immutable group with exact provenance', async () => {
    const { db, group } = fixtureDb();
    const repository = new D1UbsParallelPassageRepository(db as any);
    const results = await repository.findGroups('Luke 6:35', 1);
    expect(results).toEqual([group]);
    expect(Object.isFrozen(results[0].members[0].segments)).toBe(true);
    expect(await repository.getProvenance()).toEqual(UBS_PARALLEL_PASSAGE_PROVENANCE);
    expect(db.prepare.mock.calls[0][0]).toContain('LIMIT ?');
    expect(db.prepare.mock.results[0].value.bind).toHaveBeenCalledWith(
      'ubs_paratext_parallel_passages', 42, 6, 35, 35, 1,
    );
  });

  it('rejects requests outside the reviewed group bound before querying D1', async () => {
    const { db } = fixtureDb();
    await expect(new D1UbsParallelPassageRepository(db as any).findGroups('Luke 6:35', 11)).rejects.toThrow('1 to 10');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('returns no groups without issuing reconstruction queries', async () => {
    const db = createMockD1([{ sql: 'SELECT DISTINCT g.group_id', all: { results: [] } }]);
    await expect(new D1UbsParallelPassageRepository(db as any).findGroups('John 1:1', 5)).resolves.toEqual([]);
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });
});
