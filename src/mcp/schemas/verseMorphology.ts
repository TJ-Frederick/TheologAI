import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ProvenanceRecord } from '../../kernel/provenance.js';
import { createProvenanceRecordSchema } from './provenance.js';

export interface VerseMorphologyOutputV1 {
  [key: string]: unknown;
  schemaVersion: '1';
  kind: 'bible_verse_morphology';
  reference: string;
  testament: 'OT' | 'NT';
  language: 'Hebrew' | 'Greek';
  book: string;
  chapter: number;
  verse: number;
  words: Array<{
    position: number;
    text: string | null;
    lemma: string | null;
    strongsNumber: string | null;
    morphologyCode: string | null;
    morphologyExpansion: string | null;
    gloss: string | null;
    provenanceIds: string[];
    lemmaProvenanceIds: string[];
  }>;
  provenance: ProvenanceRecord[];
}

export const VERSE_MORPHOLOGY_MAX_WORDS = 200;

const nullableText = (maxLength: number) => ({
  type: ['string', 'null'],
  minLength: 1,
  maxLength,
});

const provenanceIds = {
  type: 'array',
  minItems: 1,
  maxItems: 2,
  uniqueItems: true,
  items: { type: 'string', minLength: 1, maxLength: 64 },
};

const optionalProvenanceIds = {
  ...provenanceIds,
  minItems: 0,
};

export const verseMorphologyOutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { const: '1' },
    kind: { const: 'bible_verse_morphology' },
    reference: { type: 'string', minLength: 1, maxLength: 100 },
    testament: { type: 'string', enum: ['OT', 'NT'] },
    language: { type: 'string', enum: ['Hebrew', 'Greek'] },
    book: { type: 'string', minLength: 1, maxLength: 100 },
    chapter: { type: 'integer', minimum: 1, maximum: 200 },
    verse: { type: 'integer', minimum: 1, maximum: 200 },
    words: {
      type: 'array',
      minItems: 1,
      maxItems: VERSE_MORPHOLOGY_MAX_WORDS,
      items: {
        type: 'object',
        properties: {
          position: { type: 'integer', minimum: 1, maximum: 1000 },
          text: nullableText(1000),
          lemma: nullableText(1000),
          strongsNumber: nullableText(100),
          morphologyCode: nullableText(500),
          morphologyExpansion: nullableText(2000),
          gloss: nullableText(2000),
          provenanceIds,
          lemmaProvenanceIds: optionalProvenanceIds,
        },
        required: [
          'position', 'text', 'lemma', 'strongsNumber', 'morphologyCode',
          'morphologyExpansion', 'gloss', 'provenanceIds', 'lemmaProvenanceIds',
        ],
        additionalProperties: false,
      },
    },
    provenance: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      items: createProvenanceRecordSchema(),
    },
  },
  required: [
    'schemaVersion', 'kind', 'reference', 'testament', 'language', 'book',
    'chapter', 'verse', 'words', 'provenance',
  ],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;
