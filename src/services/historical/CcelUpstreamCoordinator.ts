/**
 * Shared admission and circuit policy for the dormant CCEL discovery adapter.
 *
 * The coordinator deliberately accepts no query, URL, response body, snippet,
 * or client identifier. A caller reserves an upstream attempt first, performs
 * at most one fetch elsewhere, then reports only the bounded outcome enum.
 */

export const CCEL_UPSTREAM_MIN_INTERVAL_MS = 10_000;
export const CCEL_UPSTREAM_MAX_RETRY_AFTER_SECONDS = 86_400;
export const CCEL_UPSTREAM_HALF_OPEN_LEASE_MS = 30_000;
export const CCEL_UPSTREAM_TRANSIENT_BASE_MS = 30_000;
export const CCEL_UPSTREAM_TRANSIENT_MAX_MS = 10 * 60_000;

export type CcelCoordinatorCircuitState =
  | 'closed'
  | 'transient_backoff'
  | 'rate_limited'
  | 'latched_policy'
  | 'latched_interface';

export interface CcelAdmissionToken {
  attemptId: number;
  operatorEpoch: number;
}

export type CcelAdmissionDecision =
  | { kind: 'disabled' }
  | {
      kind: 'admitted';
      token: CcelAdmissionToken;
      admittedAtMs: number;
      nextAllowedAtMs: number;
      probe: boolean;
    }
  | {
      kind: 'busy';
      reason: 'minimum_interval' | 'backoff' | 'probe_in_flight';
      retryAfterSeconds: number;
    }
  | {
      kind: 'latched';
      reason: 'policy' | 'interface';
      operatorAction: 'reset_after_review';
    };

export type CcelAttemptOutcome =
  | { kind: 'success' }
  | { kind: 'transient_failure' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'policy_failure' }
  | { kind: 'interface_failure' };

export interface CcelOutcomeRecord {
  applied: boolean;
  state: CcelCoordinatorCircuitState;
}

export interface CcelCoordinatorSnapshot {
  state: CcelCoordinatorCircuitState;
  nextAllowedAtMs: number;
  backoffUntilMs: number;
  lastObservedAtMs: number;
  attemptSequence: number;
  operatorEpoch: number;
  transientFailures: number;
  probeInFlight: boolean;
  probeLeaseUntilMs: number;
}

/** Structured telemetry contracts; emitters must not add raw request fields. */
export type CcelCoordinatorEvent =
  | {
      event: 'theologai.ccel.coordinator.admission';
      decision: CcelAdmissionDecision['kind'];
      state: CcelCoordinatorCircuitState;
      probe?: boolean;
      retryAfterSeconds?: number;
    }
  | {
      event: 'theologai.ccel.coordinator.outcome';
      outcome: CcelAttemptOutcome['kind'];
      applied: boolean;
      state: CcelCoordinatorCircuitState;
    }
  | {
      event: 'theologai.ccel.coordinator.operator_reset';
      state: 'closed';
    };

export interface CcelUpstreamCoordinator {
  admit(): Promise<CcelAdmissionDecision>;
  recordOutcome(
    token: CcelAdmissionToken,
    outcome: CcelAttemptOutcome,
  ): Promise<CcelOutcomeRecord>;
  snapshot(): Promise<CcelCoordinatorSnapshot>;
}

export interface CcelOperatorUpstreamCoordinator extends CcelUpstreamCoordinator {
  resetAfterOperatorReview(): Promise<CcelCoordinatorSnapshot>;
}

/** Persistence shape. Every field is circuit/timing metadata, never content. */
export interface CcelCoordinatorPersistenceState {
  state: CcelCoordinatorCircuitState;
  nextAllowedAtMs: number;
  backoffUntilMs: number;
  lastObservedAtMs: number;
  attemptSequence: number;
  lastOutcomeSequence: number;
  operatorEpoch: number;
  transientFailures: number;
  probeAttemptId: number | null;
  probeLeaseUntilMs: number;
}

export type Clock = () => number;

export function initialCcelCoordinatorState(): CcelCoordinatorPersistenceState {
  return {
    state: 'closed',
    nextAllowedAtMs: 0,
    backoffUntilMs: 0,
    lastObservedAtMs: 0,
    attemptSequence: 0,
    lastOutcomeSequence: 0,
    operatorEpoch: 0,
    transientFailures: 0,
    probeAttemptId: null,
    probeLeaseUntilMs: 0,
  };
}

