import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRoot, mockServer, mockHandleMcp, mockCreateRoot, mockCreateServer } = vi.hoisted(() => {
  const mockRoot = { tools: [], services: {} };
  const mockServer = { connect: vi.fn() };
  const mockHandleMcp = vi.fn().mockResolvedValue({ response: new Response('ok') });
  const mockCreateRoot = vi.fn().mockReturnValue(mockRoot);
  const mockCreateServer = vi.fn().mockReturnValue(mockServer);
  return { mockRoot, mockServer, mockHandleMcp, mockCreateRoot, mockCreateServer };
});

vi.mock('../../../src/tools/worker/index.js', () => ({
  createWorkerCompositionRoot: mockCreateRoot,
}));

vi.mock('../../../src/worker-server.js', () => ({
  createWorkerMcpServer: mockCreateServer,
}));

vi.mock('../../../src/http/worker/mcpHandler.js', () => ({
  handleWorkerMcpRequest: mockHandleMcp,
  createInternalMcpErrorResponse: () => new Response(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32603, message: 'Internal server error' },
    id: null,
  }), {
    status: 500,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  }),
}));

import worker from '../../../src/worker.js';

function makeEnv() {
  return {
    THEOLOGAI_DB: {} as D1Database,
    THEOLOGAI_RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success: true }),
    },
    ESV_API_KEY: 'test-key',
    THEOLOGAI_VERSION: '1.0.0-test',
    THEOLOGAI_REQUEST_LOGS: 'false',
    THEOLOGAI_ALLOWED_ORIGINS: 'https://theologai.pages.dev',
    THEOLOGAI_MAX_REQUEST_BYTES: String(1024 * 1024),
  };
}

function makeRequest(path = '/mcp', method = 'POST', headers?: HeadersInit, body?: BodyInit) {
  const init: RequestInit & { duplex?: 'half' } = { method, headers, body };
  if (body instanceof ReadableStream) init.duplex = 'half';
  return new Request(`https://example.com${path}`, init);
}

function makeCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

