import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { ALL_FTS, CATALOG_SQL, canonicalTableDigest, proveCompleteCorpus, sourcePage, type CorpusProofSource, type ProofExecute, type ProofQuery, type ProofRow } from '../../../scripts/corpus-source-proof.js';
import { CorpusProofTransport, assertProofQuery, admitCorpusBudget } from '../../../scripts/corpus-proof-transport.js';
import { ACCOUNT, TARGETS, classifyEntries, requireProofApproval, verifyFreshCorpusReceipt } from '../../../scripts/application-release-policy.mjs';

describe('fresh corpus verifier CLI boundary', () => {
  const credentialFreeEnv = () => {
    const env = { ...process.env };
    delete env.APPLICATION_CORPUS_PROOF_APPROVAL_JSON;
    delete env.CLOUDFLARE_API_TOKEN;
    delete env.CLOUDFLARE_ACCOUNT_ID;
    return env;
  };
  const invoke = (args: string[]) => {
    return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/application-corpus-check.ts', 'verify', ...args], {
      cwd: new URL('../../../', import.meta.url), env: credentialFreeEnv(), encoding: 'utf8', timeout: 10_000,
    });
  };
  const args = ['--role', 'preview', '--directory', '/unused-source', '--plan-sha256', 'a'.repeat(64), '--output', '/unused-receipt.json'];
  it('accepts the exact workflow flags and reaches the approval guard before network or file access', () => {
    const result = invoke(args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('explicit protected proof approval missing');
    expect(result.stderr).not.toContain('refused: argument');
  });
  it('rejects unknown flags', () => {
    const result = invoke(args.map(v => v === '--plan-sha256' ? '--unreviewed-flag' : v));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('refused: argument');
  });
  it('rejects duplicate flags', () => {
    const result = invoke(args.map(v => v === '--plan-sha256' ? '--role' : v));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('refused: argument');
  });
  it('retains the complete producer for operator execution and protected receipt acceptance', () => {
    const operator=readFileSync(new URL('../../../scripts/operator-corpus-proof.ts',import.meta.url),'utf8');
    expect(operator).toContain('runFreshApplicationCorpusCheck({');
    expect(operator).toContain('verifyFreshCorpusReceipt(receipt');
    const action=parse(readFileSync(new URL('../../../.github/actions/operator-corpus-proof/action.yml',import.meta.url),'utf8')) as {runs:{steps:{id?:string;run?:string}[]}};
    expect(action.runs.steps.find(s=>s.id==='accept')!.run).toContain('operator-corpus-proof.ts complete');
  });
});

