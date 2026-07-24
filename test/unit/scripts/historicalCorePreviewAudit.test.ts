import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  MAX_MCP_RESPONSE_BYTES,
  readBoundedResponseBody,
  runPreviewAudit,
  validateFixture,
} from '../../../scripts/audit-historical-core-preview.js';
import { classicTextsOutputSchema } from '../../../src/mcp/schemas/classicTexts.js';
import { primarySourceSearchV7OutputSchema } from '../../../src/mcp/schemas/primarySourceSearchV4.js';

const root = new URL('../../../', import.meta.url);
const fixtureUrl = new URL('test/fixtures/historical-core-preview-audit.json', root);
const runnerUrl = new URL('scripts/audit-historical-core-preview.ts', root);
const workflowUrl = new URL('.github/workflows/pr.yml', root);

type RecordValue = Record<string, unknown>;

async function fixture(): Promise<RecordValue> {
  return JSON.parse(await readFile(fixtureUrl, 'utf8')) as RecordValue;
}

describe('historical core preview audit contract', () => {
  it('accepts only the immutable 25=17+8 Transform-9 fixture', async () => {
    const parsed = validateFixture(await fixture());
    expect(parsed.baseline.expectedCatalogIdentity).toEqual({ workCount: 25, legacyWorkCount: 17, coreWorkCount: 8, coreSectionCount: 512 });
    expect(parsed.probes).toHaveLength(8);
    expect(parsed.probes.map(probe => probe.workId)).toContain('calvin-institutes');

    const changed = structuredClone(parsed) as unknown as RecordValue;
    ((changed.probes as Array<RecordValue>)[0]!).editionId = 'wrong-edition';
    expect(() => validateFixture(changed)).toThrow('fixture identity or probe inventory drifted');
  });

  it('keeps every natural probe grounded in its pinned reviewed source-pack edition', async () => {
    const parsed = validateFixture(await fixture());
    for (const probe of parsed.probes) {
      const edition = JSON.parse(await readFile(new URL(
        `data/historical-source-packs/core-eight/editions/${probe.editionId}.json`, root,
      ), 'utf8')) as { work: { workId: string }; sections: Array<{ content: string }> };
      const text = edition.sections.map(section => section.content).join(' ').toLocaleLowerCase('en-US');
      expect(edition.work.workId).toBe(probe.workId);
      expect(probe.query.toLocaleLowerCase('en-US').split(/\s+/).every(term => text.includes(term))).toBe(true);
    }
  });

  it('is a fixed-preview, bounded protected release gate wired after D1 readiness and v2 audit', async () => {
    const [runner, workflow, readiness] = await Promise.all([
      readFile(runnerUrl, 'utf8'), readFile(workflowUrl, 'utf8'), readFile(new URL('scripts/check-remote-d1-readiness.ts', root), 'utf8'),
    ]);
    expect(runner).toContain("const PREVIEW_ENDPOINT = 'https://preview-mcp.theologai.xyz/mcp';");
    expect(runner).toContain('const MAX_LOGICAL_OPERATIONS = 49;');
    expect(runner).toContain('const MAX_HTTP_EXCHANGES = 50;');
    expect(runner).toContain("redirect: 'error'");
    expect(runner).toContain('readBoundedResponseBody(response, controller, label)');
    expect(runner).not.toMatch(/--(?:url|endpoint|fixture)/);
    expect(runner).not.toContain('theologai-preview.tjfrederick.workers.dev');
    expect(readiness).toContain('auditHistoricalTransform9Authority');

    const d1 = workflow.indexOf('- name: Verify preview D1 is compatible (read-only)');
    const deploy = workflow.indexOf('- name: Deploy to Cloudflare Workers (preview)');
    const v2 = workflow.indexOf('- name: Audit original-language v2 contract on preview');
    const historical = workflow.indexOf('- name: Audit Transform-9 historical core contract on preview');
    const identity = workflow.indexOf('- name: Verify preview Worker remained active through audit (read-only)');
    const artifact = workflow.indexOf('name: preview-release-audit-');
    expect(d1).toBeGreaterThan(-1);
    expect(deploy).toBeGreaterThan(d1);
    expect(v2).toBeGreaterThan(deploy);
    expect(historical).toBeGreaterThan(v2);
    expect(identity).toBeGreaterThan(historical);
    expect(artifact).toBeGreaterThan(identity);
    expect(workflow).toContain('historical-core-preview-audit.json');
    expect(workflow).toContain('historical_audit_sha256');
  });

  it('runs the exact 50-exchange inventory through a representative fake transport without retaining bodies, locators, or snippets', async () => {
    const parsed = validateFixture(await fixture());
    const calls: Array<{ url: string; body: RecordValue }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body)) as RecordValue;
      calls.push({ url: String(input), body });
      return responseFor(body, parsed);
    };

    const evidence = await runPreviewAudit(parsed, fakeFetch);
    expect(calls).toHaveLength(50);
    expect(calls.every(call => call.url === 'https://preview-mcp.theologai.xyz/mcp')).toBe(true);
    expect(evidence.budgets).toMatchObject({ logicalOperations: 49, maximumLogicalOperations: 49, httpExchanges: 50, maximumHttpExchanges: 50, retryCount: 0 });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain('PRIVATE HISTORICAL BODY');
    expect(serialized).not.toContain('theologai://documents/');
    expect(serialized).not.toContain('discovery snippet');
    expect((evidence.records as unknown[])).toHaveLength(8);
    expect((evidence.regressions as RecordValue).ccel).toMatchObject({ provider: 'ccel_live', status: 'disabled', searched: false });
  });

  it('fails before probes when the advertised current schema drifts', async () => {
    const parsed = validateFixture(await fixture());
    let calls = 0;
    const fakeFetch: typeof fetch = async (_input, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as RecordValue;
      if (body.method === 'initialize') return jsonResponse(initialize(body));
      if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
      const tools = fakeTools();
      ((tools.find(tool => tool.name === 'classic_text_lookup')!.outputSchema as RecordValue).properties as RecordValue).schemaVersion = { const: 'wrong' };
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { tools } });
    };
    await expect(runPreviewAudit(parsed, fakeFetch)).rejects.toThrow('advertised classic-text output schema');
    expect(calls).toBe(3);
  });

  it('aborts and cancels oversized declared and chunked responses', async () => {
    const declared = new AbortController();
    await expect(readBoundedResponseBody(new Response('x', {
      headers: { 'content-length': String(MAX_MCP_RESPONSE_BYTES + 1) },
    }), declared, 'declared')).rejects.toThrow('ceiling');
    expect(declared.signal.aborted).toBe(true);

    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_MCP_RESPONSE_BYTES));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() { cancelled = true; },
    });
    const chunked = new AbortController();
    await expect(readBoundedResponseBody(new Response(stream), chunked, 'chunked')).rejects.toThrow('ceiling');
    expect(chunked.signal.aborted).toBe(true);
    expect(cancelled).toBe(true);
  });
});

