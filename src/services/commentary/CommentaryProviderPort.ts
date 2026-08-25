import type { BibleReference } from '../../kernel/reference.js';
import type { CommentaryProviderResult } from '../../kernel/types.js';

/** Application-owned contract for configured commentary providers. */
export interface CommentaryProviderPort {
  readonly supportedCommentators: readonly string[];
  getCommentary(ref: BibleReference, commentator: string): Promise<CommentaryProviderResult>;
}
