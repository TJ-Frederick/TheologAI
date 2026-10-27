/** Reference parsing for source-owned versification without widening segments. */

import { findBook, getBibleBookBounds } from './books.js';
import { formatReference, parseReference } from './reference.js';
import type { SourceParallelReferenceSegment } from './sourceAttestedParallels.js';

export interface SourceAttestedLookupReference {
  normalizedReference: string;
  segments: SourceParallelReferenceSegment[];
}

/**
 * Finite upper bound used for an open-ended chapter query.
 *
 * Source-attested verse numbers can exceed the English translation bounds,
 * while SQL and opaque cursor JSON cannot safely carry `Infinity`. The pinned
 * corpus uses ordinary positive verse numbers, so the largest safe integer is
 * a lossless cross-runtime representation of "through the end of the chapter".
 */
export const SOURCE_ATTESTED_OPEN_ENDED_VERSE = Number.MAX_SAFE_INTEGER;

export function parseSourceAttestedLookupReference(input: string): SourceAttestedLookupReference {
  const raw = input.trim();
  if (!raw.includes(',')) {
    try {
      const parsed = parseReference(raw);
      return {
        normalizedReference: formatReference(parsed),
        segments: [{
          bookNumber: parsed.book.number,
          chapter: parsed.chapter,
          startVerse: parsed.startVerse ?? 1,
          endVerse: parsed.endVerse ?? parsed.startVerse ?? SOURCE_ATTESTED_OPEN_ENDED_VERSE,
        }],
      };
    } catch {
      // UBS source-language versification can exceed translation-oriented
      // English verse maxima. Parse that narrow case below while retaining
      // canonical book/chapter validation.
    }
  }

  const match = /^(.+?)\s+(\d+):(\d+(?:-\d+)?(?:,(?:\d+:)?\d+(?:-\d+)?)*)$/.exec(raw);
  if (!match) throw new Error(`Invalid source-attested reference: ${input}`);
  const book = findBook(match[1]);
  if (!book) throw new Error(`Invalid source-attested reference: ${input}`);
  const firstChapter = safePositive(match[2], input);
  const parts = match[3].split(',');
  const segments = parts.map((part, index) => {
    const full = /^(\d+):(\d+(?:-\d+)?)$/.exec(part);
    const chapter = full ? safePositive(full[1], input) : firstChapter;
    if (chapter > getBibleBookBounds(book).maxVerseByChapter.length) throw new Error(`Invalid source-attested reference: ${input}`);
    const versePart = full ? full[2] : part;
    const verse = /^(\d+)(?:-(\d+))?$/.exec(versePart);
    if (!verse) throw new Error(`Invalid source-attested reference: ${input}`);
    const startVerse = safePositive(verse[1], input);
    const endVerse = verse[2] ? safePositive(verse[2], input) : startVerse;
    if (endVerse < startVerse) throw new Error(`Invalid source-attested reference: ${input}`);
    return { bookNumber: book.number, chapter, startVerse, endVerse, index };
  });
  const normalized = segments.map((segment, index) => {
    const verses = segment.startVerse === segment.endVerse ? `${segment.startVerse}` : `${segment.startVerse}-${segment.endVerse}`;
    if (index === 0) return `${book.name} ${segment.chapter}:${verses}`;
    return segment.chapter === firstChapter ? verses : `${segment.chapter}:${verses}`;
  }).join(',');
  return {
    normalizedReference: normalized,
    segments: segments.map(({ index: _index, ...segment }) => segment),
  };
}

function safePositive(raw: string, input: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid source-attested reference: ${input}`);
  return value;
}
