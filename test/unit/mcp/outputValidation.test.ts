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
import type { BibleService } from '../../../src/services/bible/BibleService.js';
import type { MorphologyService } from '../../../src/services/languages/MorphologyService.js';
import type { StrongsService } from '../../../src/services/languages/StrongsService.js';
import { createDeterministicMcpFixture } from '../../fixtures/mcpCompositionRoot.js';

const connected: Array<{ client: Client; server: Server }> = [];
type LogMessage = { level: string; logger?: string; data: unknown };

async function connect(tools: ToolHandler[], logs?: LogMessage[]): Promise<Client> {
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
  it('advertises output schemas for exactly the converted tools', async () => {
    const { root } = createDeterministicMcpFixture();
    const client = await connect(root.tools);
    const listed = await client.listTools();

    const withOutput = listed.tools.filter(tool => tool.outputSchema).map(tool => tool.name);
    expect(withOutput).toEqual([
      'bible_lookup',
      'bible_cross_references',
      'parallel_passages',
      'primary_source_search',
      'original_language_lookup',
      'bible_verse_morphology',
      'original_language_study',
    ]);
    for (const toolName of withOutput) {
      const schema = listed.tools.find(tool => tool.name === toolName)?.outputSchema;
      expect(schema).toMatchObject({ type: 'object', additionalProperties: false });
      expect(schema).not.toHaveProperty('$ref');
      expect(schema?.properties?.schemaVersion).toMatchObject({ const: toolName === 'primary_source_search' ? '3' : '1' });
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
