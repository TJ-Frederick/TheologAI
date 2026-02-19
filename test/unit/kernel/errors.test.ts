import { describe, it, expect } from 'vitest';
import {
  APIError,
  ValidationError,
  RateLimitError,
  AdapterError,
  NotFoundError,
  TheologAIError,
  getUserMessage,
  handleToolError,
} from '../../../src/kernel/errors.js';

describe('Error hierarchy', () => {
  it('all errors extend TheologAIError', () => {
    expect(new APIError(404, 'not found')).toBeInstanceOf(TheologAIError);
    expect(new ValidationError('ref', 'bad')).toBeInstanceOf(TheologAIError);
    expect(new RateLimitError(60)).toBeInstanceOf(TheologAIError);
    expect(new AdapterError('ESV', 'fail')).toBeInstanceOf(TheologAIError);
    expect(new NotFoundError('verse', 'not found')).toBeInstanceOf(TheologAIError);
  });

  it('all errors extend Error', () => {
    expect(new APIError(500, 'error')).toBeInstanceOf(Error);
  });

  it('APIError stores status', () => {
    const err = new APIError(503, 'unavailable');
    expect(err.status).toBe(503);
    expect(err.message).toBe('unavailable');
  });

  it('ValidationError stores field', () => {
    const err = new ValidationError('reference', 'invalid');
    expect(err.field).toBe('reference');
  });

  it('RateLimitError stores retryAfter', () => {
    const err = new RateLimitError(30);
    expect(err.retryAfter).toBe(30);
  });

  it('AdapterError includes source in message', () => {
    const err = new AdapterError('HelloAO', 'timeout');
    expect(err.message).toContain('HelloAO');
    expect(err.source).toBe('HelloAO');
  });

  it('AdapterError can wrap a cause', () => {
    const cause = new Error('network');
    const err = new AdapterError('ESV', 'fail', cause);
    expect(err.cause).toBe(cause);
  });

  it('NotFoundError stores resource', () => {
    const err = new NotFoundError('verse', 'Gen 999:999 not found');
    expect(err.resource).toBe('verse');
  });
});

describe('getUserMessage', () => {
  it('RateLimitError → retry message', () => {
    expect(getUserMessage(new RateLimitError(60))).toContain('limited');
  });

  it('ValidationError → includes error message', () => {
    expect(getUserMessage(new ValidationError('ref', 'bad format'))).toContain('bad format');
  });

  it('NotFoundError → returns message', () => {
    expect(getUserMessage(new NotFoundError('verse', 'verse not found'))).toBe('verse not found');
  });

  it('generic Error → fallback', () => {
    expect(getUserMessage(new Error('oops'))).toContain('error');
  });
});

describe('handleToolError', () => {
  it('returns MCP error format', () => {
    const result = handleToolError(new ValidationError('ref', 'bad'));
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
  });
});
