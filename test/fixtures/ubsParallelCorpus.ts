import type { SourceAttestedParallelGroup } from '../../src/kernel/sourceAttestedParallels.js';

export const fixtureProvenance = {
  sourceId: 'ubs_paratext_parallel_passages',
  title: 'UBS Parallel Passage Database',
  publisher: 'United Bible Societies',
  copyright: '© 2023 United Bible Societies',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  sourceUrl: 'https://example.test/ubs',
  sourcePath: 'parallel passages/ParallelPassages.xml',
  sourceCommit: 'a'.repeat(40),
  sourceCommitDate: '2023-07-10',
  sourceBlob: 'b'.repeat(40),
  sourceBytes: 100,
  sourceSha256: 'c'.repeat(64),
  transformVersion: 1,
  modified: true,
  modificationNote: 'References and alignment metadata normalized for local lookup.',
} as const;

const firstId = `ubs-pp-${'1'.repeat(64)}`;
const secondId = `ubs-pp-${'2'.repeat(64)}`;

export function ubsFixture(): Record<string, unknown> {
  const groups: SourceAttestedParallelGroup[] = [
    {
      groupId: firstId,
      sourceOrdinal: 1,
      label: 'source_attested_parallel',
      directionality: 'unspecified',
      members: [
        {
          sourceOrder: 1,
          sourceReference: 'LUK 6:27-28,35',
          normalizedReference: 'Luke 6:27-28,35',
          segments: [
            { bookNumber: 42, chapter: 6, startVerse: 27, endVerse: 28 },
            { bookNumber: 42, chapter: 6, startVerse: 35, endVerse: 35 },
          ],
          languageMarker: 'GRK',
          alignmentBasis: 'UBSGNT5',
          alignmentRaw: '012345678',
        },
        {
          sourceOrder: 2,
          sourceReference: 'MAT 5:44',
          normalizedReference: 'Matthew 5:44',
          segments: [{ bookNumber: 40, chapter: 5, startVerse: 44, endVerse: 44 }],
          languageMarker: 'GRK',
          alignmentBasis: 'UBSGNT5',
          alignmentRaw: '222',
        },
      ],
      provenance: { ...fixtureProvenance },
    },
    {
      groupId: secondId,
      sourceOrdinal: 2,
      label: 'source_attested_parallel',
      directionality: 'unspecified',
      members: [
        {
          sourceOrder: 1,
          sourceReference: 'LUK 6:35-36',
          normalizedReference: 'Luke 6:35-36',
          segments: [{ bookNumber: 42, chapter: 6, startVerse: 35, endVerse: 36 }],
          languageMarker: 'GRK',
          alignmentBasis: 'UBSGNT5',
          alignmentRaw: '111',
        },
        {
          sourceOrder: 2,
          sourceReference: 'LEV 19:18',
          normalizedReference: 'Leviticus 19:18',
          segments: [{ bookNumber: 3, chapter: 19, startVerse: 18, endVerse: 18 }],
          languageMarker: 'HEB',
          alignmentBasis: 'LXX',
          alignmentRaw: '222',
        },
      ],
      provenance: { ...fixtureProvenance },
    },
  ];
  return {
    schemaVersion: 'ubs-parallel-passages.v1',
    transformVersion: 1,
    label: 'source_attested_parallel',
    directionality: 'unspecified',
    license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
    provenance: { ...fixtureProvenance },
    groups,
    referenceIndex: {
      '3:19': [{ groupId: secondId, memberOrder: 2, segmentOrder: 1, startVerse: 18, endVerse: 18 }],
      '40:5': [{ groupId: firstId, memberOrder: 2, segmentOrder: 1, startVerse: 44, endVerse: 44 }],
      '42:6': [
        { groupId: firstId, memberOrder: 1, segmentOrder: 1, startVerse: 27, endVerse: 28 },
        { groupId: firstId, memberOrder: 1, segmentOrder: 2, startVerse: 35, endVerse: 35 },
        { groupId: secondId, memberOrder: 1, segmentOrder: 1, startVerse: 35, endVerse: 36 },
      ],
    },
  };
}
