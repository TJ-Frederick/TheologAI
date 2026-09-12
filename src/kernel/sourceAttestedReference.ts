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

/**
 * Complete set of chapter maxima where the source-owned Hebrew versification
 * exceeds the English bounds. Derived from every `nativeCoordinateKeys` entry
 * in the pinned TAHOT coordinate bridge (identity
 * a7d103edbf0b29214634f25ce54feb72979e8a732c6c5caf62c3ecc23a12a790),
 * not merely from verses observed in the parallel-passage corpus. Keeping the
 * finite divergence set explicit prevents arbitrary positive verses from
 * becoming authoritative-looking source searches.
 */
const SOURCE_ATTESTED_MAX_VERSE_OVERRIDES: Readonly<Record<string, number>> = {
  '1:32': 33,
  '2:7': 29,
  '2:21': 37,
  '3:5': 26,
  '4:17': 28,
  '4:25': 19,
  '4:30': 17,
  '5:13': 19,
  '5:23': 26,
  '5:28': 69,
  '9:21': 16,
  '9:24': 23,
  '10:19': 44,
  '11:5': 32,
  '11:22': 54,
  '12:12': 22,
  '13:5': 41,
  '13:12': 41,
  '14:1': 18,
  '14:13': 23,
  '16:3': 38,
  '16:10': 40,
  '18:40': 32,
  '19:3': 9,
  '19:4': 9,
  '19:5': 13,
  '19:6': 11,
  '19:7': 18,
  '19:8': 10,
  '19:9': 21,
  '19:12': 9,
  '19:18': 51,
  '19:19': 15,
  '19:20': 10,
  '19:21': 14,
  '19:22': 32,
  '19:30': 13,
  '19:31': 25,
  '19:34': 23,
  '19:36': 13,
  '19:38': 23,
  '19:39': 14,
  '19:40': 18,
  '19:41': 14,
  '19:42': 12,
  '19:44': 27,
  '19:45': 18,
  '19:46': 12,
  '19:47': 10,
  '19:48': 15,
  '19:49': 21,
  '19:51': 21,
  '19:52': 11,
  '19:53': 7,
  '19:54': 9,
  '19:55': 24,
  '19:56': 14,
  '19:57': 12,
  '19:58': 12,
  '19:59': 18,
  '19:60': 14,
  '19:61': 9,
  '19:62': 13,
  '19:63': 12,
  '19:64': 11,
  '19:65': 14,
  '19:67': 8,
  '19:68': 36,
  '19:69': 37,
  '19:70': 6,
  '19:75': 11,
  '19:76': 13,
  '19:77': 21,
  '19:80': 20,
  '19:81': 17,
  '19:83': 19,
  '19:84': 13,
  '19:85': 14,
  '19:88': 19,
  '19:89': 53,
  '19:92': 16,
  '19:102': 29,
  '19:108': 14,
  '19:140': 14,
  '19:142': 8,
  '21:4': 17,
  '22:7': 14,
  '23:8': 23,
  '24:8': 23,
  '26:21': 37,
  '27:3': 33,
  '27:6': 29,
  '28:2': 25,
  '28:12': 15,
  '28:14': 10,
  '29:4': 21,
  '32:2': 11,
  '33:4': 14,
  '34:2': 14,
  '38:2': 17,
  '39:3': 24,
};

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

    const sourceOnlyChapter = /^(.+?)\s+(\d+)$/.exec(raw);
    if (sourceOnlyChapter) {
      const book = findBook(sourceOnlyChapter[1]);
      const chapter = safePositive(sourceOnlyChapter[2], input);
      if (book && SOURCE_ATTESTED_MAX_VERSE_OVERRIDES[`${book.number}:${chapter}`] !== undefined) {
        return {
          normalizedReference: `${book.name} ${chapter}`,
          segments: [{
            bookNumber: book.number,
            chapter,
            startVerse: 1,
            endVerse: SOURCE_ATTESTED_OPEN_ENDED_VERSE,
          }],
        };
      }
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
    const canonicalBounds = getBibleBookBounds(book).maxVerseByChapter;
    const canonicalMaxVerse = canonicalBounds[chapter - 1];
    const sourceMaxVerse = SOURCE_ATTESTED_MAX_VERSE_OVERRIDES[`${book.number}:${chapter}`];
    if (canonicalMaxVerse === undefined && sourceMaxVerse === undefined) {
      throw new Error(`Invalid source-attested reference: ${input}`);
    }
    const versePart = full ? full[2] : part;
    const verse = /^(\d+)(?:-(\d+))?$/.exec(versePart);
    if (!verse) throw new Error(`Invalid source-attested reference: ${input}`);
    const startVerse = safePositive(verse[1], input);
    const endVerse = verse[2] ? safePositive(verse[2], input) : startVerse;
    const maxVerse = Math.max(canonicalMaxVerse ?? 0, sourceMaxVerse ?? 0);
    if (endVerse < startVerse || startVerse > maxVerse || endVerse > maxVerse) {
      throw new Error(`Invalid source-attested reference: ${input}`);
    }
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
