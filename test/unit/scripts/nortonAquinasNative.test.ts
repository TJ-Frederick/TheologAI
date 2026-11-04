import {beforeAll,afterAll,it,expect} from 'vitest';
import {mkdtempSync,copyFileSync,readFileSync,writeFileSync,appendFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import {Native,split} from '../../helpers/corpusNative.js';
import {planPreparation,prepareAndReadBackCandidate,PreparedCorpusSession,createPreparationExecutor,assertDefinitiveJournal,type JournalEntry,type PreparationSession} from '../../../scripts/norton-aquinas-preparation.js';
import {POLICY,TARGETS,verifyFreshCorpusReceipt} from '../../../scripts/norton-aquinas-release-policy.mjs';
import {buildCorpusProofSource,proveCompleteCorpus,PROVIDER_CATALOG,LEDGER_SQL,type CorpusProofSource,type ProofQuery} from '../../../scripts/corpus-source-proof.js';
import {composeReadProof,verifyOperatorEnvelope} from '../../../scripts/operator-corpus-proof.js';
const baseline=process.env.THEOLOGAI_CORPUS_BASELINE;
const sourcePath=process.env.THEOLOGAI_TEST_DATABASE_PATH || 'data/theologai.db';
const enabled=!!baseline && existsSync(sourcePath);
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
let directory:string,native:Native,source:Database.Database,expected:CorpusProofSource,preparation:any,plan:ReturnType<typeof planPreparation>;
beforeAll(async()=>{
 if(!enabled)return;
 directory=mkdtempSync(join(tmpdir(),'corpus-successor-native-'));native=new Native(join(directory,'native'));
 const targetPath=join(directory,'baseline.db');copyFileSync(baseline!,targetPath);
 const target=new Database(targetPath);for(const object of PROVIDER_CATALOG)target.exec(String(object.sql));
 const manifest=JSON.parse(readFileSync('data/data-manifest.json','utf8'));
 manifest.materializations.d1.migrations.slice(0,9).forEach((m:any,i:number)=>target.prepare('INSERT INTO d1_migrations(id,name,applied_at) VALUES(?,?,?)').run(i+1,m.path.split('/').at(-1),'2026-11-03 00:00:00'));
 target.close();await native.load(targetPath);
 plan=planPreparation(process.cwd(),baseline!,sourcePath);source=new Database(sourcePath,{readonly:true});
 const journal:JournalEntry[]=[];
 const executor=createPreparationExecutor((async(url,init)=>{
  expect(String(url)).toContain(TARGETS.production.databaseId);expect(init?.redirect).toBe('error');
  const body=JSON.parse(String(init?.body));expect(body.params).toEqual([]);const results=await native.many(split(body.sql));
  return Response.json({success:true,errors:[],result:results.map(r=>({success:!r.error,results:r.rows,meta:{rows_read:r.rowsRead,rows_written:r.rowsWritten,total_attempts:1,served_by_primary:true}}))});
 }) as typeof fetch);
 const session=new PreparedCorpusSession({databaseId:TARGETS.production.databaseId,execute:executor,usage:async()=>({windowStart:new Date().toISOString().slice(0,10)+'T00:00:00.000Z',observedAt:new Date().toISOString(),rowsRead:0,rowsWritten:0}),guard:async()=>{},append:async entry=>{journal.push(entry);appendFileSync(join(directory,'preparation.events.jsonl'),JSON.stringify(entry)+'\n',{mode:0o600,flush:true});}});
 const expectedLedger=manifest.materializations.d1.migrations.slice(0,9).map((m:any,i:number)=>({id:i+1,name:m.path.split('/').at(-1),applied_at:'2026-11-03 00:00:00'}));
 const baselineDb=new Database(baseline!,{readonly:true});try{preparation=await prepareAndReadBackCandidate(plan,session,baselineDb,source,sha(JSON.stringify(expectedLedger)));}finally{baselineDb.close();}
 assertDefinitiveJournal(journal);expect(session.requests).toBe(882);
 writeFileSync(join(directory,'preparation-journal.json'),JSON.stringify(journal),{mode:0o600});
 if(process.env.THEOLOGAI_CORPUS_LOCAL_RESULT)writeFileSync(process.env.THEOLOGAI_CORPUS_LOCAL_RESULT+'.preparation-journal.json',JSON.stringify(journal),{mode:0o600});
 const proofPath=join(directory,'source.db');copyFileSync(sourcePath,proofPath);const local=new Database(proofPath);expected=buildCorpusProofSource(process.cwd(),local);local.close();
},120000);
afterAll(async()=>{source?.close();await native?.close();if(directory)rmSync(directory,{recursive:true,force:true});});
it.skipIf(!enabled)('prepares from complete baseline equivalence, restores exact schema/FTS and verifies every indexed readback',async()=>{
 expect(plan.baselineWitnessSha256).toBe('133354cd5e6a45f4fc9fb2711386a2b6883da22175cb12fdb654994fa8dd3f2f');expect(plan.operations).toHaveLength(464);expect(plan.readbacks).toHaveLength(414);
 expect(preparation.rowsRead).toBeLessThanOrEqual(250000);expect(preparation.rowsWritten).toBeLessThanOrEqual(80000);
 const q=await native.exec("SELECT sql FROM sqlite_master WHERE name='historical_edition_hierarchy_node_preorder_insert'");expect(q.rows).toEqual(source.prepare("SELECT sql FROM sqlite_master WHERE name='historical_edition_hierarchy_node_preorder_insert'").all());
});
it.skipIf(!enabled)('rejects a same-count changed baseline cell before any preparation operation',()=>{const altered=join(directory,'altered-baseline.db');copyFileSync(baseline!,altered);const db=new Database(altered);db.exec("UPDATE morphology SET word_text='changed-baseline-cell' WHERE rowid=(SELECT min(rowid) FROM morphology)");db.close();expect(()=>planPreparation(process.cwd(),altered,sourcePath)).toThrow('complete baseline canonical equivalence');});
it.skipIf(!enabled)('executes all complete source reads through the actual operator composition and strict receipt consumer',async()=>{
 const metering={rowsRead:0,rowsWritten:0,requests:0,retries:0,unknownAttempts:0,integrityCommands:0};const results=[];
 for(const table of ['strongs_fts','sections_fts','historical_edition_sections_fts','historical_edition_hierarchy_bodies_fts']){const sql=`INSERT INTO "${table}"("${table}",rank) VALUES('integrity-check',1)`;const r=await native.exec(sql);results.push({label:'fts:'+table,sqlSha256:sha(sql),rowsRead:r.rowsRead,rowsWritten:r.rowsWritten});metering.rowsRead+=r.rowsRead;metering.rowsWritten+=r.rowsWritten;metering.requests++;metering.integrityCommands++;}
 const controls=[{kind:'local-native-proof',databaseId:TARGETS.preview.databaseId}],integrity={receipt:{metering,controls,results}};
 const readerMeter={rowsRead:0,rowsWritten:0,requests:0,retries:0,unknownAttempts:0,integrityCommands:0};
 const reader={metering:readerMeter,start:async()=>{},protectedAdmission:()=>({controls} as any),execute:async(q:ProofQuery)=>{expect(q.kind).not.toBe('fts-integrity');const r=await native.exec(q.sql);expect(r.rowsRead).toBeLessThanOrEqual(q.readCeiling);expect(r.rowsWritten).toBe(0);readerMeter.rowsRead+=r.rowsRead;readerMeter.requests++;return r.rows;},finish:async()=>({controls,controlsUnchanged:true as const})};
 const transport=composeReadProof(reader,integrity,()=>{},controls);await transport.start();
 const ledger=(await native.exec(LEDGER_SQL)).rows;const proof=await proveCompleteCorpus(source,expected,q=>transport.execute(q),sha(JSON.stringify(ledger)));const checked=await transport.finish();
 const now=Date.now(),receipt={schemaVersion:'theologai-fresh-complete-corpus-proof.v1',releasePolicy:POLICY.policy,liveControlReserve:100000,role:'preview',accountId:POLICY.account,...TARGETS.preview,sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),corpusIdentity:POLICY.corpus,schema:POLICY.schema,startedAt:new Date(now-1000).toISOString(),completedAt:new Date(now).toISOString(),sourcePlanSha256:'c'.repeat(64),approvalSha256:'d'.repeat(64),operationalAssumption:'owner_reserves_target_data_writes_during_proof_not_an_enforced_provider_lease',proof,...checked,readBudget:3560000,metering:transport.metering};
 verifyFreshCorpusReceipt(receipt,{role:'preview',sourceCommit:receipt.sourceCommit,sourceTree:receipt.sourceTree,sourcePlanSha256:receipt.sourcePlanSha256,tables:expected.digests,foreignKeyWitnessSha256:expected.foreignKeyWitnessSha256});
 expect(Object.keys(proof.tables)).toHaveLength(39);expect(proof.sourceRows).toBe(1635226);expect(transport.metering.integrityCommands).toBe(4);expect(transport.metering.rowsWritten).toBe(4);
 const record={localOnly:true,preparation,proof:transport.metering,operations:plan.operations.length,readbacks:plan.readbacks.length,baselineWitnessSha256:plan.baselineWitnessSha256};
 if(process.env.THEOLOGAI_CORPUS_LOCAL_RESULT)writeFileSync(process.env.THEOLOGAI_CORPUS_LOCAL_RESULT,JSON.stringify(record,null,2)+'\n',{mode:0o600});
},180000);
