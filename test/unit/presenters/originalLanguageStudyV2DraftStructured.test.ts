import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  serializeValidatedOriginalLanguageStudyV2DraftOutput,
} from '../../fixtures/original-language-study-v2/support/originalLanguageStudyV2DraftStructured.js';
import {
  syntheticCandidate,
  syntheticContext,
  syntheticCoordinator,
  syntheticRequest,
} from '../../fixtures/original-language-study-v2/support/syntheticOriginalLanguageStudyV2Fixtures.js';
import type { OriginalLanguageStudyV2DraftResult } from '../../fixtures/original-language-study-v2/support/originalLanguageStudyV2DraftContract.js';

const fixtures = new URL('../../fixtures/original-language-study-v2/', import.meta.url);

interface ScenarioFixture {
  scenario: { candidateCount: number; detail: 'summary' | 'detailed'; serverVerifiedAlignment: boolean };
  request: { reference: string; target: string; position: number; detail: 'summary' | 'detailed' };
  expected: {
    schemaVersion: string; composedV1SchemaVersion: string; composedV1Language: string;
    composedV1Definition: string; semanticStatus: string;
    candidateSenseIds: string[]; candidateDetailStatuses: string[];
  };
}

describe('inactive original_language_study v2 structured presenter', () => {
  it('generates summary and detailed fixtures through the coordinator and validates the exact schema', async () => {
    for (const name of ['summary.synthetic.json', 'detailed.synthetic.json']) {
      const fixture = JSON.parse(readFileSync(new URL(name, fixtures), 'utf8')) as ScenarioFixture;
      const values = Array.from({ length: fixture.scenario.candidateCount }, (_, index) => syntheticCandidate(index + 1));
      const presentation = await syntheticCoordinator(values,
        syntheticContext('Hebrew', fixture.scenario.serverVerifiedAlignment)).coordinator.study(fixture.request);
      const output = presentation.output;
      expect(output.schemaVersion).toBe(fixture.expected.schemaVersion);
      expect(output.study).toMatchObject({
        schemaVersion: fixture.expected.composedV1SchemaVersion,
        context: { language: fixture.expected.composedV1Language },
        lexiconEvidence: [{ definition: fixture.expected.composedV1Definition }],
      });
      expect(output.semanticEvidence.status).toBe(fixture.expected.semanticStatus);
      if ('candidates' in output.semanticEvidence) {
        expect(output.semanticEvidence.candidates.map(candidate => candidate.senseId)).toEqual(fixture.expected.candidateSenseIds);
        expect(output.semanticEvidence.candidates.map(candidate => candidate.detailStatus)).toEqual(fixture.expected.candidateDetailStatuses);
      }
      expect(serializeValidatedOriginalLanguageStudyV2DraftOutput(output)).toBe(presentation.serialized);
    }
  });

  it('rejects false-terminal arithmetic, provenance-role swaps, and dishonest byte accounting', async () => {
    const baseline = (await syntheticCoordinator([syntheticCandidate(1)]).coordinator.study(syntheticRequest())).output;
    const terminal = structuredClone(baseline);
    if (!('resultWindow' in terminal.semanticEvidence)) throw new Error('expected repository result');
    terminal.semanticEvidence.resultWindow.totalCount = 2;
    expect(() => serializeValidatedOriginalLanguageStudyV2DraftOutput(terminal)).toThrow('terminal state');

    const swapped = structuredClone(baseline);
    if (!('provenance' in swapped.semanticEvidence) || !('candidates' in swapped.semanticEvidence)) throw new Error('expected repository result');
    swapped.semanticEvidence.candidates[0]!.sourceId = swapped.semanticEvidence.provenance.sources[1].sourceId;
    expect(() => serializeValidatedOriginalLanguageStudyV2DraftOutput(swapped)).toThrow('dictionary provenance source');

    const dishonest = structuredClone(baseline);
    dishonest.responseWindow.used += 1;
    expect(() => serializeValidatedOriginalLanguageStudyV2DraftOutput(dishonest)).toThrow('used bytes are not truthful');
  });

  it('independently rejects serialized v1 request and context reference mismatches', async () => {
    const baseline = (await syntheticCoordinator([syntheticCandidate(1)]).coordinator.study(syntheticRequest())).output;
    for (const field of ['request', 'context'] as const) {
      const mismatched = structuredClone(baseline);
      const study = mismatched.study as {
        request: { reference: string };
        context: { reference: string };
      };
      study[field].reference = 'Other 9:9';
      expect(() => serializeValidatedOriginalLanguageStudyV2DraftOutput(mismatched), field)
        .toThrow('exact reference-, target-, and position-matching');
    }
  });

  it('rejects invented aligned identities and nested domain/source-role substitutions', async () => {
    const aligned = (await syntheticCoordinator([syntheticCandidate(1)], syntheticContext('Hebrew', true))
      .coordinator.study(syntheticRequest(undefined, 'detailed'))).output;
    const forged = structuredClone(aligned);
    if (forged.semanticEvidence.status !== 'reference_aligned_source_candidate') throw new Error('expected aligned fixture');
    forged.semanticEvidence.alignmentEvidence.evidenceId = 'synthetic-reference-forged';
    expect(() => serializeValidatedOriginalLanguageStudyV2DraftOutput(forged)).toThrow('alignment must bind');

    const roleSwap = structuredClone(aligned);
    if (roleSwap.semanticEvidence.status !== 'reference_aligned_source_candidate') throw new Error('expected aligned fixture');
    const candidate = roleSwap.semanticEvidence.candidates[0]!;
    if (candidate.detailStatus !== 'detailed') throw new Error('expected detailed candidate');
    candidate.domains[0]!.sourceId = 'synthetic-dictionary';
    expect(() => serializeValidatedOriginalLanguageStudyV2DraftOutput(roleSwap)).toThrow('provenance roles');
  });

  it('fails closed when the composed v1 result alone cannot fit the 32 KiB response', async () => {
    const context = syntheticContext();
    context.v1Result.dictionary!.definition = `SYNTHETIC ${'X'.repeat(33_000)}`;
    await expect(syntheticCoordinator([syntheticCandidate(1)], context).coordinator.study(syntheticRequest()))
      .rejects.toThrow('serialized UTF-8 bytes');
  });
});
