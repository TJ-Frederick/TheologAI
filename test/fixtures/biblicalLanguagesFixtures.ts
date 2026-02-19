/**
 * Biblical Languages Test Fixtures
 *
 * Sample Strong's concordance and morphology data for testing
 */

import type { StrongsEntry, StrongsMetadata } from '../../src/adapters/biblicalLanguagesAdapter.js';
import type { BookData, VerseData, StepBibleIndex, StepBibleMetadata } from '../../src/types/index.js';

// Sample Greek Strong's entries
export const SAMPLE_GREEK_ENTRIES: Record<string, StrongsEntry> = {
  G25: {
    lemma: 'ἀγαπάω',
    translit: 'agapaō',
    pronunciation: 'ag-ap-ah'-o',
    def: 'to love (in a social or moral sense)',
    derivation: 'perhaps from ἄγαν (much)'
  },
  G3056: {
    lemma: 'λόγος',
    translit: 'logos',
    pronunciation: 'log'-os',
    def: 'something said (including the thought); by implication, a topic (subject of discourse), also reasoning (the mental faculty) or motive',
    derivation: 'from λέγω (to lay forth)'
  },
  G2316: {
    lemma: 'θεός',
    translit: 'theos',
    pronunciation: 'theh'-os',
    def: 'a deity, especially (with ὁ) the supreme Divinity',
    derivation: 'of uncertain affinity'
  }
};

// Sample Hebrew Strong's entries
export const SAMPLE_HEBREW_ENTRIES: Record<string, StrongsEntry> = {
  H430: {
    lemma: 'אֱלֹהִים',
    translit: 'ʼĕlôhîym',
    pronunciation: 'el-o-heem\'',
    def: 'gods in the ordinary sense; but specifically used (in the plural thus, especially with the article) of the supreme God',
    derivation: 'plural of H433'
  },
  H3068: {
    lemma: 'יְהֹוָה',
    translit: 'Yᵉhôvâh',
    pronunciation: 'yeh-ho-vaw\'',
    def: 'the self-Existent or Eternal; Jehovah, Jewish national name of God',
    derivation: 'from H1961'
  },
  H157: {
    lemma: 'אָהַב',
    translit: 'ʼâhab',
    pronunciation: 'aw-hab\'',
    def: 'to have affection for (sexually or otherwise)',
    derivation: 'a primitive root'
  }
};

export const SAMPLE_STRONGS_METADATA: StrongsMetadata = {
  version: '1.0.0',
  source: 'OpenScriptures Hebrew Bible / Berean Greek New Testament',
  source_url: 'https://github.com/openscriptures/strongs',
  license: 'CC-BY-4.0',
  attribution: 'Data from OpenScriptures.org, freely available under Creative Commons Attribution 4.0',
  build_date: '2025-01-15',
  entries: {
    greek: 5624,
    hebrew: 8674,
    total: 14298
  }
};

// Sample STEPBible morphology codes
export const SAMPLE_MORPH_CODES: Record<string, string> = {
  'V-PAI-3S': 'Verb - Present Active Indicative - 3rd Person Singular',
  'N-NSM': 'Noun - Nominative Singular Masculine',
  'N-ASF': 'Noun - Accusative Singular Feminine',
  'A-NSM': 'Adjective - Nominative Singular Masculine',
  'P-1NS': 'Pronoun - 1st Person Nominative Singular',
  'D': 'Adverb',
  'C': 'Conjunction',
  'RA-NSM': 'Relative Article - Nominative Singular Masculine'
};

// Sample STEPBible verse data (John 3:16)
export const SAMPLE_STEPBIBLE_VERSE: VerseData = {
  text: 'For God so loved the world that he gave his only Son',
  words: [
    {
      text: 'οὕτως',
      strong: 'G3779',
      morph: 'D',
      lemma: 'οὕτω'
    },
    {
      text: 'γὰρ',
      strong: 'G1063',
      morph: 'C',
      lemma: 'γάρ'
    },
    {
      text: 'ἠγάπησεν',
      strong: 'G25',
      morph: 'V-AAI-3S',
      lemma: 'ἀγαπάω'
    },
    {
      text: 'ὁ',
      strong: 'G3588',
      morph: 'RA-NSM',
      lemma: 'ὁ'
    },
    {
      text: 'θεὸς',
      strong: 'G2316',
      morph: 'N-NSM',
      lemma: 'θεός'
    },
    {
      text: 'τὸν',
      strong: 'G3588',
      morph: 'RA-ASM',
      lemma: 'ὁ'
    },
    {
      text: 'κόσμον',
      strong: 'G2889',
      morph: 'N-ASM',
      lemma: 'κόσμος'
    }
  ]
};

