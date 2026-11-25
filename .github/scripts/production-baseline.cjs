'use strict';

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { uuid } = require('./corpus-policy.cjs');

const ownerId = 40179660;
const shaPattern = /^[0-9a-f]{40}$/;
const cutoverStep = 'Record accepted production source and assignment';
const evidenceUploadStep = 'Retain sanitized release evidence';
const receiptPath = 'release-evidence/accepted-production.json';
const maxArchiveBytes = 16 * 1024 * 1024;

function requireEvidence(condition, reason) {
  if (!condition) throw Error(reason);
}

function targets(record) {
  return Object.fromEntries(['preview', 'production'].map(role => {
    const {databaseId, databaseName} = record[role];
    if (!uuid.test(databaseId) || !/^[a-z0-9_-]{1,80}$/.test(databaseName)) {
      throw Error('Invalid production baseline database mapping');
    }
    return [role, {databaseId, databaseName}];
  }));
}

function assignment({versionId, deploymentId}, database) {
  requireEvidence(uuid.test(versionId) && uuid.test(deploymentId), 'Invalid production Worker or deployment identity');
  return {versionId, deploymentId, ...database};
}

function readAcceptanceArchive(bytes, digest) {
  requireEvidence(bytes.length > 0 && bytes.length <= maxArchiveBytes
    && 'sha256:' + createHash('sha256').update(bytes).digest('hex') === digest, 'Native production evidence archive digest or size mismatch');
  // Like the native operator artifact reader, inspect the roster and stream
  // the single expected member. Other release evidence stays in the archive.
  const directory = mkdtempSync(join(tmpdir(), 'production-baseline-'));
  try {
    const path = join(directory, 'evidence.zip');
    writeFileSync(path, bytes, {mode:0o600});
    const unzip = (args, maxBuffer) => {
      try {
        return execFileSync('unzip', args, {encoding:'utf8', maxBuffer, stdio:['ignore','pipe','ignore']});
      } catch {
        throw Error('Invalid or oversized native production evidence archive');
      }
    };
    const members = unzip(['-Z1', path], 64 * 1024).trimEnd().split('\n');
    const receipts = members.filter(member => /(?:^|[/\\])accepted-production\.json\/?$/.test(member));
    requireEvidence(receipts.length === 1 && receipts[0] === receiptPath, 'Missing or ambiguous accepted-production.json member');
    return JSON.parse(unzip(['-p', path, receiptPath], 16 * 1024));
  } finally {
    rmSync(directory, {recursive:true, force:true});
  }
}

async function readAcceptedAssignment({actions, repo, run, job, database, readTree, now}) {
  const uploads = job.steps.filter(step => step.name === evidenceUploadStep);
  requireEvidence(uploads.length === 1 && uploads[0].conclusion === 'success', 'Protected production evidence upload did not succeed');
  let roster;
  try {
    ({data: roster} = await actions.listWorkflowRunArtifacts({...repo, run_id:run.id, per_page:100}));
  } catch {
    throw Error('Could not list native production release evidence');
  }
  requireEvidence(Array.isArray(roster?.artifacts) && roster.artifacts.length === roster.total_count,
    'Incomplete production evidence artifact roster');
  const matches = roster.artifacts.filter(artifact => artifact.name === `production-release-evidence-${run.id}`);
  requireEvidence(matches.length === 1, 'Missing or ambiguous native production release evidence');
  const [artifact] = matches;
  requireEvidence(artifact.expired === false && Date.parse(artifact.expires_at) > now,
    'Native production release evidence is expired or has no valid expiry');
  requireEvidence(Number.isSafeInteger(artifact.id) && artifact.id > 0 && /^sha256:[0-9a-f]{64}$/.test(artifact.digest)
    && artifact.workflow_run?.id === run.id && artifact.workflow_run.head_sha === run.head_sha,
    'Invalid or unrelated native production release evidence');
  requireEvidence(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0
    && artifact.size_in_bytes <= maxArchiveBytes, 'Native production release evidence size is out of bounds');
  let archive;
  try {
    const {data} = await actions.downloadArtifact({...repo, artifact_id:artifact.id, archive_format:'zip'});
    archive = Buffer.from(data);
  } catch {
    throw Error('Could not download native production release evidence');
  }
  const receipt = readAcceptanceArchive(archive, artifact.digest);
  const sourceTree = readTree(run.head_sha);
  requireEvidence(receipt && receipt.productionSource === run.head_sha
    && shaPattern.test(sourceTree) && receipt.sourceTree === sourceTree, 'Accepted production receipt source or tree mismatch');
  requireEvidence(receipt.databaseId === database.databaseId && receipt.databaseName === database.databaseName,
    'Accepted production receipt D1 identity mismatch');
  return {
    sourceTree,
    productionAssignment: assignment(receipt, database),
    artifactProvenance: {runId:run.id, artifactId:artifact.id, digest:artifact.digest},
  };
}

/** Select the newest accepted deployment after the reviewed assignment. */
async function resolveProductionBaseline({
  github, context,
  reviewed = JSON.parse(readFileSync('release/serving.json', 'utf8')),
  readSource = sha => JSON.parse(execFileSync('git', ['show', sha + ':release/serving.json'], {encoding:'utf8'})),
  readTree = sha => execFileSync('git', ['rev-parse', '--verify', sha + '^{tree}'], {encoding:'utf8'}).trim(),
  now = Date.now(),
}) {
  const repo = context.repo;
  const actions = github.rest.actions;
  const query = {...repo, workflow_id:'deploy.yml', branch:'main', event:'workflow_dispatch', status:'success', per_page:100};
  if (!shaPattern.test(reviewed.productionSource)) throw Error('Invalid reviewed production source');
  const reviewedRunNumber = reviewed.productionRunNumber;
  if (!Number.isSafeInteger(reviewedRunNumber) || reviewedRunNumber < 1) {
    throw Error('Invalid reviewed production run number');
  }
  const reviewedTargets = targets(reviewed.predecessors);
  const initial = {
    productionSource: reviewed.productionSource,
    targets: reviewedTargets,
    requireVersionTag: false,
    productionAssignment: assignment(reviewed.predecessors.production, reviewedTargets.production),
  };
  const {data} = await actions.listWorkflowRuns(query);
  if (!Array.isArray(data.workflow_runs)) throw Error('Missing production workflow history');
  const runs = [...data.workflow_runs].sort((a, b) => b.run_number - a.run_number);
  for (const run of runs) {
    if (run.id === context.runId) continue;
    if (!Number.isSafeInteger(run.id) || run.id < 1 || run.repository?.full_name !== repo.owner + '/' + repo.repo ||
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
    try {
      const acceptedTargets = targets(readSource(run.head_sha).targets);
      const accepted = await readAcceptedAssignment({
        actions, repo, run, job:jobs[0], database:acceptedTargets.production, readTree, now,
      });
      return {productionSource:run.head_sha, targets:acceptedTargets, requireVersionTag:true, ...accepted};
    } catch (error) {
      throw Error(`Latest accepted production run ${run.id} needs an exact reviewed rebaseline: ${error.message}`);
    }
  }
  if (data.total_count > data.workflow_runs.length) throw Error('Production history is incomplete');
  return initial;
}

module.exports = {resolveProductionBaseline};
