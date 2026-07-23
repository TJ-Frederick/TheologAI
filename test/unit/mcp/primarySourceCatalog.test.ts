import { describe, expect, it } from 'vitest';
import { buildPrimarySourceCatalog } from '../../../src/mcp/primarySourceCatalog.js';

describe('primary-source catalog', () => {
  it('adds reviewed source-pack provenance without exposing source artifact locators', () => {
    const catalog = buildPrimarySourceCatalog([{
      id: 'calvin-institutes-beveridge-1845', title: 'Institutes', type: 'historical_work', date: null, topics: [],
      catalog: {
        lookupAliases: ['Institutes'], composition: { label: 'n.d.' }, creators: [{ name: 'John Calvin', role: 'author' }],
        metadataStatus: 'reviewed', metadataProvenanceIds: ['hist-meta-source-pack-theologai-core-eight'],
      },
      editionProvenance: {
        foundation: 'edition-provenance-foundation.v1', sourcePackId: 'theologai-core-eight',
        editionId: 'calvin-institutes-beveridge-1845', language: 'en', publication: '1845', version: 'beveridge-1845',
        sourceArtifacts: [{ artifactId: 'scan', role: 'authority', locator: 'https://example.invalid/scan.pdf', sha256: 'a'.repeat(64), bytes: 1, acquiredAt: '2026-07-23T00:00:00.000Z' }],
        normalizedTextRights: { status: 'no_known_conflict', scope: 'normalized_public_domain_text_only', basis: 'Reviewed.', reviewedAt: '2026-07-23' },
        provenance: { status: 'verified', uncertainty: null, reviewedAt: '2026-07-23' },
      },
    }]);

    expect(catalog.policies).toMatchObject({
      editionReadinessScope: 'legacy_documents_only',
      editionProvenance: 'mixed_legacy_and_exact_source_packs',
    });
    expect(catalog.works[0]).toMatchObject({
      editionReadiness: { editionIdentity: 'established', provenance: 'verified' },
      editionProvenance: {
        sourcePackId: 'theologai-core-eight', editionId: 'calvin-institutes-beveridge-1845',
        normalizedTextRights: { status: 'no_known_conflict' },
      },
    });
    expect(JSON.stringify(catalog)).not.toContain('https://example.invalid/scan.pdf');
  });
});
