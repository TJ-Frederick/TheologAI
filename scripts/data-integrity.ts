/** Semantic integrity checks for the original-language corpus. */

export const JOHN_1_1_POSITION_11 = {
  book: 'John',
  chapter: 1,
  verse: 1,
  position: 11,
  wordText: 'τὸν',
  lemma: 'ὁ',
  strongsNumber: 'G3588',
} as const;

export const GENESIS_1_1_POSITION_3 = {
  book: 'Genesis',
  chapter: 1,
  verse: 1,
  position: 3,
  wordText: 'אֱלֹהִ֑ים',
  lemma: 'אֱלֹהִים',
  strongsNumber: 'H0430',
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

/** Validate a Hebrew lemma sourced by an exact TAHOT→TBESH Strong's join. */
export function assertGenesisOneOneDatabase(db: {
  prepare(sql: string): { get(...parameters: unknown[]): unknown };
}, label = 'SQLite morphology'): void {
  const row = db.prepare(
    `SELECT word_text, lemma, strongs_number
       FROM morphology
      WHERE book = ? AND chapter = ? AND verse = ? AND position = ?`,
  ).get(
    GENESIS_1_1_POSITION_3.book,
    GENESIS_1_1_POSITION_3.chapter,
    GENESIS_1_1_POSITION_3.verse,
    GENESIS_1_1_POSITION_3.position,
  );
  if (!isRecord(row)) throw new Error(`${label} Genesis 1:1 position 3 is missing`);
  assertExpected(row.word_text, GENESIS_1_1_POSITION_3.wordText, `${label}.word_text`);
  assertExpected(row.lemma, GENESIS_1_1_POSITION_3.lemma, `${label}.lemma`);
  assertExpected(row.strongs_number, GENESIS_1_1_POSITION_3.strongsNumber, `${label}.strongs_number`);
}

/** Every resolvable Hebrew lexicon join must materialize a nonblank lemma. */
export function assertHebrewLemmaCoverageDatabase(db: {
  prepare(sql: string): { get(...parameters: unknown[]): unknown };
}, label = 'SQLite morphology'): void {
  const row = db.prepare(
    `SELECT COUNT(*) AS count
       FROM morphology AS m
       JOIN stepbible_lexicons AS l ON l.strongs_number = m.strongs_number
      WHERE m.strongs_number LIKE 'H%'
        AND trim(json_extract(l.extended_data, '$.lemma')) != ''
        AND trim(m.lemma) = ''`,
  ).get();
  if (!isRecord(row) || row.count !== 0) {
    throw new Error(`${label} has ${String(row && isRecord(row) ? row.count : 'unknown')} blank resolvable Hebrew lemmas`);
  }
}

/** SQL predicate used by D1 readiness checks for the semantic sentinel. */
export function johnOneOneReadinessPredicate(): string {
  return `(SELECT word_text FROM morphology WHERE book = 'John' AND chapter = 1 AND verse = 1 AND position = 11) = 'τὸν'`;
}

/** SQL predicate proving the prepared D1 includes lexicon-backed Hebrew lemmas. */
export function genesisOneOneLemmaReadinessPredicate(): string {
  return `(SELECT lemma FROM morphology WHERE book = 'Genesis' AND chapter = 1 AND verse = 1 AND position = 3) = 'אֱלֹהִים'`;
}
