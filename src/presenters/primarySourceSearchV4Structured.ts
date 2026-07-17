import { buildLocalDocumentResourceUri } from '../kernel/documentResource.js';
import { CLASSIC_TEXT_LIMITS } from '../kernel/classicTextContract.js';
import {
  CCEL_COMPOSITION_DATE_NOTICE,
  type PrimarySourcePlanHit,
  type PrimarySourceProviderStatus,
  type PrimarySourceSearchPlanResult,
} from '../services/historical/primarySourceTypes.js';

export const PRIMARY_SOURCE_V4_MAX_BYTES = 32_768;

const COMPLETE = new Set<PrimarySourceProviderStatus>(['ok', 'no_results', 'catalog_miss']);
const UNAVAILABLE = new Set<PrimarySourceProviderStatus>(['unavailable', 'disabled', 'rate_limited', 'interface_changed']);
const STATUS = new Set<PrimarySourceProviderStatus>([
  'ok', 'no_results', 'unavailable', 'disabled', 'rate_limited', 'interface_changed', 'catalog_miss', 'unsupported_filter',
]);
const CREATOR_ROLES = new Set(['author', 'issuing_body', 'drafting_body', 'revising_body', 'compiler'] as const);
const textEncoder = new TextEncoder();

export const PRIMARY_SOURCE_V4_EVIDENCE_POLICY = {
  snippetUse: 'discovery_only',
  localSectionAccess: 'mcp_resource_read',
  externalSectionAccess: 'direct_url_only',
  coverageScope: 'bounded_non_exhaustive',
  externalRightsStatus: 'not_determined',
  lookupAliasUse: 'exact_routing_only_not_metadata_evidence',
} as const;

type LocalHit = {
  queryId: string; title: string; author?: string; sectionLabel?: string; snippet: string;
  rankWithinProvider: number; page: number; snippetOnly: true; attribution: string;
  provider: 'local';
  locator: { kind: 'mcp_resource'; uri: string; documentId: string; sectionId: string };
  resourceSizeBytes: number;
  documentType?: string; documentDate?: string;
  creators?: Array<{ name: string; role: 'author' | 'issuing_body' | 'drafting_body' | 'revising_body' | 'compiler' }>;
  metadataStatus?: 'reviewed' | 'anonymous' | 'collective' | 'unknown';
  metadataProvenanceIds?: string[];
};

type ExternalHit = {
  queryId: string; title: string; author?: string; sectionLabel?: string; snippet: string;
  rankWithinProvider: number; page: number; snippetOnly: true; attribution: string;
  provider: 'ccel_live'; locator: { kind: 'external_url'; url: string };
  metadataStatus: 'provider_search_result_unreviewed';
};

export type PresentedPrimarySourceV4Hit = LocalHit | ExternalHit;

type PresentedProvider = {
  provider: 'local' | 'ccel_live';
  status: PrimarySourceProviderStatus;
  searched: boolean;
  page: number;
  hitCount: number;
  resultWindow: { returnedHitCount: number; additionalMatchStatus: 'additional_match_observed' | 'no_additional_match_observed' | 'not_evaluated' };
  hits: PresentedPrimarySourceV4Hit[];
  notices: string[];
  retryAfterSeconds?: number;
  scope?: {
    status: 'matched' | 'catalog_miss' | 'metadata_incomplete';
    requested: { work?: string; author?: string; startYear?: number; endYear?: number };
    eligibleDocumentCount: number;
    eligibleDocuments: Array<{ id: string; title: string; metadataStatus: 'reviewed' | 'anonymous' | 'collective' | 'unknown' }>;
    eligibleDocumentsTruncated: boolean;
  };
};

export interface PresentedPrimarySourceSearchV4 extends Record<string, unknown> {
  schemaVersion: '4';
  kind: 'primary_source_search';
  planStatus: 'complete' | 'partial' | 'unavailable';
  responseWindow: { unit: 'utf8_bytes'; maximum: 32768; truncated: boolean };
  queries: Array<{
    id: string;
    normalizedMode: 'all_terms' | 'phrase';
    normalizedSelection: 'relevance' | 'work_diversity';
    providers: PresentedProvider[];
  }>;
  coverage: {
    localAttempted: boolean; localStatus?: PrimarySourceProviderStatus; localHitCount: number;
    ccelAttempted: boolean; ccelStatus?: PrimarySourceProviderStatus; ccelHitCount: number;
    notices: string[];
  };
  evidencePolicy: typeof PRIMARY_SOURCE_V4_EVIDENCE_POLICY;
}

