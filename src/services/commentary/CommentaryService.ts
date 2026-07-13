/**
 * Commentary service with adapter routing.
 *
 * Routes commentary requests to HelloAO or CCEL adapters.
 */

import type { CommentaryAdapter } from '../../adapters/commentary/CommentaryAdapter.js';
import type { CommentaryResult, CommentaryLookupParams } from '../../kernel/types.js';
import { parseReference, referencesEqual } from '../../kernel/reference.js';
import { APIError, NotFoundError, ValidationError } from '../../kernel/errors.js';

export class CommentaryService {
  constructor(private adapters: CommentaryAdapter[]) {}

  async lookup(params: CommentaryLookupParams): Promise<CommentaryResult> {
    const commentator = params.commentator || 'Matthew Henry';
    const ref = parseReference(params.reference);
    if (ref.endVerse != null) {
      throw new ValidationError(
        'reference',
        'Commentary verse ranges are not supported; request one verse or a full chapter.',
      );
    }

    for (const adapter of this.adapters) {
      const supported = adapter.supportedCommentators.some(
        c => c.toLowerCase() === commentator.toLowerCase()
      );
      if (supported) {
        const result = await adapter.getCommentary(ref, commentator);
        this.assertResultConsistency(ref, result);

        // Apply maxLength if specified
        if (params.maxLength && result.text.length > params.maxLength) {
          return {
            ...result,
            text: truncateWithEllipsis(result.text, params.maxLength),
          };
        }

        return result;
      }
    }

    throw new NotFoundError(
      'commentator',
      `Unknown commentator: "${commentator}". Available: ${this.getAvailableCommentators().join(', ')}`
    );
  }

  /** Prevent a provider from returning adjacent or otherwise mislabeled commentary. */
  private assertResultConsistency(ref: ReturnType<typeof parseReference>, result: CommentaryResult): void {
    if (!result || typeof result.reference !== 'string' || typeof result.commentator !== 'string' || typeof result.text !== 'string') {
      throw new APIError(502, 'Commentary provider returned an invalid result.');
    }

    let returnedRef: ReturnType<typeof parseReference>;
    try {
      returnedRef = parseReference(result.reference);
    } catch {
      throw new APIError(502, 'Commentary provider returned an invalid reference.');
    }

    if (!referencesEqual(ref, returnedRef)) {
      throw new APIError(502, 'Commentary provider returned commentary for a different reference.');
    }
    if (!result.text.trim()) {
      throw new APIError(502, 'Commentary provider returned empty commentary.');
    }
  }

  getAvailableCommentators(): string[] {
    const all: string[] = [];
    for (const adapter of this.adapters) {
      all.push(...adapter.supportedCommentators);
    }
    return all;
  }
}

/** Keep the ellipsis inside the requested Unicode-character budget. */
function truncateWithEllipsis(value: string, maxLength: number): string {
  const characters = Array.from(value);
  if (characters.length <= maxLength) return value;
  if (maxLength === 1) return '…';
  return `${characters.slice(0, maxLength - 1).join('')}…`;
}
