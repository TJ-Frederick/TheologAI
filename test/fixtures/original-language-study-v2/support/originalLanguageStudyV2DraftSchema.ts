import { originalLanguageStudyOutputSchema } from '../../../../src/mcp/schemas/originalLanguageStudy.js';
import {
  ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_MAX_LENGTH,
  ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_OPERATION,
  ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_RESPONSE_BYTES,
} from './originalLanguageStudyV2DraftContract.js';

export const originalLanguageStudyV2DraftInputSchema = {
  type: 'object',
  properties: {
    reference: { type: 'string', minLength: 1, maxLength: 100 },
    target: { type: 'string', minLength: 1, maxLength: 100 },
    position: { type: 'integer', minimum: 1, maximum: 200 },
    detail: { type: 'string', enum: ['summary', 'detailed'], default: 'summary' },
    cursor: {
      type: 'string', minLength: 1, maxLength: ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_MAX_LENGTH,
      pattern: '^olsv2c1_(?:[0-9a-f]{2})+$',
    },
  },
  required: ['reference', 'target'],
  additionalProperties: false,
} as const;

const resultWindow = {
  type: 'object',
  properties: {
    priorCount: { type: 'integer', minimum: 0, maximum: 1_000_000 },
    returnedCount: { type: 'integer', minimum: 0, maximum: 8 },
    consumedCount: { type: 'integer', minimum: 0, maximum: 1_000_000 },
    totalCount: { type: 'integer', minimum: 0, maximum: 1_000_000 },
    hasMore: { type: 'boolean' },
    continuation: {
      type: 'object',
      properties: {
        cursor: {
          type: 'string', minLength: 1, maxLength: ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_MAX_LENGTH,
          pattern: '^olsv2c1_(?:[0-9a-f]{2})+$',
        },
        operation: { const: ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_OPERATION },
      },
      required: ['cursor', 'operation'],
      additionalProperties: false,
    },
  },
  required: ['priorCount', 'returnedCount', 'consumedCount', 'totalCount', 'hasMore'],
  additionalProperties: false,
} as const;

