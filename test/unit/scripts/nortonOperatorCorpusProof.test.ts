import {corpusGrant} from '../../helpers/corpusTransportFixture.js';
import {describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createOperatorChallenge,requireOperatorChallenge,operatorApproval,verifyOperatorEnvelope,verifyOperatorIntegrity,composeReadProof,readLiveOperatorMetadata,readLiveOperatorMetadataAsync,requireLiveOperatorGate,requireLiveOperatorGateParallel,admitOperatorBudget,spentOperatorBudget,OPERATOR_PROOF as APPLICATION_OPERATOR_PROOF} from '../../../scripts/operator-corpus-proof.js';
import {ACCOUNT,TARGETS} from '../../../scripts/application-release-policy.mjs';
const CORPUS = 'e'.repeat(64), SCHEMA = 'fixture';
import {ALL_FTS} from '../../../scripts/corpus-source-proof.js';
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const OPERATOR_PROOF={...APPLICATION_OPERATOR_PROOF,reservedReads:3560000,hardReadCap:3560000};
const today=new Date();
const start=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()+1,0,5);
const authority=createRequire(import.meta.url)('../../../.github/scripts/operator-authorization.cjs');
function authorization(role: 'preview'|'production'='preview', now=start, identity:Record<string,unknown>={}) {
  return corpusGrant({role,now,overrides:identity}).package;
}
function nativeAuthorization(p:any) {
  const a=p.authorization;
  return {run:{id:321,path:'.github/workflows/pr.yml',event:'workflow_dispatch',run_attempt:1,actor:{id:40179660},triggering_actor:{id:40179660},head_sha:a.sourceCommit,head_branch:a.headBranch,created_at:new Date(Date.parse(a.notBefore)+1).toISOString()},
    artifact:{id:654,name:`operator-authorization-${a.targetRunId}-attempt-1`,digest:p.provenance.digest,expired:false,expires_at:a.expiresAt,workflow_run:{id:321,head_sha:a.sourceCommit}}};
}
function archiveAuthorization(p:any) {
  const directory=mkdtempSync(join(tmpdir(),'operator-authorization-fixture-'));
  try {writeFileSync(join(directory,'operator-authorization.json'),JSON.stringify(p.authorization));execFileSync('zip',['-q','authorization.zip','operator-authorization.json'],{cwd:directory});
    const bytes=readFileSync(join(directory,'authorization.zip'));p.provenance.digest='sha256:'+createHash('sha256').update(bytes).digest('hex');return bytes;
  } finally {rmSync(directory,{recursive:true,force:true});}
}
function fixture() {
  const classification={releasePolicy:'corpus.v1',sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),schema:SCHEMA};
  const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:OPERATOR_PROOF.repository,GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123',GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/pull/172/merge',OPERATOR_BASE_COMMIT:'c'.repeat(40)};
  const admission={accountId:ACCOUNT,role:'preview' as const,day:new Date(start).toISOString().slice(0,10),inventoryObservedAt:new Date(start).toISOString(),liveControlReserve:100000,accountReadCeiling:4000000,accountReadCeilingDay:new Date(start).toISOString().slice(0,10),observedAt:new Date(start).toISOString(),rowsRead:100,rowsWritten:0,sampleInterval:1 as const,readBudget:3560000,controls:[{role:'preview',databaseId:TARGETS.preview.databaseId}]};
  const c=createOperatorChallenge('preview',classification,'d'.repeat(64),env,start,admission,authorization());
  const tables=Object.fromEntries(Array.from({length:39},(_,i)=>['table'+i,{rows:1,sha256:'e'.repeat(64)}]));
  const plan={schemaVersion:'theologai-application-corpus-source-plan.v1',releasePolicy:'corpus.v1',classification,corpusIdentity:CORPUS,readBudget:3560000,integrityCommands:4,expected:{digests:tables,foreignKeyWitnessSha256:'2'.repeat(64)}};
  const receipt={liveControlReserve:100000,schemaVersion:'theologai-fresh-complete-corpus-proof.v1',role:'preview',accountId:ACCOUNT,...TARGETS.preview,
    ...classification,corpusIdentity:CORPUS,schema:SCHEMA,startedAt:new Date(start+1000).toISOString(),completedAt:new Date(start+120_000).toISOString(),
    sourcePlanSha256:c.sourcePlanSha256,approvalSha256:sha(JSON.stringify(operatorApproval(c))),readBudget:3560000,controlsUnchanged:true,
    operationalAssumption:'owner_reserves_target_data_writes_during_proof_not_an_enforced_provider_lease',
    controls:[{role:'preview',databaseId:TARGETS.preview.databaseId}],
    proof:{method:'fresh_complete_cells_physical_and_rank1_fts.v1',quickCheck:'ok',ftsIntegrity:[...ALL_FTS],tables,sourceRows:39,
      catalogSha256:'f'.repeat(64),ledgerSha256:'1'.repeat(64),foreignKeys:{method:'local_clean_raw_schema_plus_all_child_parent_cells',witnessSha256:'2'.repeat(64)}},
    metering:{rowsRead:1000,rowsWritten:4,requests:50,integrityCommands:4,retries:0,unknownAttempts:0}};
  const envelope={schemaVersion:'theologai-operator-corpus-envelope.v1',challenge:c,receipt,journalSha256:'3'.repeat(64),
    budget:{authorizationId:c.authorizationId,previousReadsSpentOrReserved:0,previousWritesSpentOrReserved:0,previousDiagnosticCommands:0,cumulativeReadsSpentOrReserved:1000,cumulativeWritesSpentOrReserved:4,cumulativeDiagnosticCommands:4}};
  return {env,c,plan,envelope,now:start+180_000};
}
describe('complete operator proof contract',()=>{
  for(const status of [502,503,504])it('retries read-only GitHub HTTP '+status+' once before returning fresh metadata',()=>{
    const invoke=vi.fn().mockImplementationOnce(()=>{throw {stderr:Buffer.from(`gh: Server Error (HTTP ${status})`)};}).mockReturnValue('{"status":"in_progress"}');const pause=vi.fn();
    expect(readLiveOperatorMetadata(OPERATOR_PROOF.repository,'/actions/runs/123',invoke,pause)).toEqual({status:'in_progress'});
    expect(invoke.mock.calls).toEqual(Array.from({length:2},()=>[['api','repos/TJ-Frederick/TheologAI/actions/runs/123','--method','GET']]));expect(pause).toHaveBeenCalledExactlyOnceWith(250);
  });
  it('stops after a persistent metadata outage without returning cached authorization',()=>{
    const invoke=vi.fn().mockImplementation(()=>{throw {stderr:'gh: Server Error (HTTP 502)'};});const pause=vi.fn();
    expect(()=>readLiveOperatorMetadata(OPERATOR_PROOF.repository,'/pulls/170',invoke,pause)).toThrow('HTTP 502');expect(invoke).toHaveBeenCalledTimes(2);expect(pause).toHaveBeenCalledOnce();
  });
  for(const status of [401,403,404,429])it('does not retry non-transient metadata HTTP '+status,()=>{
    const invoke=vi.fn().mockImplementation(()=>{throw {stderr:`gh: rejected (HTTP ${status})`};});const pause=vi.fn();
    expect(()=>readLiveOperatorMetadata(OPERATOR_PROOF.repository,'/actions/runs/123/jobs?per_page=100',invoke,pause)).toThrow('HTTP '+status);expect(invoke).toHaveBeenCalledOnce();expect(pause).not.toHaveBeenCalled();
  });
  it('does not retry malformed metadata, timeout ambiguity or non-GET routes',()=>{
    const pause=vi.fn(),invalid=vi.fn().mockReturnValue('invalid');expect(()=>readLiveOperatorMetadata(OPERATOR_PROOF.repository,'/pulls/170',invalid,pause)).toThrow();expect(invalid).toHaveBeenCalledOnce();
    const timeout=vi.fn().mockImplementation(()=>{throw Error('timeout');});expect(()=>readLiveOperatorMetadata(OPERATOR_PROOF.repository,'/pulls/170',timeout,pause)).toThrow('timeout');expect(timeout).toHaveBeenCalledOnce();
    for(const path of ['/actions/workflows/pr.yml/dispatches','/actions/runs/123/pending_deployments','/d1/query'])expect(()=>readLiveOperatorMetadata(OPERATOR_PROOF.repository,path,invalid,pause)).toThrow('GET route');expect(invalid).toHaveBeenCalledOnce();expect(pause).not.toHaveBeenCalled();
  });
  it('keeps the approved complete proof/read/write reservation unchanged',()=>{const f=fixture();expect(operatorApproval(f.c)).toEqual({releasePolicy:'corpus.v1',liveControlReserve:100000,expectedLedgerSha256:'1'.repeat(64),schemaVersion:'theologai-fresh-corpus-proof-approval.v1',role:'preview',accountId:ACCOUNT,databaseId:TARGETS.preview.databaseId,sourceCommit:f.c.sourceCommit,sourceTree:f.c.sourceTree,expiresAt:f.c.expiresAt,maxReads:3560000,reservedReads:3560000,integrityCommands:4,exclusiveDataWritesDuringProof:true});});
  it('accepts a current full proof for the exact protected source and target',()=>{const f=fixture();expect(verifyOperatorEnvelope(f.envelope,f.c,f.plan,f.now)).toBe(f.envelope);});
  for(const fault of ['source','tree','plan','nonce','target','role','partial','fts','physical','fk','controls','retries','ambiguous','stale','pre-challenge','approval','budget-overrun','write-overrun','budget-reset','extra-field'])it('rejects '+fault,()=>{
    const f=fixture(); const e:any=structuredClone(f.envelope);
    if(fault==='source')e.receipt.sourceCommit='f'.repeat(40);
    if(fault==='tree')e.receipt.sourceTree='f'.repeat(40);
    if(fault==='plan')e.receipt.sourcePlanSha256='f'.repeat(64);
    if(fault==='nonce')e.challenge.nonce='f'.repeat(64);
    if(fault==='target')e.receipt.databaseId=TARGETS.production.databaseId;
    if(fault==='role')e.receipt.role='production';
    if(fault==='partial')delete e.receipt.proof.tables.table38;
    if(fault==='fts')e.receipt.proof.ftsIntegrity.pop();
    if(fault==='physical')e.receipt.proof.quickCheck='skipped';
    if(fault==='fk')e.receipt.proof.foreignKeys.method='markers';
    if(fault==='controls')e.receipt.controlsUnchanged=false;
    if(fault==='retries')e.receipt.metering.retries=1;
    if(fault==='ambiguous')e.receipt.metering.unknownAttempts=1;
    if(fault==='stale')e.receipt.completedAt=new Date(start-3600001).toISOString();
    if(fault==='pre-challenge')e.receipt.startedAt=new Date(start-1).toISOString();
    if(fault==='approval')e.receipt.approvalSha256='f'.repeat(64);
    if(fault==='budget-overrun'){e.budget.previousReadsSpentOrReserved=1072691;e.budget.cumulativeReadsSpentOrReserved=1073691;}
    if(fault==='write-overrun'){e.budget.previousDiagnosticCommands=5;e.budget.cumulativeDiagnosticCommands=9;}
    if(fault==='budget-reset')e.budget.cumulativeReadsSpentOrReserved=0;
    if(fault==='extra-field')e.unreviewed=true;
    expect(()=>verifyOperatorEnvelope(e,f.c,f.plan,f.now)).toThrow();
  });
  it('rejects a receipt that replaces the known prior reads with a smaller failure',()=>{const f=fixture();f.envelope.budget.previousReadsSpentOrReserved=100;f.envelope.budget.cumulativeReadsSpentOrReserved=1100;expect(()=>verifyOperatorEnvelope(f.envelope,f.c,f.plan,f.now)).toThrow();});
  for(const fault of ['expired','UTC-crossing','manual-preview','main-preview','owner','broader-budget','attempt','extra','non-CI'])it('rejects challenge '+fault,()=>{
    const f=fixture();const c:any={...f.c};
    if(fault==='expired')c.expiresAt=new Date(start-1).toISOString();
    if(fault==='UTC-crossing'){c.createdAt='2026-10-30T23:00:00Z';c.expiresAt='2026-10-31T00:30:00Z';}
    if(fault==='manual-preview')c.eventName='workflow_dispatch';
    if(fault==='main-preview')c.ref='refs/heads/main';
    if(fault==='owner')c.ownerActorId=1;
    if(fault==='broader-budget')c.hardReadCap=4000000;
    if(fault==='attempt')c.runAttempt=2;
    if(fault==='extra')c.other=true;
    if(fault==='non-CI')expect(()=>createOperatorChallenge('preview',f.plan.classification,'d'.repeat(64),{...f.env,GITHUB_ACTIONS:'false'},start)).toThrow();
    else expect(()=>requireOperatorChallenge(c,f.now)).toThrow();
  });

});

