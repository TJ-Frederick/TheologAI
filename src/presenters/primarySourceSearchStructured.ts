import { buildLocalDocumentResourceUri } from '../kernel/documentResource.js';
import { CLASSIC_TEXT_LIMITS } from '../kernel/classicTextContract.js';
import type {
  PrimarySourcePlanHit,
  PrimarySourceProviderStatus,
  PrimarySourceSearchMatch,
  PrimarySourceSelection,
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
  locator: { kind: 'local_section'; url: string; documentId: string; sectionKey: string; sourceOrdinal: number };
  resourceSizeBytes: number;
}

export type PresentedPrimarySourceHit = PresentedLocalPrimarySourceHit;

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
  provider: 'local';
  status: PrimarySourceProviderStatus;
  searched: boolean;
  page: number;
  hitCount: number;
  resultWindow: {
    returnedHitCount: number;
    additionalMatchStatus: 'additional_match_observed' | 'no_additional_match_observed' | 'not_evaluated';
  };
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
  normalizedSelection: PrimarySourceSelection;
  providers: PresentedPrimarySourceProvider[];
}

export interface PresentedPrimarySourceSearch extends Record<string, unknown> {
  schemaVersion: '3';
  kind: 'primary_source_search';
  planStatus: 'complete' | 'partial' | 'unavailable';
  queries: PresentedPrimarySourceQuery[];
  coverage: {
    localAttempted: boolean;
    localStatus?: PrimarySourceProviderStatus;
    localHitCount: number;
    notices: string[];
  };
  evidencePolicy: typeof PRIMARY_SOURCE_EVIDENCE_POLICY;
}

/** Canonical public result used by Markdown, structured output, and native links. */
export function presentPrimarySourceSearch(result: PrimarySourceSearchPlanResult): PresentedPrimarySourceSearch {
  const boundedQueries = result.queries.slice(0, 4);
  const omittedQueries = result.queries.slice(4);
  const omittedLocalGroups = [
    ...omittedQueries.flatMap(query => query.providers.filter(provider => provider.provider === 'local')),
    ...boundedQueries.flatMap(query => query.providers.filter(provider => provider.provider === 'local').slice(1)),
  ];
  const nonPublicDataOmitted = result.queries.some(query =>
    query.providers.some(provider => provider.provider !== 'local'));
  const envelopeNotices = [
    ...(omittedQueries.length > 0
      ? [`${omittedQueries.length} query group${omittedQueries.length === 1 ? ' was' : 's were'} omitted because the result exceeded the public limit of 4.`]
      : []),
    ...boundedQueries.flatMap(query => {
      const omitted = query.providers.filter(provider => provider.provider === 'local').length - 1;
      return omitted > 0
        ? [`${omitted} duplicate local result group${omitted === 1 ? ' was' : 's were'} omitted from query ${boundedText(query.id, 40)} because the public contract permits one local result group per query.`]
        : [];
    }),
    ...(nonPublicDataOmitted
      ? ['Internal data outside the local public contract was omitted.']
      : []),
    ...boundedQueries.flatMap(query => isSelection(query.normalizedSelection)
      ? []
      : [`Query ${boundedText(query.id, 40)} supplied invalid normalized selection metadata; relevance was used as a safe display fallback.`]),
  ];
  const envelopeChanged = envelopeNotices.length > 0;
  const queries = boundedQueries.map(query => {
    const localGroups = query.providers.filter(provider => provider.provider === 'local');
    const provider = localGroups[0];
    const providerGroupsOmitted = localGroups.length > 1;
    return {
      id: boundedText(query.id, 40),
      normalizedMode: query.normalizedMode,
      normalizedSelection: isSelection(query.normalizedSelection) ? query.normalizedSelection : 'relevance' as const,
      providers: [provider
        ? presentLocalProvider(provider, query.id, providerGroupsOmitted)
        : missingLocalProvider()],
    };
  });
  const providers = queries.flatMap(query => query.providers);
  const statuses = providers.map(provider => provider.status);
  const hasUsableResult = providers.some(provider => provider.hits.length > 0 || COMPLETE_STATUSES.has(provider.status));
  const recomputedPlanStatus = envelopeChanged
    ? 'partial'
    : statuses.every(status => COMPLETE_STATUSES.has(status))
      ? 'complete'
      : !hasUsableResult && statuses.every(status => UNAVAILABLE_STATUSES.has(status))
        ? 'unavailable'
        : 'partial';
  // A service-enforced aggregate response boundary is intentionally partial
  // even when every individual provider status remains successful. Preserve
  // that conservative downgrade; presentation can only degrade it further.
  const planStatus = recomputedPlanStatus === 'complete' && result.planStatus === 'partial'
    ? 'partial'
    : recomputedPlanStatus;
  return {
    schemaVersion: '3',
    kind: 'primary_source_search',
    planStatus,
    queries,
    coverage: {
      localAttempted: [...providers, ...omittedLocalGroups].some(provider => provider.searched),
      ...(omittedLocalGroups.length
        ? { localStatus: 'interface_changed' as const }
        : providers.length ? { localStatus: aggregateStatus(providers) } : {}),
      localHitCount: countHits(providers),
      notices: uniqueBounded([
        ...envelopeNotices,
        ...providers.flatMap(provider => provider.notices),
      ], 32, 500),
    },
    evidencePolicy: PRIMARY_SOURCE_EVIDENCE_POLICY,
  };
}

