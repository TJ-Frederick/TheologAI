import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ProvenanceRecord } from '../../kernel/provenance.js';
import { createProvenanceRecordSchema } from './provenance.js';

const textFields = {
  text: { type: 'string', maxLength: 200 },
  translation: { type: 'string' },
} as const;

const textEnrichmentStatus = {
  type: 'string',
  enum: ['not_requested', 'complete', 'partial', 'unavailable', 'budget_omitted'],
} as const;

export const parallelPassagesOutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string', const: '4' },
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
                textEnrichmentStatus,
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
              required: ['sourceOrder', 'sourceReference', 'normalizedReference', 'segments', 'languageMarker', 'matched', 'textEnrichmentStatus', 'provenanceIds'],
              allOf: [
                {
                  if: { properties: { textEnrichmentStatus: { const: 'complete' } } },
                  then: { required: ['text', 'translation', 'excerpts'] },
                },
                {
                  if: { properties: { textEnrichmentStatus: { enum: ['not_requested', 'unavailable', 'budget_omitted'] } } },
                  then: { not: { anyOf: [{ required: ['text'] }, { required: ['translation'] }, { required: ['excerpts'] }] } },
                },
              ],
              additionalProperties: false,
            },
          },
          provenanceIds: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
        required: ['groupId', 'sourceOrdinal', 'label', 'directionality', 'members', 'provenanceIds'],
        additionalProperties: false,
      },
    },
    sourceAttestedResultWindow: {
      type: 'object',
      properties: {
        requestedLimit: { type: 'integer', minimum: 1, maximum: 10 },
        returnedGroupCount: { type: 'integer', minimum: 0, maximum: 10 },
        additionalMatchStatus: {
          type: 'string',
          enum: ['additional_match_observed', 'no_additional_match_observed', 'not_evaluated'],
        },
        nextCursor: { type: 'string', minLength: 1, maxLength: 2048, description: 'Opaque UBS-only continuation cursor; present exactly when one additional UBS group was observed.' },
      },
      required: ['requestedLimit', 'returnedGroupCount', 'additionalMatchStatus'],
      additionalProperties: false,
      allOf: [
        {
          if: { properties: { additionalMatchStatus: { const: 'additional_match_observed' } } },
          then: { required: ['nextCursor'] },
          else: { not: { required: ['nextCursor'] } },
        },
      ],
    },
    legacyParallels: {
      type: 'array', items: {
        type: 'object',
        properties: {
          reference: { type: 'string' }, ...textFields,
          relationship: { type: 'string', enum: ['synoptic', 'quotation', 'allusion', 'thematic'] },
          confidence: { type: 'number' }, uniqueElements: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' }, provenanceIds: { type: 'array', minItems: 1, items: { type: 'string' } },
          textEnrichmentStatus,
        },
        required: ['reference', 'relationship', 'confidence', 'textEnrichmentStatus', 'provenanceIds'], additionalProperties: false,
        allOf: [
          {
            if: { properties: { textEnrichmentStatus: { const: 'complete' } } },
            then: { required: ['text', 'translation'] },
          },
          {
            if: { properties: { textEnrichmentStatus: { enum: ['not_requested', 'unavailable', 'budget_omitted'] } } },
            then: { not: { anyOf: [{ required: ['text'] }, { required: ['translation'] }] } },
          },
        ],
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
    textEnrichment: {
      type: 'object',
      properties: {
        requested: { type: 'boolean' },
        translation: {
          type: ['string', 'null'],
          enum: ['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY', null],
        },
        budget: {
          type: 'object',
          properties: {
            unit: { type: 'string', const: 'unique_canonical_passage_lookups' },
            maximum: { type: 'integer', const: 12 },
          },
          required: ['unit', 'maximum'],
          additionalProperties: false,
        },
        uniqueTargetCount: { type: 'integer', minimum: 0 },
        scheduledLookupCount: { type: 'integer', minimum: 0, maximum: 12 },
        succeededLookupCount: { type: 'integer', minimum: 0, maximum: 12 },
        failedLookupCount: { type: 'integer', minimum: 0, maximum: 12 },
        omittedLookupCount: { type: 'integer', minimum: 0 },
        completionStatus: { type: 'string', enum: ['not_requested', 'complete', 'incomplete'] },
      },
      required: [
        'requested', 'translation', 'budget', 'uniqueTargetCount', 'scheduledLookupCount',
        'succeededLookupCount', 'failedLookupCount', 'omittedLookupCount', 'completionStatus',
      ],
      oneOf: [
        {
          properties: {
            requested: { const: false }, translation: { type: 'null' },
            scheduledLookupCount: { const: 0 }, succeededLookupCount: { const: 0 },
            failedLookupCount: { const: 0 }, omittedLookupCount: { const: 0 },
            completionStatus: { const: 'not_requested' },
          },
          required: [
            'requested', 'translation', 'scheduledLookupCount', 'succeededLookupCount',
            'failedLookupCount', 'omittedLookupCount', 'completionStatus',
          ],
        },
        {
          properties: {
            requested: { const: true },
            translation: { type: 'string', enum: ['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY'] },
            failedLookupCount: { const: 0 }, omittedLookupCount: { const: 0 },
            completionStatus: { const: 'complete' },
          },
          required: ['requested', 'translation', 'failedLookupCount', 'omittedLookupCount', 'completionStatus'],
        },
        {
          properties: {
            requested: { const: true },
            translation: { type: 'string', enum: ['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY'] },
            completionStatus: { const: 'incomplete' },
          },
          required: ['requested', 'translation', 'completionStatus'],
          anyOf: [
            { properties: { failedLookupCount: { type: 'integer', minimum: 1 } }, required: ['failedLookupCount'] },
            { properties: { omittedLookupCount: { type: 'integer', minimum: 1 } }, required: ['omittedLookupCount'] },
          ],
        },
      ],
      additionalProperties: false,
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['schemaVersion', 'kind', 'requestedReference', 'corpora', 'sourceAttestedGroups', 'sourceAttestedResultWindow', 'legacyParallels', 'openBibleCrossReferences', 'provenance', 'textEnrichment'],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;

export interface ParallelPassagesOutputV4 {
  [key: string]: unknown;
  schemaVersion: '4';
  kind: 'parallel_passages';
  requestedReference: string;
  corpora: Array<'ubs_source_attested' | 'theologai_legacy'>;
  sourceAttestedGroups: Array<Record<string, unknown>>;
  sourceAttestedResultWindow: {
    requestedLimit: number;
    returnedGroupCount: number;
    additionalMatchStatus: 'additional_match_observed' | 'no_additional_match_observed' | 'not_evaluated';
    nextCursor?: string;
  };
  legacyParallels: Array<Record<string, unknown>>;
  openBibleCrossReferences: Array<Record<string, unknown>>;
  provenance: ProvenanceRecord[];
  textEnrichment: {
    requested: boolean;
    translation: 'ESV' | 'NET' | 'KJV' | 'WEB' | 'BSB' | 'ASV' | 'YLT' | 'DBY' | null;
    budget: { unit: 'unique_canonical_passage_lookups'; maximum: 12 };
    uniqueTargetCount: number;
    scheduledLookupCount: number;
    succeededLookupCount: number;
    failedLookupCount: number;
    omittedLookupCount: number;
    completionStatus: 'not_requested' | 'complete' | 'incomplete';
  };
  warnings?: string[];
}