describe('operator cumulative budget',()=>{
  const ledger=(c:any)=>({schemaVersion:'theologai-operator-proof-budget.v1',authorizationId:c.authorizationId,
    ledgerId:c.authorization.authorization.ledgerId,authorizationSha256:sha(JSON.stringify(c.authorization)),consumed:false,readsSpentOrReserved:0,writesSpentOrReserved:0,diagnosticCommands:0,attempts:[] as any[]});
  it('admits only a deliberately initialized new-operation ledger',()=>{const f=fixture();expect(()=>admitOperatorBudget(ledger(f.c),f.c,3560000)).not.toThrow();});
  for(const fault of ['reads','writes','commands','consumed','running','passed','awaiting','identity','missing-ledger','negative','old-pr170','authorization'])it('stops before SQL for '+fault,()=>{
    const f=fixture();const l=ledger(f.c);
    if(fault==='reads')l.readsSpentOrReserved=1;if(fault==='writes')l.writesSpentOrReserved=1;if(fault==='commands')l.diagnosticCommands=1;
    if(fault==='consumed')l.consumed=true;if(fault==='running')l.attempts.push({status:'RUNNING'});if(fault==='passed')l.attempts.push({status:'PASSED'});if(fault==='awaiting')l.attempts.push({status:'INTEGRITY_PASSED_AWAITING_CI'});
    if(fault==='identity')l.ledgerId='other';if(fault==='missing-ledger')delete (l as any).authorizationSha256;if(fault==='negative')l.readsSpentOrReserved=-1;
    if(fault==='old-pr170')l.authorizationId='retired-operation-id';if(fault==='authorization')l.authorizationSha256='f'.repeat(64);
    expect(()=>admitOperatorBudget(l,f.c,3560000)).toThrow();
  });
  it('reserves unmatched requests and records metered overruns instead of hiding them',()=>{
    const meter={rowsRead:100,rowsWritten:0,requests:2,retries:0,unknownAttempts:1,integrityCommands:1};
    const events=[{kind:'intent',readCeiling:100,writeCeiling:0},{kind:'result',rowsRead:100,rowsWritten:0},{kind:'intent',readCeiling:4096,writeCeiling:1}];
    expect(spentOperatorBudget(meter,events)).toEqual({readsSpentOrReserved:4196,writesSpentOrReserved:1,diagnosticCommands:1});
    expect(spentOperatorBudget({...meter,rowsRead:9000,rowsWritten:5},events)).toEqual({readsSpentOrReserved:9000,writesSpentOrReserved:5,diagnosticCommands:1});
  });
});

