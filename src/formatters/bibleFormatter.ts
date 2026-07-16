/**
 * Pure formatting functions for Bible-related tool responses.
 */

import type {
  BibleLookupMultipleResult,
  BibleResult,
  CrossReferenceResult,
  ParallelPassageResult,
  ParallelPassage,
  ParallelPassageResearchResult,
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

/** Format the group-preserving UBS hard-cutover result. */
export function formatParallelPassageResearch(result: ParallelPassageResearchResult): string {
  let s = `**Parallel Passages for ${result.requestedReference}**\n`;

  if (result.sourceAttestedGroups.length > 0) {
    s += '\n### UBS source-attested groups\n';
    s += '\n_These groups attest membership and source order only. They do not assert direction, relationship type, quotation status, or confidence._\n';
    for (const group of result.sourceAttestedGroups) {
      s += `\n**Group ${group.sourceOrdinal}**\n`;
      for (const member of group.members) {
        const label = member.matched
          ? `_Matched passage: ${member.normalizedReference}_`
          : `**${member.normalizedReference}**`;
        s += `- ${label} (${member.languageMarker}; source order ${member.sourceOrder})\n`;
        if (member.sourceReference !== member.normalizedReference) {
          s += `  - UBS source locator: \`${member.sourceReference}\` (normalized lookup: ${member.normalizedReference})\n`;
        }
        if (member.alignmentBasis && member.alignmentRaw) {
          s += `  - Alignment: ${member.alignmentBasis}; raw UBS codes \`${member.alignmentRaw}\`\n`;
        }
        if (member.excerpts?.length) {
          for (const excerpt of member.excerpts) {
            s += `  > Segment ${excerpt.segmentOrder} — ${excerpt.reference}: ${excerpt.text}${textAttribution(excerpt.translation, excerpt.provenanceIds, result)}\n`;
          }
        } else if (member.text) {
          s += `  > ${member.text}${textAttribution(member.translation, member.provenanceIds ?? [], result)}\n`;
        }
      }
    }
  } else if (result.corpora.includes('ubs_source_attested')) {
    s += '\nNo UBS source-attested parallel groups found.\n';
  }

  if (result.sourceAttestedResultWindow.additionalMatchStatus === 'additional_match_observed') {
    s += result.sourceAttestedResultWindow.requestedLimit < 10
      ? '\n_At least one additional UBS source-attested group was observed beyond this bounded result window. Raise `maxGroups` (up to 10) or narrow the reference to inspect more focused results._\n'
      : '\n_At least one additional UBS source-attested group was observed beyond this bounded result window. Narrow the reference to inspect more focused results._\n';
  } else if (result.sourceAttestedResultWindow.additionalMatchStatus === 'no_additional_match_observed') {
    s += '\n_No additional UBS source-attested group was observed by the bounded lookahead for this request._\n';
  } else {
    s += '\n_The UBS source-attested result window was not evaluated because that corpus was not selected._\n';
  }

  if (result.legacyParallels.length > 0) {
    s += '\n### TheologAI legacy curated edges\n';
    for (const parallel of result.legacyParallels) {
      const confidence = Math.round(parallel.confidence * 100);
      s += `- **${parallel.reference}** [${parallel.relationship}] (${confidence}% confidence)\n`;
      if (parallel.text) s += `  > Text excerpt${textAttribution(parallel.translation, parallel.provenanceIds ?? [], result)}: ${parallel.text}\n`;
      if (parallel.notes) s += `  *${parallel.notes}*\n`;
    }
  } else if (result.corpora.includes('theologai_legacy')) {
    s += '\nNo TheologAI legacy curated parallels found.\n';
  }

  if (result.openBibleCrossReferences.length > 0) {
    s += '\n### OpenBible.info cross references\n';
    for (const reference of result.openBibleCrossReferences) {
      s += `- **${reference.reference}** (${reference.votes} votes)\n`;
    }
  }
  if (result.warnings?.length) {
    s += `\n${result.warnings.map(warning => `*Warning: ${warning}*`).join('\n')}\n`;
  }
  if (result.provenance.length > 0) {
    s += `\n*Sources: ${result.provenance.map(record => `${record.label}${record.license ? ` (${record.license.label})` : ''}`).join('; ')}*`;
  }
  return s.trim();
}

function textAttribution(
  translation: string | undefined,
  provenanceIds: string[],
  result: ParallelPassageResearchResult,
): string {
  const translationSource = provenanceIds
    .map(id => result.provenance.find(record => record.id === id))
    .find(record => record?.kind === 'translation');
  const details = [translation, translationSource?.label, translationSource?.rightsNotice].filter(Boolean);
  return details.length > 0 ? ` (${details.join('; ')})` : '';
}
