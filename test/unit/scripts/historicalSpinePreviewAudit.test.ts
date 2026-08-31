import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildLocalDocumentResourceUri } from '../../../src/kernel/documentResource.js';
import {
  runHistoricalSpinePreviewAudit,
  runHistoricalSpineProductionAudit,
  SPINE_PREVIEW_PROFILE,
  SPINE_PRODUCTION_PROFILE,
  validateHistoricalSpineFixture,
  type HistoricalSpineAuditFixture,
} from '../../../scripts/audit-historical-spine-preview.js';
import { HISTORICAL_CORE_EXPECTED_RESOURCE_URIS } from '../../../scripts/audit-historical-core-preview.js';

const root = new URL('../../..', import.meta.url);
const fixtureUrl = new URL('test/fixtures/historical-spine-preview-audit.json', root);
type RecordValue = Record<string, unknown>;

async function fixture(): Promise<HistoricalSpineAuditFixture> {
  return validateHistoricalSpineFixture(JSON.parse(await readFile(fixtureUrl, 'utf8')));
}
type FakeOptions = Readonly<{ production?: boolean; catalogEditionDrift?: boolean; paginationOrdinalDrift?: boolean; paginationCursorDrift?: boolean; globalLocatorDrift?: boolean; globalOrigenTargetOmitted?: boolean }>;
function response(body: RecordValue, fixtureValue: HistoricalSpineAuditFixture, options: FakeOptions = {}): Response {
  const production = options.production === true;
  const id = body.id;
  if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
  const rpc = (result: RecordValue) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: { 'content-type': 'application/json' } });
  const error = (errorValue: RecordValue) => new Response(JSON.stringify({ jsonrpc: '2.0', id, error: errorValue }), { headers: { 'content-type': 'application/json' } });
  if (body.method === 'initialize') return rpc({
    protocolVersion: '2025-11-25', serverInfo: { name: 'theologai-bible-server', version: production ? '3.6.0' : '3.6.0-preview' },
    capabilities: { tools: {}, resources: {}, prompts: {} },
  });
  if (body.method === 'tools/list') return rpc({ tools: [
    'bible_lookup', 'bible_cross_references', 'parallel_passages', 'commentary_lookup', 'classic_text_lookup', 'primary_source_search',
    'original_language_lookup', 'bible_verse_morphology', 'original_language_study', 'donation_config', 'verify_donation',
  ].map(name => ({ name, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } })) });
  if (body.method === 'resources/list') return rpc({ resources: HISTORICAL_CORE_EXPECTED_RESOURCE_URIS.map(uri => ({ uri })) });
  if (body.method === 'resources/read') {
    const uri = (body.params as RecordValue).uri as string;
    if (uri === 'theologai://documents/does-not-exist#section-not-real') return error({ code: -32602, message: 'Resource not found', data: { uri } });
    if (uri === 'theologai://primary-sources/catalog') {
      const works = [...fixtureValue.probes.map((probe, index) => ({
        id: probe.workId,
        editionProvenance: {
          editionId: options.catalogEditionDrift && index === 0 ? 'drifted-edition' : probe.editionId,
          sourcePackId: probe.sourcePackId,
          provenance: { status: 'verified_with_uncertainty' },
          normalizedTextRights: { status: 'no_known_conflict' },
        },
        editionReadiness: { editionIdentity: 'established', provenance: 'verified_with_uncertainty', normalizedTextRights: 'no_known_conflict' },
      })), ...Array.from({ length: 25 }, (_, index) => ({ id: `legacy-${index}` }))];
      return rpc({ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ schemaVersion: '2', kind: 'local_primary_source_catalog', workCount: 35, works }) }] });
    }
    return rpc({ contents: [{ uri, mimeType: 'text/markdown', text: uri.includes('#section-') ? 'PRIVATE HISTORICAL BODY' : 'Bounded local metadata.' }] });
  }
  if (body.method === 'tools/call') {
    const params = body.params as RecordValue; const args = params.arguments as RecordValue; const name = params.name;
    const tool = (structuredContent: RecordValue, isError = false) => rpc({ isError, structuredContent, content: [] });
    if (name === 'classic_text_lookup' && args.listWorks === true) {
      const works = [...fixtureValue.probes.map(probe => ({ id: probe.workId, deliveryMode: 'sectioned_only', resource: { kind: 'mcp_resource', uri: `theologai://documents/${probe.workId}` } })),
        ...Array.from({ length: 25 }, (_, index) => ({ id: `legacy-${index}`, deliveryMode: 'complete_document', resource: { kind: 'mcp_resource', uri: `theologai://documents/legacy-${index}` } }))];
      return tool({ schemaVersion: '2', kind: 'classic_text_lookup', mode: 'list_works', catalog: { coverage: 'complete_local_work_inventory', works } });
    }
    const workId = args.work as string | undefined; const probe = fixtureValue.probes.find(value => value.workId === workId);
    if (name === 'classic_text_lookup' && args.cursor === 'not-a-valid-cursor') {
      return rpc({ isError: true, content: [{ type: 'text', text: 'Invalid arguments for classic_text_lookup.' }] });
    }
    if (name === 'classic_text_lookup' && typeof args.query === 'string') {
      const matching = fixtureValue.probes.find(value => value.query === args.query)!;
      const returned = options.globalOrigenTargetOmitted === true && matching.workId === 'origen-de-principiis'
        ? fixtureValue.probes[0]!
        : matching;
      const sectionKey = returned.firstSection.sectionKey;
      return tool({ schemaVersion: '2', kind: 'classic_text_lookup', mode: 'search', search: { status: 'ok', hits: [{
        work: { id: returned.workId, deliveryMode: 'sectioned_only' },
        section: { sectionKey, sourceOrdinal: 1, resource: { kind: 'mcp_resource', uri: options.globalLocatorDrift ? 'theologai://documents/wrong#section-001' : buildLocalDocumentResourceUri(returned.workId, sectionKey) } },
        snippetOnly: true,
      }] } });
    }
    if (name === 'classic_text_lookup' && probe && args.browseSections === true) {
      const continuation = typeof args.cursor === 'string';
      const start = continuation ? 33 : 1; const count = continuation ? Math.min(32, probe.sectionCount - 32) : Math.min(32, probe.sectionCount);
      const sections = Array.from({ length: count }, (_, index) => {
        const canonicalOrdinal = start + index; const sourceOrdinal = options.paginationOrdinalDrift && continuation && index === 0 ? 34 : canonicalOrdinal; const sectionKey = canonicalOrdinal === 1 ? probe.firstSection.sectionKey : `section-${String(canonicalOrdinal).padStart(3, '0')}`;
        return { sectionKey, sourceOrdinal, resource: { kind: 'mcp_resource', uri: buildLocalDocumentResourceUri(probe.workId, sectionKey) } };
      });
      return tool({ schemaVersion: '2', kind: 'classic_text_lookup', mode: 'browse_sections', directory: {
        coverage: 'bounded_section_directory', work: { id: probe.workId }, sections,
        pagination: { pageSize: 32, ...(!continuation && probe.requiresPagination ? { nextCursor: `cursor-${probe.workId}` } : {}), ...(continuation && (probe.sectionCount > 64) !== (options.paginationCursorDrift === true) ? { nextCursor: `later-${probe.workId}` } : {}) },
      } });
    }
    if (name === 'classic_text_lookup' && probe) return tool({ schemaVersion: '2', kind: 'classic_text_lookup', mode: 'landing', landing: {
      work: { id: probe.workId, deliveryMode: 'sectioned_only', resource: { kind: 'mcp_resource', uri: `theologai://documents/${probe.workId}`, resourceSizeBytes: 23 } },
      bodyDelivery: 'exact_section_resource_only', sectionCount: probe.sectionCount, browse: { pageSize: 32 },
    } });
    if (name === 'primary_source_search') {
      const query = ((args.queries as RecordValue[])[0])!; const primaryProbe = fixtureValue.probes.find(value => value.workId === query.work)!;
      const uri = buildLocalDocumentResourceUri(primaryProbe.workId, primaryProbe.firstSection.sectionKey);
      return tool({ schemaVersion: production ? '6' : '7', kind: 'primary_source_search', planStatus: 'complete', queries: [{ providers: [{ provider: 'local', searched: true, status: 'ok', hits: [{ locator: { kind: 'mcp_resource', documentId: primaryProbe.workId, sectionKey: primaryProbe.firstSection.sectionKey, uri }, editionReadiness: { editionIdentity: 'established', provenance: 'verified_with_uncertainty', normalizedTextRights: 'no_known_conflict' } }] }] }],
        coverage: production ? {} : { ccelAttempted: false, ccelHitCount: 0 } });
    }
  }
  throw new Error(`unhandled fake request ${String(body.method)}`);
}

