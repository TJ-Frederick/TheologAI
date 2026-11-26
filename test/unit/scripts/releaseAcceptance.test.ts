import { releaseReadFetch } from '../../../scripts/audit-corpus-release.js';
import { describe, expect, it, vi } from 'vitest';
import { runReleaseAcceptance, type AcceptanceOptions } from '../../../scripts/release-acceptance.js';

const immediately: NonNullable<AcceptanceOptions['pace']> = (signal, guard, dispatch) => {
  guard();
  signal.throwIfAborted();
  return dispatch();
};

const options = {
  mode: 'application', role: 'preview', serverVersion: 'test',
  endpoint: 'https://worker.test/mcp', pace: immediately,
} satisfies AcceptanceOptions;

const knownTools = ['bible_lookup', 'bible_verse_morphology', 'primary_source_search']
  .map(name => ({ name, inputSchema: { type: 'object' } }));
const depths = ['beginner', 'intermediate', 'technical'];
const languageStudy = (version: string) => ({
  name: 'original_language_study',
  inputSchema: { type: 'object', properties: { depth: { enum: depths } } },
  outputSchema: { type: 'object', oneOf: depths.map(depth => ({
    properties: { schemaVersion: { const: version }, depth: { const: depth } },
  })) },
});
const kempisUri = 'theologai://documents/kempis-imitation-of-christ#section-001';
const discovery = {
  protocolVersion: '2026-07-28',
  supportedVersions: ['2026-07-28'],

  capabilities: { tools: {}, resources: {} },
  _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'theologai-bible-server', version: 'test' } },
};

function endpoint(fault?: 'discover' | 'wrong-passage' | 'wrong-citation' | 'large-response' | 'stale-language-study') {
  const calls: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    const { method, params } = request;
    calls.push(method);
    if (method === 'server/discover' && fault === 'discover') {
      return new Response('uncaptured provider diagnostics', { status: 503 });
    }
    if (method === 'notifications/initialized') return new Response(null, { status: 202 });
    const results = {
      initialize: { ...discovery, protocolVersion: '2025-11-25', serverInfo: discovery._meta['io.modelcontextprotocol/serverInfo'] },
      'server/discover': discovery,
      'tools/list': { tools: [...knownTools, languageStudy(fault === 'stale-language-study' ? '2' : '3')] },
      'tools/call': {
        content: [],
        structuredContent: params?.name === 'primary_source_search'
          ? { kind: 'primary_source_search', planStatus: 'complete', queries: [{ id: 'scope', providers: [{
            provider: 'local', status: 'ok', searched: true, hits: [{ locator: { uri: kempisUri } }],
          }] }] }
          : { kind: 'bible_verse_morphology', language: 'Greek', book: 'John', chapter: 3,
            verse: fault === 'wrong-passage' ? 17 : 16, words: [{ strongsNumber: 'G0025' }] },
      },
      'resources/read': { contents: [{ uri: fault === 'wrong-citation' ? kempisUri + '-other' : kempisUri, text: 'body '.repeat(100) }] },
    };
    if (method === 'tools/list' && fault === 'large-response') return new Response('discard '.repeat(40_000));
    const result = results[method as keyof typeof results];
    const modern = new Headers(init?.headers).get('mcp-protocol-version') === '2026-07-28';
    return Response.json({ jsonrpc: '2.0', id: request.id,
      result: modern && method !== 'server/discover' ? { ...result, resultType: 'complete', ttlMs: 0, cacheScope: 'private' } : result });
  });
  return { fetchImpl, calls };
}

describe('shared release acceptance', () => {
  it('runs the short application MCP smoke in both protocol versions and verifies the selected exact citation', async () => {
    const { fetchImpl, calls } = endpoint();
    const receipt = await runReleaseAcceptance({ ...options, fetch: fetchImpl, search: true });
    expect(receipt).toMatchObject({ passed: true, mode: 'application' });
    expect(receipt.checks).toHaveLength(8);
    expect(receipt.checks.every(check => check.passed)).toBe(true);
    expect(calls).toEqual([
      'initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'tools/call', 'resources/read',
      'server/discover', 'tools/list', 'tools/call', 'tools/call', 'resources/read',
    ]);
  });

  it('stops on modern discovery failure and keeps the finished legacy checks', async () => {
    const { fetchImpl, calls } = endpoint('discover');
    const receipt = await runReleaseAcceptance({ ...options, fetch: fetchImpl });
    expect(receipt).toMatchObject({ passed: false, failure: {
      era: '2026-07-28', probeId: 'server/discover', category: 'http_status', status: 503,
    } });
    expect(receipt.checks).toHaveLength(3);
    expect(calls.at(-1)).toBe('server/discover');
    expect(calls.filter(method => method === 'server/discover')).toHaveLength(1);
    expect(JSON.stringify(receipt)).not.toContain('uncaptured provider diagnostics');
  });

  it.each([
    ['wrong-passage', 'local-passage', 'passage_mismatch'],
    ['wrong-citation', 'search:kempis-imitation-of-christ', 'search_citation_mismatch'],
    ['large-response', 'tools-list', 'response_size'],
    ['stale-language-study', 'tools-list', 'language_study_contract'],
  ] as const)('refuses %s without entering the second protocol era', async (fault, probeId, category) => {
    const { fetchImpl, calls } = endpoint(fault);
    const receipt = await runReleaseAcceptance({ ...options, fetch: fetchImpl, search: true });
    expect(receipt).toMatchObject({ passed: false, failure: { era: '2025-11-25', probeId, category } });
    expect(calls).not.toContain('server/discover');
  });

  it('checks revocation at dispatch and does no guarded network work', async () => {
    const { fetchImpl } = endpoint();
    const receipt = await runReleaseAcceptance({ ...options, fetch: fetchImpl, guard: () => { throw Error('revoked'); } });
    expect(receipt).toMatchObject({ passed: false, failure: { category: 'guard' } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requires the protected corpus guard before any dispatch', async () => {
    const { fetchImpl } = endpoint();
    await expect(runReleaseAcceptance({ ...options, mode: 'corpus', databasePath: 'unused', fetch: fetchImpl }))
      .rejects.toThrow('requires a database and a live dispatch guard');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

it('permits discovery and refuses forbidden MCP requests before the transport sees them', async () => {
  const send = vi.fn(async () => new Response('{}'));
  const url = 'https://worker.test/mcp';
  const request = releaseReadFetch(url, 'corpus', send);
  const rpc = (method: string, name?: string) => ({
    method: 'POST', body: JSON.stringify({jsonrpc:'2.0', method, params:{name}, id:1}),
  });
  await request(url, rpc('server/discover'));
  expect(send).toHaveBeenCalledTimes(1);
  for (const [target, init] of [
    [url, rpc('unknown/action')], [url, rpc('tools/call','verify_donation')],
    [url, {...rpc('initialize'), headers:{authorization:'Bearer fixture'}}],
    ['https://example.invalid/mcp', rpc('tools/list')],
    [url,{method:'DELETE'}], [url,{method:'POST',body:'[]'}],
  ] as const) {
    await expect(request(target,init)).rejects.toThrow();
  }
  expect(send).toHaveBeenCalledTimes(1);
});
