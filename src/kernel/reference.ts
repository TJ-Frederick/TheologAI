/**
 * Canonical Bible reference parser and normalizer.
 *
 * Parses any common format and produces a typed BibleReference that can
 * be converted to every external format used by the adapters.
 *
 * Replaces ad-hoc parsing in:
 *   - commentaryMapper.ts (parseReference)
 *   - crossReferenceService.ts (normalizeReference / normalizeSingleReference)
 *   - biblicalLanguagesAdapter.ts (parseReference)
 *   - helloaoMapper.ts (mapReferenceToHelloAO)
 */

import { findBook, findBookByAbbreviation, type BibleBook } from './books.js';

export interface BibleReference {
  /** Canonical BibleBook entry */
  book: BibleBook;
  chapter: number;
  startVerse?: number;
  endVerse?: number;
}

/**
 * Parse a Bible reference string into a structured BibleReference.
 *
 * Accepted formats:
 *   - "John 3:16"
 *   - "1 John 5:7-8"
 *   - "Gen 1:1"
 *   - "genesis 1:1-5"
 *   - "Ps 23"           (chapter only)
 *   - "Song of Solomon 1:1"
 *   - "Gen.1.1"         (OpenBible TSV format)
 *   - "Jn 3.16"         (dot separator)
 *
 * @throws Error if the reference cannot be parsed or the book is unrecognized
 */
export function parseReference(input: string): BibleReference {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Empty Bible reference');
  }

  // Normalize dots to spaces/colons: "Gen.1.1" → "Gen 1:1"
  // But preserve dots within book names that shouldn't be split
  let normalized = trimmed;

  // Try to split the reference into book name and chapter:verse parts.
  // Strategy: scan from the end to find the numeric portion, rest is book.
  const match = normalized.match(
    /^([1-3]?\s*[A-Za-z][A-Za-z\s.]*?)[\s.]+(\d+)(?:[:.]+(\d+)(?:\s*-\s*(\d+))?)?$/
  );

  if (!match) {
    // Maybe it's just a book name with chapter: "Psalm 23"
    // or a reference without verse: try a simpler pattern
    const simpleMatch = normalized.match(
      /^([1-3]?\s*[A-Za-z][A-Za-z\s.]*?)[\s.]+(\d+)$/
    );
    if (simpleMatch) {
      const [, rawBook, rawChapter] = simpleMatch;
      const book = resolveBook(rawBook.trim());
      return { book, chapter: parseInt(rawChapter, 10) };
    }
    throw new Error(
      `Invalid Bible reference: "${input}". Expected format like "John 3:16", "Genesis 1:1-5", or "Ps 23"`
    );
  }

  const [, rawBook, rawChapter, rawStartVerse, rawEndVerse] = match;
  const book = resolveBook(rawBook.trim());
  const chapter = parseInt(rawChapter, 10);
  const startVerse = rawStartVerse ? parseInt(rawStartVerse, 10) : undefined;
  const endVerse = rawEndVerse ? parseInt(rawEndVerse, 10) : undefined;

  return { book, chapter, startVerse, endVerse };
}

/**
 * Resolve a raw book name string to a BibleBook.
 * Tries alias lookup first, then OpenBible abbreviation lookup.
 */
function resolveBook(raw: string): BibleBook {
  // Clean up: dots removed, collapse whitespace
  const cleaned = raw.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();

  const book = findBook(cleaned);
  if (book) return book;

  // Try OpenBible abbreviation (case-sensitive: "Gen", "1Sam")
  const byAbbrev = findBookByAbbreviation(cleaned);
  if (byAbbrev) return byAbbrev;

  throw new Error(
    `Unknown Bible book: "${raw}". Try a full name (e.g. "Genesis") or common abbreviation (e.g. "Gen").`
  );
}

// ── Format converters ──

/** Canonical display string: "Genesis 1:1", "Psalms 23", "Romans 8:28-30" */
export function formatReference(ref: BibleReference): string {
  let s = `${ref.book.name} ${ref.chapter}`;
  if (ref.startVerse != null) {
    s += `:${ref.startVerse}`;
    if (ref.endVerse != null && ref.endVerse !== ref.startVerse) {
      s += `-${ref.endVerse}`;
    }
  }
  return s;
}

/** OpenBible cross-reference key: "Genesis 1:1" (same as display but always uses full name) */
export function toOpenBibleKey(ref: BibleReference): string {
  return formatReference(ref);
}

/** HelloAO API path segments: { bookName: "John", bookCode: "JHN", chapter: 3 } */
export function toHelloAO(ref: BibleReference): {
  bookName: string;
  bookCode: string;
  chapter: number;
  verse?: number;
  endVerse?: number;
} {
  return {
    bookName: ref.book.name,
    bookCode: ref.book.helloaoCode,
    chapter: ref.chapter,
    verse: ref.startVerse,
    endVerse: ref.endVerse,
  };
}

/** CCEL section path for Matthew Henry: { work: "henry/mhc5", section: "mhc5.John.iii" } */
export function toCcelMatthewHenry(ref: BibleReference): {
  work: string;
  section: string;
} {
  const vol = `mhc${ref.book.mhcVolume}`;
  return {
    work: `henry/${vol}`,
    section: `${vol}.${ref.book.ccelAbbrev}.${toRomanNumeral(ref.chapter)}`,
  };
}

/** CCEL section path for MHC Concise */
export function toCcelMHCConcise(ref: BibleReference): {
  work: string;
  section: string;
} {
  return {
    work: 'henry/mhcc',
    section: `mhcc.${ref.book.ccelAbbrev}.${toRomanNumeral(ref.chapter)}`,
  };
}

/** CCEL section path for JFB */
export function toCcelJFB(ref: BibleReference): {
  work: string;
  section: string;
} {
  return {
    work: 'jfb/jfb',
    section: `jfb.${ref.book.ccelAbbrev}.${toRomanNumeral(ref.chapter)}`,
  };
}

/** STEPBible lookup key: { book: "1Samuel", chapter: "3", verse: "16" } */
export function toStepBible(ref: BibleReference): {
  book: string;
  chapter: string;
  verse?: string;
} {
  return {
    book: ref.book.stepbibleId,
    chapter: String(ref.chapter),
    verse: ref.startVerse != null ? String(ref.startVerse) : undefined,
  };
}

/**
 * Parse an OpenBible.info TSV reference like "Gen.1.1" or "Ps.148.4-Ps.148.5"
 * into a canonical formatted string like "Genesis 1:1".
 *
 * Handles ranges: "Ps.148.4-Ps.148.5" → "Psalms 148:4-5"
 */
export function normalizeOpenBibleRef(raw: string): string {
  if (raw.includes('-')) {
    const parts = raw.split('-');
    if (parts.length === 2) {
      const start = parseReference(parts[0].trim());
      const end = parseReference(parts[1].trim());
      // If same book+chapter, produce compact range
      if (start.book.number === end.book.number && start.chapter === end.chapter) {
        return formatReference({
          ...start,
          endVerse: end.startVerse ?? end.chapter,
        });
      }
      // Different chapter/book: return "Start - End"
      return `${formatReference(start)}-${formatReference(end)}`;
    }
  }
  return formatReference(parseReference(raw));
}

// ── Helpers ──

/** Convert 1–150 to lowercase Roman numeral (for CCEL paths) */
export function toRomanNumeral(num: number): string {
  if (num < 1 || num > 150) {
    throw new Error(`Chapter number out of range: ${num}`);
  }
  const table: [number, string][] = [
    [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let result = '';
  let remaining = num;
  for (const [value, numeral] of table) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }
  return result;
}
