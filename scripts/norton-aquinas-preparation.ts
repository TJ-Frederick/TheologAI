/** Focused Norton/Aquinas preparation reused from the reviewed local implementation. No remote transport or authentication. */
import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {unstable_splitSqlQuery as split} from 'wrangler';
import {canonicalJson} from './audit-historical-core-preview.js';
import {parseDataManifest,verifyD1Migrations} from './d1-corpus-identity.js';
import {canonicalTableDigest,PROVIDER_CATALOG} from './corpus-source-proof.js';
import {POLICY} from './norton-aquinas-release-policy.mjs';
import {CORPUS_INSERT_TABLES,deriveLocalHistoricalAdditions,digestLocalDeltaTable,verifyExactInsertRows,type Row,type ExactInsertRows,type ProofReader} from './corpus-release-data.js';
export const TARGETS={production:{id:POLICY.targets.production.databaseId,name:POLICY.targets.production.databaseName}};
const FTS=['strongs_fts','sections_fts','historical_edition_sections_fts','historical_edition_hierarchy_bodies_fts'] as const;
const CATALOG_SQL="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name;";
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const hash=(value:unknown)=>sha(canonicalJson(value));
function check(value:unknown,message:string):asserts value {if(!value)throw Error('Corpus preparation refused: '+message);}
const same=(a:unknown,b:unknown,message:string)=>check(hash(a)===hash(b),message);
const id=(name:string)=>{check(/^[a-z_][a-z0-9_]*$/.test(name),'unsafe identifier');return '"'+name+'"';};
const literal=(value:unknown)=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
export interface Operation {
    phase: string;
    sql: string;
    readCeiling: number;
    writeCeiling: number;
}
export interface PreparationPlan {
    schemaVersion: 'norton-aquinas-preparation.v1';
    target: typeof TARGETS.production;
    baselineSha256: string;
    baselineWitnessSha256: string;
    sourceSha256: string;
    operations: Operation[];
    readbacks: ExactInsertRows[];
    sha256: string;
}
/** Only the recursive join order changes; the final source definition is restored. */
export function optimizePreorderTrigger(trigger: string): string {
    const match = 'FROM historical_edition_hierarchy_nodes child\n      JOIN traversal ON traversal.node_key = child.parent_node_key';
    const optimized = trigger.replace(match, 'FROM traversal CROSS JOIN historical_edition_hierarchy_nodes child\n          ON traversal.node_key = child.parent_node_key');
    check(optimized !== trigger, 'reviewed trigger shape changed');
    return optimized;
}