function responseFor(body: RecordValue, fixtureValue: ReturnType<typeof validateFixture>): Response {
  if (body.method === 'initialize') return jsonResponse(initialize(body));
  if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
  if (body.method === 'tools/list') return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { tools: fakeTools() } });
  if (body.method === 'prompts/list') return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { prompts: fakePrompts() } });
  if (body.method === 'resources/list') return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { resources: [{ uri: 'theologai://primary-sources/catalog', mimeType: 'application/json' }] } });
  if (body.method === 'resources/read') return resourceResponse(body, fixtureValue);
  if (body.method === 'tools/call') return toolResponse(body, fixtureValue);
  throw new Error(`unexpected fake method ${body.method}`);
}

function initialize(body: RecordValue): RecordValue {
  return {
    jsonrpc: '2.0', id: body.id,
    result: { protocolVersion: '2025-11-25', capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: 'theologai-bible-server', version: '3.6.0-preview' } },
  };
}

function fakeTools(): RecordValue[] {
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
  return [
    'bible_lookup', 'bible_cross_references', 'parallel_passages', 'commentary_lookup',
    'classic_text_lookup', 'primary_source_search', 'original_language_lookup',
    'bible_verse_morphology', 'original_language_study', 'donation_config', 'verify_donation',
  ].map(name => {
    if (name === 'classic_text_lookup') return { name, annotations, inputSchema: classicInput(), outputSchema: structuredClone(classicTextsOutputSchema) };
    if (name === 'primary_source_search') return { name, annotations, inputSchema: primaryInput(), outputSchema: structuredClone(primarySourceSearchV7OutputSchema) };
    return { name, annotations };
  });
}