type ProviderDraft = Omit<PresentedProvider, 'hitCount' | 'resultWindow' | 'hits'> & {
  sourceAdditional: PresentedProvider['resultWindow']['additionalMatchStatus'];
  candidates: PresentedPrimarySourceV4Hit[];
  invalidCandidates: number;
  contractInvalid: boolean;
};

type PresentedHitCandidate = {
  hit: PresentedPrimarySourceV4Hit;
  optionalMetadataInvalid: boolean;
};

/** Build the one sanitized presentation model used for JSON text and links. */
export function presentPrimarySourceSearchV4(result: PrimarySourceSearchPlanResult): PresentedPrimarySourceSearchV4 {
  let ccelGroupSeen = false;
  const sourceQueryCount = result.queries.length;
  const queryDrafts = result.queries.slice(0, 4).flatMap(query => {
    const seen = new Set<'local' | 'ccel_live'>();
    const providers = query.providers.flatMap(provider => {
      if (seen.has(provider.provider) || seen.size >= 2) return [];
      if (provider.provider === 'ccel_live') {
        if (ccelGroupSeen) return [];
        ccelGroupSeen = true;
      }
      seen.add(provider.provider);
      return [providerDraft(provider, query.id)];
    });
    if (providers.length === 0) return [];
    return [{
      id: boundedText(query.id, 40) || 'invalid-query',
      normalizedMode: query.normalizedMode === 'phrase' ? 'phrase' as const : 'all_terms' as const,
      normalizedSelection: query.normalizedSelection === 'work_diversity' ? 'work_diversity' as const : 'relevance' as const,
      providers,
      sourceProviderCount: query.providers.length,
    }];
  });

  const selected = queryDrafts.map(query => query.providers.map(() => [] as PresentedPrimarySourceV4Hit[]));
  let truncated = sourceQueryCount > queryDrafts.length
    || queryDrafts.some(query => query.sourceProviderCount > query.providers.length)
    || queryDrafts.some(query => query.providers.some(provider => provider.invalidCandidates > 0 || provider.contractInvalid));

  outer: for (let queryIndex = 0; queryIndex < queryDrafts.length; queryIndex++) {
    const query = queryDrafts[queryIndex]!;
    for (let providerIndex = 0; providerIndex < query.providers.length; providerIndex++) {
      const provider = query.providers[providerIndex]!;
      for (const candidate of provider.candidates) {
        selected[queryIndex]![providerIndex]!.push(candidate);
        // The non-truncated complete envelope is two bytes larger than the
        // truncated partial form (`false` vs `true`, `complete` vs `partial`).
        // Budget against that larger representation so an all-fitting result
        // cannot cross the limit only when the final flags are recomputed.
        const conservative = buildEnvelope(queryDrafts, selected, false, result.planStatus);
        if (utf8Bytes(conservative) > PRIMARY_SOURCE_V4_MAX_BYTES) {
          selected[queryIndex]![providerIndex]!.pop();
          truncated = true;
          break outer;
        }
      }
    }
  }

  const presented = buildEnvelope(queryDrafts, selected, truncated, result.planStatus);
  // The bounded base envelope is intentionally small. This assertion converts
  // future schema growth into a fail-closed implementation defect, never an
  // oversized MCP payload.
  if (utf8Bytes(presented) > PRIMARY_SOURCE_V4_MAX_BYTES) {
    throw new Error('Primary-source v4 response envelope exceeds its UTF-8 byte budget.');
  }
  return presented;
}

