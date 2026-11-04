import{it,expect,vi}from'vitest';
import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync}from'node:fs';
import{join}from'node:path';
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
