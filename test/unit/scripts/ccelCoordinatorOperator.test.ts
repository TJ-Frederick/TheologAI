import { describe, expect, it, vi } from 'vitest';
import {
  boundedAuditSleepMs,
  parseCcelAuditArgs,
  runCcelPreviewAudit,
  type CcelAuditClient,
} from '../../../scripts/audit-ccel-preview.js';
import {
  CCEL_UPSTREAM_TERMINAL_ATTEMPT_LIMIT,
  type CcelCoordinatorSnapshot,
} from '../../../src/services/historical/CcelUpstreamCoordinator.js';
import { CCEL_COMPOSITION_DATE_NOTICE } from '../../../src/services/historical/primarySourceTypes.js';
import { parseOperatorCli, runOperatorRequest } from '../../../scripts/ccel-coordinator-operator.js';
import {
  assertRetiredCcelScriptIsNetworkInert,
  assertRetiredCcelToolContractGuard,
} from '../../helpers/ccelRetiredContractGuards.js';

const version = '123e4567-e89b-42d3-a456-426614174000';
const auditOptions = {
  previewUrl: 'https://preview-mcp.theologai.xyz/mcp',
  productionUrl: 'https://mcp.theologai.xyz/mcp',
  authorization: 'I AUTHORIZE TWO LIVE CCEL PREVIEW REQUESTS',
  productionWorkerVersionId: version,
};

const localEditionReadiness = {
  foundation: 'edition-provenance-foundation.v1', editionIdentity: 'not_established',
  provenance: 'incomplete', exactArtifactRights: 'not_established_by_this_contract',
};
const externalEditionReadiness = {
  editionIdentity: 'provider_unreviewed', provenance: 'provider_unreviewed',
  exactArtifactRights: 'not_determined',
};

function toolSchema(version: '3' | '6' | '7', includeCcel: boolean, retryAfterSeconds = false): { properties: Record<string, unknown> } {
  const local = { properties: { provider: { const: 'local' } } };
  const external = { properties: {
    provider: { const: 'ccel_live' }, ...(retryAfterSeconds ? { retryAfterSeconds: { type: 'integer' } } : {}),
  } };
  return { properties: {
    schemaVersion: { const: version },
    queries: { items: { properties: { providers: { items: includeCcel ? { oneOf: [local, external] } : local } } } },
  } };
}

function envelope(
  searchProviders: ReturnType<typeof provider> | Array<ReturnType<typeof provider>>,
  planStatus = 'complete',
  queryId = 'audit',
) {
  const providers = Array.isArray(searchProviders) ? searchProviders : [searchProviders];
  const observations = providers.map(searchProvider => ({
    queryId, provider: searchProvider.provider, status: searchProvider.status,
    returnedHitCount: searchProvider.hitCount, searched: searchProvider.searched,
  }));
  return {
    schemaVersion: '7', kind: 'primary_source_search', planStatus,
    responseWindow: { unit: 'utf8_bytes', maximum: 32_768, truncated: false },
    queries: [{ id: queryId, normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers }],
    coverage: {
      localAttempted: providers.some(item => item.provider === 'local' && item.searched),
      localHitCount: providers.filter(item => item.provider === 'local').reduce((sum, item) => sum + item.hitCount, 0),
      ccelAttempted: providers.some(item => item.provider === 'ccel_live' && item.searched),
      ccelHitCount: providers.filter(item => item.provider === 'ccel_live').reduce((sum, item) => sum + item.hitCount, 0),
      notices: [...new Set(providers.flatMap(item => item.notices))],
      serverObserved: {
        searched: observations.filter(item => item.searched)
          .map(({ searched: _searched, ...item }) => item),
        notSearched: observations.filter(item => !item.searched)
          .map(({ searched: _searched, returnedHitCount: _returnedHitCount, ...item }) => item),
      },
    },
    evidencePolicy: {
      snippetUse: 'discovery_only', localSectionAccess: 'mcp_resource_read', externalSectionAccess: 'direct_url_only',
      coverageScope: 'bounded_non_exhaustive', externalRightsStatus: 'not_determined', lookupAliasUse: 'exact_routing_only_not_metadata_evidence',
      coverageLedger: {
        searched: 'server_observed_provider_execution', read: 'host_observed_successful_exact_resource_or_page_read',
        deferred: 'host_recorded_intentional_deferral', notSearched: 'server_observed_provider_non_execution',
      },
    },
  };
}