function providerDraft(
  provider: PrimarySourceSearchPlanResult['queries'][number]['providers'][number],
  queryId: string,
): ProviderDraft {
  const providerKind = provider.provider === 'local' ? 'local' : 'ccel_live';
  const presentedCandidates = provider.hits
    .map((hit, sourceIndex) => ({ presented: presentHit(hit, queryId, providerKind), sourceIndex }))
    .filter((item): item is { presented: PresentedHitCandidate; sourceIndex: number } => item.presented !== undefined);
  const optionalMetadataInvalid = presentedCandidates.some(item => item.presented.optionalMetadataInvalid);
  const candidates = presentedCandidates
    .sort((left, right) => left.presented.hit.rankWithinProvider - right.presented.hit.rankWithinProvider || left.sourceIndex - right.sourceIndex)
    .slice(0, providerKind === 'local' ? 8 : 5)
    .map(item => item.presented.hit);
  const validWindow = provider.resultWindow
    && Number.isSafeInteger(provider.resultWindow.returnedHitCount)
    && provider.resultWindow.returnedHitCount === provider.hits.length
    && ['additional_match_observed', 'no_additional_match_observed', 'not_evaluated'].includes(provider.resultWindow.additionalMatchStatus);
  const scope = providerKind === 'local' ? presentScope(provider.scope) : undefined;
  const invalidCandidates = provider.hits.length - candidates.length;
  const countMismatch = provider.hitCount !== provider.hits.length;
  const scopeRequired = providerKind === 'local' && (provider.searched || provider.status === 'catalog_miss');
  const scopeInvalid = providerKind === 'local'
    && ((provider.scope !== undefined && scope === undefined) || (scopeRequired && scope === undefined));
  const pageInvalid = !Number.isSafeInteger(provider.page) || provider.page < 1 || provider.page > 3;
  const retryAfterValid = provider.retryAfterSeconds === undefined
    ? provider.status !== 'rate_limited'
    : provider.provider === 'ccel_live'
      && provider.status === 'rate_limited'
      && Number.isSafeInteger(provider.retryAfterSeconds)
      && provider.retryAfterSeconds >= 1
      && provider.retryAfterSeconds <= 86_400;
  const contractInvalid = countMismatch || !validWindow || scopeInvalid || pageInvalid || optionalMetadataInvalid || !retryAfterValid;
  const status = STATUS.has(provider.status) && invalidCandidates === 0 && !contractInvalid ? provider.status : 'interface_changed';
  return {
    provider: providerKind,
    status,
    searched: provider.searched === true,
    page: Number.isSafeInteger(provider.page) && provider.page >= 1 && provider.page <= 3 ? provider.page : 1,
    notices: uniqueBounded([
      ...(providerKind === 'ccel_live'
        && provider.status !== 'unsupported_filter' && provider.status !== 'disabled'
        ? [CCEL_COMPOSITION_DATE_NOTICE]
        : []),
      ...(invalidCandidates ? ['One or more unsafe or mismatched provider hits were omitted.'] : []),
      ...(countMismatch ? ['Provider-reported hit count did not match its returned hit array.'] : []),
      ...(!validWindow ? ['Provider result-window metadata was invalid.'] : []),
      ...(scopeInvalid ? ['Local catalog scope metadata was absent or invalid.'] : []),
      ...(pageInvalid ? ['Provider page metadata was invalid.'] : []),
      ...(!retryAfterValid ? ['Provider retry-after metadata was absent or invalid.'] : []),
      ...(optionalMetadataInvalid ? ['One or more empty optional metadata fields were omitted after sanitization.'] : []),
      ...provider.notices.filter(notice => notice !== CCEL_COMPOSITION_DATE_NOTICE),
    ], 4, 240),
    ...(scope ? { scope } : {}),
    ...(retryAfterValid && provider.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: provider.retryAfterSeconds }
      : {}),
    sourceAdditional: validWindow ? provider.resultWindow!.additionalMatchStatus : 'not_evaluated',
    candidates,
    invalidCandidates,
    contractInvalid,
  };
}

