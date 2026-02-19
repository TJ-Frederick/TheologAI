/**
 * Cross-reference service using SQLite repository.
 */

import type { CrossReferenceRepository, CrossRefResult, CrossRefOptions } from '../../adapters/data/CrossReferenceRepository.js';
import { parseReference, formatReference } from '../../kernel/reference.js';

export class CrossReferenceService {
  constructor(private repo: CrossReferenceRepository) {}

  getCrossReferences(reference: string, options?: CrossRefOptions): CrossRefResult {
    return this.repo.getCrossReferences(reference, options);
  }

  hasReferences(reference: string): boolean {
    return this.repo.hasReferences(reference);
  }

  getChapterStatistics(bookChapter: string) {
    return this.repo.getChapterStatistics(bookChapter);
  }
}
