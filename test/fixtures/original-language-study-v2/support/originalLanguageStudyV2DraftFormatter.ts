import { escapeEditionPlainTextForMarkdown } from '../../../../src/kernel/editionProvenanceFoundation.js';
import {
  ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_MARKDOWN_BYTES,
  type OriginalLanguageStudyV2DraftCandidate,
  type OriginalLanguageStudyV2DraftResult,
} from './originalLanguageStudyV2DraftContract.js';
import { serializeValidatedOriginalLanguageStudyV2DraftOutput } from './originalLanguageStudyV2DraftStructured.js';

interface V1TokenView {
  position: number;
  text: string;
  lemma: string;
}

interface V1StudyView {
  status: string;
  context: {
    language: string;
    reference: string;
    selectedToken?: V1TokenView;
    candidates?: readonly V1TokenView[];
  };
  identity?: { publicStrongs: string; lemma: string; joinKind: string };
  grammar?: { code: string; expansion?: string; certainty: string };
  lexiconEvidence?: readonly { sourceId: string; definition?: string; gloss?: string }[];
  interpretiveLimits?: readonly { message: string }[];
  provenance?: readonly { label: string; url?: string }[];
  warnings?: readonly string[];
}

export function formatOriginalLanguageStudyV2Draft(result: OriginalLanguageStudyV2DraftResult): string {
  serializeValidatedOriginalLanguageStudyV2DraftOutput(result);
  const study = result.study as unknown as V1StudyView;
  const context = study.context;
  const sections = [
    '## Original\-language study v2 design fixture',
    '',
    '### Complete existing v1 study',
    '',
    `Status: ${m(study.status)}\. Language: ${m(context.language)}\. Reference: ${m(context.reference)}\.`,
  ];
  if (context.selectedToken) {
    sections.push('', `Selected token: ${m(context.selectedToken.text)} at position ${m(context.selectedToken.position)}; lemma ${m(context.selectedToken.lemma)}\.`);
  }
  if (Array.isArray(context.candidates)) {
    sections.push('', 'Token candidates:');
    for (const candidate of context.candidates) {
      sections.push(`\- Position ${m(candidate.position)}: ${m(candidate.text)}; lemma ${m(candidate.lemma)}\.`);
    }
  }
  if (study.identity) {
    sections.push('', `Identity: ${m(study.identity.publicStrongs)}; lemma ${m(study.identity.lemma)}; join ${m(study.identity.joinKind)}\.`);
  }
  if (study.grammar) {
    sections.push('', `Grammar: ${m(study.grammar.expansion ?? study.grammar.code)}; certainty ${m(study.grammar.certainty)}\.`);
  }
  if (Array.isArray(study.lexiconEvidence) && study.lexiconEvidence.length) {
    sections.push('', 'Lexicon evidence:');
    for (const evidence of study.lexiconEvidence) {
      sections.push(`\- ${m(evidence.sourceId)}: ${m(evidence.definition ?? evidence.gloss ?? 'No semantic definition supplied')}\.`);
    }
  }
  if (Array.isArray(study.interpretiveLimits)) {
    sections.push('', 'Interpretive limits:');
    for (const limit of study.interpretiveLimits) sections.push(`\- ${m(limit.message)}`);
  }
  if (Array.isArray(study.provenance)) {
    sections.push('', 'V1 provenance:');
    for (const provenance of study.provenance) {
      sections.push(`\- ${m(provenance.label)}${provenance.url ? `: ${m(provenance.url)}` : ''}`);
    }
  }
  if (Array.isArray(study.warnings) && study.warnings.length) {
    sections.push('', 'V1 warnings:');
    for (const warning of study.warnings) sections.push(`\- ${m(warning)}`);
  }

  const evidence = result.semanticEvidence;
  sections.push('', '### Added Hebrew semantic layer', '', m(evidence.plainLanguage));
  if ('identity' in evidence) {
    sections.push('', `Public identity: ${m(evidence.identity.publicStrongs)}\. Source identity: ${m(evidence.identity.sourceIdentity)}\.`,
      `Normalized reference: ${m(evidence.normalizedReference)}\.`);
    if ('candidates' in evidence && evidence.candidates.length) {
      sections.push('', 'Semantic candidates:');
      for (const candidate of evidence.candidates) renderCandidate(sections, candidate);
    }
    sections.push('', `Window: ${m(evidence.resultWindow.returnedCount)} returned; ${m(evidence.resultWindow.consumedCount)} of ${m(evidence.resultWindow.totalCount)} consumed\.`);
    if (evidence.resultWindow.continuation) sections.push(`Continuation: ${m(evidence.resultWindow.continuation.cursor)}`);
    sections.push('', 'Withheld evidence:');
    for (const withheld of evidence.withheldEvidence) {
      sections.push(`\- ${m(withheld.source)} ${m(withheld.field)}: ${m(withheld.status)}\.`);
    }
    sections.push('', 'Semantic provenance:');
    for (const source of evidence.provenance.sources) {
      sections.push(`\- ${m(source.sourceRole)} ${m(source.artifactName)}; ${m(source.sourceUrl)}; SHA\-256 ${m(source.sourceSha256)}\.`);
    }
  }
  sections.push('', `Structured response bytes: ${m(result.responseWindow.used)} of ${m(result.responseWindow.maximum)}\.`);
  const markdown = sections.join('\n');
  if (new TextEncoder().encode(markdown).byteLength > ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_MARKDOWN_BYTES) {
    throw new Error(`original_language_study v2 Markdown exceeds ${ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_MARKDOWN_BYTES} UTF-8 bytes`);
  }
  return markdown;
}

function renderCandidate(lines: string[], candidate: OriginalLanguageStudyV2DraftCandidate): void {
  lines.push(`\- ${m(candidate.senseId)} in ${m(candidate.entryId)}; detail ${m(candidate.detailStatus)}\.`);
  if (candidate.detailStatus !== 'detailed') return;
  lines.push(`  \- Lemma: ${m(candidate.lemma)}`);
  lines.push(candidate.definition === undefined
    ? `  \- Definition: unavailable \(${m(candidate.definitionStatus)}\)`
    : `  \- Definition: ${m(candidate.definition)}`);
  if (candidate.definitionExclusionReasons.length) {
    lines.push(`  \- Definition exclusion: ${candidate.definitionExclusionReasons.map(m).join('; ')}`);
  }
  lines.push(`  \- Glosses: ${candidate.glosses.map(m).join('; ')}`);
  if (candidate.domains.length) lines.push(`  \- Domains: ${candidate.domains.map(domain => m(domain.label)).join('; ')}`);
  if (candidate.referenceEvidence.length) {
    lines.push(`  \- Reference evidence: ${candidate.referenceEvidence.map(reference => `${m(reference.evidenceId)} ${m(reference.sourceReference)}`).join('; ')}`);
  }
}

function m(value: unknown): string {
  return escapeEditionPlainTextForMarkdown(String(value));
}
