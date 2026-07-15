import { describe, expect, it } from 'vitest';
import {
  assertOccurrencePosition,
  assertUsageLimit,
  tokenOccurrencePage,
} from '../../../../src/adapters/shared/morphologyUsage.js';
import type { TokenOccurrence } from '../../../../src/kernel/repositories.js';

const token: TokenOccurrence = {
  book: 'Psalms',
  book_order: 19,
  chapter: 3,
  verse: 0,
  position: 1,
  word_text: 'מִזְמוֹר',
  lemma: 'מִזְמוֹר',
  strongs_number: 'H4210',
  morph_code: 'HNcmsa',
  gloss: 'psalm',
};

describe('morphology usage repository helpers', () => {
  it('accepts source-attested verse zero but rejects malformed keyset positions', () => {
    expect(() => assertOccurrencePosition(token)).not.toThrow();
    expect(() => assertOccurrencePosition({ ...token, verse: -1 })).toThrow(RangeError);
    expect(() => assertOccurrencePosition({ ...token, book_order: 67 })).toThrow(RangeError);
    expect(() => assertOccurrencePosition({ ...token, position: 0 })).toThrow(RangeError);
  });

  it('requires bounded integer limits', () => {
    expect(() => assertUsageLimit(1)).not.toThrow();
    expect(() => assertUsageLimit(1000)).not.toThrow();
    for (const value of [0, 1.5, 1001, Number.NaN]) {
      expect(() => assertUsageLimit(value)).toThrow(RangeError);
    }
  });

  it('only emits a continuation position when an extra row proves more data', () => {
    expect(tokenOccurrencePage([token], 1)).toEqual({ occurrences: [token] });
    expect(tokenOccurrencePage([token, { ...token, position: 2 }], 1)).toEqual({
      occurrences: [token],
      next_after: { book_order: 19, chapter: 3, verse: 0, position: 1 },
    });
  });
});
