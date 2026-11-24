import{it,expect,vi,afterEach}from'vitest';
import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,appendFileSync,chmodSync}from'node:fs';
import{join}from'node:path';
import{execFileSync}from'node:child_process';
import{tmpdir}from'node:os';
import{createHash}from'node:crypto';
const classify = vi.hoisted(() => vi.fn());
vi.mock('../../../scripts/application-release-policy.mjs',async importOriginal=>({...(await importOriginal<object>()),classifyApplicationRelease:classify}));
import{createOperatorChallenge,operatorApproval}from'../../../scripts/operator-corpus-proof.js';
import{POLICY,TARGETS}from'../../../scripts/application-release-policy.mjs';
import{corpusGrant,corpusTransportFixture}from'../../helpers/corpusTransportFixture.js';
const audit=vi.hoisted(()=>vi.fn());
vi.mock('../../../scripts/release-acceptance.js',()=>({runCorpusAcceptance:audit}));
vi.mock('../../../scripts/operator-corpus-proof.js',async importOriginal=>({...(await importOriginal<object>()),requireLiveOperatorGate:vi.fn()}));
import{runCorpusLive}from'../../../scripts/norton-aquinas-live.js';
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
function fixture(role:'preview'|'production'='preview'){
 const production=role==='production',liveControlReserve=300000;
 const dated={accountReadCeiling:4000000,accountReadCeilingDay:'2026-11-05'};
 // A synthetic grant must use its valid fixture window, independent of host UTC time.
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-05T05:00:00Z'));
 const directory=mkdtempSync(join(tmpdir(),'corpus-live-wrapper-')),sourceDirectory=join(directory,'source');mkdirSync(sourceDirectory);
 const classification={sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),schema:'fixture',releasePolicy:POLICY.policy};
 classify.mockReturnValue(classification);
 const now=Date.now(),hash='a'.repeat(64);
 const tables=Object.fromEntries(Array.from({length:39},(_,i)=>['table'+i,{rows:1,sha256:hash}]));
 writeFileSync(join(sourceDirectory,'source.db'),'synthetic database bytes; audit boundary mocked');
 const plan={schemaVersion:'theologai-application-corpus-source-plan.v1',releasePolicy:POLICY.policy,classification,corpusIdentity:hash,sourceSha256:sha(readFileSync(join(sourceDirectory,'source.db'))),expected:{digests:tables,foreignKeyWitnessSha256:hash},readBudget:3450000,integrityCommands:4};const text=JSON.stringify(plan),digest=sha(text);writeFileSync(join(sourceDirectory,'plan.json'),text);
 const {package:authorization}=corpusGrant({role,now,overrides:{expectedLedgerSha256:hash,sourcePlanSha256:digest,targetRunId:'12345',liveControlReserve,reservedReads:3450000,hardReadCap:3450000}});
 const grant=authorization.authorization;
 for(const [key,value] of Object.entries({GITHUB_RUN_ID:'12345',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_NAME:production?'workflow_dispatch':'pull_request',GITHUB_REF:production?'refs/heads/main':'refs/pull/172/merge'}))vi.stubEnv(key,value);
 const c=createOperatorChallenge(role,classification,digest,{GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:grant.repository,GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'12345',GITHUB_EVENT_NAME:production?'workflow_dispatch':'pull_request',GITHUB_REF:production?'refs/heads/main':'refs/pull/172/merge',OPERATOR_BASE_COMMIT:grant.baseCommit},now,{accountId:POLICY.account,role,...dated,day:new Date(now).toISOString().slice(0,10),observedAt:new Date(now).toISOString(),inventoryObservedAt:new Date(now).toISOString(),liveControlReserve,rowsRead:100,rowsWritten:0,sampleInterval:1,readBudget:3450000,controls:[]},authorization);
 const receipt={schemaVersion:'theologai-fresh-complete-corpus-proof.v1',releasePolicy:POLICY.policy,liveControlReserve,role,accountId:POLICY.account,...TARGETS[role],sourceCommit:classification.sourceCommit,sourceTree:classification.sourceTree,corpusIdentity:hash,schema:classification.schema,sourcePlanSha256:digest,approvalSha256:sha(JSON.stringify(operatorApproval(c))),startedAt:new Date(now).toISOString(),completedAt:new Date(now).toISOString(),readBudget:3450000,metering:{rowsRead:3332195,rowsWritten:4,requests:3337,integrityCommands:4,retries:0,unknownAttempts:0},controls:c.admission.controls,controlsUnchanged:true,operationalAssumption:'owner_reserves_target_data_writes_during_proof_not_an_enforced_provider_lease',proof:{method:'fresh_complete_cells_physical_and_rank1_fts.v1',quickCheck:'ok',ftsIntegrity:['strongs_fts','sections_fts','historical_edition_sections_fts','historical_edition_hierarchy_bodies_fts'],tables,sourceRows:39,catalogSha256:hash,ledgerSha256:hash,foreignKeys:{method:'local_clean_raw_schema_plus_all_child_parent_cells',witnessSha256:hash}}};
 let calls=0;const provider=corpusTransportFixture({role,activated:true,advance:()=>vi.setSystemTime(Date.now()+1000),record:()=>{calls++;},query:()=>{throw Error('SQL forbidden');}});
 const files={challengeFile:join(directory,'challenge.json'),receiptFile:join(directory,'receipt.json'),cutoverFile:join(directory,'cutover.json')};
 writeFileSync(files.challengeFile,JSON.stringify(c));
 writeFileSync(files.receiptFile,JSON.stringify(receipt));
 writeFileSync(files.cutoverFile,JSON.stringify({worker:production?'theologai':'theologai-preview',candidateBindingMatches:true,
  candidateD1:TARGETS[role],observedActiveD1:TARGETS[role],observedActiveDeploymentId:provider.deployments[role],
  observedActiveVersionId:provider.versions[role]}));
 const journal=JSON.stringify({kind:'complete-unbound-inventory',capture:{exclusiveUsage:{
  databaseId:TARGETS[role].databaseId,completeDatabaseGroups:true,windowStart:dated.accountReadCeilingDay+'T00:00:00.000Z',
  candidate:{rowsWritten:4},
 }}})+'\n';
 writeFileSync(files.receiptFile+'.events.jsonl',journal);
 writeFileSync(join(directory,'operator-proof-envelope.json'),JSON.stringify({
  schemaVersion:'theologai-operator-corpus-envelope.v1',challenge:c,receipt,journalSha256:sha(journal),
  budget:{authorizationId:grant.authorizationId,previousReadsSpentOrReserved:0,previousWritesSpentOrReserved:0,
   previousDiagnosticCommands:0,cumulativeReadsSpentOrReserved:receipt.metering.rowsRead,
   cumulativeWritesSpentOrReserved:4,cumulativeDiagnosticCommands:4},
 }));
 const fetch:typeof globalThis.fetch=async(input,init)=>{
  const response=await provider.fetch(input,init);
  if(!String(input).endsWith('/graphql'))return response;
  const body=await response.json() as {data:{viewer:{accounts:{databases:{sum:{rowsWritten:number}}[]}[]}}};
  body.data.viewer.accounts[0]!.databases[0]!.sum.rowsWritten=4;
  return Response.json(body);
 };
 return {directory,calls:()=>calls,input:{role,sourceDirectory,planSha256:digest,...files,outputDirectory:directory,token:'synthetic-token',fetch},hash};
}
it('runs the actual live orchestration through controls, audit and completion with single journal ownership',async()=>{
 const f=fixture();audit.mockImplementationOnce(async(options:any)=>{options.guard();return{endpoint:options.endpoint,productProfile:'7',serverVersion:'3.6.0-preview',protocols:['2025-11-25','2026-07-28'],fingerprints:[0,1].map(()=>Object.fromEntries(['capabilities','tools','prompts','resourceTemplates','staticResources'].map(key=>[key,f.hash]))),checks:[{id:'language:fixture',result:'passed'}]};});
 try{
  await runCorpusLive(f.input);expect(audit).toHaveBeenCalledOnce();expect(f.calls()).toBeGreaterThan(4);expect(existsSync(join(f.directory,'corpus-live.json'))).toBe(true);
  const events=readFileSync(join(f.directory,'corpus-live.json.events.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));expect(events.map(e=>e.kind)).toEqual(expect.arrayContaining(['live-admitted','live-intent','live-complete']));
  const count=f.calls();await expect(runCorpusLive(f.input)).rejects.toThrow('EEXIST');expect(f.calls()).toBe(count);expect(audit).toHaveBeenCalledOnce();
 }finally{audit.mockReset();rmSync(f.directory,{recursive:true,force:true});}
},30000);
it('refuses an observed production overage even when the account still has daily headroom',async()=>{
 const f=fixture('production');
 for(const [key,value] of Object.entries({GITHUB_RUN_ID:'12345',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main'}))vi.stubEnv(key,value);
 const provider=f.input.fetch;let audited=false;
 audit.mockImplementationOnce(async()=>{audited=true;return {};});
 f.input.fetch=async(input,init)=>{
  const response=await provider(input,init);
  if(audited&&String(input).endsWith('/graphql')){
   const body=await response.json() as {data:{viewer:{accounts:{databases:{sum:{rowsRead:number}}[]}[]}}};
   body.data.viewer.accounts[0].databases[0].sum.rowsRead=3332195+100+150001;
   return Response.json(body);
  }
  return response;
 };
 try{
  await expect(runCorpusLive(f.input)).rejects.toThrow('observed live/control allowance exceeded');
  expect(audited).toBe(true);
  const journal=readFileSync(join(f.directory,'corpus-live.json.events.jsonl'),'utf8').trim().split('\n');
  expect(JSON.parse(journal.at(-1)!)).toMatchObject({kind:'live-budget-stop',attempt:1,reason:'observed live/control allowance exceeded',accountReadFloor:3332295,
   observedAccountReads:3482296,cumulativeReservedReads:150000,reservationRetained:true});
  expect(existsSync(join(f.directory,'corpus-live.json'))).toBe(false);
 }finally{vi.unstubAllEnvs();audit.mockReset();rmSync(f.directory,{recursive:true,force:true});}
},30000);
it('refuses a pre-existing journal before any provider or audit call',async()=>{
 const f=fixture();writeFileSync(join(f.directory,'corpus-live.json.events.jsonl'),'preserved intent\n');try{await expect(runCorpusLive(f.input)).rejects.toThrow('EEXIST');expect(f.calls()).toBe(0);expect(audit).not.toHaveBeenCalled();expect(readFileSync(join(f.directory,'corpus-live.json.events.jsonl'),'utf8')).toBe('preserved intent\n');}finally{rmSync(f.directory,{recursive:true,force:true});}
});
