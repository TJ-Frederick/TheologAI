import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSimpleD1 } from '../../../helpers/mockD1.js';

const primarySourceMocks = vi.hoisted(() => ({
  search: vi.fn().mockResolvedValue({
    provider: 'ccel_live', status: 'no_results', searched: true, page: 1,
    hitCount: 0, hits: [], notices: [],
  }),
}));

// Mock all HTTP adapters and external services to avoid network calls
vi.mock('../../../../src/adapters/bible/EsvAdapter.js', () => ({
  EsvAdapter: vi.fn().mockImplementation(function (apiKey?: string) {
    return {
      supportedTranslations: ['ESV'],
      getPassage: vi.fn().mockResolvedValue({
        reference: 'John 3:16',
        translation: 'ESV',
        text: 'For God so loved the world.',
        citation: { source: 'ESV test adapter' },
      }),
      isConfigured: vi.fn().mockReturnValue(Boolean(apiKey)),
      getCopyright: vi.fn().mockReturnValue('ESV'),
    };
  }),
}));

vi.mock('../../../../src/adapters/bible/NetBibleAdapter.js', () => ({
  NetBibleAdapter: vi.fn().mockImplementation(function () {
    return {
      supportedTranslations: ['NET'],
      getPassage: vi.fn(),
      isConfigured: vi.fn().mockReturnValue(true),
      getCopyright: vi.fn().mockReturnValue('NET'),
    };
  }),
}));

vi.mock('../../../../src/adapters/bible/HelloAoAdapter.js', () => ({
  HelloAoAdapter: vi.fn().mockImplementation(function () {
    return {
      supportedTranslations: ['KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY'],
      getPassage: vi.fn(),
      isConfigured: vi.fn().mockReturnValue(true),
      getCopyright: vi.fn().mockReturnValue('Public Domain'),
    };
  }),
}));

vi.mock('../../../../src/adapters/commentary/HelloAoCommentaryAdapter.js', () => ({
  HelloAoCommentaryAdapter: vi.fn().mockImplementation(function () {
    return {
      getCommentary: vi.fn(),
    };
  }),
}));

vi.mock('../../../../src/adapters/commentary/CcelSearchAdapter.js', () => ({
  CcelSearchAdapter: vi.fn().mockImplementation(function () {
    return { search: primarySourceMocks.search };
  }),
}));

// Mock the JSON import
vi.mock('../../../../src/data/parallel-passages.json', () => ({
  default: { description: 'test fixture', version: '1', parallels: {} },
}));

import type { Env } from '../../../../src/worker-env.js';

const EXPECTED_TOOL_NAMES = [
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
];

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    THEOLOGAI_DB: createSimpleD1() as any,
    THEOLOGAI_VERSION: '1.0.0-test',
    ESV_API_KEY: 'test-key',
    ...overrides,
  };
}

