import { describe, it, expect } from 'vitest';
import {
  parseReference,
  formatReference,
  toHelloAO,
  toCcelMatthewHenry,
  toCcelMHCConcise,
  toCcelJFB,
  toStepBible,
  normalizeOpenBibleRef,
  toRomanNumeral,
} from '../../../src/kernel/reference.js';
import { BIBLE_BOOKS, getBibleBookBounds } from '../../../src/kernel/books.js';

describe('parseReference', () => {
  it('parses "John 3:16"', () => {
    const ref = parseReference('John 3:16');
    expect(ref.book.name).toBe('John');
    expect(ref.chapter).toBe(3);
    expect(ref.startVerse).toBe(16);
    expect(ref.endVerse).toBeUndefined();
  });

  it('parses "Genesis 1:1-5"', () => {
    const ref = parseReference('Genesis 1:1-5');
    expect(ref.book.name).toBe('Genesis');
    expect(ref.chapter).toBe(1);
    expect(ref.startVerse).toBe(1);
    expect(ref.endVerse).toBe(5);
  });

  it('parses chapter-only "Ps 23"', () => {
    const ref = parseReference('Ps 23');
    expect(ref.book.name).toBe('Psalms');
    expect(ref.chapter).toBe(23);
    expect(ref.startVerse).toBeUndefined();
  });

  it('parses "1 John 5:7"', () => {
    const ref = parseReference('1 John 5:7');
    expect(ref.book.name).toBe('1 John');
    expect(ref.chapter).toBe(5);
    expect(ref.startVerse).toBe(7);
  });

  it('parses "Song of Solomon 1:1"', () => {
    const ref = parseReference('Song of Solomon 1:1');
    expect(ref.book.name).toBe('Song of Solomon');
    expect(ref.chapter).toBe(1);
    expect(ref.startVerse).toBe(1);
  });

  it('parses abbreviations: "Jn 3:16"', () => {
    const ref = parseReference('Jn 3:16');
    expect(ref.book.name).toBe('John');
  });

  it('parses abbreviations: "1Cor 13:4"', () => {
    const ref = parseReference('1Cor 13:4');
    expect(ref.book.name).toBe('1 Corinthians');
  });

  it('parses dot-separated: "Gen.1.1"', () => {
    const ref = parseReference('Gen.1.1');
    expect(ref.book.name).toBe('Genesis');
    expect(ref.chapter).toBe(1);
    expect(ref.startVerse).toBe(1);
  });

  it('parses lowercase: "genesis 1:1"', () => {
    const ref = parseReference('genesis 1:1');
    expect(ref.book.name).toBe('Genesis');
  });

  it('parses with extra spaces', () => {
    const ref = parseReference('  John   3:16  ');
    expect(ref.book.name).toBe('John');
    expect(ref.chapter).toBe(3);
    expect(ref.startVerse).toBe(16);
  });

  it('parses "Romans 8:28-30"', () => {
    const ref = parseReference('Romans 8:28-30');
    expect(ref.book.name).toBe('Romans');
    expect(ref.chapter).toBe(8);
    expect(ref.startVerse).toBe(28);
    expect(ref.endVerse).toBe(30);
  });

  it('throws on empty string', () => {
    expect(() => parseReference('')).toThrow('Empty Bible reference');
  });

  it('throws on invalid format', () => {
    expect(() => parseReference('just some text')).toThrow();
  });

  it('throws on unknown book', () => {
    expect(() => parseReference('Hezekiah 1:1')).toThrow('Unknown Bible book');
  });

  it('enforces canonical chapter and verse bounds for all 66 books', () => {
    expect(BIBLE_BOOKS).toHaveLength(66);

    for (const book of BIBLE_BOOKS) {
      const maxVerses = getBibleBookBounds(book).maxVerseByChapter;
      const lastChapter = maxVerses.length;
      const lastVerse = maxVerses[lastChapter - 1];

      expect(parseReference(`${book.name} ${lastChapter}:${lastVerse}`).book.number)
        .toBe(book.number);
      expect(() => parseReference(`${book.name} ${lastChapter + 1}:1`)).toThrow(/out of range/);
    }
  });

  it.each([
    ['John 999:999', /Chapter 999 is out of range for John/],
    ['John 3:999', /Verse 999 is out of range for John 3/],
    ['John 3:16-999', /Verse range 16-999 is out of range for John 3/],
    ['John 3:17-16', /Verse range 17-16 is out of range for John 3/],
    ['Genesis 0:1', /Chapter 0 is out of range for Genesis/],
  ])('rejects impossible reference %s', (reference, message) => {
    expect(() => parseReference(reference)).toThrow(message);
  });

  it('parses "Obad 1:3"', () => {
    const ref = parseReference('Obad 1:3');
    expect(ref.book.name).toBe('Obadiah');
  });

  it('parses "Phlm 1:6"', () => {
    const ref = parseReference('Phlm 1:6');
    expect(ref.book.name).toBe('Philemon');
  });

  it('parses "3 John 1:4"', () => {
    const ref = parseReference('3 John 1:4');
    expect(ref.book.name).toBe('3 John');
  });

  it.each([
    ['Obadiah 4', 'Obadiah', 4],
    ['Philemon 6', 'Philemon', 6],
    ['2 John 4', '2 John', 4],
    ['3 John 4', '3 John', 4],
    ['Jude 3', 'Jude', 3],
  ])('interprets the common single-chapter verse form %s', (input, book, verse) => {
    const ref = parseReference(input);
    expect(ref).toMatchObject({
      book: expect.objectContaining({ name: book }),
      chapter: 1,
      startVerse: verse,
    });
    expect(formatReference(ref)).toBe(`${book} 1:${verse}`);
  });

  it.each([
    ['Obadiah 4-5', 'Obadiah', 4, 5],
    ['Philemon 5-6', 'Philemon', 5, 6],
    ['2 John 3-4', '2 John', 3, 4],
    ['3 John 3-4', '3 John', 3, 4],
    ['Jude 3-5', 'Jude', 3, 5],
  ])('parses and formats chapterless single-chapter range %s', (input, book, startVerse, endVerse) => {
    const ref = parseReference(input);
    expect(ref).toMatchObject({
      book: expect.objectContaining({ name: book }),
      chapter: 1,
      startVerse,
      endVerse,
    });
    expect(formatReference(ref)).toBe(`${book} 1:${startVerse}-${endVerse}`);
  });

  it('normalizes an en-dash chapterless range', () => {
    expect(formatReference(parseReference('Jude 3–5'))).toBe('Jude 1:3-5');
  });

  it.each([
    ['Obadiah 1:4', 'Obadiah 1:4'],
    ['Philemon 1:6', 'Philemon 1:6'],
    ['2 John 1:4', '2 John 1:4'],
    ['3 John 1:4', '3 John 1:4'],
    ['Jude 1:3', 'Jude 1:3'],
  ])('round-trips explicit single-chapter reference %s', (input, expected) => {
    expect(formatReference(parseReference(input))).toBe(expected);
  });

  it.each([
    ['Obadiah 22', 'Obadiah'],
    ['Philemon 26', 'Philemon'],
    ['2 John 14', '2 John'],
    ['3 John 16', '3 John'],
    ['Jude 26', 'Jude'],
  ])('rejects out-of-range single-chapter verse %s', (input, book) => {
    expect(() => parseReference(input)).toThrow(new RegExp(`Verse .* out of range for ${book} 1`));
  });

  it.each([
    ['Obadiah 4-22', 'Obadiah'],
    ['Philemon 6-5', 'Philemon'],
    ['2 John 3-14', '2 John'],
    ['3 John 3-2', '3 John'],
    ['Jude 3-26', 'Jude'],
  ])('rejects invalid chapterless single-chapter range %s', (input, book) => {
    expect(() => parseReference(input)).toThrow(new RegExp(`Verse range .* out of range for ${book} 1`));
  });

  it('does not reinterpret a multi-chapter book range as verses', () => {
    expect(() => parseReference('Genesis 1-3')).toThrow(/Invalid Bible reference/);
  });
});

