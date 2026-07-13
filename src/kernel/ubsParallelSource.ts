import type { ParallelSourceProvenance, SourceParallelMember } from './sourceAttestedParallels.js';
import { sha256Hex } from './sha256.js';

export const UBS_PARALLEL_PASSAGE_PROVENANCE: Readonly<ParallelSourceProvenance> = Object.freeze({
  sourceId: 'ubs_paratext_parallel_passages',
  title: 'UBS Parallel Passage Database',
  publisher: 'United Bible Societies',
  copyright: '© 2023 United Bible Societies',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  sourceUrl: 'https://github.com/ubsicap/ubs-open-license/tree/fd7bcf88b20a1522d3916f437f012c561466fe7b/parallel%20passages',
  sourcePath: 'parallel passages/ParallelPassages.xml',
  sourceCommit: 'fd7bcf88b20a1522d3916f437f012c561466fe7b',
  sourceCommitDate: '2023-07-10',
  sourceBlob: 'b30af22e9ee4740f6c339eb267a59b8fdb9f83f7',
  sourceBytes: 336250,
  sourceSha256: 'd43e7554556c1a1c5e2464e6b5ad8a4ab9118ada11060bf6b200abf3d0d0a394',
  transformVersion: 2,
  modified: true,
  modificationNote: 'References and alignment metadata normalized for local lookup; UBS group membership and member order preserved.',
});

/** Independently reviewed root emitted by compiler v2 and required at runtime. */
export const UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY = 'a5fd0d4646cb69f426f592c6e334866191201fbe64691cd55c7f7ecd0ca9d4cc';

/** Exact compiler identity: SHA-256 of ordered [marker, source locator, alignment] tuples. */
export function deriveUbsParallelGroupId(members: readonly Pick<SourceParallelMember, 'languageMarker' | 'sourceReference' | 'alignmentRaw'>[]): string {
  const canonical = JSON.stringify(members.map(member => [member.languageMarker, member.sourceReference, member.alignmentRaw]));
  return `ubs-pp-${sha256Hex(canonical)}`;
}

export function computeUbsParallelArtifactIdentity(artifactWithoutIdentity: unknown): string {
  return sha256Hex(JSON.stringify(artifactWithoutIdentity));
}
