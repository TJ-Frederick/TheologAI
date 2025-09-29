export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

export class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
  }
}

export function getUserMessage(error: Error): string {
  if (error instanceof RateLimitError) {
    return "I'm temporarily limited on Bible API requests. Try again in a few minutes.";
  }
  if (error instanceof ValidationError) {
    return `Invalid reference format. Try something like "John 3:16" or "Genesis 1:1-5"`;
  }
  if (error instanceof APIError) {
    return "I encountered an issue connecting to the Bible service. Please try again.";
  }
  return "I encountered an error retrieving that information. Please try again.";
}

export function handleToolError(error: Error) {
  console.error('[ERROR]', error.message);

  return {
    content: [{
      type: 'text' as const,
      text: getUserMessage(error)
    }],
    isError: true
  };
}