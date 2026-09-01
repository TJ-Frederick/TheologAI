import { ValidationError } from '../../kernel/errors.js';
import type { CcelPrimarySourceSearchPort, LocalPrimarySourceSearchPort } from './PrimarySourceSearchPorts.js';
import type { PrimarySourceContractConfig } from '../../kernel/featureFlags.js';
import type { CcelUpstreamCoordinator } from './CcelUpstreamCoordinator.js';
import {
  type PrimarySourcePlanProviderResult,
  type PrimarySourcePlanQueryResult,
  type PrimarySourceExpansionDecision,
  type PrimarySourceExpansionBasis,
  type PrimarySourceProviderResult,
  type PrimarySourceProviderStatus,
  type PrimarySourceRequestedProvider,
  type PrimarySourceSearchMatch,
  type PrimarySourceSearchPlanQuery,
  type PrimarySourceSearchPlanResult,
  CCEL_COMPOSITION_DATE_NOTICE,
} from './primarySourceTypes.js';

const MAX_QUERIES = 4;
export const MAX_CCEL_QUERIES = 1;
const MAX_TOTAL_HITS = 32;
const QUERY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const V6_QUERY_KEYS = new Set(['id', 'text', 'providers', 'match', 'selection', 'author', 'work', 'startYear', 'endYear', 'page', 'limit']);
const V7_QUERY_KEYS = new Set(['id', 'text', 'searchDepth', 'expandedLimit', 'match', 'selection', 'author', 'work', 'startYear', 'endYear', 'page', 'limit']);
const V8_QUERY_KEYS = new Set([...V7_QUERY_KEYS, 'expansionBasis']);
const COMPLETE_STATUSES = new Set<PrimarySourceProviderStatus>(['ok', 'no_results', 'catalog_miss']);
const UNAVAILABLE_STATUSES = new Set<PrimarySourceProviderStatus>(['unavailable', 'disabled', 'rate_limited', 'interface_changed']);

export type PrimarySourceSearchServiceOptions = PrimarySourceContractConfig;

export class PrimarySourceSearchService {
  constructor(
    private readonly local: LocalPrimarySourceSearchPort,
    private readonly ccel: CcelPrimarySourceSearchPort,
    private readonly options: PrimarySourceSearchServiceOptions,
    private readonly coordinator?: CcelUpstreamCoordinator,
  ) {}

  async search(input: unknown): Promise<PrimarySourceSearchPlanResult> {
    const queries = validatePlan(input, this.options.contractVersion);
    const queryResults = await Promise.all(queries.map(query => this.executeQuery(query)));
    const aggregateTruncated = enforceAggregateHitBudget(queryResults);
    const providerResults = queryResults.flatMap(query => query.providers);
    const statuses = providerResults.map(provider => provider.status);
    const planStatus = aggregateTruncated
      ? 'partial'
      : statuses.every(status => COMPLETE_STATUSES.has(status))
      ? 'complete'
      : statuses.every(status => UNAVAILABLE_STATUSES.has(status))
      ? 'unavailable'
      : 'partial';

    const localResults = providerResults.filter(provider => provider.provider === 'local');
    const ccelResults = providerResults.filter(provider => provider.provider === 'ccel_live');
    const observed = queryResults.flatMap(query => query.providers.map(provider => ({
      queryId: query.id,
      provider: provider.provider,
      status: provider.status,
      returnedHitCount: provider.hitCount,
      searched: provider.searched,
    })));
    return {
      planStatus,
      queries: queryResults,
      coverage: {
        localAttempted: localResults.some(result => result.searched),
        ...(localResults.length ? { localStatus: aggregateStatus(localResults) } : {}),
        localHitCount: localResults.reduce((total, result) => total + result.hitCount, 0),
        ccelAttempted: ccelResults.some(result => result.searched),
        ...(ccelResults.length ? { ccelStatus: aggregateStatus(ccelResults) } : {}),
        ccelHitCount: ccelResults.reduce((total, result) => total + result.hitCount, 0),
        notices: [...new Set(providerResults.flatMap(result => result.notices))],
        serverObserved: {
          searched: observed.filter(provider => provider.searched).map(({ searched: _searched, ...provider }) => provider),
          notSearched: observed.filter(provider => !provider.searched)
            .map(({ searched: _searched, returnedHitCount: _returnedHitCount, ...provider }) => provider),
        },
      },
    };
  }

