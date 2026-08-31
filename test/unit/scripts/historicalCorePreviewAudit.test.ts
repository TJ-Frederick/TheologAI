import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { Server } from '@modelcontextprotocol/server';
import {
  AuditDeadline,
  MAX_MCP_RESPONSE_BYTES,
  PREVIEW_PROFILE,
  PRODUCTION_PROFILE,
  publishAuditEvidence,
  readBoundedResponseBody,
  runAuditCli,
  runPreviewAudit,
  runProductionAudit,
  validateFixture,
} from '../../../scripts/audit-historical-core-preview.js';
import { classicTextsOutputSchema } from '../../../src/mcp/schemas/classicTexts.js';
import { primarySourceSearchV6OutputSchema, primarySourceSearchV7OutputSchema } from '../../../src/mcp/schemas/primarySourceSearchV4.js';
import { registerToolHandlers } from '../../../src/mcp/tools.js';
import { createClassicTextsHandler } from '../../../src/tools/v2/classicTexts.js';
import { createPrimarySourceSearchHandler } from '../../../src/tools/v2/primarySourceSearch.js';
import { createPrimarySourceSearchDescriptor } from '../../../src/mcp/primarySourceSearchDescriptor.js';

const root = new URL('../../../', import.meta.url);
const fixtureUrl = new URL('test/fixtures/historical-core-preview-audit.json', root);
const runnerUrl = new URL('scripts/audit-historical-core-preview.ts', root);
const workflowUrl = new URL('.github/workflows/pr.yml', root);

type RecordValue = Record<string, unknown>;
type Audit = ReturnType<typeof validateFixture>;
type FakeOptions = {
  mutate?: (body: RecordValue, response: RecordValue) => RecordValue;
  invalidResourceError?: string;
  invalidResourceCode?: number;
  invalidResourceData?: RecordValue;
  omitInvalidResourceData?: boolean;
  invalidResourceExtra?: RecordValue;
  invalidResourceResult?: RecordValue;
  invalidCursorError?: string;
  directLandingText?: string;
  truncateClassicCatalog?: boolean;
  primaryLocatorDrift?: boolean;
  laterExternalPrimaryHit?: boolean;
  laterNoncanonicalPrimaryHit?: boolean;
  catalogProvenanceStatus?: string | null;
  landingResourceSizeBytes?: number | null;
  ccelIsError?: boolean;
  ccelStructuredContent?: boolean;
};

const FAKE_LANDING_TEXT = '# Work record\nMetadata only.';
const transform11WorkIds = [
  'augustine-on-christian-doctrine',
  'basil-on-the-holy-spirit',
  'gregory-nazianzen-five-theological-orations',
  'gregory-nyssa-great-catechism',
  'justin-martyr-apologies',
  'origen-de-principiis',
  'hooker-laws-of-ecclesiastical-polity-book-1',
  'julian-revelations-of-divine-love',
  'kempis-imitation-of-christ',
  'pascal-pensees',
] as const;

async function fixture(): Promise<RecordValue> {
  return JSON.parse(await readFile(fixtureUrl, 'utf8')) as RecordValue;
}

