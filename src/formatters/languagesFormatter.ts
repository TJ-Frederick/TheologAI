/**
 * Pure formatting functions for biblical languages tool responses.
 */

import type { CorpusUsageResult, EnhancedStrongsResult, VerseMorphologyResult, VerseWord } from '../kernel/types.js';
import type { StrongsEntry } from '../kernel/repositories.js';
import { normalizeLexiconText } from '../kernel/lexiconText.js';
export { normalizeLexiconText } from '../kernel/lexiconText.js';

/** Format a Strong's lookup result */
export function formatStrongsResult(
  result: EnhancedStrongsResult,
  detailLevel: string = 'simple',
  corpusUsage?: CorpusUsageResult,
): string {
  const testament = result.language
    ?? (result.testament === 'NT' ? 'Greek' : result.testament === 'OT' ? 'Hebrew' : 'Source language');

  let s = `**${result.strongs_number}** (${testament})\n\n`;
  s += `**Lemma:** ${result.lemma}\n`;
  if (result.transliteration) s += `**Transliteration:** ${result.transliteration}\n`;
  if (result.pronunciation) s += `**Pronunciation:** ${result.pronunciation}\n`;
  if (result.definition) {
    s += `**Definition:** ${result.definition}\n`;
  } else if (result.evidencePolicy) {
    s += '**Definition:** Semantic evidence unavailable from the retained Hebrew lexicon fields.\n';
  }

  if (detailLevel === 'detailed' && result.derivation) s += `**Derivation:** ${result.derivation}\n`;

  if (result.extended) {
    s += '\n**Extended Data:**\n';
    if (result.extended.strongsExtended) {
      s += `Extended Strong's: ${result.extended.strongsExtended}\n`;
    }
    if (result.extended.gloss) s += `Gloss: ${result.extended.gloss}\n`;
    if (result.extended.morphologyCode) s += `Morphology: ${result.extended.morphologyCode}\n`;
    if (result.extended.source) s += `Lexicon: ${result.extended.source}\n`;
    if (result.extended.definition) {
      s += `Definition: ${normalizeLexiconText(result.extended.definition)}\n`;
    }
    if (result.extended.occurrences) {
      s += `Occurrences: ${result.extended.occurrences}\n`;
    }
    if (result.extended.senses) {
      s += '\n**Senses:**\n';
      for (const sense of Object.values(result.extended.senses)) {
        s += `- ${sense.gloss} (${sense.count}x): ${sense.usage}\n`;
      }
    }
  }

  if (result.evidencePolicy) {
    s += `\n**Evidence policy:** ${result.evidencePolicy.notice}\n`;
  }

  s += `\n*Source: ${result.citation.source}*`;
  if (result.citation.copyright) s += ` - ${result.citation.copyright}`;
  if (result.extended && result.extendedCitation) {
    s += `\n*Extended source: ${result.extendedCitation.source}*`;
    if (result.extendedCitation.copyright) s += ` - ${result.extendedCitation.copyright}`;
  }
  if (corpusUsage) s += `\n\n${formatCorpusUsage(corpusUsage)}`;
  return s.trim();
}

