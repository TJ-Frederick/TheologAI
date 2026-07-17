import { describe, expect, it } from 'vitest';
import { presentOriginalLanguageEntry, presentOriginalLanguageSearch } from '../../../src/presenters/originalLanguageStructured.js';
import { MORPHOLOGY_USAGE_IDENTITY } from '../../../src/kernel/morphologyUsageCursor.js';
import { STEPBIBLE_SOURCE } from '../../../src/kernel/stepBibleSource.js';

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
        attribution: 'Tyndale House, Cambridge / STEP Bible (www.stepbible.org)',
        version: '0f60797c170f11a1f8dc75c5f7617973e2e66b0d',
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
      language: 'Greek',
      testament: null,
    }, 'simple');

    expect(result.entries[0]).toMatchObject({ strongsNumber: 'G21502', language: 'Greek', testament: null, provenanceIds: ['src-1'] });
    expect(result.provenance).toEqual([expect.objectContaining({
      id: 'src-1',
      label: 'STEPBible lexicon data',
      rightsNotice: 'CC BY 4.0 (Tyndale House, Cambridge)',
      license: { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
      attribution: 'Tyndale House, Cambridge / STEP Bible (www.stepbible.org)',
      version: '0f60797c170f11a1f8dc75c5f7617973e2e66b0d',
      url: 'https://github.com/STEPBible/STEPBible-Data/tree/0f60797c170f11a1f8dc75c5f7617973e2e66b0d',
    })]);
  });

  it('represents withheld TBESH Meaning as null and preserves only approved Hebrew evidence', () => {
    const forbidden = 'FORBIDDEN ONLINE BIBLE MEANING';
    const result = presentOriginalLanguageEntry({
      strongs_number: 'H9001', testament: null, language: 'Hebrew', lemma: '/וַ',
      transliteration: '/wa', definition: null, sourceKind: 'stepbible_lexicon',
      citation: { source: 'STEPBible lexicon data', copyright: 'CC BY 4.0 (Tyndale House, Cambridge)' },
      extended: { strongsExtended: 'H9001', gloss: '&', morphologyCode: 'H:C', source: 'TBESH' },
      evidencePolicy: {
        code: 'tbesh_meaning_withheld', semanticEvidence: 'unavailable',
        withheldFields: ['tbesh_meaning'], notice: 'TBESH Meaning is withheld; no replacement is inferred.',
      },
    }, 'detailed');

    expect(result.entries[0]).toMatchObject({
      strongsNumber: 'H9001', language: 'Hebrew', definition: null, gloss: '&',
      extended: { strongsExtended: 'H9001', morphologyCode: 'H:C', lexicon: 'TBESH' },
      evidencePolicy: { code: 'tbesh_meaning_withheld', semanticEvidence: 'unavailable' },
    });
    expect(result.entries[0].extended).not.toHaveProperty('definition');
    expect(result.provenance[0].note).toContain('no replacement is inferred');
    expect(JSON.stringify(result)).not.toContain(forbidden);
  });

  it('does not qualify a safe OpenScriptures definition with the TBESH rights notice', () => {
    const result = presentOriginalLanguageEntry({
      strongs_number: 'H430', testament: 'OT', lemma: 'אֱלֹהִים', definition: 'God, gods',
      citation: { source: "Strong's Concordance", copyright: 'Public Domain (OpenScriptures)' },
      extendedCitation: { source: 'STEPBible lexicon data', copyright: 'CC BY 4.0 (Tyndale House, Cambridge)' },
      extended: { strongsExtended: 'H0430', gloss: 'God/gods', morphologyCode: 'H:N-MP' },
      evidencePolicy: {
        code: 'tbesh_meaning_withheld', semanticEvidence: 'base_dictionary_only',
        withheldFields: ['tbesh_meaning'], notice: 'TBESH Meaning is withheld.',
      },
    }, 'detailed');

    expect(result.entries[0]).toMatchObject({
      definition: 'God, gods', gloss: 'God/gods',
      evidencePolicy: { semanticEvidence: 'base_dictionary_only' },
    });
    expect(result.provenance[0]).not.toHaveProperty('note');
    expect(result.provenance[1].note).toBe('TBESH Meaning is withheld.');
  });

  it('presents exact corrected-corpus usage with separate morphology provenance', () => {
    const result = presentOriginalLanguageEntry({
      strongs_number: 'H430', testament: 'OT', lemma: 'אֱלֹהִים', definition: 'God, gods',
      citation: { source: "Strong's Concordance", copyright: 'Public Domain' },
    }, 'simple', {
      level: 'study', exactMorphologyKey: 'H0430', corpusIdentity: 'c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd',
      attested: true, totals: { tokenCount: 2, verseCount: 2, bookCount: 1, sourceSurfaceVariantCount: 2 },
      bookDistribution: [{ book: 'Genesis', canonicalOrder: 1, tokenCount: 2, verseCount: 2 }],
      sourceSurfaceVariants: [{
        sourceForm: 'אֱלֹהִ֑ים', tokenCount: 1, verseCount: 1,
        firstOccurrence: { book: 'Genesis', canonicalOrder: 1, chapter: 1, verse: 1, position: 3 },
      }], cautions: ['one', 'two', 'three'],
    });
    expect(result.corpusUsage).toMatchObject({
      exactMorphologyKey: 'H0430', sourceSurfaceVariants: [{ sourceForm: 'אֱלֹהִ֑ים' }], provenanceIds: ['src-usage'],
    });
    expect(result.provenance).toContainEqual(expect.objectContaining({
      id: 'src-usage',
      kind: 'morphology_dataset',
      license: { label: 'CC BY 4.0', url: expect.any(String) },
      version: MORPHOLOGY_USAGE_IDENTITY,
      url: STEPBIBLE_SOURCE.commitUrl,
      attribution: STEPBIBLE_SOURCE.attribution,
      note: expect.stringContaining(`upstream STEPBible source commit ${STEPBIBLE_SOURCE.commitSha}`),
    }));
  });

  it('represents an exact extended identity as not attested without base-key inheritance', () => {
    const result = presentOriginalLanguageEntry({
      strongs_number: 'H430A', testament: null, language: 'Hebrew', lemma: 'fixture', definition: 'fixture',
      sourceKind: 'stepbible_lexicon', citation: { source: 'STEPBible lexicon data', copyright: 'CC BY 4.0' },
    }, 'simple', {
      level: 'overview', exactMorphologyKey: 'H0430A', corpusIdentity: 'c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd',
      attested: false, totals: { tokenCount: 0, verseCount: 0, bookCount: 0, sourceSurfaceVariantCount: 0 },
      bookDistribution: [], sourceSurfaceVariants: [], cautions: ['one', 'two', 'three'],
    });
    expect(result.corpusUsage).toMatchObject({ exactMorphologyKey: 'H0430A', attested: false, totals: { tokenCount: 0 } });
  });
});