function fixture() {
  const source = new Database(':memory:');
  source.exec(`CREATE TABLE documents(id INTEGER PRIMARY KEY,title TEXT);
    CREATE TABLE document_sections(id INTEGER PRIMARY KEY,document_id INTEGER REFERENCES documents(id),content TEXT);
    CREATE TABLE historical_edition_sections(id INTEGER PRIMARY KEY,content TEXT);
    CREATE TABLE historical_edition_hierarchy_bodies(id INTEGER PRIMARY KEY,content TEXT);
    CREATE VIRTUAL TABLE strongs_fts USING fts5(strongs_number,lemma,transliteration,definition);
    CREATE VIRTUAL TABLE sections_fts USING fts5(content,content='document_sections',content_rowid='id');
    CREATE VIRTUAL TABLE historical_edition_sections_fts USING fts5(content,content='historical_edition_sections',content_rowid='id');
    CREATE VIRTUAL TABLE historical_edition_hierarchy_bodies_fts USING fts5(content,content='historical_edition_hierarchy_bodies',content_rowid='id');
    INSERT INTO documents VALUES(1,'one'); INSERT INTO document_sections VALUES(1,1,'one two three');
    INSERT INTO historical_edition_sections VALUES(1,'one two three'); INSERT INTO historical_edition_hierarchy_bodies VALUES(1,'one two three');
    INSERT INTO strongs_fts(rowid,strongs_number,lemma,transliteration,definition) VALUES(7,'G25','agape','agape','love'),(17,'H7225','beginning','beginning','first');`);
  for (const t of ALL_FTS.slice(1)) source.exec(`INSERT INTO ${t}(${t}) VALUES('rebuild')`);
  const target = new Database(source.serialize()); target.exec("CREATE TABLE _cf_KV(key TEXT PRIMARY KEY,value BLOB); CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT,applied_at TEXT); INSERT INTO d1_migrations VALUES(1,'0001.sql','2026-10-27 00:00:00')");
  const tables = ['documents','document_sections','historical_edition_sections','historical_edition_hierarchy_bodies','strongs_fts'].sort();
  const expected: CorpusProofSource = { tables, catalog: source.prepare(CATALOG_SQL).all() as ProofRow[], digests: Object.fromEntries(tables.map(t => [t,canonicalTableDigest(source,t)])), foreignKeyWitnessSha256: 'a'.repeat(64), schemaVersion:'fixture',migrationNames:['0001.sql'],quickCheckReadCeiling:5000 };
  const queries: ProofQuery[] = [];
  const execute: ProofExecute = async q => { assertProofQuery(q);queries.push(q);if(q.kind==='fts-integrity'){target.prepare(q.sql).run();return [];}return target.prepare(q.sql).all() as ProofRow[]; };
  return {source,target,expected,queries,execute,close:()=>{source.close();target.close();}};
}
describe('complete fresh application corpus verification',()=>{
  it('compares complete cells and all FTS indexes without a custody carry-forward',async()=>{
    const f=fixture();try{const r=await proveCompleteCorpus(f.source,f.expected,f.execute);expect(r.tables).toEqual(f.expected.digests);expect(r.ftsIntegrity).toEqual(ALL_FTS);expect(f.queries.filter(q=>q.kind==='fts-integrity')).toHaveLength(4);}finally{f.close();}
  });
  it('normalizes owned FTS physical IDs after comparing every content cell',async()=>{
    const f=fixture();try{f.target.exec("DELETE FROM strongs_fts; INSERT INTO strongs_fts(rowid,strongs_number,lemma,transliteration,definition) VALUES(501,'H7225','beginning','beginning','first'),(900,'G25','agape','agape','love')");await expect(proveCompleteCorpus(f.source,f.expected,f.execute)).resolves.toBeDefined();}finally{f.close();}
  });
  for(const [name,sql] of [
    ['same-count cell corruption',"UPDATE document_sections SET content='changed' WHERE id=1"],
    ['extra base row',"INSERT INTO document_sections VALUES(2,1,'extra')"],
    ['extra owned FTS document',"INSERT INTO strongs_fts VALUES('G99','extra','extra','extra')"],
    ['unexpected schema',"CREATE TABLE unexpected(id INTEGER PRIMARY KEY)"],
    ['wrong ledger',"UPDATE d1_migrations SET name='different.sql'"],
  ])it('rejects '+name,async()=>{const f=fixture();try{f.target.exec(sql!);await expect(proveCompleteCorpus(f.source,f.expected,f.execute)).rejects.toThrow();}finally{f.close();}});
  for(const table of ALL_FTS.slice(1))for(const fault of ['missing','orphan','position'])it(`rejects ${table} ${fault} postings`,async()=>{
    const f=fixture();try{
      if(fault==='missing')f.target.exec(`INSERT INTO ${table}(${table},rowid,content) VALUES('delete',1,'one two three')`);
      if(fault==='orphan')f.target.exec(`INSERT INTO ${table}(rowid,content) VALUES(99,'orphan')`);
      if(fault==='position'){f.target.exec(`INSERT INTO ${table}(${table},rowid,content) VALUES('delete',1,'one two three')`);f.target.exec(`INSERT INTO ${table}(rowid,content) VALUES(1,'three two one')`);}
      await expect(proveCompleteCorpus(f.source,f.expected,f.execute)).rejects.toThrow();
    }finally{f.close();}
  });
  it('rejects a catalog change between the two observations',async()=>{
    const f=fixture();try{await expect(proveCompleteCorpus(f.source,f.expected,async q=>{if(q.label==='catalog-after')f.target.exec('CREATE INDEX changed ON documents(title)');return f.execute(q);})).rejects.toThrow('catalog changed');}finally{f.close();}
  });
  it('still rejects a comment-only change between the raw catalog observations',async()=>{
    const f=fixture();try{await expect(proveCompleteCorpus(f.source,f.expected,async q=>{
      const rows=await f.execute(q);
      return q.label==='catalog-before'?rows.map(r=>r.name==='documents'?{...r,sql:r.sql+'-- initial observation'}:r):rows;
    })).rejects.toThrow('catalog changed during proof');}finally{f.close();}
  });
  it('requires indexed, bounded keyset pages',()=>{const f=fixture();try{expect(()=>sourcePage(f.source,'documents',null,0)).toThrow();expect(()=>sourcePage(f.source,'documents;DROP TABLE documents',null)).toThrow();expect(sourcePage(f.source,'documents',null).expected).toHaveLength(1);}finally{f.close();}});
});

