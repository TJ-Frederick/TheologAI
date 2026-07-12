import { describe, expect, it } from 'vitest';
import { presentOriginalLanguageEntry, presentOriginalLanguageSearch } from '../../../src/presenters/originalLanguageStructured.js';

describe('original-language structured presenter', () => {
  it('keeps ambiguous search results at summary level without guessing nextStep', () => {
    const result = presentOriginalLanguageSearch('love', [
      { strongs_number: 'G25', testament: 'NT', lemma: 'ἀγαπάω', transliteration: 'agapaō', pronunciation: null, definition: 'to love', derivation: null },
      { strongs_number: 'G26', testament: 'NT', lemma: 'ἀγάπη', transliteration: 'agapē', pronunciation: null, definition: 'love', derivation: null },
    ]);

    expect(result).toMatchObject({
      mode: 'search',
      query: 'love',
      detailLevel: 'summary',
      entries: [
        { strongsNumber: 'G25', language: 'Greek', testament: 'NT', provenanceIds: ['src-1'] },
        { strongsNumber: 'G26', language: 'Greek', testament: 'NT', provenanceIds: ['src-1'] },
      ],
    });
    expect(result).not.toHaveProperty('nextStep');
    expect(result.provenance).toEqual([expect.objectContaining({
      rightsNotice: 'Public Domain (OpenScriptures)',
      license: { label: 'Public Domain' },
    })]);
  });

  it('offers a detailed exact lookup for one unambiguous search hit', () => {
    const result = presentOriginalLanguageSearch('agape', [
      { strongs_number: 'G26', testament: 'NT', lemma: 'ἀγάπη', transliteration: 'agapē', pronunciation: null, definition: 'love', derivation: null },
    ]);

    expect(result.nextStep).toEqual({
      tool: 'original_language_lookup',
      arguments: { strongs_number: 'G26', detail_level: 'detailed', include_extended: true },
    });
  });

  it('maps detailed and extended exact fields to linked provenance', () => {
    const result = presentOriginalLanguageEntry({
      strongs_number: 'G25',
      testament: 'NT',
      lemma: 'ἀγαπάω',
      transliteration: 'agapaō',
      pronunciation: 'ag-ap-ah-o',
      definition: 'to love',
      derivation: 'perhaps from agan',
      citation: { source: "Strong's Concordance", copyright: 'Public Domain' },
      extendedCitation: { source: 'STEPBible lexicon data', copyright: 'CC BY 4.0' },
      extended: {
        strongsExtended: 'H1',
        gloss: 'love',
        morphologyCode: 'V-AAI-1S',
        source: 'STEPBible',
        definition: 'Extended definition',
        occurrences: 143,
        senses: { first: { gloss: 'love', usage: 'in context', count: 12 } },
      },
    }, 'detailed');

    expect(result.entries[0]).toMatchObject({
      strongsNumber: 'G25',
      language: 'Greek',
      derivation: 'perhaps from agan',
      extended: {
        strongsExtended: 'H1',
        lexicon: 'STEPBible',
        occurrences: 143,
        senses: [{ gloss: 'love', usage: 'in context', count: 12 }],
      },
      provenanceIds: ['src-1', 'src-2'],
    });
    expect(result.provenance).toMatchObject([
      {
        id: 'src-1',
        rightsNotice: 'Public Domain',
        license: { label: 'Public Domain' },
        attribution: 'OpenScriptures',
      },
      {
        id: 'src-2',
        rightsNotice: 'CC BY 4.0',
        license: { label: 'CC BY 4.0' },
        attribution: 'Tyndale House, Cambridge',
      },
    ]);
  });

  it('uses STEPBible as the sole base provenance for a lexicon-only identity', () => {
    const result = presentOriginalLanguageEntry({
      strongs_number: 'G21502',
      testament: 'NT',
      lemma: 'Ηνια',
      transliteration: 'Henia',
      definition: 'Heneia, man occurring at LXX in 1Ch.25.9',
      citation: {
        source: 'STEPBible lexicon data',
        copyright: 'CC BY 4.0 (Tyndale House, Cambridge)',
        url: 'https://github.com/STEPBible/STEPBible-Data',
      },
      sourceKind: 'stepbible_lexicon',
    }, 'simple');

    expect(result.entries[0]).toMatchObject({ strongsNumber: 'G21502', provenanceIds: ['src-1'] });
    expect(result.provenance).toEqual([expect.objectContaining({
      id: 'src-1',
      label: 'STEPBible lexicon data',
      rightsNotice: 'CC BY 4.0 (Tyndale House, Cambridge)',
      license: { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
      attribution: 'Tyndale House, Cambridge',
    })]);
  });
});
