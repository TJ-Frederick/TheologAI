import {
  PRIMARY_SOURCE_STRUCTURED_MAX_BYTES,
  presentPrimarySourceSearchV7,
  type PresentedPrimarySourceSearchV5,
} from './primarySourceSearchV4Structured.js';
import type {
  PrimarySourceExpansionBasis,
  PrimarySourceExpansionDecision,
  PrimarySourceSearchPlanResult,
} from '../services/historical/primarySourceTypes.js';

const EXPANSION_DECISION_RESERVE_BYTES = 1_024;

type PresentedV7Query = PresentedPrimarySourceSearchV5['queries'][number];

export interface PresentedPrimarySourceSearchV8
  extends Omit<PresentedPrimarySourceSearchV5, 'schemaVersion' | 'queries'> {
  schemaVersion: '8';
  queries: Array<PresentedV7Query & { expansionDecision: PrimarySourceExpansionDecision }>;
}

/** Add the v8 routing proof without changing the deployed v7 presentation. */
export function presentPrimarySourceSearchV8(
  result: PrimarySourceSearchPlanResult,
): PresentedPrimarySourceSearchV8 {
  for (const query of result.queries) assertExpansionProviderConsistency(query);
  const v7 = presentPrimarySourceSearchV7(result, EXPANSION_DECISION_RESERVE_BYTES);
  const decisions = new Map(result.queries.map(query => [query.id, query.expansionDecision]));
  const presented: PresentedPrimarySourceSearchV8 = {
    ...v7,
    schemaVersion: '8',
    queries: v7.queries.map(query => ({
      ...query,
      expansionDecision: sanitizeExpansionDecision(decisions.get(query.id)),
    })),
  };
  if (new TextEncoder().encode(JSON.stringify(presented)).byteLength > PRIMARY_SOURCE_STRUCTURED_MAX_BYTES) {
    throw new Error('Primary-source v8 structured model exceeds its reserved delivery budget.');
  }
  return presented;
}

function sanitizeExpansionDecision(
  value: PrimarySourceExpansionDecision | undefined,
): PrimarySourceExpansionDecision {
  if (!value || !Number.isSafeInteger(value.localDistinctWorkCount)
    || value.localDistinctWorkCount < 0 || value.localDistinctWorkCount > 8) {
    throw new Error('Primary-source v8 routing metadata is absent or invalid.');
  }
  if (!value.requested && !value.triggered && value.reason === 'not_requested') {
    if (Object.keys(value).length !== 4) throw new Error('Primary-source v8 routing metadata is not closed.');
    return {
      requested: false, triggered: false, reason: 'not_requested',
      localDistinctWorkCount: value.localDistinctWorkCount,
    };
  }
  if (!value.requested || !validExpansionBasis(value.basis)) {
    throw new Error('Primary-source v8 routing basis is absent or invalid.');
  }
  if (value.requested && !value.triggered
    && (value.reason === 'basis_not_confirmed' || value.reason === 'local_search_unavailable'
      || value.reason === 'local_coverage_uncertain' || value.reason === 'local_result_invalid')) {
    if (Object.keys(value).length !== 5) throw new Error('Primary-source v8 routing metadata is not closed.');
    return {
      requested: true, triggered: false, reason: value.reason,
      localDistinctWorkCount: value.localDistinctWorkCount, basis: value.basis,
    };
  }
  if (value.requested && value.triggered
    && value.reason === value.basis.reason
    && (value.reason === 'catalog_miss' || value.reason === 'no_results' || value.reason === 'insufficient_diversity')) {
    if (Object.keys(value).length !== 5) throw new Error('Primary-source v8 routing metadata is not closed.');
    return {
      requested: true, triggered: true, reason: value.reason,
      localDistinctWorkCount: value.localDistinctWorkCount, basis: value.basis,
    } as PrimarySourceExpansionDecision;
  }
  throw new Error('Primary-source v8 routing metadata is contradictory.');
}

function validExpansionBasis(value: unknown): value is PrimarySourceExpansionBasis {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const basis = value as Record<string, unknown>;
  if (basis.reason === 'catalog_miss' || basis.reason === 'no_results') return Object.keys(basis).length === 1;
  return basis.reason === 'insufficient_diversity'
    && Object.keys(basis).length === 3
    && Number.isSafeInteger(basis.minimumDistinctWorks)
    && (basis.minimumDistinctWorks as number) >= 2
    && (basis.minimumDistinctWorks as number) <= 5
    && Number.isSafeInteger(basis.observedDistinctWorks)
    && (basis.observedDistinctWorks as number) >= 0
    && (basis.observedDistinctWorks as number) < (basis.minimumDistinctWorks as number);
}

function assertExpansionProviderConsistency(
  query: PrimarySourceSearchPlanResult['queries'][number],
): void {
  const decision = sanitizeExpansionDecision(query.expansionDecision);
  const expectedProviders = decision.triggered ? ['local', 'ccel_live'] : ['local'];
  if (query.providers.length !== expectedProviders.length
    || query.providers.some((provider, index) => provider.provider !== expectedProviders[index])) {
    throw new Error('Primary-source v8 routing metadata contradicts provider execution.');
  }
  const local = query.providers[0]!;
  if (local.hits.some(hit => hit.provider !== 'local' || hit.locator.kind !== 'local_section'
    || typeof hit.locator.documentId !== 'string' || hit.locator.documentId.length === 0)) {
    throw new Error('Primary-source v8 routing metadata contradicts local result identity.');
  }
  const distinctLocalWorks = new Set(local.hits.map(hit => hit.provider === 'local'
    ? hit.locator.documentId
    : '')).size;
  if (decision.localDistinctWorkCount !== distinctLocalWorks) {
    throw new Error('Primary-source v8 routing metadata contradicts the local distinct-work count.');
  }
  if (decision.triggered) {
    const reasonMatches = decision.reason === 'catalog_miss'
      ? local.status === 'catalog_miss'
      : decision.reason === 'no_results'
        ? local.status === 'no_results'
        : local.status === 'ok'
          && decision.basis.observedDistinctWorks === distinctLocalWorks
          && distinctLocalWorks < decision.basis.minimumDistinctWorks;
    if (!reasonMatches) {
      throw new Error('Primary-source v8 routing metadata contradicts the local trigger result.');
    }
  }
}
