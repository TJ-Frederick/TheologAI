import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AuditDeadline,
  MAX_MCP_RESPONSE_BYTES,
  publishAuditEvidence,
  readBoundedResponseBody,
  runAuditCli,
  runPreviewAudit,
  validateFixture,
} from '../../../scripts/audit-historical-core-preview.js';
import { classicTextsOutputSchema } from '../../../src/mcp/schemas/classicTexts.js';
import { primarySourceSearchV7OutputSchema } from '../../../src/mcp/schemas/primarySourceSearchV4.js';
import { createClassicTextsHandler } from '../../../src/tools/v2/classicTexts.js';
import { createPrimarySourceSearchHandler } from '../../../src/tools/v2/primarySourceSearch.js';

const root = new URL('../../../', import.meta.url);
const fixtureUrl = new URL('test/fixtures/historical-core-preview-audit.json', root);
const runnerUrl = new URL('scripts/audit-historical-core-preview.ts', root);
const workflowUrl = new URL('.github/workflows/pr.yml', root);

type RecordValue = Record<string, unknown>;
type Audit = ReturnType<typeof validateFixture>;
type FakeOptions = {
  mutate?: (body: RecordValue, response: RecordValue) => RecordValue;
  invalidResourceError?: string;
  invalidCursorError?: string;
  directLandingText?: string;
  truncateClassicCatalog?: boolean;
  primaryLocatorDrift?: boolean;
};

const V7_CONTRACT = {
  exposeCcelDiscovery: true,
  ccelLiveSearch: false,
  ccelCoordinator: false,
  contractVersion: '7' as const,
  liveCcelEnabled: false,
};

async function fixture(): Promise<RecordValue> {
  return JSON.parse(await readFile(fixtureUrl, 'utf8')) as RecordValue;
}

