import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  CCEL_OPERATOR_PATH,
  CCEL_OPERATOR_RESET_CONFIRMATION,
  handleCcelOperatorRequest,
} from '../../../../src/http/worker/ccelOperator.js';

const secret = 'operator-test-secret-that-is-at-least-32-characters';
const versionId = '123e4567-e89b-42d3-a456-426614174000';
const baseSnapshot = {
  state: 'latched_policy' as const, nextAllowedAtMs: 10_000, backoffUntilMs: 0, lastObservedAtMs: 1,
  attemptSequence: 1, operatorEpoch: 3, transientFailures: 0, probeInFlight: false,
  probeLeaseUntilMs: 0, terminalAttemptCount: 1, terminalRetiredThroughAttemptId: 0,
};

function env(overrides: Record<string, unknown> = {}) {
  const stub = {
    snapshot: vi.fn().mockResolvedValue(baseSnapshot),
    resetAfterOperatorReview: vi.fn().mockImplementation(async (state: string, epoch: number) => state === 'latched_policy' && epoch === 3
      ? { applied: true, reason: 'applied', snapshot: { ...baseSnapshot, state: 'closed', operatorEpoch: 4 } }
      : { applied: false, reason: 'epoch_mismatch', snapshot: baseSnapshot }),
  };
  return {
    value: {
      THEOLOGAI_CCEL_OPERATOR_TOKEN: secret,
      CF_VERSION_METADATA: { id: versionId, tag: '', timestamp: '' },
      THEOLOGAI_CCEL_OPERATOR_AUTH_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
      THEOLOGAI_CCEL_COORDINATOR: { idFromName: vi.fn().mockReturnValue('id'), get: vi.fn().mockReturnValue(stub) },
      ...overrides,
    } as never,
    stub,
  };
}

function signed(body: string, overrides: Record<string, string> = {}): Request {
  const timestamp = String(Date.now());
  const nonce = 'abcdefghijklmnopqrstuvwxyzABCDEF';
  const message = `POST\n${CCEL_OPERATOR_PATH}\n${timestamp}\n${nonce}\n${body}`;
  return new Request(`https://mcp.theologai.xyz${CCEL_OPERATOR_PATH}`, {
    method: 'POST', body,
    headers: {
      'Content-Type': 'application/json', 'X-TheologAI-Timestamp': timestamp,
      'X-TheologAI-Nonce': nonce,
      'X-TheologAI-Signature': createHmac('sha256', secret).update(message).digest('hex'),
      'CF-Connecting-IP': '192.0.2.44',
      'User-Agent': 'theologai-operator-test/1.0',
      ...overrides,
    },
  });
}

describe('CCEL operator route', () => {
  it('is inert without a provisioned secret and returns the same 404 for malformed auth', async () => {
    const body = JSON.stringify({ action: 'snapshot', workerVersionId: versionId });
    const absent = await handleCcelOperatorRequest(signed(body), env({ THEOLOGAI_CCEL_OPERATOR_TOKEN: undefined }).value);
    const malformed = await handleCcelOperatorRequest(signed(body, { 'X-TheologAI-Signature': '0'.repeat(64) }), env().value);
    expect(await responseShape(absent!)).toEqual(await responseShape(malformed!));
    expect(absent!.status).toBe(404);
    const queryRequest = new Request(`${signed(body).url}?action=snapshot`, signed(body));
    expect((await handleCcelOperatorRequest(queryRequest, env().value))?.status).toBe(404);
  });

  it('requires exact live version metadata and exposes no CORS', async () => {
    const body = JSON.stringify({ action: 'snapshot', workerVersionId: versionId });
    const { value, stub } = env();
    const response = await handleCcelOperatorRequest(signed(body), value);
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(stub.snapshot).toHaveBeenCalledOnce();
    const stale = JSON.stringify({ action: 'snapshot', workerVersionId: '223e4567-e89b-42d3-a456-426614174000' });
    expect((await handleCcelOperatorRequest(signed(stale), value))?.status).toBe(404);
  });

  it('fails closed at a distinct hashed pre-auth budget without consuming another fingerprint', async () => {
    const body = JSON.stringify({ action: 'snapshot', workerVersionId: versionId });
    const blocked = env({ THEOLOGAI_CCEL_OPERATOR_AUTH_LIMITER: { limit: vi.fn().mockResolvedValue({ success: false }) } });
    const response = await handleCcelOperatorRequest(signed(body), blocked.value);
    expect(response?.status).toBe(404);
    expect(blocked.stub.snapshot).not.toHaveBeenCalled();

    const allowed = env();
    await handleCcelOperatorRequest(signed(body), allowed.value);
    const limiter = (allowed.value as any).THEOLOGAI_CCEL_OPERATOR_AUTH_LIMITER.limit;
    const key = limiter.mock.calls[0][0].key as string;
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain('192.0.2.44');
    expect(key).not.toContain('theologai-operator-test');
    expect(allowed.stub.snapshot).toHaveBeenCalledOnce();
  });

  it('passes exact state and epoch so a reset replay is rejected atomically', async () => {
    const body = JSON.stringify({
      action: 'reset', workerVersionId: versionId, expectedState: 'latched_policy', expectedOperatorEpoch: 3,
      confirmation: CCEL_OPERATOR_RESET_CONFIRMATION,
    });
    const { value, stub } = env();
    expect((await handleCcelOperatorRequest(signed(body), value))?.status).toBe(200);
    stub.resetAfterOperatorReview.mockResolvedValueOnce({ applied: false, reason: 'epoch_mismatch', snapshot: { ...baseSnapshot, state: 'closed', operatorEpoch: 4 } });
    expect((await handleCcelOperatorRequest(signed(body), value))?.status).toBe(409);
  });
});

async function responseShape(response: Response) {
  return { status: response.status, headers: [...response.headers], body: await response.text() };
}