export interface CcelAdmissionTransition {
  state: CcelCoordinatorPersistenceState;
  decision: Exclude<CcelAdmissionDecision, { kind: 'disabled' }>;
}

export function transitionCcelAdmission(
  previous: CcelCoordinatorPersistenceState,
  wallNowMs: number,
): CcelAdmissionTransition {
  const state = validateAndCloneState(previous);
  const now = observeMonotonicTime(state, wallNowMs);

  if (state.state === 'latched_policy' || state.state === 'latched_interface') {
    return {
      state,
      decision: {
        kind: 'latched',
        reason: state.state === 'latched_policy' ? 'policy' : 'interface',
        operatorAction: 'reset_after_review',
      },
    };
  }

  const intervalBlocked = now < state.nextAllowedAtMs;
  const backoffBlocked = now < state.backoffUntilMs;
  if (intervalBlocked || backoffBlocked) {
    const blockedUntil = Math.max(state.nextAllowedAtMs, state.backoffUntilMs);
    return {
      state,
      decision: {
        kind: 'busy',
        reason: backoffBlocked ? 'backoff' : 'minimum_interval',
        retryAfterSeconds: boundedRetryAfterSeconds(blockedUntil - now),
      },
    };
  }

  const probe = state.state !== 'closed';
  if (probe && state.probeAttemptId !== null && now < state.probeLeaseUntilMs) {
    return {
      state,
      decision: {
        kind: 'busy',
        reason: 'probe_in_flight',
        retryAfterSeconds: boundedRetryAfterSeconds(state.probeLeaseUntilMs - now),
      },
    };
  }

  if (state.attemptSequence >= Number.MAX_SAFE_INTEGER) {
    state.state = 'latched_interface';
    state.backoffUntilMs = 0;
    clearProbe(state);
    return {
      state,
      decision: {
        kind: 'latched',
        reason: 'interface',
        operatorAction: 'reset_after_review',
      },
    };
  }

  const attemptId = state.attemptSequence + 1;
  state.attemptSequence = attemptId;
  state.nextAllowedAtMs = safeTimestampAdd(now, CCEL_UPSTREAM_MIN_INTERVAL_MS);
  if (probe) {
    state.probeAttemptId = attemptId;
    state.probeLeaseUntilMs = safeTimestampAdd(now, CCEL_UPSTREAM_HALF_OPEN_LEASE_MS);
  } else {
    state.probeAttemptId = null;
    state.probeLeaseUntilMs = 0;
  }

  return {
    state,
    decision: {
      kind: 'admitted',
      token: { attemptId, operatorEpoch: state.operatorEpoch },
      admittedAtMs: now,
      nextAllowedAtMs: state.nextAllowedAtMs,
      probe,
    },
  };
}

export interface CcelOutcomeTransition {
  state: CcelCoordinatorPersistenceState;
  result: CcelOutcomeRecord;
}

export function transitionCcelOutcome(
  previous: CcelCoordinatorPersistenceState,
  token: CcelAdmissionToken,
  outcome: CcelAttemptOutcome,
  wallNowMs: number,
): CcelOutcomeTransition {
  const state = validateAndCloneState(previous);
  validateAdmissionToken(token);
  validateOutcome(outcome);
  const now = observeMonotonicTime(state, wallNowMs);

  if (token.operatorEpoch !== state.operatorEpoch) return outcomeResult(state, false);
  if (token.attemptId > state.attemptSequence) {
    throw new Error('Invalid CCEL admission token.');
  }
  if (state.state === 'latched_policy' || state.state === 'latched_interface') {
    return outcomeResult(state, false);
  }

  if (outcome.kind === 'policy_failure' || outcome.kind === 'interface_failure') {
    state.state = outcome.kind === 'policy_failure' ? 'latched_policy' : 'latched_interface';
    state.backoffUntilMs = 0;
    clearProbe(state);
    state.lastOutcomeSequence = Math.max(state.lastOutcomeSequence, token.attemptId);
    return outcomeResult(state, true);
  }

  if (outcome.kind === 'rate_limited') {
    const retryMs = outcome.retryAfterSeconds * 1_000;
    state.state = 'rate_limited';
    state.backoffUntilMs = Math.max(state.backoffUntilMs, safeTimestampAdd(now, retryMs));
    clearProbe(state);
    state.lastOutcomeSequence = Math.max(state.lastOutcomeSequence, token.attemptId);
    return outcomeResult(state, true);
  }

  const matchingProbe = state.probeAttemptId === token.attemptId;
  if (outcome.kind === 'success') {
    if (state.state === 'closed') {
      if (token.attemptId < state.lastOutcomeSequence) return outcomeResult(state, false);
      state.lastOutcomeSequence = token.attemptId;
      state.transientFailures = 0;
      return outcomeResult(state, true);
    }
    if (!matchingProbe) return outcomeResult(state, false);
    state.state = 'closed';
    state.backoffUntilMs = 0;
    state.transientFailures = 0;
    state.lastOutcomeSequence = Math.max(state.lastOutcomeSequence, token.attemptId);
    clearProbe(state);
    return outcomeResult(state, true);
  }

  const mayApplyTransient = state.state === 'closed'
    ? token.attemptId >= state.lastOutcomeSequence
    : matchingProbe;
  if (!mayApplyTransient) return outcomeResult(state, false);
  state.transientFailures = Math.min(state.transientFailures + 1, 31);
  const backoffMs = Math.min(
    CCEL_UPSTREAM_TRANSIENT_MAX_MS,
    CCEL_UPSTREAM_TRANSIENT_BASE_MS * (2 ** Math.min(state.transientFailures - 1, 10)),
  );
  state.state = 'transient_backoff';
  state.backoffUntilMs = safeTimestampAdd(now, backoffMs);
  state.lastOutcomeSequence = Math.max(state.lastOutcomeSequence, token.attemptId);
  clearProbe(state);
  return outcomeResult(state, true);
}

