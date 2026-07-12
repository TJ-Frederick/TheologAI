import { describe, expect, it, vi } from 'vitest';

import { createBibleLookupHandler } from '../../../../src/tools/v2/bibleLookup.js';
import { createClassicTextsHandler } from '../../../../src/tools/v2/classicTexts.js';
import { createCommentaryHandler } from '../../../../src/tools/v2/commentary.js';
import { createCrossReferencesHandler } from '../../../../src/tools/v2/crossReferences.js';
import { createDonationConfigHandler } from '../../../../src/tools/v2/donationConfig.js';
import { createParallelPassagesHandler } from '../../../../src/tools/v2/parallelPassages.js';
import { createStrongsLookupHandler } from '../../../../src/tools/v2/strongsLookup.js';
import { createVerifyDonationHandler } from '../../../../src/tools/v2/verifyDonation.js';
import { createVerseMorphologyHandler } from '../../../../src/tools/v2/verseMorphology.js';
import { ValidationError } from '../../../../src/kernel/errors.js';
import { CommentaryService as CommentaryServiceClass } from '../../../../src/services/commentary/CommentaryService.js';
import type { BibleService } from '../../../../src/services/bible/BibleService.js';
import type { CrossReferenceService } from '../../../../src/services/bible/CrossReferenceService.js';
import type { ParallelPassageService } from '../../../../src/services/bible/ParallelPassageService.js';
import type { CommentaryService } from '../../../../src/services/commentary/CommentaryService.js';
import type { CcelService } from '../../../../src/services/commentary/CcelService.js';
import type { DonationService } from '../../../../src/services/donation/DonationService.js';
import type { HistoricalDocumentService } from '../../../../src/services/historical/HistoricalDocumentService.js';
import type { MorphologyService } from '../../../../src/services/languages/MorphologyService.js';
import type { StrongsService } from '../../../../src/services/languages/StrongsService.js';
import type { ToolHandler, ToolResult } from '../../../../src/kernel/types.js';
import type { DocumentInfo, DocumentSection } from '../../../../src/kernel/repositories.js';

function serviceDouble<T>(methods: Partial<{ [K in keyof T]: T[K] }>): T {
  return methods as unknown as T;
}

function textOf(result: ToolResult): string {
  return result.content[0]?.text ?? '';
}

const citation = { source: 'Test source', copyright: 'Test license' };

describe('v2 tool handler schemas', () => {
  it('keeps every schema closed and every handler read-only and idempotent', () => {
    const handlers: ToolHandler[] = [
      createBibleLookupHandler(serviceDouble<BibleService>({})),
      createCrossReferencesHandler(serviceDouble<CrossReferenceService>({})),
      createParallelPassagesHandler(serviceDouble<ParallelPassageService>({})),
      createCommentaryHandler(serviceDouble<CommentaryService>({})),
      createClassicTextsHandler(
        serviceDouble<HistoricalDocumentService>({}),
        serviceDouble<CcelService>({}),
      ),
      createStrongsLookupHandler(serviceDouble<StrongsService>({})),
      createVerseMorphologyHandler(serviceDouble<MorphologyService>({})),
      createDonationConfigHandler(serviceDouble<DonationService>({})),
      createVerifyDonationHandler(serviceDouble<DonationService>({})),
    ];

    expect(handlers.map(handler => handler.name)).toHaveLength(9);
    for (const handler of handlers) {
      expect(handler.inputSchema.additionalProperties).toBe(false);
      expect(handler.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      });
    }
  });

  it('bounds high-cardinality string, array, and integer inputs', () => {
    const bible = createBibleLookupHandler(serviceDouble<BibleService>({})).inputSchema;
    const parallels = createParallelPassagesHandler(
      serviceDouble<ParallelPassageService>({}),
    ).inputSchema;
    const commentaryHandler = createCommentaryHandler(
      serviceDouble<CommentaryService>({}),
    );
    const commentary = commentaryHandler.inputSchema;
    const classicTexts = createClassicTextsHandler(
      serviceDouble<HistoricalDocumentService>({}),
      serviceDouble<CcelService>({}),
    ).inputSchema;
    const originalLanguage = createStrongsLookupHandler(serviceDouble<StrongsService>({})).inputSchema;

    expect(bible.properties?.reference).toMatchObject({ minLength: 1, maxLength: 100 });
    expect(bible.properties?.translation).toMatchObject({
      oneOf: expect.arrayContaining([
        expect.objectContaining({ minItems: 1, maxItems: 8, uniqueItems: true }),
      ]),
    });
    expect(parallels.properties?.maxParallels).toMatchObject({ minimum: 1, maximum: 50 });
    expect(commentary.properties?.maxLength).toMatchObject({ minimum: 1, maximum: 100000 });
    expect(classicTexts).not.toHaveProperty('oneOf');
    expect(classicTexts.properties).toMatchObject({
      work: { minLength: 1, maxLength: 256 },
      query: { minLength: 1, maxLength: 500 },
      listWorks: { const: true },
      browseSections: { const: true },
    });
    expect(originalLanguage).not.toHaveProperty('oneOf');
    expect(originalLanguage.properties).toMatchObject({
      strongs_number: { minLength: 2, maxLength: 16 },
      query: { minLength: 2, maxLength: 100 },
      limit: { minimum: 1, maximum: 20 },
    });
    expect(commentaryHandler.description).toContain('Verse ranges are not supported');
    expect(commentaryHandler.description).toContain('John Gill scalar lookups require exact provider verseNumber metadata');
    expect(commentary.properties?.reference).toMatchObject({
      description: expect.stringContaining('verse ranges are not supported'),
    });
  });
});

