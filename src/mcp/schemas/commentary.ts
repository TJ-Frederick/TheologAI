import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type {
  CanonicalCommentator,
  CommentaryCoverageEvidence,
} from '../../kernel/types.js';
import type { ProvenanceRecord } from '../../kernel/provenance.js';
import {
  COMMENTARY_CATALOG,
  HELLOAO_COMMENTARY_DELIVERY,
  HELLOAO_COMMENTARY_DELIVERY_ID,
  type CommentaryCatalogEntry,
} from '../../kernel/commentaryCatalog.js';

export interface CommentaryOutputV1 {
  [key: string]: unknown;
  schemaVersion: '1';
  kind: 'commentary_lookup';
  requestedReference: string;
  resolvedReference: string;
  query: {
    commentator: CanonicalCommentator;
    maxResponseCharacters: number | null;
  };
  coverage: CommentaryCoverageEvidence & { sectionSpanClaim: 'none' };
  commentary: {
    commentator: CanonicalCommentator;
    text: string;
    textFormat: 'text/markdown';
    textWindow: {
      unit: 'unicode_code_points';
      returnedCharacters: number;
      sourceCharacters: number;
      truncated: boolean;
    };
    provenanceIds: [string, typeof HELLOAO_COMMENTARY_DELIVERY_ID];
  };
  retrieval: {
    mode: 'remote_cached_or_live';
    providerId: typeof HELLOAO_COMMENTARY_DELIVERY_ID;
    providerRevision: `sha256:${string}`;
    cacheStatus: 'not_exposed';
  };
  provenance: [ProvenanceRecord, ProvenanceRecord];
}

const chapterCoverageSchema = {
  type: 'object',
  properties: {
    requestedScope: { type: 'string', const: 'chapter' },
    returnedGranularity: { type: 'string', const: 'chapter_aggregate' },
    identityBasis: { type: 'string', const: 'provider_chapter_payload' },
    providerIdentity: {
      type: 'object',
      properties: {
        field: { type: 'string', const: 'chapter_payload' },
        chapter: { type: 'integer', minimum: 1, maximum: 150 },
      },
      required: ['field', 'chapter'], additionalProperties: false,
    },
    sectionSpanClaim: { type: 'string', const: 'none' },
  },
  required: ['requestedScope', 'returnedGranularity', 'identityBasis', 'providerIdentity', 'sectionSpanClaim'],
  additionalProperties: false,
};

const verseNumberCoverageSchema = {
  type: 'object',
  properties: {
    requestedScope: { type: 'string', const: 'verse' },
    returnedGranularity: { type: 'string', const: 'exact_verse' },
    identityBasis: { type: 'string', const: 'provider_verse_number' },
    providerIdentity: {
      type: 'object',
      properties: {
        field: { type: 'string', const: 'verseNumber' },
        value: { type: 'integer', minimum: 1, maximum: 176 },
      },
      required: ['field', 'value'], additionalProperties: false,
    },
    sectionSpanClaim: { type: 'string', const: 'none' },
  },
  required: ['requestedScope', 'returnedGranularity', 'identityBasis', 'providerIdentity', 'sectionSpanClaim'],
  additionalProperties: false,
};

const typedNumberCoverageSchema = {
  type: 'object',
  properties: {
    requestedScope: { type: 'string', const: 'verse' },
    returnedGranularity: { type: 'string', const: 'exact_verse' },
    identityBasis: { type: 'string', const: 'provider_typed_verse_number' },
    providerIdentity: {
      type: 'object',
      properties: {
        field: { type: 'string', const: 'number' },
        value: { type: 'integer', minimum: 1, maximum: 176 },
        entryType: { type: 'string', const: 'verse' },
      },
      required: ['field', 'value', 'entryType'], additionalProperties: false,
    },
    sectionSpanClaim: { type: 'string', const: 'none' },
  },
  required: ['requestedScope', 'returnedGranularity', 'identityBasis', 'providerIdentity', 'sectionSpanClaim'],
  additionalProperties: false,
};

function exactProvenanceRecordSchema(record: ProvenanceRecord) {
  const properties = Object.fromEntries(Object.entries(record).map(([key, value]) => [
    key,
    key === 'license' && typeof value === 'object' && value !== null
      ? {
        type: 'object',
        properties: Object.fromEntries(Object.entries(value).map(([licenseKey, licenseValue]) => [
          licenseKey, { type: 'string', const: licenseValue },
        ])),
        required: Object.keys(value),
        additionalProperties: false,
      }
      : { type: typeof value, const: value },
  ]));
  return { type: 'object', properties, required: Object.keys(record), additionalProperties: false };
}

