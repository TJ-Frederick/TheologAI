import { ProtocolError, ProtocolErrorCode, ResourceNotFoundError } from '@modelcontextprotocol/server';

const RESOURCE_NOT_FOUND = -32002;

export function resourceNotFound(uri: string, era: 'legacy' | 'modern'): ProtocolError {
  // Retain the legacy construction seam; the v2 encoder projects the retired
  // -32002 value to spec-valid -32602 on the wire for both eras.
  return era === 'modern'
    ? new ResourceNotFoundError(uri, 'Resource not found')
    : new ProtocolError(RESOURCE_NOT_FOUND, 'Resource not found', { uri });
}

export function internalError(message = 'Internal server error'): ProtocolError {
  return new ProtocolError(ProtocolErrorCode.InternalError, message);
}
