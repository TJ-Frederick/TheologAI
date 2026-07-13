/**
 * Provider-neutral contracts for bounded primary-source discovery.
 *
 * This slice deliberately contains search contracts only. It does not add an
 * MCP tool or a fetch/batch orchestration service.
 */

export type PrimarySourceSearchMatch = 'all_terms' | 'phrase';

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
}

export interface CcelSectionLocator {
  kind: 'ccel_section';
  url: string;
  work: string;
  section: string;
}

export interface LocalSectionLocator {
  kind: 'local_section';
  url: string;
  documentId: string;
  sectionId: string;
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

export interface PrimarySourcePlanProviderResult extends Omit<PrimarySourceProviderResult, 'hits'> {
  hits: PrimarySourcePlanHit[];
}

export interface PrimarySourcePlanQueryResult {
  id: string;
  normalizedMode: PrimarySourceSearchMatch;
  providers: PrimarySourcePlanProviderResult[];
}

export interface PrimarySourceSearchCoverage {
  localAttempted: boolean;
  localStatus?: PrimarySourceProviderStatus;
  localHitCount: number;
  ccelAttempted: boolean;
  ccelStatus?: PrimarySourceProviderStatus;
  ccelHitCount: number;
  notices: string[];
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
  hits: PrimarySourceSearchHit[];
  notices: string[];
  scope?: PrimarySourceCatalogScope;
}
