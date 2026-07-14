import { describe, expect, it } from 'vitest';
import { OriginalLanguageStudyService } from '../../../../src/services/languages/OriginalLanguageStudyService.js';
import type { IMorphologyRepository, IStrongsRepository, MorphWord } from '../../../../src/kernel/repositories.js';
import { AdapterError, NotFoundError } from '../../../../src/kernel/errors.js';
import { expandHebrewMorphCode } from '../../../../src/adapters/shared/hebrewMorphExpander.js';

const loved: MorphWord = { position: 3, word_text: 'ἠγάπησεν', lemma: 'ἀγαπάω', strongs_number: 'G0025', morph_code: 'V-AAI-3S', gloss: 'loved' };

function repos(words: MorphWord[] = [loved], options: { dictionary?: boolean; lexicon?: boolean; expansion?: string } = {}) {
  const morphology: IMorphologyRepository = {
    getVerseMorphology: () => words, expandMorphCode: () => options.expansion,
    getAvailableBooks: () => [], hasVerse: () => true, getOccurrences: () => [], getDistribution: () => [],
    getUsageStats: () => undefined, getBookUsage: () => [], getFormUsage: () => [],
    getTokenOccurrences: () => ({ occurrences: [] }),
  };
  const strongs: IStrongsRepository = {
    lookup: id => options.dictionary === false ? undefined : ({ strongs_number: id, testament: 'NT', lemma: 'ἀγαπάω', transliteration: 'agapaō', pronunciation: null, definition: 'to love', derivation: null }),
    search: () => [],
    getLexiconEntry: id => options.lexicon === false ? undefined : ({ strongs_number: id, source: 'TBESG', extended_data: { extendedStrongs: 'G0025', gloss: 'love', definition: 'to have love', source: 'TBESG' } }),
    getStats: () => ({ greek: 1, hebrew: 0, total: 1 }),
  };
  return { morphology, strongs };
}

