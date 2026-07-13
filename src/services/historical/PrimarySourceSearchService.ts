import { ValidationError } from '../../kernel/errors.js';
import type { CcelSearchAdapter } from '../../adapters/commentary/CcelSearchAdapter.js';
import type { LocalPrimarySourceSearchProvider } from './LocalPrimarySourceSearchProvider.js';
import {
  type PrimarySourcePlanProviderResult,
  type PrimarySourcePlanQueryResult,
  type PrimarySourceProviderResult,
  type PrimarySourceProviderStatus,
  type PrimarySourceRequestedProvider,
  type PrimarySourceSearchMatch,
  type PrimarySourceSearchPlanQuery,
  type PrimarySourceSearchPlanResult,
} from './primarySourceTypes.js';

const MAX_QUERIES = 4;
const MAX_CCEL_QUERIES = 3;
const MAX_TOTAL_HITS = 32;
const QUERY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const QUERY_KEYS = new Set(['id', 'text', 'providers', 'match', 'author', 'work', 'startYear', 'endYear', 'page', 'limit']);
const COMPLETE_STATUSES = new Set<PrimarySourceProviderStatus>(['ok', 'no_results', 'catalog_miss']);
const UNAVAILABLE_STATUSES = new Set<PrimarySourceProviderStatus>(['unavailable', 'disabled', 'rate_limited', 'interface_changed']);

export interface PrimarySourceSearchServiceOptions {
  ccelLiveSearch: boolean;
}

export class PrimarySourceSearchService {
  constructor(
    private readonly local: Pick<LocalPrimarySourceSearchProvider, 'search'>,
    private readonly ccel: Pick<CcelSearchAdapter, 'search'>,
    private readonly options: PrimarySourceSearchServiceOptions,
  ) {}

  async search(input: unknown): Promise<PrimarySourceSearchPlanResult> {
    const queries = validatePlan(input);
    const queryResults = await Promise.all(queries.map(query => this.executeQuery(query)));
    enforceAggregateHitBudget(queryResults);
    const providerResults = queryResults.flatMap(query => query.providers);
    const statuses = providerResults.map(provider => provider.status);
    const planStatus = statuses.every(status => COMPLETE_STATUSES.has(status))
      ? 'complete'
      : statuses.every(status => UNAVAILABLE_STATUSES.has(status))
      ? 'unavailable'
      : 'partial';

    const localResults = providerResults.filter(provider => provider.provider === 'local');
    const ccelResults = providerResults.filter(provider => provider.provider === 'ccel_live');
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
      },
    };
  }

  private async executeQuery(query: NormalizedPlanQuery): Promise<PrimarySourcePlanQueryResult> {
    const providers = await Promise.all(query.providers.map(provider => this.executeProvider(query, provider)));
    return { id: query.id, normalizedMode: query.match, providers };
  }

  private async executeProvider(query: NormalizedPlanQuery, provider: PrimarySourceRequestedProvider): Promise<PrimarySourcePlanProviderResult> {
    const providerQuery = {
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
    if (provider === 'ccel' && (query.startYear !== undefined || query.endYear !== undefined)) {
      result = {
        provider: 'ccel_live', status: 'unsupported_filter', searched: false, page: query.page,
        hitCount: 0, hits: [], notices: ['Live CCEL discovery does not expose reviewed composition-date bounds; the date restriction was not ignored.'],
      };
    } else if (provider === 'ccel' && !this.options.ccelLiveSearch) {
      result = {
        provider: 'ccel_live', status: 'disabled', searched: false, page: query.page,
        hitCount: 0, hits: [], notices: ['Live CCEL search is disabled. No remote request was made.'],
      };
    } else {
      try {
        result = provider === 'local'
          ? await this.local.search(providerQuery)
          : await this.ccel.search(providerQuery);
      } catch {
        result = {
          provider: provider === 'local' ? 'local' : 'ccel_live',
          status: 'unavailable', searched: false, page: query.page,
          hitCount: 0, hits: [], notices: [`${provider === 'local' ? 'Local primary-source search' : 'Live CCEL search'} is temporarily unavailable.`],
        };
      }
    }
    return {
      ...result,
      hits: result.hits.map(hit => ({ ...hit, queryId: query.id })),
    };
  }
}

interface NormalizedPlanQuery extends Required<Pick<PrimarySourceSearchPlanQuery, 'id' | 'text' | 'providers' | 'match' | 'page' | 'limit'>> {
  author?: string;
  work?: string;
  startYear?: number;
  endYear?: number;
}