const candidateIdentityProperties = {
  sourceId: { type: 'string', minLength: 1, maxLength: 128 },
  sourceRole: { const: 'dictionary' },
  entryId: { type: 'string', minLength: 1, maxLength: 128 },
  senseId: { type: 'string', minLength: 1, maxLength: 128 },
  sourceAttestedReferenceCount: { type: 'integer', minimum: 0, maximum: 16 },
  referenceEvidenceIds: {
    type: 'array', maxItems: 16, uniqueItems: true,
    items: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;
const candidateIdentityRequired = [
  'sourceId', 'sourceRole', 'entryId', 'senseId', 'sourceAttestedReferenceCount', 'referenceEvidenceIds',
] as const;

const summaryCandidate = {
  type: 'object',
  properties: { ...candidateIdentityProperties, detailStatus: { const: 'summary' } },
  required: [...candidateIdentityRequired, 'detailStatus'],
  additionalProperties: false,
} as const;

const omittedCandidate = {
  type: 'object',
  properties: { ...candidateIdentityProperties, detailStatus: { const: 'omitted_response_byte_budget' } },
  required: [...candidateIdentityRequired, 'detailStatus'],
  additionalProperties: false,
} as const;

const detailedCandidate = {
  type: 'object',
  properties: {
    ...candidateIdentityProperties,
    detailStatus: { const: 'detailed' },
    lemma: { type: 'string', minLength: 1, maxLength: 2_000 },
    definitionStatus: { enum: ['published', 'absent_in_source', 'excluded_unresolved_markup'] },
    definition: { type: 'string', minLength: 1, maxLength: 20_000 },
    definitionExclusionReasons: {
      type: 'array', maxItems: 8, uniqueItems: true,
      items: { enum: [
        'unsafe_attribution_markup', 'unsafe_note_markup',
        'malformed_lexical_link_markup', 'unvalidated_scripture_link_markup',
        'malformed_or_unknown_markup',
      ] },
    },
    glosses: {
      type: 'array', minItems: 1, maxItems: 16, uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 1_000 },
    },
    domains: {
      type: 'array', maxItems: 16,
      items: {
        type: 'object',
        properties: {
          sourceId: { type: 'string', minLength: 1, maxLength: 128 },
          sourceRole: { const: 'lexical_domains' },
          domainId: { type: 'string', minLength: 1, maxLength: 128 },
          label: { type: 'string', minLength: 1, maxLength: 1_000 },
          description: { type: 'string', minLength: 1, maxLength: 5_000 },
        },
        required: ['sourceId', 'sourceRole', 'domainId', 'label'],
        additionalProperties: false,
      },
    },
    domainTotal: { type: 'integer', minimum: 0, maximum: 1_000_000 },
    referenceEvidence: {
      type: 'array', maxItems: 16,
      items: {
        type: 'object',
        properties: {
          sourceId: { type: 'string', minLength: 1, maxLength: 128 },
          sourceRole: { const: 'dictionary' },
          senseId: { type: 'string', minLength: 1, maxLength: 128 },
          evidenceId: { type: 'string', minLength: 1, maxLength: 128 },
          sourceReference: { type: 'string', minLength: 1, maxLength: 100 },
          normalizedReference: { type: 'string', minLength: 1, maxLength: 100 },
          kind: { const: 'source_attested_sense_reference' },
        },
        required: ['sourceId', 'sourceRole', 'senseId', 'evidenceId', 'sourceReference', 'normalizedReference', 'kind'],
        additionalProperties: false,
      },
    },
    referenceEvidenceTotal: { type: 'integer', minimum: 0, maximum: 1_000_000 },
  },
  required: [...candidateIdentityRequired, 'detailStatus', 'lemma', 'definitionStatus',
    'definitionExclusionReasons', 'glosses', 'domains',
    'domainTotal', 'referenceEvidence', 'referenceEvidenceTotal'],
  allOf: [
    {
      if: { properties: { definitionStatus: { const: 'published' } }, required: ['definitionStatus'] },
      then: {
        required: ['definition'],
        properties: {
          definition: { type: 'string' },
          definitionExclusionReasons: { type: 'array', maxItems: 0 },
        },
      },
      else: { not: { required: ['definition'] } },
    },
    {
      if: { properties: { definitionStatus: { const: 'excluded_unresolved_markup' } }, required: ['definitionStatus'] },
      then: { properties: { definitionExclusionReasons: { type: 'array', minItems: 1 } } },
      else: { properties: { definitionExclusionReasons: { type: 'array', maxItems: 0 } } },
    },
  ],
  additionalProperties: false,
} as const;

const identity = {
  type: 'object',
  properties: {
    publicStrongs: { type: 'string', pattern: '^H(?:[1-9][0-9]{0,3})$' },
    sourceIdentity: { type: 'string', pattern: '^H(?!0000$)[0-9]{4}$' },
  },
  required: ['publicStrongs', 'sourceIdentity'],
  additionalProperties: false,
} as const;

function provenanceSource(
  role: 'dictionary' | 'lexical_domains',
  artifactName: 'UBSHebrewDic-v0.9.2-en.JSON' | 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON',
) {
  return {
    type: 'object',
    properties: {
      sourceId: { type: 'string', minLength: 1, maxLength: 128 },
      sourceRole: { const: role }, artifactName: { const: artifactName }, artifactVersion: { const: '0.9.2' },
      artifactIdentity: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      sourceUrl: { type: 'string', pattern: '^https://', maxLength: 1_000 },
      sourceCommit: { type: 'string', pattern: '^[0-9a-f]{40}$' },
      sourceBlob: { type: 'string', pattern: '^[0-9a-f]{40}$' },
      sourceSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      publisher: { const: 'United Bible Societies' }, license: { const: 'CC BY-SA 4.0' },
      licenseUrl: { const: 'https://creativecommons.org/licenses/by-sa/4.0/' },
      transformVersion: { const: 7 }, modified: { const: true },
      modificationNote: { type: 'string', minLength: 1, maxLength: 1_000 },
    },
    required: ['sourceId', 'sourceRole', 'artifactName', 'artifactVersion', 'artifactIdentity', 'sourceUrl',
      'sourceCommit', 'sourceBlob', 'sourceSha256', 'publisher', 'license', 'licenseUrl', 'transformVersion',
      'modified', 'modificationNote'],
    additionalProperties: false,
  } as const;
}

const provenance = {
  type: 'object',
  properties: {
    artifactIdentity: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    sources: {
      type: 'array', minItems: 2, maxItems: 2,
      prefixItems: [
        provenanceSource('dictionary', 'UBSHebrewDic-v0.9.2-en.JSON'),
        provenanceSource('lexical_domains', 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON'),
      ],
      items: false,
    },
  },
  required: ['artifactIdentity', 'sources'],
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
        status: { const: 'withheld_public_v2_scope' },
      }, required: ['source', 'field', 'status'], additionalProperties: false,
    },
  ],
  items: false,
} as const;

