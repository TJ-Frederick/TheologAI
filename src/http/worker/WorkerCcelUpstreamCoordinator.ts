import type { Env } from '../../worker-env.js';
import type { CcelGlobalCoordinator } from './CcelGlobalCoordinator.js';
import {
  initialCcelCoordinatorState,
  snapshotCcelCoordinatorState,
  type CcelAdmissionDecision,
  type CcelAdmissionToken,
  type CcelAttemptOutcome,
  type CcelCoordinatorSnapshot,
  type CcelOperatorUpstreamCoordinator,
  type CcelOutcomeRecord,
} from '../../services/historical/CcelUpstreamCoordinator.js';

export const CCEL_COORDINATOR_SINGLETON_NAME = 'ccel-public-search-origin-v1';

type CoordinatorNamespace = DurableObjectNamespace<CcelGlobalCoordinator>;

/**
 * Binding client for future internal adapter injection.
 *
 * Both rollout switches must be explicitly true. Current root and preview
 * configurations set both false, and no composition root constructs this
 * client, so public primary_source_search remains local-only.
 */
export class WorkerCcelUpstreamCoordinator implements CcelOperatorUpstreamCoordinator {
  private readonly enabled: boolean;

  constructor(
    private readonly namespace: CoordinatorNamespace,
    options: { enabled?: boolean } = {},
  ) {
    this.enabled = options.enabled === true;
  }

  admit(): Promise<CcelAdmissionDecision> {
    if (!this.enabled) return Promise.resolve({ kind: 'disabled' });
    return this.stub().admit();
  }

  recordOutcome(
    token: CcelAdmissionToken,
    outcome: CcelAttemptOutcome,
  ): Promise<CcelOutcomeRecord> {
    if (!this.enabled) return Promise.resolve({ applied: false, state: 'closed' });
    return this.stub().recordOutcome(token, outcome);
  }

  snapshot(): Promise<CcelCoordinatorSnapshot> {
    if (!this.enabled) {
      return Promise.resolve(snapshotCcelCoordinatorState(initialCcelCoordinatorState()));
    }
    return this.stub().snapshot();
  }

  resetAfterOperatorReview(): Promise<CcelCoordinatorSnapshot> {
    if (!this.enabled) {
      return Promise.resolve(snapshotCcelCoordinatorState(initialCcelCoordinatorState()));
    }
    return this.stub().resetAfterOperatorReview();
  }

  private stub(): DurableObjectStub<CcelGlobalCoordinator> {
    return this.namespace.getByName(CCEL_COORDINATOR_SINGLETON_NAME);
  }
}

export function createWorkerCcelUpstreamCoordinator(env: Env): WorkerCcelUpstreamCoordinator {
  const liveSearchEnabled = env.THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH?.trim().toLowerCase() === 'true';
  const coordinatorEnabled = env.THEOLOGAI_ENABLE_CCEL_COORDINATOR?.trim().toLowerCase() === 'true';
  return new WorkerCcelUpstreamCoordinator(env.THEOLOGAI_CCEL_COORDINATOR, {
    enabled: liveSearchEnabled && coordinatorEnabled,
  });
}
