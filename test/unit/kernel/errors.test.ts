import { describe, it, expect } from 'vitest';
import {
  APIError,
  ValidationError,
  RateLimitError,
  AdapterError,
  NotFoundError,
  PaymentError,
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
    expect(new PaymentError('fail')).toBeInstanceOf(TheologAIError);
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

  it('PaymentError stores optional txHash', () => {
    const err = new PaymentError('fail', '0xabc');
    expect(err.txHash).toBe('0xabc');
    expect(err.name).toBe('PaymentError');
  });

  it('PaymentError works without txHash', () => {
    const err = new PaymentError('fail');
    expect(err.txHash).toBeUndefined();
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

  it('PaymentError with txHash → includes hash', () => {
    expect(getUserMessage(new PaymentError('bad sig', '0xabc'))).toContain('0xabc');
  });

  it('PaymentError without txHash → payment error message', () => {
    expect(getUserMessage(new PaymentError('bad sig'))).toContain('Payment error');
  });

  it('generic Error → fallback', () => {
    expect(getUserMessage(new Error('oops'))).toContain('error');
  });

  it('sanitizes provider names and URLs from ordinary adapter failures', () => {
    const message = getUserMessage(new AdapterError(
      'CCEL',
      'HTTP 503: Service Unavailable for https://ccel.example.test/private?token=secret',
    ));

    expect(message).toContain('Unavailable');
    expect(message).not.toContain('CCEL');
    expect(message).not.toContain('https://');
    expect(message).not.toContain('token=secret');
  });

  it('preserves unsupported-coverage and not-found distinctions without provider details', () => {
    expect(getUserMessage(new AdapterError('HelloAO', 'Unsupported translation: NIV')))
      .toBe('Unsupported coverage: This request is outside the supported coverage.');
    expect(getUserMessage(new AdapterError('CCEL', 'HTTP 404: Not Found for https://ccel.example.test/missing')))
      .toBe('Not found: No matching content was found.');
  });

  it('gives an exact scalar commentary miss a safe, actionable chapter fallback', () => {
    const message = getUserMessage(new AdapterError(
      'HelloAO',
      'No exact commentary match for 1 John 3:16 in Matthew Henry',
    ));

    expect(message).toBe(
      'Not found: No trustworthy exact-verse commentary was available. Request the containing chapter (`1 John 3`) or try another commentator.',
    );
    expect(message).not.toMatch(/HelloAO|Matthew Henry|verseNumber|metadata/i);
  });

  it('treats CCEL parser and upstream-shape failures as unavailable', () => {
    expect(getUserMessage(new AdapterError('CCEL', 'Could not find book content in response')))
      .toBe('Unavailable: The requested source is temporarily unavailable. Please try again later.');
    expect(getUserMessage(new AdapterError('CCEL', 'Section not found or error page returned')))
      .toBe('Unavailable: The requested source is temporarily unavailable. Please try again later.');
    expect(getUserMessage(new AdapterError('CCEL', 'Section not found')))
      .toBe('Not found: No matching content was found.');
  });

  it('sanitizes unavailable configuration errors', () => {
    expect(getUserMessage(new NotFoundError('adapter', 'ESV adapter is not configured')))
      .toContain('Unavailable');
    expect(getUserMessage(new NotFoundError('verse', 'CCEL passage was not found')))
      .not.toContain('CCEL');
    expect(getUserMessage(new APIError(503, 'request failed at https://provider.example.test')))
      .not.toContain('provider.example.test');
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
