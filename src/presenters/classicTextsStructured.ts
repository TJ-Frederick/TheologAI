import type { DocumentInfo, DocumentSection, HistoricalDocumentDeliveryProfile, HistoricalSectionSummary, ResolvedHistoricalSection } from '../kernel/repositories.js';
import { buildLocalDocumentResourceUri, parseLocalDocumentResourceUri } from '../kernel/documentResource.js';
import {
  formatLocalDocumentResource,
  formatLocalDocumentSectionResourceWithIdentity,
  formatSectionedDocumentLanding,
  formatHistoricalDiscoverySnippet,
} from '../formatters/historicalFormatter.js';
import { OutputLimitError } from '../kernel/errors.js';
import { CLASSIC_TEXT_LIMITS } from '../kernel/classicTextContract.js';
import { HISTORICAL_SECTIONED_ONLY_PAGE_SIZE } from '../kernel/historicalSectionedDelivery.js';

const encoder = new TextEncoder();
export const CLASSIC_TEXT_WORK_LIMIT = CLASSIC_TEXT_LIMITS.workCount;
export const CLASSIC_TEXT_SECTION_LIMIT = CLASSIC_TEXT_LIMITS.sectionsPerWork;

export const CLASSIC_TEXT_EVIDENCE_POLICY = {
  providerScope: 'local_only',
  remoteDocumentBodies: 'disabled',
  editionProvenance: 'incomplete',
  rightsStatus: 'not_established',
  searchSnippets: 'discovery_only',
  selectedContentAccess: 'mcp_resource_read',
} as const;

export interface PreparedClassicTextWork {
  document: DocumentInfo;
  sections: DocumentSection[];
}

function base(mode: 'list_works' | 'browse_sections' | 'work' | 'landing' | 'search') {
  return {
    schemaVersion: '2' as const,
    kind: 'classic_text_lookup' as const,
    mode,
    evidencePolicy: CLASSIC_TEXT_EVIDENCE_POLICY,
  };
}

function resourceForDocument(document: DocumentInfo, sections: DocumentSection[]) {
  return resourceLocator(document.id, undefined, formatLocalDocumentResource(document, sections));
}

function unsizedResourceForDocument(document: DocumentInfo) {
  const uri = validatedResourceUri(document.id);
  return { kind: 'mcp_resource' as const, uri };
}

function resourceForSection(document: DocumentInfo, section: DocumentSection, sectionKey: string, sourceOrdinal: number) {
  const uri = validatedResourceUri(document.id, sectionKey);
  return resourceLocator(
    document.id,
    sectionKey,
    formatLocalDocumentSectionResourceWithIdentity(document, section, {
      sectionKey, sourceOrdinal, resolution: 'canonical', canonicalUri: uri,
    }),
  );
}

function unsizedResourceForSection(document: DocumentInfo, sectionKey: string) {
  const uri = validatedResourceUri(document.id, sectionKey);
  return { kind: 'mcp_resource' as const, uri };
}

function resourceLocator(documentId: string, sectionId: string | undefined, text: string) {
  const uri = validatedResourceUri(documentId, sectionId);
  return {
    kind: 'mcp_resource' as const,
    uri,
    resourceSizeBytes: encoder.encode(text).byteLength,
  };
}

function validatedResourceUri(documentId: string, sectionId?: string): string {
  const uri = buildLocalDocumentResourceUri(documentId, sectionId);
  const parsed = uri ? parseLocalDocumentResourceUri(uri) : undefined;
  if (!uri || !parsed || parsed.documentId !== documentId || parsed.sectionId !== sectionId) {
    throw new Error('Historical document resource identity is invalid');
  }
  return uri;
}

function sizedWorkSummary(work: PreparedClassicTextWork) {
  const { document, sections } = work;
  return {
    id: document.id,
    title: document.title,
    type: document.type,
    date: document.date,
    topics: document.topics,
    deliveryMode: 'complete_document' as const,
    resource: resourceForDocument(document, sections),
  };
}

function metadataWorkSummary(document: DocumentInfo, profile: HistoricalDocumentDeliveryProfile) {
  return {
    id: document.id,
    title: document.title,
    type: document.type,
    date: document.date,
    topics: document.topics,
    deliveryMode: profile.deliveryMode,
    resource: unsizedResourceForDocument(document),
  };
}

function sizedSectionSummary(document: DocumentInfo, section: ResolvedHistoricalSection) {
  return {
    sectionKey: section.sectionKey,
    sourceOrdinal: section.sourceOrdinal,
    legacyDisplayLabel: section.section.section_number,
    heading: section.section.title,
    resource: resourceForSection(document, section.section, section.sectionKey, section.sourceOrdinal),
  };
}

