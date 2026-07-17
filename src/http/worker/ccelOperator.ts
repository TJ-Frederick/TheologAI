import type { Env } from '../../worker-env.js';
import type {
  CcelCoordinatorCircuitState,
  CcelCoordinatorSnapshot,
  CcelOperatorResetResult,
} from '../../services/historical/CcelUpstreamCoordinator.js';

export const CCEL_OPERATOR_PATH = '/internal/ccel-coordinator';
export const CCEL_OPERATOR_MAX_BODY_BYTES = 2_048;
export const CCEL_OPERATOR_MAX_CLOCK_SKEW_MS = 5 * 60_000;
export const CCEL_OPERATOR_RESET_CONFIRMATION = 'RESET LATCHED CCEL COORDINATOR';
const COORDINATOR_INSTANCE = 'ccel-public-search-origin-v1';
const encoder = new TextEncoder();

type OperatorRequest =
  | { action: 'snapshot'; workerVersionId: string }
  | {
      action: 'reset';
      workerVersionId: string;
      expectedState: 'latched_policy' | 'latched_interface';
      expectedOperatorEpoch: number;
      confirmation: typeof CCEL_OPERATOR_RESET_CONFIRMATION;
    };

type OperatorStub = {
  snapshot(): Promise<CcelCoordinatorSnapshot>;
  resetAfterOperatorReview(
    expectedState: 'latched_policy' | 'latched_interface',
    expectedOperatorEpoch: number,
  ): Promise<CcelOperatorResetResult>;
};

/** Return undefined for non-operator paths; every operator failure is the same 404. */
export async function handleCcelOperatorRequest(request: Request, env: Env): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (url.pathname !== CCEL_OPERATOR_PATH) return undefined;
  const notFound = () => new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
  try {
    if (url.search !== '' || request.method !== 'POST' || request.headers.has('Origin')) return notFound();
    if (request.headers.get('Content-Type')?.trim().toLowerCase() !== 'application/json') return notFound();
    const declaredLength = request.headers.get('Content-Length');
    if (declaredLength !== null && (!/^\d{1,4}$/.test(declaredLength) || Number(declaredLength) > CCEL_OPERATOR_MAX_BODY_BYTES)) {
      return notFound();
    }
    const secret = env.THEOLOGAI_CCEL_OPERATOR_TOKEN;
    const versionId = env.CF_VERSION_METADATA?.id;
    if (typeof secret !== 'string' || secret.length < 32 || secret.length > 512 || !isUuid(versionId)) return notFound();
    if (!await allowOperatorAuthAttempt(request, env)) return notFound();

    const timestamp = request.headers.get('X-TheologAI-Timestamp');
    const nonce = request.headers.get('X-TheologAI-Nonce');
    const signature = request.headers.get('X-TheologAI-Signature');
    if (!timestamp || !/^\d{13}$/.test(timestamp)
      || !nonce || !/^[A-Za-z0-9_-]{32,128}$/.test(nonce)
      || !signature || !/^[a-f0-9]{64}$/.test(signature)) return notFound();
    const timestampMs = Number(timestamp);
    if (!Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > CCEL_OPERATOR_MAX_CLOCK_SKEW_MS) return notFound();

    const bodyBytes = await readBoundedBody(request);
    if (!bodyBytes) return notFound();
    const signed = encoder.encode(`${request.method}\n${CCEL_OPERATOR_PATH}\n${timestamp}\n${nonce}\n`);
    const message = new Uint8Array(signed.byteLength + bodyBytes.byteLength);
    message.set(signed);
    message.set(bodyBytes, signed.byteLength);
    if (!await verifyHmac(secret, message, signature)) return notFound();

    const parsed = parseOperatorRequest(new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes), versionId);
    if (!parsed) return notFound();
    const stub = env.THEOLOGAI_CCEL_COORDINATOR.get(
      env.THEOLOGAI_CCEL_COORDINATOR.idFromName(COORDINATOR_INSTANCE),
    ) as unknown as OperatorStub;
    if (parsed.action === 'snapshot') {
      const snapshot = await stub.snapshot();
      logOperatorEvent('snapshot', 'observed', snapshot.state, snapshot.operatorEpoch, versionId);
      return jsonResponse({ action: 'snapshot', workerVersionId: versionId, snapshot });
    }
    const result = await stub.resetAfterOperatorReview(parsed.expectedState, parsed.expectedOperatorEpoch);
    logOperatorEvent('reset', result.reason, result.snapshot.state, result.snapshot.operatorEpoch, versionId);
    return jsonResponse({ action: 'reset', workerVersionId: versionId, ...result }, result.applied ? 200 : 409);
  } catch {
    return notFound();
  }
}

async function allowOperatorAuthAttempt(request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP');
  const userAgent = request.headers.get('User-Agent');
  if (!ip || ip.length > 64 || !userAgent || userAgent.length > 256) return false;
  try {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${ip}\n${userAgent}`));
    const key = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const decision = await env.THEOLOGAI_CCEL_OPERATOR_AUTH_LIMITER.limit({ key });
    return decision.success === true;
  } catch {
    // Operator authentication is fail closed; ordinary MCP limiting remains
    // independently fail open and does not share this namespace or keyspace.
    return false;
  }
}

function parseOperatorRequest(body: string, liveVersionId: string): OperatorRequest | undefined {
  let value: unknown;
  try { value = JSON.parse(body); } catch { return undefined; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.action === 'snapshot') {
    if (exactKeys(record, ['action', 'workerVersionId']) && record.workerVersionId === liveVersionId) {
      return { action: 'snapshot', workerVersionId: liveVersionId };
    }
    return undefined;
  }
  if (record.action !== 'reset'
    || !exactKeys(record, ['action', 'confirmation', 'expectedOperatorEpoch', 'expectedState', 'workerVersionId'])
    || record.workerVersionId !== liveVersionId
    || (record.expectedState !== 'latched_policy' && record.expectedState !== 'latched_interface')
    || !Number.isSafeInteger(record.expectedOperatorEpoch) || (record.expectedOperatorEpoch as number) < 0
    || record.confirmation !== CCEL_OPERATOR_RESET_CONFIRMATION) return undefined;
  return record as OperatorRequest;
}

function exactKeys(record: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(record).sort().join(',') === [...keys].sort().join(',');
}

async function readBoundedBody(request: Request): Promise<Uint8Array | undefined> {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > CCEL_OPERATOR_MAX_BODY_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

async function verifyHmac(secret: string, message: Uint8Array, signatureHex: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, fromHex(signatureHex) as BufferSource, message as BufferSource);
}

function fromHex(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index++) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function logOperatorEvent(
  action: 'snapshot' | 'reset', outcome: string, state: CcelCoordinatorCircuitState,
  operatorEpoch: number, workerVersionId: string,
): void {
  console.info(JSON.stringify({
    event: 'theologai.ccel.coordinator.operator', action, outcome, state, operatorEpoch, workerVersionId,
  }));
}