describe('historical core preview audit contract', () => {
  it('accepts the 35-work Transform-11 catalog while retaining deep core-eight probes', async () => {
    const parsed = validateFixture(await fixture());
    expect(parsed.baseline.expectedCatalogIdentity).toEqual({ workCount: 35, legacyWorkCount: 17, coreWorkCount: 8, coreSectionCount: 512 });
    expect(parsed.baseline.expectedCoreEditionProvenanceStatus).toBe('verified_with_uncertainty');
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

    const calvin = parsed.probes.find(probe => probe.workId === 'calvin-institutes')!;
    const wesley = parsed.probes.find(probe => probe.workId === 'wesley-standard-sermons')!;
    expect(calvin.query).toBe('promises law gospel reconciled');
    expect(calvin.query).not.toBe('justification');
    expect(calvin.primarySearch).toEqual({
      sectionKey: 'book-3-chapter-17', sourceOrdinal: 54,
      resourceUri: 'theologai://documents/calvin-institutes#section-book-3-chapter-17',
    });
    expect(wesley.query).toBe('salvation by faith');
    expect(wesley.query).not.toBe('salvation');
    expect(wesley.primarySearch).toEqual({
      sectionKey: 'sermon-01', sourceOrdinal: 1,
      resourceUri: 'theologai://documents/wesley-standard-sermons#section-sermon-01',
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
      ), 'utf8')) as {
        work: { workId: string };
        edition: { provenance: { status: string } };
        sections: Array<{ sectionKey: string; sourceOrdinal: number; content: string }>;
      };
      const text = edition.sections.map(section => section.content).join(' ').toLocaleLowerCase('en-US');
      expect(edition.work.workId).toBe(probe.workId);
      expect(edition.edition.provenance.status).toBe(parsed.baseline.expectedCoreEditionProvenanceStatus);
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
    const spine = workflow.indexOf('- name: Audit Transform-11 historical spine contract on preview');
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
    expect(spine).toBeGreaterThan(historical);
    expect(reconciliationStep).toBeGreaterThan(spine);
    expect(identity).toBeGreaterThan(spine);
    expect(artifact).toBeGreaterThan(identity);
    expect(workflow).toContain('historical-core-preview-audit.json');
    expect(workflow).toContain('historical_audit_sha256');
    expect(workflow).toContain('historical-spine-preview-audit.json');
    expect(workflow).toContain('historical_spine_audit_sha256');
    expect(workflow).toContain('wrangler versions view "$predecessor_version" --env preview --json');
    expect(workflow).toContain('wrangler versions view "$observed_active_version" --env preview --json');
  });

  it('runs the exact 55-exchange inventory through a representative fake transport without retaining bodies, locators, snippets, cursors, or error data', async () => {
    const parsed = validateFixture(await fixture());
    const calls: Array<{ url: string; body: RecordValue; userAgent: string | null }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body)) as RecordValue;
      calls.push({ url: String(input), body, userAgent: new Headers(init?.headers).get('user-agent') });
      return responseFor(body, parsed);
    };

    const evidence = await runPreviewAudit(parsed, fakeFetch);
    expect(calls).toHaveLength(55);
    expect(calls.every(call => call.url === 'https://preview-mcp.theologai.xyz/mcp')).toBe(true);
    expect(new Set(calls.map(call => call.userAgent))).toEqual(new Set(['TheologAI-HistoricalCore-preview-Audit/1.0']));
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

  it('runs the same exact 55-exchange inventory against the production v6 profile and retains only local-only evidence', async () => {
    const parsed = validateFixture(await fixture());
    const calls: Array<{ url: string; body: RecordValue; userAgent: string | null }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body)) as RecordValue;
      calls.push({ url: String(input), body, userAgent: new Headers(init?.headers).get('user-agent') });
      return responseFor(body, parsed, {}, PRODUCTION_PROFILE);
    };

    const evidence = await runProductionAudit(parsed, fakeFetch);
    expect(calls).toHaveLength(55);
    expect(calls.every(call => call.url === 'https://mcp.theologai.xyz/mcp')).toBe(true);
    expect(new Set(calls.map(call => call.userAgent))).toEqual(new Set(['TheologAI-HistoricalCore-production-Audit/1.0']));
    expect(evidence.schemas).toMatchObject({
      primarySourceContractVersion: '6', primarySourceOpenWorldHint: false,
      primarySourceProviderMaximum: 1, primarySourceExternalDiscoveryBoundary: 'rejected_at_input_schema',
      primarySourceInputSchemaSha256: '37849624bac2e884106050fcff39851e40cac31969b4f7511f516f78348fea87',
      primarySourceOutputSchemaSha256: '25758f8d06c43c3f2961fa7b35ba1d62a548df923589b391c65204813a6511b8',
    });
    expect((evidence.regressions as RecordValue).ccel).toEqual({
      provider: 'ccel', status: 'rejected_at_input_schema', searched: false, hitCount: 0,
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain('ccel_live');
    expect(serialized).not.toContain('external_url');
    expect(serialized).not.toContain('theologai://documents/');
    expect(calls.filter(call => call.body.method === 'tools/call'
      && (call.body.params as RecordValue).name === 'primary_source_search')).toHaveLength(9);
  });

  it('fails closed when production v6 registration, prompts, or local-only evidence drift toward preview discovery behavior', async () => {
    const parsed = validateFixture(await fixture());
    await expect(runProductionAudit(parsed, fakeFetchWith(parsed, {
      mutate: (body, response) => {
        if (body.method === 'tools/list') {
          const primary = ((response.result as RecordValue).tools as RecordValue[])
            .find(tool => tool.name === 'primary_source_search')!;
          (primary.annotations as RecordValue).openWorldHint = true;
        }
        return response;
      },
    }, PRODUCTION_PROFILE))).rejects.toThrow('open-world annotation drifted');

    await expect(runProductionAudit(parsed, fakeFetchWith(parsed, {
      mutate: (body, response) => {
        if (body.method === 'tools/list') {
          const primary = ((response.result as RecordValue).tools as RecordValue[])
            .find(tool => tool.name === 'primary_source_search')!;
          const providers = ((((primary.inputSchema as RecordValue).properties as RecordValue).queries as RecordValue).items as RecordValue).properties as RecordValue;
          const providerArray = providers.providers as RecordValue;
          providerArray.maxItems = 2;
          ((providerArray.items as RecordValue).enum as unknown[])!.push('ccel');
        }
        return response;
      },
    }, PRODUCTION_PROFILE))).rejects.toThrow('primary-source provider contract drifted');

    await expect(runProductionAudit(parsed, fakeFetchWith(parsed, {
      mutate: (body, response) => {
        if (body.method === 'tools/list') {
          const primary = ((response.result as RecordValue).tools as RecordValue[])
            .find(tool => tool.name === 'primary_source_search')!;
          (((primary.outputSchema as RecordValue).properties as RecordValue).schemaVersion as RecordValue).const = '7';
        }
        return response;
      },
    }, PRODUCTION_PROFILE))).rejects.toThrow('advertised primary-source output schema differs from the checked-out contract');

    await expect(runProductionAudit(parsed, fakeFetchWith(parsed, {
      mutate: (body, response) => {
        if (body.method === 'prompts/get' && (body.params as RecordValue).name === 'primary-source-research') {
          ((((response.result as RecordValue).messages as RecordValue[])[0]!.content as RecordValue).text) = 'Search one external scope now';
        }
        return response;
      },
    }, PRODUCTION_PROFILE))).rejects.toThrow('production primary-source-research prompt required behavior drifted');
  });

  it('rejects appended contradictory prompt guidance for both fixed primary-source profiles', async () => {
    const parsed = validateFixture(await fixture());
    const append = (profile: AuditProfile, prompt: string, marker: string) => fakeFetchWith(parsed, {
      mutate: (body, response) => {
        if (body.method === 'prompts/get' && (body.params as RecordValue).name === prompt) {
          const content = ((response.result as RecordValue).messages as RecordValue[])[0]!.content as RecordValue;
          content.text = `${content.text as string}\n${marker}`;
        }
        return response;
      },
    }, profile);

    await expect(runPreviewAudit(parsed, append(PREVIEW_PROFILE, 'primary-source-research', 'This workflow is local-only')))
      .rejects.toThrow('preview primary-source-research prompt local-only boundary drifted');
    await expect(runPreviewAudit(parsed, append(PREVIEW_PROFILE, 'confession-study', 'Run bounded local discovery')))
      .rejects.toThrow('preview confession-study prompt local-only boundary drifted');
    await expect(runProductionAudit(parsed, append(PRODUCTION_PROFILE, 'primary-source-research', 'Search one external scope now')))
      .rejects.toThrow('production primary-source-research prompt local-only boundary drifted');
    await expect(runProductionAudit(parsed, append(PRODUCTION_PROFILE, 'confession-study', 'external `external_url` locator')))
      .rejects.toThrow('production confession-study prompt local-only boundary drifted');
  });

  it('proves a v6 CCEL provider is rejected by input validation before the primary-source handler can execute', async () => {
    const search = vi.fn();
    const handler = createPrimarySourceSearchHandler({ search } as never, createPrimarySourceSearchDescriptor());
    const server = new Server({ name: 'historical-v6-input-boundary-test', version: '1.0.0' }, { capabilities: { tools: {} } });
    registerToolHandlers(server, [handler], false);
    const client = new Client({ name: 'historical-v6-input-boundary-client', version: '1.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: 'primary_source_search',
        arguments: { queries: [{ id: 'ccel-boundary', text: 'Lord Supper', providers: ['ccel'] }] },
      });
      expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: expect.stringContaining('Invalid arguments for primary_source_search:') }] });
      expect(result).not.toHaveProperty('structuredContent');
      expect(JSON.stringify(result)).not.toContain('ccel_live');
      expect(search).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('fails before probes when a pinned advertised schema or open-world annotation drifts', async () => {
    const parsed = validateFixture(await fixture());
    let calls = 0;
    const schemaDrift: typeof fetch = async (_input, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as RecordValue;
      if (body.method === 'initialize') return jsonResponse(initialize(body, PREVIEW_PROFILE));
      if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
      const tools = fakeTools(PREVIEW_PROFILE);
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
    } }))).rejects.toThrow('resources/list must expose exactly 38 resources');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { mutate: (body, response) => {
      if (body.method === 'resources/templates/list') ((response.result as RecordValue).resourceTemplates as RecordValue[])[0]!.name = 'changed';
      return response;
    } }))).rejects.toThrow('exact template contract drifted');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { mutate: (body, response) => {
      if (body.method === 'prompts/get' && ((body.params as RecordValue).name === 'primary-source-research')) {
        ((((response.result as RecordValue).messages as RecordValue[])[0]!.content as RecordValue).text) = 'old prompt';
      }
      return response;
    } }))).rejects.toThrow('preview primary-source-research prompt required behavior drifted');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { truncateClassicCatalog: true })))
      .rejects.toThrow('reviewed registration inventory drifted');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { directLandingText: '<img src="scan.png">' }))).rejects.toThrow('direct landing resource is not bounded normalized metadata');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { primaryLocatorDrift: true })))
      .rejects.toThrow('primary local provider canonical locator drifted');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { laterExternalPrimaryHit: true })))
      .rejects.toThrow('primary local provider hit-scope drifted');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { laterNoncanonicalPrimaryHit: true })))
      .rejects.toThrow('primary local provider canonical locator drifted');
  });

  it('requires the reviewed core-eight provenance status, rather than treating a stronger-looking status as interchangeable', async () => {
    const parsed = validateFixture(await fixture());
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed)))
      .resolves.toMatchObject({ records: expect.any(Array) });
    for (const provenance of ['verified', 'incomplete', null]) {
      await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { catalogProvenanceStatus: provenance })))
        .rejects.toThrow('edition readiness drifted');
    }
  });

  it('requires an exact positive bounded size only for a sectioned landing resource', async () => {
    const parsed = validateFixture(await fixture());
    for (const resourceSizeBytes of [null, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { landingResourceSizeBytes: resourceSizeBytes })))
        .rejects.toThrow('landing canonical locator/byte contract drifted');
    }
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { landingResourceSizeBytes: 1 })))
      .rejects.toThrow('landing resource byte size drifted');
  });

  it('enforces the 16,384-byte landing ceiling and measures direct landing resources as UTF-8', async () => {
    const parsed = validateFixture(await fixture());
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { landingResourceSizeBytes: 16_385 })))
      .rejects.toThrow('landing canonical locator/byte contract drifted');

    const ceilingText = 'x'.repeat(16_384);
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, {
      directLandingText: ceilingText, landingResourceSizeBytes: 16_384,
    }))).resolves.toMatchObject({ records: expect.any(Array) });

    const multibyteText = 'é'.repeat(100);
    const multibyteBytes = new TextEncoder().encode(multibyteText).byteLength;
    expect(multibyteBytes).not.toBe(multibyteText.length);
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, {
      directLandingText: multibyteText, landingResourceSizeBytes: multibyteBytes,
    }))).resolves.toMatchObject({ records: expect.any(Array) });
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, {
      directLandingText: multibyteText, landingResourceSizeBytes: multibyteText.length,
    }))).rejects.toThrow('landing resource byte size drifted');
  });

  it('keeps catalog and directory locators intentionally unsized', () => {
    const properties = (classicTextsOutputSchema as unknown as RecordValue).properties as RecordValue;
    const catalog = properties.catalog as RecordValue;
    const catalogProperties = catalog.properties as RecordValue;
    const catalogWorks = catalogProperties.works as RecordValue;
    const catalogWork = catalogWorks.items as RecordValue;
    const catalogLocator = (catalogWork.properties as RecordValue).resource as RecordValue;
    const directory = properties.directory as RecordValue;
    const directorySections = (directory.properties as RecordValue).sections as RecordValue;
    const directoryEntry = directorySections.items as RecordValue;
    const directoryLocator = (directoryEntry.properties as RecordValue).resource as RecordValue;
    const landing = properties.landing as RecordValue;
    const landingWork = (landing.properties as RecordValue).work as RecordValue;
    const landingLocator = (landingWork.properties as RecordValue).resource as RecordValue;

    expect(catalogLocator.required).toEqual(['kind', 'uri']);
    expect(directoryLocator.required).toEqual(['kind', 'uri']);
    expect((catalogLocator.properties as RecordValue)).not.toHaveProperty('resourceSizeBytes');
    expect((directoryLocator.properties as RecordValue)).not.toHaveProperty('resourceSizeBytes');
    expect(landingLocator.required).toEqual(['kind', 'uri', 'resourceSizeBytes']);
  });

  it('requires disabled expanded discovery to preserve the catalog result and structured diagnostic', async () => {
    const parsed = validateFixture(await fixture());
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { ccelIsError: true })))
      .rejects.toThrow('expanded discovery disabled regression must preserve a successful catalog result and structured diagnostic');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { ccelStructuredContent: false })))
      .rejects.toThrow('expanded discovery disabled regression must preserve a successful catalog result and structured diagnostic');
  });

  it('requires the exact safe resource-not-found diagnostic envelope without retaining it in evidence', async () => {
    const parsed = validateFixture(await fixture());
    const invalidResourceUri = 'theologai://documents/does-not-exist#section-not-real';
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidResourceError: 'Resource not found' })))
      .resolves.toMatchObject({ regressions: { invalidResourceRejected: true } });
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidResourceCode: -32001 })))
      .rejects.toThrow('invalid resource regression must return exact resource-not-found code -32002');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidResourceError: `MCP error -32002: Resource not found: ${invalidResourceUri}` })))
      .rejects.toThrow('invalid resource regression must return an exact safe resource-not-found message');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidResourceError: 'MCP error -32002: Resource not found: file:///private/tmp/internal' })))
      .rejects.toThrow('invalid resource regression must return an exact safe resource-not-found message');
    for (const invalidResourceExtra of [
      { stack: 'Error: not found' }, { debug: 'internal' }, { source: 'file:///private/tmp/internal' },
    ]) {
      await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidResourceExtra })))
        .rejects.toThrow('invalid resource regression error envelope keys drifted');
    }
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidResourceResult: { unexpected: true } })))
      .rejects.toThrow('invalid resource regression must not return result alongside error');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { omitInvalidResourceData: true })))
      .rejects.toThrow('invalid resource regression error envelope keys drifted');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidResourceData: { uri: 'theologai://documents/a-different-resource' } })))
      .rejects.toThrow('invalid resource regression must return only the requested URI in error data');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidResourceData: { uri: invalidResourceUri, relatedUri: 'theologai://documents/another-resource' } })))
      .rejects.toThrow('invalid resource regression must return only the requested URI in error data');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidResourceData: { uri: invalidResourceUri, token: 'not-a-real-token' } })))
      .rejects.toThrow('invalid resource regression must return only the requested URI in error data');
  });

  it('rejects cursor, URI, credential, storage, and stack-trace error reflections before evidence is created', async () => {
    const parsed = validateFixture(await fixture());
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidCursorError: 'cursor not-a-valid-cursor' })))
      .rejects.toThrow('invalid cursor regression error reflected rejected input');
    await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidResourceError: 'https://private.invalid/secret' })))
      .rejects.toThrow('invalid resource regression must return an exact safe resource-not-found message');
    for (const sensitive of ['SQLite database failure', 'API Key leaked', 'SQL D1 traceback stack', 'Internal implementation detail']) {
      await expect(runPreviewAudit(parsed, fakeFetchWith(parsed, { invalidResourceError: `MCP error -32002: Resource not found; ${sensitive}` })))
        .rejects.toThrow('invalid resource regression must return an exact safe resource-not-found message');
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

type AuditProfile = typeof PREVIEW_PROFILE;

function fakeFetchWith(
  fixtureValue: Audit,
  options: FakeOptions = {},
  profile: AuditProfile = PREVIEW_PROFILE,
): typeof fetch {
  return async (_input, init) => responseFor(JSON.parse(String(init?.body)) as RecordValue, fixtureValue, options, profile);
}

function responseFor(
  body: RecordValue,
  fixtureValue: Audit,
  options: FakeOptions = {},
  profile: AuditProfile = PREVIEW_PROFILE,
): Response {
  let payload: RecordValue;
  if (body.method === 'initialize') return jsonResponse(initialize(body, profile));
  if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
  if (body.method === 'tools/list') payload = { jsonrpc: '2.0', id: body.id, result: { tools: fakeTools(profile) } };
  else if (body.method === 'prompts/list') payload = { jsonrpc: '2.0', id: body.id, result: { prompts: fakePrompts() } };
  else if (body.method === 'prompts/get') payload = promptResponse(body, profile);
  else if (body.method === 'resources/list') payload = { jsonrpc: '2.0', id: body.id, result: { resources: fakeResources(fixtureValue) } };
  else if (body.method === 'resources/templates/list') payload = { jsonrpc: '2.0', id: body.id, result: { resourceTemplates: fakeResourceTemplates() } };
  else if (body.method === 'resources/read') return resourceResponse(body, fixtureValue, options);
  else if (body.method === 'tools/call') return toolResponse(body, fixtureValue, options, profile);
  else throw new Error(`unexpected fake method ${body.method}`);
  return jsonResponse(options.mutate ? options.mutate(body, payload) : payload);
}

function initialize(body: RecordValue, profile: AuditProfile): RecordValue {
  return { jsonrpc: '2.0', id: body.id, result: {
    protocolVersion: '2025-11-25', capabilities: { tools: {}, resources: {}, prompts: {} },
    serverInfo: { name: 'theologai-bible-server', version: profile.serverVersion },
  } };
}

function fakeTools(profile: AuditProfile): RecordValue[] {
  const base = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
  return [
    'bible_lookup', 'bible_cross_references', 'parallel_passages', 'commentary_lookup',
    'classic_text_lookup', 'primary_source_search', 'original_language_lookup',
    'bible_verse_morphology', 'original_language_study', 'donation_config', 'verify_donation',
  ].map(name => {
    if (name === 'classic_text_lookup') return { name, annotations: { ...base, openWorldHint: false }, inputSchema: classicInput(), outputSchema: structuredClone(classicTextsOutputSchema) };
    if (name === 'primary_source_search') return {
      name, annotations: { ...base, openWorldHint: profile.primarySource.openWorldHint },
      inputSchema: primaryInput(profile),
      outputSchema: structuredClone(profile.primarySource.contractVersion === '7' ? primarySourceSearchV7OutputSchema : primarySourceSearchV6OutputSchema),
    };
    return { name, annotations: { ...base } };
  });
}

function classicInput(): RecordValue {
  return structuredClone(createClassicTextsHandler({} as never).inputSchema) as RecordValue;
}

function primaryInput(profile: AuditProfile): RecordValue {
  return structuredClone(profile.primarySource.inputSchema) as RecordValue;
}

function fakePrompts(): RecordValue[] {
  return ['word-study', 'passage-exegesis', 'compare-translations', 'confession-study', 'primary-source-research', 'donate'].map(name => ({ name }));
}

function promptResponse(body: RecordValue, profile: AuditProfile): RecordValue {
  const name = (body.params as RecordValue).name;
  const text = profile.primarySource.contractVersion === '7'
    ? name === 'primary-source-research'
      ? 'Inspect catalog scope. Run one provider-neutral search plan. {"searchDepth":"expanded"} {"searchDepth":"standard"}. At most one query may be expanded per call. Expanded discovery deliberately omits the requested catalog composition-year bounds; any returned broader hit cannot establish membership in that requested range. Use MCP `resources/read` for `mcp_resource` URIs. Open external `external_url` pages directly and name disabled, unavailable, or unsupported searches.'
      : 'The provider-neutral expanded depth is bounded. For an `external_url` locator, it is not an MCP resource and rights status is not determined. Name any disabled, unavailable, or unsupported provider.'
    : name === 'primary-source-research'
      ? 'Run bounded discovery. This workflow is local-only. Use the v6 structured result. Read an exact MCP resource before quotation. This workflow supports a topic survey.'
      : 'Run bounded local discovery across the hosted collection. Follow canonical `resource_link` blocks with resources/read.';
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
    ...transform11WorkIds.map(id => ({ uri: `theologai://documents/${id}`, mimeType: 'text/markdown' })),
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
  if (uri === 'theologai://primary-sources/catalog') return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(fakeCatalog(fixtureValue, options)) }] } });
  if (uri.includes('does-not-exist')) return jsonResponse({
    jsonrpc: '2.0', id: body.id,
    ...(options.invalidResourceResult === undefined ? {} : { result: options.invalidResourceResult }),
    error: {
      code: options.invalidResourceCode ?? -32002,
      message: options.invalidResourceError ?? 'MCP error -32002: Resource not found',
      ...(options.omitInvalidResourceData ? {} : { data: options.invalidResourceData ?? { uri } }),
      ...(options.invalidResourceExtra ?? {}),
    },
  });
  const firstLanding = fixtureValue.probes[0]!.landingResourceUri;
  const text = uri === firstLanding ? options.directLandingText ?? FAKE_LANDING_TEXT : '# Exact section\nPRIVATE HISTORICAL BODY';
  return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { contents: [{ uri, mimeType: 'text/markdown', text }] } });
}

