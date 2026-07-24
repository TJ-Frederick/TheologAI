import { describe, expect, it, vi } from 'vitest';
import { createOriginalLanguageStudyHandler } from '../../../../src/tools/v2/originalLanguageStudy.js';
import { validatorFor } from '../../../../src/mcp/validation.js';
import {
  productionCandidate,
  productionContext,
  productionCoordinator,
  productionRequest,
} from '../../../helpers/originalLanguageStudyV2ProductionFixtures.js';

describe('original_language_study v2 handler', () => {
  it('hard-cuts the existing tool to the closed v2 contract with nested complete v1 study and opaque continuation input', async () => {
    const current = productionCoordinator(Array.from({ length: 10 }, (_, index) => productionCandidate(index + 1)));
    const handler = createOriginalLanguageStudyHandler(current.coordinator);

    expect(handler.name).toBe('original_language_study');
    expect(handler.inputSchema).toMatchObject({
      required: ['reference', 'target'], additionalProperties: false,
      properties: { detail: { enum: ['summary', 'detailed'] }, cursor: { pattern: '^olsv2c1_(?:[0-9a-f]{2})+$' } },
    });
    const result = await handler.handler(productionRequest(undefined, 'detailed'));

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      schemaVersion: '2', kind: 'original_language_study', detail: 'detailed',
      study: { schemaVersion: '1', kind: 'original_language_study', context: { language: 'Hebrew' } },
      semanticEvidence: { status: 'lexical_candidates' },
    });
    expect(result.content[0]?.text).toMatch(/^## Contextual evidence \(for a plain-English explanation\)/);
    expect(result.content[0]?.text).toContain('### Added Hebrew semantic layer');
    expect(current.repository.queryCount).toBe(1);
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
  });

  it('keeps Greek, ineligible Hebrew, and ambiguous Hebrew semantic reads at zero while preserving their complete v1 study', async () => {
    const greek = productionCoordinator([productionCandidate(1)], productionContext('Greek'));
    const greekResult = await createOriginalLanguageStudyHandler(greek.coordinator)
      .handler({ reference: 'Jn 1:1', target: 'H1', position: 1 });
    expect(greekResult.structuredContent).toMatchObject({
      schemaVersion: '2', study: { schemaVersion: '1', context: { language: 'Greek' } },
      semanticEvidence: { language: 'Greek', status: 'not_applicable' },
    });
    expect(greek.repository.queryCount).toBe(0);

    const ineligibleContext = productionContext();
    ineligibleContext.v1Result.identity = undefined;
    ineligibleContext.v1Result.selectedToken!.strongsNumber = null;
    const ineligible = productionCoordinator([productionCandidate(1)], ineligibleContext);
    const ineligibleResult = await createOriginalLanguageStudyHandler(ineligible.coordinator)
      .handler(productionRequest());
    expect(ineligibleResult.structuredContent).toMatchObject({
      schemaVersion: '2', study: { schemaVersion: '1', context: { language: 'Hebrew' } },
      semanticEvidence: { language: 'Hebrew', status: 'unavailable', reason: 'no_usable_hebrew_identity' },
    });
    expect(ineligible.repository.queryCount).toBe(0);

    const ambiguousContext = productionContext();
    const candidate = ambiguousContext.v1Result.selectedToken!;
    ambiguousContext.v1Result = {
      reference: 'Genesis 1:1', language: 'Hebrew', target: 'H1', status: 'needs_disambiguation',
      candidates: [candidate, { ...candidate, position: 2 }], warnings: [],
    };
    const ambiguous = productionCoordinator([productionCandidate(1)], ambiguousContext);
    const ambiguousResult = await createOriginalLanguageStudyHandler(ambiguous.coordinator)
      .handler(productionRequest());
    expect(ambiguousResult.structuredContent).toMatchObject({
      schemaVersion: '2', study: { schemaVersion: '1', status: 'needs_disambiguation' },
      semanticEvidence: { language: 'Hebrew', status: 'unavailable', reason: 'selected_token_required' },
    });
    expect(ambiguous.repository.queryCount).toBe(0);
  });

  it('rejects caller-controlled semantic identities before coordinator access', async () => {
    const coordinator = { study: vi.fn() } as unknown as Parameters<typeof createOriginalLanguageStudyHandler>[0];
    const handler = createOriginalLanguageStudyHandler(coordinator);
    const result = await handler.handler({
      reference: 'Genesis 1:1', target: 'H1', artifactIdentity: 'forged',
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.content[0]?.text).toContain('Unknown argument "artifactIdentity"');
    expect(coordinator.study).not.toHaveBeenCalled();
  });
});
