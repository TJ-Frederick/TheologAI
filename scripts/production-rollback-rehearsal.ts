/**
 * Read-only production rollback rehearsal verifier.
 *
 * This module deliberately has no Wrangler or Cloudflare mutation command. It
 * consumes private control-plane captures and emits a bounded, hash-only
 * receipt. The fixed PR #108 target is code-owned; callers can provide only
 * the expected current identities that they observed immediately before the
 * rehearsal.
 */
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const SHA1 = /^[0-9a-f]{40}$/i;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 32 * 1024;

export const ROLLBACK_REHEARSAL_CONFIRMATION = 'REHEARSE THE EXACT PR108 ROLLBACK WITHOUT TRAFFIC';
export const ROLLBACK_REHEARSAL_COMMAND = 'wrangler versions deploy 291f3292-3fa9-44fc-bf6f-b68fd2f4cef6@100 --config wrangler.release.toml --name theologai --dry-run --yes';
export const ROLLBACK_REHEARSAL_WORKFLOW = 'Production Rollback Rehearsal';
export const ROLLBACK_REHEARSAL_REPOSITORY = 'TJ-Frederick/TheologAI';
export const ROLLBACK_REHEARSAL_WRANGLER_VERSION = '4.114.0';

export const ROLLBACK_REHEARSAL_TARGET = Object.freeze({
  sourceCommit: '8da99fd0a161b90a4bd90ab29bde1abf796b3bf6',
  sourceTree: 'a59d9a062b2e6c7884de97fd97309878e1cbdc23',
  deploymentId: '3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8',
  workerVersionId: '291f3292-3fa9-44fc-bf6f-b68fd2f4cef6',
  d1Name: 'theologai-production-20260729-transform11-a',
  d1Id: '53211f50-a893-4b4c-be1e-bc625a595dc7',
});

type JsonRecord = Record<string, unknown>;

export interface RollbackRehearsalReceipt {
  schemaVersion: 'theologai-production-rollback-rehearsal.v1';
  status: 'passed';
  provenance: {
    repository: string;
    workflow: string;
    headSha: string;
    ref: 'refs/heads/main';
    runId: string;
    runAttempt: string;
    wranglerVersion: '4.114.0';
  };
  source: { commit: string; tree: string };
  target: {
    deploymentId: string;
    workerVersionId: string;
    d1Name: string;
    d1Id: string;
  };
  controls: {
    production: { deploymentId: string; workerVersionId: string; d1Name: string; d1Id: string };
    preview: { deploymentId: string; workerVersionId: string; d1Name: string; d1Id: string };
  };
  evidence: {
    productionBeforeSha256: string;
    productionAfterSha256: string;
    productionVersionBeforeSha256: string;
    productionVersionAfterSha256: string;
    previewBeforeSha256: string;
    previewAfterSha256: string;
    previewVersionBeforeSha256: string;
    previewVersionAfterSha256: string;
    d1InventoryBeforeSha256: string;
    d1InventoryAfterSha256: string;
    targetVersionSha256: string;
    targetDeploymentSha256: string;
    npmInstallSha256: string;
    workerdSha256: string;
    readinessOutputSha256: string;
    runtimeOutputSha256: string;
    dryRunOutputSha256: string;
  };
  exitStatuses: { npmInstall: 0; workerd: 0; readiness: 0; runtime: 0; dryRun: 0 };
  trafficMutation: false;
  d1Mutation: false;
  previewMutation: false;
  targetInactiveBefore: true;
  targetInactiveAfter: true;
}

function fail(message: string): never {
  throw new Error(`Production rollback rehearsal refused: ${message}.`);
}

function assert(value: unknown, message: string): asserts value {
  if (!value) fail(message);
}

function record(value: unknown, label: string): JsonRecord {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), `${label} keys are malformed`);
}

