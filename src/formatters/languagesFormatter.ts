/**
 * Pure formatting functions for biblical languages tool responses.
 */

import type { EnhancedStrongsResult, VerseMorphologyResult, VerseWord } from '../kernel/types.js';
import type { StrongsEntry } from '../kernel/repositories.js';
import { normalizeLexiconText } from '../kernel/lexiconText.js';
export { normalizeLexiconText } from '../kernel/lexiconText.js';

/** Format a Strong's lookup result */
export function formatStrongsResult(result: EnhancedStrongsResult, detailLevel: string = 'simple'): string {
  const testament = result.language
    ?? (result.testament === 'NT' ? 'Greek' : result.testament === 'OT' ? 'Hebrew' : 'Source language');

  let s = `**${result.strongs_number}** (${testament})\n\n`;
  s += `**Lemma:** ${result.lemma}\n`;
  if (result.transliteration) s += `**Transliteration:** ${result.transliteration}\n`;
  if (result.pronunciation) s += `**Pronunciation:** ${result.pronunciation}\n`;
  s += `**Definition:** ${result.definition}\n`;

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

  s += `\n*Source: ${result.citation.source}*`;
  if (result.citation.copyright) s += ` - ${result.citation.copyright}`;
  if (result.extended && result.extendedCitation) {
    s += `\n*Extended source: ${result.extendedCitation.source}*`;
    if (result.extendedCitation.copyright) s += ` - ${result.extendedCitation.copyright}`;
  }
  return s.trim();
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
