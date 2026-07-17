/**
 * Invented test-only package. It is not a historical work, edition, source,
 * license assertion, corpus candidate, or redistribution decision.
 */
export function inventedEditionPackageFixture(): Record<string, unknown> {
  const sha256 = 'a'.repeat(64);
  return {
    schemaVersion: 'edition-provenance-foundation.v1',
    sectionKeyPolicy: 'frozen_reviewed_v1',
    contentFormat: 'plain_text',
    work: {
      workId: 'invented-clockwork-treatise',
      title: 'The Invented Clockwork Treatise',
      creatorMetadataStatus: 'reviewed',
      creators: [
        { name: 'Synthetic Beta', role: 'compiler' },
        { name: 'Synthetic Alpha', role: 'author' },
      ],
    },
    edition: {
      editionId: 'invented-clockwork-treatise-synthetic-edition',
      workId: 'invented-clockwork-treatise',
      language: 'en',
      contributorGroups: {
        translation: {
          metadataStatus: 'reviewed',
          contributors: [
            { name: 'Synthetic Translator B', role: 'translator' },
            { name: 'Synthetic Translator A', role: 'translator' },
          ],
        },
        editing: {
          metadataStatus: 'reviewed',
          contributors: [{ name: 'Synthetic Editor', role: 'editor' }],
        },
        revision: { metadataStatus: 'none', contributors: [] },
      },
      publication: 'Example Invalid Press, Synthetic City, 1901',
      version: 'synthetic-fixture-v1',
      source: {
        locator: 'https://example.invalid/fixtures/invented-clockwork-treatise.txt',
        pin: { kind: 'sha256', value: sha256 },
        sha256,
        bytes: 137,
        acquiredAt: '2026-01-02T03:04:05Z',
      },
      underlyingWorkRights: {
        status: 'public_domain',
        basis: 'Invented fixture assertion used only to exercise validation.',
        jurisdiction: 'Synthetic test jurisdiction',
        evidenceInstrument: {
          instrumentId: 'synthetic-work-public-domain-statement',
          kind: 'public_domain_statement',
          label: 'Synthetic Public Domain Statement',
          url: 'https://example.invalid/rights/invented-work-public-domain',
        },
        reviewedAt: '2026-01-02',
      },
      exactArtifactRights: {
        status: 'open_license',
        basis: 'Invented fixture assertion; not evidence about any real artifact.',
        jurisdiction: 'Synthetic test jurisdiction',
        territorialScope: 'Worldwide synthetic test territory',
        rightsInstrument: {
          instrumentId: 'synthetic-fixture-license',
          kind: 'license',
          label: 'Synthetic Fixture License 1.0',
          url: 'https://example.invalid/licenses/synthetic-fixture-1.0',
        },
        attributionNotice: 'Synthetic attribution for an invented test fixture.',
        attributionRequirement: 'license_required',
        shareAlike: 'required',
        modifications: 'permitted',
        modificationTerms: 'Synthetic modifications must retain the synthetic fixture notice.',
        redistributionApproved: true,
        redistributionApprovedAsOf: '2026-07-17',
        reviewedAt: '2026-01-02',
      },
      provenance: {
        status: 'verified_with_uncertainty',
        uncertainty: 'Synthetic uncertainty used to verify explicit disclosure.',
        reviewedAt: '2026-01-02',
      },
    },
    sections: [
      {
        sourceOrdinal: 1,
        sectionKey: 'z-first-motion',
        displayLabel: 'Synthetic I',
        heading: 'First Motion',
        content: 'A purely invented Cafe\u0301 section.',
      },
      {
        sourceOrdinal: 2,
        sectionKey: 'a-second-motion',
        displayLabel: 'Synthetic II',
        heading: 'Second Motion',
        content: 'A purely invented second section.',
      },
    ],
  };
}
