/**
 * Pure formatting functions for Bible-related tool responses.
 */

import type {
  BibleLookupMultipleResult,
  BibleResult,
  CrossReferenceResult,
  ParallelPassageResult,
  ParallelPassage,
} from '../kernel/types.js';

/** Format a single Bible result as Markdown */
export function formatBibleResponse(data: BibleResult): string {
  let s = `**${data.reference} (${data.translation})**\n\n${data.text}\n`;

  if (data.footnotes && data.footnotes.length > 0) {
    s += '\n**Footnotes:**\n';
    for (const fn of data.footnotes) {
      s += `${fn.caller} (v${fn.reference.verse}): ${fn.text}\n`;
    }
  }

  s += `\n*Source: ${data.citation.source}*`;
  if (data.citation.copyright) s += ` - ${data.citation.copyright}`;
  return s.trim();
}

/** Format multiple translations for comparison, including explicit failures. */
export function formatMultiBibleResponse(data: BibleLookupMultipleResult | BibleResult[]): string {
  const response: BibleLookupMultipleResult = Array.isArray(data)
    ? { reference: data[0]?.reference ?? '', results: data, failures: [] }
    : data;
  const { reference, results, failures } = response;
  if (results.length === 0 && failures.length === 0) return 'No results found.';

  const requestedCount = results.length + failures.length;
  const header = failures.length > 0
    ? `**${reference}** (${requestedCount} translations requested; ${results.length} available)`
    : `**${reference || results[0].reference}** (${results.length} translations)`;
  let s = `${header}\n\n`;
  for (const r of results) {
    s += `**${r.translation}:**\n${r.text}\n\n`;
    if (r.footnotes?.length) {
      s += '*Footnotes:*\n';
      for (const fn of r.footnotes) {
        s += `  ${fn.caller} (v${fn.reference.verse}): ${fn.text}\n`;
      }
      s += '\n';
    }
  }

  if (failures.length > 0) {
    s += '**Translation status:**\n';
    for (const failure of failures) {
      s += `- **${failure.translation}:** unavailable — ${failure.reason}\n`;
    }
    s += '\n';
  }

  if (results.length > 0) {
    const sources = [...new Set(results.map(r => r.citation.source))];
    s += `*Sources: ${sources.join(', ')}*`;
  }
  return s.trim();
}

/** Format cross-reference results */
export function formatCrossReferences(reference: string, result: CrossReferenceResult): string {
  let s = `**Cross-References for ${reference}**\n\n`;
  if (result.references.length === 0) {
    s += 'No cross-references found for this verse.\n';
    s += '\n*Source: OpenBible.info cross references — CC BY*\n';
    return s.trim();
  }

  for (const ref of result.references) {
    s += `- **${ref.reference}** (${ref.votes} votes)\n`;
  }

  if (result.hasMore) {
    s += `\n*Showing ${result.showing} of ${result.total} cross-references*\n`;
  }
  s += '\n*Source: OpenBible.info cross references — CC BY*\n';
  return s.trim();
}

/** Format parallel passage results */
export function formatParallelPassages(result: ParallelPassageResult): string {
  let s = `**Parallel Passages for ${result.primary.reference}**\n\n`;

  if (result.parallels.length === 0) {
    s += 'No parallel passages found.\n';
    if (result.warnings?.length) {
      s += `\n${result.warnings.map(warning => `*Warning: ${warning}*`).join('\n')}\n`;
    }
    return s.trim();
  }

  for (const p of result.parallels) {
    const conf = Math.round(p.confidence * 100);
    s += `- **${p.reference}** [${p.relationship}] (${conf}% confidence)\n`;
    if (p.text) {
      const excerpt = `${p.text.substring(0, 200)}${p.text.length > 200 ? '…' : ''}`;
      s += `  > Text excerpt${p.translation ? ` (${p.translation})` : ''}: ${excerpt}\n`;
    }
    if (p.notes) s += `  *${p.notes}*\n`;
  }

  if (result.warnings?.length) {
    s += `\n${result.warnings.map(warning => `*Warning: ${warning}*`).join('\n')}\n`;
  }

  s += `\n*${result.citation.source}*`;
  if (result.citation.copyright) s += ` - ${result.citation.copyright}`;
  return s.trim();
}
