/**
 * Commentary Mapper Utility
 *
 * Maps Bible references to CCEL commentary section identifiers
 * for public domain commentaries like Matthew Henry, JFB, etc.
 */

interface BibleBookMapping {
  name: string;
  abbreviation: string;
  ccelAbbrev: string;
  volume: number; // For Matthew Henry's Commentary
  testament: 'OT' | 'NT';
}

/**
 * Complete Bible book mapping with CCEL identifiers and volume assignments
 */
const BIBLE_BOOKS: BibleBookMapping[] = [
  // Volume 1: Genesis - Deuteronomy
  { name: 'Genesis', abbreviation: 'Gen', ccelAbbrev: 'Gen', volume: 1, testament: 'OT' },
  { name: 'Exodus', abbreviation: 'Exod', ccelAbbrev: 'Exod', volume: 1, testament: 'OT' },
  { name: 'Leviticus', abbreviation: 'Lev', ccelAbbrev: 'Lev', volume: 1, testament: 'OT' },
  { name: 'Numbers', abbreviation: 'Num', ccelAbbrev: 'Num', volume: 1, testament: 'OT' },
  { name: 'Deuteronomy', abbreviation: 'Deut', ccelAbbrev: 'Deut', volume: 1, testament: 'OT' },

  // Volume 2: Joshua - Esther
  { name: 'Joshua', abbreviation: 'Josh', ccelAbbrev: 'Josh', volume: 2, testament: 'OT' },
  { name: 'Judges', abbreviation: 'Judg', ccelAbbrev: 'Judg', volume: 2, testament: 'OT' },
  { name: 'Ruth', abbreviation: 'Ruth', ccelAbbrev: 'Ruth', volume: 2, testament: 'OT' },
  { name: '1 Samuel', abbreviation: '1Sam', ccelAbbrev: 'iSam', volume: 2, testament: 'OT' },
  { name: '2 Samuel', abbreviation: '2Sam', ccelAbbrev: 'iiSam', volume: 2, testament: 'OT' },
  { name: '1 Kings', abbreviation: '1Kgs', ccelAbbrev: 'iKgs', volume: 2, testament: 'OT' },
  { name: '2 Kings', abbreviation: '2Kgs', ccelAbbrev: 'iiKgs', volume: 2, testament: 'OT' },
  { name: '1 Chronicles', abbreviation: '1Chr', ccelAbbrev: 'iChr', volume: 2, testament: 'OT' },
  { name: '2 Chronicles', abbreviation: '2Chr', ccelAbbrev: 'iiChr', volume: 2, testament: 'OT' },
  { name: 'Ezra', abbreviation: 'Ezra', ccelAbbrev: 'Ezra', volume: 2, testament: 'OT' },
  { name: 'Nehemiah', abbreviation: 'Neh', ccelAbbrev: 'Neh', volume: 2, testament: 'OT' },
  { name: 'Esther', abbreviation: 'Esth', ccelAbbrev: 'Esth', volume: 2, testament: 'OT' },

  // Volume 3: Job - Song of Solomon
  { name: 'Job', abbreviation: 'Job', ccelAbbrev: 'Job', volume: 3, testament: 'OT' },
  { name: 'Psalms', abbreviation: 'Ps', ccelAbbrev: 'Ps', volume: 3, testament: 'OT' },
  { name: 'Proverbs', abbreviation: 'Prov', ccelAbbrev: 'Prov', volume: 3, testament: 'OT' },
  { name: 'Ecclesiastes', abbreviation: 'Eccl', ccelAbbrev: 'Eccl', volume: 3, testament: 'OT' },
  { name: 'Song of Solomon', abbreviation: 'Song', ccelAbbrev: 'Song', volume: 3, testament: 'OT' },

  // Volume 4: Isaiah - Malachi
  { name: 'Isaiah', abbreviation: 'Isa', ccelAbbrev: 'Isa', volume: 4, testament: 'OT' },
  { name: 'Jeremiah', abbreviation: 'Jer', ccelAbbrev: 'Jer', volume: 4, testament: 'OT' },
  { name: 'Lamentations', abbreviation: 'Lam', ccelAbbrev: 'Lam', volume: 4, testament: 'OT' },
  { name: 'Ezekiel', abbreviation: 'Ezek', ccelAbbrev: 'Ezek', volume: 4, testament: 'OT' },
  { name: 'Daniel', abbreviation: 'Dan', ccelAbbrev: 'Dan', volume: 4, testament: 'OT' },
  { name: 'Hosea', abbreviation: 'Hos', ccelAbbrev: 'Hos', volume: 4, testament: 'OT' },
  { name: 'Joel', abbreviation: 'Joel', ccelAbbrev: 'Joel', volume: 4, testament: 'OT' },
  { name: 'Amos', abbreviation: 'Amos', ccelAbbrev: 'Amos', volume: 4, testament: 'OT' },
  { name: 'Obadiah', abbreviation: 'Obad', ccelAbbrev: 'Obad', volume: 4, testament: 'OT' },
  { name: 'Jonah', abbreviation: 'Jonah', ccelAbbrev: 'Jonah', volume: 4, testament: 'OT' },
  { name: 'Micah', abbreviation: 'Mic', ccelAbbrev: 'Mic', volume: 4, testament: 'OT' },
  { name: 'Nahum', abbreviation: 'Nah', ccelAbbrev: 'Nah', volume: 4, testament: 'OT' },
  { name: 'Habakkuk', abbreviation: 'Hab', ccelAbbrev: 'Hab', volume: 4, testament: 'OT' },
  { name: 'Zephaniah', abbreviation: 'Zeph', ccelAbbrev: 'Zeph', volume: 4, testament: 'OT' },
  { name: 'Haggai', abbreviation: 'Hag', ccelAbbrev: 'Hag', volume: 4, testament: 'OT' },
  { name: 'Zechariah', abbreviation: 'Zech', ccelAbbrev: 'Zech', volume: 4, testament: 'OT' },
  { name: 'Malachi', abbreviation: 'Mal', ccelAbbrev: 'Mal', volume: 4, testament: 'OT' },

  // Volume 5: Matthew - John
  { name: 'Matthew', abbreviation: 'Matt', ccelAbbrev: 'Matt', volume: 5, testament: 'NT' },
  { name: 'Mark', abbreviation: 'Mark', ccelAbbrev: 'Mark', volume: 5, testament: 'NT' },
  { name: 'Luke', abbreviation: 'Luke', ccelAbbrev: 'Luke', volume: 5, testament: 'NT' },
  { name: 'John', abbreviation: 'John', ccelAbbrev: 'John', volume: 5, testament: 'NT' },

  // Volume 6: Acts - Revelation
  { name: 'Acts', abbreviation: 'Acts', ccelAbbrev: 'Acts', volume: 6, testament: 'NT' },
  { name: 'Romans', abbreviation: 'Rom', ccelAbbrev: 'Rom', volume: 6, testament: 'NT' },
  { name: '1 Corinthians', abbreviation: '1Cor', ccelAbbrev: 'iCor', volume: 6, testament: 'NT' },
  { name: '2 Corinthians', abbreviation: '2Cor', ccelAbbrev: 'iiCor', volume: 6, testament: 'NT' },
  { name: 'Galatians', abbreviation: 'Gal', ccelAbbrev: 'Gal', volume: 6, testament: 'NT' },
  { name: 'Ephesians', abbreviation: 'Eph', ccelAbbrev: 'Eph', volume: 6, testament: 'NT' },
  { name: 'Philippians', abbreviation: 'Phil', ccelAbbrev: 'Phil', volume: 6, testament: 'NT' },
  { name: 'Colossians', abbreviation: 'Col', ccelAbbrev: 'Col', volume: 6, testament: 'NT' },
  { name: '1 Thessalonians', abbreviation: '1Thess', ccelAbbrev: 'iThess', volume: 6, testament: 'NT' },
  { name: '2 Thessalonians', abbreviation: '2Thess', ccelAbbrev: 'iiThess', volume: 6, testament: 'NT' },
  { name: '1 Timothy', abbreviation: '1Tim', ccelAbbrev: 'iTim', volume: 6, testament: 'NT' },
  { name: '2 Timothy', abbreviation: '2Tim', ccelAbbrev: 'iiTim', volume: 6, testament: 'NT' },
  { name: 'Titus', abbreviation: 'Titus', ccelAbbrev: 'Titus', volume: 6, testament: 'NT' },
  { name: 'Philemon', abbreviation: 'Phlm', ccelAbbrev: 'Phlm', volume: 6, testament: 'NT' },
  { name: 'Hebrews', abbreviation: 'Heb', ccelAbbrev: 'Heb', volume: 6, testament: 'NT' },
  { name: 'James', abbreviation: 'Jas', ccelAbbrev: 'Jas', volume: 6, testament: 'NT' },
  { name: '1 Peter', abbreviation: '1Pet', ccelAbbrev: 'iPet', volume: 6, testament: 'NT' },
  { name: '2 Peter', abbreviation: '2Pet', ccelAbbrev: 'iiPet', volume: 6, testament: 'NT' },
  { name: '1 John', abbreviation: '1John', ccelAbbrev: 'iJohn', volume: 6, testament: 'NT' },
  { name: '2 John', abbreviation: '2John', ccelAbbrev: 'iiJohn', volume: 6, testament: 'NT' },
  { name: '3 John', abbreviation: '3John', ccelAbbrev: 'iiiJohn', volume: 6, testament: 'NT' },
  { name: 'Jude', abbreviation: 'Jude', ccelAbbrev: 'Jude', volume: 6, testament: 'NT' },
  { name: 'Revelation', abbreviation: 'Rev', ccelAbbrev: 'Rev', volume: 6, testament: 'NT' },
];

