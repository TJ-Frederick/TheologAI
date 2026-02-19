/**
 * Pure formatting functions for commentary tool responses.
 */

import type { CommentaryResult } from '../kernel/types.js';

/** Format commentary result as Markdown */
export function formatCommentaryResponse(data: CommentaryResult): string {
  let s = `**${data.commentator} Commentary on ${data.reference}**\n\n`;
  s += `${data.text}\n\n`;
  s += `*Source: ${data.citation.source}*`;
  if (data.citation.copyright) s += ` - ${data.citation.copyright}`;
  return s.trim();
}
