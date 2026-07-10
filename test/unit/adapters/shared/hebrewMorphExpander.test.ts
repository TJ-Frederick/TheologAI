import { describe, expect, it } from 'vitest';
import { expandHebrewMorphCode } from '../../../../src/adapters/shared/hebrewMorphExpander.js';

describe('expandHebrewMorphCode', () => {
  it('expands complete verb morphology', () => {
    expect(expandHebrewMorphCode('HVqp3ms'))
      .toBe('Verb Qal Perfect 3rd Masculine Singular');
  });

  it('expands non-verb morphology including type, gender, number, and state', () => {
    expect(expandHebrewMorphCode('HNcmsa'))
      .toBe('Noun Common Masculine Singular Absolute');
    expect(expandHebrewMorphCode('HPfpd'))
      .toBe('Pronoun Feminine Plural Determined');
  });

  it('returns a partial expansion when known details precede unknown details', () => {
    expect(expandHebrewMorphCode('HVq?')).toBe('Verb Qal');
    expect(expandHebrewMorphCode('HAc?')).toBe('Adjective Common');
  });

  it('returns undefined for malformed, unsupported, or detail-free codes', () => {
    expect(expandHebrewMorphCode('')).toBeUndefined();
    expect(expandHebrewMorphCode('H')).toBeUndefined();
    expect(expandHebrewMorphCode('HXabc')).toBeUndefined();
    expect(expandHebrewMorphCode('HV')).toBeUndefined();
    expect(expandHebrewMorphCode('HN')).toBeUndefined();
  });

  it('recognizes less common verb stems and forms', () => {
    expect(expandHebrewMorphCode('HVzj2fp'))
      .toBe('Verb Hithpoel Jussive 2nd Feminine Plural');
  });
});
