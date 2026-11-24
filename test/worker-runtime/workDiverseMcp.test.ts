import { env, SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { composeLocalPrimarySourceFtsQuery, localPrimarySourceSearchSql } from '../../src/adapters/shared/primarySourceSearchSql.js';
import { createWorkerCompositionRoot } from '../../src/tools/worker/index.js';
import type { Env } from '../../src/worker-env.js';
import { baselineWorkDiverseSql, workDiverseCases, workDiverseFixtureSql } from './workDiverseFixture.js';

async function rpc(
  version: '2025-11-25' | '2026-07-28',
  method: string,
  params: Record<string, unknown>,
  name?: string,
): Promise<{ error?: unknown; result?: { structuredContent?: unknown; contents?: Array<{ text: string }> } }> {
  const headers = new Headers({
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'Mcp-Protocol-Version': version,
  });
  if (version === '2026-07-28') {
    headers.set('Mcp-Method', method);
    if (name) headers.set('Mcp-Name', name);
    params = { ...params, _meta: {
      'io.modelcontextprotocol/protocolVersion': version,
      'io.modelcontextprotocol/clientInfo': { name: 'work-diversity-fixture', version: '1.0.0' },
      'io.modelcontextprotocol/clientCapabilities': {},
    } };
  }
  const response = await SELF.fetch('https://worker.test/mcp', {
    method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  expect(response.status).toBe(200);
  const body = await response.text();
  return JSON.parse(response.headers.get('Content-Type')?.includes('text/event-stream')
    ? body.split('\n').find(line => line.startsWith('data:'))!.slice(5)
    : body);
}

// This test file owns its local D1 fixture. Corpus identity rows are immutable
// under the real migrations, so fixture lifetime is the Workerd test file.
it('keeps work-diversity ranking, lookahead and exact resource evidence on local D1 in both MCP eras', async () => {
  const db = env.THEOLOGAI_DB;
  await db.batch(workDiverseFixtureSql.map(sql => db.prepare(sql)));
  for (const { text, match, ids, expected } of workDiverseCases) {
    const old = db.prepare(baselineWorkDiverseSql(ids !== undefined));
    const candidate = db.prepare(localPrimarySourceSearchSql('work_diversity', ids?.length));
    const parameters = [composeLocalPrimarySourceFtsQuery(text, match), ...(ids ? [JSON.stringify(ids)] : [])];
    for (const limit of [1, 2, Math.max(expected.length - 1, 1), Math.max(expected.length, 1), expected.length + 1]) {
      const { results: rows } = await candidate.bind(...parameters, limit).all<{ id: number }>();
      const { results: baseline } = await old.bind(...parameters, limit).all();
      expect(rows).toEqual(baseline);
      expect(rows.map(row => row.id)).toEqual(expected.slice(0, limit));
    }
  }

  const searchStatements: string[] = [];
  function searchTool(useBaseline: boolean) {
    const measured = {
      prepare(sql: string) {
        if (sql.startsWith('WITH matching_sections AS (')) {
          searchStatements.push(sql);
          if (useBaseline) return db.prepare(baselineWorkDiverseSql(sql.includes('json_each(?)')));
        }
        return db.prepare(sql);
      },
    } as D1Database;
    return createWorkerCompositionRoot({ ...(env as unknown as Env), THEOLOGAI_DB: measured })
      .tools.find(tool => tool.name === 'primary_source_search')!;
  }
  const args = { queries: [{ id: 'diverse', text: 'café grâce', match: 'phrase', selection: 'work_diversity', limit: 2 }] };
  const baseline = await searchTool(true).handler(args);
  expect(searchStatements).toHaveLength(1);
  searchStatements.length = 0;
  expect(await searchTool(false).handler(args)).toEqual(baseline);
  expect(searchStatements).toHaveLength(1);
  const request = { name: 'primary_source_search', arguments: args };
  const legacy = await rpc('2025-11-25', 'tools/call', request);
  const modern = await rpc('2026-07-28', 'tools/call', request, request.name);
  for (const message of [legacy, modern]) {
    expect(message.error).toBeUndefined();
    expect(message.result).toMatchObject({ content: baseline.content, structuredContent: baseline.structuredContent });
    expect(message.result?.structuredContent).toMatchObject({
      queries: [{
        normalizedSelection: 'work_diversity',
        providers: [{
          hits: [
            { locator: { documentId: 'diverse-many', sectionKey: 'first', sourceOrdinal: 1 }, snippet: 'café grâce' },
            { locator: { documentId: 'diverse-one', sectionKey: 'first', sourceOrdinal: 1 }, snippet: 'café grâce' },
          ],
          resultWindow: { returnedHitCount: 2, additionalMatchStatus: 'additional_match_observed' },
        }],
      }],
    });
  }

  const uri = 'theologai://documents/diverse-many#section-first';
  const read = await rpc('2025-11-25', 'resources/read', { uri });
  expect(read.error).toBeUndefined();
  const contents = read.result?.contents as Array<{ text: string }>;
  const link = baseline.content.find(block => block.type === 'resource_link' && block.uri === uri);
  expect(link).toMatchObject({ size: new TextEncoder().encode(contents[0].text).byteLength });
  expect(contents[0].text).toContain('café grâce');
});
