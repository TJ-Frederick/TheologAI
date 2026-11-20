'use strict';

const PREVIEW_OWNER = 40179660;

// Resolve only the explicitly selected, protected preview of this exact merge.
async function resolvePreview({github, context, runId, now = Date.now()}) {
  function check(ok, reason) {
    if (!ok) throw Error('Preview promotion refused: ' + reason);
  }
  const repo = context.repo;
  const fullName = repo.owner + '/' + repo.repo;
  check(context.eventName === 'workflow_dispatch' && context.ref === 'refs/heads/main', 'manual main release required');
  check(/^[1-9]\d*$/.test(String(runId)) && Number.isSafeInteger(Number(runId)), 'invalid run ID');
  const api = github.rest;
  const {data: run} = await api.actions.getWorkflowRun({...repo, run_id: Number(runId)});
  check(run.id === Number(runId) && run.repository?.full_name === fullName && run.head_repository?.full_name === fullName
    && run.event === 'pull_request' && run.path === '.github/workflows/pr.yml' && run.run_attempt === 1
    && run.status === 'completed' && run.conclusion === 'success', 'expected successful same-repository preview run');
  check(Date.parse(run.updated_at) <= now && now - Date.parse(run.updated_at) <= 7 * 86400000, 'preview age exceeds seven days');

  const {data: associated} = await api.repos.listPullRequestsAssociatedWithCommit({...repo, commit_sha: context.sha});
  const matches = associated.filter(pr => pr.merged_at && pr.merge_commit_sha === context.sha
    && pr.base.ref === 'main' && pr.head.repo?.full_name === fullName && pr.head.sha === run.head_sha);
  check(matches.length === 1, 'preview head does not belong to the merged release');
  const pull = matches[0];
  const {data: merge} = await api.git.getCommit({...repo, commit_sha: context.sha});
  const {data: head} = await api.git.getCommit({...repo, commit_sha: run.head_sha});
  check(merge.sha === context.sha && merge.parents?.length === 2 && merge.parents[1].sha === run.head_sha
    && head.sha === run.head_sha && /^[0-9a-f]{40}$/.test(head.tree.sha) && merge.tree.sha === head.tree.sha,
    'exact preview-tested tree required');

  const {data: jobs} = await api.actions.listJobsForWorkflowRun({...repo, run_id: run.id, per_page: 100});
  check(jobs.jobs.length === jobs.total_count, 'incomplete job roster');
  const protectedJobs = jobs.jobs.filter(job => job.name === 'Deploy Preview');
  check(protectedJobs.length === 1 && protectedJobs[0].conclusion === 'success'
    && protectedJobs[0].head_sha === run.head_sha, 'protected preview did not pass');
  const {data: reviews} = await api.actions.getReviewsForRun({...repo, run_id: run.id});
  check(Array.isArray(reviews), 'missing native preview review history');
  const previewReviews = reviews.filter(review =>
    review?.environments?.some(environment => environment.name === 'preview'));
  check(previewReviews.some(review => review.state === 'approved' && review.user?.id === PREVIEW_OWNER)
    && !previewReviews.some(review => review.state === 'rejected'), 'preview lacks the recorded owner approval');
  const {data: artifacts} = await api.actions.listWorkflowRunArtifacts({...repo, run_id: run.id, per_page: 100});
  check(artifacts.artifacts.length === artifacts.total_count, 'incomplete artifact roster');
  function artifactId(prefix) {
    const matches = artifacts.artifacts.filter(item => item.name === prefix + '-' + run.id);
    check(matches.length === 1, 'missing or ambiguous ' + prefix);
    const item = matches[0];
    check(Number.isSafeInteger(item.id) && item.id > 0 && item.expired === false && Date.parse(item.expires_at) > now
      && /^sha256:[0-9a-f]{64}$/.test(item.digest) && item.workflow_run?.id === run.id
      && item.workflow_run.head_sha === run.head_sha, 'unavailable or unrelated ' + prefix);
    return item.id;
  }
  return {runId: run.id, workerArtifactId: artifactId('release-worker'), receiptArtifactId: artifactId('accepted-preview'),
    sourceTree: head.tree.sha, pullRequest: pull.number};
}

module.exports = {resolvePreview};
