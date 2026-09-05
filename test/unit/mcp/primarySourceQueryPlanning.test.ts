import { describe, expect, it } from 'vitest';
import { initialPrimarySourceLocalQuery } from '../../../src/mcp/primarySourceQueryPlanning.js';

describe('initialPrimarySourceLocalQuery', () => {
  it.each([
    ['Historical perspectives on church government?', 'church government'],
    ['historical source about "faith seeking understanding"!', '"faith seeking understanding"'],
    ['Perspectives on infant baptism.', 'infant baptism'],
  ])('removes only a closed leading research frame from %j', (question, expected) => {
    expect(initialPrimarySourceLocalQuery(question)).toBe(expected);
  });

  it.each([
    'What did Calvin say about predestination?',
    'Is God made of parts?',
    'grace, merit, and justification',
  ])('preserves unrecognized framing and meaningful theological terms in %j', (question) => {
    expect(initialPrimarySourceLocalQuery(question)).toBe(question.replace(/[?.!]+$/u, ''));
  });

  it('preserves quoted text while normalizing whitespace', () => {
    expect(initialPrimarySourceLocalQuery('  Historical works on   "the Lord\'s Supper"?  '))
      .toBe('"the Lord\'s Supper"');
  });
});
