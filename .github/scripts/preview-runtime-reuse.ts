/** One preview-only runtime deployment with explicitly accepted historical corpus custody. */
import {createHash} from 'node:crypto';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {appendFileSync,lstatSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import Database from 'better-sqlite3';
import {EXISTING,CONTINUITY_QUERIES,NATIVE_ARTIFACTS,verifyHistoricalCandidate} from './validate-existing-norton-preview.js';
import {SOURCE_RECOVERY,verifyRecoveredNortonInputs,verifyRehearsalInputWitness,requireRehearsalNativeInputs} from './reconstruct-norton-source.js';
import {verifyRetainedInputEvidence} from './retained-norton-inputs.js';
import {classifyApplicationRelease} from '../../scripts/norton-aquinas-release-policy.mjs';
import {verifyManifest,renderDeploymentConfig} from '../../scripts/worker-release-artifact.mjs';
import {createCorpusApi} from '../../scripts/corpus-release-api.js';
import {captureCorpusUsage} from '../../scripts/corpus-release-control.js';
import {verifyPreviewWorkerDeployment} from '../../scripts/verify-preview-worker-deployment.js';
import {runPrimarySourceEdgeStabilization} from '../../scripts/audit-primary-source-edge-stabilization.js';
import {auditCorpusRelease,createCorpusRequestPacer} from '../../scripts/audit-corpus-release.js';
import {PREVIEW_PROFILE} from '../../scripts/audit-historical-core-preview.js';
const archive=createRequire(import.meta.url)('./operator-authorization.cjs');
export const REUSE=Object.freeze({schema:'norton-preview-runtime-reuse-approval.v1',expiresAt:'2026-11-12T02:45:14.748Z',
 originalInputRun:42660304971,originalInputArtifact:13694476684,originalInputDigest:'sha256:a26d1fd61f9e615a5153117b6e7ac548f0f0586ab81f29d746657f1ffe0a87b1',
 originalInputSource:'4220e376f05293c169aa5de2d0822c4bd8109b85',originalInputTree:'7708a1152d29a5407a3a21eee5cc7d056910f18e',
 provider:'src/services/historical/LocalPrimarySourceSearchProvider.ts',providerBlob:'66ee09d2d1e188c9ca2d277ed8ae6de09f6610b3',
 // Six complete17-call handoffs need102 logical metadata calls /114 HTTP exchanges with signed ZIP redirects.
 githubLogicalCalls:128,
 priorReads:7860000,newReads:100000,liveReads:90000,controls:10000,margin:200000,cumulativeCeiling:8160000,
 priorActualWrites:11,heldWrites:12,dailyCeiling:4000000,nov10ReadFloor:3365905,
 confirmation:'DEPLOY ONE OPTIMIZED PREVIEW WITH HISTORICAL CORPUS CUSTODY'});
export const VALIDATE=Object.freeze({schema:'norton-preview-runtime-validation-approval.v1',confirmation:'VALIDATE THE DEPLOYED OPTIMIZED PREVIEW WITHOUT DEPLOYMENT',
 sourceCommit:'ed80dc5da8b544950ee7d8dfc0387b57465b4c2b',sourceTree:'d8c3f1df008fd6a51bd63cc01522713e22d54126',
 worker:'9e2d5535-7edb-44d4-b0ea-61ad676836c1',deployment:'811dd5a7-589f-4169-ad98-304d58ece400',workerSha256:'fd63df7d8866c81000895f0c93943563804eadd297e0bf464f3ec6cfb383d327',
 versionSha256:'045261bc2d2dc5ddc394d28632a906f38d693bf0717fd2b7be7e5a39ccea0a84',productionVersionSha256:'d21f0359e612ba3aa85651dec30a7dc0d943023f33244acf6b1ef8febf86068b',
 failedRun:42878819164,producerRun:42878959338,stopArtifact:13793153724,stopDigest:'sha256:78bbb5ac94355df17e4d11b5f400589d6bc795cb5d186d98d819df50cf592b58',
 inputArtifact:13792728683,inputDigest:'sha256:5dab1ceaa9c03e30d7d4278dbd96861264767e06f6a068287db2e583a115b5a7',
 requestArtifact:13792094624,ledgerArtifact:13793920217,requestDigest:'sha256:69c65f284691be4c3568ea42139e0d6907a0799e13921dec7633543ff89579ec',requestSha256:'fc44174275b7d100439eab8055ec0f4c2db014ce064c19b84be139463f93d004',
 priorReads:7960000,finalReads:8060000,cumulativeCeiling:8260000,nov10ReadFloor:3471182});
const validating=(a:{schemaVersion:string})=>a.schemaVersion===VALIDATE.schema;
// The deployment purpose uses the existing owner handoff and shared preview lock.
export const SEARCH_DEPLOYMENT = Object.freeze({
 confirmation: 'DEPLOY ONE REVIEWED CLASSIC SEARCH FIX TO PREVIEW',
 priorReads: 8060000,
 cumulativeCeiling: 8360000,
 nov10ReadFloor: 3730566,
 path: 'src/kernel/editionProvenanceFoundation.ts',
 blob: 'd8819bfdbb49141831751551368a3e9c1522b306',
 workerSha256: '882f7501271ed77097ad3b6967d0708dbbdbab9b03af85cff2476bb188132a84',
});
function deploysSearchFix(a: ReuseApproval): boolean {
 return a.schemaVersion === REUSE.schema && a.confirmation === SEARCH_DEPLOYMENT.confirmation;
}
const STOP_FILES:Record<string,string>={'corpus-live.json':'53523e9b48f2dc012ed68a707bb0de2cb68abd8e1e96fb6dc3205d854ea16239','edge.json':'c2c6a01d700d5bd04d2cd3534f5fca74d7c10179404ce77c68d64afd55074b76','predecessor.json':'94fe998f2c621442f91d8e51dae0b16ca36b4f25b22d174b34f3d2a531938d49','runtime-reuse.events.jsonl':'150348ba06f7a92b07082ad5b8aa265363fc65dc47ffbaf8de9e6ab87ee509ce','upload-only.json':'36bbe9b5226699f090473169828aeb4ed4012cc4e6e152797e743bfa51604235'};
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const hash=(v:unknown)=>sha(JSON.stringify(v));
class ReuseRefusal extends Error { constructor(reason:string){super('Preview runtime reuse refused: '+reason);} }
function check(v:unknown,reason:string):asserts v{if(!v)throw new ReuseRefusal(reason);}
export function safeReuseFailure(error:unknown){return error instanceof ReuseRefusal&&error.message.length<=240?error.message:'Preview runtime reuse stopped: external or unknown failure';}
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function file(path:string,max=1024*1024):Buffer{const s=lstatSync(path);check(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=max,'bounded regular input');return readFileSync(path);}
const json=(path:string,max?:number)=>JSON.parse(file(path,max).toString());
const git=(root:string,...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
type Source={commit:string;tree:string};
export type ReuseApproval={schemaVersion:string;operationId:string;sourceCommit:string;sourceTree:string;targetRunId:string;targetRunAttempt:1;headBranch:string;notBefore:string;expiresAt:string;confirmation:string;
 historicalProofSha256:string;historicalExpiry:string;acceptHistoricalContinuityRisk:true;uninterruptedDataCustody:true;maxReads:100000;maxWrites:0;maxDeployments:0|1;
 previousReadsHeld:7860000|7960000|8060000;finalReadsHeld:7960000|8060000|8160000;uncertaintyMargin:200000;cumulativeReadCeiling:8160000|8260000|8360000;actualPriorDiagnosticWrites:11;heldDiagnosticWrites:12;
 dailyUsageDay:string;knownDailyReadFloor:number;unreportedInFlightReadReserve:number;knownDailyCandidateWrites:number};
export function requireReuseApproval(a:ReuseApproval,source:Source,now=Date.now()):ReuseApproval{
 const keys='acceptHistoricalContinuityRisk,actualPriorDiagnosticWrites,confirmation,cumulativeReadCeiling,dailyUsageDay,expiresAt,finalReadsHeld,headBranch,heldDiagnosticWrites,historicalExpiry,historicalProofSha256,knownDailyCandidateWrites,knownDailyReadFloor,maxDeployments,maxReads,maxWrites,notBefore,operationId,previousReadsHeld,schemaVersion,sourceCommit,sourceTree,targetRunAttempt,targetRunId,uncertaintyMargin,uninterruptedDataCustody,unreportedInFlightReadReserve';
 check(a&&Object.keys(a).sort().join(',')===keys,'closed owner approval');
 const validation=validating(a),budget=validation?VALIDATE:deploysSearchFix(a)?SEARCH_DEPLOYMENT:REUSE;
 check((validation||a.schemaVersion===REUSE.schema)&&a.confirmation===budget.confirmation&&(validation?/^operation-runtime-validation-[a-z0-9-]{8,80}$/:/^operation-runtime-reuse-[a-z0-9-]{8,80}$/).test(a.operationId),'single preview deployment purpose');
 check(/^[a-f0-9]{40}$/.test(a.sourceCommit)&&/^[a-f0-9]{40}$/.test(a.sourceTree)&&a.sourceCommit===source.commit&&a.sourceTree===source.tree,'exact source');
 check(/^[1-9][0-9]{0,15}$/.test(a.targetRunId)&&a.targetRunAttempt===1&&/^[a-zA-Z0-9_./-]{1,200}$/.test(a.headBranch),'exact PR execution target');
 check(a.historicalProofSha256===EXISTING.proofSha256&&a.historicalExpiry===REUSE.expiresAt&&a.acceptHistoricalContinuityRisk===true&&a.uninterruptedDataCustody===true,'explicit complete-proof custody risk');
 check(a.previousReadsHeld===budget.priorReads&&a.finalReadsHeld===budget.priorReads+REUSE.newReads&&a.maxReads===REUSE.newReads&&a.maxWrites===0&&a.maxDeployments===(validation?0:1)&&a.uncertaintyMargin===REUSE.margin&&a.cumulativeReadCeiling===budget.cumulativeCeiling&&a.actualPriorDiagnosticWrites===11&&a.heldDiagnosticWrites===12,'retained cumulative accounting');
 const day=new Date(now).toISOString().slice(0,10),start=Date.parse(a.notBefore),end=Date.parse(a.expiresAt);
 check(now>=Date.parse(EXISTING.proofCompletedAt)&&Number.isFinite(start)&&start<=now&&Number.isFinite(end)&&end>now&&end<=Date.parse(REUSE.expiresAt)&&end-start<=86400000&&a.dailyUsageDay===day,'owner window, proof expiry and UTC day');
 check(count(a.knownDailyReadFloor)&&a.knownDailyReadFloor>=(day==='2026-11-10'?budget.nov10ReadFloor:0)&&count(a.unreportedInFlightReadReserve)&&a.knownDailyReadFloor+a.unreportedInFlightReadReserve<=3700000&&a.knownDailyCandidateWrites===(day==='2026-11-10'?4:0),'dated known and unreported daily usage');
 return a;
}
const RELEASE_SCRIPT_CHANGES=new Set(['audit-corpus-release.ts','audit-primary-source-edge-stabilization.ts','corpus-proof-transport.ts','corpus-release-control.ts','dual-era-preview-release-receipt.ts','norton-aquinas-live.ts','norton-aquinas-preparation.ts','norton-aquinas-release-policy.mjs','operator-corpus-proof.ts']);
export function requireReuseSource(root:string,validation=false,searchFix=false):Source{
 const source={commit:git(root,'rev-parse','HEAD'),tree:git(root,'rev-parse','HEAD^{tree}')};
 const classification=classifyApplicationRelease(root);check(classification.sourceCommit===source.commit&&classification.sourceTree===source.tree,'clean classified source');
 if (searchFix) {
  check(git(root, 'diff', '--name-only', VALIDATE.sourceCommit, 'HEAD', '--', 'src', 'data', 'migrations') === SEARCH_DEPLOYMENT.path
   && git(root, 'rev-parse', 'HEAD:' + SEARCH_DEPLOYMENT.path) === SEARCH_DEPLOYMENT.blob, 'only reviewed classic search runtime delta');
 } else check(git(root,'diff','--name-only',EXISTING.sourceCommit,'HEAD','--','src','data','migrations')===REUSE.provider&&git(root,'rev-parse','HEAD:'+REUSE.provider)===REUSE.providerBlob,'only reviewed two-call runtime delta');
 if(validation)check(git(root,'diff','--name-only',VALIDATE.sourceCommit,'HEAD','--','src','data','migrations','package.json','package-lock.json','wrangler.toml','wrangler.ccel-coordinator.toml','.github/release-toolchain','.nvmrc')==='','tooling-only delta from deployed optimized source');
 const scripts=git(root,'diff','--name-only',EXISTING.sourceCommit,'HEAD','--','scripts').split('\n').filter(Boolean);
 check(scripts.every(path=>RELEASE_SCRIPT_CHANGES.has(path.slice(8))),'unchanged corpus construction and FTS definitions');
 for(const path of ['wrangler.toml','wrangler.ccel-coordinator.toml','package.json','package-lock.json','.nvmrc','.github/release-toolchain'])check(git(root,'ls-tree','-r',EXISTING.sourceCommit,'--',path)===git(root,'ls-tree','-r','HEAD','--',path),'unchanged bindings and dependencies');
 return source;
}
type Github=(path:string,binary?:boolean)=>Promise<any>;
export async function admitReuse(a:ReuseApproval,source:Source,github:Github,env:NodeJS.ProcessEnv,phase:'prepare'|'execute',at?:number){
 const clock=()=>at??Date.now();
 requireReuseApproval(a,source,clock());
 check(env.GITHUB_REPOSITORY===EXISTING.repository&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_RUN_ATTEMPT==='1'&&env.GITHUB_ACTOR_ID===String(EXISTING.owner)&&/^[1-9][0-9]{0,15}$/.test(env.GITHUB_RUN_ID??''),'owner single-attempt dispatch');
 const run=await github('/actions/runs/'+env.GITHUB_RUN_ID),pr=await github('/pulls/176'),main=await github('/git/ref/heads/main'),commit=await github('/git/commits/'+source.commit);
 check(String(run.id)===env.GITHUB_RUN_ID&&run.actor?.id===EXISTING.owner&&run.triggering_actor?.id===EXISTING.owner&&run.run_attempt===1&&run.event==='workflow_dispatch'&&run.path==='.github/workflows/pr.yml'&&run.head_sha===source.commit&&env.GITHUB_REF==='refs/heads/'+run.head_branch&&run.head_branch===a.headBranch,'authenticated exact-source dispatch');
 check(pr.state==='open'&&!pr.draft&&pr.base.ref==='main'&&pr.base.sha===EXISTING.base&&main.object.sha===EXISTING.base&&pr.head.sha===source.commit&&pr.head.ref===run.head_branch&&pr.head.repo.full_name===EXISTING.repository&&pr.labels.some((l:any)=>l.name==='deploy-preview')&&commit.tree.sha===source.tree,'open labeled exact PR and base');
 for(const workflow of ['pr.yml','language-source-reproduction.yml']){
  const ci=await github('/actions/workflows/'+workflow+'/runs?head_sha='+source.commit+'&event=pull_request&status=success&per_page=10');
  check(ci.workflow_runs.some((r:any)=>r.head_sha===source.commit&&r.conclusion==='success'&&r.event==='pull_request'&&r.path==='.github/workflows/'+workflow),'successful exact-head ordinary CI and source reproduction');
 }
 await requireReusePrTarget(a,source,github);
 const originalInputs=await requireRehearsalNativeInputs(github,{rehearsalRunId:REUSE.originalInputRun,rehearsalArtifactId:REUSE.originalInputArtifact,rehearsalArtifactDigest:REUSE.originalInputDigest},{commit:REUSE.originalInputSource,tree:REUSE.originalInputTree},clock());
 const markers=await github('/actions/artifacts?name=norton-preview-runtime-reuse-ledger-'+a.operationId+'&per_page=100');
 check(count(markers.total_count)&&Array.isArray(markers.artifacts)&&markers.total_count===markers.artifacts.length,'complete one-shot marker history');
 if(phase==='prepare')check(markers.total_count===0,'unused operation');
 else{
  check(markers.total_count===1,'one current-run operation marker');const m=markers.artifacts[0];
  check(count(m.id)&&m.id>0&&m.name==='norton-preview-runtime-reuse-ledger-'+a.operationId&&m.workflow_run?.id===Number(env.GITHUB_RUN_ID)&&m.workflow_run.head_sha===source.commit&&m.expired===false&&Date.parse(m.expires_at)>clock()&&/^sha256:[a-f0-9]{64}$/.test(m.digest),'same-run native marker');
  const bytes=await github('/actions/artifacts/'+m.id+'/zip',true);check('sha256:'+sha(Buffer.from(bytes))===m.digest,'native marker archive digest');check(hash(JSON.parse(archive.readArchiveFile(Buffer.from(bytes),m.digest,'runtime-reuse-request.json').toString()))===hash(a),'exact one-shot approval bytes');
 }
 requireReuseApproval(a,source,clock());
 return{runId:env.GITHUB_RUN_ID,operationId:a.operationId,source,ownerActorId:EXISTING.owner,originalInputs};
}
async function requireReusePrTarget(a:ReuseApproval,source:Source,github:Github){
 const run=await github('/actions/runs/'+a.targetRunId);
 check(String(run.id)===a.targetRunId&&run.event==='pull_request'&&run.path==='.github/workflows/pr.yml'&&run.head_sha===source.commit&&run.run_attempt===1&&run.pull_requests?.length===1&&run.pull_requests[0].number===176&&run.pull_requests[0].head.sha===source.commit&&run.pull_requests[0].base.sha===EXISTING.base,'bound existing PR run');
}
/** Native owner request selects this closed purpose only for its exact existing PR run. */
export async function findReuseHandoff(source:Source,github:Github,env:NodeJS.ProcessEnv,at?:number){
 const clock=()=>at??Date.now();
 check(env.GITHUB_REPOSITORY===EXISTING.repository&&env.GITHUB_EVENT_NAME==='pull_request'&&env.GITHUB_RUN_ATTEMPT==='1'&&env.GITHUB_REF==='refs/pull/176/merge'&&/^[1-9][0-9]{0,15}$/.test(env.GITHUB_RUN_ID??''),'protected existing PR execution event');
 const history=await github('/actions/artifacts?name=norton-preview-runtime-reuse-request-'+env.GITHUB_RUN_ID+'-attempt-1&per_page=100');
 check(count(history.total_count)&&Array.isArray(history.artifacts)&&history.total_count===history.artifacts.length&&history.total_count<=1,'unique owner runtime reuse request');if(!history.total_count)return null;
 const artifact=history.artifacts[0];check(artifact.name==='norton-preview-runtime-reuse-request-'+env.GITHUB_RUN_ID+'-attempt-1'&&count(artifact.id)&&artifact.id>0&&artifact.expired===false&&Date.parse(artifact.expires_at)>clock()+60000&&/^sha256:[a-f0-9]{64}$/.test(artifact.digest)&&artifact.workflow_run?.head_sha===source.commit,'owner request native artifact');
 const producer=await github('/actions/runs/'+artifact.workflow_run.id),jobs=await github('/actions/runs/'+producer.id+'/jobs?filter=latest&per_page=100');
 check(count(jobs.total_count)&&Array.isArray(jobs.jobs)&&jobs.total_count===jobs.jobs.length&&jobs.total_count<=100,'complete owner producer jobs');
 const sourceJobs=jobs.jobs.filter((j:any)=>j.name==='Verify deployed Norton candidate and distinct auditor (no cloud credentials)');check(sourceJobs.length===1,'one owner request producer');if(sourceJobs[0].status!=='completed')return{mode:'runtime-reuse-pending' as const};check(sourceJobs[0].conclusion==='success','successful owner request producer');
 const bytes=Buffer.from(await github('/actions/artifacts/'+artifact.id+'/zip',true));check('sha256:'+sha(bytes)===artifact.digest,'owner request archive digest');
 const a=JSON.parse(archive.readArchiveFile(bytes,artifact.digest,'runtime-reuse-request.json').toString());requireReuseApproval(a,source,clock());
 check(a.targetRunId===env.GITHUB_RUN_ID&&a.targetRunAttempt===1&&producer.id===artifact.workflow_run.id&&producer.head_branch===a.headBranch&&Date.parse(producer.created_at)>=Date.parse(a.notBefore)&&Date.parse(producer.created_at)<Date.parse(a.expiresAt),'owner request bound PR execution');
 const producerEnv={GITHUB_REPOSITORY:EXISTING.repository,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_ACTOR_ID:String(EXISTING.owner),GITHUB_RUN_ID:String(producer.id),GITHUB_REF:'refs/heads/'+a.headBranch};
 const admission=await admitReuse(a,source,github,producerEnv,'execute',at);
 const files=await github('/actions/runs/'+producer.id+'/artifacts?per_page=100');check(count(files.total_count)&&Array.isArray(files.artifacts)&&files.total_count===files.artifacts.length&&files.total_count<=100,'complete prepared input artifact history');
 const inputs=files.artifacts.filter((f:any)=>f.name==='existing-preview-inputs-'+producer.id+'-attempt-1');check(inputs.length===1,'one prepared runtime input package');const input=inputs[0];
 check(count(input.id)&&input.id>0&&input.expired===false&&Date.parse(input.expires_at)>clock()+600000&&input.workflow_run?.id===producer.id&&input.workflow_run.head_sha===source.commit&&/^sha256:[a-f0-9]{64}$/.test(input.digest)&&count(input.size_in_bytes)&&input.size_in_bytes<=128*1024*1024,'exact prepared input package provenance');
 requireReuseApproval(a,source,clock());return{mode:'runtime-reuse' as const,approval:a,source,admission,request:{id:artifact.id,digest:artifact.digest},inputs:{id:input.id,digest:input.digest,runId:producer.id}};
}
export async function admitReusePr(a:ReuseApproval,source:Source,github:Github,env:NodeJS.ProcessEnv,expected?:unknown){
 const handoff=await findReuseHandoff(source,github,env);check(handoff&&handoff.mode==='runtime-reuse'&&hash(handoff.approval)===hash(a),'exact admitted PR runtime reuse purpose');if(expected)check(hash(handoff)===hash(expected),'same admitted owner request and prepared inputs');return handoff;
}
export function verifyValidationPredecessor(directory:string){
 const stopped=join(directory,'prior-runtime-stop'),prior=join(directory,'prior-runtime-inputs');
 for(const[name,digest]of Object.entries(STOP_FILES))check(sha(file(join(stopped,name),512*1024))===digest,'exact prior failed-run '+name);
 const events=file(join(stopped,'runtime-reuse.events.jsonl')).toString().trim().split('\n').map(line=>JSON.parse(line)),last=events.at(-1),identity=events.find(e=>e.kind==='new-runtime-identity'),failed=events.find(e=>e.kind==='live-failed');
 check(last?.kind==='STOP'&&last.stage==='audit'&&last.mutationCommands===1&&last.retry===false&&last.rollback===false&&last.retainWholeNewReadReservation===100000&&failed.reportSha256===STOP_FILES['corpus-live.json'],'retained failed audit and full reservation');
 const expected={role:'preview',deploymentId:VALIDATE.deployment,versionId:VALIDATE.worker,databaseId:EXISTING.database,versionSha256:VALIDATE.versionSha256};
 check(identity.identity.deployedVersionId===VALIDATE.worker&&identity.identity.deploymentId===VALIDATE.deployment&&identity.identity.addedVersionIds.length===1&&hash(identity.assignments[1])===hash(expected)&&identity.assignments[0].versionSha256===VALIDATE.productionVersionSha256,'successful deployment inside failed validation run');
 const report=json(join(stopped,'corpus-live.json')),edge=json(join(stopped,'edge.json'));
 check(edge.passed===true&&report.failure?.lastHttpStatus===429&&report.failure.completedChecks===211&&report.failure.httpExchanges===224&&report.checks.length===211,'prior partial acceptance never complete');
 const request=json(join(prior,'runtime-reuse-request.json'));check(hash(request)===VALIDATE.requestSha256,'exact prior owner request');requireReuseApproval(request,{commit:VALIDATE.sourceCommit,tree:VALIDATE.sourceTree},Date.parse('2026-11-10T18:58:00Z'));
 const input=json(join(prior,'runtime-reuse-inputs.json')),manifest=json(join(directory,'prior-runtime-bundle/release-manifest.json'));
 check(input.source.commit===VALIDATE.sourceCommit&&input.source.tree===VALIDATE.sourceTree&&input.workerSha256===VALIDATE.workerSha256&&input.sourceDatabaseSha256===EXISTING.databaseSha256&&input.originalProofSha256===EXISTING.proofSha256&&input.freshProof===false&&input.manifestSha256===sha(file(join(directory,'prior-runtime-bundle/release-manifest.json'))),'prior owner-prepared source-bound inputs');
 check(manifest.sourceCommit===VALIDATE.sourceCommit&&manifest.sourceTree===VALIDATE.sourceTree&&manifest.target==='preview'&&manifest.files['worker.js']===VALIDATE.workerSha256&&['worker.js','worker.js.map'].every(name=>sha(file(join(directory,'prior-runtime-bundle',name),16*1024*1024))===manifest.files[name]),'retained optimized Worker bytes');
 const predecessor=json(join(stopped,'predecessor.json'));check(predecessor.source.commit===VALIDATE.sourceCommit&&predecessor.source.tree===VALIDATE.sourceTree&&predecessor.workerSha256===VALIDATE.workerSha256,'prior deployment source identity');
 return{deployedSource:{commit:VALIDATE.sourceCommit,tree:VALIDATE.sourceTree},deployedManifestSha256:input.manifestSha256,priorFailedRun:VALIDATE.failedRun,priorRunPassed:false,priorProducerRun:VALIDATE.producerRun,stopArtifact:VALIDATE.stopArtifact,stopDigest:VALIDATE.stopDigest,preparedArtifact:VALIDATE.inputArtifact,preparedDigest:VALIDATE.inputDigest,requestSha256:VALIDATE.requestSha256,reportSha256:STOP_FILES['corpus-live.json'],assignment:expected,freshProof:false};
}
/** Once before any provider read; repeated handoffs keep using the immutable prepared witness. */
export async function requireValidationNative(github:Github,now=Date.now()){
 const stopped=await github('/actions/runs/'+VALIDATE.failedRun),producer=await github('/actions/runs/'+VALIDATE.producerRun);
 check(stopped.id===VALIDATE.failedRun&&stopped.run_attempt===1&&stopped.event==='pull_request'&&stopped.path==='.github/workflows/pr.yml'&&stopped.status==='completed'&&stopped.conclusion==='failure'&&stopped.head_sha===VALIDATE.sourceCommit&&stopped.pull_requests?.some((p:any)=>p.number===176),'authenticated prior failed PR run');
 check(producer.id===VALIDATE.producerRun&&producer.run_attempt===1&&producer.event==='workflow_dispatch'&&producer.path==='.github/workflows/pr.yml'&&producer.status==='completed'&&producer.conclusion==='success'&&producer.head_sha===VALIDATE.sourceCommit&&producer.actor?.id===EXISTING.owner&&producer.triggering_actor?.id===EXISTING.owner,'authenticated prior owner preparation');
 for(const[runId,name,conclusion]of [[VALIDATE.failedRun,'Preview operator corpus verification','failure'],[VALIDATE.producerRun,'Verify deployed Norton candidate and distinct auditor (no cloud credentials)','success']]as const){const jobs=await github('/actions/runs/'+runId+'/jobs?filter=latest&per_page=100');check(jobs.total_count===jobs.jobs?.length&&jobs.total_count<=100&&jobs.jobs.filter((j:any)=>j.name===name&&j.status==='completed'&&j.conclusion===conclusion).length===1,'prior native protected/owner job result');}
 for(const[id,name,digest,runId]of [[VALIDATE.stopArtifact,'preview-runtime-reuse-'+VALIDATE.failedRun+'-attempt-1',VALIDATE.stopDigest,VALIDATE.failedRun],[VALIDATE.inputArtifact,'existing-preview-inputs-'+VALIDATE.producerRun+'-attempt-1',VALIDATE.inputDigest,VALIDATE.producerRun],[VALIDATE.requestArtifact,'norton-preview-runtime-reuse-request-'+VALIDATE.failedRun+'-attempt-1',VALIDATE.requestDigest,VALIDATE.producerRun],[VALIDATE.ledgerArtifact,'norton-preview-runtime-reuse-ledger-operation-runtime-reuse-20261110-ed80dc5-once',VALIDATE.requestDigest,VALIDATE.producerRun]]as const){
  const artifact=await github('/actions/artifacts/'+id);check(artifact.id===id&&artifact.name===name&&artifact.digest===digest&&artifact.expired===false&&Date.parse(artifact.expires_at)>now+60000&&artifact.workflow_run?.id===runId&&artifact.workflow_run.head_sha===VALIDATE.sourceCommit,'pinned prior native artifact');
  if(id===VALIDATE.requestArtifact||id===VALIDATE.ledgerArtifact){const bytes=Buffer.from(await github('/actions/artifacts/'+id+'/zip',true));check(hash(JSON.parse(archive.readArchiveFile(bytes,digest,'runtime-reuse-request.json').toString()))===VALIDATE.requestSha256,'prior native request and one-shot ledger bytes');}
 }
 return{priorFailedRun:VALIDATE.failedRun,priorProducerRun:VALIDATE.producerRun,priorRunPassed:false};
}
function originalEvidence(directory:string,candidateRoot:string){
 check(sha(file(join(directory,'source/source.db'),384*1024*1024))===EXISTING.databaseSha256,'exact original source DB');
 check(sha(file(join(directory,'source/plan.json'),512*1024))===EXISTING.planSha256,'exact original source plan');
 check(sha(file(join(directory,'proof/operator-proof-envelope.json'),60000))===EXISTING.proofSha256,'exact original complete proof');
 return verifyHistoricalCandidate(directory,candidateRoot);
}
export function prepareReuse(root:string,directory:string,candidateRoot:string,bundle:string,a:ReuseApproval){
 const source=requireReuseSource(root,validating(a),deploysSearchFix(a));requireReuseApproval(a,source);
 const capture=verifyRecoveredNortonInputs(root,directory),rehearsal=verifyRehearsalInputWitness(directory,{commit:REUSE.originalInputSource,tree:REUSE.originalInputTree}),historical=originalEvidence(directory,candidateRoot);
 const custody=json(join(directory,'recovery-original-equivalence.json')).admission.retainedInputs;
 verifyRetainedInputEvidence(directory,custody,NATIVE_ARTIFACTS,EXISTING.run,EXISTING.sourceCommit,Date.parse(SOURCE_RECOVERY.capturedAt));
 const manifestBytes=file(join(bundle,'release-manifest.json')),manifestSha256=sha(manifestBytes),manifest=verifyManifest(root,bundle,'preview',manifestSha256);
 if(deploysSearchFix(a))check(manifest.files['worker.js']===SEARCH_DEPLOYMENT.workerSha256,'exact reviewed compiled search fix');
 if(validating(a))check(manifest.files['worker.js']===VALIDATE.workerSha256,'byte-identical deployed optimized runtime');
 check(manifest.files['worker.js']!==EXISTING.workerSha256,'new compiled runtime separate from historical runtime');
 const temporary=mkdtempSync(join(tmpdir(),'reuse-corpus-plan-'));
 let plan:any;
 try{
  execFileSync(process.execPath,['--import','tsx',join(root,'scripts/application-corpus-check.ts'),'prepare','--database',join(directory,'source/source.db'),'--directory',join(temporary,'current')],{cwd:root,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']});
  plan=json(join(temporary,'current/plan.json'));
 }finally{rmSync(temporary,{recursive:true,force:true});}
 check(hash(plan.expected)===hash(historical.plan.expected)&&plan.sourceSha256===EXISTING.databaseSha256&&hash(plan.expected.digests)===hash(historical.envelope.receipt.proof.tables),'complete current corpus/plan equals original complete proof');
 const record={schemaVersion:'norton-preview-runtime-reuse-inputs.v1',source,originalProofSha256:EXISTING.proofSha256,originalProofCompletedAt:EXISTING.proofCompletedAt,historicalExpiry:REUSE.expiresAt,sourceDatabaseSha256:EXISTING.databaseSha256,
  manifestSha256,workerSha256:manifest.files['worker.js'],candidatePlan:plan,...(validating(a)?{validationPredecessor:verifyValidationPredecessor(directory)}:{}),sourceRecovery:capture,rehearsal,originalNativeInputArtifact:REUSE.originalInputArtifact,freshProof:false};
 writeFileSync(join(directory,'runtime-reuse-inputs.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});return record;
}
export function verifyReuseInputs(root:string,directory:string,candidateRoot:string,a:ReuseApproval){
 const source=requireReuseSource(root,validating(a),deploysSearchFix(a));requireReuseApproval(a,source);
 const input=json(join(directory,'runtime-reuse-inputs.json')),historical=originalEvidence(directory,candidateRoot);
 if(validating(a))check(hash(input.validationPredecessor)===hash(verifyValidationPredecessor(directory))&&input.workerSha256===VALIDATE.workerSha256,'verified deployed runtime predecessor');
 check(input.schemaVersion==='norton-preview-runtime-reuse-inputs.v1'&&hash(input.source)===hash(source)&&input.originalProofSha256===EXISTING.proofSha256&&input.originalProofCompletedAt===EXISTING.proofCompletedAt&&input.historicalExpiry===REUSE.expiresAt&&input.sourceDatabaseSha256===EXISTING.databaseSha256&&input.freshProof===false,'historical complete-proof input pins');
 check(hash(input.candidatePlan.classification)===hash(classifyApplicationRelease(root))&&input.candidatePlan.sourceSha256===EXISTING.databaseSha256&&hash(input.candidatePlan.expected)===hash(historical.plan.expected)&&hash(input.candidatePlan.expected.digests)===hash(historical.envelope.receipt.proof.tables),'current source-bound complete expected plan');
 check(hash(input.sourceRecovery)===hash(verifyRecoveredNortonInputs(root,directory))&&hash(input.rehearsal)===hash(verifyRehearsalInputWitness(directory,{commit:REUSE.originalInputSource,tree:REUSE.originalInputTree}))&&input.originalNativeInputArtifact===REUSE.originalInputArtifact,'original reconstruction provenance');
 const custody=json(join(directory,'recovery-original-equivalence.json')).admission.retainedInputs;verifyRetainedInputEvidence(directory,custody,NATIVE_ARTIFACTS,EXISTING.run,EXISTING.sourceCommit,Date.parse(SOURCE_RECOVERY.capturedAt));
 const manifest=verifyManifest(root,join(directory,'candidate-bundle'),'preview',input.manifestSha256);
 if(deploysSearchFix(a))check(manifest.files['worker.js']===SEARCH_DEPLOYMENT.workerSha256,'exact reviewed compiled search fix');
 check(input.workerSha256===manifest.files['worker.js']&&input.workerSha256!==EXISTING.workerSha256,'new source-bound runtime');
 return{source,input,historical};
}
export function admitReuseDaily(a:ReuseApproval,usage:any,baseline:number,completion=false,now=Date.now()){
 requireReuseApproval(a,{commit:a.sourceCommit,tree:a.sourceTree},now);
 check(usage.accountId===EXISTING.account&&usage.databaseId===EXISTING.database&&usage.completeDatabaseGroups===true&&usage.windowStart===a.dailyUsageDay+'T00:00:00.000Z'&&Date.parse(usage.capturedAt)<=now&&now-Date.parse(usage.capturedAt)<=50000,'fresh complete daily usage');
 const total=usage.candidate.rowsRead+usage.otherDatabases.rowsRead;
 check([usage.candidate.rowsRead,usage.otherDatabases.rowsRead,usage.candidate.rowsWritten,usage.otherDatabases.rowsWritten].every(count),'daily usage counters');
 const effective=Math.max(total,completion?baseline+REUSE.newReads:a.knownDailyReadFloor)+a.unreportedInFlightReadReserve;
 check(effective+(completion?0:REUSE.newReads)+REUSE.margin<=REUSE.dailyCeiling,'daily full-role headroom');
 check(usage.candidate.rowsWritten<=a.knownDailyCandidateWrites&&usage.candidate.rowsWritten+usage.otherDatabases.rowsWritten<=80000,'no unexpected candidate/account writes');
 return completion?effective:Math.max(total,a.knownDailyReadFloor);
}
type Assignment={role:'preview'|'production';deploymentId:string;versionId:string;databaseId:string;versionSha256:string};
type Execution={approval:ReuseApproval;source:Source;inputs:any;historical:ReturnType<typeof verifyHistoricalCandidate>;directory:string;output:string;token:string;
 revalidate:()=>Promise<unknown>;deploy?:(dispatch:()=>void)=>Promise<string>;fetch?:typeof fetch;now?:()=>number};
/** The protected executor and local Workerd proof use this same run-wide network boundary. */
export function createPreviewAuditTransport(net:typeof fetch,guard:()=>void,stage:()=>string){
 const pace=createCorpusRequestPacer(),counters={edgeExchanges:0,auditExchanges:0};
 const transport=(async(url:any,init:any={})=>{
  const dispatch=()=>{guard();check(String(url)==='https://preview-mcp.theologai.xyz/mcp','preview MCP endpoint only');if(stage()==='edge'){check(counters.edgeExchanges<24,'edge HTTP cap');counters.edgeExchanges++;}else{check(stage()==='audit'&&counters.auditExchanges<400,'audit HTTP cap');counters.auditExchanges++;}return net(url,init);};
  return stage()==='edge'?pace(init.signal??new AbortController().signal,guard,dispatch):dispatch();
 })as typeof fetch;
 return{fetch:transport,pace,counters};
}
/** The only mutation is the separately supplied, exact prebuilt deployment command. */
export async function executeReuse(input:Execution){
 const now=input.now??Date.now,a=input.approval,validation=validating(a),day=new Date(now()).toISOString().slice(0,10),started=now();
 const guard=()=>{requireReuseApproval(a,input.source,now());check(new Date(now()).toISOString().slice(0,10)===day&&now()-started<20*60000,'single UTC-day bounded operation');};
 guard();check(!validation||input.deploy===undefined,'validation has no mutation capability');check(Date.parse(a.expiresAt)-now()>=13*60000,'whole deployment/audit window');
 check(input.inputs.sourceDatabaseSha256===EXISTING.databaseSha256&&input.inputs.originalProofSha256===EXISTING.proofSha256&&input.inputs.freshProof===false,'verified historical inputs required');
 const journal=join(input.output,'runtime-reuse.events.jsonl');writeFileSync(journal,'',{flag:'wx',mode:0o600});
 const record=(value:unknown)=>{check(value!==null&&typeof value==='object'&&!Array.isArray(value),'sanitized journal object');appendFileSync(journal,JSON.stringify({at:new Date(now()).toISOString(),...value})+'\n',{mode:0o600,flush:true});};
 let stage='owner_admission',controls=0,graphs=0,sqlCalls=0,reads=0,pendingReads=0,mutationCommands=0,usageAt=0,baseline=0;
 let phase:'before'|'after'='before',newIdentity:ReturnType<typeof verifyPreviewWorkerDeployment>|{deployedVersionId:string;deploymentId:string}|undefined;
 if(validation){check(input.inputs.workerSha256===VALIDATE.workerSha256&&input.inputs.validationPredecessor?.priorFailedRun===VALIDATE.failedRun,'verified deployed runtime required');newIdentity={deployedVersionId:VALIDATE.worker,deploymentId:VALIDATE.deployment};}
 const net=input.fetch??fetch;
 const limited=(async(url:any,init:any={})=>{
  // createCorpusApi calls this only AFTER its500ms spacing. Recheck at dispatch.
  guard();check(++controls<=48,'control HTTP exchange cap');const u=new URL(String(url)),method=init.method??'GET';
  if(u.pathname==='/client/v4/graphql')check(method==='POST'&&++graphs<=4,'bounded daily usage observations');
  else if(method==='POST'){
   const body=JSON.parse(String(init.body)),q=CONTINUITY_QUERIES.find(q=>q.sql===body.sql);
   check(u.pathname===`/client/v4/accounts/${EXISTING.account}/d1/database/${EXISTING.database}/query`&&q&&JSON.stringify(body.params)==='[]'&&sqlCalls<8,'eight fixed read-only continuity SELECTs');
   check(now()-usageAt<=50000&&reads+q.ceiling<=8960,'fresh per-SELECT read admission');
   pendingReads=q.ceiling;sqlCalls++;record({kind:'select-intent',phase,label:q.label,readCeiling:q.ceiling,writeCeiling:0,sqlSha256:sha(q.sql)});
  }else check(method==='GET'&&/^\/client\/v4\/accounts\/[a-f0-9]+\/workers\/scripts\/(?:theologai|theologai-preview)\/(?:settings|deployments|versions(?:\/[a-f0-9-]{36})?)$/.test(u.pathname),'fixed read-only assignment metadata');
  record({kind:'control-dispatch',method,path:u.pathname});return net(url,init);
 }) as typeof fetch;
 const api=createCorpusApi('preview',async()=>{guard();return input.token;},limited,record);
 const rest=async(path:string)=>{const r=await api.get(path),v=await r.json() as any;check(v.success===true&&(v.errors===null||Array.isArray(v.errors)&&v.errors.length===0),'complete metadata envelope');return v.result;};
 const snapshot=async():Promise<Assignment[]>=>{
  const result:Assignment[]=[];
  for(const role of ['production','preview'] as const){
   const name=role==='production'?'theologai':'theologai-preview',path='/workers/scripts/'+name,settings=await rest(path+'/settings');
   const configured=settings.bindings?.filter((b:any)=>b.type==='d1');check(configured?.length===1&&configured[0].name==='THEOLOGAI_DB','one configured D1');
   const deployments=(await rest(path+'/deployments?page=1&per_page=1')).deployments;
   check(Array.isArray(deployments)&&deployments.length===1&&typeof deployments[0].id==='string'&&/^[a-f0-9-]{36}$/.test(deployments[0].id),'one current deployment');
   const d=deployments[0],versions=d.versions;check(versions?.length===1&&versions[0].percentage===100&&/^[a-f0-9-]{36}$/.test(versions[0].version_id),'sole100percent assignment');
   const version=await rest(path+'/versions/'+versions[0].version_id),bindings=version.resources?.bindings?.filter((b:any)=>b.type==='d1');
   check(version.id===versions[0].version_id&&bindings?.length===1&&bindings[0].name==='THEOLOGAI_DB','active version/binding identity');
   const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v)?v:'invalid';
   record({kind:'assignment-observation',role,deploymentId:uuid(d.id),versionId:uuid(version.id),configuredD1:uuid(configured[0].id??configured[0].database_id),activeD1:uuid(bindings[0].id??bindings[0].database_id)});
   const database=role==='production'?EXISTING.productionDatabase:EXISTING.database;
   for(const binding of [configured[0],bindings[0]])check((binding.id??binding.database_id)===database&&(!Object.hasOwn(binding,'id')||binding.id===database)&&(!Object.hasOwn(binding,'database_id')||binding.database_id===database),'unchanged fixed D1 bindings');
   result.push({role,deploymentId:d.id,versionId:version.id,databaseId:database,versionSha256:sha(JSON.stringify(version,null,2)+'\n')});
  }
  return result;
 };
 const assignments=(rows:Assignment[],after=false)=>{
  const production=rows[0]!,preview=rows[1]!;
  check(production.role==='production'&&production.deploymentId===EXISTING.productionDeployment&&production.versionId===EXISTING.productionWorker,'production assignment unchanged');
  const predecessor=validation||deploysSearchFix(a)?VALIDATE:EXISTING;
  const expectedDeployment=after&&!validation?newIdentity?.deploymentId:predecessor.deployment;
  const expectedWorker=after&&!validation?newIdentity?.deployedVersionId:predecessor.worker;
  check(preview.role==='preview'&&preview.deploymentId===expectedDeployment&&preview.versionId===expectedWorker,'expected preview assignment');
 };
 const observe=async(completion=false)=>{const usage=await captureCorpusUsage({role:'preview',api});baseline=Math.max(baseline,admitReuseDaily(a,usage,baseline,completion,now()));usageAt=Date.parse(usage.capturedAt);record({kind:'daily-usage',completion,usage,effectiveBaseline:baseline,watermarkUnavailable:true});return usage;};
 const db=new Database(join(input.directory,'source/source.db'),{readonly:true,fileMustExist:true});
 const continuity=async(p:'before'|'after')=>{
  phase=p;for(const q of CONTINUITY_QUERIES){
   guard();const response=await api.authorizedFetch(`https://api.cloudflare.com/client/v4/accounts/${EXISTING.account}/d1/database/${EXISTING.database}/query`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sql:q.sql,params:[]})});
   check(response.status===200&&!response.redirected,'continuity HTTP status');const v=await response.json() as any,r=v.result?.[0],m=r?.meta;
   check(v.success===true&&Array.isArray(v.errors)&&v.errors.length===0&&v.result.length===1&&r.success===true&&Array.isArray(r.results)&&count(m?.rows_read)&&m.rows_read<=q.ceiling&&m.rows_written===0&&m.changes===0&&m.total_attempts===1&&m.served_by_primary===true,'one read-only primary continuity result');
   reads+=m.rows_read;pendingReads=0;
   const expected=q.label==='schema'?input.historical.envelope.receipt.proof.catalogSha256:q.label==='ledger'?input.historical.envelope.receipt.proof.ledgerSha256:hash(db.prepare(q.sql).all());
   record({kind:'select-result',phase:p,label:q.label,rowsRead:m.rows_read,rowsWritten:0,responseSha256:hash(r.results)});check(hash(r.results)===expected,'continuity '+q.label+' changed');
  }
 };
 const versions=async()=>{const v=await rest('/workers/scripts/theologai-preview/versions?page=1&per_page=100');check(Array.isArray(v.items)&&v.items.length>0&&v.items.length<=100,'bounded latest version roster');return JSON.stringify(v.items);};
 const transport=createPreviewAuditTransport(net,guard,()=>stage),liveNet=transport.fetch,pace=transport.pace;
 try{
  const owner=await input.revalidate();guard();
  record({kind:'role-reserved',priorReadsHeld:a.previousReadsHeld,newReadsReserved:REUSE.newReads,finalReadsHeld:a.finalReadsHeld,margin:REUSE.margin,cumulativeCeiling:a.cumulativeReadCeiling,newIntegrityWrites:0,actualPriorWrites:11,heldWrites:12,freshProof:false});
  stage='initial_assignment';const before=await snapshot();assignments(before);check(before[1]!.versionSha256===((validation||deploysSearchFix(a))?VALIDATE.versionSha256:input.historical.cutover.observedActiveVersionViewSha256),'original immutable preview version witness');if(validation||deploysSearchFix(a))check(before[0]!.versionSha256===VALIDATE.productionVersionSha256,'retained immutable production witness');
  const initialUsage=await observe();stage='continuity_before';await continuity('before');
  let deployed=before;
  if(!validation){
  const beforeVersions=await versions();
  const roster=(text:string)=>JSON.parse(text).slice(0,100).map((v:any)=>({id:typeof v.id==='string'&&/^[a-f0-9-]{36}$/.test(v.id)?v.id:'invalid',number:count(v.number)?v.number:null,createdAt:typeof v.metadata?.created_on==='string'&&v.metadata.created_on.length<=40&&Number.isFinite(Date.parse(v.metadata.created_on))?new Date(v.metadata.created_on).toISOString():null}));
  record({kind:'predecessor-observed',assignments:before,versions:roster(beforeVersions),versionsSha256:sha(beforeVersions)});stage='predeployment';await input.revalidate();guard();
  const immediate=await snapshot();record({kind:'immediate-predecessor-observed',assignments:immediate});assignments(immediate);check(hash(immediate)===hash(before),'predeployment assignment continuity');await observe();
  writeFileSync(join(input.output,'predecessor.json'),JSON.stringify({source:input.source,workerSha256:input.inputs.workerSha256,before,immediate,versions:roster(beforeVersions),versionsSha256:sha(beforeVersions)},null,2)+'\n',{flag:'wx',mode:0o600});
  check(Date.parse(a.expiresAt)-now()>=12*60000,'remaining deployment/audit window');
  stage='owner_recheck_at_mutation';await input.revalidate();guard();
  stage='deploy';const output=await input.deploy!(()=>{guard();check(now()-usageAt<=50000&&mutationCommands===0,'fresh one-shot deployment admission');record({kind:'deployment-intent',workerSha256:input.inputs.workerSha256,maxCommands:1});mutationCommands++;});
  check(mutationCommands===1,'deployment command dispatched exactly once');record({kind:'deployment-command-completed',outputSha256:sha(output)});
  stage='postdeployment_identity';const afterVersions=await versions(),deploymentList=await rest('/workers/scripts/theologai-preview/deployments?page=1&per_page=10');
  record({kind:'postdeployment-observed',versions:roster(afterVersions),versionsSha256:sha(afterVersions),deploymentsSha256:hash(deploymentList.deployments)});
  const deploymentIdentity=verifyPreviewWorkerDeployment({beforeVersionsText:beforeVersions,afterVersionsText:afterVersions,afterDeploymentsText:JSON.stringify(deploymentList.deployments),commandOutput:output});
  check(deploymentIdentity.addedVersionIds.length===1,'one new runtime version without secret synchronization');newIdentity=deploymentIdentity;
  deployed=await snapshot();assignments(deployed,true);check(hash(deployed[0])===hash(before[0]),'production immutable version unchanged');record({kind:'new-runtime-identity',identity:newIdentity,assignments:deployed});
  }else record({kind:'validation-only-runtime',assignment:before[1],mutationCommands:0,priorFailedRun:VALIDATE.failedRun});
  stage='edge';const edge=await runPrimarySourceEdgeStabilization({...PREVIEW_PROFILE,corpusRelease:true},{fetchImpl:liveNet});writeFileSync(join(input.output,'edge.json'),JSON.stringify(edge,null,2)+'\n',{flag:'wx',mode:0o600});check(edge.passed,'edge registration');
  stage='preaudit';if(now()-usageAt>40000)await observe();await input.revalidate();guard();
  stage='audit';record({kind:'live-intent',readsReserved:90000,retries:0});const live=await auditCorpusRelease({role:'preview',root:process.cwd(),endpoint:'https://preview-mcp.theologai.xyz/mcp',serverVersion:PREVIEW_PROFILE.serverVersion,databasePath:join(input.directory,'source/source.db'),fetch:liveNet,guard,pace});
  const text=JSON.stringify(live,null,2)+'\n';check(Buffer.byteLength(text)<=512*1024,'bounded sanitized live report');writeFileSync(join(input.output,'corpus-live.json'),text,{flag:'wx',mode:0o600});
  if(Object.hasOwn(live,'failure')){record({kind:'live-failed',reportSha256:sha(text),originalCauseRetained:true});throw new ReuseRefusal('live audit failed');}
  check(live.checks.length===370&&live.checks.every(c=>c.passed)&&hash(live.protocols)===hash(['2025-11-25','2026-07-28']),'all370both-era checks');
  stage='final_usage';const finalUsage=await observe(true);stage='continuity_after';await continuity('after');
  stage='final_identity';const after=await snapshot();assignments(after,true);check(hash(after)===hash(deployed),'stable final new-runtime/production identity');const finalOwner=await input.revalidate();guard();check(hash(finalOwner)===hash(owner),'owner/source provenance unchanged');
  check(sqlCalls===8&&pendingReads===0&&reads<=8960&&transport.counters.edgeExchanges<=24&&transport.counters.auditExchanges<=400,'complete bounded execution');
  const receipt={schemaVersion:validation?'norton-preview-runtime-validation-receipt.v1':'norton-preview-runtime-reuse-receipt.v1',purpose:validation?'preview-only-deployed-runtime-validation':'preview-only-historical-corpus-new-runtime',freshProof:false,productionAuthorized:false,source:input.source,operationId:a.operationId,authority:a,owner,
   historicalProof:{sha256:EXISTING.proofSha256,completedAt:EXISTING.proofCompletedAt,expiresAt:REUSE.expiresAt,sourceDatabaseSha256:EXISTING.databaseSha256,custodyRiskAccepted:true,partialNovember10ProofUsed:false},
   ...(validation?{verifierSource:input.source,verifierManifestSha256:input.inputs.manifestSha256,validationPredecessor:input.inputs.validationPredecessor,deployedRuntime:{source:input.inputs.validationPredecessor.deployedSource,manifestSha256:input.inputs.validationPredecessor.deployedManifestSha256,workerSha256:input.inputs.workerSha256,identity:newIdentity},priorFailedRun:VALIDATE.failedRun,priorRunPassed:false,deploymentPerformed:false}:{newRuntime:{workerSha256:input.inputs.workerSha256,manifestSha256:input.inputs.manifestSha256,identity:newIdentity}}),completedAt:new Date(now()).toISOString(),checks:370,before,after,initialUsage,finalUsage,
   metering:{continuityRowsRead:reads,continuityRequests:sqlCalls,newReadReservation:100000,liveReadsReserved:90000,controlReadsReserved:10000,rowsWritten:0,newIntegrityWrites:0,mutationCommands,controlHttpExchanges:controls,edgeExchanges:transport.counters.edgeExchanges,auditExchanges:transport.counters.auditExchanges,retries:0,preciseHostedLiveBillingUnavailable:true},liveSha256:hash(live),edgeSha256:hash(edge)};
  record({kind:'runtime-reuse-complete',receiptSha256:hash(receipt)});writeFileSync(join(input.output,'runtime-reuse-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});return receipt;
 }catch(error){record({kind:'STOP',stage,reason:safeReuseFailure(error),mutationCommands,continuityReadsSpentOrReserved:reads+pendingReads,retainWholeNewReadReservation:100000,retry:false,rollback:false});throw Error('Preview runtime reuse stopped; preserve original failure reports and full reservation, no retry');}
 finally{db.close();}
}
export async function readReuseMarkerZip(route:string,token:string,net:typeof fetch=fetch,guard:()=>void=()=>{}){
 check(/^\/actions\/artifacts\/[1-9][0-9]{0,15}\/zip$/.test(route),'fixed native marker route');guard();
 let response=await net('https://api.github.com/repos/'+EXISTING.repository+route,{method:'GET',redirect:'manual',headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
 if(response.status===302){
  const location=response.headers.get('location');check(location&&location.length<=8192,'native marker redirect');const url=new URL(location);
  check(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&(/^productionresults[a-z0-9]*\.blob\.core\.windows\.net$/.test(url.hostname)||/^[a-z0-9-]+\.actions\.githubusercontent\.com$/.test(url.hostname)),'native artifact HTTPS redirect host');
  await response.body?.cancel();guard();
  response=await net(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000)});
 }
 check(response.status===200&&!response.redirected&&response.body,'native marker download status');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;check(bytes<=128*1024,'native marker size');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>undefined);}
 guard();return Buffer.concat(chunks);
}
async function main(){
 const [mode,request,directory,candidateRoot,last,...extra]=process.argv.slice(2);
 check((mode==='prepare'||mode==='execute')&&request&&directory&&candidateRoot&&last&&!extra.length,'exact runtime-reuse arguments');
 const root=process.cwd(),requestApproval:ReuseApproval=json(request),env=process.env;
 const source=requireReuseSource(root,validating(requestApproval),deploysSearchFix(requestApproval));
 const a=requireReuseApproval(requestApproval,source);
 check(env.GITHUB_TOKEN,'existing GitHub metadata credential');let githubCalls=0,githubBytes=0;
 const github:Github=async(route,binary=false)=>{
  requireReuseApproval(a,source);check(++githubCalls<=REUSE.githubLogicalCalls&&route.startsWith('/')&&!route.includes('..'),'bounded GitHub metadata');
  if(binary)return readReuseMarkerZip(route,env.GITHUB_TOKEN!,fetch,()=>requireReuseApproval(a,source));
  const response=await fetch('https://api.github.com/repos/'+EXISTING.repository+route,{method:'GET',redirect:'error',headers:{authorization:'Bearer '+env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
  check(response.ok&&!response.redirected&&response.body,'GitHub metadata status');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;githubBytes+=part.value.byteLength;check(bytes<=(binary?128*1024:2*1024*1024)&&githubBytes<=32*1024*1024,'GitHub metadata size');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>undefined);}
  requireReuseApproval(a,source);const result=Buffer.concat(chunks);return binary?result:JSON.parse(result.toString());
 };
 if(mode==='prepare'){
  const admission=await admitReuse(a,source,github,env,'prepare');
  if(validating(a))await requireValidationNative(github);
  prepareReuse(root,directory,candidateRoot,last,a);
  writeFileSync(join(directory,'runtime-reuse-request.json'),JSON.stringify(a,null,2)+'\n',{flag:'wx',mode:0o600});
  writeFileSync(join(directory,'runtime-reuse-admission.json'),JSON.stringify(admission,null,2)+'\n',{flag:'wx',mode:0o600});
  if(env.GITHUB_OUTPUT)appendFileSync(env.GITHUB_OUTPUT,'operation_kind=runtime-reuse\noperation_id='+a.operationId+'\ntarget_run_id='+a.targetRunId+'\n');return;
 }
 const verified=verifyReuseInputs(root,directory,candidateRoot,a),admission=json(join(directory,'runtime-reuse-admission.json'));
 check(admission.operationId===a.operationId&&hash(admission.source)===hash(source),'same-run prepared inputs');
 const handoff=await admitReusePr(a,source,github,env);if(validating(a))await requireValidationNative(github);check(admission.runId===String(handoff.inputs.runId),'prepared owner run matches native handoff');
 check(env.RUNTIME_REUSE_INPUT_ARTIFACT_ID===String(handoff.inputs.id)&&env.RUNTIME_REUSE_INPUT_ARTIFACT_DIGEST===handoff.inputs.digest,'downloaded exact native prepared input package');
 check(env.CLOUDFLARE_API_TOKEN&&env.CLOUDFLARE_ACCOUNT_ID===EXISTING.account&&!env.CLOUDFLARE_API_BASE_URL,'existing preview credential and fixed account');
 mkdirSync(last,{mode:0o700});
 if(validating(a)){await executeReuse({approval:a,source,inputs:verified.input,historical:verified.historical,directory,output:last,token:env.CLOUDFLARE_API_TOKEN,revalidate:()=>admitReusePr(a,source,github,env,handoff)});return;}
 const upload=join(last,'upload-only.json');
 await renderDeploymentConfig(root,join(directory,'candidate-bundle'),'preview',verified.input.manifestSha256,upload);
 const invoke=promisify(execFile);
 await executeReuse({approval:a,source,inputs:verified.input,historical:verified.historical,directory,output:last,token:env.CLOUDFLARE_API_TOKEN,
  revalidate:()=>admitReusePr(a,source,github,env,handoff),
  deploy:async dispatch=>{requireReuseApproval(a,source);dispatch();const result=await invoke(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'deploy','--config',upload,'--no-bundle','--env-file','/dev/null'],{cwd:root,timeout:120000,maxBuffer:1024*1024,env:{...env,WRANGLER_SEND_METRICS:'false'}});return result.stdout;}});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{process.stderr.write(safeReuseFailure(error)+'. Preserve reports and full100K reservation; no retry, rollback or production action.\n');process.exitCode=1;});
