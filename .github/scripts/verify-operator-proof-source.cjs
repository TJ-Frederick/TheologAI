// No cloud credentials: verify existing normal CI for this exact PR source.
module.exports = async ({ github, context, core, environment = process.env }) => {
  const check = (value, reason) => { if (!value) throw Error('Operator proof source refused: ' + reason); };
  const repo = { owner: 'TJ-Frederick', repo: 'TheologAI' };
  check(context.repo.owner === repo.owner && context.repo.repo === repo.repo, 'repository');
  const source = context.payload?.pull_request?.head?.sha;
  check(context.eventName === 'pull_request' && context.payload.pull_request.number === 167
    && environment.GITHUB_REF === 'refs/pull/167/merge', 'existing protected PR ref');
  check(environment.GITHUB_RUN_ATTEMPT === '1', 'single attempt');
  check(/^[1-9][0-9]{0,15}$/.test(environment.OPERATOR_SOURCE_RUN_ID || ''), 'source run');
  const runId = Number(environment.OPERATOR_SOURCE_RUN_ID);
  check(Number.isSafeInteger(runId) && environment.OPERATOR_SOURCE_RUN_ID === environment.GITHUB_RUN_ID
    && /^[0-9a-f]{40}$/.test(source || ''), 'identity');
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: 167 });
  check(pr.state === 'open' && !pr.draft && pr.base.ref === 'main' && pr.head.repo.full_name === 'TJ-Frederick/TheologAI', 'live PR');
  check(pr.labels.some(l => l.name === 'deploy-preview'), 'preview/diagnostic labels');
  check(pr.head.sha === source && pr.head.ref === 'codex/sec06-preview-credential-assessment', 'live source/ref');
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: runId });
  const linked = run.pull_requests.filter(p => p.number === 167);
  check(run.head_sha === source && run.path === '.github/workflows/pr.yml' && run.event === 'pull_request'
    && run.run_attempt === 1 && linked.length === 1 && linked[0].head.sha === source
    && linked[0].base.sha === pr.base.sha && /^[0-9a-f]{40}$/.test(pr.base.sha), 'normal PR run identity');
  const { data: result } = await github.rest.actions.listJobsForWorkflowRun({ ...repo, run_id: runId, filter: 'latest', per_page: 100 });
  for (const name of ['Select Validation', 'Test & Build', 'Fresh Checkout & Data', 'Node HTTP E2E',
    'Worker Runtime & D1', 'Applicable MCP Conformance', 'Validation Complete', 'Build preview Worker artifact (no cloud credentials)']) {
    const jobs = result.jobs.filter(j => j.name === name);
    check(jobs.length === 1 && jobs[0].status === 'completed' && jobs[0].conclusion === 'success', 'required CI: ' + name);
  }
  const { data: files } = await github.rest.actions.listWorkflowRunArtifacts({ ...repo, run_id: runId, per_page: 100 });
  for (const kind of ['corpus', 'worker']) {
    const artifacts = files.artifacts.filter(a => a.name === `${kind}-preview-${runId}-attempt-1`);
    check(artifacts.length === 1, 'artifact identity');
    const a = artifacts[0];
    check(!a.expired && Date.parse(a.expires_at) > Date.now() + 600_000 && a.workflow_run.head_sha === source
      && a.workflow_run.id === runId && /^sha256:[0-9a-f]{64}$/.test(a.digest), 'source-bound fresh artifact');
  }
  const { data: commit } = await github.rest.git.getCommit({ ...repo, commit_sha: source });
  check(/^[0-9a-f]{40}$/.test(commit.tree.sha), 'source tree');
  core.setOutput('source', source); core.setOutput('tree', commit.tree.sha); core.setOutput('base', pr.base.sha);
};