export function resetCcelCoordinatorState(
  previous: CcelCoordinatorPersistenceState,
  wallNowMs: number,
): CcelCoordinatorPersistenceState {
  const state = validateAndCloneState(previous);
  const now = observeMonotonicTime(state, wallNowMs);
  if (state.operatorEpoch >= Number.MAX_SAFE_INTEGER) {
    throw new Error('CCEL coordinator operator epoch is exhausted.');
  }
  return {
    ...initialCcelCoordinatorState(),
    // Operator recovery clears the circuit but cannot bypass an already
    // reserved origin interval.
    nextAllowedAtMs: state.nextAllowedAtMs,
    lastObservedAtMs: now,
    operatorEpoch: state.operatorEpoch + 1,
  };
}

export function snapshotCcelCoordinatorState(
  state: CcelCoordinatorPersistenceState,
): CcelCoordinatorSnapshot {
  const current = validateAndCloneState(state);
  return {
    state: current.state,
    nextAllowedAtMs: current.nextAllowedAtMs,
    backoffUntilMs: current.backoffUntilMs,
    lastObservedAtMs: current.lastObservedAtMs,
    attemptSequence: current.attemptSequence,
    operatorEpoch: current.operatorEpoch,
    transientFailures: current.transientFailures,
    probeInFlight: current.probeAttemptId !== null,
    probeLeaseUntilMs: current.probeLeaseUntilMs,
  };
}

/**
 * Strict process-local coordinator for Node deployments.
 *
 * It is disabled by default and coordinates only callers sharing this exact
 * instance in one OS process. Separate Node processes are intentionally not
 * coordinated; remote Workers use the Durable Object implementation instead.
 */
export class ProcessLocalCcelUpstreamCoordinator implements CcelOperatorUpstreamCoordinator {
  private state = initialCcelCoordinatorState();
  private serial: Promise<void> = Promise.resolve();
  private readonly enabled: boolean;
  private readonly now: Clock;

  constructor(options: { enabled?: boolean; now?: Clock } = {}) {
    this.enabled = options.enabled === true;
    this.now = options.now ?? Date.now;
  }

  admit(): Promise<CcelAdmissionDecision> {
    if (!this.enabled) return Promise.resolve({ kind: 'disabled' });
    return this.exclusive(() => {
      const transition = transitionCcelAdmission(this.state, this.readClock());
      this.state = transition.state;
      return transition.decision;
    });
  }

  recordOutcome(
    token: CcelAdmissionToken,
    outcome: CcelAttemptOutcome,
  ): Promise<CcelOutcomeRecord> {
    if (!this.enabled) {
      return Promise.resolve({ applied: false, state: this.state.state });
    }
    return this.exclusive(() => {
      const transition = transitionCcelOutcome(this.state, token, outcome, this.readClock());
      this.state = transition.state;
      return transition.result;
    });
  }

