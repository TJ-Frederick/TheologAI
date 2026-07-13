/**
 * Pure formatting functions for commentary tool responses.
 */

import type { CommentaryResult } from '../kernel/types.js';

/** Format commentary result as Markdown within an optional total response budget. */
export function formatCommentaryResponse(data: CommentaryResult, maxLength?: number): string {
  let s = `**${data.commentator} Commentary on ${data.reference}**\n\n`;
  s += `${data.text}\n\n`;
  s += `*Source: ${data.citation.source}*`;
  if (data.citation.copyright) s += ` - ${data.citation.copyright}`;
  const formatted = s.trim();
  if (maxLength == null || Array.from(formatted).length <= maxLength) return formatted;
  if (maxLength === 1) return '…';
  return `${Array.from(formatted).slice(0, maxLength - 1).join('')}…`;
}
