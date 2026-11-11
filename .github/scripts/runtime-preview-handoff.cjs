'use strict';
// One accepted split-run preview prerequisite; never a production deployment grant.
const {createHash}=require('node:crypto');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
const {join}=require('node:path');
const PINS=Object.freeze({repository:'TJ-Frederick/TheologAI',owner:40179660,pr:176,source:'6c43cbc5d42f71c6f0c8bae526269313c3539003',tree:'76d5aa0cccb74932307c2024ca9c76bc732a1c03',run:42927858781,producer:42927918549,
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
const check=(value,reason)=>{if(!value)throw Error('Runtime preview handoff refused: '+reason);};
const sha=v=>createHash('sha256').update(v).digest('hex');
const hex=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
function reviewedPaths(paths){check(Array.isArray(paths)&&paths.length<=100&&paths.every(path=>TOOLING_PATHS.has(path)),'reviewed tooling-only change inventory');return paths;}
function requireToolingOnlySource(root,expected){
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
 check(git('rev-parse','HEAD')===expected.mergeCommit&&git('rev-parse','HEAD^{tree}')===expected.mergeTree&&git('rev-parse',PINS.source+'^{tree}')===PINS.tree,'exact consumer and accepted source trees');
 execFileSync('git',['merge-base','--is-ancestor',PINS.source,'HEAD'],{cwd:root});
 const paths=reviewedPaths(git('diff','--name-only',PINS.source,'HEAD').split('\n').filter(Boolean));
 for(const path of paths){const line=git('ls-tree','HEAD','--',path);check(/^100644 blob [a-f0-9]{40}\t/.test(line),'regular reviewed tooling file');}
 return{acceptedSource:{commit:PINS.source,tree:PINS.tree},consumerSource:{commit:expected.mergeCommit,tree:expected.mergeTree},reviewedToolingPaths:paths};
}
async function resolveRuntimePreviewHandoff({github,context,pin,now=Date.now()}){
 const repo=context.repo;check(repo.owner==='TJ-Frederick'&&repo.repo==='TheologAI'&&hex(context.sha),'repository and consumer commit');
 const {data:pulls}=await github.rest.repos.listPullRequestsAssociatedWithCommit({...repo,commit_sha:context.sha});const merged=pulls.filter(p=>p.number===176&&p.merged_at&&p.base.ref==='main'&&p.merge_commit_sha===context.sha);check(merged.length===1,'one merged release PR');const pull=merged[0];
 check(hex(pull.head.sha)&&pull.head.repo.full_name===PINS.repository,'same-repository tooling source');
 const {data:merge}=await github.rest.git.getCommit({...repo,commit_sha:context.sha}),{data:head}=await github.rest.git.getCommit({...repo,commit_sha:pull.head.sha});check(hex(merge.tree.sha)&&merge.tree.sha===head.tree.sha,'exact merged and PR-head tree');
 const {data:comparison}=await github.rest.repos.compareCommitsWithBasehead({...repo,basehead:PINS.source+'...'+pull.head.sha});check(comparison.merge_base_commit?.sha===PINS.source&&['ahead','identical'].includes(comparison.status)&&comparison.total_commits<=100,'accepted source ancestor');
 reviewedPaths(comparison.files?.flatMap(f=>f.previous_filename?[f.filename,f.previous_filename]:[f.filename]));
 const runs={};for(const[id,event]of[[PINS.run,'pull_request'],[PINS.producer,'workflow_dispatch']]){
  const{data:run}=await github.rest.actions.getWorkflowRun({...repo,run_id:id});check(run.id===id&&run.run_attempt===1&&run.event===event&&run.path==='.github/workflows/pr.yml'&&run.head_sha===PINS.source&&run.status==='completed'&&run.conclusion==='success'&&run.actor?.id===PINS.owner&&run.triggering_actor?.id===PINS.owner&&Date.parse(run.updated_at)<=now+300000&&Date.parse(run.updated_at)>=now-7*86400000,'successful exact native PR/owner run');runs[id]=run;
 }
 check(runs[PINS.run].pull_requests?.some(p=>p.number===176&&p.head.sha===PINS.source),'accepted PR-run link');
 for(const[id,names]of[[PINS.run,['Select Validation','Test & Build','Fresh Checkout & Data','Node HTTP E2E','Worker Runtime & D1','Applicable MCP Conformance','Validation Complete','Build preview Worker artifact (no cloud credentials)','Verify operator proof source (no cloud credentials)','Preview operator corpus verification']],[PINS.producer,['Verify deployed Norton candidate and distinct auditor (no cloud credentials)']]]){
  const{data:jobs}=await github.rest.actions.listJobsForWorkflowRun({...repo,run_id:id,filter:'latest',per_page:100});check(jobs.total_count===jobs.jobs.length&&jobs.total_count<=100,'complete native job roster');
  for(const name of names)check(jobs.jobs.filter(j=>j.name===name&&j.status==='completed'&&j.conclusion==='success').length===1,'successful exact native source/protected job');
  if(id===PINS.producer)check(jobs.jobs.every(j=>j.conclusion!=='success'||j.name===names[0]),'credential-free owner preparation only');
  check(!jobs.jobs.some(j=>j.conclusion==='failure'||j.conclusion==='cancelled'),'no failed native job');
  if(id===PINS.run){const protectedJob=jobs.jobs.find(j=>j.name==='Preview operator corpus verification');check(protectedJob.steps?.filter(s=>s.name==='Validate the closed preview runtime purpose'&&s.conclusion==='success').length===1&&protectedJob.steps?.filter(s=>s.name==='Accept complete operator proof through the preview gate'&&s.conclusion==='skipped').length===1,'accepted split purpose, no fresh-proof claim');check(jobs.jobs.filter(j=>j.name==='Deploy Preview'&&j.conclusion==='skipped').length===1,'ordinary preview deployment skipped');}
 }
 const artifacts={};for(const[id,keys]of[[PINS.run,['result']],[PINS.producer,['inputs','request','ledger']]]){
  const{data:list}=await github.rest.actions.listWorkflowRunArtifacts({...repo,run_id:id,per_page:100});check(list.total_count===list.artifacts.length&&list.total_count<=100,'complete native artifact roster');
  for(const key of keys){const p=PINS[key],matches=list.artifacts.filter(a=>a.id===p.id&&a.name===p.name);check(matches.length===1,'unique exact split artifact');const a=matches[0];check(a.digest===p.digest&&!a.expired&&Date.parse(a.expires_at)>now&&a.workflow_run?.id===id&&a.workflow_run.head_sha===PINS.source&&Number.isSafeInteger(a.size_in_bytes)&&a.size_in_bytes>0&&a.size_in_bytes<=p.maxBytes,'native archive digest/source/retention');artifacts[key]={id:a.id,name:a.name,digest:a.digest,bytes:a.size_in_bytes,expiresAt:a.expires_at,runId:id};}
 }
 const binding={kind:'norton-runtime-preview',repository:PINS.repository,pullRequest:176,mergeCommit:context.sha,mergeTree:merge.tree.sha,consumerCommit:pull.head.sha,acceptedSource:{commit:PINS.source,tree:PINS.tree},run:{id:PINS.run,attempt:1,event:'pull_request'},producer:{id:PINS.producer,attempt:1,event:'workflow_dispatch',actor:PINS.owner,triggeringActor:PINS.owner},artifacts};
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
module.exports={PINS,TOOLING_PATHS,requireToolingOnlySource,resolveRuntimePreviewHandoff,downloadRuntimePreviewArchives,verifyNativeArchive};
