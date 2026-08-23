import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectGitClassification } from './classify-production-deployment.mjs';

const SHA = /^[0-9a-f]{40}$/;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;
const STATUS = /^(?:A|M|D|[RC][0-9]{1,3})$/;
const ARTIFACT_NAME = /^production-deployment-plan-([1-9][0-9]*)-attempt-([1-9][0-9]*)$/;
const PLAN_FILE = 'production-deployment-plan.json';
const SHA_FILE = 'production-deployment-plan.sha256';
const MAX_PLAN_BYTES = 1024 * 1024;
const MAX_CHANGES = 4096;
const MAX_PATH_BYTES = 4096;
const REASONS = new Set([
  'manual-main-dispatch', 'markdown-documentation-only', 'non-documentation-path',
  'invalid-before-sha', 'zero-before-sha', 'invalid-after-sha', 'invalid-head-sha',
  'head-does-not-match-after', 'before-object-missing', 'after-object-missing',
  'before-is-not-ancestor', 'diff-failed', 'malformed-diff', 'empty-diff', 'classifier-error',
]);

function fail(code) { throw new Error(code); }

function requireExactKeys(value, keys, code) {
  if (
    typeof value !== 'object' || value === null || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
  ) fail(code);
}

function requireString(value, pattern, code) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(code);
  return value;
}

function createChangedPathEvidence(value) {
  if (!Array.isArray(value) || value.length > MAX_CHANGES) fail('invalid-changed-path-evidence');
  return value.map(change => {
    requireExactKeys(change, ['status', 'paths'], 'invalid-changed-path-record');
    const status = requireString(change.status, STATUS, 'invalid-changed-path-status');
    if ((status.startsWith('R') || status.startsWith('C')) && Number(status.slice(1)) > 100) fail('invalid-changed-path-status');
    const expectedPaths = status.startsWith('R') || status.startsWith('C') ? 2 : 1;
    if (!Array.isArray(change.paths) || change.paths.length !== expectedPaths) fail('invalid-changed-path-arity');
    const paths = change.paths.map(path => {
      if (
        typeof path !== 'string' || path.length === 0 || path.includes('\0') ||
        Buffer.byteLength(path, 'utf8') > MAX_PATH_BYTES
      ) fail('invalid-changed-path');
      return path;
    });
    return { status, paths };
  });
}

function createReleaseContext(value) {
  requireExactKeys(value, ['before', 'mode', 'forceDeploy', 'customDomainRequired', 'reason'], 'invalid-release-context');
  const before = requireString(value.before, SHA, 'invalid-release-context-before');
  if (!['push', 'manual'].includes(value.mode)) fail('invalid-release-context-mode');
  if (typeof value.forceDeploy !== 'boolean' || typeof value.customDomainRequired !== 'boolean') fail('invalid-release-context-flags');
  const reason = requireString(value.reason, /^(?:push-before|manual-main-dispatch)$/, 'invalid-release-context-reason');
  if (value.mode === 'push' && (value.forceDeploy || value.customDomainRequired || reason !== 'push-before')) fail('inconsistent-push-release-context');
  if (value.mode === 'manual' && (!value.forceDeploy || !value.customDomainRequired || reason !== 'manual-main-dispatch')) fail('inconsistent-manual-release-context');
  return { before, mode: value.mode, forceDeploy: value.forceDeploy, customDomainRequired: value.customDomainRequired, reason };
}