export const SAMPLE_STEPBIBLE_BOOK: BookData = {
  book: 'John',
  chapters: {
    '3': {
      '16': SAMPLE_STEPBIBLE_VERSE,
      '17': {
        text: 'For God did not send his Son into the world to condemn the world',
        words: [
          {
            text: 'οὐ',
            strong: 'G3756',
            morph: 'D',
            lemma: 'οὐ'
          },
          {
            text: 'γὰρ',
            strong: 'G1063',
            morph: 'C',
            lemma: 'γάρ'
          },
          {
            text: 'ἀπέστειλεν',
            strong: 'G649',
            morph: 'V-AAI-3S',
            lemma: 'ἀποστέλλω'
          }
        ]
      }
    }
  }
};

export const SAMPLE_STEPBIBLE_INDEX: StepBibleIndex = {
  books: {
    'John': {
      file: 'John.json.gz',
      chapters: 21,
      verses: 879
    },
    'Genesis': {
      file: 'Genesis.json.gz',
      chapters: 50,
      verses: 1533
    },
    'Romans': {
      file: 'Romans.json.gz',
      chapters: 16,
      verses: 433
    }
  }
};

export const SAMPLE_STEPBIBLE_METADATA: StepBibleMetadata = {
  version: '1.0.0',
  source: 'STEPBible Data',
  source_url: 'https://github.com/STEPBible/STEPBible-Data',
  license: 'CC-BY-4.0',
  build_date: '2025-01-15',
  books: 66,
  chapters: 1189,
  verses: 31102
};

// Valid and invalid Strong's numbers for testing
export const VALID_STRONGS_NUMBERS = [
  'G25',
  'G3056',
  'G2316',
  'H430',
  'H3068',
  'H157',
  'g25',    // lowercase
  'h430',   // lowercase
  'G1',     // single digit
  'H8674'   // max Hebrew number
];

export const INVALID_STRONGS_NUMBERS = [
  'X123',      // Invalid prefix
  '123',       // Missing prefix
  'G',         // No number
  'H',         // No number
  'GH123',     // Double prefix
  'G-123',     // Invalid format
  'G 123',     // Space in number
  'Greek25',   // Full word instead of letter
  ''           // Empty string
];

// Bible references for morphology testing
export const MORPHOLOGY_TEST_REFERENCES = [
  { ref: 'John 3:16', book: 'John', chapter: '3', verse: '16' },
  { ref: 'Jn 3:16', book: 'John', chapter: '3', verse: '16' },
  { ref: 'John 3.16', book: 'John', chapter: '3', verse: '16' },
  { ref: 'Romans 8:28', book: 'Romans', chapter: '8', verse: '28' },
  { ref: 'Genesis 1:1', book: 'Genesis', chapter: '1', verse: '1' }
];

export const INVALID_REFERENCES = [
  'John',           // Missing chapter:verse
  'John 3',         // Missing verse
  '3:16',           // Missing book
  'InvalidBook 1:1' // Non-existent book
];

// Lemma search test cases
export const LEMMA_SEARCHES = [
  { lemma: 'agapa', testament: 'NT' as const, expectedCount: 1, expectedStrongs: ['G25'] },
  { lemma: 'theos', testament: 'NT' as const, expectedCount: 1, expectedStrongs: ['G2316'] },
  { lemma: 'elohim', testament: 'OT' as const, expectedCount: 1, expectedStrongs: ['H430'] },
  { lemma: 'love', testament: 'both' as const, expectedCount: 2, expectedStrongs: ['G25', 'H157'] }
];