function transportFixture(fault: string, readBudget = 3_510_997, buffer = false, scope?: {role:'preview'|'production';day:string}) {
  const directory = mkdtempSync(join(tmpdir(), 'theologai-transport-test-'));
  vi.useFakeTimers({ now: new Date(scope ? scope.day+'T12:00:00Z' : buffer ? '2026-10-29T12:00:00Z' : '2026-10-27T12:00:00Z') });
  let tick = Date.now(); const clock = vi.spyOn(Date, 'now').mockImplementation(() => tick += 1000);
  const calls: { path: string; body: unknown; method: string; rateLimitType: string | null }[] = [];
  let sqlCalls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    const body = options?.body ? JSON.parse(String(options.body)) : undefined;
    calls.push({ path, body, method: options?.method ?? 'GET', rateLimitType:new Headers(options?.headers).get('X-Rate-Limit-Type') });
    let value: unknown;
    if (path.endsWith('/graphql')) {
      value = { data: { viewer: { accounts: [{ accountTag: ACCOUNT, d1AnalyticsAdaptiveGroups: [{ sum: { rowsRead: fault === 'headroom' ? 4_000_000 : fault === 'daytime' ? 601_058 : fault === 'waived-margin' ? 415_369 : fault === 'waived-overrun' ? 489_004 : 100, rowsWritten: 0 }, avg: { sampleInterval: fault === 'sampled' ? 2 : 1 } }] }] } } };
    } else if (path.endsWith('/query')) {
      sqlCalls++;
      if (fault === 'network') throw Error('synthetic failed attempt');
      if (fault === 'timeout') throw new DOMException('synthetic-test-token private SQL body', 'TimeoutError');
      if (fault === 'redirect') return new Response('{}', { status: 302 });
      if (fault === 'http-403' || fault === 'http-400') return Response.json({ success: false, errors: [{ code: 7500, message: `synthetic-test-token private SQL body ${fault === 'http-403' ? 'not authorized: SQLITE_AUTH' : 'SQLITE_CORRUPT_VTAB'}` }, { code: 'unsafe-text' }] }, { status: fault === 'http-403' ? 403 : 400 });
      if (fault === 'invalid-json') return new Response('synthetic-test-token private SQL body', { headers: { 'content-type': 'application/json' } });
      if (fault === 'empty-json') return new Response(null, { headers: { 'content-type': 'application/json' } });
      if (fault === 'oversized-http-error') return new Response('x'.repeat(1_250_001), { status: 400, headers: { 'content-type': 'application/json' } });
      value = { success: true, errors: [], result: [{ success: true, results: [{ n: 1 }], meta: {
        rows_read: fault === 'read-overrun' ? 200 : 1, rows_written: fault === 'unexpected-write' ? 1 : 0, changes: 0,
        total_attempts: fault === 'retry' ? 2 : 1, served_by_primary: fault !== 'replica',
      } }] };
    } else {
      const role = path.includes('/theologai-preview/') ? 'preview' : 'production';
      const binding = { type: 'd1', name: 'THEOLOGAI_DB', id: fault === 'binding' ? 'wrong' : TARGETS[role].databaseId };
      const version = role === 'preview' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222';
      const result = path.endsWith('/settings') ? { bindings: [binding] }
        : path.endsWith('/deployments') ? { deployments: [{ id: fault === 'control-change' && sqlCalls ? 'changed' : role, versions: [{ version_id: version, percentage: 100 }] }] }
        : { id: version, resources: { bindings: [binding] } };
      value = { success: true, errors: [], result };
    }
    return Response.json(value);
  };
  const transport = new CorpusProofTransport({ role: scope?.role ?? 'preview', token: 'synthetic-test-token', readBudget, eventFile: join(directory, 'events.jsonl'), fetch: fetcher, previewQuotaBuffer:buffer });
  const query: ProofQuery = { kind: 'select', label: 'fixture', sql: 'SELECT 1 n', readCeiling: 100, writeCeiling: 0 };
  return { transport, calls, query, events: () => readFileSync(join(directory, 'events.jsonl'), 'utf8'), close: () => { clock.mockRestore(); vi.useRealTimers(); rmSync(directory, { recursive: true, force: true }); } };
}

