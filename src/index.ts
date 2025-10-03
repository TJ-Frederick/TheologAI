#!/usr/bin/env node

import 'dotenv/config';
import { createServer } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { BibleMCPServer } from './server.js';

async function main() {
  const server = new BibleMCPServer();
  const port = process.env.PORT;

  if (port) {
    // HTTP mode - start HTTP server
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => Math.random().toString(36).substring(2, 15),
    });

    await server.connect(transport);

    const httpServer = createServer(async (req, res) => {
      const timestamp = new Date().toISOString();
      const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
      
      console.log(`[${timestamp}] ${req.method} ${req.url} - Client: ${clientIP}`);

      if (req.method === 'OPTIONS') {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
        });
        res.end();
        console.log(`[${timestamp}] OPTIONS request completed`);
        return;
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        const startTime = Date.now();
        try {
          const parsedBody = body ? JSON.parse(body) : undefined;
          
          // Log request details for POST/PUT with body
          if (parsedBody && parsedBody.method) {
            console.log(`[${timestamp}] MCP Method: ${parsedBody.method} - ID: ${parsedBody.id || 'none'}`);
          }
          
          await transport.handleRequest(req, res, parsedBody);
          
          const duration = Date.now() - startTime;
          console.log(`[${timestamp}] Request completed in ${duration}ms`);
          
        } catch (error) {
          const duration = Date.now() - startTime;
          console.error(`[${timestamp}] Request handling error (${duration}ms):`, error);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        }
      });
    });

    httpServer.listen(parseInt(port), () => {
      console.error(`TheologAI Bible MCP Server running on HTTP port ${port}`);
    });

  } else {
    // Stdio mode - original behavior
    const transport = new StdioServerTransport();

    try {
      await server.connect(transport);
      console.error('TheologAI Bible MCP Server running on stdio');
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});