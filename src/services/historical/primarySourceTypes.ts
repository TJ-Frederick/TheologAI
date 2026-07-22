/**
 * Provider-neutral contracts for bounded primary-source discovery.
 *
 * This slice deliberately contains search contracts only. It does not add an
 * MCP tool or a fetch/batch orchestration service.
 */

export const CCEL_COMPOSITION_DATE_NOTICE = 'CCEL discovery was not composition-date filtered; its results cannot establish membership in a requested historical period.';

/**
 * The current hosted collection predates the per-edition provenance compiler.
 * This intentionally says only what the server has established: it does not
 * turn public-domain underlying works into claims about their transcription,
 * edition, or redistribution permission.
 */
export const LOCAL_EDITION_READINESS = Object.freeze({
  foundation: 'edition-provenance-foundation.v1',
  editionIdentity: 'not_established',
  provenance: 'incomplete',
  exactArtifactRights: 'not_established_by_this_contract',
} as const);

/** Provider search results are not reviewed editions or local corpus claims. */
export const EXTERNAL_EDITION_READINESS = Object.freeze({
  editionIdentity: 'provider_unreviewed',
  provenance: 'provider_unreviewed',
  exactArtifactRights: 'not_determined',
} as const);

/**
 * Search execution is server-observable.  Resource reads and intentional
 * deferrals happen in the MCP host after this tool response, so they belong in
 * the host's final research ledger rather than being guessed here.
 */
export const PRIMARY_SOURCE_COVERAGE_POLICY = Object.freeze({
  searched: 'server_observed_provider_execution',
  read: 'host_observed_successful_exact_resource_or_page_read',
  deferred: 'host_recorded_intentional_deferral',
  notSearched: 'server_observed_provider_non_execution',
} as const);

export type PrimarySourceSearchMatch = 'all_terms' | 'phrase';
export type PrimarySourceSelection = 'relevance' | 'work_diversity';

export type PrimarySourceRequestedProvider = 'local' | 'ccel';

export type PrimarySourceProvider = 'local' | 'ccel_live';

export type PrimarySourceProviderStatus =
  | 'ok'
  | 'no_results'
  | 'unavailable'
  | 'disabled'
  | 'rate_limited'
  | 'interface_changed'
  | 'catalog_miss'
  | 'unsupported_filter';

export interface PrimarySourceSearchQuery {
  text: string;
  match?: PrimarySourceSearchMatch;
  author?: string;
  work?: string;
  startYear?: number;
  endYear?: number;
  page?: number;
  limit?: number;
  selection?: PrimarySourceSelection;
}

export interface CcelSectionLocator {
  kind: 'ccel_section';
  /** Canonical exact-section URL; provider tracking query/hash values are never retained. */
  url: string;
  work: string;
  section: string;
}

export interface LocalSectionLocator {
  kind: 'local_section';
  url: string;
  documentId: string;
  /** Canonical Transform-8 public identity, never the storage/legacy id. */
  sectionKey: string;
  sourceOrdinal: number;
}

export type PrimarySourceLocator = CcelSectionLocator | LocalSectionLocator;

interface PrimarySourceSearchHitBase {
  title: string;
  author?: string;
  sectionLabel?: string;
  snippet: string;
  rankWithinProvider: number;
  page: number;
  /** Search snippets are discovery metadata, never fetched evidence. */
  snippetOnly: true;
  attribution: string;
  /** Reviewed catalog metadata. Absence means unknown, not that the work has no type/date. */
  documentType?: string;
  documentDate?: string;
  creators?: Array<{ name: string; role: 'author' | 'issuing_body' | 'drafting_body' | 'revising_body' | 'compiler' }>;
  metadataStatus?: 'reviewed' | 'anonymous' | 'collective' | 'unknown';
  /** Stable IDs into the checked-in historical metadata provenance manifest. */
  metadataProvenanceIds?: string[];
}

export interface PrimarySourceCatalogScope {
  status: 'matched' | 'catalog_miss' | 'metadata_incomplete';
  requested: { work?: string; author?: string; startYear?: number; endYear?: number };
  eligibleDocumentCount: number;
  eligibleDocuments: Array<{
    id: string;
    title: string;
    metadataStatus: 'reviewed' | 'anonymous' | 'collective' | 'unknown';
  }>;
  eligibleDocumentsTruncated: boolean;
}

export interface LocalPrimarySourceSearchHit extends PrimarySourceSearchHitBase {
  provider: 'local';
  locator: LocalSectionLocator;
  /** Exact UTF-8 byte size of the corresponding MCP resource representation. */
  resourceSizeBytes: number;
}

export interface CcelPrimarySourceSearchHit extends PrimarySourceSearchHitBase {
  provider: 'ccel_live';
  locator: CcelSectionLocator;
}

export type PrimarySourceSearchHit = LocalPrimarySourceSearchHit | CcelPrimarySourceSearchHit;

export interface PrimarySourceSearchPlanQuery extends PrimarySourceSearchQuery {
  id: string;
  providers: PrimarySourceRequestedProvider[];
}

export type PrimarySourcePlanHit = PrimarySourceSearchHit & {
  queryId: string;
};

export interface PrimarySourcePlanProviderResult extends Omit<PrimarySourceProviderResult, 'hits' | 'resultWindow'> {
  hits: PrimarySourcePlanHit[];
  resultWindow: PrimarySourceResultWindow;
}

export interface PrimarySourcePlanQueryResult {
  id: string;
  normalizedMode: PrimarySourceSearchMatch;
  normalizedSelection: PrimarySourceSelection;
  providers: PrimarySourcePlanProviderResult[];
}

export interface PrimarySourceResultWindow {
  returnedHitCount: number;
  additionalMatchStatus: 'additional_match_observed' | 'no_additional_match_observed' | 'not_evaluated';
}

export interface PrimarySourceSearchCoverage {
  localAttempted: boolean;
  localStatus?: PrimarySourceProviderStatus;
  localHitCount: number;
  ccelAttempted: boolean;
  ccelStatus?: PrimarySourceProviderStatus;
  ccelHitCount: number;
  notices: string[];
  /** Facts known at tool-return time; no future resource read is inferred. */
  serverObserved?: {
    searched: Array<{
      queryId: string;
      provider: PrimarySourceProvider;
      status: PrimarySourceProviderStatus;
      returnedHitCount: number;
    }>;
    notSearched: Array<{
      queryId: string;
      provider: PrimarySourceProvider;
      status: PrimarySourceProviderStatus;
    }>;
  };
}

export interface PrimarySourceSearchPlanResult {
  planStatus: 'complete' | 'partial' | 'unavailable';
  queries: PrimarySourcePlanQueryResult[];
  coverage: PrimarySourceSearchCoverage;
}

export const LOCAL_PRIMARY_SOURCE_ATTRIBUTION = 'TheologAI local historical-document collection';

export interface PrimarySourceProviderResult {
  provider: PrimarySourceProvider;
  status: PrimarySourceProviderStatus;
  searched: boolean;
  page: number;
  hitCount: number;
  /** Added by local lookahead; the plan service normalizes dormant providers to not_evaluated. */
  resultWindow?: PrimarySourceResultWindow;
  hits: PrimarySourceSearchHit[];
  notices: string[];
  /** Honest bounded wait guidance, present only for a rate-limited live CCEL provider. */
  retryAfterSeconds?: number;
  scope?: PrimarySourceCatalogScope;
}
