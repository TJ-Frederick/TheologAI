import { describe, expect, it, vi } from 'vitest';
import {
  boundedAuditSleepMs,
  parseCcelAuditArgs,
  runCcelPreviewAudit,
  type CcelAuditClient,
} from '../../../scripts/audit-ccel-preview.js';
import { parseOperatorCli, runOperatorRequest } from '../../../scripts/ccel-coordinator-operator.js';
import { assertRetiredCcelScriptIsNetworkInert } from '../../adapters/ccel-test.js';
import { assertRetiredCcelToolContractGuard } from '../../integration/ccel-tool-test.js';

const version = '123e4567-e89b-42d3-a456-426614174000';
const auditOptions = {
  previewUrl: 'https://preview-mcp.theologai.xyz/mcp',
  productionUrl: 'https://mcp.theologai.xyz/mcp',
  authorization: 'I AUTHORIZE TWO LIVE CCEL PREVIEW REQUESTS',
};

const localEditionReadiness = {
  foundation: 'edition-provenance-foundation.v1', editionIdentity: 'not_established',
  provenance: 'incomplete', exactArtifactRights: 'not_established_by_this_contract',
};
const externalEditionReadiness = {
  editionIdentity: 'provider_unreviewed', provenance: 'provider_unreviewed',
  exactArtifactRights: 'not_determined',
};

function toolSchema(version: '3' | '4' | '5', includeCcel: boolean, retryAfterSeconds = false): { properties: Record<string, unknown> } {
  const local = { properties: { provider: { const: 'local' } } };
  const external = { properties: {
    provider: { const: 'ccel_live' }, ...(retryAfterSeconds ? { retryAfterSeconds: { type: 'integer' } } : {}),
  } };
  return { properties: {
    schemaVersion: { const: version },
    queries: { items: { properties: { providers: { items: includeCcel ? { oneOf: [local, external] } : local } } } },
  } };
}

