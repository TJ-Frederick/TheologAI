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
  lookupAliasUse: 'exact_routing_only_not_metadata_evidence',
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
  creators?: Array<{ name: string; role: 'author' | 'issuing_body' | 'drafting_body' | 'revising_body' | 'compiler' }>;
  metadataStatus?: 'reviewed' | 'anonymous' | 'collective' | 'unknown';
  metadataProvenanceIds?: string[];
}

export interface PresentedPrimarySourceProvider {
  provider: PrimarySourceProvider;
  status: PrimarySourceProviderStatus;
  searched: boolean;
  page: number;
  hitCount: number;
  hits: PresentedPrimarySourceHit[];
  notices: string[];
  scope?: {
    status: 'matched' | 'catalog_miss' | 'metadata_incomplete';
    requested: { work?: string; author?: string; startYear?: number; endYear?: number };
    eligibleDocumentCount: number;
    eligibleDocuments: Array<{ id: string; title: string; metadataStatus: 'reviewed' | 'anonymous' | 'collective' | 'unknown' }>;
    eligibleDocumentsTruncated: boolean;
  };
}

export interface PresentedPrimarySourceQuery {
  id: string;
  normalizedMode: PrimarySourceSearchMatch;
  providers: PresentedPrimarySourceProvider[];
}

export interface PresentedPrimarySourceSearch extends Record<string, unknown> {
  schemaVersion: '2';
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
  const boundedQueries = result.queries.slice(0, 4);
  const omittedQueries = result.queries.slice(4);
  const omittedProviderGroups = [
    ...omittedQueries.flatMap(query => query.providers),
    ...boundedQueries.flatMap(query => query.providers.slice(2)),
  ];
  const envelopeNotices = [
    ...(omittedQueries.length > 0
      ? [`${omittedQueries.length} query group${omittedQueries.length === 1 ? ' was' : 's were'} omitted because the result exceeded the public limit of 4.`]
      : []),
    ...boundedQueries.flatMap(query => {
      const omitted = query.providers.length - 2;
      return omitted > 0
        ? [`${omitted} provider group${omitted === 1 ? ' was' : 's were'} omitted from query ${boundedText(query.id, 40)} because the result exceeded the public limit of 2 providers per query.`]
        : [];
    }),
  ];
  const envelopeChanged = envelopeNotices.length > 0;
  const queries = boundedQueries.map(query => {
    const providerGroupsOmitted = query.providers.length > 2;
    return {
      id: boundedText(query.id, 40),
      normalizedMode: query.normalizedMode,
      providers: query.providers.slice(0, 2).map(provider => {
        const hits = provider.hits.slice(0, 8).flatMap(hit => {
          const presented = presentHit(hit, query.id, provider.provider);
          return presented ? [presented] : [];
        });
        const omitted = provider.hits.length - hits.length;
        const countMismatch = provider.hitCount !== provider.hits.length;
        const scope = provider.provider === 'local' ? presentScope(provider.scope) : undefined;
        const scopeIsMeaningful = provider.searched || provider.status === 'catalog_miss';
        const scopeInvalid = provider.provider === 'local'
          && ((provider.scope !== undefined && !scope) || (scopeIsMeaningful && !scope));
        const downgraded = omitted > 0 || countMismatch || providerGroupsOmitted || scopeInvalid;
        const notices = [...provider.notices];
        if (omitted > 0) {
          notices.push(`${omitted} ${provider.provider} hit${omitted === 1 ? '' : 's'} omitted because the locator, group attribution, or bounded metadata was invalid.`);
        }
        if (countMismatch) notices.push('Provider-reported hit count did not match its returned hit array.');
        if (providerGroupsOmitted) notices.push('One or more provider groups were omitted because the query exceeded the public provider-group limit.');
        if (scopeInvalid) notices.push('Local catalog scope metadata was absent or invalid.');
        return {
          provider: provider.provider,
          status: downgraded ? 'interface_changed' as const : provider.status,
          searched: provider.searched,
          page: provider.page,
          hitCount: hits.length,
          hits,
          notices: uniqueBounded(notices, 16, 500),
          ...(provider.provider === 'local' && scope
            ? { scope }
            : provider.provider === 'local' && scopeInvalid
              ? { scope: { status: 'metadata_incomplete' as const, requested: {}, eligibleDocumentCount: 0, eligibleDocuments: [], eligibleDocumentsTruncated: false } }
              : {}),
        };
      }),
    };
  });
  const providers = queries.flatMap(query => query.providers);
  const local = providers.filter(provider => provider.provider === 'local');
  const ccel = providers.filter(provider => provider.provider === 'ccel_live');
  const omittedLocal = omittedProviderGroups.filter(provider => provider.provider === 'local');
  const omittedCcel = omittedProviderGroups.filter(provider => provider.provider === 'ccel_live');
  const statuses = providers.map(provider => provider.status);
  const hasUsableResult = providers.some(provider => provider.hits.length > 0 || COMPLETE_STATUSES.has(provider.status));
  const planStatus = envelopeChanged
    ? 'partial'
    : statuses.every(status => COMPLETE_STATUSES.has(status))
      ? 'complete'
      : !hasUsableResult && statuses.every(status => UNAVAILABLE_STATUSES.has(status))
        ? 'unavailable'
        : 'partial';
  return {
    schemaVersion: '2',
    kind: 'primary_source_search',
    planStatus,
    queries,
    coverage: {
      localAttempted: [...local, ...omittedLocal].some(provider => provider.searched),
      ...(omittedLocal.length
        ? { localStatus: 'interface_changed' as const }
        : local.length ? { localStatus: aggregateStatus(local) } : {}),
      localHitCount: countHits(local),
      ccelAttempted: [...ccel, ...omittedCcel].some(provider => provider.searched),
      ...(omittedCcel.length
        ? { ccelStatus: 'interface_changed' as const }
        : ccel.length ? { ccelStatus: aggregateStatus(ccel) } : {}),
      ccelHitCount: countHits(ccel),
      notices: uniqueBounded([
        ...envelopeNotices,
        ...result.coverage.notices,
        ...providers.flatMap(provider => provider.notices),
      ], 32, 500),
    },
    evidencePolicy: PRIMARY_SOURCE_EVIDENCE_POLICY,
  };
}

