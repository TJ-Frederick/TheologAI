import type { Env } from '../../worker-env.js';
import { readPrimarySourceContractConfig, type PrimarySourceContractConfig } from '../../kernel/featureFlags.js';
import type { CcelGlobalCoordinator } from './CcelGlobalCoordinator.js';
import {
  initialCcelCoordinatorState,
  snapshotCcelCoordinatorState,
  type CcelAdmissionDecision,
  type CcelAdmissionToken,
  type CcelAttemptOutcome,
  type CcelCoordinatorSnapshot,
  type CcelOutcomeRecord,
  type CcelUpstreamCoordinator,
} from '../../services/historical/CcelUpstreamCoordinator.js';

export const CCEL_COORDINATOR_SINGLETON_NAME = 'ccel-public-search-origin-v1';

type CoordinatorNamespace = DurableObjectNamespace<CcelGlobalCoordinator>;

/**
 * Binding client for gated internal adapter injection.
 *
 * Exposure, live search, and coordinator rollout switches must all be true.
 * Current production and preview configurations set all three false, so the
 * composition root never constructs this client and public search remains
 * local-only.
 */
export class WorkerCcelUpstreamCoordinator implements CcelUpstreamCoordinator {
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
    if (!this.enabled) {
      return Promise.resolve({
        applied: false,
        disposition: 'recorded_no_effect',
        state: 'closed',
      });
    }
    return this.stub().recordOutcome(token, outcome);
  }

  snapshot(): Promise<CcelCoordinatorSnapshot> {
    if (!this.enabled) {
      return Promise.resolve(snapshotCcelCoordinatorState(initialCcelCoordinatorState()));
    }
    return this.stub().snapshot();
  }

  private stub(): DurableObjectStub<CcelGlobalCoordinator> {
    return this.namespace.getByName(CCEL_COORDINATOR_SINGLETON_NAME);
  }
}

export function createWorkerCcelUpstreamCoordinator(
  env: Env,
  contract: PrimarySourceContractConfig = readPrimarySourceContractConfig(env),
): CcelUpstreamCoordinator {
  return new WorkerCcelUpstreamCoordinator(env.THEOLOGAI_CCEL_COORDINATOR, {
    enabled: contract.liveCcelEnabled,
  });
}
