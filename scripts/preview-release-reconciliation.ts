/**
 * Read-only evidence records for a protected preview release. This script is
 * intentionally unable to deploy, roll back, bind, seed, or delete anything:
 * a human separately authorizes any reconciliation action after reviewing its
 * records and the matching D1 readiness evidence.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseToml } from 'smol-toml';

type RecordValue = Record<string, unknown>;
type D1Binding = { binding: 'THEOLOGAI_DB'; databaseName: string; databaseId: string };
type Deployment = { id: string; createdOn: string; versionId: string };

export interface PreviewPredecessorAnchor {
  schemaVersion: 1;
  worker: 'theologai-preview';
  predecessorVersionId: string;
  predecessorDeploymentId: string;
  predecessorDeploymentsSha256: string;
  previewD1: D1Binding;
}

export interface PreviewPostMutationReconciliation {
  schemaVersion: 1;
  worker: 'theologai-preview';
  predecessorVersionId: string;
  predecessorDeploymentId: string;
  observedActiveVersionId: string;
  observedActiveDeploymentId: string;
  activeMatchesPredecessor: boolean;
  previewD1: D1Binding;
  predecessorAnchorSha256: string;
  postMutationDeploymentsSha256: string;
}

function fail(message: string): never { throw new Error(`Preview release reconciliation refused: ${message}.`); }
function assert(value: unknown, message: string): asserts value { if (!value) fail(message); }
function object(value: unknown, label: string): RecordValue {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as RecordValue;
}
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isSha256(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value); }
function exactKeys(value: RecordValue, keys: readonly string[], label: string): void {
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), `${label} keys are malformed`);
}

function parseJson(text: string, label: string): unknown {
  try { return JSON.parse(text) as unknown; } catch { return fail(`${label} is not valid JSON`); }
}

function checkedOutPreviewD1(configText: string): D1Binding {
  let parsed: unknown;
  try { parsed = parseToml(configText); } catch { return fail('wrangler config is not valid TOML'); }
  const root = object(parsed, 'wrangler config');
  const env = object(root.env, 'wrangler config env');
  const preview = object(env.preview, 'wrangler config env.preview');
  assert(preview.name === 'theologai-preview', 'wrangler config preview Worker is not theologai-preview');
  assert(Array.isArray(preview.d1_databases) && preview.d1_databases.length === 1, 'wrangler config must expose exactly one preview D1 binding');
  const binding = object(preview.d1_databases[0], 'preview D1 binding');
  exactKeys(binding, ['binding', 'database_name', 'database_id', 'migrations_dir'], 'preview D1 binding');
  assert(binding.binding === 'THEOLOGAI_DB' && typeof binding.database_name === 'string' && binding.database_name.length > 0 && isUuid(binding.database_id),
    'preview D1 binding is not canonical');
  return { binding: 'THEOLOGAI_DB', databaseName: binding.database_name, databaseId: binding.database_id.toLowerCase() };
}

function currentSoleDeployment(deploymentsText: string, label: string): Deployment {
  const values = parseJson(deploymentsText, label);
  assert(Array.isArray(values) && values.length > 0, `${label} must be a nonempty array`);
  const deployments = values.map((value, index) => {
    const deployment = object(value, `${label} deployment ${index}`);
    assert(isUuid(deployment.id) && typeof deployment.created_on === 'string' && Number.isFinite(Date.parse(deployment.created_on)),
      `${label} deployment ${index} identity is invalid`);
    assert(Array.isArray(deployment.versions) && deployment.versions.length === 1, `${label} deployment ${index} must have one active version`);
    const version = object(deployment.versions[0], `${label} deployment ${index} version`);
    assert(isUuid(version.version_id) && version.percentage === 100, `${label} deployment ${index} is not a sole 100% version`);
    return { id: deployment.id.toLowerCase(), createdOn: deployment.created_on, versionId: version.version_id.toLowerCase() };
  });
  assert(new Set(deployments.map(deployment => deployment.id)).size === deployments.length, `${label} deployment IDs are not unique`);
  return deployments.reduce((latest, deployment) => deployment.createdOn > latest.createdOn ? deployment : latest);
}

export function capturePreviewPredecessorAnchor(input: { deploymentsText: string; wranglerConfigText: string }): PreviewPredecessorAnchor {
  const active = currentSoleDeployment(input.deploymentsText, 'pre-deploy preview deployments');
  return {
    schemaVersion: 1,
    worker: 'theologai-preview',
    predecessorVersionId: active.versionId,
    predecessorDeploymentId: active.id,
    predecessorDeploymentsSha256: sha256(input.deploymentsText),
    previewD1: checkedOutPreviewD1(input.wranglerConfigText),
  };
}

function parseAnchor(value: unknown): PreviewPredecessorAnchor {
  const anchor = object(value, 'predecessor anchor');
  exactKeys(anchor, ['schemaVersion', 'worker', 'predecessorVersionId', 'predecessorDeploymentId', 'predecessorDeploymentsSha256', 'previewD1'], 'predecessor anchor');
  const d1 = object(anchor.previewD1, 'predecessor anchor previewD1');
  exactKeys(d1, ['binding', 'databaseName', 'databaseId'], 'predecessor anchor previewD1');
  assert(anchor.schemaVersion === 1 && anchor.worker === 'theologai-preview' && isUuid(anchor.predecessorVersionId)
    && isUuid(anchor.predecessorDeploymentId) && isSha256(anchor.predecessorDeploymentsSha256)
    && d1.binding === 'THEOLOGAI_DB' && typeof d1.databaseName === 'string' && d1.databaseName.length > 0 && isUuid(d1.databaseId),
  'predecessor anchor is not canonical');
  return {
    schemaVersion: 1, worker: 'theologai-preview', predecessorVersionId: anchor.predecessorVersionId.toLowerCase(),
    predecessorDeploymentId: anchor.predecessorDeploymentId.toLowerCase(), predecessorDeploymentsSha256: anchor.predecessorDeploymentsSha256.toLowerCase(),
    previewD1: { binding: 'THEOLOGAI_DB', databaseName: d1.databaseName, databaseId: d1.databaseId.toLowerCase() },
  };
}

export function reconcilePreviewPostMutation(input: {
  predecessorAnchorText: string;
  postMutationDeploymentsText: string;
  wranglerConfigText: string;
}): PreviewPostMutationReconciliation {
  const predecessor = parseAnchor(parseJson(input.predecessorAnchorText, 'predecessor anchor'));
  const d1 = checkedOutPreviewD1(input.wranglerConfigText);
  assert(JSON.stringify(d1) === JSON.stringify(predecessor.previewD1),
    'checked-out preview D1 binding no longer matches the captured predecessor compatibility anchor');
  const active = currentSoleDeployment(input.postMutationDeploymentsText, 'post-mutation preview deployments');
  return {
    schemaVersion: 1, worker: 'theologai-preview', predecessorVersionId: predecessor.predecessorVersionId,
    predecessorDeploymentId: predecessor.predecessorDeploymentId, observedActiveVersionId: active.versionId,
    observedActiveDeploymentId: active.id,
    activeMatchesPredecessor: active.versionId === predecessor.predecessorVersionId && active.id === predecessor.predecessorDeploymentId,
    previewD1: d1, predecessorAnchorSha256: sha256(input.predecessorAnchorText),
    postMutationDeploymentsSha256: sha256(input.postMutationDeploymentsText),
  };
}

function exactArgs(argv: string[], command: string, expected: string[]): Map<string, string> {
  assert(argv.length === expected.length * 2, `${command} expected ${expected.length} --option value pairs`);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]; const value = argv[index + 1];
    assert(typeof option === 'string' && option.startsWith('--') && typeof value === 'string' && value.length > 0 && !values.has(option),
      'arguments are malformed or duplicated');
    values.set(option, value);
  }
  assert(values.size === expected.length && expected.every(option => values.has(option)), 'arguments are incomplete or unexpected');
  return values;
}

async function writeRecord(record: PreviewPredecessorAnchor | PreviewPostMutationReconciliation, output: string): Promise<void> {
  await writeFile(output, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

export async function runCli(argv: string[]): Promise<void> {
  const command = argv[0];
  if (command === 'capture-predecessor') {
    const values = exactArgs(argv.slice(1), command, ['--deployments', '--wrangler-config', '--output']);
    const [deploymentsText, wranglerConfigText] = await Promise.all([readFile(values.get('--deployments')!, 'utf8'), readFile(values.get('--wrangler-config')!, 'utf8')]);
    await writeRecord(capturePreviewPredecessorAnchor({ deploymentsText, wranglerConfigText }), values.get('--output')!);
    return;
  }
  if (command === 'reconcile-post-mutation') {
    const values = exactArgs(argv.slice(1), command, ['--predecessor-anchor', '--deployments', '--wrangler-config', '--output']);
    const [predecessorAnchorText, postMutationDeploymentsText, wranglerConfigText] = await Promise.all([
      readFile(values.get('--predecessor-anchor')!, 'utf8'), readFile(values.get('--deployments')!, 'utf8'), readFile(values.get('--wrangler-config')!, 'utf8'),
    ]);
    await writeRecord(reconcilePreviewPostMutation({ predecessorAnchorText, postMutationDeploymentsText, wranglerConfigText }), values.get('--output')!);
    return;
  }
  fail('command must be capture-predecessor or reconcile-post-mutation');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
