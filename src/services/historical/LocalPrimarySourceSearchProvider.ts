import type { DocumentInfo, IHistoricalDocumentRepository } from '../../kernel/repositories.js';
import { buildLocalDocumentResourceUri } from '../../kernel/documentResource.js';
import {
  LOCAL_PRIMARY_SOURCE_ATTRIBUTION,
  type PrimarySourceProviderResult,
  type PrimarySourceSearchQuery,
} from './primarySourceTypes.js';
import { formatLocalDocumentSectionResource } from '../../formatters/historicalFormatter.js';

export class LocalPrimarySourceSearchProvider {
  constructor(private readonly repository: IHistoricalDocumentRepository) {}

  async search(input: PrimarySourceSearchQuery): Promise<PrimarySourceProviderResult> {
    const page = input.page ?? 1;
    const limit = input.limit ?? 5;
    if (page !== 1) {
      return result('unsupported_filter', page, false, [], ['The local historical index does not support pagination; page was not silently ignored.']);
    }
    const documents = await this.repository.listDocuments();
    const selected = selectCatalogScope(documents, input);
    if (selected.scope.eligibleDocumentCount === 0) {
      return result('catalog_miss', page, false, [], selected.notices, selected.scope);
    }

    const rows = await this.repository.searchPrimarySources({
      text: input.text,
      match: input.match ?? 'all_terms',
      ...(selected.restricted ? { documentIds: selected.documents.map(document => document.id) } : {}),
      limit,
    });
    const hits = rows.map((row, index) => ({
      provider: 'local' as const,
      title: row.document.title,
      ...(row.section.title ? { sectionLabel: row.section.title } : {}),
      snippet: boundedMatchContext(row.section.content, input.text, input.match ?? 'all_terms', 500),
      locator: {
        kind: 'local_section' as const,
        documentId: row.document.id,
        sectionId: row.section.section_number,
        url: buildLocalDocumentResourceUri(row.document.id, row.section.section_number)!,
      },
      rankWithinProvider: index + 1,
      page,
      snippetOnly: true as const,
      attribution: LOCAL_PRIMARY_SOURCE_ATTRIBUTION,
      documentType: row.document.type,
      ...(row.document.date ? { documentDate: row.document.date } : {}),
      ...(row.document.catalog?.creators.length ? { creators: row.document.catalog.creators } : {}),
      ...(row.document.catalog ? { metadataStatus: row.document.catalog.metadataStatus } : {}),
      ...(row.document.catalog ? { metadataProvenanceIds: row.document.catalog.metadataProvenanceIds } : {}),
      resourceSizeBytes: new TextEncoder().encode(
        formatLocalDocumentSectionResource(row.document, row.section),
      ).byteLength,
    }));
    return result(hits.length > 0 ? 'ok' : 'no_results', page, true, hits, selected.notices, selected.scope);
  }
}

function result(
  status: PrimarySourceProviderResult['status'],
  page: number,
  searched: boolean,
  hits: PrimarySourceProviderResult['hits'] = [],
  notices: string[] = [],
  scope?: PrimarySourceProviderResult['scope'],
): PrimarySourceProviderResult {
  return { provider: 'local', status, searched, page, hitCount: hits.length, hits, notices, ...(scope ? { scope } : {}) };
}

