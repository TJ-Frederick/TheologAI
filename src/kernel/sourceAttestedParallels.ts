/** Source-neutral domain contracts for externally attested parallel-passage groups. */
import type { RepositoryResult } from './repositories.js';

export type SourceParallelLanguageMarker = 'HEB' | 'GRK';
export type SourceParallelAlignmentBasis = 'BHS' | 'LXX' | 'UBSGNT5';

export interface SourceParallelReferenceSegment {
  bookNumber: number;
  chapter: number;
  startVerse: number;
  endVerse: number;
}

export interface SourceParallelMember {
  sourceOrder: number;
  sourceReference: string;
  normalizedReference: string;
  segments: SourceParallelReferenceSegment[];
  languageMarker: SourceParallelLanguageMarker;
  alignmentBasis: SourceParallelAlignmentBasis;
  alignmentRaw: string;
}

export interface ParallelSourceProvenance {
  sourceId: string;
  title: string;
  publisher: string;
  copyright: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  sourcePath: string;
  sourceCommit: string;
  sourceCommitDate: string;
  sourceBlob: string;
  sourceBytes: number;
  sourceSha256: string;
  transformVersion: number;
  modified: boolean;
  modificationNote: string;
}

export interface SourceAttestedParallelGroup {
  groupId: string;
  sourceOrdinal: number;
  label: 'source_attested_parallel';
  directionality: 'unspecified';
  members: SourceParallelMember[];
  provenance: ParallelSourceProvenance;
}

export interface SourceAttestedParallelLookup {
  reference: string;
  groups: readonly SourceAttestedParallelGroup[];
  requestedLimit: number;
  additionalMatchObserved: boolean;
}

export interface SourceAttestedParallelRepositoryResult {
  groups: readonly SourceAttestedParallelGroup[];
  additionalMatchObserved: boolean;
}

export interface ISourceAttestedParallelRepository {
  findGroups(reference: string, maxGroups?: number): RepositoryResult<SourceAttestedParallelRepositoryResult>;
  getProvenance(): RepositoryResult<Readonly<ParallelSourceProvenance>>;
}