function allowedCoverageSchemas(entry: CommentaryCatalogEntry) {
  if (entry.scalarPolicy.kind === 'chapter_only') return [chapterCoverageSchema];
  if (entry.scalarPolicy.kind === 'verse_number_only') {
    return [chapterCoverageSchema, verseNumberCoverageSchema];
  }
  return [chapterCoverageSchema, verseNumberCoverageSchema, typedNumberCoverageSchema];
}

const commentatorVariants = COMMENTARY_CATALOG.map(entry => ({
  type: 'object',
  properties: {
    query: {
      type: 'object',
      properties: { commentator: { type: 'string', const: entry.canonicalName } },
      required: ['commentator'],
    },
    coverage: { oneOf: allowedCoverageSchemas(entry) },
    commentary: {
      type: 'object',
      properties: {
        commentator: { type: 'string', const: entry.canonicalName },
        provenanceIds: {
          type: 'array', const: [entry.workProvenance.id, HELLOAO_COMMENTARY_DELIVERY_ID],
        },
      },
      required: ['commentator', 'provenanceIds'],
    },
    provenance: {
      type: 'array',
      const: [entry.workProvenance, HELLOAO_COMMENTARY_DELIVERY],
    },
  },
  required: ['query', 'coverage', 'commentary', 'provenance'],
}));

const commentatorNames = COMMENTARY_CATALOG.map(entry => entry.canonicalName);
const workProvenanceIds = COMMENTARY_CATALOG.map(entry => entry.workProvenance.id);

export const commentaryOutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string', const: '1' },
    kind: { type: 'string', const: 'commentary_lookup' },
    requestedReference: { type: 'string', minLength: 1, maxLength: 100 },
    resolvedReference: { type: 'string', minLength: 1, maxLength: 100 },
    query: {
      type: 'object',
      properties: {
        commentator: { type: 'string', enum: commentatorNames },
        maxResponseCharacters: {
          oneOf: [{ type: 'integer', minimum: 1, maximum: 100_000 }, { type: 'null' }],
        },
      },
      required: ['commentator', 'maxResponseCharacters'], additionalProperties: false,
    },
    coverage: {
      oneOf: [chapterCoverageSchema, verseNumberCoverageSchema, typedNumberCoverageSchema],
    },
    commentary: {
      type: 'object',
      properties: {
        commentator: { type: 'string', enum: commentatorNames },
        text: { type: 'string', minLength: 1, maxLength: 2 * 1024 * 1024 },
        textFormat: { type: 'string', const: 'text/markdown' },
        textWindow: {
          type: 'object',
          properties: {
            unit: { type: 'string', const: 'unicode_code_points' },
            returnedCharacters: { type: 'integer', minimum: 1, maximum: 2 * 1024 * 1024 },
            sourceCharacters: { type: 'integer', minimum: 1, maximum: 2 * 1024 * 1024 },
            truncated: { type: 'boolean' },
          },
          required: ['unit', 'returnedCharacters', 'sourceCharacters', 'truncated'], additionalProperties: false,
        },
        provenanceIds: {
          type: 'array', minItems: 2, maxItems: 2, uniqueItems: true,
          items: { type: 'string', enum: [...workProvenanceIds, HELLOAO_COMMENTARY_DELIVERY_ID] },
        },
      },
      required: ['commentator', 'text', 'textFormat', 'textWindow', 'provenanceIds'],
      additionalProperties: false,
    },
    retrieval: {
      type: 'object',
      properties: {
        mode: { type: 'string', const: 'remote_cached_or_live' },
        providerId: { type: 'string', const: HELLOAO_COMMENTARY_DELIVERY_ID },
        providerRevision: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
        cacheStatus: { type: 'string', const: 'not_exposed' },
      },
      required: ['mode', 'providerId', 'providerRevision', 'cacheStatus'], additionalProperties: false,
    },
    provenance: {
      type: 'array', minItems: 2, maxItems: 2, uniqueItems: true,
      items: {
        oneOf: [
          ...COMMENTARY_CATALOG.map(entry => exactProvenanceRecordSchema(entry.workProvenance)),
          exactProvenanceRecordSchema(HELLOAO_COMMENTARY_DELIVERY),
        ],
      },
    },
  },
  required: [
    'schemaVersion', 'kind', 'requestedReference', 'resolvedReference', 'query',
    'coverage', 'commentary', 'retrieval', 'provenance',
  ],
  additionalProperties: false,
  allOf: [{ oneOf: commentatorVariants }],
} as NonNullable<Tool['outputSchema']>;
