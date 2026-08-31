import {
  createMcpHandler,
  type McpRequestContext,
  type Server,
} from '@modelcontextprotocol/server';
import { INTERNAL_MCP_ERROR } from '../mcpErrors.js';
import { safeErrorName } from './telemetry.js';

export interface WorkerMcpResult {
  response: Response;
  errorName?: string;
}

export type WorkerMcpServerFactory = (era: McpRequestContext['era']) => Server;

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
  createServer: WorkerMcpServerFactory,
  request: Request,
): Promise<WorkerMcpResult> {
  let errorName: string | undefined;
  const handler = createMcpHandler(
    ({ era }) => createServer(era),
    {
      legacy: 'stateless',
      responseMode: 'auto',
      onerror(error) {
        errorName = safeErrorName(error);
      },
    },
  );

  try {
    const response = await handler.fetch(request);
    return { response: withPrivateErrorCaching(response), errorName };
  } catch (error) {
    return {
      response: createInternalMcpErrorResponse(),
      errorName: safeErrorName(error),
    };
  }
}

function withPrivateErrorCaching(response: Response): Response {
  if (response.status < 500 || response.headers.has('Cache-Control')) return response;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
