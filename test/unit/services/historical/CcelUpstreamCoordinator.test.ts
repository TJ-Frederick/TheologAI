import { describe, expect, it } from 'vitest';
import {
  CCEL_UPSTREAM_MAX_RETRY_AFTER_SECONDS,
  ProcessLocalCcelUpstreamCoordinator,
  initialCcelCoordinatorState,
  resetCcelCoordinatorState,
  transitionCcelAdmission,
  transitionCcelOutcome,
} from '../../../../src/services/historical/CcelUpstreamCoordinator.js';

describe('CCEL upstream coordinator policy', () => {
  it('admits exactly one of simultaneous process-local requests', async () => {
    let now = 100_000;
    const coordinator = new ProcessLocalCcelUpstreamCoordinator({ enabled: true, now: () => now });
    const decisions = await Promise.all(Array.from({ length: 20 }, () => coordinator.admit()));

    expect(decisions.filter(decision => decision.kind === 'admitted')).toHaveLength(1);
    expect(decisions.filter(decision => decision.kind === 'busy')).toHaveLength(19);
    expect(decisions.filter(decision => decision.kind === 'busy'))
      .toEqual(expect.arrayContaining(Array.from({ length: 19 }, () => expect.objectContaining({
        reason: 'minimum_interval',
        retryAfterSeconds: 10,
      }))));

    now += 10_000;
    await expect(coordinator.admit()).resolves.toMatchObject({ kind: 'admitted' });
  });

  it('is disabled by default without consulting its clock', async () => {
    let clockReads = 0;
    const coordinator = new ProcessLocalCcelUpstreamCoordinator({
      now: () => {
        clockReads++;
        return 1;
      },
    });

    await expect(coordinator.admit()).resolves.toEqual({ kind: 'disabled' });
    await expect(coordinator.recordOutcome(
      { attemptId: 1, operatorEpoch: 0 },
      { kind: 'success' },
    )).resolves.toEqual({
      applied: false,
      disposition: 'recorded_no_effect',
      state: 'closed',
    });
    expect(clockReads).toBe(0);
  });

  it('fails closed across wall-clock rollback', () => {
    const first = transitionCcelAdmission(initialCcelCoordinatorState(), 100_000);
    const rolledBack = transitionCcelAdmission(first.state, 90_000);

    expect(rolledBack.state.lastObservedAtMs).toBe(100_000);
    expect(rolledBack.decision).toEqual({
      kind: 'busy',
      reason: 'minimum_interval',
      retryAfterSeconds: 10,
    });
  });

  it('persists a bounded Retry-After and allows only one half-open probe', () => {
    const admission = transitionCcelAdmission(initialCcelCoordinatorState(), 1_000);
    expect(admission.decision.kind).toBe('admitted');
    if (admission.decision.kind !== 'admitted') throw new Error('expected admission');

    const limited = transitionCcelOutcome(
      admission.state,
      admission.decision.token,
      { kind: 'rate_limited', retryAfterSeconds: 65 },
      2_000,
    );
    expect(limited.result).toEqual({
      applied: true,
      disposition: 'applied',
      state: 'rate_limited',
    });
    expect(limited.state.backoffUntilMs).toBe(67_000);
    expect(transitionCcelAdmission(limited.state, 66_001).decision).toEqual({
      kind: 'busy',
      reason: 'backoff',
      retryAfterSeconds: 1,
    });

    const probe = transitionCcelAdmission(limited.state, 67_000);
    expect(probe.decision).toMatchObject({ kind: 'admitted', probe: true });
    const competingProbe = transitionCcelAdmission(probe.state, 77_000);
    expect(competingProbe.decision).toEqual({
      kind: 'busy',
      reason: 'probe_in_flight',
      retryAfterSeconds: 20,
    });
  });

  it('caps Retry-After input and output', () => {
    const admission = transitionCcelAdmission(initialCcelCoordinatorState(), 0);
    if (admission.decision.kind !== 'admitted') throw new Error('expected admission');

    expect(() => transitionCcelOutcome(
      admission.state,
      admission.decision.token,
      { kind: 'rate_limited', retryAfterSeconds: CCEL_UPSTREAM_MAX_RETRY_AFTER_SECONDS + 1 },
      0,
    )).toThrow('Invalid CCEL Retry-After value');

    const limited = transitionCcelOutcome(
      admission.state,
      admission.decision.token,
      { kind: 'rate_limited', retryAfterSeconds: CCEL_UPSTREAM_MAX_RETRY_AFTER_SECONDS },
      0,
    );
    expect(transitionCcelAdmission(limited.state, 0).decision).toMatchObject({
      kind: 'busy',
      retryAfterSeconds: CCEL_UPSTREAM_MAX_RETRY_AFTER_SECONDS,
    });
  });

  it('merges concurrent 429 outcomes without shortening existing backoff', () => {
    const first = transitionCcelAdmission(initialCcelCoordinatorState(), 0);
    if (first.decision.kind !== 'admitted') throw new Error('expected first admission');
    const second = transitionCcelAdmission(first.state, 10_000);
    if (second.decision.kind !== 'admitted') throw new Error('expected second admission');

    const newer = transitionCcelOutcome(
      second.state,
      second.decision.token,
      { kind: 'rate_limited', retryAfterSeconds: 120 },
      11_000,
    );
    const older = transitionCcelOutcome(
      newer.state,
      first.decision.token,
      { kind: 'rate_limited', retryAfterSeconds: 30 },
      12_000,
    );
    expect(older.state.backoffUntilMs).toBe(131_000);
  });

  it('conservatively merges distinct out-of-order 429s in either permutation', () => {
    const run = (firstRetry: number, secondRetry: number) => {
      const first = transitionCcelAdmission(initialCcelCoordinatorState(), 0);
      if (first.decision.kind !== 'admitted') throw new Error('expected first admission');
      const second = transitionCcelAdmission(first.state, 10_000);
      if (second.decision.kind !== 'admitted') throw new Error('expected second admission');
      const firstReport = transitionCcelOutcome(
        second.state,
        first.decision.token,
        { kind: 'rate_limited', retryAfterSeconds: firstRetry },
        20_000,
      );
      return transitionCcelOutcome(
        firstReport.state,
        second.decision.token,
        { kind: 'rate_limited', retryAfterSeconds: secondRetry },
        20_000,
      ).state;
    };

    expect(run(30, 120).backoffUntilMs).toBe(140_000);
    expect(run(120, 30).backoffUntilMs).toBe(140_000);
  });

  it.each([
    { kind: 'success' } as const,
    { kind: 'transient_failure' } as const,
    { kind: 'rate_limited', retryAfterSeconds: 45 } as const,
    { kind: 'policy_failure' } as const,
    { kind: 'interface_failure' } as const,
  ])('makes a terminal $kind outcome first-write-wins', outcome => {
    const admission = transitionCcelAdmission(initialCcelCoordinatorState(), 1_000);
    if (admission.decision.kind !== 'admitted') throw new Error('expected admission');
    const first = transitionCcelOutcome(
      admission.state,
      admission.decision.token,
      outcome,
      1_001,
    );
    const duplicate = transitionCcelOutcome(
      first.state,
      admission.decision.token,
      outcome,
      9_999_999,
    );
    const contradiction = transitionCcelOutcome(
      duplicate.state,
      admission.decision.token,
      outcome.kind === 'success' ? { kind: 'transient_failure' } : { kind: 'success' },
      10_000_000,
    );

    expect(duplicate.result).toMatchObject({ applied: false, disposition: 'duplicate' });
    expect(duplicate.state).toEqual(first.state);
    expect(contradiction.result).toMatchObject({ applied: false, disposition: 'conflict' });
    expect(contradiction.state).toEqual(first.state);
    expect(first.state.terminalAttempts).toHaveLength(1);
  });

  it('treats contradictory Retry-After values for one token as a conflict', () => {
    const admission = transitionCcelAdmission(initialCcelCoordinatorState(), 0);
    if (admission.decision.kind !== 'admitted') throw new Error('expected admission');
    const first = transitionCcelOutcome(
      admission.state,
      admission.decision.token,
      { kind: 'rate_limited', retryAfterSeconds: 30 },
      1,
    );
    const conflict = transitionCcelOutcome(
      first.state,
      admission.decision.token,
      { kind: 'rate_limited', retryAfterSeconds: 120 },
      2,
    );
    expect(conflict.result.disposition).toBe('conflict');
    expect(conflict.state.backoffUntilMs).toBe(first.state.backoffUntilMs);
  });

  it('bounds process-local terminal-attempt persistence', async () => {
    let now = 0;
    const coordinator = new ProcessLocalCcelUpstreamCoordinator({ enabled: true, now: () => now });
    for (let index = 0; index < 70; index++) {
      const admission = await coordinator.admit();
      if (admission.kind !== 'admitted') throw new Error(`expected admission ${index}`);
      await coordinator.recordOutcome(admission.token, { kind: 'success' });
      now += 10_000;
    }
    const snapshot = await coordinator.snapshot();
    expect(snapshot).toMatchObject({
      attemptSequence: 70,
      terminalAttemptCount: 64,
      terminalRetiredThroughAttemptId: 70,
    });
  });

  it('applies first-write-wins through the process-local coordinator', async () => {
    const coordinator = new ProcessLocalCcelUpstreamCoordinator({ enabled: true, now: () => 100 });
    const admission = await coordinator.admit();
    if (admission.kind !== 'admitted') throw new Error('expected admission');
    await expect(coordinator.recordOutcome(admission.token, { kind: 'rate_limited', retryAfterSeconds: 30 }))
      .resolves.toMatchObject({ applied: true, disposition: 'applied' });
    const beforeReplay = await coordinator.snapshot();
    await expect(coordinator.recordOutcome(admission.token, { kind: 'rate_limited', retryAfterSeconds: 30 }))
      .resolves.toMatchObject({ applied: false, disposition: 'duplicate' });
    await expect(coordinator.recordOutcome(admission.token, { kind: 'success' }))
      .resolves.toMatchObject({ applied: false, disposition: 'conflict' });
    expect(await coordinator.snapshot()).toEqual(beforeReplay);
  });

  it('backs off transient failures exponentially and closes on its probe success', () => {
    const admission = transitionCcelAdmission(initialCcelCoordinatorState(), 100);
    if (admission.decision.kind !== 'admitted') throw new Error('expected admission');
    const failed = transitionCcelOutcome(
      admission.state,
      admission.decision.token,
      { kind: 'transient_failure' },
      200,
    );
    expect(failed.state).toMatchObject({
      state: 'transient_backoff',
      backoffUntilMs: 30_200,
      transientFailures: 1,
    });

    const probe = transitionCcelAdmission(failed.state, 30_200);
    if (probe.decision.kind !== 'admitted') throw new Error('expected probe');
    expect(probe.decision.probe).toBe(true);
    const recovered = transitionCcelOutcome(
      probe.state,
      probe.decision.token,
      { kind: 'success' },
      30_201,
    );
    expect(recovered.state).toMatchObject({
      state: 'closed',
      backoffUntilMs: 0,
      transientFailures: 0,
      probeAttemptId: null,
    });
  });

  it('latches policy/interface failures until an operator reset', () => {
    const admission = transitionCcelAdmission(initialCcelCoordinatorState(), 1_000);
    if (admission.decision.kind !== 'admitted') throw new Error('expected admission');
    const latched = transitionCcelOutcome(
      admission.state,
      admission.decision.token,
      { kind: 'interface_failure' },
      1_001,
    );
    expect(transitionCcelAdmission(latched.state, 1_000_000).decision).toEqual({
      kind: 'latched',
      reason: 'interface',
      operatorAction: 'reset_after_review',
    });

    const reset = resetCcelCoordinatorState(latched.state, 1_000_001);
    expect(reset).toMatchObject({
      state: 'closed',
      operatorEpoch: 1,
      nextAllowedAtMs: 11_000,
      terminalRetiredThroughAttemptId: 0,
      terminalAttempts: [],
    });
    const stale = transitionCcelOutcome(
      reset,
      admission.decision.token,
      { kind: 'policy_failure' },
      1_000_002,
    );
    expect(stale.result.applied).toBe(false);
    expect(stale.state.state).toBe('closed');
  });

  it('does not let an operator reset bypass a reserved origin interval', () => {
    const admission = transitionCcelAdmission(initialCcelCoordinatorState(), 1_000);
    const reset = resetCcelCoordinatorState(admission.state, 1_001);
    expect(transitionCcelAdmission(reset, 1_001).decision).toEqual({
      kind: 'busy',
      reason: 'minimum_interval',
      retryAfterSeconds: 10,
    });
  });

  it('rejects outcome objects that could smuggle arbitrary content', () => {
    const admission = transitionCcelAdmission(initialCcelCoordinatorState(), 1);
    if (admission.decision.kind !== 'admitted') throw new Error('expected admission');
    const invalid = { kind: 'success', query: 'not-storable' };
    expect(() => transitionCcelOutcome(
      admission.state,
      admission.decision.token,
      invalid as { kind: 'success' },
      2,
    )).toThrow('Invalid CCEL attempt outcome');
  });
});
