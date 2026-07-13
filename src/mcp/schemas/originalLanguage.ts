import type { Schema } from '@cfworker/json-schema';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ProvenanceRecord } from '../../kernel/provenance.js';
import { createProvenanceRecordSchema } from './provenance.js';
import { STRONGS_IDENTITY_PATTERN } from '../../kernel/strongs.js';
import type { CorpusUsageResult } from '../../kernel/types.js';
import { MORPHOLOGY_USAGE_IDENTITY } from '../../kernel/morphologyUsageCursor.js';

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
  testament: 'NT' | 'OT' | null;
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
  corpusUsage?: CorpusUsageResult & { provenanceIds: string[] };
  provenance: ProvenanceRecord[];
}

const positiveCount = { type: 'integer', minimum: 0, maximum: 1_000_000 } as const;
const canonicalOrder = { type: 'integer', minimum: 1, maximum: 66 } as const;
const occurrencePositionSchema: Schema = {
  type: 'object',
  properties: {
    book: { type: 'string', minLength: 2, maxLength: 32 },
    canonicalOrder,
    chapter: { type: 'integer', minimum: 1, maximum: 200 },
    verse: { type: 'integer', minimum: 0, maximum: 200 },
    position: { type: 'integer', minimum: 1, maximum: 500 },
  },
  required: ['book', 'canonicalOrder', 'chapter', 'verse', 'position'],
  additionalProperties: false,
};

const corpusUsageSchema: Schema = {
  type: 'object',
  properties: {
    level: { type: 'string', enum: ['overview', 'study', 'technical'] },
    exactMorphologyKey: { type: 'string', minLength: 2, maxLength: 7, pattern: '^[GH](?:\\d{4,5})[A-Z]?$' },
    corpusIdentity: { const: MORPHOLOGY_USAGE_IDENTITY },
    attested: { type: 'boolean' },
    totals: {
      type: 'object',
      properties: {
        tokenCount: positiveCount,
        verseCount: positiveCount,
        bookCount: { type: 'integer', minimum: 0, maximum: 66 },
        sourceSurfaceVariantCount: positiveCount,
      },
      required: ['tokenCount', 'verseCount', 'bookCount', 'sourceSurfaceVariantCount'],
      additionalProperties: false,
    },
    bookDistribution: {
      type: 'array', maxItems: 66,
      items: {
        type: 'object',
        properties: {
          book: { type: 'string', minLength: 2, maxLength: 32 },
          canonicalOrder,
          tokenCount: positiveCount,
          verseCount: positiveCount,
        },
        required: ['book', 'canonicalOrder', 'tokenCount', 'verseCount'],
        additionalProperties: false,
      },
    },
    sourceSurfaceVariants: {
      type: 'array', maxItems: 25,
      items: {
        type: 'object',
        properties: {
          sourceForm: { type: 'string', minLength: 1, maxLength: 500 },
          tokenCount: positiveCount,
          verseCount: positiveCount,
          firstOccurrence: occurrencePositionSchema,
        },
        required: ['sourceForm', 'tokenCount', 'verseCount', 'firstOccurrence'],
        additionalProperties: false,
      },
    },
    occurrences: {
      type: 'array', maxItems: 25,
      items: {
        type: 'object',
        properties: {
          ...occurrencePositionSchema.properties,
          sourceForm: { type: 'string', minLength: 1, maxLength: 500 },
          lemma: { type: 'string', minLength: 1, maxLength: 500 },
          exactMorphologyKey: { type: 'string', minLength: 2, maxLength: 7, pattern: '^[GH](?:\\d{4,5})[A-Z]?$' },
          morphologyCode: { type: ['string', 'null'], maxLength: 500 },
          gloss: { type: ['string', 'null'], maxLength: 2000 },
        },
        required: ['book', 'canonicalOrder', 'chapter', 'verse', 'position', 'sourceForm', 'lemma', 'exactMorphologyKey', 'morphologyCode', 'gloss'],
        additionalProperties: false,
      },
    },
    nextOccurrenceCursor: { type: 'string', minLength: 1, maxLength: 512, pattern: '^[A-Za-z0-9_-]+$' },
    cautions: { type: 'array', minItems: 3, maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 500 } },
    provenanceIds: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 64 } },
  },
  required: ['level', 'exactMorphologyKey', 'corpusIdentity', 'attested', 'totals', 'bookDistribution', 'sourceSurfaceVariants', 'cautions', 'provenanceIds'],
  additionalProperties: false,
};

const entrySchema: Schema = {
  type: 'object',
  properties: {
    strongsNumber: { type: 'string', minLength: 2, maxLength: 7, pattern: STRONGS_IDENTITY_PATTERN },
    language: { type: 'string', enum: ['Greek', 'Hebrew'] },
    testament: { type: ['string', 'null'], enum: ['NT', 'OT', null] },
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
            strongs_number: { type: 'string', minLength: 2, maxLength: 7, pattern: STRONGS_IDENTITY_PATTERN },
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
    corpusUsage: corpusUsageSchema,
    provenance: {
      type: 'array', minItems: 1, maxItems: 8,
      items: createProvenanceRecordSchema(),
    },
  },
  required: ['schemaVersion', 'kind', 'mode', 'detailLevel', 'entries', 'provenance'],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;
