import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkerCompositionRoot, WorkerServices } from '../../../src/tools/worker/index.js';
import type { ToolHandler, ToolResult } from '../../../src/kernel/types.js';

// ── Capture handlers by mocking the Server class ──

type HandlerFn = (request: any) => Promise<any>;
let capturedHandlers: Map<string, HandlerFn>;
let capturedServerInfo: { name: string; version: string } | null;
let capturedCapabilities: Record<string, any> | null;

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation((info: any, opts: any) => {
    capturedServerInfo = info;
    capturedCapabilities = opts?.capabilities ?? null;
    return {
      setRequestHandler: vi.fn().mockImplementation((schema: any, handler: HandlerFn) => {
        const method = schema?.def?.shape?.method?.def?.values?.[0] ?? 'unknown';
        capturedHandlers.set(method, handler);
      }),
    };
  }),
}));

// Import after mock
import { createWorkerMcpServer } from '../../../src/worker-server.js';

// ── Mock helpers ──

function makeMockTool(name: string): ToolHandler {
  return {
    name,
    description: `Mock ${name} tool`,
    inputSchema: {
      type: 'object' as const,
      properties: { reference: { type: 'string' } },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: `Result from ${name}` }],
    } satisfies ToolResult),
  };
}

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

function makeMockRoot(): WorkerCompositionRoot {
  const tools = TOOL_NAMES.map(makeMockTool);

  const services: WorkerServices = {
    bibleService: {
      getSupportedTranslations: vi.fn().mockReturnValue(['ESV', 'KJV', 'NET']),
    } as any,
    commentaryService: {
      getAvailableCommentators: vi.fn().mockReturnValue(['Matthew Henry', 'John Gill']),
    } as any,
    historicalService: {
      listDocuments: vi.fn().mockResolvedValue([
        { id: 'nicene-creed', title: 'Nicene Creed', type: 'creed', date: '325', topics: ['trinity'] },
      ]),
      getDocument: vi.fn().mockResolvedValue({
        id: 'nicene-creed', title: 'Nicene Creed', type: 'creed', date: '325', topics: ['trinity'],
      }),
      getSections: vi.fn().mockResolvedValue([
        { id: 1, document_id: 'nicene-creed', section_number: '1', title: 'Article I', content: 'We believe...', topics: [] },
      ]),
    } as any,
    strongsService: {
      lookup: vi.fn().mockResolvedValue({
        strongs_number: 'G0026', lemma: 'ἀγάπη', transliteration: 'agapē',
        pronunciation: null, testament: 'NT', definition: 'love',
        derivation: null, extended: null,
        citation: { source: "Strong's Concordance" },
      }),
    } as any,
  };

  return { tools, services };
}

