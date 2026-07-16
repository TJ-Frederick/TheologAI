import { describe, expect, it } from 'vitest';
import {
  WorkerCcelUpstreamCoordinator,
  createWorkerCcelUpstreamCoordinator,
} from '../../../src/http/worker/WorkerCcelUpstreamCoordinator.js';

type FactorySurface = ReturnType<typeof createWorkerCcelUpstreamCoordinator>;
type ClassSurface = WorkerCcelUpstreamCoordinator;
type LacksOperatorReset<T> = 'resetAfterOperatorReview' extends keyof T ? false : true;

const factoryLacksOperatorReset: LacksOperatorReset<FactorySurface> = true;
const classLacksOperatorReset: LacksOperatorReset<ClassSurface> = true;

describe('public Worker CCEL coordinator surface', () => {
  it('does not expose the owner-internal reset operation', () => {
    expect(factoryLacksOperatorReset).toBe(true);
    expect(classLacksOperatorReset).toBe(true);
    expect('resetAfterOperatorReview' in WorkerCcelUpstreamCoordinator.prototype).toBe(false);
  });
});
