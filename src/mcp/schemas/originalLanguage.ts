import type { Schema } from '@cfworker/json-schema';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ProvenanceRecord } from '../../kernel/provenance.js';
import { createProvenanceRecordSchema } from './provenance.js';

export interface OriginalLanguageSenseV1 {
  gloss: string;
  usage: string;
  count: number;
}

export interface OriginalLanguageExtendedV1 {
  strongsExtended?: string;
  morphologyCode?: string;
  lexicon?: string;
  definition?: string;
  occurrences?: number;
  senses?: OriginalLanguageSenseV1[];
}

export interface OriginalLanguageEntryV1 {
  strongsNumber: string;
  language: 'Greek' | 'Hebrew';
  testament: 'NT' | 'OT';
  lemma: string | null;
  transliteration?: string;
  pronunciation?: string;
  gloss?: string;
  definition: string | null;
  derivation?: string;
  extended?: OriginalLanguageExtendedV1;
  provenanceIds: string[];
}

export interface OriginalLanguageNextStepV1 {
  tool: 'original_language_lookup';
  arguments: { strongs_number: string; detail_level: 'detailed'; include_extended: true };
}

export interface OriginalLanguageOutputV1 {
  [key: string]: unknown;
  schemaVersion: '1';
  kind: 'original_language_lookup';
  mode: 'search' | 'entry';
  query?: string;
  detailLevel: 'summary' | 'detailed';
  entries: OriginalLanguageEntryV1[];
  nextStep?: OriginalLanguageNextStepV1;
  provenance: ProvenanceRecord[];
}

const entrySchema: Schema = {
  type: 'object',
  properties: {
    strongsNumber: { type: 'string', minLength: 2, maxLength: 7, pattern: '^[GHgh]0*[1-9]\\d*[A-Za-z]?$' },
    language: { type: 'string', enum: ['Greek', 'Hebrew'] },
    testament: { type: 'string', enum: ['NT', 'OT'] },
    lemma: { type: ['string', 'null'], minLength: 1, maxLength: 500 },
    transliteration: { type: 'string', minLength: 1, maxLength: 500 },
    pronunciation: { type: 'string', minLength: 1, maxLength: 500 },
    gloss: { type: 'string', minLength: 1, maxLength: 1000 },
    definition: { type: ['string', 'null'], minLength: 1, maxLength: 20_000 },
    derivation: { type: 'string', minLength: 1, maxLength: 5000 },
    extended: {
      type: 'object',
      properties: {
        strongsExtended: { type: 'string', minLength: 1, maxLength: 100 },
        morphologyCode: { type: 'string', minLength: 1, maxLength: 200 },
        lexicon: { type: 'string', minLength: 1, maxLength: 500 },
        definition: { type: 'string', minLength: 1, maxLength: 50_000 },
        occurrences: { type: 'integer', minimum: 0, maximum: 1_000_000 },
        senses: {
          type: 'array', maxItems: 100,
          items: {
            type: 'object',
            properties: {
              gloss: { type: 'string', minLength: 1, maxLength: 1000 },
              usage: { type: 'string', minLength: 1, maxLength: 5000 },
              count: { type: 'integer', minimum: 0, maximum: 1_000_000 },
            },
            required: ['gloss', 'usage', 'count'],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    provenanceIds: {
      type: 'array', minItems: 1, maxItems: 8, uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 64 },
    },
  },
  required: ['strongsNumber', 'language', 'testament', 'lemma', 'definition', 'provenanceIds'],
  additionalProperties: false,
};

export const originalLanguageOutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { const: '1' },
    kind: { const: 'original_language_lookup' },
    mode: { type: 'string', enum: ['search', 'entry'] },
    query: { type: 'string', minLength: 2, maxLength: 100 },
    detailLevel: { type: 'string', enum: ['summary', 'detailed'] },
    entries: { type: 'array', maxItems: 20, items: entrySchema },
    nextStep: {
      type: 'object',
      properties: {
        tool: { const: 'original_language_lookup' },
        arguments: {
          type: 'object',
          properties: {
            strongs_number: { type: 'string', minLength: 2, maxLength: 7, pattern: '^[GHgh]0*[1-9]\\d*[A-Za-z]?$' },
            detail_level: { const: 'detailed' },
            include_extended: { const: true },
          },
          required: ['strongs_number', 'detail_level', 'include_extended'],
          additionalProperties: false,
        },
      },
      required: ['tool', 'arguments'],
      additionalProperties: false,
    },
    provenance: {
      type: 'array', minItems: 1, maxItems: 8,
      items: createProvenanceRecordSchema(),
    },
  },
  required: ['schemaVersion', 'kind', 'mode', 'detailLevel', 'entries', 'provenance'],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;
