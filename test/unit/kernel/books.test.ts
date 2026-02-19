import { describe, it, expect } from 'vitest';
import {
  BIBLE_BOOKS,
  findBook,
  findBookByHelloaoCode,
  findBookByAbbreviation,
  findBookByStepbibleId,
  findBookByNumber,
  getOTBooks,
  getNTBooks,
} from '../../../src/kernel/books.js';

describe('BIBLE_BOOKS data integrity', () => {
  it('contains exactly 66 books', () => {
    expect(BIBLE_BOOKS).toHaveLength(66);
  });

  it('has sequential book numbers 1–66', () => {
    BIBLE_BOOKS.forEach((book, i) => {
      expect(book.number).toBe(i + 1);
    });
  });

  it('has 39 OT books and 27 NT books', () => {
    const ot = BIBLE_BOOKS.filter(b => b.testament === 'OT');
    const nt = BIBLE_BOOKS.filter(b => b.testament === 'NT');
    expect(ot).toHaveLength(39);
    expect(nt).toHaveLength(27);
  });

  it('every book has a unique helloaoCode', () => {
    const codes = BIBLE_BOOKS.map(b => b.helloaoCode);
    expect(new Set(codes).size).toBe(66);
  });

  it('every book has a unique stepbibleId', () => {
    const ids = BIBLE_BOOKS.map(b => b.stepbibleId);
    expect(new Set(ids).size).toBe(66);
  });

  it('every book has a unique abbreviation', () => {
    const abbrevs = BIBLE_BOOKS.map(b => b.abbreviation);
    expect(new Set(abbrevs).size).toBe(66);
  });

  it('every book has at least one alias', () => {
    BIBLE_BOOKS.forEach(book => {
      expect(book.aliases.length).toBeGreaterThan(0);
    });
  });

  it('every alias is lowercase', () => {
    BIBLE_BOOKS.forEach(book => {
      book.aliases.forEach(alias => {
        expect(alias).toBe(alias.toLowerCase());
      });
    });
  });

  it('MHC volumes are 1–6', () => {
    BIBLE_BOOKS.forEach(book => {
      expect(book.mhcVolume).toBeGreaterThanOrEqual(1);
      expect(book.mhcVolume).toBeLessThanOrEqual(6);
    });
  });
});

describe('findBook', () => {
  it('finds by full name', () => {
    expect(findBook('Genesis')?.name).toBe('Genesis');
    expect(findBook('Revelation')?.name).toBe('Revelation');
  });

  it('finds by lowercase name', () => {
    expect(findBook('genesis')?.name).toBe('Genesis');
    expect(findBook('revelation')?.name).toBe('Revelation');
  });

  it('finds by common abbreviation', () => {
    expect(findBook('Gen')?.name).toBe('Genesis');
    expect(findBook('Rev')?.name).toBe('Revelation');
    expect(findBook('Jn')?.name).toBe('John');
    expect(findBook('Ps')?.name).toBe('Psalms');
  });

  it('finds numbered books', () => {
    expect(findBook('1 Samuel')?.name).toBe('1 Samuel');
    expect(findBook('1sam')?.name).toBe('1 Samuel');
    expect(findBook('1sa')?.name).toBe('1 Samuel');
    expect(findBook('2 Kings')?.name).toBe('2 Kings');
    expect(findBook('1 John')?.name).toBe('1 John');
    expect(findBook('3 John')?.name).toBe('3 John');
  });

  it('finds Song of Solomon by various names', () => {
    const expected = 'Song of Solomon';
    expect(findBook('Song of Solomon')?.name).toBe(expected);
    expect(findBook('Song of Songs')?.name).toBe(expected);
    expect(findBook('song')?.name).toBe(expected);
    expect(findBook('songs')?.name).toBe(expected);
    expect(findBook('sos')?.name).toBe(expected);
  });

  it('handles Psalm/Psalms', () => {
    expect(findBook('psalm')?.name).toBe('Psalms');
    expect(findBook('psalms')?.name).toBe('Psalms');
    expect(findBook('ps')?.name).toBe('Psalms');
  });

  it('returns undefined for unknown books', () => {
    expect(findBook('NotABook')).toBeUndefined();
    expect(findBook('')).toBeUndefined();
  });

  it('trims whitespace', () => {
    expect(findBook('  Genesis  ')?.name).toBe('Genesis');
  });
});

describe('findBookByHelloaoCode', () => {
  it('finds Genesis by GEN', () => {
    expect(findBookByHelloaoCode('GEN')?.name).toBe('Genesis');
  });

  it('finds John by JHN', () => {
    expect(findBookByHelloaoCode('JHN')?.name).toBe('John');
  });

  it('is case insensitive', () => {
    expect(findBookByHelloaoCode('gen')?.name).toBe('Genesis');
  });
});

describe('findBookByAbbreviation', () => {
  it('finds by OpenBible abbreviation', () => {
    expect(findBookByAbbreviation('Gen')?.name).toBe('Genesis');
    expect(findBookByAbbreviation('1Sam')?.name).toBe('1 Samuel');
    expect(findBookByAbbreviation('Rev')?.name).toBe('Revelation');
  });
});

describe('findBookByStepbibleId', () => {
  it('finds by STEPBible ID', () => {
    expect(findBookByStepbibleId('Genesis')?.name).toBe('Genesis');
    expect(findBookByStepbibleId('1Samuel')?.name).toBe('1 Samuel');
    expect(findBookByStepbibleId('SongOfSolomon')?.name).toBe('Song of Solomon');
  });
});

describe('findBookByNumber', () => {
  it('finds Genesis (1) and Revelation (66)', () => {
    expect(findBookByNumber(1)?.name).toBe('Genesis');
    expect(findBookByNumber(66)?.name).toBe('Revelation');
  });

  it('returns undefined for out-of-range', () => {
    expect(findBookByNumber(0)).toBeUndefined();
    expect(findBookByNumber(67)).toBeUndefined();
  });
});

describe('getOTBooks / getNTBooks', () => {
  it('OT books start with Genesis and end with Malachi', () => {
    const ot = getOTBooks();
    expect(ot[0].name).toBe('Genesis');
    expect(ot[ot.length - 1].name).toBe('Malachi');
  });

  it('NT books start with Matthew and end with Revelation', () => {
    const nt = getNTBooks();
    expect(nt[0].name).toBe('Matthew');
    expect(nt[nt.length - 1].name).toBe('Revelation');
  });
});
