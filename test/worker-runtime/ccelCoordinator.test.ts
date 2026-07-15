import {
  env,
  listDurableObjectIds,
  runInDurableObject,
} from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { CcelGlobalCoordinator } from '../../src/http/worker/CcelGlobalCoordinator.js';
import { createWorkerCcelUpstreamCoordinator } from '../../src/http/worker/WorkerCcelUpstreamCoordinator.js';

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
    });
    await expect(reacquiredStub.admit()).resolves.toMatchObject({
      kind: 'busy',
      reason: 'backoff',
      retryAfterSeconds: 120,
    });
  });

  it('stores only the reviewed circuit and timing columns', async () => {
    const stub = env.THEOLOGAI_CCEL_COORDINATOR.getByName('storage-shape');
    await stub.admit();

    await runInDurableObject(stub, async (_instance: CcelGlobalCoordinator, state) => {
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
      ]);
      const schema = state.storage.sql
        .exec<{ sql: string }>(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ccel_coordinator_state'",
        )
        .one().sql.toLowerCase();
      for (const forbidden of ['query', 'snippet', 'url', 'html', 'client', 'identity']) {
        expect(schema).not.toContain(forbidden);
      }
    });
  });

  it('latches interface failures and requires the internal reset pathway', async () => {
    const stub = env.THEOLOGAI_CCEL_COORDINATOR.getByName('latch');
    const admission = await stub.admit();
    if (admission.kind !== 'admitted') throw new Error('expected admission');
    await expect(stub.recordOutcome(admission.token, { kind: 'interface_failure' }))
      .resolves.toEqual({ applied: true, state: 'latched_interface' });
    await expect(stub.admit()).resolves.toMatchObject({
      kind: 'latched',
      reason: 'interface',
    });
    const reset = await stub.resetAfterOperatorReview();
    expect(reset).toMatchObject({ state: 'closed', operatorEpoch: 1 });
    await expect(stub.recordOutcome(admission.token, { kind: 'policy_failure' }))
      .resolves.toEqual({ applied: false, state: 'closed' });
  });

  it('does not instantiate or call the namespace while disabled', async () => {
    const before = await listDurableObjectIds(env.THEOLOGAI_CCEL_COORDINATOR);
    const beforeIds = before.map(id => id.toString()).sort();
    const coordinator = createWorkerCcelUpstreamCoordinator(env);

    await expect(coordinator.admit()).resolves.toEqual({ kind: 'disabled' });
    await expect(coordinator.recordOutcome(
      { attemptId: 1, operatorEpoch: 0 },
      { kind: 'success' },
    )).resolves.toEqual({ applied: false, state: 'closed' });
    await coordinator.snapshot();
    await coordinator.resetAfterOperatorReview();

    const after = await listDurableObjectIds(env.THEOLOGAI_CCEL_COORDINATOR);
    expect(after.map(id => id.toString()).sort()).toEqual(beforeIds);
  });
});
