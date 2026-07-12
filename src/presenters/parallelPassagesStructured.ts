import type { ParallelPassageResearchResult } from '../kernel/types.js';
import {
  LEGACY_PARALLEL_PROVENANCE_ID,
  OPENBIBLE_PROVENANCE_ID,
} from '../kernel/parallelPassageProvenance.js';
import type { ParallelPassagesOutputV1 } from '../mcp/schemas/parallelPassages.js';

/** Present separated research sources without collapsing groups into inferred edges. */
export function presentParallelPassagesStructured(result: ParallelPassageResearchResult): ParallelPassagesOutputV1 {
  return {
    schemaVersion: '1',
    kind: 'parallel_passages',
    requestedReference: result.requestedReference,
    corpora: [...result.corpora],
    sourceAttestedGroups: result.sourceAttestedGroups.map(group => ({
      ...group,
      members: group.members.map(member => ({
        ...member,
        segments: member.segments.map(segment => ({ ...segment })),
      })),
      provenanceIds: [...group.provenanceIds],
    })),
    legacyParallels: result.legacyParallels.map(parallel => ({
      ...parallel,
      provenanceIds: [LEGACY_PARALLEL_PROVENANCE_ID],
    })),
    openBibleCrossReferences: result.openBibleCrossReferences.map(reference => ({
      ...reference,
      provenanceIds: [OPENBIBLE_PROVENANCE_ID],
    })),
    provenance: result.provenance.map(record => ({
      ...record,
      ...(record.license ? { license: { ...record.license } } : {}),
    })),
    ...(result.warnings?.length ? { warnings: [...result.warnings] } : {}),
  };
}
