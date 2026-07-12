import type {
  BibleLookupMultipleResult,
  BibleResult,
  Citation,
} from '../kernel/types.js';
import {
  provenanceFromCitation,
  type ProvenanceRecord,
} from '../kernel/provenance.js';
import type { BibleLookupOutputV1 } from '../mcp/schemas/bibleLookup.js';

type BibleLookupData = BibleLookupMultipleResult | BibleResult;

/** Present the Bible service result as the versioned machine-readable view. */
export function presentBibleLookupStructured(
  data: BibleLookupData,
  requestedReference: string,
  requestedTranslations: string[],
): BibleLookupOutputV1 {
  const multiple: BibleLookupMultipleResult = 'results' in data
    ? data
    : { reference: data.reference, results: [data], failures: [] };
  const provenance: ProvenanceRecord[] = [];
  const provenanceByKey = new Map<string, string>();

  const passages = multiple.results.map(result => ({
    reference: result.reference,
    translation: result.translation,
    text: result.text,
    ...(result.footnotes?.length ? {
      footnotes: result.footnotes.map(footnote => ({
        caller: footnote.caller,
        text: footnote.text,
        chapter: footnote.reference.chapter,
        verse: footnote.reference.verse,
      })),
    } : {}),
    provenanceIds: [getProvenanceId(result, provenance, provenanceByKey)],
  }));

  return {
    schemaVersion: '1',
    kind: 'bible_lookup',
    requestedReference,
    requestedTranslations: [...requestedTranslations],
    passages,
    failures: multiple.failures.map(failure => ({ ...failure })),
    provenance,
  };
}

function getProvenanceId(
  result: BibleResult,
  provenance: ProvenanceRecord[],
  provenanceByKey: Map<string, string>,
): string {
  const candidate = provenanceFromCitation(result.citation, {
    id: `src-${provenance.length + 1}`,
    kind: 'translation',
    status: 'provider_attributed',
    license: recognizedLicense(result.citation),
    locator: result.reference,
  });
  const key = JSON.stringify({ ...candidate, id: undefined });
  const existing = provenanceByKey.get(key);
  if (existing) return existing;

  provenance.push(candidate);
  provenanceByKey.set(key, candidate.id);
  return candidate.id;
}

function recognizedLicense(citation: Citation): { label: string } | undefined {
  return /^public domain(?:\s+\([^)]*\))?$/i.test(citation.copyright?.trim() ?? '')
    ? { label: 'Public Domain' }
    : undefined;
}
