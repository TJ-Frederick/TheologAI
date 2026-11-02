// Unprivileged production authorization admission, before protected approval.
module.exports = async ({github,context,core,environment=process.env}) => {
  const authority = require('./operator-authorization.cjs');
  const check = (v, why) => { if(!v) throw Error('Operator authorization refused: '+why); };
  const repo={owner:'TJ-Frederick',repo:'TheologAI'};
  check(context.repo.owner===repo.owner && context.repo.repo===repo.repo && context.eventName==='workflow_dispatch'
    && environment.GITHUB_REF==='refs/heads/main' && environment.GITHUB_RUN_ATTEMPT==='1','production route');
  const {data:pulls}=await github.rest.repos.listPullRequestsAssociatedWithCommit({...repo,commit_sha:context.sha});
  const merged=pulls.filter(p=>p.merged_at && p.base.ref==='main' && p.merge_commit_sha===context.sha);
  check(merged.length===1,'unique merged PR');
  const {data:commit}=await github.rest.git.getCommit({...repo,commit_sha:context.sha});
  const expected={role:'production',pullRequestNumber:merged[0].number,headBranch:'main',sourceCommit:context.sha,
    sourceTree:commit.tree.sha,baseCommit:environment.OPERATOR_BASE_COMMIT,sourcePlanSha256:environment.OPERATOR_SOURCE_PLAN_SHA256,
    targetRunId:String(context.runId),targetRunAttempt:1};
  check(commit.parents?.[0]?.sha===expected.baseCommit,'canonical plan first parent');
  await authority.waitForAuthorization({github,expected,core,environment,
    revalidate:()=>authority.requireLiveCandidate({github,authorization:expected})});
  if(environment.OPERATOR_EXPECTED_AUTHORIZATION_SHA256) check(authority.hash(require('node:fs').readFileSync(environment.RUNNER_TEMP+'/operator-authorization.json'))===environment.OPERATOR_EXPECTED_AUTHORIZATION_SHA256,'same admitted owner authorization');
};
