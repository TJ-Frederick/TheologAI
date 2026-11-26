import type { CcelUpstreamCoordinator } from './CcelUpstreamCoordinator.js';
import type {
  PrimarySourceProviderResult,
  PrimarySourceSearchQuery,
} from './primarySourceTypes.js';

/** Provider-neutral application boundary; adapters remain responsible for transport details. */
export interface PrimarySourceSearchProviderPort<TContext extends unknown[] = []> {
  search(query: PrimarySourceSearchQuery, ...context: TContext): Promise<PrimarySourceProviderResult>;
}

/** Application-owned local primary-source search boundary. */
export interface LocalPrimarySourceSearchPort extends PrimarySourceSearchProviderPort {
  forPlan?(): PrimarySourceSearchProviderPort;
}

/** Application-owned dormant/live CCEL search boundary. */
export type CcelPrimarySourceSearchPort = PrimarySourceSearchProviderPort<[CcelUpstreamCoordinator]>;
