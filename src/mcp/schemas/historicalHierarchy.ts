/**
 * Dormant output schema for a future hierarchy-node delivery surface.
 * It is intentionally not registered by src/mcp/server.ts in Transform-10 PR A.
 *
 * Every object is closed. This schema is the exact serialized contract emitted
 * by historicalHierarchyStructured.ts, not an open-ended metadata envelope.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { HISTORICAL_HIERARCHY_RESOURCE_URI_MAX_LENGTH } from '../../kernel/historicalHierarchyResource.js';

const SAFE_SLUG = '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$';
const SAFE_KEY = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$';
const SHA256 = '^[0-9a-f]{64}$';
const NODE_URI = '^theologai://documents/[A-Za-z0-9][A-Za-z0-9._-]{0,159}#node-[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$';
const LANDING_URI = '^theologai://documents/[A-Za-z0-9][A-Za-z0-9._-]{0,159}$';

const boundedText = { type: 'string', minLength: 1, maxLength: 500 } as const;
const safeKey = { type: 'string', pattern: SAFE_KEY } as const;
const nullableSafeKey = { oneOf: [safeKey, { type: 'null' }] } as const;
const sha256 = { type: 'string', pattern: SHA256 } as const;

const resource = {
  type: 'object',
  properties: {
    kind: { const: 'mcp_resource' },
    uri: {
      type: 'string',
      minLength: 1,
      maxLength: HISTORICAL_HIERARCHY_RESOURCE_URI_MAX_LENGTH,
      pattern: NODE_URI,
    },
  },
  required: ['kind', 'uri'],
  additionalProperties: false,
} as const;

const node = {
  type: 'object',
  properties: {
    nodeKey: safeKey,
    parentNodeKey: nullableSafeKey,
    nodeKind: { type: 'string', maxLength: 80, pattern: SAFE_KEY },
    bodyKey: nullableSafeKey,
    depth: { type: 'integer', minimum: 1, maximum: 32 },
    flatOrdinal: { type: 'integer', minimum: 1 },
    siblingOrdinal: { type: 'integer', minimum: 1 },
    label: boundedText,
    heading: boundedText,
    resource,
  },
  required: ['nodeKey', 'parentNodeKey', 'nodeKind', 'bodyKey', 'depth', 'flatOrdinal', 'siblingOrdinal', 'label', 'heading', 'resource'],
  additionalProperties: false,
} as const;

const discoveryNode = {
  type: 'object',
  properties: {
    nodeKey: safeKey,
    nodeKind: { type: 'string', maxLength: 80, pattern: SAFE_KEY },
    label: boundedText,
    resource,
  },
  required: ['nodeKey', 'nodeKind', 'label', 'resource'],
  additionalProperties: false,
} as const;

const creator = {
  type: 'object',
  properties: {
    name: boundedText,
    role: { type: 'string', minLength: 1, maxLength: 80 },
  },
  required: ['name', 'role'],
  additionalProperties: false,
} as const;

const publicationMetadata = {
  type: 'object',
  properties: {
    creators: { type: 'array', minItems: 1, maxItems: 32, items: creator },
    documentType: { type: 'string', minLength: 1, maxLength: 80 },
    language: { type: 'string', minLength: 1, maxLength: 80 },
    editionLabel: { type: 'string', minLength: 1, maxLength: 1_000 },
    rightsStatus: { type: 'string', minLength: 1, maxLength: 80 },
    territoryCaveat: { type: 'string', minLength: 1, maxLength: 2_000 },
  },
  required: ['creators', 'documentType', 'language', 'editionLabel', 'rightsStatus', 'territoryCaveat'],
  additionalProperties: false,
} as const;

const coverageAddress = {
  type: 'object',
  properties: {
    scheme: { type: 'string', minLength: 1, maxLength: 80, pattern: SAFE_KEY },
    start: boundedText,
    end: { oneOf: [boundedText, { type: 'null' }] },
  },
  required: ['scheme', 'start', 'end'],
  additionalProperties: false,
} as const;

const coverageDescriptor = {
  type: 'object',
  properties: {
    relationship: { enum: ['included', 'excluded'] },
    label: boundedText,
    address: coverageAddress,
  },
  required: ['relationship', 'label', 'address'],
  additionalProperties: false,
} as const;

const publicationCoverage = {
  type: 'object',
  properties: {
    statement: { type: 'string', minLength: 1, maxLength: 4_000 },
    completeness: { type: 'string', minLength: 1, maxLength: 160 },
    descriptors: { type: 'array', minItems: 1, maxItems: 64, items: coverageDescriptor },
  },
  required: ['statement', 'completeness', 'descriptors'],
  additionalProperties: false,
} as const;

const publication = {
  type: 'object',
  properties: {
    publicationId: safeKey,
    slug: { type: 'string', pattern: SAFE_SLUG },
    title: boundedText,
    canonicalUri: {
      type: 'string',
      minLength: 1,
      maxLength: HISTORICAL_HIERARCHY_RESOURCE_URI_MAX_LENGTH,
      pattern: LANDING_URI,
    },
    deliveryKind: { const: 'hierarchy_nodes_v1' },
    activationState: { const: 'dormant' },
    metadata: publicationMetadata,
    coverage: publicationCoverage,
  },
  required: ['publicationId', 'slug', 'title', 'canonicalUri', 'deliveryKind', 'activationState', 'metadata', 'coverage'],
  additionalProperties: false,
} as const;

const provenanceDisclosure = {
  type: 'object',
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 80, pattern: SAFE_KEY },
    values: {
      type: 'array',
      minItems: 1,
      maxItems: 32,
      items: { type: 'string', minLength: 1, maxLength: 2_000 },
    },
  },
  required: ['label', 'values'],
  additionalProperties: false,
} as const;

const authorityProvenance = {
  type: 'object',
  properties: {
    status: { const: 'local_only_inactive' },
    rightsStatus: { type: 'string', minLength: 1, maxLength: 80 },
    territoryCaveat: { type: 'string', minLength: 1, maxLength: 2_000 },
    catalogStatement: { type: 'string', minLength: 1, maxLength: 2_000 },
    sourceLabel: boundedText,
    disclosures: { type: 'array', minItems: 1, maxItems: 32, items: provenanceDisclosure },
    activation: { type: 'string', minLength: 1, maxLength: 2_000 },
  },
  required: ['status', 'rightsStatus', 'territoryCaveat', 'catalogStatement', 'sourceLabel', 'disclosures', 'activation'],
  additionalProperties: false,
} as const;

const authority = {
  type: 'object',
  properties: {
    hierarchyId: safeKey,
    editionId: safeKey,
    availability: { const: 'local_only_inactive' },
    provenance: authorityProvenance,
  },
  required: ['hierarchyId', 'editionId', 'availability', 'provenance'],
  additionalProperties: false,
} as const;

const responseWindow = {
  type: 'object',
  properties: {
    unit: { const: 'utf8_bytes' },
    maximum: { type: 'integer', minimum: 1_024, maximum: 131_072 },
  },
  required: ['unit', 'maximum'],
  additionalProperties: false,
} as const;

const directBody = {
  type: 'object',
  properties: {
    bodyKey: safeKey,
    bodyKind: { type: 'string', maxLength: 80, pattern: SAFE_KEY },
    sourceOrdinal: { type: 'integer', minimum: 1 },
    heading: boundedText,
    contentSha256: sha256,
    contentUtf8Bytes: { type: 'integer', minimum: 1, maximum: 131_072 },
    content: { type: 'string', minLength: 1, maxLength: 131_072 },
  },
  required: ['bodyKey', 'bodyKind', 'sourceOrdinal', 'heading', 'contentSha256', 'contentUtf8Bytes', 'content'],
  additionalProperties: false,
} as const;

const searchBody = {
  type: 'object',
  properties: {
    bodyKey: safeKey,
    heading: boundedText,
    contentSha256: sha256,
  },
  required: ['bodyKey', 'heading', 'contentSha256'],
  additionalProperties: false,
} as const;

const searchHit = {
  type: 'object',
  properties: {
    rank: { type: 'integer', minimum: 1, maximum: 9 },
    score: { type: 'number' },
    node: discoveryNode,
    breadcrumb: { type: 'array', minItems: 1, maxItems: 32, items: discoveryNode },
    body: searchBody,
    snippet: { type: 'string', maxLength: 320 },
    snippetOnly: { const: true },
  },
  required: ['rank', 'score', 'node', 'breadcrumb', 'body', 'snippet', 'snippetOnly'],
  additionalProperties: false,
} as const;

const common = {
  schemaVersion: { const: '1' },
  kind: { const: 'historical_hierarchy' },
  publication,
  responseWindow,
} as const;

const landing = {
  type: 'object',
  properties: {
    ...common,
    mode: { const: 'landing' },
    authority,
    bodyDelivery: { const: 'direct_node_only' },
    browse: {
      type: 'object',
      properties: {
        pageSize: { type: 'integer', minimum: 1, maximum: 32 },
        cursor: { const: 'opaque_hierarchy_bound_keyset_cursor' },
      },
      required: ['pageSize', 'cursor'],
      additionalProperties: false,
    },
  },
  required: ['schemaVersion', 'kind', 'mode', 'publication', 'authority', 'bodyDelivery', 'browse', 'responseWindow'],
  additionalProperties: false,
} as const;

const directNode = {
  type: 'object',
  properties: {
    ...common,
    mode: { const: 'node' },
    node: {
      type: 'object',
      properties: {
        ...node.properties,
        canonicalUri: {
          type: 'string',
          minLength: 1,
          maxLength: HISTORICAL_HIERARCHY_RESOURCE_URI_MAX_LENGTH,
          pattern: NODE_URI,
        },
        breadcrumb: { type: 'array', minItems: 1, maxItems: 32, items: node },
        body: { oneOf: [{ type: 'null' }, directBody] },
      },
      required: [...node.required, 'canonicalUri', 'breadcrumb', 'body'],
      additionalProperties: false,
    },
    descendants: { const: 'not_included' },
  },
  required: ['schemaVersion', 'kind', 'mode', 'publication', 'node', 'descendants', 'responseWindow'],
  additionalProperties: false,
} as const;

const children = {
  type: 'object',
  properties: {
    ...common,
    mode: { const: 'children' },
    parentNodeKey: nullableSafeKey,
    nodes: { type: 'array', maxItems: 32, items: node },
    resultWindow: {
      type: 'object',
      properties: {
        returnedCount: { type: 'integer', minimum: 0, maximum: 32 },
        additionalChildStatus: {
          type: 'string',
          enum: ['additional_child_observed', 'no_additional_child_observed'],
        },
      },
      required: ['returnedCount', 'additionalChildStatus'],
      additionalProperties: false,
    },
    pagination: {
      type: 'object',
      properties: {
        pageSize: { type: 'integer', minimum: 1, maximum: 32 },
        nextCursor: { type: 'string', minLength: 1, maxLength: 2_048, pattern: '^[A-Za-z0-9_-]+$' },
      },
      required: ['pageSize'],
      additionalProperties: false,
    },
    bodyDelivery: { const: 'not_included' },
  },
  required: ['schemaVersion', 'kind', 'mode', 'publication', 'parentNodeKey', 'nodes', 'resultWindow', 'pagination', 'bodyDelivery', 'responseWindow'],
  additionalProperties: false,
} as const;

const search = {
  type: 'object',
  properties: {
    ...common,
    mode: { const: 'search' },
    hits: { type: 'array', maxItems: 9, items: searchHit },
    bodyDelivery: { const: 'not_included' },
  },
  required: ['schemaVersion', 'kind', 'mode', 'publication', 'hits', 'bodyDelivery', 'responseWindow'],
  additionalProperties: false,
} as const;

export const historicalHierarchyOutputSchema = {
  type: 'object',
  oneOf: [landing, directNode, children, search],
} as NonNullable<Tool['outputSchema']>;
