import { describe, expect, it } from 'vitest';
import { createUbsSemanticEvidenceBundleCursor } from '../../../../src/kernel/ubsSemanticEvidenceBundle.js';
import {
  createOriginalLanguageStudyV2DraftCursor,
} from '../../../fixtures/original-language-study-v2/support/originalLanguageStudyV2DraftContract.js';
import {
  SYNTHETIC_ARTIFACT,
  SYNTHETIC_H0001,
  syntheticCandidate,
  syntheticContext,
  syntheticCoordinator,
  syntheticCursorBinding,
  syntheticHebrewV1Result,
  syntheticRequest,
} from '../../../fixtures/original-language-study-v2/support/syntheticOriginalLanguageStudyV2Fixtures.js';

describe('inactive original_language_study v2 aggregate coordinator', () => {
  it('composes the complete current v1 study and makes exactly one aggregate call for eligible Hebrew pages', async () => {
    for (const values of [[], [syntheticCandidate(1)], Array.from({ length: 10 }, (_, index) => syntheticCandidate(index + 1))]) {
      const current = syntheticCoordinator(values);
      const presentation = await current.coordinator.study(syntheticRequest());
      const output = presentation.output;
      expect(current.repository.queryCount).toBe(1);
      expect(output.study).toMatchObject({
        schemaVersion: '1', kind: 'original_language_study',
        context: { language: 'Hebrew', selectedToken: { text: 'SYNTHETIC TOKEN' } },
        lexiconEvidence: [{ definition: 'SYNTHETIC EXISTING V1 DEFINITION' }],
      });
      expect(JSON.parse(presentation.serialized)).toEqual(output);
      expect(output.responseWindow.used).toBe(new TextEncoder().encode(presentation.serialized).byteLength);
      if (values.length === 10 && 'resultWindow' in output.semanticEvidence) {
        expect(output.semanticEvidence.resultWindow).toMatchObject({ returnedCount: 8, hasMore: true });
      }
    }
  });

  it('preserves the full Greek v1 evidence while making the added Hebrew layer not_applicable', async () => {
    const current = syntheticCoordinator([syntheticCandidate(1)], syntheticContext('Greek'));
    const { output } = await current.coordinator.study(syntheticRequest());
    expect(output.study).toMatchObject({
      context: { language: 'Greek', selectedToken: { text: 'SYNTHETIC GREEK TOKEN' } },
      grammar: { expansion: 'SYNTHETIC GREEK GRAMMAR' },
      lexiconEvidence: [{ definition: 'SYNTHETIC EXISTING GREEK DEFINITION' }],
    });
    expect(output.semanticEvidence).toMatchObject({ language: 'Greek', status: 'not_applicable' });
    expect(current.repository.queryCount).toBe(0);
  });

  it('rejects cross-reference composition before presenting even for the Greek not_applicable branch', async () => {
    const context = syntheticContext('Greek');
    context.v1Result.reference = 'Other 9:9';
    const current = syntheticCoordinator([syntheticCandidate(1)], context);
    await expect(current.coordinator.study(syntheticRequest()))
      .rejects.toThrow('does not exactly match the caller reference');
    expect(current.repository.queryCount).toBe(0);
  });

  it('uses detail only for volume and deterministically omits oversized candidate details without changing truth', async () => {
    const values = [syntheticCandidate(1, 20_000), syntheticCandidate(2, 20_000)];
    const summary = (await syntheticCoordinator(values).coordinator.study(syntheticRequest(undefined, 'summary'))).output;
    const detailed = (await syntheticCoordinator(values).coordinator.study(syntheticRequest(undefined, 'detailed'))).output;
    expect(summary.semanticEvidence.status).toBe(detailed.semanticEvidence.status);
    if ('candidates' in summary.semanticEvidence && 'candidates' in detailed.semanticEvidence) {
      expect(summary.semanticEvidence.candidates.map(candidate => candidate.senseId))
        .toEqual(detailed.semanticEvidence.candidates.map(candidate => candidate.senseId));
      expect(detailed.semanticEvidence.candidates.map(candidate => candidate.detailStatus))
        .toContain('omitted_response_byte_budget');
    }
    expect(detailed.responseWindow.used).toBeLessThanOrEqual(32 * 1024);
  });

  it('rejects caller-supplied semantic identities before provider or repository access', async () => {
    for (const forbidden of ['sourceIdentity', 'artifactIdentity', 'serverVerifiedAlignment', 'verifierVersion']) {
      const current = syntheticCoordinator();
      await expect(current.coordinator.study({ ...syntheticRequest(), [forbidden]: 'forged' }))
        .rejects.toThrow('unexpected or missing field');
      expect(current.provider.calls).toBe(0);
      expect(current.repository.queryCount).toBe(0);
    }
  });

  it('binds continuation to target, position, selected token, artifact, and a real repository boundary', async () => {
    const values = Array.from({ length: 10 }, (_, index) => syntheticCandidate(index + 1));
    const first = (await syntheticCoordinator(values).coordinator.study(syntheticRequest())).output;
    if (!('resultWindow' in first.semanticEvidence) || !first.semanticEvidence.resultWindow.continuation) {
      throw new Error('synthetic first page must continue');
    }
    const cursor = first.semanticEvidence.resultWindow.continuation.cursor;
    const second = await syntheticCoordinator(values).coordinator.study(syntheticRequest(cursor));
    if (!('resultWindow' in second.output.semanticEvidence)) throw new Error('expected repository evidence');
    expect(second.output.semanticEvidence.resultWindow).toMatchObject({ priorCount: 8, returnedCount: 2, hasMore: false });

    const changedTarget = syntheticContext();
    changedTarget.v1Result.target = 'OTHER';
    await expect(syntheticCoordinator(values, changedTarget).coordinator.study({
      reference: 'Synthetic 1:1', target: 'OTHER', position: 1, detail: 'summary', cursor,
    })).rejects.toThrow('full selected-token request context');

    const changedPosition = syntheticContext();
    changedPosition.v1Result.selectedToken!.position = 2;
    await expect(syntheticCoordinator(values, changedPosition).coordinator.study({
      reference: 'Synthetic 1:1', target: 'H1', position: 2, detail: 'summary', cursor,
    })).rejects.toThrow('full selected-token request context');
  });

  it('rejects malformed, forged, stale, nonboundary, and false-terminal wrapped repository positions', async () => {
    const values = Array.from({ length: 10 }, (_, index) => syntheticCandidate(index + 1));
    const repositoryCursors = {
      forged: createUbsSemanticEvidenceBundleCursor({ artifactIdentity: SYNTHETIC_ARTIFACT, sourceIdentity: SYNTHETIC_H0001, normalizedReference: 'Synthetic 1:1' }, values[1]!, 99),
      nonboundary: createUbsSemanticEvidenceBundleCursor({ artifactIdentity: SYNTHETIC_ARTIFACT, sourceIdentity: SYNTHETIC_H0001, normalizedReference: 'Synthetic 1:1' }, values[1]!, 1),
      falseTerminal: createUbsSemanticEvidenceBundleCursor({ artifactIdentity: SYNTHETIC_ARTIFACT, sourceIdentity: SYNTHETIC_H0001, normalizedReference: 'Synthetic 1:1' }, values[1]!, 10),
    };
    const cursors = [
      ['malformed', 'olsv2c1_7b7d'],
      ['forged', createOriginalLanguageStudyV2DraftCursor(repositoryCursors.forged, syntheticCursorBinding())],
      ['nonboundary', createOriginalLanguageStudyV2DraftCursor(repositoryCursors.nonboundary, syntheticCursorBinding())],
      ['false-terminal', createOriginalLanguageStudyV2DraftCursor(repositoryCursors.falseTerminal, syntheticCursorBinding())],
    ] as const;
    for (const [name, cursor] of cursors) {
      const current = syntheticCoordinator(values);
      await expect(current.coordinator.study(syntheticRequest(cursor)), name)
        .rejects.toThrow(/cursor|genuine current continuation boundary/i);
      expect(current.repository.queryCount, name).toBe(name === 'malformed' ? 0 : 1);
    }

    const staleContext = syntheticContext();
    staleContext.semanticArtifactIdentity = 'b'.repeat(64);
    await expect(syntheticCoordinator(values, staleContext).coordinator.study(syntheticRequest(cursors[1][1])))
      .rejects.toThrow(/full selected-token request context|artifact/i);
  });

  it('requires exact server alignment while preserving candidate-not-resolution language', async () => {
    const presentation = await syntheticCoordinator([syntheticCandidate(1)], syntheticContext('Hebrew', true))
      .coordinator.study(syntheticRequest(undefined, 'detailed'));
    expect(presentation.output.semanticEvidence).toMatchObject({
      status: 'reference_aligned_source_candidate',
      alignmentEvidence: { evidenceId: 'synthetic-reference-01' },
    });
    expect(presentation.output.semanticEvidence.plainLanguage).toContain('not an adjudicated contextual meaning');

    const bad = syntheticContext('Hebrew', true);
    bad.v1Result = syntheticHebrewV1Result();
    bad.serverVerifiedAlignment!.senseId = 'synthetic-sense-02';
    await expect(syntheticCoordinator([syntheticCandidate(1)], bad).coordinator.study(syntheticRequest()))
      .rejects.toThrow('does not match one complete exact aggregate candidate');
  });
});
