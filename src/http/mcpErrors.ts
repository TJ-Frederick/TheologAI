import {
  ProtocolErrorCode,
  isJSONRPCErrorResponse,
  type JSONRPCMessage,
} from '@modelcontextprotocol/server';

export const INTERNAL_MCP_ERROR = {
  code: ProtocolErrorCode.InternalError,
  message: 'Internal server error',
} as const;

/** Remove exception text and data from unexpected MCP handler failures. */
export function sanitizeMcpMessage(message: JSONRPCMessage): JSONRPCMessage {
  if (!isJSONRPCErrorResponse(message) || message.error.code !== ProtocolErrorCode.InternalError) {
    return message;
  }

  return {
    jsonrpc: '2.0',
    id: message.id,
    error: INTERNAL_MCP_ERROR,
  };
}