describe('formatReference', () => {
  it('formats chapter-only', () => {
    const ref = parseReference('Ps 23');
    expect(formatReference(ref)).toBe('Psalms 23');
  });

  it('formats with verse', () => {
    const ref = parseReference('John 3:16');
    expect(formatReference(ref)).toBe('John 3:16');
  });

  it('formats with range', () => {
    const ref = parseReference('Genesis 1:1-5');
    expect(formatReference(ref)).toBe('Genesis 1:1-5');
  });

  it('omits endVerse when same as startVerse', () => {
    const ref = parseReference('John 3:16');
    (ref as any).endVerse = 16;
    expect(formatReference(ref)).toBe('John 3:16');
  });
});

describe('toHelloAO', () => {
  it('converts John 3:16', () => {
    const ref = parseReference('John 3:16');
    const helloao = toHelloAO(ref);
    expect(helloao.bookName).toBe('John');
    expect(helloao.bookCode).toBe('JHN');
    expect(helloao.chapter).toBe(3);
    expect(helloao.verse).toBe(16);
  });

  it('converts Genesis 1:1-5', () => {
    const ref = parseReference('Genesis 1:1-5');
    const helloao = toHelloAO(ref);
    expect(helloao.bookCode).toBe('GEN');
    expect(helloao.endVerse).toBe(5);
  });
});

