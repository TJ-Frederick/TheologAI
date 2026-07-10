import { describe, expect, it } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const MCP_URL = 'https://worker.test/mcp';
const ALLOWED_ORIGIN = 'https://allowed.example';

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: {
    resources?: unknown[];
    contents?: unknown[];
    prompts?: unknown[];
    messages?: unknown[];
    content?: unknown[];
    isError?: boolean;
    [key: string]: unknown;
  };
  error?: { code: number; message: string; data?: unknown };
}

async function parseMcpResponse(response: Response): Promise<JsonRpcResponse> {
  const body = await response.text();
  if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
    const event = body
      .split('\n')
      .find(line => line.startsWith('data:'));
    if (!event) throw new Error(`MCP SSE response had no data event: ${body}`);
    return JSON.parse(event.slice('data:'.length).trim()) as JsonRpcResponse;
  }
  return JSON.parse(body) as JsonRpcResponse;
}

async function rpc(
  method: string,
  params?: Record<string, unknown>,
  id: number = 1,
): Promise<{ response: Response; message: JsonRpcResponse }> {
  const response = await SELF.fetch(MCP_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      Origin: ALLOWED_ORIGIN,
      'Mcp-Protocol-Version': '2025-11-25',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }),
  });
  return { response, message: await parseMcpResponse(response) };
}

