// Hosted GitHub transport test only. Never an operation grant, challenge or proof.
const fs = require('node:fs');
const { join } = require('node:path');
const { readArchiveFile, hash, requireAuthorization } = require('./operator-authorization.cjs');
const repo = { owner:'TJ-Frederick', repo:'TheologAI' };
const repository = repo.owner+'/'+repo.repo, ownerId = 40179660;
const REQUEST = 'theologai-operator-handoff-rehearsal-request.v1';
const PAYLOAD = 'theologai-operator-handoff-rehearsal.v1';
const FILE = 'operator-handoff-rehearsal.json', TTL = 300000;
const UPLOADER = 'Retain operator operation authorization (no cloud credentials)';
const requiredJobs = ['Select Validation','Test & Build','Fresh Checkout & Data','Worker Runtime & D1',
  'Node HTTP E2E','Applicable MCP Conformance','Validation Complete'];
const check = (v, why) => { if(!v) throw Error('Handoff rehearsal refused: '+why); };
const hex = (v,n) => typeof v==='string' && new RegExp(`^[0-9a-f]{${n}}$`).test(v);
const id = v => typeof v==='string' && /^[1-9][0-9]{0,15}$/.test(v) && Number.isSafeInteger(Number(v));
const exact = (v,keys) => v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const commonKeys = ['schemaVersion','mode','pullRequestNumber','ordinaryRunId','sourceCommit','baseCommit','sourceTree','nonce'];
function request(text) {
  check(typeof text==='string' && Buffer.byteLength(text)<=12000,'bounded request');
  const r=JSON.parse(text);
  check(r.schemaVersion===REQUEST && ['publish','consume','expect-expired'].includes(r.mode),'rehearsal request schema');
  check(exact(r,r.mode==='publish'?commonKeys:[...commonKeys,'producerRunId','artifactId','digest']),'request shape');
  check(Number.isSafeInteger(r.pullRequestNumber) && r.pullRequestNumber>170 && id(r.ordinaryRunId)
    && ['sourceCommit','baseCommit','sourceTree'].every(k=>hex(r[k],40)) && hex(r.nonce,64),'request identity');
  if(r.mode!=='publish') check(id(r.producerRunId) && id(r.artifactId) && /^sha256:[0-9a-f]{64}$/.test(r.digest),'producer identity');
  return r;
}
function kind(text) {
  check(typeof text==='string' && Buffer.byteLength(text)<=60000,'bounded owner input');
  return JSON.parse(text)?.schemaVersion===REQUEST?'rehearsal':'operation';
}
function requirePayload(p,r,now) {
  check(exact(p,['schemaVersion','purpose','grantsOperation','repository','ownerActorId','pullRequestNumber','headBranch',
    'sourceCommit','baseCommit','sourceTree','ordinaryRunId','ordinaryRunAttempt','producerRunId','producerRunAttempt',
    'workflowPath','ref','nonce','createdAt','expiresAt','allowance']),'payload shape');
  check(p.schemaVersion===PAYLOAD && p.purpose==='metadata-transport-only' && p.grantsOperation===false
    && p.repository===repository && p.ownerActorId===ownerId,'zero-authority schema');
  check(exact(p.allowance,['reads','writes','diagnosticCommands']) && Object.values(p.allowance).every(v=>v===0),'zero allowance');
  for(const key of ['pullRequestNumber','sourceCommit','baseCommit','sourceTree','ordinaryRunId','nonce'])check(p[key]===r[key],'payload '+key);
  check(p.producerRunId===r.producerRunId && p.producerRunAttempt===1 && p.ordinaryRunAttempt===1
    && p.workflowPath==='.github/workflows/pr.yml' && p.ref==='refs/heads/'+p.headBranch,'payload producer/ref');
  const start=Date.parse(p.createdAt),end=Date.parse(p.expiresAt);
  check(Number.isFinite(start) && Number.isFinite(end) && new Date(start).toISOString()===p.createdAt
    && new Date(end).toISOString()===p.expiresAt && end-start===TTL && start<=now+30000,'fixed time window');
  // Explicitly prove that production authorization parsing cannot accept this object.
  let rejected=false;try{requireAuthorization(p,{},now);}catch{rejected=true;}check(rejected,'operational schema isolation');
  return p;
}
function requireFresh(p,now) {check(Date.parse(p.expiresAt)>now,'expired');}
async function liveSource(github,r,branch) {
  const {data:pr}=await github.rest.pulls.get({...repo,pull_number:r.pullRequestNumber});
  const {data:main}=await github.rest.git.getRef({...repo,ref:'heads/main'});
  check(pr.state==='open' && pr.draft===true && Array.isArray(pr.labels) && pr.labels.length===0
    && pr.base.ref==='main' && pr.base.sha===r.baseCommit && main.object.sha===r.baseCommit
    && pr.head.sha===r.sourceCommit && pr.head.ref===branch && pr.head.repo.full_name===repository,'live draft/unlabeled source');
  const {data:commit}=await github.rest.git.getCommit({...repo,commit_sha:r.sourceCommit});
  check(commit.tree.sha===r.sourceTree,'live source tree');
  const {data:run}=await github.rest.actions.getWorkflowRun({...repo,run_id:Number(r.ordinaryRunId)});
  check(run.status==='completed' && run.conclusion==='success' && run.event==='pull_request' && run.run_attempt===1
    && run.path==='.github/workflows/pr.yml' && run.head_sha===r.sourceCommit && run.head_branch===branch
    && run.pull_requests.filter(p=>p.number===r.pullRequestNumber && p.head.sha===r.sourceCommit && p.base.sha===r.baseCommit).length===1,'successful ordinary run');
  const {data:jobs}=await github.rest.actions.listJobsForWorkflowRun({...repo,run_id:Number(r.ordinaryRunId),filter:'latest',per_page:100});
  check(jobs.total_count===jobs.jobs.length,'complete ordinary job roster');
  for(const name of requiredJobs){const j=jobs.jobs.filter(j=>j.name===name);check(j.length===1 && j[0].status==='completed' && j[0].conclusion==='success','ordinary check '+name);}
  const select=jobs.jobs.find(j=>j.name==='Select Validation');
  const {data:log}=await github.rest.actions.downloadJobLogsForWorkflowRun({...repo,job_id:select.id});
  const logBytes=typeof log==='string'?Buffer.from(log,'utf8'):Buffer.from(log);
  check(logBytes.length<=2*1024*1024,'bounded classifier log');
  const text=logBytes.toString('utf8');
  const decisions=text.split('\n').flatMap(line=>{const at=line.indexOf('{"mode":');if(at<0)return [];try{return [JSON.parse(line.slice(at))];}catch{return [];}});
  check(decisions.length===1 && decisions[0].mode==='full' && decisions[0].data===true && decisions[0].serving===true,'full ordinary selection');
}
async function caller(github,context,env,r) {
  check(context.repo.owner===repo.owner && context.repo.repo===repo.repo && context.eventName==='workflow_dispatch'
    && env.GITHUB_ACTOR_ID===String(ownerId) && env.GITHUB_RUN_ATTEMPT==='1' && context.sha===r.sourceCommit,'owner manual context');
  const {data:run}=await github.rest.actions.getWorkflowRun({...repo,run_id:context.runId});
  check(String(run.id)===String(context.runId) && run.actor?.id===ownerId && run.triggering_actor?.id===ownerId
    && run.run_attempt===1 && run.event==='workflow_dispatch' && run.path==='.github/workflows/pr.yml'
    && run.head_sha===r.sourceCommit && env.GITHUB_REF==='refs/heads/'+run.head_branch,'authenticated dispatch');
  await liveSource(github,r,run.head_branch);return run;
}
async function prepare({github,context,core,environment=process.env,now=Date.now}) {
  const r=request(environment.OPERATOR_AUTHORIZATION_JSON),run=await caller(github,context,environment,r);
  if(r.mode==='publish') {
    const start=now();
    const p={schemaVersion:PAYLOAD,purpose:'metadata-transport-only',grantsOperation:false,repository,ownerActorId:ownerId,
      pullRequestNumber:r.pullRequestNumber,headBranch:run.head_branch,sourceCommit:r.sourceCommit,baseCommit:r.baseCommit,sourceTree:r.sourceTree,
      ordinaryRunId:r.ordinaryRunId,ordinaryRunAttempt:1,producerRunId:String(context.runId),producerRunAttempt:1,
      workflowPath:'.github/workflows/pr.yml',ref:environment.GITHUB_REF,nonce:r.nonce,createdAt:new Date(start).toISOString(),expiresAt:new Date(start+TTL).toISOString(),allowance:{reads:0,writes:0,diagnosticCommands:0}};
    requirePayload(p,{...r,producerRunId:String(context.runId)},start);
    await liveSource(github,r,run.head_branch);requireFresh(p,now());
    fs.writeFileSync(join(environment.RUNNER_TEMP,FILE),JSON.stringify(p,null,2)+'\n',{flag:'wx',mode:0o600});
    core.setOutput('rehearsal_mode','publish');core.setOutput('rehearsal_artifact_name',`operator-handoff-rehearsal-${context.runId}-attempt-1`);
    core.setOutput('rehearsal_expires_at',p.expiresAt);
    core.info?.(`REHEARSAL ONLY: zero operation authority; created ${p.createdAt}; expires ${p.expiresAt}; source ${p.sourceCommit}.`);return p;
  }
  const {data:producer}=await github.rest.actions.getWorkflowRun({...repo,run_id:Number(r.producerRunId)});
  check(String(producer.id)===r.producerRunId && producer.status==='completed' && producer.conclusion==='success'
    && producer.actor?.id===ownerId && producer.triggering_actor?.id===ownerId && producer.run_attempt===1
    && producer.event==='workflow_dispatch' && producer.path==='.github/workflows/pr.yml' && producer.head_sha===r.sourceCommit
    && producer.head_branch===run.head_branch && r.producerRunId!==String(context.runId),'completed owner producer');
  const {data:jobs}=await github.rest.actions.listJobsForWorkflowRun({...repo,run_id:Number(r.producerRunId),filter:'latest',per_page:100});
  check(jobs.total_count===jobs.jobs.length && jobs.jobs.filter(j=>j.name===UPLOADER && j.status==='completed' && j.conclusion==='success').length===1
    && jobs.jobs.every(j=>j.name===UPLOADER || j.conclusion==='skipped'),'isolated producer job roster');
  const {data:files}=await github.rest.actions.listWorkflowRunArtifacts({...repo,run_id:Number(r.producerRunId),per_page:100});
  const name=`operator-handoff-rehearsal-${r.producerRunId}-attempt-1`;
  check(files.total_count===1 && files.artifacts.length===1 && files.artifacts[0].name===name && String(files.artifacts[0].id)===r.artifactId,'single rehearsal artifact');
  const a=files.artifacts[0];
  check(!a.expired && Date.parse(a.expires_at)>now()+60000 && a.digest===r.digest
    && a.workflow_run?.id===Number(r.producerRunId) && a.workflow_run.head_sha===r.sourceCommit,'native artifact provenance');
  const {data:zip}=await github.rest.actions.downloadArtifact({...repo,artifact_id:Number(r.artifactId),archive_format:'zip'});
  const bytes=readArchiveFile(Buffer.from(zip),r.digest,FILE),p=requirePayload(JSON.parse(bytes.toString('utf8')),r,now());
  check(p.headBranch===run.head_branch && p.ref===environment.GITHUB_REF && Date.parse(p.createdAt)>=Date.parse(producer.created_at),'producer payload source/time');
  await liveSource(github,r,run.head_branch);requirePayload(p,r,now());
  if(r.mode==='expect-expired') {
    // Every other check above must pass first. Do not turn arbitrary errors into a pass.
    let expired=false;try{requireFresh(p,now());}catch(e){if(e.message!=='Handoff rehearsal refused: expired')throw e;expired=true;}
    check(expired,'expected expiry not observed');core.setOutput('rehearsal_mode','expect-expired');core.setOutput('rehearsal_result','authenticated-expiry-rejected');
    core.info?.(`REHEARSAL ONLY: authenticated payload expiry ${p.expiresAt} rejected at ${new Date(now()).toISOString()}.`);return p;
  }
  requireFresh(p,now());
  fs.writeFileSync(join(environment.RUNNER_TEMP,'operator-handoff-rehearsal.native.json'),bytes,{flag:'wx',mode:0o600});
  core.setOutput('rehearsal_mode','consume');core.setOutput('rehearsal_producer_run_id',r.producerRunId);core.setOutput('rehearsal_artifact_id',r.artifactId);
  core.setOutput('rehearsal_payload_sha256',hash(bytes));return p;
}
async function compareDownload({github,context,core,environment=process.env,now=Date.now}) {
  const r=request(environment.OPERATOR_AUTHORIZATION_JSON);
  await caller(github,context,environment,r);
  const native=fs.readFileSync(join(environment.RUNNER_TEMP,'operator-handoff-rehearsal.native.json'));
  const downloaded=fs.readFileSync(join(environment.RUNNER_TEMP,'operator-handoff-rehearsal-download',FILE));
  check(hash(native)===environment.EXPECTED_REHEARSAL_PAYLOAD_SHA256 && native.equals(downloaded),'pinned download bytes');
  const p=requirePayload(JSON.parse(downloaded.toString('utf8')),r,now());requireFresh(p,now());
  core.setOutput('rehearsal_result','native-and-downloaded-bytes-match-zero-authority');
  core.info?.(`REHEARSAL ONLY: native and pinned-download bytes match SHA-256 ${hash(native)}; zero reads/writes/diagnostics; expires ${p.expiresAt}.`);return p;
}
module.exports={kind,request,requirePayload,requireFresh,prepare,compareDownload,FILE,REQUEST,PAYLOAD,TTL};
