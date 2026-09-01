import {
  primarySourceSearchV6OutputSchema,
  primarySourceSearchV7OutputSchema,
  primarySourceSearchV8OutputSchema,
} from './schemas/primarySourceSearchV4.js';
import type { ToolHandler } from '../kernel/types.js';

export type PrimarySourceSearchContractVersion = '6' | '7' | '8';
export interface PrimarySourceSearchDescriptor {
  readonly name: 'primary_source_search';
  readonly contractVersion: PrimarySourceSearchContractVersion;
  readonly description: string;
  readonly inputSchema: ToolHandler['inputSchema'];
  readonly outputSchema: NonNullable<ToolHandler['outputSchema']>;
  readonly annotations: { readOnlyHint: true; destructiveHint: false; idempotentHint: true; openWorldHint: boolean };
}

export function createPrimarySourceSearchDescriptor(contractVersion: PrimarySourceSearchContractVersion = '6'): PrimarySourceSearchDescriptor {
  const expanded = contractVersion !== '6';
  const conditionalRetry = contractVersion === '8';
  return {
    name: 'primary_source_search', contractVersion,
    description: conditionalRetry
      ? 'Search the curated 35-work historical catalog. Expanded depth is one evidence-bound retry after a prior catalog miss, no-results result, or explicit work-diversity shortfall; the server rechecks that basis before any external provider can run. All local works remain usable results, with edition readiness retained as provenance context.'
      : expanded
      ? 'Search the curated 35-work historical catalog first. Use searchDepth expanded only when a bounded, separately labeled external-discovery set could help; its unreviewed direct-URL snippets are discovery leads, not evidence. Per-hit edition readiness states the available provenance.'
      : 'Execute an explicit, bounded query plan against the locally indexed historical-document collection. Supports exact catalog work aliases, exact reviewed creator names, and inclusive overlapping composition-year ranges. Returns catalog scope, snippets, and exact local section locators only; read selected exact resources before quotation or comparison.',
    inputSchema: inputSchema(expanded, conditionalRetry),
    outputSchema: conditionalRetry ? primarySourceSearchV8OutputSchema : expanded ? primarySourceSearchV7OutputSchema : primarySourceSearchV6OutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: expanded },
  };
}

