/**
 * HelloAO Reference Mapper
 *
 * Maps Bible references to HelloAO API format
 * HelloAO uses full book names and Arabic chapter numbers (simpler than CCEL!)
 */

import { parseReference, type ParsedReference } from './commentaryMapper.js';

/**
 * HelloAO book code mappings (for commentary endpoints)
 * HelloAO commentaries use 3-letter book codes (GEN, JOH, etc.)
 */
const HELLOAO_BOOK_CODES: Record<string, string> = {
  // Old Testament
  'genesis': 'GEN',
  'gen': 'GEN',
  'exodus': 'EXO',
  'exod': 'EXO',
  'ex': 'EXO',
  'leviticus': 'LEV',
  'lev': 'LEV',
  'numbers': 'NUM',
  'num': 'NUM',
  'deuteronomy': 'DEU',
  'deut': 'DEU',
  'joshua': 'JOS',
  'josh': 'JOS',
  'judges': 'JDG',
  'judg': 'JDG',
  'ruth': 'RUT',
  '1 samuel': '1SA',
  '1sam': '1SA',
  '2 samuel': '2SA',
  '2sam': '2SA',
  '1 kings': '1KI',
  '1kgs': '1KI',
  '2 kings': '2KI',
  '2kgs': '2KI',
  '1 chronicles': '1CH',
  '1chr': '1CH',
  '2 chronicles': '2CH',
  '2chr': '2CH',
  'ezra': 'EZR',
  'nehemiah': 'NEH',
  'neh': 'NEH',
  'esther': 'EST',
  'esth': 'EST',
  'job': 'JOB',
  'psalm': 'PSA',
  'psalms': 'PSA',
  'ps': 'PSA',
  'proverbs': 'PRO',
  'prov': 'PRO',
  'ecclesiastes': 'ECC',
  'eccl': 'ECC',
  'song of solomon': 'SNG',
  'song of songs': 'SNG',
  'songs': 'SNG',
  'song': 'SNG',
  'isaiah': 'ISA',
  'isa': 'ISA',
  'jeremiah': 'JER',
  'jer': 'JER',
  'lamentations': 'LAM',
  'lam': 'LAM',
  'ezekiel': 'EZK',
  'ezek': 'EZK',
  'daniel': 'DAN',
  'dan': 'DAN',
  'hosea': 'HOS',
  'hos': 'HOS',
  'joel': 'JOL',
  'amos': 'AMO',
  'obadiah': 'OBA',
  'obad': 'OBA',
  'jonah': 'JON',
  'micah': 'MIC',
  'mic': 'MIC',
  'nahum': 'NAM',
  'nah': 'NAM',
  'habakkuk': 'HAB',
  'hab': 'HAB',
  'zephaniah': 'ZEP',
  'zeph': 'ZEP',
  'haggai': 'HAG',
  'hag': 'HAG',
  'zechariah': 'ZEC',
  'zech': 'ZEC',
  'malachi': 'MAL',
  'mal': 'MAL',

  // New Testament
  'matthew': 'MAT',
  'matt': 'MAT',
  'mt': 'MAT',
  'mark': 'MRK',
  'mk': 'MRK',
  'luke': 'LUK',
  'lk': 'LUK',
  'john': 'JHN',
  'jn': 'JHN',
  'acts': 'ACT',
  'romans': 'ROM',
  'rom': 'ROM',
  '1 corinthians': '1CO',
  '1cor': '1CO',
  '2 corinthians': '2CO',
  '2cor': '2CO',
  'galatians': 'GAL',
  'gal': 'GAL',
  'ephesians': 'EPH',
  'eph': 'EPH',
  'philippians': 'PHP',
  'phil': 'PHP',
  'colossians': 'COL',
  'col': 'COL',
  '1 thessalonians': '1TH',
  '1thess': '1TH',
  '2 thessalonians': '2TH',
  '2thess': '2TH',
  '1 timothy': '1TI',
  '1tim': '1TI',
  '2 timothy': '2TI',
  '2tim': '2TI',
  'titus': 'TIT',
  'philemon': 'PHM',
  'phlm': 'PHM',
  'hebrews': 'HEB',
  'heb': 'HEB',
  'james': 'JAS',
  'jas': 'JAS',
  '1 peter': '1PE',
  '1pet': '1PE',
  '2 peter': '2PE',
  '2pet': '2PE',
  '1 john': '1JN',
  '1john': '1JN',
  '2 john': '2JN',
  '2john': '2JN',
  '3 john': '3JN',
  '3john': '3JN',
  'jude': 'JUD',
  'revelation': 'REV',
  'rev': 'REV'
};

/**
 * HelloAO book name mappings (for translation endpoints)
 * HelloAO translations use full book names
 */
