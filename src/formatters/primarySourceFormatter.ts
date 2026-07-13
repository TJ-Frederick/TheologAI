import type { PresentedPrimarySourceSearch } from '../presenters/primarySourceSearchStructured.js';

export function formatPrimarySourceSearch(result: PresentedPrimarySourceSearch): string {
  const lines = [
    '# Primary-source discovery',
    '',
    `Plan status: **${result.planStatus}**`,
    '',
  ];
  for (const query of result.queries) {
    lines.push(`## Query \`${safe(query.id)}\``, '', `Match mode: ${query.normalizedMode}`, '');
    for (const provider of query.providers) {
      const name = provider.provider === 'local' ? 'Local historical index' : 'CCEL live search';
      lines.push(`### ${name}`, '', `Status: **${provider.status}** · Returned hits: ${provider.hitCount}`, '');
      if (provider.hits.length === 0) lines.push('_No discovery snippets returned._', '');
      for (const hit of provider.hits) {
        lines.push(`#### ${safe(hit.title)}`);
        if (hit.author) lines.push(`Author: ${safe(hit.author)}`);
        if (hit.sectionLabel) lines.push(`Section: ${safe(hit.sectionLabel)}`);
        lines.push('', `> ${safe(hit.snippet) || '_Empty snippet_'}`, '');
        lines.push(`- Locator: ${formatLocator(hit.locator)}`);
        lines.push(`- Attribution: ${safe(hit.attribution)}`);
        lines.push('- **Snippet only—fetch the selected exact section before quoting or drawing substantive conclusions.**', '');
      }
      for (const notice of provider.notices) lines.push(`- Notice: ${safe(notice)}`);
      if (provider.notices.length) lines.push('');
    }
  }
  lines.push('## Coverage', '');
  lines.push(`- Local: ${result.coverage.localStatus ?? 'not requested'}; ${result.coverage.localHitCount} returned hits`);
  lines.push(`- CCEL: ${result.coverage.ccelStatus ?? 'not requested'}; ${result.coverage.ccelHitCount} returned hits`);
  for (const notice of result.coverage.notices) lines.push(`- ${safe(notice)}`);
  lines.push(
    '',
    '_Evidence policy: snippets are discovery aids only. Read a selected exact MCP section resource before quotation or substantive conclusions._',
    '_Results are bounded discovery evidence, not an exhaustive catalog; missing hits do not establish historical silence._',
    '_Edition provenance is incomplete. Catalog type/date describe the work; this server does not claim a reviewed author, edition, transcription provenance, or rights status where none is supplied._',
  );
  return lines.join('\n').trim();
}

/** Neutralize untrusted corpus/upstream text so it cannot forge Markdown structure. */
function safe(value: string): string {
  return value.normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[\\`*_{}\[\]()<>#+.!|>-]/g, character => `\\${character}`);
}

function formatLocator(locator: PresentedPrimarySourceSearch['queries'][number]['providers'][number]['hits'][number]['locator']): string {
  return `[exact section](${locator.url})`;
}
