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
  nextCursor?: string;
}

export interface SourceAttestedParallelRepositoryResult {
  groups: readonly SourceAttestedParallelGroup[];
  additionalMatchObserved: boolean;
}

/**
 * The untrusted claims carried by a decoded public continuation cursor. The
 * repository validates these against its current, pinned corpus before a
 * continuation can be served.
 */
export interface SourceAttestedParallelCursorBoundary {
  pageSize: number;
  afterSourceOrdinal: number;
  cumulativeGroupCount: number;
}

export interface ISourceAttestedParallelRepository {
  findGroups(reference: string, maxGroups?: number, afterSourceOrdinal?: number): RepositoryResult<SourceAttestedParallelRepositoryResult>;
  hasValidGroupCursorBoundary(
    reference: string,
    boundary: SourceAttestedParallelCursorBoundary,
  ): RepositoryResult<boolean>;
  getProvenance(): RepositoryResult<Readonly<ParallelSourceProvenance>>;
}