describe('Transform-11 historical-spine fixed audit', () => {
  it('uses one bounded zero-retry preview inventory for exactly the ten activated works without retaining bodies or locators', async () => {
    const value = await fixture(); const calls: Array<{ url: string; body: RecordValue; userAgent: string | null }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body)) as RecordValue; calls.push({ url: String(input), body, userAgent: new Headers(init?.headers).get('user-agent') }); return response(body, value);
    };
    const evidence = await runHistoricalSpinePreviewAudit(value, fakeFetch);
    expect(calls).toHaveLength(83);
    expect(calls.every(call => call.url === SPINE_PREVIEW_PROFILE.endpoint)).toBe(true);
    expect(evidence.budgets).toMatchObject({ logicalOperations: 82, maximumLogicalOperations: 82, httpExchanges: 83, maximumHttpExchanges: 83, retryCount: 0 });
    expect(new Set(calls.map(call => call.userAgent))).toEqual(new Set(['TheologAI-HistoricalSpine-preview-Audit/1.0']));
    expect((evidence.records as unknown[])).toHaveLength(10);
    const serialized = JSON.stringify(evidence);
    for (const forbidden of ['PRIVATE HISTORICAL BODY', 'theologai://', 'cursor-', 'not-a-valid-cursor']) expect(serialized).not.toContain(forbidden);
    const primaryCalls = calls.filter(call => call.body.method === 'tools/call' && ((call.body.params as RecordValue).name === 'primary_source_search'));
    expect(primaryCalls.map(call => {
      const query = (((call.body.params as RecordValue).arguments as RecordValue).queries as RecordValue[])[0]!;
      return query.id;
    })).toEqual(['spine-01', 'spine-02', 'spine-03', 'spine-04', 'spine-05', 'spine-06', 'spine-07', 'spine-08', 'spine-09', 'spine-10']);
    expect(primaryCalls.every(call => {
      const query = (((call.body.params as RecordValue).arguments as RecordValue).queries as RecordValue[])[0]!;
      return typeof query.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/u.test(query.id)
        && query.searchDepth === 'standard' && !Object.hasOwn(query, 'providers');
    })).toBe(true);
    const resourceReads = calls.filter(call => call.body.method === 'resources/read');
    expect(resourceReads).toHaveLength(32); // catalog + 10 landings + 10 global-search locators + 10 primary locators + invalid regression
    expect(resourceReads.filter(call => {
      const uri = String((call.body.params as RecordValue).uri);
      return uri.includes('#section-') && !uri.includes('does-not-exist');
    })).toHaveLength(20);
  });

  it('uses the production endpoint and production local-only primary contract', async () => {
    const value = await fixture(); const calls: Array<{ url: string; body: RecordValue; userAgent: string | null }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body)) as RecordValue; calls.push({ url: String(input), body, userAgent: new Headers(init?.headers).get('user-agent') }); return response(body, value, { production: true });
    };
    const evidence = await runHistoricalSpineProductionAudit(value, fakeFetch);
    expect(calls).toHaveLength(83);
    expect(calls.every(call => call.url === SPINE_PRODUCTION_PROFILE.endpoint)).toBe(true);
    expect(evidence.audit).toBe('historical-spine-production');
    expect(new Set(calls.map(call => call.userAgent))).toEqual(new Set(['TheologAI-HistoricalSpine-production-Audit/1.0']));
    expect(calls.filter(call => call.body.method === 'tools/call' && ((call.body.params as RecordValue).name === 'primary_source_search')).every(call => {
      const query = (((call.body.params as RecordValue).arguments as RecordValue).queries as RecordValue[])[0]!;
      return JSON.stringify(query.providers) === JSON.stringify(['local']) && !Object.hasOwn(query, 'searchDepth');
    })).toBe(true);
  });

  it('rejects fixture drift, including adding an unreviewed work or changing a natural query', async () => {
    const value = await fixture();
    await expect(runHistoricalSpinePreviewAudit({ ...value, probes: [...value.probes, value.probes[0]!] } as never, fetch)).rejects.toThrow('fixture identity or probe inventory drifted');
    const changed = { ...structuredClone(value), probes: value.probes.map(probe => ({ ...probe, query: String(probe.query) })) };
    changed.probes[0]!.query = 'changed';
    expect(() => validateHistoricalSpineFixture(changed)).toThrow('fixture identity or probe inventory drifted');
  });

  it('pins the Origen global-discovery probe to its distinctive source-attested phrase', async () => {
    const value = await fixture();
    const origen = value.probes.find(probe => probe.workId === 'origen-de-principiis');
    expect(origen?.query).toBe('uncompounded intellectual nature');
    const edition = JSON.parse(await readFile(new URL(
      'data/historical-source-packs/historical-spine-early/editions/origen-de-principiis-crombie-anf4-1885.json', root), 'utf8')) as {
        sections: Array<{ sectionKey: string; content: string }>;
      };
    const canonicalSection = edition.sections.find(section => section.sectionKey === 'section-on-god-001');
    expect(canonicalSection).toBeDefined();
    const source = canonicalSection!.content
      .normalize('NFC').replace(/\s+/gu, ' ');
    expect(source).toContain(origen!.query);
  });

  it('fails closed on authoritative edition drift, continuation ordinal drift, and a global-search locator drift', async () => {
    const value = await fixture();
    for (const [options, message] of [
      [{ catalogEditionDrift: true }, 'authoritative edition/provenance/readiness drifted'],
      [{ paginationOrdinalDrift: true }, 'continuation locator drifted'],
      [{ paginationCursorDrift: true }, 'continuation page count/cursor contract drifted'],
      [{ globalLocatorDrift: true }, 'global classic search locator/readiness coherence drifted'],
      [{ globalOrigenTargetOmitted: true }, 'natural global classic search omitted the work'],
    ] as const) {
      const fakeFetch: typeof fetch = async (_input, init) => response(JSON.parse(String(init?.body)) as RecordValue, value, options);
      await expect(runHistoricalSpinePreviewAudit(value, fakeFetch)).rejects.toThrow(message);
    }
  });

  it('places both fixed audits after registration stabilization and before identity reconciliation, retaining their hash and evidence', async () => {
    const [preview, production] = await Promise.all([
      readFile(new URL('.github/workflows/pr.yml', root), 'utf8'),
      readFile(new URL('.github/workflows/deploy.yml', root), 'utf8'),
    ]);
    const previewAudit = preview.indexOf('Audit Transform-11 historical spine contract on preview');
    expect(previewAudit).toBeGreaterThan(preview.indexOf('Stabilize preview release registrations at edge (read-only)'));
    expect(previewAudit).toBeLessThan(preview.indexOf('Verify preview Worker remained active through audit (read-only)'));
    expect(preview).toContain('historical-spine-preview-audit.json');
    expect(preview).toContain('historical_spine_audit_sha256');
    expect(preview).toContain('Transform-11 historical-spine audit SHA-256');
    const productionAudit = production.indexOf('Audit Transform-11 historical spine contract on production');
    expect(productionAudit).toBeGreaterThan(production.indexOf('Stabilize production release registrations at edge (read-only)'));
    expect(productionAudit).toBeLessThan(production.indexOf('Verify production Worker remained active through audit (read-only)'));
    expect(production).toContain('historical-spine-production-audit.json');
    expect(production).toContain('historical_spine_audit_sha256');
    expect(production).toContain('Transform-11 historical-spine audit SHA-256');
  });
});
