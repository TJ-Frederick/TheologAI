import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ErrorCode, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { STATELESS_HTTP_CAPABILITIES, type McpCompositionRoot } from '../mcp/server.js';
import { BibleMCPServer } from '../server.js';
import { normalizeHostname, type NodeHttpConfig } from './config.js';
import { INTERNAL_MCP_ERROR, sanitizeMcpMessage } from './mcpErrors.js';

class SanitizingNodeHttpTransport extends StreamableHTTPServerTransport {
  override async send(
    message: JSONRPCMessage,
    options?: Parameters<StreamableHTTPServerTransport['send']>[1],
  ): Promise<void> {
    await super.send(sanitizeMcpMessage(message), options);
  }
}

export interface HttpTelemetryEvent {
  event: string;
  level: 'info' | 'warning' | 'error';
  timestamp: string;
  method?: string;
  path?: string;
  canonicalPath?: string;
  status?: number;
  detail?: string;
  errorName?: string;
}

export type HttpTelemetry = (event: HttpTelemetryEvent) => void;

interface McpRequestServer {
  connect(transport: StreamableHTTPServerTransport): Promise<void>;
  getServer(): { close(): Promise<void> };
}

export interface NodeHttpServerOptions {
  root: McpCompositionRoot;
  config: NodeHttpConfig;
  telemetry?: HttpTelemetry;
  createMcpServer?: (root: McpCompositionRoot) => McpRequestServer;
}

export interface NodeHttpRuntime {
  readonly server: HttpServer;
  listen(): Promise<AddressInfo>;
  close(): Promise<void>;
}

interface ActiveRequest {
  server: McpRequestServer;
  transport: StreamableHTTPServerTransport;
}

type BodyResult =
  | { ok: true; body: unknown }
  | { ok: false; status: 400 | 413; message: string };

export function createNodeHttpServer(options: NodeHttpServerOptions): NodeHttpRuntime {
  const { root, config } = options;
  const telemetry = options.telemetry ?? defaultTelemetry;
  const createMcpServer = options.createMcpServer ?? (
    sharedRoot => new BibleMCPServer(sharedRoot, undefined, STATELESS_HTTP_CAPABILITIES)
  );
  const activeRequests = new Set<ActiveRequest>();
  let listening = false;
  let closing = false;
  let closePromise: Promise<void> | undefined;

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch(error => {
      telemetryEvent(telemetry, 'http.request.error', 'error', req, {
        status: 500,
        errorName: safeErrorName(error),
      });
      if (!res.headersSent) sendMcpInternalError(res);
      else res.end();
    });
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    setVaryOrigin(res);

    if (closing) {
      req.resume();
      sendJson(res, 503, { error: 'Server shutting down' });
      return;
    }

    if (!isAllowedHost(req.headers.host, config.allowedHosts)) {
      telemetryEvent(telemetry, 'http.request.rejected_host', 'warning', req, { status: 403 });
      sendJson(res, 403, { error: 'Forbidden host' });
      return;
    }

    const origin = singleHeader(req.headers.origin);
    if (origin && !config.allowedOrigins.includes(origin)) {
      telemetryEvent(telemetry, 'http.request.rejected_origin', 'warning', req, { status: 403 });
      sendJson(res, 403, { error: 'Forbidden origin' });
      return;
    }
    if (origin) setCorsHeaders(res, origin);

    const path = requestPath(req.url);
    if (path !== '/mcp' && path !== '/') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    if (path === '/') {
      telemetryEvent(telemetry, 'http.route.deprecated', 'warning', req, {
        canonicalPath: '/mcp',
        detail: 'The root MCP endpoint is deprecated; use /mcp.',
      });
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        Allow: 'POST, OPTIONS',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID',
      });
      res.end();
      return;
    }

    // Streamable HTTP requires POST; GET is optional. This stateless server has
    // no standalone SSE stream or server-initiated messages, so only POST and
    // CORS OPTIONS are exposed. GET and DELETE intentionally return 405.
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    const bodyResult = await readJsonBody(req, config.maxBodyBytes);
    if (!bodyResult.ok) {
      telemetryEvent(telemetry, 'http.request.rejected_body', 'warning', req, {
        status: bodyResult.status,
        detail: bodyResult.message,
      });
      if (bodyResult.message === 'Invalid JSON body') sendMcpParseError(res);
      else sendJson(res, bodyResult.status, { error: bodyResult.message });
      return;
    }
    if (closing) {
      sendJson(res, 503, { error: 'Server shutting down' });
      return;
    }

    const transport = new SanitizingNodeHttpTransport({ sessionIdGenerator: undefined });
    const mcpServer = createMcpServer(root);
    const active = { server: mcpServer, transport };
    activeRequests.add(active);

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, bodyResult.body);
    } finally {
      activeRequests.delete(active);
      await Promise.allSettled([mcpServer.getServer().close(), transport.close()]);
    }
  }

  return {
    server,
    async listen() {
      if (listening) return server.address() as AddressInfo;
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          listening = true;
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(config.port, config.host);
      });
      return server.address() as AddressInfo;
    },
    close() {
      if (closePromise) return closePromise;
      closePromise = (async () => {
        closing = true;
        const closeHttp = listening
          ? new Promise<void>((resolve, reject) => {
              server.close(error => error ? reject(error) : resolve());
              server.closeIdleConnections();
            })
          : Promise.resolve();
        const closeActive = Promise.allSettled(
          [...activeRequests].flatMap(active => [
            active.server.getServer().close(),
            active.transport.close(),
          ]),
        );
        await closeActive;
        // Active MCP transports have had a chance to finish. End any remaining
        // pre-dispatch or idle HTTP connections so shutdown cannot be held open
        // indefinitely by a slow request body.
        server.closeAllConnections();
        await closeHttp;
        listening = false;
      })();
      return closePromise;
    },
  };
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<BodyResult> {
  const declaredLength = singleHeader(req.headers['content-length']);
  if (declaredLength !== undefined) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      req.resume();
      return { ok: false, status: 400, message: 'Invalid Content-Length' };
    }
    if (length > maxBytes) {
      req.resume();
      return { ok: false, status: 413, message: 'Request body too large' };
    }
  }

  return await new Promise<BodyResult>(resolve => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    req.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.byteLength;
      if (total > maxBytes) {
        settled = true;
        chunks.length = 0;
        resolve({ ok: false, status: 413, message: 'Request body too large' });
        return;
      }
      chunks.push(buffer);
    });
    req.once('aborted', () => {
      if (!settled) {
        settled = true;
        resolve({ ok: false, status: 400, message: 'Request aborted' });
      }
    });
    req.once('error', () => {
      if (!settled) {
        settled = true;
        resolve({ ok: false, status: 400, message: 'Invalid request body' });
      }
    });
    req.once('end', () => {
      if (settled) return;
      settled = true;
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve({ ok: true, body: text ? JSON.parse(text) : undefined });
      } catch {
        resolve({ ok: false, status: 400, message: 'Invalid JSON body' });
      }
    });
  });
}

