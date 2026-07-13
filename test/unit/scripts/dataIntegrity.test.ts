import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  genesisOneOneLemmaReadinessPredicate,
  assertJohnOneOneDatabase,
  assertGenesisOneOneDatabase,
  assertHebrewLemmaCoverageDatabase,
  assertJohnOneOneSource,
} from '../../../scripts/data-integrity.js';
import Database from 'better-sqlite3';

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

  it('verifies Greek source lemmas and lexicon-backed Hebrew lemmas independently', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE morphology (book TEXT, chapter INTEGER, verse INTEGER, position INTEGER, word_text TEXT, lemma TEXT, strongs_number TEXT);
      CREATE TABLE stepbible_lexicons (strongs_number TEXT, extended_data TEXT);
      INSERT INTO morphology VALUES ('John', 1, 1, 11, 'τὸ', 'ὁ', 'G3588');
      INSERT INTO morphology VALUES ('Genesis', 1, 1, 3, 'אֱלֹהִ֑ים', 'אֱלֹהִים', 'H0430');
      INSERT INTO stepbible_lexicons VALUES ('H0430', '{"lemma":"אֱלֹהִים"}');
    `);

    expect(() => assertJohnOneOneDatabase(db)).not.toThrow();
    expect(() => assertGenesisOneOneDatabase(db)).not.toThrow();
    expect(() => assertHebrewLemmaCoverageDatabase(db)).not.toThrow();
    expect(genesisOneOneLemmaReadinessPredicate()).toContain("lemma FROM morphology");
    db.close();
  });

  it('rejects a blank Hebrew lemma when its exact lexicon identity is resolvable', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE morphology (strongs_number TEXT, lemma TEXT);
      CREATE TABLE stepbible_lexicons (strongs_number TEXT, extended_data TEXT);
      INSERT INTO morphology VALUES ('H0430', '');
      INSERT INTO stepbible_lexicons VALUES ('H0430', '{"lemma":"אֱלֹהִים"}');
    `);
    expect(() => assertHebrewLemmaCoverageDatabase(db)).toThrow(/1 blank resolvable Hebrew lemma/);
    db.close();
  });
});
