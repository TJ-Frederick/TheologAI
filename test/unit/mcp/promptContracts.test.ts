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

const unused = {} as never;
const tools: ToolHandler[] = [
  createBibleLookupHandler(unused),
  createCrossReferencesHandler(unused),
  createParallelPassagesHandler(unused),
  createCommentaryHandler(unused),
  createClassicTextsHandler(unused, unused),
  createStrongsLookupHandler(unused),
  createVerseMorphologyHandler(unused),
  createDonationConfigHandler(unused),
];

const toolByName = new Map(tools.map(tool => [tool.name, tool]));

describe('prompt-recommended tool-call contracts', () => {
  it.each([
    ['word-study', { word: 'G26' }],
    ['word-study', { word: 'love', testament: 'NT' }],
    ['passage-exegesis', { reference: 'John 3:16', translation: 'NET' }],
    ['passage-exegesis', { reference: 'John 3:16', translation: 'unsupported' }],
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
      expect(validate(call.arguments), JSON.stringify(validate.errors)).toBe(true);
    }
  });
});