describe('historical core preview audit contract', () => {
  it('accepts only the immutable 25=17+8 Transform-9 fixture, including separate directory and relevance locators', async () => {
    const parsed = validateFixture(await fixture());
    expect(parsed.baseline.expectedCatalogIdentity).toEqual({ workCount: 25, legacyWorkCount: 17, coreWorkCount: 8, coreSectionCount: 512 });
    expect(parsed.probes).toHaveLength(8);
    expect(parsed.probes.map(probe => probe.sectionCount).reduce((sum, count) => sum + count, 0)).toBe(512);
    expect(parsed.probes.find(probe => probe.workId === 'calvin-institutes')?.firstSection).toEqual({
      sectionKey: 'book-1-chapter-01', sourceOrdinal: 1,
      resourceUri: 'theologai://documents/calvin-institutes#section-book-1-chapter-01',
    });
    expect(parsed.probes.find(probe => probe.workId === 'calvin-institutes')?.primarySearch).toEqual({
      sectionKey: 'book-3-chapter-17', sourceOrdinal: 54,
      resourceUri: 'theologai://documents/calvin-institutes#section-book-3-chapter-17',
    });

    const changed = structuredClone(parsed) as unknown as RecordValue;
    ((changed.probes as Array<RecordValue>)[0]!).firstSection = { sectionKey: 'wrong', sourceOrdinal: 1, resourceUri: 'theologai://documents/wrong' };
    expect(() => validateFixture(changed)).toThrow('fixture identity or probe inventory drifted');

    const changedPrimary = structuredClone(parsed) as unknown as RecordValue;
    ((changedPrimary.probes as Array<RecordValue>)[0]!).primarySearch = { sectionKey: 'wrong', sourceOrdinal: 1, resourceUri: 'theologai://documents/wrong' };
    expect(() => validateFixture(changedPrimary)).toThrow('fixture identity or probe inventory drifted');
  });

  it('keeps every natural probe grounded in its pinned reviewed source-pack edition, directory section, and actual relevance section', async () => {
    const parsed = validateFixture(await fixture());
    for (const probe of parsed.probes) {
      const edition = JSON.parse(await readFile(new URL(
        `data/historical-source-packs/core-eight/editions/${probe.editionId}.json`, root,
      ), 'utf8')) as { work: { workId: string }; sections: Array<{ sectionKey: string; sourceOrdinal: number; content: string }> };
      const text = edition.sections.map(section => section.content).join(' ').toLocaleLowerCase('en-US');
      expect(edition.work.workId).toBe(probe.workId);
      expect(edition.sections).toHaveLength(probe.sectionCount);
      expect(edition.sections[0]).toMatchObject({ sectionKey: probe.firstSection.sectionKey, sourceOrdinal: probe.firstSection.sourceOrdinal });
      expect(edition.sections[probe.primarySearch.sourceOrdinal - 1]).toMatchObject({
        sectionKey: probe.primarySearch.sectionKey, sourceOrdinal: probe.primarySearch.sourceOrdinal,
      });
      expect(probe.query.toLocaleLowerCase('en-US').split(/\s+/).every(term => text.includes(term))).toBe(true);
    }
    expect(parsed.probes.filter(probe => probe.primarySearch.sourceOrdinal !== probe.firstSection.sourceOrdinal)).toHaveLength(5);
  });

  it('is a fixed-preview, bounded protected release gate wired after D1 readiness and with manual-only reconciliation evidence', async () => {
    const [runner, workflow, readiness, reconciliation] = await Promise.all([
      readFile(runnerUrl, 'utf8'), readFile(workflowUrl, 'utf8'),
      readFile(new URL('scripts/check-remote-d1-readiness.ts', root), 'utf8'),
      readFile(new URL('docs/PREVIEW-RELEASE-RECONCILIATION.md', root), 'utf8'),
    ]);
    expect(runner).toContain("const PREVIEW_ENDPOINT = 'https://preview-mcp.theologai.xyz/mcp';");
    expect(runner).toContain('const MAX_LOGICAL_OPERATIONS = 54;');
    expect(runner).toContain('const MAX_HTTP_EXCHANGES = 55;');
    expect(runner).toContain('MAX_AGGREGATE_MCP_RESPONSE_BYTES = 2 * 1024 * 1024');
    expect(runner).toContain("redirect: 'error'");
    expect(runner).toContain('readBoundedResponseBody(response, controller, label)');
    expect(runner).not.toMatch(/--(?:url|endpoint|fixture)/);
    expect(runner).not.toContain('theologai-preview.tjfrederick.workers.dev');
    expect(readiness).toContain('auditHistoricalTransform9Authority');
    expect(reconciliation).toContain('does not automatically roll back, deploy, bind, delete, or mutate data');

    const d1Mapping = workflow.indexOf('- name: Capture checked-out candidate preview D1 mapping (read-only)');
    const d1 = workflow.indexOf('- name: Verify candidate preview D1 is compatible (read-only)');
    const predecessor = workflow.indexOf('- name: Capture preview predecessor reconciliation anchor (read-only)');
    const predecessorArtifact = workflow.indexOf('- name: Upload preview predecessor reconciliation anchor');
    const deploy = workflow.indexOf('- name: Deploy to Cloudflare Workers (preview)');
    const candidateCutover = workflow.indexOf('- name: Require deployed candidate preview D1 binding (read-only)');
    const v2 = workflow.indexOf('- name: Audit original-language v2 contract on preview');
    const historical = workflow.indexOf('- name: Audit Transform-9 historical core contract on preview');
    const reconciliationStep = workflow.indexOf('- name: Capture preview post-mutation reconciliation record (read-only)');
    const identity = workflow.indexOf('- name: Verify preview Worker remained active through audit (read-only)');
    const artifact = workflow.indexOf('name: preview-release-audit-');
    expect(d1Mapping).toBeGreaterThan(-1);
    expect(d1).toBeGreaterThan(d1Mapping);
    expect(predecessor).toBeGreaterThan(d1);
    expect(predecessorArtifact).toBeGreaterThan(predecessor);
    expect(deploy).toBeGreaterThan(predecessorArtifact);
    expect(candidateCutover).toBeGreaterThan(deploy);
    expect(v2).toBeGreaterThan(candidateCutover);
    expect(historical).toBeGreaterThan(v2);
    expect(reconciliationStep).toBeGreaterThan(historical);
    expect(identity).toBeGreaterThan(historical);
    expect(artifact).toBeGreaterThan(identity);
    expect(workflow).toContain('historical-core-preview-audit.json');
    expect(workflow).toContain('historical_audit_sha256');
    expect(workflow).toContain('wrangler versions view "$predecessor_version" --env preview --json');
    expect(workflow).toContain('wrangler versions view "$observed_active_version" --env preview --json');
  });

  it('runs the exact 55-exchange inventory through a representative fake transport without retaining bodies, locators, snippets, cursors, or error data', async () => {
    const parsed = validateFixture(await fixture());
    const calls: Array<{ url: string; body: RecordValue }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body)) as RecordValue;
      calls.push({ url: String(input), body });
      return responseFor(body, parsed);
    };

    const evidence = await runPreviewAudit(parsed, fakeFetch);
    expect(calls).toHaveLength(55);
    expect(calls.every(call => call.url === 'https://preview-mcp.theologai.xyz/mcp')).toBe(true);
    expect(evidence.budgets).toMatchObject({ logicalOperations: 54, maximumLogicalOperations: 54, httpExchanges: 55, maximumHttpExchanges: 55, retryCount: 0, maximumAggregateMcpResponseBytes: 2 * 1024 * 1024 });
    const serialized = JSON.stringify(evidence);
    for (const forbidden of ['PRIVATE HISTORICAL BODY', 'theologai://documents/', 'discovery snippet', 'not-a-valid-cursor', 'not found']) {
      expect(serialized).not.toContain(forbidden);
    }
    expect((evidence.records as unknown[])).toHaveLength(8);
    expect((evidence.regressions as RecordValue).ccel).toMatchObject({ provider: 'ccel_live', status: 'disabled', searched: false });
    const relevanceReads = calls.filter(call => call.body.method === 'resources/read'
      && parsed.probes.some(probe => probe.primarySearch.resourceUri === (call.body.params as RecordValue).uri))
      .map(call => (call.body.params as RecordValue).uri);
    expect(relevanceReads).toEqual(parsed.probes.map(probe => probe.primarySearch.resourceUri));
    expect(relevanceReads.filter((uri, index) => uri !== parsed.probes[index]!.firstSection.resourceUri)).toHaveLength(5);
  });

  it('fails before probes when a pinned advertised schema or open-world annotation drifts', async () => {
    const parsed = validateFixture(await fixture());
    let calls = 0;
    const schemaDrift: typeof fetch = async (_input, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as RecordValue;
      if (body.method === 'initialize') return jsonResponse(initialize(body));
      if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
      const tools = fakeTools();
      ((tools.find(tool => tool.name === 'classic_text_lookup')!.outputSchema as RecordValue).properties as RecordValue).schemaVersion = { const: 'wrong' };
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { tools } });
    };
    await expect(runPreviewAudit(parsed, schemaDrift)).rejects.toThrow('advertised classic-text output schema');
    expect(calls).toBe(3);

    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, {
      mutate: (body, response) => {
        if (body.method === 'tools/list') {
          const tools = ((response.result as RecordValue).tools as RecordValue[]);
          ((tools.find(tool => tool.name === 'primary_source_search')!.annotations as RecordValue).openWorldHint) = false;
        }
        return response;
      },
    }))).rejects.toThrow('open-world annotation drifted');
  });

  it('fails closed for exact resource/template/prompt/catalog/direct-landing/primary-locator contract drift', async () => {
    const parsed = validateFixture(await fixture());
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { mutate: (body, response) => {
      if (body.method === 'resources/list') ((response.result as RecordValue).resources as RecordValue[]).pop();
      return response;
    } }))).rejects.toThrow('resources/list must expose exactly 28 resources');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { mutate: (body, response) => {
      if (body.method === 'resources/templates/list') ((response.result as RecordValue).resourceTemplates as RecordValue[])[0]!.name = 'changed';
      return response;
    } }))).rejects.toThrow('exact template contract drifted');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { mutate: (body, response) => {
      if (body.method === 'prompts/get' && ((body.params as RecordValue).name === 'primary-source-research')) {
        ((((response.result as RecordValue).messages as RecordValue[])[0]!.content as RecordValue).text) = 'old prompt';
      }
      return response;
    } }))).rejects.toThrow('current v7 prompt behavior drifted');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { truncateClassicCatalog: true })))
      .rejects.toThrow('reviewed registration inventory drifted');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { directLandingText: '<img src="scan.png">' }))).rejects.toThrow('direct landing resource is not bounded normalized metadata');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { primaryLocatorDrift: true })))
      .rejects.toThrow('primary local evidence identity/readiness drifted');
  });

  it('rejects cursor, URI, credential, storage, and stack-trace error reflections before evidence is created', async () => {
    const parsed = validateFixture(await fixture());
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidCursorError: 'cursor not-a-valid-cursor' })))
      .rejects.toThrow('invalid cursor regression error reflected rejected input');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidResourceError: 'https://private.invalid/secret' })))
      .rejects.toThrow('invalid resource regression error leaked a URI, credential-shaped value, storage detail, stack trace, or secret reflection');
    for (const sensitive of ['SQLite database failure', 'API Key leaked', 'SQL D1 traceback stack']) {
      await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidResourceError: sensitive })))
        .rejects.toThrow('invalid resource regression error leaked a URI, credential-shaped value, storage detail, stack trace, or secret reflection');
    }
  });

  it('fails closed when bounded individual responses exceed the aggregate budget or the end-to-end deadline', async () => {
    const parsed = validateFixture(await fixture());
    const paddedFetch: typeof fetch = async (input, init) => {
      const response = responseFor(JSON.parse(String(init?.body)) as RecordValue, parsed);
      const body = await response.text();
      if (!body) return new Response('', { status: 202 });
      const padded = `${body}${' '.repeat(180_000)}`;
      return new Response(padded, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': String(new TextEncoder().encode(padded).byteLength) } });
    };
    await expect(runPreviewAudit(parsed, paddedFetch)).rejects.toThrow('aggregate response budget exceeded');

    let now = 0;
    const deadline = new AuditDeadline(() => now);
    let requests = 0;
    const deadlineFetch: typeof fetch = async (_input, init) => {
      requests += 1;
      const body = JSON.parse(String(init?.body)) as RecordValue;
      const response = responseFor(body, parsed);
      if (requests === 1) now = 300_001;
      return response;
    };
    await expect(runPreviewAudit(parsed, deadlineFetch, deadline)).rejects.toThrow('exceeded its 300-second total deadline');
  });

  it('uses one real-filesystem deadline through fixed preflight and true no-clobber evidence publication', async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'theologai-historical-preview-audit-'));
    try {
      const published = join(temporaryRoot, 'published.json');
      const successful = await runAuditCli(['--output', published], { runAudit: async () => ({ audit: 'safe' }) });
      expect(successful.output).toBe(published);
      expect(JSON.parse(readFileSync(published, 'utf8'))).toEqual({ audit: 'safe' });

      const existing = join(temporaryRoot, 'existing.json');
      writeFileSync(existing, 'original evidence');
      let auditCalled = false;
      await expect(runAuditCli(['--output', existing], { runAudit: async () => {
        auditCalled = true;
        return { audit: 'safe' };
      } })).rejects.toThrow('no-clobber policy');
      expect(auditCalled).toBe(false);
      expect(readFileSync(existing, 'utf8')).toBe('original evidence');

      const deadlineOutput = join(temporaryRoot, 'deadline.json');
      let now = 0;
      await expect(runAuditCli(['--output', deadlineOutput], {
        now: () => now,
        runAudit: async () => { now = 300_001; return { audit: 'safe' }; },
      })).rejects.toThrow('300-second total deadline');
      expect(existsSync(deadlineOutput)).toBe(false);

      const raced = join(temporaryRoot, 'raced.json');
      await expect(runAuditCli(['--output', raced], { runAudit: async () => {
        // This write occurs after CLI output preflight and before its atomic
        // link publication, reproducing the no-clobber race on the real FS.
        writeFileSync(raced, 'pre-existing');
        return { audit: 'safe' };
      } }))
        .rejects.toThrow('destination appeared during audit');
      expect(readFileSync(raced, 'utf8')).toBe('pre-existing');

      const postLinkExpiry = join(temporaryRoot, 'post-link-expiry.json');
      let clockReads = 0;
      await expect(publishAuditEvidence(postLinkExpiry, { audit: 'safe' }, new AuditDeadline(() => {
        clockReads += 1;
        // Construction plus the three pre-link checks return 0; the fifth
        // clock read is the post-link deadline proof and expires the audit.
        return clockReads >= 5 ? 300_001 : 0;
      }))).rejects.toThrow('true no-clobber evidence publication finalization');
      expect(existsSync(postLinkExpiry)).toBe(false);
      expect(readdirSync(temporaryRoot).filter(name => name.includes('.historical-core-preview-audit-'))).toEqual([]);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
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

function fakeFetchWith(fixtureValue: Audit, options: FakeOptions): typeof fetch {
  return async (_input, init) => responseFor(JSON.parse(String(init?.body)) as RecordValue, fixtureValue, options);
}

function responseFor(body: RecordValue, fixtureValue: Audit, options: FakeOptions = {}): Response {
  let payload: RecordValue;
  if (body.method === 'initialize') return jsonResponse(initialize(body));
  if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
  if (body.method === 'tools/list') payload = { jsonrpc: '2.0', id: body.id, result: { tools: fakeTools() } };
  else if (body.method === 'prompts/list') payload = { jsonrpc: '2.0', id: body.id, result: { prompts: fakePrompts() } };
  else if (body.method === 'prompts/get') payload = promptResponse(body);
  else if (body.method === 'resources/list') payload = { jsonrpc: '2.0', id: body.id, result: { resources: fakeResources(fixtureValue) } };
  else if (body.method === 'resources/templates/list') payload = { jsonrpc: '2.0', id: body.id, result: { resourceTemplates: fakeResourceTemplates() } };
  else if (body.method === 'resources/read') return resourceResponse(body, fixtureValue, options);
  else if (body.method === 'tools/call') return toolResponse(body, fixtureValue, options);
  else throw new Error(`unexpected fake method ${body.method}`);
  return jsonResponse(options.mutate ? options.mutate(body, payload) : payload);
}

function initialize(body: RecordValue): RecordValue {
  return { jsonrpc: '2.0', id: body.id, result: {
    protocolVersion: '2025-11-25', capabilities: { tools: {}, resources: {}, prompts: {} },
    serverInfo: { name: 'theologai-bible-server', version: '3.6.0-preview' },
  } };
}

function fakeTools(): RecordValue[] {
  const base = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
  return [
    'bible_lookup', 'bible_cross_references', 'parallel_passages', 'commentary_lookup',
    'classic_text_lookup', 'primary_source_search', 'original_language_lookup',
    'bible_verse_morphology', 'original_language_study', 'donation_config', 'verify_donation',
  ].map(name => {
    if (name === 'classic_text_lookup') return { name, annotations: { ...base, openWorldHint: false }, inputSchema: classicInput(), outputSchema: structuredClone(classicTextsOutputSchema) };
    if (name === 'primary_source_search') return { name, annotations: { ...base, openWorldHint: true }, inputSchema: primaryInput(), outputSchema: structuredClone(primarySourceSearchV7OutputSchema) };
    return { name, annotations: { ...base } };
  });
}

function classicInput(): RecordValue {
  return structuredClone(createClassicTextsHandler({} as never).inputSchema) as RecordValue;
}

function primaryInput(): RecordValue {
  return structuredClone(createPrimarySourceSearchHandler({} as never, V7_CONTRACT).inputSchema) as RecordValue;
}

function fakePrompts(): RecordValue[] {
  return ['word-study', 'passage-exegesis', 'compare-translations', 'confession-study', 'primary-source-research', 'donate'].map(name => ({ name }));
}

function promptResponse(body: RecordValue): RecordValue {
  const name = (body.params as RecordValue).name;
  const text = name === 'primary-source-research'
    ? 'Search local evidence. Search one external scope now. Use the v7 contract. {"providers":["local"]} {"providers":["ccel"]}. This prompt authorizes at most one CCEL-bearing call. The external CCEL call deliberately omits the requested local composition-year bounds; any returned CCEL hit cannot establish membership in that requested local range. Use MCP `resources/read` only for local `mcp_resource` URIs. Open external `external_url` pages directly and name disabled, unavailable, or unsupported searches.'
    : 'Use {"providers":["local","ccel"]}. An external `external_url` locator exists; it is not an MCP resource and rights status is not determined. Name any disabled, unavailable, or unsupported provider.';
  return { jsonrpc: '2.0', id: body.id, result: { messages: [{ role: 'user', content: { type: 'text', text } }] } };
}

function fakeResources(fixtureValue: Audit): RecordValue[] {
  const legacy = [
    '39-articles', 'apostles-creed', 'athanasian-creed', 'augsburg-confession', 'baltimore-catechism',
    'belgic-confession', 'canons-of-dort', 'chalcedonian-definition', 'confession-of-dositheus', 'council-of-trent',
    'heidelberg-catechism', 'london-baptist-1689', 'nicene-creed', 'philaret-catechism', 'westminster-confession',
    'westminster-larger-catechism', 'westminster-shorter-catechism',
  ].map(id => ({ uri: `theologai://documents/${id}`, mimeType: 'text/markdown' }));
  return [
    { uri: 'theologai://translations', mimeType: 'text/markdown' }, { uri: 'theologai://commentaries', mimeType: 'text/markdown' },
    { uri: 'theologai://primary-sources/catalog', mimeType: 'application/json' }, ...legacy,
    ...fixtureValue.probes.map(probe => ({ uri: probe.landingResourceUri, mimeType: 'text/markdown' })),
  ];
}

function fakeResourceTemplates(): RecordValue[] {
  return [
    { uriTemplate: 'theologai://documents/{slug}', name: 'Historical Document', mimeType: 'text/markdown' },
    { uriTemplate: 'theologai://strongs/{number}', name: "Strong's Dictionary Entry", mimeType: 'text/markdown' },
  ];
}

function resourceResponse(body: RecordValue, fixtureValue: Audit, options: FakeOptions): Response {
  const uri = (body.params as RecordValue).uri as string;
  if (uri === 'theologai://primary-sources/catalog') return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(fakeCatalog(fixtureValue)) }] } });
  if (uri.includes('does-not-exist')) return jsonResponse({ jsonrpc: '2.0', id: body.id, error: { code: -32002, message: options.invalidResourceError ?? 'not found' } });
  const firstLanding = fixtureValue.probes[0]!.landingResourceUri;
  const text = uri === firstLanding ? options.directLandingText ?? '# Work record\nMetadata only.' : '# Exact section\nPRIVATE HISTORICAL BODY';
  return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { contents: [{ uri, mimeType: 'text/markdown', text }] } });
}

