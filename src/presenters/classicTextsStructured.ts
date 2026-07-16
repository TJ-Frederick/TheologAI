import type { DocumentInfo, DocumentSection } from '../kernel/repositories.js';
import { buildLocalDocumentResourceUri, parseLocalDocumentResourceUri } from '../kernel/documentResource.js';
import {
  formatLocalDocumentResource,
  formatLocalDocumentSectionResource,
  formatHistoricalDiscoverySnippet,
} from '../formatters/historicalFormatter.js';
import { OutputLimitError } from '../kernel/errors.js';
import { CLASSIC_TEXT_LIMITS } from '../kernel/classicTextContract.js';

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

function base(mode: 'list_works' | 'browse_sections' | 'work' | 'search') {
  return {
    schemaVersion: '1' as const,
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

function resourceForSection(document: DocumentInfo, section: DocumentSection) {
  return resourceLocator(
    document.id,
    section.section_number,
    formatLocalDocumentSectionResource(document, section),
  );
}

function unsizedResourceForSection(document: DocumentInfo, section: DocumentSection) {
  const uri = validatedResourceUri(document.id, section.section_number);
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
    resource: resourceForDocument(document, sections),
  };
}

function metadataWorkSummary(document: DocumentInfo) {
  return {
    id: document.id,
    title: document.title,
    type: document.type,
    date: document.date,
    topics: document.topics,
    resource: unsizedResourceForDocument(document),
  };
}

function sizedSectionSummary(document: DocumentInfo, section: DocumentSection) {
  return {
    id: section.id,
    sectionNumber: section.section_number,
    title: section.title,
    resource: resourceForSection(document, section),
  };
}

function directorySectionSummary(document: DocumentInfo, section: DocumentSection) {
  return {
    id: section.id,
    sectionNumber: section.section_number,
    title: section.title,
    resource: unsizedResourceForSection(document, section),
  };
}

export function presentClassicTextCatalog(documents: DocumentInfo[]) {
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
      works: documents.map(document => ({
        id: document.id,
        title: document.title,
        type: document.type,
        date: document.date,
        topics: document.topics,
        resource: unsizedResourceForDocument(document),
      })),
      resultWindow: {
        returnedCount: documents.length,
        additionalMatchStatus: 'no_additional_match_observed' as const,
      },
    },
  };
}

export function presentClassicTextDirectory(work: PreparedClassicTextWork) {
  assertSectionLimit(work.sections.length);
  const sections = work.sections.map(section => directorySectionSummary(work.document, section));
  return {
    ...base('browse_sections'),
    directory: {
      coverage: 'complete_section_directory' as const,
      work: metadataWorkSummary(work.document),
      sections,
      resultWindow: {
        returnedCount: sections.length,
        additionalMatchStatus: 'no_additional_match_observed' as const,
      },
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
      sectionCount: work.sections.length,
      bodyDelivery: 'markdown_only' as const,
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
  sectionsWithLookahead: DocumentSection[],
  documents: DocumentInfo[],
) {
  const byId = new Map(documents.map(document => [document.id, document]));
  const candidates = sectionsWithLookahead.map(section => {
    const document = byId.get(section.document_id);
    if (!document) throw new Error('Historical search result has no matching document metadata');
    return { document, section };
  });
  // Validate the lookahead locator too: it is evidence for the additional-match claim,
  // but do not format or encode content that is not selected for delivery.
  for (const candidate of candidates) unsizedResourceForSection(candidate.document, candidate.section);
  const hits = candidates.slice(0, CLASSIC_TEXT_LIMITS.searchHits).map(({ document, section }, index) => ({
    rank: index + 1,
    work: {
      id: document.id,
      title: document.title,
      type: document.type,
      date: document.date,
    },
    section: sizedSectionSummary(document, section),
    discoverySnippet: formatHistoricalDiscoverySnippet(section.content),
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
  if (!root || root.kind !== 'classic_text_lookup' || root.schemaVersion !== '1') return false;
  const mode = root.mode;
  const branchNames = ['catalog', 'directory', 'document', 'search'] as const;
  const expectedBranch = mode === 'list_works' ? 'catalog'
    : mode === 'browse_sections' ? 'directory'
      : mode === 'work' ? 'document'
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
    const emitted = Math.min(32, sections.length);
    const additional = sections.length > 32
      ? 'additional_link_observed'
      : 'no_additional_link_observed';
    return resultWindow.returnedCount === sections.length
      && resultWindow.additionalMatchStatus === 'no_additional_match_observed'
      && linkWindow.maximumResourceLinks === 32
      && linkWindow.emittedResourceLinkCount === emitted
      && linkWindow.additionalLinkStatus === additional;
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

  return record(root.document) !== undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
