import { findBookByNumber } from './books.js';

export interface ParallelTextSegmentLike {
  bookNumber: number;
  chapter: number;
  startVerse: number;
  endVerse: number;
}

export interface ParallelTextSourceGroupLike {
  members: Array<{ segments: ParallelTextSegmentLike[] }>;
}

export interface ParallelTextLegacyLike {
  reference: string;
}

/** Return the exact deterministic UBS group/member/segment then legacy target plan. */
export function orderedUniqueParallelTextTargets(
  sourceGroups: ParallelTextSourceGroupLike[],
  legacyParallels: ParallelTextLegacyLike[],
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const add = (reference: string) => {
    if (seen.has(reference)) return;
    seen.add(reference);
    ordered.push(reference);
  };
  for (const group of sourceGroups) {
    for (const member of group.members) {
      for (const segment of member.segments) add(canonicalParallelSegmentReference(segment));
    }
  }
  for (const parallel of legacyParallels) add(parallel.reference);
  return ordered;
}

export function canonicalParallelSegmentReference(segment: ParallelTextSegmentLike): string {
  const book = findBookByNumber(segment.bookNumber);
  if (!book) throw new Error(`Unknown canonical book number ${segment.bookNumber}`);
  const verses = segment.startVerse === segment.endVerse
    ? `${segment.startVerse}`
    : `${segment.startVerse}-${segment.endVerse}`;
  return `${book.name} ${segment.chapter}:${verses}`;
}
