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

/**
 * Canonical chapter/verse bounds for the 66-book Protestant canon.
 *
 * The value at index `chapter - 1` is the highest verse number in that
 * chapter.  These bounds are deliberately kept in the shared kernel so
 * every transport and every provider rejects an impossible reference before
 * it can be normalized to a different passage.
 */
export interface BibleBookBounds {
  readonly maxVerseByChapter: readonly number[];
}

export const BIBLE_BOOK_BOUNDS: Readonly<Record<number, BibleBookBounds>> = {
  1: { maxVerseByChapter: [31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26] },
  2: { maxVerseByChapter: [22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38] },
  3: { maxVerseByChapter: [17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34] },
  4: { maxVerseByChapter: [54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13] },
  5: { maxVerseByChapter: [46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12] },
  6: { maxVerseByChapter: [18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33] },
  7: { maxVerseByChapter: [36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25] },
  8: { maxVerseByChapter: [22,23,18,22] },
  9: { maxVerseByChapter: [28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13] },
  10: { maxVerseByChapter: [27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25] },
  11: { maxVerseByChapter: [53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53] },
  12: { maxVerseByChapter: [18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30] },
  13: { maxVerseByChapter: [54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30] },
  14: { maxVerseByChapter: [17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23] },
  15: { maxVerseByChapter: [11,70,13,24,17,22,28,36,15,44] },
  16: { maxVerseByChapter: [11,20,32,23,19,19,73,18,38,39,36,47,31] },
  17: { maxVerseByChapter: [22,23,15,17,14,14,10,17,32,3] },
  18: { maxVerseByChapter: [22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17] },
  19: { maxVerseByChapter: [6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6] },
  20: { maxVerseByChapter: [33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31] },
  21: { maxVerseByChapter: [18,26,22,16,20,12,29,17,18,20,10,14] },
  22: { maxVerseByChapter: [17,17,11,16,16,13,13,14] },
  23: { maxVerseByChapter: [31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24] },
  24: { maxVerseByChapter: [19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34] },
  25: { maxVerseByChapter: [22,22,66,22,22] },
  26: { maxVerseByChapter: [28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35] },
  27: { maxVerseByChapter: [21,49,30,37,31,28,28,27,27,21,45,13] },
  28: { maxVerseByChapter: [11,23,5,19,15,11,16,14,17,15,12,14,16,9] },
  29: { maxVerseByChapter: [20,32,21] },
  30: { maxVerseByChapter: [15,16,15,13,27,14,17,14,15] },
  31: { maxVerseByChapter: [21] },
  32: { maxVerseByChapter: [17,10,10,11] },
  33: { maxVerseByChapter: [16,13,12,13,15,16,20] },
  34: { maxVerseByChapter: [15,13,19] },
  35: { maxVerseByChapter: [17,20,19] },
  36: { maxVerseByChapter: [18,15,20] },
  37: { maxVerseByChapter: [15,23] },
  38: { maxVerseByChapter: [21,13,10,14,11,15,14,23,17,12,17,14,9,21] },
  39: { maxVerseByChapter: [14,17,18,6] },
  40: { maxVerseByChapter: [25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20] },
  41: { maxVerseByChapter: [45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20] },
  42: { maxVerseByChapter: [80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53] },
  43: { maxVerseByChapter: [51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25] },
  44: { maxVerseByChapter: [26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31] },
  45: { maxVerseByChapter: [32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27] },
  46: { maxVerseByChapter: [31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24] },
  47: { maxVerseByChapter: [24,17,18,18,21,18,16,24,15,18,33,21,13] },
  48: { maxVerseByChapter: [24,21,29,31,26,18] },
  49: { maxVerseByChapter: [23,22,21,32,33,24] },
  50: { maxVerseByChapter: [30,30,21,23] },
  51: { maxVerseByChapter: [29,23,25,18] },
  52: { maxVerseByChapter: [10,20,13,18,28] },
  53: { maxVerseByChapter: [12,17,18] },
  54: { maxVerseByChapter: [20,15,16,16,25,21] },
  55: { maxVerseByChapter: [18,26,17,22] },
  56: { maxVerseByChapter: [16,15,15] },
  57: { maxVerseByChapter: [25] },
  58: { maxVerseByChapter: [14,18,19,16,14,20,28,13,28,39,40,29,25] },
  59: { maxVerseByChapter: [27,26,18,17,20] },
  60: { maxVerseByChapter: [25,25,22,19,14] },
  61: { maxVerseByChapter: [21,22,18] },
  62: { maxVerseByChapter: [10,29,24,21,21] },
  63: { maxVerseByChapter: [13] },
  64: { maxVerseByChapter: [15] },
  65: { maxVerseByChapter: [25] },
  66: { maxVerseByChapter: [20,29,22,11,14,17,17,13,21,11,19,18,18,20,8,21,18,24,21,15,27,21] },
};

/** Return canonical chapter/verse bounds for a book. */
export function getBibleBookBounds(book: BibleBook): BibleBookBounds {
  const bounds = BIBLE_BOOK_BOUNDS[book.number];
  if (!bounds) throw new Error(`Missing canonical bounds for ${book.name}`);
  return bounds;
}

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