/**
 * Parse a Bible reference into components
 * Examples: "John 3:16", "Genesis 1:1-3", "Romans 8:28"
 */
export interface ParsedReference {
  book: string;
  chapter: number;
  verse?: number;
  endVerse?: number;
}

export function parseReference(reference: string): ParsedReference {
  // Pattern: Book Chapter:Verse or Book Chapter:Verse-EndVerse
  const match = reference.match(/^([1-3]?\s*[A-Za-z\s]+)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);

  if (!match) {
    throw new Error(`Invalid Bible reference format: "${reference}". Expected format: "Book Chapter:Verse" (e.g., "John 3:16")`);
  }

  const [, book, chapter, verse, endVerse] = match;

  return {
    book: book.trim(),
    chapter: parseInt(chapter, 10),
    verse: verse ? parseInt(verse, 10) : undefined,
    endVerse: endVerse ? parseInt(endVerse, 10) : undefined
  };
}

/**
 * Find Bible book mapping by name or abbreviation
 */
export function findBookMapping(bookName: string): BibleBookMapping {
  const normalized = bookName.trim().toLowerCase();

  // Handle common alternative names
  const alternativeNames: Record<string, string> = {
    'psalm': 'psalms',
    'song of songs': 'song of solomon',
    'songs': 'song of solomon'
  };

  const searchName = alternativeNames[normalized] || normalized;

  const mapping = BIBLE_BOOKS.find(
    b => b.name.toLowerCase() === searchName ||
         b.abbreviation.toLowerCase() === searchName ||
         b.ccelAbbrev.toLowerCase() === searchName
  );

  if (!mapping) {
    throw new Error(`Unknown Bible book: "${bookName}". Please check the spelling.`);
  }

  return mapping;
}

