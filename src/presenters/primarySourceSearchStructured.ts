import { normalizeCcelSectionLocator } from '../adapters/commentary/CcelSearchAdapter.js';
import { buildLocalDocumentResourceUri } from '../kernel/documentResource.js';
import type {
  PrimarySourcePlanHit,
  PrimarySourceProvider,
  PrimarySourceProviderStatus,
  PrimarySourceSearchMatch,
  PrimarySourceSearchPlanResult,
} from '../services/historical/primarySourceTypes.js';

export const PRIMARY_SOURCE_EVIDENCE_POLICY = {
  snippetUse: 'discovery_only',
  selectedSectionAccess: 'mcp_resource_read',
  coverageScope: 'bounded_non_exhaustive',
  editionProvenance: 'incomplete',
} as const;

export interface PresentedLocalPrimarySourceHit extends PresentedPrimarySourceHitBase {
  provider: 'local';
  locator: { kind: 'local_section'; url: string; documentId: string; sectionId: string };
  resourceSizeBytes: number;
}

export interface PresentedCcelPrimarySourceHit extends PresentedPrimarySourceHitBase {
  provider: 'ccel_live';
  locator: { kind: 'ccel_section'; url: string; work: string; section: string };
}

export type PresentedPrimarySourceHit = PresentedLocalPrimarySourceHit | PresentedCcelPrimarySourceHit;

interface PresentedPrimarySourceHitBase {
  queryId: string;
  title: string;
  author?: string;
  sectionLabel?: string;
  snippet: string;
  rankWithinProvider: number;
  page: number;
  snippetOnly: true;
  attribution: string;
  documentType?: string;
  documentDate?: string;
}

export interface PresentedPrimarySourceProvider {
  provider: PrimarySourceProvider;
  status: PrimarySourceProviderStatus;
  searched: boolean;
  page: number;
  hitCount: number;
  hits: PresentedPrimarySourceHit[];
  notices: string[];
}

export interface PresentedPrimarySourceQuery {
  id: string;
  normalizedMode: PrimarySourceSearchMatch;
  providers: PresentedPrimarySourceProvider[];
}

export interface PresentedPrimarySourceSearch extends Record<string, unknown> {
  schemaVersion: '1';
  kind: 'primary_source_search';
  planStatus: 'complete' | 'partial' | 'unavailable';
  queries: PresentedPrimarySourceQuery[];
  coverage: {
    localAttempted: boolean;
    localStatus?: PrimarySourceProviderStatus;
    localHitCount: number;
    ccelAttempted: boolean;
    ccelStatus?: PrimarySourceProviderStatus;
    ccelHitCount: number;
    notices: string[];
  };
  evidencePolicy: typeof PRIMARY_SOURCE_EVIDENCE_POLICY;
}

/** Canonical public result used by Markdown, structured output, and native links. */
export function presentPrimarySourceSearch(result: PrimarySourceSearchPlanResult): PresentedPrimarySourceSearch {
  const queries = result.queries.slice(0, 4).map(query => ({
    id: boundedText(query.id, 40),
    normalizedMode: query.normalizedMode,
    providers: query.providers.slice(0, 2).map(provider => {
      const hits = provider.hits.slice(0, 8).flatMap(hit => {
        const presented = presentHit(hit, query.id, provider.provider);
        return presented ? [presented] : [];
      });
      const omitted = provider.hits.length - hits.length;
      const countMismatch = provider.hitCount !== provider.hits.length;
      const downgraded = omitted > 0 || countMismatch;
      const notices = [...provider.notices];
      if (omitted > 0) {
        notices.push(`${omitted} ${provider.provider} hit${omitted === 1 ? '' : 's'} omitted because the locator, group attribution, or bounded metadata was invalid.`);
      }
      if (countMismatch) notices.push('Provider-reported hit count did not match its returned hit array.');
      return {
        provider: provider.provider,
        status: downgraded ? 'interface_changed' as const : provider.status,
        searched: provider.searched,
        page: provider.page,
        hitCount: hits.length,
        hits,
        notices: uniqueBounded(notices, 16, 500),
      };
    }),
  }));
  const providers = queries.flatMap(query => query.providers);
  const local = providers.filter(provider => provider.provider === 'local');
  const ccel = providers.filter(provider => provider.provider === 'ccel_live');
  const statuses = providers.map(provider => provider.status);
  const hasUsableResult = providers.some(provider => provider.hits.length > 0 || COMPLETE_STATUSES.has(provider.status));
  const planStatus = statuses.every(status => COMPLETE_STATUSES.has(status))
    ? 'complete'
    : !hasUsableResult && statuses.every(status => UNAVAILABLE_STATUSES.has(status))
      ? 'unavailable'
      : 'partial';
  return {
    schemaVersion: '1',
    kind: 'primary_source_search',
    planStatus,
    queries,
    coverage: {
      localAttempted: local.some(provider => provider.searched),
      ...(local.length ? { localStatus: aggregateStatus(local) } : {}),
      localHitCount: countHits(local),
      ccelAttempted: ccel.some(provider => provider.searched),
      ...(ccel.length ? { ccelStatus: aggregateStatus(ccel) } : {}),
      ccelHitCount: countHits(ccel),
      notices: uniqueBounded([
        ...result.coverage.notices,
        ...providers.flatMap(provider => provider.notices),
      ], 32, 500),
    },
    evidencePolicy: PRIMARY_SOURCE_EVIDENCE_POLICY,
  };
}

