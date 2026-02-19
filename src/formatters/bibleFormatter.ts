/**
 * Pure formatting functions for Bible-related tool responses.
 */

import type { BibleResult, CrossReferenceResult, ParallelPassageResult, ParallelPassage } from '../kernel/types.js';

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

/** Format multiple translations for comparison */
export function formatMultiBibleResponse(results: BibleResult[]): string {
  if (results.length === 0) return 'No results found.';

  let s = `**${results[0].reference}** (${results.length} translations)\n\n`;
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

  const sources = [...new Set(results.map(r => r.citation.source))];
  s += `*Sources: ${sources.join(', ')}*`;
  return s.trim();
}

/** Format cross-reference results */
export function formatCrossReferences(reference: string, result: CrossReferenceResult): string {
  let s = `**Cross-References for ${reference}**\n\n`;
  if (result.references.length === 0) {
    s += 'No cross-references found for this verse.\n';
    return s.trim();
  }

  for (const ref of result.references) {
    s += `- **${ref.reference}** (${ref.votes} votes)\n`;
  }

  if (result.hasMore) {
    s += `\n*Showing ${result.showing} of ${result.total} cross-references*\n`;
  }
  return s.trim();
}

/** Format parallel passage results */
export function formatParallelPassages(result: ParallelPassageResult): string {
  let s = `**Parallel Passages for ${result.primary.reference}**\n\n`;

  if (result.parallels.length === 0) {
    s += 'No parallel passages found.\n';
    return s.trim();
  }

  for (const p of result.parallels) {
    const conf = Math.round(p.confidence * 100);
    s += `- **${p.reference}** [${p.relationship}] (${conf}% confidence)\n`;
    if (p.text) s += `  > ${p.text.substring(0, 200)}${p.text.length > 200 ? '...' : ''}\n`;
    if (p.notes) s += `  *${p.notes}*\n`;
  }

  s += `\n*${result.citation.source}*`;
  return s.trim();
}
