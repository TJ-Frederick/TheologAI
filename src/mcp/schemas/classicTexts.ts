import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { CLASSIC_TEXT_LIMITS } from '../../kernel/classicTextContract.js';

const resourceLocator = {
  type: 'object',
  properties: {
    kind: { const: 'mcp_resource' },
    uri: { type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.resourceUriCharacters },
    resourceSizeBytes: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  },
  required: ['kind', 'uri', 'resourceSizeBytes'],
  additionalProperties: false,
} as const;

const unsizedResourceLocator = {
  type: 'object',
  properties: {
    kind: { const: 'mcp_resource' },
    uri: { type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.resourceUriCharacters },
  },
  required: ['kind', 'uri'],
  additionalProperties: false,
} as const;

const catalogWorkSummary = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.documentIdCharacters },
    title: { type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.titleCharacters },
    type: { type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.typeCharacters },
    date: { oneOf: [{ type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.dateCharacters }, { type: 'null' }] },
    topics: { type: 'array', maxItems: CLASSIC_TEXT_LIMITS.topicCount, items: { type: 'string', maxLength: CLASSIC_TEXT_LIMITS.topicCharacters } },
    deliveryMode: { type: 'string', enum: ['complete_document', 'sectioned_only'] },
    resource: unsizedResourceLocator,
  },
  required: ['id', 'title', 'type', 'date', 'topics', 'deliveryMode', 'resource'],
  additionalProperties: false,
} as const;

const workSummary = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.documentIdCharacters },
    title: { type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.titleCharacters },
    type: { type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.typeCharacters },
    date: { oneOf: [{ type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.dateCharacters }, { type: 'null' }] },
    topics: { type: 'array', maxItems: CLASSIC_TEXT_LIMITS.topicCount, items: { type: 'string', maxLength: CLASSIC_TEXT_LIMITS.topicCharacters } },
    deliveryMode: { const: 'complete_document' },
    resource: resourceLocator,
  },
  required: ['id', 'title', 'type', 'date', 'topics', 'deliveryMode', 'resource'],
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
    editionProvenance: { type: 'string', enum: ['incomplete', 'mixed_legacy_and_reviewed_source_packs', 'reviewed_exact_source_packs'] },
    rightsStatus: { type: 'string', enum: ['not_established', 'mixed_not_established_and_no_known_conflict', 'no_known_conflict_normalized_text_only'] },
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
  schemaVersion: { const: '2' },
  kind: { const: 'classic_text_lookup' },
  mode: { type: 'string', enum: ['list_works', 'browse_sections', 'work', 'landing', 'search'] },
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
    works: { type: 'array', maxItems: CLASSIC_TEXT_LIMITS.workCount, items: catalogWorkSummary },
    resultWindow: resultWindow(CLASSIC_TEXT_LIMITS.workCount),
  },
  required: ['coverage', 'delivery', 'nativeResourceLinks', 'works', 'resultWindow'],
  additionalProperties: false,
} as const;

const sectionDirectoryEntry = {
  type: 'object',
  properties: {
    sectionKey: { type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.sectionNumberCharacters },
    sourceOrdinal: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    legacyDisplayLabel: { type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.sectionNumberCharacters },
    heading: { type: 'string', maxLength: CLASSIC_TEXT_LIMITS.sectionTitleCharacters },
    resource: unsizedResourceLocator,
  },
  required: ['sectionKey', 'sourceOrdinal', 'legacyDisplayLabel', 'heading', 'resource'],
  additionalProperties: false,
} as const;

const browseSections = {
  type: 'object',
  properties: {
    coverage: { type: 'string', enum: ['complete_section_directory', 'bounded_section_directory'] },
    work: catalogWorkSummary,
    sections: { type: 'array', maxItems: CLASSIC_TEXT_LIMITS.sectionsPerWork, items: sectionDirectoryEntry },
    resultWindow: resultWindow(CLASSIC_TEXT_LIMITS.sectionsPerWork),
    linkWindow: {
      type: 'object',
      properties: {
        maximumResourceLinks: { const: CLASSIC_TEXT_LIMITS.nativeDirectoryLinks },
        emittedResourceLinkCount: { type: 'integer', minimum: 0, maximum: CLASSIC_TEXT_LIMITS.nativeDirectoryLinks },
        additionalLinkStatus: {
          type: 'string',
          enum: ['additional_link_observed', 'no_additional_link_observed'],
        },
      },
      required: ['maximumResourceLinks', 'emittedResourceLinkCount', 'additionalLinkStatus'],
      additionalProperties: false,
    },
    pagination: {
      type: 'object',
      properties: {
        pageSize: { const: 32 },
        nextCursor: { type: 'string', minLength: 1, maxLength: 2048 },
      },
      required: ['pageSize'],
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
    sectionCount: { type: 'integer', minimum: 0, maximum: CLASSIC_TEXT_LIMITS.sectionsPerWork },
    deliveryMode: { const: 'complete_document' },
    bodyDelivery: { const: 'markdown_only' },
  },
  required: ['work', 'sectionCount', 'deliveryMode', 'bodyDelivery'],
  additionalProperties: false,
} as const;

const searchHit = {
  type: 'object',
  properties: {
    rank: { type: 'integer', minimum: 1, maximum: CLASSIC_TEXT_LIMITS.searchHits },
    work: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.documentIdCharacters },
        title: { type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.titleCharacters },
        type: { type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.typeCharacters },
        date: { oneOf: [{ type: 'string', minLength: 1, maxLength: CLASSIC_TEXT_LIMITS.dateCharacters }, { type: 'null' }] },
        deliveryMode: { type: 'string', enum: ['complete_document', 'sectioned_only'] },
      },
      required: ['id', 'title', 'type', 'date', 'deliveryMode'],
      additionalProperties: false,
    },
    section: {
      ...sectionDirectoryEntry,
      properties: { ...sectionDirectoryEntry.properties, resource: resourceLocator },
    },
    discoverySnippet: { type: 'string', maxLength: CLASSIC_TEXT_LIMITS.discoverySnippetCharacters },
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
    hits: { type: 'array', maxItems: CLASSIC_TEXT_LIMITS.searchHits, items: searchHit },
    resultWindow: resultWindow(CLASSIC_TEXT_LIMITS.searchHits),
  },
  required: ['query', 'status', 'hits', 'resultWindow'],
  additionalProperties: false,
} as const;

const landing = {
  type: 'object',
  properties: {
    work: {
      ...catalogWorkSummary,
      properties: { ...catalogWorkSummary.properties, resource: resourceLocator, deliveryMode: { const: 'sectioned_only' } },
    },
    sectionCount: { type: 'integer', minimum: 1, maximum: CLASSIC_TEXT_LIMITS.sectionsPerWork },
    bodyDelivery: { const: 'exact_section_resource_only' },
    browse: {
      type: 'object', properties: { pageSize: { const: 32 }, cursor: { const: 'opaque_keyset_cursor' } },
      required: ['pageSize', 'cursor'], additionalProperties: false,
    },
  },
  required: ['work', 'sectionCount', 'bodyDelivery', 'browse'],
  additionalProperties: false,
} as const;

export const classicTextsOutputSchema = {
  type: 'object',
  properties: {
    ...commonProperties,
    catalog: listWorks,
    directory: browseSections,
    document: work,
    landing,
    search,
  },
  required: ['schemaVersion', 'kind', 'mode', 'evidencePolicy'],
  oneOf: [
    branch('list_works', 'catalog', listWorks),
    branch('browse_sections', 'directory', browseSections),
    branch('work', 'document', work),
    branch('landing', 'landing', landing),
    branch('search', 'search', search),
  ],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;
