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

  it('never recommends a chapter to verse-only morphology or cross-reference tools', () => {
    const calls = recommendedToolCallsForPrompt('passage-exegesis', { reference: 'John 3' });
    expect(calls.some(call => call.tool === 'bible_verse_morphology')).toBe(false);
    expect(calls.some(call => call.tool === 'bible_cross_references')).toBe(false);
  });

  it('keeps UBS groups and OpenBible discovery in separate passage-exegesis calls', () => {
    const calls = recommendedToolCallsForPrompt('passage-exegesis', { reference: 'John 3:16' });
    expect(calls).toContainEqual({
      tool: 'parallel_passages',
      arguments: { reference: 'John 3:16', corpora: ['ubs_source_attested'], maxGroups: 5 },
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
});
