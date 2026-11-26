import type {
  PrimarySourceProviderStatus,
  PrimarySourceSearchCoverage,
  PrimarySourcePlanProviderResult,
} from './primarySourceTypes.js';

const STATUS_PRIORITY: readonly PrimarySourceProviderStatus[] = [
  'unavailable', 'rate_limited', 'interface_changed', 'disabled', 'unsupported_filter', 'catalog_miss', 'ok', 'no_results',
];

export type ServerObservedCoverage = NonNullable<PrimarySourceSearchCoverage['serverObserved']>;

type CoverageQuery = {
  id: string;
  providers: readonly Pick<PrimarySourcePlanProviderResult, 'provider' | 'searched' | 'status' | 'hitCount'>[];
};

/** Project coverage from the results retained by this caller, in query and provider order. */
export function projectPrimarySourceCoverage(queries: readonly CoverageQuery[]) {
  const serverObserved: ServerObservedCoverage = { searched: [], notSearched: [] };
  const local = { seen: false, attempted: false, hitCount: 0, statusRank: STATUS_PRIORITY.length };
  const ccel = { ...local };

  for (const query of queries) {
    for (const provider of query.providers) {
      const observed = { queryId: query.id, provider: provider.provider, status: provider.status };
      const searched = Boolean(provider.searched);
      if (searched) {
        serverObserved.searched.push({ ...observed, returnedHitCount: provider.hitCount });
      } else {
        serverObserved.notSearched.push(observed);
      }

      const summary = provider.provider === 'local' ? local : provider.provider === 'ccel_live' ? ccel : undefined;
      if (!summary) continue;
      summary.seen = true;
      summary.attempted ||= searched;
      summary.hitCount += provider.hitCount;
      const rank = STATUS_PRIORITY.indexOf(provider.status);
      if (rank >= 0 && rank < summary.statusRank) summary.statusRank = rank;
    }
  }

  return {
    providerCoverage: {
      localAttempted: local.attempted,
      ...(local.seen ? { localStatus: STATUS_PRIORITY[local.statusRank] ?? 'unavailable' } : {}),
      localHitCount: local.hitCount,
      ccelAttempted: ccel.attempted,
      ...(ccel.seen ? { ccelStatus: STATUS_PRIORITY[ccel.statusRank] ?? 'unavailable' } : {}),
      ccelHitCount: ccel.hitCount,
    },
    serverObserved,
  };
}
