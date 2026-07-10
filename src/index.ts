#!/usr/bin/env node

import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BibleMCPServer } from './server.js';
import { createCompositionRoot } from './tools/v2/index.js';
import { readNodeHttpConfig } from './http/config.js';
import { createNodeHttpServer } from './http/nodeHttpServer.js';

async function main() {
  // The composition root owns the long-lived local database and caches. HTTP
  // protocol servers and transports are intentionally created per request.
  const root = createCompositionRoot();
  const port = process.env.PORT;

  if (port) {
    const config = readNodeHttpConfig(process.env);
    const runtime = createNodeHttpServer({ root, config });
    const address = await runtime.listen();

    console.error(`TheologAI Bible MCP Server running at http://${config.host}:${address.port}/mcp`);

    let shuttingDown = false;
    const shutdown = async (signal: NodeJS.Signals) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.error(JSON.stringify({
        event: 'http.server.shutdown',
        level: 'info',
        signal,
        timestamp: new Date().toISOString(),
      }));
      try {
        await runtime.close();
      } catch (error) {
        console.error(JSON.stringify({
          event: 'http.server.shutdown_error',
          level: 'error',
          errorName: error instanceof Error ? error.name : 'UnknownError',
          timestamp: new Date().toISOString(),
        }));
        process.exitCode = 1;
      }
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

  } else {
    // Stdio mode - original behavior
    const server = new BibleMCPServer(root);
    const transport = new StdioServerTransport();

    try {
      await server.connect(transport);
      console.error('TheologAI Bible MCP Server running on stdio');
    } catch (error) {
      console.error(JSON.stringify({
        event: 'stdio.server.start_error',
        level: 'error',
        errorName: error instanceof Error ? error.name : 'UnknownError',
        timestamp: new Date().toISOString(),
      }));
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: 'server.start_error',
    level: 'error',
    errorName: error instanceof Error ? error.name : 'UnknownError',
    timestamp: new Date().toISOString(),
  }));
  process.exit(1);
});