function fakeCatalog(fixtureValue: Audit): RecordValue {
  const legacy = [
    '39-articles', 'apostles-creed', 'athanasian-creed', 'augsburg-confession', 'baltimore-catechism', 'belgic-confession', 'canons-of-dort', 'chalcedonian-definition', 'confession-of-dositheus', 'council-of-trent', 'heidelberg-catechism', 'london-baptist-1689', 'nicene-creed', 'philaret-catechism', 'westminster-confession', 'westminster-larger-catechism', 'westminster-shorter-catechism',
  ].map(id => ({ id, editionReadiness: { editionIdentity: 'not_established' } }));
  const core = fixtureValue.probes.map(probe => ({ id: probe.workId,
    editionProvenance: { sourcePackId: fixtureValue.baseline.sourcePackId, editionId: probe.editionId },
    editionReadiness: { editionIdentity: 'established', provenance: 'verified', normalizedTextRights: 'no_known_conflict' },
  }));
  return { schemaVersion: '2', kind: 'local_primary_source_catalog', workCount: 25, works: [...legacy, ...core],
    policies: { scope: 'hosted_collection_only', editionProvenance: 'mixed_legacy_and_reviewed_source_packs', rightsStatus: 'mixed_not_established_and_no_known_conflict' } };
}

function toolResponse(body: RecordValue, fixtureValue: Audit, options: FakeOptions): Response {
  const params = body.params as RecordValue;
  const name = params.name as string;
  const args = params.arguments as RecordValue;
  if (name === 'classic_text_lookup') return classicTool(body, args, fixtureValue, options);
  if (name === 'primary_source_search') return primaryTool(body, args, fixtureValue, options);
  throw new Error(`unexpected fake tool ${name}`);
}

