import { describe, expect, it } from 'vitest';
import { resolveMorphologyLemma } from '../../../scripts/morphology-lemma.js';

const lexicon = {
  H0430: { lemma: 'אֱלֹהִים' },
  H7225: { lemma: 'רֵאשִׁית' },
  H9999: { lemma: '   ' },
};

describe('morphology lemma materialization', () => {
  it('preserves a lemma supplied by the morphology source', () => {
    expect(resolveMorphologyLemma('  ὁ  ', 'G3588', 'NT', lexicon)).toBe('  ὁ  ');
  });

  it('joins a blank Hebrew token to the exact tracked TBESH identity', () => {
    expect(resolveMorphologyLemma('', 'H430', 'OT', lexicon)).toBe('אֱלֹהִים');
    expect(resolveMorphologyLemma('', 'H7225', 'OT', lexicon)).toBe('רֵאשִׁית');
  });

  it('never fabricates a lemma from an unresolved identity, surface form, or gloss', () => {
    expect(resolveMorphologyLemma('', 'H1234', 'OT', lexicon)).toBe('');
    expect(resolveMorphologyLemma('', undefined, 'OT', lexicon)).toBe('');
    expect(resolveMorphologyLemma('', 'H9999', 'OT', lexicon)).toBe('');
    expect(resolveMorphologyLemma('', 'H0430', 'NT', lexicon)).toBe('');
  });
});