type PlanProviderResult = PrimarySourceSearchPlanResult['queries'][number]['providers'][number];

function presentLocalProvider(
  provider: PlanProviderResult,
  queryId: string,
  providerGroupsOmitted: boolean,
): PresentedPrimarySourceProvider {
  if (provider.provider !== 'local') return missingLocalProvider();
  const hits = provider.hits.slice(0, 8).flatMap(hit => {
    const presented = presentHit(hit, queryId);
    return presented ? [presented] : [];
  });
  const omitted = provider.hits.length - hits.length;
  const countMismatch = provider.hitCount !== provider.hits.length;
  const resultWindowValid = validResultWindow(provider.resultWindow, provider.hits.length);
  const scope = presentScope(provider.scope);
  const scopeIsMeaningful = provider.searched || provider.status === 'catalog_miss';
  const scopeInvalid = (provider.scope !== undefined && !scope) || (scopeIsMeaningful && !scope);
  const downgraded = omitted > 0 || countMismatch || !resultWindowValid || providerGroupsOmitted || scopeInvalid;
  const notices = [...provider.notices];
  if (omitted > 0) {
    notices.push(`${omitted} local hit${omitted === 1 ? '' : 's'} omitted because the locator, group attribution, or bounded metadata was invalid.`);
  }
  if (countMismatch) notices.push('Provider-reported hit count did not match its returned hit array.');
  if (!resultWindowValid) notices.push('Provider result-window metadata was absent or invalid.');
  if (providerGroupsOmitted) notices.push('One or more local result groups were omitted because the query exceeded the public limit.');
  if (scopeInvalid) notices.push('Local catalog scope metadata was absent or invalid.');
  return {
    provider: 'local',
    status: downgraded ? 'interface_changed' : provider.status,
    searched: provider.searched,
    page: provider.page,
    hitCount: hits.length,
    resultWindow: {
      returnedHitCount: hits.length,
      additionalMatchStatus: omitted > 0
        ? 'additional_match_observed'
        : resultWindowValid
          ? provider.resultWindow.additionalMatchStatus
          : 'not_evaluated',
    },
    hits,
    notices: uniqueBounded(notices, 16, 500),
    ...(scope
      ? { scope }
      : scopeInvalid
        ? { scope: { status: 'metadata_incomplete' as const, requested: {}, eligibleDocumentCount: 0, eligibleDocuments: [], eligibleDocumentsTruncated: false } }
        : {}),
  };
}

function missingLocalProvider(): PresentedPrimarySourceProvider {
  return {
    provider: 'local',
    status: 'interface_changed',
    searched: false,
    page: 1,
    hitCount: 0,
    resultWindow: { returnedHitCount: 0, additionalMatchStatus: 'not_evaluated' },
    hits: [],
    notices: ['Internal data outside the local public contract was omitted.'],
  };
}

function validResultWindow(
  value: PrimarySourcePlanResultWindow | undefined,
  returnedHits: number,
): value is PrimarySourcePlanResultWindow {
  return value !== undefined
    && Number.isSafeInteger(value.returnedHitCount)
    && value.returnedHitCount === returnedHits
    && RESULT_WINDOW_STATUSES.has(value.additionalMatchStatus);
}

type PrimarySourcePlanResultWindow = {
  returnedHitCount: number;
  additionalMatchStatus: 'additional_match_observed' | 'no_additional_match_observed' | 'not_evaluated';
};

const RESULT_WINDOW_STATUSES = new Set<PrimarySourcePlanResultWindow['additionalMatchStatus']>([
  'additional_match_observed', 'no_additional_match_observed', 'not_evaluated',
]);

function isSelection(value: unknown): value is PrimarySourceSelection {
  return value === 'relevance' || value === 'work_diversity';
}

const COMPLETE_STATUSES = new Set<PrimarySourceProviderStatus>(['ok', 'no_results', 'catalog_miss']);
const UNAVAILABLE_STATUSES = new Set<PrimarySourceProviderStatus>(['unavailable', 'disabled', 'rate_limited', 'interface_changed']);

function presentHit(
  hit: PrimarySourcePlanHit,
  expectedQueryId: string,
): PresentedPrimarySourceHit | undefined {
  // A hit is evidence for exactly the query/provider group that contains it.
  // Never repair or relabel a mismatched upstream result: omitting it causes
  // the enclosing provider to be downgraded to interface_changed.
  if (hit.queryId !== expectedQueryId || hit.provider !== 'local') return undefined;

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

  const canonical = buildLocalDocumentResourceUri(hit.locator.documentId, hit.locator.sectionKey);
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
      sectionKey: hit.locator.sectionKey,
      sourceOrdinal: hit.locator.sourceOrdinal,
    },
    resourceSizeBytes: size,
  };
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
    || !Number.isSafeInteger(scope.eligibleDocumentCount) || scope.eligibleDocumentCount < 0
    || scope.eligibleDocumentCount > CLASSIC_TEXT_LIMITS.workCount) return undefined;
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
