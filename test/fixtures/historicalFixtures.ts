/**
 * Historical Documents Test Fixtures
 *
 * Sample historical documents for testing LocalDataAdapter
 */

import type { HistoricalDocument, DocumentSection } from '../../src/adapters/localData.js';

export const SAMPLE_CATECHISM_QUESTION: DocumentSection = {
  question_number: '1',
  question: 'What is the chief end of man?',
  answer: 'Man\'s chief end is to glorify God, and to enjoy him forever.',
  scripture: ['1 Corinthians 10:31', 'Romans 11:36', 'Psalm 73:25-26'],
  topics: ['God', 'worship', 'purpose']
};

export const SAMPLE_CONFESSION_CHAPTER: DocumentSection = {
  chapter: '1',
  title: 'Of the Holy Scripture',
  content: 'The Holy Scripture is the only sufficient, certain, and infallible rule of all saving knowledge, faith, and obedience.',
  topics: ['Scripture', 'revelation', 'authority']
};

export const SAMPLE_CREED_SECTION: DocumentSection = {
  title: 'The Apostles\' Creed',
  content: 'I believe in God, the Father almighty, creator of heaven and earth. I believe in Jesus Christ, his only Son, our Lord...',
  topics: ['Trinity', 'faith', 'creed']
};

export const SAMPLE_WSC_DOCUMENT: HistoricalDocument = {
  title: 'Westminster Shorter Catechism',
  type: 'catechism',
  date: '1647',
  topics: ['Reformed', 'Protestant', 'Westminster'],
  sections: [
    {
      question_number: '1',
      question: 'What is the chief end of man?',
      answer: 'Man\'s chief end is to glorify God, and to enjoy him forever.',
      topics: ['God', 'worship', 'purpose']
    },
    {
      question_number: '2',
      question: 'What rule hath God given to direct us how we may glorify and enjoy him?',
      answer: 'The Word of God, which is contained in the Scriptures of the Old and New Testaments, is the only rule to direct us how we may glorify and enjoy him.',
      topics: ['Scripture', 'revelation', 'authority']
    },
    {
      question_number: '10',
      question: 'How did God create man?',
      answer: 'God created man male and female, after his own image, in knowledge, righteousness, and holiness, with dominion over the creatures.',
      topics: ['creation', 'humanity', 'image of God']
    }
  ]
};

export const SAMPLE_BALTIMORE_DOCUMENT: HistoricalDocument = {
  title: 'Baltimore Catechism',
  type: 'catechism',
  date: '1885',
  topics: ['Catholic', 'catechism'],
  sections: [
    {
      question_number: '1',
      question: 'Who made the world?',
      answer: 'God made the world.',
      topics: ['creation', 'God']
    },
    {
      question_number: '100',
      question: 'What is grace?',
      answer: 'Grace is a supernatural gift of God bestowed on us through the merits of Jesus Christ for our salvation.',
      topics: ['grace', 'salvation', 'merit']
    }
  ]
};

export const SAMPLE_CONFESSION_DOCUMENT: HistoricalDocument = {
  title: 'Westminster Confession of Faith',
  type: 'confession',
  date: '1646',
  topics: ['Reformed', 'Protestant', 'Westminster'],
  sections: [
    {
      chapter: '1',
      title: 'Of the Holy Scripture',
      content: 'Although the light of nature, and the works of creation and providence do so far manifest the goodness, wisdom, and power of God, as to leave men unexcusable; yet are they not sufficient to give that knowledge of God, and of his will, which is necessary unto salvation.',
      topics: ['Scripture', 'revelation', 'authority']
    },
    {
      chapter: '2',
      title: 'Of God, and of the Holy Trinity',
      content: 'There is but one only, living, and true God, who is infinite in being and perfection, a most pure spirit, invisible, without body, parts, or passions; immutable, immense, eternal, incomprehensible, almighty, most wise, most holy, most free, most absolute.',
      topics: ['Trinity', 'attributes of God', 'theology']
    }
  ]
};

export const SAMPLE_CREED_DOCUMENT: HistoricalDocument = {
  title: 'Nicene Creed',
  type: 'creed',
  date: '325',
  topics: ['Trinity', 'ecumenical', 'Christology'],
  sections: [
    {
      title: 'The Nicene Creed',
      content: 'We believe in one God, the Father Almighty, Maker of heaven and earth, and of all things visible and invisible. And in one Lord Jesus Christ, the only-begotten Son of God, begotten of the Father before all worlds...',
      topics: ['Trinity', 'faith', 'Jesus Christ']
    }
  ]
};

export const ORDINAL_SEARCHES = [
  { query: 'first question', expectedNumber: '1' },
  { query: 'second question', expectedNumber: '2' },
  { query: 'tenth question', expectedNumber: '10' },
  { query: 'hundredth question', expectedNumber: '100' }
];

export const NUMBER_SEARCHES = [
  { query: '1', expectedNumber: '1' },
  { query: 'Q1', expectedNumber: '1' },
  { query: 'Question 1', expectedNumber: '1' },
  { query: '100', expectedNumber: '100' },
  { query: 'Q100', expectedNumber: '100' },
  { query: 'Question 100', expectedNumber: '100' }
];

export const TOPIC_SEARCHES = [
  { query: 'grace', expectedTopics: ['grace', 'salvation'] },
  { query: 'Scripture', expectedTopics: ['Scripture', 'revelation', 'authority'] },
  { query: 'Trinity', expectedTopics: ['Trinity', 'faith'] }
];

export const DOCUMENT_TYPES = {
  catechism: ['Westminster Shorter Catechism', 'Baltimore Catechism'],
  confession: ['Westminster Confession of Faith'],
  creed: ['Nicene Creed']
};

export const MULTI_WORD_QUERIES = [
  { query: 'chief end man', expectedMatch: 'What is the chief end of man?' },
  { query: 'Holy Scripture', expectedMatch: 'Of the Holy Scripture' },
  { query: 'supernatural gift God', expectedMatch: 'grace' }
];
