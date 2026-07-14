import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expandHebrewMorphCode } from '../../../../src/adapters/shared/hebrewMorphExpander.js';

describe('expandHebrewMorphCode', () => {
  it('expands complete verb morphology', () => {
    expect(expandHebrewMorphCode('HVqp3ms'))
      .toBe('Verb Qal Perfect 3rd Masculine Singular');
  });

  it('expands part-of-speech-specific nominal and pronoun fields', () => {
    expect(expandHebrewMorphCode('HNcmsa'))
      .toBe('Noun Common Masculine Singular Absolute');
    expect(expandHebrewMorphCode('HPp3fp'))
      .toBe('Pronoun Personal 3rd Feminine Plural');
  });

  it('parses each slash-delimited morpheme with the single leading language code', () => {
    expect(expandHebrewMorphCode('HTd/Ncmpa'))
      .toBe('Particle Definite Article / Noun Common Masculine Plural Absolute');
    expect(expandHebrewMorphCode('HTd/Ncfsa'))
      .toBe('Particle Definite Article / Noun Common Feminine Singular Absolute');
    expect(expandHebrewMorphCode('HR/Ncfsa'))
      .toBe('Preposition / Noun Common Feminine Singular Absolute');
  });

  it('recognizes authoritative detail-free parts of speech', () => {
    expect(expandHebrewMorphCode('HC')).toBe('Conjunction');
    expect(expandHebrewMorphCode('HD')).toBe('Adverb');
    expect(expandHebrewMorphCode('HR')).toBe('Preposition');
  });

  it('expands the documented STEPBible TEHMC extensions', () => {
    expect(expandHebrewMorphCode('Hc/Vqw3ms'))
      .toBe('Sequential Conjunction / Verb Qal Sequential Imperfect 3rd Masculine Singular');
    expect(expandHebrewMorphCode('HTc')).toBe('Particle Condition or Consequence');
    expect(expandHebrewMorphCode('HNpm')).toBe('Noun Proper Name Masculine');
    expect(expandHebrewMorphCode('HNpf')).toBe('Noun Proper Name Feminine');
    expect(expandHebrewMorphCode('HNpl')).toBe('Noun Proper Name Location');
    expect(expandHebrewMorphCode('HNpt')).toBe('Noun Proper Name Title');
    expect(expandHebrewMorphCode('HNtmsa')).toBe('Noun Title Masculine Singular Absolute');
    expect(expandHebrewMorphCode('HVqc1cs')).toBe('Verb Qal Cohortative 1st Common Singular');
    expect(expandHebrewMorphCode('HVqu3mp')).toBe('Verb Qal Conjunctive Imperfect 3rd Masculine Plural');
  });

  it('expands suffixes and non-finite verbs according to their own schemas', () => {
    expect(expandHebrewMorphCode('HNcmsc/Sp3ms'))
      .toBe('Noun Common Masculine Singular Construct / Suffix Pronominal 3rd Masculine Singular');
    expect(expandHebrewMorphCode('HVqrmpa'))
      .toBe('Verb Qal Participle Active Masculine Plural Absolute');
    expect(expandHebrewMorphCode('HVqaa'))
      .toBe('Verb Qal Infinitive Absolute Absolute');
  });

  it('fails closed for any malformed, unsupported, incomplete, or unconsumed segment', () => {
    expect(expandHebrewMorphCode('')).toBeUndefined();
    expect(expandHebrewMorphCode('H')).toBeUndefined();
    expect(expandHebrewMorphCode('HXabc')).toBeUndefined();
    expect(expandHebrewMorphCode('HV')).toBeUndefined();
    expect(expandHebrewMorphCode('HN')).toBeUndefined();
    expect(expandHebrewMorphCode('HVq?')).toBeUndefined();
    expect(expandHebrewMorphCode('HAc?')).toBeUndefined();
    expect(expandHebrewMorphCode('HTd/Ncmpa/UNKNOWN')).toBeUndefined();
    expect(expandHebrewMorphCode('HTd//Ncmpa')).toBeUndefined();
    expect(expandHebrewMorphCode('HTd/HNcmpa')).toBeUndefined();
    expect(expandHebrewMorphCode('HNcmpax')).toBeUndefined();
  });

  it('recognizes less common verb stems and forms', () => {
    expect(expandHebrewMorphCode('HVzj2fp'))
      .toBe('Verb Hithpoel Jussive 2nd Feminine Plural');
  });

  it('covers every well-formed distinct code in the pinned TAHOT corpus and rejects malformed separators', () => {
    const directory = new URL('../../../../data/biblical-languages/stepbible/hebrew/', import.meta.url);
    const codes = new Set<string>();
    let tokens = 0;
    let expandedTokens = 0;
    let malformedTokens = 0;

    for (const file of readdirSync(directory).filter(name => name.endsWith('.json.gz'))) {
      const book = JSON.parse(gunzipSync(readFileSync(new URL(file, directory))).toString('utf8')) as {
        chapters: Record<string, Record<string, { words: Array<{ morph?: string }> }>>;
      };
      for (const chapter of Object.values(book.chapters)) {
        for (const verse of Object.values(chapter)) {
          for (const word of verse.words) {
            if (!word.morph) continue;
            tokens += 1;
            codes.add(word.morph);
            const expansion = expandHebrewMorphCode(word.morph);
            if (expansion) expandedTokens += 1;
            else {
              expect(word.morph).toContain('//');
              malformedTokens += 1;
            }
          }
        }
      }
    }

    const malformedCodes = [...codes].filter(code => !expandHebrewMorphCode(code));
    expect({ tokens, distinctCodes: codes.size, expandedTokens, malformedTokens, malformedDistinctCodes: malformedCodes.length })
      .toEqual({ tokens: 300_811, distinctCodes: 2_645, expandedTokens: 300_784, malformedTokens: 27, malformedDistinctCodes: 26 });
    expect(malformedCodes.every(code => code.includes('//'))).toBe(true);
  });
});
