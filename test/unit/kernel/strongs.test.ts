import { describe, expect, it } from 'vitest';
import { baseStrongsId, parseStrongsIdentity } from '../../../src/kernel/strongs.js';

describe('parseStrongsIdentity', () => {
  it.each([
    ['G25', { publicId: 'G25', morphologyKey: 'G0025' }],
    [' g0025 ', { publicId: 'G25', morphologyKey: 'G0025' }],
    ['H430', { publicId: 'H430', morphologyKey: 'H0430' }],
    ['g1722A', { publicId: 'G1722a', morphologyKey: 'G1722a' }],
    ['h25b', { publicId: 'H25b', morphologyKey: 'H0025b' }],
  ])('canonicalizes %s without losing a suffix', (input, expected) => {
    expect(parseStrongsIdentity(input)).toEqual(expected);
  });

  it.each(['', '25', 'X25', 'G', 'G 25', 'G25aa', 'G-25'])('rejects %s', input => {
    expect(parseStrongsIdentity(input)).toBeUndefined();
  });
});

describe('baseStrongsId', () => {
  it('removes only an optional sense suffix', () => {
    expect(baseStrongsId('G1722a')).toBe('G1722');
    expect(baseStrongsId('H0430')).toBe('H0430');
  });
});