const COMPLETE_STATUSES = new Set<PrimarySourceProviderStatus>(['ok', 'no_results', 'catalog_miss']);
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

  const creators = hit.creators?.slice(0, 8).flatMap(creator => {
    const name = boundedText(creator.name, 160);
    const role = creator.role;
    return name && CREATOR_ROLES.has(role) ? [{ name, role }] : [];
  });
  const metadataProvenanceIds = [...new Set((hit.metadataProvenanceIds ?? [])
    .filter(id => /^hist-meta-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)))].slice(0, 4);

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
    ...(creators?.length ? { creators } : {}),
    ...(hit.metadataStatus && ['reviewed', 'anonymous', 'collective', 'unknown'].includes(hit.metadataStatus)
      ? { metadataStatus: hit.metadataStatus }
      : {}),
    ...(metadataProvenanceIds.length ? { metadataProvenanceIds } : {}),
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

const CREATOR_ROLES = new Set(['author', 'issuing_body', 'drafting_body', 'revising_body', 'compiler'] as const);

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
    'unavailable', 'rate_limited', 'interface_changed', 'disabled', 'unsupported_filter', 'ok', 'catalog_miss', 'no_results',
  ];
  return priority.find(status => providers.some(provider => provider.status === status)) ?? 'unavailable';
}

function presentScope(scope: PrimarySourceSearchPlanResult['queries'][number]['providers'][number]['scope']): PresentedPrimarySourceProvider['scope'] | undefined {
  if (!scope || !['matched', 'catalog_miss', 'metadata_incomplete'].includes(scope.status)
    || !Number.isSafeInteger(scope.eligibleDocumentCount) || scope.eligibleDocumentCount < 0 || scope.eligibleDocumentCount > 17) return undefined;
  const eligibleDocuments = scope.eligibleDocuments.slice(0, 8).flatMap(document => {
    const id = boundedText(document.id, 160);
    const title = boundedText(document.title, 300);
    return id && title && ['reviewed', 'anonymous', 'collective', 'unknown'].includes(document.metadataStatus)
      ? [{ id, title, metadataStatus: document.metadataStatus }]
      : [];
  });
  const work = scope.requested.work ? boundedText(scope.requested.work, 160) : undefined;
  const author = scope.requested.author ? boundedText(scope.requested.author, 100) : undefined;
  const startYear = scope.requested.startYear;
  const endYear = scope.requested.endYear;
  if ((scope.requested.work !== undefined && !work) || (scope.requested.author !== undefined && !author)
    || (startYear !== undefined && (!Number.isSafeInteger(startYear) || startYear < -5000 || startYear > 3000))
    || (endYear !== undefined && (!Number.isSafeInteger(endYear) || endYear < -5000 || endYear > 3000))
    || (startYear !== undefined && endYear !== undefined && startYear > endYear)) return undefined;
  const requested = {
    ...(work ? { work } : {}),
    ...(author ? { author } : {}),
    ...(startYear !== undefined ? { startYear } : {}),
    ...(endYear !== undefined ? { endYear } : {}),
  };
  return {
    status: scope.status,
    requested,
    eligibleDocumentCount: scope.eligibleDocumentCount,
    eligibleDocuments,
    eligibleDocumentsTruncated: scope.eligibleDocumentsTruncated || scope.eligibleDocuments.length > eligibleDocuments.length,
  };
}
