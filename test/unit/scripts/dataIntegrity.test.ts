import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertJohnOneOneSource } from '../../../scripts/data-integrity.js';

describe('STEPBible semantic integrity fixtures', () => {
  it('preserves the canonical John 1:1 Greek article in tracked source data', () => {
    const source = JSON.parse(gunzipSync(readFileSync(
      'data/biblical-languages/stepbible/greek/43-John.json.gz',
    )).toString('utf8'));

    expect(() => assertJohnOneOneSource(source)).not.toThrow();
    expect(source.chapters['1']['1'].words[10]).toMatchObject({
      position: 11,
      text: 'τὸ',
      lemma: 'ὁ',
      strong: 'G3588',
    });
  });

  it('rejects replacement-character corruption even when the row shape is valid', () => {
    const source = {
      book: 'John',
      chapters: { '1': { '1': { words: [{ position: 11, text: 'τὸ��', lemma: 'ὁ', strong: 'G3588' }] } } },
    };

    expect(() => assertJohnOneOneSource(source)).toThrow(/expected "τὸ"/);
  });
});
