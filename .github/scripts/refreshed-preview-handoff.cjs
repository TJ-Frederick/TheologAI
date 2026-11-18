'use strict';
// Separate one-time live/identity acceptance. Never renews a historical corpus proof.
const {createHash}=require('node:crypto');
const {writeFileSync,mkdirSync,readFileSync}=require('node:fs');
const {join}=require('node:path');
const BASE='24a6ba7516d40207eb07e246dd08d8e26e5100f1',OWNER=40179660,PR=182;
const KIND='norton-preview-live-refresh',CUTOFF='2026-11-19T05:00:00Z';
const FILES=Object.freeze(['refresh-receipt.json','refresh-request.json','refresh-template.json','refresh.events.jsonl','corpus-live.json','edge.json','worker.js']);
const PATHS=new Set(['release/norton-aquinas.json','scripts/corpus-proof-transport.ts','scripts/norton-aquinas-release-policy.d.mts','.github/scripts/norton-aquinas-policy.cjs','.github/scripts/operator-authorization.cjs','.github/scripts/refresh-norton-preview.ts','.github/scripts/refreshed-preview-handoff.cjs','.github/scripts/verify-refreshed-norton-preview.ts','.github/workflows/pr.yml','.github/workflows/deploy.yml','test/fixtures/norton-preview-live-refresh-checks.json','test/unit/scripts/runtimePreviewHandoff.test.ts','test/unit/scripts/nortonOperatorCorpusProof.test.ts','test/unit/scripts/nortonPreviewRefresh.test.ts','test/unit/scripts/refreshedPreviewHandoff.test.ts','test/test-topology.json','tsconfig.release-scripts.json']);
const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const check=(v,s)=>{if(!v)throw Error('Fresh preview handoff refused: '+s);};
const id=v=>typeof v==='string'&&/^[1-9][0-9]{0,15}$/.test(v)&&Number.isSafeInteger(Number(v));
const hex=(v,n)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v);
async function requireRefreshProducer({github,repo,runId,source,now=Date.now()}){
 const {data:run}=await github.rest.actions.getWorkflowRun({...repo,run_id:Number(runId)});
 check(String(run.id)===runId&&run.run_attempt===1&&run.event==='workflow_dispatch'&&run.path==='.github/workflows/pr.yml'&&run.status==='completed'&&run.conclusion==='success'&&run.actor?.id===OWNER&&run.triggering_actor?.id===OWNER&&run.head_sha===source.commit&&run.head_branch===source.branch,'exact successful authenticated producer');
 check(Date.parse(run.created_at)<=now&&Date.parse(run.updated_at)<=now&&Date.parse(run.created_at)>=Date.parse('2026-11-18T00:00:00Z')&&Date.parse(run.updated_at)<=Date.parse(CUTOFF),'dated producer window');
 const {data:roster}=await github.rest.actions.listJobsForWorkflowRun({...repo,run_id:run.id,per_page:100});
 check(roster.total_count===roster.jobs?.length&&roster.total_count<100&&roster.jobs.every(j=>j.run_id===run.id&&j.run_attempt===1&&j.status==='completed'&&['success','skipped'].includes(j.conclusion)),'complete successful producer roster');
 for(const name of ['Prepare fresh preview live inputs (no cloud credentials)','Refresh deployed Norton preview (read-only)'])check(roster.jobs.filter(j=>j.name===name&&j.conclusion==='success').length===1,'both isolated producer jobs');
 return run;
}
async function resolveRefreshedPreviewHandoff({github,context,pin,now=Date.now()}){
 const repo={owner:'TJ-Frederick',repo:'TheologAI'},inputs=context.payload?.inputs??{};
 check(context.repo.owner===repo.owner&&context.repo.repo===repo.repo&&context.eventName==='workflow_dispatch'&&now<Date.parse(CUTOFF),'one-time production route');
 const runId=inputs.preview_refresh_run_id,artifactId=inputs.preview_refresh_artifact_id,digest=inputs.preview_refresh_artifact_digest;
 check(id(runId)&&id(artifactId)&&typeof digest==='string'&&/^sha256:[a-f0-9]{64}$/.test(digest),'explicit exact native evidence pins');
 const {data:associated}=await github.rest.repos.listPullRequestsAssociatedWithCommit({...repo,commit_sha:context.sha});
 const matches=associated.filter(p=>p.number===PR&&p.merged_at&&p.merge_commit_sha===context.sha&&p.base.ref==='main');check(matches.length===1,'reviewed refresh successor PR');
 const {data:pull}=await github.rest.pulls.get({...repo,pull_number:PR}),{data:merge}=await github.rest.git.getCommit({...repo,commit_sha:context.sha}),{data:head}=await github.rest.git.getCommit({...repo,commit_sha:pull.head.sha});
 check(pull.number===PR&&pull.merged_at&&pull.merge_commit_sha===context.sha&&pull.base.ref==='main'&&pull.head.repo.full_name==='TJ-Frederick/TheologAI'&&merge.parents?.length===2&&merge.parents[0].sha===BASE&&merge.parents[1].sha===pull.head.sha&&merge.tree.sha===head.tree.sha,'exact reviewed merge/source tree');
 const {data:diff}=await github.rest.repos.compareCommitsWithBasehead({...repo,basehead:BASE+'...'+pull.head.sha});
 check(diff.status==='ahead'&&diff.merge_base_commit?.sha===BASE&&Number.isSafeInteger(diff.total_commits)&&diff.total_commits>0&&diff.total_commits<=20&&diff.commits?.length===diff.total_commits&&diff.commits.every(c=>c.parents?.length===1)&&Array.isArray(diff.files)&&diff.files.length>0&&diff.files.length<=PATHS.size&&diff.files.every(f=>PATHS.has(f.filename)&&!f.previous_filename&&!['removed','renamed'].includes(f.status)),'closed reviewed tooling-only successor');
 const source={commit:pull.head.sha,tree:head.tree.sha,branch:pull.head.ref};
 check(hex(source.commit,40)&&hex(source.tree,40),'source identity');const run=await requireRefreshProducer({github,repo,runId,source,now});
 const {data:artifact}=await github.rest.actions.getArtifact({...repo,artifact_id:Number(artifactId)});
 check(String(artifact.id)===artifactId&&artifact.name===`preview-live-refresh-${runId}-attempt-1`&&artifact.digest===digest&&!artifact.expired&&Date.parse(artifact.expires_at)>now&&artifact.workflow_run?.id===run.id&&artifact.workflow_run.head_sha===source.commit&&artifact.size_in_bytes>0&&artifact.size_in_bytes<=8*1024*1024,'exact retained native result archive');
 const {data:roster}=await github.rest.actions.listWorkflowRunArtifacts({...repo,run_id:run.id,per_page:100});
 check(roster.total_count===roster.artifacts?.length&&roster.total_count<100,'complete producer artifact roster');
 const ledgers=roster.artifacts.filter(a=>a.name.startsWith('norton-preview-live-refresh-ledger-'));check(ledgers.length===1,'single operation marker');
 const marker=ledgers[0];check(!marker.expired&&Date.parse(marker.expires_at)>now&&marker.workflow_run?.id===run.id&&marker.workflow_run.head_sha===source.commit&&/^sha256:[a-f0-9]{64}$/.test(marker.digest)&&marker.size_in_bytes>0&&marker.size_in_bytes<=128*1024,'retained native operation marker');
 const {data:allMarkers}=await github.rest.actions.listArtifactsForRepo({...repo,name:marker.name,per_page:100});check(allMarkers.total_count===1&&allMarkers.artifacts?.length===1&&allMarkers.artifacts[0].id===marker.id,'one global operation reservation');
 const binding={kind:KIND,repository:'TJ-Frederick/TheologAI',consumerPullRequest:PR,mergeCommit:context.sha,mergeTree:merge.tree.sha,acceptedSource:source,run:{id:run.id,attempt:1,event:'workflow_dispatch',actor:OWNER,triggeringActor:OWNER},ledger:{id:marker.id,name:marker.name,digest:marker.digest,bytes:marker.size_in_bytes,expiresAt:marker.expires_at,runId:run.id},artifact:{id:artifact.id,name:artifact.name,digest:artifact.digest,bytes:artifact.size_in_bytes,expiresAt:artifact.expires_at,runId:run.id}};
 if(pin)check(hash(binding)===hash(pin),'same pinned evidence at protected gate');return binding;
}
async function downloadRefreshedPreviewArchive({github,binding,directory,now=Date.now()}){
 const a=binding.artifact;check(binding.kind===KIND&&Date.parse(a.expiresAt)>now&&/^sha256:[a-f0-9]{64}$/.test(a.digest),'live pinned archive');
 const {data}=await github.rest.actions.downloadArtifact({owner:'TJ-Frederick',repo:'TheologAI',artifact_id:a.id,archive_format:'zip'});const bytes=Buffer.from(data);
 check(bytes.length===a.bytes&&bytes.length<=8*1024*1024&&'sha256:'+hash(bytes)===a.digest,'exact native archive bytes');mkdirSync(directory,{mode:0o700});writeFileSync(join(directory,'refresh.zip'),bytes,{flag:'wx',mode:0o600});
 const l=binding.ledger;check(l.runId===binding.run.id&&Date.parse(l.expiresAt)>now,'retained one-time marker');const {data:ledger}=await github.rest.actions.downloadArtifact({owner:'TJ-Frederick',repo:'TheologAI',artifact_id:l.id,archive_format:'zip'});const raw=Buffer.from(ledger);check(raw.length===l.bytes&&raw.length<=128*1024&&'sha256:'+hash(raw)===l.digest,'exact operation marker bytes');writeFileSync(join(directory,'ledger.zip'),raw,{flag:'wx',mode:0o600});
}
async function admitRefreshDispatch({github,context,core,environment=process.env,phase='prepare'}){
 const repo={owner:'TJ-Frederick',repo:'TheologAI'};check(context.repo.owner===repo.owner&&context.repo.repo===repo.repo&&context.eventName==='workflow_dispatch'&&environment.GITHUB_RUN_ATTEMPT==='1'&&environment.GITHUB_REF?.startsWith('refs/heads/'),'owner dispatch route');
 const {data:run}=await github.rest.actions.getWorkflowRun({...repo,run_id:context.runId});check(run.id===context.runId&&run.head_sha===context.sha&&run.run_attempt===1&&run.event==='workflow_dispatch'&&run.path==='.github/workflows/pr.yml'&&run.status!=='completed'&&run.actor?.id===OWNER&&run.triggering_actor?.id===OWNER,'authenticated owner event');
 const {data:pull}=await github.rest.pulls.get({...repo,pull_number:PR});check(pull.state==='open'&&pull.base.ref==='main'&&pull.base.sha===BASE&&pull.head.sha===context.sha&&pull.head.ref===run.head_branch&&pull.head.repo.full_name==='TJ-Frederick/TheologAI','exact open reviewed producer source');
 const {data:commit}=await github.rest.git.getCommit({...repo,commit_sha:context.sha});
 const raw=environment.APPROVAL_JSON;check(typeof raw==='string'&&Buffer.byteLength(raw)<=65536,'bounded owner template');const template=JSON.parse(raw);
 check(template.schemaVersion==='norton-preview-live-refresh-approval.v1'&&template.targetRunId==='this-owner-dispatch'&&template.targetRunAttempt===1&&template.sourceCommit===context.sha&&template.sourceTree===commit.tree.sha&&template.headBranch===run.head_branch&&/^operation-[a-z0-9-]{8,80}$/.test(template.operationId),'exact self-dispatch template');
 check(id(template.validationRunId),'explicit ordinary CI run');const {data:ci}=await github.rest.actions.getWorkflowRun({...repo,run_id:Number(template.validationRunId)});
 check(String(ci.id)===template.validationRunId&&ci.event==='pull_request'&&ci.path==='.github/workflows/pr.yml'&&ci.head_sha===context.sha&&ci.head_branch===run.head_branch&&Number.isSafeInteger(ci.run_attempt)&&ci.run_attempt>=1&&ci.status==='completed'&&ci.conclusion==='success'&&ci.actor?.id===OWNER&&ci.triggering_actor?.id===OWNER&&ci.pull_requests?.some(p=>p.number===PR&&p.head.sha===context.sha),'exact successful reviewed ordinary CI');
 const {data:jobs}=await github.rest.actions.listJobsForWorkflowRun({...repo,run_id:ci.id,filter:'latest',per_page:100});check(jobs.total_count===jobs.jobs?.length&&jobs.total_count<100&&jobs.jobs.every(j=>j.run_id===ci.id&&j.run_attempt===ci.run_attempt),'complete same-attempt ordinary CI roster');for(const name of ['Test & Build','Worker Runtime & D1','Fresh Checkout & Data','Node HTTP E2E','Applicable MCP Conformance','Validation Complete'])check(jobs.jobs.filter(j=>j.name===name&&j.status==='completed'&&j.conclusion==='success').length===1,'all ordinary validation jobs');
 const request={...template,targetRunId:String(context.runId)},name='norton-preview-live-refresh-ledger-'+template.operationId;
 const {data:markers}=await github.rest.actions.listArtifactsForRepo({...repo,name,per_page:100});
 if(phase==='prepare'){
  check(markers.total_count===0&&markers.artifacts?.length===0,'unused one-time operation');
  writeFileSync(join(environment.RUNNER_TEMP,'refresh-template.json'),raw,{flag:'wx',mode:0o600});writeFileSync(join(environment.RUNNER_TEMP,'refresh-request.json'),JSON.stringify(request)+'\n',{flag:'wx',mode:0o600});core.setOutput('operation_id',template.operationId);
 }else{
  check(phase==='execute'&&markers.total_count===1&&markers.artifacts?.length===1,'single native reservation');const marker=markers.artifacts[0];check(marker.name===name&&!marker.expired&&Date.parse(marker.expires_at)>Date.now()&&marker.workflow_run?.id===context.runId&&marker.workflow_run.head_sha===context.sha,'current operation reservation');
  const input=JSON.parse(readFileSync(join(environment.RUNNER_TEMP,'fresh-preview-inputs/refresh-request.json'),'utf8'));check(JSON.stringify(input)===JSON.stringify(request),'same owner request after protected approval');
 }
 return request;
}
module.exports={admitRefreshDispatch,resolveRefreshedPreviewHandoff,downloadRefreshedPreviewArchive,requireRefreshProducer,FILES,BASE,PR,KIND,CUTOFF};