describe('bible_lookup handler', () => {
  it('uses the ESV default and forwards the footnote option for one translation', async () => {
    const lookup = vi.fn<BibleService['lookup']>().mockResolvedValue({
      reference: 'John 3:16',
      translation: 'ESV',
      text: 'For God so loved the world.',
      citation,
    });
    const lookupMultiple = vi.fn<BibleService['lookupMultiple']>();
    const handler = createBibleLookupHandler(serviceDouble({ lookup, lookupMultiple }));

    const result = await handler.handler({ reference: 'John 3:16', includeFootnotes: true });

    expect(lookup).toHaveBeenCalledWith({
      reference: 'John 3:16',
      translation: 'ESV',
      includeFootnotes: true,
    });
    expect(lookupMultiple).not.toHaveBeenCalled();
    expect(textOf(result)).toContain('John 3:16 (ESV)');
    expect(textOf(result)).toContain('For God so loved the world.');
    expect(result.structuredContent).toMatchObject({
      kind: 'bible_lookup',
      requestedTranslations: ['ESV'],
      passages: [{ translation: 'ESV', text: 'For God so loved the world.' }],
      failures: [],
    });
  });

  it('dispatches an array to multi-translation lookup', async () => {
    const lookup = vi.fn<BibleService['lookup']>();
    const lookupMultiple = vi.fn<BibleService['lookupMultiple']>().mockResolvedValue({
      reference: 'John 3:16',
      results: [
        { reference: 'John 3:16', translation: 'ESV', text: 'ESV text', citation },
        { reference: 'John 3:16', translation: 'KJV', text: 'KJV text', citation },
      ],
      failures: [],
    });
    const handler = createBibleLookupHandler(serviceDouble({ lookup, lookupMultiple }));

    const result = await handler.handler({
      reference: 'John 3:16',
      translation: ['ESV', 'KJV'],
    });

    expect(lookupMultiple).toHaveBeenCalledWith('John 3:16', ['ESV', 'KJV']);
    expect(lookup).not.toHaveBeenCalled();
    expect(textOf(result)).toContain('(2 translations)');
    expect(textOf(result)).toContain('**KJV:**');
  });

  it('accepts legacy JSON-encoded translation arrays and preserves partial results', async () => {
    const lookupMultiple = vi.fn<BibleService['lookupMultiple']>().mockResolvedValue({
      reference: 'Psalms 23:1',
      results: [{ reference: 'Psalms 23:1', translation: 'WEB', text: 'Yahweh is my shepherd.', citation }],
      failures: [{ translation: 'DBY', reason: 'Translation could not be retrieved.' }],
    });
    const handler = createBibleLookupHandler(serviceDouble<BibleService>({
      lookup: vi.fn<BibleService['lookup']>(),
      lookupMultiple,
    }));

    const result = await handler.handler({
      reference: 'Psalm 23:1',
      translation: '["WEB","DBY"]',
    });

    expect(lookupMultiple).toHaveBeenCalledWith('Psalm 23:1', ['WEB', 'DBY']);
    expect(textOf(result)).toContain('(2 translations requested; 1 available)');
    expect(textOf(result)).toContain('**WEB:**');
    expect(textOf(result)).toContain('**DBY:** unavailable');
    expect(result.structuredContent).toMatchObject({
      passages: [{ translation: 'WEB', text: 'Yahweh is my shepherd.' }],
      failures: [{ translation: 'DBY', reason: 'Translation could not be retrieved.' }],
    });
  });

  it('returns a valid empty-provenance structure when every requested translation fails', async () => {
    const lookupMultiple = vi.fn<BibleService['lookupMultiple']>().mockResolvedValue({
      reference: 'John 3:16',
      results: [],
      failures: [
        { translation: 'ESV', reason: 'Translation could not be retrieved.' },
        { translation: 'KJV', reason: 'Translation could not be retrieved.' },
      ],
    });
    const handler = createBibleLookupHandler(serviceDouble<BibleService>({
      lookup: vi.fn<BibleService['lookup']>(),
      lookupMultiple,
    }));

    const result = await handler.handler({
      reference: 'John 3:16',
      translation: ['ESV', 'KJV'],
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ passages: [], failures: expect.any(Array), provenance: [] });
  });

  it('treats a malformed legacy array string as a single translation value', async () => {
    const lookup = vi.fn<BibleService['lookup']>().mockResolvedValue({
      reference: 'John 3:16',
      translation: '[ESV',
      text: 'Fallback text',
      citation,
    });
    const handler = createBibleLookupHandler(serviceDouble<BibleService>({
      lookup,
      lookupMultiple: vi.fn<BibleService['lookupMultiple']>(),
    }));

    await handler.handler({ reference: 'John 3:16', translation: '[ESV' });

    expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ translation: '[ESV' }));
  });

  it('returns a tool error when lookup fails', async () => {
    const lookup = vi.fn<BibleService['lookup']>().mockRejectedValue(
      new ValidationError('reference', 'A verse reference is required'),
    );
    const handler = createBibleLookupHandler(serviceDouble<BibleService>({
      lookup,
      lookupMultiple: vi.fn<BibleService['lookupMultiple']>(),
    }));

    const result = await handler.handler({ reference: '' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid input: A verse reference is required');
    expect(result.structuredContent).toBeUndefined();
  });
});

