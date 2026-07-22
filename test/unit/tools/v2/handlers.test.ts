import { describe, expect, it, vi } from 'vitest';

import { createBibleLookupHandler } from '../../../../src/tools/v2/bibleLookup.js';
import { createClassicTextsHandler } from '../../../../src/tools/v2/classicTexts.js';
import { createCommentaryHandler } from '../../../../src/tools/v2/commentary.js';
import { createCrossReferencesHandler } from '../../../../src/tools/v2/crossReferences.js';
import { createDonationConfigHandler } from '../../../../src/tools/v2/donationConfig.js';
import { createParallelPassagesHandler } from '../../../../src/tools/v2/parallelPassages.js';
import { createPrimarySourceSearchHandler } from '../../../../src/tools/v2/primarySourceSearch.js';
import { createStrongsLookupHandler } from '../../../../src/tools/v2/strongsLookup.js';
import { createVerifyDonationHandler } from '../../../../src/tools/v2/verifyDonation.js';
import { createVerseMorphologyHandler } from '../../../../src/tools/v2/verseMorphology.js';
import { createOriginalLanguageStudyHandler } from '../../../../src/tools/v2/originalLanguageStudy.js';
import { CommentaryScalarNotFoundError, ValidationError } from '../../../../src/kernel/errors.js';
import { CommentaryService as CommentaryServiceClass } from '../../../../src/services/commentary/CommentaryService.js';
import {
  DonationService as DonationServiceClass,
  type DonationService,
} from '../../../../src/services/donation/DonationService.js';
import type { BibleService } from '../../../../src/services/bible/BibleService.js';
import type { CrossReferenceService } from '../../../../src/services/bible/CrossReferenceService.js';
import type { ParallelPassageService } from '../../../../src/services/bible/ParallelPassageService.js';
import type { CommentaryService } from '../../../../src/services/commentary/CommentaryService.js';
import { RECIPIENT_ADDRESS, type ChainTransactionEvidence } from '../../../../src/kernel/donation-types.js';
import type { HistoricalDocumentService } from '../../../../src/services/historical/HistoricalDocumentService.js';
import type { PrimarySourceSearchService } from '../../../../src/services/historical/PrimarySourceSearchService.js';
import type { MorphologyService } from '../../../../src/services/languages/MorphologyService.js';
import type { StrongsService } from '../../../../src/services/languages/StrongsService.js';
import type { OriginalLanguageStudyService } from '../../../../src/services/languages/OriginalLanguageStudyService.js';
import { StrongsService as StrongsServiceClass } from '../../../../src/services/languages/StrongsService.js';
import { readFileSync } from 'node:fs';
import type { ToolHandler, ToolResult } from '../../../../src/kernel/types.js';
import type { DocumentInfo, DocumentSection, HistoricalDocumentDeliveryProfile, HistoricalSectionSummary, ResolvedHistoricalSection } from '../../../../src/kernel/repositories.js';
import { formatMorphologyResult } from '../../../../src/formatters/languagesFormatter.js';
import { validatorFor } from '../../../../src/mcp/validation.js';
import { validateClassicTextsOutputSemantics } from '../../../../src/presenters/classicTextsStructured.js';
import { encodeHistoricalSectionedOnlyCursor } from '../../../../src/kernel/historicalSectionedDelivery.js';
import { Buffer } from 'node:buffer';

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
      createClassicTextsHandler(serviceDouble<HistoricalDocumentService>({})),
      createPrimarySourceSearchHandler(serviceDouble<PrimarySourceSearchService>({})),
      createStrongsLookupHandler(serviceDouble<StrongsService>({})),
      createVerseMorphologyHandler(serviceDouble<MorphologyService>({})),
      createOriginalLanguageStudyHandler(serviceDouble<OriginalLanguageStudyService>({})),
      createDonationConfigHandler(serviceDouble<DonationService>({})),
      createVerifyDonationHandler(serviceDouble<DonationService>({})),
    ];

    expect(handlers.map(handler => handler.name)).toHaveLength(11);
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
    const classicTextsHandler = createClassicTextsHandler(
      serviceDouble<HistoricalDocumentService>({}),
    );
    const classicTexts = classicTextsHandler.inputSchema;
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
    expect(classicTextsHandler.annotations).toMatchObject({ openWorldHint: false });
    expect(originalLanguage).not.toHaveProperty('oneOf');
    expect(originalLanguage.properties).toMatchObject({
      strongs_number: { minLength: 2, maxLength: 7 },
      query: { minLength: 2, maxLength: 100 },
      limit: { minimum: 1, maximum: 20 },
    });
    expect(commentaryHandler.description).toContain('Verse ranges are not supported');
    expect(commentaryHandler.description).toContain('Exact-verse (scalar) coverage varies by commentary provider');
    expect(commentaryHandler.description).toContain('John Gill scalar lookup requires stronger exact-verse metadata');
    expect(commentaryHandler.description).toContain('Matthew Henry and Keil-Delitzsch are currently chapter-level');
    expect(commentaryHandler.description).toContain('Chapter results remain chapter-level commentary');
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
      resolvedReference: 'John 3:16',
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
    expect(result.structuredContent).toEqual(expect.objectContaining({
      schemaVersion: '1',
      kind: 'bible_cross_references',
      requestedReference: 'John 3:16',
      resolvedReference: 'John 3:16',
      query: { maxResults: 1, minVotes: 10 },
      ranking: {
        method: 'openbible_votes_descending',
        tieBreak: 'source_reference_ascending',
      },
      semantics: {
        evidenceUse: 'discovery_lead',
        relationshipClassification: 'unspecified',
        directionality: 'unspecified',
      },
      references: [{
        position: 1,
        reference: 'Romans 5:8',
        votes: 42,
        provenanceIds: ['openbible-cross-references'],
      }],
      resultWindow: { returnedCount: 1, qualifyingTotal: 3, hasMore: true },
      provenance: [expect.objectContaining({
        id: 'openbible-cross-references',
        version: '2025-10-13',
        locator: expect.stringContaining('bb5a4f5cfb7f0faa07b171ee9b361285d6179bee705de16ead0690da16568191'),
      })],
    }));
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
  });

  it('materializes effective defaults and preserves raw requested Markdown', async () => {
    const getCrossReferences = vi.fn<CrossReferenceService['getCrossReferences']>().mockResolvedValue({
      resolvedReference: 'John 3:16', references: [], total: 0, showing: 0, hasMore: false,
    });
    const handler = createCrossReferencesHandler(serviceDouble({ getCrossReferences }));

    const result = await handler.handler({ reference: 'Jn 3.16' });

    expect(getCrossReferences).toHaveBeenCalledWith('Jn 3.16', { maxResults: 5, minVotes: 0 });
    expect(textOf(result)).toBe(
      '**Cross-References for Jn 3.16**\n\n'
      + 'No cross-references found for this verse.\n\n'
      + '*Source: OpenBible.info cross references — CC BY*',
    );
    expect(result.structuredContent).toMatchObject({
      requestedReference: 'Jn 3.16', resolvedReference: 'John 3:16',
      query: { maxResults: 5, minVotes: 0 }, references: [],
      resultWindow: { returnedCount: 0, qualifyingTotal: 0, hasMore: false },
      provenance: [expect.objectContaining({ id: 'openbible-cross-references' })],
    });
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
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
  it('advertises bounded UBS survey navigation for clients that do not retrieve guided prompts', () => {
    const { description } = createParallelPassagesHandler(serviceDouble({ lookup: vi.fn() }));

    expect(description).toContain('full requested chapter/range, not a representative verse');
    expect(description).toContain('corpora: ["ubs_source_attested"], maxGroups: 5, includeText: false');
    expect(description).toContain('additional_match_observed');
    expect(description).toContain('nextCursor');
    expect(description).toContain('pass that `nextCursor` unchanged as `groupCursor` while preserving exactly the same `reference`, `corpora`, and `maxGroups`');
    expect(description).toContain('Stop after three pages');
    expect(description).toContain('survey is bounded');
  });

  it('does not advertise defaults for source-specific legacy compatibility fields', () => {
    const handler = createParallelPassagesHandler(serviceDouble({ lookup: vi.fn() }));
    const properties = handler.inputSchema.properties as Record<string, Record<string, unknown>>;
    expect(properties.mode).not.toHaveProperty('default');
    expect(properties.maxParallels).not.toHaveProperty('default');
    expect(properties.useCrossReferences).not.toHaveProperty('default');
    expect(properties.includeOpenBibleCrossReferences).not.toHaveProperty('default');
  });

  it('advertises the same 200-code-point bound used for structured excerpts', () => {
    const handler = createParallelPassagesHandler(serviceDouble({ lookup: vi.fn() }));
    const output = handler.outputSchema as any;
    const member = output.properties.sourceAttestedGroups.items.properties.members.items.properties;
    expect(member.text.maxLength).toBe(200);
    expect(member.excerpts.items.properties.text.maxLength).toBe(200);
    expect(output.properties.legacyParallels.items.properties.text.maxLength).toBe(200);
  });

  it('advertises the required v4 navigable UBS result-window and text-enrichment contracts', () => {
    const output = createParallelPassagesHandler(serviceDouble({ lookup: vi.fn() })).outputSchema as any;
    expect(output.properties.schemaVersion).toEqual({ type: 'string', const: '4' });
    expect(output.required).toContain('sourceAttestedResultWindow');
    expect(output.properties.sourceAttestedResultWindow).toMatchObject({
      additionalProperties: false,
      required: ['requestedLimit', 'returnedGroupCount', 'additionalMatchStatus'],
      properties: {
        requestedLimit: { minimum: 1, maximum: 10 },
        returnedGroupCount: { minimum: 0, maximum: 10 },
        additionalMatchStatus: {
          enum: ['additional_match_observed', 'no_additional_match_observed', 'not_evaluated'],
        },
      },
    });
    expect(output.properties).not.toHaveProperty('total');
    expect(output.properties).not.toHaveProperty('cursor');
    expect(output.required).toContain('textEnrichment');
    expect(output.properties.textEnrichment).toMatchObject({
      additionalProperties: false,
      properties: {
        budget: { properties: { maximum: { const: 12 } } },
        completionStatus: { enum: ['not_requested', 'complete', 'incomplete'] },
      },
    });
    const statuses = ['not_requested', 'complete', 'partial', 'unavailable', 'budget_omitted'];
    expect(output.properties.sourceAttestedGroups.items.properties.members.items.properties.textEnrichmentStatus.enum)
      .toEqual(statuses);
    expect(output.properties.legacyParallels.items.properties.textEnrichmentStatus.enum).toEqual(statuses);
  });

  it('accepts fully materialized advertised defaults without inferring legacy controls', async () => {
    const lookup = vi.fn<ParallelPassageService['lookup']>().mockResolvedValue({
      requestedReference: 'John 3:16', corpora: ['ubs_source_attested'], sourceAttestedGroups: [],
      sourceAttestedResultWindow: { requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'no_additional_match_observed' },
      legacyParallels: [], openBibleCrossReferences: [], provenance: [],
      textEnrichment: {
        requested: false, translation: null, budget: { unit: 'unique_canonical_passage_lookups', maximum: 12 },
        uniqueTargetCount: 0, scheduledLookupCount: 0, succeededLookupCount: 0,
        failedLookupCount: 0, omittedLookupCount: 0, completionStatus: 'not_requested',
      },
    });
    const handler = createParallelPassagesHandler(serviceDouble({ lookup }));
    const properties = handler.inputSchema.properties as Record<string, Record<string, unknown>>;
    const materialized = Object.fromEntries(Object.entries(properties)
      .filter(([, schema]) => 'default' in schema)
      .map(([name, schema]) => [name, schema.default]));
    const result = await handler.handler({ reference: 'John 3:16', ...materialized });

    expect(result.isError).not.toBe(true);
    expect(lookup).toHaveBeenCalledWith(expect.objectContaining({
      corpora: ['ubs_source_attested'], maxGroups: 5, includeAlignment: false,
      includeOpenBibleCrossReferences: undefined, mode: undefined, maxParallels: undefined, useCrossReferences: undefined,
    }));
  });
  it('forwards all lookup controls and formats text-bearing parallels', async () => {
    const lookup = vi.fn<ParallelPassageService['lookup']>().mockResolvedValue({
      requestedReference: 'Matthew 26:26-28',
      corpora: ['theologai_legacy'],
      sourceAttestedGroups: [],
      sourceAttestedResultWindow: { requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'not_evaluated' },
      legacyParallels: [{
        reference: 'Mark 14:22-24',
        relationship: 'synoptic',
        confidence: 0.95,
        text: 'And as they were eating...',
        textEnrichmentStatus: 'complete',
        provenanceIds: ['legacy'],
      }],
      openBibleCrossReferences: [],
      provenance: [],
      textEnrichment: {
        requested: true, translation: 'KJV', budget: { unit: 'unique_canonical_passage_lookups', maximum: 12 },
        uniqueTargetCount: 1, scheduledLookupCount: 1, succeededLookupCount: 1,
        failedLookupCount: 0, omittedLookupCount: 0, completionStatus: 'complete',
      },
    });
    const handler = createParallelPassagesHandler(serviceDouble({ lookup }));

    const result = await handler.handler({
      reference: 'Matthew 26:26-28',
      corpora: ['theologai_legacy'],
      mode: 'synoptic',
      includeText: true,
      translation: 'KJV',
      maxParallels: 4,
      maxGroups: undefined,
      includeAlignment: undefined,
      includeOpenBibleCrossReferences: undefined,
      useCrossReferences: false,
    });
    expect(result.structuredContent).toMatchObject({
      schemaVersion: '4', kind: 'parallel_passages', corpora: ['theologai_legacy'],
      sourceAttestedGroups: [], openBibleCrossReferences: [],
      sourceAttestedResultWindow: { requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'not_evaluated' },
    });

    expect(lookup).toHaveBeenCalledWith({
      reference: 'Matthew 26:26-28',
      corpora: ['theologai_legacy'],
      mode: 'synoptic',
      includeText: true,
      translation: 'KJV',
      maxParallels: 4,
      maxGroups: undefined,
      includeAlignment: undefined,
      includeOpenBibleCrossReferences: undefined,
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
      commentary: { reference: 'John 1:1', commentator: 'John Gill', text: 'Commentary body', citation },
      resolvedReference: 'John 1:1', canonicalCommentator: 'John Gill',
      coverage: {
        requestedScope: 'verse', returnedGranularity: 'exact_verse',
        identityBasis: 'provider_verse_number',
        providerIdentity: { field: 'verseNumber', value: 1 },
      },
      providerRevision: `sha256:${'a'.repeat(64)}`,
      textWindow: { unit: 'unicode_code_points', returnedCharacters: 15, sourceCharacters: 15, truncated: false },
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
    expect(textOf(result)).toBe(
      '**John Gill Commentary on John 1:1**\n\nCommentary body\n\n*Source: Test source* - Test license',
    );
    expect(result.structuredContent).toMatchObject({
      schemaVersion: '1', kind: 'commentary_lookup',
      query: { commentator: 'John Gill', maxResponseCharacters: 500 },
      coverage: {
        identityBasis: 'provider_verse_number',
        providerIdentity: { field: 'verseNumber', value: 1 },
      },
      commentary: { commentator: 'John Gill', text: 'Commentary body', textFormat: 'text/markdown' },
    });
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
  });

  it('applies maxLength to the complete formatted Markdown response', async () => {
    const lookup = vi.fn<CommentaryService['lookup']>().mockResolvedValue({
      commentary: { reference: 'John 1:1', commentator: 'John Gill', text: '𐐷'.repeat(500), citation },
      resolvedReference: 'John 1:1', canonicalCommentator: 'John Gill',
      coverage: {
        requestedScope: 'verse', returnedGranularity: 'exact_verse',
        identityBasis: 'provider_verse_number',
        providerIdentity: { field: 'verseNumber', value: 1 },
      },
      providerRevision: `sha256:${'a'.repeat(64)}`,
      textWindow: { unit: 'unicode_code_points', returnedCharacters: 500, sourceCharacters: 500, truncated: false },
    });
    const handler = createCommentaryHandler(serviceDouble({ lookup }));

    const result = await handler.handler({ reference: 'John 1:1', maxLength: 64 });

    expect(Array.from(textOf(result))).toHaveLength(64);
    expect(textOf(result).endsWith('…')).toBe(true);
  });

  it('returns service failures as tool errors', async () => {
    const lookup = vi.fn<CommentaryService['lookup']>().mockRejectedValue(new Error('failure'));
    const handler = createCommentaryHandler(serviceDouble({ lookup }));

    const result = await handler.handler({ reference: 'John 1:1' });

    expect(result.isError).toBe(true);
    expect(result).not.toHaveProperty('structuredContent');
  });

  it('turns a scalar commentary miss into actionable chapter guidance without exposing provider details', async () => {
    const lookup = vi.fn<CommentaryService['lookup']>().mockRejectedValue(
      new CommentaryScalarNotFoundError(
        'HelloAO',
        'John 3',
        'No exact commentary match for John 3:16 in Matthew Henry',
      ),
    );
    const handler = createCommentaryHandler(serviceDouble({ lookup }));

    const result = await handler.handler({ reference: 'John 3:16', commentator: 'Matthew Henry' });

    expect(result.isError).toBe(true);
    expect(result).not.toHaveProperty('structuredContent');
    expect(textOf(result)).toBe(
      'Not found: No trustworthy exact-verse commentary was available. Request the containing chapter (`John 3`) or try another commentator.',
    );
    expect(textOf(result)).not.toMatch(/HelloAO|verseNumber|metadata/i);
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
  const profile: HistoricalDocumentDeliveryProfile = {
    documentId: document.id, workId: null, editionId: null,
    immutableCorpusIdentity: 'a'.repeat(64), sectionPackageIdentity: null,
    deliveryMode: 'complete_document', sectionCount: 1,
    landingMaxBytes: 0, browsePageSize: 0, cursorVersion: 0,
    provenance: {}, rights: {},
  };
  const resolved: ResolvedHistoricalSection = {
    document, section, sectionKey: 'source-0001', sourceOrdinal: 1,
    requestedSectionId: 'source-0001', resolution: 'canonical',
  };
  const summary: HistoricalSectionSummary = {
    documentId: document.id, sectionKey: 'source-0001', sourceOrdinal: 1,
    legacyDisplayLabel: '1', heading: 'The Creed',
  };

  function createServices() {
    const historical = {
      listDocuments: vi.fn<HistoricalDocumentService['listDocuments']>().mockResolvedValue([document]),
      getDocument: vi.fn<HistoricalDocumentService['getDocument']>().mockResolvedValue(document),
      getSections: vi.fn<HistoricalDocumentService['getSections']>().mockResolvedValue([section]),
      getDeliveryProfile: vi.fn<HistoricalDocumentService['getDeliveryProfile']>().mockResolvedValue(profile),
      browseHistoricalSectionSummaries: vi.fn<HistoricalDocumentService['browseHistoricalSectionSummaries']>().mockResolvedValue([summary]),
      hasHistoricalSectionBoundary: vi.fn<HistoricalDocumentService['hasHistoricalSectionBoundary']>().mockResolvedValue(true),
      resolveSection: vi.fn<HistoricalDocumentService['resolveSection']>().mockResolvedValue(resolved),
      findDocument: vi.fn<HistoricalDocumentService['findDocument']>().mockResolvedValue(undefined),
      search: vi.fn<HistoricalDocumentService['search']>().mockResolvedValue([]),
      searchResolvedSections: vi.fn<HistoricalDocumentService['searchResolvedSections']>().mockResolvedValue([]),
    };
    return {
      historical,
      handler: createClassicTextsHandler(serviceDouble(historical)),
    };
  }

  it('lists local works', async () => {
    const { handler, historical } = createServices();
    historical.getSections.mockRejectedValue(new Error('body storage unavailable'));

    const result = await handler.handler({ listWorks: true });

    expect(historical.listDocuments).toHaveBeenCalledOnce();
    expect(textOf(result)).toContain('Available Historical Documents');
    expect(textOf(result)).toContain('`nicene-creed`');
    expect(result.structuredContent).toMatchObject({
      schemaVersion: '2', kind: 'classic_text_lookup', mode: 'list_works',
      catalog: {
        coverage: 'complete_local_work_inventory',
        delivery: 'metadata_summary', nativeResourceLinks: 'not_emitted',
        resultWindow: { returnedCount: 1, additionalMatchStatus: 'no_additional_match_observed' },
        works: [{ id: 'nicene-creed', resource: { uri: 'theologai://documents/nicene-creed' } }],
      },
      evidencePolicy: {
        providerScope: 'local_only', remoteDocumentBodies: 'disabled',
        editionProvenance: 'incomplete', rightsStatus: 'not_established',
      },
    });
    expect(historical.getSections).not.toHaveBeenCalled();
    expect(result.content).toHaveLength(1);
    expect((result.structuredContent as any).catalog.works[0].resource).not.toHaveProperty('resourceSizeBytes');
  });

  it('lists more than 32 catalog entries without reading bodies or silently omitting metadata', async () => {
    const { handler, historical } = createServices();
    historical.listDocuments.mockResolvedValue(Array.from({ length: 40 }, (_, index) => ({
      ...document, id: `document-${index + 1}`, title: `Document ${index + 1}`,
    })));

    const result = await handler.handler({ listWorks: true });
    const catalog = (result.structuredContent as any).catalog;
    expect(catalog.works).toHaveLength(40);
    expect(catalog.resultWindow).toEqual({
      returnedCount: 40, additionalMatchStatus: 'no_additional_match_observed',
    });
    expect(catalog.nativeResourceLinks).toBe('not_emitted');
    expect(historical.getSections).not.toHaveBeenCalled();
    expect(result.content.filter(block => block.type === 'resource_link')).toHaveLength(0);
  });

  it('returns exactly 100 works and fails rather than truncating 101', async () => {
    const { handler, historical } = createServices();
    const works = Array.from({ length: 101 }, (_, index) => ({
      ...document, id: `document-${index + 1}`, title: `Document ${index + 1}`,
    }));
    historical.listDocuments.mockResolvedValueOnce(works.slice(0, 100));
    const atLimit = await handler.handler({ listWorks: true });
    expect((atLimit.structuredContent as any).catalog.works).toHaveLength(100);
    expect(atLimit.isError).not.toBe(true);

    historical.listDocuments.mockResolvedValueOnce(works);
    const overLimit = await handler.handler({ listWorks: true });
    expect(overLimit.isError).toBe(true);
    expect(overLimit.structuredContent).toBeUndefined();
    expect(textOf(overLimit)).toContain('101 works');
    expect(textOf(overLimit)).toContain('was not truncated');
  });

  it('browses sections using the canonical document ID', async () => {
    const { handler, historical } = createServices();

    const result = await handler.handler({ work: 'Nicene Creed', browseSections: true });

    expect(historical.getDocument).toHaveBeenCalledWith('Nicene Creed');
    expect(historical.browseHistoricalSectionSummaries).toHaveBeenCalledWith('nicene-creed', undefined, 2001);
    expect(textOf(result)).toContain('1 — The Creed');
    expect(textOf(result)).toContain('theologai://documents/nicene-creed#section-source-0001');
    expect(textOf(result)).not.toContain('We believe in one God.');
    expect(result.structuredContent).toMatchObject({
      mode: 'browse_sections',
      directory: {
        coverage: 'complete_section_directory',
        sections: [{ sectionKey: 'source-0001', sourceOrdinal: 1, resource: { uri: 'theologai://documents/nicene-creed#section-source-0001' } }],
        linkWindow: { maximumResourceLinks: 32, emittedResourceLinkCount: 1 },
      },
    });
    expect((result.structuredContent as any).directory.work.resource)
      .not.toHaveProperty('resourceSizeBytes');
    expect((result.structuredContent as any).directory.sections[0].resource)
      .not.toHaveProperty('resourceSizeBytes');
    expect(result.content.find(block => block.type === 'resource_link'))
      .not.toHaveProperty('size');
  });

  it('returns a complete large directory while capping native resource links at 32', async () => {
    const { handler, historical } = createServices();
    historical.browseHistoricalSectionSummaries.mockResolvedValue(Array.from({ length: 40 }, (_, index) => ({
      ...summary, sectionKey: `source-${String(index + 1).padStart(4, '0')}`,
      sourceOrdinal: index + 1, legacyDisplayLabel: String(index + 1), heading: `Section ${index + 1}`,
    })));

    const result = await handler.handler({ work: document.id, browseSections: true });
    const structured = result.structuredContent as any;
    expect(structured.directory.sections).toHaveLength(40);
    expect(structured.directory.resultWindow).toEqual({
      returnedCount: 40, additionalMatchStatus: 'no_additional_match_observed',
    });
    expect(structured.directory.linkWindow).toEqual({
      maximumResourceLinks: 32, emittedResourceLinkCount: 32,
      additionalLinkStatus: 'additional_link_observed',
    });
    expect(result.content.filter(block => block.type === 'resource_link')).toHaveLength(32);
  });

  it('returns exactly 2000 directory entries and fails rather than truncating 2001', async () => {
    const { handler, historical } = createServices();
    const sections = Array.from({ length: 2001 }, (_, index) => ({
      ...section,
      id: index + 1,
      section_number: String(index + 1),
      title: `Section ${index + 1}`,
      content: `Body ${index + 1}`,
    }));
    historical.browseHistoricalSectionSummaries.mockResolvedValueOnce(sections.slice(0, 2000).map((value, index) => ({ ...summary, sectionKey: `source-${String(index + 1).padStart(4, '0')}`, sourceOrdinal: index + 1, legacyDisplayLabel: value.section_number, heading: value.title })));
    const atLimit = await handler.handler({ work: document.id, browseSections: true });
    expect((atLimit.structuredContent as any).directory.sections).toHaveLength(2000);
    expect(atLimit.isError).not.toBe(true);

    historical.browseHistoricalSectionSummaries.mockResolvedValueOnce(sections.map((value, index) => ({ ...summary, sectionKey: `source-${String(index + 1).padStart(4, '0')}`, sourceOrdinal: index + 1, legacyDisplayLabel: value.section_number, heading: value.title })));
    const overLimit = await handler.handler({ work: document.id, browseSections: true });
    expect(overLimit.isError).toBe(true);
    expect(overLimit.structuredContent).toBeUndefined();
    expect(textOf(overLimit)).toContain('2001 sections');
    expect(textOf(overLimit)).toContain('was not truncated');

    historical.findDocument.mockResolvedValueOnce(document);
    historical.getSections.mockResolvedValueOnce(sections);
    const overLimitWork = await handler.handler({ work: document.id });
    expect(overLimitWork.isError).toBe(true);
    expect(overLimitWork.structuredContent).toBeUndefined();
    expect(textOf(overLimitWork)).toContain('2001 sections');
    expect(textOf(overLimitWork)).toContain('was not truncated');
  });

  it('returns a matching local work', async () => {
    const { handler, historical } = createServices();
    historical.findDocument.mockResolvedValue(document);

    const result = await handler.handler({ work: 'nicene-creed' });

    expect(historical.getSections).toHaveBeenCalledWith('nicene-creed');
    expect(textOf(result)).toBe(`**Nicene Creed** (creed, 381)\n\n### The Creed\n\nWe believe in one God.\n\n*Source: TheologAI local historical-document collection*`);
    expect(result.structuredContent).toMatchObject({
      mode: 'work',
      document: { sectionCount: 1, bodyDelivery: 'markdown_only' },
    });
    const resourceSizeBytes = (result.structuredContent as any).document.work.resource.resourceSizeBytes;
    expect(result.content.find(block => block.type === 'resource_link')).toMatchObject({
      type: 'resource_link', size: resourceSizeBytes,
      _meta: { 'theologai/resourceSizeBytes': resourceSizeBytes },
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain('We believe in one God.');
  });

  it('does not retrieve a remote body when a work is not local', async () => {
    const { handler } = createServices();

    const result = await handler.handler({ work: 'calvin/institutes' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('No locally indexed historical document matches');
  });

  it('does not advertise or accept the former CCEL section argument', async () => {
    const handler = createServices().handler;
    expect(handler.inputSchema.properties).not.toHaveProperty('section');
    const result = await handler.handler({ work: 'augustine/confessions', section: 'book-one' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Unknown argument "section"');
  });

  it('returns local search results', async () => {
    const { handler, historical } = createServices();
    historical.searchResolvedSections.mockResolvedValue([resolved]);

    const result = await handler.handler({ query: 'wisdom' });

    expect(historical.searchResolvedSections).toHaveBeenCalledWith('wisdom', 11);
    expect(textOf(result)).toContain('Search Results for "wisdom"');
    expect(textOf(result)).toContain('Nicene Creed — Section source-0001 (source 1): The Creed');
    expect(textOf(result)).toContain('Discovery snippet only');
    expect(result.structuredContent).toMatchObject({
      mode: 'search',
      search: {
        status: 'ok',
        hits: [{ snippetOnly: true, section: { resource: { uri: 'theologai://documents/nicene-creed#section-source-0001' } } }],
        resultWindow: { returnedCount: 1, additionalMatchStatus: 'no_additional_match_observed' },
      },
    });
  });

  it('uses one private lookahead and reports only ten search hits', async () => {
    const { handler, historical } = createServices();
    historical.searchResolvedSections.mockResolvedValue(Array.from({ length: 11 }, (_, index) => ({
      ...resolved, sectionKey: `source-${String(index + 1).padStart(4, '0')}`, sourceOrdinal: index + 1,
      section: { ...section, id: index + 1, section_number: String(index + 1), content: `grâce ${index + 1}` },
    })));

    const result = await handler.handler({ query: 'grace' });
    const structured = result.structuredContent as any;
    expect(structured.search.hits).toHaveLength(10);
    expect(structured.search.resultWindow).toEqual({
      returnedCount: 10, additionalMatchStatus: 'additional_match_observed',
    });
    expect(result.content.filter(block => block.type === 'resource_link')).toHaveLength(10);
    const first = structured.search.hits[0].section.resource;
    expect(first.resourceSizeBytes).toBeGreaterThan('grâce 1'.length);
  });

  it('reports exactly ten hits without claiming an unobserved additional match', async () => {
    const { handler, historical } = createServices();
    historical.searchResolvedSections.mockResolvedValue(Array.from({ length: 10 }, (_, index) => ({
      ...resolved, sectionKey: `source-${String(index + 1).padStart(4, '0')}`, sourceOrdinal: index + 1,
      section: { ...section, id: index + 1, section_number: String(index + 1) },
    })));

    const result = await handler.handler({ query: 'grace' });
    expect((result.structuredContent as any).search).toMatchObject({
      status: 'ok',
      resultWindow: { returnedCount: 10, additionalMatchStatus: 'no_additional_match_observed' },
    });
  });

  it('uses the same code-point-safe discovery snippet in Markdown and structured output', async () => {
    const { handler, historical } = createServices();
    const content = `${'a'.repeat(299)}😀tail`;
    historical.searchResolvedSections.mockResolvedValue([{ ...resolved, section: { ...section, content } }]);

    const result = await handler.handler({ query: 'emoji' });
    const snippet = (result.structuredContent as any).search.hits[0].discoverySnippet;
    expect([...snippet.slice(0, -3)]).toHaveLength(300);
    expect(snippet).toBe(`${'a'.repeat(299)}😀...`);
    expect(textOf(result)).toContain(snippet);
    expect(snippet).not.toContain('\ud83d...');
  });

  it('fails closed when a stored section cannot form a canonical resource URI', async () => {
    const { handler, historical } = createServices();
    historical.searchResolvedSections.mockResolvedValue([{ ...resolved, sectionKey: '../bad' }]);

    const result = await handler.handler({ query: 'grace' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });

  it('rejects a scoped work query instead of silently ignoring it', async () => {
    const { handler } = createServices();

    const result = await handler.handler({ work: 'calvin/institutes', query: 'wisdom' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('query is the local-search mode');
  });

  it('keeps mode validation strict after flattening the advertised schema', async () => {
    const { handler, historical } = createServices();

    const result = await handler.handler({ work: 'calvin/institutes', query: 'wisdom' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('query is the local-search mode');
    expect(historical.search).not.toHaveBeenCalled();
  });

  it.each([
    [{ cursor: 'opaque' }],
    [{ listWorks: true, cursor: 'opaque' }],
    [{ query: 'grace', cursor: 'opaque' }],
    [{ browseSections: true, cursor: 'opaque' }],
    [{ work: document.id, cursor: 'opaque' }],
  ])('rejects cursor in every raw mode other than sectioned work browsing: %j', async params => {
    const { handler, historical } = createServices();

    const result = await handler.handler(params);

    expect(result).toMatchObject({ isError: true });
    expect(textOf(result)).toBe('Invalid input: cursor requires work and browseSections=true.');
    expect(historical.listDocuments).not.toHaveBeenCalled();
    expect(historical.searchResolvedSections).not.toHaveBeenCalled();
    expect(historical.browseHistoricalSectionSummaries).not.toHaveBeenCalled();
  });

  it('rejects a cursor for complete-document browsing instead of silently ignoring it', async () => {
    const { handler, historical } = createServices();

    const result = await handler.handler({ work: document.id, browseSections: true, cursor: 'opaque' });

    expect(result).toMatchObject({ isError: true });
    expect(textOf(result)).toBe('Invalid input: cursor is available only for sectioned-only browsing.');
    expect(historical.browseHistoricalSectionSummaries).not.toHaveBeenCalled();
  });

  it('enforces the 256-character work limit before a browse lookup', async () => {
    const { handler, historical } = createServices();

    const result = await handler.handler({ work: 'x'.repeat(257), browseSections: true });

    expect(result).toMatchObject({ isError: true });
    expect(textOf(result)).toBe('Invalid input: work must be a non-empty named local document slug or title.');
    expect(historical.getDocument).not.toHaveBeenCalled();
  });

  it('maps malformed, stale, non-canonical, and boundary-mismatched section cursors to invalid input', async () => {
    const { handler, historical } = createServices();
    const sectioned: HistoricalDocumentDeliveryProfile = {
      ...profile, workId: 'synthetic-work', editionId: 'synthetic-edition',
      sectionPackageIdentity: 'b'.repeat(64), deliveryMode: 'sectioned_only', sectionCount: 33,
      landingMaxBytes: 16_384, browsePageSize: 32, cursorVersion: 1,
    };
    historical.getDeliveryProfile.mockResolvedValue(sectioned);
    const position = { sourceOrdinal: 1, sectionKey: 'source-0001' };
    const validCursor = encodeHistoricalSectionedOnlyCursor(sectioned, position);
    const staleCursor = encodeHistoricalSectionedOnlyCursor({
      ...sectioned, sectionPackageIdentity: 'c'.repeat(64),
    }, position);
    const nonCanonicalCursor = Buffer.from(JSON.stringify({
      documentId: sectioned.documentId,
      contractVersion: 'historical-sectioned-only-cursor-v1',
      editionId: sectioned.editionId,
      immutableCorpusIdentity: sectioned.sectionPackageIdentity,
      pageSize: 32,
      lastSourceOrdinal: 1,
      lastSectionKey: 'source-0001',
    }), 'utf8').toString('base64url');

    for (const cursor of ['not-a-canonical-cursor', staleCursor, nonCanonicalCursor]) {
      const result = await handler.handler({ work: document.id, browseSections: true, cursor });
      expect(result).toMatchObject({ isError: true });
      expect(textOf(result)).toBe('Invalid input: Historical section browse cursor is malformed, stale, or non-canonical.');
    }

    historical.hasHistoricalSectionBoundary.mockResolvedValueOnce(false);
    const boundaryMismatch = await handler.handler({ work: document.id, browseSections: true, cursor: validCursor });
    expect(boundaryMismatch).toMatchObject({ isError: true });
    expect(textOf(boundaryMismatch)).toBe('Invalid input: Historical section browse cursor does not name a current section boundary.');
    expect(historical.browseHistoricalSectionSummaries).not.toHaveBeenCalled();
  });

  it('keeps an invalid server-returned continuation boundary as an internal error', async () => {
    const { handler, historical } = createServices();
    const sectioned: HistoricalDocumentDeliveryProfile = {
      ...profile, workId: 'synthetic-work', editionId: 'synthetic-edition',
      sectionPackageIdentity: 'b'.repeat(64), deliveryMode: 'sectioned_only', sectionCount: 33,
      landingMaxBytes: 16_384, browsePageSize: 32, cursorVersion: 1,
    };
    const rows = Array.from({ length: 33 }, (_, index) => ({
      ...summary, sectionKey: `source-${String(index + 1).padStart(4, '0')}`,
      sourceOrdinal: index + 1,
    }));
    rows[31] = { ...rows[31]!, sectionKey: '../invalid-server-key' };
    historical.getDeliveryProfile.mockResolvedValue(sectioned);
    historical.browseHistoricalSectionSummaries.mockResolvedValue(rows);

    const result = await handler.handler({ work: document.id, browseSections: true });

    expect(result).toMatchObject({ isError: true });
    expect(textOf(result)).toBe('I encountered an error retrieving that information. Please try again.');
    expect(textOf(result)).not.toContain('Invalid input:');
  });

  it('distinguishes an empty global search from a missing action', async () => {
    const { handler } = createServices();

    const noResults = await handler.handler({ query: 'not-present' });
    const noAction = await handler.handler({});

    expect(textOf(noResults)).toBe('No results found for "not-present".');
    expect(noResults.structuredContent).toMatchObject({
      mode: 'search', search: { status: 'no_results', hits: [], resultWindow: { returnedCount: 0 } },
    });
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

  it('does not report a search backend failure as no_results', async () => {
    const { handler, historical } = createServices();
    historical.searchResolvedSections.mockRejectedValue(new Error('database unavailable'));

    const result = await handler.handler({ query: 'grace' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(textOf(result)).not.toContain('No results found');
  });

  it('emits schema-valid v2 output for all four modes', async () => {
    const { handler, historical } = createServices();
    historical.findDocument.mockResolvedValue(document);
    historical.searchResolvedSections.mockResolvedValue([resolved]);
    const validate = validatorFor(handler.outputSchema!);
    for (const params of [
      { listWorks: true },
      { work: document.id, browseSections: true },
      { work: document.id },
      { query: 'belief' },
    ]) {
      const result = await handler.handler(params);
      const validation = validate(result.structuredContent);
      expect(validation.valid, validation.errorMessage).toBe(true);
    }
  });

  it('rejects contradictory search statuses, counts, and result windows', async () => {
    const { handler, historical } = createServices();
    historical.searchResolvedSections.mockResolvedValue([resolved]);
    const valid = await handler.handler({ query: 'belief' });
    const validate = validatorFor(handler.outputSchema!);
    const structured = valid.structuredContent as any;
    const invalid = [
      { ...structured, search: { ...structured.search, status: 'no_results' } },
      { ...structured, search: { ...structured.search, hits: [], resultWindow: { returnedCount: 0, additionalMatchStatus: 'no_additional_match_observed' } } },
      { ...structured, search: { ...structured.search, resultWindow: { returnedCount: 2, additionalMatchStatus: 'no_additional_match_observed' } } },
      { ...structured, search: { ...structured.search, resultWindow: { returnedCount: 1, additionalMatchStatus: 'additional_match_observed' } } },
    ];
    for (const candidate of invalid) {
      expect(validate(candidate).valid).toBe(true);
      expect(validateClassicTextsOutputSemantics(candidate)).toBe(false);
      expect(handler.validateStructuredOutput?.(candidate)).toBe(false);
    }
  });

  it('rejects schema-valid catalog and directory cardinality mutations semantically', async () => {
    const { handler } = createServices();
    const validateSchema = validatorFor(handler.outputSchema!);
    const catalog = (await handler.handler({ listWorks: true })).structuredContent as any;
    const directory = (await handler.handler({ work: document.id, browseSections: true })).structuredContent as any;
    const wrongCatalogCount = {
      ...catalog,
      catalog: { ...catalog.catalog, resultWindow: { ...catalog.catalog.resultWindow, returnedCount: 0 } },
    };
    const wrongDirectoryLinks = {
      ...directory,
      directory: {
        ...directory.directory,
        linkWindow: { ...directory.directory.linkWindow, emittedResourceLinkCount: 0 },
      },
    };

    for (const candidate of [wrongCatalogCount, wrongDirectoryLinks]) {
      expect(validateSchema(candidate).valid).toBe(true);
      expect(validateClassicTextsOutputSemantics(candidate)).toBe(false);
      expect(handler.validateStructuredOutput?.(candidate)).toBe(false);
    }
  });

  it('keeps a synthetic sectioned-only work bounded, metadata-only, and cursor-truthful', async () => {
    const { handler, historical } = createServices();
    const sectioned: HistoricalDocumentDeliveryProfile = {
      ...profile, workId: 'synthetic-work', editionId: 'synthetic-edition',
      sectionPackageIdentity: 'b'.repeat(64), deliveryMode: 'sectioned_only', sectionCount: 33,
      landingMaxBytes: 16_384, browsePageSize: 32, cursorVersion: 1,
    };
    const rows = Array.from({ length: 33 }, (_, index) => ({
      ...summary, sectionKey: `source-${String(index + 1).padStart(4, '0')}`,
      sourceOrdinal: index + 1, legacyDisplayLabel: String(index + 1), heading: `Heading ${index + 1}`,
    }));
    historical.findDocument.mockResolvedValue(document);
    historical.getDeliveryProfile.mockResolvedValue(sectioned);
    historical.browseHistoricalSectionSummaries.mockImplementation(async (_id, after) => {
      const start = after ? rows.findIndex(row => row.sourceOrdinal === after.sourceOrdinal && row.sectionKey === after.sectionKey) + 1 : 0;
      return rows.slice(start, start + 33);
    });

    const landing = await handler.handler({ work: document.id });
    expect(new TextEncoder().encode(textOf(landing)).byteLength).toBeLessThanOrEqual(16_384);
    expect(textOf(landing)).not.toContain('We believe in one God.');
    expect((landing.structuredContent as any).landing).toMatchObject({ bodyDelivery: 'exact_section_resource_only', sectionCount: 33 });

    const first = await handler.handler({ work: document.id, browseSections: true });
    const firstDirectory = (first.structuredContent as any).directory;
    expect(firstDirectory.sections).toHaveLength(32);
    expect(firstDirectory.pagination.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(firstDirectory.sections.every((entry: any) => !('content' in entry))).toBe(true);
    expect(textOf(first)).not.toContain('We believe in one God.');

    const second = await handler.handler({ work: document.id, browseSections: true, cursor: firstDirectory.pagination.nextCursor });
    expect((second.structuredContent as any).directory).toMatchObject({
      sections: [{ sectionKey: 'source-0033', sourceOrdinal: 33 }],
      resultWindow: { returnedCount: 1, additionalMatchStatus: 'no_additional_match_observed' },
    });
    await expect(handler.handler({ work: document.id, browseSections: true, cursor: 'not-a-canonical-cursor' }))
      .resolves.toMatchObject({ isError: true });
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

  it('adds opt-in corpus usage without conflating lexicon occurrences', async () => {
    const lookup = vi.fn<StrongsService['lookup']>().mockResolvedValue({
      strongs_number: 'G25', testament: 'NT', lemma: 'ἀγαπάω', definition: 'to love',
      extended: { occurrences: 143 }, citation,
    });
    const getCorpusUsage = vi.fn<StrongsService['getCorpusUsage']>().mockResolvedValue({
      level: 'study', exactMorphologyKey: 'G0025', corpusIdentity: 'c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd',
      attested: true, totals: { tokenCount: 17, verseCount: 15, bookCount: 4, sourceSurfaceVariantCount: 6 },
      bookDistribution: [], sourceSurfaceVariants: [], occurrences: [], cautions: ['one', 'two', 'three'],
    });
    const result = await createStrongsLookupHandler(serviceDouble({ lookup, getCorpusUsage })).handler({
      strongs_number: 'g0025', include_extended: true, usage_level: 'study', occurrence_limit: 7,
    });
    expect(lookup).toHaveBeenCalledWith('G25', true);
    expect(getCorpusUsage).toHaveBeenCalledWith('G25', 'study', 7, undefined);
    expect(textOf(result)).toContain('Occurrences: 143');
    expect(textOf(result)).toContain('**Totals:** 17 raw tokens');
    expect(result.structuredContent).toMatchObject({
      corpusUsage: { exactMorphologyKey: 'G0025', totals: { tokenCount: 17 }, provenanceIds: ['src-usage'] },
      provenance: expect.arrayContaining([expect.objectContaining({ id: 'src-usage', kind: 'morphology_dataset' })]),
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
    expect(handler.inputSchema.properties?.usage_level).not.toHaveProperty('default');
    expect(handler.inputSchema.properties?.occurrence_limit).not.toHaveProperty('default');
    expect(handler.inputSchema.properties?.occurrence_limit).toMatchObject({ minimum: 1, maximum: 25 });
    expect(handler.inputSchema.properties?.limit).not.toHaveProperty('default');
    const exact = handler.inputSchema.properties?.strongs_number as { pattern: string; maxLength: number };
    expect(exact.maxLength).toBe(7);
    expect(new RegExp(exact.pattern).test('G21502')).toBe(true);
    expect(new RegExp(exact.pattern).test('G000001')).toBe(false);
    expect(new RegExp(exact.pattern).test('G100000')).toBe(false);
    const corpusUsage = handler.outputSchema?.properties?.corpusUsage as {
      properties: { sourceSurfaceVariants: { maxItems: number }; occurrences: { maxItems: number } };
    };
    expect(corpusUsage.properties.sourceSurfaceVariants.maxItems).toBe(25);
    expect(corpusUsage.properties.occurrences.maxItems).toBe(25);
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

  it.each([
    [{ query: 'love', usage_level: 'overview' }, 'apply only to exact'],
    [{ strongs_number: 'G25', occurrence_limit: 5 }, 'require usage_level study or technical'],
    [{ strongs_number: 'G25', usage_level: 'overview', occurrence_cursor: 'abc' }, 'require usage_level study or technical'],
    [{ strongs_number: 'G25', usage_level: 'study', occurrence_limit: 13 }, 'between 1 and 12'],
    [{ strongs_number: 'G25', usage_level: 'technical', occurrence_limit: 26 }, 'between 1 and 25'],
    [{ strongs_number: 'G25', usage_level: 'technical', occurrence_cursor: 'bad cursor' }, 'malformed'],
  ])('rejects invalid corpus usage call %j', async (params, message) => {
    const result = await createStrongsLookupHandler(serviceDouble<StrongsService>({})).handler(params);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(message);
  });

  it('accepts a suffixed exact identity but rejects surrounding whitespace', async () => {
    const lookup = vi.fn<StrongsService['lookup']>().mockResolvedValue({
      strongs_number: 'G1722',
      testament: 'NT',
      lemma: 'ἐν',
      definition: 'in',
      citation,
    });
    const handler = createStrongsLookupHandler(serviceDouble({ lookup }));

    const suffixed = await handler.handler({ strongs_number: 'g2385i' });
    const spaced = await handler.handler({ strongs_number: ' G2385I ' });

    expect(suffixed.isError).not.toBe(true);
    expect(lookup).toHaveBeenCalledWith('G2385I', false);
    expect(spaced.isError).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it.each(['G6000', 'H9001', 'H9049', 'G21502'])('accepts extended exact identity %s at the MCP boundary', async identity => {
    const lookup = vi.fn<StrongsService['lookup']>().mockResolvedValue({
      strongs_number: identity,
      testament: identity.startsWith('G') ? 'NT' : 'OT',
      lemma: 'fixture',
      definition: 'fixture',
      citation,
    });
    const result = await createStrongsLookupHandler(serviceDouble({ lookup })).handler({ strongs_number: identity });
    expect(result.isError).not.toBe(true);
    expect(lookup).toHaveBeenCalledWith(identity, false);
  });

  it('presents a real lexicon-only STEPBible identity with CC BY provenance', async () => {
    const source = JSON.parse(readFileSync(new URL('../../../../data/biblical-languages/stepbible-lexicons/tbesg-greek.json', import.meta.url), 'utf8')) as Record<string, Record<string, unknown>>;
    const service = new StrongsServiceClass({
      lookup: async () => undefined,
      getLexiconEntry: async () => ({ strongs_number: 'G21502', source: 'STEPBible', extended_data: source.G21502 }),
      search: async () => [],
      getStats: async () => ({ greek: 0, hebrew: 0, total: 0 }),
    });
    const result = await createStrongsLookupHandler(service).handler({ strongs_number: 'g21502', include_extended: true });
    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain('**G21502**');
    expect(textOf(result)).toContain('*Source: STEPBible lexicon data* - CC BY 4.0');
    expect(result.structuredContent).toMatchObject({
      entries: [{ strongsNumber: 'G21502', language: 'Greek', testament: null, lemma: 'Ηνια', provenanceIds: ['src-1'] }],
      provenance: [{ id: 'src-1', label: 'STEPBible lexicon data', license: { label: 'CC BY 4.0' } }],
    });
    expect(textOf(result)).not.toContain('New Testament');
  });

  it('withholds real TBESH Hebrew Meaning from both Markdown and structured exact output', async () => {
    const source = JSON.parse(readFileSync(new URL('../../../../data/biblical-languages/stepbible-lexicons/tbesh-hebrew.json', import.meta.url), 'utf8')) as Record<string, Record<string, unknown>>;
    const forbidden = String(source.H9001.definition);
    const service = new StrongsServiceClass({
      lookup: async () => undefined,
      getLexiconEntry: async () => ({ strongs_number: 'H9001', source: 'STEPBible', extended_data: source.H9001 }),
      search: async () => [],
      getStats: async () => ({ greek: 0, hebrew: 0, total: 0 }),
    });

    const result = await createStrongsLookupHandler(service).handler({
      strongs_number: 'H9001', include_extended: true, detail_level: 'detailed',
    });

    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain('Gloss: &');
    expect(textOf(result)).toContain('Semantic evidence unavailable');
    expect(textOf(result)).toContain('Evidence policy');
    expect(JSON.stringify(result)).not.toContain(forbidden);
    expect(result.structuredContent).toMatchObject({
      entries: [{
        strongsNumber: 'H9001', definition: null, gloss: '&',
        evidencePolicy: { code: 'tbesh_meaning_withheld', semanticEvidence: 'unavailable' },
      }],
    });
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
    const serviceResult = {
      reference: 'John 1:1',
      testament: 'NT' as const,
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
    };
    const getVerseMorphology = vi.fn<MorphologyService['getVerseMorphology']>().mockResolvedValue(serviceResult);
    const handler = createVerseMorphologyHandler(serviceDouble({ getVerseMorphology }));

    const result = await handler.handler({ reference: 'John 1:1', expand_morphology: true });

    expect(getVerseMorphology).toHaveBeenCalledWith('John 1:1', true);
    expect(textOf(result)).toBe(formatMorphologyResult(serviceResult));
    expect(result.structuredContent).toMatchObject({
      schemaVersion: '1',
      kind: 'bible_verse_morphology',
      words: [{
        strongsNumber: 'G1722',
        morphologyCode: 'PREP',
        morphologyExpansion: 'preposition',
        gloss: 'in',
      }],
    });
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
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
    const tokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const recipientAddress = '0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04';
    const getConfig = vi.fn<DonationService['getConfig']>().mockReturnValue({
      recipientAddress,
      tokens: [{
        symbol: 'USDC', name: 'USD Coin', chainId: 8453, chainName: 'Base',
        network: 'eip155:8453', asset: tokenAddress, decimals: 6, isNative: false,
      }],
    });
    const handler = createDonationConfigHandler(serviceDouble({ getConfig }));

    const result = await handler.handler({});

    expect(getConfig).toHaveBeenCalledOnce();
    expect(textOf(result)).toContain(`\`${recipientAddress}\``);
    expect(textOf(result)).toContain(`| USDC | Base | \`${tokenAddress}\` | 6 |`);
    expect(result.structuredContent).toEqual({
      schemaVersion: '1', kind: 'donation_config', voluntary: true,
      featureAccessIndependentOfDonation: true,
      assetOrderMeaning: 'configured_display_order_not_ranking',
      webDonationUrl: 'https://theologai.xyz/',
      recipientAddress,
      assets: [{
        symbol: 'USDC', name: 'USD Coin', chainId: 8453, chainName: 'Base',
        network: 'eip155:8453', assetKind: 'token', assetAddress: tokenAddress, decimals: 6,
      }],
    });
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
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
        from: `0x${'1'.repeat(40)}`,
        to: '0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04',
        amount: '2.5',
        symbol: 'USDC',
        tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      }],
      explorerUrl: `https://basescan.org/tx/0x${'a'.repeat(64)}`,
      chainStatuses: [
        { chainId: 1, chainName: 'Ethereum', state: 'absent' },
        { chainId: 8453, chainName: 'Base', state: 'mined', minedSuccessfully: true },
        { chainId: 723, chainName: 'Radius', state: 'absent' },
      ],
      classifiedTransferCount: 1,
    });
    const handler = createVerifyDonationHandler(serviceDouble({ verifyDonation }));
    const txHash = `0x${'a'.repeat(64)}`;

    const result = await handler.handler({ tx_hash: txHash });

    expect(verifyDonation).toHaveBeenCalledWith(txHash);
    expect(textOf(result)).toContain('Donation Verified');
    expect(textOf(result)).toContain('2.5 USDC');
    expect(textOf(result)).toContain('View on Explorer');
    expect(result.structuredContent).toMatchObject({
      schemaVersion: '1', kind: 'verify_donation',
      classification: { status: 'verified', donationVerified: true },
      verificationPolicy: { finality: 'receipt_observed_no_confirmation_depth' },
    });
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
  });

  it.each([
    [
      'over-uint256',
      '1'.repeat(100),
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    ],
    [
      'leading-zero unsupported',
      '0001',
      `0x${'9'.repeat(40)}`,
    ],
  ])('returns structured unavailable evidence for a %s provider amount', async (_label, amount, tokenAddress) => {
    const txHash = `0x${'c'.repeat(64)}`;
    const evidence: ChainTransactionEvidence[] = [
      {
        txHash, chainId: 1, chainName: 'Ethereum', state: 'absent', transfers: [],
      },
      {
        txHash,
        chainId: 8453,
        chainName: 'Base',
        state: 'mined',
        minedSuccessfully: true,
        blockNumber: 100,
        transfers: [{
          from: `0x${'1'.repeat(40)}`,
          to: RECIPIENT_ADDRESS,
          amount,
          tokenAddress,
        }],
      },
      {
        txHash, chainId: 723, chainName: 'Radius', state: 'absent', transfers: [],
      },
    ];
    const handler = createVerifyDonationHandler(new DonationServiceClass({
      getEvidence: vi.fn().mockResolvedValue(evidence),
    }));

    const result = await handler.handler({ tx_hash: txHash });

    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain('Verification Temporarily Unavailable');
    expect(textOf(result)).not.toContain(amount);
    expect(result.structuredContent).toMatchObject({
      kind: 'verify_donation',
      classification: { status: 'unavailable', donationVerified: false },
      coverage: { availability: 'unavailable', checkedChainCount: 0 },
      transfers: [],
    });
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
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