function parseJson(text: string, label: string): unknown {
  assert(Buffer.byteLength(text, 'utf8') <= MAX_INPUT_BYTES, `${label} exceeds the bounded input size`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail(`${label} is not valid JSON`);
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function readCapped(path: string, label: string): Promise<string> {
  const metadata = await stat(path);
  assert(metadata.isFile(), `${label} is not a regular file`);
  assert(metadata.size <= MAX_INPUT_BYTES, `${label} exceeds the bounded input size`);
  const text = await readFile(path, 'utf8');
  assert(Buffer.byteLength(text, 'utf8') <= MAX_INPUT_BYTES, `${label} exceeds the bounded input size`);
  return text;
}

function uuid(value: unknown, label: string): string {
  assert(typeof value === 'string' && UUID.test(value), `${label} is not a UUID`);
  return value.toLowerCase();
}

export function parseRollbackRehearsalReceipt(value: unknown): RollbackRehearsalReceipt {
  const receipt = record(value, 'rehearsal receipt');
  exactKeys(receipt, ['schemaVersion', 'status', 'provenance', 'source', 'target', 'controls', 'evidence', 'exitStatuses', 'trafficMutation', 'd1Mutation', 'previewMutation', 'targetInactiveBefore', 'targetInactiveAfter'], 'rehearsal receipt');
  const provenance = record(receipt.provenance, 'rehearsal provenance');
  exactKeys(provenance, ['repository', 'workflow', 'headSha', 'ref', 'runId', 'runAttempt', 'wranglerVersion'], 'rehearsal provenance');
  assert(provenance.repository === ROLLBACK_REHEARSAL_REPOSITORY && provenance.workflow === ROLLBACK_REHEARSAL_WORKFLOW
    && provenance.ref === 'refs/heads/main' && provenance.wranglerVersion === ROLLBACK_REHEARSAL_WRANGLER_VERSION
    && typeof provenance.runId === 'string' && /^[1-9][0-9]*$/.test(provenance.runId)
    && typeof provenance.runAttempt === 'string' && /^[1-9][0-9]*$/.test(provenance.runAttempt)
    && typeof provenance.headSha === 'string' && SHA1.test(provenance.headSha), 'rehearsal provenance is not canonical');
  const source = record(receipt.source, 'rehearsal source');
  exactKeys(source, ['commit', 'tree'], 'rehearsal source');
  const target = record(receipt.target, 'rehearsal target');
  exactKeys(target, ['deploymentId', 'workerVersionId', 'd1Name', 'd1Id'], 'rehearsal target');
  const controls = record(receipt.controls, 'rehearsal controls');
  exactKeys(controls, ['production', 'preview'], 'rehearsal controls');
  for (const name of ['production', 'preview'] as const) {
    const control = record(controls[name], `${name} control`);
    exactKeys(control, ['deploymentId', 'workerVersionId', 'd1Name', 'd1Id'], `${name} control`);
    uuid(control.deploymentId, `${name} control deployment`); uuid(control.workerVersionId, `${name} control version`); uuid(control.d1Id, `${name} control D1`);
    assert(typeof control.d1Name === 'string' && control.d1Name.length > 0, `${name} control D1 name is invalid`);
  }
  const evidence = record(receipt.evidence, 'rehearsal evidence');
  exactKeys(evidence, [
    'productionBeforeSha256', 'productionAfterSha256', 'productionVersionBeforeSha256', 'productionVersionAfterSha256',
    'previewBeforeSha256', 'previewAfterSha256', 'previewVersionBeforeSha256', 'previewVersionAfterSha256',
    'd1InventoryBeforeSha256', 'd1InventoryAfterSha256', 'targetVersionSha256', 'targetDeploymentSha256', 'npmInstallSha256', 'workerdSha256', 'readinessOutputSha256', 'runtimeOutputSha256', 'dryRunOutputSha256',
  ], 'rehearsal evidence');
  for (const [key, value] of Object.entries(evidence)) assert(typeof value === 'string' && SHA256.test(value), `rehearsal evidence ${key} is not SHA-256`);
  const exitStatuses = record(receipt.exitStatuses, 'rehearsal exit statuses');
  exactKeys(exitStatuses, ['npmInstall', 'workerd', 'readiness', 'runtime', 'dryRun'], 'rehearsal exit statuses');
  for (const [key, value] of Object.entries(exitStatuses)) assert(value === 0, `rehearsal ${key} exit status is not zero`);
  assert(receipt.schemaVersion === 'theologai-production-rollback-rehearsal.v1' && receipt.status === 'passed'
    && receipt.trafficMutation === false && receipt.d1Mutation === false && receipt.previewMutation === false
    && receipt.targetInactiveBefore === true && receipt.targetInactiveAfter === true, 'rehearsal receipt safety flags are not passed');
  assert(source.commit === ROLLBACK_REHEARSAL_TARGET.sourceCommit && source.tree === ROLLBACK_REHEARSAL_TARGET.sourceTree, 'rehearsal source identity is not fixed');
  assert(target.deploymentId === ROLLBACK_REHEARSAL_TARGET.deploymentId && target.workerVersionId === ROLLBACK_REHEARSAL_TARGET.workerVersionId
    && target.d1Name === ROLLBACK_REHEARSAL_TARGET.d1Name && target.d1Id === ROLLBACK_REHEARSAL_TARGET.d1Id, 'rehearsal target identity is not fixed');
  return receipt as unknown as RollbackRehearsalReceipt;
}

interface DeploymentSnapshot {
  latest: { deploymentId: string; versionId: string };
}

function parseActiveVersionView(text: string, expectedVersionId: string, label: string): string {
  const view = record(parseJson(text, `${label} version view`), `${label} version view`);
  assert(uuid(view.id, `${label} version id`) === uuid(expectedVersionId, `${label} expected version`), `${label} version view does not match deployment`);
  const resources = record(view.resources, `${label} version resources`);
  assert(Array.isArray(resources.bindings), `${label} version bindings are not an array`);
  const d1 = resources.bindings
    .map((entry, index) => record(entry, `${label} binding ${index}`))
    .filter(binding => binding.name === 'THEOLOGAI_DB');
  assert(d1.length === 1, `${label} version must expose exactly one THEOLOGAI_DB binding`);
  const binding = d1[0]!;
  const id = uuid(binding.id, `${label} D1 binding id`);
  assert(binding.type === 'd1', `${label} THEOLOGAI_DB binding is not D1`);
  if (binding.database_id !== undefined) assert(uuid(binding.database_id, `${label} D1 database_id`) === id, `${label} D1 IDs disagree`);
  return id;
}

function parseDeployments(text: string, label: string): DeploymentSnapshot {
  const value = parseJson(text, label);
  assert(Array.isArray(value) && value.length > 0, `${label} must be a nonempty array`);
  const seen = new Set<string>();
  const deployments = value.map((entry, index) => {
    const item = record(entry, `${label} entry ${index}`);
    assert(typeof item.created_on === 'string' && Number.isFinite(Date.parse(item.created_on)), `${label} entry ${index} created_on is invalid`);
    const deploymentId = uuid(item.id, `${label} entry ${index} id`);
    assert(!seen.has(deploymentId), `${label} contains duplicate deployment IDs`);
    seen.add(deploymentId);
    assert(Array.isArray(item.versions) && item.versions.length > 0, `${label} entry ${index} versions are invalid`);
    const versions = item.versions.map((version, versionIndex) => {
      const v = record(version, `${label} entry ${index} version ${versionIndex}`);
      const versionId = uuid(v.version_id, `${label} entry ${index} version ${versionIndex} id`);
      assert(typeof v.percentage === 'number' && Number.isFinite(v.percentage) && v.percentage >= 0 && v.percentage <= 100,
        `${label} entry ${index} version ${versionIndex} percentage is invalid`);
      return { versionId, percentage: v.percentage as number };
    });
    return { deploymentId, createdOn: item.created_on, versions };
  });
  const latest = deployments.reduce((current, deployment) => deployment.createdOn > current.createdOn ? deployment : current);
  assert(latest.versions.length === 1 && latest.versions[0]!.percentage === 100,
    `${label} latest deployment is not a sole 100% assignment`);
  return { latest: { deploymentId: latest.deploymentId, versionId: latest.versions[0]!.versionId } };
}

function validateTargetDeployment(text: string): void {
  const envelope = record(parseJson(text, 'fixed PR108 deployment response'), 'fixed PR108 deployment response');
  exactKeys(envelope, ['errors', 'messages', 'result', 'success'], 'fixed PR108 deployment response');
  assert(envelope.success === true && Array.isArray(envelope.errors) && Array.isArray(envelope.messages), 'fixed PR108 deployment response is not successful');
  const result = record(envelope.result, 'fixed PR108 deployment');
  assert(uuid(result.id, 'fixed PR108 deployment id') === ROLLBACK_REHEARSAL_TARGET.deploymentId, 'fixed PR108 deployment ID does not match');
  assert(Array.isArray(result.versions) && result.versions.length > 0, 'fixed PR108 deployment versions are missing');
  const versions = result.versions.map((entry, index) => {
    const version = record(entry, `fixed PR108 deployment version ${index}`);
    return { id: uuid(version.version_id, `fixed PR108 deployment version ${index}`), percentage: version.percentage };
  });
  assert(versions.length === 1 && versions[0]!.id === ROLLBACK_REHEARSAL_TARGET.workerVersionId && versions[0]!.percentage === 100,
    'fixed PR108 deployment does not contain the exact 100% Worker version');
}

function parseD1Inventory(text: string, label: string): Map<string, string> {
  const value = parseJson(text, label);
  assert(Array.isArray(value) && value.length > 0, `${label} must be a nonempty array`);
  const pairs = new Map<string, string>();
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const item = record(entry, `${label} entry ${index}`);
    const id = uuid(item.uuid, `${label} entry ${index} uuid`);
    assert(typeof item.name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(item.name), `${label} entry ${index} name is invalid`);
    assert(!ids.has(id) && !names.has(item.name), `${label} contains duplicate D1 identities`);
    ids.add(id); names.add(item.name); pairs.set(item.name, id);
  }
  return pairs;
}

function assertTargetInventory(text: string, label: string): void {
  const pairs = parseD1Inventory(text, label);
  assert(pairs.get(ROLLBACK_REHEARSAL_TARGET.d1Name) === ROLLBACK_REHEARSAL_TARGET.d1Id,
    `${label} does not contain the fixed PR108 D1 name/UUID mapping`);
}

function d1NameForId(inventory: Map<string, string>, d1Id: string, label: string): string {
  const names = [...inventory.entries()].filter(([, id]) => id === d1Id).map(([name]) => name);
  assert(names.length === 1, `${label} active D1 UUID is not present exactly once in inventory`);
  return names[0]!;
}

function assertTargetVersionView(text: string): void {
  const view = record(parseJson(text, 'target Worker version view'), 'target Worker version view');
  assert(uuid(view.id, 'target Worker version id') === ROLLBACK_REHEARSAL_TARGET.workerVersionId,
    'target Worker version is not the fixed PR108 version');
  const resources = record(view.resources, 'target Worker version resources');
  assert(Array.isArray(resources.bindings), 'target Worker version bindings are not an array');
  const d1Bindings = resources.bindings
    .map((entry, index) => record(entry, `target Worker binding ${index}`))
    .filter(binding => binding.name === 'THEOLOGAI_DB');
  assert(d1Bindings.length === 1, 'target Worker version must expose exactly one THEOLOGAI_DB binding');
  const binding = d1Bindings[0]!;
  assert(binding.type === 'd1' && uuid(binding.id, 'target Worker D1 binding id') === ROLLBACK_REHEARSAL_TARGET.d1Id,
    'target Worker version THEOLOGAI_DB binding does not match the fixed PR108 D1');
  if (binding.database_id !== undefined) {
    assert(uuid(binding.database_id, 'target Worker D1 database_id') === ROLLBACK_REHEARSAL_TARGET.d1Id,
      'target Worker D1 id/database_id disagree');
  }
}

function assertExpectedControl(
  snapshot: DeploymentSnapshot,
  expectedDeploymentId: string,
  expectedVersionId: string,
  label: string,
): void {
  assert(snapshot.latest.deploymentId === uuid(expectedDeploymentId, `${label} expected deployment`), `${label} deployment changed`);
  assert(snapshot.latest.versionId === uuid(expectedVersionId, `${label} expected Worker version`), `${label} Worker version changed`);
}

function assertSource(value: string, pattern: RegExp, expected: string, label: string): void {
  assert(pattern.test(value) && value === expected, `${label} does not match the fixed PR108 source identity`);
}

export interface CreateRollbackRehearsalInput {
  confirmation: string;
  repository: string;
  workflow: string;
  headSha: string;
  ref: string;
  runId: string;
  runAttempt: string;
  wranglerVersion: string;
  sourceCommit: string;
  sourceTree: string;
  expectedProductionDeploymentId: string;
  expectedProductionVersionId: string;
  expectedPreviewDeploymentId: string;
  expectedPreviewVersionId: string;
  productionBeforeText: string;
  productionAfterText: string;
  productionVersionBeforeText: string;
  productionVersionAfterText: string;
  previewBeforeText: string;
  previewAfterText: string;
  previewVersionBeforeText: string;
  previewVersionAfterText: string;
  d1InventoryBeforeText: string;
  d1InventoryAfterText: string;
  targetVersionText: string;
  readinessOutputText: string;
  runtimeOutputText: string;
  dryRunOutputText: string;
  npmInstallOutputText: string;
  workerdOutputText: string;
  targetDeploymentText: string;
}

export function createRollbackRehearsalReceipt(input: CreateRollbackRehearsalInput): RollbackRehearsalReceipt {
  assert(input.confirmation === ROLLBACK_REHEARSAL_CONFIRMATION, 'confirmation phrase is incorrect');
  assert(input.repository === ROLLBACK_REHEARSAL_REPOSITORY && input.workflow === ROLLBACK_REHEARSAL_WORKFLOW
    && input.ref === 'refs/heads/main' && input.wranglerVersion === ROLLBACK_REHEARSAL_WRANGLER_VERSION,
  'workflow provenance is not fixed');
  assertSource(input.headSha, SHA1, input.headSha, 'workflow head SHA');
  assert(/^[1-9][0-9]*$/.test(input.runId) && /^[1-9][0-9]*$/.test(input.runAttempt), 'workflow run identity is malformed');
  assertSource(input.sourceCommit, SHA1, ROLLBACK_REHEARSAL_TARGET.sourceCommit, 'source commit');
  assertSource(input.sourceTree, SHA1, ROLLBACK_REHEARSAL_TARGET.sourceTree, 'source tree');
  assertTargetVersionView(input.targetVersionText);
  const productionBefore = parseDeployments(input.productionBeforeText, 'production deployments before');
  const productionAfter = parseDeployments(input.productionAfterText, 'production deployments after');
  const previewBefore = parseDeployments(input.previewBeforeText, 'preview deployments before');
  const previewAfter = parseDeployments(input.previewAfterText, 'preview deployments after');
  assertExpectedControl(productionBefore, input.expectedProductionDeploymentId, input.expectedProductionVersionId, 'production before');
  assertExpectedControl(productionAfter, input.expectedProductionDeploymentId, input.expectedProductionVersionId, 'production after');
  assertExpectedControl(previewBefore, input.expectedPreviewDeploymentId, input.expectedPreviewVersionId, 'preview before');
  assertExpectedControl(previewAfter, input.expectedPreviewDeploymentId, input.expectedPreviewVersionId, 'preview after');
  const productionD1Before = parseActiveVersionView(input.productionVersionBeforeText, productionBefore.latest.versionId, 'production before');
  const productionD1After = parseActiveVersionView(input.productionVersionAfterText, productionAfter.latest.versionId, 'production after');
  const previewD1Before = parseActiveVersionView(input.previewVersionBeforeText, previewBefore.latest.versionId, 'preview before');
  const previewD1After = parseActiveVersionView(input.previewVersionAfterText, previewAfter.latest.versionId, 'preview after');
  assert(productionD1Before === productionD1After, 'production D1 binding changed during rehearsal');
  assert(previewD1Before === previewD1After, 'preview D1 binding changed during rehearsal');
  assert(productionBefore.latest.versionId !== ROLLBACK_REHEARSAL_TARGET.workerVersionId
    && previewBefore.latest.versionId !== ROLLBACK_REHEARSAL_TARGET.workerVersionId, 'fixed PR108 target was active before rehearsal');
  assert(productionAfter.latest.versionId !== ROLLBACK_REHEARSAL_TARGET.workerVersionId
    && previewAfter.latest.versionId !== ROLLBACK_REHEARSAL_TARGET.workerVersionId, 'fixed PR108 target was active after rehearsal');
  validateTargetDeployment(input.targetDeploymentText);
  assert(input.dryRunOutputText.includes('DRY_RUN_SENTINEL: fixed-pr108-dry-run'), 'dry-run output does not contain the exact recovery-command sentinel');
  const d1Before = parseD1Inventory(input.d1InventoryBeforeText, 'D1 inventory before');
  const d1After = parseD1Inventory(input.d1InventoryAfterText, 'D1 inventory after');
  assertTargetInventory(input.d1InventoryBeforeText, 'D1 inventory before');
  assertTargetInventory(input.d1InventoryAfterText, 'D1 inventory after');
  assert(JSON.stringify([...d1Before.entries()].sort()) === JSON.stringify([...d1After.entries()].sort()), 'D1 inventory changed during rehearsal');
  const productionD1NameBefore = d1NameForId(d1Before, productionD1Before, 'production before');
  const productionD1NameAfter = d1NameForId(d1After, productionD1After, 'production after');
  const previewD1NameBefore = d1NameForId(d1Before, previewD1Before, 'preview before');
  const previewD1NameAfter = d1NameForId(d1After, previewD1After, 'preview after');
  assert(productionD1NameBefore === productionD1NameAfter && previewD1NameBefore === previewD1NameAfter,
    'active D1 names changed during rehearsal');
  assert(productionD1Before !== previewD1Before && productionD1NameBefore !== previewD1NameBefore,
    'production and preview D1 identities must be distinct');
  for (const [text, label] of [[input.npmInstallOutputText, 'npm install'], [input.workerdOutputText, 'Workerd'], [input.readinessOutputText, 'readiness'], [input.runtimeOutputText, 'runtime'], [input.dryRunOutputText, 'dry-run']] as const) {
    assert(Buffer.byteLength(text, 'utf8') <= MAX_INPUT_BYTES, `${label} output exceeds the bounded input size`);
  }
  return {
    schemaVersion: 'theologai-production-rollback-rehearsal.v1',
    status: 'passed',
    provenance: {
      repository: ROLLBACK_REHEARSAL_REPOSITORY, workflow: ROLLBACK_REHEARSAL_WORKFLOW,
      headSha: input.headSha, ref: 'refs/heads/main', runId: input.runId, runAttempt: input.runAttempt,
      wranglerVersion: ROLLBACK_REHEARSAL_WRANGLER_VERSION,
    },
    source: { commit: ROLLBACK_REHEARSAL_TARGET.sourceCommit, tree: ROLLBACK_REHEARSAL_TARGET.sourceTree },
    target: {
      deploymentId: ROLLBACK_REHEARSAL_TARGET.deploymentId,
      workerVersionId: ROLLBACK_REHEARSAL_TARGET.workerVersionId,
      d1Name: ROLLBACK_REHEARSAL_TARGET.d1Name,
      d1Id: ROLLBACK_REHEARSAL_TARGET.d1Id,
    },
    controls: {
      production: { deploymentId: productionAfter.latest.deploymentId, workerVersionId: productionAfter.latest.versionId, d1Name: productionD1NameAfter, d1Id: productionD1After },
      preview: { deploymentId: previewAfter.latest.deploymentId, workerVersionId: previewAfter.latest.versionId, d1Name: previewD1NameAfter, d1Id: previewD1After },
    },
    evidence: {
      productionBeforeSha256: sha256(input.productionBeforeText), productionAfterSha256: sha256(input.productionAfterText),
      productionVersionBeforeSha256: sha256(input.productionVersionBeforeText), productionVersionAfterSha256: sha256(input.productionVersionAfterText),
      previewBeforeSha256: sha256(input.previewBeforeText), previewAfterSha256: sha256(input.previewAfterText),
      previewVersionBeforeSha256: sha256(input.previewVersionBeforeText), previewVersionAfterSha256: sha256(input.previewVersionAfterText),
      d1InventoryBeforeSha256: sha256(input.d1InventoryBeforeText), d1InventoryAfterSha256: sha256(input.d1InventoryAfterText),
      targetVersionSha256: sha256(input.targetVersionText), targetDeploymentSha256: sha256(input.targetDeploymentText),
      npmInstallSha256: sha256(input.npmInstallOutputText), workerdSha256: sha256(input.workerdOutputText), readinessOutputSha256: sha256(input.readinessOutputText),
      runtimeOutputSha256: sha256(input.runtimeOutputText), dryRunOutputSha256: sha256(input.dryRunOutputText),
    },
    exitStatuses: { npmInstall: 0, workerd: 0, readiness: 0, runtime: 0, dryRun: 0 },
    trafficMutation: false, d1Mutation: false, previewMutation: false,
    targetInactiveBefore: true, targetInactiveAfter: true,
  };
}

export function serializeRollbackRehearsalReceipt(input: CreateRollbackRehearsalInput): string {
  const bytes = `${JSON.stringify(parseRollbackRehearsalReceipt(createRollbackRehearsalReceipt(input)))}\n`;
  assert(Buffer.byteLength(bytes, 'utf8') <= MAX_RECEIPT_BYTES, 'receipt exceeds the bounded output size');
  return bytes;
}

function exactArgs(argv: string[]): Map<string, string> {
  const expected = [
    '--confirmation', '--repository', '--workflow', '--head-sha', '--ref', '--run-id', '--run-attempt', '--wrangler-version', '--source-commit', '--source-tree', '--expected-production-deployment', '--expected-production-version',
    '--expected-preview-deployment', '--expected-preview-version', '--production-before', '--production-after',
    '--production-version-before', '--production-version-after', '--preview-before', '--preview-after',
    '--preview-version-before', '--preview-version-after', '--d1-before', '--d1-after', '--target-version',
    '--readiness-output', '--runtime-output', '--dry-run-output', '--npm-install-output', '--workerd-output', '--target-deployment', '--output',
  ];
  assert(argv.length === expected.length * 2, 'create expects exactly the reviewed option pairs');
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]; const value = argv[index + 1];
    assert(typeof option === 'string' && expected.includes(option) && typeof value === 'string' && value.length > 0 && !values.has(option), 'arguments are malformed');
    values.set(option, value);
  }
  assert(values.size === expected.length, 'arguments are incomplete');
  return values;
}