function isAllowedHost(hostHeader: string | undefined, allowedHosts: string[]): boolean {
  if (!hostHeader || /[,/\\@]/.test(hostHeader)) return false;
  try {
    const parsed = new URL(`http://${hostHeader}`);
    return allowedHosts.includes(normalizeHostname(parsed.hostname));
  } catch {
    return false;
  }
}

function requestPath(url: string | undefined): string {
  return (url ?? '/').split('?', 1)[0] || '/';
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function setVaryOrigin(res: ServerResponse): void {
  res.setHeader('Vary', 'Origin');
}

function setCorsHeaders(res: ServerResponse, origin: string): void {
  res.setHeader('Access-Control-Allow-Origin', origin);
}

function sendJson(res: ServerResponse, status: number, payload: Record<string, string>): void {
  if (res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendMcpInternalError(res: ServerResponse): void {
  if (res.writableEnded) return;
  res.writeHead(500, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify({
    jsonrpc: '2.0',
    error: INTERNAL_MCP_ERROR,
    id: null,
  }));
}

function sendMcpParseError(res: ServerResponse): void {
  if (res.writableEnded) return;
  res.writeHead(400, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: ErrorCode.ParseError, message: 'Parse error' },
    id: null,
  }));
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function telemetryEvent(
  telemetry: HttpTelemetry,
  event: string,
  level: HttpTelemetryEvent['level'],
  req: IncomingMessage,
  fields: Partial<HttpTelemetryEvent> = {},
): void {
  telemetry({
    event,
    level,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: requestPath(req.url),
    ...fields,
  });
}

function defaultTelemetry(event: HttpTelemetryEvent): void {
  const output = JSON.stringify(event);
  if (event.level === 'error') console.error(output);
  else if (event.level === 'warning') console.warn(output);
  else console.log(output);
}