  private async executeQuery(query: NormalizedPlanQuery): Promise<PrimarySourcePlanQueryResult> {
    if (this.options.contractVersion === '8') {
      const local = await this.executeProvider(query, 'local');
      const expansionDecision = decideExpansion(query, local);
      const providers = expansionDecision.triggered
        ? [local, await this.executeProvider(query, 'ccel')]
        : [local];
      return {
        id: query.id,
        normalizedMode: query.match,
        normalizedSelection: query.selection,
        providers,
        expansionDecision,
      };
    }
    const providers: PrimarySourcePlanProviderResult[] = [];
    for (const provider of query.providers) providers.push(await this.executeProvider(query, provider));
    return { id: query.id, normalizedMode: query.match, normalizedSelection: query.selection, providers };
  }

  private async executeProvider(query: NormalizedPlanQuery, provider: PrimarySourceRequestedProvider): Promise<PrimarySourcePlanProviderResult> {
    const localProviderQuery = {
      text: query.text,
      match: query.match,
      page: query.page,
      limit: query.limit,
      ...(query.author ? { author: query.author } : {}),
      ...(query.work ? { work: query.work } : {}),
      ...(query.startYear !== undefined ? { startYear: query.startYear } : {}),
      ...(query.endYear !== undefined ? { endYear: query.endYear } : {}),
    };
    let result: PrimarySourceProviderResult;
    const externalProviderQuery = {
      text: query.text,
      match: query.match,
      page: 1,
      limit: query.expandedLimit,
      ...(query.author ? { author: query.author } : {}),
      ...(query.work ? { work: query.work } : {}),
    };
    if (provider === 'ccel' && this.options.contractVersion === '6' && (query.page > 1 || query.startYear !== undefined || query.endYear !== undefined)) {
      result = {
        provider: 'ccel_live', status: 'unsupported_filter', searched: false, page: query.page,
        hitCount: 0, hits: [], notices: [query.page > 1
          ? 'Live CCEL discovery supports page 1 only; the requested external page was not silently changed.'
          : 'Live CCEL discovery does not expose reviewed composition-date bounds; the date restriction was not ignored.'],
        resultWindow: { returnedHitCount: 0, additionalMatchStatus: 'not_evaluated' },
      };
    } else if (provider === 'ccel' && (!this.options.liveCcelEnabled || !this.coordinator)) {
      result = {
        provider: 'ccel_live', status: 'disabled', searched: false, page: query.page,
        hitCount: 0, hits: [], notices: ['Live CCEL search is disabled. No remote request was made.'],
        resultWindow: { returnedHitCount: 0, additionalMatchStatus: 'not_evaluated' },
      };
    } else {
      try {
        result = provider === 'local'
          ? await this.local.search({ ...localProviderQuery, selection: query.selection })
          : await this.ccel.search(externalProviderQuery, this.coordinator!);
      } catch {
        result = {
          provider: provider === 'local' ? 'local' : 'ccel_live',
          status: 'unavailable', searched: false, page: query.page,
          hitCount: 0, hits: [], notices: [`${provider === 'local' ? 'Local primary-source search' : 'Live CCEL search'} is temporarily unavailable.`],
          resultWindow: { returnedHitCount: 0, additionalMatchStatus: 'not_evaluated' },
        };
      }
    }
    if (provider === 'ccel' && result.status !== 'disabled' && (this.options.contractVersion !== '6' || (query.page === 1
      && query.startYear === undefined && query.endYear === undefined))) {
      result = {
        ...result,
        notices: [
          CCEL_COMPOSITION_DATE_NOTICE,
          ...result.notices.filter(notice => notice !== CCEL_COMPOSITION_DATE_NOTICE),
        ],
      };
    }
    return {
      ...result,
      resultWindow: result.resultWindow ?? {
        returnedHitCount: result.hits.length,
        additionalMatchStatus: 'not_evaluated',
      },
      hits: result.hits.map(hit => ({ ...hit, queryId: query.id })),
    };
  }
}