const COMPLETE_STATUSES = new Set<PrimarySourceProviderStatus>(['ok', 'no_results']);
const UNAVAILABLE_STATUSES = new Set<PrimarySourceProviderStatus>(['unavailable', 'disabled', 'rate_limited', 'interface_changed']);

function presentHit(
  hit: PrimarySourcePlanHit,
  expectedQueryId: string,
  expectedProvider: PrimarySourceProvider,
): PresentedPrimarySourceHit | undefined {
  // A hit is evidence for exactly the query/provider group that contains it.
  // Never repair or relabel a mismatched upstream result: omitting it causes
  // the enclosing provider to be downgraded to interface_changed.
  if (hit.queryId !== expectedQueryId || hit.provider !== expectedProvider) return undefined;

  const common = {
    queryId: boundedText(hit.queryId, 40),
    title: boundedText(hit.title, 300),
    ...(hit.author ? { author: boundedText(hit.author, 200) } : {}),
    ...(hit.sectionLabel ? { sectionLabel: boundedText(hit.sectionLabel, 300) } : {}),
    snippet: boundedText(hit.snippet, 500),
    rankWithinProvider: hit.rankWithinProvider,
    page: hit.page,
    snippetOnly: true as const,
    attribution: boundedText(hit.attribution, 300),
    ...(hit.documentType ? { documentType: boundedText(hit.documentType, 100) } : {}),
    ...(hit.documentDate ? { documentDate: boundedText(hit.documentDate, 100) } : {}),
  };
  if (!common.queryId || !common.title || !common.attribution
    || !Number.isSafeInteger(common.rankWithinProvider) || common.rankWithinProvider < 1 || common.rankWithinProvider > 32
    || !Number.isSafeInteger(common.page) || common.page < 1 || common.page > 3) return undefined;

  if (hit.provider === 'local') {
    const canonical = buildLocalDocumentResourceUri(hit.locator.documentId, hit.locator.sectionId);
    const size = hit.resourceSizeBytes;
    if (!canonical || canonical !== hit.locator.url
      || !Number.isSafeInteger(size) || size < 0 || size > Number.MAX_SAFE_INTEGER) return undefined;
    return {
      ...common,
      provider: 'local',
      locator: {
        kind: 'local_section',
        url: canonical,
        documentId: hit.locator.documentId,
        sectionId: hit.locator.sectionId,
      },
      resourceSizeBytes: size,
    };
  }

  if (hit.provider === 'ccel_live') {
    const normalized = normalizeCcelSectionLocator(hit.locator.url);
    if (!normalized || normalized.url !== hit.locator.url
      || normalized.work !== hit.locator.work || normalized.section !== hit.locator.section) return undefined;
    return { ...common, provider: 'ccel_live', locator: normalized };
  }

  // Runtime data can drift ahead of this closed public contract even though
  // TypeScript currently knows only the two providers above.
  return undefined;
}

function boundedText(value: string, maximum: number): string {
  return Array.from(value.normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim()).slice(0, maximum).join('');
}

function uniqueBounded(values: string[], maximumItems: number, maximumLength: number): string[] {
  return [...new Set(values.map(value => boundedText(value, maximumLength)).filter(Boolean))].slice(0, maximumItems);
}

function countHits(providers: PresentedPrimarySourceProvider[]): number {
  return providers.reduce((total, provider) => total + provider.hits.length, 0);
}

function aggregateStatus(providers: PresentedPrimarySourceProvider[]): PrimarySourceProviderStatus {
  const priority: PrimarySourceProviderStatus[] = [
    'unavailable', 'rate_limited', 'interface_changed', 'disabled', 'unsupported_filter', 'ok', 'no_results',
  ];
  return priority.find(status => providers.some(provider => provider.status === status)) ?? 'unavailable';
}
