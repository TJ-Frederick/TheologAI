/**
 * Single source of truth for all 66 Bible books.
 *
 * Replaces 5+ duplicated book-mapping schemes across the codebase:
 *   - crossReferenceService.ts (OpenBible abbreviations)
 *   - helloaoMapper.ts (HelloAO 3-letter codes + display names)
 *   - commentaryMapper.ts (CCEL abbreviations + MHC volumes)
 *   - biblicalLanguagesAdapter.ts (STEPBible format — no spaces)
 *   - localData.ts (ad-hoc book matching)
 */

export interface BibleBook {
  /** Book number 1–66 */
  number: number;
  /** Canonical display name, e.g. "Genesis", "1 Samuel", "Song of Solomon" */
  name: string;
  /** 'OT' or 'NT' */
  testament: 'OT' | 'NT';
  /** Primary abbreviation (used in cross-reference data), e.g. "Gen", "1Sam" */
  abbreviation: string;
  /** HelloAO 3-letter code, e.g. "GEN", "1SA" */
  helloaoCode: string;
  /** CCEL abbreviation for Matthew Henry paths, e.g. "Gen", "iSam" */
  ccelAbbrev: string;
  /** Matthew Henry Commentary volume (1–6) */
  mhcVolume: number;
  /** STEPBible ID (no spaces in numbered books), e.g. "Genesis", "1Samuel" */
  stepbibleId: string;
  /** All recognized aliases (lowercase), including name, abbreviation, and common variants */
  aliases: string[];
}

/**
 * The canonical book list. Order matches Protestant canon (1–66).
 */
