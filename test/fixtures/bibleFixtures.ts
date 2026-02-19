/**
 * Bible Test Fixtures
 *
 * Sample Bible verses and responses for testing
 */

export const SAMPLE_VERSES = {
  john316: {
    reference: 'John 3:16',
    text: 'For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.',
    book: 'John',
    chapter: 3,
    verse: 16
  },
  genesis11: {
    reference: 'Genesis 1:1',
    text: 'In the beginning, God created the heavens and the earth.',
    book: 'Genesis',
    chapter: 1,
    verse: 1
  },
  psalm231: {
    reference: 'Psalm 23:1',
    text: 'The LORD is my shepherd; I shall not want.',
    book: 'Psalm',
    chapter: 23,
    verse: 1
  },
  romans323: {
    reference: 'Romans 3:23',
    text: 'for all have sinned and fall short of the glory of God,',
    book: 'Romans',
    chapter: 3,
    verse: 23
  },
  romans828: {
    reference: 'Romans 8:28',
    text: 'And we know that for those who love God all things work together for good, for those who are called according to his purpose.',
    book: 'Romans',
    chapter: 8,
    verse: 28
  }
};

export const SAMPLE_ESV_RESPONSE = {
  query: 'John 3:16',
  canonical: 'John 3:16',
  parsed: [[43, 3, 16, 43, 3, 16]],
  passage_meta: [{
    canonical: 'John 3:16',
    chapter_start: [43, 3, 1],
    chapter_end: [43, 3, 36],
    prev_verse: 43003015,
    next_verse: 43003017,
    prev_chapter: [43, 2, 25],
    next_chapter: [43, 4, 1]
  }],
  passages: [
    'John 3:16\n\n  [16] For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life. (ESV)'
  ]
};

export const SAMPLE_NET_RESPONSE = {
  query: 'John 3:16',
  passages: ['John 3:16\n\nFor this is the way God loved the world: He gave his one and only Son, so that everyone who believes in him will not perish but have eternal life.']
};

export const SAMPLE_HELLOAO_RESPONSE = {
  book: 'John',
  chapter: 3,
  verses: [
    {
      verse: 16,
      text: 'For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.'
    }
  ]
};

export const SAMPLE_FOOTNOTES = [
  {
    id: 1,
    caller: 'a',
    text: 'Or only begotten',
    reference: { chapter: 3, verse: 16 }
  },
  {
    id: 2,
    caller: 'b',
    text: 'Greek: monogenes',
    reference: { chapter: 3, verse: 16 }
  }
];

export const NUMBERED_BOOKS = [
  { input: '1 John 1:1', normalized: '1John 1:1', book: '1 John' },
  { input: '2 Kings 2:11', normalized: '2Kings 2:11', book: '2 Kings' },
  { input: '3 John 1:4', normalized: '3John 1:4', book: '3 John' },
  { input: '1 Samuel 17:45', normalized: '1Samuel 17:45', book: '1 Samuel' },
  { input: '2 Corinthians 5:17', normalized: '2Corinthians 5:17', book: '2 Corinthians' }
];

export const SINGLE_CHAPTER_BOOKS = [
  { book: 'Obadiah', reference: 'Obadiah 1:1' },
  { book: 'Philemon', reference: 'Philemon 1:6' },
  { book: 'Jude', reference: 'Jude 1:3' },
  { book: '2 John', reference: '2 John 1:1' },
  { book: '3 John', reference: '3 John 1:4' }
];

export const VERSE_RANGES = [
  { input: 'John 3:16-17', verses: 2, expected: ['John 3:16', 'John 3:17'] },
  { input: 'Genesis 1:1-3', verses: 3, expected: ['Genesis 1:1', 'Genesis 1:2', 'Genesis 1:3'] },
  { input: 'Psalm 23:1-6', verses: 6, expected: ['Psalm 23:1', 'Psalm 23:2', 'Psalm 23:3', 'Psalm 23:4', 'Psalm 23:5', 'Psalm 23:6'] }
];

export const INVALID_REFERENCES = [
  'Book of Mormon 1:1',
  'John 99:99',
  'Genesis 1:999',
  'InvalidBook 1:1',
  '4 John 1:1', // Non-existent numbered book
  'John', // Missing chapter and verse
  '123:456' // Just numbers
];

export const ALL_TRANSLATIONS = [
  'ESV',
  'NET',
  'KJV',
  'WEB',
  'BSB',
  'ASV',
  'YLT',
  'DBY'
];
