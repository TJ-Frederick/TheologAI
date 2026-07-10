import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createTheologAiMcpServer, STDIO_CAPABILITIES } from './mcp/server.js';
import type { McpCapabilityProfile, McpCompositionRoot } from './mcp/server.js';
import { createCompositionRoot } from './tools/v2/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as { version: string };

/**
 * Node.js compatibility adapter retained for the existing stdio/HTTP entrypoint.
 * All MCP registration is owned by the shared factory in src/mcp/server.ts.
 */
export class BibleMCPServer {
  private readonly mcpServer: McpServer;

  constructor(
    root: McpCompositionRoot = createCompositionRoot(),
    version: string = pkg.version,
    profile: McpCapabilityProfile = STDIO_CAPABILITIES,
  ) {
    this.mcpServer = createTheologAiMcpServer(root, version, profile);
  }

  getServer(): Server {
    return this.mcpServer.server;
  }

  async connect(transport: Transport): Promise<void> {
    await this.mcpServer.connect(transport);
  }
}
