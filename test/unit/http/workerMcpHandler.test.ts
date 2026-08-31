import { describe, expect, it, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/server';

import { handleWorkerMcpRequest } from '../../../src/http/worker/mcpHandler.js';

describe('handleWorkerMcpRequest', () => {
  it('serves a legacy request with a fresh stateless v2 server', async () => {
    const createServer = vi.fn(() => new Server(
      { name: 'worker-test', version: '1.0.0' },
      { capabilities: {} },
    ));
    const result = await handleWorkerMcpRequest(createServer, initializeRequest());

    expect(createServer).toHaveBeenCalledWith('legacy');
    expect(result.errorName).toBeUndefined();
    expect(result.response.status).toBe(200);
    expect(await responsePayload(result.response)).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-11-25',
        serverInfo: { name: 'worker-test', version: '1.0.0' },
      },
    });
  });

  it('sanitizes a private handler setup failure', async () => {
    const secret = 'rpc-key=private&sql=SELECT-private';
    const result = await handleWorkerMcpRequest(
      () => { throw new Error(secret); },
      initializeRequest(),
    );
    expect(result.errorName).toBe('Error');
    expect(result.response.status).toBe(500);
    expect(result.response.headers.get('Cache-Control')).toBe('no-store');
    expect(result.response.headers.get('Content-Type')).toContain('application/json');
    const body = await result.response.text();
    expect(body).not.toContain(secret);
    expect(JSON.parse(body)).toEqual({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal server error' },
      id: 1,
    });
  });
});

function initializeRequest(): Request {
  return new Request('https://example.com/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'worker-test-client', version: '1.0.0' },
      },
    }),
  });
}

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
    const data = text.split('\n').find(line => line.startsWith('data: '));
    if (!data) throw new Error('SSE response omitted a data event');
    return JSON.parse(data.slice('data: '.length)) as Record<string, unknown>;
  }
  return JSON.parse(text) as Record<string, unknown>;
}