const HELLOAO_BOOK_NAMES: Record<string, string> = {
  // Old Testament
  'genesis': 'Genesis',
  'gen': 'Genesis',
  'exodus': 'Exodus',
  'exod': 'Exodus',
  'ex': 'Exodus',
  'leviticus': 'Leviticus',
  'lev': 'Leviticus',
  'numbers': 'Numbers',
  'num': 'Numbers',
  'deuteronomy': 'Deuteronomy',
  'deut': 'Deuteronomy',
  'joshua': 'Joshua',
  'josh': 'Joshua',
  'judges': 'Judges',
  'judg': 'Judges',
  'ruth': 'Ruth',
  '1 samuel': '1 Samuel',
  '1sam': '1 Samuel',
  '2 samuel': '2 Samuel',
  '2sam': '2 Samuel',
  '1 kings': '1 Kings',
  '1kgs': '1 Kings',
  '2 kings': '2 Kings',
  '2kgs': '2 Kings',
  '1 chronicles': '1 Chronicles',
  '1chr': '1 Chronicles',
  '2 chronicles': '2 Chronicles',
  '2chr': '2 Chronicles',
  'ezra': 'Ezra',
  'nehemiah': 'Nehemiah',
  'neh': 'Nehemiah',
  'esther': 'Esther',
  'esth': 'Esther',
  'job': 'Job',
  'psalm': 'Psalms',
  'psalms': 'Psalms',
  'ps': 'Psalms',
  'proverbs': 'Proverbs',
  'prov': 'Proverbs',
  'ecclesiastes': 'Ecclesiastes',
  'eccl': 'Ecclesiastes',
  'song of solomon': 'Song of Songs',
  'song of songs': 'Song of Songs',
  'songs': 'Song of Songs',
  'song': 'Song of Songs',
  'isaiah': 'Isaiah',
  'isa': 'Isaiah',
  'jeremiah': 'Jeremiah',
  'jer': 'Jeremiah',
  'lamentations': 'Lamentations',
  'lam': 'Lamentations',
  'ezekiel': 'Ezekiel',
  'ezek': 'Ezekiel',
  'daniel': 'Daniel',
  'dan': 'Daniel',
  'hosea': 'Hosea',
  'hos': 'Hosea',
  'joel': 'Joel',
  'amos': 'Amos',
  'obadiah': 'Obadiah',
  'obad': 'Obadiah',
  'jonah': 'Jonah',
  'micah': 'Micah',
  'mic': 'Micah',
  'nahum': 'Nahum',
  'nah': 'Nahum',
  'habakkuk': 'Habakkuk',
  'hab': 'Habakkuk',
  'zephaniah': 'Zephaniah',
  'zeph': 'Zephaniah',
  'haggai': 'Haggai',
  'hag': 'Haggai',
  'zechariah': 'Zechariah',
  'zech': 'Zechariah',
  'malachi': 'Malachi',
  'mal': 'Malachi',

  // New Testament
  'matthew': 'Matthew',
  'matt': 'Matthew',
  'mt': 'Matthew',
  'mark': 'Mark',
  'mk': 'Mark',
  'luke': 'Luke',
  'lk': 'Luke',
  'john': 'John',
  'jn': 'John',
  'acts': 'Acts',
  'romans': 'Romans',
  'rom': 'Romans',
  '1 corinthians': '1 Corinthians',
  '1cor': '1 Corinthians',
  '2 corinthians': '2 Corinthians',
  '2cor': '2 Corinthians',
  'galatians': 'Galatians',
  'gal': 'Galatians',
  'ephesians': 'Ephesians',
  'eph': 'Ephesians',
  'philippians': 'Philippians',
  'phil': 'Philippians',
  'colossians': 'Colossians',
  'col': 'Colossians',
  '1 thessalonians': '1 Thessalonians',
  '1thess': '1 Thessalonians',
  '2 thessalonians': '2 Thessalonians',
  '2thess': '2 Thessalonians',
  '1 timothy': '1 Timothy',
  '1tim': '1 Timothy',
  '2 timothy': '2 Timothy',
  '2tim': '2 Timothy',
  'titus': 'Titus',
  'philemon': 'Philemon',
  'phlm': 'Philemon',
  'hebrews': 'Hebrews',
  'heb': 'Hebrews',
  'james': 'James',
  'jas': 'James',
  '1 peter': '1 Peter',
  '1pet': '1 Peter',
  '2 peter': '2 Peter',
  '2pet': '2 Peter',
  '1 john': '1 John',
  '1john': '1 John',
  '2 john': '2 John',
  '2john': '2 John',
  '3 john': '3 John',
  '3john': '3 John',
  'jude': 'Jude',
  'revelation': 'Revelation',
  'rev': 'Revelation'
};

/**
 * HelloAO commentary ID mappings
 */
const COMMENTARY_IDS: Record<string, string> = {
  'matthew henry': 'matthew-henry',
  'matthew henry complete': 'matthew-henry',
  'matthew henry concise': 'matthew-henry', // HelloAO only has complete
  'jamieson-fausset-brown': 'jamieson-fausset-brown',
  'jamieson fausset brown': 'jamieson-fausset-brown',
  'jfb': 'jamieson-fausset-brown',
  'adam clarke': 'adam-clarke',
  'clarke': 'adam-clarke',
  'john gill': 'john-gill',
  'gill': 'john-gill',
  'keil-delitzsch': 'keil-delitzsch',
  'keil delitzsch': 'keil-delitzsch',
  'tyndale': 'tyndale',
  'tyndale open study notes': 'tyndale'
};

