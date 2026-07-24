import { describe, expect, it } from 'vitest';
import { serializeValidatedOriginalLanguageStudyV2Output } from '../../../src/presenters/originalLanguageStudyV2Structured.js';
import {
  productionCandidate,
  productionContext,
  productionCoordinator,
  productionRequest,
} from '../../helpers/originalLanguageStudyV2ProductionFixtures.js';

describe('production original_language_study v2 structured presenter', () => {
  it('validates coordinator-produced summary and detailed outputs with truthful serialized bytes', async () => {
    for (const detail of ['summary', 'detailed'] as const) {
      const presentation = await productionCoordinator([productionCandidate(1)]).coordinator
        .study(productionRequest(undefined, detail));
      expect(JSON.parse(presentation.serialized)).toEqual(presentation.output);
      expect(presentation.output.responseWindow.used)
        .toBe(new TextEncoder().encode(presentation.serialized).byteLength);
      expect(serializeValidatedOriginalLanguageStudyV2Output(presentation.output)).toBe(presentation.serialized);
    }
  });

  it('rejects false-terminal arithmetic, provenance swaps, and dishonest byte accounting', async () => {
    const baseline = (await productionCoordinator([productionCandidate(1)]).coordinator.study(productionRequest())).output;
    const terminal = structuredClone(baseline);
    if (!('resultWindow' in terminal.semanticEvidence)) throw new Error('expected repository evidence');
    terminal.semanticEvidence.resultWindow.totalCount = 2;
    expect(() => serializeValidatedOriginalLanguageStudyV2Output(terminal)).toThrow('terminal state');

    const swapped = structuredClone(baseline);
    if (!('provenance' in swapped.semanticEvidence) || !('candidates' in swapped.semanticEvidence)) {
      throw new Error('expected repository evidence');
    }
    swapped.semanticEvidence.candidates[0]!.sourceId = swapped.semanticEvidence.provenance.sources[1].sourceId;
    expect(() => serializeValidatedOriginalLanguageStudyV2Output(swapped)).toThrow('dictionary provenance source');

    const dishonest = structuredClone(baseline);
    dishonest.responseWindow.used += 1;
    expect(() => serializeValidatedOriginalLanguageStudyV2Output(dishonest)).toThrow('used bytes are not truthful');
  });

  it('rejects invented alignment identities and fails closed when v1 alone exceeds the structured packet limit', async () => {
    const aligned = (await productionCoordinator([productionCandidate(1)], productionContext('Hebrew', true))
      .coordinator.study(productionRequest(undefined, 'detailed'))).output;
    if (aligned.semanticEvidence.status !== 'reference_aligned_source_candidate') {
      throw new Error('expected aligned production output');
    }
    const forged = structuredClone(aligned);
    forged.semanticEvidence.alignmentEvidence.evidenceId = 'synthetic-reference-forged';
    expect(() => serializeValidatedOriginalLanguageStudyV2Output(forged)).toThrow('alignment must bind');

    const tooLarge = productionContext();
    tooLarge.v1Result.dictionary!.definition = `PRODUCTION ${'X'.repeat(33_000)}`;
    await expect(productionCoordinator([productionCandidate(1)], tooLarge).coordinator.study(productionRequest()))
      .rejects.toThrow('serialized UTF-8 bytes');
  });
});
