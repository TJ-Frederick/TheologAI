import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
    'G0', 'H0000', 'G100000', 'H999999', 'G9007199254740993',
  ])('rejects %s', input => {
    expect(parseStrongsIdentity(input)).toBeUndefined();
  });
  it.each(['G5624', 'H8674', 'G6000', 'H9001', 'H9049', 'G21502', 'G99999'])('accepts bounded classical and extended identity %s', input => {
    expect(parseStrongsIdentity(input)?.publicId).toBe(input);
  });

  it('keeps the reviewed fixture grounded in checked-in STEPBible lexicons', () => {
    const fixture = JSON.parse(readFileSync(new URL('../../fixtures/stepbible-extended-strongs.json', import.meta.url), 'utf8')) as {
      identities: Array<{ id: string; lemma: string }>;
    };
    const greek = JSON.parse(readFileSync(new URL('../../../data/biblical-languages/stepbible-lexicons/tbesg-greek.json', import.meta.url), 'utf8')) as Record<string, { lemma: string }>;
    const hebrew = JSON.parse(readFileSync(new URL('../../../data/biblical-languages/stepbible-lexicons/tbesh-hebrew.json', import.meta.url), 'utf8')) as Record<string, { lemma: string }>;
    for (const item of fixture.identities) {
      expect(parseStrongsIdentity(item.id)?.morphologyKey).toBe(item.id);
      expect((item.id.startsWith('G') ? greek : hebrew)[item.id]?.lemma.normalize('NFC')).toBe(item.lemma.normalize('NFC'));
    }
  });
});
