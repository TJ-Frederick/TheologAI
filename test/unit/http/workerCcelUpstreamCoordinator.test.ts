import { describe, expect, it, vi } from 'vitest';
import {
  WorkerCcelUpstreamCoordinator,
  createWorkerCcelUpstreamCoordinator,
} from '../../../src/http/worker/WorkerCcelUpstreamCoordinator.js';

type FactorySurface = ReturnType<typeof createWorkerCcelUpstreamCoordinator>;
type ClassSurface = WorkerCcelUpstreamCoordinator;
type LacksOperatorReset<T> = 'resetAfterOperatorReview' extends keyof T ? false : true;

const factoryLacksOperatorReset: LacksOperatorReset<FactorySurface> = true;
const classLacksOperatorReset: LacksOperatorReset<ClassSurface> = true;

function createFactoryHarness(
  liveSearchEnabled: boolean,
  coordinatorEnabled: boolean,
) {
  const admit = vi.fn(async () => ({
    kind: 'admitted' as const,
    token: { attemptId: 1, operatorEpoch: 0 },
    admittedAtMs: 1,
    nextAllowedAtMs: 10_001,
    probe: false,
  }));
  const recordOutcome = vi.fn(async () => ({
    applied: true,
    disposition: 'applied' as const,
    state: 'closed' as const,
  }));
  const snapshot = vi.fn(async () => ({
    state: 'closed' as const,
    nextAllowedAtMs: 0,
    backoffUntilMs: 0,
    lastObservedAtMs: 0,
    attemptSequence: 0,
    operatorEpoch: 0,
    transientFailures: 0,
    probeInFlight: false,
    probeLeaseUntilMs: 0,
    terminalAttemptCount: 0,
    terminalRetiredThroughAttemptId: 0,
  }));
  const getByName = vi.fn(() => ({ admit, recordOutcome, snapshot }));
  const env = {
    THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: liveSearchEnabled ? 'true' : 'false',
    THEOLOGAI_ENABLE_CCEL_COORDINATOR: coordinatorEnabled ? 'true' : 'false',
    THEOLOGAI_CCEL_COORDINATOR: { getByName },
  } as Parameters<typeof createWorkerCcelUpstreamCoordinator>[0];

  return {
    coordinator: createWorkerCcelUpstreamCoordinator(env),
    getByName,
    admit,
    recordOutcome,
    snapshot,
  };
}

describe('public Worker CCEL coordinator surface', () => {
  it('does not expose the owner-internal reset operation', () => {
    expect(factoryLacksOperatorReset).toBe(true);
    expect(classLacksOperatorReset).toBe(true);
    expect('resetAfterOperatorReview' in WorkerCcelUpstreamCoordinator.prototype).toBe(false);
  });

  it.each([
    { flags: '00', liveSearchEnabled: false, coordinatorEnabled: false },
    { flags: '10', liveSearchEnabled: true, coordinatorEnabled: false },
    { flags: '01', liveSearchEnabled: false, coordinatorEnabled: true },
  ])('keeps the $flags factory path local without constructing the Durable Object', async ({
    liveSearchEnabled,
    coordinatorEnabled,
  }) => {
    const harness = createFactoryHarness(liveSearchEnabled, coordinatorEnabled);

    await expect(harness.coordinator.admit()).resolves.toEqual({ kind: 'disabled' });
    await expect(harness.coordinator.recordOutcome(
      { attemptId: 1, operatorEpoch: 0 },
      { kind: 'success' },
    )).resolves.toEqual({
      applied: false,
      disposition: 'recorded_no_effect',
      state: 'closed',
    });
    await expect(harness.coordinator.snapshot()).resolves.toMatchObject({
      state: 'closed',
      attemptSequence: 0,
    });

    expect(harness.getByName).not.toHaveBeenCalled();
    expect(harness.admit).not.toHaveBeenCalled();
    expect(harness.recordOutcome).not.toHaveBeenCalled();
    expect(harness.snapshot).not.toHaveBeenCalled();
  });

  it('uses the singleton Durable Object exactly once for the 11 factory path', async () => {
    const harness = createFactoryHarness(true, true);

    await expect(harness.coordinator.admit()).resolves.toMatchObject({ kind: 'admitted' });

    expect(harness.getByName).toHaveBeenCalledOnce();
    expect(harness.getByName).toHaveBeenCalledWith('ccel-public-search-origin-v1');
    expect(harness.admit).toHaveBeenCalledOnce();
    expect(harness.recordOutcome).not.toHaveBeenCalled();
    expect(harness.snapshot).not.toHaveBeenCalled();
  });
});
