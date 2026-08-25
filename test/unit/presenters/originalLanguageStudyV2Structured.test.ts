import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { serializeValidatedOriginalLanguageStudyV2Output } from '../../../src/presenters/originalLanguageStudyV2Structured.js';
import { presentOriginalLanguageStudyV2 } from '../../../src/presenters/originalLanguageStudyV2Presentation.js';
import {
  productionCandidate,
  productionContext,
  productionCoordinator,
  productionRequest,
} from '../../helpers/originalLanguageStudyV2ProductionFixtures.js';

const ORIGINAL_LANGUAGE_STUDY_V2_PARITY_PROVENANCE = {
  sourceCommit: '0893657b9325f934548e1ee806f350a4ef9303cc',
  hashDomain: 'sha256(utf8(text))',
  cases: {
    'hebrew-summary': {
      serializedSha256: '2567bcb4eb9ad245197d769cc423538a3dd5ff54b9ff1664ed314872fed66788',
      markdownSha256: '826c033d61fa03752a519e55ab3b7582d7111b9291f838b5e4d6c5ebacc8a437',
      status: 'lexical_candidates', serializedBytes: 5157,
    },
    'hebrew-detailed': {
      serializedSha256: '8e7a5d581125d0368c6dee3500115b553344266d737dc9e66cb8e9a4e47db9d7',
      markdownSha256: 'ec1a5806f5b6b41afbb2cabc762a752d8f2af5cd5a699c808595cccc91b43133',
      status: 'lexical_candidates', serializedBytes: 5776,
    },
    greek: {
      serializedSha256: '6d3f305075a3d6d520a6d0c8ab3f4f6eff25981a8e07a4885319e59894be67db',
      markdownSha256: 'd8687a16b93be360f70bcdfa421274e6055d1238d6f30c479d44d40985a97b97',
      status: 'not_applicable', serializedBytes: 2981,
    },
    ineligible: {
      serializedSha256: '148ab6f27b93ba4d62748d734c83cfa6d326be32b8267084ad7216f1392d0924',
      markdownSha256: 'f1ca2409c1119eeac50d8b038e25cf2e5808fce7c741854ef6989ddc471b3b38',
      status: 'unavailable', serializedBytes: 2723,
    },
    ambiguous: {
      serializedSha256: '8d774511398673d65d3e39fa638fd7e9641c9691f3a7b3f1bfc890ac53d61f1c',
      markdownSha256: '6e460030980811b626589e77d645f1f56b7bb375b5a9421a8fa267178d782c1e',
      status: 'unavailable', serializedBytes: 2382,
    },
    aligned: {
      serializedSha256: '39e89ad5a99bda45406123db808e6c8468fb42a36969cc2171fc110fbabcab11',
      markdownSha256: 'b95d769071a188bb39378e483b1876c4c4a4ca10d19d7d85b51a80d298c1e931',
      status: 'reference_aligned_source_candidate', serializedBytes: 7303,
    },
    'continuation-first': {
      serializedSha256: 'a40819a887ea45c1f25c8d106b95616ecfd85091ae7fb38b8241ff82999bf89a',
      markdownSha256: '33c885e2309e8c35fcc99530578b48ce114464c9318a69520dfd1be20646c4fb',
      status: 'lexical_candidates', serializedBytes: 8772,
    },
    'continuation-second': {
      serializedSha256: 'a8f4bfb3db5a46282481828a7e76c7dd3fb04d87f38848e354c721def9d792e1',
      markdownSha256: 'd55064362ea62f683a2c54f3dc7e8135c867aaf384862070243b4e9055f4fa6c',
      status: 'lexical_candidates', serializedBytes: 5395,
    },
    'candidate-omission': {
      serializedSha256: '6a851adda72b239098e73ab683b327ffd7eb8110e7e48467f8cef57aef176291',
      markdownSha256: 'c3a95327ad09f777e500246470dffe0d0c6f13c1f535be2c618f5a46bb48661f',
      status: 'lexical_candidates', serializedBytes: 19981,
    },
  },
} as const;

