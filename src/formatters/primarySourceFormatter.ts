import type { PresentedPrimarySourceSearch } from '../presenters/primarySourceSearchStructured.js';
import type {
  PresentedPrimarySourceSearchV4,
  PresentedPrimarySourceSearchV5,
} from '../presenters/primarySourceSearchV4Structured.js';

/** Reserve enough delivery budget for structured content and native links. */
export const PRIMARY_SOURCE_FALLBACK_MAX_BYTES = 4_096;

export function formatPrimarySourceSearch(result: PresentedPrimarySourceSearch): string {
  const lines = [
    '# Primary-source discovery',
    '',
    `Plan status: **${result.planStatus}**`,
    '',
  ];
  for (const query of result.queries) {
    lines.push(
      `## Query \`${safe(query.id)}\``, '',
      `Match mode: ${query.normalizedMode} · Selection: ${query.normalizedSelection}`, '',
    );
    for (const provider of query.providers) {
      lines.push('### Local historical index', '', `Status: **${provider.status}** · Returned hits: ${provider.hitCount}`, '');
      lines.push(`Result window: ${provider.resultWindow.additionalMatchStatus}`, '');
      if (provider.scope) {
        const requested = [
          provider.scope.requested.work ? `work=${safe(provider.scope.requested.work)}` : '',
          provider.scope.requested.author ? `creator=${safe(provider.scope.requested.author)}` : '',
          provider.scope.requested.startYear !== undefined ? `startYear=${provider.scope.requested.startYear}` : '',
          provider.scope.requested.endYear !== undefined ? `endYear=${provider.scope.requested.endYear}` : '',
        ].filter(Boolean).join(', ') || 'unfiltered hosted catalog';
        lines.push(`Catalog scope: **${provider.scope.status}** · Eligible works: ${provider.scope.eligibleDocumentCount}`, `Requested: ${requested}`);
        for (const document of provider.scope.eligibleDocuments) {
          lines.push(`- ${safe(document.title)} (\`${safe(document.id)}\`; metadata: ${document.metadataStatus})`);
        }
        if (provider.scope.eligibleDocumentsTruncated) lines.push('- Eligible-work list truncated; the count above is authoritative.');
        lines.push('');
      }
      if (provider.hits.length === 0) lines.push('_No discovery snippets returned._', '');
      for (const hit of provider.hits) {
        lines.push(`#### ${safe(hit.title)}`);
        if (hit.author) lines.push(`Author: ${safe(hit.author)}`);
        if (hit.creators?.length) {
          lines.push(`Creators: ${hit.creators.map(creator => `${safe(creator.name)} (${safe(creator.role)})`).join('; ')}`);
        }
        if (hit.metadataStatus) lines.push(`Catalog metadata status: ${hit.metadataStatus}`);
        if (hit.metadataProvenanceIds?.length) {
          lines.push(`Metadata provenance: ${hit.metadataProvenanceIds.map(id => `\`${safe(id)}\``).join(', ')}`);
        }
        if (hit.sectionLabel) lines.push(`Section: ${safe(hit.sectionLabel)}`);
        lines.push('', `> ${safe(hit.snippet) || '_Empty snippet_'}`, '');
        lines.push(`- Locator: ${formatLocator(hit.locator)}`);
        lines.push(`- Attribution: ${safe(hit.attribution)}`);
        lines.push('- **Snippet only—read the selected exact MCP resource before quoting, comparing authors or works, or drawing substantive conclusions.**', '');
      }
      for (const notice of provider.notices) lines.push(`- Notice: ${safe(notice)}`);
      if (provider.notices.length) lines.push('');
    }
  }
  lines.push('## Coverage', '');
  lines.push(`- Local: ${result.coverage.localStatus ?? 'not requested'}; ${result.coverage.localHitCount} returned hits`);
  for (const notice of result.coverage.notices) lines.push(`- ${safe(notice)}`);
  lines.push(
    '',
    '_Evidence policy: snippets are discovery aids only. Read a selected exact MCP section resource before quotation or substantive conclusions._',
    '_Results are bounded discovery evidence, not an exhaustive catalog; missing hits do not establish historical silence._',
    '_Edition provenance is incomplete. Creator names and roles appear only when the reviewed catalog supplies them; roles are not relabeled as authorship, and no edition, transcription provenance, or rights status is inferred._',
  );
  return lines.join('\n').trim();
}

/**
 * A compact, human-readable fallback over the already-sanitized public model.
 * `structuredContent` remains authoritative; this never re-reads raw provider
 * data or manufactures a second, divergent representation.
 */
export function formatPrimarySourceSearchFallback(
  result: PresentedPrimarySourceSearchV4 | PresentedPrimarySourceSearchV5,
): string {
  const lines = [
    '# Primary-source discovery',
    '',
    `Plan status: **${result.planStatus}**. Structured content is authoritative.`,
  ];
  for (const query of result.queries) {
    lines.push('', `## ${safe(query.id)}`);
    for (const provider of query.providers) {
      const label = provider.provider === 'local' ? 'Local hosted collection' : 'CCEL discovery lead';
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

function formatLocator(locator: PresentedPrimarySourceSearch['queries'][number]['providers'][number]['hits'][number]['locator']): string {
  return `[exact section](${locator.url})`;
}
