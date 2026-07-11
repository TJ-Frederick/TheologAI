import { Agent, request, type IncomingHttpHeaders } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BibleAdapter } from '../../../src/adapters/bible/BibleAdapter.js';
import {
  DEFAULT_ALLOWED_ORIGIN,
  DEFAULT_HTTP_HOST,
  DEFAULT_MAX_BODY_BYTES,
  readNodeHttpConfig,
  type NodeHttpConfig,
} from '../../../src/http/config.js';
import {
  createNodeHttpServer,
  type HttpTelemetryEvent,
  type NodeHttpRuntime,
} from '../../../src/http/nodeHttpServer.js';
import type { McpCompositionRoot } from '../../../src/mcp/server.js';
import { BibleMCPServer } from '../../../src/server.js';
import { BibleService } from '../../../src/services/bible/BibleService.js';
import { createBibleLookupHandler } from '../../../src/tools/v2/bibleLookup.js';

const TEST_MAX_BODY_BYTES = 1024;

describe('readNodeHttpConfig', () => {
  it('binds to loopback with the production web origin by default', () => {
    const config = readNodeHttpConfig({ PORT: '3000' });

    expect(config).toEqual({
      host: DEFAULT_HTTP_HOST,
      port: 3000,
      allowedHosts: ['127.0.0.1', 'localhost', '::1'],
      allowedOrigins: [DEFAULT_ALLOWED_ORIGIN],
      maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
    });
  });

  it('parses explicit bind, host, and exact origin allowlists', () => {
    const config = readNodeHttpConfig({
      PORT: '8080',
      HOST: '0.0.0.0',
      MCP_ALLOWED_HOSTS: 'api.internal, Example.COM.',
      MCP_ALLOWED_ORIGINS: 'https://app.example.com,http://localhost:5173',
      MCP_MAX_BODY_BYTES: '2048',
    });

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(8080);
    expect(config.allowedHosts).toEqual(['0.0.0.0', 'api.internal', 'example.com']);
    expect(config.allowedOrigins).toEqual([
      'https://app.example.com',
      'http://localhost:5173',
    ]);
    expect(config.maxBodyBytes).toBe(2048);
  });

  it('rejects invalid ports and non-origin URLs', () => {
    expect(() => readNodeHttpConfig({ PORT: '0' })).toThrow('Invalid PORT');
    expect(() => readNodeHttpConfig({ PORT: '70000' })).toThrow('Invalid PORT');
    expect(() => readNodeHttpConfig({
      PORT: '3000',
      MCP_ALLOWED_ORIGINS: 'https://app.example.com/path',
    })).toThrow('exact HTTP origins');
    expect(() => readNodeHttpConfig({
      PORT: '3000',
      MCP_MAX_BODY_BYTES: '0',
    })).toThrow('Invalid MCP_MAX_BODY_BYTES');
  });
});

