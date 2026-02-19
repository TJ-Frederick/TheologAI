/**
 * Commentary service with adapter routing.
 *
 * Routes commentary requests to HelloAO or CCEL adapters.
 */

import type { CommentaryAdapter } from '../../adapters/commentary/CommentaryAdapter.js';
import type { CommentaryResult, CommentaryLookupParams } from '../../kernel/types.js';
import { parseReference, formatReference } from '../../kernel/reference.js';
import { NotFoundError } from '../../kernel/errors.js';

export class CommentaryService {
  constructor(private adapters: CommentaryAdapter[]) {}

  async lookup(params: CommentaryLookupParams): Promise<CommentaryResult> {
    const commentator = params.commentator || 'Matthew Henry';
    const ref = parseReference(params.reference);

    for (const adapter of this.adapters) {
      const supported = adapter.supportedCommentators.some(
        c => c.toLowerCase() === commentator.toLowerCase()
      );
      if (supported) {
        const result = await adapter.getCommentary(ref, commentator);

        // Apply maxLength if specified
        if (params.maxLength && result.text.length > params.maxLength) {
          result.text = result.text.substring(0, params.maxLength) + '...';
        }

        return result;
      }
    }

    throw new NotFoundError(
      'commentator',
      `Unknown commentator: "${commentator}". Available: ${this.getAvailableCommentators().join(', ')}`
    );
  }

  getAvailableCommentators(): string[] {
    const all: string[] = [];
    for (const adapter of this.adapters) {
      all.push(...adapter.supportedCommentators);
    }
    return all;
  }
}