export const BIBLE_BOOKS: readonly BibleBook[] = [
  // ── Volume 1: Genesis – Deuteronomy ──
  { number: 1,  name: 'Genesis',       testament: 'OT', abbreviation: 'Gen',   helloaoCode: 'GEN', ccelAbbrev: 'Gen',   mhcVolume: 1, stepbibleId: 'Genesis',       aliases: ['genesis', 'gen'] },
  { number: 2,  name: 'Exodus',        testament: 'OT', abbreviation: 'Exod',  helloaoCode: 'EXO', ccelAbbrev: 'Exod',  mhcVolume: 1, stepbibleId: 'Exodus',        aliases: ['exodus', 'exod', 'ex', 'exo'] },
  { number: 3,  name: 'Leviticus',     testament: 'OT', abbreviation: 'Lev',   helloaoCode: 'LEV', ccelAbbrev: 'Lev',   mhcVolume: 1, stepbibleId: 'Leviticus',     aliases: ['leviticus', 'lev'] },
  { number: 4,  name: 'Numbers',       testament: 'OT', abbreviation: 'Num',   helloaoCode: 'NUM', ccelAbbrev: 'Num',   mhcVolume: 1, stepbibleId: 'Numbers',       aliases: ['numbers', 'num', 'numb'] },
  { number: 5,  name: 'Deuteronomy',   testament: 'OT', abbreviation: 'Deut',  helloaoCode: 'DEU', ccelAbbrev: 'Deut',  mhcVolume: 1, stepbibleId: 'Deuteronomy',   aliases: ['deuteronomy', 'deut', 'deu'] },

  // ── Volume 2: Joshua – Esther ──
  { number: 6,  name: 'Joshua',        testament: 'OT', abbreviation: 'Josh',  helloaoCode: 'JOS', ccelAbbrev: 'Josh',  mhcVolume: 2, stepbibleId: 'Joshua',        aliases: ['joshua', 'josh', 'jos'] },
  { number: 7,  name: 'Judges',        testament: 'OT', abbreviation: 'Judg',  helloaoCode: 'JDG', ccelAbbrev: 'Judg',  mhcVolume: 2, stepbibleId: 'Judges',        aliases: ['judges', 'judg', 'jdg'] },
  { number: 8,  name: 'Ruth',          testament: 'OT', abbreviation: 'Ruth',  helloaoCode: 'RUT', ccelAbbrev: 'Ruth',  mhcVolume: 2, stepbibleId: 'Ruth',          aliases: ['ruth', 'rut'] },
  { number: 9,  name: '1 Samuel',      testament: 'OT', abbreviation: '1Sam',  helloaoCode: '1SA', ccelAbbrev: 'iSam',  mhcVolume: 2, stepbibleId: '1Samuel',       aliases: ['1 samuel', '1samuel', '1sam', '1sa'] },
  { number: 10, name: '2 Samuel',      testament: 'OT', abbreviation: '2Sam',  helloaoCode: '2SA', ccelAbbrev: 'iiSam', mhcVolume: 2, stepbibleId: '2Samuel',       aliases: ['2 samuel', '2samuel', '2sam', '2sa'] },
  { number: 11, name: '1 Kings',       testament: 'OT', abbreviation: '1Kgs',  helloaoCode: '1KI', ccelAbbrev: 'iKgs',  mhcVolume: 2, stepbibleId: '1Kings',        aliases: ['1 kings', '1kings', '1kgs', '1kin', '1ki'] },
  { number: 12, name: '2 Kings',       testament: 'OT', abbreviation: '2Kgs',  helloaoCode: '2KI', ccelAbbrev: 'iiKgs', mhcVolume: 2, stepbibleId: '2Kings',        aliases: ['2 kings', '2kings', '2kgs', '2kin', '2ki'] },
  { number: 13, name: '1 Chronicles',  testament: 'OT', abbreviation: '1Chr',  helloaoCode: '1CH', ccelAbbrev: 'iChr',  mhcVolume: 2, stepbibleId: '1Chronicles',   aliases: ['1 chronicles', '1chronicles', '1chr', '1ch'] },
  { number: 14, name: '2 Chronicles',  testament: 'OT', abbreviation: '2Chr',  helloaoCode: '2CH', ccelAbbrev: 'iiChr', mhcVolume: 2, stepbibleId: '2Chronicles',   aliases: ['2 chronicles', '2chronicles', '2chr', '2ch'] },
  { number: 15, name: 'Ezra',          testament: 'OT', abbreviation: 'Ezra',  helloaoCode: 'EZR', ccelAbbrev: 'Ezra',  mhcVolume: 2, stepbibleId: 'Ezra',          aliases: ['ezra', 'ezr'] },
  { number: 16, name: 'Nehemiah',      testament: 'OT', abbreviation: 'Neh',   helloaoCode: 'NEH', ccelAbbrev: 'Neh',   mhcVolume: 2, stepbibleId: 'Nehemiah',      aliases: ['nehemiah', 'neh'] },
  { number: 17, name: 'Esther',        testament: 'OT', abbreviation: 'Esth',  helloaoCode: 'EST', ccelAbbrev: 'Esth',  mhcVolume: 2, stepbibleId: 'Esther',        aliases: ['esther', 'esth', 'est'] },

  // ── Volume 3: Job – Song of Solomon ──
  { number: 18, name: 'Job',           testament: 'OT', abbreviation: 'Job',   helloaoCode: 'JOB', ccelAbbrev: 'Job',   mhcVolume: 3, stepbibleId: 'Job',           aliases: ['job'] },
  { number: 19, name: 'Psalms',        testament: 'OT', abbreviation: 'Ps',    helloaoCode: 'PSA', ccelAbbrev: 'Ps',    mhcVolume: 3, stepbibleId: 'Psalms',        aliases: ['psalms', 'psalm', 'ps', 'psa'] },
  { number: 20, name: 'Proverbs',      testament: 'OT', abbreviation: 'Prov',  helloaoCode: 'PRO', ccelAbbrev: 'Prov',  mhcVolume: 3, stepbibleId: 'Proverbs',      aliases: ['proverbs', 'prov', 'pro'] },
  { number: 21, name: 'Ecclesiastes',  testament: 'OT', abbreviation: 'Eccl',  helloaoCode: 'ECC', ccelAbbrev: 'Eccl',  mhcVolume: 3, stepbibleId: 'Ecclesiastes',  aliases: ['ecclesiastes', 'eccl', 'ecc'] },
  { number: 22, name: 'Song of Solomon', testament: 'OT', abbreviation: 'Song', helloaoCode: 'SNG', ccelAbbrev: 'Song', mhcVolume: 3, stepbibleId: 'SongOfSolomon', aliases: ['song of solomon', 'song of songs', 'songofsolomon', 'songofssongs', 'songs', 'song', 'sos', 'son'] },

  // ── Volume 4: Isaiah – Malachi ──
  { number: 23, name: 'Isaiah',        testament: 'OT', abbreviation: 'Isa',   helloaoCode: 'ISA', ccelAbbrev: 'Isa',   mhcVolume: 4, stepbibleId: 'Isaiah',        aliases: ['isaiah', 'isa'] },
  { number: 24, name: 'Jeremiah',      testament: 'OT', abbreviation: 'Jer',   helloaoCode: 'JER', ccelAbbrev: 'Jer',   mhcVolume: 4, stepbibleId: 'Jeremiah',      aliases: ['jeremiah', 'jer'] },
  { number: 25, name: 'Lamentations',  testament: 'OT', abbreviation: 'Lam',   helloaoCode: 'LAM', ccelAbbrev: 'Lam',   mhcVolume: 4, stepbibleId: 'Lamentations',  aliases: ['lamentations', 'lam'] },
  { number: 26, name: 'Ezekiel',       testament: 'OT', abbreviation: 'Ezek',  helloaoCode: 'EZK', ccelAbbrev: 'Ezek',  mhcVolume: 4, stepbibleId: 'Ezekiel',       aliases: ['ezekiel', 'ezek', 'eze'] },
  { number: 27, name: 'Daniel',        testament: 'OT', abbreviation: 'Dan',   helloaoCode: 'DAN', ccelAbbrev: 'Dan',   mhcVolume: 4, stepbibleId: 'Daniel',        aliases: ['daniel', 'dan'] },
  { number: 28, name: 'Hosea',         testament: 'OT', abbreviation: 'Hos',   helloaoCode: 'HOS', ccelAbbrev: 'Hos',   mhcVolume: 4, stepbibleId: 'Hosea',         aliases: ['hosea', 'hos'] },
  { number: 29, name: 'Joel',          testament: 'OT', abbreviation: 'Joel',  helloaoCode: 'JOL', ccelAbbrev: 'Joel',  mhcVolume: 4, stepbibleId: 'Joel',          aliases: ['joel', 'joe'] },
  { number: 30, name: 'Amos',          testament: 'OT', abbreviation: 'Amos',  helloaoCode: 'AMO', ccelAbbrev: 'Amos',  mhcVolume: 4, stepbibleId: 'Amos',          aliases: ['amos', 'amo'] },
  { number: 31, name: 'Obadiah',       testament: 'OT', abbreviation: 'Obad',  helloaoCode: 'OBA', ccelAbbrev: 'Obad',  mhcVolume: 4, stepbibleId: 'Obadiah',       aliases: ['obadiah', 'obad', 'oba'] },
  { number: 32, name: 'Jonah',         testament: 'OT', abbreviation: 'Jonah', helloaoCode: 'JON', ccelAbbrev: 'Jonah', mhcVolume: 4, stepbibleId: 'Jonah',         aliases: ['jonah', 'jon'] },
  { number: 33, name: 'Micah',         testament: 'OT', abbreviation: 'Mic',   helloaoCode: 'MIC', ccelAbbrev: 'Mic',   mhcVolume: 4, stepbibleId: 'Micah',         aliases: ['micah', 'mic'] },
  { number: 34, name: 'Nahum',         testament: 'OT', abbreviation: 'Nah',   helloaoCode: 'NAM', ccelAbbrev: 'Nah',   mhcVolume: 4, stepbibleId: 'Nahum',         aliases: ['nahum', 'nah'] },
  { number: 35, name: 'Habakkuk',      testament: 'OT', abbreviation: 'Hab',   helloaoCode: 'HAB', ccelAbbrev: 'Hab',   mhcVolume: 4, stepbibleId: 'Habakkuk',      aliases: ['habakkuk', 'hab'] },
  { number: 36, name: 'Zephaniah',     testament: 'OT', abbreviation: 'Zeph',  helloaoCode: 'ZEP', ccelAbbrev: 'Zeph',  mhcVolume: 4, stepbibleId: 'Zephaniah',     aliases: ['zephaniah', 'zeph', 'zep'] },
  { number: 37, name: 'Haggai',        testament: 'OT', abbreviation: 'Hag',   helloaoCode: 'HAG', ccelAbbrev: 'Hag',   mhcVolume: 4, stepbibleId: 'Haggai',        aliases: ['haggai', 'hag'] },
  { number: 38, name: 'Zechariah',     testament: 'OT', abbreviation: 'Zech',  helloaoCode: 'ZEC', ccelAbbrev: 'Zech',  mhcVolume: 4, stepbibleId: 'Zechariah',     aliases: ['zechariah', 'zech', 'zec'] },
  { number: 39, name: 'Malachi',       testament: 'OT', abbreviation: 'Mal',   helloaoCode: 'MAL', ccelAbbrev: 'Mal',   mhcVolume: 4, stepbibleId: 'Malachi',       aliases: ['malachi', 'mal'] },

  // ── Volume 5: Matthew – John ──
  { number: 40, name: 'Matthew',       testament: 'NT', abbreviation: 'Matt',  helloaoCode: 'MAT', ccelAbbrev: 'Matt',  mhcVolume: 5, stepbibleId: 'Matthew',       aliases: ['matthew', 'matt', 'mat', 'mt'] },
  { number: 41, name: 'Mark',          testament: 'NT', abbreviation: 'Mark',  helloaoCode: 'MRK', ccelAbbrev: 'Mark',  mhcVolume: 5, stepbibleId: 'Mark',          aliases: ['mark', 'mrk', 'mk'] },
  { number: 42, name: 'Luke',          testament: 'NT', abbreviation: 'Luke',  helloaoCode: 'LUK', ccelAbbrev: 'Luke',  mhcVolume: 5, stepbibleId: 'Luke',          aliases: ['luke', 'luk', 'lk'] },
  { number: 43, name: 'John',          testament: 'NT', abbreviation: 'John',  helloaoCode: 'JHN', ccelAbbrev: 'John',  mhcVolume: 5, stepbibleId: 'John',          aliases: ['john', 'jn', 'jhn'] },

  // ── Volume 6: Acts – Revelation ──
  { number: 44, name: 'Acts',          testament: 'NT', abbreviation: 'Acts',  helloaoCode: 'ACT', ccelAbbrev: 'Acts',  mhcVolume: 6, stepbibleId: 'Acts',          aliases: ['acts', 'act'] },
  { number: 45, name: 'Romans',        testament: 'NT', abbreviation: 'Rom',   helloaoCode: 'ROM', ccelAbbrev: 'Rom',   mhcVolume: 6, stepbibleId: 'Romans',        aliases: ['romans', 'rom'] },
  { number: 46, name: '1 Corinthians', testament: 'NT', abbreviation: '1Cor',  helloaoCode: '1CO', ccelAbbrev: 'iCor',  mhcVolume: 6, stepbibleId: '1Corinthians',  aliases: ['1 corinthians', '1corinthians', '1cor', '1co'] },
  { number: 47, name: '2 Corinthians', testament: 'NT', abbreviation: '2Cor',  helloaoCode: '2CO', ccelAbbrev: 'iiCor', mhcVolume: 6, stepbibleId: '2Corinthians',  aliases: ['2 corinthians', '2corinthians', '2cor', '2co'] },
  { number: 48, name: 'Galatians',     testament: 'NT', abbreviation: 'Gal',   helloaoCode: 'GAL', ccelAbbrev: 'Gal',   mhcVolume: 6, stepbibleId: 'Galatians',     aliases: ['galatians', 'gal'] },
  { number: 49, name: 'Ephesians',     testament: 'NT', abbreviation: 'Eph',   helloaoCode: 'EPH', ccelAbbrev: 'Eph',   mhcVolume: 6, stepbibleId: 'Ephesians',     aliases: ['ephesians', 'eph'] },
  { number: 50, name: 'Philippians',   testament: 'NT', abbreviation: 'Phil',  helloaoCode: 'PHP', ccelAbbrev: 'Phil',  mhcVolume: 6, stepbibleId: 'Philippians',   aliases: ['philippians', 'phil', 'php'] },
  { number: 51, name: 'Colossians',    testament: 'NT', abbreviation: 'Col',   helloaoCode: 'COL', ccelAbbrev: 'Col',   mhcVolume: 6, stepbibleId: 'Colossians',    aliases: ['colossians', 'col'] },
  { number: 52, name: '1 Thessalonians', testament: 'NT', abbreviation: '1Thess', helloaoCode: '1TH', ccelAbbrev: 'iThess',  mhcVolume: 6, stepbibleId: '1Thessalonians', aliases: ['1 thessalonians', '1thessalonians', '1thess', '1th'] },
  { number: 53, name: '2 Thessalonians', testament: 'NT', abbreviation: '2Thess', helloaoCode: '2TH', ccelAbbrev: 'iiThess', mhcVolume: 6, stepbibleId: '2Thessalonians', aliases: ['2 thessalonians', '2thessalonians', '2thess', '2th'] },
  { number: 54, name: '1 Timothy',     testament: 'NT', abbreviation: '1Tim',  helloaoCode: '1TI', ccelAbbrev: 'iTim',  mhcVolume: 6, stepbibleId: '1Timothy',      aliases: ['1 timothy', '1timothy', '1tim', '1ti'] },
  { number: 55, name: '2 Timothy',     testament: 'NT', abbreviation: '2Tim',  helloaoCode: '2TI', ccelAbbrev: 'iiTim', mhcVolume: 6, stepbibleId: '2Timothy',      aliases: ['2 timothy', '2timothy', '2tim', '2ti'] },
  { number: 56, name: 'Titus',         testament: 'NT', abbreviation: 'Titus', helloaoCode: 'TIT', ccelAbbrev: 'Titus', mhcVolume: 6, stepbibleId: 'Titus',         aliases: ['titus', 'tit'] },
  { number: 57, name: 'Philemon',      testament: 'NT', abbreviation: 'Phlm',  helloaoCode: 'PHM', ccelAbbrev: 'Phlm',  mhcVolume: 6, stepbibleId: 'Philemon',      aliases: ['philemon', 'phlm', 'phm'] },
  { number: 58, name: 'Hebrews',       testament: 'NT', abbreviation: 'Heb',   helloaoCode: 'HEB', ccelAbbrev: 'Heb',   mhcVolume: 6, stepbibleId: 'Hebrews',       aliases: ['hebrews', 'heb'] },
  { number: 59, name: 'James',         testament: 'NT', abbreviation: 'Jas',   helloaoCode: 'JAS', ccelAbbrev: 'Jas',   mhcVolume: 6, stepbibleId: 'James',         aliases: ['james', 'jas'] },
  { number: 60, name: '1 Peter',       testament: 'NT', abbreviation: '1Pet',  helloaoCode: '1PE', ccelAbbrev: 'iPet',  mhcVolume: 6, stepbibleId: '1Peter',        aliases: ['1 peter', '1peter', '1pet', '1pe'] },
  { number: 61, name: '2 Peter',       testament: 'NT', abbreviation: '2Pet',  helloaoCode: '2PE', ccelAbbrev: 'iiPet', mhcVolume: 6, stepbibleId: '2Peter',        aliases: ['2 peter', '2peter', '2pet', '2pe'] },
  { number: 62, name: '1 John',        testament: 'NT', abbreviation: '1John', helloaoCode: '1JN', ccelAbbrev: 'iJohn', mhcVolume: 6, stepbibleId: '1John',         aliases: ['1 john', '1john', '1jn'] },
  { number: 63, name: '2 John',        testament: 'NT', abbreviation: '2John', helloaoCode: '2JN', ccelAbbrev: 'iiJohn', mhcVolume: 6, stepbibleId: '2John',        aliases: ['2 john', '2john', '2jn'] },
  { number: 64, name: '3 John',        testament: 'NT', abbreviation: '3John', helloaoCode: '3JN', ccelAbbrev: 'iiiJohn', mhcVolume: 6, stepbibleId: '3John',       aliases: ['3 john', '3john', '3jn'] },
  { number: 65, name: 'Jude',          testament: 'NT', abbreviation: 'Jude',  helloaoCode: 'JUD', ccelAbbrev: 'Jude',  mhcVolume: 6, stepbibleId: 'Jude',          aliases: ['jude', 'jud'] },
  { number: 66, name: 'Revelation',    testament: 'NT', abbreviation: 'Rev',   helloaoCode: 'REV', ccelAbbrev: 'Rev',   mhcVolume: 6, stepbibleId: 'Revelation',    aliases: ['revelation', 'rev'] },
] as const;

