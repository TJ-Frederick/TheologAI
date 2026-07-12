import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ProvenanceRecord } from '../../kernel/provenance.js';
import { createProvenanceRecordSchema } from './provenance.js';

const textFields = {
  text: { type: 'string', maxLength: 200 },
  translation: { type: 'string' },
} as const;

export const parallelPassagesOutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string', const: '1' },
    kind: { type: 'string', const: 'parallel_passages' },
    requestedReference: { type: 'string' },
    corpora: {
      type: 'array', minItems: 1, maxItems: 2, uniqueItems: true,
      items: { type: 'string', enum: ['ubs_source_attested', 'theologai_legacy'] },
    },
    sourceAttestedGroups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          groupId: { type: 'string' }, sourceOrdinal: { type: 'integer' },
          label: { type: 'string', enum: ['source_attested_parallel'] },
          directionality: { type: 'string', enum: ['unspecified'] },
          members: {
            type: 'array', minItems: 2,
            items: {
              type: 'object',
              properties: {
                sourceOrder: { type: 'integer' }, sourceReference: { type: 'string' },
                normalizedReference: { type: 'string' }, languageMarker: { type: 'string', enum: ['HEB', 'GRK'] },
                matched: { type: 'boolean' }, alignmentBasis: { type: 'string', enum: ['BHS', 'LXX', 'UBSGNT5'] },
                alignmentRaw: { type: 'string' }, ...textFields,
                excerpts: {
                  type: 'array', minItems: 1,
                  items: {
                    type: 'object',
                    properties: {
                      segmentOrder: { type: 'integer', minimum: 1 },
                      reference: { type: 'string' },
                      text: { type: 'string', maxLength: 200 },
                      translation: { type: 'string' },
                      provenanceIds: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } },
                    },
                    required: ['segmentOrder', 'reference', 'text', 'translation', 'provenanceIds'],
                    additionalProperties: false,
                  },
                },
                provenanceIds: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } },
                segments: {
                  type: 'array', minItems: 1, items: {
                    type: 'object',
                    properties: {
                      bookNumber: { type: 'integer' }, chapter: { type: 'integer' },
                      startVerse: { type: 'integer' }, endVerse: { type: 'integer' },
                    },
                    required: ['bookNumber', 'chapter', 'startVerse', 'endVerse'], additionalProperties: false,
                  },
                },
              },
              required: ['sourceOrder', 'sourceReference', 'normalizedReference', 'segments', 'languageMarker', 'matched', 'provenanceIds'],
              additionalProperties: false,
            },
          },
          provenanceIds: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
        required: ['groupId', 'sourceOrdinal', 'label', 'directionality', 'members', 'provenanceIds'],
        additionalProperties: false,
      },
    },
    legacyParallels: {
      type: 'array', items: {
        type: 'object',
        properties: {
          reference: { type: 'string' }, ...textFields,
          relationship: { type: 'string', enum: ['synoptic', 'quotation', 'allusion', 'thematic'] },
          confidence: { type: 'number' }, uniqueElements: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' }, provenanceIds: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
        required: ['reference', 'relationship', 'confidence', 'provenanceIds'], additionalProperties: false,
      },
    },
    openBibleCrossReferences: {
      type: 'array', items: {
        type: 'object',
        properties: {
          reference: { type: 'string' }, votes: { type: 'integer' }, provenanceIds: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
        required: ['reference', 'votes', 'provenanceIds'], additionalProperties: false,
      },
    },
    provenance: { type: 'array', items: createProvenanceRecordSchema() },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['schemaVersion', 'kind', 'requestedReference', 'corpora', 'sourceAttestedGroups', 'legacyParallels', 'openBibleCrossReferences', 'provenance'],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;

export interface ParallelPassagesOutputV1 {
  [key: string]: unknown;
  schemaVersion: '1';
  kind: 'parallel_passages';
  requestedReference: string;
  corpora: Array<'ubs_source_attested' | 'theologai_legacy'>;
  sourceAttestedGroups: Array<Record<string, unknown>>;
  legacyParallels: Array<Record<string, unknown>>;
  openBibleCrossReferences: Array<Record<string, unknown>>;
  provenance: ProvenanceRecord[];
  warnings?: string[];
}
