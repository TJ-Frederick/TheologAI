import { describe, expect, it } from 'vitest';
import { formatValidationError, validatorFor } from '../../../src/mcp/validation.js';
import { createBibleLookupHandler } from '../../../src/tools/v2/bibleLookup.js';
import { createClassicTextsHandler } from '../../../src/tools/v2/classicTexts.js';
import { createCommentaryHandler } from '../../../src/tools/v2/commentary.js';
import { createCrossReferencesHandler } from '../../../src/tools/v2/crossReferences.js';
import { createDonationConfigHandler } from '../../../src/tools/v2/donationConfig.js';
import { createParallelPassagesHandler } from '../../../src/tools/v2/parallelPassages.js';
import { createStrongsLookupHandler } from '../../../src/tools/v2/strongsLookup.js';
import { createVerifyDonationHandler } from '../../../src/tools/v2/verifyDonation.js';
import { createVerseMorphologyHandler } from '../../../src/tools/v2/verseMorphology.js';

const unused = {} as never;

describe('Worker-safe JSON Schema validation', () => {
  it('validates draft 2020-12 dependencies without dynamic code evaluation', () => {
    const originalFunction = globalThis.Function;
    Object.defineProperty(globalThis, 'Function', {
      configurable: true,
      value: function forbiddenDynamicFunction(): never {
        throw new EvalError('Dynamic code evaluation is unavailable');
      },
    });

    try {
      const validate = validatorFor({
        type: 'object',
        properties: {
          workerSafePrimary: { type: 'string' },
          workerSafeSecondary: { type: 'string' },
        },
        required: ['workerSafePrimary'],
        dependentRequired: { workerSafePrimary: ['workerSafeSecondary'] },
        additionalProperties: false,
      });

      expect(validate({
        workerSafePrimary: 'present',
        workerSafeSecondary: 'present',
      })).toEqual({
        valid: true,
        data: {
          workerSafePrimary: 'present',
          workerSafeSecondary: 'present',
        },
        errorMessage: undefined,
      });
      expect(validate({ workerSafePrimary: 'present' })).toMatchObject({
        valid: false,
        errorMessage: expect.stringContaining('does not have "workerSafeSecondary"'),
      });
    } finally {
      Object.defineProperty(globalThis, 'Function', {
        configurable: true,
        value: originalFunction,
        writable: true,
      });
    }
  });

  it.each([
    [undefined, 'arguments do not match the advertised schema'],
    ['#: Instance does not have required property "reference".', 'missing required argument "reference"'],
    ['#: Property "extra" does not match additional properties schema.; #/extra: False boolean schema.', 'unknown argument "extra"'],
    ['#: Property "reference" does not match schema.; #/reference: String is too long (101 > 100).', 'argument "reference" must NOT have more than 100 characters'],
    ['#: Property "reference" does not match schema.; #/reference: Instance type "number" is invalid. Expected "string".', 'argument "reference" must be string'],
    ['#: Instance has "primary" but does not have "secondary".', 'must have property secondary'],
    ['#: Instance does not match exactly one subschema (0 matches).; #: Instance does not have required property "otherMode".', 'arguments do not match exactly one advertised schema option'],
    ['#: Instance does not have at least 1 properties.', 'provide at least one argument'],
  ])('normalizes validator errors into actionable tool feedback', (message, expected) => {
    expect(formatValidationError(message)).toBe(expected);
  });

  it.each([
    ['bible lookup', createBibleLookupHandler(unused), { reference: 'John 3:16', translation: ['ESV', 'KJV'] }, { reference: 'John 3:16', translation: ['ESV', 'ESV'] }],
    ['cross references', createCrossReferencesHandler(unused), { reference: 'John 3:16', maxResults: 5 }, { reference: 'John 3:16', maxResults: 1.5 }],
    ['parallel passages', createParallelPassagesHandler(unused), { reference: 'Matthew 1:1', mode: 'synoptic' }, { reference: 'Matthew 1:1', mode: 'invalid' }],
    ['commentary', createCommentaryHandler(unused), { reference: 'John 3:16', commentator: 'John Gill' }, { reference: 'John 3:16', commentator: 'Unknown' }],
    ['classic texts', createClassicTextsHandler(unused, unused), { listWorks: true }, { listWorks: false }],
    ['original language', createStrongsLookupHandler(unused), { query: 'love', limit: 10 }, { query: 'love', limit: 21 }],
    ['morphology', createVerseMorphologyHandler(unused), { reference: 'John 3:16', expand_morphology: true }, { reference: 'John 3:16', expand_morphology: 'yes' }],
    ['donation config', createDonationConfigHandler(unused), {}, { extra: true }],
    ['donation verification', createVerifyDonationHandler(unused), { tx_hash: `0x${'a'.repeat(64)}` }, { tx_hash: 'invalid' }],
  ])('preserves the advertised %s schema contract', (_name, tool, accepted, rejected) => {
    const validate = validatorFor(tool.inputSchema);
    expect(validate(accepted).valid).toBe(true);
    expect(validate(rejected).valid).toBe(false);
  });

  it.each([
    ['classic-text conflicting modes', createClassicTextsHandler(unused, unused), { work: 'nicene-creed', query: 'trinity' }, 'query is the local-search mode'],
    ['classic-text false mode selector', createClassicTextsHandler(unused, unused), { listWorks: false }, 'listWorks must be true'],
    ['original-language conflicting modes', createStrongsLookupHandler(unused), { strongs_number: 'G26', limit: 5 }, 'limit is only valid with query search'],
  ])('keeps strict handler validation actionable for %s', async (_name, tool, arguments_, expected) => {
    const result = await tool.handler(arguments_);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(expected);
  });

  it.each([
    ['classic-text empty input', createClassicTextsHandler(unused, unused)],
    ['original-language empty input', createStrongsLookupHandler(unused)],
  ])('advertised flat schema rejects %s', (_name, tool) => {
    expect(validatorFor(tool.inputSchema)({}).valid).toBe(false);
  });
});