function fakeCatalog(fixtureValue: Audit, options: FakeOptions = {}): RecordValue {
  const legacy = [
    '39-articles', 'apostles-creed', 'athanasian-creed', 'augsburg-confession', 'baltimore-catechism', 'belgic-confession', 'canons-of-dort', 'chalcedonian-definition', 'confession-of-dositheus', 'council-of-trent', 'heidelberg-catechism', 'london-baptist-1689', 'nicene-creed', 'philaret-catechism', 'westminster-confession', 'westminster-larger-catechism', 'westminster-shorter-catechism',
  ].map(id => ({ id, editionReadiness: { editionIdentity: 'not_established' } }));
  const core = fixtureValue.probes.map(probe => ({ id: probe.workId,
    editionProvenance: { sourcePackId: fixtureValue.baseline.sourcePackId, editionId: probe.editionId },
    editionReadiness: {
      editionIdentity: 'established',
      ...(options.catalogProvenanceStatus === null ? {} : {
        provenance: options.catalogProvenanceStatus ?? fixtureValue.baseline.expectedCoreEditionProvenanceStatus,
      }),
      normalizedTextRights: 'no_known_conflict',
    },
  }));
  const transform11 = transform11WorkIds.map(id => ({
    id,
    editionReadiness: {
      editionIdentity: 'established',
      provenance: fixtureValue.baseline.expectedCoreEditionProvenanceStatus,
      normalizedTextRights: 'no_known_conflict',
    },
  }));
  return { schemaVersion: '2', kind: 'local_primary_source_catalog', workCount: 35, works: [...legacy, ...core, ...transform11],
    policies: { scope: 'hosted_collection_only', editionProvenance: 'mixed_legacy_and_reviewed_source_packs', rightsStatus: 'mixed_not_established_and_no_known_conflict' } };
}

