import { describe, expect, it } from 'vitest';
import { classicTextsOutputSchema } from '../../../src/mcp/schemas/classicTexts.js';
import { validatorFor } from '../../../src/mcp/validation.js';
import {
  presentClassicTextCatalog,
  presentClassicTextSectionedLanding,
  validateClassicTextsOutputSemantics,
} from '../../../src/presenters/classicTextsStructured.js';

describe('classic-text structured presentation', () => {
  it('uses the reviewed source-pack evidence policy for a reviewed source-pack landing', () => {
    const presented = presentClassicTextSectionedLanding({
      id: 'calvin-institutes-beveridge-1845', title: 'Institutes', type: 'historical_work', date: null, topics: [],
      editionProvenance: {
        foundation: 'edition-provenance-foundation.v1', sourcePackId: 'theologai-core-eight',
        editionId: 'calvin-institutes-beveridge-1845', language: 'en', publication: '1845', version: 'beveridge-1845',
        sourceArtifacts: [{ artifactId: 'scan', role: 'authority', locator: 'https://example.invalid/scan.pdf', sha256: 'a'.repeat(64), bytes: 1, acquiredAt: '2026-07-23T00:00:00.000Z' }],
        normalizedTextRights: { status: 'no_known_conflict', scope: 'normalized_public_domain_text_only', basis: 'Reviewed.', reviewedAt: '2026-07-23' },
        provenance: { status: 'verified', uncertainty: null, reviewedAt: '2026-07-23' },
      },
    }, {
      documentId: 'calvin-institutes-beveridge-1845', workId: 'calvin-institutes-beveridge-1845', editionId: 'calvin-institutes-beveridge-1845',
      immutableCorpusIdentity: 'a'.repeat(64), sectionPackageIdentity: 'a'.repeat(64), deliveryMode: 'sectioned_only', sectionCount: 84,
      landingMaxBytes: 16_384, browsePageSize: 32, cursorVersion: 1, provenance: {}, rights: {},
    });

    expect(presented.evidencePolicy).toMatchObject({
      editionProvenance: 'reviewed_source_packs',
      rightsStatus: 'no_known_conflict_normalized_text_only',
    });
    const validation = validatorFor(classicTextsOutputSchema)(presented);
    expect(validation.valid, validation.errorMessage).toBe(true);
    expect(validateClassicTextsOutputSemantics(presented)).toBe(true);
  });

  it('distinguishes legacy-only, reviewed-only, and mixed result inventories', () => {
    const legacy = { id: 'legacy', title: 'Legacy', type: 'creed', date: null, topics: [] };
    const reviewed = {
      id: 'reviewed', title: 'Reviewed', type: 'historical_work', date: null, topics: [],
      editionProvenance: {
        foundation: 'edition-provenance-foundation.v1' as const, sourcePackId: 'theologai-core-eight', editionId: 'reviewed',
        language: 'en', publication: '1900', version: 'v1',
        sourceArtifacts: [{ artifactId: 'scan', role: 'authority' as const, locator: 'https://example.invalid/scan.pdf', sha256: 'a'.repeat(64), bytes: 1, acquiredAt: '2026-07-23T00:00:00.000Z' }],
        normalizedTextRights: { status: 'no_known_conflict' as const, scope: 'normalized_public_domain_text_only' as const, basis: 'Reviewed.', reviewedAt: '2026-07-23' },
        provenance: { status: 'verified' as const, uncertainty: null, reviewedAt: '2026-07-23' },
      },
    };
    const complete = {
      documentId: 'legacy', workId: null, editionId: null, immutableCorpusIdentity: 'a'.repeat(64), sectionPackageIdentity: null,
      deliveryMode: 'complete_document' as const, sectionCount: 1, landingMaxBytes: 0 as const, browsePageSize: 0 as const, cursorVersion: 0 as const,
      provenance: {}, rights: {},
    };
    const sectioned = {
      documentId: 'reviewed', workId: 'reviewed', editionId: 'reviewed', immutableCorpusIdentity: 'b'.repeat(64), sectionPackageIdentity: 'b'.repeat(64),
      deliveryMode: 'sectioned_only' as const, sectionCount: 1, landingMaxBytes: 16_384 as const, browsePageSize: 32 as const, cursorVersion: 1 as const,
      provenance: {}, rights: {},
    };

    expect(presentClassicTextCatalog([{ document: legacy, profile: complete }]).evidencePolicy.editionProvenance).toBe('incomplete');
    expect(presentClassicTextCatalog([{ document: reviewed, profile: sectioned }]).evidencePolicy.editionProvenance).toBe('reviewed_source_packs');
    expect(presentClassicTextCatalog([{ document: legacy, profile: complete }, { document: reviewed, profile: sectioned }]).evidencePolicy.editionProvenance)
      .toBe('mixed_legacy_and_reviewed_source_packs');
  });
});
