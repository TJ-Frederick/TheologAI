import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { CLASSIC_TEXT_LIMITS } from '../../kernel/classicTextContract.js';

const status = {
  type: 'string',
  enum: ['ok', 'no_results', 'unavailable', 'disabled', 'rate_limited', 'interface_changed', 'catalog_miss', 'unsupported_filter'],
} as const;

const resultWindow = {
  type: 'object',
  properties: {
    returnedHitCount: { type: 'integer', minimum: 0, maximum: 8 },
    additionalMatchStatus: {
      type: 'string',
      enum: ['additional_match_observed', 'no_additional_match_observed', 'not_evaluated'],
    },
  },
  required: ['returnedHitCount', 'additionalMatchStatus'],
  additionalProperties: false,
} as const;

const commonHit = {
  queryId: { type: 'string', minLength: 1, maxLength: 40 },
  title: { type: 'string', minLength: 1, maxLength: 300 },
  author: { type: 'string', minLength: 1, maxLength: 200 },
  sectionLabel: { type: 'string', minLength: 1, maxLength: 300 },
  snippet: { type: 'string', maxLength: 240 },
  rankWithinProvider: { type: 'integer', minimum: 1, maximum: 32 },
  page: { type: 'integer', minimum: 1, maximum: 3 },
  snippetOnly: { const: true },
  attribution: { type: 'string', minLength: 1, maxLength: 300 },
} as const;

const localHit = {
  type: 'object',
  properties: {
    ...commonHit,
    provider: { const: 'local' },
    locator: {
      type: 'object',
      properties: {
        kind: { const: 'mcp_resource' },
        uri: { type: 'string', minLength: 1, maxLength: 384 },
        documentId: { type: 'string', minLength: 1, maxLength: 160 },
        sectionId: { type: 'string', minLength: 1, maxLength: 160 },
      },
      required: ['kind', 'uri', 'documentId', 'sectionId'],
      additionalProperties: false,
    },
    resourceSizeBytes: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    documentType: { type: 'string', minLength: 1, maxLength: 100 },
    documentDate: { type: 'string', minLength: 1, maxLength: 100 },
    creators: {
      type: 'array', maxItems: 8, items: {
        type: 'object', properties: {
          name: { type: 'string', minLength: 1, maxLength: 160 },
          role: { type: 'string', enum: ['author', 'issuing_body', 'drafting_body', 'revising_body', 'compiler'] },
        }, required: ['name', 'role'], additionalProperties: false,
      },
    },
    metadataStatus: { type: 'string', enum: ['reviewed', 'anonymous', 'collective', 'unknown'] },
    metadataProvenanceIds: {
      type: 'array', minItems: 1, maxItems: 4, uniqueItems: true,
      items: { type: 'string', pattern: '^hist-meta-[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 100 },
    },
  },
  required: ['queryId', 'title', 'snippet', 'rankWithinProvider', 'page', 'snippetOnly', 'attribution', 'provider', 'locator', 'resourceSizeBytes'],
  additionalProperties: false,
} as const;

const externalHit = {
  type: 'object',
  properties: {
    ...commonHit,
    provider: { const: 'ccel_live' },
    locator: {
      type: 'object',
      properties: {
        kind: { const: 'external_url' },
        url: { type: 'string', minLength: 1, maxLength: 1024 },
      },
      required: ['kind', 'url'],
      additionalProperties: false,
    },
    metadataStatus: { const: 'provider_search_result_unreviewed' },
  },
  required: ['queryId', 'title', 'snippet', 'rankWithinProvider', 'page', 'snippetOnly', 'attribution', 'provider', 'locator', 'metadataStatus'],
  additionalProperties: false,
} as const;

const catalogScope = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['matched', 'catalog_miss', 'metadata_incomplete'] },
    requested: {
      type: 'object', properties: {
        work: { type: 'string', minLength: 1, maxLength: 160 },
        author: { type: 'string', minLength: 1, maxLength: 100 },
        startYear: { type: 'integer', minimum: -5000, maximum: 3000 },
        endYear: { type: 'integer', minimum: -5000, maximum: 3000 },
      }, additionalProperties: false,
    },
    eligibleDocumentCount: { type: 'integer', minimum: 0, maximum: CLASSIC_TEXT_LIMITS.workCount },
    eligibleDocuments: {
      type: 'array', maxItems: 5, items: {
        type: 'object', properties: {
          id: { type: 'string', minLength: 1, maxLength: 160 },
          title: { type: 'string', minLength: 1, maxLength: 300 },
          metadataStatus: { type: 'string', enum: ['reviewed', 'anonymous', 'collective', 'unknown'] },
        }, required: ['id', 'title', 'metadataStatus'], additionalProperties: false,
      },
    },
    eligibleDocumentsTruncated: { type: 'boolean' },
  },
  required: ['status', 'requested', 'eligibleDocumentCount', 'eligibleDocuments', 'eligibleDocumentsTruncated'],
  additionalProperties: false,
} as const;

