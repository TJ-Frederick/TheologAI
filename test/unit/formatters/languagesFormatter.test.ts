import { describe, it, expect } from 'vitest';
import {
  formatStrongsResult,
  formatMorphologyResult,
} from '../../../src/formatters/languagesFormatter.js';
import type { EnhancedStrongsResult, VerseMorphologyResult, VerseWord } from '../../../src/kernel/types.js';

// ── Fixtures ──

function makeStrongsResult(overrides: Partial<EnhancedStrongsResult> = {}): EnhancedStrongsResult {
  return {
    strongs_number: 'G26',
    testament: 'NT',
    lemma: 'ἀγάπη',
    transliteration: 'agapē',
    pronunciation: 'ag-ah-pay',
    definition: 'love, goodwill',
    derivation: 'from G25',
    citation: { source: "Strong's Concordance", copyright: 'Public Domain (OpenScriptures)' },
    ...overrides,
  };
}

function makeWord(overrides: Partial<VerseWord> = {}): VerseWord {
  return {
    position: 1,
    text: 'Ἐν',
    lemma: 'ἐν',
    strong: 'G1722',
    morph: 'PREP',
    gloss: 'In',
    ...overrides,
  };
}

function makeMorphResult(overrides: Partial<VerseMorphologyResult> = {}): VerseMorphologyResult {
  return {
    reference: 'John 1:1',
    testament: 'NT',
    book: 'John',
    chapter: 1,
    verse: 1,
    words: [makeWord()],
    citation: { source: 'STEPBible TAGNT/TAHOT', copyright: 'CC BY 4.0 (Tyndale House, Cambridge)' },
    ...overrides,
  };
}

// ── formatStrongsResult ──

describe('formatStrongsResult', () => {
  it('shows Strong\'s number and testament language', () => {
    const out = formatStrongsResult(makeStrongsResult());
    expect(out).toContain('**G26** (Greek)');
  });

  it('shows Hebrew for OT entries', () => {
    const out = formatStrongsResult(makeStrongsResult({ testament: 'OT', strongs_number: 'H430' }));
    expect(out).toContain('**H430** (Hebrew)');
  });

  it('shows lemma, transliteration, pronunciation, definition', () => {
    const out = formatStrongsResult(makeStrongsResult());
    expect(out).toContain('**Lemma:** ἀγάπη');
    expect(out).toContain('**Transliteration:** agapē');
    expect(out).toContain('**Pronunciation:** ag-ah-pay');
    expect(out).toContain('**Definition:** love, goodwill');
  });

  it('omits transliteration when null', () => {
    const out = formatStrongsResult(makeStrongsResult({ transliteration: undefined }));
    expect(out).not.toContain('**Transliteration:**');
  });

  it('omits pronunciation when null', () => {
    const out = formatStrongsResult(makeStrongsResult({ pronunciation: undefined }));
    expect(out).not.toContain('**Pronunciation:**');
  });

  it('in simple mode, does not show derivation', () => {
    const out = formatStrongsResult(makeStrongsResult(), 'simple');
    expect(out).not.toContain('**Derivation:**');
  });

  it('in detailed mode, shows derivation', () => {
    const out = formatStrongsResult(makeStrongsResult(), 'detailed');
    expect(out).toContain('**Derivation:** from G25');
  });

  it('in detailed mode, omits derivation when undefined', () => {
    const out = formatStrongsResult(makeStrongsResult({ derivation: undefined }), 'detailed');
    expect(out).not.toContain('**Derivation:**');
  });

  it('in detailed mode with extended data, shows strongsExtended and occurrences', () => {
    const out = formatStrongsResult(makeStrongsResult({
      extended: {
        strongsExtended: 'G0026',
        occurrences: 116,
      },
    }), 'detailed');
    expect(out).toContain("Extended Strong's: G0026");
    expect(out).toContain('Occurrences: 116');
  });

  it('in detailed mode, formats senses list', () => {
    const out = formatStrongsResult(makeStrongsResult({
      extended: {
        senses: {
          '1': { gloss: 'love', count: 85, usage: 'divine love' },
          '2': { gloss: 'charity', count: 31, usage: 'Christian virtue' },
        },
      },
    }), 'detailed');
    expect(out).toContain('**Senses:**');
    expect(out).toContain('- love (85x): divine love');
    expect(out).toContain('- charity (31x): Christian virtue');
  });

  it('appends citation', () => {
    const out = formatStrongsResult(makeStrongsResult());
    expect(out).toContain("*Source: Strong's Concordance*");
    expect(out).toContain('Public Domain (OpenScriptures)');
  });

  it('returns trimmed output', () => {
    const out = formatStrongsResult(makeStrongsResult());
    expect(out).toBe(out.trim());
  });
});

// ── formatMorphologyResult ──

describe('formatMorphologyResult', () => {
  it('shows reference and language in header', () => {
    const out = formatMorphologyResult(makeMorphResult());
    expect(out).toContain('**John 1:1** — Word-by-Word Greek Analysis');
  });

  it('shows Hebrew for OT entries', () => {
    const out = formatMorphologyResult(makeMorphResult({ testament: 'OT' }));
    expect(out).toContain('Word-by-Word Hebrew Analysis');
  });

  it('renders Markdown table headers', () => {
    const out = formatMorphologyResult(makeMorphResult());
    expect(out).toContain('| # | Text | Lemma | Strong\'s | Morphology | Gloss |');
    expect(out).toContain('|---|------|-------|----------|------------|-------|');
  });

  it('renders word rows in table', () => {
    const out = formatMorphologyResult(makeMorphResult({
      words: [
        makeWord({ position: 1, text: 'Ἐν', lemma: 'ἐν', strong: 'G1722', morph: 'PREP', gloss: 'In' }),
        makeWord({ position: 2, text: 'ἀρχῇ', lemma: 'ἀρχή', strong: 'G746', morph: 'N-DSF', gloss: 'beginning' }),
      ],
    }));
    expect(out).toContain('| 1 | Ἐν | ἐν | G1722 | PREP | In |');
    expect(out).toContain('| 2 | ἀρχῇ | ἀρχή | G746 | N-DSF | beginning |');
  });

  it('uses morphExpanded when available', () => {
    const out = formatMorphologyResult(makeMorphResult({
      words: [makeWord({ morph: 'N-DSF', morphExpanded: 'Noun, Dative, Singular, Feminine' })],
    }));
    expect(out).toContain('Noun, Dative, Singular, Feminine');
    expect(out).not.toContain('| N-DSF |');
  });

  it('falls back to morph when morphExpanded is undefined', () => {
    const out = formatMorphologyResult(makeMorphResult({
      words: [makeWord({ morph: 'PREP', morphExpanded: undefined })],
    }));
    expect(out).toContain('| PREP |');
  });

  it('appends citation', () => {
    const out = formatMorphologyResult(makeMorphResult());
    expect(out).toContain('*Source: STEPBible TAGNT/TAHOT*');
    expect(out).toContain('CC BY 4.0 (Tyndale House, Cambridge)');
  });

  it('returns trimmed output', () => {
    const out = formatMorphologyResult(makeMorphResult());
    expect(out).toBe(out.trim());
  });
});