function directorySectionSummary(document: DocumentInfo, section: HistoricalSectionSummary) {
  return {
    sectionKey: section.sectionKey,
    sourceOrdinal: section.sourceOrdinal,
    legacyDisplayLabel: section.legacyDisplayLabel,
    heading: section.heading,
    resource: unsizedResourceForSection(document, section.sectionKey),
  };
}

export function presentClassicTextCatalog(documents: Array<{ document: DocumentInfo; profile: HistoricalDocumentDeliveryProfile }>) {
  if (documents.length > CLASSIC_TEXT_WORK_LIMIT) {
    throw new OutputLimitError(
      `The local classic-text inventory contains ${documents.length} works, exceeding the v1 limit of ${CLASSIC_TEXT_WORK_LIMIT}.`,
    );
  }
  return {
    ...base('list_works'),
    catalog: {
      coverage: 'complete_local_work_inventory' as const,
      delivery: 'metadata_summary' as const,
      nativeResourceLinks: 'not_emitted' as const,
      works: documents.map(({ document, profile }) => metadataWorkSummary(document, profile)),
      resultWindow: {
        returnedCount: documents.length,
        additionalMatchStatus: 'no_additional_match_observed' as const,
      },
    },
  };
}

export function presentClassicTextDirectory(input: {
  document: DocumentInfo; profile: HistoricalDocumentDeliveryProfile; sections: HistoricalSectionSummary[]; nextCursor?: string;
}) {
  assertSectionLimit(input.sections.length);
  const sections = input.sections.map(section => directorySectionSummary(input.document, section));
  return {
    ...base('browse_sections'),
    directory: {
      coverage: input.profile.deliveryMode === 'sectioned_only' ? 'bounded_section_directory' as const : 'complete_section_directory' as const,
      work: metadataWorkSummary(input.document, input.profile),
      sections,
      resultWindow: {
        returnedCount: sections.length,
        additionalMatchStatus: input.nextCursor ? 'additional_match_observed' as const : 'no_additional_match_observed' as const,
      },
      ...(input.profile.deliveryMode === 'sectioned_only' ? {
        pagination: {
          pageSize: HISTORICAL_SECTIONED_ONLY_PAGE_SIZE,
          ...(input.nextCursor ? { nextCursor: input.nextCursor } : {}),
        },
      } : {}),
      linkWindow: {
        maximumResourceLinks: CLASSIC_TEXT_LIMITS.nativeDirectoryLinks,
        emittedResourceLinkCount: Math.min(sections.length, CLASSIC_TEXT_LIMITS.nativeDirectoryLinks),
        additionalLinkStatus: sections.length > CLASSIC_TEXT_LIMITS.nativeDirectoryLinks
          ? 'additional_link_observed' as const
          : 'no_additional_link_observed' as const,
      },
    },
  };
}

export function presentClassicTextWork(work: PreparedClassicTextWork) {
  assertSectionLimit(work.sections.length);
  return {
    ...base('work'),
    document: {
      work: sizedWorkSummary(work),
      deliveryMode: 'complete_document' as const,
      sectionCount: work.sections.length,
      bodyDelivery: 'markdown_only' as const,
    },
  };
}

export function presentClassicTextSectionedLanding(document: DocumentInfo, profile: HistoricalDocumentDeliveryProfile) {
  return {
    ...base('landing'),
    landing: {
      work: {
        ...metadataWorkSummary(document, profile),
        resource: resourceLocator(document.id, undefined, formatSectionedDocumentLanding(document, profile)),
      },
      sectionCount: profile.sectionCount,
      bodyDelivery: 'exact_section_resource_only' as const,
      browse: { pageSize: HISTORICAL_SECTIONED_ONLY_PAGE_SIZE, cursor: 'opaque_keyset_cursor' as const },
    },
  };
}

function assertSectionLimit(sectionCount: number): void {
  if (sectionCount > CLASSIC_TEXT_SECTION_LIMIT) {
    throw new OutputLimitError(
      `The selected classic text contains ${sectionCount} sections, exceeding the v1 limit of ${CLASSIC_TEXT_SECTION_LIMIT}.`,
    );
  }
}

export function presentClassicTextSearch(
  query: string,
  sectionsWithLookahead: ResolvedHistoricalSection[],
  profiles: Map<string, HistoricalDocumentDeliveryProfile>,
) {
  const candidates = sectionsWithLookahead.map(section => ({ document: section.document, section }));
  // Validate the lookahead locator too: it is evidence for the additional-match claim,
  // but do not format or encode content that is not selected for delivery.
  for (const candidate of candidates) unsizedResourceForSection(candidate.document, candidate.section.sectionKey);
  const hits = candidates.slice(0, CLASSIC_TEXT_LIMITS.searchHits).map(({ document, section }, index) => ({
    rank: index + 1,
    work: {
      id: document.id,
      title: document.title,
      type: document.type,
      date: document.date,
      deliveryMode: requireProfile(profiles, document.id).deliveryMode,
    },
    section: sizedSectionSummary(document, section),
    discoverySnippet: formatHistoricalDiscoverySnippet(section.section.content),
    snippetOnly: true as const,
  }));
  return {
    ...base('search'),
    search: {
      query,
      status: hits.length > 0 ? 'ok' as const : 'no_results' as const,
      hits,
      resultWindow: {
        returnedCount: hits.length,
        additionalMatchStatus: candidates.length > CLASSIC_TEXT_LIMITS.searchHits
          ? 'additional_match_observed' as const
          : 'no_additional_match_observed' as const,
      },
    },
  };
}

