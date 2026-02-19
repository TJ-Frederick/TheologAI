/**
 * Commentary Test Fixtures
 *
 * Sample commentary responses for testing
 */

export const SAMPLE_MATTHEW_HENRY = {
  verse: 'John 3:16',
  commentary: 'Here is the most comprehensive declaration of the divine love to man...',
  commentator: 'Matthew Henry'
};

export const SAMPLE_JFB = {
  verse: 'Romans 3:23',
  commentary: 'all have sinned—Though men differ greatly in the nature and extent of their sinfulness...',
  commentator: 'Jamieson-Fausset-Brown'
};

export const SAMPLE_ADAM_CLARKE = {
  verse: 'Genesis 1:1',
  commentary: 'In the beginning - The Hebrew word בראשית bereshith has been variously translated...',
  commentator: 'Adam Clarke'
};

export const SAMPLE_JOHN_GILL = {
  verse: 'Psalm 23:1',
  commentary: 'The Lord is my shepherd - Not literally, but mystically and spiritually...',
  commentator: 'John Gill'
};

export const SAMPLE_KEIL_DELITZSCH = {
  verse: 'Exodus 3:14',
  commentary: 'I am that I am - This glorious name is derived from the verb היה to be...',
  commentator: 'Keil-Delitzsch'
};

export const SAMPLE_TYNDALE = {
  verse: 'Matthew 5:3',
  commentary: 'Blessed are the poor in spirit - Those who recognize their spiritual poverty...',
  commentator: 'Tyndale'
};

export const ALL_COMMENTATORS = [
  'Matthew Henry',
  'Jamieson-Fausset-Brown',
  'JFB',
  'Adam Clarke',
  'John Gill',
  'Keil-Delitzsch',
  'Tyndale'
];

export const SAMPLE_HELLOAO_COMMENTARY_RESPONSE = {
  book: 'John',
  chapter: 3,
  verse: 16,
  commentary: [
    {
      commentator: 'Matthew Henry',
      text: 'Here is the most comprehensive declaration of the divine love to man, and the way of salvation through Jesus Christ. For God so loved the world - The whole race of mankind...'
    }
  ]
};

export const OT_VERSES = [
  'Genesis 1:1',
  'Exodus 3:14',
  'Psalm 23:1',
  'Isaiah 53:5',
  'Zephaniah 2:7'
];

export const NT_VERSES = [
  'Matthew 5:3',
  'John 3:16',
  'Romans 3:23',
  'Ephesians 2:8',
  'Revelation 21:4'
];