function validatePlan(input: unknown): NormalizedPlanQuery[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('queries', 'A primary-source query plan object is required.');
  const plan = input as Record<string, unknown>;
  if (Object.keys(plan).length !== 1 || !Object.hasOwn(plan, 'queries')) throw new ValidationError('queries', 'The plan must contain only queries.');
  if (!Array.isArray(plan.queries) || plan.queries.length < 1 || plan.queries.length > MAX_QUERIES) {
    throw new ValidationError('queries', `queries must contain 1 to ${MAX_QUERIES} items.`);
  }
  const normalized = plan.queries.map((query, index) => validateQuery(query, index));
  const ids = new Set<string>();
  for (const query of normalized) {
    if (ids.has(query.id)) throw new ValidationError('queries.id', `Duplicate query id "${query.id}".`);
    ids.add(query.id);
  }
  if (normalized.filter(query => query.providers.includes('ccel')).length > MAX_CCEL_QUERIES) {
    throw new ValidationError('queries.providers', `At most ${MAX_CCEL_QUERIES} queries may request CCEL.`);
  }
  return normalized;
}

function validateQuery(input: unknown, index: number): NormalizedPlanQuery {
  const path = `queries.${index}`;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError(path, 'Each query must be an object.');
  const query = input as Record<string, unknown>;
  const unknown = Object.keys(query).find(key => !QUERY_KEYS.has(key));
  if (unknown) throw new ValidationError(`${path}.${unknown}`, 'Unknown query field.');
  if (typeof query.id !== 'string' || !QUERY_ID.test(query.id)) throw new ValidationError(`${path}.id`, 'id must be a 1 to 40 character plan identifier.');
  const text = normalizeLiteral(query.text, `${path}.text`, 200);
  const match = query.match ?? 'all_terms';
  if (match !== 'all_terms' && match !== 'phrase') throw new ValidationError(`${path}.match`, 'match must be all_terms or phrase.');
  if (match === 'all_terms' && text.split(' ').length > 12) throw new ValidationError(`${path}.text`, 'all_terms text may contain at most 12 terms.');
  if (!Array.isArray(query.providers) || query.providers.length < 1 || query.providers.length > 2) throw new ValidationError(`${path}.providers`, 'providers must contain local, ccel, or both.');
  const providers = query.providers as unknown[];
  if (providers.some(provider => provider !== 'local' && provider !== 'ccel') || new Set(providers).size !== providers.length) {
    throw new ValidationError(`${path}.providers`, 'providers must be unique values from local and ccel.');
  }
  const page = query.page ?? 1;
  const limit = query.limit ?? 5;
  if (!Number.isSafeInteger(page) || (page as number) < 1 || (page as number) > 3) throw new ValidationError(`${path}.page`, 'page must be an integer from 1 to 3.');
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 8) throw new ValidationError(`${path}.limit`, 'limit must be an integer from 1 to 8.');
  const author = query.author === undefined ? undefined : normalizeLiteral(query.author, `${path}.author`, 100);
  const work = query.work === undefined ? undefined : normalizeLiteral(query.work, `${path}.work`, 160);
  const startYear = query.startYear === undefined ? undefined : normalizeYear(query.startYear, `${path}.startYear`);
  const endYear = query.endYear === undefined ? undefined : normalizeYear(query.endYear, `${path}.endYear`);
  if (startYear !== undefined && endYear !== undefined && startYear > endYear) {
    throw new ValidationError(`${path}.startYear`, 'startYear must be less than or equal to endYear.');
  }
  return {
    id: query.id,
    text,
    providers: providers as PrimarySourceRequestedProvider[],
    match: match as PrimarySourceSearchMatch,
    page: page as number,
    limit: limit as number,
    ...(author ? { author } : {}),
    ...(work ? { work } : {}),
    ...(startYear !== undefined ? { startYear } : {}),
    ...(endYear !== undefined ? { endYear } : {}),
  };
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

function enforceAggregateHitBudget(queries: PrimarySourcePlanQueryResult[]): void {
  let remaining = MAX_TOTAL_HITS;
  for (const query of queries) {
    for (const provider of query.providers) {
      if (provider.hits.length > remaining) {
        provider.hits = provider.hits.slice(0, remaining);
        provider.hitCount = provider.hits.length;
        provider.notices = [...provider.notices, 'The plan-wide 32-hit response budget truncated later provider results.'];
      }
      remaining -= provider.hits.length;
    }
  }
}

function aggregateStatus(results: PrimarySourcePlanProviderResult[]): PrimarySourceProviderStatus {
  const priority: PrimarySourceProviderStatus[] = ['unavailable', 'rate_limited', 'interface_changed', 'disabled', 'unsupported_filter', 'catalog_miss', 'ok', 'no_results'];
  return priority.find(status => results.some(result => result.status === status)) ?? 'unavailable';
}
