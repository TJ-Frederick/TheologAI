import { exceedsMcpInputLimits, MCP_MAX_REQUEST_BODY_BYTES } from '../../mcp/inputLimits.js';

export async function readBoundedWorkerRequest(
  request: Request,
  maxBytes: number,
): Promise<Request | null> {
  if (request.method !== 'POST' || !request.body) return request;
  maxBytes = Math.min(maxBytes, MCP_MAX_REQUEST_BODY_BYTES);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel('MCP request body exceeds configured limit');
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    // Preserve the SDK's existing JSON parse-error response.
    return new Request(request, { body });
  }
  if (exceedsMcpInputLimits(parsed)) return null;

  return new Request(request, { body });
}