function createClassification(value) {
  requireExactKeys(value, ['succeeded', 'deployRequired', 'decision', 'reason', 'base', 'head', 'changedPathEvidence'], 'invalid-classification');
  if (typeof value.succeeded !== 'boolean' || typeof value.deployRequired !== 'boolean') fail('invalid-classification-flags');
  const decision = requireString(value.decision, /^(?:deploy|skip)$/, 'invalid-classification-decision');
  if (decision !== (value.deployRequired ? 'deploy' : 'skip')) fail('inconsistent-classification-decision');
  if (!value.succeeded && !value.deployRequired) fail('failed-classification-must-fail-safe');
  const reason = requireString(value.reason, /^[a-z0-9-]{1,80}$/, 'invalid-classification-reason');
  if (!REASONS.has(reason)) fail('unknown-classification-reason');
  const base = requireString(value.base, SHA, 'invalid-classification-base');
  const head = requireString(value.head, SHA, 'invalid-classification-head');
  return {
    succeeded: value.succeeded, deployRequired: value.deployRequired, decision, reason, base, head,
    changedPathEvidence: createChangedPathEvidence(value.changedPathEvidence),
  };
}

export function createProductionDeploymentPlan(value) {
  requireExactKeys(value, ['schemaVersion', 'artifactName', 'run', 'releaseContext', 'classification'], 'invalid-plan');
  if (value.schemaVersion !== 1) fail('invalid-schema-version');
  const artifactName = requireString(value.artifactName, ARTIFACT_NAME, 'invalid-artifact-name');
  const artifactMatch = artifactName.match(ARTIFACT_NAME);
  requireExactKeys(value.run, ['id', 'attempt', 'eventName', 'ref', 'head'], 'invalid-run');
  const id = requireString(value.run.id, POSITIVE_DECIMAL, 'invalid-run-id');
  const attempt = requireString(value.run.attempt, POSITIVE_DECIMAL, 'invalid-run-attempt');
  if (artifactMatch[1] !== id || artifactMatch[2] !== attempt) fail('artifact-name-run-mismatch');
  const eventName = requireString(value.run.eventName, /^(?:push|workflow_dispatch)$/, 'invalid-event-name');
  if (value.run.ref !== 'refs/heads/main') fail('invalid-run-ref');
  const head = requireString(value.run.head, SHA, 'invalid-run-head');
  const releaseContext = createReleaseContext(value.releaseContext);
  const classification = createClassification(value.classification);
  if (head !== classification.head) fail('run-head-mismatch');
  if (releaseContext.before !== classification.base) fail('release-context-base-mismatch');
  if (eventName === 'push' && releaseContext.mode !== 'push') fail('event-mode-mismatch');
  if (eventName === 'workflow_dispatch' && releaseContext.mode !== 'manual') fail('event-mode-mismatch');
  if (releaseContext.mode === 'manual' && (
    !classification.succeeded || !classification.deployRequired || classification.decision !== 'deploy' ||
    classification.reason !== 'manual-main-dispatch' || classification.changedPathEvidence.length !== 0
  )) fail('invalid-manual-classification');
  if (classification.decision === 'skip' && classification.reason !== 'markdown-documentation-only') fail('invalid-skip-reason');
  return {
    schemaVersion: 1,
    artifactName,
    run: { id, attempt, eventName, ref: 'refs/heads/main', head },
    releaseContext,
    classification,
  };
}

export function serializeProductionDeploymentPlan(value) {
  const bytes = `${JSON.stringify(createProductionDeploymentPlan(value))}\n`;
  if (Buffer.byteLength(bytes, 'utf8') > MAX_PLAN_BYTES) fail('plan-too-large');
  return bytes;
}

export function productionDeploymentPlanSha256(value) {
  return createHash('sha256').update(serializeProductionDeploymentPlan(value)).digest('hex');
}