/** Only the retained populated schema0009 baseline is eligible, never an empty DB. */
export function planPreparation(root: string, baselinePath: string, sourcePath: string): PreparationPlan {
    const witnessBytes=readFileSync(join(root,'release/schema0009-baseline.json'));
    check(sha(witnessBytes)==='133354cd5e6a45f4fc9fb2711386a2b6883da22175cb12fdb654994fa8dd3f2f','reviewed baseline witness changed');
    const witness=JSON.parse(witnessBytes.toString());
    const old = new Database(baselinePath, { readonly: true, fileMustExist: true }), source = new Database(sourcePath, { readonly: true, fileMustExist: true });
    try {
        same(old.prepare(CATALOG_SQL).all(),witness.catalog,'complete baseline schema differs');
        for(const [table,digest] of Object.entries(witness.tables)) same(canonicalTableDigest(old,table),digest,'complete baseline canonical equivalence: '+table);
        same(old.prepare('PRAGMA foreign_key_check').all(),[],'baseline foreign keys');
        same(old.prepare('PRAGMA quick_check').all(),[{quick_check:'ok'}],'baseline physical integrity');
        const metadata = (db: Database.Database) => Object.fromEntries((db.prepare('SELECT key,value FROM theologai_metadata ORDER BY key').all() as {
            key: string;
            value: string;
        }[]).map(r => [r.key, r.value]));
        check(Object.values(metadata(old)).includes('66c148a206b9b0eb1bf7552572570c42dabfd0ba591b63e0cf0d02adda35aa07'), 'wrong populated baseline identity');
        check(Object.values(metadata(source)).includes('ef42dfff4fda29d708f2bd340bbd4463ab4a128408651cea887a97bc28199bb1'), 'wrong successor identity');
        check((old.prepare('SELECT count(*) n FROM morphology').get() as {
            n: number;
        }).n > 400000, 'empty/incomplete baseline');
        const manifest = parseDataManifest(readFileSync(join(root, 'data/data-manifest.json')));
        const migrations = verifyD1Migrations(root, manifest);
        const replay = new Database(':memory:');
        try {
            for (const bytes of migrations.slice(0, 9))
                replay.exec(bytes.toString());
            same(old.prepare(CATALOG_SQL).all(), replay.prepare(CATALOG_SQL).all(), 'local baseline schema differs from first nine source migrations');
        }
        finally {
            replay.close();
        }
        for (const name of Object.keys(manifest.expectedCounts).filter(t => !FTS.includes(t as typeof FTS[number]) && !CORPUS_INSERT_TABLES.includes(t as typeof CORPUS_INSERT_TABLES[number]) && !['theologai_metadata', 'historical_corpus_seal'].includes(t)))
            same(digestLocalDeltaTable(old, name), digestLocalDeltaTable(source, name), `foundation changed: ${name}`);
        const delta = deriveLocalHistoricalAdditions(old, source, CORPUS_INSERT_TABLES);
        check(delta.statements.length === 10134, 'unexpected additive row count');
        const trigger = (source.prepare("SELECT sql FROM sqlite_master WHERE name='historical_edition_hierarchy_node_preorder_insert'").get() as {
            sql: string;
        }).sql;
        const optimized = optimizePreorderTrigger(trigger);
        const operations: Operation[] = [];
        const add = (phase: string, sql: string, readCeiling = 256, writeCeiling = 256) => operations.push({ phase, sql, readCeiling, writeCeiling });
        add('unseal', 'DELETE FROM historical_corpus_seal WHERE seal_id=1;', 8, 8);
        for (const sql of split(readFileSync(join(root, 'migrations/0010_active_aquinas_hierarchy_publication.sql'), 'utf8')))
            add('migration10', sql, 4096, 256);
        add('ledger10', "INSERT INTO d1_migrations(name) VALUES('0010_active_aquinas_hierarchy_publication.sql');", 16, 16);
        add('temporary-trigger', 'DROP TRIGGER historical_edition_hierarchy_node_preorder_insert;', 4096, 32);
        add('temporary-trigger', optimized, 4096, 32);
        const terminalSql = delta.statements.filter(op => op.table === 'historical_edition_hierarchy_nodes').at(-1)!.sql;
        for (const op of delta.statements)
            add('additions:' + op.table, op.sql, op.sql === terminalSql ? 30000 : 256, 256);
        for (const [index, table] of FTS.slice(1).entries())
            add('rebuild:' + table, `INSERT INTO ${table}(${table}) VALUES('rebuild');`, 30000, [25852, 17285, 12401][index]);
        for (const table of FTS)
            add('integrity:' + table, `INSERT INTO ${table}(${table},rank) VALUES('integrity-check',1);`, 1024, 1025);
        add('restore-trigger', 'DROP TRIGGER historical_edition_hierarchy_node_preorder_insert;', 4096, 32);
        add('restore-trigger', trigger, 4096, 32);
        for (const [key, value] of Object.entries(metadata(source)))
            add('identity', `UPDATE theologai_metadata SET value=${literal(value)} WHERE key=${literal(key)};`, 8, 8);
        const seal = source.prepare('SELECT * FROM historical_corpus_seal').get() as Row;
        add('seal', `INSERT INTO historical_corpus_seal(${Object.keys(seal).map(id).join(',')}) VALUES(${Object.values(seal).map(literal).join(',')});`, 256, 32);
        const readbacks: ExactInsertRows[] = [];
        for (const table of CORPUS_INSERT_TABLES) {
            const info = source.prepare(`PRAGMA table_info(${id(table)})`).all() as {
                name: string;
                pk: number;
            }[];
            const columns = info.map(c => c.name), keys = info.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
            const lookup = old.prepare(`SELECT 1 FROM ${id(table)} WHERE ${keys.map(k => `${id(k)} IS ?`).join(' AND ')}`);
            const rows = (source.prepare(`SELECT * FROM ${id(table)} ORDER BY ${keys.map(id).join(',')}`).all() as Row[]).filter(r => !lookup.get(...keys.map(k => r[k])));
            for (let offset = 0; offset < rows.length;) {
                let n = Math.min(25, rows.length - offset);
                while (Buffer.byteLength(JSON.stringify(rows.slice(offset, offset + n))) > 900000 && n > 1)
                    n = Math.floor(n / 2);
                readbacks.push({ table, columns, keys, rows: rows.slice(offset, offset + n) });
                offset += n;
            }
        }
        const batched: Operation[] = [];
        let pending: Operation[] = [];
        const flush = () => { if (pending.length) {
            batched.push({ phase: pending[0].phase, sql: pending.map(op => op.sql.trim().replace(/;?$/, ';')).join('\n'), readCeiling: pending.reduce((n, op) => n + op.readCeiling, 0), writeCeiling: pending.reduce((n, op) => n + op.writeCeiling, 0) });
            pending = [];
        } };
        for (const op of operations) {
            if (pending.length && (pending[0].phase !== op.phase || pending.length >= 25 || Buffer.byteLength(pending.map(p => p.sql).join('\n') + '\n' + op.sql) > 90000))
                flush();
            pending.push(op);
        }
        flush();
        const body = { schemaVersion: 'norton-aquinas-preparation.v1' as const, target: TARGETS.production, baselineWitnessSha256: sha(witnessBytes), baselineSha256: sha(readFileSync(baselinePath)), sourceSha256: sha(readFileSync(sourcePath)), operations: batched, readbacks };
        return { ...body, sha256: hash(body) };
    }
    finally {
        old.close();
        source.close();
    }
}
export interface JournalEntry {index:number;sqlSha256:string;state:'intent'|'complete';readCeiling?:number;writeCeiling?:number;result?:{rowsRead:number;rowsWritten:number;responseSha256:string};}
export interface PreparationSession extends ProofReader {dependencies:{databaseId:string};requests:number;reads:number;writes:number;}
export function assertDefinitiveJournal(entries:JournalEntry[]){check(entries.length%2===0,'unmatched intent');for(let i=0;i<entries.length;i+=2){const a=entries[i],b=entries[i+1];check(a.state==='intent' && b.state==='complete' && a.index===i/2 && b.index===a.index && a.sqlSha256===b.sqlSha256 && b.result,'unknown or mismatched journal');}}
async function applyPreparationPlan(plan: PreparationPlan, session: PreparationSession, source: Database.Database, completed: JournalEntry[] = []) {
    check(session.dependencies.databaseId === TARGETS.production.id, 'preparation session target mismatch');
    assertDefinitiveJournal(completed);
    check(completed.length===0,'recovery requires a separately reviewed operation; never replay automatically');
    const sourcePath = (source.pragma('database_list') as {
        name: string;
        file: string;
    }[]).find(row => row.name === 'main')?.file;
    check(sourcePath && sha(readFileSync(sourcePath)) === plan.sourceSha256, 'preparation source bytes changed');
    const { sha256, ...body } = plan;
    same(hash(body), sha256, 'preparation plan changed');
    same(plan.target, TARGETS.production, 'preparation target differs');
    check(completed.length / 2 <= plan.operations.length, 'resume contains non-preparation operations');
    for (let i = 0; i < completed.length; i += 2)
        same(completed[i].sqlSha256, sha(plan.operations[i / 2].sql), 'resume journal is not the exact plan prefix');
    for (const op of plan.operations.slice(completed.length / 2))
        await session.query(op.sql, op.readCeiling, op.writeCeiling);
    const readbacks = [];
    for (const proof of plan.readbacks)
        readbacks.push(await verifyExactInsertRows(session, source, proof));
    return { planSha256: plan.sha256, readbacksSha256: hash(readbacks), rowsRead: session.reads, rowsWritten: session.writes };
}