describe('production original_language_study v2 structured presenter', () => {
  it('validates presenter-produced summary and detailed outputs with truthful serialized bytes', async () => {
    for (const detail of ['summary', 'detailed'] as const) {
      const applicationResult = await productionCoordinator([productionCandidate(1)]).coordinator
        .study(productionRequest(undefined, detail));
      const presentation = presentOriginalLanguageStudyV2(applicationResult);
      expect(JSON.parse(presentation.serialized)).toEqual(presentation.output);
      expect(presentation.output.responseWindow.used)
        .toBe(new TextEncoder().encode(presentation.serialized).byteLength);
      expect(serializeValidatedOriginalLanguageStudyV2Output(presentation.output)).toBe(presentation.serialized);
    }
  });

  it('preserves the exact structured and Markdown output hashes across representative application branches', async () => {
    const assertCase = async (name: string, current: ReturnType<typeof productionCoordinator>, request = productionRequest()) => {
      const presentation = presentOriginalLanguageStudyV2(await current.coordinator.study(request));
      const expected = ORIGINAL_LANGUAGE_STUDY_V2_PARITY_PROVENANCE.cases[name as keyof typeof ORIGINAL_LANGUAGE_STUDY_V2_PARITY_PROVENANCE.cases];
      expect(expected, `${name} parity provenance`).toBeDefined();
      expect(hash(presentation.serialized), `${name} structured`).toBe(expected.serializedSha256);
      expect(hash(presentation.markdown), `${name} Markdown`).toBe(expected.markdownSha256);
      expect(presentation.output.semanticEvidence.status, `${name} status`).toBe(expected.status);
      expect(presentation.output.responseWindow.used, `${name} bytes`).toBe(expected.serializedBytes);
      expect(presentation.output.responseWindow.used).toBe(new TextEncoder().encode(presentation.serialized).byteLength);
      return presentation;
    };
    await assertCase('hebrew-summary', productionCoordinator([productionCandidate(1)]));
    await assertCase('hebrew-detailed', productionCoordinator([productionCandidate(1)]), productionRequest(undefined, 'detailed'));
    await assertCase('greek', productionCoordinator([productionCandidate(1)], productionContext('Greek')), { reference: 'Jn 1:1', target: 'H1', position: 1, detail: 'summary' });
    const ineligibleContext = productionContext();
    ineligibleContext.v1Result.identity = undefined;
    ineligibleContext.v1Result.selectedToken!.strongsNumber = null;
    await assertCase('ineligible', productionCoordinator([productionCandidate(1)], ineligibleContext));
    const ambiguousContext = productionContext();
    const token = ambiguousContext.v1Result.selectedToken!;
    ambiguousContext.v1Result = { reference: 'Genesis 1:1', language: 'Hebrew', target: 'H1', status: 'needs_disambiguation', candidates: [token, { ...token, position: 2 }], warnings: [] };
    await assertCase('ambiguous', productionCoordinator([productionCandidate(1)], ambiguousContext));
    await assertCase('aligned', productionCoordinator([productionCandidate(1)], productionContext('Hebrew', true)), productionRequest(undefined, 'detailed'));
    const values = Array.from({ length: 10 }, (_, index) => productionCandidate(index + 1));
    const first = await assertCase('continuation-first', productionCoordinator(values));
    if (!('resultWindow' in first.output.semanticEvidence) || !first.output.semanticEvidence.resultWindow.continuation) throw new Error('expected continuation hash fixture');
    await assertCase('continuation-second', productionCoordinator(values), productionRequest(first.output.semanticEvidence.resultWindow.continuation.cursor));
    await assertCase('candidate-omission', productionCoordinator([productionCandidate(1, 14_000), productionCandidate(2, 14_000)]), productionRequest(undefined, 'detailed'));
  });

  it('rejects false-terminal arithmetic, provenance swaps, and dishonest byte accounting', async () => {
    const baseline = presentOriginalLanguageStudyV2(await productionCoordinator([productionCandidate(1)]).coordinator.study(productionRequest())).output;
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
    const aligned = presentOriginalLanguageStudyV2(await productionCoordinator([productionCandidate(1)], productionContext('Hebrew', true))
      .coordinator.study(productionRequest(undefined, 'detailed'))).output;
    if (aligned.semanticEvidence.status !== 'reference_aligned_source_candidate') {
      throw new Error('expected aligned production output');
    }
    const forged = structuredClone(aligned);
    if (forged.semanticEvidence.status !== 'reference_aligned_source_candidate') throw new Error('expected aligned evidence');
    forged.semanticEvidence.alignmentEvidence.evidenceId = 'synthetic-reference-forged';
    expect(() => serializeValidatedOriginalLanguageStudyV2Output(forged)).toThrow('alignment must bind');

    const tooLarge = productionContext();
    tooLarge.v1Result.dictionary!.definition = `PRODUCTION ${'X'.repeat(33_000)}`;
    const oversizedApplication = await productionCoordinator([productionCandidate(1)], tooLarge).coordinator
      .study(productionRequest());
    expect(() => presentOriginalLanguageStudyV2(oversizedApplication))
      .toThrow('serialized UTF-8 bytes');
  });
});

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
