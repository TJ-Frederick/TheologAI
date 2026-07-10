import { describe, expect, it } from 'vitest';
import {
  isAsciiTransliterationQuery,
  normalizeTransliteration,
  normalizedTransliterationSql,
} from '../../../src/kernel/transliteration.js';

describe('transliteration normalization', () => {
  it('maps STEPBible Hebrew transliteration to common ASCII spelling', () => {
    expect(normalizeTransliteration('ʼĕlôhîym')).toBe('elohim');
    expect(isAsciiTransliterationQuery('elohim')).toBe(true);
  });

  it('does not route Unicode queries through the ASCII fallback', () => {
    expect(isAsciiTransliterationQuery('אֱלֹהִים')).toBe(false);
    expect(isAsciiTransliterationQuery('agapē')).toBe(false);
  });

  it('provides a parameterized SQL expression for repository parity', () => {
    expect(normalizedTransliterationSql('s.transliteration')).toContain("replace(");
    expect(normalizedTransliterationSql('s.transliteration')).toContain("'iy', 'i'");
  });
});
