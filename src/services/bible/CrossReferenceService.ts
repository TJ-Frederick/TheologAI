/**
 * Cross-reference service using SQLite repository.
 *
 * Methods are async so they work with both sync (better-sqlite3) and
 * async (D1) repositories — `await syncValue` resolves immediately.
 */

import type { ICrossReferenceRepository, CrossRefResult, CrossRefOptions } from '../../kernel/repositories.js';

export class CrossReferenceService {
  constructor(private repo: ICrossReferenceRepository) {}

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
