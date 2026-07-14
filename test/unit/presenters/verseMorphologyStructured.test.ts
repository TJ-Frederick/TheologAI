import { describe, expect, it } from 'vitest';
import { validatorFor } from '../../../src/mcp/validation.js';
import { verseMorphologyOutputSchema } from '../../../src/mcp/schemas/verseMorphology.js';
import { presentVerseMorphologyStructured } from '../../../src/presenters/verseMorphologyStructured.js';
import type { VerseMorphologyResult, VerseWord } from '../../../src/kernel/types.js';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const morphologyCitation = {
  source: 'STEPBible TAGNT/TAHOT',
  copyright: 'CC BY 4.0 (Tyndale House, Cambridge)',
  url: 'https://github.com/STEPBible/STEPBible-Data',
};

function greekResult(words?: VerseWord[]): VerseMorphologyResult {
  return {
    reference: 'John 1:1', testament: 'NT', book: 'John', chapter: 1, verse: 1,
    words: words ?? [{
      position: 1, text: 'Ἐν', lemma: 'ἐν', strong: 'G1722', morph: 'PREP',
      morphExpanded: 'preposition', gloss: 'in',
    }],
    citation: morphologyCitation,
  };
}

describe('verse morphology structured presenter', () => {
  it('presents Greek words with raw and expanded morphology and shared lemma provenance', () => {
    const presented = presentVerseMorphologyStructured(greekResult());

    expect(presented).toMatchObject({
      schemaVersion: '1',
      kind: 'bible_verse_morphology',
      reference: 'John 1:1',
      testament: 'NT',
      language: 'Greek',
      book: 'John',
      chapter: 1,
      verse: 1,
      words: [{
        position: 1,
        text: 'Ἐν',
        lemma: 'ἐν',
        strongsNumber: 'G1722',
        morphologyCode: 'PREP',
        morphologyExpansion: 'preposition',
        gloss: 'in',
        provenanceIds: ['stepbible-morphology'],
        lemmaProvenanceIds: ['stepbible-morphology'],
      }],
      provenance: [{
        id: 'stepbible-morphology',
        kind: 'morphology_dataset',
        label: 'STEPBible TAGNT/TAHOT',
        license: { label: 'CC BY 4.0' },
        attribution: 'Tyndale House, Cambridge / STEP Bible (www.stepbible.org)',
        version: '0f60797c170f11a1f8dc75c5f7617973e2e66b0d',
        url: 'https://github.com/STEPBible/STEPBible-Data/tree/0f60797c170f11a1f8dc75c5f7617973e2e66b0d',
        locator: 'John 1:1',
        status: 'verified_source',
      }],
    });
    expect(validatorFor(verseMorphologyOutputSchema)(presented).valid).toBe(true);
  });

  it('links Hebrew lemmas to TBESH and maps blank optional values to null', () => {
    const presented = presentVerseMorphologyStructured({
      reference: 'Genesis 1:1', testament: 'OT', book: 'Genesis', chapter: 1, verse: 1,
      words: [{
        position: 1, text: 'בְּרֵאשִׁית', lemma: 'רֵאשִׁית', strong: '   ',
        morph: 'HNcfsa', morphExpanded: undefined, gloss: '',
      }, {
        position: 2, text: ' ', lemma: '', strong: '', morph: '', gloss: '[ ]',
      }],
      citation: morphologyCitation,
      lemmaCitation: {
        source: 'STEPBible TBESH Hebrew lexicon',
        copyright: 'CC BY 4.0 (Tyndale House, Cambridge)',
        url: 'https://github.com/STEPBible/STEPBible-Data',
      },
    });

    expect(presented.language).toBe('Hebrew');
    expect(presented.words[0]).toMatchObject({
      strongsNumber: null,
      morphologyCode: 'HNcfsa',
      morphologyExpansion: null,
      gloss: null,
      provenanceIds: ['stepbible-morphology'],
      lemmaProvenanceIds: ['stepbible-lexicon'],
    });
    expect(presented.words[1]).toMatchObject({
      text: null,
      lemma: null,
      strongsNumber: null,
      morphologyCode: null,
      morphologyExpansion: null,
      gloss: '[ ]',
      provenanceIds: ['stepbible-morphology'],
      lemmaProvenanceIds: [],
    });
    expect(presented.provenance).toEqual([
      expect.objectContaining({ id: 'stepbible-morphology', kind: 'morphology_dataset' }),
      expect.objectContaining({
        id: 'stepbible-lexicon', kind: 'lexicon', label: 'STEPBible TBESH Hebrew lexicon',
      }),
    ]);
    expect(validatorFor(verseMorphologyOutputSchema)(presented).valid).toBe(true);
  });

  it('preserves nonblank source strings exactly', () => {
    const presented = presentVerseMorphologyStructured(greekResult([{
      position: 1,
      text: ' word ',
      lemma: ' lemma ',
      strong: ' G1722 ',
      morph: ' PREP ',
      morphExpanded: ' preposition ',
      gloss: ' in ',
    }]));

    expect(presented.words[0]).toMatchObject({
      text: ' word ',
      lemma: ' lemma ',
      strongsNumber: ' G1722 ',
      morphologyCode: ' PREP ',
      morphologyExpansion: ' preposition ',
      gloss: ' in ',
    });
    expect(validatorFor(verseMorphologyOutputSchema)(presented).valid).toBe(true);
  });

  it('fails closed instead of silently truncating an over-bound verse', () => {
    const words = Array.from({ length: 201 }, (_, index): VerseWord => ({
      position: index + 1,
      text: `word-${index + 1}`,
      lemma: `lemma-${index + 1}`,
      strong: ' G1722 ',
      morph: ' PREP ',
      morphExpanded: ' preposition ',
      gloss: ' in ',
    }));

    expect(() => presentVerseMorphologyStructured(greekResult(words)))
      .toThrow('exceeds the 200-word structured output limit');
  });

  it('keeps a pinned reachable blank-token corpus sentinel schema-valid', () => {
    const compressed = readFileSync(new URL(
      '../../../data/biblical-languages/stepbible/hebrew/07-Judges.json.gz',
      import.meta.url,
    ));
    const judges = JSON.parse(gunzipSync(compressed).toString('utf8')) as {
      chapters: Record<string, Record<string, { words: VerseWord[] }>>;
    };
    const sourceWord = judges.chapters['16']['25'].words.find(word => word.position === 2);
    expect(sourceWord).toMatchObject({ text: '', lemma: '', gloss: '[ ]' });

    const presented = presentVerseMorphologyStructured({
      reference: 'Judges 16:25', testament: 'OT', book: 'Judges', chapter: 16, verse: 25,
      words: [sourceWord!], citation: morphologyCitation,
      lemmaCitation: {
        source: 'STEPBible TBESH Hebrew lexicon',
        copyright: 'CC BY 4.0 (Tyndale House, Cambridge)',
      },
    });

    expect(presented.words).toEqual([expect.objectContaining({
      text: null, lemma: null, lemmaProvenanceIds: [],
    })]);
    expect(presented.provenance.map(source => source.id)).toEqual(['stepbible-morphology']);
    expect(validatorFor(verseMorphologyOutputSchema)(presented).valid).toBe(true);
  });
});