describe('single-attempt corpus proof transport', () => {
  for(const [role,day,accepted] of [['preview','2026-10-30',true],['production','2026-10-30',false],['preview','2026-10-31',false]] as const)it(`scopes the uncertainty waiver to ${role} on ${day}`,async()=>{
    const f=transportFixture('waived-margin',3510997,false,{role,day});try {
      if(accepted){await f.transport.start();expect(f.events()).toContain('"uncertaintyReadMargin":0');expect(f.events()).toContain('"previewUncertaintyWaiverDay":"2026-10-30"');}
      else await expect(f.transport.start()).rejects.toThrow('headroom');
      expect(f.calls.some(c=>c.path.endsWith('/query'))).toBe(false);
    }finally{f.close();}
  });
  it('retains the 4M ceiling when the preview uncertainty margin is waived',async()=>{
    const f=transportFixture('waived-overrun',3510997,false,{role:'preview',day:'2026-10-30'});try {
      await expect(f.transport.start()).rejects.toThrow('headroom');expect(f.calls.some(c=>c.path.endsWith('/query'))).toBe(false);
    }finally{f.close();}
  });
  it('uses the approved daytime preview buffer with live-audit and uncertainty reserves',async()=>{
    const f=transportFixture('daytime',3_510_997,true);try {
      await f.transport.start();await f.transport.execute(f.query);await f.transport.finish();
      expect(f.events()).toContain('"accountReadCeiling":5000000');expect(f.events()).toContain('"liveAuditReadReserve":500000');
      expect(f.events()).toContain('"previewQuotaBufferDay":"2026-10-29"');
      expect(f.calls.filter(c=>c.path.endsWith('/graphql')).every(c=>c.rateLimitType===null)).toBe(true);
      expect(f.calls.filter(c=>!c.path.endsWith('/graphql')).every(c=>c.rateLimitType===null)).toBe(true);
    } finally {f.close();}
    const standard=transportFixture('daytime');try {await expect(standard.transport.start()).rejects.toThrow('headroom');expect(standard.calls.some(c=>c.path.endsWith('/query'))).toBe(false);expect(standard.calls.every(c=>c.rateLimitType===null)).toBe(true);}finally{standard.close();}
  });
  it('refuses the preview buffer on production and outside its authorized UTC day',()=>{
    const dir=mkdtempSync(join(tmpdir(),'theologai-buffer-boundary-'));try {
      for(const [role,day] of [['production','2026-10-29'],['preview','2026-10-30']] as const){
        vi.useFakeTimers({now:new Date(day+'T12:00:00Z')});
        expect(()=>new CorpusProofTransport({role,token:'synthetic-token',readBudget:3510997,eventFile:join(dir,'unused.jsonl'),previewQuotaBuffer:true})).toThrow('preview quota buffer date/role');
      }
    }finally{vi.useRealTimers();rmSync(dir,{recursive:true,force:true});}
  });
  it('rechecks both active/configured bindings with six GETs and zero SQL or analytics', async () => {
    const f=transportFixture('',0); try {
      expect(await f.transport.observeControls()).toHaveLength(2);
      expect(f.calls).toHaveLength(6); expect(f.calls.every(c=>c.method==='GET')).toBe(true);
      expect(f.transport.metering).toEqual({rowsRead:0,rowsWritten:0,requests:0,retries:0,unknownAttempts:0,integrityCommands:0});
    } finally {f.close();}
    const wrong=transportFixture('binding',0); try {await expect(wrong.transport.observeControls()).rejects.toThrow('configured D1 binding');} finally {wrong.close();}
    const producer=transportFixture(''); try {await expect(producer.transport.observeControls()).rejects.toThrow('metadata-only observer');expect(producer.calls).toHaveLength(0);} finally {producer.close();}
  });
  it('meters one primary attempt and proves both bindings unchanged', async () => {
    const f = transportFixture(''); try {
      await f.transport.start(); await expect(f.transport.execute(f.query)).resolves.toEqual([{ n: 1 }]);
      expect((await f.transport.finish()).controlsUnchanged).toBe(true);
      expect(f.transport.metering).toMatchObject({ rowsRead: 1, rowsWritten: 0, requests: 1, unknownAttempts: 0, retries: 0 });
      expect(f.calls.filter(c => c.path.endsWith('/query'))).toHaveLength(1);
      expect(f.calls.every(c => c.method === 'GET' || c.path.endsWith('/query') || c.path.endsWith('/graphql'))).toBe(true);
    } finally { f.close(); }
  });
  for (const fault of ['headroom', 'sampled', 'binding']) it('stops before SQL for ' + fault, async () => {
    const f = transportFixture(fault); try { await expect(f.transport.start()).rejects.toThrow(); expect(f.calls.some(c => c.path.endsWith('/query'))).toBe(false); } finally { f.close(); }
  });
  for (const fault of ['network', 'redirect', 'retry', 'replica', 'read-overrun', 'unexpected-write']) it('halts without retry after ' + fault, async () => {
    const f = transportFixture(fault); try {
      await f.transport.start(); await expect(f.transport.execute(f.query)).rejects.toThrow('no retry or cleanup');
      await expect(f.transport.execute(f.query)).rejects.toThrow('halted');
      expect(f.calls.filter(c => c.path.endsWith('/query'))).toHaveLength(1); expect(f.transport.metering.unknownAttempts).toBe(1);
    } finally { f.close(); }
  });
  for (const fault of ['http-403', 'http-400', 'invalid-json', 'empty-json', 'network', 'timeout', 'oversized-http-error']) it('retains safe diagnostics without retry or response contents after ' + fault, async () => {
    const f = transportFixture(fault); try {
      await f.transport.start(); await expect(f.transport.execute(f.query)).rejects.toThrow('no retry or cleanup');
      await expect(f.transport.execute(f.query)).rejects.toThrow('halted');
      expect(f.calls.filter(c => c.path.endsWith('/query'))).toHaveLength(1);
      const events = f.events(); expect(events).not.toContain('synthetic-test-token'); expect(events).not.toContain('private SQL body'); expect(events).not.toContain('unsafe-text');
      const rows = events.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
      if (fault.startsWith('http-')) expect(rows).toContainEqual(expect.objectContaining({ kind: 'provider-error', httpStatus: fault === 'http-403' ? 403 : 400, errorCodes: [7500] }));
      if (fault.startsWith('http-')) expect(rows).toContainEqual(expect.objectContaining({ kind: 'provider-error', errorKinds: fault === 'http-403' ? ['SQLITE_AUTH', 'authorization'] : ['SQLITE_CORRUPT'] }));
      if (fault === 'invalid-json') expect(rows).toContainEqual(expect.objectContaining({ kind: 'invalid-json', httpStatus: 200 }));
      if (fault === 'empty-json') expect(rows).toContainEqual(expect.objectContaining({ kind: 'rejected-response', httpStatus: 200, emptyBody: true }));
      if (fault === 'timeout') expect(rows).toContainEqual(expect.objectContaining({ kind: 'halted', failureKind: 'TimeoutError' }));
      if (fault === 'oversized-http-error') expect(rows.some(event => event.kind === 'provider-error')).toBe(false);
      expect(f.transport.metering.unknownAttempts).toBe(1);
    } finally { f.close(); }
  });
  it('rejects control drift after the proof', async () => {
    const f = transportFixture('control-change'); try { await f.transport.start(); await f.transport.execute(f.query); await expect(f.transport.finish()).rejects.toThrow('controls changed'); } finally { f.close(); }
  });
});

