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

const legacyLocalEditionReadiness = {
  type: 'object',
  properties: {
    foundation: { const: 'edition-provenance-foundation.v1' },
    editionIdentity: { const: 'not_established' },
    provenance: { const: 'incomplete' },
    exactArtifactRights: { const: 'not_established_by_this_contract' },
  },
  required: ['foundation', 'editionIdentity', 'provenance', 'exactArtifactRights'],
  additionalProperties: false,
} as const;

const reviewedSourcePackEditionReadiness = {
  type: 'object',
  properties: {
    foundation: { const: 'edition-provenance-foundation.v1' },
    editionIdentity: { const: 'established' },
    provenance: { type: 'string', enum: ['verified', 'verified_with_uncertainty'] },
    exactArtifactRights: { const: 'not_claimed_for_scan_artifacts' },
    normalizedTextRights: { const: 'no_known_conflict' },
  },
  required: ['foundation', 'editionIdentity', 'provenance', 'exactArtifactRights', 'normalizedTextRights'],
  additionalProperties: false,
} as const;

const localEditionReadiness = {
  oneOf: [legacyLocalEditionReadiness, reviewedSourcePackEditionReadiness],
} as const;

const externalEditionReadiness = {
  type: 'object',
  properties: {
    editionIdentity: { const: 'provider_unreviewed' },
    provenance: { const: 'provider_unreviewed' },
    exactArtifactRights: { const: 'not_determined' },
  },
  required: ['editionIdentity', 'provenance', 'exactArtifactRights'],
  additionalProperties: false,
} as const;

const coverageLedgerPolicy = {
  type: 'object',
  properties: {
    searched: { const: 'server_observed_provider_execution' },
    read: { const: 'host_observed_successful_exact_resource_or_page_read' },
    deferred: { const: 'host_recorded_intentional_deferral' },
    notSearched: { const: 'server_observed_provider_non_execution' },
  },
  required: ['searched', 'read', 'deferred', 'notSearched'],
  additionalProperties: false,
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
        sectionKey: { type: 'string', minLength: 1, maxLength: 160 },
        sourceOrdinal: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      },
      required: ['kind', 'uri', 'documentId', 'sectionKey', 'sourceOrdinal'],
      additionalProperties: false,
    },
    resourceSizeBytes: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    editionReadiness: localEditionReadiness,
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
  required: ['queryId', 'title', 'snippet', 'rankWithinProvider', 'page', 'snippetOnly', 'attribution', 'provider', 'locator', 'resourceSizeBytes', 'editionReadiness'],
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
    editionReadiness: externalEditionReadiness,
  },
  required: ['queryId', 'title', 'snippet', 'rankWithinProvider', 'page', 'snippetOnly', 'attribution', 'provider', 'locator', 'metadataStatus', 'editionReadiness'],
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
          editionReadiness: localEditionReadiness,
        }, required: ['id', 'title', 'metadataStatus', 'editionReadiness'], additionalProperties: false,
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

const serverObserved = {
  type: 'object',
  properties: {
    searched: {
      type: 'array', maxItems: 8, items: {
        type: 'object', properties: {
          queryId: { type: 'string', minLength: 1, maxLength: 40 }, provider: { type: 'string', enum: ['local', 'ccel_live'] },
          status, returnedHitCount: { type: 'integer', minimum: 0, maximum: 8 },
        }, required: ['queryId', 'provider', 'status', 'returnedHitCount'], additionalProperties: false,
      },
    },
    notSearched: {
      type: 'array', maxItems: 8, items: {
        type: 'object', properties: {
          queryId: { type: 'string', minLength: 1, maxLength: 40 }, provider: { type: 'string', enum: ['local', 'ccel_live'] }, status,
        }, required: ['queryId', 'provider', 'status'], additionalProperties: false,
      },
    },
  },
  required: ['searched', 'notSearched'], additionalProperties: false,
} as const;