export interface PreparationMeter {rows:Row[];rowsRead:number;rowsWritten:number;}
export interface PreparationUsage {windowStart:string;observedAt:string;rowsRead:number;rowsWritten:number;}
export type PreparationExecutor=((sql:string)=>Promise<PreparationMeter>) & {databaseId?:string};
/** Existing single-operation admission/journal model, fixed to the unbound production candidate. */
export class PreparedCorpusSession implements PreparationSession {
 halted=false;reads=0;writes=0;requests=0;private busy=false;private anchor:PreparationUsage|null=null;
 constructor(readonly dependencies:{databaseId:string;execute:PreparationExecutor;usage:()=>Promise<PreparationUsage>;guard:()=>Promise<void>;append:(entry:JournalEntry)=>Promise<void>},readonly now=()=>Date.now()){
  check(dependencies.databaseId===TARGETS.production.id && (dependencies.execute.databaseId===undefined || dependencies.execute.databaseId===dependencies.databaseId),'preparation executor/session target');
 }
 async query(sql:string,readCeiling:number,writeCeiling=0):Promise<PreparationMeter>{
  check(!this.busy&&!this.halted,'halted/concurrent preparation; reconcile original journal');this.busy=true;
  try{
   check([readCeiling,writeCeiling].every(n=>Number.isSafeInteger(n)&&n>=0),'operation ceiling');await this.dependencies.guard();const usage=await this.dependencies.usage();
   check(usage.windowStart===new Date(this.now()).toISOString().slice(0,10)+'T00:00:00.000Z' && Date.parse(usage.observedAt)<=this.now() && this.now()-Date.parse(usage.observedAt)<=50000 && [usage.rowsRead,usage.rowsWritten].every(n=>Number.isSafeInteger(n)&&n>=0),'fresh unsampled usage required');
   if(!this.anchor)this.anchor={...usage};check(this.anchor.windowStart===usage.windowStart,'new UTC day needs separately reviewed recovery');
   check(Math.max(usage.rowsRead,this.anchor.rowsRead+this.reads)+readCeiling+200000<=4000000 && Math.max(usage.rowsWritten,this.anchor.rowsWritten+this.writes)+writeCeiling<=80000 && this.reads+readCeiling<=250000 && this.writes+writeCeiling<=115000,'preparation operation not admitted');
   const index=this.requests,sqlSha256=sha(sql);this.halted=true;
   await this.dependencies.append({index,sqlSha256,state:'intent',readCeiling,writeCeiling} as JournalEntry);
   const result=await this.dependencies.execute(sql);check(result&&Array.isArray(result.rows)&&[result.rowsRead,result.rowsWritten].every(n=>Number.isSafeInteger(n)&&n>=0),'unknown preparation outcome');
   this.reads+=result.rowsRead;this.writes+=result.rowsWritten;this.requests++;
   check(result.rowsRead<=readCeiling&&result.rowsWritten<=writeCeiling,'actual preparation exceeds reserved operation ceiling');
   await this.dependencies.append({index,sqlSha256,state:'complete',result:{rowsRead:result.rowsRead,rowsWritten:result.rowsWritten,responseSha256:hash(result.rows)}});
   this.halted=false;return result;
  }finally{this.busy=false;}
 }
}
/** Fixed-target batch adapter. Caller supplies the existing approved API; never discovers credentials or retries. */
export function createPreparationExecutor(authorizedFetch:typeof fetch):PreparationExecutor{
 return Object.assign(async(sql:string)=>{
  const statements=split(sql);check(Buffer.byteLength(sql)<=100000&&statements.length>0&&statements.length<=25,'bounded preparation statement batch');
  try{
   const response=await authorizedFetch(`https://api.cloudflare.com/client/v4/accounts/${POLICY.account}/d1/database/${TARGETS.production.id}/query`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json'},body:JSON.stringify({sql,params:[]})});
   check(response.status===200&&!response.redirected&&response.body,'unknown preparation response');
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
   try{for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;check(bytes<=1048576,'preparation response bound');chunks.push(item.value);}}finally{await reader.cancel().catch(()=>{});}
   const value=JSON.parse(Buffer.concat(chunks).toString());check(value.success===true&&Array.isArray(value.errors)&&value.errors.length===0&&Array.isArray(value.result)&&value.result.length===statements.length,'incomplete preparation result');
   for(const r of value.result)check(r.success===true&&Array.isArray(r.results)&&r.meta&&[r.meta.rows_read,r.meta.rows_written].every(n=>Number.isSafeInteger(n)&&n>=0)&&r.meta.total_attempts===1&&r.meta.served_by_primary===true,'unknown or retried preparation statement');
   return {rows:value.result.flatMap((r:any)=>r.results),rowsRead:value.result.reduce((n:number,r:any)=>n+r.meta.rows_read,0),rowsWritten:value.result.reduce((n:number,r:any)=>n+r.meta.rows_written,0)};
  }catch{throw Error('Corpus preparation outcome failed or unknown; preserve journal and stop, no retry');}
 },{databaseId:TARGETS.production.id});
}