async function rateLimitKey(ip: string, userAgent: string): Promise<string> {
  const input = new TextEncoder().encode(`theologai-rate-limit-v1\0${ip}\0${userAgent}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

describe('Worker MCP endpoint in workerd', () => {
  it('provides the configured rate-limit binding in the Workers runtime', async () => {
    await expect(env.THEOLOGAI_RATE_LIMITER.limit({
      key: `worker-runtime-smoke-${crypto.randomUUID()}`,
    })).resolves.toEqual({ success: true });
  });

  it('returns the configured 429 response after the client fingerprint exhausts its binding limit', async () => {
    const ip = '203.0.113.42';
    const userAgent = 'theologai-worker-runtime-rate-limit-test';
    const key = await rateLimitKey(ip, userAgent);

    for (let requestNumber = 0; requestNumber < 120; requestNumber += 1) {
      const result = await env.THEOLOGAI_RATE_LIMITER.limit({ key });
      expect(result.success).toBe(true);
    }

    const response = await SELF.fetch(MCP_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
        'CF-Connecting-IP': ip,
        'User-Agent': userAgent,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 15, method: 'tools/list' }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    await expect(response.text()).resolves.toBe('Too many requests');
  });

  it('initializes and lists the shared tool registry', async () => {
    const initialized = await rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'worker-runtime-test', version: '1.0.0' },
    });

    expect(initialized.response.status).toBe(200);
    expect(initialized.message.error).toBeUndefined();
    expect(initialized.message.result).toMatchObject({
      protocolVersion: '2025-11-25',
      serverInfo: { name: 'theologai-bible-server', version: '3.6.0-test' },
    });

    const listed = await rpc('tools/list', undefined, 2);
    expect(listed.response.status).toBe(200);
    expect(listed.message.error).toBeUndefined();
    expect(listed.message.result).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: 'original_language_lookup' }),
      ]),
    });
  });

  it('serves Strong\'s tool and resource results from the isolated D1 fixture', async () => {
    const { response, message } = await rpc('resources/read', {
      uri: 'theologai://strongs/G26',
    });

    expect(response.status).toBe(200);
    expect(message.error).toBeUndefined();
    expect(message.result).toMatchObject({
      contents: [
        expect.objectContaining({
          uri: 'theologai://strongs/G26',
          mimeType: 'text/markdown',
          text: expect.stringContaining('love, goodwill, benevolence'),
        }),
      ],
    });

    const toolResult = await rpc('tools/call', {
      name: 'original_language_lookup',
      arguments: { strongs_number: 'G26' },
    }, 3);

    expect(toolResult.response.status).toBe(200);
    expect(toolResult.message.error).toBeUndefined();
    expect(toolResult.message.result).toMatchObject({
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('love, goodwill, benevolence'),
        }),
      ],
    });
  });

  it('lists the document fixture dynamically and reads its D1-backed resource', async () => {
    const listed = await rpc('resources/list');

    expect(listed.response.status).toBe(200);
    expect(listed.message.error).toBeUndefined();
    expect(listed.message.result?.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uri: 'theologai://documents/apostles-creed',
        name: "Apostles' Creed",
        description: 'Creed (c. 390)',
      }),
    ]));

    const read = await rpc('resources/read', {
      uri: 'theologai://documents/apostles-creed',
    }, 4);

    expect(read.response.status).toBe(200);
    expect(read.message.error).toBeUndefined();
    expect(read.message.result?.contents).toEqual([
      expect.objectContaining({
        uri: 'theologai://documents/apostles-creed',
        mimeType: 'text/markdown',
        text: expect.stringMatching(/Apostles' Creed[\s\S]*The First Article[\s\S]*maker of heaven and earth/),
      }),
    ]);
  });

  it('executes cross-reference and expanded morphology tools against D1', async () => {
    const crossReferences = await rpc('tools/call', {
      name: 'bible_cross_references',
      arguments: { reference: 'John 3:16', maxResults: 1 },
    }, 5);

    expect(crossReferences.response.status).toBe(200);
    expect(crossReferences.message.error).toBeUndefined();
    expect(crossReferences.message.result).toMatchObject({
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringMatching(/Cross-References for John 3:16[\s\S]*Romans 5:8[\s\S]*42 votes/),
        }),
      ],
    });

    const morphology = await rpc('tools/call', {
      name: 'bible_verse_morphology',
      arguments: { reference: 'John 3:16', expand_morphology: true },
    }, 6);

    expect(morphology.response.status).toBe(200);
    expect(morphology.message.error).toBeUndefined();
    expect(morphology.message.result).toMatchObject({
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringMatching(/John 3:16[\s\S]*Οὕτως[\s\S]*Adverb[\s\S]*thus/),
        }),
      ],
    });
  });

  it('searches the historical-document FTS fixture through the MCP tool', async () => {
    const result = await rpc('tools/call', {
      name: 'classic_text_lookup',
      arguments: { query: 'almighty' },
    }, 7);

    expect(result.response.status).toBe(200);
    expect(result.message.error).toBeUndefined();
    expect(result.message.result).toMatchObject({
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringMatching(/Search Results for "almighty"[\s\S]*The First Article[\s\S]*maker of heaven and earth/),
        }),
      ],
    });
  });

  it('lists prompts and renders a validated prompt through the Worker endpoint', async () => {
    const listed = await rpc('prompts/list', undefined, 8);

    expect(listed.response.status).toBe(200);
    expect(listed.message.error).toBeUndefined();
    expect(listed.message.result?.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'passage-exegesis' }),
      expect.objectContaining({ name: 'word-study' }),
    ]));

    const rendered = await rpc('prompts/get', {
      name: 'passage-exegesis',
      arguments: { reference: 'John 3:16', translation: 'NET' },
    }, 9);

    expect(rendered.response.status).toBe(200);
    expect(rendered.message.error).toBeUndefined();
    expect(rendered.message.result?.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: expect.objectContaining({
          type: 'text',
          text: expect.stringMatching(/systematic exegesis of John 3:16[\s\S]*"translation":"NET"/),
        }),
      }),
    ]);
  });

  it('returns tool execution errors for arguments that violate the advertised schema', async () => {
    const missingRequired = await rpc('tools/call', {
      name: 'bible_cross_references',
      arguments: {},
    }, 10);

    expect(missingRequired.response.status).toBe(200);
    expect(missingRequired.message.error).toBeUndefined();
    expect(missingRequired.message.result).toMatchObject({
      isError: true,
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('missing required argument "reference"'),
        }),
      ],
    });

    const wrongType = await rpc('tools/call', {
      name: 'bible_cross_references',
      arguments: { reference: 'John 3:16', maxResults: 'many' },
    }, 11);

    expect(wrongType.response.status).toBe(200);
    expect(wrongType.message.error).toBeUndefined();
    expect(wrongType.message.result).toMatchObject({
      isError: true,
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('argument "maxResults" must be integer'),
        }),
      ],
    });
  });

  it('returns the MCP resource-not-found protocol error for an unknown URI', async () => {
    const result = await rpc('resources/read', {
      uri: 'theologai://documents/not-in-the-fixture',
    }, 12);

    expect(result.response.status).toBe(200);
    expect(result.message.result).toBeUndefined();
    expect(result.message.error).toMatchObject({
      code: -32002,
      data: { uri: 'theologai://documents/not-in-the-fixture' },
    });
    expect(result.message.error?.message).toContain('Resource not found');
  });

  it('rejects browser origins outside the explicit allowlist', async () => {
    const response = await SELF.fetch(MCP_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        Origin: 'https://untrusted.example',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 13, method: 'tools/list' }),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it.each(['GET', 'DELETE'])('rejects stateless %s streams with 405', async method => {
    const response = await SELF.fetch(MCP_URL, {
      method,
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST, OPTIONS');
  });

  it('rejects streamed request bodies above the configured byte limit', async () => {
    const response = await SELF.fetch(MCP_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 14,
        method: 'tools/list',
        padding: 'x'.repeat(2048),
      }),
    });

    expect(response.status).toBe(413);
  });
});
