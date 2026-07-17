import { describe, expect, it } from 'vitest';
import type { ToolHandler } from '../../../src/kernel/types.js';
import { recommendedToolCallsForPrompt } from '../../../src/mcp/prompts.js';
import { validatorFor } from '../../../src/mcp/validation.js';
import { createBibleLookupHandler } from '../../../src/tools/v2/bibleLookup.js';
import { createClassicTextsHandler } from '../../../src/tools/v2/classicTexts.js';
import { createCommentaryHandler } from '../../../src/tools/v2/commentary.js';
import { createCrossReferencesHandler } from '../../../src/tools/v2/crossReferences.js';
import { createDonationConfigHandler } from '../../../src/tools/v2/donationConfig.js';
import { createParallelPassagesHandler } from '../../../src/tools/v2/parallelPassages.js';
import { createStrongsLookupHandler } from '../../../src/tools/v2/strongsLookup.js';
import { createVerseMorphologyHandler } from '../../../src/tools/v2/verseMorphology.js';
import { createOriginalLanguageStudyHandler } from '../../../src/tools/v2/originalLanguageStudy.js';
import { createPrimarySourceSearchHandler } from '../../../src/tools/v2/primarySourceSearch.js';

const unused = {} as never;
const tools: ToolHandler[] = [
  createBibleLookupHandler(unused),
  createCrossReferencesHandler(unused),
  createParallelPassagesHandler(unused),
  createCommentaryHandler(unused),
  createClassicTextsHandler(unused),
  createStrongsLookupHandler(unused),
  createVerseMorphologyHandler(unused),
  createOriginalLanguageStudyHandler(unused),
  createPrimarySourceSearchHandler(unused),
  createDonationConfigHandler(unused),
];

const toolByName = new Map(tools.map(tool => [tool.name, tool]));