interface NormalizedPlanQuery extends Required<Pick<PrimarySourceSearchPlanQuery, 'id' | 'text' | 'providers' | 'match' | 'selection' | 'page' | 'limit'>> {
  author?: string;
  work?: string;
  startYear?: number;
  endYear?: number;
  expandedLimit: number;
  searchDepth: 'standard' | 'expanded';
  expansionBasis?: PrimarySourceExpansionBasis;
}

function validatePlan(input: unknown, contractVersion: '6' | '7' | '8'): NormalizedPlanQuery[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('queries', 'A primary-source query plan object is required.');
  const plan = input as Record<string, unknown>;
  if (Object.keys(plan).length !== 1 || !Object.hasOwn(plan, 'queries')) throw new ValidationError('queries', 'The plan must contain only queries.');
  if (!Array.isArray(plan.queries) || plan.queries.length < 1 || plan.queries.length > MAX_QUERIES) {
    throw new ValidationError('queries', `queries must contain 1 to ${MAX_QUERIES} items.`);
  }
  const normalized = plan.queries.map((query, index) => validateQuery(query, index, contractVersion));
  const ids = new Set<string>();
  for (const query of normalized) {
    if (ids.has(query.id)) throw new ValidationError('queries.id', `Duplicate query id "${query.id}".`);
    ids.add(query.id);
  }
  if (normalized.filter(query => query.providers.includes('ccel')).length > MAX_CCEL_QUERIES) {
    throw new ValidationError(
      contractVersion === '6' ? 'queries.providers' : 'queries.searchDepth',
      `At most ${MAX_CCEL_QUERIES} queries may request ${contractVersion === '6' ? 'CCEL' : 'expanded discovery'}.`,
    );
  }
  return normalized;
}

