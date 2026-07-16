import type { ParallelPassageResearchResult } from '../kernel/types.js';
import {
  OPENBIBLE_PROVENANCE_ID,
} from '../kernel/parallelPassageProvenance.js';
import type { ParallelPassagesOutputV3 } from '../mcp/schemas/parallelPassages.js';

/** Present separated research sources without collapsing groups into inferred edges. */
export function presentParallelPassagesStructured(result: ParallelPassageResearchResult): ParallelPassagesOutputV3 {
  return {
    schemaVersion: '3',
    kind: 'parallel_passages',
    requestedReference: result.requestedReference,
    corpora: [...result.corpora],
    sourceAttestedGroups: result.sourceAttestedGroups.map(group => ({
      ...group,
      members: group.members.map(member => ({
        ...member,
        segments: member.segments.map(segment => ({ ...segment })),
        ...(member.excerpts ? { excerpts: member.excerpts.map(excerpt => ({
          ...excerpt, provenanceIds: [...excerpt.provenanceIds],
        })) } : {}),
        provenanceIds: [...member.provenanceIds],
      })),
      provenanceIds: [...group.provenanceIds],
    })),
    sourceAttestedResultWindow: { ...result.sourceAttestedResultWindow },
    legacyParallels: result.legacyParallels.map(parallel => ({
      ...parallel,
      provenanceIds: [...(parallel.provenanceIds ?? [])],
    })),
    openBibleCrossReferences: result.openBibleCrossReferences.map(reference => ({
      ...reference,
      provenanceIds: [OPENBIBLE_PROVENANCE_ID],
    })),
    provenance: result.provenance.map(record => ({
      ...record,
      ...(record.license ? { license: { ...record.license } } : {}),
    })),
    textEnrichment: {
      ...result.textEnrichment,
      budget: { ...result.textEnrichment.budget },
    },
    ...(result.warnings?.length ? { warnings: [...result.warnings] } : {}),
  };
}
