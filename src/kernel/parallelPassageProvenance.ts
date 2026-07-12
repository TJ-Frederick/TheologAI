import type { ParallelSourceProvenance } from './sourceAttestedParallels.js';
import type { ProvenanceRecord } from './provenance.js';

export const UBS_PARALLEL_PROVENANCE_ID = 'ubs-source-attested-parallels';
export const LEGACY_PARALLEL_PROVENANCE_ID = 'theologai-legacy-parallels';
export const OPENBIBLE_PROVENANCE_ID = 'openbible-cross-references';

export function ubsParallelProvenanceRecord(source: ParallelSourceProvenance): ProvenanceRecord {
  return {
    id: UBS_PARALLEL_PROVENANCE_ID,
    kind: 'curated_dataset',
    label: source.title,
    url: source.sourceUrl,
    license: { label: source.license, url: source.licenseUrl },
    rightsNotice: source.copyright,
    attribution: source.publisher,
    version: source.sourceCommit,
    locator: `${source.sourcePath} @ blob ${source.sourceBlob}`,
    status: 'verified_source',
    note: source.modificationNote,
  };
}

export const LEGACY_PARALLEL_PROVENANCE: Readonly<ProvenanceRecord> = Object.freeze({
  id: LEGACY_PARALLEL_PROVENANCE_ID,
  kind: 'curated_dataset',
  label: 'TheologAI legacy curated parallel passages',
  status: 'provider_attributed',
  note: 'Small non-exhaustive repository-curated relationship dataset retained for explicit compatibility queries.',
});

export const OPENBIBLE_CROSS_REFERENCE_PROVENANCE: Readonly<ProvenanceRecord> = Object.freeze({
  id: OPENBIBLE_PROVENANCE_ID,
  kind: 'cross_reference_dataset',
  label: 'OpenBible.info cross references',
  url: 'https://www.openbible.info/labs/cross-references/',
  license: { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  attribution: 'OpenBible.info',
  status: 'verified_source',
});
