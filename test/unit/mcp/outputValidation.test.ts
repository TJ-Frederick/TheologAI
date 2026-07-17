import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from '../../../src/kernel/types.js';
import { createTheologAiMcpServer } from '../../../src/mcp/server.js';
import { createBibleLookupHandler } from '../../../src/tools/v2/bibleLookup.js';
import { createStrongsLookupHandler } from '../../../src/tools/v2/strongsLookup.js';
import { createVerseMorphologyHandler } from '../../../src/tools/v2/verseMorphology.js';
import { createPrimarySourceSearchHandler } from '../../../src/tools/v2/primarySourceSearch.js';
import { createParallelPassagesHandler } from '../../../src/tools/v2/parallelPassages.js';
import type { BibleService } from '../../../src/services/bible/BibleService.js';
import type { MorphologyService } from '../../../src/services/languages/MorphologyService.js';
import type { StrongsService } from '../../../src/services/languages/StrongsService.js';
import { createDeterministicMcpFixture } from '../../fixtures/mcpCompositionRoot.js';
import { DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG } from '../../../src/kernel/featureFlags.js';
import { classicTextsOutputSchema } from '../../../src/mcp/schemas/classicTexts.js';
import { validateClassicTextsOutputSemantics } from '../../../src/presenters/classicTextsStructured.js';

const connected: Array<{ client: Client; server: Server }> = [];
type LogMessage = { level: string; logger?: string; data: unknown };

async function connect(
  tools: ToolHandler[],
  logs?: LogMessage[],
  primarySourceContract = DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG,
): Promise<Client> {
  const root = {
    tools,
    services: {
      bibleService: { getSupportedTranslations: () => ['ESV'] },
      commentaryService: { getAvailableCommentators: () => ['Test'] },
      historicalService: {
        listDocuments: async () => [],
        getDocument: async () => undefined,
        getSections: async () => [],
      },
      strongsService: { lookup: async () => undefined },
    },
    primarySourceContract,
  };
  const server = createTheologAiMcpServer(root, 'output-validation-test').server;
  const client = new Client({ name: 'output-validation-client', version: '1.0.0' }, { capabilities: {} });
  if (logs) {
    client.setNotificationHandler(LoggingMessageNotificationSchema, notification => {
      logs.push(notification.params);
    });
  }
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  connected.push({ client, server });
  return client;
}

afterEach(async () => {
  await Promise.allSettled(connected.splice(0).flatMap(({ client, server }) => [client.close(), server.close()]));
});