function classicTool(body: RecordValue, args: RecordValue, fixtureValue: Audit, options: FakeOptions): Response {
  if (args.cursor) return toolResult(body, { isError: true, content: [{ type: 'text', text: options.invalidCursorError ?? 'cursor rejected safely' }] });
  if (args.listWorks === true) return toolResult(body, { structuredContent: { schemaVersion: '2', kind: 'classic_text_lookup', mode: 'list_works', catalog: { coverage: 'complete_local_work_inventory', delivery: 'metadata_summary', works: options.truncateClassicCatalog ? fakeClassicWorks(fixtureValue).slice(0, -1) : fakeClassicWorks(fixtureValue) } } });
  if (args.work === fixtureValue.legacyRegression.workId) return toolResult(body, { structuredContent: { schemaVersion: '2', kind: 'classic_text_lookup', mode: 'work', document: { work: { id: args.work }, deliveryMode: 'complete_document', bodyDelivery: 'markdown_only' } } });
  const probe = args.query
    ? fixtureValue.probes.find(item => item.query === args.query)!
    : fixtureValue.probes.find(item => item.workId === args.work)!;
  if (args.browseSections) return toolResult(body, { structuredContent: directory(probe) });
  if (args.query) return toolResult(body, { structuredContent: { schemaVersion: '2', kind: 'classic_text_lookup', mode: 'search', search: { status: 'ok', hits: [{ work: { id: probe.workId }, snippetOnly: true }] } } });
  return toolResult(body, { structuredContent: landing(probe) });
}

