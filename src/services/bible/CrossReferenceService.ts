/**
 * Cross-reference service using SQLite repository.
 *
 * Methods are async so they work with both sync (better-sqlite3) and
 * async (D1) repositories — `await syncValue` resolves immediately.
 */

import type { ICrossReferenceRepository, CrossRefResult, CrossRefOptions } from '../../kernel/repositories.js';
import { AdapterIntegrityError, ValidationError } from '../../kernel/errors.js';
import { formatReference, parseReference } from '../../kernel/reference.js';

const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MIN_VOTES = 0;
const CROSS_REFERENCE_SOURCE = 'OpenBible.info cross-reference repository';

export type CrossReferenceLookupResult = CrossRefResult & {
  /** Canonical single verse actually sent to the repository. */
  resolvedReference: string;
};

export class CrossReferenceService {
  constructor(private repo: ICrossReferenceRepository) {}

  async getCrossReferences(reference: string, options?: CrossRefOptions): Promise<CrossReferenceLookupResult> {
    const resolvedReference = this.singleVerse(reference);
    const result = await this.repo.getCrossReferences(resolvedReference, options);
    this.assertRepositoryResult(result, options);

    // Select the repository contract explicitly and append the service-owned
    // identity last. A structurally wider runtime value must never be able to
    // replace the canonical verse that this service actually queried.
    return {
      references: result.references,
      total: result.total,
      showing: result.showing,
      hasMore: result.hasMore,
      resolvedReference,
    };
  }

  async hasReferences(reference: string): Promise<boolean> {
    return await this.repo.hasReferences(this.singleVerse(reference));
  }

  async getChapterStatistics(bookChapter: string) {
    return await this.repo.getChapterStatistics(bookChapter);
  }

  /** Cross-reference rows are keyed by one canonical verse, never a chapter or range. */
  private singleVerse(reference: string): string {
    let parsed: ReturnType<typeof parseReference>;
    try {
      parsed = parseReference(reference);
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(
        'reference',
        error instanceof Error ? error.message : 'Invalid Bible reference.',
      );
    }

    if (parsed.startVerse == null || parsed.endVerse != null) {
      throw new ValidationError(
        'reference',
        'Cross-reference lookup requires exactly one Bible verse; chapters and verse ranges are not supported.',
      );
    }
    return formatReference(parsed);
  }

  /** Fail closed when a local SQLite/D1 result cannot support its public claims. */
  private assertRepositoryResult(result: CrossRefResult, options?: CrossRefOptions): void {
    const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
    const minVotes = options?.minVotes ?? DEFAULT_MIN_VOTES;
    const candidate = result as unknown;

    if (!candidate || typeof candidate !== 'object' || !Array.isArray(result.references)) {
      this.integrityFailure('Cross-reference lookup returned an invalid result object.');
    }

    if (!Number.isSafeInteger(result.total) || result.total < 0
      || !Number.isSafeInteger(result.showing) || result.showing < 0
      || typeof result.hasMore !== 'boolean') {
      this.integrityFailure('Cross-reference lookup returned invalid result-window metadata.');
    }

    if (result.references.length > maxResults
      || result.showing !== result.references.length
      || result.total < result.showing
      || result.showing !== Math.min(result.total, maxResults)
      || result.hasMore !== (result.total > result.showing)) {
      this.integrityFailure('Cross-reference lookup returned inconsistent result-window metadata.');
    }

    let previousVotes: number | undefined;
    let previousSourceKey: string | undefined;

    for (const row of result.references) {
      if (!row || typeof row !== 'object' || typeof row.reference !== 'string') {
        this.integrityFailure('Cross-reference lookup returned an invalid reference row.');
      }
      if (!Number.isSafeInteger(row.votes) || row.votes < 0 || row.votes < minVotes) {
        this.integrityFailure('Cross-reference lookup returned invalid vote metadata.');
      }

      const sourceKey = this.canonicalSourceKey(row.reference);
      if (previousVotes !== undefined) {
        if (row.votes > previousVotes
          || (row.votes === previousVotes && previousSourceKey !== undefined && sourceKey <= previousSourceKey)) {
          this.integrityFailure('Cross-reference lookup did not preserve deterministic source ranking.');
        }
      }
      previousVotes = row.votes;
      previousSourceKey = sourceKey;
    }
  }

  /** Validate a canonical scalar display reference and recover its exact TSV key. */
  private canonicalSourceKey(reference: string): string {
    let parsed: ReturnType<typeof parseReference>;
    try {
      parsed = parseReference(reference);
    } catch {
      this.integrityFailure('Cross-reference lookup returned an invalid canonical reference.');
    }

    if (parsed.startVerse == null || parsed.endVerse != null || formatReference(parsed) !== reference) {
      this.integrityFailure('Cross-reference lookup returned a non-canonical reference.');
    }

    return `${parsed.book.abbreviation}.${parsed.chapter}.${parsed.startVerse}`;
  }

  private integrityFailure(message: string): never {
    throw new AdapterIntegrityError(CROSS_REFERENCE_SOURCE, message);
  }
}