/** Standalone application starts fresh; the combined entrypoint below keeps all preflight counters. */
export async function applyPreparation(plan:PreparationPlan,session:PreparationSession,source:Database.Database,completed:JournalEntry[]=[]){
 check(!session.requests&&!session.reads&&!session.writes,'preparation requires its own fresh session');return applyPreparationPlan(plan,session,source,completed);
}
export async function checkPreparationBaseline(session:PreparationSession,baseline:Database.Database,expectedLedgerSha256:string,root=process.cwd()){
 check(session.dependencies.databaseId===TARGETS.production.id,'preparation preflight target');check(/^[a-f0-9]{64}$/.test(expectedLedgerSha256),'reviewed original nine-row ledger witness required');
 const catalog=(await session.query(CATALOG_SQL,4096)).rows;
 same(catalog.filter(r=>!['_cf_KV','d1_migrations'].includes(String(r.name))),baseline.prepare(CATALOG_SQL).all(),'target is not the complete baseline schema');
 same(catalog.filter(r=>['_cf_KV','d1_migrations'].includes(String(r.name))),PROVIDER_CATALOG,'exact provider schema before preparation');
 const ledger=(await session.query('SELECT id,name,applied_at FROM d1_migrations ORDER BY id LIMIT 11;',32)).rows;
 const manifest=parseDataManifest(readFileSync(join(root,'data/data-manifest.json')));
 const names=manifest.materializations.d1.migrations.slice(0,9).map(m=>m.path.split('/').at(-1));
 check(ledger.length===9 && ledger.every((r,i)=>r.id===i+1&&r.name===names[i]&&typeof r.applied_at==='string'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(r.applied_at)),'original baseline ledger shape');
 check(sha(JSON.stringify(ledger))===expectedLedgerSha256,'original baseline ledger timestamps changed');
 for(const sql of ['SELECT key,value FROM theologai_metadata ORDER BY key;','SELECT * FROM historical_corpus_seal;'])same((await session.query(sql,16)).rows,baseline.prepare(sql).all(),'baseline identity/seal changed');
 return {catalogSha256:hash(catalog),originalLedgerSha256:expectedLedgerSha256};
}
export async function prepareAndReadBackCandidate(plan:PreparationPlan,session:PreparationSession,baseline:Database.Database,source:Database.Database,expectedLedgerSha256:string){
 check(!session.requests&&!session.reads&&!session.writes,'fresh bounded preparation operation required');
 const preflight=await checkPreparationBaseline(session,baseline,expectedLedgerSha256);
 const result=await applyPreparationPlan(plan,session,source);
 return {...result,preflight,requests:session.requests};
}