function classicInput(): RecordValue {
  return { type: 'object', minProperties: 1, additionalProperties: false, properties: {
    work: {}, query: {}, listWorks: {}, browseSections: {}, cursor: {},
  } };
}

function primaryInput(): RecordValue {
  return { type: 'object', additionalProperties: false, required: ['queries'], properties: { queries: {
    minItems: 1, maxItems: 4, items: { additionalProperties: false, properties: {
      id: {}, text: {}, providers: { minItems: 1, maxItems: 2, items: { enum: ['local', 'ccel'] } }, match: {}, selection: {}, author: {}, work: {}, startYear: {}, endYear: {}, page: {}, limit: {},
    } },
  } } };
}

function fakePrompts(): RecordValue[] {
  return ['word-study', 'passage-exegesis', 'compare-translations', 'confession-study', 'primary-source-research', 'donate'].map(name => ({ name }));
}

function resourceResponse(body: RecordValue, fixtureValue: ReturnType<typeof validateFixture>): Response {
  const params = body.params as RecordValue;
  const uri = params.uri as string;
  if (uri === 'theologai://primary-sources/catalog') {
    return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(fakeCatalog(fixtureValue)) }] } });
  }
  if (uri.includes('does-not-exist')) return jsonResponse({ jsonrpc: '2.0', id: body.id, error: { code: -32002, message: 'not found' } });
  return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { contents: [{ uri, mimeType: 'text/markdown', text: '# Exact section\nPRIVATE HISTORICAL BODY' }] } });
}

function fakeCatalog(fixtureValue: ReturnType<typeof validateFixture>): RecordValue {
  const legacy = [
    '39-articles', 'apostles-creed', 'athanasian-creed', 'augsburg-confession', 'baltimore-catechism', 'belgic-confession', 'canons-of-dort', 'chalcedonian-definition', 'confession-of-dositheus', 'council-of-trent', 'heidelberg-catechism', 'london-baptist-1689', 'nicene-creed', 'philaret-catechism', 'westminster-confession', 'westminster-larger-catechism', 'westminster-shorter-catechism',
  ].map(id => ({ id, editionReadiness: { editionIdentity: 'not_established' } }));
  const core = fixtureValue.probes.map(probe => ({
    id: probe.workId,
    editionProvenance: { sourcePackId: fixtureValue.baseline.sourcePackId, editionId: probe.editionId },
    editionReadiness: { editionIdentity: 'established', provenance: 'verified', normalizedTextRights: 'no_known_conflict' },
  }));
  return {
    schemaVersion: '2', kind: 'local_primary_source_catalog', workCount: 25, works: [...legacy, ...core],
    policies: { scope: 'hosted_collection_only', editionProvenance: 'mixed_legacy_and_reviewed_source_packs', rightsStatus: 'mixed_not_established_and_no_known_conflict' },
  };
}

function toolResponse(body: RecordValue, fixtureValue: ReturnType<typeof validateFixture>): Response {
  const params = body.params as RecordValue;
  const name = params.name as string;
  const args = params.arguments as RecordValue;
  if (name === 'classic_text_lookup') return classicTool(body, args, fixtureValue);
  if (name === 'primary_source_search') return primaryTool(body, args, fixtureValue);
  throw new Error(`unexpected fake tool ${name}`);
}

