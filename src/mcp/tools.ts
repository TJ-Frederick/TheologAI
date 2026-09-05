import {
  ProtocolError,
  ProtocolErrorCode,
  type CallToolResult,
  type Server,
} from '@modelcontextprotocol/server';
import type { ToolHandler } from '../kernel/types.js';
import { internalError } from './errors.js';
import { formatValidationError, type SchemaValidator, validatorFor } from './validation.js';
import {
  classifyToolResult,
  observeToolExecution,
  safeReleaseVersion,
  safeToolName,
  type ToolExecutionEvent,
  type ToolExecutionObserver,
} from './toolExecutionObserver.js';

export function registerToolHandlers(
  server: Server,
  tools: ToolHandler[],
  logging: boolean,
  toolExecutionObserver?: ToolExecutionObserver,
  releaseVersion?: string,
): void {
  const validators = new Map<string, SchemaValidator<Record<string, unknown>>>(
    tools.map(tool => [tool.name, validatorFor(tool.inputSchema)]),
  );
  const outputValidators = new Map<string, SchemaValidator<Record<string, unknown>>>(
    tools
      .filter(tool => tool.outputSchema)
      .map(tool => [tool.name, validatorFor(tool.outputSchema!)]),
  );

  server.setRequestHandler('tools/list', async () => ({
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      annotations: tool.annotations,
    })),
  }));

  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params;
    const startedAt = Date.now();
    const observedTool = safeToolName(name);
    let emitted = false;
    const emit = (event: Omit<ToolExecutionEvent, 'event' | 'tool' | 'durationMs' | 'releaseVersion'>) => {
      if (emitted) return;
      emitted = true;
      observeToolExecution(toolExecutionObserver, {
        event: 'theologai.tool.execution',
        tool: observedTool,
        durationMs: Math.max(0, Date.now() - startedAt),
        releaseVersion: safeReleaseVersion(releaseVersion),
        ...event,
      });
    };
    const project = (
      result: CallToolResult,
      outputSchema: ToolHandler['outputSchema'],
      outcome: Omit<ToolExecutionEvent, 'event' | 'tool' | 'durationMs' | 'releaseVersion'>,
    ) => {
      try {
        const projected = server.projectCallToolResult(result, outputSchema);
        emit(outcome);
        return projected;
      } catch {
        emit({ outcome: 'error', failureCategory: 'execution_exception' });
        throw internalError();
      }
    };
    try {
      const tool = tools.find(candidate => candidate.name === name);
      if (!tool) {
        emit({ outcome: 'invalid', failureCategory: 'unknown_tool' });
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown tool: ${name}`);
      }

      const validate = validators.get(name);
      const toolArguments = args ?? {};
      const validation = validate?.(toolArguments);
      if (!validation?.valid) {
        return project({
          content: [{
            type: 'text',
            text: `Invalid arguments for ${name}: ${formatValidationError(validation?.errorMessage)}`,
          }],
          isError: true,
        }, tool.outputSchema, { outcome: 'invalid', failureCategory: 'input_validation' });
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
        emit({ outcome: 'error', failureCategory: 'handler_exception' });
        throw internalError();
      }

      if (tool.outputSchema) {
        if (result.structuredContent === undefined) {
        // Generic sanitized tool errors may omit structured output. Whenever a
        // handler does provide it (including partial/unavailable isError
        // results), it must validate against the advertised schema.
        if (result.isError) {
          return project(result as CallToolResult, tool.outputSchema, classifyToolResult(observedTool, result));
        }
        await reportOutputValidationFailure(server, logging, name);
        emit({ outcome: 'error', failureCategory: 'output_contract' });
        throw internalError();
        }
        const validation = outputValidators.get(name)?.(result.structuredContent);
        const semanticValidation = validation?.valid && tool.validateStructuredOutput
          ? safelyValidateStructuredOutput(
            tool.validateStructuredOutput,
            result.structuredContent as Record<string, unknown>,
          )
          : true;
        if (!validation?.valid || !semanticValidation) {
          await reportOutputValidationFailure(server, logging, name);
          emit({ outcome: 'error', failureCategory: 'output_contract' });
          throw internalError();
        }
      }

      return project(result as CallToolResult, tool.outputSchema, classifyToolResult(observedTool, result));
    } catch (error) {
      // Do not expose an unexpected validator/projection error. The server's
      // existing wrapper retains its established sanitized protocol behavior.
      if (!emitted) emit({ outcome: 'error', failureCategory: 'execution_exception' });
      if (error instanceof ProtocolError) throw error;
      throw internalError();
    }
  });
}

function safelyValidateStructuredOutput(
  validate: (value: Record<string, unknown>) => boolean,
  value: Record<string, unknown>,
): boolean {
  try {
    return validate(value);
  } catch {
    return false;
  }
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
