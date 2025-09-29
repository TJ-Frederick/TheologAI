import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { tools, getToolByName } from './tools/index.js';

export class BibleMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'theologai-bible-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const tool = getToolByName(name);
      if (!tool) {
        throw new Error(`Tool "${name}" not found`);
      }

      try {
        return await tool.handler(args);
      } catch (error) {
        console.error(`Error executing tool ${name}:`, error);
        throw error;
      }
    });
  }

  async connect(transport: any): Promise<void> {
    await this.server.connect(transport);
  }
}