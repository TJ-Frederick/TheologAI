import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { Server } from '@modelcontextprotocol/server';
import type { ToolHandler, ToolResult } from '../../../src/kernel/types.js';
import { createTheologAiMcpServer } from '../../../src/mcp/server.js';
import { presentBibleLookupStructured } from '../../../src/presenters/bibleStructured.js';
import { presentParallelPassagesStructured } from '../../../src/presenters/parallelPassagesStructured.js';
import { presentPrimarySourceSearchV6 } from '../../../src/presenters/primarySourceSearchV4Structured.js';
import { presentOriginalLanguageStudyV2 } from '../../../src/presenters/originalLanguageStudyV2Presentation.js';
import {
  classifyToolResult,
  safeReleaseVersion,
  safeToolName,
  type ToolExecutionEvent,
} from '../../../src/mcp/toolExecutionObserver.js';
import { createDeterministicMcpFixture } from '../../fixtures/mcpCompositionRoot.js';
import { productionCandidate, productionContext, productionCoordinator, productionRequest } from '../../helpers/originalLanguageStudyV2ProductionFixtures.js';
import type { PrimarySourceSearchPlanResult } from '../../../src/services/historical/primarySourceTypes.js';

const connected: Array<{ client: Client; server: Server }> = [];

async function connect(tools: ToolHandler[], events: ToolExecutionEvent[], version = '3.6.0-test'): Promise<Client> {
  const fixture = createDeterministicMcpFixture();
  const primarySourceSearch = tools.find(tool => tool.name === 'primary_source_search')
    ?? fixture.root.primarySourceSearch.tool;
  const root = {
    ...fixture.root,
    tools: tools.some(tool => tool.name === 'primary_source_search') ? tools : [...tools, primarySourceSearch],
    primarySourceSearch: { ...fixture.root.primarySourceSearch, tool: primarySourceSearch },
  };
  const server = createTheologAiMcpServer(root, version, undefined, undefined, event => events.push(event)).server;
  const client = new Client({ name: 'tool-observer-test', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  connected.push({ client, server });
  return client;
}

function handler(overrides: Partial<ToolHandler> = {}): ToolHandler {
  return {
    name: 'bible_lookup',
    description: 'Synthetic observability fixture',
    inputSchema: {
      type: 'object', properties: { reference: { type: 'string' } }, required: ['reference'], additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async () => ({ content: [{ type: 'text', text: 'safe' }] }),
    ...overrides,
  };
}

function textResult(text: string, isError = false): ToolResult {
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  };
}

afterEach(async () => {
  await Promise.allSettled(connected.splice(0).flatMap(({ client, server }) => [client.close(), server.close()]));
});

describe('tool execution observer', () => {
  it('emits exactly one content-free event for successful, invalid, reported-error, and thrown calls', async () => {
    const events: ToolExecutionEvent[] = [];
    const privateValue = 'PRIVATE_ARGUMENT_OR_ERROR';
    const client = await connect([
      handler({
        handler: vi.fn(async (params): Promise<ToolResult> => {
          if (params.reference === 'reported') return textResult(privateValue, true);
          if (params.reference === 'throw') throw new Error(privateValue);
          return textResult(privateValue);
        }),
      }),
    ], events);

    await client.callTool({ name: 'bible_lookup', arguments: { reference: 'success' } });
    await client.callTool({ name: 'bible_lookup', arguments: {} });
    await client.callTool({ name: 'bible_lookup', arguments: { reference: 'reported' } });
    await expect(client.callTool({ name: 'bible_lookup', arguments: { reference: 'throw' } })).rejects.toMatchObject({ code: -32603 });

    expect(events).toEqual([
      expect.objectContaining({ tool: 'bible_lookup', outcome: 'success', releaseVersion: '3.6.0-test' }),
      expect.objectContaining({ tool: 'bible_lookup', outcome: 'invalid', failureCategory: 'input_validation' }),
      expect.objectContaining({ tool: 'bible_lookup', outcome: 'error', failureCategory: 'tool_reported_error' }),
      expect.objectContaining({ tool: 'bible_lookup', outcome: 'error', failureCategory: 'handler_exception' }),
    ]);
    expect(events.every(event => Number.isInteger(event.durationMs) && event.durationMs >= 0)).toBe(true);
    expect(JSON.stringify(events)).not.toContain(privateValue);
    expect(JSON.stringify(events)).not.toContain('arguments');
  });

  it('emits one invalid event for an unknown name without retaining the caller-provided name', async () => {
    const events: ToolExecutionEvent[] = [];
    const unknown = 'private_unknown_tool';
    const client = await connect([handler()], events);
    await expect(client.callTool({ name: unknown, arguments: {} })).rejects.toMatchObject({ code: -32602 });
    expect(events).toEqual([expect.objectContaining({
      tool: 'unknown', outcome: 'invalid', failureCategory: 'unknown_tool',
    })]);
    expect(JSON.stringify(events)).not.toContain(unknown);
  });

  it('does not let a synchronous sink failure change a successful tool result', async () => {
    const fixture = createDeterministicMcpFixture();
    const observer = vi.fn(() => { throw new Error('telemetry sink failure'); });
    const server = createTheologAiMcpServer(
      fixture.root,
      '3.6.0-test',
      undefined,
      undefined,
      observer,
    ).server;
    const client = new Client({ name: 'tool-observer-failure-test', version: '1.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    connected.push({ client, server });

    await expect(client.callTool({ name: 'bible_lookup', arguments: { reference: 'John 3:16' } }))
      .resolves.toMatchObject({ structuredContent: { kind: 'bible_lookup' } });
    expect(observer).toHaveBeenCalledOnce();
  });

  it('records an output-contract projection failure once', async () => {
    const events: ToolExecutionEvent[] = [];
    const client = await connect([handler({
      outputSchema: {
        type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false,
      },
      handler: async () => ({
        content: [{ type: 'text', text: 'private malformed output' }],
        structuredContent: { value: 42 },
      }),
    })], events);

    await expect(client.callTool({ name: 'bible_lookup', arguments: { reference: 'John 3:16' } }))
      .rejects.toMatchObject({ code: -32603 });
    expect(events).toEqual([expect.objectContaining({
      outcome: 'error', failureCategory: 'output_contract',
    })]);
    expect(JSON.stringify(events)).not.toContain('private malformed output');
  });

  it('records a validator exception once with a generic category', async () => {
    const events: ToolExecutionEvent[] = [];
    const client = await connect([handler({
      outputSchema: { type: 'object', additionalProperties: false },
      handler: async () => ({
        content: [{ type: 'text', text: 'safe fallback' }],
        structuredContent: new Proxy({}, { ownKeys: () => { throw new Error('private validator failure'); } }),
      }),
    })], events);

    await expect(client.callTool({ name: 'bible_lookup', arguments: { reference: 'John 3:16' } }))
      .rejects.toMatchObject({ code: -32603 });
    expect(events).toEqual([expect.objectContaining({
      outcome: 'error', failureCategory: 'execution_exception',
    })]);
    expect(JSON.stringify(events)).not.toContain('private validator failure');
  });

  it('records a projection exception once with a generic category', async () => {
    const events: ToolExecutionEvent[] = [];
    const fixture = createDeterministicMcpFixture();
    const server = createTheologAiMcpServer(
      fixture.root,
      '3.6.0-test',
      undefined,
      undefined,
      event => events.push(event),
    ).server;
    vi.spyOn(server, 'projectCallToolResult').mockImplementationOnce(() => {
      throw new Error('private projection failure');
    });
    const client = new Client({ name: 'tool-observer-projection-test', version: '1.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    connected.push({ client, server });

    await expect(client.callTool({ name: 'bible_lookup', arguments: { reference: 'John 3:16' } }))
      .rejects.toMatchObject({ code: -32603 });
    expect(events).toEqual([expect.objectContaining({
      outcome: 'error', failureCategory: 'execution_exception',
    })]);
    expect(JSON.stringify(events)).not.toContain('private projection failure');
  });

  it('uses presenter-produced structured contracts for partial and unavailable outcomes', async () => {
    const bible = presentBibleLookupStructured({
      reference: 'John 3:16',
      results: [{ reference: 'John 3:16', translation: 'ESV', text: 'For God so loved the world.', citation: { source: 'Fixture' } }],
      failures: [{ translation: 'NET', reason: 'intentionally unavailable fixture' }],
    }, 'John 3:16', ['ESV', 'NET']);
    expect(classifyToolResult('bible_lookup', { content: [{ type: 'text', text: 'ignored' }], structuredContent: bible }))
      .toEqual({ outcome: 'partial' });

    const parallel = presentParallelPassagesStructured({
      requestedReference: 'John 3:16', corpora: [], sourceAttestedGroups: [],
      sourceAttestedResultWindow: { requestedLimit: 1, returnedGroupCount: 0, additionalMatchStatus: 'not_evaluated' },
      legacyParallels: [], openBibleCrossReferences: [], provenance: [],
      textEnrichment: {
        requested: true, translation: 'ESV', budget: { unit: 'unique_canonical_passage_lookups', maximum: 12 },
        uniqueTargetCount: 2, scheduledLookupCount: 2, succeededLookupCount: 1, failedLookupCount: 1, omittedLookupCount: 0,
        completionStatus: 'incomplete',
      },
    });
    expect(classifyToolResult('parallel_passages', { content: [{ type: 'text', text: 'ignored' }], structuredContent: parallel }))
      .toEqual({ outcome: 'partial' });

    const primary = presentPrimarySourceSearchV6(primarySourcePartialPlan());
    expect(classifyToolResult('primary_source_search', { content: [{ type: 'text', text: 'ignored' }], structuredContent: primary }))
      .toEqual({ outcome: 'partial' });

    const context = productionContext();
    context.v1Result = { ...context.v1Result, status: 'partial' };
    const language = presentOriginalLanguageStudyV2(await productionCoordinator([productionCandidate(1)], context).coordinator.study(productionRequest())).output;
    expect(classifyToolResult('original_language_study', { content: [{ type: 'text', text: 'ignored' }], structuredContent: language }))
      .toEqual({ outcome: 'partial' });

    expect(classifyToolResult('primary_source_search', {
      content: [{ type: 'text', text: 'ignored' }], isError: true,
      structuredContent: { ...primary, planStatus: 'unavailable' },
    })).toEqual({ outcome: 'unavailable', failureCategory: 'dependency_unavailable' });
  });

  it('bounds potentially caller-controlled identifiers before observation', () => {
    expect(safeToolName('bible_lookup')).toBe('bible_lookup');
    expect(safeToolName('private_tool_name')).toBe('unknown');
    expect(safeReleaseVersion('3.6.0+abc')).toBe('3.6.0+abc');
    expect(safeReleaseVersion('private version with spaces')).toBe('unknown');
    expect(safeReleaseVersion(`3.6.0+${'a'.repeat(60)}`)).toBe('unknown');
  });
});

function primarySourcePartialPlan(): PrimarySourceSearchPlanResult {
  return {
    planStatus: 'partial',
    queries: [{
      id: 'q', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [{
        provider: 'local', status: 'no_results', searched: true, page: 1, hitCount: 0,
        resultWindow: { returnedHitCount: 0, additionalMatchStatus: 'no_additional_match_observed' },
        hits: [], notices: [],
        scope: { status: 'matched', requested: {}, eligibleDocumentCount: 0, eligibleDocuments: [], eligibleDocumentsTruncated: false },
      }],
    }],
    coverage: { localAttempted: true, localStatus: 'no_results', localHitCount: 0, ccelAttempted: false, ccelHitCount: 0, notices: [] },
  };
}
