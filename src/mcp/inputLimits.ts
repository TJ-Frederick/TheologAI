/** Limits for untrusted requests, independent of the schemas used for output. */
export const MCP_MAX_REQUEST_BODY_BYTES = 64 * 1024;
export const MCP_INPUT_LIMITS = {
  depth: 16,
  entries: 1024,
  containerEntries: 128,
  stringLength: 16 * 1024,
  keyLength: 256,
} as const;
export const MCP_INPUT_LIMIT_MESSAGE = 'Request exceeds input complexity limits';

/**
 * Walk without recursion or unbounded key/value arrays. Count entries when
 * scheduling them so both the traversal and its work queue remain bounded.
 * Cycles supplied by in-process callers also terminate at the entry budget.
 */
export function exceedsMcpInputLimits(input: unknown): boolean {
  const pending = [{ value: input, depth: 0 }];
  let entries = 0;
  while (pending.length > 0) {
    const { value, depth } = pending.pop()!;
    if (depth > MCP_INPUT_LIMITS.depth) return true;
    if (typeof value === 'string' && value.length > MCP_INPUT_LIMITS.stringLength) return true;
    if (value === null || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      if (value.length > MCP_INPUT_LIMITS.containerEntries) return true;
      for (const item of value) {
        if (++entries > MCP_INPUT_LIMITS.entries) return true;
        pending.push({ value: item, depth: depth + 1 });
      }
    } else {
      let keys = 0;
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        if (++keys > MCP_INPUT_LIMITS.containerEntries
          || ++entries > MCP_INPUT_LIMITS.entries
          || key.length > MCP_INPUT_LIMITS.keyLength) return true;
        pending.push({ value: (value as Record<string, unknown>)[key], depth: depth + 1 });
      }
    }
  }
  return false;
}
