import type { SourceAttestedParallelGroup } from '../../src/kernel/sourceAttestedParallels.js';
import { deriveUbsParallelGroupId, UBS_PARALLEL_PASSAGE_PROVENANCE } from '../../src/kernel/ubsParallelSource.js';

export const fixtureProvenance = UBS_PARALLEL_PASSAGE_PROVENANCE;

export function ubsFixture(): Record<string, unknown> {
  const groups: SourceAttestedParallelGroup[] = [
    {
      groupId: '',
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
      groupId: '',
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
  for (const group of groups) group.groupId = deriveUbsParallelGroupId(group.members);
  const [firstId, secondId] = groups.map(group => group.groupId);
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
