/**
 * Cloudflare Workers entry point for TheologAI MCP server.
 *
 * Serves the MCP protocol over Streamable HTTP via the Cloudflare
 * Agents SDK. Auth is handled at the Cloudflare edge (rate limiting).
 */

import { createMcpHandler } from 'agents/mcp';
import type { Env } from './worker-env.js';
import { createWorkerCompositionRoot } from './tools/worker/index.js';
import { createWorkerMcpServer } from './worker-server.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Fresh composition root per request (D1 binding is per-request)
    const root = createWorkerCompositionRoot(env);
    const mcpServer = createWorkerMcpServer(root, env.THEOLOGAI_VERSION || '0.0.0');

    return createMcpHandler(mcpServer, {
      corsOptions: {
        origin: '*',
        methods: 'GET, POST, DELETE, OPTIONS',
        headers: 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
        exposeHeaders: 'Mcp-Session-Id',
        maxAge: 86400,
      },
    })(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
