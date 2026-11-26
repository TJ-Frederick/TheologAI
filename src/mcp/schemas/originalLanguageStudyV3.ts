import type { Tool } from '@modelcontextprotocol/server';
import { originalLanguageStudyOutputSchema } from './originalLanguageStudy.js';
import {
  originalLanguageStudyDetailedCandidateSchema,
  originalLanguageStudyOmittedCandidateSchema,
  originalLanguageStudySemanticAlignmentSchema,
  originalLanguageStudySemanticIdentitySchema,
  originalLanguageStudySemanticProvenanceSchema,
  originalLanguageStudySummaryCandidateSchema,
} from './originalLanguageStudyV2.js';
import {
  ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH,
  ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION,
  ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES,
  ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION,
} from '../../kernel/originalLanguageStudyV3Contract.js';

const CURSOR_PATTERN = '^olsv3c1_[A-Za-z0-9_-]+$';

export const originalLanguageStudyV3InputSchema = {
  type: 'object',
  properties: {
    reference: { type: 'string', minLength: 1, maxLength: 100 },
    target: { type: 'string', minLength: 1, maxLength: 100 },
    position: { type: 'integer', minimum: 1, maximum: 200 },
    depth: {
      type: 'string', enum: ['beginner', 'intermediate', 'technical'],
      description: 'Audience depth. Omitted calls use intermediate. Only technical returns corpus occurrences.',
    },
    cursor: {
      type: 'string', minLength: 1, maxLength: ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH,
      description: 'Opaque schema-v3 continuation returned by this tool. Preserve the same request and depth; corpus-occurrence continuations require technical depth. Schema-v2 cursors receive an explicit stale-contract error.',
    },
  },
  required: ['reference', 'target'],
  additionalProperties: false,
} satisfies Tool['inputSchema'];

const semanticResultWindow = {
  type: 'object',
  properties: {
    priorCount: { type: 'integer', minimum: 0, maximum: 1_000_000 },
    returnedCount: { type: 'integer', minimum: 0, maximum: 8 },
    consumedCount: { type: 'integer', minimum: 0, maximum: 1_000_000 },
    totalCount: { type: 'integer', minimum: 0, maximum: 1_000_000 },
    hasMore: { type: 'boolean' },
    continuation: continuationSchema(ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION),
  },
  required: ['priorCount', 'returnedCount', 'consumedCount', 'totalCount', 'hasMore'],
  additionalProperties: false,
} as const;

const withheldEvidence = {
  type: 'array', minItems: 2, maxItems: 2,
  prefixItems: [
    {
      type: 'object', properties: {
        source: { const: 'TBESH' }, field: { const: 'Meaning' }, status: { const: 'withheld_rights_boundary' },
      }, required: ['source', 'field', 'status'], additionalProperties: false,
    },
    {
      type: 'object', properties: {
        source: { const: 'UBS Hebrew dictionary' }, field: { const: 'A#### lexical identities' },
        status: { const: 'withheld_public_scope' },
      }, required: ['source', 'field', 'status'], additionalProperties: false,
    },
  ],
  items: false,
} as const;

const repositoryCommon = {
  language: { const: 'Hebrew' },
  plainLanguage: { type: 'string', minLength: 1, maxLength: 2_000 },
  identity: originalLanguageStudySemanticIdentitySchema,
  normalizedReference: { type: 'string', minLength: 1, maxLength: 100 },
  resultWindow: semanticResultWindow,
  provenance: originalLanguageStudySemanticProvenanceSchema,
  withheldEvidence,
} as const;

const repositoryRequired = [
  'language', 'status', 'plainLanguage', 'identity', 'normalizedReference',
  'resultWindow', 'provenance', 'withheldEvidence',
] as const;

