/**
 * Pure formatting functions for biblical languages tool responses.
 */

import type { EnhancedStrongsResult, VerseMorphologyResult, VerseWord } from '../kernel/types.js';

/** Format a Strong's lookup result */
export function formatStrongsResult(result: EnhancedStrongsResult, detailLevel: string = 'simple'): string {
  const testament = result.testament === 'NT' ? 'Greek' : 'Hebrew';

  let s = `**${result.strongs_number}** (${testament})\n\n`;
  s += `**Lemma:** ${result.lemma}\n`;
  if (result.transliteration) s += `**Transliteration:** ${result.transliteration}\n`;
  if (result.pronunciation) s += `**Pronunciation:** ${result.pronunciation}\n`;
  s += `**Definition:** ${result.definition}\n`;

  if (detailLevel === 'detailed') {
    if (result.derivation) s += `**Derivation:** ${result.derivation}\n`;

    if (result.extended) {
      s += '\n**Extended Data:**\n';
      if (result.extended.strongsExtended) {
        s += `Extended Strong's: ${result.extended.strongsExtended}\n`;
      }
      if (result.extended.occurrences) {
        s += `Occurrences: ${result.extended.occurrences}\n`;
      }
      if (result.extended.senses) {
        s += '\n**Senses:**\n';
        for (const [key, sense] of Object.entries(result.extended.senses)) {
          s += `- ${sense.gloss} (${sense.count}x): ${sense.usage}\n`;
        }
      }
    }
  }

  s += `\n*Source: ${result.citation.source}*`;
  if (result.citation.copyright) s += ` - ${result.citation.copyright}`;
  return s.trim();
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
  return s.trim();
}
