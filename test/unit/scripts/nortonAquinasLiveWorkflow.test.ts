import{it,expect,vi}from'vitest';
import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,appendFileSync,chmodSync}from'node:fs';
import{join}from'node:path';
import{execFileSync}from'node:child_process';
import{tmpdir}from'node:os';
import{createHash}from'node:crypto';
import{selectReleaseProofPolicy}from'../../../.github/scripts/release-proof-policy.mjs';
import{createOperatorChallenge}from'../../../scripts/operator-corpus-proof.js';
import{POLICY,TARGETS}from'../../../scripts/norton-aquinas-release-policy.mjs';
import{corpusTransportFixture}from'../../helpers/corpusTransportFixture.js';
const audit=vi.hoisted(()=>vi.fn());
vi.mock('../../../scripts/audit-corpus-release.js',()=>({auditCorpusRelease:audit}));
import{runCorpusLive}from'../../../scripts/norton-aquinas-live.js';
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'corpus-live-wrapper-')),sourceDirectory=join(directory,'source');mkdirSync(sourceDirectory);
 const {classification}=selectReleaseProofPolicy(process.cwd()),now=Date.now(),hash='a'.repeat(64);
 const tables=Object.fromEntries(Array.from({length:39},(_,i)=>['table'+i,{rows:1,sha256:hash}]));
 writeFileSync(join(sourceDirectory,'source.db'),'synthetic database bytes; audit boundary mocked');
 const plan={schemaVersion:'theologai-application-corpus-source-plan.v1',releasePolicy:POLICY.policy,classification,sourceSha256:sha(readFileSync(join(sourceDirectory,'source.db'))),expected:{digests:tables,foreignKeyWitnessSha256:hash},readBudget:3560000,integrityCommands:4};const text=JSON.stringify(plan),digest=sha(text);writeFileSync(join(sourceDirectory,'plan.json'),text);
 const grant={schemaVersion:'theologai-operator-authorization.v1',scope:'new-additional-operation',exclusiveDataWritesDuringWindow:true,candidateWriteJobsPaused:true,releasePolicy:POLICY.policy,liveControlReserve:100000,expectedLedgerSha256:hash,repository:'TJ-Frederick/TheologAI',ownerActorId:40179660,role:'preview',pullRequestNumber:176,headBranch:'codex/norton-aquinas-successor',sourceCommit:classification.sourceCommit,sourceTree:classification.sourceTree,baseCommit:POLICY.baseline,sourcePlanSha256:digest,targetRunId:'12345',targetRunAttempt:1,authorizationId:'operation-live-wrapper-fixture',ledgerId:'operation-live-wrapper-fixture',notBefore:new Date(now-1000).toISOString(),expiresAt:new Date(now+7200000).toISOString(),reservedReads:3560000,hardReadCap:3560000,diagnosticCommands:4,maxWrites:4,previousReadsSpentOrReserved:0,previousWritesSpentOrReserved:0,previousDiagnosticCommands:0,outstandingPriorReservationsAccepted:true};
 const authorization={authorization:grant,provenance:{runId:'456',artifactId:'789',digest:'sha256:'+hash,contentSha256:sha(JSON.stringify(grant))}};
 const c=createOperatorChallenge('preview',classification,digest,{GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:grant.repository,GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'12345',GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/pull/176/merge',OPERATOR_BASE_COMMIT:POLICY.baseline},now,{accountId:POLICY.account,role:'preview',day:new Date(now).toISOString().slice(0,10),observedAt:new Date(now).toISOString(),inventoryObservedAt:new Date(now).toISOString(),liveControlReserve:100000,rowsRead:100,rowsWritten:0,sampleInterval:1,readBudget:3560000,controls:[]},authorization);
 const receipt={schemaVersion:'theologai-fresh-complete-corpus-proof.v1',releasePolicy:POLICY.policy,liveControlReserve:100000,role:'preview',accountId:POLICY.account,...TARGETS.preview,sourceCommit:classification.sourceCommit,sourceTree:classification.sourceTree,corpusIdentity:POLICY.corpus,schema:POLICY.schema,sourcePlanSha256:digest,approvalSha256:hash,startedAt:new Date(now-1000).toISOString(),completedAt:new Date(now).toISOString(),readBudget:3560000,metering:{rowsRead:3332195,rowsWritten:4,requests:3337,integrityCommands:4,retries:0,unknownAttempts:0},controlsUnchanged:true,operationalAssumption:'owner_reserves_target_data_writes_during_proof_not_an_enforced_provider_lease',proof:{method:'fresh_complete_cells_physical_and_rank1_fts.v1',quickCheck:'ok',ftsIntegrity:['strongs_fts','sections_fts','historical_edition_sections_fts','historical_edition_hierarchy_bodies_fts'],tables,sourceRows:39,catalogSha256:hash,ledgerSha256:hash,foreignKeys:{method:'local_clean_raw_schema_plus_all_child_parent_cells',witnessSha256:hash}}};
 let calls=0;const provider=corpusTransportFixture({role:'preview',activated:true,record:()=>{calls++;},query:()=>{throw Error('SQL forbidden');}});
 const files={challengeFile:join(directory,'challenge.json'),receiptFile:join(directory,'receipt.json'),cutoverFile:join(directory,'cutover.json')};writeFileSync(files.challengeFile,JSON.stringify(c));writeFileSync(files.receiptFile,JSON.stringify(receipt));writeFileSync(files.cutoverFile,JSON.stringify({candidateBindingMatches:true,candidateD1:TARGETS.preview,observedActiveDeploymentId:provider.deployments.preview,observedActiveVersionId:provider.versions.preview}));
 return {directory,calls:()=>calls,input:{role:'preview' as const,sourceDirectory,planSha256:digest,...files,outputDirectory:directory,token:'synthetic-token',fetch:provider.fetch},hash};
}
it('runs the actual live orchestration through controls, audit and completion with single journal ownership',async()=>{
 const f=fixture();audit.mockImplementationOnce(async(options:any)=>{options.guard();return{endpoint:options.endpoint,productProfile:'7',serverVersion:'3.6.0-preview',protocols:['2025-11-25','2026-07-28'],fingerprints:[0,1].map(()=>Object.fromEntries(['capabilities','tools','prompts','resourceTemplates','staticResources'].map(key=>[key,f.hash]))),checks:[{id:'language:fixture',result:'passed'}]};});
 try{
  await runCorpusLive(f.input);expect(audit).toHaveBeenCalledOnce();expect(f.calls()).toBeGreaterThan(4);expect(existsSync(join(f.directory,'corpus-live.json'))).toBe(true);
  const events=readFileSync(join(f.directory,'corpus-live.json.events.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));expect(events.map(e=>e.kind)).toEqual(expect.arrayContaining(['live-admitted','live-intent','live-complete']));
  const count=f.calls();await expect(runCorpusLive(f.input)).rejects.toThrow('EEXIST');expect(f.calls()).toBe(count);expect(audit).toHaveBeenCalledOnce();
 }finally{audit.mockReset();rmSync(f.directory,{recursive:true,force:true});}
},30000);
it('refuses a pre-existing journal before any provider or audit call',async()=>{
 const f=fixture();writeFileSync(join(f.directory,'corpus-live.json.events.jsonl'),'preserved intent\n');try{await expect(runCorpusLive(f.input)).rejects.toThrow('EEXIST');expect(f.calls()).toBe(0);expect(audit).not.toHaveBeenCalled();expect(readFileSync(join(f.directory,'corpus-live.json.events.jsonl'),'utf8')).toBe('preserved intent\n');}finally{rmSync(f.directory,{recursive:true,force:true});}
});

// The continuation has its own explicit authority; the old fresh-proof wrapper stays unchanged.
const continuationEdge=vi.hoisted(()=>vi.fn());
vi.mock('../../../scripts/audit-primary-source-edge-stabilization.js',()=>({runPrimarySourceEdgeStabilization:continuationEdge}));
import Database from 'better-sqlite3';
import {EXISTING,NATIVE_ARTIFACTS,CONTINUITY_QUERIES,requireExistingApproval,requireExistingDispatch,requireRuntimeEquivalence,validateExistingPreview,type ExistingApproval} from '../../../.github/scripts/validate-existing-norton-preview.js';
import {describe} from 'vitest';

function existingFixture(fault=''){
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-05T05:00:00Z'));
 const directory=mkdtempSync(join(tmpdir(),'existing-preview-local-')),sourceDirectory=join(directory,'source'),output=join(directory,'output');mkdirSync(sourceDirectory);mkdirSync(output);
 const database=new Database(join(sourceDirectory,'source.db'));
 database.exec("CREATE TABLE theologai_metadata(key TEXT PRIMARY KEY,value TEXT);INSERT INTO theologai_metadata VALUES('corpus','fixture'),('schema','0010');CREATE TABLE historical_corpus_seal(seal_id INTEGER PRIMARY KEY,value TEXT);INSERT INTO historical_corpus_seal VALUES(1,'sealed');CREATE TABLE d1_migrations(id INTEGER,name TEXT,applied_at TEXT);");
 for(let i=1;i<=10;i++)database.prepare('INSERT INTO d1_migrations VALUES(?,?,?)').run(i,'migration'+i,'2026-10-29 00:00:00');
 const expected=(sql:string)=>database.prepare(sql).all();
 const view={id:EXISTING.worker,number:1,resources:{bindings:[{type:'d1',name:'THEOLOGAI_DB',id:EXISTING.database}]}};
 const source={commit:'a'.repeat(40),tree:'b'.repeat(40)};
 const approval:ExistingApproval={schemaVersion:'norton-existing-preview-validation-approval.v1',operationId:'operation-existing-fixture',auditorCommit:source.commit,auditorTree:source.tree,expiresAt:new Date(Date.now()+1800000).toISOString(),confirmation:EXISTING.confirmation,historicalProofSha256:EXISTING.proofSha256,acceptHistoricalProofForValidationOnly:true,uninterruptedDataCustody:true,maxReads:100000,maxWrites:0,noDeployment:true};
 const evidence:any={historicalVerificationAt:'2026-11-05T02:45:14.748Z',freshProof:false,cutover:{observedActiveVersionViewSha256:sha(JSON.stringify(view,null,2)+'\n')},envelope:{receipt:{proof:{catalogSha256:sha(JSON.stringify(expected(CONTINUITY_QUERIES[0].sql))),ledgerSha256:sha(JSON.stringify(expected(CONTINUITY_QUERIES[1].sql)))}}}};
 let calls=0,queries=0,authorizations=0;
 const provider=corpusTransportFixture({role:'preview',activated:true,advance:()=>vi.setSystemTime(Date.now()+1000),record:()=>{calls++;},query:sql=>{
  queries++;const rows=expected(sql) as any[];
  if(fault==='schema'&&sql===CONTINUITY_QUERIES[0].sql)rows.pop();
  if((fault==='ledger'||fault==='post-ledger'&&queries>4)&&sql===CONTINUITY_QUERIES[1].sql)rows[0].applied_at='changed';
  if(fault==='seal'&&sql===CONTINUITY_QUERIES[3].sql)rows[0].value='unsealed';
  if(fault==='identity'&&sql===CONTINUITY_QUERIES[2].sql)rows[0].value='wrong';
  return {rows,rowsRead:fault==='read-overrun'?4097:rows.length,rowsWritten:fault==='write'?1:0};
 }});
 const fetchImpl=(async(input:any,init:any)=>{
  const response=await provider.fetch(input,init);let body=JSON.stringify(await response.json());
  for(const [a,b] of [[provider.versions.preview,EXISTING.worker],[provider.versions.production,EXISTING.productionWorker],[provider.deployments.preview,EXISTING.deployment],[provider.deployments.production,EXISTING.productionDeployment]])body=body.replaceAll(a,b);
  const value=JSON.parse(body),path=new URL(String(input)).pathname;
  if(path.endsWith('/graphql')){const g=value.data.viewer.accounts[0].databases[0];if(fault==='quota')g.sum.rowsRead=3700001;if(fault==='sampled')g.avg.sampleInterval=2;if(fault==='extra-writer')g.sum.rowsWritten=8;}
  if(fault==='wrong-assignment'&&path.endsWith('/settings'))value.result.bindings[0].id='74f456e2-6951-4003-bb6f-91951342bf8f';
  if(fault==='unknown'&&path.endsWith('/query'))value.result[0].meta.total_attempts=2;
  return Response.json(value);
 }) as typeof fetch;
 const revalidate=async()=>{authorizations++;if(fault==='revoked'&&authorizations===2)throw Error('revoked');return {runId:'9',operationId:approval.operationId};};
 const live=()=>({protocols:['2025-11-25','2026-07-28'],checks:Array.from({length:fault==='missing-check'?369:370},(_,i)=>({id:'check'+i,passed:!(fault==='failed-check'&&i===0)})),fingerprints:[],summaries:[],fixtureSha256:'f'.repeat(64)});
 continuationEdge.mockResolvedValue({passed:fault!=='edge'});audit.mockImplementationOnce(async(options:any)=>{options.guard();if(fault==='audit')throw Error('audit failed');return live();});
 return {approval,source,output,calls:()=>calls,queries:()=>queries,run:()=>validateExistingPreview({approval,source,equivalence:{candidateSourceCommit:EXISTING.sourceCommit,auditorCommit:source.commit,auditorTree:source.tree,workerSha256:EXISTING.workerSha256},evidence,directory,output,token:'synthetic-only',revalidate,fetch:fetchImpl}),cleanup:()=>{database.close();rmSync(directory,{recursive:true,force:true});vi.useRealTimers();audit.mockReset();continuationEdge.mockReset();}};
}

describe('existing-candidate continuation',()=>{
 it('completes read-only validation with separate candidate, historical proof and auditor identities',async()=>{
  const f=existingFixture();try{const receipt=await f.run();expect(receipt).toMatchObject({purpose:'postdeployment-preview-validation-only',candidate:{sourceCommit:EXISTING.sourceCommit,worker:EXISTING.worker,database:EXISTING.database},auditor:f.source,historicalProof:{freshProof:false,completedAt:'2026-11-05T02:45:14.748Z'},checks:370,metering:{rowsWritten:0,newTotalReadsReserved:100000,knownPriorReads:3330761,heldPriorDiagnosticWrites:8}});expect(f.queries()).toBe(8);expect(receipt.metering.controlRequests).toBe(24);expect(audit).toHaveBeenCalledOnce();expect(existsSync(join(f.output,'continuation-receipt.json'))).toBe(true);}finally{f.cleanup();}
 });
 it.each(['quota','sampled','extra-writer','wrong-assignment','schema','ledger','identity','seal','unknown','write','read-overrun','revoked','edge','audit','missing-check','failed-check','post-ledger'])('stops on %s without another SQL/audit attempt or any deployment',async fault=>{
  const f=existingFixture(fault);try{await expect(f.run()).rejects.toThrow();expect(existsSync(join(f.output,'continuation-receipt.json'))).toBe(false);expect(audit.mock.calls.length).toBeLessThanOrEqual(1);expect(f.queries()).toBeLessThanOrEqual(8);const journal=readFileSync(join(f.output,'continuation.events.jsonl'),'utf8');expect(journal).toContain('"retainWholeReadReservation":100000');if(['missing-check','failed-check'].includes(fault)){const report=JSON.parse(readFileSync(join(f.output,'corpus-live.json'),'utf8'));expect(report.checks.length).toBe(fault==='missing-check'?369:370);if(fault==='failed-check')expect(report.checks[0].passed).toBe(false);}if(fault==='unknown')expect(f.queries()).toBe(1);if(['quota','sampled','extra-writer','wrong-assignment'].includes(fault))expect(f.queries()).toBe(0);}finally{f.cleanup();}
 });
 it('retains a returned failure report even when STOP cannot append to the journal',async()=>{
  const f=existingFixture('missing-check'),stderr=vi.spyOn(process.stderr,'write').mockReturnValue(true);
  audit.mockReset();audit.mockImplementationOnce(async()=>{chmodSync(join(f.output,'continuation.events.jsonl'),0o400);return {protocols:['2025-11-25','2026-07-28'],checks:[]};});
  try{await expect(f.run()).rejects.toThrow('preserve full reservation');expect(JSON.parse(readFileSync(join(f.output,'corpus-live.json'),'utf8')).checks).toEqual([]);expect(existsSync(join(f.output,'continuation-receipt.json'))).toBe(false);expect(stderr.mock.calls.some(c=>String(c[0]).includes('journal unavailable'))).toBe(true);}finally{stderr.mockRestore();f.cleanup();}
 });
 it('refuses an existing journal before any provider request',async()=>{
  const f=existingFixture();try{writeFileSync(join(f.output,'continuation.events.jsonl'),'preserved');await expect(f.run()).rejects.toThrow('EEXIST');expect(f.calls()).toBe(0);expect(readFileSync(join(f.output,'continuation.events.jsonl'),'utf8')).toBe('preserved');}finally{f.cleanup();}
 });
 it.each(['custody','fresh-authority','writes','budget','expired','new-day','auditor'])('requires explicit bounded %s authority before provider use',async fault=>{
  const f=existingFixture();try{if(fault==='custody')f.approval.uninterruptedDataCustody=false;if(fault==='fresh-authority')f.approval.acceptHistoricalProofForValidationOnly=false;if(fault==='writes')f.approval.maxWrites=4;if(fault==='budget')f.approval.maxReads=100001;if(fault==='expired')f.approval.expiresAt='2026-11-05T04:00:00Z';if(fault==='new-day')vi.setSystemTime(new Date('2026-11-06T01:00:00Z'));if(fault==='auditor')f.approval.auditorCommit='c'.repeat(40);await expect(f.run()).rejects.toThrow();expect(f.calls()).toBe(0);}finally{f.cleanup();}
 });
});

describe('existing-candidate native authority',()=>{
 function dispatchFixture(fault=''){
  const source={commit:'a'.repeat(40),tree:'b'.repeat(40)},now=Date.parse('2026-11-05T05:00:00Z');
  const a:ExistingApproval={schemaVersion:'norton-existing-preview-validation-approval.v1',operationId:'operation-existing-native-fixture',auditorCommit:source.commit,auditorTree:source.tree,expiresAt:'2026-11-05T05:30:00.000Z',confirmation:EXISTING.confirmation,historicalProofSha256:EXISTING.proofSha256,acceptHistoricalProofForValidationOnly:true,uninterruptedDataCustody:true,maxReads:100000,maxWrites:0,noDeployment:true};
  const calls:string[]=[];
  const github=async(route:string)=>{calls.push(route);
   if(route==='/actions/runs/9')return {id:9,actor:{id:EXISTING.owner},triggering_actor:{id:fault==='trigger'?2:EXISTING.owner},event:'workflow_dispatch',path:'.github/workflows/pr.yml',head_sha:source.commit,head_branch:'codex/norton-aquinas-successor',run_attempt:fault==='attempt'?2:1};
   if(route==='/pulls/176')return {state:'open',draft:false,base:{ref:'main',sha:EXISTING.base},head:{sha:fault==='head'?'c'.repeat(40):source.commit,ref:'codex/norton-aquinas-successor',repo:{full_name:EXISTING.repository}},labels:fault==='label'?[{name:'deploy-preview'}]:[]};
   if(route.startsWith('/git/commits/'))return {tree:{sha:source.tree}};
   if(route==='/git/ref/heads/main')return {object:{sha:EXISTING.base}};
   if(route==='/actions/runs/'+EXISTING.run)return {id:EXISTING.run,status:'completed',conclusion:'failure',head_sha:fault==='candidate-source'?'c'.repeat(40):EXISTING.sourceCommit,run_attempt:1,path:'.github/workflows/pr.yml'};
   if(route.includes('/jobs?'))return {jobs:[{name:'Preview operator corpus verification',conclusion:fault==='proof-job'?'failure':'success'},{name:'Deploy Preview',conclusion:'failure',steps:[{name:'Require stable preview release registrations before audits',conclusion:'failure'}]}]};
   if(route.includes('/workflows/'))return {workflow_runs:fault==='CI'?[]:[{head_sha:source.commit,path:'.github/workflows/pr.yml',event:'pull_request',conclusion:'success'}]};
   const artifact=NATIVE_ARTIFACTS.find(a=>route==='/actions/artifacts/'+a.id);if(artifact)return {...artifact,expired:fault==='expired-artifact',expires_at:'2026-11-06T00:00:00Z',size_in_bytes:fault==='oversized-artifact'?129*1024*1024:1000,workflow_run:{id:EXISTING.run,head_sha:EXISTING.sourceCommit},digest:fault==='artifact-digest'?'sha256:'+'0'.repeat(64):artifact.digest};
   throw Error('Unexpected native fixture route');
  };
  const environment={GITHUB_REPOSITORY:EXISTING.repository,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_ACTOR_ID:String(EXISTING.owner),GITHUB_RUN_ID:'9',GITHUB_REF:'refs/heads/codex/norton-aquinas-successor'};
  return {a,source,calls,run:()=>requireExistingDispatch(a,source,github,environment,now)};
 }
 it('authenticates separate auditor dispatch and all original immutable artifacts without renewing the old proof',async()=>{const f=dispatchFixture();const result=await f.run();expect(result).toMatchObject({runId:'9',auditorCommit:f.source.commit,operationId:f.a.operationId,ownerActorId:EXISTING.owner});expect(result.nativeArtifacts).toHaveLength(4);expect(f.calls).toHaveLength(11);expect(f.source.commit).not.toBe(EXISTING.sourceCommit);});
 it.each(['trigger','attempt','head','label','candidate-source','proof-job','CI','expired-artifact','oversized-artifact','artifact-digest'])('rejects %s before Cloudflare use',async fault=>{const f=dispatchFixture(fault);await expect(f.run()).rejects.toThrow();});
});


it('rejects a changed runtime, data, fixture or lock even if an auditor claims equivalence',()=>{
 const directory=mkdtempSync(join(tmpdir(),'existing-preview-equivalence-')),repo=join(directory,'repo'),bundle=join(directory,'bundle');
 const git=(...args:string[])=>execFileSync('git',['-c','core.hooksPath=/dev/null',...args],{cwd:repo,stdio:'pipe'});
 try{
  execFileSync('git',['-c','core.hooksPath=/dev/null','clone','--shared','--quiet',process.cwd(),repo],{stdio:'pipe'});mkdirSync(bundle);writeFileSync(join(bundle,'worker.js'),'not the authenticated Worker');
  expect(()=>requireRuntimeEquivalence(repo,bundle)).toThrow('compiled candidate runtime differs');
  for(const file of ['src/worker.ts','data/data-manifest.json','test/fixtures/historical-core-preview-audit.json','package-lock.json']){
   appendFileSync(join(repo,file),'\n');git('add',file);git('-c','user.name=Local Fixture','-c','user.email=fixture@example.test','-c','commit.gpgsign=false','commit','-qm','Local-only equivalence rejection fixture');
   expect(()=>requireRuntimeEquivalence(repo,bundle)).toThrow('unreviewed candidate/auditor difference');git('reset','--hard','HEAD^');
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
},30000);