describe('source, approval and metering boundaries',()=>{
  it('rejects data/query changes, including renames or extra source paths',()=>{
    const b=new Map([['data/manifest.json',{mode:'100644',blob:'a'}],['src/kernel/query.ts',{mode:'100644',blob:'a'}]]);
    expect(classifyEntries(b,b,{}).applicationOnly).toBe(true);
    for(const path of ['data/manifest.json','src/kernel/query.ts','src/new-query.ts']){const a=new Map(b);a.set(path,{mode:'100644',blob:'b'});expect(classifyEntries(b,a,{}).applicationOnly).toBe(false);}
    const a=new Map(b);a.delete('src/kernel/query.ts');expect(classifyEntries(b,a,{}).applicationOnly).toBe(false);
  });
  it('admits only the explicitly scoped four integrity checks',()=>{
    for(const sql of ["INSERT INTO documents VALUES(2,'bad')","DROP TABLE documents","SELECT 1;DELETE FROM documents"]){expect(()=>assertProofQuery({kind:'fts-integrity',label:'bad',sql,readCeiling:1024,writeCeiling:1})).toThrow();}
    expect(()=>assertProofQuery({kind:'fts-integrity',label:'good',sql:`INSERT INTO "strongs_fts"("strongs_fts",rank) VALUES('integrity-check',1)`,readCeiling:1024,writeCeiling:1})).not.toThrow();
  });
  it('reserves production traffic and analytics uncertainty before dispatch',()=>{
    expect(()=>admitCorpusBudget(100000,3600000,100000,0)).not.toThrow();
    expect(()=>admitCorpusBudget(100001,3700000,0,0)).toThrow();
    expect(()=>admitCorpusBudget(0,0,3799999,2)).toThrow();
    expect(()=>admitCorpusBudget(789003,3510997,0,0,5000000,500000)).not.toThrow();
    expect(()=>admitCorpusBudget(789004,3510997,0,0,5000000,500000)).toThrow();
    expect(()=>admitCorpusBudget(0,3510997,0,0,5000000,0)).toThrow('policy');
    expect(()=>admitCorpusBudget(0,3510997,0,0,6000000,500000)).toThrow('policy');
  });
  it('refuses missing, expired, wrong-role or broader verification approval',()=>{
    const now=Date.parse('2026-10-27T12:00:00Z');const expected={role:'preview' as const,sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40)};
    const v={schemaVersion:'theologai-fresh-corpus-proof-approval.v1',...expected,accountId:ACCOUNT,databaseId:TARGETS.preview.databaseId,expiresAt:'2026-10-27T13:00:00Z',maxReads:3600000,integrityCommands:4,exclusiveDataWritesDuringProof:true};
    expect(()=>requireProofApproval(v,expected,now)).not.toThrow();
    for(const change of [{role:'production'},{databaseId:TARGETS.production.databaseId},{sourceTree:'c'.repeat(40)},{integrityCommands:5},{maxReads:5000000},{expiresAt:'2026-10-26T12:00:00Z'}])expect(()=>requireProofApproval({...v,...change},expected,now)).toThrow();
    expect(()=>requireProofApproval(null,expected,now)).toThrow();
  });
  it('cannot accept a compatibility marker or conditional historical receipt as fresh verification',()=>{
    const expected={role:'preview' as const,sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40)};
    for(const schemaVersion of ['theologai-composite-preparation-verification.v1','theologai-remote-d1-readiness-receipt.v1','markers-only'])expect(()=>verifyFreshCorpusReceipt({schemaVersion},expected)).toThrow('fresh complete proof required');
  });
});