describe('bible_cross_references handler', () => {
  it('forwards filtering options and formats pagination', async () => {
    const getCrossReferences = vi.fn<CrossReferenceService['getCrossReferences']>().mockResolvedValue({
      references: [{ reference: 'Romans 5:8', votes: 42 }],
      total: 3,
      showing: 1,
      hasMore: true,
    });
    const handler = createCrossReferencesHandler(serviceDouble({ getCrossReferences }));

    const result = await handler.handler({
      reference: 'John 3:16',
      maxResults: 1,
      minVotes: 10,
    });

    expect(getCrossReferences).toHaveBeenCalledWith('John 3:16', {
      maxResults: 1,
      minVotes: 10,
    });
    expect(textOf(result)).toContain('Romans 5:8');
    expect(textOf(result)).toContain('Showing 1 of 3');
  });

  it('returns service failures as MCP tool errors', async () => {
    const getCrossReferences = vi.fn<CrossReferenceService['getCrossReferences']>()
      .mockRejectedValue(new Error('database unavailable'));
    const handler = createCrossReferencesHandler(serviceDouble({ getCrossReferences }));

    const result = await handler.handler({ reference: 'John 3:16' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('I encountered an error');
  });
});

describe('parallel_passages handler', () => {
  it('forwards all lookup controls and formats text-bearing parallels', async () => {
    const lookup = vi.fn<ParallelPassageService['lookup']>().mockResolvedValue({
      primary: { reference: 'Matthew 26:26-28' },
      parallels: [{
        reference: 'Mark 14:22-24',
        relationship: 'synoptic',
        confidence: 0.95,
        text: 'And as they were eating...',
      }],
      citation,
    });
    const handler = createParallelPassagesHandler(serviceDouble({ lookup }));

    const result = await handler.handler({
      reference: 'Matthew 26:26-28',
      mode: 'synoptic',
      includeText: true,
      translation: 'KJV',
      maxParallels: 4,
      useCrossReferences: false,
    });

    expect(lookup).toHaveBeenCalledWith({
      reference: 'Matthew 26:26-28',
      mode: 'synoptic',
      includeText: true,
      translation: 'KJV',
      maxParallels: 4,
      useCrossReferences: false,
    });
    expect(textOf(result)).toContain('[synoptic] (95% confidence)');
    expect(textOf(result)).toContain('And as they were eating');
  });

  it('returns service failures as tool errors', async () => {
    const lookup = vi.fn<ParallelPassageService['lookup']>()
      .mockRejectedValue(new ValidationError('reference', 'Invalid reference'));
    const handler = createParallelPassagesHandler(serviceDouble({ lookup }));

    const result = await handler.handler({ reference: 'invalid' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid input: Invalid reference');
  });
});

describe('commentary_lookup handler', () => {
  it('forwards optional commentator and maximum length', async () => {
    const lookup = vi.fn<CommentaryService['lookup']>().mockResolvedValue({
      reference: 'John 1:1',
      commentator: 'John Gill',
      text: 'Commentary body',
      citation,
    });
    const handler = createCommentaryHandler(serviceDouble({ lookup }));

    const result = await handler.handler({
      reference: 'John 1:1',
      commentator: 'John Gill',
      maxLength: 500,
    });

    expect(lookup).toHaveBeenCalledWith({
      reference: 'John 1:1',
      commentator: 'John Gill',
      maxLength: 500,
    });
    expect(textOf(result)).toContain('John Gill Commentary on John 1:1');
    expect(textOf(result)).toContain('Commentary body');
  });

  it('returns service failures as tool errors', async () => {
    const lookup = vi.fn<CommentaryService['lookup']>().mockRejectedValue(new Error('failure'));
    const handler = createCommentaryHandler(serviceDouble({ lookup }));

    const result = await handler.handler({ reference: 'John 1:1' });

    expect(result.isError).toBe(true);
  });

  it('rejects verse ranges before calling the commentary provider', async () => {
    const getCommentary = vi.fn();
    const service = new CommentaryServiceClass([{
      supportedCommentators: ['John Gill'],
      getCommentary,
      supportsBook: vi.fn().mockReturnValue(true),
    }]);
    const handler = createCommentaryHandler(service);

    const result = await handler.handler({ reference: 'John 3:16-17', commentator: 'John Gill' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Invalid input: Commentary verse ranges are not supported; request one verse or a full chapter.',
    );
    expect(getCommentary).not.toHaveBeenCalled();
  });

});

describe('classic_text_lookup handler', () => {
  const document: DocumentInfo = {
    id: 'nicene-creed',
    title: 'Nicene Creed',
    type: 'creed',
    date: '381',
    topics: ['trinity'],
  };
  const section: DocumentSection = {
    id: 1,
    document_id: document.id,
    section_number: '1',
    title: 'The Creed',
    content: 'We believe in one God.',
    topics: ['trinity'],
  };

  function createServices() {
    const historical = {
      listDocuments: vi.fn<HistoricalDocumentService['listDocuments']>().mockResolvedValue([document]),
      getDocument: vi.fn<HistoricalDocumentService['getDocument']>().mockResolvedValue(document),
      getSections: vi.fn<HistoricalDocumentService['getSections']>().mockResolvedValue([section]),
      findDocument: vi.fn<HistoricalDocumentService['findDocument']>().mockResolvedValue(undefined),
      search: vi.fn<HistoricalDocumentService['search']>().mockResolvedValue([]),
    };
    const ccel = {
      getWorkSection: vi.fn<CcelService['getWorkSection']>().mockResolvedValue({
        work: 'calvin/institutes',
        section: 'institutes',
        title: 'Calvin — Institutes',
        content: 'Nearly all wisdom consists in two parts.',
        source: 'CCEL',
        url: 'https://example.test/calvin',
      }),
    };
    return {
      historical,
      ccel,
      handler: createClassicTextsHandler(serviceDouble(historical), serviceDouble(ccel)),
    };
  }

  it('lists local works', async () => {
    const { handler, historical } = createServices();

    const result = await handler.handler({ listWorks: true });

    expect(historical.listDocuments).toHaveBeenCalledOnce();
    expect(textOf(result)).toContain('Available Historical Documents');
    expect(textOf(result)).toContain('`nicene-creed`');
  });

  it('browses sections using the canonical document ID', async () => {
    const { handler, historical } = createServices();

    const result = await handler.handler({ work: 'Nicene Creed', browseSections: true });

    expect(historical.getDocument).toHaveBeenCalledWith('Nicene Creed');
    expect(historical.getSections).toHaveBeenCalledWith('nicene-creed');
    expect(textOf(result)).toContain('We believe in one God.');
  });

  it('returns a matching local work without consulting CCEL', async () => {
    const { handler, historical, ccel } = createServices();
    historical.findDocument.mockResolvedValue(document);

    const result = await handler.handler({ work: 'nicene-creed' });

    expect(historical.getSections).toHaveBeenCalledWith('nicene-creed');
    expect(ccel.getWorkSection).not.toHaveBeenCalled();
    expect(textOf(result)).toContain('Nicene Creed');
  });

  it('falls back to CCEL when a work is not local', async () => {
    const { handler, ccel } = createServices();

    const result = await handler.handler({ work: 'calvin/institutes' });

    expect(ccel.getWorkSection).toHaveBeenCalledWith({ work: 'calvin/institutes' });
    expect(textOf(result)).toContain('Calvin — Institutes');
    expect(textOf(result)).toContain('Source: [CCEL]');
    expect(textOf(result)).toContain('(https://example.test/calvin)');
  });

  it('preserves bounded CCEL retrieval with an explicit section identifier', async () => {
    const { handler, historical, ccel } = createServices();
    historical.findDocument.mockResolvedValue(document);

    await handler.handler({ work: 'augustine/confessions', section: 'book-one' });

    expect(historical.findDocument).not.toHaveBeenCalled();
    expect(ccel.getWorkSection).toHaveBeenCalledWith({
      work: 'augustine/confessions',
      section: 'book-one',
    });
  });

  it('returns local search results without consulting CCEL', async () => {
    const { handler, historical, ccel } = createServices();
    historical.search.mockResolvedValue([section]);

    const result = await handler.handler({ query: 'wisdom' });

    expect(historical.search).toHaveBeenCalledWith('wisdom');
    expect(ccel.getWorkSection).not.toHaveBeenCalled();
    expect(textOf(result)).toContain('Search Results for "wisdom"');
  });

  it('rejects a scoped CCEL query instead of silently ignoring it', async () => {
    const { handler, ccel } = createServices();

    const result = await handler.handler({ work: 'calvin/institutes', query: 'wisdom' });

    expect(ccel.getWorkSection).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('query is the local-search mode');
  });

  it('keeps mode validation strict after flattening the advertised schema', async () => {
    const { handler, historical, ccel } = createServices();

    const result = await handler.handler({ work: 'calvin/institutes', query: 'wisdom' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('query is the local-search mode');
    expect(historical.search).not.toHaveBeenCalled();
    expect(ccel.getWorkSection).not.toHaveBeenCalled();
  });

  it('distinguishes an empty global search from a missing action', async () => {
    const { handler } = createServices();

    const noResults = await handler.handler({ query: 'not-present' });
    const noAction = await handler.handler({});

    expect(textOf(noResults)).toBe('No results found for "not-present".');
    expect(noAction.isError).toBe(true);
    expect(textOf(noAction)).toContain('classic-text lookup mode');
  });

  it('returns service failures as tool errors', async () => {
    const { handler, historical } = createServices();
    historical.listDocuments.mockRejectedValue(new Error('database unavailable'));

    const result = await handler.handler({ listWorks: true });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('I encountered an error');
  });
});

describe('original_language_lookup handler', () => {
  it('forwards extended lookup and formats detailed data', async () => {
    const lookup = vi.fn<StrongsService['lookup']>().mockResolvedValue({
      strongs_number: 'G25',
      testament: 'NT',
      lemma: 'ἀγαπάω',
      transliteration: 'agapaō',
      definition: 'to love',
      derivation: 'perhaps from agan',
      extended: { occurrences: 143 },
      citation,
    });
    const handler = createStrongsLookupHandler(serviceDouble({ lookup }));

    const result = await handler.handler({
      strongs_number: 'G25',
      detail_level: 'detailed',
      include_extended: true,
    });

    expect(lookup).toHaveBeenCalledWith('G25', true);
    expect(textOf(result)).toContain('**Derivation:** perhaps from agan');
    expect(textOf(result)).toContain('Occurrences: 143');
    expect(result.structuredContent).toMatchObject({
      kind: 'original_language_lookup',
      mode: 'entry',
      detailLevel: 'detailed',
      entries: [{ strongsNumber: 'G25', derivation: 'perhaps from agan', extended: { occurrences: 143 } }],
    });
  });

  it('performs a bounded search without requesting an exact lookup', async () => {
    const search = vi.fn<StrongsService['search']>().mockResolvedValue([{
      strongs_number: 'G26',
      testament: 'NT',
      lemma: 'ἀγάπη',
      transliteration: 'agapē',
      pronunciation: null,
      definition: 'love',
      derivation: null,
    }]);
    const lookup = vi.fn<StrongsService['lookup']>();
    const handler = createStrongsLookupHandler(serviceDouble({ search, lookup }));

    const result = await handler.handler({ query: 'love', limit: 5 });

    expect(search).toHaveBeenCalledWith('love', 5);
    expect(lookup).not.toHaveBeenCalled();
    expect(textOf(result)).toContain("Strong's search results");
    expect(textOf(result)).toContain('**G26**');
    expect(result.structuredContent).toMatchObject({
      mode: 'search',
      query: 'love',
      detailLevel: 'summary',
      entries: [{ strongsNumber: 'G26', language: 'Greek' }],
    });
  });

  it('advertises both exact and search fields without a client-hostile branch schema', () => {
    const handler = createStrongsLookupHandler(serviceDouble<StrongsService>({}));
    expect(handler.inputSchema).toMatchObject({
      additionalProperties: false,
      minProperties: 1,
      properties: {
        query: { minLength: 2, maxLength: 100 },
        limit: { minimum: 1, maximum: 20 },
      },
    });
    expect(handler.inputSchema).not.toHaveProperty('oneOf');
    expect(handler.inputSchema.properties?.detail_level).not.toHaveProperty('default');
    expect(handler.inputSchema.properties?.include_extended).not.toHaveProperty('default');
    expect(handler.inputSchema.properties?.limit).not.toHaveProperty('default');
  });

  it('accepts valid calls after mode-appropriate client default materialization', async () => {
    const search = vi.fn<StrongsService['search']>().mockResolvedValue([]);
    const lookup = vi.fn<StrongsService['lookup']>().mockResolvedValue({
      strongs_number: 'G26',
      testament: 'NT',
      lemma: 'ἀγάπη',
      definition: 'love',
      citation,
    });
    const handler = createStrongsLookupHandler(serviceDouble({ search, lookup }));

    const queryResult = await handler.handler({ query: 'love', limit: 10 });
    const exactResult = await handler.handler({
      strongs_number: 'G26',
      detail_level: 'simple',
      include_extended: false,
    });
    const queryDefaultResult = await handler.handler({ query: 'love' });
    const exactDefaultResult = await handler.handler({ strongs_number: 'G26' });

    expect(queryResult.isError).not.toBe(true);
    expect(queryDefaultResult.isError).not.toBe(true);
    expect(search).toHaveBeenNthCalledWith(1, 'love', 10);
    expect(search).toHaveBeenNthCalledWith(2, 'love', 10);
    expect(exactResult.isError).not.toBe(true);
    expect(exactDefaultResult.isError).not.toBe(true);
    expect(lookup).toHaveBeenNthCalledWith(1, 'G26', false);
    expect(lookup).toHaveBeenNthCalledWith(2, 'G26', false);
  });

  it('keeps exact/search mode validation strict in the handler', async () => {
    const search = vi.fn<StrongsService['search']>();
    const lookup = vi.fn<StrongsService['lookup']>();
    const handler = createStrongsLookupHandler(serviceDouble({ search, lookup }));

    const result = await handler.handler({ strongs_number: 'G26', limit: 5 });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('limit is only valid with query search');
    expect(search).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('returns service validation failures as tool errors', async () => {
    const lookup = vi.fn<StrongsService['lookup']>().mockRejectedValue(
      new ValidationError('strongs_number', 'Expected G#### or H####'),
    );
    const handler = createStrongsLookupHandler(serviceDouble({ lookup }));

    const result = await handler.handler({ strongs_number: 'G26' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid input: Expected G#### or H####');
  });
});

describe('bible_verse_morphology handler', () => {
  it('forwards expansion and formats expanded morphology', async () => {
    const getVerseMorphology = vi.fn<MorphologyService['getVerseMorphology']>().mockResolvedValue({
      reference: 'John 1:1',
      testament: 'NT',
      book: 'John',
      chapter: 1,
      verse: 1,
      words: [{
        position: 1,
        text: 'Ἐν',
        lemma: 'ἐν',
        strong: 'G1722',
        morph: 'PREP',
        morphExpanded: 'preposition',
        gloss: 'in',
      }],
      citation,
    });
    const handler = createVerseMorphologyHandler(serviceDouble({ getVerseMorphology }));

    const result = await handler.handler({ reference: 'John 1:1', expand_morphology: true });

    expect(getVerseMorphology).toHaveBeenCalledWith('John 1:1', true);
    expect(textOf(result)).toContain('Word-by-Word Greek Analysis');
    expect(textOf(result)).toContain('| preposition |');
  });

  it('returns service failures as tool errors', async () => {
    const getVerseMorphology = vi.fn<MorphologyService['getVerseMorphology']>()
      .mockRejectedValue(new Error('missing'));
    const handler = createVerseMorphologyHandler(serviceDouble({ getVerseMorphology }));

    const result = await handler.handler({ reference: 'John 1' });

    expect(result.isError).toBe(true);
  });

  it('returns an explicit validation error for unsupported morphology ranges', async () => {
    const getVerseMorphology = vi.fn<MorphologyService['getVerseMorphology']>()
      .mockRejectedValue(new ValidationError(
        'reference',
        'Morphology accepts one verse at a time; ranges are not supported',
      ));
    const handler = createVerseMorphologyHandler(serviceDouble({ getVerseMorphology }));

    const result = await handler.handler({ reference: 'John 1:1-2' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid input: Morphology accepts one verse at a time');
  });
});

describe('donation handlers', () => {
  it('formats donation configuration without accepting input fields', async () => {
    const getConfig = vi.fn<DonationService['getConfig']>().mockReturnValue({
      recipientAddress: '0xrecipient',
      tokens: [{
        symbol: 'ETH',
        name: 'Ether',
        chainId: 1,
        chainName: 'Ethereum',
        network: 'eip155:1',
        asset: 'native',
        decimals: 18,
        isNative: true,
      }],
    });
    const handler = createDonationConfigHandler(serviceDouble({ getConfig }));

    const result = await handler.handler({});

    expect(getConfig).toHaveBeenCalledOnce();
    expect(textOf(result)).toContain('`0xrecipient`');
    expect(textOf(result)).toContain('| ETH | Ethereum | native | 18 |');
  });

  it('returns configuration failures as tool errors', async () => {
    const getConfig = vi.fn<DonationService['getConfig']>().mockImplementation(() => {
      throw new Error('misconfigured');
    });
    const handler = createDonationConfigHandler(serviceDouble({ getConfig }));

    const result = await handler.handler({});

    expect(result.isError).toBe(true);
  });

  it('forwards a transaction hash and formats a confirmed donation', async () => {
    const verifyDonation = vi.fn<DonationService['verifyDonation']>().mockResolvedValue({
      txHash: `0x${'a'.repeat(64)}`,
      status: 'verified',
      minedSuccessfully: true,
      transfers: [{
        chainId: 8453,
        chainName: 'Base',
        from: '0xsender',
        to: '0xrecipient',
        amount: '2.5',
        symbol: 'USDC',
        tokenAddress: '0xtoken',
      }],
      explorerUrl: 'https://basescan.org/tx/example',
    });
    const handler = createVerifyDonationHandler(serviceDouble({ verifyDonation }));
    const txHash = `0x${'a'.repeat(64)}`;

    const result = await handler.handler({ tx_hash: txHash });

    expect(verifyDonation).toHaveBeenCalledWith(txHash);
    expect(textOf(result)).toContain('Donation Verified');
    expect(textOf(result)).toContain('2.5 USDC');
    expect(textOf(result)).toContain('View on Explorer');
  });

  it('returns verification failures as tool errors', async () => {
    const verifyDonation = vi.fn<DonationService['verifyDonation']>()
      .mockRejectedValue(new Error('RPC unavailable'));
    const handler = createVerifyDonationHandler(serviceDouble({ verifyDonation }));

    const result = await handler.handler({ tx_hash: `0x${'b'.repeat(64)}` });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('I encountered an error');
  });
});