function toolResponse(body: RecordValue, fixtureValue: Audit, options: FakeOptions, profile: AuditProfile): Response {
  const params = body.params as RecordValue;
  const name = params.name as string;
  const args = params.arguments as RecordValue;
  if (name === 'classic_text_lookup') return classicTool(body, args, fixtureValue, options);
  if (name === 'primary_source_search') return primaryTool(body, args, fixtureValue, options, profile);
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
  return toolResult(body, { structuredContent: landing(probe, options) });
}

function fakeClassicWorks(fixtureValue: Audit): RecordValue[] {
  const works = fakeCatalog(fixtureValue).works as RecordValue[];
  return works.map(work => ({
    id: work.id,
    deliveryMode: fixtureValue.probes.some(probe => probe.workId === work.id)
      || transform11WorkIds.includes(work.id as typeof transform11WorkIds[number])
      ? 'sectioned_only'
      : 'complete_document',
  }));
}

function landing(probe: Audit['probes'][number], options: FakeOptions): RecordValue {
  return { schemaVersion: '2', kind: 'classic_text_lookup', mode: 'landing',
    evidencePolicy: { providerScope: 'local_only', remoteDocumentBodies: 'disabled', selectedContentAccess: 'mcp_resource_read' },
    landing: { work: { id: probe.workId, deliveryMode: 'sectioned_only', resource: {
      kind: 'mcp_resource', uri: probe.landingResourceUri,
      ...(options.landingResourceSizeBytes === null ? {} : {
        resourceSizeBytes: options.landingResourceSizeBytes ?? new TextEncoder().encode(FAKE_LANDING_TEXT).byteLength,
      }),
    } }, sectionCount: probe.sectionCount, bodyDelivery: 'exact_section_resource_only', browse: { pageSize: 32 } } };
}

