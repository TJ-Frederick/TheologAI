import {describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,readFileSync,copyFileSync,existsSync,rmSync,mkdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {createOperatorChallenge,requireOperatorChallenge,operatorApproval,verifyOperatorEnvelope,finishOperatorMetadata,admitOperatorBudget,spentOperatorBudget,OPERATOR_PROOF} from '../../../scripts/operator-corpus-proof.js';
import {ACCOUNT,CORPUS,SCHEMA,TARGETS,classifyApplicationRelease} from '../../../scripts/application-release-policy.mjs';
import {ALL_FTS} from '../../../scripts/corpus-source-proof.js';
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const start=Date.parse('2026-10-30T00:05:00Z');
function fixture() {
  const classification={sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40)};
  const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:OPERATOR_PROOF.repository,GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123',GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/pull/167/merge',OPERATOR_BASE_COMMIT:'c'.repeat(40)};
  const c=createOperatorChallenge('preview',classification,'d'.repeat(64),env,start);
  const tables=Object.fromEntries(Array.from({length:39},(_,i)=>['table'+i,{rows:1,sha256:'e'.repeat(64)}]));
  const plan={schemaVersion:'theologai-application-corpus-source-plan.v1',classification,readBudget:3510997,integrityCommands:4,expected:{digests:tables}};
  const receipt={schemaVersion:'theologai-fresh-complete-corpus-proof.v1',role:'preview',accountId:ACCOUNT,...TARGETS.preview,
    ...classification,corpusIdentity:CORPUS,schema:SCHEMA,startedAt:new Date(start+1000).toISOString(),completedAt:new Date(start+120_000).toISOString(),
    sourcePlanSha256:c.sourcePlanSha256,approvalSha256:sha(JSON.stringify(operatorApproval(c))),readBudget:3510997,controlsUnchanged:true,
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
  it('keeps the approved complete proof/read/write reservation unchanged',()=>{const f=fixture();expect(operatorApproval(f.c)).toEqual({schemaVersion:'theologai-fresh-corpus-proof-approval.v1',role:'preview',accountId:ACCOUNT,databaseId:TARGETS.preview.databaseId,sourceCommit:f.c.sourceCommit,sourceTree:f.c.sourceTree,expiresAt:f.c.expiresAt,maxReads:3800000,integrityCommands:4,exclusiveDataWritesDuringProof:true});});
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
    if(fault==='budget-overrun'){e.budget.previousReadsSpentOrReserved=290000;e.budget.cumulativeReadsSpentOrReserved=291000;}
    if(fault==='write-overrun'){e.budget.previousDiagnosticCommands=1;e.budget.cumulativeDiagnosticCommands=5;}
    if(fault==='budget-reset')e.budget.cumulativeReadsSpentOrReserved=0;
    if(fault==='extra-field')e.unreviewed=true;
    expect(()=>verifyOperatorEnvelope(e,f.c,f.plan,f.now)).toThrow();
  });
  it('preserves earlier small failures within the same cumulative authorization',()=>{const f=fixture();f.envelope.budget.previousReadsSpentOrReserved=100;f.envelope.budget.cumulativeReadsSpentOrReserved=1100;expect(()=>verifyOperatorEnvelope(f.envelope,f.c,f.plan,f.now)).not.toThrow();});
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
  it('retries only a transient metadata tail once, never an SQL/identity error',async()=>{
    const finish=vi.fn().mockRejectedValueOnce(Error('Corpus transport refused: analytics errors')).mockResolvedValue({controlsUnchanged:true});const retry=vi.fn().mockResolvedValue(undefined);
    await expect(finishOperatorMetadata(finish,retry)).resolves.toEqual({controlsUnchanged:true});expect(finish).toHaveBeenCalledTimes(2);expect(retry).toHaveBeenCalledOnce();
    for(const reason of ['controls changed','failed or ambiguous single attempt; no retry or cleanup','analytics incomplete or sampled']){const fn=vi.fn().mockRejectedValue(Error('Corpus transport refused: '+reason));const r=vi.fn();await expect(finishOperatorMetadata(fn,r)).rejects.toThrow(reason);expect(fn).toHaveBeenCalledOnce();expect(r).not.toHaveBeenCalled();}
    const persistent=vi.fn().mockRejectedValue(Error('Corpus transport refused: analytics errors'));await expect(finishOperatorMetadata(persistent,retry)).rejects.toThrow();expect(persistent).toHaveBeenCalledTimes(2);
  });
});

