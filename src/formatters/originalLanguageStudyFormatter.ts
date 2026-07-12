import type { OriginalLanguageStudyDomainResult } from '../services/languages/OriginalLanguageStudyService.js';

export function formatOriginalLanguageStudy(result: OriginalLanguageStudyDomainResult): string {
  if (result.status === 'needs_disambiguation') {
    const rows = result.candidates!.map(c => `- Position ${c.position}: ${c.text} — ${c.lemma}${c.gloss ? ` (“${c.gloss}”)` : ''}`).join('\n');
    return `## More than one token matches in ${result.reference}\n\n${rows}\n\nChoose a token position and call this tool again. No contextual sense has been inferred.`;
  }
  const token = result.selectedToken!;
  const sections = [
    `## Contextual evidence (for a plain-English explanation)\n\nIn ${result.reference}, the selected source token is **${token.text}** at position ${token.position}. Its local source gloss is ${token.gloss ? `“${token.gloss}”` : 'not available'}. Context—not this gloss alone—must determine the sense here.`,
    `## The word\n\n- Lemma: ${token.lemma || 'Not available'}\n- Strong's identifier: ${result.identity?.publicStrongs ?? token.strongsNumber ?? 'Not available'}${result.identity?.transliteration ? `\n- Transliteration: ${result.identity.transliteration}` : ''}`,
    `## Grammar\n\n${result.grammar?.expansion ?? 'No source expansion is available.'}${result.grammar?.code ? ` (raw code: \`${result.grammar.code}\`)` : ''}\n\nMorphology constrains interpretation but does not determine the word's contextual meaning by itself.`,
  ];
  if (result.dictionary || result.stepBible) {
    let evidence = '## Source-separated lexical evidence';
    if (result.dictionary) evidence += `\n\n### ${result.dictionary.sourceKind === 'stepbible_lexicon' ? 'STEPBible lexicon' : "OpenScriptures Strong's"}\n\n${result.dictionary.definition}`;
    if (result.stepBible && result.dictionary?.sourceKind !== 'stepbible_lexicon') evidence += `\n\n### STEPBible lexicon\n\n${result.stepBible.definition ?? result.stepBible.gloss ?? 'No definition text available.'}`;
    sections.push(evidence);
  }
  sections.push(`> Study cautions: A gloss is not a complete definition; Strong's numbers are identifiers; roots and etymology do not prove contextual meaning; do not import every possible sense into this occurrence.\n\n*Sources: STEPBible TAGNT/TAHOT; OpenScriptures Strong's and/or STEPBible lexicon where available. Source classification is Greek or Hebrew; this tool does not infer Aramaic. Exact upstream STEPBible revision is not exposed by this corpus build.*`);
  if (result.warnings.length) sections.push(`## Data limitations\n\n${result.warnings.map(w => `- ${w}`).join('\n')}`);
  return sections.join('\n\n');
}

