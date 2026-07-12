import type { Citation } from './types.js';

export type ProvenanceKind =
  | 'primary_text'
  | 'translation'
  | 'lexicon'
  | 'morphology_dataset'
  | 'cross_reference_dataset'
  | 'curated_dataset'
  | 'repository'
  | 'delivery_provider';

export type ProvenanceStatus =
  | 'verified_source'
  | 'provider_attributed'
  | 'transcription_source_uncertain';

export interface ProvenanceRecord {
  id: string;
  kind: ProvenanceKind;
  label: string;
  url?: string;
  license?: {
    label: string;
    url?: string;
  };
  rightsNotice?: string;
  attribution?: string;
  version?: string;
  locator?: string;
  status: ProvenanceStatus;
  note?: string;
}

export interface ProvenanceLink {
  provenanceIds: string[];
}

export interface ProvenanceContext {
  id: string;
  kind: ProvenanceKind;
  status?: ProvenanceStatus;
  license?: {
    label: string;
    url?: string;
  };
  locator?: string;
  attribution?: string;
  version?: string;
  note?: string;
}

/** Map the legacy citation shape without inferring rights or source-chain facts. */
export function provenanceFromCitation(
  citation: Citation,
  context: ProvenanceContext,
): ProvenanceRecord {
  const record: ProvenanceRecord = {
    id: context.id,
    kind: context.kind,
    label: citation.source,
    status: context.status ?? 'provider_attributed',
  };

  if (citation.url) record.url = citation.url;
  if (citation.copyright) record.rightsNotice = citation.copyright;
  if (context.license) record.license = { ...context.license };
  if (context.attribution) record.attribution = context.attribution;
  if (context.version) record.version = context.version;
  if (context.locator) record.locator = context.locator;
  if (context.note) record.note = context.note;
  return record;
}