describe('Worker Entry Point', () => {
  let env: ReturnType<typeof makeEnv>;
  let ctx: ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleMcp.mockResolvedValue({ response: new Response('ok') });
    env = makeEnv();
    ctx = makeCtx();
  });

  it('creates a fresh composition root and MCP server for an accepted request', async () => {
    const request = makeRequest();
    await worker.fetch(request, env as never, ctx);

    expect(mockCreateRoot).toHaveBeenCalledWith(env);
    expect(mockCreateServer).toHaveBeenCalledWith(mockRoot, '1.0.0-test');
    expect(mockHandleMcp).toHaveBeenCalledWith(mockServer, request);
  });

  it('allows native clients without emitting an allow-origin header', async () => {
    const response = await worker.fetch(makeRequest(), env as never, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('echoes an exact configured browser origin', async () => {
    env.THEOLOGAI_ALLOWED_ORIGINS = 'https://one.example, https://two.example';
    const response = await worker.fetch(
      makeRequest('/mcp', 'POST', { Origin: 'https://two.example' }),
      env as never,
      ctx,
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://two.example');
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('rejects an untrusted origin before constructing MCP dependencies', async () => {
    env.THEOLOGAI_REQUEST_LOGS = 'true';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const response = await worker.fetch(
      makeRequest('/mcp', 'POST', {
        Origin: 'https://evil.example/private-value',
        'Mcp-Protocol-Version': 'attacker-controlled-value',
      }),
      env as never,
      ctx,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(mockCreateRoot).not.toHaveBeenCalled();
    expect(env.THEOLOGAI_RATE_LIMITER.limit).not.toHaveBeenCalled();
    const serialized = JSON.stringify(logSpy.mock.calls);
    expect(serialized).not.toContain('evil.example');
    expect(serialized).not.toContain('attacker-controlled-value');
    const events = logSpy.mock.calls.map(call => JSON.parse(call[0] as string));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ hasOrigin: true, hasMcpProtocolVersion: true }),
    ]));
  });

  it('answers trusted preflight before rate limiting or MCP construction', async () => {
    const response = await worker.fetch(
      makeRequest('/mcp', 'OPTIONS', { Origin: 'https://theologai.pages.dev' }),
      env as never,
      ctx,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(env.THEOLOGAI_RATE_LIMITER.limit).not.toHaveBeenCalled();
    expect(mockCreateRoot).not.toHaveBeenCalled();
  });

  it.each([
    ['/favicon.ico', 'GET', 404, 'Not found'],
    ['/mcp', 'PUT', 405, 'Method not allowed'],
    ['/mcp', 'GET', 405, 'Method not allowed'],
    ['/mcp', 'DELETE', 405, 'Method not allowed'],
  ])('guards %s %s', async (path, method, status, body) => {
    const response = await worker.fetch(makeRequest(path, method), env as never, ctx);
    expect(response.status).toBe(status);
    await expect(response.text()).resolves.toBe(body);
    expect(mockCreateRoot).not.toHaveBeenCalled();
  });

  it('accepts the root alias and emits deprecation telemetry when enabled', async () => {
    env.THEOLOGAI_REQUEST_LOGS = 'true';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await worker.fetch(makeRequest('/', 'POST'), env as never, ctx);
      expect(mockHandleMcp).toHaveBeenCalledOnce();
      expect(logSpy.mock.calls.map(call => JSON.parse(call[0] as string))).toContainEqual(
        expect.objectContaining({
          event: 'theologai.worker.route.deprecated',
          path: '/',
          canonicalPath: '/mcp',
        }),
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it('uses a stable hashed IP and user-agent fingerprint', async () => {
    const headers = { 'CF-Connecting-IP': '203.0.113.10', 'User-Agent': 'test-client/1.0' };
    await worker.fetch(makeRequest('/mcp', 'POST', headers), env as never, ctx);
    await worker.fetch(makeRequest('/mcp', 'POST', headers), env as never, ctx);
    const [first, second] = env.THEOLOGAI_RATE_LIMITER.limit.mock.calls.map(call => call[0].key);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain('203.0.113.10');
    expect(first).not.toContain('test-client/1.0');
  });

  it('changes the fingerprint when either component changes', async () => {
    for (const headers of [
      { 'CF-Connecting-IP': '203.0.113.10', 'User-Agent': 'client/1' },
      { 'CF-Connecting-IP': '203.0.113.11', 'User-Agent': 'client/1' },
      { 'CF-Connecting-IP': '203.0.113.10', 'User-Agent': 'client/2' },
    ]) {
      await worker.fetch(makeRequest('/mcp', 'POST', headers), env as never, ctx);
    }
    const keys = env.THEOLOGAI_RATE_LIMITER.limit.mock.calls.map(call => call[0].key);
    expect(new Set(keys).size).toBe(3);
  });

  it('returns a CORS-safe, non-cacheable 429 before reading the body', async () => {
    env.THEOLOGAI_RATE_LIMITER.limit.mockResolvedValueOnce({ success: false });
    const request = makeRequest('/mcp', 'POST', {
      Origin: 'https://theologai.pages.dev',
      'CF-Connecting-IP': '203.0.113.10',
      'User-Agent': 'client/1',
    }, new ReadableStream<Uint8Array>());
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const response = await worker.fetch(request, env as never, ctx);
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('60');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://theologai.pages.dev');
      expect(request.bodyUsed).toBe(false);
      expect(mockCreateRoot).not.toHaveBeenCalled();
    } finally {
      warningSpy.mockRestore();
    }
  });

  it('emits 429 telemetry without raw identity or fingerprint', async () => {
    env.THEOLOGAI_RATE_LIMITER.limit.mockResolvedValueOnce({ success: false });
    const clientIp = '203.0.113.10';
    const userAgent = 'private-client/1';
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await worker.fetch(makeRequest('/mcp', 'POST', {
        'CF-Connecting-IP': clientIp,
        'User-Agent': userAgent,
        'CF-Ray': 'test-ray',
      }), env as never, ctx);
      const event = JSON.parse(warningSpy.mock.calls[0][0] as string);
      expect(event).toMatchObject({
        event: 'theologai.worker.rate_limit.rejected',
        status: 429,
        limit: 120,
        periodSeconds: 60,
        scope: 'hashed_ip_user_agent_per_colo',
      });
      const serialized = warningSpy.mock.calls.join('\n');
      expect(serialized).not.toContain(clientIp);
      expect(serialized).not.toContain(userAgent);
      expect(serialized).not.toContain(env.THEOLOGAI_RATE_LIMITER.limit.mock.calls[0][0].key);
    } finally {
      warningSpy.mockRestore();
    }
  });

  it('fails open with sanitized telemetry when the rate-limit binding fails', async () => {
    env.THEOLOGAI_RATE_LIMITER.limit.mockRejectedValueOnce(new Error('private binding detail'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await worker.fetch(makeRequest(), env as never, ctx);
      expect(response.status).toBe(200);
      expect(errorSpy).toHaveBeenCalledOnce();
      expect(JSON.parse(errorSpy.mock.calls[0][0] as string)).toMatchObject({
        event: 'theologai.worker.rate_limit.failure',
        policy: 'fail_open',
        errorName: 'Error',
      });
      expect(errorSpy.mock.calls.join('\n')).not.toContain('private binding detail');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('rejects a declared oversized body before constructing MCP dependencies', async () => {
    const response = await worker.fetch(
      makeRequest('/mcp', 'POST', { 'Content-Length': String(1024 * 1024 + 1) }),
      env as never,
      ctx,
    );
    expect(response.status).toBe(413);
    expect(mockCreateRoot).not.toHaveBeenCalled();
  });

  it('rejects an oversized streamed body', async () => {
    env.THEOLOGAI_MAX_REQUEST_BYTES = '8';
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('12345'));
        controller.enqueue(new TextEncoder().encode('67890'));
        controller.close();
      },
    });
    const response = await worker.fetch(makeRequest('/mcp', 'POST', undefined, body), env as never, ctx);
    expect(response.status).toBe(413);
    expect(mockCreateRoot).not.toHaveBeenCalled();
  });

  it('forwards an in-limit buffered stream', async () => {
    env.THEOLOGAI_MAX_REQUEST_BYTES = '16';
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"ok":true}'));
        controller.close();
      },
    });
    await worker.fetch(makeRequest('/mcp', 'POST', undefined, body), env as never, ctx);
    const forwarded = mockHandleMcp.mock.calls[0][1] as Request;
    await expect(forwarded.text()).resolves.toBe('{"ok":true}');
  });

  it('logs only allowlisted request metadata when enabled', async () => {
    env.THEOLOGAI_REQUEST_LOGS = 'true';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await worker.fetch(makeRequest('/mcp?token=query-secret', 'POST', {
        'User-Agent': 'private-client/1',
        Origin: 'https://theologai.pages.dev',
        'CF-Connecting-IP': '203.0.113.10',
        'CF-Ray': 'test-ray',
        'Mcp-Session-Id': 'session-secret',
        Authorization: 'Bearer auth-secret',
      }), env as never, ctx);
      const serialized = logSpy.mock.calls.join('\n');
      expect(serialized).not.toContain('query-secret');
      expect(serialized).not.toContain('private-client/1');
      expect(serialized).not.toContain('203.0.113.10');
      expect(serialized).not.toContain('session-secret');
      expect(serialized).not.toContain('auth-secret');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('returns the safe handler response and logs only its error class', async () => {
    mockHandleMcp.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 }),
      errorName: 'PrivateFailure',
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await worker.fetch(makeRequest(), env as never, ctx);
      expect(response.status).toBe(500);
      expect(errorSpy.mock.calls.map(call => JSON.parse(call[0] as string))).toContainEqual(
        expect.objectContaining({
          event: 'theologai.worker.request.error',
          status: 500,
          errorName: 'PrivateFailure',
        }),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('sanitizes an unexpected pre-transport failure with exact-origin CORS', async () => {
    const secret = 'private-composition-failure';
    mockCreateRoot.mockImplementationOnce(() => { throw new Error(secret); });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await worker.fetch(makeRequest('/mcp', 'POST', {
        Origin: 'https://theologai.pages.dev',
      }), env as never, ctx);
      expect(response.status).toBe(500);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://theologai.pages.dev');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
      expect(errorSpy.mock.calls.join('\n')).not.toContain(secret);
      expect(JSON.parse(errorSpy.mock.calls[0][0] as string)).toMatchObject({
        event: 'theologai.worker.request.error',
        errorName: 'Error',
      });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