describe('operator cumulative budget',()=>{
  const ledger=()=>({schemaVersion:'theologai-operator-proof-budget.v1',authorizationId:String(OPERATOR_PROOF.previewAuthorization),readsSpentOrReserved:100,writesSpentOrReserved:0,diagnosticCommands:0,attempts:[{status:'FAILED_OR_AMBIGUOUS'}]});
  it('can fund a complete fresh retry after an early failure without resetting prior reads',()=>{const f=fixture();expect(()=>admitOperatorBudget(ledger(),f.c,3510997)).not.toThrow();});
  for(const fault of ['reads','writes','commands','running','passed','identity','negative'])it('stops before SQL for '+fault,()=>{const f=fixture();const l=ledger();if(fault==='reads')l.readsSpentOrReserved=289004;if(fault==='writes')l.writesSpentOrReserved=1;if(fault==='commands')l.diagnosticCommands=1;if(fault==='running')l.attempts[0]!.status='RUNNING';if(fault==='passed')l.attempts[0]!.status='PASSED';if(fault==='identity')l.authorizationId='different';if(fault==='negative')l.readsSpentOrReserved=-1;expect(()=>admitOperatorBudget(l,f.c,3510997)).toThrow();});
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
    const f=fixture();const run={id:456,head_sha:f.c.sourceCommit,created_at:new Date(start+130000).toISOString(),actor:{id:40179660},triggering_actor:{id:40179660},run_attempt:1,path:'.github/workflows/pr.yml',event:'workflow_dispatch',head_branch:'codex/sec06-preview-credential-assessment'};
    const artifact={id:789,name:bridge.artifactName(f.c),expired:false,expires_at:new Date(start+86400000).toISOString(),workflow_run:{head_sha:f.c.sourceCommit,id:456},digest:'sha256:'+'f'.repeat(64)};
    const job={name:'Retain operator corpus proof (no cloud credentials)',status:'completed',conclusion:'success'};
    const pr={state:'open',draft:false,head:{repo:{full_name:f.c.repository},sha:f.c.sourceCommit},base:{sha:f.c.baseCommit},labels:[{name:'deploy-preview'}]};
    const runs=[run];const github={rest:{pulls:{get:async()=>({data:pr})},actions:{listWorkflowRuns:async()=>({data:{workflow_runs:runs}}),listWorkflowRunArtifacts:async()=>({data:{artifacts:[artifact]}}),listJobsForWorkflowRun:async()=>({data:{jobs:[job]}})}}};
    return {...f,run,artifact,job,pr,runs,github};
  }
  it('accepts only the owner authenticated dispatch with an immutable source-bound artifact',async()=>{const f=setup();await expect(bridge.find({github:f.github,challenge:f.c,now:f.now})).resolves.toMatchObject({runId:456,artifactId:789});});
  it('hands the owner artifact through the real protected and downstream acceptance CLIs without SQL',async()=>{
    const f=setup(); const directory=mkdtempSync(join(tmpdir(),'theologai-operator-handoff-'));
    try {
      // A clean disposable Git source exercises the real dirty/source guards too.
      const sourceRoot=join(directory,'source');
      execFileSync('git',['clone','--shared','--no-checkout',process.cwd(),sourceRoot],{stdio:'pipe'});
      const git=(args:string[])=>execFileSync('git',args,{cwd:sourceRoot,stdio:'pipe'});
      git(['sparse-checkout','init','--cone']);git(['sparse-checkout','set','scripts','release','src','data','migrations']);git(['checkout','--detach','HEAD']);
      for(const name of ['operator-corpus-proof.ts','application-corpus-check.ts','application-release-policy.mjs','corpus-proof-transport.ts'])copyFileSync(resolve('scripts',name),join(sourceRoot,'scripts',name));
      git(['add','scripts']);git(['-c','user.name=Operator proof test','-c','user.email=test@example.invalid','commit','--allow-empty','-m','Test exact operator proof source']);
      symlinkSync(resolve('node_modules'),join(sourceRoot,'node_modules'),'dir');
      const source=classifyApplicationRelease(sourceRoot);
      f.plan.classification=source;
      f.c.sourceCommit=source.sourceCommit;f.c.sourceTree=source.sourceTree;
      const planText=JSON.stringify(f.plan);f.c.sourcePlanSha256=sha(planText);
      Object.assign(f.envelope.receipt,{sourceCommit:source.sourceCommit,sourceTree:source.sourceTree,sourcePlanSha256:f.c.sourcePlanSha256,approvalSha256:sha(JSON.stringify(operatorApproval(f.c)))});
      const controls=['production','preview'].map(role=>({role,deploymentId:role,versionId:role==='preview'?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222',databaseId:TARGETS[role as 'preview'|'production'].databaseId}));
      f.envelope.receipt.controls=controls as typeof f.envelope.receipt.controls;
      f.run.head_sha=source.sourceCommit;f.artifact.workflow_run.head_sha=source.sourceCommit;f.pr.head.sha=source.sourceCommit;
      const uploadDir=join(directory,'upload');mkdirSync(uploadDir);
      const output=vi.fn(); const uploadContext={repo:{owner:'TJ-Frederick',repo:'TheologAI'},eventName:'workflow_dispatch',sha:source.sourceCommit};
      const uploadEnv={GITHUB_ACTOR_ID:'40179660',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/codex/sec06-preview-credential-assessment',RUNNER_TEMP:uploadDir,OPERATOR_PROOF_JSON:JSON.stringify(f.envelope)};
      expect(()=>bridge.upload({context:uploadContext,core:{setOutput:output},environment:{...uploadEnv,GITHUB_ACTOR_ID:'1'}})).toThrow('owner manual dispatch');
      expect(existsSync(join(uploadDir,'operator-proof-envelope.json'))).toBe(false);
      bridge.upload({context:uploadContext,core:{setOutput:output},environment:uploadEnv});
      expect(output).toHaveBeenCalledWith('artifact_name',bridge.artifactName(f.c));
      await expect(bridge.find({github:f.github,challenge:f.c,now:f.now})).resolves.toMatchObject({artifactId:789});
      const envelopeFile=join(directory,'operator-proof-envelope.json');copyFileSync(join(uploadDir,'operator-proof-envelope.json'),envelopeFile);
      const envelopeDigest=sha(readFileSync(envelopeFile,'utf8'));
      const challengeFile=join(directory,'challenge.json');writeFileSync(challengeFile,JSON.stringify(f.c));writeFileSync(join(directory,'plan.json'),planText);
      const preload=join(directory,'metadata-only.mjs');const calls=join(directory,'calls.jsonl');
      writeFileSync(preload,`import {appendFileSync} from 'node:fs';
        const NativeDate=Date;globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[${f.now}]));}static now(){return ${f.now};}};
        const controls=${JSON.stringify(controls)};
        globalThis.fetch=async(url,options)=>{
          if(options.method!=='GET')throw Error('SQL/analytics forbidden in acceptance');
          const path=new URL(url).pathname;appendFileSync(${JSON.stringify(calls)},JSON.stringify({path,method:options.method})+'\\n');
          const role=path.includes('/theologai-preview/')?'preview':'production';const c=controls.find(c=>c.role===role);
          const binding={type:'d1',name:'THEOLOGAI_DB',id:process.env.SYNTHETIC_CONTROL_DRIFT?'wrong':c.databaseId};
          const result=path.endsWith('/settings')?{bindings:[binding]}:path.endsWith('/deployments')?{deployments:[{id:c.deploymentId,versions:[{version_id:c.versionId,percentage:100}]}]}:{id:c.versionId,resources:{bindings:[binding]}};
          return Response.json({success:true,errors:[],result});
        };`);
      const invoke=(receipt:string,drift=false)=>spawnSync(process.execPath,['--import','tsx','--import',preload,'scripts/operator-corpus-proof.ts','accept',challengeFile,envelopeFile,directory,f.c.sourcePlanSha256,receipt],{
        cwd:sourceRoot,encoding:'utf8',timeout:15000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:'synthetic-acceptance-token',GITHUB_OUTPUT:join(directory,'outputs.txt'),...(drift?{SYNTHETIC_CONTROL_DRIFT:'true'}:{})},
      });
      const protectedReceipt=join(directory,'protected.json');const result=invoke(protectedReceipt);
      expect(result.status,result.stderr).toBe(0);expect(JSON.parse(readFileSync(protectedReceipt,'utf8'))).toEqual(f.envelope.receipt);
      expect(readFileSync(join(directory,'outputs.txt'),'utf8')).toBe('envelope_sha256='+envelopeDigest+'\n');
      expect(sha(readFileSync(envelopeFile,'utf8'))).toBe(envelopeDigest);
      const downstream=join(directory,'preview-readiness.json');const next=invoke(downstream);
      expect(next.status,next.stderr).toBe(0);expect(JSON.parse(readFileSync(downstream,'utf8'))).toEqual(f.envelope.receipt);
      expect(readFileSync(calls,'utf8').trim().split('\n')).toHaveLength(12);
      const drift=join(directory,'drift.json');expect(invoke(drift,true).status).toBe(1);expect(existsSync(drift)).toBe(false);
      const altered=structuredClone(f.envelope);altered.receipt.proof.ftsIntegrity.pop();writeFileSync(envelopeFile,JSON.stringify(altered));
      expect(sha(readFileSync(envelopeFile,'utf8'))).not.toBe(envelopeDigest);
      const incomplete=join(directory,'partial.json');expect(invoke(incomplete).status).toBe(1);expect(existsSync(incomplete)).toBe(false);
      expect(readFileSync(join(directory,'outputs.txt'),'utf8')).not.toContain('synthetic-acceptance-token');
    } finally {rmSync(directory,{recursive:true,force:true});}
  },45000);
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
    const pr={state:'open',draft:false,base:{ref:'main',sha:base},head:{sha:source,ref:'codex/sec06-preview-credential-assessment',repo:{full_name:OPERATOR_PROOF.repository}},labels:[{name:'deploy-preview'}]};
    const context={repo:{owner:'TJ-Frederick',repo:'TheologAI'},eventName:'pull_request',payload:{pull_request:{number:167,head:{sha:source}}}};
    const environment={GITHUB_REF:'refs/pull/167/merge',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123',OPERATOR_SOURCE_RUN_ID:'123'};
    const run={head_sha:source,path:'.github/workflows/pr.yml',event:'pull_request',run_attempt:1,pull_requests:[{number:167,head:{sha:source},base:{sha:base}}]};
    const jobs=['Select Validation','Test & Build','Fresh Checkout & Data','Node HTTP E2E','Worker Runtime & D1','Applicable MCP Conformance','Validation Complete','Build preview Worker artifact (no cloud credentials)'].map(name=>({name,status:'completed',conclusion:'success'}));
    const artifacts=['worker','corpus'].map(kind=>({name:`${kind}-preview-123-attempt-1`,expired:false,expires_at:new Date(Date.now()+86400000).toISOString(),workflow_run:{head_sha:source,id:123},digest:'sha256:'+'d'.repeat(64)}));
    const github={rest:{pulls:{get:async()=>({data:pr})},actions:{getWorkflowRun:async()=>({data:run}),listJobsForWorkflowRun:async()=>({data:{jobs}}),listWorkflowRunArtifacts:async()=>({data:{artifacts}})},git:{getCommit:async()=>({data:{tree:{sha:tree}}})}}};
    const outputs=vi.fn();return {source,base,tree,pr,context,environment,run,jobs,artifacts,github,core:{setOutput:outputs},outputs};
  }
  it('admits only the same complete normal CI/source artifacts and merge-ref preview route',async()=>{const f=setup();await verify(f);expect(f.outputs.mock.calls).toEqual([['source',f.source],['tree',f.tree],['base',f.base]]);});
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
