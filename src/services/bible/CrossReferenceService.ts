/**
 * Cross-reference service using SQLite repository.
 *
 * Methods are async so they work with both sync (better-sqlite3) and
 * async (D1) repositories — `await syncValue` resolves immediately.
 */

import type { CrossReferenceRepository, CrossRefResult, CrossRefOptions } from '../../adapters/data/CrossReferenceRepository.js';
import { parseReference, formatReference } from '../../kernel/reference.js';

export class CrossReferenceService {
  constructor(private repo: CrossReferenceRepository) {}

  async getCrossReferences(reference: string, options?: CrossRefOptions): Promise<CrossRefResult> {
    return await this.repo.getCrossReferences(reference, options);
  }

  async hasReferences(reference: string): Promise<boolean> {
    return await this.repo.hasReferences(reference);
  }

  async getChapterStatistics(bookChapter: string) {
    return await this.repo.getChapterStatistics(bookChapter);
  }
}