function formatCorpusUsage(usage: CorpusUsageResult): string {
  const lines = [
    `## Corrected morphology-corpus usage (${usage.level})`,
    '',
    `**Exact morphology identity:** ${usage.exactMorphologyKey}`,
    `**Morphology usage identity:** ${usage.corpusIdentity}`,
  ];
  if (!usage.attested) {
    lines.push('', '*This exact identity is not attested in the counted morphology corpus.*');
  } else {
    lines.push(
      `**Totals:** ${usage.totals.tokenCount} raw tokens; ${usage.totals.verseCount} verses; ${usage.totals.bookCount} books; ${usage.totals.sourceSurfaceVariantCount} exact source surface variants.`,
      '',
      '**Canonical book distribution:**',
      ...usage.bookDistribution.map(book => `- ${book.book} (${book.canonicalOrder}): ${book.tokenCount} tokens in ${book.verseCount} verses`),
      '',
      '**Exact source surface variants:**',
      ...usage.sourceSurfaceVariants.map(form => `- ${form.sourceForm}: ${form.tokenCount} tokens in ${form.verseCount} verses; first at ${form.firstOccurrence.book} ${form.firstOccurrence.chapter}:${form.firstOccurrence.verse}, position ${form.firstOccurrence.position}`),
    );
    if (usage.occurrences) {
      lines.push('', '**Raw token occurrences:**', '', '| Reference | Position | Source form | Lemma | Morphology | Gloss |', '|---|---:|---|---|---|---|');
      for (const occurrence of usage.occurrences) {
        lines.push(`| ${occurrence.book} ${occurrence.chapter}:${occurrence.verse} | ${occurrence.position} | ${markdownCell(occurrence.sourceForm)} | ${markdownCell(occurrence.lemma)} | ${markdownCell(occurrence.morphologyCode ?? '—')} | ${markdownCell(occurrence.gloss ?? '—')} |`);
      }
      if (usage.nextOccurrenceCursor) lines.push('', `**Next occurrence cursor:** \`${usage.nextOccurrenceCursor}\``);
    }
  }
  lines.push('', '**Cautions:**', ...usage.cautions.map(caution => `- ${caution}`), '', '*Usage source: corrected STEPBible morphology data — CC BY 4.0 (Tyndale House, Cambridge).*');
  return lines.join('\n');
}

function markdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

/** Normalize STEPBible markup before exposing it in either result view. */
/** Produce the bounded discovery summary used by Markdown and structured search. */
export function summarizeDefinition(value: string, maxLength = 240): string {
  const definition = normalizeLexiconText(value).replace(/\s+/g, ' ').trim();
  return definition.length > maxLength
    ? `${definition.slice(0, maxLength - 3)}…`
    : definition;
}

/** Format lightweight search hits before the caller chooses an exact entry. */
export function formatStrongsSearchResults(query: string, results: StrongsEntry[]): string {
  if (results.length === 0) {
    return `No Strong's entries found for **${query}**.`;
  }

  const lines = [
    `## Strong's search results for “${query}”`,
    '',
    ...results.map(entry => {
      const language = entry.testament === 'NT' ? 'Greek' : 'Hebrew';
      const transliteration = entry.transliteration ? ` — ${entry.transliteration}` : '';
      const summary = summarizeDefinition(entry.definition);
      return `- **${entry.strongs_number}** (${language}): ${entry.lemma}${transliteration} — ${summary}`;
    }),
    '',
    `*${results.length} result${results.length === 1 ? '' : 's'}. Use an exact Strong's number for full details.*`,
  ];
  return lines.join('\n');
}

/** Format verse morphology as a Markdown table */
export function formatMorphologyResult(result: VerseMorphologyResult): string {
  const language = result.testament === 'NT' ? 'Greek' : 'Hebrew';

  let s = `**${result.reference}** — Word-by-Word ${language} Analysis\n\n`;
  s += `| # | Text | Lemma | Strong's | Morphology | Gloss |\n`;
  s += `|---|------|-------|----------|------------|-------|\n`;

  for (const w of result.words) {
    const morph = w.morphExpanded || w.morph;
    s += `| ${w.position} | ${w.text} | ${w.lemma} | ${w.strong} | ${morph} | ${w.gloss} |\n`;
  }

  s += `\n*Source: ${result.citation.source}*`;
  if (result.citation.copyright) s += ` - ${result.citation.copyright}`;
  if (result.lemmaCitation) {
    s += `\n*Hebrew lemma source: ${result.lemmaCitation.source}*`;
    if (result.lemmaCitation.copyright) s += ` - ${result.lemmaCitation.copyright}`;
  }
  return s.trim();
}