function normalizeForExactComparison(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

const MAX_SCOPE_DOCUMENTS = 8;

function selectCatalogScope(documents: DocumentInfo[], input: PrimarySourceSearchQuery): {
  documents: DocumentInfo[];
  restricted: boolean;
  scope: NonNullable<PrimarySourceProviderResult['scope']>;
  notices: string[];
} {
  const requested = {
    ...(input.work ? { work: input.work } : {}),
    ...(input.author ? { author: input.author } : {}),
    ...(input.startYear !== undefined ? { startYear: input.startYear } : {}),
    ...(input.endYear !== undefined ? { endYear: input.endYear } : {}),
  };
  const restricted = Object.keys(requested).length > 0;
  let candidates = documents;
  const notices: string[] = [];
  let incomplete = false;

  if (input.work !== undefined) {
    const work = normalizeForExactComparison(input.work);
    candidates = candidates.filter(document => [document.id, document.title, ...(document.catalog?.lookupAliases ?? [])]
      .some(alias => normalizeForExactComparison(alias) === work));
  }
  if (input.author !== undefined) {
    const author = normalizeForExactComparison(input.author);
    incomplete = candidates.some(document => !document.catalog || document.catalog.creators.length === 0);
    candidates = candidates.filter(document => document.catalog?.creators
      .some(creator => normalizeForExactComparison(creator.name) === author));
  }
  if (input.startYear !== undefined || input.endYear !== undefined) {
    incomplete = incomplete || candidates.some(document => document.catalog?.composition.startYear === undefined
      || document.catalog.composition.endYear === undefined);
    const requestedStart = input.startYear ?? Number.MIN_SAFE_INTEGER;
    const requestedEnd = input.endYear ?? Number.MAX_SAFE_INTEGER;
    candidates = candidates.filter(document => {
      const composition = document.catalog?.composition;
      return composition?.startYear !== undefined && composition.endYear !== undefined
        && composition.startYear <= requestedEnd && composition.endYear >= requestedStart;
    });
  }

  if (restricted && candidates.length === 0) {
    notices.push('No hosted catalog work matched every requested work, creator, and inclusive overlapping composition-date restriction; the text search was not broadened.');
  }
  if (incomplete) {
    notices.push('One or more hosted works lacked reviewed metadata needed to evaluate the requested scope and were not treated as matches.');
  }
  const eligibleDocuments = candidates.slice(0, MAX_SCOPE_DOCUMENTS).map(document => ({
    id: document.id,
    title: document.title,
    metadataStatus: document.catalog?.metadataStatus ?? ('unknown' as const),
  }));
  return {
    documents: candidates,
    restricted,
    notices,
    scope: {
      status: incomplete ? 'metadata_incomplete' : candidates.length === 0 ? 'catalog_miss' : 'matched',
      requested,
      eligibleDocumentCount: candidates.length,
      eligibleDocuments,
      eligibleDocumentsTruncated: candidates.length > eligibleDocuments.length,
    },
  };
}

export function boundedMatchContext(value: string, query: string, matchMode: 'all_terms' | 'phrase', maximum: number): string {
  const normalized = value.normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const characters = Array.from(normalized);
  if (characters.length <= maximum) return normalized;

  const normalizedQuery = query.normalize('NFC').replace(/\s+/gu, ' ').trim();
  const terms = matchMode === 'phrase' ? [normalizedQuery] : normalizedQuery.split(' ').filter(Boolean);
  let match: { start: number; length: number } | undefined;
  for (const term of terms) {
    const found = findCaseInsensitive(characters, Array.from(term));
    if (found && (!match || found.start < match.start)) match = found;
  }
  if (!match) return characters.slice(0, maximum - 1).join('') + '…';

  const interiorBudget = maximum - 2;
  const before = Math.max(0, Math.floor((interiorBudget - Math.min(match.length, interiorBudget)) / 2));
  let start = Math.max(0, match.start - before);
  let end = Math.min(characters.length, start + interiorBudget);
  if (end - start < interiorBudget) start = Math.max(0, end - interiorBudget);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < characters.length ? '…' : '';
  const available = maximum - Array.from(prefix + suffix).length;
  end = Math.min(characters.length, start + available);
  return `${prefix}${characters.slice(start, end).join('')}${end < characters.length ? '…' : ''}`;
}

function findCaseInsensitive(haystack: string[], needle: string[]): { start: number; length: number } | undefined {
  if (needle.length === 0) return undefined;
  const foldedNeedle = needle.map(character => character.toLocaleLowerCase('en-US'));
  for (let start = 0; start <= haystack.length - needle.length; start++) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset++) {
      if (haystack[start + offset].toLocaleLowerCase('en-US') !== foldedNeedle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return { start, length: needle.length };
  }
  return undefined;
}