describe('Node stateless HTTP MCP server', () => {
  let runtime: NodeHttpRuntime;
  let port: number;
  let telemetry: HttpTelemetryEvent[];
  let createdServers: BibleMCPServer[];

  beforeEach(async () => {
    telemetry = [];
    createdServers = [];
    const config: NodeHttpConfig = {
      host: '127.0.0.1',
      port: 0,
      allowedHosts: ['127.0.0.1', 'localhost'],
      allowedOrigins: [DEFAULT_ALLOWED_ORIGIN],
      maxBodyBytes: TEST_MAX_BODY_BYTES,
    };
    runtime = createNodeHttpServer({
      root: makeRoot(),
      config,
      telemetry: event => telemetry.push(event),
      createMcpServer: root => {
        const server = new BibleMCPServer(root, 'http-integration-test');
        createdServers.push(server);
        return server;
      },
    });
    port = (await runtime.listen()).port;
  });

  afterEach(async () => {
    await runtime.close();
  });

  it('isolates clients with a fresh stateless MCP server per request', async () => {
    const first = await sendHttp(port, { body: initializeRequest(1) });
    const second = await sendHttp(port, { body: initializeRequest(2) });

    expect(first.status, first.text).toBe(200);
    expect(second.status, second.text).toBe(200);
    expect(first.headers['mcp-session-id']).toBeUndefined();
    expect(second.headers['mcp-session-id']).toBeUndefined();
    expect(createdServers).toHaveLength(2);
    expect(createdServers[0]).not.toBe(createdServers[1]);
  });

  it('accepts sequential stateless clients over a reused HTTP connection', async () => {
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const errors: Error[] = [];
    runtime.server.on('clientError', error => errors.push(error));
    try {
      const first = await sendHttp(port, { body: initializeRequest(1), agent });
      const second = await sendHttp(port, { body: initializeRequest(2), agent });

      expect(first.status, first.text).toBe(200);
      expect(second.status, second.text).toBe(200);
      expect(errors).toEqual([]);
      expect(createdServers).toHaveLength(2);
    } finally {
      agent.destroy();
    }
  });

  it('allows requests without Origin and always varies on Origin', async () => {
    const response = await sendHttp(port, { body: initializeRequest(1) });

    expect(response.status).toBe(200);
    expect(response.headers.vary).toBe('Origin');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('echoes an exactly allowed Origin', async () => {
    const response = await sendHttp(port, {
      headers: { Origin: DEFAULT_ALLOWED_ORIGIN },
      body: initializeRequest(1),
    });

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(DEFAULT_ALLOWED_ORIGIN);
    expect(response.headers.vary).toBe('Origin');
  });

  it('rejects an unlisted Origin before creating an MCP server', async () => {
    const response = await sendHttp(port, {
      headers: { Origin: 'https://evil.example' },
      body: initializeRequest(1),
    });

    expect(response.status).toBe(403);
    expect(response.json).toEqual({ error: 'Forbidden origin' });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(createdServers).toHaveLength(0);
  });

  it('rejects an unlisted Host before creating an MCP server', async () => {
    const response = await sendHttp(port, {
      headers: { Host: 'evil.example' },
      body: initializeRequest(1),
    });

    expect(response.status).toBe(403);
    expect(response.json).toEqual({ error: 'Forbidden host' });
    expect(createdServers).toHaveLength(0);
  });

  it('temporarily serves / and emits structured deprecation telemetry', async () => {
    const response = await sendHttp(port, {
      path: '/',
      body: initializeRequest(1),
    });

    expect(response.status).toBe(200);
    expect(telemetry).toContainEqual(expect.objectContaining({
      event: 'http.route.deprecated',
      level: 'warning',
      method: 'POST',
      path: '/',
      canonicalPath: '/mcp',
    }));
  });

  it('returns a safe 404 route error', async () => {
    const missing = await sendHttp(port, { path: '/missing', body: initializeRequest(1) });

    expect(missing.status).toBe(404);
    expect(missing.json).toEqual({ error: 'Not found' });
    expect(createdServers).toHaveLength(0);
  });

  it.each(['GET', 'DELETE'])('returns 405 for stateless %s requests', async method => {
    const response = await sendHttp(port, { method });

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe('POST, OPTIONS');
    expect(response.json).toEqual({ error: 'Method not allowed' });
    expect(createdServers).toHaveLength(0);
  });

  it('rejects a declared oversized body before MCP dispatch', async () => {
    const response = await sendHttp(port, {
      headers: { 'Content-Length': String(TEST_MAX_BODY_BYTES + 1) },
      body: 'x'.repeat(TEST_MAX_BODY_BYTES + 1),
    });

    expect(response.status).toBe(413);
    expect(response.json).toEqual({ error: 'Request body too large' });
    expect(createdServers).toHaveLength(0);
  });

  it('rejects a chunked oversized body before MCP dispatch', async () => {
    const response = await sendHttp(port, {
      chunks: [
        'x'.repeat(Math.floor(TEST_MAX_BODY_BYTES / 2)),
        'x'.repeat(Math.floor(TEST_MAX_BODY_BYTES / 2) + 1),
      ],
    });

    expect(response.status).toBe(413);
    expect(response.json).toEqual({ error: 'Request body too large' });
    expect(createdServers).toHaveLength(0);
  });

  it('returns 400 for invalid JSON before MCP dispatch', async () => {
    const response = await sendHttp(port, { body: '{not-json' });

    expect(response.status).toBe(400);
    expect(response.json).toEqual({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
      id: null,
    });
    expect(createdServers).toHaveLength(0);
  });

  it('answers allowed preflight requests without MCP dispatch', async () => {
    const response = await sendHttp(port, {
      method: 'OPTIONS',
      headers: { Origin: DEFAULT_ALLOWED_ORIGIN },
    });

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(DEFAULT_ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-methods']).toBe('POST, OPTIONS');
    expect(createdServers).toHaveLength(0);
  });

  it('returns a generic MCP error and sanitized telemetry when dispatch setup fails', async () => {
    await runtime.close();
    const privateDetail = 'rpc-key=secret&sql=SELECT-private';
    telemetry = [];
    runtime = createNodeHttpServer({
      root: makeRoot(),
      config: {
        host: '127.0.0.1',
        port: 0,
        allowedHosts: ['127.0.0.1', 'localhost'],
        allowedOrigins: [DEFAULT_ALLOWED_ORIGIN],
        maxBodyBytes: TEST_MAX_BODY_BYTES,
      },
      telemetry: event => telemetry.push(event),
      createMcpServer: () => ({
        connect: vi.fn().mockRejectedValue(new Error(privateDetail)),
        getServer: () => ({ close: vi.fn().mockResolvedValue(undefined) }),
      }) as never,
    });
    port = (await runtime.listen()).port;

    const response = await sendHttp(port, { body: initializeRequest(1) });
    expect(response.status).toBe(500);
    expect(response.json).toEqual({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal server error' },
      id: null,
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(telemetry).toContainEqual(expect.objectContaining({
      event: 'http.request.error',
      level: 'error',
      status: 500,
      errorName: 'Error',
    }));
    expect(JSON.stringify(telemetry)).not.toContain(privateDetail);
  });

  it('closes the listener gracefully and idempotently', async () => {
    await runtime.close();
    await runtime.close();

    expect(runtime.server.listening).toBe(false);
  });

  it('closes a partial pre-dispatch request during graceful shutdown', async () => {
    const slowRequest = request({
      host: '127.0.0.1',
      port,
      path: '/mcp',
      method: 'POST',
      agent: false,
      headers: { 'Content-Type': 'application/json' },
    });
    slowRequest.on('error', () => { /* Expected when shutdown closes the socket. */ });
    const connected = new Promise<void>(resolve => {
      slowRequest.once('socket', socket => socket.once('connect', resolve));
    });
    const closed = new Promise<void>(resolve => slowRequest.once('close', resolve));
    slowRequest.write('{');
    await connected;

    await runtime.close();
    await closed;

    expect(runtime.server.listening).toBe(false);
    expect(createdServers).toHaveLength(0);
  });
});

function makeRoot(): McpCompositionRoot {
  const adapter: BibleAdapter = {
    supportedTranslations: ['ESV'],
    getPassage: vi.fn(async () => ({
      reference: 'John 3:16',
      translation: 'ESV',
      text: 'For God so loved the world.',
      citation: { source: 'HTTP test fixture' },
    })),
    isConfigured: () => true,
    getCopyright: () => 'Test fixture',
  };
  const bibleService = new BibleService([adapter]);

  return {
    tools: [createBibleLookupHandler(bibleService)],
    services: {
      bibleService,
      commentaryService: { getAvailableCommentators: () => [] },
      historicalService: {
        listDocuments: async () => [],
        getDocument: async id => ({ id, title: id, type: 'test', date: null, topics: [] }),
        getSections: async () => [],
      },
      strongsService: {
        lookup: async strongsNumber => ({
          strongs_number: strongsNumber,
          testament: strongsNumber.startsWith('H') ? 'OT' : 'NT',
          lemma: 'test',
          definition: 'test',
          citation: { source: 'HTTP test fixture' },
        }),
      },
    },
  };
}

function initializeRequest(id: number): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: `http-test-${id}`, version: '1.0.0' },
    },
  });
}

interface HttpRequestOptions {
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  chunks?: string[];
  agent?: Agent | false;
}

interface HttpResponse {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
  json?: unknown;
}

function sendHttp(port: number, options: HttpRequestOptions = {}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let responseStarted = false;
    const req = request({
      host: '127.0.0.1',
      port,
      agent: options.agent ?? false,
      path: options.path ?? '/mcp',
      method: options.method ?? 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-11-25',
        ...options.headers,
      },
    }, res => {
      responseStarted = true;
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json: unknown;
        try { json = text ? JSON.parse(text) : undefined; } catch { /* SSE or empty response */ }
        settled = true;
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json });
      });
    });
    req.on('error', error => {
      // Rejecting an oversized declared body can close the upload side after
      // the valid 413 response has started. Prefer that response over the
      // request-side ECONNRESET once response headers have arrived.
      if (!settled && !responseStarted) reject(error);
    });

    if (options.chunks) {
      for (const chunk of options.chunks) req.write(chunk);
      req.end();
    } else {
      req.end(options.body);
    }
  });
}