describe('prompt-recommended tool-call contracts', () => {
  it.each([
    ['word-study', { word: 'G26' }],
    ['word-study', { word: 'love', testament: 'NT' }],
    ['word-study', { word: 'love', reference: 'John 3:16' }],
    ['passage-exegesis', { reference: 'John 3:16', translation: 'NET' }],
    ['passage-exegesis', { reference: 'John 3:16', translation: 'unsupported' }],
    ['passage-exegesis', { reference: 'Romans 8:28-30', translation: 'ESV' }],
    ['compare-translations', { reference: 'Philippians 2:6-8', translations: 'ESV,KJV,NET,BSB' }],
    ['compare-translations', { reference: 'John 1:1', translations: 'unknown' }],
    ['confession-study', { topic: 'justification', traditions: 'Reformed, Lutheran' }],
    ['primary-source-research', { topic: "Lord's Supper", work: 'westminster-confession', maxSections: '2' }],
    ['primary-source-research', { topic: "Lord's Supper", authors: 'Philip Melanchthon,Westminster Assembly', startYear: '1500', endYear: '1700', maxSections: '2' }],
    ['donate', undefined],
  ] as const)('%s emits only calls accepted by advertised tool schemas', (name, args) => {
    const calls = recommendedToolCallsForPrompt(name, args);
    expect(calls.length).toBeGreaterThan(0);

    for (const call of calls) {
      const tool = toolByName.get(call.tool);
      expect(tool, `unknown recommended tool ${call.tool}`).toBeDefined();
      const validate = validatorFor(tool!.inputSchema);
      const result = validate(call.arguments);
      expect(result.valid, result.errorMessage).toBe(true);
    }
  });

  it('never recommends a range to the single-verse morphology tool', () => {
    const calls = recommendedToolCallsForPrompt('passage-exegesis', { reference: 'Romans 8:28-30' });
    expect(calls.some(call => call.tool === 'bible_verse_morphology')).toBe(false);
    expect(calls.some(call => call.tool === 'bible_cross_references')).toBe(false);
  });

  it.each([
    ['John 3:16', 'John 3'],
    ['Romans 8:28-30', 'Romans 8'],
    ['John 3', 'John 3'],
  ])('uses containing-chapter commentary calls for passage exegesis of %s', (reference, chapter) => {
    const commentaryCalls = recommendedToolCallsForPrompt('passage-exegesis', { reference })
      .filter(call => call.tool === 'commentary_lookup');

    expect(commentaryCalls).toEqual([
      { tool: 'commentary_lookup', arguments: { reference: chapter, commentator: 'Matthew Henry' } },
      { tool: 'commentary_lookup', arguments: { reference: chapter, commentator: 'John Gill' } },
    ]);
  });

  it('keeps translation-range morphology bounded to later individual-verse calls', () => {
    const rangeCalls = recommendedToolCallsForPrompt('compare-translations', {
      reference: 'Philippians 2:6-8',
    });
    expect(rangeCalls.some(call => call.tool === 'bible_verse_morphology')).toBe(false);

    const verseCalls = recommendedToolCallsForPrompt('compare-translations', {
      reference: 'John 1:1',
    });
    expect(verseCalls).toContainEqual({
      tool: 'bible_verse_morphology',
      arguments: { reference: 'John 1:1', expand_morphology: true },
    });
  });

  it('never recommends a chapter to verse-only morphology or cross-reference tools', () => {
    const calls = recommendedToolCallsForPrompt('passage-exegesis', { reference: 'John 3' });
    expect(calls.some(call => call.tool === 'bible_verse_morphology')).toBe(false);
    expect(calls.some(call => call.tool === 'bible_cross_references')).toBe(false);
  });

  it('keeps UBS groups and OpenBible discovery in separate passage-exegesis calls', () => {
    const calls = recommendedToolCallsForPrompt('passage-exegesis', { reference: 'John 3:16' });
    expect(calls).toContainEqual({
      tool: 'parallel_passages',
      arguments: {
        reference: 'John 3:16', corpora: ['ubs_source_attested'], maxGroups: 5,
        includeText: false,
      },
    });
    expect(calls).toContainEqual({
      tool: 'bible_cross_references',
      arguments: { reference: 'John 3:16' },
    });
    expect(calls.find(call => call.tool === 'parallel_passages')?.arguments)
      .not.toHaveProperty('includeOpenBibleCrossReferences');
  });

  it('uses morphology to resolve a contextual word before a dynamic study call', () => {
    const calls = recommendedToolCallsForPrompt('word-study', { word: 'love', reference: 'John 3:16' });
    expect(calls.map(call => call.tool)).toContain('bible_verse_morphology');
    expect(calls.map(call => call.tool)).not.toContain('original_language_study');
  });

  it.each(['John 3', 'Romans 8:28-30', 'not a reference'])(
    'never recommends single-verse morphology for invalid word-study context %s',
    reference => {
      const calls = recommendedToolCallsForPrompt('word-study', { word: 'love', reference });
      expect(calls.some(call => call.tool === 'bible_verse_morphology')).toBe(false);
    },
  );

  it('keeps global usage opt-in, overview-only, and after context in guided word study', () => {
    const lexical = recommendedToolCallsForPrompt('word-study', { word: 'G26' });
    expect(lexical).toEqual([{
      tool: 'original_language_lookup',
      arguments: { strongs_number: 'G26', include_extended: true, detail_level: 'detailed', usage_level: 'overview' },
    }]);
    const contextual = recommendedToolCallsForPrompt('word-study', { word: 'G26', reference: 'John 3:16' });
    expect(contextual.at(-1)).toEqual(lexical[0]);
    expect(contextual.find(call => call.tool === 'original_language_study')).toBeUndefined();
  });

  it('routes exact Strong\'s identities through the canonical kernel grammar', () => {
    expect(recommendedToolCallsForPrompt('word-study', { word: 'g0026' })).toEqual([{
      tool: 'original_language_lookup',
      arguments: { strongs_number: 'G26', include_extended: true, detail_level: 'detailed', usage_level: 'overview' },
    }]);

    for (const malformed of ['G0', 'H00000', 'G123456']) {
      expect(recommendedToolCallsForPrompt('word-study', { word: malformed })).toEqual([{
        tool: 'original_language_lookup',
        arguments: { query: malformed, limit: 10 },
      }]);
    }
  });

  it('keeps primary-source research local, bounded, and exact-work aware', () => {
    expect(recommendedToolCallsForPrompt('primary-source-research', { topic: 'eucharist' })).toEqual([{
      tool: 'primary_source_search',
      arguments: { queries: [{ id: 'topic-survey', text: 'eucharist', providers: ['local'], match: 'all_terms', selection: 'work_diversity', limit: 3 }] },
    }]);
    expect(recommendedToolCallsForPrompt('primary-source-research', {
      topic: 'eucharist', work: 'council-of-trent', maxSections: '5',
    })[0].arguments).toMatchObject({
      queries: [{ id: 'exact-local-work', work: 'council-of-trent', providers: ['local'], selection: 'relevance', limit: 5 }],
    });
    expect(recommendedToolCallsForPrompt('primary-source-research', {
      topic: 'eucharist', authors: 'Erasmus of Rotterdam, Martin Luther', startYear: '1500', endYear: '1600',
    })[0].arguments).toEqual({
      queries: [{
        id: 'creator-1', text: 'eucharist', providers: ['local'], match: 'all_terms',
        selection: 'work_diversity', author: 'Erasmus of Rotterdam', startYear: 1500, endYear: 1600, limit: 3,
      }, {
        id: 'creator-2', text: 'eucharist', providers: ['local'], match: 'all_terms',
        selection: 'work_diversity', author: 'Martin Luther', startYear: 1500, endYear: 1600, limit: 3,
      }],
    });
  });

  it('uses bounded local primary-source discovery for confession study', () => {
    expect(recommendedToolCallsForPrompt('confession-study', {
      topic: 'justification', traditions: 'Reformed, Lutheran',
    })).toEqual([{
      tool: 'primary_source_search',
      arguments: {
        queries: [{
          id: 'confession-topic', text: 'justification', providers: ['local'],
          match: 'all_terms', selection: 'work_diversity', limit: 5,
        }],
      },
    }]);
  });

  it.each([
    ['no dates', {}, {}],
    ['lower bound only', { startYear: '500' }, { startYear: 500 }],
    ['upper bound only', { endYear: '1500' }, { endYear: 1500 }],
    ['both bounds', { startYear: '500', endYear: '1500' }, { startYear: 500, endYear: 1500 }],
  ])('keeps %s on local calls while making one unbounded, sequential v5 external discovery call', (_label, dateArgs, expectedLocalDates) => {
    const v5 = {
      exposeCcelDiscovery: true, ccelLiveSearch: false, ccelCoordinator: false,
      contractVersion: '5' as const, liveCcelEnabled: false,
    };
    const calls = recommendedToolCallsForPrompt('primary-source-research', {
      topic: 'eucharist', authors: 'Erasmus of Rotterdam, Martin Luther',
      ...dateArgs,
    }, v5);
    const localQueries = calls[0]!.arguments.queries as Array<Record<string, unknown>>;
    expect(localQueries.every(query => (query.providers as string[])[0] === 'local')).toBe(true);
    expect(localQueries).toHaveLength(2);
    for (const localQuery of localQueries) expect(localQuery).toMatchObject(expectedLocalDates);
    expect(calls.slice(1)).toHaveLength(1);
    const externalQueries = calls[1]!.arguments.queries as Array<Record<string, unknown>>;
    expect(externalQueries).toHaveLength(1);
    expect(externalQueries[0]).toMatchObject({ providers: ['ccel'], author: 'Erasmus of Rotterdam' });
    expect(externalQueries[0]).not.toHaveProperty('startYear');
    expect(externalQueries[0]).not.toHaveProperty('endYear');
    const validateV5 = validatorFor(createPrimarySourceSearchHandler(unused, v5).inputSchema);
    for (const call of calls) expect(validateV5(call.arguments).valid).toBe(true);
  });

  it('retains the optional work restriction in both guided scopes without copying date bounds to CCEL', () => {
    const v5 = {
      exposeCcelDiscovery: true, ccelLiveSearch: false, ccelCoordinator: false,
      contractVersion: '5' as const, liveCcelEnabled: false,
    };
    const calls = recommendedToolCallsForPrompt('primary-source-research', {
      topic: 'sacraments', work: 'Institutes', startYear: '1536', endYear: '1559',
    }, v5);
    expect(calls[0]!.arguments).toMatchObject({ queries: [{ work: 'Institutes', startYear: 1536, endYear: 1559 }] });
    expect(calls[1]!.arguments).toEqual({ queries: [{
      id: 'external-topic', text: 'sacraments', providers: ['ccel'], match: 'all_terms',
      selection: 'relevance', work: 'Institutes', limit: 3,
    }] });
    expect(recommendedToolCallsForPrompt('confession-study', { topic: 'justification' }, v5)[0]!.arguments)
      .toMatchObject({ queries: [{ providers: ['local', 'ccel'] }] });
  });
});
