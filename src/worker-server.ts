/**
 * Cloudflare Workers compatibility adapter for the shared MCP server factory.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createTheologAiMcpServer, STATELESS_HTTP_CAPABILITIES } from './mcp/server.js';
import type { WorkerCompositionRoot } from './tools/worker/index.js';

export function createWorkerMcpServer(root: WorkerCompositionRoot, version: string): McpServer {
  return createTheologAiMcpServer(root, version, STATELESS_HTTP_CAPABILITIES);
}
