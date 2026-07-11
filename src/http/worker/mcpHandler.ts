import { WorkerTransport } from 'agents/mcp';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { INTERNAL_MCP_ERROR, sanitizeMcpMessage } from '../mcpErrors.js';
import { safeErrorName } from './telemetry.js';

class SanitizingWorkerTransport extends WorkerTransport {
  override async send(
    message: JSONRPCMessage,
    options?: Parameters<WorkerTransport['send']>[1],
  ): Promise<void> {
    await super.send(sanitizeMcpMessage(message), options);
  }
}

export interface WorkerMcpResult {
  response: Response;
  errorName?: string;
}

export function createInternalMcpErrorResponse(): Response {
  return new Response(JSON.stringify({
    jsonrpc: '2.0',
    error: INTERNAL_MCP_ERROR,
    id: null,
  }), {
    status: 500,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export async function handleWorkerMcpRequest(
  server: McpServer,
  request: Request,
): Promise<WorkerMcpResult> {
  const transport = new SanitizingWorkerTransport({ sessionIdGenerator: undefined });

  try {
    await server.connect(transport);
    return { response: await transport.handleRequest(request) };
  } catch (error) {
    return {
      response: createInternalMcpErrorResponse(),
      errorName: safeErrorName(error),
    };
  }
}
