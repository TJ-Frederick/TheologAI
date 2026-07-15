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

/** Payment / donation verification failure */
export class PaymentError extends TheologAIError {
  constructor(
    message: string,
    public readonly txHash?: string,
  ) {
    super(message);
    this.name = 'PaymentError';
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
    if (error.resource === 'adapter' || containsImplementationDetail(error.message)) {
      return 'Unavailable: The requested source is not available in this runtime. Try another supported option.';
    }
    if (error.resource === 'commentator') {
      return 'Unsupported coverage: This commentator is not supported for the requested lookup. Use one of the advertised commentators.';
    }
    return error.message;
  }
  if (error instanceof PaymentError) {
    return error.txHash
      ? `Payment verification failed for tx ${error.txHash}: ${error.message}`
      : `Payment error: ${error.message}`;
  }
  if (error instanceof AdapterError) {
    return getAdapterUserMessage(error.message);
  }
  if (error instanceof APIError) {
    if (error.status === 404) return 'Not found: No matching content was found.';
    if (error.status === 401 || error.status === 403) {
      return 'Unavailable: The requested source is not available in this runtime. Try another supported option.';
    }
    return 'Unavailable: The requested source is temporarily unavailable. Please try again later.';
  }
  return 'I encountered an error retrieving that information. Please try again.';
}

/**
 * Adapter messages retain provider and request details for diagnostics, but
 * only a stable category is returned to clients.
 */
function getAdapterUserMessage(diagnosticMessage: string): string {
  const diagnosticDetail = diagnosticMessage.replace(/^\[[^\]]+\]\s*/, '');
  const detail = diagnosticDetail.toLowerCase();

  const exactCommentaryMiss = diagnosticDetail.match(/^No exact commentary match for (.+):\d+ in .+$/i);
  if (exactCommentaryMiss) {
    return `Not found: No trustworthy exact-verse commentary was available. Request the containing chapter (\`${exactCommentaryMiss[1]}\`) or try another commentator.`;
  }

  if (/unsupported|not supported|only available|unknown commentator|outside .*coverage/.test(detail)) {
    return 'Unsupported coverage: This request is outside the supported coverage.';
  }
  if (/error page returned|could not (?:find|parse|extract)/.test(detail)) {
    return 'Unavailable: The requested source is temporarily unavailable. Please try again later.';
  }
  if (/http 404|section not found|no (?:verses|passage|commentary)/.test(detail)) {
    return 'Not found: No matching content was found.';
  }
  if (/http (?:401|403)|not configured/.test(detail)) {
    return 'Unavailable: The requested source is not available in this runtime. Try another supported option.';
  }
  return 'Unavailable: The requested source is temporarily unavailable. Please try again later.';
}

function containsImplementationDetail(message: string): boolean {
  return /\b(?:adapter|provider|database|sqlite|d1|ccel|helloao|esv|net bible)\b|https?:\/\//i.test(message);
}

/** Format an error as an MCP tool error response */
export function handleToolError(error: Error): import('./types.js').ToolResult {
  return {
    content: [{ type: 'text' as const, text: getUserMessage(error) }],
    isError: true,
  };
}
