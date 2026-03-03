import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSimpleD1 } from '../../../helpers/mockD1.js';

// Mock all HTTP adapters and external services to avoid network calls
vi.mock('../../../../src/adapters/bible/EsvAdapter.js', () => ({
  EsvAdapter: vi.fn().mockImplementation(() => ({
    supportedTranslations: ['ESV'],
    getPassage: vi.fn(),
    isConfigured: vi.fn().mockReturnValue(true),
    getCopyright: vi.fn().mockReturnValue('ESV'),
  })),
}));

vi.mock('../../../../src/adapters/bible/NetBibleAdapter.js', () => ({
  NetBibleAdapter: vi.fn().mockImplementation(() => ({
    supportedTranslations: ['NET'],
    getPassage: vi.fn(),
    isConfigured: vi.fn().mockReturnValue(true),
    getCopyright: vi.fn().mockReturnValue('NET'),
  })),
}));

vi.mock('../../../../src/adapters/bible/HelloAoAdapter.js', () => ({
  HelloAoAdapter: vi.fn().mockImplementation(() => ({
    supportedTranslations: ['KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY'],
    getPassage: vi.fn(),
    isConfigured: vi.fn().mockReturnValue(true),
    getCopyright: vi.fn().mockReturnValue('Public Domain'),
  })),
}));

vi.mock('../../../../src/adapters/commentary/HelloAoCommentaryAdapter.js', () => ({
  HelloAoCommentaryAdapter: vi.fn().mockImplementation(() => ({
    getCommentary: vi.fn(),
  })),
}));

vi.mock('../../../../src/adapters/commentary/CcelAdapter.js', () => ({
  CcelAdapter: vi.fn().mockImplementation(() => ({
    search: vi.fn(),
  })),
}));

// Mock the JSON import
vi.mock('../../../../src/data/parallel-passages.json', () => ({
  default: [],
}));

import type { Env } from '../../../../src/worker-env.js';

const EXPECTED_TOOL_NAMES = [
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
    vi.resetModules();
    const mod = await import('../../../../src/tools/worker/index.js');
    createWorkerCompositionRoot = mod.createWorkerCompositionRoot;
  });

  describe('tool creation', () => {
    it('creates exactly 9 tools', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      expect(root.tools).toHaveLength(9);
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

    it('every tool has readOnlyHint annotation', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      for (const tool of root.tools) {
        expect(tool.annotations).toEqual({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
        });
      }
    });
  });

  describe('service exposure', () => {
    it('exposes bibleService on services', () => {
      const root = createWorkerCompositionRoot(makeEnv());
      expect(root.services.bibleService).toBeDefined();
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

    it('caches commentaryService at module scope (singleton)', () => {
      const env = makeEnv();
      const root1 = createWorkerCompositionRoot(env);
      const root2 = createWorkerCompositionRoot(env);
      expect(root1.services.commentaryService).toBe(root2.services.commentaryService);
    });
  });
});
