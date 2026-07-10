/** Semantic integrity checks for the original-language corpus. */

export const JOHN_1_1_POSITION_11 = {
  book: 'John',
  chapter: 1,
  verse: 1,
  position: 11,
  wordText: 'τὸ',
  lemma: 'ὁ',
  strongsNumber: 'G3588',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertExpected(value: unknown, expected: string, label: string): void {
  if (value !== expected) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, received ${JSON.stringify(value)}`);
  }
}

/** Validate the source JSON row before it can be imported into SQLite. */
export function assertJohnOneOneSource(bookData: unknown, label = 'STEPBible John 1:1'): void {
  if (!isRecord(bookData)) throw new Error(`${label} is not an object`);
  assertExpected(bookData.book, JOHN_1_1_POSITION_11.book, `${label}.book`);

  const chapters = bookData.chapters;
  const chapter = isRecord(chapters) ? chapters[String(JOHN_1_1_POSITION_11.chapter)] : undefined;
  const verse = isRecord(chapter) ? chapter[String(JOHN_1_1_POSITION_11.verse)] : undefined;
  const words = isRecord(verse) && Array.isArray(verse.words) ? verse.words : undefined;
  const word = words?.find(candidate => isRecord(candidate) && candidate.position === JOHN_1_1_POSITION_11.position);
  if (!isRecord(word)) {
    throw new Error(`${label} position ${JOHN_1_1_POSITION_11.position} is missing`);
  }

  assertExpected(word.text, JOHN_1_1_POSITION_11.wordText, `${label}.text`);
  assertExpected(word.lemma, JOHN_1_1_POSITION_11.lemma, `${label}.lemma`);
  assertExpected(word.strong, JOHN_1_1_POSITION_11.strongsNumber, `${label}.strong`);
  if ([word.text, word.lemma].some(value => typeof value === 'string' && value.includes('\uFFFD'))) {
    throw new Error(`${label} contains a Unicode replacement character`);
  }
}

/** Validate the same semantic row after SQLite import. */
export function assertJohnOneOneDatabase(db: {
  prepare(sql: string): { get(...parameters: unknown[]): unknown };
}, label = 'SQLite morphology'): void {
  const row = db.prepare(
    `SELECT book, chapter, verse, position, word_text, lemma, strongs_number
       FROM morphology
      WHERE book = ? AND chapter = ? AND verse = ? AND position = ?`,
  ).get(
    JOHN_1_1_POSITION_11.book,
    JOHN_1_1_POSITION_11.chapter,
    JOHN_1_1_POSITION_11.verse,
    JOHN_1_1_POSITION_11.position,
  );
  if (!isRecord(row)) throw new Error(`${label} John 1:1 position 11 is missing`);

  assertExpected(row.word_text, JOHN_1_1_POSITION_11.wordText, `${label}.word_text`);
  assertExpected(row.lemma, JOHN_1_1_POSITION_11.lemma, `${label}.lemma`);
  assertExpected(row.strongs_number, JOHN_1_1_POSITION_11.strongsNumber, `${label}.strongs_number`);
  if ([row.word_text, row.lemma].some(value => typeof value === 'string' && value.includes('\uFFFD'))) {
    throw new Error(`${label} contains a Unicode replacement character`);
  }
}

/** SQL predicate used by D1 readiness checks for the semantic sentinel. */
export function johnOneOneReadinessPredicate(): string {
  return `(SELECT word_text FROM morphology WHERE book = 'John' AND chapter = 1 AND verse = 1 AND position = 11) = 'τὸ'`;
}
