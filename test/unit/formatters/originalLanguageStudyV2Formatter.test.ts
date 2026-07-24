import { describe, expect, it } from 'vitest';
import { formatOriginalLanguageStudy } from '../../../src/formatters/originalLanguageStudyFormatter.js';
import { formatOriginalLanguageStudyV2 } from '../../../src/formatters/originalLanguageStudyV2Formatter.js';
import { ORIGINAL_LANGUAGE_STUDY_V2_ADDED_SEMANTIC_MARKDOWN_BYTES } from '../../../src/kernel/originalLanguageStudyV2Contract.js';
import { finalizeOriginalLanguageStudyV2Output } from '../../../src/presenters/originalLanguageStudyV2Structured.js';
import {
  productionCandidate,
  productionContext,
  productionCoordinator,
  productionRequest,
} from '../../helpers/originalLanguageStudyV2ProductionFixtures.js';

describe('production original_language_study v2 Markdown formatter', () => {
  it('begins with the complete unmodified v1 text, retaining local gloss, transliteration, policy, and pinned source', async () => {
    const context = productionContext();
    context.v1Result.dictionary!.evidencePolicy = {
      code: 'tbesh_meaning_withheld',
      semanticEvidence: 'unavailable',
      withheldFields: ['tbesh_meaning'],
      notice: 'PRODUCTION EVIDENCE POLICY NOTICE',
    };
    const presentation = await productionCoordinator([productionCandidate(1)], context)
      .coordinator.study(productionRequest());
    const existingV1 = formatOriginalLanguageStudy(context.v1Result);

    expect(presentation.markdown.startsWith(existingV1)).toBe(true);
    expect(presentation.markdown).toContain('PRODUCTION LOCAL GLOSS');
    expect(presentation.markdown).toContain('PRODUCTION TRANSLITERATION');
    expect(presentation.markdown).toContain('PRODUCTION EVIDENCE POLICY NOTICE');
    expect(presentation.markdown).toContain('Pinned STEPBible revision');
    expect(presentation.markdown).toContain('### Added Hebrew semantic layer');
  });

  it('uses the established escape boundary for the added semantic fields without changing the v1 section', async () => {
    const context = productionContext();
    context.v1Result.selectedToken!.text = 'PRODUCTION *[TOKEN](https://evil.invalid)';
    const candidate = productionCandidate(1);
    candidate.sense.definition = 'PRODUCTION **DEFINITION** [link](https://evil.invalid)';
    candidate.domains[0]!.label = 'PRODUCTION <DOMAIN>';
    const presentation = await productionCoordinator([candidate], context).coordinator.study(
      productionRequest(undefined, 'detailed'),
    );

    expect(presentation.markdown).toContain('PRODUCTION *[TOKEN](https://evil.invalid)');
    expect(presentation.markdown).toContain('PRODUCTION \\*\\*DEFINITION\\*\\*');
    expect(presentation.markdown).toContain('https\\:\\/\\/example\\.invalid\\/dictionary');
    expect(presentation.markdown).not.toContain('[link](https://evil.invalid)');
  });

  it('fails closed if a caller tries to render v2 with a different v1 result', async () => {
    const presentation = await productionCoordinator([productionCandidate(1)]).coordinator.study(productionRequest());
    const different = productionContext().v1Result;
    different.reference = 'Genesis 1:2';
    expect(() => formatOriginalLanguageStudyV2(presentation.output, different))
      .toThrow('exact v1 result composed into structured output');
  });

  it('enforces the exact additive semantic-suffix boundary without changing the complete v1 prefix', async () => {
    const regular = await productionCoordinator([productionCandidate(1)]).coordinator
      .study(productionRequest(undefined, 'detailed'));
    const boundaryDefinition = semanticBoundaryDefinition(regular.output);
    const exactBoundary = outputWithEscapedDefinition(regular.output, boundaryDefinition);
    const exactMarkdown = formatOriginalLanguageStudyV2(exactBoundary, productionContext().v1Result);
    const exactSuffix = exactMarkdown.slice(formatOriginalLanguageStudy(productionContext().v1Result).length);
    expect(new TextEncoder().encode(exactSuffix).byteLength)
      .toBe(ORIGINAL_LANGUAGE_STUDY_V2_ADDED_SEMANTIC_MARKDOWN_BYTES);

    const overflow = outputWithEscapedDefinition(regular.output, `${boundaryDefinition}x`);
    expect(() => formatOriginalLanguageStudyV2(overflow, productionContext().v1Result))
      .toThrow('added semantic Markdown exceeds');
  });
});

function outputWithEscapedDefinition(
  baseline: Awaited<ReturnType<ReturnType<typeof productionCoordinator>['coordinator']['study']>>['output'],
  definition: string,
) {
  const output = structuredClone(baseline);
  if (output.semanticEvidence.status !== 'lexical_candidates') {
    throw new Error('expected detailed lexical candidate output');
  }
  const candidate = output.semanticEvidence.candidates[0];
  if (!candidate || candidate.detailStatus !== 'detailed') {
    throw new Error('expected detailed candidate');
  }
  candidate.definition = definition;
  return finalizeOriginalLanguageStudyV2Output(output).output;
}

function semanticBoundaryDefinition(
  baseline: Awaited<ReturnType<ReturnType<typeof productionCoordinator>['coordinator']['study']>>['output'],
): string {
  const fits = (definition: string): string | undefined => {
    try {
      return formatOriginalLanguageStudyV2(outputWithEscapedDefinition(baseline, definition), productionContext().v1Result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('added semantic Markdown exceeds')) return undefined;
      throw error;
    }
  };
  let lower = 1;
  let upper = 1;
  while (fits('*'.repeat(upper)) !== undefined) upper *= 2;
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (fits('*'.repeat(middle)) === undefined) upper = middle;
    else lower = middle;
  }
  const candidate = '*'.repeat(lower);
  const markdown = fits(candidate);
  if (markdown === undefined) throw new Error('semantic Markdown boundary search did not retain its lower bound');
  const prefix = formatOriginalLanguageStudy(productionContext().v1Result);
  const bytes = new TextEncoder().encode(markdown.slice(prefix.length)).byteLength;
  const remaining = ORIGINAL_LANGUAGE_STUDY_V2_ADDED_SEMANTIC_MARKDOWN_BYTES - bytes;
  if (remaining < 0) throw new Error('semantic Markdown boundary fixture has no remaining capacity');
  return `${candidate}${'x'.repeat(remaining)}`;
}