function inputSchema(expanded: boolean, conditionalRetry: boolean): ToolHandler['inputSchema'] {
  return {
    type: 'object',
    properties: {
      queries: {
        type: 'array', minItems: 1, maxItems: 4,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 1, maxLength: 40, pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$' },
            text: { type: 'string', minLength: 1, maxLength: 200 },
            ...(expanded ? {
              searchDepth: {
                type: 'string', enum: ['standard', 'expanded'], default: 'standard',
                description: conditionalRetry
                  ? 'standard searches the curated 35-work catalog. expanded is one evidence-bound retry: local search reruns first, and a separately labeled external group is eligible only when expansionBasis still matches. At most one query per call may be expanded.'
                  : 'standard searches the curated 35-work catalog. expanded keeps that search and adds one separately labeled bounded external-discovery group; at most one query per call may be expanded.',
              },
              expandedLimit: { type: 'integer', minimum: 1, maximum: 5, default: 3, description: 'Expanded-discovery result cap. Valid only with searchDepth expanded.' },
              ...(conditionalRetry ? {
                expansionBasis: {
                  description: 'Required only for expanded depth. This host-observed prior local result is rechecked against the current local retry before any external provider may run.',
                  oneOf: [
                    {
                      type: 'object', properties: { reason: { type: 'string', enum: ['catalog_miss', 'no_results'] } },
                      required: ['reason'], additionalProperties: false,
                    },
                    ...[2, 3, 4, 5].map(minimumDistinctWorks => ({
                      type: 'object' as const,
                      properties: {
                        reason: { const: 'insufficient_diversity' },
                        minimumDistinctWorks: { const: minimumDistinctWorks },
                        observedDistinctWorks: { type: 'integer' as const, minimum: 0, maximum: minimumDistinctWorks - 1 },
                      },
                      required: ['reason', 'minimumDistinctWorks', 'observedDistinctWorks'], additionalProperties: false,
                    })),
                  ],
                },
              } : {}),
            } : {
              providers: { type: 'array', minItems: 1, maxItems: 1, uniqueItems: true, items: { type: 'string', enum: ['local'] }, description: 'Current public provider contract. Only the locally indexed collection is available.' },
            }),
            match: { type: 'string', enum: ['all_terms', 'phrase'], default: 'all_terms' },
            selection: {
              type: 'string', enum: ['relevance', 'work_diversity'], default: 'relevance',
              description: expanded
                ? 'Use relevance for within-work location; use work_diversity for a deterministic curated-catalog survey.'
                : 'Use relevance for within-work location; use work_diversity for deterministic research bundles that round-robin across matching hosted works.',
            },
            author: {
              type: 'string', minLength: 1, maxLength: 100,
              description: expanded
                ? 'One exact reviewed creator name for the catalog search; expanded discovery uses the same literal restriction without treating it as reviewed external metadata.'
                : 'One exact reviewed creator name. Use separate query-plan items for different creators; creator roles are not relabeled as authorship.',
            },
            work: {
              type: 'string', minLength: 1, maxLength: 160,
              description: expanded
                ? 'Exact catalog slug, title, or routing alias; expanded discovery uses the same literal restriction without treating it as reviewed external metadata.'
                : 'Exact hosted work slug, title, or lookup-only alias.',
            },
            startYear: {
              type: 'integer', minimum: -5000, maximum: 3000,
              description: expanded
                ? 'Inclusive catalog composition-overlap lower bound when reviewed dates are available. Expanded discovery deliberately omits it and warns that broader results are not date-filtered.'
                : 'Inclusive lower bound. A work is eligible when its reviewed composition interval overlaps the requested interval.',
            },
            endYear: {
              type: 'integer', minimum: -5000, maximum: 3000,
              description: expanded
                ? 'Inclusive catalog composition-overlap upper bound when reviewed dates are available; must be >= startYear. Expanded discovery deliberately omits it and warns that broader results are not date-filtered.'
                : 'Inclusive upper bound. Must be greater than or equal to startYear when both are provided.',
            },
            page: expanded
              ? { type: 'integer', const: 1, default: 1, description: 'Curated-catalog page. Page 1 only.' }
              : { type: 'integer', minimum: 1, maximum: 3, default: 1, description: 'Preserved planner field. The local provider supports only page 1 and reports unsupported_filter otherwise.' },
            limit: {
              type: 'integer', minimum: 1, maximum: 8, default: 5,
              ...(expanded ? { description: 'Curated-catalog maximum is 8. Use expandedLimit for the separately bounded expanded-discovery group.' } : {}),
            },
          },
          required: expanded ? ['id', 'text'] : ['id', 'text', 'providers'],
          ...(expanded ? { allOf: [
            { if: { required: ['expandedLimit'] }, then: { required: ['searchDepth'], properties: { searchDepth: { const: 'expanded' } } } },
            { if: { required: ['searchDepth'], properties: { searchDepth: { const: 'expanded' } } }, then: { properties: { page: { const: 1 } } } },
            ...(conditionalRetry ? [
              { if: { required: ['searchDepth'], properties: { searchDepth: { const: 'expanded' } } }, then: { required: ['expansionBasis'] } },
              { if: { required: ['expansionBasis'] }, then: { required: ['searchDepth'], properties: { searchDepth: { const: 'expanded' } } } },
              {
                if: {
                  required: ['expansionBasis'],
                  properties: { expansionBasis: { properties: { reason: { const: 'insufficient_diversity' } }, required: ['reason'] } },
                },
                then: { required: ['selection'], properties: { selection: { const: 'work_diversity' } } },
              },
            ] : []),
          ] } : {}),
          additionalProperties: false,
        },
      },
    },
    required: ['queries'], additionalProperties: false,
  };
}
