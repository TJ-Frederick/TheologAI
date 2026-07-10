import type { ValidateFunction } from 'ajv';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from '../kernel/types.js';
import { internalError } from './errors.js';
import { formatValidationErrors, validatorFor } from './validation.js';

export function registerToolHandlers(
  server: Server,
  tools: ToolHandler[],
  logging: boolean,
): void {
  const validators = new Map<string, ValidateFunction>(
    tools.map(tool => [tool.name, validatorFor(tool.inputSchema)]),
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = tools.find(candidate => candidate.name === name);
    if (!tool) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
    }

    const validate = validators.get(name);
    const toolArguments = args ?? {};
    if (!validate || !validate(toolArguments)) {
      return {
        content: [{
          type: 'text',
          text: `Invalid arguments for ${name}: ${formatValidationErrors(validate?.errors)}`,
        }],
        isError: true,
      };
    }

    if (logging) {
      await server.sendLoggingMessage({
        level: 'info',
        logger: 'theologai.tools',
        data: { event: 'tool_execution', tool: name },
      }).catch(() => {
        // Logging is observational and must not make an otherwise valid tool call fail.
      });
    }

    try {
      return await tool.handler(toolArguments) as CallToolResult;
    } catch {
      throw internalError();
    }
  });
}
