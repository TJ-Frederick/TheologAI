/** Fixed read-only continuation for the already deployed cc14 Norton preview. */
import {createHash} from 'node:crypto';
import {SCOPED_DIAGNOSTIC,diagnosticRequestsSha256,runScopedResponseDiagnostic,withinDiagnosticSignal,diagnosticErrorOutcome} from './norton-scoped-response-diagnostic.js';
import {RETAINED_INPUTS,requireRetainedNativeMetadata,verifyRetainedInputEvidence} from './retained-norton-inputs.js';
import {execFileSync} from 'node:child_process';
import {appendFileSync,lstatSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join,resolve,posix} from 'node:path';
import {pathToFileURL} from 'node:url';
import Database from 'better-sqlite3';
import {verifyManifest} from '../../scripts/worker-release-artifact.mjs';
import {verifyOperatorEnvelope,verifyOperatorIntegrity} from '../../scripts/operator-corpus-proof.js';
import {CATALOG_SQL,LEDGER_SQL} from '../../scripts/corpus-source-proof.js';
import {CorpusProofTransport} from '../../scripts/corpus-proof-transport.js';
import {createCorpusApi} from '../../scripts/corpus-release-api.js';
import {captureCorpusUsage} from '../../scripts/corpus-release-control.js';
import {auditCorpusRelease} from '../../scripts/audit-corpus-release.js';
import {runPrimarySourceEdgeStabilization} from '../../scripts/audit-primary-source-edge-stabilization.js';
import {classifyApplicationRelease} from '../../scripts/norton-aquinas-release-policy.mjs';
import {PREVIEW_PROFILE} from '../../scripts/audit-historical-core-preview.js';
export const EXISTING=Object.freeze({repository:'TJ-Frederick/TheologAI',owner:40179660,pr:176,run:41951638734,
 sourceCommit:'cc14e062d772e957a24a64bfc15a679ebaca8109',sourceTree:'3428d9c21494b7d2e0d6bf4415819d119123c27a',base:'328168d5b817e9eaa0e702de382adc2c46c858ef',
 worker:'eb16fe17-764d-4ccc-8a95-a2098470372c',deployment:'aad541f2-7102-41ee-8da1-d8efce7fcf97',database:'62b871a6-5b4d-4d9b-8f52-301f6c878f48',
 productionWorker:'d2e2bd87-1213-4ba5-891d-e0f9b3293cb9',productionDeployment:'f6c9a995-0940-4758-a9a9-14f1389a9ab3',productionDatabase:'9bc79346-338b-439e-a2a5-424f4418eb21',account:'0594ed1e4c9fe35ab7d9f47991e99f3e',
 proofSha256:'74842d254f0c6312f02d3b9908d3dcf8a5b24752f2eb6a93e4490856cb78f724',planSha256:'2d8221f3af48f5865e4fd737253f72a831fa78f289ac3ba504a6043d346607c2',
 databaseSha256:'3f8a53c37a585b5c42b2410d7f3167645f738bbf90b51d43b2c0378efb4f898c',workerSha256:'9d9cff3b7d252a9c47a5316d643e4a91e3309989909f648041dcbcc7a70e659b',workerManifestSha256:'4911c593dc6383a6026250489eac9d094cb6c79e2506aeeb3e917ad22d59c1ff',
 cutoverSha256:'0253060587ca9a7e6940127f518dabea0ae39ac59bf9ee48864c35544abc162f',
 proofDay:'2026-11-05',proofCompletedAt:'2026-11-05T02:45:14.748Z',validationDay:'2026-11-06',validationStart:'2026-11-06T12:00:00.000Z',validationEnd:'2026-11-06T18:00:00.000Z',maximumHistoricalProofAgeMs:144000000,validationDayCandidateWrites:0,previousReadReservation:3860000,knownPriorReads:3331435,actualPriorWrites:7,heldPriorWrites:8,reads:100000,liveReads:90000,controlReads:10000,
 confirmation:'VALIDATE THE DEPLOYED NORTON PREVIEW IN PLACE'});