function provider(
  kind: 'local' | 'ccel_live',
  status: string,
  retryAfterSeconds?: number,
  hits: Array<Record<string, unknown>> = [],
) {
  const searched = status !== 'rate_limited';
  return {
    provider: kind, status, searched, page: 1, hitCount: hits.length,
    resultWindow: { returnedHitCount: hits.length, additionalMatchStatus: 'no_additional_match_observed' },
    hits,
    notices: kind === 'ccel_live' && searched ? [CCEL_COMPOSITION_DATE_NOTICE] : [],
    ...(kind === 'local' && searched ? { scope: { eligibleDocuments: [{ editionReadiness: localEditionReadiness }] } } : {}),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  };
}

function externalHit(snippet = 'A short authorized discovery snippet.') {
  return {
    provider: 'ccel_live', snippet,
    metadataStatus: 'provider_search_result_unreviewed', editionReadiness: externalEditionReadiness,
    locator: { kind: 'external_url', url: 'https://ccel.org/ccel/calvin/institutes/iv.xvii.html' },
  };
}

function localHit() {
  return {
    provider: 'local', snippet: 'A local discovery snippet.', editionReadiness: localEditionReadiness,
    locator: { kind: 'mcp_resource', uri: 'theologai://documents/example' },
  };
}

function auditQuery(request: { arguments: Record<string, unknown> }) {
  const query = (request.arguments.queries as Array<Record<string, unknown>>)[0]!;
  expect(query).not.toHaveProperty('providers');
  expect(query.page).toBeUndefined();
  if (query.searchDepth === 'expanded') {
    expect(query).toMatchObject({
      expandedLimit: 2, startYear: 1500, endYear: 1700,
    });
  } else {
    expect(query.searchDepth).toBe('standard');
    expect(query).not.toHaveProperty('expandedLimit');
    expect(query).not.toHaveProperty('startYear');
    expect(query).not.toHaveProperty('endYear');
  }
  return query;
}

function expandedEnvelope(
  request: { arguments: Record<string, unknown> },
  external: ReturnType<typeof provider>,
) {
  const query = auditQuery(request);
  expect(query.searchDepth).toBe('expanded');
  return envelope(
    [provider('local', 'ok', undefined, [localHit()]), external],
    external.status === 'rate_limited' ? 'partial' : 'complete',
    String(query.id),
  );
}

function standardEnvelope(request: { arguments: Record<string, unknown> }) {
  const query = auditQuery(request);
  return envelope(provider('local', 'ok', undefined, [localHit()]), 'complete', String(query.id));
}

function coordinatorSnapshot(overrides: Partial<CcelCoordinatorSnapshot> = {}): CcelCoordinatorSnapshot {
  return {
    state: 'closed', nextAllowedAtMs: 0, backoffUntilMs: 0, lastObservedAtMs: 0,
    attemptSequence: 0, operatorEpoch: 0, transientFailures: 0, probeInFlight: false,
    probeLeaseUntilMs: 0, terminalAttemptCount: 0, terminalRetiredThroughAttemptId: 0,
    ...overrides,
  };
}

function auditDependencies(
  production: CcelAuditClient,
  preview: CcelAuditClient,
  snapshots: CcelCoordinatorSnapshot[] = [
    coordinatorSnapshot(),
    coordinatorSnapshot({ attemptSequence: 1, terminalAttemptCount: 1, terminalRetiredThroughAttemptId: 1 }),
  ],
) {
  let index = 0;
  return {
    connect: async (url: string) => url === auditOptions.productionUrl ? production : preview,
    snapshotCoordinator: vi.fn(async () => {
      const snapshot = snapshots[index++];
      if (!snapshot) throw new Error('Unexpected coordinator snapshot.');
      return snapshot;
    }),
    now: () => 100_000,
  };
}

