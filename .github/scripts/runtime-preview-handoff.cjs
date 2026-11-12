'use strict';
// One accepted split-run preview prerequisite; never a production deployment grant.
const {createHash}=require('node:crypto');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
const {join}=require('node:path');
const RELEASE_POLICY=require('./norton-aquinas-policy.cjs');
const PINS=Object.freeze({repository:'TJ-Frederick/TheologAI',owner:40179660,pr:176,successorPR:177,preparationPR:178,patchPR:180,preparationMerge:'60afe426f87245b6f38c7422135c599410303822',preparationTree:'e43c99ec2bc2cfc159c1e89d1702cef192aed267',preparationHead:'93280448492453776665036844922401929fd3bf',previousMerge:'7960e5a33b83ca828e3763f765f2450907e494b0',previousTree:'6be4ba3935d80b6453edba263a5c2085fb6294e4',previousHead:'aa219f73cd5c394e2e13a19e5c7e1a637f1b6af2',originalMerge:'959d6535f3ffb87a00633b208e2ca10d5090fe5f',originalHead:'19efe8f399a89401212874462d5a89f48f48c679',originalTree:'589bdff668072d9e4d72113c490bb0b0074a0c19',source:'6c43cbc5d42f71c6f0c8bae526269313c3539003',tree:'76d5aa0cccb74932307c2024ca9c76bc732a1c03',run:42927858781,producer:42927918549,
 result:{id:13816255512,name:'preview-runtime-reuse-42927858781-attempt-1',digest:'sha256:e67668dc8b75294500e60fcf4dfaa18aa07b5e83fcb212c97f40c24232cc9d9d',maxBytes:1024*1024},
 inputs:{id:13813738537,name:'existing-preview-inputs-42927918549-attempt-1',digest:'sha256:267c7b6103bfc1657ee723e88e134e7efd6bb87b1a17db2323146ea6d625bbd1',maxBytes:128*1024*1024},
 request:{id:13814314094,name:'norton-preview-runtime-reuse-request-42927858781-attempt-1',digest:'sha256:aaaa36a221e2cf65e26e311d8b4e71b3b7b13059207dd2bf3e7dd3feb6be80ea',maxBytes:128*1024},
 ledger:{id:13815570029,name:'norton-preview-runtime-reuse-ledger-operation-runtime-reuse-20261111-6c43cbc-once',digest:'sha256:aaaa36a221e2cf65e26e311d8b4e71b3b7b13059207dd2bf3e7dd3feb6be80ea',maxBytes:128*1024},
 worker:'8fb1be2c-72f7-4a4e-bbd6-117adfc30410',deployment:'62da1803-b313-4dc7-94bf-80d3394957b1',database:'62b871a6-5b4d-4d9b-8f52-301f6c878f48',versionSha256:'5ede2d9471e4441b168502ddddbe26c285a7180719a5a474ec2dd2e1fd0cac69',
 workerSha256:'882f7501271ed77097ad3b6967d0708dbbdbab9b03af85cff2476bb188132a84',manifestSha256:'373ca36f76bfe134a6154e1db959798b54d69321cb7877a2c0245eaff502a12d',historicalExpiry:'2026-11-12T02:45:14.748Z'});
