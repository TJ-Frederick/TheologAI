import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { optimizePreorderTrigger } from '../../../scripts/corpus-release.js';
import { it, expect } from 'vitest';
import { createCorpusD1Executor, TARGETS, CorpusSession, applyPreparation } from '../../../scripts/corpus-release.js';
import { runControlDiagnostic, diagnosticFetch } from '../../../scripts/corpus-control-diagnostic.js';
import { CORPUS_ACCOUNT_ID } from '../../../scripts/corpus-release-control.js';
import { parseExecutionApproval } from '../../../scripts/corpus-release-operator.js';
it('uses only the selected fixed target and aggregates definitive batch metering', async () => {
    let calls = 0;
    const execute = createCorpusD1Executor('production', (async (url, init) => { calls++; expect(String(url)).toContain(TARGETS.production.id); expect(init?.redirect).toBe('error'); expect(JSON.parse(String(init?.body)).params).toEqual([]); return Response.json({ success: true, result: [{ success: true, results: [], meta: { rows_read: 1, rows_written: 2 } }, { success: true, results: [], meta: { rows_read: 3, rows_written: 4 } }] }); }) as typeof fetch);
    expect(await execute('CREATE TABLE a(id INTEGER); CREATE TABLE b(id INTEGER);')).toEqual({ rows: [], rowsRead: 4, rowsWritten: 6 });
    expect(calls).toBe(1);
});
it.each(['transport', 'partial', 'unsuccessful', 'missing-meter'])('stops on %s without retry or response-body disclosure', async (fault) => {
    let calls = 0;
    const execute = createCorpusD1Executor('preview', (async () => { calls++; if (fault === 'transport')
        throw Error('private-sentinel'); return Response.json({ success: fault !== 'unsuccessful', result: fault === 'partial' ? [] : [{ success: true, results: [], meta: fault === 'missing-meter' ? {} : { rows_read: 1, rows_written: 0 } }] }); }) as typeof fetch);
    await expect(execute('SELECT 1;')).rejects.toThrow('unknown outcome');
    expect(calls).toBe(1);
});
it('refuses an oversized operation before dispatch', async () => {
    let calls = 0;
    const execute = createCorpusD1Executor('preview', (async () => { calls++; return Response.json({}); }) as typeof fetch);
    await expect(execute('SELECT ' + "'" + 'a'.repeat(100000) + "';")).rejects.toThrow('boundary');
    expect(calls).toBe(0);
});

it('preserves the terminal graph predicate on fifteen adversarial graph and ordering controls', () => {
    const source = new Database(':memory:');
    const manifest=JSON.parse(readFileSync('data/data-manifest.json','utf8'));for(const migration of manifest.materializations.d1.migrations)source.exec(readFileSync(migration.path,'utf8'));
    const trigger = (source.prepare("SELECT sql FROM sqlite_master WHERE name='historical_edition_hierarchy_node_preorder_insert'").get() as {sql:string}).sql;
    source.close();
    const predicate = (sql:string) => sql.slice(sql.indexOf('WITH RECURSIVE'),sql.lastIndexOf('  );')).replaceAll('NEW.hierarchy_id', "'h'");
    const original = predicate(trigger), optimized = predicate(optimizePreorderTrigger(trigger));
    const db = new Database(':memory:');
    db.exec('CREATE TABLE historical_edition_hierarchy_nodes(hierarchy_id TEXT,node_key TEXT,parent_node_key TEXT,flat_ordinal INTEGER,sibling_ordinal INTEGER); CREATE INDEX children ON historical_edition_hierarchy_nodes(hierarchy_id,parent_node_key);');
    const insert = db.prepare("INSERT INTO historical_edition_hierarchy_nodes VALUES('h',?,?,?,?)");
    const base:(string|number|null)[][] = [['r',null,1,1],['a','r',2,1],['aa','a',3,1],['b','r',4,2],['bb','b',5,1]];
    let cases=0;
    const test=(rows:typeof base,rejects:boolean)=>{db.exec('DELETE FROM historical_edition_hierarchy_nodes');for(const row of rows)insert.run(...row);expect(db.prepare(original).all().length>0).toBe(rejects);expect(db.prepare(optimized).all().length>0).toBe(rejects);cases++;};
    try {
        test(base,false);
        for(let i=0;i<base.length;i++)for(let j=i+1;j<base.length;j++){const rows=structuredClone(base);[rows[i][2],rows[j][2]]=[rows[j][2],rows[i][2]];test(rows,true);}
        test([...base,['lost','absent',6,1]],true);
        test([...base,['c','d',6,1],['d','c',7,1]],true);
        test([...base,['root2',null,6,2]],false);
        test(base.map(r=>r[0]==='a'?[r[0],r[1],r[2],2]:r[0]==='b'?[r[0],r[1],r[2],1]:r),true);
        expect(cases).toBe(15);
    } finally { db.close(); }
});

it('rejects a transport/session target mismatch before dispatch',()=>{
 let calls=0;const execute=createCorpusD1Executor('preview',(async()=>{calls++;return Response.json({});}) as typeof fetch);
 expect(()=>new CorpusSession({databaseId:TARGETS.production.id,execute,usage:async()=>({windowStart:'',observedAt:'',rowsRead:0,rowsWritten:0}),guard:async()=>{},append:async()=>{}})).toThrow('target mismatch');expect(calls).toBe(0);
});

