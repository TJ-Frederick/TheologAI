#!/usr/bin/env node

import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BibleMCPServer } from './server.js';

async function main() {
  const server = new BibleMCPServer();
  const transport = new StdioServerTransport();

  try {
    await server.connect(transport);
    console.error('TheologAI Bible MCP Server running on stdio');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});