function classicTool(body: RecordValue, args: RecordValue, fixtureValue: ReturnType<typeof validateFixture>): Response {
  if (args.cursor) return toolResult(body, { isError: true, content: [{ type: 'text', text: 'cursor rejected safely' }] });
  if (args.work === fixtureValue.legacyRegression.workId) {
    return toolResult(body, { structuredContent: { schemaVersion: '2', kind: 'classic_text_lookup', mode: 'work', document: { work: { id: args.work }, deliveryMode: 'complete_document', bodyDelivery: 'markdown_only' } } });
  }
  const probe = args.query
    ? fixtureValue.probes[(Number(body.id) - 8) / 5]!
    : fixtureValue.probes.find(item => item.workId === args.work)!;
  if (args.browseSections) {
    return toolResult(body, { structuredContent: directory(probe.workId) });
  }
  if (args.query) return toolResult(body, { structuredContent: {
    schemaVersion: '2', kind: 'classic_text_lookup', mode: 'search', search: { status: 'ok', hits: [{ work: { id: probe.workId }, snippetOnly: true }] },
  } });
  return toolResult(body, { structuredContent: landing(probe.workId) });
}

function landing(workId: string): RecordValue {
  return {
    schemaVersion: '2', kind: 'classic_text_lookup', mode: 'landing',
    evidencePolicy: { providerScope: 'local_only', remoteDocumentBodies: 'disabled', selectedContentAccess: 'mcp_resource_read' },
    landing: { work: { id: workId, deliveryMode: 'sectioned_only', resource: { kind: 'mcp_resource', uri: `theologai://documents/${workId}` } }, sectionCount: 64, bodyDelivery: 'exact_section_resource_only', browse: { pageSize: 32 } },
  };
}

function directory(workId: string): RecordValue {
  return {
    schemaVersion: '2', kind: 'classic_text_lookup', mode: 'browse_sections',
    directory: { work: { id: workId }, coverage: 'bounded_section_directory', pagination: { pageSize: 32 }, sections: [{ sectionKey: 'section-1', sourceOrdinal: 1, resource: { kind: 'mcp_resource', uri: `theologai://documents/${workId}#section-section-1` } }] },
  };
}

function primaryTool(body: RecordValue, args: RecordValue, fixtureValue: ReturnType<typeof validateFixture>): Response {
  const query = ((args.queries as RecordValue[])[0])!;
  if ((query.providers as string[])[0] === 'ccel') {
    return toolResult(body, { structuredContent: {
      schemaVersion: '7', kind: 'primary_source_search', planStatus: 'unavailable', queries: [{ providers: [{ provider: 'ccel_live', status: 'disabled', searched: false, hitCount: 0, hits: [] }] }],
      coverage: { localAttempted: false, ccelAttempted: false, ccelStatus: 'disabled', ccelHitCount: 0 },
    } });
  }
  const workId = query.work as string;
  return toolResult(body, { structuredContent: {
    schemaVersion: '7', kind: 'primary_source_search', planStatus: 'complete', queries: [{ providers: [{
      provider: 'local', status: 'ok', searched: true,
      hits: [{
        locator: { kind: 'mcp_resource', uri: `theologai://documents/${workId}#section-section-1`, documentId: workId },
        editionReadiness: { editionIdentity: 'established', normalizedTextRights: 'no_known_conflict' },
      }],
    }] }],
    coverage: { localAttempted: true, localHitCount: 1 }, evidencePolicy: { snippetUse: 'discovery_only', localSectionAccess: 'mcp_resource_read', externalSectionAccess: 'direct_url_only' },
  } });
}

function toolResult(body: RecordValue, result: RecordValue): Response {
  return jsonResponse({ jsonrpc: '2.0', id: body.id, result });
}

function jsonResponse(value: unknown): Response {
  const body = JSON.stringify(value);
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': String(new TextEncoder().encode(body).byteLength) } });
}