describe('operator integrity-only transport',()=>{
  it('applies the same scoped margin waiver to fresh operator admission without analytics or SQL',async()=>{
    const f=transportFixture('',16384,false,{role:'preview',day:'2026-10-30'});try {
      const controls=['production','preview'].map(role=>({role,deploymentId:role,versionId:role==='preview'?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222',databaseId:TARGETS[role as 'preview'|'production'].databaseId}));const at=Date.now();
      await f.transport.startIntegrity({accountId:ACCOUNT,role:'preview',day:'2026-10-30',observedAt:new Date(at).toISOString(),rowsRead:415369,rowsWritten:0,sampleInterval:1,readBudget:3510997,controls});
      expect(f.events()).toContain('"uncertaintyReadMargin":0');expect(f.calls.every(c=>!c.path.endsWith('/graphql')&&!c.path.endsWith('/query'))).toBe(true);
    }finally{f.close();}
  });
  it('uses fresh protected admission without any operator analytics or SELECT calls',async()=>{const f=transportFixture('',16384);try{
    // Obtain the same controls via the zero-SQL observer, then start a separate writer.
    const controls=['production','preview'].map(role=>({role,deploymentId:role,versionId:role==='preview'?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222',databaseId:TARGETS[role as 'preview'|'production'].databaseId}));
    const at=Date.now();await f.transport.startIntegrity({accountId:ACCOUNT,role:'preview',day:'2026-10-27',observedAt:new Date(at).toISOString(),rowsRead:100,rowsWritten:0,sampleInterval:1,readBudget:3510997,controls});
    await expect(f.transport.execute(f.query)).rejects.toThrow('integrity-only');expect(f.calls.every(c=>!c.path.endsWith('/graphql')&&!c.path.endsWith('/query'))).toBe(true);
  }finally{f.close();}});
  for(const fault of ['stale','scope','sampled','headroom','writes'])it('refuses '+fault+' protected admission before SQL',async()=>{const f=transportFixture('',16384);try{const a:any={accountId:ACCOUNT,role:'preview',day:'2026-10-27',observedAt:new Date(Date.now()).toISOString(),rowsRead:100,rowsWritten:0,sampleInterval:1,readBudget:3510997,controls:[]};if(fault==='stale')a.observedAt='2026-10-27T11:59:00Z';if(fault==='scope')a.role='production';if(fault==='sampled')a.sampleInterval=2;if(fault==='headroom')a.rowsRead=4000000;if(fault==='writes')a.rowsWritten=80000;await expect(f.transport.startIntegrity(a)).rejects.toThrow();expect(f.calls).toHaveLength(0);}finally{f.close();}});
});
