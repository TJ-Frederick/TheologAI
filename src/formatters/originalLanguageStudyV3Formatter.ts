import { escapeEditionPlainTextForMarkdown } from '../kernel/editionProvenanceFoundation.js';
import {
  ORIGINAL_LANGUAGE_STUDY_ADDED_MARKDOWN_BYTES,
  ORIGINAL_LANGUAGE_STUDY_MARKDOWN_BYTES,
  type OriginalLanguageStudyV3Result,
} from '../kernel/originalLanguageStudyV3Contract.js';
import type { OriginalLanguageStudyDomainResult } from '../services/languages/OriginalLanguageStudyService.js';
import { serializeValidatedOriginalLanguageStudyV3Output } from '../presenters/originalLanguageStudyV3Structured.js';
import { formatOriginalLanguageStudy } from './originalLanguageStudyFormatter.js';

export function formatOriginalLanguageStudyV3(
  result: OriginalLanguageStudyV3Result,
  domain: OriginalLanguageStudyDomainResult,
): string {
  serializeValidatedOriginalLanguageStudyV3Output(result);
  const base = result.depth === 'beginner' ? beginnerMarkdown(domain) : formatOriginalLanguageStudy(domain);
  const sections: string[] = ['', `### ${title(result.depth)} evidence depth`];
  sections.push('', lexicalRangeMarkdown(result));
  sections.push('', m(result.semanticEvidence.plainLanguage));
  if (result.depth === 'technical') {
    renderTechnicalSemantic(sections, result);
    renderTechnicalOccurrences(sections, result);
  }
  sections.push(
    '',
    'English translation comparison is a separate guided-prompt step; it is not inferred from lexical evidence.',
    'Contextual interpretation is also a guided-prompt responsibility. This deterministic tool does not choose the meaning in this verse.',
    `Structured response bytes: ${m(result.responseWindow.used)} of ${m(result.responseWindow.maximum)}.`,
  );
  const suffix = sections.join('\n');
  const bytes = new TextEncoder().encode(suffix).byteLength;
  if (bytes > ORIGINAL_LANGUAGE_STUDY_ADDED_MARKDOWN_BYTES) {
    throw new Error(`original_language_study v3 added Markdown exceeds ${ORIGINAL_LANGUAGE_STUDY_ADDED_MARKDOWN_BYTES} UTF-8 bytes`);
  }
  const markdown = `${base}${suffix}`;
  if (new TextEncoder().encode(markdown).byteLength > ORIGINAL_LANGUAGE_STUDY_MARKDOWN_BYTES) {
    throw new Error(`original_language_study v3 Markdown exceeds ${ORIGINAL_LANGUAGE_STUDY_MARKDOWN_BYTES} UTF-8 bytes`);
  }
  return markdown;
}

function beginnerMarkdown(domain: OriginalLanguageStudyDomainResult): string {
  if (domain.status === 'needs_disambiguation') {
    const rows = domain.candidates!.map(candidate => `- Position ${candidate.position}: ${m(candidate.text)} — ${m(candidate.lemma)}${candidate.gloss ? ` (“${m(candidate.gloss)}”)` : ''}`).join('\n');
    return `## Choose the source word\n\nMore than one token matches in ${m(domain.reference)}.\n\n${rows}\n\nChoose a position and call the tool again. No contextual meaning has been chosen.`;
  }
  const token = domain.selectedToken!;
  return [
    '## Source-language evidence',
    `In ${m(domain.reference)}, the selected ${m(domain.language)} word is **${m(token.text)}**. Its lemma is ${m(token.lemma || 'not available')}.`,
    `The grammar is ${m(domain.grammar?.expansion ?? 'not available in expanded form')}. Grammar narrows possibilities but does not decide meaning by itself.`,
    token.gloss
      ? `The local gloss “${m(token.gloss)}” is a translation cue, not a complete definition or a verdict about this verse.`
      : 'No local gloss is available.',
  ].join('\n\n');
}

