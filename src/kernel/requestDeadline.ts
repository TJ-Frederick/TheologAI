/** Request-local deadline composition shared by Node and Worker handlers. */

export class RequestDeadlineExceededError extends Error {
  constructor() {
    super('Request deadline exceeded.');
    this.name = 'RequestDeadlineExceededError';
  }
}

export interface RequestDeadline {
  signal: AbortSignal;
  dispose(): void;
}

export function createRequestDeadline(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): RequestDeadline {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('timeoutMs must be a positive safe integer');
  }

  const controller = new AbortController();
  const abortFromParent = () => controller.abort(abortReason(parentSignal));
  parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  if (parentSignal?.aborted) abortFromParent();

  const timeout = setTimeout(() => {
    controller.abort(new RequestDeadlineExceededError());
  }, timeoutMs);

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

function abortReason(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException('The request was aborted.', 'AbortError');
}