describe('CCEL operational scripts', () => {
  it('keeps the retired command path as an executable no-network contract guard', async () => {
    await expect(assertRetiredCcelScriptIsNetworkInert()).resolves.toBeUndefined();
  });

  it('keeps the retired classic-text prompt contract guard executable', () => {
    expect(() => assertRetiredCcelToolContractGuard()).not.toThrow();
  });

  it('keeps the live audit inert unless every authorization input is exact', () => {
    expect(() => parseCcelAuditArgs([])).toThrow(/remains inert/);
    expect(() => parseCcelAuditArgs([
      '--preview-url', 'https://preview-mcp.theologai.xyz/mcp',
      '--production-url', 'https://mcp.theologai.xyz/mcp',
      '--authorize-live-ccel', 'wrong',
    ])).toThrow(/remains inert/);
    expect(() => parseCcelAuditArgs([
      '--preview-url', 'https://preview-mcp.theologai.xyz/mcp',
      '--production-url', 'https://mcp.theologai.xyz/mcp',
      '--authorize-live-ccel', 'I AUTHORIZE TWO LIVE CCEL PREVIEW REQUESTS',
    ])).toThrow(/Worker UUID/);
  });

  it('caps the expected immediate coordinator wait and refuses anomalous values', () => {
    expect(boundedAuditSleepMs(10)).toBe(11_000);
    expect(() => boundedAuditSleepMs(11)).toThrow(/refusing to wait/);
    expect(() => boundedAuditSleepMs(86_400)).toThrow(/refusing to wait/);
  });

  it('runs the full mocked audit path and mechanically makes only two CCEL-bearing calls', async () => {
    let ccelCalls = 0;
    let possibleOriginAdmissions = 0;
    const production = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('6', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('7', true, true) }] }),
      callTool: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const privateMarker = 'never-report-this-private-snippet';
    preview.callTool.mockImplementation(async (request: { arguments: Record<string, unknown> }) => {
      const query = auditQuery(request);
      if (query.searchDepth === 'expanded') {
        ccelCalls++;
        if (ccelCalls === 1) {
          possibleOriginAdmissions++;
          return { structuredContent: expandedEnvelope(request, provider('ccel_live', 'ok', undefined, [externalHit(privateMarker)])) };
        }
        return { structuredContent: expandedEnvelope(request, provider('ccel_live', 'rate_limited', 10)) };
      }
      return { structuredContent: standardEnvelope(request) };
    });
    const dependencies = auditDependencies(production, preview);
    const report = await runCcelPreviewAudit(auditOptions, dependencies);
    expect(report).toMatchObject({
      passed: true,
      productionControl: {
        contractVersionObserved: '6', discoverySchemaObserved: 'local_only', toolsListCalls: 1,
        protectedSnapshotReads: 2, toolCallInvocations: 0,
      },
      preview: {
        contractVersionObserved: '7', discoverySchemaObserved: 'ccel_exposed', ccelBearingToolCallMaximum: 2,
        upstreamOriginAdmissionObserved: 1,
      },
      coordinator: {
        delta: { admissionCount: 1, terminalOutcomeCount: 1, terminalRetirementCount: 1, operatorEpochChanged: false },
        terminalCircuitState: 'closed',
      },
    });
    expect(ccelCalls).toBe(2);
    expect(possibleOriginAdmissions).toBeLessThanOrEqual(2);
    expect(production.callTool).not.toHaveBeenCalled();
    expect(preview.callTool).toHaveBeenCalledTimes(3);
    const requestedQueries = (preview.callTool.mock.calls as Array<[{ arguments: Record<string, unknown> }]>).map(([request]) =>
      (request.arguments.queries as Array<Record<string, unknown>>)[0]!);
    expect(requestedQueries.filter(query => query.searchDepth === 'expanded')).toHaveLength(2);
    expect(requestedQueries.filter(query => query.searchDepth === 'standard')).toHaveLength(1);
    expect(dependencies.snapshotCoordinator).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(report)).not.toContain(privateMarker);
    expect(report.productionControl).not.toHaveProperty('rolloutContract');
    expect(report.preview).not.toHaveProperty('rolloutContract');
  });

  it('fails closed before any tool call when preview still advertises v6', async () => {
    const stalePreviewSchema = toolSchema('6', true, true);
    stalePreviewSchema.properties.unrelatedVersion = { const: '7' };
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('6', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: stalePreviewSchema }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const dependencies = auditDependencies(production, preview);
    await expect(runCcelPreviewAudit(auditOptions, dependencies)).rejects.toThrow(/preview v7 CCEL contract/);
    expect(production.callTool).not.toHaveBeenCalled();
    expect(preview.callTool).not.toHaveBeenCalled();
    expect(dependencies.snapshotCoordinator).not.toHaveBeenCalled();
  });

  it('fails closed before any tool call when production still advertises v3', async () => {
    const staleProductionSchema = toolSchema('3', false);
    staleProductionSchema.properties.unrelatedVersion = { const: '4' };
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: staleProductionSchema }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('7', true, true) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const dependencies = auditDependencies(production, preview);
    await expect(runCcelPreviewAudit(auditOptions, dependencies)).rejects.toThrow(/production v6 local-only control/);
    expect(production.callTool).not.toHaveBeenCalled();
    expect(preview.callTool).not.toHaveBeenCalled();
    expect(dependencies.snapshotCoordinator).not.toHaveBeenCalled();
  });

  it('fails closed on a dirty pre-snapshot before any preview tool call', async () => {
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('6', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('7', true, true) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const dependencies = auditDependencies(production, preview, [
      coordinatorSnapshot({ attemptSequence: 2, terminalRetiredThroughAttemptId: 1 }),
    ]);
    await expect(runCcelPreviewAudit(auditOptions, dependencies))
      .rejects.toThrow(/clean coordinator precondition/);
    expect(production.callTool).not.toHaveBeenCalled();
    expect(preview.callTool).not.toHaveBeenCalled();
    expect(dependencies.snapshotCoordinator).toHaveBeenCalledOnce();
  });

  it('sanitizes a failed protected pre-snapshot and makes no preview tool call', async () => {
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('6', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('7', true, true) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const dependencies = auditDependencies(production, preview);
    dependencies.snapshotCoordinator.mockRejectedValueOnce(new Error('private-operator-material'));
    await expect(runCcelPreviewAudit(auditOptions, dependencies))
      .rejects.toThrow('Audit failed: protected coordinator pre-snapshot unavailable.');
    expect(production.callTool).not.toHaveBeenCalled();
    expect(preview.callTool).not.toHaveBeenCalled();
    expect(dependencies.snapshotCoordinator).toHaveBeenCalledOnce();
  });

  it.each([
    ['an extra unreported search observation', (output: ReturnType<typeof envelope>) => {
      output.coverage.serverObserved.searched.push({
        queryId: 'unknown', provider: 'ccel_live', status: 'ok', returnedHitCount: 0,
      });
    }],
    ['a missing provider execution flag', (output: ReturnType<typeof envelope>) => {
      Reflect.deleteProperty(output.queries[0]!.providers[0]!, 'searched');
    }],
  ])('fails closed on %s in the v7 coverage ledger', async (_label, corrupt) => {
    let ccelCalls = 0;
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('6', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('7', true, true) }] }),
      callTool: vi.fn(async request => {
        ccelCalls++;
        if (ccelCalls === 1) {
          const output = expandedEnvelope(request, provider('ccel_live', 'no_results'));
          corrupt(output);
          return { structuredContent: output };
        }
        return { structuredContent: expandedEnvelope(request, provider('ccel_live', 'rate_limited', 10)) };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    await expect(runCcelPreviewAudit(auditOptions, auditDependencies(production, preview))).rejects.toThrow(/coverage|execution state/);
    expect(production.callTool).not.toHaveBeenCalled();
    expect(preview.callTool).toHaveBeenCalledTimes(2);
  });

  it('stops after two possible origin admissions even when the mocked coordinator violates busy policy', async () => {
    let possibleOriginAdmissions = 0;
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('6', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('7', true, true) }] }),
      callTool: vi.fn(async request => {
        possibleOriginAdmissions++;
        return { structuredContent: expandedEnvelope(request, provider('ccel_live', 'no_results')) };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    await expect(runCcelPreviewAudit(auditOptions, auditDependencies(production, preview)))
      .rejects.toThrow(/one admitted discovery and one globally rate-limited contender/);
    expect(possibleOriginAdmissions).toBe(2);
    expect(preview.callTool).toHaveBeenCalledTimes(2);
  });

  it('rejects a busy expanded response marked as a tool error instead of partial success', async () => {
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('6', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('7', true, true) }] }),
      callTool: vi.fn(async request => ({
        isError: true,
        structuredContent: expandedEnvelope(request, provider('ccel_live', 'rate_limited', 3)),
      })),
      close: vi.fn().mockResolvedValue(undefined),
    };
    await expect(runCcelPreviewAudit(auditOptions, auditDependencies(production, preview)))
      .rejects.toThrow(/unexpected tool error form/);
  });

  it('keeps the full retained terminal window usable and records its bounded eviction', async () => {
    let ccelCalls = 0;
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('6', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('7', true, true) }] }),
      callTool: vi.fn(async request => {
        const query = auditQuery(request);
        if (query.searchDepth === 'expanded') {
          ccelCalls++;
          return ccelCalls === 1
            ? { structuredContent: expandedEnvelope(request, provider('ccel_live', 'no_results')) }
            : { structuredContent: expandedEnvelope(request, provider('ccel_live', 'rate_limited', 10)) };
        }
        return { structuredContent: standardEnvelope(request) };
      }), close: vi.fn().mockResolvedValue(undefined),
    };
    const report = await runCcelPreviewAudit(auditOptions, auditDependencies(production, preview, [
      coordinatorSnapshot({
        attemptSequence: CCEL_UPSTREAM_TERMINAL_ATTEMPT_LIMIT,
        terminalAttemptCount: CCEL_UPSTREAM_TERMINAL_ATTEMPT_LIMIT,
        terminalRetiredThroughAttemptId: CCEL_UPSTREAM_TERMINAL_ATTEMPT_LIMIT,
      }),
      coordinatorSnapshot({
        attemptSequence: CCEL_UPSTREAM_TERMINAL_ATTEMPT_LIMIT + 1,
        terminalAttemptCount: CCEL_UPSTREAM_TERMINAL_ATTEMPT_LIMIT,
        terminalRetiredThroughAttemptId: CCEL_UPSTREAM_TERMINAL_ATTEMPT_LIMIT + 1,
      }),
    ]));
    expect(production.callTool).not.toHaveBeenCalled();
    expect(preview.callTool).toHaveBeenCalledTimes(3);
    expect(report).toMatchObject({
      coordinator: { delta: { admissionCount: 1, terminalOutcomeCount: 0, terminalRetirementCount: 1 } },
    });
  });

  it('requires the protected post-snapshot to prove the terminal retirement watermark advanced', async () => {
    let ccelCalls = 0;
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('6', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('7', true, true) }] }),
      callTool: vi.fn(async request => {
        const query = auditQuery(request);
        if (query.searchDepth === 'expanded') {
          ccelCalls++;
          return ccelCalls === 1
            ? { structuredContent: expandedEnvelope(request, provider('ccel_live', 'no_results')) }
            : { structuredContent: expandedEnvelope(request, provider('ccel_live', 'rate_limited', 10)) };
        }
        return { structuredContent: standardEnvelope(request) };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    await expect(runCcelPreviewAudit(auditOptions, auditDependencies(production, preview, [
      coordinatorSnapshot(),
      coordinatorSnapshot({ attemptSequence: 1, terminalAttemptCount: 1 }),
    ]))).rejects.toThrow(/one admitted and finalized contender/);
    expect(production.callTool).not.toHaveBeenCalled();
    expect(preview.callTool).toHaveBeenCalledTimes(2);
  });

  it('requires exact operator reset preconditions', () => {
    expect(() => parseOperatorCli([
      '--endpoint', 'https://mcp.theologai.xyz/internal/ccel-coordinator', '--action', 'reset', '--worker-version-id', version,
    ])).toThrow(/exact latched state/);
    for (const endpoint of [
      'https://mcp.theologai.xyz:443/internal/ccel-coordinator',
      'https://user@mcp.theologai.xyz/internal/ccel-coordinator',
      'https://mcp.theologai.xyz/internal/ccel-coordinator?x=1',
    ]) {
      expect(() => parseOperatorCli(['--endpoint', endpoint, '--action', 'snapshot', '--worker-version-id', version])).toThrow();
    }
  });

  it('signs the exact method, path, timestamp, nonce, and body without printing auth material', async () => {
    const snapshot = {
      state: 'closed', nextAllowedAtMs: 0, backoffUntilMs: 0, lastObservedAtMs: 0, attemptSequence: 0,
      operatorEpoch: 0, transientFailures: 0, probeInFlight: false, probeLeaseUntilMs: 0,
      terminalAttemptCount: 0, terminalRetiredThroughAttemptId: 0,
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      action: 'snapshot', workerVersionId: version, snapshot,
    }), {
      headers: { 'Content-Type': 'application/json' },
    }));
    await runOperatorRequest({
      endpoint: 'https://mcp.theologai.xyz/internal/ccel-coordinator', action: 'snapshot', workerVersionId: version,
    }, 'operator-test-secret-that-is-at-least-32-characters', fetchImpl);
    const request = fetchImpl.mock.calls[0]!;
    expect(request[1]?.headers).toMatchObject({ 'X-TheologAI-Signature': expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(request)).not.toContain('operator-test-secret');
  });

  it('fails closed on a successful HTTP response with malformed operator data', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      action: 'snapshot', workerVersionId: version, snapshot: { state: 'closed' }, extra: 'unsafe',
    })));
    await expect(runOperatorRequest({
      endpoint: 'https://mcp.theologai.xyz/internal/ccel-coordinator', action: 'snapshot', workerVersionId: version,
    }, 'operator-test-secret-that-is-at-least-32-characters', fetchImpl)).rejects.toThrow(/closed contract/);
  });
});
