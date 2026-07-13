import type { IHistoricalDocumentRepository } from '../../kernel/repositories.js';
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
    if (input.author !== undefined) {
      return result('unsupported_filter', page, false, [], ['The local historical index does not contain reviewed author metadata; the author restriction was not ignored.']);
    }
    if (page !== 1) {
      return result('unsupported_filter', page, false, [], ['The local historical index does not support pagination; page was not silently ignored.']);
    }

    let documentId: string | undefined;
    if (input.work !== undefined) {
      const requested = normalizeForExactComparison(input.work);
      const matching = (await this.repository.listDocuments()).filter(document =>
        normalizeForExactComparison(document.id) === requested
        || normalizeForExactComparison(document.title) === requested
      );
      if (matching.length === 0) return result('no_results', page, true);
      if (matching.length > 1) {
        return result('unsupported_filter', page, false, [], ['The local work restriction is ambiguous and was not broadened.']);
      }
      documentId = matching[0].id;
    }

    const rows = await this.repository.searchPrimarySources({
      text: input.text,
      match: input.match ?? 'all_terms',
      ...(documentId ? { documentId } : {}),
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
      resourceSizeBytes: new TextEncoder().encode(
        formatLocalDocumentSectionResource(row.document, row.section),
      ).byteLength,
    }));
    return result(hits.length > 0 ? 'ok' : 'no_results', page, true, hits);
  }
}

function result(
  status: PrimarySourceProviderResult['status'],
  page: number,
  searched: boolean,
  hits: PrimarySourceProviderResult['hits'] = [],
  notices: string[] = [],
): PrimarySourceProviderResult {
  return { provider: 'local', status, searched, page, hitCount: hits.length, hits, notices };
}

function normalizeForExactComparison(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
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
