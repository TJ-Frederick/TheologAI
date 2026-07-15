import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ProvenanceRecord } from '../../kernel/provenance.js';
import {
  OPENBIBLE_CROSS_REFERENCE_PROVENANCE,
  OPENBIBLE_PROVENANCE_ID,
} from '../../kernel/openBibleCrossReferenceProvenance.js';

export interface CrossReferencesOutputV1 {
  [key: string]: unknown;
  schemaVersion: '1';
  kind: 'bible_cross_references';
  requestedReference: string;
  resolvedReference: string;
  query: { maxResults: number; minVotes: number };
  ranking: {
    method: 'openbible_votes_descending';
    tieBreak: 'source_reference_ascending';
  };
  semantics: {
    evidenceUse: 'discovery_lead';
    relationshipClassification: 'unspecified';
    directionality: 'unspecified';
  };
  references: Array<{
    position: number;
    reference: string;
    votes: number;
    provenanceIds: [typeof OPENBIBLE_PROVENANCE_ID];
  }>;
  resultWindow: {
    returnedCount: number;
    qualifyingTotal: number;
    hasMore: boolean;
  };
  provenance: [ProvenanceRecord];
}

export const crossReferencesOutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string', const: '1' },
    kind: { type: 'string', const: 'bible_cross_references' },
    requestedReference: { type: 'string', minLength: 1, maxLength: 100 },
    resolvedReference: { type: 'string', minLength: 1, maxLength: 100 },
    query: {
      type: 'object',
      properties: {
        maxResults: { type: 'integer', minimum: 1, maximum: 100 },
        minVotes: { type: 'integer', minimum: 0, maximum: 1_000_000 },
      },
      required: ['maxResults', 'minVotes'],
      additionalProperties: false,
    },
    ranking: {
      type: 'object',
      properties: {
        method: { type: 'string', const: 'openbible_votes_descending' },
        tieBreak: { type: 'string', const: 'source_reference_ascending' },
      },
      required: ['method', 'tieBreak'],
      additionalProperties: false,
    },
    semantics: {
      type: 'object',
      properties: {
        evidenceUse: { type: 'string', const: 'discovery_lead' },
        relationshipClassification: { type: 'string', const: 'unspecified' },
        directionality: { type: 'string', const: 'unspecified' },
      },
      required: ['evidenceUse', 'relationshipClassification', 'directionality'],
      additionalProperties: false,
    },
    references: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        properties: {
          position: { type: 'integer', minimum: 1, maximum: 100 },
          reference: { type: 'string', minLength: 1, maxLength: 100 },
          votes: { type: 'integer', minimum: 0 },
          provenanceIds: {
            type: 'array', minItems: 1, maxItems: 1, uniqueItems: true,
            items: { type: 'string', const: OPENBIBLE_PROVENANCE_ID },
          },
        },
        required: ['position', 'reference', 'votes', 'provenanceIds'],
        additionalProperties: false,
      },
    },
    resultWindow: {
      type: 'object',
      properties: {
        returnedCount: { type: 'integer', minimum: 0, maximum: 100 },
        qualifyingTotal: { type: 'integer', minimum: 0 },
        hasMore: { type: 'boolean' },
      },
      required: ['returnedCount', 'qualifyingTotal', 'hasMore'],
      additionalProperties: false,
    },
    provenance: {
      type: 'array', minItems: 1, maxItems: 1,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', const: OPENBIBLE_CROSS_REFERENCE_PROVENANCE.id },
          kind: { type: 'string', const: OPENBIBLE_CROSS_REFERENCE_PROVENANCE.kind },
          label: { type: 'string', const: OPENBIBLE_CROSS_REFERENCE_PROVENANCE.label },
          url: { type: 'string', const: OPENBIBLE_CROSS_REFERENCE_PROVENANCE.url },
          license: {
            type: 'object',
            properties: {
              label: { type: 'string', const: OPENBIBLE_CROSS_REFERENCE_PROVENANCE.license.label },
              url: { type: 'string', const: OPENBIBLE_CROSS_REFERENCE_PROVENANCE.license.url },
            },
            required: ['label', 'url'],
            additionalProperties: false,
          },
          attribution: { type: 'string', const: OPENBIBLE_CROSS_REFERENCE_PROVENANCE.attribution },
          version: { type: 'string', const: OPENBIBLE_CROSS_REFERENCE_PROVENANCE.version },
          locator: { type: 'string', const: OPENBIBLE_CROSS_REFERENCE_PROVENANCE.locator },
          status: { type: 'string', const: OPENBIBLE_CROSS_REFERENCE_PROVENANCE.status },
        },
        required: ['id', 'kind', 'label', 'url', 'license', 'attribution', 'version', 'locator', 'status'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'schemaVersion', 'kind', 'requestedReference', 'resolvedReference', 'query',
    'ranking', 'semantics', 'references', 'resultWindow', 'provenance',
  ],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;
