import type { Tool } from '@modelcontextprotocol/sdk/types.js';

const status = {
  type: 'string',
  enum: ['ok', 'no_results', 'unavailable', 'disabled', 'rate_limited', 'interface_changed', 'unsupported_filter'],
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

const ccelLocator = {
  type: 'object',
  properties: {
    kind: { const: 'ccel_section' },
    url: { type: 'string', maxLength: 2_048 },
    work: { type: 'string', minLength: 1, maxLength: 160 },
    section: { type: 'string', minLength: 1, maxLength: 160 },
  },
  required: ['kind', 'url', 'work', 'section'],
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
} as const;

const commonHitRequired = [
  'queryId', 'title', 'snippet', 'rankWithinProvider', 'page', 'snippetOnly', 'attribution',
] as const;

const hit = {
  oneOf: [
    {
      type: 'object',
      properties: {
        ...commonHitProperties,
        provider: { const: 'local' },
        locator: localLocator,
        resourceSizeBytes: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      },
      required: [...commonHitRequired, 'provider', 'locator', 'resourceSizeBytes'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        ...commonHitProperties,
        provider: { const: 'ccel_live' },
        locator: ccelLocator,
      },
      required: [...commonHitRequired, 'provider', 'locator'],
      additionalProperties: false,
    },
  ],
} as const;

const provider = {
  type: 'object',
  properties: {
    provider: { type: 'string', enum: ['local', 'ccel_live'] },
    status,
    searched: { type: 'boolean' },
    page: { type: 'integer', minimum: 1, maximum: 3 },
    hitCount: { type: 'integer', minimum: 0, maximum: 8 },
    hits: { type: 'array', maxItems: 8, items: hit },
    notices: { type: 'array', maxItems: 16, items: { type: 'string', maxLength: 500 } },
  },
  required: ['provider', 'status', 'searched', 'page', 'hitCount', 'hits', 'notices'],
  additionalProperties: false,
} as const;

export const primarySourceSearchOutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { const: '1' },
    kind: { const: 'primary_source_search' },
    planStatus: { type: 'string', enum: ['complete', 'partial', 'unavailable'] },
    queries: {
      type: 'array', minItems: 1, maxItems: 4,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 40 },
          normalizedMode: { type: 'string', enum: ['all_terms', 'phrase'] },
          providers: { type: 'array', minItems: 1, maxItems: 2, items: provider },
        },
        required: ['id', 'normalizedMode', 'providers'],
        additionalProperties: false,
      },
    },
    coverage: {
      type: 'object',
      properties: {
        localAttempted: { type: 'boolean' },
        localStatus: status,
        localHitCount: { type: 'integer', minimum: 0, maximum: 32 },
        ccelAttempted: { type: 'boolean' },
        ccelStatus: status,
        ccelHitCount: { type: 'integer', minimum: 0, maximum: 32 },
        notices: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 500 } },
      },
      required: ['localAttempted', 'localHitCount', 'ccelAttempted', 'ccelHitCount', 'notices'],
      additionalProperties: false,
    },
    evidencePolicy: {
      type: 'object',
      properties: {
        snippetUse: { const: 'discovery_only' },
        selectedSectionAccess: { const: 'mcp_resource_read' },
        coverageScope: { const: 'bounded_non_exhaustive' },
        editionProvenance: { const: 'incomplete' },
      },
      required: ['snippetUse', 'selectedSectionAccess', 'coverageScope', 'editionProvenance'],
      additionalProperties: false,
    },
  },
  required: ['schemaVersion', 'kind', 'planStatus', 'queries', 'coverage', 'evidencePolicy'],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;