async function cli(argv: string[]): Promise<void> {
  assert(argv[0] === 'create', 'only the create command is supported');
  const values = exactArgs(argv.slice(1));
  const read = async (option: string) => readCapped(values.get(option)!, option);
  const receipt = serializeRollbackRehearsalReceipt({
    confirmation: values.get('--confirmation')!, repository: values.get('--repository')!, workflow: values.get('--workflow')!,
    headSha: values.get('--head-sha')!, ref: values.get('--ref')!, runId: values.get('--run-id')!, runAttempt: values.get('--run-attempt')!,
    wranglerVersion: values.get('--wrangler-version')!, sourceCommit: values.get('--source-commit')!, sourceTree: values.get('--source-tree')!,
    expectedProductionDeploymentId: values.get('--expected-production-deployment')!, expectedProductionVersionId: values.get('--expected-production-version')!,
    expectedPreviewDeploymentId: values.get('--expected-preview-deployment')!, expectedPreviewVersionId: values.get('--expected-preview-version')!,
    productionBeforeText: await read('--production-before'), productionAfterText: await read('--production-after'),
    productionVersionBeforeText: await read('--production-version-before'), productionVersionAfterText: await read('--production-version-after'),
    previewBeforeText: await read('--preview-before'), previewAfterText: await read('--preview-after'),
    previewVersionBeforeText: await read('--preview-version-before'), previewVersionAfterText: await read('--preview-version-after'),
    d1InventoryBeforeText: await read('--d1-before'), d1InventoryAfterText: await read('--d1-after'),
    targetVersionText: await read('--target-version'), readinessOutputText: await read('--readiness-output'),
    runtimeOutputText: await read('--runtime-output'), dryRunOutputText: await read('--dry-run-output'),
    npmInstallOutputText: await read('--npm-install-output'), workerdOutputText: await read('--workerd-output'),
    targetDeploymentText: await read('--target-deployment'),
  });
  await writeFile(values.get('--output')!, receipt, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(receipt);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
