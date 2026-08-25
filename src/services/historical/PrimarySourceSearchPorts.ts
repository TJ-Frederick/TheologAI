import type { CcelUpstreamCoordinator } from './CcelUpstreamCoordinator.js';
import type {
  PrimarySourceProviderResult,
  PrimarySourceSearchQuery,
} from './primarySourceTypes.js';

/** Application-owned local primary-source search boundary. */
export interface LocalPrimarySourceSearchPort {
  search(query: PrimarySourceSearchQuery): Promise<PrimarySourceProviderResult>;
}

/** Application-owned dormant/live CCEL search boundary. */
export interface CcelPrimarySourceSearchPort {
  search(query: PrimarySourceSearchQuery, coordinator: CcelUpstreamCoordinator): Promise<PrimarySourceProviderResult>;
}
