import type { Tool } from '@modelcontextprotocol/sdk/types.js';

const status = {
  type: 'string',
  enum: ['ok', 'no_results', 'unavailable', 'disabled', 'rate_limited', 'interface_changed', 'catalog_miss', 'unsupported_filter'],
} as const;

const localLocator = {
  type: 'object',
  properties: {
    kind: { const: 'local_section' },
    url: { type: 'string', maxLength: 384 },
    documentId: { type: 'string', minLength: 1, maxLength: 160 },
    sectionId: { type: 'string', minLength: 1, maxLength: 160 },
  },
  required: ['kind', 'url', 'documentId', 'sectionId'],
  additionalProperties: false,
} as const;

const commonHitProperties = {
  queryId: { type: 'string', minLength: 1, maxLength: 40 },
  title: { type: 'string', minLength: 1, maxLength: 300 },
  author: { type: 'string', minLength: 1, maxLength: 200 },
  sectionLabel: { type: 'string', minLength: 1, maxLength: 300 },
  snippet: { type: 'string', maxLength: 500 },
  rankWithinProvider: { type: 'integer', minimum: 1, maximum: 32 },
  page: { type: 'integer', minimum: 1, maximum: 3 },
  snippetOnly: { const: true },
  attribution: { type: 'string', minLength: 1, maxLength: 300 },
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
    eligibleDocumentCount: { type: 'integer', minimum: 0, maximum: 17 },
    eligibleDocuments: {
      type: 'array', maxItems: 8, items: {
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

const commonHitRequired = [
  'queryId', 'title', 'snippet', 'rankWithinProvider', 'page', 'snippetOnly', 'attribution',
] as const;

const localHit = {
  type: 'object',
  properties: {
    ...commonHitProperties,
    provider: { const: 'local' },
    locator: localLocator,
    resourceSizeBytes: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  },
  required: [...commonHitRequired, 'provider', 'locator', 'resourceSizeBytes'],
  additionalProperties: false,
} as const;

const providerProperties = {
  status,
  searched: { type: 'boolean' },
  page: { type: 'integer', minimum: 1, maximum: 3 },
  hitCount: { type: 'integer', minimum: 0, maximum: 8 },
  resultWindow: {
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
  },
  notices: { type: 'array', maxItems: 16, items: { type: 'string', maxLength: 500 } },
} as const;

const provider = {
  type: 'object',
  properties: {
    ...providerProperties,
    provider: { const: 'local' },
    scope: catalogScope,
    hits: { type: 'array', maxItems: 8, items: localHit },
  },
  required: ['provider', 'status', 'searched', 'page', 'hitCount', 'resultWindow', 'hits', 'notices'],
  additionalProperties: false,
} as const;

export const primarySourceSearchOutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { const: '3' },
    kind: { const: 'primary_source_search' },
    planStatus: { type: 'string', enum: ['complete', 'partial', 'unavailable'] },
    queries: {
      type: 'array', minItems: 1, maxItems: 4,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 40 },
          normalizedMode: { type: 'string', enum: ['all_terms', 'phrase'] },
          normalizedSelection: { type: 'string', enum: ['relevance', 'work_diversity'] },
          providers: { type: 'array', minItems: 1, maxItems: 1, items: provider },
        },
        required: ['id', 'normalizedMode', 'normalizedSelection', 'providers'],
        additionalProperties: false,
      },
    },
    coverage: {
      type: 'object',
      properties: {
        localAttempted: { type: 'boolean' },
        localStatus: status,
        localHitCount: { type: 'integer', minimum: 0, maximum: 32 },
        notices: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 500 } },
      },
      required: ['localAttempted', 'localHitCount', 'notices'],
      additionalProperties: false,
    },
    evidencePolicy: {
      type: 'object',
      properties: {
        snippetUse: { const: 'discovery_only' },
        selectedSectionAccess: { const: 'mcp_resource_read' },
        coverageScope: { const: 'bounded_non_exhaustive' },
        editionProvenance: { const: 'incomplete' },
        lookupAliasUse: { const: 'exact_routing_only_not_metadata_evidence' },
      },
      required: ['snippetUse', 'selectedSectionAccess', 'coverageScope', 'editionProvenance', 'lookupAliasUse'],
      additionalProperties: false,
    },
  },
  required: ['schemaVersion', 'kind', 'planStatus', 'queries', 'coverage', 'evidencePolicy'],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;