function fakeClassicWorks(fixtureValue: Audit): RecordValue[] {
  const works = fakeCatalog(fixtureValue).works as RecordValue[];
  return works.map(work => ({ id: work.id, deliveryMode: fixtureValue.probes.some(probe => probe.workId === work.id) ? 'sectioned_only' : 'complete_document' }));
}

function landing(probe: Audit['probes'][number]): RecordValue {
  return { schemaVersion: '2', kind: 'classic_text_lookup', mode: 'landing',
    evidencePolicy: { providerScope: 'local_only', remoteDocumentBodies: 'disabled', selectedContentAccess: 'mcp_resource_read' },
    landing: { work: { id: probe.workId, deliveryMode: 'sectioned_only', resource: { kind: 'mcp_resource', uri: probe.landingResourceUri } }, sectionCount: probe.sectionCount, bodyDelivery: 'exact_section_resource_only', browse: { pageSize: 32 } } };
}

function directory(probe: Audit['probes'][number]): RecordValue {
  return { schemaVersion: '2', kind: 'classic_text_lookup', mode: 'browse_sections', directory: { work: { id: probe.workId }, coverage: 'bounded_section_directory', pagination: { pageSize: 32 }, sections: [{ sectionKey: probe.firstSection.sectionKey, sourceOrdinal: probe.firstSection.sourceOrdinal, resource: { kind: 'mcp_resource', uri: probe.firstSection.resourceUri } }] } };
}