export function verifyProductionDeploymentPlan({ planBytes, sha256Bytes, expected, classification }) {
  if (!Buffer.isBuffer(planBytes) && !(planBytes instanceof Uint8Array)) fail('invalid-plan-bytes');
  if (!Buffer.isBuffer(sha256Bytes) && !(sha256Bytes instanceof Uint8Array)) fail('invalid-sha256-bytes');
  if (planBytes.byteLength > MAX_PLAN_BYTES) fail('plan-too-large');
  const rawPlan = Buffer.from(planBytes).toString('utf8');
  let decoded;
  try { decoded = JSON.parse(rawPlan); } catch { fail('invalid-plan-json'); }
  const plan = createProductionDeploymentPlan(decoded);
  if (rawPlan !== serializeProductionDeploymentPlan(plan)) fail('noncanonical-plan-bytes');
  const planSha256 = createHash('sha256').update(planBytes).digest('hex');
  if (Buffer.from(sha256Bytes).toString('utf8') !== `${planSha256}\n`) fail('plan-sha256-sidecar-mismatch');

  requireExactKeys(expected, ['artifactName', 'sha256', 'run', 'releaseContext'], 'invalid-verification-expectation');
  requireString(expected.sha256, /^[0-9a-f]{64}$/, 'invalid-expected-sha256');
  const expectedIdentity = createProductionDeploymentPlan({
    ...plan, artifactName: expected.artifactName, run: expected.run, releaseContext: expected.releaseContext,
  });
  if (planSha256 !== expected.sha256) fail('expected-plan-sha256-mismatch');
  if (plan.artifactName !== expectedIdentity.artifactName) fail('artifact-name-mismatch');
  if (JSON.stringify(plan.run) !== JSON.stringify(expectedIdentity.run)) fail('run-identity-mismatch');
  if (JSON.stringify(plan.releaseContext) !== JSON.stringify(expectedIdentity.releaseContext)) fail('release-context-mismatch');
  if (!plan.classification.succeeded) fail('classification-did-not-succeed');
  if (JSON.stringify(plan.classification) !== JSON.stringify(createClassification(classification))) fail('classification-reproduction-mismatch');
  return {
    artifactName: plan.artifactName, planSha256,
    classificationSucceeded: plan.classification.succeeded,
    deployRequired: plan.classification.deployRequired,
    decision: plan.classification.decision,
    reason: plan.classification.reason,
    base: plan.classification.base,
    head: plan.classification.head,
    changedPathEvidenceCount: plan.classification.changedPathEvidence.length,
  };
}

function gitSucceeds(...args) {
  try { execFileSync('git', args, { stdio: 'ignore' }); return true; } catch { return false; }
}
function gitDiff(before, after) {
  try {
    return { ok: true, output: execFileSync('git', ['diff', '--name-status', '-z', '--find-renames', '--find-copies', before, after], { encoding: 'utf8' }) };
  } catch { return { ok: false, error: 'git-diff-failed' }; }
}
function readEnvironment(names) { return Object.fromEntries(names.map(name => [name, process.env[name] ?? ''])); }
function parseJson(value, code) { try { return JSON.parse(value); } catch { fail(code); } }

function createFromEnvironment() {
  const env = readEnvironment([
    'PRODUCTION_PLAN_ARTIFACT_NAME', 'PRODUCTION_PLAN_RUN_ID', 'PRODUCTION_PLAN_RUN_ATTEMPT',
    'PRODUCTION_PLAN_EVENT_NAME', 'PRODUCTION_PLAN_REF', 'PRODUCTION_PLAN_HEAD',
    'PRODUCTION_PLAN_RELEASE_CONTEXT_JSON', 'PRODUCTION_PLAN_CLASSIFICATION_SUCCEEDED',
    'PRODUCTION_PLAN_DEPLOY_REQUIRED', 'PRODUCTION_PLAN_DECISION', 'PRODUCTION_PLAN_CLASSIFICATION_REASON',
    'PRODUCTION_PLAN_BASE', 'PRODUCTION_PLAN_CLASSIFICATION_HEAD', 'PRODUCTION_PLAN_CHANGED_PATH_EVIDENCE_JSON',
  ]);
  if (!['true', 'false'].includes(env.PRODUCTION_PLAN_CLASSIFICATION_SUCCEEDED) || !['true', 'false'].includes(env.PRODUCTION_PLAN_DEPLOY_REQUIRED)) fail('invalid-boolean-environment');
  return createProductionDeploymentPlan({
    schemaVersion: 1,
    artifactName: env.PRODUCTION_PLAN_ARTIFACT_NAME,
    run: {
      id: env.PRODUCTION_PLAN_RUN_ID, attempt: env.PRODUCTION_PLAN_RUN_ATTEMPT,
      eventName: env.PRODUCTION_PLAN_EVENT_NAME, ref: env.PRODUCTION_PLAN_REF, head: env.PRODUCTION_PLAN_HEAD,
    },
    releaseContext: parseJson(env.PRODUCTION_PLAN_RELEASE_CONTEXT_JSON, 'invalid-release-context-json'),
    classification: {
      succeeded: env.PRODUCTION_PLAN_CLASSIFICATION_SUCCEEDED === 'true',
      deployRequired: env.PRODUCTION_PLAN_DEPLOY_REQUIRED === 'true',
      decision: env.PRODUCTION_PLAN_DECISION, reason: env.PRODUCTION_PLAN_CLASSIFICATION_REASON,
      base: env.PRODUCTION_PLAN_BASE, head: env.PRODUCTION_PLAN_CLASSIFICATION_HEAD,
      changedPathEvidence: parseJson(env.PRODUCTION_PLAN_CHANGED_PATH_EVIDENCE_JSON, 'invalid-changed-path-evidence-json'),
    },
  });
}