// ── Lookup indexes (built once at import time) ──

/** Map from any lowercase alias → BibleBook */
const aliasIndex = new Map<string, BibleBook>();

/** Map from HelloAO code → BibleBook */
const helloaoIndex = new Map<string, BibleBook>();

/** Map from OpenBible abbreviation (case-sensitive) → BibleBook */
const openBibleIndex = new Map<string, BibleBook>();

/** Map from STEPBible ID → BibleBook */
const stepbibleIndex = new Map<string, BibleBook>();

/** Map from book number → BibleBook */
const numberIndex = new Map<number, BibleBook>();

for (const book of BIBLE_BOOKS) {
  for (const alias of book.aliases) {
    aliasIndex.set(alias, book as BibleBook);
  }
  helloaoIndex.set(book.helloaoCode, book as BibleBook);
  openBibleIndex.set(book.abbreviation, book as BibleBook);
  stepbibleIndex.set(book.stepbibleId, book as BibleBook);
  numberIndex.set(book.number, book as BibleBook);
}

/**
 * Resolve any book name/abbreviation to its canonical BibleBook entry.
 * Returns `undefined` if not found (caller decides whether to throw).
 */
export function findBook(input: string): BibleBook | undefined {
  const normalized = input.toLowerCase().trim().replace(/\s+/g, ' ');
  return aliasIndex.get(normalized);
}

/** Find a book by its HelloAO 3-letter code (e.g. "GEN", "JHN") */
export function findBookByHelloaoCode(code: string): BibleBook | undefined {
  return helloaoIndex.get(code.toUpperCase());
}

/** Find a book by its OpenBible abbreviation (e.g. "Gen", "1Sam") */
export function findBookByAbbreviation(abbrev: string): BibleBook | undefined {
  return openBibleIndex.get(abbrev);
}

/** Find a book by its STEPBible ID (e.g. "Genesis", "1Samuel") */
export function findBookByStepbibleId(id: string): BibleBook | undefined {
  return stepbibleIndex.get(id);
}

/** Find a book by number (1–66) */
export function findBookByNumber(num: number): BibleBook | undefined {
  return numberIndex.get(num);
}

/** Get all Old Testament books */
export function getOTBooks(): BibleBook[] {
  return BIBLE_BOOKS.filter(b => b.testament === 'OT') as BibleBook[];
}

/** Get all New Testament books */
export function getNTBooks(): BibleBook[] {
  return BIBLE_BOOKS.filter(b => b.testament === 'NT') as BibleBook[];
}
