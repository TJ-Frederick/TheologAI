import { createHmac, randomBytes } from 'node:crypto';

const PATH = '/internal/ccel-coordinator';
const PRODUCTION_ENDPOINT = `https://mcp.theologai.xyz${PATH}`;
const RESET_CONFIRMATION = 'RESET LATCHED CCEL COORDINATOR';

export interface OperatorCliOptions {
  endpoint: string;
  action: 'snapshot' | 'reset';
  workerVersionId: string;
  expectedState?: 'latched_policy' | 'latched_interface';
  expectedOperatorEpoch?: number;
}

export function parseOperatorCli(argv: string[]): OperatorCliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined || values.has(key)) throw new Error('Invalid operator arguments.');
    values.set(key, value);
  }
  const allowed = new Set(['--endpoint', '--action', '--worker-version-id', '--expected-state', '--expected-operator-epoch']);
  if ([...values.keys()].some(key => !allowed.has(key))) throw new Error('Unknown operator argument.');
  const endpoint = values.get('--endpoint');
  const action = values.get('--action');
  const workerVersionId = values.get('--worker-version-id');
  if (endpoint !== PRODUCTION_ENDPOINT || (action !== 'snapshot' && action !== 'reset')
    || !workerVersionId || !isUuid(workerVersionId)) throw new Error('Endpoint, action, or Worker version is invalid.');
  const result: OperatorCliOptions = { endpoint, action, workerVersionId };
  if (action === 'reset') {
    const expectedState = values.get('--expected-state');
    const epochText = values.get('--expected-operator-epoch');
    const expectedOperatorEpoch = epochText === undefined ? Number.NaN : Number(epochText);
    if ((expectedState !== 'latched_policy' && expectedState !== 'latched_interface')
      || !Number.isSafeInteger(expectedOperatorEpoch) || expectedOperatorEpoch < 0) throw new Error('Reset requires exact latched state and operator epoch.');
    result.expectedState = expectedState;
    result.expectedOperatorEpoch = expectedOperatorEpoch;
  } else if (values.has('--expected-state') || values.has('--expected-operator-epoch')) {
    throw new Error('Snapshot does not accept reset preconditions.');
  }
  return result;
}

export async function runOperatorRequest(options: OperatorCliOptions, secret: string, fetchImpl = fetch): Promise<unknown> {
  if (secret.length < 32 || secret.length > 512) throw new Error('Operator secret is absent or malformed.');
  const body = JSON.stringify(options.action === 'snapshot'
    ? { action: 'snapshot', workerVersionId: options.workerVersionId }
    : {
        action: 'reset', workerVersionId: options.workerVersionId,
        expectedState: options.expectedState, expectedOperatorEpoch: options.expectedOperatorEpoch,
        confirmation: RESET_CONFIRMATION,
      });
  const timestamp = String(Date.now());
  const nonce = randomBytes(24).toString('base64url');
  const message = `POST\n${PATH}\n${timestamp}\n${nonce}\n${body}`;
  const signature = createHmac('sha256', secret).update(message).digest('hex');
  const response = await fetchImpl(options.endpoint, {
    method: 'POST', body,
    headers: {
      'Content-Type': 'application/json',
      'X-TheologAI-Timestamp': timestamp,
      'X-TheologAI-Nonce': nonce,
      'X-TheologAI-Signature': signature,
    },
  });
  const value = await readOperatorResponse(response);
  const validated = validateOperatorResponse(value, options);
  if (!validated) throw new Error('Operator response violated its closed contract.');
  if (!response.ok) throw new Error(`Operator request failed with HTTP ${response.status}.`);
  return validated;
}

type Snapshot = {
  state: 'closed' | 'transient_backoff' | 'rate_limited' | 'latched_policy' | 'latched_interface';
  nextAllowedAtMs: number; backoffUntilMs: number; lastObservedAtMs: number; attemptSequence: number;
  operatorEpoch: number; transientFailures: number; probeInFlight: boolean; probeLeaseUntilMs: number;
  terminalAttemptCount: number; terminalRetiredThroughAttemptId: number;
};

async function readOperatorResponse(response: Response): Promise<unknown> {
  const maximum = 16_384;
  const declared = response.headers.get('Content-Length');
  if (declared !== null && (!/^\d{1,5}$/.test(declared) || Number(declared) > maximum)) return undefined;
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); return undefined; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return undefined; }
}

function validateOperatorResponse(value: unknown, options: OperatorCliOptions): unknown | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.action !== options.action || record.workerVersionId !== options.workerVersionId) return undefined;
  if (options.action === 'snapshot') {
    return exactKeys(record, ['action', 'snapshot', 'workerVersionId']) && validSnapshot(record.snapshot) ? record : undefined;
  }
  if (!exactKeys(record, ['action', 'applied', 'reason', 'snapshot', 'workerVersionId']) || typeof record.applied !== 'boolean'
    || !['applied', 'state_mismatch', 'epoch_mismatch', 'not_latched'].includes(String(record.reason))
    || !validSnapshot(record.snapshot)) return undefined;
  const snapshot = record.snapshot as Snapshot;
  if (record.applied === true) {
    return record.reason === 'applied' && snapshot.state === 'closed'
      && snapshot.operatorEpoch === options.expectedOperatorEpoch! + 1 ? record : undefined;
  }
  if (record.reason === 'not_latched') {
    return snapshot.state !== 'latched_policy' && snapshot.state !== 'latched_interface' ? record : undefined;
  }
  if (record.reason === 'state_mismatch') {
    return (snapshot.state === 'latched_policy' || snapshot.state === 'latched_interface')
      && snapshot.state !== options.expectedState ? record : undefined;
  }
  if (record.reason === 'epoch_mismatch') {
    return snapshot.state === options.expectedState && snapshot.operatorEpoch !== options.expectedOperatorEpoch ? record : undefined;
  }
  return undefined;
}

function validSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, [
    'attemptSequence', 'backoffUntilMs', 'lastObservedAtMs', 'nextAllowedAtMs', 'operatorEpoch',
    'probeInFlight', 'probeLeaseUntilMs', 'state', 'terminalAttemptCount',
    'terminalRetiredThroughAttemptId', 'transientFailures',
  ])) return false;
  if (!['closed', 'transient_backoff', 'rate_limited', 'latched_policy', 'latched_interface'].includes(String(record.state))
    || typeof record.probeInFlight !== 'boolean') return false;
  return [
    record.nextAllowedAtMs, record.backoffUntilMs, record.lastObservedAtMs, record.attemptSequence,
    record.operatorEpoch, record.transientFailures, record.probeLeaseUntilMs,
    record.terminalAttemptCount, record.terminalRetiredThroughAttemptId,
  ].every(item => Number.isSafeInteger(item) && (item as number) >= 0);
}

function exactKeys(record: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(record).sort().join(',') === [...keys].sort().join(',');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseOperatorCli(process.argv.slice(2));
  const secret = process.env.THEOLOGAI_CCEL_OPERATOR_TOKEN ?? '';
  const result = await runOperatorRequest(options, secret);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