// Proposed reuse of this one role requires a new explicit owner decision and gate.
export const CARRY_FORWARD=Object.freeze({operationId:'operation-in-place-next-20261105-593c89740b',runId:42114178613,attempt:1,sourceCommit:'2f1311647ab84b73c8fcfbec593b3f7f83b74f9e',artifactId:13453494842,artifactSha256:'c4e1106a298b49e20803cad33f9b289203ad33da557559b466d9beb86804d0fc',stopStage:'quota_initial',stopReason:'quota_read_reservation',sqlRequests:0,mcpRequests:0,readsHeld:100000,additionalCumulativeReads:0});
export const NATIVE_ARTIFACTS=[
 {id:13380979536,name:'corpus-preview-41951638734-attempt-1',digest:'sha256:c557e3624aacebf405c6c603eb015e9d782cb59daf53278e38bd8732aab9a01c'},
 {id:13380979547,name:'worker-preview-41951638734-attempt-1',digest:'sha256:a98f579d4194fdab65b97db45327a105d3724f96f374af19b4f63c0aca5ebf3f'},
 {id:13383402881,name:'preview-operator-verified-41951638734-attempt-1',digest:'sha256:ab185563a78140c449e65a6d3d247f76050cbb079cdf64284003a010905b01b9'},
 {id:13383307930,name:'preview-release-reconciliation-176-cc14e062d772e957a24a64bfc15a679ebaca8109',digest:'sha256:cfb265f514f00ce2cc58ea7924bba98df49715a12d44c87dc74c01fc1d2809e3'},
] as const;
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const check=(v:unknown,s:string):void=>{if(!v)throw Error('Existing preview validation refused: '+s);};
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const json=(p:string)=>JSON.parse(file(p,1024*1024).toString());
const file=(p:string,max:number)=>{const s=lstatSync(p);check(s.isFile()&&!s.isSymbolicLink()&&s.size<=max,'bounded regular input');return readFileSync(p);};
export type ExistingApproval={schemaVersion:string;operationId:string;auditorCommit:string;auditorTree:string;expiresAt:string;confirmation:string;historicalProofSha256:string;acceptHistoricalProofForValidationOnly:boolean;uninterruptedDataCustody:boolean;maxReads:number;maxWrites:number;noDeployment:boolean;accountReadCeiling:number;previousReadReservation:number;carryForwardFromOperationId:string;acceptUnusedRoleCarryForward:boolean;validationDay:string;acceptPriorDayHistoricalProof:boolean;maximumHistoricalProofAgeMs:number;acceptRetainedNativeInputs:boolean;retainedInputArtifactId:number};
export type ScopedDiagnosticApproval=Omit<ExistingApproval,'acceptHistoricalProofForValidationOnly'|'carryForwardFromOperationId'|'acceptUnusedRoleCarryForward'>&{acceptHistoricalProofForDiagnosticOnly:boolean;newReadAllowance:boolean;priorFailedOperationId:string;requestPlanSha256:string};
export type PreviewApproval=ExistingApproval|ScopedDiagnosticApproval;
const isScopedDiagnostic=(a:PreviewApproval):a is ScopedDiagnosticApproval=>a.schemaVersion===SCOPED_DIAGNOSTIC.schema;
export function requireScopedDiagnosticApproval(a:ScopedDiagnosticApproval,source:{commit:string;tree:string},now=Date.now()){
 const keys='acceptHistoricalProofForDiagnosticOnly,acceptPriorDayHistoricalProof,acceptRetainedNativeInputs,accountReadCeiling,auditorCommit,auditorTree,confirmation,expiresAt,historicalProofSha256,maxReads,maxWrites,maximumHistoricalProofAgeMs,newReadAllowance,noDeployment,operationId,previousReadReservation,priorFailedOperationId,requestPlanSha256,retainedInputArtifactId,schemaVersion,uninterruptedDataCustody,validationDay';
 check(a&&Object.keys(a).sort().join(',')===keys,'closed diagnostic approval');
 check(a.schemaVersion===SCOPED_DIAGNOSTIC.schema&&a.confirmation===SCOPED_DIAGNOSTIC.confirmation&&/^operation-[a-z0-9-]{8,80}$/.test(a.operationId)&&a.operationId!==SCOPED_DIAGNOSTIC.failedOperation&&a.operationId!==CARRY_FORWARD.operationId,'one new diagnostic operation');
 check(a.newReadAllowance===true&&a.priorFailedOperationId===SCOPED_DIAGNOSTIC.failedOperation&&a.previousReadReservation===SCOPED_DIAGNOSTIC.previousReads&&a.maxReads===SCOPED_DIAGNOSTIC.reads&&a.maxWrites===0&&a.noDeployment===true&&a.accountReadCeiling===4400000,'separate ten-thousand read reservation');
 check(a.requestPlanSha256===diagnosticRequestsSha256&&a.acceptHistoricalProofForDiagnosticOnly===true,'fixed request plan and diagnostic-only purpose');
 requirePreviewContext(a,source,now);return a;
}
function requirePreviewContext(a:PreviewApproval,source:{commit:string;tree:string},now:number){
 check(/^[a-f0-9]{40}$/.test(a.auditorCommit)&&/^[a-f0-9]{40}$/.test(a.auditorTree)&&a.auditorCommit===source.commit&&a.auditorTree===source.tree,'distinct reviewed auditor source');
 check(a.historicalProofSha256===EXISTING.proofSha256&&a.uninterruptedDataCustody===true,'historical reference and custody');
 check(a.acceptRetainedNativeInputs===true&&a.retainedInputArtifactId===RETAINED_INPUTS.inputArtifact.id,'explicit retained native custody approval');
 check(a.validationDay===EXISTING.validationDay&&a.acceptPriorDayHistoricalProof===true&&a.maximumHistoricalProofAgeMs===EXISTING.maximumHistoricalProofAgeMs,'explicit prior-day proof-age and validation-day approval');
 check(now-Date.parse(EXISTING.proofCompletedAt)>=0&&now-Date.parse(EXISTING.proofCompletedAt)<=EXISTING.maximumHistoricalProofAgeMs,'bounded historical proof age');
 check(now>=Date.parse(EXISTING.validationStart)&&now<Date.parse(EXISTING.validationEnd)&&Date.parse(a.expiresAt)>now&&Date.parse(a.expiresAt)-now<=1800000&&Date.parse(a.expiresAt)<=Date.parse(EXISTING.validationEnd)&&a.expiresAt.slice(0,10)===EXISTING.validationDay,'new short fixed validation window');
}
export function requirePreviewApproval(a:PreviewApproval,source:{commit:string;tree:string},now=Date.now()){
 return isScopedDiagnostic(a)?requireScopedDiagnosticApproval(a,source,now):requireExistingApproval(a,source,now);
}
export function requireExistingApproval(a:ExistingApproval,source:{commit:string;tree:string},now=Date.now()){
 check(a&&Object.keys(a).sort().join(',')==='acceptHistoricalProofForValidationOnly,acceptPriorDayHistoricalProof,acceptRetainedNativeInputs,acceptUnusedRoleCarryForward,accountReadCeiling,auditorCommit,auditorTree,carryForwardFromOperationId,confirmation,expiresAt,historicalProofSha256,maxReads,maxWrites,maximumHistoricalProofAgeMs,noDeployment,operationId,previousReadReservation,retainedInputArtifactId,schemaVersion,uninterruptedDataCustody,validationDay','closed approval');
 check(a.schemaVersion==='norton-existing-preview-validation-approval.v1'&&a.confirmation===EXISTING.confirmation&&/^operation-[a-z0-9-]{8,80}$/.test(a.operationId),'explicit continuation purpose');
 check(/^[a-f0-9]{40}$/.test(a.auditorCommit)&&/^[a-f0-9]{40}$/.test(a.auditorTree)&&a.auditorCommit===source.commit&&a.auditorTree===source.tree,'distinct reviewed auditor source');
 check(a.historicalProofSha256===EXISTING.proofSha256&&a.acceptHistoricalProofForValidationOnly===true&&a.uninterruptedDataCustody===true,'historical proof exception and custody');
 check(a.previousReadReservation===EXISTING.previousReadReservation,'explicit cumulative prior read reservation');
 check(a.accountReadCeiling===4400000,'approved one-operation account ceiling');
 check(a.acceptUnusedRoleCarryForward===true&&a.carryForwardFromOperationId===CARRY_FORWARD.operationId&&a.operationId!==CARRY_FORWARD.operationId,'explicit unused quota-refused role carry-forward');
 check(a.maxReads===100000&&a.maxWrites===0&&a.noDeployment===true,'read-only operation allowance');
 check(a.acceptRetainedNativeInputs===true&&a.retainedInputArtifactId===RETAINED_INPUTS.inputArtifact.id,'explicit retained native custody approval');
 check(a.validationDay===EXISTING.validationDay&&a.acceptPriorDayHistoricalProof===true&&a.maximumHistoricalProofAgeMs===EXISTING.maximumHistoricalProofAgeMs,'explicit prior-day proof-age and validation-day approval');
 check(now-Date.parse(EXISTING.proofCompletedAt)>=0&&now-Date.parse(EXISTING.proofCompletedAt)<=EXISTING.maximumHistoricalProofAgeMs,'bounded historical proof age');
 check(now>=Date.parse(EXISTING.validationStart)&&now<Date.parse(EXISTING.validationEnd)&&Date.parse(a.expiresAt)>now&&Date.parse(a.expiresAt)-now<=1800000&&Date.parse(a.expiresAt)<=Date.parse(EXISTING.validationEnd)&&a.expiresAt.slice(0,10)===EXISTING.validationDay,'new short fixed validation window');return a;
}
const REVIEWED_CONTROL_BLOBS:Record<string,string>={".github/scripts/operator-authorization.cjs":"a9a5999b37f7e3bd3650b2cf456cf32dcb6c0744",".github/scripts/prepare-norton-production.ts":"0c57e7171ff9895dfc89a591fba7cdd0bfd2e739","scripts/corpus-proof-transport.ts":"792721670b283dc0946082f598389b605377b86c","scripts/operator-corpus-proof.ts":"fe2f1f80092d5761bbbc299045f1761a59be693f","scripts/norton-aquinas-live.ts":"5c29c28819084a4368a7d495b30891c1acf954e4","scripts/norton-aquinas-preparation.ts":"2d759a1703c0abac6fbc20dab414ce5c4dc6cd0c",".github/scripts/retained-norton-inputs.ts":"5617334847bd5da9408741e8944a040459b73ecd",".github/scripts/norton-scoped-response-diagnostic.ts":"d24d94c915c70f6e65b5cd778779ea7e6d4d1939"};
const ALLOWED_CHANGES=new Set([...Object.keys(REVIEWED_CONTROL_BLOBS),'test/unit/scripts/nortonProductionOperation.test.ts','test/unit/scripts/nortonAquinasPreparation.test.ts','.github/scripts/restore-norton-preview.ts','.github/scripts/resolve-existing-norton-preview.cjs','.github/scripts/verify-existing-norton-handoff.ts','.github/workflows/deploy.yml','scripts/dual-era-preview-release-receipt.ts','test/unit/scripts/existingNortonHandoff.test.ts','.github/scripts/validate-existing-norton-preview.ts','.github/workflows/pr.yml','release/norton-aquinas.json','scripts/audit-primary-source-edge-stabilization.ts','scripts/audit-corpus-release.ts','scripts/norton-aquinas-live.ts','test/test-topology.json','test/unit/config/workflowTopology.test.ts','test/unit/scripts/previewReleaseReconciliation.test.ts','test/unit/scripts/primarySourceEdgeStabilization.test.ts','test/unit/scripts/nortonAquinasLiveWorkflow.test.ts','test/unit/scripts/nortonAquinasLive.test.ts','test/unit/scripts/corpusLiveFailure.test.ts','test/unit/scripts/corpusLiveSdkFailure.test.ts','test/unit/scripts/scopedResponseDiagnostic.test.ts','tsconfig.release-scripts.json']);
export function requireRuntimeEquivalence(root:string,newBundle:string){
 const changed=execFileSync('git',['diff','--name-only',EXISTING.sourceCommit,'HEAD'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);check(changed.every(p=>ALLOWED_CHANGES.has(p)),'unreviewed candidate/auditor difference');
 const paths=['src','data','migrations','wrangler.toml','wrangler.ccel-coordinator.toml','package.json','package-lock.json','.nvmrc','.github/release-toolchain','test/fixtures','test/helpers/mcpTransportContract.ts','scripts/norton-aquinas-release-policy.mjs','scripts/worker-release-artifact.mjs'];
 const reviewedControls=Object.entries(REVIEWED_CONTROL_BLOBS).map(([path,blob])=>{check(execFileSync('git',['rev-parse','HEAD:'+path],{cwd:root,encoding:'utf8'}).trim()===blob,'unreviewed operator control blob');return {path,blob};});
 const inputs=paths.map(path=>{const before=execFileSync('git',['ls-tree','-r',EXISTING.sourceCommit,'--',path],{cwd:root}),after=execFileSync('git',['ls-tree','-r','HEAD','--',path],{cwd:root});check(before.length>0&&before.equals(after),'runtime/data/fixture input changed');return {path,gitEntriesSha256:sha(before)};});
 check(sha(file(join(newBundle,'worker.js'),16*1024*1024))===EXISTING.workerSha256,'compiled candidate runtime differs');
 return {candidateSourceCommit:EXISTING.sourceCommit,auditorCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),changed,inputs,reviewedControls,workerSha256:EXISTING.workerSha256};
}
function requireRoster(directory:string,expected:string[]){
 const walk=(dir:string,prefix=''):string[]=>{const s=lstatSync(dir);check(s.isDirectory()&&!s.isSymbolicLink(),'regular artifact directory');return readdirSync(dir).flatMap(name=>{const p=join(dir,name),s=lstatSync(p);check(!s.isSymbolicLink(),'artifact symlink');return s.isDirectory()?walk(p,prefix+name+'/'):[prefix+name];});};
 check(JSON.stringify(walk(directory).sort())===JSON.stringify([...expected].sort()),'exact artifact roster');
}
export function verifyHistoricalCandidate(directory:string,candidateRoot:string){
 const worker=join(directory,'worker'),source=join(directory,'source'),proof=join(directory,'proof');
 requireRoster(source,['plan.json','source.db']);
 requireRoster(proof,['operator-authorization.json','operator-corpus-challenge.json','operator-proof-envelope.json','operator-proof/operator-proof-envelope.json','operator-corpus-challenge.json.admission.jsonl','preview-operator-readiness.json.events.jsonl','preview-operator-readiness.json.budget.json','preview-operator-readiness.json']);
 requireRoster(join(directory,'cutover'),['preview-worker-candidate-cutover-observation.json','preview-worker-candidate-cutover.json','preview-worker-post-mutation-reconciliation.json']);
 verifyManifest(candidateRoot,worker,'preview',EXISTING.workerManifestSha256);
 check(sha(file(join(source,'plan.json'),512*1024))===EXISTING.planSha256&&sha(file(join(source,'source.db'),384*1024*1024))===EXISTING.databaseSha256,'original source artifact');
 const bytes=file(join(proof,'operator-proof-envelope.json'),60000);check(sha(bytes)===EXISTING.proofSha256,'original complete proof bytes');
 const envelope=JSON.parse(bytes.toString()),challenge=json(join(proof,'operator-corpus-challenge.json')),plan=json(join(source,'plan.json'));
 const at=Date.parse(envelope.receipt.completedAt);verifyOperatorEnvelope(envelope,challenge,plan,at);
 check(envelope.receipt.sourceCommit===EXISTING.sourceCommit&&envelope.receipt.sourceTree===EXISTING.sourceTree&&envelope.receipt.completedAt.slice(0,10)===EXISTING.proofDay,'historical candidate identity');
 check(sha(file(join(proof,'preview-operator-readiness.json.events.jsonl'),4*1024*1024))===envelope.journalSha256,'original complete journal');
 const integrity=file(join(proof,'operator-proof/operator-proof-envelope.json'),60000);check(sha(integrity)===envelope.receipt.operatorIntegritySha256,'all four original integrity checks');verifyOperatorIntegrity(JSON.parse(integrity.toString()),challenge,at);
 const cutoverBytes=file(join(directory,'cutover/preview-worker-post-mutation-reconciliation.json'),60000);check(sha(cutoverBytes)===EXISTING.cutoverSha256,'original cutover bytes');const cutover=JSON.parse(cutoverBytes.toString());
 check(cutover.candidateBindingMatches===true&&cutover.observedActiveVersionId===EXISTING.worker&&cutover.observedActiveDeploymentId===EXISTING.deployment&&cutover.observedActiveD1.databaseId===EXISTING.database,'known candidate cutover');
 return {plan,envelope,challenge,cutover,historicalVerificationAt:envelope.receipt.completedAt,freshProof:false};
}
export async function requireExistingDispatch(a:PreviewApproval,source:{commit:string;tree:string},github:(route:string)=>Promise<any>,environment:NodeJS.ProcessEnv,now=Date.now(),phase:'prepare'|'validate'='validate'){
 requirePreviewApproval(a,source,now);check(environment.GITHUB_REPOSITORY===EXISTING.repository&&environment.GITHUB_EVENT_NAME==='workflow_dispatch'&&environment.GITHUB_RUN_ATTEMPT==='1'&&environment.GITHUB_ACTOR_ID===String(EXISTING.owner),'owner dispatch environment');
 const run=await github('/actions/runs/'+environment.GITHUB_RUN_ID);check(run.actor?.id===EXISTING.owner&&run.triggering_actor?.id===EXISTING.owner&&run.run_attempt===1&&run.event==='workflow_dispatch'&&run.path==='.github/workflows/pr.yml'&&String(run.id)===environment.GITHUB_RUN_ID&&run.head_sha===source.commit&&environment.GITHUB_REF==='refs/heads/'+run.head_branch,'authenticated owner/auditor run');
 const pr=await github('/pulls/176'),commit=await github('/git/commits/'+source.commit),main=await github('/git/ref/heads/main');
 check(pr.state==='open'&&!pr.draft&&pr.base.ref==='main'&&pr.base.sha===EXISTING.base&&main.object.sha===EXISTING.base&&pr.head.sha===source.commit&&pr.head.ref===run.head_branch&&pr.head.repo.full_name===EXISTING.repository&&!pr.labels.some((l:any)=>l.name==='deploy-preview')&&commit.tree.sha===source.tree,'live unlabeled auditor/base');
 const original=await github('/actions/runs/'+EXISTING.run),jobs=await github('/actions/runs/'+EXISTING.run+'/jobs?per_page=100');
 check(original.id===EXISTING.run&&original.status==='completed'&&original.conclusion==='failure'&&original.head_sha===EXISTING.sourceCommit&&original.run_attempt===1&&original.path==='.github/workflows/pr.yml','original run source');
 check(jobs.jobs.some((j:any)=>j.name==='Preview operator corpus verification'&&j.conclusion==='success')&&jobs.jobs.some((j:any)=>j.name==='Deploy Preview'&&j.conclusion==='failure'),'original proof passed before deployment gate failure');
 const proofJobs=jobs.jobs.filter((j:any)=>j.name==='Preview operator corpus verification'),deployJobs=jobs.jobs.filter((j:any)=>j.name==='Deploy Preview');check(proofJobs.length===1&&deployJobs.length===1&&deployJobs[0].steps.some((s:any)=>s.name==='Require stable preview release registrations before audits'&&s.conclusion==='failure'),'exact original failed gate');
 const ci=await github('/actions/workflows/pr.yml/runs?head_sha='+source.commit+'&event=pull_request&status=success&per_page=10');check(ci.workflow_runs.some((r:any)=>r.head_sha===source.commit&&r.path==='.github/workflows/pr.yml'&&r.event==='pull_request'&&r.conclusion==='success'),'ordinary auditor CI');
 const retainedInputs=await requireRetainedNativeMetadata(github,now);let diagnosticMarker:unknown;
 if(isScopedDiagnostic(a)){
  const name='norton-scoped-diagnostic-ledger-'+a.operationId,markers=await github('/actions/artifacts?name='+name+'&per_page=100');
  check(Number.isSafeInteger(markers.total_count)&&Array.isArray(markers.artifacts)&&markers.total_count===markers.artifacts.length,'complete diagnostic operation ledger');
  if(phase==='prepare')check(markers.total_count===0,'unused diagnostic operation');
  else{
   check(markers.total_count===1,'one diagnostic operation marker');const marker=markers.artifacts[0];
   check(marker.name===name&&Number.isSafeInteger(marker.id)&&marker.id>0&&/^sha256:[a-f0-9]{64}$/.test(marker.digest)&&marker.expired===false&&Date.parse(marker.expires_at)>now+60000&&Number.isSafeInteger(marker.size_in_bytes)&&marker.size_in_bytes>0&&marker.size_in_bytes<=60000&&marker.workflow_run?.id===run.id&&marker.workflow_run?.head_sha===source.commit,'same-run diagnostic operation marker');diagnosticMarker=marker;
  }
 }
 return {runId:String(run.id),auditorCommit:source.commit,auditorTree:source.tree,operationId:a.operationId,ownerActorId:run.actor.id,triggeringActorId:run.triggering_actor.id,retainedInputs,...(diagnosticMarker?{diagnosticMarker}:{})};
}
// Evidence only: never admit usage from this summary or retain provider strings.
export function summarizeUsageResponse(bytes:Buffer){
 const bounded=bytes.length<=1250000,base={bytes:bytes.length,responseSha256:sha(bytes),bounded};
 if(!bounded)return {...base,json:false};
 let v:any;try{v=JSON.parse(bytes.toString());}catch{return {...base,json:false};}
 const list=(x:any)=>Array.isArray(x)?x:undefined,object=(x:any)=>x!==null&&typeof x==='object'&&!Array.isArray(x),count=(x:any)=>Number.isSafeInteger(x)&&x>=0;
 const accounts=list(v?.data?.viewer?.accounts),account=accounts?.length===1?accounts[0]:undefined,groups=list(account?.databases);
 const totals={rowsRead:0,rowsWritten:0,candidateRowsRead:0,candidateRowsWritten:0};let invalidCounters=0,nonUnitSamples=0;
 for(const g of groups?.slice(0,1001)??[]){if(g?.avg?.sampleInterval!==1)nonUnitSamples++;if(!count(g?.sum?.rowsRead)||!count(g?.sum?.rowsWritten)){invalidCounters++;continue;}totals.rowsRead+=g.sum.rowsRead;totals.rowsWritten+=g.sum.rowsWritten;if(g?.dimensions?.databaseId===EXISTING.database){totals.candidateRowsRead+=g.sum.rowsRead;totals.candidateRowsWritten+=g.sum.rowsWritten;}}
 const counters=groups&&groups.length<=1000&&invalidCounters===0&&Object.values(totals).every(count)?totals:null;
 return {...base,json:true,rootObject:object(v),errors:!Object.hasOwn(v??{},'errors')?'absent':v.errors===null?'null':Array.isArray(v.errors)?v.errors.length===0?'empty':'nonempty':'malformed',extensionsPresent:object(v)&&Object.hasOwn(v,'extensions'),accountsCount:accounts?.length??null,accountMatches:account?.accountTag===EXISTING.account,groupsCount:groups?.length??null,nonUnitSamples,invalidCounters,counters};
}
const usageFailureCodes=new Set(['bounded_request_failed','graphql_partial_or_error_response','malformed_object','malformed_list','account_usage_scope_changed','truncated_exclusive_usage_groups','malformed_database_or_version_id','duplicate_usage_partition_database','sampled_or_unknown_account_usage','invalid_account_usage','usage_partition_overflow','utc_rollover_or_stale_capture']);
export function safeContinuationFailure(error:unknown){
 if(diagnosticErrorOutcome(error)==='operation_timeout')return 'diagnostic_operation_deadline';
 if(!(error instanceof Error))return 'unclassified';
 const prefix='Corpus control capture refused: ';if(error.message.startsWith(prefix)){const code=error.message.slice(prefix.length);return usageFailureCodes.has(code)?code:'unclassified';}
 const codes:Record<string,string>={'Existing preview validation refused: live audit failure':'live_audit_failed','Existing preview validation refused: fixed scoped response diagnostic stopped':'scoped_diagnostic_failed','Existing preview validation refused: diagnostic operation deadline':'diagnostic_operation_deadline','Existing preview validation refused: quota read reservation':'quota_read_reservation','Existing preview validation refused: quota candidate writes':'quota_candidate_writes','Existing preview validation refused: quota account writes':'quota_account_writes','Existing preview validation refused: current complete usage':'usage_window_or_completeness','Existing preview validation refused: fresh quota':'stale_usage'};
 return codes[error.message]??'unclassified';
}
export const CONTINUITY_QUERIES=[{label:'schema',sql:CATALOG_SQL,ceiling:4096},{label:'ledger',sql:LEDGER_SQL,ceiling:128},{label:'identity',sql:'SELECT key,value FROM theologai_metadata ORDER BY key LIMIT 32',ceiling:128},{label:'seal',sql:'SELECT * FROM historical_corpus_seal ORDER BY seal_id LIMIT 2',ceiling:128}] as const;
type PreviewOperationInput={approval:PreviewApproval;source:{commit:string;tree:string};equivalence:{candidateSourceCommit:string;auditorCommit:string;auditorTree:string;workerSha256:string;[key:string]:unknown};evidence:ReturnType<typeof verifyHistoricalCandidate>;directory:string;output:string;token:string;revalidate:(signal?:AbortSignal)=>Promise<unknown>;fetch?:typeof fetch;now?:()=>number};
type PreviewOperationResult=Awaited<ReturnType<typeof runPreviewOperation>>;
export function validateExistingPreview(input:PreviewOperationInput&{approval:ExistingApproval}):Promise<Extract<PreviewOperationResult,{purpose:'postdeployment-preview-validation-only'}>>;
export function validateExistingPreview(input:PreviewOperationInput&{approval:ScopedDiagnosticApproval}):Promise<Extract<PreviewOperationResult,{purpose:'response_observation_only'}>>;
export function validateExistingPreview(input:PreviewOperationInput):Promise<PreviewOperationResult>;
export async function validateExistingPreview(input:PreviewOperationInput){return runPreviewOperation(input);}
async function runPreviewOperation(input:PreviewOperationInput){
 check(input.equivalence.candidateSourceCommit===EXISTING.sourceCommit&&input.equivalence.auditorCommit===input.source.commit&&input.equivalence.auditorTree===input.source.tree&&input.equivalence.workerSha256===EXISTING.workerSha256,'separate candidate/auditor equivalence witness');
 const now=input.now??Date.now,diagnostic=isScopedDiagnostic(input.approval),reservation=diagnostic?SCOPED_DIAGNOSTIC.reads:EXISTING.reads,started=now(),operationController=diagnostic?new AbortController():undefined;let operationTimer:ReturnType<typeof setTimeout>|undefined;
 const operation=<T>(pending:Promise<T>)=>operationController?withinDiagnosticSignal(pending,operationController.signal,'operation_timeout'):pending;
 const revalidate=()=>{guard();return operation(input.revalidate(operationController?.signal));};
 const guard=()=>{requirePreviewApproval(input.approval,input.source,now());if(diagnostic)check(!operationController?.signal.aborted&&now()-started<SCOPED_DIAGNOSTIC.durationMs,'diagnostic operation deadline');};guard();
 const eventPath=join(input.output,diagnostic?'scoped-diagnostic.events.jsonl':'continuation.events.jsonl');writeFileSync(eventPath,'',{flag:'wx',mode:0o600});
 const record=(v:unknown)=>appendFileSync(eventPath,JSON.stringify({at:new Date(now()).toISOString(),...(v as object)})+'\n',{mode:0o600,flush:true});
 let calls=0,graphs=0,sqlCalls=0,reads=0;let usageAt=0,stage='owner_admission';
 const net=input.fetch??fetch;
 const limited=(async(url:any,init:any={})=>{guard();check(++calls<=32,'control API exchanges');const p=new URL(String(url));const method=init.method??'GET';
  if(p.pathname==='/client/v4/graphql')check(++graphs<=2,'two usage observations');
  else if(method==='POST'){const body=JSON.parse(String(init.body));check(p.pathname===`/client/v4/accounts/${EXISTING.account}/d1/database/${EXISTING.database}/query`&&CONTINUITY_QUERIES.some(q=>q.sql===body.sql)&&JSON.stringify(body.params)==='[]'&&++sqlCalls<=8,'fixed continuity SELECT only');}
  else check(method==='GET','no mutation route');
  record({kind:'control-dispatch',path:p.pathname,method});return operation(net(url,operationController?{...init,signal:init.signal?AbortSignal.any([init.signal,operationController.signal]):operationController.signal}:init));
 }) as typeof fetch;
 const api=createCorpusApi('preview',async()=>input.token,limited,record);
 const usageApi={...api,graphql:async(body:Parameters<typeof api.graphql>[0])=>{const response=await api.graphql(body);record({kind:'usage-response-observation',stage,...summarizeUsageResponse(Buffer.from(await response.clone().arrayBuffer()))});return response;}};
 const observeUsage=async(phase:string)=>{stage='usage_capture_'+phase;const usage=await captureCorpusUsage({role:'preview',api:usageApi});const accountReads=usage.candidate.rowsRead+usage.otherDatabases.rowsRead;record({kind:'usage-observation',phase,...usage,accountReads,accountReadCeiling:input.approval.accountReadCeiling,analyticsMargin:200000,previousReadReservation:input.approval.previousReadReservation,finalHeldReadReservation:input.approval.previousReadReservation+reservation,headroomAfterReservationAndMargin:input.approval.accountReadCeiling-200000-(phase==='final'?Math.max(accountReads,input.approval.previousReadReservation+reservation):Math.max(accountReads,input.approval.previousReadReservation)+reservation)});stage='quota_'+phase;quota(usage,phase==='final');return usage;};
 const observer=new CorpusProofTransport({policy:'norton-aquinas.v1',role:'preview',token:input.token,readBudget:0,eventFile:join(input.output,'assignment.events.jsonl'),activated:true,historicalExceptions:false,fetch:limited});
 const sourceDb=new Database(join(input.directory,'source/source.db'),{readonly:true,fileMustExist:true});
 const quota=(usage:any,completion=false)=>{const total=usage.candidate.rowsRead+usage.otherDatabases.rowsRead;check(usage.windowStart===EXISTING.validationDay+'T00:00:00.000Z'&&usage.completeDatabaseGroups===true,'current complete usage');usageAt=Date.parse(usage.capturedAt);check(now()-usageAt<=50000&&usageAt<=now(),'fresh quota');check((completion?Math.max(total,input.approval.previousReadReservation+reservation):Math.max(total,input.approval.previousReadReservation)+reservation)+200000<=input.approval.accountReadCeiling,'quota read reservation');check(usage.candidate.rowsWritten<=EXISTING.validationDayCandidateWrites,'quota candidate writes');check(usage.candidate.rowsWritten+usage.otherDatabases.rowsWritten<=80000,'quota account writes');};
 const controls=async()=>{const rows=await observer.observeControls() as any[];check(rows.length===2,'two active roles');for(const r of rows){const preview=r.role==='preview';check((preview||r.role==='production')&&r.versionId===(preview?EXISTING.worker:EXISTING.productionWorker)&&r.deploymentId===(preview?EXISTING.deployment:EXISTING.productionDeployment)&&r.databaseId===(preview?EXISTING.database:EXISTING.productionDatabase),'exact preview/production assignment');}
  const response=await api.get('/workers/scripts/theologai-preview/versions/'+EXISTING.worker);const raw=await response.json() as any;check(raw.success===true&&sha(JSON.stringify(raw.result,null,2)+'\n')===input.evidence.cutover.observedActiveVersionViewSha256,'immutable deployed candidate metadata');return rows;};
 const continuity=async(phase:string)=>{for(const q of CONTINUITY_QUERIES){guard();check(now()-usageAt<=50000&&reads+q.ceiling<=8960,'per-SELECT freshness/read admission');record({kind:'select-intent',phase,label:q.label,sqlSha256:sha(q.sql),readCeiling:q.ceiling,writeCeiling:0});
   const response=await api.authorizedFetch(`https://api.cloudflare.com/client/v4/accounts/${EXISTING.account}/d1/database/${EXISTING.database}/query`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sql:q.sql,params:[]})});check(response.status===200&&!response.redirected,'primary SELECT HTTP status');const envelope=await response.json() as any;
   check(envelope.success===true&&Array.isArray(envelope.errors)&&!envelope.errors.length&&Array.isArray(envelope.result)&&envelope.result.length===1,'complete primary SELECT envelope');const result=envelope.result[0],m=result.meta;
   check(result.success===true&&Array.isArray(result.results)&&m&&Number.isSafeInteger(m.rows_read)&&m.rows_read>=0&&Number.isSafeInteger(m.rows_written)&&m.rows_written>=0&&Number.isSafeInteger(m.changes)&&m.changes>=0&&m.total_attempts===1&&m.served_by_primary===true,'single primary result');reads+=m.rows_read;
   record({kind:'select-result',phase,label:q.label,rowsRead:m.rows_read,rowsWritten:m.rows_written,responseSha256:sha(JSON.stringify(result.results)),changes:m.changes});check(m.rows_read<=q.ceiling&&m.rows_written===0&&m.changes===0,'read-only result within operation ceiling');
   const expected=q.label==='schema'?input.evidence.envelope.receipt.proof.catalogSha256:q.label==='ledger'?input.evidence.envelope.receipt.proof.ledgerSha256:sha(JSON.stringify(sourceDb.prepare(q.sql).all()));
   check(sha(JSON.stringify(result.results))===expected,'continuity '+q.label+' changed');
  }};
 try{
  if(operationController)operationTimer=setTimeout(()=>operationController.abort(),Math.max(0,started+SCOPED_DIAGNOSTIC.durationMs-now()));
  const ownerDispatch=await revalidate();stage='control_assignments_initial';const before=await operation(controls());const initialUsage=await operation(observeUsage('initial'));record({kind:'continuation-admitted',historicalProofSha256:EXISTING.proofSha256,freshProof:false,readsReserved:reservation,writesReserved:0,deploymentAuthorized:false,accountReadCeiling:input.approval.accountReadCeiling,analyticsMargin:200000,previousReadReservation:input.approval.previousReadReservation,finalHeldReadReservation:input.approval.previousReadReservation+reservation,...(diagnostic?{newDiagnosticRole:true}:{carriedForwardRole:CARRY_FORWARD})});stage='continuity_before';await operation(continuity('before'));
  stage='owner_recheck_before_live';await revalidate();guard();check(Date.parse(input.approval.expiresAt)-now()>=12*60000,'full audit window remaining');
  if(diagnostic){
   stage='scoped_diagnostic';check(reads+SCOPED_DIAGNOSTIC.mcpReads+CONTINUITY_QUERIES.reduce((n,q)=>n+q.ceiling,0)<=reservation,'diagnostic remaining role admission');record({kind:'scoped-diagnostic-intent',requestPlanSha256:diagnosticRequestsSha256,reservedMcpReads:SCOPED_DIAGNOSTIC.mcpReads,maximumRequests:3,retries:0});
   const report=await runScopedResponseDiagnostic({fetch:net,guard,deadline:started+SCOPED_DIAGNOSTIC.durationMs,serverVersion:PREVIEW_PROFILE.serverVersion,now,signal:operationController?.signal});
   writeFileSync(join(input.output,'scoped-diagnostic.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
   check(report.completed,'fixed scoped response diagnostic stopped');
   stage='owner_recheck_after_diagnostic';await revalidate();const finalUsage=await operation(observeUsage('final'));stage='continuity_after';await operation(continuity('after'));stage='control_assignments_final';const after=await operation(controls());check(JSON.stringify(after)===JSON.stringify(before),'assignments changed');const finalOwnerDispatch=await revalidate();check(JSON.stringify(finalOwnerDispatch)===JSON.stringify(ownerDispatch),'owner/source provenance changed');guard();
   const result={schemaVersion:'norton-scoped-diagnostic-receipt.v1',purpose:'response_observation_only' as const,releaseAcceptance:false,productionAuthorized:false,operationId:input.approval.operationId,completedAt:new Date(now()).toISOString(),authority:input.approval as ScopedDiagnosticApproval,source:input.source,ownerDispatch,candidate:{worker:EXISTING.worker,deployment:EXISTING.deployment,database:EXISTING.database,workerSha256:EXISTING.workerSha256},reportSha256:sha(JSON.stringify(report)),metering:{continuityRowsRead:reads,mcpReadsReserved:1000,newTotalReadsReserved:10000,totalHeldPreviewReads:3970000,rowsWritten:0,controlRequests:calls,mcpRequests:report.httpExchanges,retries:0,preciseMcpBillingUnavailable:true},before,after,initialUsage,finalUsage};
   record({kind:'scoped-diagnostic-complete',receiptSha256:sha(JSON.stringify(result)),releaseAcceptance:false});writeFileSync(join(input.output,'scoped-diagnostic-receipt.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});return result;
  }
  stage='registration';record({kind:'stabilization-intent',reservedReads:660});const edge=await runPrimarySourceEdgeStabilization({...PREVIEW_PROFILE,corpusRelease:true},{fetchImpl:net});writeFileSync(join(input.output,'edge.json'),JSON.stringify(edge,null,2)+'\n',{flag:'wx',mode:0o600});check(edge.passed,'corrected corpus registration gate');
  guard();stage='live_audit';record({kind:'live-intent',reservedReads:90000,retries:0});
  const live=await auditCorpusRelease({role:'preview',root:process.cwd(),endpoint:'https://preview-mcp.theologai.xyz/mcp',serverVersion:PREVIEW_PROFILE.serverVersion,databasePath:join(input.directory,'source/source.db'),fetch:net,guard});
  const liveText=JSON.stringify(live,null,2)+'\n',failed=Object.hasOwn(live,'failure');
  if(failed){try{record({kind:'live-audit-failed',reportSha256:sha(liveText)});}catch{try{process.stderr.write('Corpus live audit failed; partial report retention may be unavailable. No retry.\n');}catch{}}}
  try{check(Buffer.byteLength(liveText)<=512*1024,'bounded sanitized live report');writeFileSync(join(input.output,'corpus-live.json'),liveText,{flag:'wx',mode:0o600});}catch(error){if(failed)check(false,'live audit failure');throw error;}
  check(!failed,'live audit failure');
  check(live.checks.length===370&&live.checks.every(c=>c.passed)&&JSON.stringify(live.protocols)===JSON.stringify(['2025-11-25','2026-07-28']),'all 370 dual-era live checks');
  stage='owner_recheck_after_live';await revalidate();const finalUsage=await operation(observeUsage('final'));stage='continuity_after';await operation(continuity('after'));stage='control_assignments_final';const after=await operation(controls());check(JSON.stringify(after)===JSON.stringify(before),'assignments changed');stage='owner_recheck_final';const finalOwnerDispatch=await revalidate();check(JSON.stringify(finalOwnerDispatch)===JSON.stringify(ownerDispatch),'owner/source provenance changed');guard();
  const completedAt=new Date(now()).toISOString();const receipt={schemaVersion:'norton-existing-preview-validation-receipt.v1',purpose:'postdeployment-preview-validation-only' as const,operationId:input.approval.operationId,completedAt,candidate:{sourceCommit:EXISTING.sourceCommit,sourceTree:EXISTING.sourceTree,worker:EXISTING.worker,deployment:EXISTING.deployment,database:EXISTING.database,workerSha256:EXISTING.workerSha256},auditor:input.source,runtimeEquivalence:input.equivalence,ownerDispatch,historicalProof:{sha256:EXISTING.proofSha256,completedAt:input.evidence.historicalVerificationAt,historicalValidationClock:input.evidence.historicalVerificationAt,structurallyReverifiedAsHistorical:true,freshProof:false,validationDay:EXISTING.validationDay,maximumAgeMsApproved:EXISTING.maximumHistoricalProofAgeMs,ageAtValidationMs:Date.parse(completedAt)-Date.parse(EXISTING.proofCompletedAt)},custody:input.approval.uninterruptedDataCustody,authority:input.approval as ExistingApproval,quotaPolicy:{accountReadCeiling:input.approval.accountReadCeiling,analyticsMargin:200000,previousReadReservation:input.approval.previousReadReservation,finalHeldReadReservation:input.approval.previousReadReservation+reservation,carriedForwardRole:CARRY_FORWARD},checks:370,protocols:live.protocols,liveSha256:sha(JSON.stringify(live)),edgeSha256:sha(JSON.stringify(edge)),metering:{continuityRowsRead:reads,rowsWritten:0,controlRequests:calls,liveReadsReserved:90000,newTotalReadsReserved:100000,knownPriorReads:EXISTING.knownPriorReads,actualPriorDiagnosticWrites:7,heldPriorDiagnosticWrites:8,preciseLiveBillingUnavailable:true},before,after,initialUsage,finalUsage};
  record({kind:'continuation-complete',receiptSha256:sha(JSON.stringify(receipt))});writeFileSync(join(input.output,'continuation-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});return receipt;
 }catch(error){try{record({kind:'STOP',stage,reason:safeContinuationFailure(error),retainWholeReadReservation:reservation,retry:false,leaveCandidateActive:true});}catch{try{process.stderr.write('Existing preview validation stopped; journal unavailable. Preserve bounded reports and full read reservation; no retry.\n');}catch{}}throw Error('Existing preview validation stopped; preserve full reservation and journals, no retry');}finally{if(operationTimer)clearTimeout(operationTimer);sourceDb.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [mode,requestPath,directory,candidateRoot,last]=process.argv.slice(2);
 check((mode==='prepare'||mode==='validate')&&requestPath&&directory&&candidateRoot&&last&&process.argv.length===7,'exact continuation arguments');
 const source={commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}')},environment=process.env;
 const a=json(requestPath!);let calls=0,activeOperationSignal:AbortSignal|undefined;
 const github=async(route:string)=>{check(!activeOperationSignal?.aborted,'diagnostic operation deadline');check(++calls<=(mode==='prepare'?16:64),'GitHub exchange budget');const response=await fetch('https://api.github.com/repos/'+EXISTING.repository+route,{redirect:'error',headers:{authorization:'Bearer '+environment.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:activeOperationSignal?AbortSignal.any([activeOperationSignal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});check(response.ok&&response.body,'GitHub metadata status');const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let bytes=0;try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;check(bytes<=2*1024*1024,'GitHub metadata bytes');chunks.push(r.value);}}finally{await reader.cancel();}return JSON.parse(Buffer.concat(chunks).toString());};
 const run=async()=>{
  check(environment.GITHUB_TOKEN,'existing GitHub token');requirePreviewApproval(a,source);
  const classification=classifyApplicationRelease(process.cwd());check(classification.sourceCommit===source.commit&&classification.sourceTree===source.tree,'clean exact auditor checkout');
  const admission=mode==='prepare'?await requireExistingDispatch(a,source,github,environment,Date.now(),'prepare'):undefined;
  const evidence=verifyHistoricalCandidate(directory!,candidateRoot!);
  const priorCustody=mode==='prepare'?admission!.retainedInputs:json(join(directory!,'equivalence.json')).admission.retainedInputs;
  verifyRetainedInputEvidence(directory!,priorCustody,NATIVE_ARTIFACTS,EXISTING.run,EXISTING.sourceCommit);
  if(mode==='prepare'){
   const equivalence=requireRuntimeEquivalence(process.cwd(),last!);
   // Local maps can differ in build roots; their source content/mappings must remain exact.
   const oldMap=JSON.parse(file(join(directory!,'worker/worker.js.map'),16*1024*1024).toString()),newMap=JSON.parse(file(join(last!,'worker.js.map'),16*1024*1024).toString());
   const strip=(m:any)=>Object.fromEntries(Object.entries(m).filter(([k])=>k!=='sourceRoot'&&k!=='sources'));
   check(JSON.stringify(strip(oldMap))===JSON.stringify(strip(newMap)),'debug map source contents or mappings changed');
   const oldPaths=oldMap.sources.map((s:string)=>posix.relative('/home/runner/work/TheologAI/TheologAI',posix.resolve(oldMap.sourceRoot,s))),newPaths=newMap.sources.map((s:string)=>posix.relative(process.cwd(),posix.resolve(newMap.sourceRoot,s)));
   check(JSON.stringify(oldPaths)===JSON.stringify(newPaths),'debug map repository source paths changed');
   if(environment.GITHUB_OUTPUT)appendFileSync(environment.GITHUB_OUTPUT,'operation_kind='+(isScopedDiagnostic(a)?'diagnostic':'validation')+'\noperation_id='+a.operationId+'\n');
   writeFileSync(join(directory!,'equivalence.json'),JSON.stringify({schemaVersion:'norton-fixed-runtime-equivalence.v1',...equivalence,auditorTree:source.tree,admission,historicalVerificationAt:evidence.historicalVerificationAt,freshProof:false},null,2)+'\n',{flag:'wx',mode:0o600});return;
  }
  const witness=json(join(directory!,'equivalence.json'));
  check(witness.auditorCommit===source.commit&&witness.auditorTree===source.tree&&witness.admission.runId===environment.GITHUB_RUN_ID&&witness.admission.operationId===a.operationId,'same-run distinct auditor witness');
  requireRuntimeEquivalence(process.cwd(),join(directory!,'auditor-bundle'));
  check(environment.CLOUDFLARE_API_TOKEN&&environment.CLOUDFLARE_ACCOUNT_ID===EXISTING.account&&!environment.CLOUDFLARE_API_BASE_URL,'existing preview read credential');
  mkdirSync(last!,{mode:0o700});
  for(const [from,to]of[['equivalence.json','runtime-equivalence.json'],['proof/operator-proof-envelope.json','historical-proof-envelope.json'],['source/plan.json','historical-source-plan.json'],['worker/release-manifest.json','historical-worker-manifest.json']])writeFileSync(join(last!,to!),file(join(directory!,from!),1024*1024),{flag:'wx',mode:0o600});
  await validateExistingPreview({approval:a,source,equivalence:witness,evidence,directory:directory!,output:last!,token:environment.CLOUDFLARE_API_TOKEN!,revalidate:(signal)=>{activeOperationSignal=signal;return requireExistingDispatch(a,source,github,environment);}});
 };
 run().catch(()=>{process.stderr.write('Existing preview validation stopped; retain its full read reservation and sanitized evidence. No retry or mutation.\n');process.exitCode=1;});
}