  snapshot(): Promise<CcelCoordinatorSnapshot> {
    return this.exclusive(() => snapshotCcelCoordinatorState(this.state));
  }

  resetAfterOperatorReview(): Promise<CcelCoordinatorSnapshot> {
    return this.exclusive(() => {
      this.state = resetCcelCoordinatorState(this.state, this.readClock());
      return snapshotCcelCoordinatorState(this.state);
    });
  }

  private readClock(): number {
    return this.now();
  }

  private exclusive<T>(operation: () => T): Promise<T> {
    const run = this.serial.then(operation, operation);
    this.serial = run.then(() => undefined, () => undefined);
    return run;
  }
}

function observeMonotonicTime(state: CcelCoordinatorPersistenceState, wallNowMs: number): number {
  const now = normalizeTimestamp(wallNowMs, 'clock');
  const observed = Math.max(state.lastObservedAtMs, now);
  state.lastObservedAtMs = observed;
  return observed;
}

function boundedRetryAfterSeconds(remainingMs: number): number {
  return Math.max(1, Math.min(
    CCEL_UPSTREAM_MAX_RETRY_AFTER_SECONDS,
    Math.ceil(Math.max(0, remainingMs) / 1_000),
  ));
}

function safeTimestampAdd(timestamp: number, durationMs: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, timestamp + durationMs);
}

function clearProbe(state: CcelCoordinatorPersistenceState): void {
  state.probeAttemptId = null;
  state.probeLeaseUntilMs = 0;
}

function outcomeResult(
  state: CcelCoordinatorPersistenceState,
  applied: boolean,
): CcelOutcomeTransition {
  return { state, result: { applied, state: state.state } };
}

function validateAdmissionToken(token: CcelAdmissionToken): void {
  if (!isPlainObject(token) || Object.keys(token).sort().join(',') !== 'attemptId,operatorEpoch') {
    throw new Error('Invalid CCEL admission token.');
  }
  if (!isNonNegativeSafeInteger(token.operatorEpoch)
      || !Number.isSafeInteger(token.attemptId)
      || token.attemptId < 1) {
    throw new Error('Invalid CCEL admission token.');
  }
}

function validateOutcome(outcome: CcelAttemptOutcome): void {
  if (!isPlainObject(outcome) || typeof outcome.kind !== 'string') {
    throw new Error('Invalid CCEL attempt outcome.');
  }
  const keys = Object.keys(outcome).sort().join(',');
  if (outcome.kind === 'rate_limited') {
    if (keys !== 'kind,retryAfterSeconds'
        || !Number.isSafeInteger(outcome.retryAfterSeconds)
        || outcome.retryAfterSeconds < 1
        || outcome.retryAfterSeconds > CCEL_UPSTREAM_MAX_RETRY_AFTER_SECONDS) {
      throw new Error('Invalid CCEL Retry-After value.');
    }
    return;
  }
  if (keys !== 'kind' || ![
    'success',
    'transient_failure',
    'policy_failure',
    'interface_failure',
  ].includes(outcome.kind)) {
    throw new Error('Invalid CCEL attempt outcome.');
  }
}

function validateAndCloneState(
  state: CcelCoordinatorPersistenceState,
): CcelCoordinatorPersistenceState {
  if (!isPlainObject(state) || ![
    'closed',
    'transient_backoff',
    'rate_limited',
    'latched_policy',
    'latched_interface',
  ].includes(state.state)) {
    throw new Error('Invalid persisted CCEL coordinator state.');
  }
  const numericFields: Array<keyof CcelCoordinatorPersistenceState> = [
    'nextAllowedAtMs',
    'backoffUntilMs',
    'lastObservedAtMs',
    'attemptSequence',
    'lastOutcomeSequence',
    'operatorEpoch',
    'transientFailures',
    'probeLeaseUntilMs',
  ];
  for (const field of numericFields) {
    if (!isNonNegativeSafeInteger(state[field])) {
      throw new Error(`Invalid persisted CCEL coordinator field: ${field}.`);
    }
  }
  if (state.probeAttemptId !== null
      && (!Number.isSafeInteger(state.probeAttemptId) || state.probeAttemptId < 1)) {
    throw new Error('Invalid persisted CCEL coordinator probe.');
  }
  return { ...state };
}

function normalizeTimestamp(value: number, field: string): number {
  if (!isNonNegativeSafeInteger(value)) throw new Error(`Invalid CCEL coordinator ${field}.`);
  return value;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
