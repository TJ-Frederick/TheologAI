import { describe, expect, it } from 'vitest';
import { createUbsSemanticEvidenceBundleCursor } from '../../../../src/kernel/ubsSemanticEvidenceBundle.js';
import { createOriginalLanguageStudyV2Cursor } from '../../../../src/kernel/originalLanguageStudyV2Contract.js';
import {
  SYNTHETIC_ARTIFACT,
  SYNTHETIC_H0001,
  productionCandidate,
  productionContext,
  productionCoordinator,
  productionCursorBinding,
  productionRequest,
} from '../../../helpers/originalLanguageStudyV2ProductionFixtures.js';

describe('production original_language_study v2 coordinator', () => {
  it('canonicalizes an accepted alias for output and queries the canonical display storage key rather than a provider book code', async () => {
    const current = productionCoordinator([productionCandidate(1)]);
    const presentation = await current.coordinator.study(productionRequest());

    expect(presentation.output.request.reference).toBe('Gen 1:1');
    expect(presentation.output.study).toMatchObject({
      request: { reference: 'Genesis 1:1' },
      context: { reference: 'Genesis 1:1', language: 'Hebrew' },
    });
    expect(current.repository.received).toEqual([expect.objectContaining({ normalizedReference: 'Genesis 1:1' })]);
    expect(current.repository.received[0]?.normalizedReference).not.toBe('GEN 1:1');
  });

  it('accepts semantically equal aliases, but binds a continuation to the raw request spelling and detail level', async () => {
    const values = Array.from({ length: 10 }, (_, index) => productionCandidate(index + 1));
    const first = await productionCoordinator(values).coordinator.study(productionRequest());
    if (!('resultWindow' in first.output.semanticEvidence) || !first.output.semanticEvidence.resultWindow.continuation) {
      throw new Error('expected a first-page continuation');
    }
    const cursor = first.output.semanticEvidence.resultWindow.continuation.cursor;

    const sameAlias = await productionCoordinator(values).coordinator.study(productionRequest(undefined, 'summary', 'Genesis 1:1'));
    expect(sameAlias.output.request.reference).toBe('Genesis 1:1');

    await expect(productionCoordinator(values).coordinator.study(
      productionRequest(cursor, 'summary', 'Genesis 1:1'),
    )).rejects.toThrow('full selected-token request context');
    const changedDetail = productionCoordinator(values);
    await expect(changedDetail.coordinator.study(productionRequest(cursor, 'detailed')))
      .rejects.toThrow('full selected-token request context');
    expect(changedDetail.repository.queryCount).toBe(0);
    const second = await productionCoordinator(values).coordinator.study(productionRequest(cursor));
    if (!('resultWindow' in second.output.semanticEvidence)) throw new Error('expected semantic continuation');
    expect(second.output.semanticEvidence.resultWindow).toMatchObject({ priorCount: 8, returnedCount: 2, hasMore: false });
  });

  it('rejects an authoritative result that is semantically different or noncanonical before querying evidence', async () => {
    const different = productionContext();
    different.v1Result.reference = 'Genesis 1:2';
    const differentCurrent = productionCoordinator([productionCandidate(1)], different);
    await expect(differentCurrent.coordinator.study(productionRequest())).rejects.toThrow('semantically equivalent');
    expect(differentCurrent.repository.queryCount).toBe(0);

    const noncanonical = productionContext();
    noncanonical.v1Result.reference = 'Gen 1:1';
    const noncanonicalCurrent = productionCoordinator([productionCandidate(1)], noncanonical);
    await expect(noncanonicalCurrent.coordinator.study(productionRequest())).rejects.toThrow('canonical display reference');
    expect(noncanonicalCurrent.repository.queryCount).toBe(0);
  });

  it('keeps the complete existing Greek study and does not query Hebrew semantic evidence', async () => {
    const current = productionCoordinator([productionCandidate(1)], productionContext('Greek'));
    const presentation = await current.coordinator.study({
      reference: 'Jn 1:1', target: 'H1', position: 1, detail: 'summary',
    });
    expect(presentation.output.study).toMatchObject({
      context: { reference: 'John 1:1', language: 'Greek', selectedToken: { text: 'PRODUCTION GREEK TOKEN' } },
      lexiconEvidence: [{ definition: 'PRODUCTION EXISTING GREEK DEFINITION' }],
    });
    expect(presentation.output.semanticEvidence).toMatchObject({ language: 'Greek', status: 'not_applicable' });
    expect(current.repository.queryCount).toBe(0);
  });

  it('uses detail only for candidate volume and preserves honest byte accounting', async () => {
    // The structured packet must omit details deterministically before the
    // added text suffix reaches its separate 16 KiB cap.
    const values = [productionCandidate(1, 14_000), productionCandidate(2, 14_000)];
    const summary = (await productionCoordinator(values).coordinator.study(productionRequest(undefined, 'summary'))).output;
    const detailed = (await productionCoordinator(values).coordinator.study(productionRequest(undefined, 'detailed'))).output;
    expect(summary.semanticEvidence.status).toBe(detailed.semanticEvidence.status);
    if (!('candidates' in summary.semanticEvidence) || !('candidates' in detailed.semanticEvidence)) {
      throw new Error('expected candidate evidence');
    }
    expect(summary.semanticEvidence.candidates.map(candidate => candidate.senseId))
      .toEqual(detailed.semanticEvidence.candidates.map(candidate => candidate.senseId));
    expect(detailed.semanticEvidence.candidates.map(candidate => candidate.detailStatus))
      .toContain('omitted_response_byte_budget');
    expect(detailed.responseWindow.used).toBeLessThanOrEqual(32 * 1024);
  });

  it('rejects caller-supplied source and proof identities before provider or repository access', async () => {
    for (const forbidden of ['sourceIdentity', 'artifactIdentity', 'serverVerifiedAlignment', 'verifierVersion']) {
      const current = productionCoordinator();
      await expect(current.coordinator.study({ ...productionRequest(), [forbidden]: 'forged' }))
        .rejects.toThrow('unexpected or missing field');
      expect(current.provider.calls).toBe(0);
      expect(current.repository.queryCount).toBe(0);
    }
  });

  it('rejects malformed, forged, stale, nonboundary, and false-terminal repository continuations', async () => {
    const values = Array.from({ length: 10 }, (_, index) => productionCandidate(index + 1));
    const query = {
      artifactIdentity: SYNTHETIC_ARTIFACT,
      sourceIdentity: SYNTHETIC_H0001,
      normalizedReference: 'Genesis 1:1',
    };
    const wrapped = (cursor: string) => createOriginalLanguageStudyV2Cursor(cursor, productionCursorBinding());
    const cursors = [
      ['malformed', 'olsv2c1_7b7d'],
      ['forged', wrapped(createUbsSemanticEvidenceBundleCursor(query, values[1]!, 99))],
      ['nonboundary', wrapped(createUbsSemanticEvidenceBundleCursor(query, values[1]!, 1))],
      ['false-terminal', wrapped(createUbsSemanticEvidenceBundleCursor(query, values[1]!, 10))],
    ] as const;
    for (const [name, cursor] of cursors) {
      const current = productionCoordinator(values);
      await expect(current.coordinator.study(productionRequest(cursor)), name)
        .rejects.toThrow(/cursor|genuine current continuation boundary/i);
      expect(current.repository.queryCount, name).toBe(name === 'malformed' ? 0 : 1);
    }
  });

  it('requires the entire current server proof before exposing a reference-aligned source candidate', async () => {
    const aligned = await productionCoordinator([productionCandidate(1)], productionContext('Hebrew', true))
      .coordinator.study(productionRequest(undefined, 'detailed'));
    expect(aligned.output.semanticEvidence).toMatchObject({
      status: 'reference_aligned_source_candidate',
      alignmentEvidence: { normalizedReference: 'Genesis 1:1', evidenceId: 'production-reference-01' },
    });
    expect(aligned.output.semanticEvidence.plainLanguage).toContain('not an adjudicated contextual meaning');

    const mismatched = productionContext('Hebrew', true);
    mismatched.serverVerifiedAlignment!.morphologyTokenCoordinates.normalizedReference = 'Genesis 1:2';
    await expect(productionCoordinator([productionCandidate(1)], mismatched).coordinator.study(productionRequest()))
      .rejects.toThrow('does not match one complete exact aggregate candidate');
  });
});