/**
 * HelloAO reference mapping result
 */
export interface HelloAOReference {
  book: string;
  bookCode: string;  // 3-letter code for commentaries
  chapter: number;
  verse?: number;
  endVerse?: number;
}

/**
 * Map a Bible reference to HelloAO format
 *
 * @param reference - Bible reference (e.g., "John 3:16", "Genesis 1:1")
 * @returns HelloAO-formatted reference with both full name and code
 *
 * @example
 * ```typescript
 * mapReferenceToHelloAO("John 3:16")
 * // Returns: { book: 'John', bookCode: 'JHN', chapter: 3, verse: 16 }
 * ```
 */
export function mapReferenceToHelloAO(reference: string): HelloAOReference {
  const parsed = parseReference(reference);
  const helloaoBook = mapBookNameToHelloAO(parsed.book);
  const helloaoBookCode = mapBookNameToHelloAOCode(parsed.book);

  return {
    book: helloaoBook,
    bookCode: helloaoBookCode,
    chapter: parsed.chapter,
    verse: parsed.verse,
    endVerse: parsed.endVerse
  };
}

/**
 * Map a book name to HelloAO full name format (for translations)
 *
 * @param bookName - Book name in any common format
 * @returns HelloAO book name
 *
 * @example
 * ```typescript
 * mapBookNameToHelloAO("Psalm")  // Returns: "Psalms"
 * mapBookNameToHelloAO("1 Cor")  // Returns: "1 Corinthians"
 * ```
 */
export function mapBookNameToHelloAO(bookName: string): string {
  const normalized = bookName.toLowerCase().trim();
  const helloaoName = HELLOAO_BOOK_NAMES[normalized];

  if (!helloaoName) {
    throw new Error(`Unknown book name: "${bookName}". Cannot map to HelloAO format.`);
  }

  return helloaoName;
}

/**
 * Map a book name to HelloAO code format (for commentaries)
 *
 * @param bookName - Book name in any common format
 * @returns HelloAO book code (3 letters)
 *
 * @example
 * ```typescript
 * mapBookNameToHelloAOCode("John")    // Returns: "JHN"
 * mapBookNameToHelloAOCode("Genesis") // Returns: "GEN"
 * ```
 */
export function mapBookNameToHelloAOCode(bookName: string): string {
  const normalized = bookName.toLowerCase().trim();
  const helloaoCode = HELLOAO_BOOK_CODES[normalized];

  if (!helloaoCode) {
    throw new Error(`Unknown book name: "${bookName}". Cannot map to HelloAO code format.`);
  }

  return helloaoCode;
}

/**
 * Get HelloAO commentary ID from commentator name
 *
 * @param commentator - Commentator name (e.g., "Matthew Henry", "JFB")
 * @returns HelloAO commentary ID
 *
 * @example
 * ```typescript
 * getHelloAOCommentaryId("Matthew Henry")  // Returns: "matthew-henry"
 * getHelloAOCommentaryId("JFB")            // Returns: "jamieson-fausset-brown"
 * ```
 */
export function getHelloAOCommentaryId(commentator: string): string {
  const normalized = commentator.toLowerCase().trim();
  const commentaryId = COMMENTARY_IDS[normalized];

  if (!commentaryId) {
    throw new Error(
      `Unknown commentator: "${commentator}". ` +
      `Available: Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch, Tyndale`
    );
  }

  return commentaryId;
}

/**
 * Get available HelloAO commentators
 */
export function getAvailableHelloAOCommentators(): string[] {
  return [
    'Matthew Henry',
    'Jamieson-Fausset-Brown',
    'Adam Clarke',
    'John Gill',
    'Keil-Delitzsch',
    'Tyndale'
  ];
}

/**
 * Check if a book is Old Testament (for Keil-Delitzsch validation)
 */
export function isOldTestament(bookName: string): boolean {
  const helloaoBook = mapBookNameToHelloAO(bookName);

  const oldTestamentBooks = [
    'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
    'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
    '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther',
    'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Songs',
    'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel',
    'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah',
    'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi'
  ];

  return oldTestamentBooks.includes(helloaoBook);
}

/**
 * Validate commentator supports the book
 * (Keil-Delitzsch is OT only)
 */
export function validateCommentatorSupportsBook(commentator: string, bookName: string): void {
  const commentaryId = getHelloAOCommentaryId(commentator);

  if (commentaryId === 'keil-delitzsch' && !isOldTestament(bookName)) {
    throw new Error(
      `Keil-Delitzsch commentary is only available for Old Testament books. ` +
      `"${bookName}" is a New Testament book. Try Matthew Henry or JFB instead.`
    );
  }
}