describe('OriginalLanguageStudyService', () => {
  it('resolves a local gloss and canonical Strong identity with source evidence', async () => {
    const { morphology, strongs } = repos([loved], { expansion: 'Verb, Aorist, Active, Indicative, 3rd Singular' });
    const result = await new OriginalLanguageStudyService(morphology, strongs).study({ reference: 'John 3:16', target: 'loved' });
    expect(result).toMatchObject({ status: 'complete', language: 'Greek', selectedToken: { position: 3 }, identity: { publicStrongs: 'G25', morphologyKey: 'G0025', sourceStrongs: 'G0025', joinKind: 'exact' }, grammar: { certainty: 'expanded' } });
    expect(result.stepBible).toMatchObject({ gloss: 'love' });
  });

  it('returns candidates rather than guessing repeated verse-local matches', async () => {
    const { morphology, strongs } = repos([{ ...loved, position: 3 }, { ...loved, position: 7 }]);
    const result = await new OriginalLanguageStudyService(morphology, strongs).study({ reference: 'John 3:16', target: 'loved' });
    expect(result.status).toBe('needs_disambiguation');
    expect(result.candidates?.map(c => c.position)).toEqual([3, 7]);
  });

  it('uses position only when that token also matches the target', async () => {
    const { morphology, strongs } = repos([loved]);
    await expect(new OriginalLanguageStudyService(morphology, strongs).study({ reference: 'John 3:16', target: 'loved', position: 2 })).rejects.toThrow('No token exists at position 2');
    await expect(new OriginalLanguageStudyService(morphology, strongs).study({ reference: 'John 3:16', target: 'world', position: 3 })).rejects.toThrow('does not match target');
  });

  it('returns partial evidence when lexical and grammar joins are absent', async () => {
    const { morphology, strongs } = repos([loved], { dictionary: false, lexicon: false });
    const result = await new OriginalLanguageStudyService(morphology, strongs).study({ reference: 'John 3:16', target: 'G25' });
    expect(result.status).toBe('partial');
    expect(result.identity?.joinKind).toBe('none');
    expect(result.grammar?.certainty).toBe('unknown');
    expect(result.warnings).toHaveLength(2);
  });

  it('resolves transliteration only through identities present in the verse', async () => {
    const { morphology, strongs } = repos([loved]);
    const result = await new OriginalLanguageStudyService(morphology, strongs).study({ reference: 'John 3:16', target: 'agapao' });
    expect(result.selectedToken?.position).toBe(3);
  });

  it('matches pointed and unpointed Hebrew exactly without changing consonants', async () => {
    const hebrew = { ...loved, word_text: 'אֱלֹהִים֙', lemma: 'אֱלֹהִים', strongs_number: 'H0430', gloss: 'God' };
    const { morphology, strongs } = repos([hebrew]);
    const service = new OriginalLanguageStudyService(morphology, strongs);
    await expect(service.study({ reference: 'Genesis 1:1', target: 'אלהים' })).resolves.toMatchObject({ selectedToken: { position: 3 } });
    await expect(service.study({ reference: 'Genesis 1:1', target: 'אלחים' })).rejects.toThrow('No token');
  });

  it('matches accented and unaccented Greek exactly without changing letters', async () => {
    const { morphology, strongs } = repos([{ ...loved, word_text: 'ἠγάπησεν' }]);
    const service = new OriginalLanguageStudyService(morphology, strongs);
    await expect(service.study({ reference: 'John 3:16', target: 'ηγαπησεν' })).resolves.toMatchObject({ selectedToken: { position: 3 } });
    await expect(service.study({ reference: 'John 3:16', target: 'ηγαπησαν' })).rejects.toThrow('No token');
  });

  it('continues past typed lexical not-found during transliteration resolution', async () => {
    const { morphology, strongs } = repos([loved]);
    strongs.lookup = () => { throw new NotFoundError('strongs', 'missing'); };
    await expect(new OriginalLanguageStudyService(morphology, strongs).study({ reference: 'John 3:16', target: 'agapao' })).rejects.toThrow('No token');
  });

  it('propagates operational repository failures during transliteration resolution', async () => {
    const { morphology, strongs } = repos([loved]);
    strongs.lookup = () => { throw new AdapterError('Strong\'s repository', 'unavailable'); };
    await expect(new OriginalLanguageStudyService(morphology, strongs).study({ reference: 'John 3:16', target: 'agapao' })).rejects.toThrow(AdapterError);
  });

  it('classifies OT source material as Hebrew without inferring Aramaic', async () => {
    const word = { ...loved, word_text: 'אֱלֹהִים', lemma: 'אֱלֹהִים', strongs_number: 'H0430', gloss: 'God' };
    const { morphology, strongs } = repos([word]);
    const result = await new OriginalLanguageStudyService(morphology, strongs).study({ reference: 'Genesis 1:1', target: 'God' });
    expect(result.language).toBe('Hebrew');
  });

  it('propagates strict compound grammar and normalized derivation into a Hebrew study', async () => {
    const word: MorphWord = {
      position: 5,
      word_text: 'הַ/שָּׁמַ֖יִם',
      lemma: 'שָׁמַיִם',
      strongs_number: 'H8064',
      morph_code: 'HTd/Ncmpa',
      gloss: 'the/ heavens',
    };
    const { morphology, strongs } = repos([word]);
    morphology.expandMorphCode = expandHebrewMorphCode;
    strongs.lookup = id => ({
      strongs_number: id,
      testament: 'OT',
      lemma: 'שָׁמַיִם',
      transliteration: 'shamayim',
      pronunciation: null,
      definition: 'heavens',
      derivation: '{"_":"from ;","strongsref":[{"$":{"language":"HEBREW","strongs":"08064"}}]}',
    });
    const result = await new OriginalLanguageStudyService(morphology, strongs)
      .study({ reference: 'Genesis 1:1', target: 'H8064' });
    expect(result.grammar).toEqual({
      code: 'HTd/Ncmpa',
      expansion: 'Particle Definite Article / Noun Common Masculine Plural Absolute',
      certainty: 'expanded',
    });
    expect(result.dictionary?.derivation).toBe('from H8064;');
  });

  it('returns identical results through synchronous Node and asynchronous D1-shaped ports', async () => {
    const { morphology, strongs } = repos([loved], { expansion: 'Verb' });
    const asyncMorphology: IMorphologyRepository = {
      getVerseMorphology: async (...args) => await morphology.getVerseMorphology(...args),
      expandMorphCode: async code => await morphology.expandMorphCode(code),
      getAvailableBooks: async () => [], hasVerse: async () => true,
      getOccurrences: async () => [], getDistribution: async () => [],
      getUsageStats: async () => undefined, getBookUsage: async () => [], getFormUsage: async () => [],
      getTokenOccurrences: async () => ({ occurrences: [] }),
    };
    const asyncStrongs: IStrongsRepository = {
      lookup: async id => await strongs.lookup(id), search: async query => await strongs.search(query),
      getLexiconEntry: async id => await strongs.getLexiconEntry(id), getStats: async () => await strongs.getStats(),
    };
    const input = { reference: 'John 3:16', target: 'loved' };
    const nodeResult = await new OriginalLanguageStudyService(morphology, strongs).study(input);
    const d1Result = await new OriginalLanguageStudyService(asyncMorphology, asyncStrongs).study(input);
    expect(d1Result).toEqual(nodeResult);
  });
});