function primaryTool(body: RecordValue, args: RecordValue, fixtureValue: Audit, options: FakeOptions): Response {
  const query = ((args.queries as RecordValue[])[0])!;
  if ((query.providers as string[])[0] === 'ccel') return toolResult(body, { structuredContent: { schemaVersion: '7', kind: 'primary_source_search', planStatus: 'unavailable', queries: [{ providers: [{ provider: 'ccel_live', status: 'disabled', searched: false, hitCount: 0, hits: [] }] }], coverage: { localAttempted: false, ccelAttempted: false, ccelStatus: 'disabled', ccelHitCount: 0 } } });
  const workId = query.work as string;
  const probe = fixtureValue.probes.find(item => item.workId === workId)!;
  const uri = options.primaryLocatorDrift
    ? `${probe.landingResourceUri}#section-noncanonical`
    : probe.primarySearch.resourceUri;
  const relevanceHit = { locator: {
    kind: 'mcp_resource', uri, documentId: workId,
    sectionKey: probe.primarySearch.sectionKey, sourceOrdinal: probe.primarySearch.sourceOrdinal,
  }, editionReadiness: { editionIdentity: 'established', normalizedTextRights: 'no_known_conflict' } };
  // Real relevance results need not be the directory's first source section.
  // Keep a lower-ranked first section when different to prove this gate reads
  // the pinned relevance hit, not a directory-order surrogate.
  const lowerRankedDirectoryHit = probe.primarySearch.resourceUri === probe.firstSection.resourceUri ? [] : [{ locator: {
    kind: 'mcp_resource', uri: probe.firstSection.resourceUri, documentId: workId,
    sectionKey: probe.firstSection.sectionKey, sourceOrdinal: probe.firstSection.sourceOrdinal,
  }, editionReadiness: { editionIdentity: 'established', normalizedTextRights: 'no_known_conflict' } }];
  const hits = [relevanceHit, ...lowerRankedDirectoryHit];
  return toolResult(body, { structuredContent: { schemaVersion: '7', kind: 'primary_source_search', planStatus: 'complete', queries: [{ providers: [{ provider: 'local', status: 'ok', searched: true, hitCount: hits.length, hits }] }], coverage: { localAttempted: true, localHitCount: hits.length }, evidencePolicy: { snippetUse: 'discovery_only', localSectionAccess: 'mcp_resource_read', externalSectionAccess: 'direct_url_only' } } });
}

function toolResult(body: RecordValue, result: RecordValue): Response { return jsonResponse({ jsonrpc: '2.0', id: body.id, result }); }
function jsonResponse(value: unknown): Response {
  const body = JSON.stringify(value);
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': String(new TextEncoder().encode(body).byteLength) } });
}
