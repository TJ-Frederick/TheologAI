import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler, ToolResult } from '../../../src/kernel/types.js';
import type { McpCompositionRoot } from '../../../src/mcp/server.js';
import { createTheologAiMcpServer, STATELESS_HTTP_CAPABILITIES } from '../../../src/mcp/server.js';
import { BibleMCPServer } from '../../../src/server.js';
import { createWorkerMcpServer } from '../../../src/worker-server.js';
import type { WorkerCompositionRoot } from '../../../src/tools/worker/index.js';
import { StrongsService } from '../../../src/services/languages/StrongsService.js';
import { readFileSync } from 'node:fs';

const TOOL_NAMES = [
  'bible_lookup',
  'bible_cross_references',
  'parallel_passages',
  'commentary_lookup',
  'classic_text_lookup',
  'original_language_lookup',
  'bible_verse_morphology',
  'donation_config',
  'verify_donation',
];

function makeMockTool(name: string): ToolHandler {
  return {
    name,
    description: `Mock ${name} tool`,
    inputSchema: {
      type: 'object',
      properties: { reference: { type: 'string', minLength: 1, maxLength: 100 } },
      required: ['reference'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: `Result from ${name}` }],
    } satisfies ToolResult),
  };
}

function makeMockRoot(): McpCompositionRoot {
  return {
    tools: TOOL_NAMES.map(makeMockTool),
    services: {
      bibleService: {
        getSupportedTranslations: () => ['ESV', 'KJV', 'NET'],
      },
      commentaryService: {
        getAvailableCommentators: () => ['Matthew Henry', 'John Gill'],
      },
      historicalService: {
        listDocuments: async () => [{
          id: 'nicene-creed',
          title: 'Nicene Creed',
          type: 'creed',
          date: '325',
          topics: ['trinity'],
        }],
        getDocument: async () => ({
          id: 'nicene-creed',
          title: 'Nicene Creed',
          type: 'creed',
          date: '325',
          topics: ['trinity'],
        }),
        getSections: async () => [{
          id: 1,
          document_id: 'nicene-creed',
          section_number: '1',
          title: 'Article I',
          content: 'We believe...',
          topics: [],
        }],
      },
      strongsService: {
        lookup: async () => ({
          strongs_number: 'G0026',
          lemma: 'ἀγάπη',
          transliteration: 'agapē',
          pronunciation: null,
          testament: 'NT' as const,
          definition: 'love',
          derivation: null,
          extended: null,
          citation: { source: "Strong's Concordance" },
        }),
      },
    },
  };
}

type Connected = { client: Client; server: Server };
const connected: Connected[] = [];