describe('createWorkerCompositionRoot', () => {
  let createWorkerCompositionRoot: typeof import('../../../../src/tools/worker/index.js').createWorkerCompositionRoot;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../../../../src/tools/worker/index.js');
    createWorkerCompositionRoot = mod.createWorkerCompositionRoot;
  });

  describe('tool creation', () => {
    it('creates exactly 11 tools', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      expect(root.tools).toHaveLength(11);
    });

    it('creates tools with correct names', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      const names = root.tools.map(t => t.name);
      expect(names).toEqual(EXPECTED_TOOL_NAMES);
    });

    it('every tool has name, description, inputSchema, and handler', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      for (const tool of root.tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.handler).toBeTypeOf('function');
      }
    });

    it('every advertised tool schema rejects unknown arguments', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      for (const tool of root.tools) {
        expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
      }
    });

    it('every tool has readOnlyHint annotation', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      for (const tool of root.tools) {
        expect(tool.annotations).toMatchObject({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          ...(tool.name === 'primary_source_search' ? { openWorldHint: false } : {}),
        });
      }
    });
  });

  describe('primary-source public provider contract', () => {
    it('keeps the production-default contract at v4 with CCEL unadvertised', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      expect(root.primarySourceContract).toEqual({
        exposeCcelDiscovery: false,
        ccelLiveSearch: false,
        ccelCoordinator: false,
        contractVersion: '4',
        liveCcelEnabled: false,
      });
      const tool = root.tools.find(candidate => candidate.name === 'primary_source_search')!;
      const item = (tool.inputSchema.properties?.queries as any).items;
      expect(item.properties.providers).toMatchObject({ maxItems: 1, items: { enum: ['local'] } });
      expect(item.properties.author.description).toContain('separate query-plan items');
      expect(item.properties.page.description).toContain('only page 1');
    });

    it('exposes preview v5 while adapter and Durable Object lookup remain unreachable at 100', async () => {
      const getByName = vi.fn();
      const root = createWorkerCompositionRoot(makeEnv({
        THEOLOGAI_EXPOSE_CCEL_DISCOVERY: 'true',
        THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: 'false',
        THEOLOGAI_ENABLE_CCEL_COORDINATOR: 'false',
        THEOLOGAI_CCEL_COORDINATOR: { getByName } as any,
      }));
      expect(root.primarySourceContract).toMatchObject({ contractVersion: '5', liveCcelEnabled: false });
      const tool = root.tools.find(candidate => candidate.name === 'primary_source_search')!;
      expect(tool.outputSchema?.properties?.schemaVersion).toEqual({ const: '5' });
      expect(tool.annotations?.openWorldHint).toBe(true);
      await tool.handler({ queries: [{ id: 'remote', text: 'grace', providers: ['ccel'] }] });
      // Fetch is owned by the adapter. Proving the adapter and namespace lookup
      // are untouched also proves no upstream fetch can begin in this state.
      expect(primarySourceMocks.search).not.toHaveBeenCalled();
      expect(getByName).not.toHaveBeenCalled();
    });

    it('does not expose the live adapter even when its future rollout flag is true', async () => {
      const root = createWorkerCompositionRoot(makeEnv({ THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: 'true' }));
      const tool = root.tools.find(candidate => candidate.name === 'primary_source_search')!;
      await tool.handler({ queries: [{ id: 'local', text: 'grace', providers: ['local'] }] });
      expect(primarySourceMocks.search).not.toHaveBeenCalled();
    });

    it.each([
      [false, false, false], [false, false, true], [false, true, false], [false, true, true],
      [true, false, false], [true, false, true], [true, true, false],
    ])('keeps CCEL unreachable unless all three gates are true (%s,%s,%s)', async (exposure, live, coordinator) => {
      const getByName = vi.fn();
      const root = createWorkerCompositionRoot(makeEnv({
        THEOLOGAI_EXPOSE_CCEL_DISCOVERY: exposure ? 'true' : 'false',
        THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: live ? 'true' : 'false',
        THEOLOGAI_ENABLE_CCEL_COORDINATOR: coordinator ? 'true' : 'false',
        THEOLOGAI_CCEL_COORDINATOR: { getByName } as any,
      }));
      const tool = root.tools.find(candidate => candidate.name === 'primary_source_search')!;
      await tool.handler({ queries: [{ id: 'remote', text: 'grace', providers: ['ccel'] }] });
      expect(primarySourceMocks.search).not.toHaveBeenCalled();
      expect(getByName).not.toHaveBeenCalled();
    });

    it('passes the coordinator to the shared adapter only for the 111 gate state', async () => {
      const getByName = vi.fn();
      const root = createWorkerCompositionRoot(makeEnv({
        THEOLOGAI_EXPOSE_CCEL_DISCOVERY: 'true',
        THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: 'true',
        THEOLOGAI_ENABLE_CCEL_COORDINATOR: 'true',
        THEOLOGAI_CCEL_COORDINATOR: { getByName } as any,
      }));
      const tool = root.tools.find(candidate => candidate.name === 'primary_source_search')!;
      await tool.handler({ queries: [{ id: 'remote', text: 'grace', providers: ['ccel'] }] });
      expect(primarySourceMocks.search).toHaveBeenCalledOnce();
      expect(primarySourceMocks.search.mock.calls[0]?.[1]).toBeDefined();
      // The adapter mock does not invoke the coordinator, proving composition
      // itself never instantiates the named object.
      expect(getByName).not.toHaveBeenCalled();
    });

    it.each([
      { startYear: 500 },
      { endYear: 1500 },
      { startYear: 500, endYear: 1500 },
    ])('rejects direct date-filtered CCEL input before Worker adapter or coordinator admission (%o)', async dateBounds => {
      const getByName = vi.fn();
      const root = createWorkerCompositionRoot(makeEnv({
        THEOLOGAI_EXPOSE_CCEL_DISCOVERY: 'true',
        THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: 'true',
        THEOLOGAI_ENABLE_CCEL_COORDINATOR: 'true',
        THEOLOGAI_CCEL_COORDINATOR: { getByName } as any,
      }));
      const tool = root.tools.find(candidate => candidate.name === 'primary_source_search')!;

      const result = await tool.handler({
        queries: [{ id: 'remote', text: 'grace', providers: ['ccel'], ...dateBounds }],
      });

      expect(result.structuredContent).toMatchObject({
        queries: [{ providers: [{ provider: 'ccel_live', status: 'unsupported_filter', searched: false }] }],
      });
      expect(JSON.stringify(result)).not.toContain('CCEL discovery was not composition-date filtered');
      expect(primarySourceMocks.search).not.toHaveBeenCalled();
      expect(getByName).not.toHaveBeenCalled();
    });
  });

  describe('service exposure', () => {
    it('exposes bibleService on services', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      expect(root.services.bibleService).toBeDefined();
    });

    it('keeps all eight translation routes, including ESV, in the Worker composition root', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      expect(root.services.bibleService.getSupportedTranslations().sort()).toEqual([
        'ASV', 'BSB', 'DBY', 'ESV', 'KJV', 'NET', 'WEB', 'YLT',
      ]);
    });

    it('exposes commentaryService on services', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      expect(root.services.commentaryService).toBeDefined();
    });

    it('exposes historicalService on services', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      expect(root.services.historicalService).toBeDefined();
    });

    it('exposes strongsService on services', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      expect(root.services.strongsService).toBeDefined();
    });

    it('exposes the internal D1-backed source-attested parallel service with the eleven-tool registry', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      expect(root.services.sourceAttestedParallelService).toBeDefined();
      expect(root.tools).toHaveLength(11);
    });
  });

  describe('per-request vs cached singletons', () => {
    it('creates fresh tool arrays per call', () => {
      const env = makeEnv();
      const root1 = createWorkerCompositionRoot(env);
      const root2 = createWorkerCompositionRoot(env);
      expect(root1.tools).not.toBe(root2.tools);
    });

    it('caches BibleService across calls (lazy singleton)', () => {
      const env = makeEnv();
      const root1 = createWorkerCompositionRoot(env);
      const root2 = createWorkerCompositionRoot(env);
      expect(root1.services.bibleService).toBe(root2.services.bibleService);
    });

    it('rebuilds BibleService when ESV changes from unconfigured to configured', async () => {
      const secretlessRoot = createWorkerCompositionRoot(makeEnv({ ESV_API_KEY: undefined }));
      await expect(secretlessRoot.services.bibleService.lookup({
        reference: 'John 3:16',
        translation: 'ESV',
      })).rejects.toThrow('ESV adapter is not configured');

      const configuredRoot = createWorkerCompositionRoot(makeEnv({ ESV_API_KEY: 'test-key' }));
      await expect(configuredRoot.services.bibleService.lookup({
        reference: 'John 3:16',
        translation: 'ESV',
      })).resolves.toMatchObject({ translation: 'ESV', reference: 'John 3:16' });
      expect(configuredRoot.services.bibleService).not.toBe(secretlessRoot.services.bibleService);
    });

    it('rebuilds BibleService when ESV changes from configured to unconfigured', async () => {
      const configuredRoot = createWorkerCompositionRoot(makeEnv({ ESV_API_KEY: 'test-key' }));
      await expect(configuredRoot.services.bibleService.lookup({
        reference: 'John 3:16',
        translation: 'ESV',
      })).resolves.toMatchObject({ translation: 'ESV' });

      const secretlessRoot = createWorkerCompositionRoot(makeEnv({ ESV_API_KEY: undefined }));
      await expect(secretlessRoot.services.bibleService.lookup({
        reference: 'John 3:16',
        translation: 'ESV',
      })).rejects.toThrow('ESV adapter is not configured');
      expect(secretlessRoot.services.bibleService).not.toBe(configuredRoot.services.bibleService);
    });

    it('caches commentaryService at module scope (singleton)', () => {
      const env = makeEnv();
      const root1 = createWorkerCompositionRoot(env);
      const root2 = createWorkerCompositionRoot(env);
      expect(root1.services.commentaryService).toBe(root2.services.commentaryService);
    });
  });
});