function semanticEvidenceSchema(technical: boolean) {
  const candidate = technical
    ? { oneOf: [originalLanguageStudyDetailedCandidateSchema, originalLanguageStudyOmittedCandidateSchema] } as const
    : originalLanguageStudySummaryCandidateSchema;
  return {
    oneOf: [
      {
        type: 'object', properties: {
          language: { const: 'Greek' }, status: { const: 'not_applicable' },
          reason: { const: 'hebrew_semantic_evidence_not_applicable' },
          plainLanguage: { type: 'string', minLength: 1, maxLength: 2_000 },
        }, required: ['language', 'status', 'reason', 'plainLanguage'], additionalProperties: false,
      },
      {
        type: 'object', properties: {
          language: { const: 'Hebrew' }, status: { const: 'unavailable' },
          reason: { enum: ['selected_token_required', 'no_usable_hebrew_identity'] },
          plainLanguage: { type: 'string', minLength: 1, maxLength: 2_000 },
        }, required: ['language', 'status', 'reason', 'plainLanguage'], additionalProperties: false,
      },
      {
        type: 'object', properties: {
          ...repositoryCommon, status: { const: 'unavailable' },
          reason: { enum: ['no_lexical_entry', 'no_publishable_semantic_evidence'] },
          candidates: { type: 'array', minItems: 0, maxItems: 0, items: false },
        }, required: [...repositoryRequired, 'reason', 'candidates'], additionalProperties: false,
      },
      {
        type: 'object', properties: {
          ...repositoryCommon, status: { const: 'lexical_candidates' },
          reason: { enum: ['no_reference_evidence', 'reference_alignment_unproven', 'ambiguous_reference_alignment'] },
          candidates: { type: 'array', minItems: 1, maxItems: 8, items: candidate },
        }, required: [...repositoryRequired, 'reason', 'candidates'], additionalProperties: false,
      },
      {
        type: 'object', properties: {
          ...repositoryCommon, status: { const: 'reference_aligned_source_candidate' },
          candidates: { type: 'array', minItems: 1, maxItems: 1, items: candidate },
          alignmentEvidence: originalLanguageStudySemanticAlignmentSchema,
        }, required: [...repositoryRequired, 'candidates', 'alignmentEvidence'], additionalProperties: false,
      },
    ],
  } as const;
}

const lexicalRange = {
  oneOf: [
    {
      type: 'object', properties: {
        status: { const: 'available' }, scope: { const: 'source_attested_non_exhaustive' },
        cues: {
          type: 'array', minItems: 1, maxItems: 4,
          items: {
            type: 'object', properties: {
              sourceId: { type: 'string', minLength: 1, maxLength: 128 },
              sourceKind: { enum: ['dictionary', 'stepbible_lexicon'] },
              evidenceKind: { enum: ['definition', 'gloss'] },
              text: { type: 'string', minLength: 1, maxLength: 20_000 },
              provenanceIds: { type: 'array', minItems: 1, maxItems: 3, uniqueItems: true, items: { type: 'string' } },
            }, required: ['sourceId', 'sourceKind', 'evidenceKind', 'text', 'provenanceIds'], additionalProperties: false,
          },
        },
        notice: { type: 'string', minLength: 1, maxLength: 1_000 },
      }, required: ['status', 'scope', 'cues', 'notice'], additionalProperties: false,
    },
    {
      type: 'object', properties: {
        status: { const: 'unavailable' }, scope: { const: 'source_attested_non_exhaustive' },
        reason: { const: 'no_publishable_lexical_cues' },
        cues: { type: 'array', minItems: 0, maxItems: 0, items: false },
        notice: { type: 'string', minLength: 1, maxLength: 1_000 },
      }, required: ['status', 'scope', 'reason', 'cues', 'notice'], additionalProperties: false,
    },
  ],
} as const;

const occurrence = {
  type: 'object', properties: {
    book: { type: 'string', minLength: 1, maxLength: 100 },
    canonicalOrder: { type: 'integer', minimum: 1, maximum: 66 },
    chapter: { type: 'integer', minimum: 1, maximum: 200 },
    verse: { type: 'integer', minimum: 0, maximum: 200 },
    position: { type: 'integer', minimum: 1, maximum: 200 },
    sourceForm: { type: 'string', minLength: 1, maxLength: 2_000 },
    lemma: { type: 'string', minLength: 1, maxLength: 2_000 },
    exactMorphologyKey: { type: 'string', minLength: 1, maxLength: 128 },
    morphologyCode: { type: ['string', 'null'], maxLength: 512 },
    gloss: { type: ['string', 'null'], maxLength: 2_000 },
  }, required: [
    'book', 'canonicalOrder', 'chapter', 'verse', 'position', 'sourceForm',
    'lemma', 'exactMorphologyKey', 'morphologyCode', 'gloss',
  ], additionalProperties: false,
} as const;

