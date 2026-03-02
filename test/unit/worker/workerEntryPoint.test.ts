import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock all dependencies ──
// vi.mock is hoisted — factory functions cannot reference top-level variables.
// Use vi.hoisted() to create mocks that are available inside vi.mock factories.

const { mockRoot, mockServer, mockHandlerFn, mockCreateMcpHandler, mockCreateRoot, mockCreateServer } = vi.hoisted(() => {
  const mockRoot = { tools: [], services: {} };
  const mockServer = { setRequestHandler: vi.fn() };
  const mockHandlerFn = vi.fn().mockResolvedValue(new Response('ok'));
  const mockCreateMcpHandler = vi.fn().mockReturnValue(mockHandlerFn);
  const mockCreateRoot = vi.fn().mockReturnValue(mockRoot);
  const mockCreateServer = vi.fn().mockReturnValue(mockServer);
  return { mockRoot, mockServer, mockHandlerFn, mockCreateMcpHandler, mockCreateRoot, mockCreateServer };
});

vi.mock('../../../src/tools/worker/index.js', () => ({
  createWorkerCompositionRoot: mockCreateRoot,
}));

vi.mock('../../../src/worker-server.js', () => ({
  createWorkerMcpServer: mockCreateServer,
}));

vi.mock('agents/mcp', () => ({
  createMcpHandler: mockCreateMcpHandler,
}));

// Import after mocks
import worker from '../../../src/worker.js';

// ── Test helpers ──

function makeEnv() {
  return {
    THEOLOGAI_DB: {} as any,
    ESV_API_KEY: 'test-key',
    THEOLOGAI_VERSION: '1.0.0-test',
  };
}

function makeRequest() {
  return new Request('https://example.com/mcp', { method: 'POST' });
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as any;
}

describe('Worker Entry Point (fetch handler)', () => {
  let env: ReturnType<typeof makeEnv>;
  let request: Request;
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    vi.clearAllMocks();
    env = makeEnv();
    request = makeRequest();
    ctx = makeCtx();
  });

  describe('per-request creation', () => {
    it('calls createWorkerCompositionRoot with env', async () => {
      await worker.fetch(request, env, ctx);
      expect(mockCreateRoot).toHaveBeenCalledWith(env);
    });

    it('calls createWorkerMcpServer with root and version', async () => {
      await worker.fetch(request, env, ctx);
      expect(mockCreateServer).toHaveBeenCalledWith(mockRoot, '1.0.0-test');
    });

    it('calls createMcpHandler with server and corsOptions', async () => {
      await worker.fetch(request, env, ctx);
      expect(mockCreateMcpHandler).toHaveBeenCalledWith(mockServer, {
        corsOptions: expect.objectContaining({
          origin: '*',
        }),
      });
    });

    it('invokes returned handler with request, env, ctx', async () => {
      await worker.fetch(request, env, ctx);
      expect(mockHandlerFn).toHaveBeenCalledWith(request, env, ctx);
    });
  });

  describe('CORS configuration', () => {
    it('sets origin to wildcard', async () => {
      await worker.fetch(request, env, ctx);
      const corsOptions = mockCreateMcpHandler.mock.calls[0][1].corsOptions;
      expect(corsOptions.origin).toBe('*');
    });

    it('sets methods to GET, POST, DELETE, OPTIONS', async () => {
      await worker.fetch(request, env, ctx);
      const corsOptions = mockCreateMcpHandler.mock.calls[0][1].corsOptions;
      expect(corsOptions.methods).toBe('GET, POST, DELETE, OPTIONS');
    });

    it('sets headers including Mcp-Session-Id and Mcp-Protocol-Version', async () => {
      await worker.fetch(request, env, ctx);
      const corsOptions = mockCreateMcpHandler.mock.calls[0][1].corsOptions;
      expect(corsOptions.headers).toContain('Mcp-Session-Id');
      expect(corsOptions.headers).toContain('Mcp-Protocol-Version');
    });

    it('exposes Mcp-Session-Id header and sets maxAge to 86400', async () => {
      await worker.fetch(request, env, ctx);
      const corsOptions = mockCreateMcpHandler.mock.calls[0][1].corsOptions;
      expect(corsOptions.exposeHeaders).toBe('Mcp-Session-Id');
      expect(corsOptions.maxAge).toBe(86400);
    });
  });
});
