import { escapeEditionPlainTextForMarkdown } from '../kernel/editionProvenanceFoundation.js';
import {
  ORIGINAL_LANGUAGE_STUDY_V2_ADDED_SEMANTIC_MARKDOWN_BYTES,
  type OriginalLanguageStudyV2Candidate,
  type OriginalLanguageStudyV2Result,
} from '../kernel/originalLanguageStudyV2Contract.js';
import { serializeValidatedOriginalLanguageStudyV2Output } from '../presenters/originalLanguageStudyV2Structured.js';
import { presentOriginalLanguageStudy } from '../presenters/originalLanguageStudyStructured.js';
import { formatOriginalLanguageStudy } from './originalLanguageStudyFormatter.js';
import type { OriginalLanguageStudyDomainResult } from '../services/languages/OriginalLanguageStudyService.js';

/**
 * Human-readable presentation of a validated v2 result used by the existing
 * original_language_study MCP tool.
 */
export function formatOriginalLanguageStudyV2(
  result: OriginalLanguageStudyV2Result,
  v1Result: OriginalLanguageStudyDomainResult,
): string {
  serializeValidatedOriginalLanguageStudyV2Output(result);
  const composedV1 = presentOriginalLanguageStudy(v1Result, result.request.position);
  if (JSON.stringify(composedV1) !== JSON.stringify(result.study)) {
    throw new Error('original_language_study v2 Markdown must receive the exact v1 result composed into structured output');
  }
  // The current v1 formatting is a complete, byte-for-byte prefix. Its size
  // is deliberately not capped by this v2 layer.
  const v1Markdown = formatOriginalLanguageStudy(v1Result);
  const semanticSections: string[] = [];

  const evidence = result.semanticEvidence;
  semanticSections.push('', '### Added Hebrew semantic layer', '', m(evidence.plainLanguage));
  if ('identity' in evidence) {
    semanticSections.push('', `Public identity: ${m(evidence.identity.publicStrongs)}. Source identity: ${m(evidence.identity.sourceIdentity)}.`,
      `Normalized reference: ${m(evidence.normalizedReference)}.`);
    if ('candidates' in evidence && evidence.candidates.length) {
      semanticSections.push('', 'Semantic candidates:');
      for (const candidate of evidence.candidates) renderCandidate(semanticSections, candidate);
    }
    semanticSections.push('', `Window: ${m(evidence.resultWindow.returnedCount)} returned; ${m(evidence.resultWindow.consumedCount)} of ${m(evidence.resultWindow.totalCount)} consumed.`);
    if (evidence.resultWindow.continuation) semanticSections.push(`Continuation: ${m(evidence.resultWindow.continuation.cursor)}`);
    semanticSections.push('', 'Withheld evidence:');
    for (const withheld of evidence.withheldEvidence) {
      semanticSections.push(`- ${m(withheld.source)} ${m(withheld.field)}: ${m(withheld.status)}.`);
    }
    semanticSections.push('', 'Semantic provenance:');
    for (const source of evidence.provenance.sources) {
      semanticSections.push(`- ${m(source.sourceRole)} ${m(source.artifactName)}; ${m(source.sourceUrl)}; SHA-256 ${m(source.sourceSha256)}.`);
    }
  }
  semanticSections.push('', `Structured response bytes: ${m(result.responseWindow.used)} of ${m(result.responseWindow.maximum)}.`);
  const semanticSuffix = semanticSections.join('\n');
  const bytes = new TextEncoder().encode(semanticSuffix).byteLength;
  if (bytes > ORIGINAL_LANGUAGE_STUDY_V2_ADDED_SEMANTIC_MARKDOWN_BYTES) {
    throw new Error(
      `original_language_study v2 added semantic Markdown exceeds ${ORIGINAL_LANGUAGE_STUDY_V2_ADDED_SEMANTIC_MARKDOWN_BYTES} UTF-8 bytes; refusing to truncate the v2 suffix`,
    );
  }
  return `${v1Markdown}${semanticSuffix}`;
}

function renderCandidate(lines: string[], candidate: OriginalLanguageStudyV2Candidate): void {
  lines.push(`- ${m(candidate.senseId)} in ${m(candidate.entryId)}; detail ${m(candidate.detailStatus)}.`);
  if (candidate.detailStatus !== 'detailed') return;
  lines.push(`  - Lemma: ${m(candidate.lemma)}`);
  lines.push(candidate.definition === undefined
    ? `  - Definition: unavailable (${m(candidate.definitionStatus)})`
    : `  - Definition: ${m(candidate.definition)}`);
  if (candidate.definitionExclusionReasons.length) {
    lines.push(`  - Definition exclusion: ${candidate.definitionExclusionReasons.map(m).join('; ')}`);
  }
  lines.push(`  - Glosses: ${candidate.glosses.map(m).join('; ')}`);
  if (candidate.domains.length) lines.push(`  - Domains: ${candidate.domains.map(domain => m(domain.label)).join('; ')}`);
  if (candidate.referenceEvidence.length) {
    lines.push(`  - Reference evidence: ${candidate.referenceEvidence.map(reference => `${m(reference.evidenceId)} ${m(reference.sourceReference)}`).join('; ')}`);
  }
}

function m(value: unknown): string {
  return escapeEditionPlainTextForMarkdown(String(value));
}
