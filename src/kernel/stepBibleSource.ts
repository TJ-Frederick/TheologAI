import type { ProvenanceKind, ProvenanceRecord } from './provenance.js';

/** Runtime-safe mirror of the exact STEPBible pin in data/biblical-languages/SOURCE.json. */
export const STEPBIBLE_SOURCE = Object.freeze({
  commitSha: '0f60797c170f11a1f8dc75c5f7617973e2e66b0d',
  commitUrl: 'https://github.com/STEPBible/STEPBible-Data/tree/0f60797c170f11a1f8dc75c5f7617973e2e66b0d',
  license: Object.freeze({
    label: 'CC BY 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
  }),
  attribution: 'Tyndale House, Cambridge / STEP Bible (www.stepbible.org)',
});

export function createStepBibleProvenance(options: {
  id: string;
  kind: ProvenanceKind;
  label: string;
  rightsNotice?: string;
  locator?: string;
  /** Override only when the record describes a derived artifact with its own identity. */
  version?: string;
}): ProvenanceRecord {
  return {
    id: options.id,
    kind: options.kind,
    label: options.label,
    url: STEPBIBLE_SOURCE.commitUrl,
    license: { ...STEPBIBLE_SOURCE.license },
    ...(options.rightsNotice ? { rightsNotice: options.rightsNotice } : {}),
    attribution: STEPBIBLE_SOURCE.attribution,
    version: options.version ?? STEPBIBLE_SOURCE.commitSha,
    ...(options.locator ? { locator: options.locator } : {}),
    status: 'verified_source',
  };
}
