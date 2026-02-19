/**
 * Commentary adapter interface.
 *
 * All commentary providers implement this contract.
 */

import type { CommentaryResult } from '../../kernel/types.js';
import type { BibleReference } from '../../kernel/reference.js';

export interface CommentaryAdapter {
  /** Commentator names this adapter handles */
  readonly supportedCommentators: string[];

  /** Fetch commentary for a parsed reference */
  getCommentary(ref: BibleReference, commentator: string): Promise<CommentaryResult>;

  /** Whether a commentator supports a specific book */
  supportsBook(commentator: string, bookName: string): boolean;
}
