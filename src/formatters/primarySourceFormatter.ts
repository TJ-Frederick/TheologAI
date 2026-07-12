import type { PrimarySourceSearchPlanResult } from '../services/historical/primarySourceTypes.js';

export function formatPrimarySourceSearch(result: PrimarySourceSearchPlanResult): string {
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
        lines.push(`- Locator: [exact section](${safeUrl(hit.locator.url)})`);
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
  lines.push('', '_Results are bounded discovery evidence, not an exhaustive catalog. Missing hits do not establish historical silence._');
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

function safeUrl(value: string): string {
  return value.replaceAll('(', '%28').replaceAll(')', '%29').replaceAll(' ', '%20');
}
