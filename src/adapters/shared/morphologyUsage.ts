import type {
  CanonicalOccurrencePosition,
  FormUsage,
  TokenOccurrence,
  TokenOccurrencePage,
} from '../../kernel/repositories.js';

export interface FormUsageRow {
  form_text: string;
  token_count: number;
  verse_count: number;
  first_book: string;
  first_book_order: number;
  first_chapter: number;
  first_verse: number;
  first_position: number;
}

export function toFormUsage(row: FormUsageRow): FormUsage {
  return {
    form_text: row.form_text,
    token_count: row.token_count,
    verse_count: row.verse_count,
    first: {
      book: row.first_book,
      book_order: row.first_book_order,
      chapter: row.first_chapter,
      verse: row.first_verse,
      position: row.first_position,
    },
  };
}

export function assertUsageLimit(limit: number, maximum = 1000): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
    throw new RangeError(`limit must be an integer between 1 and ${maximum}`);
  }
}

export function assertOccurrencePosition(position: CanonicalOccurrencePosition): void {
  if (!Number.isSafeInteger(position.book_order) || position.book_order < 1 || position.book_order > 66
    || !Number.isSafeInteger(position.chapter) || position.chapter < 1
    || !Number.isSafeInteger(position.verse) || position.verse < 0
    || !Number.isSafeInteger(position.position) || position.position < 1) {
    throw new RangeError('after must be a valid canonical occurrence position');
  }
}

export function tokenOccurrencePage(rows: TokenOccurrence[], limit: number): TokenOccurrencePage {
  const hasMore = rows.length > limit;
  const occurrences = hasMore ? rows.slice(0, limit) : rows;
  const last = occurrences.at(-1);
  return {
    occurrences,
    ...(hasMore && last ? {
      next_after: {
        book_order: last.book_order,
        chapter: last.chapter,
        verse: last.verse,
        position: last.position,
      },
    } : {}),
  };
}