function envelope(searchProvider: ReturnType<typeof provider>, planStatus = 'complete') {
  const searched = searchProvider.searched;
  const kind = searchProvider.provider;
  const observation = { queryId: 'audit', provider: kind, status: searchProvider.status };
  return {
    schemaVersion: '5', kind: 'primary_source_search', planStatus,
    responseWindow: { unit: 'utf8_bytes', maximum: 32_768, truncated: false },
    queries: [{ id: 'audit', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [searchProvider] }],
    coverage: {
      localAttempted: kind === 'local' && searched, localHitCount: kind === 'local' ? searchProvider.hitCount : 0,
      ccelAttempted: kind === 'ccel_live' && searched, ccelHitCount: kind === 'ccel_live' ? searchProvider.hitCount : 0,
      notices: [], serverObserved: {
        searched: searched ? [{ ...observation, returnedHitCount: searchProvider.hitCount }] : [],
        notSearched: searched ? [] : [observation],
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
    hits, notices: [],
    ...(kind === 'local' && searched ? { scope: { eligibleDocuments: [{ editionReadiness: localEditionReadiness }] } } : {}),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  };
}

function externalHit() {
  return {
    provider: 'ccel_live', snippet: 'A short authorized discovery snippet.',
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

describe('CCEL operational scripts', () => {
  it('keeps both retired command paths as executable no-network contract guards', async () => {
    await expect(assertRetiredCcelScriptIsNetworkInert()).resolves.toBeUndefined();
    expect(() => assertRetiredCcelToolContractGuard()).not.toThrow();
  });

  it('keeps the live audit inert unless every authorization input is exact', () => {
    expect(() => parseCcelAuditArgs([])).toThrow(/remains inert/);
    expect(() => parseCcelAuditArgs([
      '--preview-url', 'https://preview-mcp.theologai.xyz/mcp',
      '--production-url', 'https://mcp.theologai.xyz/mcp',
      '--authorize-live-ccel', 'wrong',
    ])).toThrow(/remains inert/);
  });

  it('caps the expected immediate coordinator wait and refuses anomalous values', () => {
    expect(boundedAuditSleepMs(10)).toBe(11_000);
    expect(() => boundedAuditSleepMs(11)).toThrow(/refusing to wait/);
    expect(() => boundedAuditSleepMs(86_400)).toThrow(/refusing to wait/);
  });

  it('runs the full mocked audit path and mechanically makes only two CCEL-bearing calls', async () => {
    let ccelCalls = 0;
    let possibleOriginAdmissions = 0;
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('4', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('5', true, true) }] }),
      callTool: vi.fn(async request => {
        const providers = ((request.arguments.queries as Array<{ providers: string[] }>)[0]?.providers ?? []);
        if (providers.includes('ccel')) {
          ccelCalls++;
          if (ccelCalls === 1) {
            possibleOriginAdmissions++;
            return { structuredContent: envelope(provider('ccel_live', 'ok', undefined, [externalHit()])) };
          }
          return { isError: true, structuredContent: envelope(provider('ccel_live', 'rate_limited', 10), 'unavailable') };
        }
        return { structuredContent: envelope(provider('local', 'ok', undefined, [localHit()])) };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const report = await runCcelPreviewAudit(auditOptions, {
      connect: async url => url === auditOptions.productionUrl ? production : preview,
    });
    expect(report).toMatchObject({
      passed: true,
      productionControl: { contractVersion: '4', liveCallMade: false },
      preview: { contractVersion: '5', ccelBearingToolCallMaximum: 2, upstreamOriginAdmissionMaximum: 2 },
    });
    expect(ccelCalls).toBe(2);
    expect(possibleOriginAdmissions).toBeLessThanOrEqual(2);
    expect(production.callTool).not.toHaveBeenCalled();
    expect(preview.callTool).toHaveBeenCalledTimes(3);
  });

  it('fails closed before any tool call when preview still advertises v4', async () => {
    const stalePreviewSchema = toolSchema('4', true, true);
    stalePreviewSchema.properties.unrelatedVersion = { const: '5' };
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('4', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: stalePreviewSchema }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    await expect(runCcelPreviewAudit(auditOptions, {
      connect: async url => url === auditOptions.productionUrl ? production : preview,
    })).rejects.toThrow(/preview v5 CCEL contract/);
    expect(production.callTool).not.toHaveBeenCalled();
    expect(preview.callTool).not.toHaveBeenCalled();
  });

  it('fails closed before any tool call when production still advertises v3', async () => {
    const staleProductionSchema = toolSchema('3', false);
    staleProductionSchema.properties.unrelatedVersion = { const: '4' };
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: staleProductionSchema }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('5', true, true) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    await expect(runCcelPreviewAudit(auditOptions, {
      connect: async url => url === auditOptions.productionUrl ? production : preview,
    })).rejects.toThrow(/production v4 local-only control/);
    expect(production.callTool).not.toHaveBeenCalled();
    expect(preview.callTool).not.toHaveBeenCalled();
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
  ])('fails closed on %s in the v5 coverage ledger', async (_label, corrupt) => {
    let ccelCalls = 0;
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('4', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('5', true, true) }] }),
      callTool: vi.fn(async () => {
        ccelCalls++;
        if (ccelCalls === 1) {
          const output = envelope(provider('ccel_live', 'no_results'));
          corrupt(output);
          return { structuredContent: output };
        }
        return { isError: true, structuredContent: envelope(provider('ccel_live', 'rate_limited', 10), 'unavailable') };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    await expect(runCcelPreviewAudit(auditOptions, {
      connect: async url => url === auditOptions.productionUrl ? production : preview,
    })).rejects.toThrow(/coverage|execution state/);
    expect(production.callTool).not.toHaveBeenCalled();
    expect(preview.callTool).toHaveBeenCalledTimes(2);
  });

  it('stops after two possible origin admissions even when the mocked coordinator violates busy policy', async () => {
    let possibleOriginAdmissions = 0;
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('4', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('5', true, true) }] }),
      callTool: vi.fn(async () => {
        possibleOriginAdmissions++;
        return { structuredContent: envelope(provider('ccel_live', 'no_results')) };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    await expect(runCcelPreviewAudit(auditOptions, {
      connect: async url => url === auditOptions.productionUrl ? production : preview,
    })).rejects.toThrow(/one admitted discovery and one globally rate-limited contender/);
    expect(possibleOriginAdmissions).toBe(2);
    expect(preview.callTool).toHaveBeenCalledTimes(2);
  });

  it('rejects an isError response unless it is the exact CCEL-only rate-limit form', async () => {
    const production: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('4', false) }] }),
      callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    };
    const preview: CcelAuditClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'primary_source_search', outputSchema: toolSchema('5', true, true) }] }),
      callTool: vi.fn().mockResolvedValue({ isError: true, structuredContent: envelope(provider('local', 'rate_limited', 3), 'unavailable') }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    await expect(runCcelPreviewAudit(auditOptions, {
      connect: async url => url === auditOptions.productionUrl ? production : preview,
    })).rejects.toThrow(/unexpected tool error form/);
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
