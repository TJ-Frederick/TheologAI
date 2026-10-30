import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Server, Transport } from '@modelcontextprotocol/server';
import { createTheologAiMcpServer, STDIO_CAPABILITIES } from './mcp/server.js';
import type { McpCapabilityProfile, McpCompositionRoot } from './mcp/server.js';
import { createCompositionRoot } from './tools/v2/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as { version: string };
export const THEOLOGAI_VERSION = pkg.version;

/**
 * Node.js compatibility adapter retained for the existing stdio/HTTP entrypoint.
 * All MCP registration is owned by the shared factory in src/mcp/server.ts.
 */
export class BibleMCPServer {
  private readonly mcpServer: Server;

  constructor(
    root: McpCompositionRoot = createCompositionRoot(),
    version: string = THEOLOGAI_VERSION,
    profile: McpCapabilityProfile = STDIO_CAPABILITIES,
    era: 'legacy' | 'modern' = 'legacy',
  ) {
    this.mcpServer = createTheologAiMcpServer(root, version, profile, era);
  }

  getServer(): Server {
    return this.mcpServer;
  }

  async connect(transport: Transport): Promise<void> {
    await this.mcpServer.connect(transport);
  }
}