const TOOLING_PATHS=new Set([
 '.github/scripts/norton-aquinas-policy.cjs',
 '.github/scripts/operator-authorization.cjs',
 '.github/scripts/prepare-norton-production.ts',
 '.github/scripts/runtime-preview-handoff.cjs',
 '.github/scripts/verify-runtime-preview-handoff.ts',
 '.github/workflows/deploy.yml',
 'release/norton-aquinas.json',
 'scripts/application-corpus-check.ts',
 'scripts/corpus-proof-transport.ts',
 'scripts/corpus-source-proof.ts',
 'scripts/norton-aquinas-preparation.ts',
 'test/unit/scripts/nortonAquinasPreparation.test.ts',
 'scripts/norton-aquinas-live.ts',
 'scripts/norton-aquinas-release-policy.d.mts',
 'scripts/norton-aquinas-release-policy.mjs',
 'scripts/operator-corpus-proof.ts',
 'test/helpers/corpusTransportFixture.ts',
 'test/test-topology.json',
 'test/unit/scripts/boundPreviewProof.test.ts',
 'test/unit/scripts/nortonAquinasLiveWorkflow.test.ts',
 'test/unit/scripts/nortonOperatorCorpusProof.test.ts',
 'test/unit/scripts/nortonOperatorSuccessorFlow.test.ts',
 'test/unit/scripts/nortonProductionOperation.test.ts',
 'test/unit/scripts/productionReleaseGuards.test.ts',
 'test/unit/scripts/runtimePreviewHandoff.test.ts',
 'tsconfig.release-scripts.json',
]);
const SUCCESSOR_PATHS=new Set(['.github/scripts/runtime-preview-handoff.cjs','.github/scripts/verify-runtime-preview-handoff.ts','test/unit/scripts/runtimePreviewHandoff.test.ts','.github/workflows/deploy.yml','.github/scripts/norton-aquinas-policy.cjs','.github/scripts/operator-authorization.cjs','.github/scripts/prepare-norton-production.ts','scripts/norton-aquinas-release-policy.d.mts','test/unit/scripts/nortonProductionOperation.test.ts']);
const CHECKER_BLOBS=Object.freeze({'scripts/corpus-source-proof.ts':'7ffec2bc08eb8f5e27ceea5bf6bac55f65fc26a7','scripts/norton-aquinas-preparation.ts':'fba90b146beff2e53e6c89eb721c384ecff0bed7'});
const PREPARATION_PATHS=new Set(['.github/scripts/operator-authorization.cjs','scripts/norton-aquinas-release-policy.d.mts','.github/scripts/norton-aquinas-policy.cjs','.github/scripts/prepare-norton-production.ts','.github/scripts/runtime-preview-handoff.cjs','.github/scripts/verify-runtime-preview-handoff.ts','.github/workflows/deploy.yml','release/norton-aquinas.json','scripts/corpus-source-proof.ts','scripts/norton-aquinas-preparation.ts','test/unit/scripts/nortonAquinasPreparation.test.ts','test/unit/scripts/nortonProductionOperation.test.ts','test/unit/scripts/runtimePreviewHandoff.test.ts']);
const check=(value,reason)=>{if(!value)throw Error('Runtime preview handoff refused: '+reason);};
const sha=v=>createHash('sha256').update(v).digest('hex');
const hex=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const PATCH_PATHS=new Set(['test/unit/scripts/nortonAquinasPolicy.test.ts','package-lock.json','.github/scripts/norton-aquinas-policy.cjs','.github/scripts/runtime-preview-handoff.cjs','.github/scripts/verify-runtime-preview-handoff.ts','.github/workflows/pr.yml','.github/workflows/deploy.yml','scripts/norton-aquinas-release-policy.mjs','test/unit/scripts/runtimePreviewHandoff.test.ts']);
function successorScope(pr){
 if(pr===PINS.patchPR)return {base:PINS.preparationMerge,tree:PINS.preparationTree,allowed:PATCH_PATHS};
 if(pr===PINS.preparationPR)return {base:PINS.previousMerge,tree:PINS.previousTree,allowed:PREPARATION_PATHS};
 check(pr===PINS.successorPR,'exact successor PR');
 return {base:PINS.originalMerge,tree:PINS.originalTree,allowed:SUCCESSOR_PATHS};
}
function reviewedPaths(paths,patch=false){check(Array.isArray(paths)&&paths.length<=100&&paths.every(path=>TOOLING_PATHS.has(path)||(patch&&PATCH_PATHS.has(path))),'reviewed tooling-only change inventory');return paths;}
function requireToolingOnlySource(root,expected){
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
 check(git('rev-parse','HEAD')===expected.mergeCommit&&git('rev-parse','HEAD^{tree}')===expected.mergeTree&&git('rev-parse',PINS.source+'^{tree}')===PINS.tree,'exact consumer and accepted source trees');
 execFileSync('git',['merge-base','--is-ancestor',PINS.source,'HEAD'],{cwd:root});
 if(expected.mergeCommit!==PINS.originalMerge){
  const preparation=expected.consumerPullRequest===PINS.preparationPR,{base,tree,allowed}=successorScope(expected.consumerPullRequest);
  if(expected.consumerPullRequest===PINS.patchPR)check(git('rev-parse','HEAD:package-lock.json')===RELEASE_POLICY.productionLockBlob,'reviewed Hono lock');
  const parents=git('show','-s','--format=%P','HEAD').split(' ');check(parents.length===2&&parents[0]===base&&parents[1]===expected.consumerCommit,'local single successor merge');
  check(git('rev-list','--merges',base+'..'+expected.consumerCommit)==='','local linear successor');
  check(git('diff','--name-only',base,'HEAD').split('\n').filter(Boolean).every(p=>allowed.has(p)),'local closed successor tooling paths');
  check(git('rev-parse',base+'^{tree}')===tree&&git('rev-parse',expected.consumerCommit+'^{tree}')===expected.mergeTree,'local pinned original and successor trees');
  if(preparation)for(const [path,blob]of Object.entries(CHECKER_BLOBS))check(git('rev-parse','HEAD:'+path)===blob,'exact reviewed preparation checker blob');
 }
 const paths=reviewedPaths(git('diff','--name-only',PINS.source,'HEAD').split('\n').filter(Boolean),expected.consumerPullRequest===PINS.patchPR);
 for(const path of paths){const line=git('ls-tree','HEAD','--',path);check(/^100644 blob [a-f0-9]{40}\t/.test(line),'regular reviewed tooling file');}
 return{acceptedSource:{commit:PINS.source,tree:PINS.tree},consumerSource:{commit:expected.mergeCommit,tree:expected.mergeTree},reviewedToolingPaths:paths};
}
async function resolveRuntimePreviewHandoff({github,context,pin,now=Date.now()}){
 check(RELEASE_POLICY.productMerge===PINS.originalMerge&&RELEASE_POLICY.productionReleasePR===PINS.patchPR&&RELEASE_POLICY.productionPredecessorMerge===PINS.preparationMerge,'fixed successor release policy');
 const repo=context.repo;check(repo.owner==='TJ-Frederick'&&repo.repo==='TheologAI'&&hex(context.sha),'repository and consumer commit');
 const {data:original}=await github.rest.pulls.get({...repo,pull_number:PINS.pr});
 check(original.number===PINS.pr&&original.merged_at&&original.base.ref==='main'&&original.merge_commit_sha===PINS.originalMerge&&original.head.sha===PINS.originalHead&&original.head.repo.full_name===PINS.repository,'pinned original merged PR');
 const {data:originalCommit}=await github.rest.git.getCommit({...repo,commit_sha:PINS.originalMerge});check(originalCommit.sha===PINS.originalMerge&&originalCommit.tree.sha===PINS.originalTree,'pinned original merge tree');
 const {data:pulls}=await github.rest.repos.listPullRequestsAssociatedWithCommit({...repo,commit_sha:context.sha});const merged=pulls.filter(p=>p.merged_at&&p.base.ref==='main'&&p.merge_commit_sha===context.sha);check(merged.length===1,'one merged release PR');const pull=merged[0];
 check(hex(pull.head.sha)&&pull.head.repo.full_name===PINS.repository,'same-repository tooling source');
 const {data:merge}=await github.rest.git.getCommit({...repo,commit_sha:context.sha}),{data:head}=await github.rest.git.getCommit({...repo,commit_sha:pull.head.sha});check(merge.sha===context.sha&&head.sha===pull.head.sha&&hex(merge.tree.sha)&&merge.tree.sha===head.tree.sha,'exact merged and PR-head tree');
 if(context.sha===PINS.originalMerge)check(pull.number===PINS.pr&&pull.head.sha===PINS.originalHead,'original consumer');
 else{
  const preparation=pull.number===PINS.preparationPR,{base,allowed}=successorScope(pull.number);
  if(pull.number===PINS.patchPR){
   const {data:prior}=await github.rest.git.getCommit({...repo,commit_sha:PINS.preparationMerge});
   const {data:priorPR}=await github.rest.pulls.get({...repo,pull_number:PINS.preparationPR});
   check(prior.sha===base&&prior.tree.sha===PINS.preparationTree&&prior.parents?.length===2&&prior.parents[0].sha===PINS.previousMerge&&prior.parents[1].sha===PINS.preparationHead&&priorPR.merged_at&&priorPR.number===PINS.preparationPR&&priorPR.base.ref==='main'&&priorPR.head.repo.full_name===PINS.repository&&priorPR.merge_commit_sha===base&&priorPR.head.sha===PINS.preparationHead,'pinned PR178 predecessor');
   const {data:lock}=await github.rest.repos.getContent({...repo,path:'package-lock.json',ref:pull.head.sha});check(lock.type==='file'&&lock.path==='package-lock.json'&&lock.sha===RELEASE_POLICY.productionLockBlob,'reviewed Hono lock');
  }
  if(preparation){
   const {data:previous}=await github.rest.pulls.get({...repo,pull_number:PINS.successorPR}),{data:prior}=await github.rest.git.getCommit({...repo,commit_sha:PINS.previousMerge});
   check(previous.merged_at&&previous.number===PINS.successorPR&&previous.base.ref==='main'&&previous.merge_commit_sha===PINS.previousMerge&&previous.head.sha===PINS.previousHead&&previous.head.repo.full_name===PINS.repository&&prior.sha===PINS.previousMerge&&prior.tree.sha===PINS.previousTree&&prior.parents?.length===2&&prior.parents[0].sha===PINS.originalMerge&&prior.parents[1].sha===PINS.previousHead,'pinned prior PR177 evidence');
   for(const [path,blob]of Object.entries(CHECKER_BLOBS)){const{data:file}=await github.rest.repos.getContent({...repo,path,ref:pull.head.sha});check(file.type==='file'&&file.path===path&&file.sha===blob,'exact reviewed preparation checker blob');}
  }
  check(merge.parents?.length===2&&merge.parents[0].sha===base&&merge.parents[1].sha===pull.head.sha,'single successor merge onto pinned original');
  const {data:successor}=await github.rest.repos.compareCommitsWithBasehead({...repo,basehead:base+'...'+pull.head.sha});
  check(successor.status==='ahead'&&successor.merge_base_commit?.sha===base&&successor.total_commits>0&&successor.total_commits<=100&&successor.commits?.length===successor.total_commits&&successor.commits.every(c=>c.parents?.length===1),'linear reviewed successor');
  const paths=reviewedPaths(successor.files?.flatMap(f=>f.previous_filename?[f.filename,f.previous_filename]:[f.filename]),pull.number===PINS.patchPR);check(paths.every(p=>allowed.has(p)),'closed successor tooling paths');
 }
 const {data:comparison}=await github.rest.repos.compareCommitsWithBasehead({...repo,basehead:PINS.source+'...'+pull.head.sha});check(comparison.merge_base_commit?.sha===PINS.source&&['ahead','identical'].includes(comparison.status)&&comparison.total_commits<=100,'accepted source ancestor');
 reviewedPaths(comparison.files?.flatMap(f=>f.previous_filename?[f.filename,f.previous_filename]:[f.filename]),pull.number===PINS.patchPR);
 const {data:associations}=await github.rest.repos.listPullRequestsAssociatedWithCommit({...repo,commit_sha:PINS.source,per_page:100});const claims=associations.filter(p=>p.number===PINS.pr||p.merge_commit_sha===PINS.originalMerge);check(associations.length<100&&claims.length===1&&claims[0].number===PINS.pr&&claims[0].merge_commit_sha===PINS.originalMerge&&claims[0].merged_at&&claims[0].head.sha===PINS.originalHead&&claims[0].base.ref==='main','authoritative accepted commit PR association');
 const runs={};for(const[id,event]of[[PINS.run,'pull_request'],[PINS.producer,'workflow_dispatch']]){
  const{data:run}=await github.rest.actions.getWorkflowRun({...repo,run_id:id});check(run.id===id&&run.run_attempt===1&&run.event===event&&run.path==='.github/workflows/pr.yml'&&run.head_sha===PINS.source&&run.status==='completed'&&run.conclusion==='success'&&run.actor?.id===PINS.owner&&run.triggering_actor?.id===PINS.owner&&Date.parse(run.updated_at)<=now+300000&&Date.parse(run.updated_at)>=now-7*86400000,'successful exact native PR/owner run');runs[id]=run;
 }
 check(Array.isArray(runs[PINS.run].pull_requests)&&runs[PINS.run].pull_requests.every(p=>p.number===PINS.pr&&p.head.sha===PINS.source),'inline accepted PR-run disagreement');
 for(const[id,names]of[[PINS.run,['Select Validation','Test & Build','Fresh Checkout & Data','Node HTTP E2E','Worker Runtime & D1','Applicable MCP Conformance','Validation Complete','Build preview Worker artifact (no cloud credentials)','Verify operator proof source (no cloud credentials)','Preview operator corpus verification']],[PINS.producer,['Verify deployed Norton candidate and distinct auditor (no cloud credentials)']]]){
  const{data:jobs}=await github.rest.actions.listJobsForWorkflowRun({...repo,run_id:id,filter:'latest',per_page:100});check(jobs.total_count===jobs.jobs.length&&jobs.total_count<=100,'complete native job roster');
  if(id===PINS.run){
   const listed=jobs.jobs.find(j=>j.id===130218936324&&j.name==='Test & Build');check(listed,'exact accepted CI job in native roster');
   const {data:job}=await github.rest.actions.getJobForWorkflowRun({...repo,job_id:130218936324});
   check(job.id===listed.id&&job.run_id===PINS.run&&job.run_attempt===1&&job.head_sha===PINS.source&&job.name===listed.name&&job.status===listed.status&&job.conclusion===listed.conclusion&&JSON.stringify(job.steps)===JSON.stringify(listed.steps),'authoritative native job disagreement');
   const {data:rawLog}=await github.rest.actions.downloadJobLogsForWorkflowRun({...repo,job_id:130218936324});
   const log=typeof rawLog==='string'?rawLog:Buffer.from(rawLog).toString('utf8');check(Buffer.byteLength(log)>0&&Buffer.byteLength(log)<=2*1024*1024,'bounded protected job log');
   const refs=[...log.matchAll(/\bCI_REF:\s*([^\s]+)/g)].map(m=>m[1]);check(refs.length>0&&refs.every(ref=>ref==='refs/pull/176/merge'),'authoritative protected job PR ref disagreement');
  }
  for(const name of names)check(jobs.jobs.filter(j=>j.name===name&&j.status==='completed'&&j.conclusion==='success').length===1,'successful exact native source/protected job');
  if(id===PINS.producer)check(jobs.jobs.every(j=>j.conclusion!=='success'||j.name===names[0]),'credential-free owner preparation only');
  check(!jobs.jobs.some(j=>j.conclusion==='failure'||j.conclusion==='cancelled'),'no failed native job');
  if(id===PINS.run){const protectedJob=jobs.jobs.find(j=>j.name==='Preview operator corpus verification');check(protectedJob.steps?.filter(s=>s.name==='Validate the closed preview runtime purpose'&&s.conclusion==='success').length===1&&protectedJob.steps?.filter(s=>s.name==='Accept complete operator proof through the preview gate'&&s.conclusion==='skipped').length===1,'accepted split purpose, no fresh-proof claim');check(jobs.jobs.filter(j=>j.name==='Deploy Preview'&&j.conclusion==='skipped').length===1,'ordinary preview deployment skipped');}
 }
 const artifacts={};for(const[id,keys]of[[PINS.run,['result']],[PINS.producer,['inputs','request','ledger']]]){
  const{data:list}=await github.rest.actions.listWorkflowRunArtifacts({...repo,run_id:id,per_page:100});check(list.total_count===list.artifacts.length&&list.total_count<=100,'complete native artifact roster');
  for(const key of keys){const p=PINS[key],matches=list.artifacts.filter(a=>a.id===p.id&&a.name===p.name);check(matches.length===1,'unique exact split artifact');const a=matches[0];check(a.digest===p.digest&&!a.expired&&Date.parse(a.expires_at)>now&&a.workflow_run?.id===id&&a.workflow_run.head_sha===PINS.source&&Number.isSafeInteger(a.size_in_bytes)&&a.size_in_bytes>0&&a.size_in_bytes<=p.maxBytes,'native archive digest/source/retention');artifacts[key]={id:a.id,name:a.name,digest:a.digest,bytes:a.size_in_bytes,expiresAt:a.expires_at,runId:id};}
 }
 const binding={kind:'norton-runtime-preview',repository:PINS.repository,pullRequest:176,consumerPullRequest:pull.number,originalMerge:PINS.originalMerge,mergeCommit:context.sha,mergeTree:merge.tree.sha,consumerCommit:pull.head.sha,acceptedSource:{commit:PINS.source,tree:PINS.tree},run:{id:PINS.run,attempt:1,event:'pull_request'},producer:{id:PINS.producer,attempt:1,event:'workflow_dispatch',actor:PINS.owner,triggeringActor:PINS.owner},artifacts};
 if(pin)check(JSON.stringify(binding)===JSON.stringify(pin),'pinned split native evidence changed');return binding;
}
function verifyNativeArchive(key,bytes,artifact,now=Date.now()){
 const pin=PINS[key];check(['result','inputs','request'].includes(key)&&pin&&Buffer.isBuffer(bytes),'closed native archive purpose');
 check(artifact.id===pin.id&&artifact.digest===pin.digest&&artifact.runId===(key==='result'?PINS.run:PINS.producer)&&Date.parse(artifact.expiresAt)>now,'pinned archive before consumption');
 check(bytes.length===artifact.bytes&&bytes.length<=pin.maxBytes&&'sha256:'+sha(bytes)===pin.digest,'actual native ZIP bytes');return bytes;
}
async function downloadRuntimePreviewArchives({github,binding,directory,now=Date.now()}){
 check(binding.kind==='norton-runtime-preview','download purpose');mkdirSync(directory,{recursive:true,mode:0o700});
 for(const key of['result','inputs','request']){const a=binding.artifacts[key],p=PINS[key];check(a.id===p.id&&a.digest===p.digest&&a.runId===(key==='result'?PINS.run:PINS.producer)&&Date.parse(a.expiresAt)>now,'pinned archive before download');const{data}=await github.rest.actions.downloadArtifact({owner:'TJ-Frederick',repo:'TheologAI',artifact_id:a.id,archive_format:'zip'});const bytes=verifyNativeArchive(key,Buffer.from(data),a,now);writeFileSync(join(directory,key+'.zip'),bytes,{flag:'wx',mode:0o600});}
}
module.exports={PINS,CHECKER_BLOBS,TOOLING_PATHS,requireToolingOnlySource,resolveRuntimePreviewHandoff,downloadRuntimePreviewArchives,verifyNativeArchive};
