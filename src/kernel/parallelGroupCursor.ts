import type { SourceParallelReferenceSegment } from './sourceAttestedParallels.js';
import { UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY } from './ubsParallelSource.js';

export const PARALLEL_GROUP_CURSOR_MAX_LENGTH = 2048;
const OPERATION = 'parallel_passages.ubs_groups';

interface ParallelGroupCursorV1 {
  v: 1;
  operation: typeof OPERATION;
  artifact: string;
  segments: SourceParallelReferenceSegment[];
  pageSize: number;
  afterSourceOrdinal: number;
  cumulativeGroupCount: number;
}

/**
 * A decoded cursor is only a claimed position. It deliberately carries no
 * authority: the repository must still prove it is a page boundary in the
 * pinned corpus for the exact normalized query before using it.
 */
export interface ParallelGroupCursorPosition {
  pageSize: number;
  afterSourceOrdinal: number;
  cumulativeGroupCount: number;
}

export function encodeParallelGroupCursor(
  segments: readonly SourceParallelReferenceSegment[],
  position: ParallelGroupCursorPosition,
): string {
  const canonicalSegments = canonicalizeSegments(segments);
  assertPageSize(position.pageSize);
  assertOrdinal(position.afterSourceOrdinal);
  assertCumulativeGroupCount(position.cumulativeGroupCount, position.pageSize);
  return encodeBase64Url(JSON.stringify({
    v: 1,
    operation: OPERATION,
    artifact: UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY,
    segments: canonicalSegments,
    pageSize: position.pageSize,
    afterSourceOrdinal: position.afterSourceOrdinal,
    cumulativeGroupCount: position.cumulativeGroupCount,
  } satisfies ParallelGroupCursorV1));
}

export function decodeParallelGroupCursor(
  cursor: string,
  expectedSegments: readonly SourceParallelReferenceSegment[],
  expectedPageSize: number,
): ParallelGroupCursorPosition {
  if (!cursor || cursor.length > PARALLEL_GROUP_CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new RangeError('groupCursor is malformed or oversized');
  }
  let value: unknown;
  try {
    value = JSON.parse(decodeBase64Url(cursor));
  } catch {
    throw new RangeError('groupCursor is malformed');
  }
  if (!isRecord(value)
    || Object.keys(value).sort().join(',') !== 'afterSourceOrdinal,artifact,cumulativeGroupCount,operation,pageSize,segments,v'
    || value.v !== 1 || value.operation !== OPERATION
    || value.artifact !== UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY) {
    throw new RangeError('groupCursor is stale or uses an unsupported version');
  }
  if (!Array.isArray(value.segments)) throw new RangeError('groupCursor is malformed');
  let segments: SourceParallelReferenceSegment[];
  let expected: SourceParallelReferenceSegment[];
  try {
    segments = canonicalizeSegments(value.segments);
    expected = canonicalizeSegments(expectedSegments);
    assertPageSize(value.pageSize);
    assertPageSize(expectedPageSize);
    assertOrdinal(value.afterSourceOrdinal);
    assertCumulativeGroupCount(value.cumulativeGroupCount, value.pageSize);
  } catch {
    throw new RangeError('groupCursor is malformed');
  }
  if (value.pageSize !== expectedPageSize) {
    throw new RangeError('groupCursor was issued with a different maxGroups value');
  }
  if (canonicalJson(segments) !== canonicalJson(expected)) {
    throw new RangeError('groupCursor belongs to a different normalized passage query');
  }
  const canonical = {
    v: 1 as const,
    operation: OPERATION,
    artifact: UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY,
    segments,
    pageSize: value.pageSize,
    afterSourceOrdinal: value.afterSourceOrdinal,
    cumulativeGroupCount: value.cumulativeGroupCount,
  } satisfies ParallelGroupCursorV1;
  if (encodeBase64Url(JSON.stringify(canonical)) !== cursor) {
    throw new RangeError('groupCursor is not canonically encoded');
  }
  return {
    pageSize: value.pageSize,
    afterSourceOrdinal: value.afterSourceOrdinal,
    cumulativeGroupCount: value.cumulativeGroupCount,
  };
}

function assertSegments(segments: readonly unknown[]): void {
  if (segments.length < 1 || segments.length > 8) throw new RangeError('cursor segments are invalid');
  for (const segment of segments) {
    if (!isRecord(segment) || Object.keys(segment).sort().join(',') !== 'bookNumber,chapter,endVerse,startVerse'
      || !positiveInteger(segment.bookNumber) || segment.bookNumber > 66
      || !positiveInteger(segment.chapter)
      || !positiveInteger(segment.startVerse)
      || !positiveInteger(segment.endVerse) || segment.endVerse < segment.startVerse) {
      throw new RangeError('cursor segments are invalid');
    }
  }
}

function assertOrdinal(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new RangeError('cursor source ordinal is invalid');
}

function assertPageSize(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 10) {
    throw new RangeError('cursor page size is invalid');
  }
}

function assertCumulativeGroupCount(value: unknown, pageSize: number): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < pageSize || Number(value) % pageSize !== 0) {
    throw new RangeError('cursor cumulative group count is invalid');
  }
}

function canonicalizeSegments(segments: readonly unknown[]): SourceParallelReferenceSegment[] {
  assertSegments(segments);
  return segments.map(segment => {
    const value = segment as SourceParallelReferenceSegment;
    return {
      bookNumber: value.bookNumber,
      chapter: value.chapter,
      startVerse: value.startVerse,
      endVerse: value.endVerse,
    };
  });
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): string {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1;
}
