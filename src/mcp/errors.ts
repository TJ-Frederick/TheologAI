import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

const RESOURCE_NOT_FOUND = -32002;

export function resourceNotFound(uri: string): McpError {
  return new McpError(RESOURCE_NOT_FOUND, 'Resource not found', { uri });
}

export function internalError(message = 'Internal server error'): McpError {
  return new McpError(ErrorCode.InternalError, message);
}