const providerCommon = {
  status,
  searched: { type: 'boolean' },
  page: { type: 'integer', minimum: 1, maximum: 3 },
  hitCount: { type: 'integer', minimum: 0, maximum: 8 },
  resultWindow,
  notices: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 240 } },
} as const;

const localProvider = {
  type: 'object',
  properties: { ...providerCommon, provider: { const: 'local' }, scope: catalogScope, hits: { type: 'array', maxItems: 8, items: localHit } },
  required: ['provider', 'status', 'searched', 'page', 'hitCount', 'resultWindow', 'hits', 'notices'],
  additionalProperties: false,
} as const;

const externalProvider = {
  type: 'object',
  properties: {
    ...providerCommon,
    provider: { const: 'ccel_live' },
    retryAfterSeconds: { type: 'integer', minimum: 1, maximum: 86400 },
    hits: { type: 'array', maxItems: 5, items: externalHit },
  },
  required: ['provider', 'status', 'searched', 'page', 'hitCount', 'resultWindow', 'hits', 'notices'],
  allOf: [{
    if: { properties: { status: { const: 'rate_limited' } }, required: ['status'] },
    then: { required: ['retryAfterSeconds'] },
    else: { not: { required: ['retryAfterSeconds'] } },
  }],
  additionalProperties: false,
} as const;

export const primarySourceSearchV4OutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { const: '4' },
    kind: { const: 'primary_source_search' },
    planStatus: { type: 'string', enum: ['complete', 'partial', 'unavailable'] },
    responseWindow: {
      type: 'object',
      properties: {
        unit: { const: 'utf8_bytes' },
        maximum: { const: 32768 },
        truncated: { type: 'boolean' },
      },
      required: ['unit', 'maximum', 'truncated'],
      additionalProperties: false,
    },
    queries: {
      type: 'array', minItems: 1, maxItems: 4,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 40 },
          normalizedMode: { type: 'string', enum: ['all_terms', 'phrase'] },
          normalizedSelection: { type: 'string', enum: ['relevance', 'work_diversity'] },
          providers: { type: 'array', minItems: 1, maxItems: 2, items: { oneOf: [localProvider, externalProvider] } },
        },
        required: ['id', 'normalizedMode', 'normalizedSelection', 'providers'],
        additionalProperties: false,
      },
    },
    coverage: {
      type: 'object',
      properties: {
        localAttempted: { type: 'boolean' }, localStatus: status, localHitCount: { type: 'integer', minimum: 0, maximum: 32 },
        ccelAttempted: { type: 'boolean' }, ccelStatus: status, ccelHitCount: { type: 'integer', minimum: 0, maximum: 5 },
        notices: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 240 } },
      },
      required: ['localAttempted', 'localHitCount', 'ccelAttempted', 'ccelHitCount', 'notices'],
      additionalProperties: false,
    },
    evidencePolicy: {
      type: 'object',
      properties: {
        snippetUse: { const: 'discovery_only' },
        localSectionAccess: { const: 'mcp_resource_read' },
        externalSectionAccess: { const: 'direct_url_only' },
        coverageScope: { const: 'bounded_non_exhaustive' },
        externalRightsStatus: { const: 'not_determined' },
        lookupAliasUse: { const: 'exact_routing_only_not_metadata_evidence' },
      },
      required: ['snippetUse', 'localSectionAccess', 'externalSectionAccess', 'coverageScope', 'externalRightsStatus', 'lookupAliasUse'],
      additionalProperties: false,
    },
  },
  required: ['schemaVersion', 'kind', 'planStatus', 'responseWindow', 'queries', 'coverage', 'evidencePolicy'],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;
