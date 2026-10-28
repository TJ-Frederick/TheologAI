/** Fixed corpus-only live profile. Both protocol eras; frozen core/spine/language fixtures. */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { versionNegotiationFor } from './audit-dual-era-mcp-preview.js';
import { assertSuccess, assertSafeError, assertInputError, corruptCursor } from './audit-original-language-v2-preview.js';
import { captureMcpTransportSnapshot, assertMcpTransportContract, fingerprintMcpTransportSnapshot } from '../test/helpers/mcpTransportContract.js';
import { escapeFrozenEditionSectionContentForMarkdown } from '../src/kernel/editionText.js';
import { check, sha, hash } from './corpus-release.js';
export async function auditCorpusRelease(options: {
    role: 'preview' | 'production';
    endpoint: string;
    serverVersion: string;
    databasePath: string;
    root: string;
    fetch: typeof fetch;
}) {
    const root = options.root;
    const parsed = new URL(options.endpoint);
    check(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash, 'unsafe audit endpoint');
    const started = Date.now();
    let nextNetworkStart=0;
    let aggregateBytes = 0;
    const checks: {
        role: string;
        era: string;
        id: string;
        passed: boolean;
        responseSha256: string;
    }[] = [], summaries: unknown[] = [], fingerprints: unknown[] = [];
    let current = '', role = '', era = '';
    const core = JSON.parse(readFileSync(join(root, 'test/fixtures/historical-core-preview-audit.json'), 'utf8'));
    const spine = JSON.parse(readFileSync(join(root, 'test/fixtures/historical-spine-preview-audit.json'), 'utf8'));
    const language = JSON.parse(readFileSync(join(root, 'test/fixtures/original-language-v2-preview-audit.json'), 'utf8'));
    const db = new Database(options.databasePath, { readonly: true, fileMustExist: true });
    const norton = (db.prepare("SELECT d.document_id,d.section_key FROM historical_section_identities d WHERE d.document_id LIKE '%norton%' OR d.document_id='calvin-institutes-of-the-christian-religion' ORDER BY source_ordinal LIMIT 1").get() as any);
    const aquinas = (db.prepare('SELECT public_slug,hierarchy_id FROM historical_hierarchy_publications').get() as any);
    const nodes = db.prepare("SELECT node_key FROM historical_edition_hierarchy_nodes WHERE node_kind='article' AND node_key LIKE ? ORDER BY flat_ordinal LIMIT 1");
    const directNodes = ['prima.', 'prima-secundae.', 'secunda-secundae.', 'tertia.'].map(p => (nodes.get('article:' + p + '%') as any)?.node_key);
    if (!norton || directNodes.some(n => !n))
        throw Error('Corpus probe identity unavailable ' + JSON.stringify({ norton, directNodes }));
    function validateResource(value: any) {
        if (!value?.contents)
            return;
        for (const item of value.contents) {
            if (typeof item.uri !== 'string' || typeof item.text !== 'string')
                throw Error('Resource shape drift');
            const section = /^theologai:\/\/documents\/([^#]+)#section-(.+)$/.exec(item.uri);
            if (section) {
                const row = db.prepare('SELECT s.content FROM historical_section_identities i JOIN document_sections s ON s.id=i.document_section_id WHERE i.document_id=? AND i.section_key=?').get(section[1], section[2]) as {
                    content: string;
                } | undefined;
                check(row, 'unexpected resource section');
                check(item.text.includes(escapeFrozenEditionSectionContentForMarkdown(row.content)) || item.text.includes(row.content), 'resource differs from exact source body');
            }
            const node = /^theologai:\/\/documents\/([^#]+)#node-(.+)$/.exec(item.uri);
            if (node) {
                const row = db.prepare('SELECT b.content FROM historical_hierarchy_publications p JOIN historical_edition_hierarchy_nodes n ON n.hierarchy_id=p.hierarchy_id JOIN historical_edition_hierarchy_bodies b ON b.hierarchy_id=n.hierarchy_id AND b.body_key=n.body_key WHERE p.public_slug=? AND n.node_key=?').get(node[1], node[2]) as {
                    content: string;
                } | undefined;
                check(row && item.text.includes(row.content), 'hierarchy body differs from exact source');
            }
        }
    }
    try {
        for (const preview of [options.role === 'preview']) {
            role = preview ? 'preview' : 'production';
            const fetchImpl = options.fetch;
            for (const protocol of ['2025-11-25', '2026-07-28'] as const) {
                era = protocol;
                let exchanges = 0;
                const localFetch = async (input: any, init?: any) => {
                    check(++exchanges <= 200 && Date.now() - started <= 600000, 'live HTTP/time budget exceeded');
                    const url = String(input instanceof Request ? input.url : input);
                    check(url === options.endpoint, 'unexpected audit URL');
                    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
                    try {
                        if(options.fetch===fetch){const delay=Math.max(0,nextNetworkStart-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));nextNetworkStart=Date.now()+650;}
                        const response = await fetchImpl(input, { ...init, headers:{...Object.fromEntries(new Headers(init?.headers)),'user-agent':`TheologAI-Corpus-${role}-Audit/1.0`}, redirect: 'error', signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal });
                        check(!response.redirected && response.status < 500, 'live transport failed');
                        if (!response.body)
                            return response;
                        const reader = response.body.getReader(), chunks: Uint8Array[] = [];
                        let bytes = 0;
                        for (;;) {
                            const next = await reader.read();
                            if (next.done)
                                break;
                            bytes += next.value.byteLength;
                            aggregateBytes += next.value.byteLength;
                            if (bytes > 256 * 1024 || aggregateBytes > 16 * 1024 * 1024) {
                                await reader.cancel();
                                throw Error('live response budget exceeded');
                            }
                            chunks.push(next.value);
                        }
                        return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
                    }
                    finally {
                        clearTimeout(timer);
                    }
                };
                const client = new Client({ name: 'local-corpus-feasibility', version: '1' }, versionNegotiationFor(protocol));
                const probe = async (id: string, action: () => Promise<any>, allowError = false) => { current = id; try {
                    const value = await action();
                    if (value?.isError && !allowError)
                        throw Error('Unexpected tool error ' + JSON.stringify(value).slice(0, 500));
                    validateResource(value);
                    checks.push({ role, era, id, passed: true, responseSha256: sha(JSON.stringify(value)) });
                    return value;
                }
                catch (e) {
                    throw Error(role + '/' + era + '/' + id + ': ' + String(e));
                } };
                try {
                    current = 'initialize';
                    await client.connect(new StreamableHTTPClientTransport(new URL(options.endpoint), { fetch: localFetch as any }));
                    const snapshot = await captureMcpTransportSnapshot(client);
                    await assertMcpTransportContract(snapshot, { contractVersion: preview ? '7' : '6', logging: false });
                    check(client.getNegotiatedProtocolVersion() === protocol, 'protocol drift');
                    check(snapshot.server.version === options.serverVersion, 'server version drift');
                    fingerprints.push(await fingerprintMcpTransportSnapshot(snapshot));
                    const catalog = await probe('catalog', () => client.readResource({ uri: 'theologai://primary-sources/catalog' }));
                    check(JSON.parse(catalog.contents[0].text).workCount === 36, 'flat catalog count drift');
                    await probe('classic-catalog', () => client.callTool({ name: 'classic_text_lookup', arguments: { listWorks: true } }));
                    await probe('primary-research-prompt', () => client.getPrompt({ name: 'primary-source-research', arguments: { topic: 'eucharist', authors: 'Erasmus of Rotterdam,Martin Luther', startYear: '500', endYear: '1500', maxSections: '2' } }));
                    await probe('confession-prompt', () => client.getPrompt({ name: 'confession-study', arguments: { topic: 'justification' } }));
                    const uris = (v: any): string[] => v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => k === 'uri' && typeof x === 'string' ? [x] : uris(x)) : [];
                    for (const p of [...core.probes, ...spine.probes]) {
                        await probe('classic-landing:' + p.workId, () => client.callTool({ name: 'classic_text_lookup', arguments: { work: p.workId } }));
                        const page = await probe('browse:' + p.workId, () => client.callTool({ name: 'classic_text_lookup', arguments: { work: p.workId, browseSections: true } }));
                        const next = (page.structuredContent as any)?.directory?.pagination?.nextCursor;
                        if (next)
                            await probe('browse-next:' + p.workId, () => client.callTool({ name: 'classic_text_lookup', arguments: { work: p.workId, browseSections: true, cursor: next } }));
                        await probe('landing:' + p.workId, () => client.readResource({ uri: 'theologai://documents/' + p.workId }));
                        await probe('body:' + p.workId, () => client.readResource({ uri: 'theologai://documents/' + p.workId + '#section-' + p.firstSection.sectionKey }));
                        const global = await probe('global-classic-search:' + p.workId, () => client.callTool({ name: 'classic_text_lookup', arguments: { query: p.query } }));
                        const globalUri = uris(global.structuredContent).find(x => x.startsWith('theologai://documents/' + p.workId + '#section-'));
                        if (!globalUri && p.sourcePackId)
                            throw Error('Spine search failed to expose expected section ' + p.workId);
                        await probe('global-search-body:' + p.workId, () => client.readResource({ uri: globalUri ?? 'theologai://documents/' + p.workId }));
                        const q = { id: 'scope', text: p.query, work: p.workId, match: 'all_terms', limit: 8, ...(!preview ? { providers: ['local'] } : { searchDepth: 'standard' }) };
                        const primary = await probe('search:' + p.workId, () => client.callTool({ name: 'primary_source_search', arguments: { queries: [q] } }));
                        const primaryUri = uris(primary.structuredContent).find(x => x.startsWith('theologai://documents/' + p.workId + '#section-'));
                        if (!primaryUri)
                            throw Error('Scoped search failed to expose expected work ' + p.workId);
                        await probe('primary-search-body:' + p.workId, () => client.readResource({ uri: primaryUri }));
                    }
                    await probe('legacy-regression', () => client.callTool({ name: 'classic_text_lookup', arguments: { work: core.legacyRegression.workId } }));
                    const disabled = await probe('external-disabled', () => client.callTool({ name: 'primary_source_search', arguments: { queries: [{ id: 'external', text: 'Lord Supper', ...(preview ? { searchDepth: 'expanded', expandedLimit: 1 } : { providers: ['ccel'] }), match: 'all_terms', selection: 'relevance', limit: 1 }] } }), !preview);
                    const badCursor = await probe('invalid-classic-cursor', () => client.callTool({ name: 'classic_text_lookup', arguments: { work: core.probes[0].workId, browseSections: true, cursor: 'not-a-valid-cursor' } }), true);
                    check(badCursor.isError === true, 'invalid cursor succeeded');
                    check(preview ? !JSON.stringify(disabled).includes('external_discovery_executed') : disabled.isError === true, 'disabled external contract drift');
                    await probe('norton-browse', () => client.callTool({ name: 'classic_text_lookup', arguments: { work: norton.document_id, browseSections: true } }));
                    await probe('norton-body', () => client.readResource({ uri: 'theologai://documents/' + norton.document_id + '#section-' + norton.section_key }));
                    await probe('aquinas-landing', () => client.callTool({ name: 'historical_hierarchy_lookup', arguments: { slug: aquinas.public_slug } }));
                    await probe('aquinas-children', () => client.callTool({ name: 'historical_hierarchy_lookup', arguments: { slug: aquinas.public_slug, browseChildren: true } }));
                    for (const node of directNodes) {
                        await probe('aquinas-node:' + node, () => client.callTool({ name: 'historical_hierarchy_lookup', arguments: { slug: aquinas.public_slug, nodeKey: node } }));
                        await probe('aquinas-resource:' + node, () => client.readResource({ uri: 'theologai://documents/' + aquinas.public_slug + '#node-' + node }));
                    }
                    await probe('aquinas-search', () => client.callTool({ name: 'historical_hierarchy_lookup', arguments: { slug: aquinas.public_slug, query: 'grace', match: 'all_terms' } }));
                    const cursorHistory = new Map<string, string>(), priorCandidates = new Map<string, string[]>();
                    for (const c of language.cases) {
                        const args = { ...c.arguments };
                        if (c.cursorFrom) {
                            const cursor = cursorHistory.get(c.cursorFrom);
                            if (!cursor)
                                throw Error('Missing language cursor');
                            args.cursor = c.cursorMutation ? corruptCursor(cursor) : cursor;
                        }
                        const value = await probe('language:' + c.id, () => client.callTool({ name: 'original_language_study', arguments: args }), c.mode !== 'success');
                        const raw = { ...value, text: (value.content ?? []).filter((x: any) => x.type === 'text').map((x: any) => x.text) };
                        if (c.mode === 'success')
                            assertSuccess(c.id, raw as any, language, cursorHistory, priorCandidates);
                        else if (c.mode === 'safe-error')
                            assertSafeError(c.id, raw as any, args.cursor);
                        else
                            assertInputError(raw as any);
                    }
                    summaries.push({ role, era, httpExchanges: exchanges, checks: checks.filter(x => x.role === role && x.era === era).length });
                }
                finally {
                    await client.close();
                }
            }
        }
        sameFingerprints();
        return { schemaVersion: 'norton-aquinas-live.v1', role: options.role, endpoint: options.endpoint, serverVersion: options.serverVersion, productProfile: options.role === 'preview' ? '7' : '6', protocols: ['2025-11-25', '2026-07-28'], summaries, fixtureSha256: hash([core, spine, language]), fingerprints, checks, databaseSha256: sha(readFileSync(options.databasePath)), manifestSha256: sha(readFileSync(join(root, 'data/data-manifest.json'))), sourceBodyOutput: false, broaderV9Features: false, aggregateResponseBytes: aggregateBytes, durationMs: Date.now() - started };
    }
    finally {
        db.close();
    }
    function sameFingerprints() { check(hash(fingerprints[0]) === hash(fingerprints[1]), 'dual-era contract differs'); }
}
