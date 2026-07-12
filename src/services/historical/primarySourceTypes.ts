/**
 * Provider-neutral contracts for bounded primary-source discovery.
 *
 * This slice deliberately contains search contracts only. It does not add an
 * MCP tool or a fetch/batch orchestration service.
 */

export type PrimarySourceSearchMatch = 'all_terms' | 'phrase';

export type PrimarySourceProvider = 'local' | 'ccel_live';

export type PrimarySourceProviderStatus =
  | 'ok'
  | 'no_results'
  | 'unavailable'
  | 'disabled'
  | 'rate_limited'
  | 'interface_changed'
  | 'unsupported_filter';

export interface PrimarySourceSearchQuery {
  text: string;
  match?: PrimarySourceSearchMatch;
  author?: string;
  work?: string;
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

export interface PrimarySourceSearchHit {
  provider: PrimarySourceProvider;
  title: string;
  author?: string;
  sectionLabel?: string;
  snippet: string;
  locator: PrimarySourceLocator;
  rankWithinProvider: number;
  page: number;
  /** Search snippets are discovery metadata, never fetched evidence. */
  snippetOnly: true;
  attribution: string;
}

export interface PrimarySourceProviderResult {
  provider: PrimarySourceProvider;
  status: PrimarySourceProviderStatus;
  searched: boolean;
  page: number;
  hitCount: number;
  hits: PrimarySourceSearchHit[];
  notices: string[];
}