describe('GitHub owner artifact provenance',()=>{
  const bridge=createRequire(import.meta.url)('../../../.github/scripts/operator-proof-bridge.cjs');
  function setup() {
    const f=fixture();const run={id:456,head_sha:f.c.sourceCommit,created_at:new Date(start+130000).toISOString(),actor:{id:40179660},triggering_actor:{id:40179660},run_attempt:1,path:'.github/workflows/pr.yml',event:'workflow_dispatch',head_branch:'ci/different-successor'};
    const artifact={id:789,name:bridge.artifactName(f.c),expired:false,expires_at:new Date(start+86400000).toISOString(),workflow_run:{head_sha:f.c.sourceCommit,id:456},digest:'sha256:'+'f'.repeat(64)};
    const job={name:'Retain operator corpus proof (no cloud credentials)',status:'completed',conclusion:'success'};
    const pr={state:'open',draft:false,head:{repo:{full_name:f.c.repository},sha:f.c.sourceCommit,ref:'ci/different-successor'},base:{sha:f.c.baseCommit,ref:'main'},labels:[{name:'deploy-preview'}]};
    const bytes=archiveAuthorization(f.c.authorization),native=nativeAuthorization(f.c.authorization);
    const runs=[run];const github={rest:{pulls:{get:async()=>({data:pr})},git:{getRef:async()=>({data:{object:{sha:f.c.baseCommit}}}),getCommit:async()=>({data:{tree:{sha:f.c.sourceTree}}})},actions:{listArtifactsForRepo:async()=>({data:{artifacts:[{...native.artifact,name:'operator-ledger-'+f.c.authorization.authorization.ledgerId}]}}),downloadArtifact:async()=>({data:bytes}),getWorkflowRun:async({run_id}:any)=>({data:run_id===321?native.run:{head_sha:f.c.sourceCommit,run_attempt:1,status:'in_progress',event:'pull_request',path:'.github/workflows/pr.yml',pull_requests:[{number:172,head:{sha:f.c.sourceCommit},base:{sha:f.c.baseCommit}}]}}),getArtifact:async()=>({data:native.artifact}),listWorkflowRuns:async()=>({data:{workflow_runs:runs}}),listWorkflowRunArtifacts:async()=>({data:{artifacts:[artifact]}}),listJobsForWorkflowRun:async()=>({data:{jobs:[job]}})}}};
    return {...f,run,artifact,job,pr,runs,github};
  }
  it('accepts only the owner authenticated dispatch with an immutable source-bound artifact',async()=>{const f=setup();await expect(bridge.find({github:f.github,challenge:f.c,now:f.now})).resolves.toMatchObject({runId:456,artifactId:789});});
  for(const fault of ['actor','triggering-actor','run-source','rerun','event','branch','old-run','artifact-source','artifact-run','digest','expired','failed-uploader','revoked','duplicate'])it('refuses '+fault,async()=>{
    const f=setup();
    if(fault==='actor')f.run.actor.id=1;
    if(fault==='triggering-actor')f.run.triggering_actor.id=1;
    if(fault==='run-source')f.run.head_sha='f'.repeat(40);
    if(fault==='rerun')f.run.run_attempt=2;
    if(fault==='event')f.run.event='pull_request';
    if(fault==='branch')f.run.head_branch='other';
    if(fault==='old-run')f.run.created_at=new Date(start-1).toISOString();
    if(fault==='artifact-source')f.artifact.workflow_run.head_sha='f'.repeat(40);
    if(fault==='artifact-run')f.artifact.workflow_run.id=111;
    if(fault==='digest')f.artifact.digest='unsafe';
    if(fault==='expired')f.artifact.expired=true;
    if(fault==='failed-uploader')f.job.conclusion='failure';
    if(fault==='revoked')f.pr.labels=[];
    if(fault==='duplicate')f.runs.push({...f.run});
    if(['actor','triggering-actor','run-source','rerun','event','branch','old-run'].includes(fault))await expect(bridge.find({github:f.github,challenge:f.c,now:f.now})).resolves.toBeNull();
    else await expect(bridge.find({github:f.github,challenge:f.c,now:f.now})).rejects.toThrow();
  });
});

