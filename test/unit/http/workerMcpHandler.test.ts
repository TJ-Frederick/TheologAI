import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const { mockHandleRequest, mockWorkerTransport } = vi.hoisted(() => {
  const mockHandleRequest = vi.fn();
  const mockWorkerTransport = vi.fn(function MockWorkerTransport() {
    return { handleRequest: mockHandleRequest };
  });
  return { mockHandleRequest, mockWorkerTransport };
});

vi.mock('agents/mcp', () => ({ WorkerTransport: mockWorkerTransport }));

import { handleWorkerMcpRequest } from '../../../src/http/worker/mcpHandler.js';

describe('handleWorkerMcpRequest', () => {
  const request = new Request('https://example.com/mcp', { method: 'POST' });

  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleRequest.mockResolvedValue(new Response('ok'));
  });

  it('connects a stateless WorkerTransport and returns its response', async () => {
    const server = { connect: vi.fn().mockResolvedValue(undefined) } as unknown as McpServer;
    const result = await handleWorkerMcpRequest(server, request);

    expect(mockWorkerTransport).toHaveBeenCalledWith({ sessionIdGenerator: undefined });
    expect(server.connect).toHaveBeenCalledWith(expect.objectContaining({
      handleRequest: mockHandleRequest,
    }));
    expect(mockHandleRequest).toHaveBeenCalledWith(request);
    expect(result.errorName).toBeUndefined();
    await expect(result.response.text()).resolves.toBe('ok');
  });

  it.each(['connect', 'handle'])('sanitizes a private %s failure', async failurePoint => {
    const secret = 'rpc-key=private&sql=SELECT-private';
    const server = {
      connect: failurePoint === 'connect'
        ? vi.fn().mockRejectedValue(new Error(secret))
        : vi.fn().mockResolvedValue(undefined),
    } as unknown as McpServer;
    if (failurePoint === 'handle') mockHandleRequest.mockRejectedValueOnce(new Error(secret));

    const result = await handleWorkerMcpRequest(server, request);
    expect(result.errorName).toBe('Error');
    expect(result.response.status).toBe(500);
    expect(result.response.headers.get('Cache-Control')).toBe('no-store');
    expect(result.response.headers.get('Content-Type')).toContain('application/json');
    const body = await result.response.text();
    expect(body).not.toContain(secret);
    expect(JSON.parse(body)).toEqual({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal server error' },
      id: null,
    });
  });
});