function buildEnvelope(
  drafts: Array<{ id: string; normalizedMode: 'all_terms' | 'phrase'; normalizedSelection: 'relevance' | 'work_diversity'; providers: ProviderDraft[] }>,
  selected: PresentedPrimarySourceV4Hit[][][],
  truncated: boolean,
  sourcePlanStatus: PrimarySourceSearchPlanResult['planStatus'],
): PresentedPrimarySourceSearchV4 {
  const queries = drafts.map((query, queryIndex) => ({
    id: query.id,
    normalizedMode: query.normalizedMode,
    normalizedSelection: query.normalizedSelection,
    providers: query.providers.map((provider, providerIndex): PresentedProvider => {
      const hits = selected[queryIndex]![providerIndex]!;
      const omitted = hits.length < provider.candidates.length || provider.invalidCandidates > 0 || provider.contractInvalid;
      return {
        provider: provider.provider,
        status: provider.status,
        searched: provider.searched,
        page: provider.page,
        hitCount: hits.length,
        resultWindow: {
          returnedHitCount: hits.length,
          additionalMatchStatus: omitted || provider.sourceAdditional === 'additional_match_observed'
            ? 'additional_match_observed'
            : provider.sourceAdditional,
        },
        hits,
        notices: provider.notices,
        ...(provider.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: provider.retryAfterSeconds }),
        ...(provider.scope ? { scope: provider.scope } : {}),
      };
    }),
  }));
  const providers = queries.flatMap(query => query.providers);
  const local = providers.filter(provider => provider.provider === 'local');
  const ccel = providers.filter(provider => provider.provider === 'ccel_live');
  const statuses = providers.map(provider => provider.status);
  const hasUsable = providers.some(provider => provider.hits.length > 0 || COMPLETE.has(provider.status));
  const recomputed = truncated || sourcePlanStatus === 'partial'
    ? 'partial'
    : statuses.length > 0 && statuses.every(status => COMPLETE.has(status))
      ? 'complete'
      : !hasUsable && statuses.length > 0 && statuses.every(status => UNAVAILABLE.has(status))
        ? 'unavailable'
        : 'partial';
  return {
    schemaVersion: '4',
    kind: 'primary_source_search',
    planStatus: recomputed,
    responseWindow: { unit: 'utf8_bytes', maximum: PRIMARY_SOURCE_V4_MAX_BYTES, truncated },
    queries,
    coverage: {
      localAttempted: local.some(provider => provider.searched),
      ...(local.length ? { localStatus: aggregateStatus(local) } : {}),
      localHitCount: local.reduce((sum, provider) => sum + provider.hits.length, 0),
      ccelAttempted: ccel.some(provider => provider.searched),
      ...(ccel.length ? { ccelStatus: aggregateStatus(ccel) } : {}),
      ccelHitCount: ccel.reduce((sum, provider) => sum + provider.hits.length, 0),
      notices: uniqueBounded(providers.flatMap(provider => provider.notices), 8, 240),
    },
    evidencePolicy: PRIMARY_SOURCE_V4_EVIDENCE_POLICY,
  };
}

