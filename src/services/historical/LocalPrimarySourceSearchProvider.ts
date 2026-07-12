import type { IHistoricalDocumentRepository } from '../../kernel/repositories.js';
import {
  LOCAL_PRIMARY_SOURCE_ATTRIBUTION,
  type PrimarySourceProviderResult,
  type PrimarySourceSearchQuery,
} from './primarySourceTypes.js';

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
      snippet: boundedPlainText(row.section.content, 500),
      locator: {
        kind: 'local_section' as const,
        documentId: row.document.id,
        sectionId: row.section.section_number,
        url: `theologai://documents/${encodeURIComponent(row.document.id)}#section-${encodeURIComponent(row.section.section_number)}`,
      },
      rankWithinProvider: index + 1,
      page,
      snippetOnly: true as const,
      attribution: LOCAL_PRIMARY_SOURCE_ATTRIBUTION,
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

function boundedPlainText(value: string, maximum: number): string {
  const normalized = value.normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(normalized).slice(0, maximum).join('');
}
