// Artifact provenance is the owner's authenticated dispatch, never PR-controlled metadata.
const fs = require('node:fs');
const repo = {owner:'TJ-Frederick',repo:'TheologAI'};
const ownerId = 40179660;
const check = (v, reason) => { if (!v) throw Error('Operator evidence refused: '+reason); };
const artifactName = c => `operator-corpus-proof-${c.runId}-attempt-1`;

function upload({context,core,environment=process.env}) {
  check(context.repo.owner===repo.owner && context.repo.repo===repo.repo && context.eventName==='workflow_dispatch'
    && environment.GITHUB_ACTOR_ID===String(ownerId) && environment.GITHUB_RUN_ATTEMPT==='1', 'owner manual dispatch');
  const text=environment.OPERATOR_PROOF_JSON;
  check(typeof text==='string' && Buffer.byteLength(text)<=60_000, 'bounded proof input');
  const e=JSON.parse(text); const c=e.challenge;
  check(e.schemaVersion==='theologai-operator-corpus-envelope.v1' && c?.schemaVersion==='theologai-operator-corpus-challenge.v1'
    && c.repository==='TJ-Frederick/TheologAI' && c.ownerActorId===ownerId && /^[1-9][0-9]{0,15}$/.test(c.runId)
    && c.runAttempt===1 && /^[0-9a-f]{64}$/.test(c.nonce), 'proof/challenge shape');
  check(c.sourceCommit===context.sha && e.receipt?.sourceCommit===context.sha && Date.parse(c.expiresAt)>Date.now(), 'exact fresh source');
  check(environment.GITHUB_REF===(c.role==='preview'?'refs/heads/codex/sec06-preview-credential-assessment':'refs/heads/main')
    && ['preview','production'].includes(c.role), 'source branch/role');
  fs.writeFileSync(environment.RUNNER_TEMP+'/operator-proof-envelope.json',JSON.stringify(e,null,2)+'\n',{flag:'wx',mode:0o600});
  core.setOutput('artifact_name',artifactName(c));
}

async function find({github,challenge:c,now=Date.now()}) {
  check(c.repository==='TJ-Frederick/TheologAI' && c.ownerActorId===ownerId && Date.parse(c.expiresAt)>now, 'live challenge');
  if(c.role==='preview') {
    const {data:pr}=await github.rest.pulls.get({...repo,pull_number:167});
    check(pr.state==='open' && !pr.draft && pr.head.repo.full_name===c.repository && pr.head.sha===c.sourceCommit
      && pr.base.sha===c.baseCommit && pr.labels.some(l=>l.name==='deploy-preview'), 'live preview authority');
  } else {
    const {data:ref}=await github.rest.git.getRef({...repo,ref:'heads/main'});
    check(c.role==='production' && ref.object.sha===c.sourceCommit, 'live main');
  }
  const {data:runs}=await github.rest.actions.listWorkflowRuns({...repo,workflow_id:'pr.yml',event:'workflow_dispatch',head_sha:c.sourceCommit,per_page:100});
  const found=[];
  for(const r of runs.workflow_runs) {
    if(r.head_sha!==c.sourceCommit || Date.parse(r.created_at)<Date.parse(c.createdAt) || r.actor?.id!==ownerId
      || r.triggering_actor?.id!==ownerId || r.run_attempt!==1 || r.path!=='.github/workflows/pr.yml'
      || r.event!=='workflow_dispatch' || r.head_branch!==(c.role==='preview'?'codex/sec06-preview-credential-assessment':'main')) continue;
    const {data:files}=await github.rest.actions.listWorkflowRunArtifacts({...repo,run_id:r.id,per_page:100});
    const artifacts=files.artifacts.filter(a=>a.name===artifactName(c));
    check(artifacts.length<=1,'duplicate proof artifact');
    if(!artifacts.length) continue;
    const a=artifacts[0];
    check(!a.expired && Date.parse(a.expires_at)>now+60_000 && a.workflow_run.head_sha===c.sourceCommit
      && a.workflow_run.id===r.id && /^sha256:[0-9a-f]{64}$/.test(a.digest), 'artifact provenance/digest/expiry');
    const {data:jobs}=await github.rest.actions.listJobsForWorkflowRun({...repo,run_id:r.id,filter:'latest',per_page:100});
    const upload=jobs.jobs.filter(j=>j.name==='Retain operator corpus proof (no cloud credentials)');
    check(upload.length===1,'uploader identity');
    if(upload[0].status!=='completed') continue;
    check(upload[0].conclusion==='success','uploader result');
    found.push({runId:r.id,artifactId:a.id,digest:a.digest,name:a.name});
  }
  check(found.length<=1,'multiple owner submissions; stop instead of choosing');
  return found[0]??null;
}
async function wait({github,context,core,environment=process.env}) {
  const c=JSON.parse(fs.readFileSync(environment.RUNNER_TEMP+'/operator-corpus-challenge.json','utf8'));
  check(c.runId===String(context.runId) && environment.GITHUB_RUN_ATTEMPT==='1','current protected challenge');
  while(Date.now()<Date.parse(c.expiresAt)) {
    const result=await find({github,challenge:c});
    if(result) {core.setOutput('run_id',result.runId);core.setOutput('artifact_name',result.name);core.setOutput('artifact_id',result.artifactId);return;}
    await new Promise(resolve=>setTimeout(resolve,30_000));
  }
  throw Error('Operator proof window expired; no deployment');
}
module.exports={upload,find,wait,artifactName};
