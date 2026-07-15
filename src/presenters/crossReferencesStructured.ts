import {
  OPENBIBLE_CROSS_REFERENCE_PROVENANCE,
  OPENBIBLE_PROVENANCE_ID,
} from '../kernel/openBibleCrossReferenceProvenance.js';
import type { CrossReferenceLookupResult } from '../services/bible/CrossReferenceService.js';
import type { CrossReferencesOutputV1 } from '../mcp/schemas/crossReferences.js';

export interface EffectiveCrossReferenceQuery {
  maxResults: number;
  minVotes: number;
}

/** Present raw source ranking and its intentionally limited discovery semantics. */
export function presentCrossReferencesStructured(
  requestedReference: string,
  query: EffectiveCrossReferenceQuery,
  result: CrossReferenceLookupResult,
): CrossReferencesOutputV1 {
  return {
    schemaVersion: '1',
    kind: 'bible_cross_references',
    requestedReference,
    resolvedReference: result.resolvedReference,
    query: { ...query },
    ranking: {
      method: 'openbible_votes_descending',
      tieBreak: 'source_reference_ascending',
    },
    semantics: {
      evidenceUse: 'discovery_lead',
      relationshipClassification: 'unspecified',
      directionality: 'unspecified',
    },
    references: result.references.map((reference, index) => ({
      position: index + 1,
      reference: reference.reference,
      votes: reference.votes,
      provenanceIds: [OPENBIBLE_PROVENANCE_ID],
    })),
    resultWindow: {
      returnedCount: result.references.length,
      qualifyingTotal: result.total,
      hasMore: result.hasMore,
    },
    provenance: [{
      ...OPENBIBLE_CROSS_REFERENCE_PROVENANCE,
      license: { ...OPENBIBLE_CROSS_REFERENCE_PROVENANCE.license },
    }],
  };
}