async function connect(server: Server): Promise<Client> {
  const client = new Client(
    { name: 'theologai-unit-client', version: '1.0.0' },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  connected.push({ client, server });
  return client;
}

async function registrationSnapshot(server: Server) {
  const client = await connect(server);
  return {
    version: client.getServerVersion(),
    capabilities: client.getServerCapabilities(),
    tools: await client.listTools(),
    resources: await client.listResources(),
    templates: await client.listResourceTemplates(),
    prompts: await client.listPrompts(),
  };
}

const MCP_SERVER_VARIANTS = [
  {
    name: 'Node',
    create: (root: McpCompositionRoot) => new BibleMCPServer(root, 'logging-test').getServer(),
  },
  {
    name: 'Worker',
    create: (root: McpCompositionRoot) => createWorkerMcpServer(
      root as WorkerCompositionRoot,
      'logging-test',
    ).server,
  },
] as const;

const LOGGING_SERVER_VARIANTS = [MCP_SERVER_VARIANTS[0]] as const;

afterEach(async () => {
  await Promise.allSettled(connected.splice(0).flatMap(({ client, server }) => [client.close(), server.close()]));
});

describe('shared MCP registration', () => {
  it('advertises the stable server identity and four capabilities', async () => {
    const client = await connect(createTheologAiMcpServer(makeMockRoot(), '1.0.0-test').server);

    expect(client.getServerVersion()).toEqual({
      name: 'theologai-bible-server',
      version: '1.0.0-test',
    });
    expect(client.getServerCapabilities()).toEqual({
      tools: {},
      resources: {},
      prompts: {},
      logging: {},
    });
  });

  it('lists all 9 tools and dispatches calls through the shared registry', async () => {
    const root = makeMockRoot();
    const client = await connect(createTheologAiMcpServer(root, '1.0.0-test').server);
    const listed = await client.listTools();

    expect(listed.tools.map(tool => tool.name)).toEqual(TOOL_NAMES);
    for (const tool of listed.tools) {
      expect(tool).toEqual(expect.objectContaining({
        description: expect.any(String),
        inputSchema: expect.objectContaining({ type: 'object' }),
        annotations: expect.objectContaining({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
        }),
      }));
    }

    const result = await client.callTool({
      name: 'bible_lookup',
      arguments: { reference: 'John 3:16' },
    });
    expect(result.content).toEqual([{ type: 'text', text: 'Result from bible_lookup' }]);
    expect(root.tools[0].handler).toHaveBeenCalledWith({ reference: 'John 3:16' });
  });

  it.each(LOGGING_SERVER_VARIANTS)('$name emits sanitized tool execution logs after client opt-in', async ({ create }) => {
    const root = makeMockRoot();
    const server = create(root);
    const messages: Array<{ level: string; logger?: string; data: unknown }> = [];
    const client = new Client(
      { name: 'theologai-logging-client', version: '1.0.0' },
      { capabilities: {} },
    );
    client.setNotificationHandler(LoggingMessageNotificationSchema, notification => {
      messages.push(notification.params);
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    connected.push({ client, server });

    await client.setLoggingLevel('info');
    await client.callTool({
      name: 'bible_lookup',
      arguments: { reference: 'private-value-must-not-be-logged' },
    });

    expect(messages).toContainEqual({
      level: 'info',
      logger: 'theologai.tools',
      data: { event: 'tool_execution', tool: 'bible_lookup' },
    });
    expect(JSON.stringify(messages)).not.toContain('private-value-must-not-be-logged');
  });

  it('publishes the exact JSON Schema used to validate tool calls', async () => {
    const root = makeMockRoot();
    const client = await connect(createTheologAiMcpServer(root, '1.0.0-test').server);
    const listed = await client.listTools();

    expect(listed.tools[0].inputSchema).toEqual(root.tools[0].inputSchema);
  });

  it('validates tool contracts with JSON Schema 2020-12 semantics', async () => {
    const root = makeMockRoot();
    root.tools[0].inputSchema = {
      type: 'object',
      properties: {
        primary: { type: 'string' },
        secondary: { type: 'string' },
      },
      required: ['primary'],
      dependentRequired: { primary: ['secondary'] },
      additionalProperties: false,
    };
    const client = await connect(createTheologAiMcpServer(root, '1.0.0-test').server);

    const result = await client.callTool({
      name: 'bible_lookup',
      arguments: { primary: 'present' },
    });

    expect(result).toMatchObject({
      isError: true,
      content: [{ text: expect.stringContaining('must have property secondary') }],
    });
    expect(root.tools[0].handler).not.toHaveBeenCalled();
  });

  it.each([
    [{}, 'missing required argument "reference"'],
    [{ reference: 'John 3:16', extra: true }, 'unknown argument "extra"'],
    [{ reference: 'x'.repeat(101) }, 'argument "reference" must NOT have more than 100 characters'],
    [{ reference: 316 }, 'argument "reference" must be string'],
  ])('returns actionable tool errors for invalid known-tool arguments', async (arguments_, message) => {
    const root = makeMockRoot();
    const client = await connect(createTheologAiMcpServer(root, '1.0.0-test').server);

    const result = await client.callTool({ name: 'bible_lookup', arguments: arguments_ });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: `Invalid arguments for bible_lookup: ${message}` }]);
    expect(root.tools[0].handler).not.toHaveBeenCalled();
  });

  it('uses InvalidParams for unknown tools and preserves known tool error results', async () => {
    const root = makeMockRoot();
    root.tools[0].handler = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Known business error' }],
      isError: true,
    });
    const client = await connect(createTheologAiMcpServer(root, '1.0.0-test').server);

    await expect(client.callTool({ name: 'unknown_tool', arguments: {} })).rejects.toMatchObject({
      code: -32602,
      message: expect.stringContaining('Unknown tool: unknown_tool'),
    });
    await expect(client.callTool({ name: 'bible_lookup', arguments: { reference: 'John 3:16' } }))
      .resolves.toMatchObject({ isError: true, content: [{ text: 'Known business error' }] });
  });

  it('keeps unexpected tool failures generic InternalError protocol errors', async () => {
    const root = makeMockRoot();
    root.tools[0].handler = vi.fn().mockRejectedValue(new Error('Unexpected failure'));
    const client = await connect(createTheologAiMcpServer(root, '1.0.0-test').server);

    await expect(client.callTool({ name: 'bible_lookup', arguments: { reference: 'John 3:16' } }))
      .rejects.toMatchObject({ code: -32603, message: expect.stringContaining('Internal server error') });
  });

  it('lists static and dynamic resources plus both templates', async () => {
    const client = await connect(createTheologAiMcpServer(makeMockRoot(), '1.0.0-test').server);
    const resources = await client.listResources();
    const templates = await client.listResourceTemplates();

    expect(resources.resources.map(resource => resource.uri)).toEqual([
      'theologai://translations',
      'theologai://commentaries',
      'theologai://documents/nicene-creed',
    ]);
    expect(templates.resourceTemplates.map(template => template.uriTemplate)).toEqual([
      'theologai://documents/{slug}',
      'theologai://strongs/{number}',
    ]);

    const translations = await client.readResource({ uri: 'theologai://translations' });
    expect(translations.contents[0]).toEqual(expect.objectContaining({
      mimeType: 'text/markdown',
      text: expect.stringContaining('ESV'),
    }));

    const commentaries = await client.readResource({ uri: 'theologai://commentaries' });
    expect(commentaries.contents[0]).toEqual(expect.objectContaining({
      text: expect.stringContaining('John Gill'),
    }));
    expect(commentaries.contents[0]).toEqual(expect.objectContaining({
      text: expect.stringContaining('verseNumber metadata'),
    }));
  });

  it.each(LOGGING_SERVER_VARIANTS)('$name warns when historical resources are unavailable and returns static resources', async ({ create }) => {
    const root = makeMockRoot();
    root.services.historicalService.listDocuments = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const server = create(root);
    const messages: Array<{ level: string; logger?: string; data: unknown }> = [];
    const client = new Client(
      { name: 'theologai-resource-client', version: '1.0.0' },
      { capabilities: {} },
    );
    client.setNotificationHandler(LoggingMessageNotificationSchema, notification => {
      messages.push(notification.params);
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    connected.push({ client, server });

    await client.setLoggingLevel('warning');
    const resources = await client.listResources();

    expect(resources.resources.map(resource => resource.uri)).toEqual([
      'theologai://translations',
      'theologai://commentaries',
    ]);
    expect(messages).toContainEqual({
      level: 'warning',
      logger: 'theologai.resources',
      data: { event: 'historical_resources_unavailable' },
    });
    expect(JSON.stringify(messages)).not.toContain('database unavailable');
  });

  it('fails stateless resource listing safely instead of hiding a corpus outage', async () => {
    const root = makeMockRoot();
    root.services.historicalService.listDocuments = vi.fn().mockRejectedValue(new Error('private database detail'));
    const client = await connect(
      createTheologAiMcpServer(root, '1.0.0-test', STATELESS_HTTP_CAPABILITIES).server,
    );

    await expect(client.listResources()).rejects.toMatchObject({
      code: -32603,
      message: expect.stringContaining('Unable to list resources'),
    });
  });

  it('uses ResourceNotFound with URI data for unknown resources', async () => {
    const client = await connect(createTheologAiMcpServer(makeMockRoot(), '1.0.0-test').server);
    const uri = 'theologai://unknown/item';

    await expect(client.readResource({ uri })).rejects.toMatchObject({
      code: -32002,
      message: expect.stringContaining('Resource not found'),
      data: { uri },
    });
  });

  it('canonicalizes classical and extended Strong\'s resources and rejects invalid domain numbers', async () => {
    const root = makeMockRoot();
    const lookup = vi.fn(root.services.strongsService.lookup);
    root.services.strongsService.lookup = lookup;
    const client = await connect(createTheologAiMcpServer(root, '1.0.0-test').server);

    await client.readResource({ uri: 'theologai://strongs/g02385i' });
    expect(lookup).toHaveBeenCalledWith('G2385I', true);

    for (const identity of ['G6000', 'H9001', 'H9049', 'G21502']) {
      await client.readResource({ uri: `theologai://strongs/${identity}` });
      expect(lookup).toHaveBeenCalledWith(identity, true);
    }

    for (const uri of ['theologai://strongs/G0', 'theologai://strongs/G100000', 'theologai://strongs/H999999']) {
      await expect(client.readResource({ uri })).rejects.toMatchObject({ code: -32002, data: { uri } });
    }
    expect(lookup).toHaveBeenCalledTimes(5);
  });

  it('serves a source-grounded lexicon-only STEPBible resource', async () => {
    const source = JSON.parse(readFileSync(new URL('../../../data/biblical-languages/stepbible-lexicons/tbesh-hebrew.json', import.meta.url), 'utf8')) as Record<string, Record<string, unknown>>;
    const root = makeMockRoot();
    root.services.strongsService = new StrongsService({
      lookup: async () => undefined,
      getLexiconEntry: async identity => ({ strongs_number: identity, source: 'STEPBible', extended_data: source[identity] }),
      search: async () => [],
      getStats: async () => ({ greek: 0, hebrew: 0, total: 0 }),
    });
    const client = await connect(createTheologAiMcpServer(root, '1.0.0-test').server);
    const result = await client.readResource({ uri: 'theologai://strongs/H9001' });
    expect(result.contents[0]).toMatchObject({
      uri: 'theologai://strongs/H9001',
      text: expect.stringContaining('# H9001 — /וַ'),
    });
    expect(String(result.contents[0].text)).toContain('Verbal vav');
    expect(String(result.contents[0].text)).toContain('Not classified (source-language lexicon identity)');
  });

  it.each([
    ['document', 'theologai://documents/nicene-creed'],
    ['strongs', 'theologai://strongs/G26'],
  ])('does not disclose unexpected %s resource errors', async (kind, uri) => {
    const root = makeMockRoot();
    if (kind === 'document') {
      root.services.historicalService.getDocument = vi.fn().mockRejectedValue(
        new Error('secret database detail'),
      );
    } else {
      root.services.strongsService.lookup = vi.fn().mockRejectedValue(
        new Error('secret provider detail'),
      );
    }
    const client = await connect(createTheologAiMcpServer(root, '1.0.0-test').server);

    await expect(client.readResource({ uri })).rejects.toMatchObject({
      code: -32603,
      message: expect.stringContaining('Unable to read resource'),
    });
  });

  it('lists all 5 prompts and renders guided workflows', async () => {
    const client = await connect(createTheologAiMcpServer(makeMockRoot(), '1.0.0-test').server);
    const prompts = await client.listPrompts();

    expect(prompts.prompts.map(prompt => prompt.name)).toEqual([
      'word-study',
      'passage-exegesis',
      'compare-translations',
      'confession-study',
      'donate',
    ]);

    const wordStudy = await client.getPrompt({ name: 'word-study', arguments: { word: 'G26' } });
    expect(wordStudy.messages[0].content).toEqual(expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('G26'),
    }));
    expect(wordStudy.messages[0].content).toEqual(expect.objectContaining({
      text: expect.stringContaining('mode`, `entries`, `detailLevel`, and `provenanceIds`'),
    }));
    expect(wordStudy.messages[0].content).toEqual(expect.objectContaining({
      text: expect.stringContaining('Do not treat one English gloss as exhausting'),
    }));

    const passageExegesis = await client.getPrompt({
      name: 'passage-exegesis',
      arguments: { reference: 'John 3:16' },
    });
    expect(passageExegesis.messages[0].content).toEqual(expect.objectContaining({
      text: expect.stringContaining('`passages[]` and retain each translation'),
    }));
    expect(passageExegesis.messages[0].content).toEqual(expect.objectContaining({
      text: expect.stringContaining('distinguish an unavailable translation'),
    }));

    const compareTranslations = await client.getPrompt({
      name: 'compare-translations',
      arguments: { reference: 'John 3:16' },
    });
    expect(compareTranslations.messages[0].content).toEqual(expect.objectContaining({
      text: expect.stringContaining('compare by its `translation`, report every `failures[]` item'),
    }));

    const searchedWord = await client.getPrompt({ name: 'word-study', arguments: { word: 'love' } });
    expect(searchedWord.messages[0].content).toEqual(expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('{"query":"love","limit":10}'),
    }));

    const donate = await client.getPrompt({ name: 'donate' });
    expect(donate.messages[0].content).toEqual(expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('theologai.pages.dev'),
    }));
  });

  it('uses InvalidParams for unknown prompts and missing prompt arguments', async () => {
    const client = await connect(createTheologAiMcpServer(makeMockRoot(), '1.0.0-test').server);

    await expect(client.getPrompt({ name: 'unknown-prompt' })).rejects.toMatchObject({
      code: -32602,
      message: expect.stringContaining('Unknown prompt: unknown-prompt'),
    });
    await expect(client.getPrompt({ name: 'word-study' })).rejects.toMatchObject({
      code: -32602,
      message: expect.stringContaining('Missing required argument "word" for prompt "word-study"'),
    });
    await expect(client.getPrompt({ name: 'word-study', arguments: { word: 'a' } })).rejects.toMatchObject({
      code: -32602,
      message: expect.stringContaining('between 2 and 100 characters'),
    });
  });

  it('keeps tool/resource/prompt registrations identical while profiling logging by transport', async () => {
    const shared = await registrationSnapshot(
      createTheologAiMcpServer(makeMockRoot(), 'parity-test').server,
    );
    const worker = await registrationSnapshot(
      createWorkerMcpServer(makeMockRoot() as WorkerCompositionRoot, 'parity-test').server,
    );
    const node = await registrationSnapshot(
      new BibleMCPServer(makeMockRoot(), 'parity-test').getServer(),
    );

    expect(worker.capabilities).toEqual({ tools: {}, resources: {}, prompts: {} });
    expect(shared.capabilities).toEqual({ tools: {}, resources: {}, prompts: {}, logging: {} });
    expect({ ...worker, capabilities: shared.capabilities }).toEqual(shared);
    expect(node).toEqual(shared);
  });
});
