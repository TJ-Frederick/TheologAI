import type { ParallelSourceProvenance } from './sourceAttestedParallels.js';
import type { ProvenanceRecord } from './provenance.js';

// Compatibility exports for callers that historically imported OpenBible
// provenance through the parallel-passage module.
export {
  OPENBIBLE_CROSS_REFERENCE_PROVENANCE,
  OPENBIBLE_PROVENANCE_ID,
} from './openBibleCrossReferenceProvenance.js';

export const UBS_PARALLEL_PROVENANCE_ID = 'ubs-source-attested-parallels';
export const LEGACY_PARALLEL_PROVENANCE_ID = 'theologai-legacy-parallels';

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
  url: 'https://github.com/TJ-Frederick/TheologAI/blob/db8d323ebca458ae3b8aaed4a747f925b0273770/src/data/parallel-passages.json',
  license: {
    label: 'ISC',
    url: 'https://github.com/TJ-Frederick/TheologAI/blob/db8d323ebca458ae3b8aaed4a747f925b0273770/LICENSE',
  },
  rightsNotice: 'Copyright (c) 2026 TheologAI contributors',
  attribution: 'TheologAI contributors',
  version: 'db8d323ebca458ae3b8aaed4a747f925b0273770',
  locator: 'src/data/parallel-passages.json',
  status: 'verified_source',
  note: 'Small non-exhaustive repository-curated relationship dataset retained for explicit compatibility queries; repository contents are distributed under the root ISC license unless a source-specific notice says otherwise.',
});