describe('toCcelMatthewHenry', () => {
  it('converts John 3:16 to MHC5', () => {
    const ref = parseReference('John 3:16');
    const ccel = toCcelMatthewHenry(ref);
    expect(ccel.work).toBe('henry/mhc5');
    expect(ccel.section).toBe('mhc5.John.iii');
  });

  it('converts Genesis 1:1 to MHC1', () => {
    const ref = parseReference('Genesis 1:1');
    const ccel = toCcelMatthewHenry(ref);
    expect(ccel.work).toBe('henry/mhc1');
    expect(ccel.section).toBe('mhc1.Gen.i');
  });

  it('converts 1 Samuel 3 to MHC2 with iSam', () => {
    const ref = parseReference('1 Samuel 3');
    const ccel = toCcelMatthewHenry(ref);
    expect(ccel.work).toBe('henry/mhc2');
    expect(ccel.section).toBe('mhc2.iSam.iii');
  });

  it('converts Acts 2:1 to MHC6', () => {
    const ref = parseReference('Acts 2:1');
    const ccel = toCcelMatthewHenry(ref);
    expect(ccel.work).toBe('henry/mhc6');
    expect(ccel.section).toBe('mhc6.Acts.ii');
  });
});

describe('toCcelMHCConcise', () => {
  it('uses mhcc prefix', () => {
    const ref = parseReference('John 3:16');
    const ccel = toCcelMHCConcise(ref);
    expect(ccel.work).toBe('henry/mhcc');
    expect(ccel.section).toBe('mhcc.John.iii');
  });
});

describe('toCcelJFB', () => {
  it('uses jfb prefix', () => {
    const ref = parseReference('Romans 8:28');
    const ccel = toCcelJFB(ref);
    expect(ccel.work).toBe('jfb/jfb');
    expect(ccel.section).toBe('jfb.Rom.viii');
  });
});

describe('toStepBible', () => {
  it('converts to STEPBible format', () => {
    const ref = parseReference('1 Samuel 3:16');
    const sb = toStepBible(ref);
    expect(sb.book).toBe('1Samuel');
    expect(sb.chapter).toBe('3');
    expect(sb.verse).toBe('16');
  });

  it('handles chapter-only', () => {
    const ref = parseReference('Ps 23');
    const sb = toStepBible(ref);
    expect(sb.book).toBe('Psalms');
    expect(sb.chapter).toBe('23');
    expect(sb.verse).toBeUndefined();
  });
});

describe('normalizeOpenBibleRef', () => {
  it('normalizes "Gen.1.1"', () => {
    expect(normalizeOpenBibleRef('Gen.1.1')).toBe('Genesis 1:1');
  });

  it('normalizes "Ps.23.1"', () => {
    expect(normalizeOpenBibleRef('Ps.23.1')).toBe('Psalms 23:1');
  });

  it('normalizes range "Ps.148.4-Ps.148.5"', () => {
    expect(normalizeOpenBibleRef('Ps.148.4-Ps.148.5')).toBe('Psalms 148:4-5');
  });

  it('normalizes "Matt.28.19"', () => {
    expect(normalizeOpenBibleRef('Matt.28.19')).toBe('Matthew 28:19');
  });
});

describe('toRomanNumeral', () => {
  it('converts 1 to "i"', () => {
    expect(toRomanNumeral(1)).toBe('i');
  });

  it('converts 3 to "iii"', () => {
    expect(toRomanNumeral(3)).toBe('iii');
  });

  it('converts 4 to "iv"', () => {
    expect(toRomanNumeral(4)).toBe('iv');
  });

  it('converts 9 to "ix"', () => {
    expect(toRomanNumeral(9)).toBe('ix');
  });

  it('converts 14 to "xiv"', () => {
    expect(toRomanNumeral(14)).toBe('xiv');
  });

  it('converts 50 to "l"', () => {
    expect(toRomanNumeral(50)).toBe('l');
  });

  it('converts 150 to "cl"', () => {
    expect(toRomanNumeral(150)).toBe('cl');
  });

  it('throws on 0', () => {
    expect(() => toRomanNumeral(0)).toThrow();
  });

  it('throws on 151', () => {
    expect(() => toRomanNumeral(151)).toThrow();
  });
});