function lexicalRangeMarkdown(result: OriginalLanguageStudyV3Result): string {
  if (result.lexicalRange.status === 'unavailable') return `Lexical range: unavailable. ${m(result.lexicalRange.notice)}`;
  const lines = result.lexicalRange.cues.map(cue => result.depth === 'beginner'
    ? `- ${m(beginnerSourceLabel(cue.sourceKind))}, ${m(cue.evidenceKind)}: ${m(cue.text)}`
    : `- ${m(cue.sourceId)} ${m(cue.evidenceKind)}: ${m(cue.text)}`);
  return `Source-attributed lexical range (non-exhaustive):\n${lines.join('\n')}\n\n${m(result.lexicalRange.notice)}`;
}

function beginnerSourceLabel(sourceKind: 'dictionary' | 'stepbible_lexicon'): string {
  return sourceKind === 'dictionary' ? 'Open Scriptures dictionary' : 'STEPBible lexicon';
}

function renderTechnicalSemantic(lines: string[], result: OriginalLanguageStudyV3Result): void {
  const evidence = result.semanticEvidence;
  if (!('identity' in evidence)) return;
  lines.push('', `Semantic identity: ${m(evidence.identity.publicStrongs)} / ${m(evidence.identity.sourceIdentity)}; artifact ${m(evidence.provenance.artifactIdentity)}.`);
  if ('candidates' in evidence && evidence.candidates.length) {
    lines.push('', 'Bounded semantic candidates:');
    for (const candidate of evidence.candidates) {
      lines.push(`- ${m(candidate.senseId)} (${m(candidate.detailStatus)})`);
      if (candidate.detailStatus === 'detailed') {
        if (candidate.definition) lines.push(`  - Definition: ${m(candidate.definition)}`);
        if (candidate.glosses.length) lines.push(`  - Glosses: ${candidate.glosses.map(m).join('; ')}`);
        if (candidate.domains.length) lines.push(`  - Domains: ${candidate.domains.map(domain => m(domain.label)).join('; ')}`);
      }
    }
  }
  lines.push(`Semantic window: ${m(evidence.resultWindow.returnedCount)} returned; ${m(evidence.resultWindow.consumedCount)} of ${m(evidence.resultWindow.totalCount)} consumed.`);
  if (evidence.resultWindow.continuation) lines.push(`Semantic continuation: ${m(evidence.resultWindow.continuation.cursor)}`);
}

function renderTechnicalOccurrences(lines: string[], result: OriginalLanguageStudyV3Result): void {
  const corpus = result.corpusOccurrences;
  if (!corpus) return;
  if (corpus.status !== 'available') {
    lines.push('', `Corpus occurrences: ${m(corpus.plainLanguage)}`);
    return;
  }
  lines.push('', `Exact corrected-corpus occurrences for ${m(corpus.publicStrongs)} (${m(corpus.exactMorphologyKey)}): ${m(corpus.totals.tokenCount)} tokens in ${m(corpus.totals.verseCount)} verses.`);
  for (const occurrence of corpus.occurrences) {
    lines.push(`- ${m(occurrence.book)} ${m(occurrence.chapter)}:${m(occurrence.verse)} position ${m(occurrence.position)} — ${m(occurrence.sourceForm)}; morphology ${m(occurrence.morphologyCode ?? 'unavailable')}; gloss ${m(occurrence.gloss ?? 'unavailable')}`);
  }
  if (corpus.resultWindow.continuation) lines.push(`Occurrence continuation: ${m(corpus.resultWindow.continuation.cursor)}`);
  for (const caution of corpus.cautions) lines.push(`- Caution: ${m(caution)}`);
}

function title(depth: OriginalLanguageStudyV3Result['depth']): string {
  return depth[0]!.toUpperCase() + depth.slice(1);
}

function m(value: unknown): string {
  return escapeEditionPlainTextForMarkdown(String(value));
}
