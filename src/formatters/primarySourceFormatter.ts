import type {
  PresentedPrimarySourceSearchV4,
  PresentedPrimarySourceSearchV5,
} from '../presenters/primarySourceSearchV4Structured.js';
import type { PresentedPrimarySourceSearchV8 } from '../presenters/primarySourceSearchV8Structured.js';

/** Reserve enough delivery budget for structured content and native links. */
export const PRIMARY_SOURCE_FALLBACK_MAX_BYTES = 4_096;

/**
 * A compact, human-readable fallback over the already-sanitized public model.
 * `structuredContent` remains authoritative; this never re-reads raw provider
 * data or manufactures a second, divergent representation.
 */
export function formatPrimarySourceSearchFallback(
  result: PresentedPrimarySourceSearchV4 | PresentedPrimarySourceSearchV5 | PresentedPrimarySourceSearchV8,
): string {
  const lines = [
    '# Primary-source discovery',
    '',
    `Plan status: **${result.planStatus}**. Structured content is authoritative.`,
  ];
  for (const query of result.queries) {
    lines.push('', `## ${safe(query.id)}`);
    if ('expansionDecision' in query) {
      lines.push(`- Expanded retry: **${query.expansionDecision.triggered ? 'eligible' : 'not executed'}** (${query.expansionDecision.reason}); local distinct works: ${query.expansionDecision.localDistinctWorkCount}.`);
    }
    for (const provider of query.providers) {
      const label = provider.provider === 'local' ? 'Curated catalog results' : 'Expanded discovery results';
      lines.push(`- ${label}: **${provider.status}**; ${provider.hitCount} returned.`);
      for (const hit of provider.hits) {
        const location = hit.provider === 'local' ? hit.locator.uri : hit.locator.url;
        lines.push(`  - ${safe(hit.title)}${hit.sectionLabel ? ` — ${safe(hit.sectionLabel)}` : ''}: ${safe(hit.snippet)} (${location})`);
      }
    }
  }
  lines.push(
    '',
    'Snippets are discovery-only. Read a selected exact local MCP resource before quotation or comparison.',
    'Coverage ledger: this response records only searched and not-searched providers; record successful reads and intentional deferrals in the host’s final research ledger.',
  );
  return boundedUtf8(lines.join('\n').trim(), PRIMARY_SOURCE_FALLBACK_MAX_BYTES);
}

/** Neutralize untrusted corpus/upstream text so it cannot forge Markdown structure. */
function safe(value: string): string {
  return value.normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[\\`*_{}\[\]()<>#+.!|>-]/g, character => `\\${character}`);
}

function boundedUtf8(value: string, maximum: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).byteLength <= maximum) return value;
  let result = '';
  for (const character of value) {
    if (encoder.encode(`${result}${character}…`).byteLength > maximum) break;
    result += character;
  }
  return `${result}…`;
}
