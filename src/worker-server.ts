/**
 * Cloudflare Workers compatibility adapter for the shared MCP server factory.
 */

import type { TheologAiMcpServer } from './mcp/server.js';
import { createTheologAiMcpServer, STATELESS_HTTP_CAPABILITIES } from './mcp/server.js';
import type { ToolExecutionObserver } from './mcp/toolExecutionObserver.js';
import type { WorkerCompositionRoot } from './tools/worker/index.js';

export function createWorkerMcpServer(
  root: WorkerCompositionRoot,
  version: string,
  era: 'legacy' | 'modern' = 'legacy',
  toolExecutionObserver?: ToolExecutionObserver,
): TheologAiMcpServer {
  return createTheologAiMcpServer(root, version, STATELESS_HTTP_CAPABILITIES, era, toolExecutionObserver);
}
