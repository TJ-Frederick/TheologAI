import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface ListeningServer {
  server: Server;
  url: string;
}

const servers: Server[] = [];

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<ListeningServer> {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
});

describe('legacy-host redirect transport compatibility', () => {
  it('lets the official TypeScript Streamable HTTP client follow a cross-origin 308 without changing its POST body', async () => {
    const targetRequest = vi.fn<(
      method: string | undefined,
      url: string | undefined,
      body: string,
      headers: IncomingMessage['headers'],
    ) => void>();
    const target = await listen(async (request, response) => {
      targetRequest(request.method, request.url, await readBody(request), request.headers);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }));
    });
    const legacy = await listen((request, response) => {
      response.writeHead(308, { Location: `${target.url}${request.url}` });
      response.end();
    });

    const transport = new StreamableHTTPClientTransport(new URL(`${legacy.url}/mcp?source=legacy`));
    const received = vi.fn();
    transport.onmessage = received;
    await transport.start();
    try {
      await transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
      });
    } finally {
      await transport.close();
    }

    expect(targetRequest).toHaveBeenCalledOnce();
    expect(targetRequest.mock.calls[0]?.[0]).toBe('POST');
    expect(targetRequest.mock.calls[0]?.[1]).toBe('/mcp?source=legacy');
    expect(targetRequest.mock.calls[0]?.[2]).toBe(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
    }));
    expect(targetRequest.mock.calls[0]?.[3]['content-type']).toBe('application/json');
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });
});
