import { describe, expect, it } from 'vitest';
import { formatOriginalLanguageStudyV2Draft } from '../../fixtures/original-language-study-v2/support/originalLanguageStudyV2DraftFormatter.js';
import {
  syntheticCandidate,
  syntheticContext,
  syntheticCoordinator,
  syntheticRequest,
} from '../../fixtures/original-language-study-v2/support/syntheticOriginalLanguageStudyV2Fixtures.js';

describe('inactive original_language_study v2 Markdown formatter', () => {
  it('presents the full composed Greek v1 evidence before the not_applicable Hebrew layer', async () => {
    const presentation = await syntheticCoordinator([syntheticCandidate(1)], syntheticContext('Greek'))
      .coordinator.study(syntheticRequest());
    const markdown = formatOriginalLanguageStudyV2Draft(presentation.output);
    expect(markdown).toContain('Complete existing v1 study');
    expect(markdown).toContain('SYNTHETIC EXISTING GREEK DEFINITION');
    expect(markdown).toContain('added UBS semantic layer is Hebrew');
  });

  it('uses the repository plain-text Markdown escape boundary for source text and URLs', async () => {
    const context = syntheticContext();
    context.v1Result.selectedToken!.text = 'SYNTHETIC *[TOKEN](https://evil.invalid)';
    const value = syntheticCandidate(1);
    value.sense.definition = 'SYNTHETIC **DEFINITION** [link](https://evil.invalid)';
    value.domains[0]!.label = 'SYNTHETIC <DOMAIN>';
    const presentation = await syntheticCoordinator([value], context).coordinator.study(syntheticRequest(undefined, 'detailed'));
    const markdown = formatOriginalLanguageStudyV2Draft(presentation.output);
    expect(markdown).toContain('\\*\\[TOKEN\\]\\(https\\:\\/\\/evil\\.invalid\\)');
    expect(markdown).toContain('SYNTHETIC \\*\\*DEFINITION\\*\\*');
    expect(markdown).toContain('https\\:\\/\\/example\\.invalid\\/dictionary');
    expect(markdown).not.toContain('[link](https://evil.invalid)');
  });
});
