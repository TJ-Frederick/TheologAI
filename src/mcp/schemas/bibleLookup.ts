import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ProvenanceRecord } from '../../kernel/provenance.js';
import { createProvenanceRecordSchema } from './provenance.js';

export interface BibleLookupOutputV1 {
  [key: string]: unknown;
  schemaVersion: '1';
  kind: 'bible_lookup';
  requestedReference: string;
  requestedTranslations: string[];
  passages: Array<{
    reference: string;
    translation: string;
    text: string;
    footnotes?: Array<{
      caller: string;
      text: string;
      chapter: number;
      verse: number;
    }>;
    provenanceIds: string[];
  }>;
  failures: Array<{ translation: string; reason: string }>;
  provenance: ProvenanceRecord[];
}

const translationEnum = ['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY'];

export const bibleLookupOutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { const: '1' },
    kind: { const: 'bible_lookup' },
    requestedReference: { type: 'string', minLength: 1, maxLength: 100 },
    requestedTranslations: {
      type: 'array', minItems: 1, maxItems: 8, uniqueItems: true,
      items: { type: 'string', enum: translationEnum },
    },
    passages: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object',
        properties: {
          reference: { type: 'string', minLength: 1, maxLength: 100 },
          translation: { type: 'string', enum: translationEnum },
          text: { type: 'string', minLength: 1, maxLength: 500_000 },
          footnotes: {
            type: 'array', maxItems: 1000,
            items: {
              type: 'object',
              properties: {
                caller: { type: 'string', minLength: 1, maxLength: 20 },
                text: { type: 'string', minLength: 1, maxLength: 10_000 },
                chapter: { type: 'integer', minimum: 1, maximum: 200 },
                verse: { type: 'integer', minimum: 1, maximum: 200 },
              },
              required: ['caller', 'text', 'chapter', 'verse'],
              additionalProperties: false,
            },
          },
          provenanceIds: {
            type: 'array', minItems: 1, maxItems: 16, uniqueItems: true,
            items: { type: 'string', minLength: 1, maxLength: 64 },
          },
        },
        required: ['reference', 'translation', 'text', 'provenanceIds'],
        additionalProperties: false,
      },
    },
    failures: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object',
        properties: {
          translation: { type: 'string', enum: translationEnum },
          reason: { type: 'string', minLength: 1, maxLength: 500 },
        },
        required: ['translation', 'reason'],
        additionalProperties: false,
      },
    },
    provenance: {
      type: 'array', maxItems: 16,
      items: createProvenanceRecordSchema(),
    },
  },
  required: [
    'schemaVersion', 'kind', 'requestedReference', 'requestedTranslations',
    'passages', 'failures', 'provenance',
  ],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;
