import type { ProvenanceRecord } from './provenance.js';

export const OPENBIBLE_PROVENANCE_ID = 'openbible-cross-references';

/** Provenance for the checksum-pinned OpenBible.info snapshot materialized locally. */
export const OPENBIBLE_CROSS_REFERENCE_PROVENANCE = Object.freeze({
  id: OPENBIBLE_PROVENANCE_ID,
  kind: 'cross_reference_dataset',
  label: 'OpenBible.info cross references',
  url: 'https://www.openbible.info/labs/cross-references/',
  license: { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  attribution: 'OpenBible.info',
  version: '2025-10-13',
  locator: 'data/cross-references/cross_references.txt @ sha256:bb5a4f5cfb7f0faa07b171ee9b361285d6179bee705de16ead0690da16568191',
  status: 'verified_source',
} as const satisfies ProvenanceRecord);
