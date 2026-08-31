import { describe, expect, it } from 'vitest';
import { resourceNotFound } from '../../../src/mcp/errors.js';

describe('MCP resource-not-found errors', () => {
  const uri = 'theologai://documents/does-not-exist';

  it('retains the legacy construction seam while using the modern SDK error', () => {
    expect(resourceNotFound(uri, 'legacy')).toMatchObject({
      code: -32002,
      message: 'Resource not found',
      data: { uri },
    });
    expect(resourceNotFound(uri, 'modern')).toMatchObject({
      code: -32602,
      message: 'Resource not found',
      data: { uri },
    });
  });
});