/** Production has no external provider surface, including in its ledger facts. */
const localServerObserved = {
  type: 'object',
  properties: {
    searched: {
      type: 'array', maxItems: 4, items: {
        type: 'object', properties: {
          queryId: { type: 'string', minLength: 1, maxLength: 40 }, provider: { const: 'local' },
          status, returnedHitCount: { type: 'integer', minimum: 0, maximum: 8 },
        }, required: ['queryId', 'provider', 'status', 'returnedHitCount'], additionalProperties: false,
      },
    },
    notSearched: {
      type: 'array', maxItems: 4, items: {
        type: 'object', properties: {
          queryId: { type: 'string', minLength: 1, maxLength: 40 }, provider: { const: 'local' }, status,
        }, required: ['queryId', 'provider', 'status'], additionalProperties: false,
      },
    },
  },
  required: ['searched', 'notSearched'], additionalProperties: false,
} as const;

export const primarySourceSearchV5OutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { const: '7' },
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
        serverObserved,
      },
      required: ['localAttempted', 'localHitCount', 'ccelAttempted', 'ccelHitCount', 'notices', 'serverObserved'],
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
        coverageLedger: coverageLedgerPolicy,
      },
      required: ['snippetUse', 'localSectionAccess', 'externalSectionAccess', 'coverageScope', 'externalRightsStatus', 'lookupAliasUse', 'coverageLedger'],
      additionalProperties: false,
    },
  },
  required: ['schemaVersion', 'kind', 'planStatus', 'responseWindow', 'queries', 'coverage', 'evidencePolicy'],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;

/** Production local-only hard cutover. The same URI/resource semantics as v5. */
export const primarySourceSearchV4OutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { const: '6' },
    kind: { const: 'primary_source_search' },
    planStatus: { type: 'string', enum: ['complete', 'partial', 'unavailable'] },
    responseWindow: {
      type: 'object',
      properties: { unit: { const: 'utf8_bytes' }, maximum: { const: 32768 }, truncated: { type: 'boolean' } },
      required: ['unit', 'maximum', 'truncated'], additionalProperties: false,
    },
    queries: {
      type: 'array', minItems: 1, maxItems: 4,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 40 },
          normalizedMode: { type: 'string', enum: ['all_terms', 'phrase'] },
          normalizedSelection: { type: 'string', enum: ['relevance', 'work_diversity'] },
          providers: { type: 'array', minItems: 1, maxItems: 1, items: localProvider },
        },
        required: ['id', 'normalizedMode', 'normalizedSelection', 'providers'], additionalProperties: false,
      },
    },
    coverage: {
      type: 'object',
      properties: {
        localAttempted: { type: 'boolean' }, localStatus: status, localHitCount: { type: 'integer', minimum: 0, maximum: 32 },
        notices: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 240 } }, serverObserved: localServerObserved,
      },
      required: ['localAttempted', 'localHitCount', 'notices', 'serverObserved'], additionalProperties: false,
    },
    evidencePolicy: {
      type: 'object',
      properties: {
        snippetUse: { const: 'discovery_only' }, localSectionAccess: { const: 'mcp_resource_read' },
        coverageScope: { const: 'bounded_non_exhaustive' }, lookupAliasUse: { const: 'exact_routing_only_not_metadata_evidence' },
        coverageLedger: coverageLedgerPolicy,
      },
      required: ['snippetUse', 'localSectionAccess', 'coverageScope', 'lookupAliasUse', 'coverageLedger'], additionalProperties: false,
    },
  },
  required: ['schemaVersion', 'kind', 'planStatus', 'responseWindow', 'queries', 'coverage', 'evidencePolicy'],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;

/** Public Transform-8 names.  The legacy export names remain internal compatibility aliases only. */
export const primarySourceSearchV7OutputSchema = primarySourceSearchV5OutputSchema;
export const primarySourceSearchV6OutputSchema = primarySourceSearchV4OutputSchema;