function validateQuery(input: unknown, index: number, contractVersion: '6' | '7' | '8'): NormalizedPlanQuery {
  const path = `queries.${index}`;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError(path, 'Each query must be an object.');
  const query = input as Record<string, unknown>;
  const allowedKeys = contractVersion === '8' ? V8_QUERY_KEYS : contractVersion === '7' ? V7_QUERY_KEYS : V6_QUERY_KEYS;
  const unknown = Object.keys(query).find(key => !allowedKeys.has(key));
  if (unknown) throw new ValidationError(`${path}.${unknown}`, 'Unknown query field.');
  if (typeof query.id !== 'string' || !QUERY_ID.test(query.id)) throw new ValidationError(`${path}.id`, 'id must be a 1 to 40 character plan identifier.');
  const text = normalizeLiteral(query.text, `${path}.text`, 200);
  const match = query.match ?? 'all_terms';
  if (match !== 'all_terms' && match !== 'phrase') throw new ValidationError(`${path}.match`, 'match must be all_terms or phrase.');
  if (match === 'all_terms' && text.split(' ').length > 12) throw new ValidationError(`${path}.text`, 'all_terms text may contain at most 12 terms.');
  const selection = query.selection ?? 'relevance';
  if (selection !== 'relevance' && selection !== 'work_diversity') throw new ValidationError(`${path}.selection`, 'selection must be relevance or work_diversity.');
  const searchDepth = query.searchDepth ?? 'standard';
  if (contractVersion !== '6' && searchDepth !== 'standard' && searchDepth !== 'expanded') throw new ValidationError(`${path}.searchDepth`, 'searchDepth must be standard or expanded.');
  const expandedLimit = query.expandedLimit ?? 3;
  if (contractVersion !== '6' && (!Number.isSafeInteger(expandedLimit) || (expandedLimit as number) < 1 || (expandedLimit as number) > 5)) throw new ValidationError(`${path}.expandedLimit`, 'expandedLimit must be an integer from 1 to 5.');
  if (contractVersion !== '6' && query.expandedLimit !== undefined && searchDepth !== 'expanded') throw new ValidationError(`${path}.expandedLimit`, 'expandedLimit is valid only when searchDepth is expanded.');
  let providers: PrimarySourceRequestedProvider[];
  if (contractVersion !== '6') providers = searchDepth === 'expanded' ? ['local', 'ccel'] : ['local'];
  else {
    if (!Array.isArray(query.providers) || query.providers.length < 1 || query.providers.length > 2) throw new ValidationError(`${path}.providers`, 'providers must contain local, ccel, or both.');
    const requested = query.providers as unknown[];
    if (requested.some(provider => provider !== 'local' && provider !== 'ccel') || new Set(requested).size !== requested.length) throw new ValidationError(`${path}.providers`, 'providers must be unique values from local and ccel.');
    providers = requested as PrimarySourceRequestedProvider[];
  }
  const page = query.page ?? 1;
  const limit = query.limit ?? 5;
  if (!Number.isSafeInteger(page) || (page as number) < 1 || (page as number) > 3) throw new ValidationError(`${path}.page`, 'page must be an integer from 1 to 3.');
  if (contractVersion !== '6' && page !== 1) throw new ValidationError(`${path}.page`, `${contractVersion} primary-source search supports page 1 only.`);
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 8) throw new ValidationError(`${path}.limit`, 'limit must be an integer from 1 to 8.');
  const author = query.author === undefined ? undefined : normalizeLiteral(query.author, `${path}.author`, 100);
  const work = query.work === undefined ? undefined : normalizeLiteral(query.work, `${path}.work`, 160);
  const startYear = query.startYear === undefined ? undefined : normalizeYear(query.startYear, `${path}.startYear`);
  const endYear = query.endYear === undefined ? undefined : normalizeYear(query.endYear, `${path}.endYear`);
  if (startYear !== undefined && endYear !== undefined && startYear > endYear) {
    throw new ValidationError(`${path}.startYear`, 'startYear must be less than or equal to endYear.');
  }
  const expansionBasis = contractVersion === '8'
    ? validateExpansionBasis(query.expansionBasis, `${path}.expansionBasis`, searchDepth as 'standard' | 'expanded', selection)
    : undefined;
  if (contractVersion === '8' && searchDepth === 'expanded' && expansionBasis === undefined) {
    throw new ValidationError(`${path}.expansionBasis`, 'expansionBasis is required when searchDepth is expanded.');
  }
  return {
    id: query.id,
    text,
    providers,
    match: match as PrimarySourceSearchMatch,
    selection,
    page: page as number,
    limit: limit as number,
    expandedLimit: contractVersion === '6' ? limit as number : expandedLimit as number,
    searchDepth: contractVersion === '6' ? 'standard' : searchDepth as 'standard' | 'expanded',
    ...(expansionBasis ? { expansionBasis } : {}),
    ...(author ? { author } : {}),
    ...(work ? { work } : {}),
    ...(startYear !== undefined ? { startYear } : {}),
    ...(endYear !== undefined ? { endYear } : {}),
  };
}