const alignmentArtifactSource = {
  type: 'object',
  properties: {
    sourceId: { type: 'string', minLength: 1, maxLength: 128 },
    sourceRole: { enum: ['dictionary', 'lexical_domains'] },
    artifactName: { enum: ['UBSHebrewDic-v0.9.2-en.JSON', 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON'] },
    artifactIdentity: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    artifactVersion: { const: '0.9.2' },
    sourceSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
  },
  required: ['sourceId', 'sourceRole', 'artifactName', 'artifactIdentity', 'artifactVersion', 'sourceSha256'],
  additionalProperties: false,
} as const;

const alignment = {
  type: 'object',
  properties: {
    status: { const: 'verified_token_alignment' },
    proofContract: { const: 'theologai-exact-hebrew-token-alignment.v1' },
    verifierVersion: { type: 'integer', minimum: 1, maximum: 1_000_000 },
    sourceIdentity: { type: 'string', pattern: '^H(?!0000$)[0-9]{4}$', minLength: 5, maxLength: 5 },
    normalizedReference: { type: 'string', minLength: 1, maxLength: 100 },
    artifactIdentity: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    artifactVersion: { const: '0.9.2' },
    artifactSources: {
      type: 'object', properties: { dictionary: alignmentArtifactSource, lexicalDomains: alignmentArtifactSource },
      required: ['dictionary', 'lexicalDomains'], additionalProperties: false,
    },
    sourceId: { type: 'string', minLength: 1, maxLength: 128 },
    entryId: { type: 'string', minLength: 1, maxLength: 128 },
    senseId: { type: 'string', minLength: 1, maxLength: 128 },
    evidenceId: { type: 'string', minLength: 1, maxLength: 128 },
    morphologyTokenIdentity: { type: 'string', minLength: 1, maxLength: 512 },
    morphologyTokenCoordinates: {
      type: 'object', properties: {
        canonicalReference: { type: 'string', minLength: 1, maxLength: 100 },
        normalizedReference: { type: 'string', minLength: 1, maxLength: 100 },
        position: { type: 'integer', minimum: 1, maximum: 200 },
      }, required: ['canonicalReference', 'normalizedReference', 'position'], additionalProperties: false,
    },
    morphologyTokenWitness: {
      type: 'object', properties: {
        text: { type: 'string', minLength: 1, maxLength: 2_000 },
        lemma: { type: 'string', minLength: 1, maxLength: 2_000 },
        strongsNumber: { type: ['string', 'null'], maxLength: 128 },
        morphologyCode: { type: ['string', 'null'], maxLength: 512 },
        gloss: { type: ['string', 'null'], maxLength: 2_000 },
      }, required: ['text', 'lemma', 'strongsNumber', 'morphologyCode', 'gloss'], additionalProperties: false,
    },
  },
  required: [
    'status', 'proofContract', 'verifierVersion', 'sourceIdentity', 'normalizedReference',
    'artifactIdentity', 'artifactVersion', 'artifactSources', 'sourceId', 'entryId', 'senseId', 'evidenceId',
    'morphologyTokenIdentity', 'morphologyTokenCoordinates', 'morphologyTokenWitness',
  ],
  additionalProperties: false,
} as const;

const repositoryCommon = {
  language: { const: 'Hebrew' }, plainLanguage: { type: 'string', minLength: 1, maxLength: 2_000 },
  identity, normalizedReference: { type: 'string', minLength: 1, maxLength: 100 },
  resultWindow, provenance, withheldEvidence,
} as const;
const repositoryRequired = [
  'language', 'status', 'plainLanguage', 'identity', 'normalizedReference', 'resultWindow', 'provenance', 'withheldEvidence',
] as const;

function semanticEvidenceSchema(candidate: typeof summaryCandidate | { readonly oneOf: readonly [typeof detailedCandidate, typeof omittedCandidate] }) {
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
          candidates: { type: 'array', minItems: 1, maxItems: 1, items: candidate }, alignmentEvidence: alignment,
        }, required: [...repositoryRequired, 'candidates', 'alignmentEvidence'], additionalProperties: false,
      },
    ],
  } as const;
}

function rootSchema(detail: 'summary' | 'detailed') {
  const candidate = detail === 'summary'
    ? summaryCandidate : { oneOf: [detailedCandidate, omittedCandidate] } as const;
  return {
    type: 'object',
    properties: {
      schemaVersion: { const: '2' }, kind: { const: 'original_language_study' }, detail: { const: detail },
      request: {
        type: 'object', properties: {
          reference: { type: 'string', minLength: 1, maxLength: 100 },
          target: { type: 'string', minLength: 1, maxLength: 100 },
          position: { type: 'integer', minimum: 1, maximum: 200 },
        }, required: ['reference', 'target'], additionalProperties: false,
      },
      study: originalLanguageStudyOutputSchema,
      semanticEvidence: semanticEvidenceSchema(candidate),
      responseWindow: {
        type: 'object', properties: {
          unit: { const: 'utf8_bytes' }, maximum: { const: ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_RESPONSE_BYTES },
          used: { type: 'integer', minimum: 1, maximum: ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_RESPONSE_BYTES },
          truncated: { const: false },
        }, required: ['unit', 'maximum', 'used', 'truncated'], additionalProperties: false,
      },
    },
    required: ['schemaVersion', 'kind', 'detail', 'request', 'study', 'semanticEvidence', 'responseWindow'],
    additionalProperties: false,
  } as const;
}

export const originalLanguageStudyV2DraftOutputSchema = {
  oneOf: [rootSchema('summary'), rootSchema('detailed')],
} as const;