/** Cross-field invariants intentionally stricter than the transport schema. */
export function validateClassicTextsOutputSemantics(value: unknown): boolean {
  const root = record(value);
  if (!root || root.kind !== 'classic_text_lookup' || root.schemaVersion !== '2') return false;
  const mode = root.mode;
  const branchNames = ['catalog', 'directory', 'document', 'landing', 'search'] as const;
  const expectedBranch = mode === 'list_works' ? 'catalog'
    : mode === 'browse_sections' ? 'directory'
      : mode === 'work' ? 'document'
        : mode === 'landing' ? 'landing'
        : mode === 'search' ? 'search'
          : undefined;
  if (!expectedBranch) return false;
  if (branchNames.some(name => name === expectedBranch
    ? record(root[name]) === undefined
    : root[name] !== undefined)) return false;

  if (mode === 'list_works') {
    const catalog = record(root.catalog);
    const window = record(catalog?.resultWindow);
    const works = Array.isArray(catalog?.works) ? catalog.works : undefined;
    return Boolean(catalog && window && works
      && catalog.coverage === 'complete_local_work_inventory'
      && catalog.delivery === 'metadata_summary'
      && catalog.nativeResourceLinks === 'not_emitted'
      && window.returnedCount === works.length
      && window.additionalMatchStatus === 'no_additional_match_observed');
  }

  if (mode === 'browse_sections') {
    const directory = record(root.directory);
    const resultWindow = record(directory?.resultWindow);
    const linkWindow = record(directory?.linkWindow);
    const sections = Array.isArray(directory?.sections) ? directory.sections : undefined;
    if (!directory || !resultWindow || !linkWindow || !sections) return false;
    const emitted = Math.min(CLASSIC_TEXT_LIMITS.nativeDirectoryLinks, sections.length);
    const additional = sections.length > CLASSIC_TEXT_LIMITS.nativeDirectoryLinks
      ? 'additional_link_observed'
      : 'no_additional_link_observed';
    const bounded = directory.coverage === 'bounded_section_directory';
    const pagination = record(directory.pagination);
    return resultWindow.returnedCount === sections.length
      && (resultWindow.additionalMatchStatus === (directory.pagination && record(directory.pagination)?.nextCursor
        ? 'additional_match_observed' : 'no_additional_match_observed'))
      && linkWindow.maximumResourceLinks === CLASSIC_TEXT_LIMITS.nativeDirectoryLinks
      && linkWindow.emittedResourceLinkCount === emitted
      && linkWindow.additionalLinkStatus === additional
      && (!bounded || sections.length <= HISTORICAL_SECTIONED_ONLY_PAGE_SIZE
        && pagination?.pageSize === HISTORICAL_SECTIONED_ONLY_PAGE_SIZE);
  }

  if (mode === 'search') {
    const search = record(root.search);
    const resultWindow = record(search?.resultWindow);
    const hits = Array.isArray(search?.hits) ? search.hits : undefined;
    if (!search || !resultWindow || !hits || hits.length > CLASSIC_TEXT_LIMITS.searchHits) return false;
    const additional = resultWindow.additionalMatchStatus;
    return resultWindow.returnedCount === hits.length
      && search.status === (hits.length === 0 ? 'no_results' : 'ok')
      && (hits.length === CLASSIC_TEXT_LIMITS.searchHits
        ? additional === 'additional_match_observed' || additional === 'no_additional_match_observed'
        : additional === 'no_additional_match_observed');
  }

  if (mode === 'landing') {
    const landing = record(root.landing);
    const browse = record(landing?.browse);
    return Boolean(landing && browse && landing.bodyDelivery === 'exact_section_resource_only'
      && browse.pageSize === HISTORICAL_SECTIONED_ONLY_PAGE_SIZE && browse.cursor === 'opaque_keyset_cursor');
  }
  return record(root.document) !== undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function requireProfile(profiles: Map<string, HistoricalDocumentDeliveryProfile>, documentId: string): HistoricalDocumentDeliveryProfile {
  const profile = profiles.get(documentId);
  if (!profile) throw new OutputLimitError(`Historical delivery profile is unavailable for ${documentId}.`);
  return profile;
}