function validateExpansionBasis(
  value: unknown,
  path: string,
  searchDepth: 'standard' | 'expanded',
  selection: unknown,
): PrimarySourceExpansionBasis | undefined {
  if (value === undefined) return undefined;
  if (searchDepth !== 'expanded') throw new ValidationError(path, 'expansionBasis is valid only when searchDepth is expanded.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(path, 'expansionBasis must be an object.');
  const basis = value as Record<string, unknown>;
  if (basis.reason === 'catalog_miss' || basis.reason === 'no_results') {
    if (Object.keys(basis).length !== 1) throw new ValidationError(path, 'catalog_miss and no_results expansion bases contain only reason.');
    return { reason: basis.reason };
  }
  if (basis.reason !== 'insufficient_diversity' || selection !== 'work_diversity'
    || Object.keys(basis).some(key => !['reason', 'minimumDistinctWorks', 'observedDistinctWorks'].includes(key))
    || Object.keys(basis).length !== 3
    || !Number.isSafeInteger(basis.minimumDistinctWorks) || (basis.minimumDistinctWorks as number) < 2 || (basis.minimumDistinctWorks as number) > 5
    || !Number.isSafeInteger(basis.observedDistinctWorks) || (basis.observedDistinctWorks as number) < 0 || (basis.observedDistinctWorks as number) > 4
    || (basis.observedDistinctWorks as number) >= (basis.minimumDistinctWorks as number)) {
    throw new ValidationError(path, 'expansionBasis insufficient_diversity requires work_diversity plus observedDistinctWorks below a 2 to 5 minimumDistinctWorks threshold.');
  }
  return {
    reason: 'insufficient_diversity',
    minimumDistinctWorks: basis.minimumDistinctWorks as number,
    observedDistinctWorks: basis.observedDistinctWorks as number,
  };
}

function decideExpansion(
  query: NormalizedPlanQuery,
  local: PrimarySourcePlanProviderResult,
): PrimarySourceExpansionDecision {
  const localDistinctWorkCount = new Set(local.hits.flatMap(hit => hit.provider === 'local'
    ? [hit.locator.documentId]
    : [])).size;
  if (query.searchDepth !== 'expanded') {
    return { requested: false, triggered: false, reason: 'not_requested', localDistinctWorkCount };
  }
  const basis = query.expansionBasis!;
  if (local.scope?.status === 'metadata_incomplete') {
    return { requested: true, triggered: false, reason: 'local_coverage_uncertain', localDistinctWorkCount, basis };
  }
  if (!COMPLETE_STATUSES.has(local.status)) {
    return { requested: true, triggered: false, reason: 'local_search_unavailable', localDistinctWorkCount, basis };
  }
  if (!hasReliableLocalRoutingEvidence(local, query)) {
    return { requested: true, triggered: false, reason: 'local_result_invalid', localDistinctWorkCount, basis };
  }
  let confirmed: boolean;
  if (basis.reason === 'catalog_miss') {
    confirmed = local.status === 'catalog_miss';
  } else if (basis.reason === 'no_results') {
    confirmed = local.status === 'no_results';
  } else {
    confirmed = local.status === 'ok'
      && localDistinctWorkCount === basis.observedDistinctWorks
      && localDistinctWorkCount < basis.minimumDistinctWorks;
  }
  if (!confirmed) {
    return { requested: true, triggered: false, reason: 'basis_not_confirmed', localDistinctWorkCount, basis };
  }
  if (basis.reason === 'catalog_miss') {
    return { requested: true, triggered: true, reason: 'catalog_miss', localDistinctWorkCount, basis };
  }
  if (basis.reason === 'no_results') {
    return { requested: true, triggered: true, reason: 'no_results', localDistinctWorkCount, basis };
  }
  return { requested: true, triggered: true, reason: 'insufficient_diversity', localDistinctWorkCount, basis };
}

function hasReliableLocalRoutingEvidence(
  local: PrimarySourcePlanProviderResult,
  query: NormalizedPlanQuery,
): boolean {
  if (local.provider !== 'local' || local.page !== query.page
    || !Number.isSafeInteger(local.hitCount) || local.hitCount !== local.hits.length
    || !local.resultWindow || local.resultWindow.returnedHitCount !== local.hits.length
    || !Number.isSafeInteger(local.resultWindow.returnedHitCount)
    || !['additional_match_observed', 'no_additional_match_observed', 'not_evaluated']
      .includes(local.resultWindow.additionalMatchStatus)
    || !Array.isArray(local.notices) || local.notices.some(notice => typeof notice !== 'string')) {
    return false;
  }
  const expectedScope = {
    ...(query.work ? { work: query.work } : {}),
    ...(query.author ? { author: query.author } : {}),
    ...(query.startYear !== undefined ? { startYear: query.startYear } : {}),
    ...(query.endYear !== undefined ? { endYear: query.endYear } : {}),
  };
  if (!local.scope || !['matched', 'catalog_miss', 'metadata_incomplete'].includes(local.scope.status)
    || !Number.isSafeInteger(local.scope.eligibleDocumentCount)
    || local.scope.eligibleDocumentCount < 0 || local.scope.eligibleDocumentCount > 100
    || !Array.isArray(local.scope.eligibleDocuments)
    || typeof local.scope.eligibleDocumentsTruncated !== 'boolean') {
    return false;
  }
  const actualScope = local.scope.requested as Record<string, unknown> | undefined;
  if (!actualScope || typeof actualScope !== 'object' || Array.isArray(actualScope)
    || Object.keys(actualScope).length !== Object.keys(expectedScope).length
    || Object.entries(expectedScope).some(([key, value]) => actualScope[key] !== value)) {
    return false;
  }
  if (local.hits.some(hit => hit.provider !== 'local' || hit.locator.kind !== 'local_section'
    || typeof hit.locator.documentId !== 'string' || hit.locator.documentId.length === 0)) {
    return false;
  }
  const distinctHitWorkCount = new Set(local.hits.map(hit => hit.provider === 'local'
    ? hit.locator.documentId
    : '')).size;
  if (local.scope.eligibleDocumentCount < distinctHitWorkCount) return false;
  if (local.scope.status === 'metadata_incomplete') return local.hits.length === 0;
  if (local.status === 'catalog_miss') {
    return local.searched === false && local.scope.status === 'catalog_miss'
      && local.scope.eligibleDocumentCount === 0 && local.hits.length === 0;
  }
  if (local.status === 'no_results') {
    return local.searched === true && local.scope.status === 'matched'
      && local.scope.eligibleDocumentCount > 0 && local.hits.length === 0;
  }
  return local.status === 'ok' && local.searched === true && local.scope.status === 'matched'
    && local.scope.eligibleDocumentCount > 0 && local.hits.length > 0;
}

function normalizeYear(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < -5000 || (value as number) > 3000) {
    throw new ValidationError(field, `${field} must be a safe integer from -5000 to 3000.`);
  }
  return value as number;
}

