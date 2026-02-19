/**
 * Typed error hierarchy for TheologAI.
 *
 * Migrated from src/utils/errors.ts with additions:
 *   - AdapterError (external API failures with source identification)
 *   - NotFoundError (missing references / data)
 */

/** Base error for all TheologAI errors */
export class TheologAIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TheologAIError';
  }
}

/** HTTP-level API failure */
export class APIError extends TheologAIError {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/** Input validation failure */
export class ValidationError extends TheologAIError {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Rate limit exceeded */
export class RateLimitError extends TheologAIError {
  constructor(public readonly retryAfter: number) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
  }
}

/** External adapter / data-source failure */
export class AdapterError extends TheologAIError {
  constructor(
    public readonly source: string,
    message: string,
    public readonly cause?: Error,
  ) {
    super(`[${source}] ${message}`);
    this.name = 'AdapterError';
  }
}

/** Requested resource not found (book, verse, document, etc.) */
export class NotFoundError extends TheologAIError {
  constructor(
    public readonly resource: string,
    message: string,
  ) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** User-friendly error message */
export function getUserMessage(error: Error): string {
  if (error instanceof RateLimitError) {
    return "I'm temporarily limited on Bible API requests. Try again in a few minutes.";
  }
  if (error instanceof ValidationError) {
    return `Invalid input: ${error.message}`;
  }
  if (error instanceof NotFoundError) {
    return error.message;
  }
  if (error instanceof AdapterError) {
    return `Error from ${error.source}: ${error.message}`;
  }
  if (error instanceof APIError) {
    return 'I encountered an issue connecting to the Bible service. Please try again.';
  }
  return 'I encountered an error retrieving that information. Please try again.';
}

/** Format an error as an MCP tool error response */
export function handleToolError(error: Error) {
  return {
    content: [{ type: 'text' as const, text: getUserMessage(error) }],
    isError: true,
  };
}
