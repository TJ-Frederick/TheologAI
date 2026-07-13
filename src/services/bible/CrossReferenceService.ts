/**
 * Cross-reference service using SQLite repository.
 *
 * Methods are async so they work with both sync (better-sqlite3) and
 * async (D1) repositories — `await syncValue` resolves immediately.
 */

import type { ICrossReferenceRepository, CrossRefResult, CrossRefOptions } from '../../kernel/repositories.js';
import { ValidationError } from '../../kernel/errors.js';
import { formatReference, parseReference } from '../../kernel/reference.js';

export class CrossReferenceService {
  constructor(private repo: ICrossReferenceRepository) {}

  async getCrossReferences(reference: string, options?: CrossRefOptions): Promise<CrossRefResult> {
    return await this.repo.getCrossReferences(this.singleVerse(reference), options);
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
}
