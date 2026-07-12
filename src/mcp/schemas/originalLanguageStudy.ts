import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { createProvenanceRecordSchema } from './provenance.js';

const tokenSchema = {
  type: 'object',
  properties: {
    position: { type: 'integer', minimum: 1, maximum: 200 },
    text: { type: 'string' },
    lemma: { type: 'string' },
    strongsNumber: { type: ['string', 'null'] },
    morphologyCode: { type: ['string', 'null'] },
    gloss: { type: ['string', 'null'] },
    provenanceIds: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true },
  },
  required: ['position', 'text', 'lemma', 'strongsNumber', 'morphologyCode', 'gloss', 'provenanceIds'],
  additionalProperties: false,
} as const;

export const originalLanguageStudyOutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { const: '1' },
    kind: { const: 'original_language_study' },
    status: { type: 'string', enum: ['complete', 'partial', 'needs_disambiguation'] },
    request: {
      type: 'object', properties: { reference: { type: 'string' }, target: { type: 'string' }, position: { type: 'integer' } },
      required: ['reference', 'target'], additionalProperties: false,
    },
    context: {
      type: 'object',
      properties: {
        reference: { type: 'string' }, language: { type: 'string', enum: ['Greek', 'Hebrew'] },
        selectedToken: tokenSchema, candidates: { type: 'array', items: tokenSchema, minItems: 2, maxItems: 200 },
      },
      required: ['reference', 'language'], additionalProperties: false,
    },
    identity: {
      type: 'object', properties: {
        publicStrongs: { type: 'string' }, morphologyKey: { type: 'string' }, sourceStrongs: { type: 'string' },
        lemma: { type: 'string' }, transliteration: { type: 'string' }, pronunciation: { type: 'string' },
        joinKind: { type: 'string', enum: ['exact', 'base', 'none'] }, provenanceIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
      }, required: ['publicStrongs', 'morphologyKey', 'sourceStrongs', 'lemma', 'joinKind', 'provenanceIds'], additionalProperties: false,
    },
    grammar: {
      type: 'object', properties: { code: { type: 'string' }, expansion: { type: 'string' }, certainty: { type: 'string', enum: ['expanded', 'unknown'] }, provenanceIds: { type: 'array', items: { type: 'string' }, minItems: 1 } },
      required: ['code', 'certainty', 'provenanceIds'], additionalProperties: false,
    },
    lexiconEvidence: {
      type: 'array', maxItems: 2, items: {
        type: 'object', properties: { sourceId: { type: 'string' }, kind: { type: 'string', enum: ['dictionary', 'stepbible_lexicon'] }, lemma: { type: 'string' }, definition: { type: 'string' }, derivation: { type: 'string' }, gloss: { type: 'string' }, lexicon: { type: 'string' }, provenanceIds: { type: 'array', items: { type: 'string' }, minItems: 1 } },
        required: ['sourceId', 'kind', 'provenanceIds'], additionalProperties: false,
      },
    },
    interpretiveLimits: {
      type: 'array', minItems: 7, maxItems: 7, items: { type: 'object', properties: { code: { type: 'string', enum: ['context_controls_sense', 'gloss_is_not_definition', 'strongs_is_identifier', 'etymology_not_determinative', 'morphology_not_determinative', 'avoid_illegitimate_totality_transfer', 'corpus_scope_limit'] }, message: { type: 'string' } }, required: ['code', 'message'], additionalProperties: false },
    },
    provenance: { type: 'array', minItems: 1, maxItems: 3, items: createProvenanceRecordSchema() },
    warnings: { type: 'array', maxItems: 10, items: { type: 'string' } },
  },
  required: ['schemaVersion', 'kind', 'status', 'request', 'context', 'lexiconEvidence', 'interpretiveLimits', 'provenance', 'warnings'],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;