function classificationForVerification(releaseContext, head) {
  if (releaseContext.mode === 'manual') {
    return {
      succeeded: true, deployRequired: true, decision: 'deploy', reason: 'manual-main-dispatch',
      base: releaseContext.before, head, changedPathEvidence: [],
    };
  }
  const result = collectGitClassification(releaseContext.before, head, head, { succeeds: gitSucceeds, diff: gitDiff });
  return {
    succeeded: result.classificationSucceeded, deployRequired: result.deployRequired,
    decision: result.deployRequired ? 'deploy' : 'skip', reason: result.reason,
    base: result.base, head: result.head, changedPathEvidence: result.changedPathEvidence,
  };
}

function verifyDirectory(directory) {
  const absolute = resolve(directory);
  if (readdirSync(absolute).sort().join('\n') !== [PLAN_FILE, SHA_FILE].sort().join('\n')) fail('invalid-plan-file-roster');
  for (const name of [PLAN_FILE, SHA_FILE]) {
    const stat = lstatSync(resolve(absolute, name));
    if (!stat.isFile() || stat.isSymbolicLink()) fail('invalid-plan-file');
  }
  const env = readEnvironment([
    'EXPECTED_ARTIFACT_NAME', 'EXPECTED_SHA256', 'EXPECTED_RUN_ID', 'EXPECTED_RUN_ATTEMPT',
    'EXPECTED_EVENT_NAME', 'EXPECTED_REF', 'EXPECTED_HEAD', 'EXPECTED_RELEASE_CONTEXT_JSON',
  ]);
  const releaseContext = parseJson(env.EXPECTED_RELEASE_CONTEXT_JSON, 'invalid-expected-release-context-json');
  return verifyProductionDeploymentPlan({
    planBytes: readFileSync(resolve(absolute, PLAN_FILE)),
    sha256Bytes: readFileSync(resolve(absolute, SHA_FILE)),
    expected: {
      artifactName: env.EXPECTED_ARTIFACT_NAME, sha256: env.EXPECTED_SHA256,
      run: {
        id: env.EXPECTED_RUN_ID, attempt: env.EXPECTED_RUN_ATTEMPT,
        eventName: env.EXPECTED_EVENT_NAME, ref: env.EXPECTED_REF, head: env.EXPECTED_HEAD,
      },
      releaseContext,
    },
    classification: classificationForVerification(releaseContext, env.EXPECTED_HEAD),
  });
}

function cli() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'create' && args.length === 0) {
    process.stdout.write(serializeProductionDeploymentPlan(createFromEnvironment()));
    return;
  }
  if (command === 'verify' && args.length === 2 && args[0] === '--directory' && args[1]) {
    process.stdout.write(`${JSON.stringify(verifyDirectory(args[1]))}\n`);
    return;
  }
  fail('invalid-command');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { cli(); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