describe('createWorkerMcpServer', () => {
  let root: WorkerCompositionRoot;

  beforeEach(() => {
    capturedHandlers = new Map();
    capturedServerInfo = null;
    capturedCapabilities = null;
    root = makeMockRoot();
    createWorkerMcpServer(root, '1.0.0-test');
  });

  describe('server creation', () => {
    it('creates server with correct name and version', () => {
      expect(capturedServerInfo).toEqual({ name: 'theologai-bible-server', version: '1.0.0-test' });
    });

    it('enables all 4 capabilities', () => {
      expect(capturedCapabilities).toEqual({
        tools: {},
        resources: {},
        prompts: {},
        logging: {},
      });
    });

    it('registers handlers for all 7 MCP protocol methods', () => {
      expect(capturedHandlers.size).toBe(7);
      expect([...capturedHandlers.keys()]).toEqual(expect.arrayContaining([
        'tools/list', 'tools/call',
        'resources/list', 'resources/templates/list', 'resources/read',
        'prompts/list', 'prompts/get',
      ]));
    });
  });

  describe('ListTools handler', () => {
    it('returns all 9 tools', async () => {
      const handler = capturedHandlers.get('tools/list')!;
      const result = await handler({});
      expect(result.tools).toHaveLength(9);
    });

    it('each tool has name, description, inputSchema, annotations', async () => {
      const handler = capturedHandlers.get('tools/list')!;
      const result = await handler({});
      for (const tool of result.tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.annotations).toBeDefined();
      }
    });

    it('tool names match composition root tools', async () => {
      const handler = capturedHandlers.get('tools/list')!;
      const result = await handler({});
      const names = result.tools.map((t: any) => t.name);
      expect(names).toEqual(TOOL_NAMES);
    });
  });

  describe('CallTool handler', () => {
    it('dispatches to correct tool handler by name', async () => {
      const handler = capturedHandlers.get('tools/call')!;
      await handler({ params: { name: 'bible_lookup', arguments: { reference: 'John 3:16' } } });
      expect(root.tools[0].handler).toHaveBeenCalled();
    });

    it('passes arguments to tool handler', async () => {
      const handler = capturedHandlers.get('tools/call')!;
      await handler({ params: { name: 'bible_lookup', arguments: { reference: 'John 3:16' } } });
      expect(root.tools[0].handler).toHaveBeenCalledWith({ reference: 'John 3:16' });
    });

    it('throws error for unknown tool name', async () => {
      const handler = capturedHandlers.get('tools/call')!;
      await expect(handler({ params: { name: 'nonexistent', arguments: {} } }))
        .rejects.toThrow('Tool "nonexistent" not found');
    });
  });

  describe('ListResources handler', () => {
    it('includes theologai://translations resource', async () => {
      const handler = capturedHandlers.get('resources/list')!;
      const result = await handler({});
      const uris = result.resources.map((r: any) => r.uri);
      expect(uris).toContain('theologai://translations');
    });

    it('includes theologai://commentaries resource', async () => {
      const handler = capturedHandlers.get('resources/list')!;
      const result = await handler({});
      const uris = result.resources.map((r: any) => r.uri);
      expect(uris).toContain('theologai://commentaries');
    });

    it('includes dynamic historical document resources', async () => {
      const handler = capturedHandlers.get('resources/list')!;
      const result = await handler({});
      const uris = result.resources.map((r: any) => r.uri);
      expect(uris).toContain('theologai://documents/nicene-creed');
    });
  });

  describe('ListResourceTemplates handler', () => {
    it('returns 2 resource templates', async () => {
      const handler = capturedHandlers.get('resources/templates/list')!;
      const result = await handler({});
      expect(result.resourceTemplates).toHaveLength(2);
      const uriTemplates = result.resourceTemplates.map((t: any) => t.uriTemplate);
      expect(uriTemplates).toContain('theologai://documents/{slug}');
      expect(uriTemplates).toContain('theologai://strongs/{number}');
    });
  });

  describe('ReadResource handler', () => {
    it('handles theologai://translations URI', async () => {
      const handler = capturedHandlers.get('resources/read')!;
      const result = await handler({ params: { uri: 'theologai://translations' } });
      expect(result.contents[0].text).toContain('ESV');
      expect(result.contents[0].mimeType).toBe('text/markdown');
    });

    it('handles theologai://commentaries URI', async () => {
      const handler = capturedHandlers.get('resources/read')!;
      const result = await handler({ params: { uri: 'theologai://commentaries' } });
      expect(result.contents[0].text).toContain('Matthew Henry');
    });

    it('throws error for unknown URI', async () => {
      const handler = capturedHandlers.get('resources/read')!;
      await expect(handler({ params: { uri: 'theologai://unknown' } }))
        .rejects.toThrow('Unknown resource URI');
    });
  });

  describe('prompts', () => {
    it('ListPrompts returns 5 prompts with correct names', async () => {
      const handler = capturedHandlers.get('prompts/list')!;
      const result = await handler({});
      expect(result.prompts).toHaveLength(5);
      const names = result.prompts.map((p: any) => p.name);
      expect(names).toContain('word-study');
      expect(names).toContain('passage-exegesis');
      expect(names).toContain('compare-translations');
      expect(names).toContain('confession-study');
      expect(names).toContain('donate');
    });

    it('GetPrompt returns messages for word-study', async () => {
      const handler = capturedHandlers.get('prompts/get')!;
      const result = await handler({ params: { name: 'word-study', arguments: { word: 'agape' } } });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.text).toContain('agape');
    });

    it('GetPrompt returns donation guide for donate', async () => {
      const handler = capturedHandlers.get('prompts/get')!;
      const result = await handler({ params: { name: 'donate', arguments: {} } });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.text).toContain('theologai.pages.dev');
      expect(result.messages[0].content.text).toContain('USDC on Base');
      expect(result.messages[0].content.text).toContain('0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04');
      expect(result.messages[0].content.text).toContain('donation_config');
    });

    it('GetPrompt throws for unknown prompt', async () => {
      const handler = capturedHandlers.get('prompts/get')!;
      await expect(handler({ params: { name: 'nonexistent', arguments: {} } }))
        .rejects.toThrow('Unknown prompt');
    });
  });
});