function normalizeLiteral(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') throw new ValidationError(field, `${field} must be a string.`);
  if (value.includes('\u0000')) throw new ValidationError(field, `${field} may not contain NUL.`);
  const normalized = value.normalize('NFC').replace(/[\u0001-\u001F\u007F-\u009F]/g, ' ').trim().replace(/\s+/gu, ' ');
  const length = Array.from(normalized).length;
  if (length < 1 || length > maximum) throw new ValidationError(field, `${field} must contain 1 to ${maximum} characters.`);
  return normalized;
}

function enforceAggregateHitBudget(queries: PrimarySourcePlanQueryResult[]): boolean {
  let remaining = MAX_TOTAL_HITS;
  let truncated = false;
  for (const query of queries) {
    for (const provider of query.providers) {
      if (provider.hits.length > remaining) {
        truncated = true;
        provider.hits = provider.hits.slice(0, remaining);
        provider.hitCount = provider.hits.length;
        provider.resultWindow = {
          returnedHitCount: provider.hits.length,
          additionalMatchStatus: 'additional_match_observed',
        };
        provider.notices = [...provider.notices, 'The plan-wide 32-hit response budget truncated later provider results.'];
      }
      remaining -= provider.hits.length;
    }
  }
  return truncated;
}

function aggregateStatus(results: PrimarySourcePlanProviderResult[]): PrimarySourceProviderStatus {
  const priority: PrimarySourceProviderStatus[] = ['unavailable', 'rate_limited', 'interface_changed', 'disabled', 'unsupported_filter', 'catalog_miss', 'ok', 'no_results'];
  return priority.find(status => results.some(result => result.status === status)) ?? 'unavailable';
}