describe('operator protected source admission',()=>{
  const verify=createRequire(import.meta.url)('../../../.github/scripts/verify-operator-proof-source.cjs');
  function setup(){
    const source='a'.repeat(40),base='b'.repeat(40),tree='c'.repeat(40);
    const pr={state:'open',draft:false,base:{ref:'main',sha:base},head:{sha:source,ref:'ci/different-successor',repo:{full_name:OPERATOR_PROOF.repository}},labels:[{name:'deploy-preview'}]};
    const context={repo:{owner:'TJ-Frederick',repo:'TheologAI'},eventName:'pull_request',payload:{pull_request:{number:172,head:{sha:source,ref:'ci/different-successor'}}}};
    const environment={GITHUB_REF:'refs/pull/172/merge',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123',OPERATOR_SOURCE_RUN_ID:'123',OPERATOR_SOURCE_PLAN_SHA256:'d'.repeat(64),RUNNER_TEMP:tmpdir()};
    const run={head_sha:source,status:'in_progress',path:'.github/workflows/pr.yml',event:'pull_request',run_attempt:1,pull_requests:[{number:172,head:{sha:source},base:{sha:base}}]};
    const jobs=['Select Validation','Test & Build','Fresh Checkout & Data','Node HTTP E2E','Worker Runtime & D1','Applicable MCP Conformance','Validation Complete','Build preview Worker artifact (no cloud credentials)'].map(name=>({name,status:'completed',conclusion:'success'}));
    const artifacts=['release-worker-123','corpus-source-123-attempt-1'].map(name=>({name,expired:false,expires_at:new Date(Date.now()+86400000).toISOString(),workflow_run:{head_sha:source,id:123},digest:'sha256:'+'d'.repeat(64)}));
    const auth=authorization('preview',Date.now(),{sourceCommit:source,sourceTree:tree,baseCommit:base});const bytes=archiveAuthorization(auth),native=nativeAuthorization(auth);
    const github={rest:{pulls:{get:async()=>({data:pr})},actions:{listArtifactsForRepo:async({name}:any)=>({data:{artifacts:[{...native.artifact,name}]}}),downloadArtifact:async()=>({data:bytes}),getWorkflowRun:async({run_id}:any)=>({data:run_id===321?native.run:run}),listJobsForWorkflowRun:async({run_id}:any)=>({data:{jobs:run_id===321?[{name:'Retain operator operation authorization (no cloud credentials)',status:'completed',conclusion:'success'}]:jobs}}),listWorkflowRunArtifacts:async()=>({data:{artifacts}})},git:{getCommit:async()=>({data:{tree:{sha:tree}}}),getRef:async()=>({data:{object:{sha:base}}})}}};
    const outputs=vi.fn();return {source,base,tree,pr,context,environment,run,jobs,artifacts,github,core:{setOutput:outputs},outputs};
  }
  it('admits only the same complete normal CI/source artifacts and merge-ref preview route',async()=>{const f=setup();await verify(f);expect(f.outputs.mock.calls.slice(-3)).toEqual([['source',f.source],['tree',f.tree],['base',f.base]]);});
  for(const fault of ['manual','wrong-ref','rerun','different-run','revoked','source','base','required-check','missing-artifact','expired-artifact','artifact-source','digest'])it('stops before cloud access for '+fault,async()=>{
    const f=setup();
    if(fault==='manual')f.context.eventName='workflow_dispatch';if(fault==='wrong-ref')f.environment.GITHUB_REF='refs/heads/main';
    if(fault==='rerun')f.environment.GITHUB_RUN_ATTEMPT='2';if(fault==='different-run')f.environment.OPERATOR_SOURCE_RUN_ID='124';
    if(fault==='revoked')f.pr.labels=[];if(fault==='source')f.pr.head.sha='e'.repeat(40);if(fault==='base')f.pr.base.sha='e'.repeat(40);
    if(fault==='required-check')f.jobs[0]!.conclusion='skipped';if(fault==='missing-artifact')f.artifacts.pop();
    if(fault==='expired-artifact')f.artifacts[0]!.expired=true;if(fault==='artifact-source')f.artifacts[0]!.workflow_run.head_sha='e'.repeat(40);if(fault==='digest')f.artifacts[0]!.digest='unsafe';
    await expect(verify(f)).rejects.toThrow();expect(f.outputs).not.toHaveBeenCalled();
  });
});

describe('operator writes and protected read proof composition',()=>{
  function setup(){const f=fixture();const results=ALL_FTS.map(table=>({label:'fts:'+table,sqlSha256:sha(`INSERT INTO "${table}"("${table}",rank) VALUES('integrity-check',1)`),rowsRead:2,rowsWritten:1}));
    const e:any=structuredClone(f.envelope);e.receipt={schemaVersion:'theologai-operator-fts-proof.v1',role:'preview',accountId:ACCOUNT,databaseId:TARGETS.preview.databaseId,sourceCommit:f.c.sourceCommit,sourceTree:f.c.sourceTree,sourcePlanSha256:f.c.sourcePlanSha256,startedAt:new Date(start+1000).toISOString(),completedAt:new Date(start+20000).toISOString(),controlsUnchanged:true,controls:f.c.admission.controls,results,metering:{rowsRead:8,rowsWritten:4,requests:4,integrityCommands:4,retries:0,unknownAttempts:0}};e.budget.cumulativeReadsSpentOrReserved=e.budget.previousReadsSpentOrReserved+8;return {...f,e};}
  it('keeps an integrity-only receipt insufficient to deploy',()=>{const f=setup();expect(()=>verifyOperatorIntegrity(f.e,f.c,f.now)).not.toThrow();expect(()=>verifyOperatorEnvelope(f.e,f.c,f.plan,f.now)).toThrow();});
  it('refuses any inherited PR170 spend in a new operation',()=>{
    const f=setup();Object.assign(f.e.budget,{previousReadsSpentOrReserved:1072690,previousWritesSpentOrReserved:4,previousDiagnosticCommands:4,cumulativeReadsSpentOrReserved:1072698,cumulativeWritesSpentOrReserved:8,cumulativeDiagnosticCommands:8});
    expect(()=>verifyOperatorIntegrity(f.e,f.c,f.now)).toThrow();f.e.budget.cumulativeWritesSpentOrReserved=4;expect(()=>verifyOperatorIntegrity(f.e,f.c,f.now)).toThrow();
  });
  for(const fault of ['wrong-sql','missing','reads','writes','attempt','stale-admission','control-drift','budget-reset'])it('rejects operator '+fault,()=>{const f=setup();if(fault==='wrong-sql')f.e.receipt.results[0].sqlSha256='f'.repeat(64);if(fault==='missing')f.e.receipt.results.pop();if(fault==='reads')f.e.receipt.results[0].rowsRead=4097;if(fault==='writes')f.e.receipt.results[0].rowsWritten=2;if(fault==='attempt')f.e.receipt.metering.unknownAttempts=1;if(fault==='stale-admission')f.e.receipt.completedAt=new Date(start+51000).toISOString();if(fault==='control-drift')f.e.receipt.controls=[];if(fault==='budget-reset')f.e.budget.cumulativeReadsSpentOrReserved=0;expect(()=>verifyOperatorIntegrity(f.e,f.c,f.now)).toThrow();});
  it('runs every read with read credentials and consumes each attested write exactly once',async()=>{const f=setup();const meter={rowsRead:0,rowsWritten:0,requests:0,integrityCommands:0,retries:0,unknownAttempts:0};const calls:string[]=[];
    const reader={metering:meter,start:async()=>{},execute:async(q:any)=>{if(q.kind==='fts-integrity')throw Error('read token must never write');calls.push(q.sql);meter.rowsRead+=10;meter.requests++;return [{n:1}];},finish:async()=>({controls:f.c.admission.controls,controlsUnchanged:true as const})};
    const t=composeReadProof(reader,f.e,()=>{});await t.start();await expect(t.finish()).rejects.toThrow('complete integrity');
    await expect(t.execute({kind:'select',sql:'SELECT 1 n',label:'read',readCeiling:100,writeCeiling:0})).resolves.toEqual([{n:1}]);
    for(const table of ALL_FTS)expect(await t.execute({kind:'fts-integrity',label:'fts:'+table,sql:`INSERT INTO "${table}"("${table}",rank) VALUES('integrity-check',1)`,readCeiling:4096,writeCeiling:1})).toEqual([]);
    expect(calls).toEqual(['SELECT 1 n']);expect(t.metering).toEqual({...meter,rowsRead:18,rowsWritten:4,requests:5,integrityCommands:4});await expect(t.finish()).resolves.toMatchObject({controlsUnchanged:true});
    await expect(t.execute({kind:'fts-integrity',label:'extra',sql:'INSERT extra',readCeiling:4096,writeCeiling:1})).rejects.toThrow('integrity consumption');
  });
  it('retains failed-read costs alongside the four writes',async()=>{const f=setup();const reader={metering:{rowsRead:100,rowsWritten:0,requests:1,integrityCommands:0,retries:0,unknownAttempts:1},start:async()=>{},execute:async()=>{throw Error('failed read');},finish:async()=>({controls:[],controlsUnchanged:true as const})};const t=composeReadProof(reader,f.e,()=>{});await expect(t.execute({kind:'select',sql:'SELECT 1',label:'fail',readCeiling:100,writeCeiling:0})).rejects.toThrow();expect(t.metering).toMatchObject({rowsRead:108,rowsWritten:4,requests:5,unknownAttempts:1});});

});

describe('merged correction PR production handoff',()=>{
  const bridge=createRequire(import.meta.url)('../../../.github/scripts/operator-proof-bridge.cjs');
  function setup(){const f=fixture();const c=createOperatorChallenge('production',{releasePolicy:'corpus.v1',sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40)},'d'.repeat(64),{...f.env,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main'},start,{...f.c.admission,role:'production',liveControlReserve:100000},authorization('production'));
    const main={object:{sha:c.sourceCommit}},run={id:456,head_sha:c.sourceCommit,created_at:new Date(start+130000).toISOString(),actor:{id:40179660},triggering_actor:{id:40179660},run_attempt:1,path:'.github/workflows/pr.yml',event:'workflow_dispatch',head_branch:'main'};
    const artifact={id:789,name:bridge.artifactName(c),expired:false,expires_at:new Date(start+86400000).toISOString(),workflow_run:{head_sha:c.sourceCommit,id:456},digest:'sha256:'+'f'.repeat(64)};
    const bytes=archiveAuthorization(c.authorization),native=nativeAuthorization(c.authorization);
    const github={rest:{pulls:{get:async()=>({data:{merged_at:new Date(start).toISOString(),base:{ref:'main'},merge_commit_sha:c.sourceCommit}})},git:{getRef:async()=>({data:main}),getCommit:async()=>({data:{tree:{sha:c.sourceTree},parents:[{sha:c.baseCommit}]}})},actions:{
      getWorkflowRun:async({run_id}:any)=>({data:run_id===321?native.run:{head_sha:c.sourceCommit,run_attempt:1,status:'in_progress',event:'workflow_dispatch',path:'.github/workflows/deploy.yml'}}),getArtifact:async()=>({data:native.artifact}),
      listArtifactsForRepo:async()=>({data:{artifacts:[{...native.artifact,name:'operator-ledger-'+c.authorization.authorization.ledgerId}]}}),downloadArtifact:async()=>({data:bytes}),listWorkflowRuns:async()=>({data:{workflow_runs:[run]}}),listWorkflowRunArtifacts:async()=>({data:{artifacts:[artifact]}}),listJobsForWorkflowRun:async()=>({data:{jobs:[{name:'Retain operator corpus proof (no cloud credentials)',status:'completed',conclusion:'success'}]}})}}};return {...f,c,main,run,artifact,github};}
  it('accepts an owner upload at the exact merged main commit without open-PR assumptions',async()=>{const f=setup();await expect(bridge.find({github:f.github,challenge:f.c,now:f.now})).resolves.toMatchObject({runId:456,artifactId:789});const dir=mkdtempSync(join(tmpdir(),'merged-operator-'));try{bridge.upload({now:f.now,context:{repo:{owner:'TJ-Frederick',repo:'TheologAI'},eventName:'workflow_dispatch',sha:f.c.sourceCommit},core:{setOutput:vi.fn()},environment:{GITHUB_ACTOR_ID:'40179660',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/main',RUNNER_TEMP:dir,OPERATOR_PROOF_JSON:JSON.stringify({schemaVersion:'theologai-operator-corpus-envelope.v1',challenge:f.c,receipt:{sourceCommit:f.c.sourceCommit}})}});expect(existsSync(join(dir,'operator-proof-envelope.json'))).toBe(true);}finally{rmSync(dir,{recursive:true,force:true});}});
  for(const fault of ['moved-main','unmerged-head','preview-branch','other-actor','rerun'])it('rejects '+fault,async()=>{const f=setup();if(fault==='moved-main')f.main.object.sha='f'.repeat(40);if(fault==='unmerged-head')f.run.head_sha='e'.repeat(40);if(fault==='preview-branch')f.run.head_branch='codex/security-checkout-continuation';if(fault==='other-actor')f.run.triggering_actor.id=1;if(fault==='rerun')f.run.run_attempt=2;if(fault==='moved-main')await expect(bridge.find({github:f.github,challenge:f.c,now:f.now})).rejects.toThrow('live merged production');else await expect(bridge.find({github:f.github,challenge:f.c,now:f.now})).resolves.toBeNull();});

});

describe('explicit successor operation authorization',()=>{
  function setup(role: 'preview'|'production'='preview') {
    const p=authorization(role),bytes=archiveAuthorization(p),native=nativeAuthorization(p),a=p.authorization;
    const target={id:123,head_sha:a.sourceCommit,status:'in_progress',run_attempt:1,event:role==='preview'?'pull_request':'workflow_dispatch',path:role==='preview'?'.github/workflows/pr.yml':'.github/workflows/deploy.yml',pull_requests:[{number:172,head:{sha:a.sourceCommit},base:{sha:a.baseCommit}}]};
    const pr={number:172,state:'open',draft:false,merged_at:role==='production'?new Date(start).toISOString():null,merge_commit_sha:a.sourceCommit,base:{ref:'main',sha:a.baseCommit},head:{sha:a.sourceCommit,ref:a.headBranch,repo:{full_name:a.repository}},labels:[{name:'deploy-preview'}]};
    const main={object:{sha:role==='preview'?a.baseCommit:a.sourceCommit}};
    const marker={...native.artifact,id:655,name:'operator-ledger-'+a.ledgerId};
    const state={submitted:true,duplicates:false,duplicateMarker:false,bytes};
    const jobs=[{name:'Retain operator operation authorization (no cloud credentials)',status:'completed',conclusion:'success'}];
    const github={rest:{repos:{listPullRequestsAssociatedWithCommit:async()=>({data:[pr]})},pulls:{get:async()=>({data:pr})},git:{getRef:async()=>({data:main}),getCommit:async()=>({data:{tree:{sha:a.sourceTree},parents:[{sha:a.baseCommit}]}})},actions:{
      getWorkflowRun:async({run_id}:any)=>({data:Number(run_id)===321?native.run:target}),listJobsForWorkflowRun:async()=>({data:{jobs}}),
      listArtifactsForRepo:async({name}:any)=>({data:{artifacts:!state.submitted?[]:name.startsWith('operator-ledger-')?(state.duplicateMarker?[marker,marker]:[marker]):(state.duplicates?[native.artifact,native.artifact]:[native.artifact])}}),
      downloadArtifact:async()=>({data:state.bytes}),getArtifact:async()=>({data:native.artifact})}}};
    const expected={role,pullRequestNumber:172,headBranch:a.headBranch,sourceCommit:a.sourceCommit,sourceTree:a.sourceTree,baseCommit:a.baseCommit,sourcePlanSha256:a.sourcePlanSha256,targetRunId:'123',targetRunAttempt:1};
    return {p,a,bytes,native,marker,state,target,pr,main,jobs,github,expected,now:start+180000};
  }
  for(const role of ['preview','production'] as const)it('admits only an explicit owner operation for '+role,async()=>{
    const f=setup(role),directory=mkdtempSync(join(tmpdir(),'authorization-owner-'));
    try {
      f.state.submitted=false;const outputs=vi.fn();
      await authority.uploadAuthorization({github:f.github,context:{repo:{owner:'TJ-Frederick',repo:'TheologAI'},eventName:'workflow_dispatch',sha:f.a.sourceCommit,runId:321},core:{setOutput:outputs},environment:{GITHUB_ACTOR_ID:'40179660',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/'+f.a.headBranch,OPERATOR_AUTHORIZATION_JSON:JSON.stringify(f.a),RUNNER_TEMP:directory},now:f.now});
      expect(JSON.parse(readFileSync(join(directory,'operator-authorization.json'),'utf8'))).toEqual(f.a);
      expect(outputs).toHaveBeenCalledWith('artifact_name','operator-authorization-123-attempt-1');
      f.state.submitted=true;await expect(authority.findAuthorization({github:f.github,expected:f.expected,now:f.now})).resolves.toEqual(f.p);
      const environment={...fixture().env,GITHUB_EVENT_NAME:role==='preview'?'pull_request':'workflow_dispatch',GITHUB_REF:role==='preview'?'refs/pull/172/merge':'refs/heads/main'};
      const c=createOperatorChallenge(role as 'preview'|'production',{releasePolicy:'corpus.v1',sourceCommit:f.a.sourceCommit,sourceTree:f.a.sourceTree},f.a.sourcePlanSha256,environment,start,{...fixture().c.admission,role:role as 'preview'|'production',liveControlReserve:100000},f.p);
      expect(c.authorization.authorization.authorizationId).toBe(f.a.authorizationId);
    }finally{rmSync(directory,{recursive:true,force:true});}
  });
  for(const fault of ['wrong-pr','wrong-source','wrong-tree','wrong-base','wrong-branch','wrong-role','wrong-plan','wrong-run','old-pr170','inherited','not-explicit','wider-cap','extra','expiry'])it('refuses authorization '+fault,()=>{
    const f=setup(),a={...f.a};
    if(fault==='wrong-pr')a.pullRequestNumber=173;if(fault==='wrong-source')a.sourceCommit='f'.repeat(40);if(fault==='wrong-tree')a.sourceTree='f'.repeat(40);if(fault==='wrong-base')a.baseCommit='f'.repeat(40);if(fault==='wrong-branch')a.headBranch='other';if(fault==='wrong-role')a.role='production';if(fault==='wrong-plan')a.sourcePlanSha256='f'.repeat(64);if(fault==='wrong-run')a.targetRunId='999';if(fault==='old-pr170')a.authorizationId='retired-operation-id';if(fault==='inherited')a.previousReadsSpentOrReserved=1;if(fault==='not-explicit')a.outstandingPriorReservationsAccepted=false;if(fault==='wider-cap')a.hardReadCap=4000000;if(fault==='extra')(a as any).predecessor='old';if(fault==='expiry')a.expiresAt=new Date(f.now-1).toISOString();
    expect(()=>authority.requireAuthorization(a,f.expected,f.now)).toThrow();
  });
  for(const fault of ['actor','triggering-actor','dispatch-branch','dispatch-source','attempt','native-digest','archive-content','expired-artifact','duplicate','reused-ledger','failed-upload','moved-head','moved-base','moved-main'])it('fails closed on authenticated handoff '+fault,async()=>{
    const f=setup();
    if(fault==='actor')f.native.run.actor.id=1;if(fault==='triggering-actor')f.native.run.triggering_actor.id=1;if(fault==='dispatch-branch')f.native.run.head_branch='other';if(fault==='dispatch-source')f.native.run.head_sha='f'.repeat(40);if(fault==='attempt')f.native.run.run_attempt=2;
    if(fault==='native-digest')f.native.artifact.digest='sha256:'+'f'.repeat(64);if(fault==='archive-content')f.state.bytes=Buffer.from('invalid');if(fault==='expired-artifact')f.native.artifact.expired=true;if(fault==='duplicate')f.state.duplicates=true;if(fault==='reused-ledger')f.state.duplicateMarker=true;if(fault==='failed-upload')f.jobs[0]!.conclusion='failure';
    if(fault==='moved-head')f.pr.head.sha='f'.repeat(40);if(fault==='moved-base')f.pr.base.sha='f'.repeat(40);if(fault==='moved-main')f.main.object.sha='f'.repeat(40);
    await expect((async()=>{await authority.requireLiveCandidate({github:f.github,authorization:f.a});return authority.findAuthorization({github:f.github,expected:f.expected,now:f.now});})()).rejects.toThrow();
  });
  it('waits before protected approval, then rechecks source and expiry after the artifact arrives',async()=>{
    const f=setup(),directory=mkdtempSync(join(tmpdir(),'authorization-wait-'));let now=f.now;
    try{f.state.submitted=false;const revalidate=vi.fn(async()=>authority.requireLiveCandidate({github:f.github,authorization:f.a}));const outputs=vi.fn();
      const result=await authority.waitForAuthorization({github:f.github,expected:f.expected,revalidate,core:{setOutput:outputs},environment:{RUNNER_TEMP:directory},now:()=>now,wait:true,pause:async()=>{now+=15000;f.state.submitted=true;}});
      expect(result).toEqual(f.p);expect(revalidate).toHaveBeenCalledTimes(3);expect(outputs).toHaveBeenCalledWith('authorization_sha256',sha(readFileSync(join(directory,'operator-authorization.json'),'utf8')));
      f.state.submitted=false;await expect(authority.waitForAuthorization({github:f.github,expected:f.expected,revalidate,core:{setOutput:outputs},environment:{RUNNER_TEMP:directory},now:()=>now,wait:true,pause:async()=>{now+=15000;f.pr.head.sha='f'.repeat(40);}})).rejects.toThrow('live preview');
    }finally{rmSync(directory,{recursive:true,force:true});}
  });
  it('prints a copyable, source-bound grant draft while waiting and requires explicit owner choices',async()=>{
    const f=setup('production');
    f.state.submitted=false;
    let now=f.now;
    const info=vi.fn(), output=vi.fn();
    const summary={addHeading:vi.fn().mockReturnThis(),addRaw:vi.fn().mockReturnThis(),
      addCodeBlock:vi.fn().mockReturnThis(),write:vi.fn().mockResolvedValue(undefined)};
    await expect(authority.waitForAuthorization({github:f.github,expected:f.expected,revalidate:async()=>{},
      core:{info,summary,setOutput:output},now:()=>now,wait:true,pause:async()=>{now+=3600000;}})).rejects.toThrow('admission window');
    const json=summary.addCodeBlock.mock.calls[0]![0] as string;
    expect(info.mock.calls[0]![0]).toContain(json);
    const draft=JSON.parse(json);
    expect(Object.keys(draft).sort()).toEqual(Object.keys(f.a).sort());
    expect(draft).toMatchObject({...f.expected,databaseId:TARGETS.production.databaseId,repository:f.a.repository,ownerActorId:40179660,
      assignments:{preview:{databaseId:null,deploymentId:null,versionId:null},production:{databaseId:null,deploymentId:null,versionId:null}},
      notBefore:null,expiresAt:null,accountReadsHeld:null,accountWritesHeld:null,reservedReads:null,
      liveControlReserve:null,expectedLedgerSha256:null,outstandingPriorReservationsAccepted:null});
    expect(()=>authority.requireAuthorization(draft,f.expected,f.now)).toThrow();
    expect(output).not.toHaveBeenCalled();
  });
  it('times out without cloud I/O or admission when no owner authority arrives',async()=>{
    const f=setup();f.state.submitted=false;let now=f.now;const output=vi.fn();
    await expect(authority.waitForAuthorization({github:f.github,expected:f.expected,revalidate:async()=>{},core:{setOutput:output},environment:{},now:()=>now,wait:true,pause:async()=>{now+=3600000;}})).rejects.toThrow('admission window');expect(output).not.toHaveBeenCalled();
  });
});

describe('fresh parallel operator gate',()=>{
  function gateFixture(){
    const f=fixture(),bytes=archiveAuthorization(f.c.authorization),native=nativeAuthorization(f.c.authorization),a=f.c.authorization.authorization;
    const marker={...native.artifact,id:655,name:'operator-ledger-'+a.ledgerId};
    const metadata:Record<string,any>={
      '/actions/runs/321':native.run,'/actions/artifacts/654':native.artifact,
      ['/actions/artifacts?name=operator-ledger-'+a.ledgerId+'&per_page=100']:{artifacts:[marker]},
      '/actions/runs/123':{head_sha:a.sourceCommit,run_attempt:1,path:'.github/workflows/pr.yml',event:'pull_request',status:'in_progress'},
      '/actions/runs/123/jobs?per_page=100':{jobs:[{name:'Deploy Preview',status:'in_progress'}]},
      '/pulls/172':{state:'open',draft:false,head:{sha:a.sourceCommit,ref:a.headBranch,repo:{full_name:a.repository}},base:{sha:a.baseCommit,ref:'main'},labels:[{name:'deploy-preview'}]},
      '/git/ref/heads/main':{object:{sha:a.baseCommit}},
    };
    return {...f,bytes,metadata,marker,archives:new Map([['654',bytes],['655',bytes]])};
  }
  it('uses the identical nine GETs and validators, with no reuse between commands',async()=>{
    vi.useFakeTimers();vi.setSystemTime(start);
    try{
      const f=gateFixture(),serial:string[]=[],parallel:string[]=[];
      requireLiveOperatorGate(f.c,path=>{serial.push(path);return f.metadata[path];},id=>{serial.push('zip:'+id);return f.archives.get(id)!;});
      for(let command=0;command<4;command++){
        const archives=vi.fn(async(id:string)=>{parallel.push('zip:'+id);return f.archives.get(id)!;});
        await requireLiveOperatorGateParallel(f.c,async path=>{parallel.push(path);return f.metadata[path];},archives);
        expect(parallel.slice(command*9).sort()).toEqual([...serial].sort());expect(archives).toHaveBeenCalledTimes(2);
      }
      expect(parallel).toHaveLength(36);
    }finally{vi.useRealTimers();}
  });
  for(const fault of ['owner','expired-artifact','marker-source','duplicate-marker','run-completed','source','job-waiting','label','main','authorization-bytes','marker-bytes','expiry'])it('retains serial rejection for '+fault,async()=>{
    vi.useFakeTimers();vi.setSystemTime(start);
    try{
      const f=gateFixture();
      if(fault==='owner')f.metadata['/actions/runs/321'].actor.id=1;
      if(fault==='expired-artifact')f.metadata['/actions/artifacts/654'].expired=true;
      if(fault==='marker-source')f.marker.workflow_run={...f.marker.workflow_run,head_sha:'f'.repeat(40)};
      if(fault==='duplicate-marker')f.metadata['/actions/artifacts?name=operator-ledger-'+f.c.authorization.authorization.ledgerId+'&per_page=100'].artifacts.push(f.marker);
      if(fault==='run-completed')f.metadata['/actions/runs/123'].status='completed';
      if(fault==='source')f.metadata['/actions/runs/123'].head_sha='f'.repeat(40);
      if(fault==='job-waiting')f.metadata['/actions/runs/123/jobs?per_page=100'].jobs[0].status='waiting';
      if(fault==='label')f.metadata['/pulls/172'].labels=[];
      if(fault==='main')f.metadata['/git/ref/heads/main'].object.sha='f'.repeat(40);
      if(fault==='authorization-bytes')f.archives.set('654',Buffer.from('invalid'));
      if(fault==='marker-bytes')f.archives.set('655',Buffer.from('invalid'));
      if(fault==='expiry')vi.setSystemTime(start+5_400_001);
      expect(()=>requireLiveOperatorGate(f.c,path=>f.metadata[path],id=>f.archives.get(id)!)).toThrow();
      const sql=vi.fn();await expect(requireLiveOperatorGateParallel(f.c,async path=>f.metadata[path],async id=>f.archives.get(id)!).then(sql)).rejects.toThrow();expect(sql).not.toHaveBeenCalled();
    }finally{vi.useRealTimers();}
  });
  it('settles all independent failures and never fetches archives or permits SQL on partial evidence',async()=>{
    vi.useFakeTimers();vi.setSystemTime(start);
    try{
      const f=gateFixture(),settled:string[]=[],archive=vi.fn(async()=>f.bytes),sql=vi.fn();
      const gate=requireLiveOperatorGateParallel(f.c,async path=>{await new Promise(resolve=>setTimeout(resolve,path.includes('jobs?')?20:10));settled.push(path);if(path==='/pulls/172')throw Error('synthetic metadata failure');return f.metadata[path];},archive).then(sql);
      const rejected=expect(gate).rejects.toThrow('synthetic metadata failure');await vi.advanceTimersByTimeAsync(20);await rejected;
      expect(settled).toHaveLength(7);expect(archive).not.toHaveBeenCalled();expect(sql).not.toHaveBeenCalled();
    }finally{vi.useRealTimers();}
  });
  it('settles both archive reads and permits no SQL after a partial archive failure',async()=>{
    vi.useFakeTimers();vi.setSystemTime(start);
    try{
      const f=gateFixture(),settled:string[]=[],sql=vi.fn();
      const gate=requireLiveOperatorGateParallel(f.c,async path=>f.metadata[path],async id=>{await new Promise(resolve=>setTimeout(resolve,id==='654'?10:20));settled.push(id);if(id==='654')throw Error('synthetic archive failure');return f.bytes;}).then(sql);
      const rejected=expect(gate).rejects.toThrow('synthetic archive failure');await vi.advanceTimersByTimeAsync(20);await rejected;expect(settled.sort()).toEqual(['654','655']);expect(sql).not.toHaveBeenCalled();
    }finally{vi.useRealTimers();}
  });
  it('never downloads archive bytes for unvalidated artifact or marker provenance',async()=>{
    vi.useFakeTimers();vi.setSystemTime(start);
    try{for(const member of ['artifact','marker']){const f=gateFixture();if(member==='artifact')f.metadata['/actions/artifacts/654'].workflow_run.head_sha='f'.repeat(40);else (f.marker as any).id='unvalidated';const archive=vi.fn(async()=>f.bytes);await expect(requireLiveOperatorGateParallel(f.c,async path=>f.metadata[path],archive)).rejects.toThrow();expect(archive).not.toHaveBeenCalled();}}
    finally{vi.useRealTimers();}
  });
  for(const status of [401,403,404,429,502,503,504])it('preserves metadata HTTP policy asynchronously for '+status,async()=>{
    const invoke=vi.fn().mockRejectedValueOnce({stderr:`gh: rejected (HTTP ${status})`}).mockResolvedValue('{"ok":true}'),pause=vi.fn(async()=>{});
    if(status>=500){await expect(readLiveOperatorMetadataAsync(OPERATOR_PROOF.repository,'/actions/runs/123',invoke,pause)).resolves.toEqual({ok:true});expect(invoke).toHaveBeenCalledTimes(2);expect(pause).toHaveBeenCalledExactlyOnceWith(250);}
    else{await expect(readLiveOperatorMetadataAsync(OPERATOR_PROOF.repository,'/actions/runs/123',invoke,pause)).rejects.toThrow('HTTP '+status);expect(invoke).toHaveBeenCalledOnce();expect(pause).not.toHaveBeenCalled();}
  });
  it('does not retry malformed/unknown errors and refuses routes outside the original GET allowlist',async()=>{
    const malformed=vi.fn(async()=>'{'),pause=vi.fn(async()=>{});await expect(readLiveOperatorMetadataAsync(OPERATOR_PROOF.repository,'/actions/runs/123',malformed,pause)).rejects.toThrow();expect(malformed).toHaveBeenCalledOnce();
    const unknown=vi.fn(async()=>{throw Error('synthetic timeout');});await expect(readLiveOperatorMetadataAsync(OPERATOR_PROOF.repository,'/actions/runs/123',unknown,pause)).rejects.toThrow('synthetic timeout');expect(unknown).toHaveBeenCalledOnce();
    for(const path of ['/d1/query','/actions/workflows/pr.yml/dispatches'])await expect(readLiveOperatorMetadataAsync(OPERATOR_PROOF.repository,path,malformed,pause)).rejects.toThrow('GET route');expect(malformed).toHaveBeenCalledOnce();expect(pause).not.toHaveBeenCalled();
  });
});
