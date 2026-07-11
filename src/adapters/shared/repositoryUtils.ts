import { BIBLE_BOOKS, findBook } from '../../kernel/books.js';
import { normalizeOpenBibleRef, parseReference } from '../../kernel/reference.js';

/** Convert user input to the OpenBible key stored in the cross-reference table. */
export function toOpenBibleKey(reference: string): string {
  const trimmed = reference.trim();
  if (/^[A-Za-z0-9]+\.\d+\.\d+$/.test(trimmed)) return trimmed;

  try {
    const parsed = parseReference(trimmed);
    return `${parsed.book.abbreviation}.${parsed.chapter}.${parsed.startVerse ?? ''}`.replace(/\.$/, '');
  } catch {
    return trimmed;
  }
}

/** Return a canonical human-readable reference while preserving unknown input. */
export function fromOpenBibleKey(reference: string): string {
  try {
    return normalizeOpenBibleRef(reference);
  } catch {
    return reference;
  }
}

/** Stable Protestant-canon ordering, with unknown book labels sorted last. */
export function sortByCanonicalBook<T extends { book: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftNumber = findBook(left.book)?.number ?? Number.MAX_SAFE_INTEGER;
    const rightNumber = findBook(right.book)?.number ?? Number.MAX_SAFE_INTEGER;
    return leftNumber - rightNumber || left.book.localeCompare(right.book);
  });
}

/** SQL expression for deterministic canonical ordering before LIMIT is applied. */
export const CANONICAL_BOOK_ORDER_SQL = `CASE book ${BIBLE_BOOKS
  .map(book => `WHEN '${book.stepbibleId}' THEN ${book.number}`)
  .join(' ')} ELSE 999 END`;