describe('MCP structured output validation', () => {
  it('keeps the classic-text schema compact after moving cross-field search algebra to semantic validation', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(classicTextsOutputSchema)).byteLength;
    expect(bytes).toBeGreaterThan(15_000);
    expect(bytes).toBeLessThanOrEqual(16_384);
  });

  it('advertises output schemas for exactly the converted tools', async () => {
    const { root } = createDeterministicMcpFixture();
    const client = await connect(root.tools);
    const listed = await client.listTools();

    const withOutput = listed.tools.filter(tool => tool.outputSchema).map(tool => tool.name);
    expect(withOutput).toEqual([
      'bible_lookup',
      'bible_cross_references',
      'parallel_passages',
      'commentary_lookup',
      'classic_text_lookup',
      'primary_source_search',
      'original_language_lookup',
      'bible_verse_morphology',
      'original_language_study',
      'donation_config',
      'verify_donation',
    ]);
    for (const toolName of withOutput) {
      const schema = listed.tools.find(tool => tool.name === toolName)?.outputSchema;
      expect(schema).toMatchObject({ type: 'object', additionalProperties: false });
      expect(schema).not.toHaveProperty('$ref');
      const expectedVersion = toolName === 'primary_source_search' || toolName === 'parallel_passages' ? '3' : '1';
      expect(schema?.properties?.schemaVersion).toMatchObject({ const: expectedVersion });
    }
  });

  it('rejects missing successful structured results with a sanitized error', async () => {
    const schema = {
      type: 'object' as const,
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    };
    const handler = vi.fn().mockResolvedValue({ content: [{ type: 'text' as const, text: 'private passage' }] });
    const client = await connect([{
      name: 'structured_test',
      description: 'Test structured output',
      inputSchema: { type: 'object', additionalProperties: false },
      outputSchema: schema,
      handler,
    }]);

    await expect(client.callTool({ name: 'structured_test', arguments: {} }))
      .rejects.toMatchObject({ code: -32603, message: expect.stringContaining('Internal server error') });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('rejects malformed successful structured results without disclosing payloads', async () => {
    const handler = vi.fn().mockResolvedValue({
      content: [{ type: 'text' as const, text: 'private passage' }],
      structuredContent: { value: 42, secret: 'private payload' },
    });
    const logs: LogMessage[] = [];
    const client = await connect([{
      name: 'malformed_structured_test',
      description: 'Test malformed structured output',
      inputSchema: { type: 'object', additionalProperties: false },
      outputSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      },
      handler,
    }], logs);

    await client.setLoggingLevel('error');
    const failure = await client.callTool({ name: 'malformed_structured_test', arguments: {} }).catch(error => error as Error);
    expect(failure).toMatchObject({ code: -32603, message: expect.stringContaining('Internal server error') });
    expect(JSON.stringify(failure)).not.toContain('private passage');
    expect(JSON.stringify(failure)).not.toContain('private payload');
    expect(logs).toEqual([{
      level: 'error',
      logger: 'theologai.tools',
      data: { event: 'tool_output_validation_failed', tool: 'malformed_structured_test' },
    }]);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('rejects schema-valid but contradictory parallel-passage algebra', async () => {
    const handler = createParallelPassagesHandler({
      lookup: async () => ({
        requestedReference: 'Matthew 1:1', corpora: ['ubs_source_attested'],
        sourceAttestedGroups: [],
        sourceAttestedResultWindow: {
          requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'no_additional_match_observed',
        },
        legacyParallels: [], openBibleCrossReferences: [], provenance: [],
        textEnrichment: {
          requested: true, translation: 'WEB',
          budget: { unit: 'unique_canonical_passage_lookups', maximum: 12 },
          uniqueTargetCount: 1, scheduledLookupCount: 1, succeededLookupCount: 1,
          failedLookupCount: 1, omittedLookupCount: 0, completionStatus: 'incomplete',
        },
      }),
    } as any);
    const client = await connect([handler]);

    await expect(client.callTool({ name: 'parallel_passages', arguments: { reference: 'Matthew 1:1' } }))
      .rejects.toMatchObject({ code: -32603, message: expect.stringContaining('Internal server error') });
  });

  it.each([
    {
      name: 'returned count differs from emitted groups', corpora: ['ubs_source_attested'],
      window: { requestedLimit: 5, returnedGroupCount: 1, additionalMatchStatus: 'no_additional_match_observed' },
    },
    {
      name: 'selected UBS corpus is marked not evaluated', corpora: ['ubs_source_attested'],
      window: { requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'not_evaluated' },
    },
    {
      name: 'unselected UBS corpus is marked evaluated', corpora: ['theologai_legacy'],
      window: { requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'no_additional_match_observed' },
    },
    {
      name: 'additional match is claimed below the requested window', corpora: ['ubs_source_attested'],
      window: { requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'additional_match_observed' },
    },
  ])('rejects invalid parallel result-window protocol state: $name', async ({ corpora, window }) => {
    const handler = createParallelPassagesHandler({
      lookup: async () => ({
        requestedReference: 'Matthew 1:1', corpora,
        sourceAttestedGroups: [], sourceAttestedResultWindow: window,
        legacyParallels: [], openBibleCrossReferences: [], provenance: [],
        textEnrichment: {
          requested: false, translation: null,
          budget: { unit: 'unique_canonical_passage_lookups', maximum: 12 },
          uniqueTargetCount: 0, scheduledLookupCount: 0, succeededLookupCount: 0,
          failedLookupCount: 0, omittedLookupCount: 0, completionStatus: 'not_requested',
        },
      }),
    } as any);
    const client = await connect([handler]);

    await expect(client.callTool({ name: 'parallel_passages', arguments: { reference: 'Matthew 1:1' } }))
      .rejects.toMatchObject({ code: -32603, message: expect.stringContaining('Internal server error') });
  });

  it('fails closed when semantic output validation throws without disclosing private details', async () => {
    const logs: LogMessage[] = [];
    const client = await connect([{
      name: 'throwing_semantic_output',
      description: 'Throwing semantic validator fixture',
      inputSchema: { type: 'object', additionalProperties: false },
      outputSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      },
      validateStructuredOutput: () => {
        throw new Error('PRIVATE_SEMANTIC_SENTINEL');
      },
      handler: async () => ({
        content: [{ type: 'text' as const, text: 'safe fallback' }],
        structuredContent: { value: 'schema-valid' },
      }),
    }], logs);

    await client.setLoggingLevel('error');
    const failure = await client.callTool({ name: 'throwing_semantic_output', arguments: {} })
      .catch(error => error as Error);
    expect(failure).toMatchObject({ code: -32603, message: expect.stringContaining('Internal server error') });
    expect(JSON.stringify(failure)).not.toContain('PRIVATE_SEMANTIC_SENTINEL');
    expect(logs).toEqual([{
      level: 'error',
      logger: 'theologai.tools',
      data: { event: 'tool_output_validation_failed', tool: 'throwing_semantic_output' },
    }]);
  });

  it('does not invoke semantic validation when JSON Schema validation fails', async () => {
    const validateStructuredOutput = vi.fn(() => {
      throw new Error('semantic validator must not run');
    });
    const client = await connect([{
      name: 'schema_before_semantics',
      description: 'Schema-first validation fixture',
      inputSchema: { type: 'object', additionalProperties: false },
      outputSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      },
      validateStructuredOutput,
      handler: async () => ({
        content: [{ type: 'text' as const, text: 'safe fallback' }],
        structuredContent: { value: 42 },
      }),
    }]);

    await expect(client.callTool({ name: 'schema_before_semantics', arguments: {} }))
      .rejects.toMatchObject({ code: -32603, message: expect.stringContaining('Internal server error') });
    expect(validateStructuredOutput).not.toHaveBeenCalled();
  });

  it('validates any structured result even when the handler marks it as an error', async () => {
    const client = await connect([{
      name: 'malformed_structured_error',
      description: 'Test malformed structured error output',
      inputSchema: { type: 'object', additionalProperties: false },
      outputSchema: {
        type: 'object',
        properties: { schemaVersion: { const: '4' }, value: { type: 'string' } },
        required: ['schemaVersion', 'value'],
        additionalProperties: false,
      },
      handler: async () => ({
        content: [{ type: 'text' as const, text: 'sanitized unavailable' }],
        structuredContent: { schemaVersion: '4', value: 42, secret: 'must not escape' },
        isError: true,
      }),
    }]);

    const failure = await client.callTool({ name: 'malformed_structured_error', arguments: {} }).catch(error => error as Error);
    expect(failure).toMatchObject({ code: -32603, message: expect.stringContaining('Internal server error') });
    expect(JSON.stringify(failure)).not.toContain('must not escape');
  });

  it('allows a generic isError result to omit structured output', async () => {
    const client = await connect([{
      name: 'generic_structured_error',
      description: 'Test generic error without structured output',
      inputSchema: { type: 'object', additionalProperties: false },
      outputSchema: {
        type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false,
      },
      handler: async () => ({ content: [{ type: 'text' as const, text: 'safe generic error' }], isError: true }),
    }]);

    await expect(client.callTool({ name: 'generic_structured_error', arguments: {} })).resolves.toMatchObject({ isError: true });
  });

  it('rejects contradictory classic-text search status and window semantics at the MCP boundary', async () => {
    const client = await connect([{
      name: 'classic_contract_negative',
      description: 'Invalid classic-text result fixture',
      inputSchema: { type: 'object', additionalProperties: false },
      outputSchema: classicTextsOutputSchema,
      validateStructuredOutput: validateClassicTextsOutputSemantics,
      handler: async () => ({
        content: [{ type: 'text' as const, text: 'safe fallback' }],
        structuredContent: {
          schemaVersion: '1', kind: 'classic_text_lookup', mode: 'search',
          evidencePolicy: {
            providerScope: 'local_only', remoteDocumentBodies: 'disabled',
            editionProvenance: 'incomplete', rightsStatus: 'not_established',
            searchSnippets: 'discovery_only', selectedContentAccess: 'mcp_resource_read',
          },
          search: {
            query: 'grace', status: 'no_results', hits: [],
            resultWindow: { returnedCount: 0, additionalMatchStatus: 'additional_match_observed' },
          },
        },
      }),
    }]);

    await expect(client.callTool({ name: 'classic_contract_negative', arguments: {} }))
      .rejects.toMatchObject({ code: -32603, message: expect.stringContaining('Internal server error') });
  });

  it.each([
    ['catalog count', {
      schemaVersion: '1', kind: 'classic_text_lookup', mode: 'list_works',
      evidencePolicy: {
        providerScope: 'local_only', remoteDocumentBodies: 'disabled',
        editionProvenance: 'incomplete', rightsStatus: 'not_established',
        searchSnippets: 'discovery_only', selectedContentAccess: 'mcp_resource_read',
      },
      catalog: {
        coverage: 'complete_local_work_inventory', delivery: 'metadata_summary', nativeResourceLinks: 'not_emitted',
        works: [{
          id: 'doc', title: 'Document', type: 'confession', date: null, topics: [],
          resource: { kind: 'mcp_resource', uri: 'theologai://documents/doc' },
        }],
        resultWindow: { returnedCount: 0, additionalMatchStatus: 'no_additional_match_observed' },
      },
    }],
    ['directory link count', {
      schemaVersion: '1', kind: 'classic_text_lookup', mode: 'browse_sections',
      evidencePolicy: {
        providerScope: 'local_only', remoteDocumentBodies: 'disabled',
        editionProvenance: 'incomplete', rightsStatus: 'not_established',
        searchSnippets: 'discovery_only', selectedContentAccess: 'mcp_resource_read',
      },
      directory: {
        coverage: 'complete_section_directory',
        work: {
          id: 'doc', title: 'Document', type: 'confession', date: null, topics: [],
          resource: { kind: 'mcp_resource', uri: 'theologai://documents/doc' },
        },
        sections: [{
          id: 1, sectionNumber: '1', title: 'One',
          resource: { kind: 'mcp_resource', uri: 'theologai://documents/doc#section-1' },
        }],
        resultWindow: { returnedCount: 1, additionalMatchStatus: 'no_additional_match_observed' },
        linkWindow: {
          maximumResourceLinks: 32, emittedResourceLinkCount: 0,
          additionalLinkStatus: 'no_additional_link_observed',
        },
      },
    }],
  ])('rejects schema-valid semantic classic-text %s mutations at the MCP boundary', async (_label, structuredContent) => {
    const client = await connect([{
      name: `classic_semantic_${_label.replaceAll(' ', '_')}`,
      description: 'Semantic classic-text failure fixture',
      inputSchema: { type: 'object', additionalProperties: false },
      outputSchema: classicTextsOutputSchema,
      validateStructuredOutput: validateClassicTextsOutputSemantics,
      handler: async () => ({
        content: [{ type: 'text' as const, text: 'safe fallback' }],
        structuredContent,
      }),
    }]);

    await expect(client.callTool({
      name: `classic_semantic_${_label.replaceAll(' ', '_')}`, arguments: {},
    })).rejects.toMatchObject({ code: -32603, message: expect.stringContaining('Internal server error') });
  });

  it('accepts a v4 primary-source result after control-only optional metadata is omitted', async () => {
    const contract = {
      exposeCcelDiscovery: true, ccelLiveSearch: false, ccelCoordinator: false,
      contractVersion: '4' as const, liveCcelEnabled: false,
    };
    const handler = createPrimarySourceSearchHandler({
      search: async () => ({
        planStatus: 'complete' as const,
        queries: [{
          id: 'local', normalizedMode: 'all_terms' as const, normalizedSelection: 'relevance' as const,
          providers: [{
            provider: 'local' as const, status: 'ok' as const, searched: true, page: 1, hitCount: 1,
            resultWindow: { returnedHitCount: 1, additionalMatchStatus: 'no_additional_match_observed' as const },
            notices: [],
            scope: {
              status: 'matched' as const, requested: {}, eligibleDocumentCount: 1,
              eligibleDocuments: [{ id: 'doc', title: 'Document', metadataStatus: 'reviewed' as const }],
              eligibleDocumentsTruncated: false,
            },
            hits: [{
              queryId: 'local', provider: 'local' as const, title: 'Section',
              author: '\u0001', sectionLabel: '\u0002', documentType: '\u0003', documentDate: '\u0004',
              snippet: 'Discovery lead', rankWithinProvider: 1, page: 1, snippetOnly: true as const,
              attribution: 'Local', resourceSizeBytes: 10,
              locator: {
                kind: 'local_section' as const, documentId: 'doc', sectionId: '1',
                url: 'theologai://documents/doc#section-1',
              },
            }],
          }],
        }],
        coverage: {
          localAttempted: true, localStatus: 'ok' as const, localHitCount: 1,
          ccelAttempted: false, ccelHitCount: 0, notices: [],
        },
      }),
    } as any, contract);
    const client = await connect([handler], undefined, contract);

    const result = await client.callTool({
      name: 'primary_source_search',
      arguments: { queries: [{ id: 'local', text: 'grace', providers: ['local'] }] },
    });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as any;
    const hit = structured.queries[0].providers[0].hits[0];
    expect(hit).not.toHaveProperty('author');
    expect(hit).not.toHaveProperty('sectionLabel');
    expect(hit).not.toHaveProperty('documentType');
    expect(hit).not.toHaveProperty('documentDate');
    expect(structured).toMatchObject({ planStatus: 'partial', responseWindow: { truncated: true } });
  });

  it('rejects additional fields even when required structured fields are valid', async () => {
    const client = await connect([{
      name: 'additional_field_structured_test',
      description: 'Test additional structured output field',
      inputSchema: { type: 'object', additionalProperties: false },
      outputSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      },
      handler: async () => ({
        content: [{ type: 'text' as const, text: 'safe text' }],
        structuredContent: { value: 'valid', unexpected: 'private payload' },
      }),
    }]);

    const failure = await client.callTool({ name: 'additional_field_structured_test', arguments: {} })
      .catch(error => error as Error);
    expect(failure).toMatchObject({ code: -32603, message: expect.stringContaining('Internal server error') });
    expect(JSON.stringify(failure)).not.toContain('private payload');
  });

  it('accepts all converted success modes through the registry and SDK client', async () => {
    const bibleService = {
      lookup: async () => ({
        reference: 'John 3:16',
        translation: 'ESV',
        text: 'For God so loved the world.',
        citation: { source: 'English Standard Version', copyright: 'Copyright notice' },
      }),
      lookupMultiple: async () => ({
        reference: 'John 3:16',
        results: [{
          reference: 'John 3:16',
          translation: 'ESV',
          text: 'For God so loved the world.',
          citation: { source: 'English Standard Version', copyright: 'Copyright notice' },
        }],
        failures: [{ translation: 'KJV', reason: 'Unavailable' }],
      }),
    } as unknown as BibleService;
    const strongsService = {
      search: async () => [{
        strongs_number: 'G26',
        testament: 'NT' as const,
        lemma: 'ἀγάπη',
        transliteration: 'agapē',
        pronunciation: 'ag-ah-pay',
        definition: 'love '.repeat(100),
        derivation: 'from G25',
      }],
      lookup: async (_number: string, includeExtended?: boolean) => ({
        strongs_number: 'G26',
        testament: 'NT' as const,
        lemma: 'ἀγάπη',
        transliteration: 'agapē',
        pronunciation: 'ag-ah-pay',
        definition: 'love',
        derivation: 'from G25',
        citation: { source: "Strong's Concordance", copyright: 'Public Domain (OpenScriptures)' },
        ...(includeExtended ? {
          extendedCitation: { source: 'STEPBible lexicon data', copyright: 'CC BY 4.0 (Tyndale House, Cambridge)' },
          extended: {
            strongsExtended: 'G0026',
            gloss: 'love',
            morphologyCode: 'G:N-F',
            source: 'STEPBible',
            definition: '&lt;b&gt;love&lt;/b&gt;&lt;br/&gt;divine love &amp; charity',
            senses: { first: { gloss: 'love', usage: 'divine love', count: 1 } },
          },
        } : {}),
      }),
      getCorpusUsage: async () => ({
        level: 'technical' as const, exactMorphologyKey: 'G0026', corpusIdentity: 'c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd',
        attested: true, totals: { tokenCount: 3, verseCount: 3, bookCount: 2, sourceSurfaceVariantCount: 2 },
        bookDistribution: [{ book: 'John', canonicalOrder: 43, tokenCount: 2, verseCount: 2 }],
        sourceSurfaceVariants: [{
          sourceForm: 'ἀγάπη·', tokenCount: 1, verseCount: 1,
          firstOccurrence: { book: 'John', canonicalOrder: 43, chapter: 3, verse: 16, position: 8 },
        }],
        occurrences: [{
          book: 'John', canonicalOrder: 43, chapter: 3, verse: 16, position: 8,
          sourceForm: 'ἀγάπη·', lemma: 'ἀγάπη', exactMorphologyKey: 'G0026', morphologyCode: 'N-NSF', gloss: 'love',
        }], nextOccurrenceCursor: 'opaque_cursor', cautions: ['one', 'two', 'three'],
      }),
    } as unknown as StrongsService;
    const morphologyService = {
      getVerseMorphology: async () => ({
        reference: 'John 1:1', testament: 'NT' as const, book: 'John', chapter: 1, verse: 1,
        words: [{
          position: 1, text: '', lemma: '', strong: '', morph: '',
          morphExpanded: undefined, gloss: '[ ]',
        }],
        citation: {
          source: 'STEPBible TAGNT/TAHOT',
          copyright: 'CC BY 4.0 (Tyndale House, Cambridge)',
          url: 'https://github.com/STEPBible/STEPBible-Data',
        },
      }),
    } as unknown as MorphologyService;
    const client = await connect([
      createBibleLookupHandler(bibleService),
      createStrongsLookupHandler(strongsService),
      createVerseMorphologyHandler(morphologyService),
    ]);

    await client.listTools();
    const bibleSingle = await client.callTool({ name: 'bible_lookup', arguments: { reference: 'John 3:16' } });
    const biblePartial = await client.callTool({ name: 'bible_lookup', arguments: { reference: 'John 3:16', translation: ['ESV', 'KJV'] } });
    const search = await client.callTool({ name: 'original_language_lookup', arguments: { query: 'love' } });
    const simple = await client.callTool({ name: 'original_language_lookup', arguments: { strongs_number: 'G26' } });
    const detailed = await client.callTool({ name: 'original_language_lookup', arguments: { strongs_number: 'G26', detail_level: 'detailed' } });
    const extended = await client.callTool({ name: 'original_language_lookup', arguments: { strongs_number: 'G26', include_extended: true, detail_level: 'detailed' } });
    const usage = await client.callTool({ name: 'original_language_lookup', arguments: { strongs_number: 'G26', usage_level: 'technical', occurrence_limit: 1 } });
    const morphology = await client.callTool({ name: 'bible_verse_morphology', arguments: { reference: 'John 1:1', expand_morphology: true } });

    for (const result of [bibleSingle, biblePartial, search, simple, detailed, extended, usage, morphology]) {
      expect(result.isError).not.toBe(true);
      expect(result.content[0]).toMatchObject({ type: 'text', text: expect.any(String) });
      expect(result.structuredContent).toMatchObject({ schemaVersion: '1' });
    }
    expect(biblePartial.structuredContent).toMatchObject({
      passages: [expect.anything()],
      failures: [{ translation: 'KJV', reason: 'Unavailable' }],
    });
    expect(search.structuredContent).toMatchObject({ mode: 'search', detailLevel: 'summary', nextStep: expect.any(Object) });
    expect(simple.structuredContent).toMatchObject({ mode: 'entry', detailLevel: 'summary' });
    expect(detailed.structuredContent).toMatchObject({ mode: 'entry', detailLevel: 'detailed' });
    expect(extended.structuredContent).toMatchObject({
      mode: 'entry',
      entries: [{ extended: { definition: 'love\ndivine love & charity' } }],
    });
    expect(usage.structuredContent).toMatchObject({
      corpusUsage: { exactMorphologyKey: 'G0026', occurrences: [{ sourceForm: 'ἀγάπη·' }] },
    });
    expect(morphology.structuredContent).toMatchObject({
      kind: 'bible_verse_morphology',
      words: [{
        text: null, lemma: null, strongsNumber: null, morphologyCode: null,
        morphologyExpansion: null, lemmaProvenanceIds: [],
      }],
    });
  });

  it('accepts corpus-empty Strong\'s text through the registry and SDK client', async () => {
    const client = await connect([createStrongsLookupHandler({
      lookup: async () => ({
        strongs_number: 'G302',
        testament: 'NT' as const,
        lemma: 'ἄν',
        transliteration: null,
        pronunciation: null,
        definition: '',
        derivation: null,
        citation: { source: "Strong's Concordance", copyright: 'Public Domain (OpenScriptures)' },
      }),
      search: async () => [{
        strongs_number: 'G2717',
        testament: 'NT' as const,
        lemma: '',
        transliteration: null,
        pronunciation: null,
        definition: '',
        derivation: null,
      }],
    } as unknown as StrongsService)]);

    await client.listTools();
    const exact = await client.callTool({
      name: 'original_language_lookup',
      arguments: { strongs_number: 'G302' },
    });
    const search = await client.callTool({
      name: 'original_language_lookup',
      arguments: { query: 'empty' },
    });

    expect(exact.isError).not.toBe(true);
    expect(exact.structuredContent).toMatchObject({
      mode: 'entry',
      entries: [{ strongsNumber: 'G302', lemma: 'ἄν', definition: null }],
    });
    expect(search.isError).not.toBe(true);
    expect(search.structuredContent).toMatchObject({
      mode: 'search',
      entries: [{ strongsNumber: 'G2717', lemma: null, definition: null }],
    });
  });

  it('skips success-schema validation for existing isError results', async () => {
    const client = await connect([{
      name: 'structured_error',
      description: 'Test structured error',
      inputSchema: { type: 'object', additionalProperties: false },
      outputSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      },
      handler: async () => ({
        content: [{ type: 'text' as const, text: 'Actionable error' }],
        isError: true,
      }),
    }]);

    await expect(client.callTool({ name: 'structured_error', arguments: {} }))
      .resolves.toMatchObject({ isError: true, content: [{ text: 'Actionable error' }] });
  });
});
