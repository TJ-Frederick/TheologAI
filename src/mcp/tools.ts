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
import { formatValidationError, type SchemaValidator, validatorFor } from './validation.js';

export function registerToolHandlers(
  server: Server,
  tools: ToolHandler[],
  logging: boolean,
): void {
  const validators = new Map<string, SchemaValidator<Record<string, unknown>>>(
    tools.map(tool => [tool.name, validatorFor(tool.inputSchema)]),
  );
  const outputValidators = new Map<string, SchemaValidator<Record<string, unknown>>>(
    tools
      .filter(tool => tool.outputSchema)
      .map(tool => [tool.name, validatorFor(tool.outputSchema!)]),
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
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
    const validation = validate?.(toolArguments);
    if (!validation?.valid) {
      return {
        content: [{
          type: 'text',
          text: `Invalid arguments for ${name}: ${formatValidationError(validation?.errorMessage)}`,
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

    let result;
    try {
      result = await tool.handler(toolArguments);
    } catch {
      throw internalError();
    }

    if (result.isError) return result as CallToolResult;

    if (tool.outputSchema) {
      if (result.structuredContent === undefined) {
        await reportOutputValidationFailure(server, logging, name);
        throw internalError();
      }
      const validation = outputValidators.get(name)?.(result.structuredContent);
      if (!validation?.valid) {
        await reportOutputValidationFailure(server, logging, name);
        throw internalError();
      }
    }

    return result as CallToolResult;
  });
}

async function reportOutputValidationFailure(
  server: Server,
  logging: boolean,
  tool: string,
): Promise<void> {
  if (!logging) return;
  await server.sendLoggingMessage({
    level: 'error',
    logger: 'theologai.tools',
    data: { event: 'tool_output_validation_failed', tool },
  }).catch(() => {
    // Logging is observational and must not alter the sanitized protocol error.
  });
}