it('does not reset preflight counters or its journal before preparation',async()=>{
 let calls=0;const session=new CorpusSession({databaseId:TARGETS.production.id,execute:async()=>{calls++;return {rows:[],rowsRead:1,rowsWritten:0};},usage:async()=>({windowStart:'2026-10-27T00:00:00.000Z',observedAt:'2026-10-27T12:00:00.000Z',rowsRead:0,rowsWritten:0}),guard:async()=>{},append:async()=>{}},undefined,()=>Date.parse('2026-10-27T12:00:00Z'));
 await session.query('SELECT 1;',1);await expect(applyPreparation({} as any,session,{} as any)).rejects.toThrow('fresh session');expect(calls).toBe(1);expect(session.requests).toBe(1);
});

const identityNow = Date.parse('2026-10-29T12:00:00Z');
const identityApproval = { schemaVersion: 'norton-aquinas-execution-approval.v1', status: 'control-diagnostic', role: 'preview', databaseId: TARGETS.preview.id, exclusiveCandidateSql: true, candidateJobsPaused: true, ownerCustodySha256: 'c'.repeat(64), windowStart: '2026-10-29T00:00:00.000Z', expiresAt: '2026-10-29T14:30:00.000Z', knownRowsRead: 0, knownRowsWritten: 0, expectedLedgerSha256: 'd'.repeat(64), identifyPreviewTokenOnly: true };
it.each(['user', 'account'])('identifies only the protected preview %s token and retains no credential or response body', async (owner) => {
    const directory = mkdtempSync(join(tmpdir(), 'preview-token-identity-')), output = join(directory, 'identity.json'), calls: string[] = [], sentinel = 'SYNTHETIC_PRIVATE_TOKEN_VALUE';
    try {
        await runControlDiagnostic({ approval: identityApproval, output, now: () => identityNow, readToken: async () => sentinel, fetch: (async (input, init) => {
            calls.push(String(input)); expect(new Headers(init?.headers).get('authorization')).toBe('Bearer ' + sentinel);
            if (owner === 'account' && calls.length === 1) return Response.json({ success: false, errors: [{ code: 10000, message: sentinel }] }, { status: 403 });
            return Response.json({ success: true, result: { id: 'a'.repeat(32), status: 'active', ignoredSecret: sentinel } });
        }) as typeof fetch });
        expect(calls).toEqual(owner === 'user' ? ['https://api.cloudflare.com/client/v4/user/tokens/verify'] : ['https://api.cloudflare.com/client/v4/user/tokens/verify', `https://api.cloudflare.com/client/v4/accounts/${CORPUS_ACCOUNT_ID}/tokens/verify`]);
        const raw = readFileSync(output, 'utf8') + readFileSync(output + '.events.jsonl', 'utf8');
        expect(raw).not.toContain(sentinel); expect(JSON.parse(readFileSync(output, 'utf8'))).toMatchObject({ tokenId: 'a'.repeat(32), tokenOwner: owner, environment: 'preview', sqlCalls: 0, writes: 0, readinessReceipt: false });
    } finally { rmSync(directory, { recursive: true, force: true }); }
});
it.each(['network', 'malformed'])('stops token identification on %s without a fallback or retry', async (fault) => {
    const directory = mkdtempSync(join(tmpdir(), 'preview-token-failure-')); let calls = 0;
    try {
        await expect(runControlDiagnostic({ approval: identityApproval, output: join(directory, 'identity.json'), now: () => identityNow, readToken: async () => 'synthetic', fetch: (async () => { calls++; if (fault === 'network') throw Error('synthetic-private-error'); return Response.json({ success: true, result: { id: 'not-a-token-id', status: 'active' } }); }) as typeof fetch })).rejects.toThrow();
        expect(calls).toBe(1);
        expect(readFileSync(join(directory, 'identity.json.events.jsonl'), 'utf8')).not.toContain('synthetic-private-error');
    } finally { rmSync(directory, { recursive: true, force: true }); }
});
it('forbids policy changes, unrelated reads and SQL in token identity mode', async () => {
    let calls = 0; const guarded = diagnosticFetch((async () => { calls++; return Response.json({}); }) as typeof fetch, async () => {}, () => identityNow, true);
    for (const [url, method] of [[`https://api.cloudflare.com/client/v4/accounts/${CORPUS_ACCOUNT_ID}/tokens/one`, 'PUT'], ['https://api.cloudflare.com/client/v4/user/tokens', 'GET'], [`https://api.cloudflare.com/client/v4/accounts/${CORPUS_ACCOUNT_ID}/d1/database/${TARGETS.preview.id}/query`, 'POST']])
        await expect(guarded(url, { method })).rejects.toThrow();
    expect(calls).toBe(0);
});
it('requires explicit diagnostic approval before preview token access and cannot pass full-release parsing', async () => {
    let credentials = 0, calls = 0;
    await expect(runControlDiagnostic({ approval: { ...identityApproval, status: 'pending' }, output: '/unused', now: () => identityNow, readToken: async () => { credentials++; return 'synthetic'; }, fetch: (async () => { calls++; return Response.json({}); }) as typeof fetch })).rejects.toThrow();
    expect(credentials).toBe(0); expect(calls).toBe(0);
    expect(() => parseExecutionApproval({ ...identityApproval, status: 'approved' }, 'preview', identityNow)).toThrow();
});