const corpusOccurrences = {
  oneOf: [
    {
      type: 'object', properties: {
        status: { const: 'unavailable' },
        reason: { enum: ['selected_token_required', 'no_usable_strongs_identity'] },
        plainLanguage: { type: 'string', minLength: 1, maxLength: 2_000 },
      }, required: ['status', 'reason', 'plainLanguage'], additionalProperties: false,
    },
    {
      type: 'object', properties: {
        status: { const: 'not_requested_continuation' }, reason: { const: 'semantic_continuation_only' },
        plainLanguage: { type: 'string', minLength: 1, maxLength: 2_000 },
      }, required: ['status', 'reason', 'plainLanguage'], additionalProperties: false,
    },
    {
      type: 'object', properties: {
        status: { const: 'available' },
        exactMorphologyKey: { type: 'string', minLength: 1, maxLength: 128 },
        publicStrongs: { type: 'string', pattern: '^[GH](?:[1-9][0-9]{0,4})[A-Z]?$' },
        corpusIdentity: { type: 'string', minLength: 1, maxLength: 512 },
        attested: { type: 'boolean' },
        totals: {
          type: 'object', properties: {
            tokenCount: { type: 'integer', minimum: 0, maximum: 10_000_000 },
            verseCount: { type: 'integer', minimum: 0, maximum: 10_000_000 },
            bookCount: { type: 'integer', minimum: 0, maximum: 66 },
            sourceSurfaceVariantCount: { type: 'integer', minimum: 0, maximum: 10_000_000 },
          }, required: ['tokenCount', 'verseCount', 'bookCount', 'sourceSurfaceVariantCount'], additionalProperties: false,
        },
        occurrences: { type: 'array', minItems: 0, maxItems: 20, items: occurrence },
        resultWindow: {
          type: 'object', properties: {
            returnedCount: { type: 'integer', minimum: 0, maximum: 20 },
            maximumReturned: { const: 20 },
            hasMore: { type: 'boolean' },
            continuation: continuationSchema(ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION),
          }, required: ['returnedCount', 'maximumReturned', 'hasMore'], additionalProperties: false,
        },
        cautions: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string', minLength: 1, maxLength: 1_000 } },
      }, required: [
        'status', 'exactMorphologyKey', 'publicStrongs', 'corpusIdentity', 'attested', 'totals',
        'occurrences', 'resultWindow', 'cautions',
      ], additionalProperties: false,
    },
  ],
} as const;

const englishTranslationComparison = {
  type: 'object', properties: {
    status: { const: 'not_performed' }, responsibility: { const: 'guided_prompt' },
    reason: { const: 'english_translations_are_retrieved_separately' },
  }, required: ['status', 'responsibility', 'reason'], additionalProperties: false,
} as const;

const contextualInterpretation = {
  type: 'object', properties: {
    status: { const: 'not_performed' }, responsibility: { const: 'guided_prompt' },
    reason: { const: 'deterministic_tool_does_not_select_contextual_meaning' },
  }, required: ['status', 'responsibility', 'reason'], additionalProperties: false,
} as const;

function rootSchema(depth: 'beginner' | 'intermediate' | 'technical') {
  return {
    type: 'object',
    properties: {
      schemaVersion: { const: '3' }, kind: { const: 'original_language_study' }, depth: { const: depth },
      request: {
        type: 'object', properties: {
          reference: { type: 'string', minLength: 1, maxLength: 100 },
          target: { type: 'string', minLength: 1, maxLength: 100 },
          position: { type: 'integer', minimum: 1, maximum: 200 },
        }, required: ['reference', 'target'], additionalProperties: false,
      },
      study: originalLanguageStudyOutputSchema,
      lexicalRange,
      englishTranslationComparison,
      contextualInterpretation,
      semanticEvidence: semanticEvidenceSchema(depth === 'technical'),
      ...(depth === 'technical' ? { corpusOccurrences } : {}),
      responseWindow: {
        type: 'object', properties: {
          unit: { const: 'utf8_bytes' }, maximum: { const: ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES },
          used: { type: 'integer', minimum: 1, maximum: ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES },
          truncated: { const: false },
        }, required: ['unit', 'maximum', 'used', 'truncated'], additionalProperties: false,
      },
    },
    required: [
      'schemaVersion', 'kind', 'depth', 'request', 'study', 'lexicalRange',
      'englishTranslationComparison', 'contextualInterpretation', 'semanticEvidence',
      ...(depth === 'technical' ? ['corpusOccurrences'] : []), 'responseWindow',
    ],
    additionalProperties: false,
  } as const;
}

function continuationSchema(operation: string) {
  return {
    type: 'object', properties: {
      cursor: {
        type: 'string', minLength: 1, maxLength: ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH,
        pattern: CURSOR_PATTERN,
      },
      operation: { const: operation },
    }, required: ['cursor', 'operation'], additionalProperties: false,
  } as const;
}

export const originalLanguageStudyV3OutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: {}, kind: {}, depth: {}, request: {}, study: {}, lexicalRange: {},
    englishTranslationComparison: {}, contextualInterpretation: {}, semanticEvidence: {},
    corpusOccurrences: {}, responseWindow: {},
  },
  additionalProperties: false,
  oneOf: [rootSchema('beginner'), rootSchema('intermediate'), rootSchema('technical')],
} as NonNullable<Tool['outputSchema']>;
