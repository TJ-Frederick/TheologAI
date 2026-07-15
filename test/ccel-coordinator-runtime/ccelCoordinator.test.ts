import {
  env,
  runInDurableObject,
} from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { CcelAttemptOutcome } from '../../src/services/historical/CcelUpstreamCoordinator.js';

const terminalOutcomes: CcelAttemptOutcome[] = [
  { kind: 'success' },
  { kind: 'transient_failure' },
  { kind: 'rate_limited', retryAfterSeconds: 45 },
  { kind: 'policy_failure' },
  { kind: 'interface_failure' },
];

describe('CCEL global Durable Object coordinator', () => {
  it('synchronously reserves one of simultaneous admissions', async () => {
    const stub = env.THEOLOGAI_CCEL_COORDINATOR.getByName('simultaneous');
    const decisions = await Promise.all(Array.from({ length: 20 }, () => stub.admit()));
    expect(decisions.filter(decision => decision.kind === 'admitted')).toHaveLength(1);
    expect(decisions.filter(decision => decision.kind === 'busy')).toHaveLength(19);

    const snapshot = await stub.snapshot();
    expect(snapshot).toMatchObject({
      state: 'closed',
      attemptSequence: 1,
      probeInFlight: false,
    });
    expect(snapshot.nextAllowedAtMs - snapshot.lastObservedAtMs).toBeLessThanOrEqual(10_000);
    expect(snapshot.nextAllowedAtMs - snapshot.lastObservedAtMs).toBeGreaterThan(0);
  });

  it('persists admission and circuit state across independently acquired stubs', async () => {
    const firstStub = env.THEOLOGAI_CCEL_COORDINATOR.getByName('persistence');
    const admission = await firstStub.admit();
    expect(admission.kind).toBe('admitted');
    if (admission.kind !== 'admitted') throw new Error('expected admission');
    await firstStub.recordOutcome(admission.token, {
      kind: 'rate_limited',
      retryAfterSeconds: 120,
    });

    const reacquiredStub = env.THEOLOGAI_CCEL_COORDINATOR.getByName('persistence');
    await expect(reacquiredStub.snapshot()).resolves.toMatchObject({
      state: 'rate_limited',
      attemptSequence: 1,
      backoffUntilMs: expect.any(Number),
      terminalAttemptCount: 1,
    });
    await expect(reacquiredStub.recordOutcome(admission.token, {
      kind: 'rate_limited',
      retryAfterSeconds: 120,
    })).resolves.toMatchObject({ applied: false, disposition: 'duplicate' });
    await expect(reacquiredStub.recordOutcome(admission.token, {
      kind: 'rate_limited',
      retryAfterSeconds: 121,
    })).resolves.toMatchObject({ applied: false, disposition: 'conflict' });
    await expect(reacquiredStub.admit()).resolves.toMatchObject({
      kind: 'busy',
      reason: 'backoff',
      retryAfterSeconds: 120,
    });
  });

  it('stores only the reviewed circuit and timing columns', async () => {
    const stub = env.THEOLOGAI_CCEL_COORDINATOR.getByName('storage-shape');
    await stub.admit();

    await runInDurableObject(stub, async (_instance, state) => {
      const columns = state.storage.sql
        .exec<{ name: string }>('PRAGMA table_info(ccel_coordinator_state)')
        .toArray()
        .map(row => row.name);
      expect(columns).toEqual([
        'singleton',
        'state',
        'next_allowed_at_ms',
        'backoff_until_ms',
        'last_observed_at_ms',
        'attempt_sequence',
        'last_outcome_sequence',
        'operator_epoch',
        'transient_failures',
        'probe_attempt_id',
        'probe_lease_until_ms',
        'terminal_sequence',
        'terminal_retired_through_attempt_id',
      ]);
      const terminalColumns = state.storage.sql
        .exec<{ name: string }>('PRAGMA table_info(ccel_terminal_attempts)')
        .toArray()
        .map(row => row.name);
      expect(terminalColumns).toEqual([
        'record_sequence',
        'attempt_id',
        'operator_epoch',
        'outcome_kind',
        'retry_after_seconds',
      ]);
      const schemas = state.storage.sql
        .exec<{ sql: string }>(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name LIKE 'ccel_%'",
        )
        .toArray()
        .map(row => row.sql.toLowerCase());
      for (const schema of schemas) {
        for (const forbidden of ['query', 'snippet', 'url', 'html', 'client', 'identity']) {
          expect(schema).not.toContain(forbidden);
        }
      }
    });
  });

  it.each(terminalOutcomes)('makes $kind reports first-write-wins in SQLite', async outcome => {
    const stub = env.THEOLOGAI_CCEL_COORDINATOR.getByName(`idempotent-${outcome.kind}`);
    const admission = await stub.admit();
    if (admission.kind !== 'admitted') throw new Error('expected admission');
    const first = await stub.recordOutcome(admission.token, outcome);
    const beforeReplay = await stub.snapshot();
    await expect(stub.recordOutcome(admission.token, outcome)).resolves.toMatchObject({
      applied: false,
      disposition: 'duplicate',
    });
    const contradiction: CcelAttemptOutcome = outcome.kind === 'success'
      ? { kind: 'transient_failure' }
      : { kind: 'success' };
    await expect(stub.recordOutcome(admission.token, contradiction)).resolves.toMatchObject({
      applied: false,
      disposition: 'conflict',
    });
    expect(await stub.snapshot()).toEqual(beforeReplay);
    expect(first.disposition).toBe('applied');
  });

  it('conservatively merges distinct out-of-order 429 reports', async () => {
    const stub = env.THEOLOGAI_CCEL_COORDINATOR.getByName('out-of-order-429');
    const first = await stub.admit();
    if (first.kind !== 'admitted') throw new Error('expected first admission');
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec('UPDATE ccel_coordinator_state SET next_allowed_at_ms = 0');
    });
    const second = await stub.admit();
    if (second.kind !== 'admitted') throw new Error('expected second admission');
    await stub.recordOutcome(second.token, { kind: 'rate_limited', retryAfterSeconds: 120 });
    const afterLong = await stub.snapshot();
    await stub.recordOutcome(first.token, { kind: 'rate_limited', retryAfterSeconds: 30 });
    const afterShort = await stub.snapshot();
    expect(afterShort.backoffUntilMs).toBe(afterLong.backoffUntilMs);
    expect(afterShort.terminalAttemptCount).toBe(2);
  });

  it('bounds terminal persistence and keeps retired tokens non-mutating', async () => {
    const stub = env.THEOLOGAI_CCEL_COORDINATOR.getByName('terminal-bound');
    let firstToken: { attemptId: number; operatorEpoch: number } | undefined;
    for (let index = 0; index < 70; index++) {
      const admission = await stub.admit();
      if (admission.kind !== 'admitted') throw new Error(`expected admission ${index}`);
      firstToken ??= admission.token;
      await stub.recordOutcome(admission.token, { kind: 'success' });
      await runInDurableObject(stub, async (_instance, state) => {
        state.storage.sql.exec('UPDATE ccel_coordinator_state SET next_allowed_at_ms = 0');
      });
    }
    const snapshot = await stub.snapshot();
    expect(snapshot).toMatchObject({
      attemptSequence: 70,
      terminalAttemptCount: 64,
      terminalRetiredThroughAttemptId: 70,
    });
    if (!firstToken) throw new Error('expected first token');
    const beforeReplay = await stub.snapshot();
    await expect(stub.recordOutcome(firstToken, { kind: 'interface_failure' }))
      .resolves.toMatchObject({ applied: false, disposition: 'duplicate' });
    expect(await stub.snapshot()).toEqual(beforeReplay);
    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql
        .exec<{ count: number }>('SELECT COUNT(*) AS count FROM ccel_terminal_attempts')
        .one();
      expect(row.count).toBe(64);
    });
  });

  it('fails closed across a persisted wall-clock rollback', async () => {
    const stub = env.THEOLOGAI_CCEL_COORDINATOR.getByName('clock-rollback');
    await stub.admit();
    const beforeRollback = await stub.snapshot();
    const future = beforeRollback.lastObservedAtMs + 60_000;
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec(
        `UPDATE ccel_coordinator_state
         SET last_observed_at_ms = ?, next_allowed_at_ms = ?`,
        future,
        future + 10_000,
      );
    });
    await expect(stub.admit()).resolves.toMatchObject({
      kind: 'busy',
      reason: 'minimum_interval',
      retryAfterSeconds: 10,
    });
    await expect(stub.snapshot()).resolves.toMatchObject({
      lastObservedAtMs: future,
      nextAllowedAtMs: future + 10_000,
    });
  });

  it('latches interface failures and requires the internal reset pathway', async () => {
    const stub = env.THEOLOGAI_CCEL_COORDINATOR.getByName('latch');
    const admission = await stub.admit();
    if (admission.kind !== 'admitted') throw new Error('expected admission');
    await expect(stub.recordOutcome(admission.token, { kind: 'interface_failure' }))
      .resolves.toEqual({
        applied: true,
        disposition: 'applied',
        state: 'latched_interface',
      });
    await expect(stub.admit()).resolves.toMatchObject({
      kind: 'latched',
      reason: 'interface',
    });
    const reset = await stub.resetAfterOperatorReview();
    expect(reset).toMatchObject({
      state: 'closed',
      operatorEpoch: 1,
      terminalAttemptCount: 0,
      terminalRetiredThroughAttemptId: 0,
    });
    await expect(stub.recordOutcome(admission.token, { kind: 'policy_failure' }))
      .resolves.toEqual({
        applied: false,
        disposition: 'stale_epoch',
        state: 'closed',
      });
  });

});