function directory(probe: Audit['probes'][number]): RecordValue {
  return { schemaVersion: '2', kind: 'classic_text_lookup', mode: 'browse_sections', directory: { work: { id: probe.workId }, coverage: 'bounded_section_directory', pagination: { pageSize: 32 }, sections: [{ sectionKey: probe.firstSection.sectionKey, sourceOrdinal: probe.firstSection.sourceOrdinal, resource: { kind: 'mcp_resource', uri: probe.firstSection.resourceUri } }] } };
}

function primaryTool(
  body: RecordValue,
  args: RecordValue,
  fixtureValue: Audit,
  options: FakeOptions,
  profile: AuditProfile,
): Response {
  const query = ((args.queries as RecordValue[])[0])!;
  if (profile.primarySource.contractVersion === '7' && query.searchDepth === 'expanded') {
    const local = {
      provider: 'local', status: 'no_results', searched: true, page: 1, hitCount: 0,
      resultWindow: { returnedHitCount: 0, additionalMatchStatus: 'no_additional_match_observed' }, hits: [], notices: [],
    };
    const external = {
      provider: 'ccel_live', status: 'disabled', searched: false, page: 1, hitCount: 0,
      resultWindow: { returnedHitCount: 0, additionalMatchStatus: 'not_evaluated' }, hits: [], notices: [],
    };
    return toolResult(body, {
      isError: options.ccelIsError ?? false,
      ...(options.ccelStructuredContent === false ? {} : { structuredContent: {
        schemaVersion: '7', kind: 'primary_source_search', planStatus: 'partial',
        queries: [{ id: query.id, normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [local, external] }],
        responseWindow: { unit: 'utf8_bytes', maximum: 32768, truncated: false },
        coverage: { localAttempted: true, localStatus: 'no_results', localHitCount: 0, ccelAttempted: false, ccelStatus: 'disabled', ccelHitCount: 0, notices: [], serverObserved: { searched: [{ queryId: query.id, provider: 'local', status: 'no_results', returnedHitCount: 0 }], notSearched: [{ queryId: query.id, provider: 'ccel_live', status: 'disabled' }] } },
        evidencePolicy: { snippetUse: 'discovery_only', localSectionAccess: 'mcp_resource_read', externalSectionAccess: 'direct_url_only', coverageScope: 'bounded_non_exhaustive', externalRightsStatus: 'not_determined', lookupAliasUse: 'exact_routing_only_not_metadata_evidence', coverageLedger: { searched: 'server_observed_provider_execution', read: 'host_observed_successful_exact_resource_or_page_read', deferred: 'host_recorded_intentional_deferral', notSearched: 'server_observed_provider_non_execution' } },
      } }),
    });
  }
  if ((query.providers as string[] | undefined)?.[0] === 'ccel') {
    if (profile.primarySource.externalDiscoveryBoundary === 'rejected_at_input_schema') {
      return toolResult(body, {
        isError: true,
        content: [{ type: 'text', text: 'Invalid arguments for primary_source_search: argument "queries.0.providers.0" must be equal to "local"' }],
      });
    }
    return toolResult(body, {
      isError: options.ccelIsError ?? true,
      ...(options.ccelStructuredContent === false ? {} : { structuredContent: {
        schemaVersion: '7', kind: 'primary_source_search', planStatus: 'unavailable',
        queries: [{ id: 'ccel-disabled', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [{
          provider: 'ccel_live', status: 'disabled', searched: false, page: 1, hitCount: 0,
          resultWindow: { returnedHitCount: 0, additionalMatchStatus: 'not_evaluated' }, hits: [], notices: [],
        }] }],
        responseWindow: { unit: 'utf8_bytes', maximum: 32768, truncated: false },
        coverage: { localAttempted: false, localHitCount: 0, ccelAttempted: false, ccelStatus: 'disabled', ccelHitCount: 0, notices: [], serverObserved: { searched: [], notSearched: [{ queryId: 'ccel-disabled', provider: 'ccel_live', status: 'disabled' }] } },
        evidencePolicy: { snippetUse: 'discovery_only', localSectionAccess: 'mcp_resource_read', externalSectionAccess: 'direct_url_only', coverageScope: 'bounded_non_exhaustive', externalRightsStatus: 'not_determined', lookupAliasUse: 'exact_routing_only_not_metadata_evidence', coverageLedger: { searched: 'server_observed_provider_execution', read: 'host_observed_successful_exact_resource_or_page_read', deferred: 'host_recorded_intentional_deferral', notSearched: 'server_observed_provider_non_execution' } },
      } }),
    });
  }
  const workId = query.work as string;
  const probe = fixtureValue.probes.find(item => item.workId === workId)!;
  const uri = options.primaryLocatorDrift
    ? `${probe.landingResourceUri}#section-noncanonical`
    : probe.primarySearch.resourceUri;
  const relevanceHit = { queryId: query.id, title: workId, snippet: 'discovery snippet', rankWithinProvider: 1, page: 1, snippetOnly: true, attribution: 'TheologAI local historical-document collection', provider: 'local', resourceSizeBytes: 42, locator: {
    kind: 'mcp_resource', uri, documentId: workId,
    sectionKey: probe.primarySearch.sectionKey, sourceOrdinal: probe.primarySearch.sourceOrdinal,
  }, editionReadiness: { foundation: 'edition-provenance-foundation.v1', editionIdentity: 'established', provenance: 'verified_with_uncertainty', exactArtifactRights: 'not_claimed_for_scan_artifacts', normalizedTextRights: 'no_known_conflict' } };
  // Real relevance results need not be the directory's first source section.
  // Keep a lower-ranked first section when different to prove this gate reads
  // the pinned relevance hit, not a directory-order surrogate.
  const lowerRankedDirectoryHit = probe.primarySearch.resourceUri === probe.firstSection.resourceUri ? [] : [{ queryId: query.id, title: workId, snippet: 'discovery snippet', rankWithinProvider: 2, page: 1, snippetOnly: true, attribution: 'TheologAI local historical-document collection', provider: 'local', resourceSizeBytes: 42, locator: {
    kind: 'mcp_resource', uri: probe.firstSection.resourceUri, documentId: workId,
    sectionKey: probe.firstSection.sectionKey, sourceOrdinal: probe.firstSection.sourceOrdinal,
  }, editionReadiness: { foundation: 'edition-provenance-foundation.v1', editionIdentity: 'established', provenance: 'verified_with_uncertainty', exactArtifactRights: 'not_claimed_for_scan_artifacts', normalizedTextRights: 'no_known_conflict' } }];
  const laterExternalHit = options.laterExternalPrimaryHit ? [{
    queryId: query.id, title: 'Unreviewed external result', snippet: 'discovery snippet', rankWithinProvider: 3, page: 1,
    snippetOnly: true, attribution: 'Unreviewed provider', provider: 'ccel_live',
    locator: { kind: 'external_url', url: 'https://ccel.org/ccel/example/work.html' },
    editionReadiness: { editionIdentity: 'provider_unreviewed', provenance: 'provider_unreviewed', exactArtifactRights: 'not_determined' },
  }] : [];
  const laterNoncanonicalLocalHit = options.laterNoncanonicalPrimaryHit ? [{
    queryId: query.id, title: workId, snippet: 'discovery snippet', rankWithinProvider: 4, page: 1,
    snippetOnly: true, attribution: 'TheologAI local historical-document collection', provider: 'local', resourceSizeBytes: 42,
    locator: {
      kind: 'mcp_resource', uri: `${probe.landingResourceUri}#section-not-the-returned-section`, documentId: workId,
      sectionKey: probe.primarySearch.sectionKey, sourceOrdinal: probe.primarySearch.sourceOrdinal,
    },
    editionReadiness: { foundation: 'edition-provenance-foundation.v1', editionIdentity: 'established', provenance: 'verified_with_uncertainty', exactArtifactRights: 'not_claimed_for_scan_artifacts', normalizedTextRights: 'no_known_conflict' },
  }] : [];
  const hits = [relevanceHit, ...lowerRankedDirectoryHit, ...laterExternalHit, ...laterNoncanonicalLocalHit];
  const provider = {
    provider: 'local', status: 'ok', searched: true, page: 1, hitCount: hits.length,
    resultWindow: { returnedHitCount: hits.length, additionalMatchStatus: 'no_additional_match_observed' }, hits, notices: [],
    scope: { status: 'matched', requested: { work: workId }, eligibleDocumentCount: 1, eligibleDocuments: [], eligibleDocumentsTruncated: false },
  };
  const output = profile.primarySource.contractVersion === '7'
    ? {
      schemaVersion: '7', kind: 'primary_source_search', planStatus: 'complete',
      responseWindow: { unit: 'utf8_bytes', maximum: 32768, truncated: false },
      queries: [{ id: query.id, normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [provider] }],
      coverage: { localAttempted: true, localStatus: 'ok', localHitCount: hits.length, ccelAttempted: false, ccelHitCount: 0, notices: [], serverObserved: { searched: [{ queryId: query.id, provider: 'local', status: 'ok', returnedHitCount: hits.length }], notSearched: [] } },
      evidencePolicy: { snippetUse: 'discovery_only', localSectionAccess: 'mcp_resource_read', externalSectionAccess: 'direct_url_only', coverageScope: 'bounded_non_exhaustive', externalRightsStatus: 'not_determined', lookupAliasUse: 'exact_routing_only_not_metadata_evidence', coverageLedger: { searched: 'server_observed_provider_execution', read: 'host_observed_successful_exact_resource_or_page_read', deferred: 'host_recorded_intentional_deferral', notSearched: 'server_observed_provider_non_execution' } },
    }
    : {
      schemaVersion: '6', kind: 'primary_source_search', planStatus: 'complete',
      responseWindow: { unit: 'utf8_bytes', maximum: 32768, truncated: false },
      queries: [{ id: query.id, normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [provider] }],
      coverage: { localAttempted: true, localStatus: 'ok', localHitCount: hits.length, notices: [], serverObserved: { searched: [{ queryId: query.id, provider: 'local', status: 'ok', returnedHitCount: hits.length }], notSearched: [] } },
      evidencePolicy: { snippetUse: 'discovery_only', localSectionAccess: 'mcp_resource_read', coverageScope: 'bounded_non_exhaustive', lookupAliasUse: 'exact_routing_only_not_metadata_evidence', coverageLedger: { searched: 'server_observed_provider_execution', read: 'host_observed_successful_exact_resource_or_page_read', deferred: 'host_recorded_intentional_deferral', notSearched: 'server_observed_provider_non_execution' } },
    };
  return toolResult(body, { structuredContent: output });
}

function toolResult(body: RecordValue, result: RecordValue): Response { return jsonResponse({ jsonrpc: '2.0', id: body.id, result }); }
function jsonResponse(value: unknown): Response {
  const body = JSON.stringify(value);
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': String(new TextEncoder().encode(body).byteLength) } });
}