/**
 * Convert Arabic numeral to lowercase Roman numeral
 * Used for CCEL chapter identifiers
 */
export function toRomanNumeral(num: number): string {
  if (num < 1 || num > 150) {
    throw new Error(`Chapter number out of range: ${num}. Must be between 1 and 150.`);
  }

  const romanNumerals: [number, string][] = [
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i']
  ];

  let result = '';
  let remaining = num;

  for (const [value, numeral] of romanNumerals) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }

  return result;
}

/**
 * Map Bible reference to Matthew Henry's Commentary CCEL section
 * Returns work and section identifiers for CCELApiAdapter
 *
 * @param reference - Bible reference (e.g., "John 3:16", "Genesis 1:1")
 * @returns CCEL work and section identifiers
 *
 * @example
 * ```typescript
 * mapToMatthewHenry("John 3:16")
 * // Returns: { work: 'henry/mhc5', section: 'mhc5.John.iii' }
 * ```
 */
export function mapToMatthewHenry(reference: string): { work: string; section: string; chapter: number; verse?: number } {
  const parsed = parseReference(reference);
  const bookMapping = findBookMapping(parsed.book);
  const romanChapter = toRomanNumeral(parsed.chapter);

  const volumeId = `mhc${bookMapping.volume}`;
  const work = `henry/${volumeId}`;
  const section = `${volumeId}.${bookMapping.ccelAbbrev}.${romanChapter}`;

  return {
    work,
    section,
    chapter: parsed.chapter,
    verse: parsed.verse
  };
}

/**
 * Map Bible reference to Matthew Henry's Concise Commentary CCEL section
 *
 * @param reference - Bible reference (e.g., "John 3:16")
 * @returns CCEL work and section identifiers
 */
export function mapToMatthewHenryConcise(reference: string): { work: string; section: string; chapter: number; verse?: number } {
  const parsed = parseReference(reference);
  const bookMapping = findBookMapping(parsed.book);
  const romanChapter = toRomanNumeral(parsed.chapter);

  const work = 'henry/mhcc';
  const section = `mhcc.${bookMapping.ccelAbbrev}.${romanChapter}`;

  return {
    work,
    section,
    chapter: parsed.chapter,
    verse: parsed.verse
  };
}

/**
 * Map Bible reference to Jamieson-Fausset-Brown Commentary CCEL section
 * Note: JFB structure may differ - this is a placeholder for future implementation
 *
 * @param reference - Bible reference
 * @returns CCEL work and section identifiers
 */
export function mapToJFB(reference: string): { work: string; section: string; chapter: number; verse?: number } {
  const parsed = parseReference(reference);
  const bookMapping = findBookMapping(parsed.book);
  const romanChapter = toRomanNumeral(parsed.chapter);

  const work = 'jfb/jfb';
  const section = `jfb.${bookMapping.ccelAbbrev}.${romanChapter}`;

  return {
    work,
    section,
    chapter: parsed.chapter,
    verse: parsed.verse
  };
}

/**
 * Get all available commentators
 */
export function getAvailableCommentators(): string[] {
  return [
    'Matthew Henry',
    'Matthew Henry Concise',
    'Jamieson-Fausset-Brown'
  ];
}

/**
 * Map commentator name to mapping function
 */
export function getMapperForCommentator(commentator: string): typeof mapToMatthewHenry {
  const normalized = commentator.toLowerCase().trim();

  if (normalized.includes('concise')) {
    return mapToMatthewHenryConcise;
  }

  if (normalized.includes('jfb') || normalized.includes('jamieson')) {
    return mapToJFB;
  }

  // Default to Matthew Henry Complete
  return mapToMatthewHenry;
}