function presentHit(
  hit: PrimarySourcePlanHit,
  queryId: string,
  provider: 'local' | 'ccel_live',
): PresentedHitCandidate | undefined {
  if (hit.queryId !== queryId || hit.provider !== provider) return undefined;
  const author = hit.author === undefined ? undefined : boundedText(hit.author, 200);
  const sectionLabel = hit.sectionLabel === undefined ? undefined : boundedText(hit.sectionLabel, 300);
  let optionalMetadataInvalid = (hit.author !== undefined && !author)
    || (hit.sectionLabel !== undefined && !sectionLabel);
  const common = {
    queryId: boundedText(hit.queryId, 40),
    title: boundedText(hit.title, 300),
    ...(author ? { author } : {}),
    ...(sectionLabel ? { sectionLabel } : {}),
    snippet: boundedText(hit.snippet, 240),
    rankWithinProvider: hit.rankWithinProvider,
    page: hit.page,
    snippetOnly: true as const,
    attribution: boundedText(hit.attribution, 300),
  };
  if (!common.queryId || !common.title || !common.attribution
    || !Number.isSafeInteger(common.rankWithinProvider) || common.rankWithinProvider < 1 || common.rankWithinProvider > 32
    || !Number.isSafeInteger(common.page) || common.page < 1 || common.page > 3) return undefined;

  if (provider === 'ccel_live') {
    if (hit.provider !== 'ccel_live') return undefined;
    const url = canonicalExternalUrl(hit.locator.kind === 'ccel_section' ? hit.locator.url : '');
    if (!url) return undefined;
    return {
      hit: {
        ...common,
        provider,
        locator: { kind: 'external_url', url },
        metadataStatus: 'provider_search_result_unreviewed',
      },
      optionalMetadataInvalid,
    };
  }

  if (hit.provider !== 'local' || hit.locator.kind !== 'local_section') return undefined;
  const uri = buildLocalDocumentResourceUri(hit.locator.documentId, hit.locator.sectionId);
  if (!uri || uri !== hit.locator.url || !Number.isSafeInteger(hit.resourceSizeBytes) || hit.resourceSizeBytes < 0) return undefined;
  const creators = hit.creators?.slice(0, 8).flatMap(creator => {
    const name = boundedText(creator.name, 160);
    return name && CREATOR_ROLES.has(creator.role) ? [{ name, role: creator.role }] : [];
  });
  const provenance = [...new Set((hit.metadataProvenanceIds ?? [])
    .filter(id => /^hist-meta-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)))].slice(0, 4);
  const documentType = hit.documentType === undefined ? undefined : boundedText(hit.documentType, 100);
  const documentDate = hit.documentDate === undefined ? undefined : boundedText(hit.documentDate, 100);
  optionalMetadataInvalid ||= (hit.documentType !== undefined && !documentType)
    || (hit.documentDate !== undefined && !documentDate);
  return {
    hit: {
      ...common,
      provider,
      locator: { kind: 'mcp_resource', uri, documentId: hit.locator.documentId, sectionId: hit.locator.sectionId },
      resourceSizeBytes: hit.resourceSizeBytes,
      ...(documentType ? { documentType } : {}),
      ...(documentDate ? { documentDate } : {}),
      ...(creators?.length ? { creators } : {}),
      ...(hit.metadataStatus && ['reviewed', 'anonymous', 'collective', 'unknown'].includes(hit.metadataStatus)
        ? { metadataStatus: hit.metadataStatus }
        : {}),
      ...(provenance.length ? { metadataProvenanceIds: provenance } : {}),
    },
    optionalMetadataInvalid,
  };
}

function canonicalExternalUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'ccel.org' || url.port || url.username || url.password) return undefined;
    if (!/^\/ccel\/[a-z0-9_-]+\/[a-z0-9_-]+\/[a-z0-9_.-]+\.html$/.test(url.pathname)) return undefined;
    if (url.search || url.hash) return undefined;
    return `https://ccel.org${url.pathname}`;
  } catch {
    return undefined;
  }
}

function presentScope(scope: PrimarySourceSearchPlanResult['queries'][number]['providers'][number]['scope']): PresentedProvider['scope'] | undefined {
  if (!scope || !['matched', 'catalog_miss', 'metadata_incomplete'].includes(scope.status)
    || !Number.isSafeInteger(scope.eligibleDocumentCount) || scope.eligibleDocumentCount < 0
    || scope.eligibleDocumentCount > CLASSIC_TEXT_LIMITS.workCount) return undefined;
  const eligibleDocuments = scope.eligibleDocuments.slice(0, 5).flatMap(document => {
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
  return {
    status: scope.status,
    requested: {
      ...(work ? { work } : {}), ...(author ? { author } : {}),
      ...(startYear !== undefined ? { startYear } : {}), ...(endYear !== undefined ? { endYear } : {}),
    },
    eligibleDocumentCount: scope.eligibleDocumentCount,
    eligibleDocuments,
    eligibleDocumentsTruncated: scope.eligibleDocumentsTruncated || scope.eligibleDocuments.length > eligibleDocuments.length,
  };
}

function aggregateStatus(providers: PresentedProvider[]): PrimarySourceProviderStatus {
  const priority: PrimarySourceProviderStatus[] = ['unavailable', 'rate_limited', 'interface_changed', 'disabled', 'unsupported_filter', 'catalog_miss', 'ok', 'no_results'];
  return priority.find(status => providers.some(provider => provider.status === status)) ?? 'unavailable';
}

function boundedText(value: string, maximum: number): string {
  return Array.from(value.normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, ' ')
    .replace(/\s+/gu, ' ').trim()).slice(0, maximum).join('');
}

function uniqueBounded(values: string[], maximumItems: number, maximumLength: number): string[] {
  return [...new Set(values.map(value => boundedText(value, maximumLength)).filter(Boolean))].slice(0, maximumItems);
}

function utf8Bytes(value: unknown): number {
  return textEncoder.encode(JSON.stringify(value)).byteLength;
}
