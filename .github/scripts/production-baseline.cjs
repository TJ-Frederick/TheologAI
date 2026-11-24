'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

const ownerId = 40179660;
const shaPattern = /^[0-9a-f]{40}$/;
const cutoverStep = 'Record accepted production source and assignment';

function targets(record) {
  return Object.fromEntries(['preview', 'production'].map(role => {
    const {databaseId, databaseName} = record[role];
    if (!/^[0-9a-f-]{36}$/.test(databaseId) || !/^[a-z0-9_-]{1,80}$/.test(databaseName)) {
      throw Error('Invalid production baseline database mapping');
    }
    return [role, {databaseId, databaseName}];
  }));
}

/** Select the newest accepted deployment after the reviewed assignment. */
async function resolveProductionBaseline({
  github, context,
  reviewed = JSON.parse(readFileSync('release/serving.json', 'utf8')),
  readSource = sha => JSON.parse(execFileSync('git', ['show', sha + ':release/serving.json'], {encoding:'utf8'})),
}) {
  const repo = context.repo;
  const actions = github.rest.actions;
  const query = {...repo, workflow_id:'deploy.yml', branch:'main', event:'workflow_dispatch', status:'success', per_page:100};
  if (!shaPattern.test(reviewed.productionSource)) throw Error('Invalid reviewed production source');
  const reviewedRunNumber = reviewed.productionRunNumber;
  if (!Number.isSafeInteger(reviewedRunNumber) || reviewedRunNumber < 1) {
    throw Error('Invalid reviewed production run number');
  }
  const initial = {
    productionSource: reviewed.productionSource,
    targets: targets(reviewed.predecessors),
    requireVersionTag: false,
  };
  const {data} = await actions.listWorkflowRuns(query);
  if (!Array.isArray(data.workflow_runs)) throw Error('Missing production workflow history');
  const runs = [...data.workflow_runs].sort((a, b) => b.run_number - a.run_number);
  for (const run of runs) {
    if (run.id === context.runId) continue;
    if (run.repository?.full_name !== repo.owner + '/' + repo.repo ||
        run.path !== '.github/workflows/deploy.yml' || run.head_branch !== 'main' ||
        run.status !== 'completed' || run.conclusion !== 'success' ||
        run.event !== 'workflow_dispatch' || !shaPattern.test(run.head_sha) ||
        !Number.isSafeInteger(run.run_number) || run.run_number < 1) {
      throw Error('Unexpected production workflow history');
    }
    // A rerun keeps its original workflow number. Reviewed serving evidence
    // takes precedence over every run at or before that cutover.
    if (run.run_number <= reviewedRunNumber) continue;
    const {data: roster} = await actions.listJobsForWorkflowRun({...repo, run_id:run.id, per_page:100});
    if (roster.jobs?.length !== roster.total_count) throw Error('Incomplete production job roster');
    const jobs = roster.jobs.filter(job => job.name === 'Test, Build & Deploy');
    if (jobs.length > 1) throw Error('Ambiguous protected production job');
    if (jobs.length === 0 || jobs[0].conclusion === 'skipped') continue;
    if (jobs[0].conclusion !== 'success' || jobs[0].head_sha !== run.head_sha) {
      throw Error('Unexpected protected production job result');
    }
    if (run.run_attempt !== 1 || !jobs[0].steps?.some(step =>
      step.name === cutoverStep && step.conclusion === 'success')) {
      throw Error('Latest successful production deployment needs an exact reviewed rebaseline');
    }
    const {data: reviews} = await actions.getReviewsForRun({...repo, run_id:run.id});
    if (!Array.isArray(reviews) || !reviews.some(review => review.state === 'approved' &&
      review.user?.id === ownerId && review.environments?.some(environment => environment.name === 'production'))) {
      throw Error('Latest production deployment lacks recorded owner approval');
    }
    return {productionSource:run.head_sha, targets:targets(readSource(run.head_sha).targets), requireVersionTag:true};
  }
  if (data.total_count > data.workflow_runs.length) throw Error('Production history is incomplete');
  return initial;
}

module.exports = {resolveProductionBaseline};
