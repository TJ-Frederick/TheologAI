import type { Tool } from '@modelcontextprotocol/sdk/types.js';

const resourceLocator = {
  type: 'object',
  properties: {
    kind: { const: 'mcp_resource' },
    uri: { type: 'string', minLength: 1, maxLength: 384 },
    resourceSizeBytes: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  },
  required: ['kind', 'uri', 'resourceSizeBytes'],
  additionalProperties: false,
} as const;

const unsizedResourceLocator = {
  type: 'object',
  properties: {
    kind: { const: 'mcp_resource' },
    uri: { type: 'string', minLength: 1, maxLength: 384 },
  },
  required: ['kind', 'uri'],
  additionalProperties: false,
} as const;

const catalogWorkSummary = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 160 },
    title: { type: 'string', minLength: 1, maxLength: 300 },
    type: { type: 'string', minLength: 1, maxLength: 100 },
    date: { oneOf: [{ type: 'string', minLength: 1, maxLength: 100 }, { type: 'null' }] },
    topics: { type: 'array', maxItems: 64, items: { type: 'string', maxLength: 160 } },
    resource: unsizedResourceLocator,
  },
  required: ['id', 'title', 'type', 'date', 'topics', 'resource'],
  additionalProperties: false,
} as const;

const workSummary = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 160 },
    title: { type: 'string', minLength: 1, maxLength: 300 },
    type: { type: 'string', minLength: 1, maxLength: 100 },
    date: { oneOf: [{ type: 'string', minLength: 1, maxLength: 100 }, { type: 'null' }] },
    topics: { type: 'array', maxItems: 64, items: { type: 'string', maxLength: 160 } },
    resource: resourceLocator,
  },
  required: ['id', 'title', 'type', 'date', 'topics', 'resource'],
  additionalProperties: false,
} as const;

const resultWindow = (maximum: number) => ({
  type: 'object',
  properties: {
    returnedCount: { type: 'integer', minimum: 0, maximum },
    additionalMatchStatus: {
      type: 'string',
      enum: ['additional_match_observed', 'no_additional_match_observed'],
    },
  },
  required: ['returnedCount', 'additionalMatchStatus'],
  additionalProperties: false,
} as const);

const evidencePolicy = {
  type: 'object',
  properties: {
    providerScope: { const: 'local_only' },
    remoteDocumentBodies: { const: 'disabled' },
    editionProvenance: { const: 'incomplete' },
    rightsStatus: { const: 'not_established' },
    searchSnippets: { const: 'discovery_only' },
    selectedContentAccess: { const: 'mcp_resource_read' },
  },
  required: [
    'providerScope', 'remoteDocumentBodies', 'editionProvenance', 'rightsStatus',
    'searchSnippets', 'selectedContentAccess',
  ],
  additionalProperties: false,
} as const;

const commonProperties = {
  schemaVersion: { const: '1' },
  kind: { const: 'classic_text_lookup' },
  mode: { type: 'string', enum: ['list_works', 'browse_sections', 'work', 'search'] },
  evidencePolicy,
} as const;

const branch = (mode: string, property: string, value: object) => ({
  type: 'object',
  properties: {
    ...commonProperties,
    mode: { const: mode },
    [property]: value,
  },
  required: ['schemaVersion', 'kind', 'mode', 'evidencePolicy', property],
  additionalProperties: false,
});

const listWorks = {
  type: 'object',
  properties: {
    coverage: { const: 'complete_local_work_inventory' },
    delivery: { const: 'metadata_summary' },
    nativeResourceLinks: { const: 'not_emitted' },
    works: { type: 'array', maxItems: 100, items: catalogWorkSummary },
    resultWindow: resultWindow(100),
  },
  required: ['coverage', 'delivery', 'nativeResourceLinks', 'works', 'resultWindow'],
  additionalProperties: false,
} as const;

const sectionDirectoryEntry = {
  type: 'object',
  properties: {
    id: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    sectionNumber: { type: 'string', maxLength: 160 },
    title: { type: 'string', maxLength: 300 },
    resource: unsizedResourceLocator,
  },
  required: ['id', 'sectionNumber', 'title', 'resource'],
  additionalProperties: false,
} as const;

const browseSections = {
  type: 'object',
  properties: {
    coverage: { const: 'complete_section_directory' },
    work: catalogWorkSummary,
    sections: { type: 'array', maxItems: 2000, items: sectionDirectoryEntry },
    resultWindow: resultWindow(2000),
    linkWindow: {
      type: 'object',
      properties: {
        maximumResourceLinks: { const: 32 },
        emittedResourceLinkCount: { type: 'integer', minimum: 0, maximum: 32 },
        additionalLinkStatus: {
          type: 'string',
          enum: ['additional_link_observed', 'no_additional_link_observed'],
        },
      },
      required: ['maximumResourceLinks', 'emittedResourceLinkCount', 'additionalLinkStatus'],
      additionalProperties: false,
    },
  },
  required: ['coverage', 'work', 'sections', 'resultWindow', 'linkWindow'],
  additionalProperties: false,
} as const;

const work = {
  type: 'object',
  properties: {
    work: workSummary,
    sectionCount: { type: 'integer', minimum: 0, maximum: 2000 },
    bodyDelivery: { const: 'markdown_only' },
  },
  required: ['work', 'sectionCount', 'bodyDelivery'],
  additionalProperties: false,
} as const;

const searchHit = {
  type: 'object',
  properties: {
    rank: { type: 'integer', minimum: 1, maximum: 10 },
    work: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 160 },
        title: { type: 'string', minLength: 1, maxLength: 300 },
        type: { type: 'string', minLength: 1, maxLength: 100 },
        date: { oneOf: [{ type: 'string', minLength: 1, maxLength: 100 }, { type: 'null' }] },
      },
      required: ['id', 'title', 'type', 'date'],
      additionalProperties: false,
    },
    section: {
      ...sectionDirectoryEntry,
      properties: { ...sectionDirectoryEntry.properties, resource: resourceLocator },
    },
    discoverySnippet: { type: 'string', maxLength: 303 },
    snippetOnly: { const: true },
  },
  required: ['rank', 'work', 'section', 'discoverySnippet', 'snippetOnly'],
  additionalProperties: false,
} as const;

const search = {
  type: 'object',
  properties: {
    query: { type: 'string', minLength: 1, maxLength: 500 },
    status: { type: 'string', enum: ['ok', 'no_results'] },
    hits: { type: 'array', maxItems: 10, items: searchHit },
    resultWindow: resultWindow(10),
  },
  required: ['query', 'status', 'hits', 'resultWindow'],
  additionalProperties: false,
} as const;

export const classicTextsOutputSchema = {
  type: 'object',
  properties: {
    ...commonProperties,
    catalog: listWorks,
    directory: browseSections,
    document: work,
    search,
  },
  required: ['schemaVersion', 'kind', 'mode', 'evidencePolicy'],
  oneOf: [
    branch('list_works', 'catalog', listWorks),
    branch('browse_sections', 'directory', browseSections),
    branch('work', 'document', work),
    branch('search', 'search', search),
  ],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;
