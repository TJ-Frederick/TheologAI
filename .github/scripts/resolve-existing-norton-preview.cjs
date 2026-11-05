'use strict';
// One Norton/Aquinas handoff inside the existing protected deployment workflow.
const check=(value,reason)=>{if(!value)throw Error('Existing Norton preview evidence refused: '+reason);};
const digest=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
async function resolveExistingNortonPreview({github,context,pin,now=Date.now()}){
 const repo=context.repo;check(repo.owner==='TJ-Frederick'&&repo.repo==='TheologAI'&&sha(context.sha),'repository/merge identity');
 const {data:pulls}=await github.rest.repos.listPullRequestsAssociatedWithCommit({...repo,commit_sha:context.sha});
 const merged=pulls.filter(p=>p.number===176&&p.merged_at&&p.merge_commit_sha===context.sha&&p.base.ref==='main');check(merged.length===1,'one merged release PR');const pull=merged[0];
 check(sha(pull.head.sha)&&pull.head.repo.full_name==='TJ-Frederick/TheologAI','same-repository auditor');
 const {data:merge}=await github.rest.git.getCommit({...repo,commit_sha:context.sha});
 const {data:auditor}=await github.rest.git.getCommit({...repo,commit_sha:pull.head.sha});
 check(sha(merge.tree.sha)&&merge.tree.sha===auditor.tree.sha,'exact auditor/merged tree');
 let runs;
 if(pin){check(pin.kind==='norton-existing-preview'&&pin.repository==='TJ-Frederick/TheologAI'&&pin.mergeCommit===context.sha,'pinned purpose/merge');const {data:run}=await github.rest.actions.getWorkflowRun({...repo,run_id:pin.run.id});runs=[run];}
 else{const {data}=await github.rest.actions.listWorkflowRuns({...repo,workflow_id:'pr.yml',head_sha:pull.head.sha,event:'workflow_dispatch',status:'success',per_page:10});runs=data.workflow_runs;}
 const eligible=runs.filter(r=>r.path==='.github/workflows/pr.yml'&&r.event==='workflow_dispatch'&&r.status==='completed'&&r.conclusion==='success'&&r.run_attempt===1&&r.head_sha===pull.head.sha&&r.actor?.id===40179660&&r.triggering_actor?.id===40179660&&Date.parse(r.updated_at)<=now+300000&&Date.parse(r.updated_at)>=now-7*86400000);
 check(eligible.length>0,'successful owner-dispatched auditor');
 const run=eligible.sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at))[0];
 const {data:jobs}=await github.rest.actions.listJobsForWorkflowRun({...repo,run_id:run.id,per_page:100});check(jobs.total_count<=100,'complete job roster');
 for(const name of ['Verify deployed Norton candidate and distinct auditor (no cloud credentials)','Validate already deployed Norton preview (read-only)']){const matches=jobs.jobs.filter(j=>j.name===name);check(matches.length===1&&matches[0].conclusion==='success','successful source and protected validation jobs');}
 check(jobs.jobs.filter(j=>j.name==='Deploy Preview').every(j=>j.conclusion==='skipped'),'no deployment in validation run');
 const {data:artifacts}=await github.rest.actions.listWorkflowRunArtifacts({...repo,run_id:run.id,per_page:100});check(artifacts.total_count<=100,'complete artifact roster');
 const artifact=(prefix,max)=>{const name=`${prefix}-${run.id}-attempt-1`,matches=artifacts.artifacts.filter(a=>a.name===name);check(matches.length===1,'one native named artifact');const a=matches[0];check(!a.expired&&Date.parse(a.expires_at)>now&&digest(a.digest)&&Number.isSafeInteger(a.size_in_bytes)&&a.size_in_bytes>0&&a.size_in_bytes<=max&&a.workflow_run?.id===run.id&&a.workflow_run.head_sha===pull.head.sha,'native artifact binding/digest/retention');return{id:a.id,name:a.name,digest:a.digest,bytes:a.size_in_bytes,expiresAt:a.expires_at};};
 const binding={kind:'norton-existing-preview',repository:'TJ-Frederick/TheologAI',pullRequest:176,mergeCommit:context.sha,mergeTree:merge.tree.sha,auditorCommit:pull.head.sha,auditorTree:auditor.tree.sha,run:{id:run.id,attempt:1,actor:40179660,triggeringActor:40179660,event:'workflow_dispatch',path:'.github/workflows/pr.yml'},validationArtifact:artifact('existing-preview-validation',1024*1024),inputsArtifact:artifact('existing-preview-inputs',128*1024*1024)};
 if(pin)check(JSON.stringify(binding)===JSON.stringify(pin),'pinned native evidence changed');return binding;
}
module.exports={resolveExistingNortonPreview};
