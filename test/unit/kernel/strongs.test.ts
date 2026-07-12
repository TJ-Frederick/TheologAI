import { describe, expect, it } from 'vitest';
import { parseStrongsIdentity } from '../../../src/kernel/strongs.js';

describe('parseStrongsIdentity', () => {
  it.each([
    ['G25', { prefix: 'G', number: 25, suffix: undefined, publicId: 'G25', morphologyKey: 'G0025' }],
    [' g0025 ', { prefix: 'G', number: 25, suffix: undefined, publicId: 'G25', morphologyKey: 'G0025' }],
    ['H430', { prefix: 'H', number: 430, suffix: undefined, publicId: 'H430', morphologyKey: 'H0430' }],
    // STEPBible extended identities use uppercase suffixes (for example G2385I).
    ['g2385i', { prefix: 'G', number: 2385, suffix: 'I', publicId: 'G2385I', morphologyKey: 'G2385I' }],
    ['h25b', { prefix: 'H', number: 25, suffix: 'B', publicId: 'H25B', morphologyKey: 'H0025B' }],
  ])('canonicalizes %s without losing a suffix', (input, expected) => {
    expect(parseStrongsIdentity(input)).toEqual(expected);
  });

  it.each([
    '', '25', 'X25', 'G', 'G 25', 'G25aa', 'G-25',
    'G0', 'H0000', 'G5625', 'H8675', 'G9007199254740993',
  ])('rejects %s', input => {
    expect(parseStrongsIdentity(input)).toBeUndefined();
  });
  it.each(['G5624', 'H8674'])('accepts the reviewed corpus boundary %s', input => {
    expect(parseStrongsIdentity(input)?.publicId).toBe(input);
  });
});
