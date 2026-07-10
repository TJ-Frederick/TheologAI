import { describe, expect, it } from 'vitest';
import { sanitizeMcpMessage } from '../../../src/http/mcpErrors.js';

describe('sanitizeMcpMessage', () => {
  it('removes message and data from internal errors while preserving the request id', () => {
    expect(sanitizeMcpMessage({
      jsonrpc: '2.0',
      id: 'request-1',
      error: {
        code: -32603,
        message: 'rpc-key=private',
        data: { sql: 'SELECT private' },
      },
    })).toEqual({
      jsonrpc: '2.0',
      id: 'request-1',
      error: { code: -32603, message: 'Internal server error' },
    });
  });

  it('preserves expected protocol errors', () => {
    const message = {
      jsonrpc: '2.0' as const,
      id: 2,
      error: { code: -32602, message: 'Missing required argument "reference"' },
    };
    expect(sanitizeMcpMessage(message)).toBe(message);
  });
});
