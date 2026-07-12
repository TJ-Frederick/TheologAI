import type { Schema } from '@cfworker/json-schema';

export const PROVENANCE_KINDS = [
  'primary_text',
  'translation',
  'lexicon',
  'morphology_dataset',
  'cross_reference_dataset',
  'curated_dataset',
  'repository',
  'delivery_provider',
] as const;

export const PROVENANCE_STATUSES = [
  'verified_source',
  'provider_attributed',
  'transcription_source_uncertain',
] as const;

/** Inline this fragment in each output schema; stable clients need no ref resolver. */
export function createProvenanceRecordSchema(): Schema {
  return {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1, maxLength: 64 },
      kind: { type: 'string', enum: [...PROVENANCE_KINDS] },
      label: { type: 'string', minLength: 1, maxLength: 240 },
      url: { type: 'string', minLength: 1, maxLength: 1000 },
      license: {
        type: 'object',
        properties: {
          label: { type: 'string', minLength: 1, maxLength: 500 },
          url: { type: 'string', minLength: 1, maxLength: 1000 },
        },
        required: ['label'],
        additionalProperties: false,
      },
      rightsNotice: { type: 'string', minLength: 1, maxLength: 1000 },
      attribution: { type: 'string', minLength: 1, maxLength: 500 },
      version: { type: 'string', minLength: 1, maxLength: 200 },
      locator: { type: 'string', minLength: 1, maxLength: 500 },
      status: { type: 'string', enum: [...PROVENANCE_STATUSES] },
      note: { type: 'string', minLength: 1, maxLength: 500 },
    },
    required: ['id', 'kind', 'label', 'status'],
    additionalProperties: false,
  };
}
