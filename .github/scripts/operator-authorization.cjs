// Authenticated owner handoff for one new operation. No cloud API or budget renewal.
const fs = require('node:fs');
const policy = require('./norton-aquinas-policy.cjs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const repository = 'TJ-Frederick/TheologAI', ownerActorId = 40179660;
const repo = { owner: 'TJ-Frederick', repo: 'TheologAI' };
const hash = value => createHash('sha256').update(value).digest('hex');
const check = (v, reason) => { if (!v) throw Error('Operator authorization refused: ' + reason); };
const hex = (v, n) => typeof v === 'string' && new RegExp(`^[0-9a-f]{${n}}$`).test(v);
const id = v => typeof v === 'string' && /^[1-9][0-9]{0,15}$/.test(v) && Number.isSafeInteger(Number(v));
const applicationKeys = ['schemaVersion','scope','repository','ownerActorId','role','pullRequestNumber','headBranch','sourceCommit','sourceTree','baseCommit','sourcePlanSha256','targetRunId','targetRunAttempt','authorizationId','ledgerId','notBefore','expiresAt','reservedReads','hardReadCap','diagnosticCommands','maxWrites','previousReadsSpentOrReserved','previousWritesSpentOrReserved','previousDiagnosticCommands','outstandingPriorReservationsAccepted'];
const corpusKeys=[...applicationKeys,'exclusiveDataWritesDuringWindow','candidateWriteJobsPaused','liveControlReserve','expectedLedgerSha256','releasePolicy'];
function requireAuthorization(a, expected = {}, now = Date.now()) {
  const corpus=a?.releasePolicy===policy.policy;
  const keys=corpus?corpusKeys:applicationKeys;
  check(a && Object.keys(a).sort().join(',') === [...keys].sort().join(','), 'shape');
  check(a.schemaVersion === 'theologai-operator-authorization.v1' && a.scope === 'new-additional-operation' && (!corpus || a.exclusiveDataWritesDuringWindow===true && a.candidateWriteJobsPaused===true && hex(a.expectedLedgerSha256,64))
    && a.repository === repository && a.ownerActorId === ownerActorId, 'explicit new owner scope');
  check(['preview','production'].includes(a.role) && Number.isSafeInteger(a.pullRequestNumber) && a.pullRequestNumber > 170,
    'successor role and PR');
  check(typeof a.headBranch === 'string' && a.headBranch.length <= 240 && /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(a.headBranch)
    && (a.role === 'production' ? a.headBranch === 'main' : a.headBranch !== 'main'), 'branch');
  check(['sourceCommit','sourceTree','baseCommit'].every(k => hex(a[k],40)) && hex(a.sourcePlanSha256,64)
    && id(a.targetRunId) && a.targetRunAttempt === 1, 'source and run');
  check(/^operation-[a-z0-9-]{8,80}$/.test(a.authorizationId || '') && a.ledgerId === a.authorizationId, 'single operation ledger');
  check(a.reservedReads === (corpus?policy.reservedReads:3510997) && a.hardReadCap === (corpus?policy.hardReadCap:3800000) && a.diagnosticCommands === 4 && a.maxWrites === 4 && (!corpus || a.liveControlReserve === policy.liveReads + policy.controlReads)
    && a.previousReadsSpentOrReserved === 0 && a.previousWritesSpentOrReserved === 0 && a.previousDiagnosticCommands === 0
    && a.outstandingPriorReservationsAccepted === true, 'new allowance and retained prior reservations');
  const start = Date.parse(a.notBefore), end = Date.parse(a.expiresAt);
  check(Number.isFinite(start) && Number.isFinite(end) && start <= now && end > now && end - start <= 86400000, 'authorization window');
  for (const [k,v] of Object.entries(expected)) check(a[k] === v, 'expected ' + k);
  return a;
}
function requirePackage(p, expected = {}, now = Date.now()) {
  check(p && Object.keys(p).sort().join(',') === 'authorization,provenance', 'package shape');
  requireAuthorization(p.authorization, expected, now);
  const v = p.provenance;
  check(v && Object.keys(v).sort().join(',') === 'artifactId,contentSha256,digest,runId' && id(v.runId) && id(v.artifactId)
    && /^sha256:[0-9a-f]{64}$/.test(v.digest) && v.contentSha256 === hash(JSON.stringify(p.authorization)), 'native provenance');
  return p;
}
function readArchiveFile(bytes, digest, expectedFile) {
  check(Buffer.isBuffer(bytes) && bytes.length <= 128*1024 && 'sha256:' + hash(bytes) === digest, 'native archive digest');
  const directory = fs.mkdtempSync(join(tmpdir(),'operator-auth-'));
  try {
    const archive = join(directory,'authorization.zip'); fs.writeFileSync(archive,bytes,{mode:0o600});
    const files = execFileSync('unzip',['-Z1',archive],{encoding:'utf8',maxBuffer:60000}).trim().split('\n');
    check(files.length === 1 && files[0] === expectedFile, 'archive roster');
    return execFileSync('unzip',['-p',archive,expectedFile],{maxBuffer:60000});
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
}
function readArchive(bytes, digest) {
  return JSON.parse(readArchiveFile(bytes,digest,'operator-authorization.json').toString('utf8'));
}
function requireProvenance(p, run, artifact, now = Date.now()) {
  requirePackage(p,{},now); const a = p.authorization, v = p.provenance;
  check(String(run.id) === v.runId && run.path === '.github/workflows/pr.yml' && run.event === 'workflow_dispatch'
    && run.run_attempt === 1 && run.actor?.id === ownerActorId && run.triggering_actor?.id === ownerActorId
    && run.head_sha === a.sourceCommit && run.head_branch === a.headBranch && Date.parse(run.created_at) >= Date.parse(a.notBefore)
    && Date.parse(run.created_at) < Date.parse(a.expiresAt), 'authenticated owner dispatch');
  check(String(artifact.id) === v.artifactId && artifact.name === `operator-authorization-${a.targetRunId}-attempt-1`
    && artifact.digest === v.digest && !artifact.expired && Date.parse(artifact.expires_at) > now + 60000
    && artifact.workflow_run?.id === run.id && artifact.workflow_run.head_sha === a.sourceCommit, 'native artifact identity');
}
async function findAuthorization({ github, expected, now = Date.now() }) {
  const { data } = await github.rest.actions.listArtifactsForRepo({...repo,name:`operator-authorization-${expected.targetRunId}-attempt-1`,per_page:100});
  check(data.artifacts.length <= 1, 'duplicate authorization submissions');
  if (!data.artifacts.length) return null;
  const artifact = data.artifacts[0];
  const { data: run } = await github.rest.actions.getWorkflowRun({...repo,run_id:artifact.workflow_run?.id});
  const { data: jobs } = await github.rest.actions.listJobsForWorkflowRun({...repo,run_id:run.id,filter:'latest',per_page:100});
  const upload = jobs.jobs.filter(j => j.name === 'Retain operator operation authorization (no cloud credentials)');
  check(upload.length === 1, 'authorization uploader');
  if (upload[0].status !== 'completed') return null;
  check(upload[0].conclusion === 'success', 'authorization upload result');
  const { data: bytes } = await github.rest.actions.downloadArtifact({...repo,artifact_id:artifact.id,archive_format:'zip'});
  const authorization = readArchive(Buffer.from(bytes),artifact.digest);
  const p = {authorization,provenance:{runId:String(run.id),artifactId:String(artifact.id),digest:artifact.digest,contentSha256:hash(JSON.stringify(authorization))}};
  requirePackage(p,expected,now); requireProvenance(p,run,artifact,now);
  await requireLedgerMarker({github,package:p,now});
  return p;
}
async function requireLedgerMarker({github,package:p,now=Date.now()}) {
  const {data}=await github.rest.actions.listArtifactsForRepo({...repo,name:'operator-ledger-'+p.authorization.ledgerId,per_page:100});
  check(data.artifacts.length===1,'unique operation ledger marker');
  const marker=data.artifacts[0];
  check(!marker.expired && Date.parse(marker.expires_at)>now+60000 && marker.workflow_run?.id===Number(p.provenance.runId)
    && marker.workflow_run.head_sha===p.authorization.sourceCommit && /^sha256:[0-9a-f]{64}$/.test(marker.digest),'ledger marker provenance');
  const {data:bytes}=await github.rest.actions.downloadArtifact({...repo,artifact_id:marker.id,archive_format:'zip'});
  check(JSON.stringify(readArchive(Buffer.from(bytes),marker.digest))===JSON.stringify(p.authorization),'ledger marker content');
}
async function waitForAuthorization({github,expected,revalidate,core,environment=process.env,now=Date.now,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),wait=environment.OPERATOR_WAIT_AUTHORIZATION==='true'}) {
  const end = now() + (wait ? 3600000 : 0);
  if (core?.summary) await core.summary.addHeading('Explicit operator authorization required').addRaw(JSON.stringify(expected)).write();
  do {
    await revalidate();
    const p = await findAuthorization({github,expected,now:now()});
    if (p) {
      await revalidate(); requirePackage(p,expected,now());
      const text = JSON.stringify(p,null,2)+'\n';
      fs.writeFileSync(join(environment.RUNNER_TEMP,'operator-authorization.json'),text,{mode:0o600});
      core.setOutput('authorization_sha256',hash(text)); return p;
    }
    if (now() >= end) break;
    await pause(15000);
  } while (now() < end);
  throw Error('Operator authorization refused: no explicit owner authorization within admission window');
}
async function uploadAuthorization({github,context,core,environment=process.env,now=Date.now()}) {
  check(context.repo.owner===repo.owner && context.repo.repo===repo.repo && context.eventName==='workflow_dispatch'
    && environment.GITHUB_ACTOR_ID===String(ownerActorId) && environment.GITHUB_RUN_ATTEMPT==='1','owner manual dispatch');
  const {data: dispatch}=await github.rest.actions.getWorkflowRun({...repo,run_id:context.runId});
  check(dispatch.actor?.id===ownerActorId && dispatch.triggering_actor?.id===ownerActorId && dispatch.run_attempt===1
    && dispatch.event==='workflow_dispatch' && dispatch.path==='.github/workflows/pr.yml','authenticated dispatch');
  const text=environment.OPERATOR_AUTHORIZATION_JSON;
  check(typeof text==='string' && Buffer.byteLength(text)<=60000,'bounded authorization');
  const a=requireAuthorization(JSON.parse(text),{sourceCommit:context.sha},now);
  check(environment.GITHUB_REF==='refs/heads/'+a.headBranch && dispatch.head_sha===a.sourceCommit && dispatch.head_branch===a.headBranch,'dispatch source branch');
  await requireLiveCandidate({github,authorization:a});
  const {data:prior}=await github.rest.actions.listArtifactsForRepo({...repo,name:'operator-ledger-'+a.ledgerId,per_page:100});
  check(prior.artifacts.length===0,'operation ledger already submitted');
  fs.writeFileSync(join(environment.RUNNER_TEMP,'operator-authorization.json'),JSON.stringify(a,null,2)+'\n',{flag:'wx',mode:0o600});
  core.setOutput('artifact_name',`operator-authorization-${a.targetRunId}-attempt-1`);
}
async function requireLiveCandidate({github,authorization:a}) {
  const {data:run}=await github.rest.actions.getWorkflowRun({...repo,run_id:Number(a.targetRunId)});
  check(run.head_sha===a.sourceCommit && run.run_attempt===1 && run.status!=='completed'
    && run.event===(a.role==='preview'?'pull_request':'workflow_dispatch')
    && run.path===(a.role==='preview'?'.github/workflows/pr.yml':'.github/workflows/deploy.yml'),'target run');
  if(a.role==='preview') check(run.pull_requests.filter(p=>p.number===a.pullRequestNumber && p.head.sha===a.sourceCommit && p.base.sha===a.baseCommit).length===1,'linked preview run');
  await requireLiveSource({github,authorization:a});
}
async function requireLiveSource({github,authorization:a}) {
  const {data:pr}=await github.rest.pulls.get({...repo,pull_number:a.pullRequestNumber});
  const {data:main}=await github.rest.git.getRef({...repo,ref:'heads/main'});
  if(a.role==='preview') check(pr.state==='open' && !pr.draft && pr.base.ref==='main' && pr.base.sha===a.baseCommit
    && main.object.sha===a.baseCommit && pr.head.sha===a.sourceCommit && pr.head.ref===a.headBranch
    && pr.head.repo.full_name===repository && pr.labels.some(l=>l.name==='deploy-preview'), 'live preview');
  else check(pr.merged_at && pr.base.ref==='main' && pr.merge_commit_sha===a.sourceCommit && main.object.sha===a.sourceCommit,'live merged production');
  const {data:commit}=await github.rest.git.getCommit({...repo,commit_sha:a.sourceCommit});
  check(commit.tree.sha===a.sourceTree && (a.role!=='production' || commit.parents?.[0]?.sha===a.baseCommit),'live source tree and base');
}
module.exports={requireAuthorization,requirePackage,requireProvenance,findAuthorization,waitForAuthorization,uploadAuthorization,requireLiveCandidate,requireLiveSource,requireLedgerMarker,readArchive,readArchiveFile,hash};
