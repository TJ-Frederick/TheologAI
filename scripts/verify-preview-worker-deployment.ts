/**
 * Reconciles the protected preview deployment with Cloudflare's read-only
 * version/deployment APIs. Wrangler's deploy action exposes command stdout,
 * but not a Worker version ID, so the identity proof is a strict before/after
 * version delta plus the latest 100% traffic assignment.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type JsonRecord = Record<string, unknown>;

interface VersionSummary {
  id: string;
  number: number;
  createdOn: string;
}

interface Deployment {
  id: string;
  createdOn: string;
  versions: Array<{ versionId: string; percentage: number }>;
}

export interface PreviewWorkerDeploymentIdentity {
  schemaVersion: 1;
  worker: 'theologai-preview';
  deployedVersionId: string;
  deployedVersionNumber: number;
  deploymentId: string;
  beforeVersionsSha256: string;
  afterVersionsSha256: string;
  deploymentsSha256: string;
  commandOutputSha256: string;
}

/** The retained record proves the same active deployment on both audit sides. */
export interface PreviewWorkerAuditedIdentity {
  schemaVersion: 2;
  worker: 'theologai-preview';
  deployedVersionId: string;
  deployedVersionNumber: number;
  deploymentId: string;
  beforeVersionsSha256: string;
  afterVersionsSha256: string;
  deploymentsSha256: string;
  commandOutputSha256: string;
  postAuditDeploymentsSha256: string;
}

function fail(message: string): never {
  throw new Error(`Preview Worker deployment identity verification refused: ${message}.`);
}

function assert(value: unknown, message: string): asserts value {
  if (!value) fail(message);
}

function record(value: unknown, label: string): JsonRecord {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as JsonRecord;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail(`${label} is not valid JSON`);
  }
}

function parseVersions(value: unknown, label: string): VersionSummary[] {
  assert(Array.isArray(value) && value.length > 0, `${label} must be a nonempty array`);
  const versions = value.map((value, index) => {
    const item = record(value, `${label} version ${index}`);
    const metadata = record(item.metadata, `${label} version ${index}.metadata`);
    assert(isUuid(item.id), `${label} version ${index} ID must be a UUID`);
    assert(Number.isSafeInteger(item.number) && (item.number as number) > 0, `${label} version ${index} number is invalid`);
    assert(validTime(metadata.created_on), `${label} version ${index} created_on is invalid`);
    return { id: item.id, number: item.number as number, createdOn: metadata.created_on };
  });
  assert(new Set(versions.map(version => version.id)).size === versions.length, `${label} version IDs are not unique`);
  assert(new Set(versions.map(version => version.number)).size === versions.length, `${label} version numbers are not unique`);
  return versions;
}

function parseDeployments(value: unknown): Deployment[] {
  assert(Array.isArray(value) && value.length > 0, 'after deployments must be a nonempty array');
  const deployments = value.map((value, index) => {
    const item = record(value, `after deployment ${index}`);
    assert(isUuid(item.id), `after deployment ${index} ID must be a UUID`);
    assert(validTime(item.created_on), `after deployment ${index} created_on is invalid`);
    assert(Array.isArray(item.versions) && item.versions.length > 0, `after deployment ${index} versions are invalid`);
    const versions = item.versions.map((value, versionIndex) => {
      const version = record(value, `after deployment ${index} version ${versionIndex}`);
      assert(isUuid(version.version_id), `after deployment ${index} version ${versionIndex} ID must be a UUID`);
      assert(typeof version.percentage === 'number' && Number.isFinite(version.percentage)
        && version.percentage >= 0 && version.percentage <= 100,
      `after deployment ${index} version ${versionIndex} percentage is invalid`);
      return { versionId: version.version_id, percentage: version.percentage };
    });
    return { id: item.id, createdOn: item.created_on, versions };
  });
  assert(new Set(deployments.map(deployment => deployment.id)).size === deployments.length, 'after deployment IDs are not unique');
  return deployments;
}

function latestSoleActiveDeployment(
  deployments: Deployment[],
  expectedVersionId: string,
  expectedDeploymentId?: string,
): Deployment {
  const latest = deployments.reduce((current, deployment) =>
    deployment.createdOn > current.createdOn ? deployment : current,
  );
  assert(latest.versions.length === 1
    && latest.versions[0]!.percentage === 100
    && latest.versions[0]!.versionId === expectedVersionId,
  'new Worker version is not the sole 100% active preview deployment');
  if (expectedDeploymentId !== undefined) {
    assert(latest.id === expectedDeploymentId,
      'post-audit latest preview deployment changed even though the version may match');
  }
  return latest;
}

/**
 * Validates that one, and only one, new version appeared and Cloudflare made
 * that same version the sole active preview deployment. Inputs are raw command
 * outputs so the returned record can preserve cryptographic evidence without
 * retaining operational stdout or full control-plane JSON as an artifact.
 */
export function verifyPreviewWorkerDeployment(input: {
  beforeVersionsText: string;
  afterVersionsText: string;
  afterDeploymentsText: string;
  commandOutput: string;
}): PreviewWorkerDeploymentIdentity {
  assert(typeof input.commandOutput === 'string' && input.commandOutput.length > 0,
    'pinned Wrangler deploy action did not provide command stdout');
  const before = parseVersions(parseJson(input.beforeVersionsText, 'before versions'), 'before versions');
  const after = parseVersions(parseJson(input.afterVersionsText, 'after versions'), 'after versions');
  const deployments = parseDeployments(parseJson(input.afterDeploymentsText, 'after deployments'));
  const beforeIds = new Set(before.map(version => version.id));
  const added = after.filter(version => !beforeIds.has(version.id));
  assert(added.length === 1, 'deployment must create exactly one new Worker version');
  const deployed = added[0]!;
  const newest = after.reduce((current, version) => version.number > current.number ? version : current);
  assert(newest.id === deployed.id, 'new version is not the latest uploaded Worker version');
  const latestDeployment = latestSoleActiveDeployment(deployments, deployed.id);
  return {
    schemaVersion: 1,
    worker: 'theologai-preview',
    deployedVersionId: deployed.id,
    deployedVersionNumber: deployed.number,
    deploymentId: latestDeployment.id,
    beforeVersionsSha256: sha256(input.beforeVersionsText),
    afterVersionsSha256: sha256(input.afterVersionsText),
    deploymentsSha256: sha256(input.afterDeploymentsText),
    commandOutputSha256: sha256(input.commandOutput),
  };
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function parsePreAuditIdentity(value: unknown): PreviewWorkerDeploymentIdentity {
  const identity = record(value, 'pre-audit identity');
  const keys = [
    'schemaVersion', 'worker', 'deployedVersionId', 'deployedVersionNumber', 'deploymentId',
    'beforeVersionsSha256', 'afterVersionsSha256', 'deploymentsSha256', 'commandOutputSha256',
  ];
  assert(JSON.stringify(Object.keys(identity).sort()) === JSON.stringify(keys.slice().sort()),
    'pre-audit identity keys are malformed');
  assert(identity.schemaVersion === 1 && identity.worker === 'theologai-preview', 'pre-audit identity is not canonical');
  assert(isUuid(identity.deployedVersionId) && Number.isSafeInteger(identity.deployedVersionNumber)
    && (identity.deployedVersionNumber as number) > 0 && isUuid(identity.deploymentId),
  'pre-audit identity version or deployment fields are malformed');
  for (const key of ['beforeVersionsSha256', 'afterVersionsSha256', 'deploymentsSha256', 'commandOutputSha256']) {
    assert(isSha256(identity[key]), `pre-audit identity ${key} is malformed`);
  }
  return identity as PreviewWorkerDeploymentIdentity;
}

/**
 * The post-audit read-only observation must retain the exact deployment ID as
 * well as its version and sole 100% traffic assignment. It is intentionally
 * a second observation: it cannot pretend to rule out a writer racing between
 * the two snapshots.
 */
export function verifyPreviewWorkerAuditStability(
  preAuditIdentity: PreviewWorkerDeploymentIdentity,
  postAuditDeploymentsText: string,
): PreviewWorkerAuditedIdentity {
  const pre = parsePreAuditIdentity(preAuditIdentity);
  const deployments = parseDeployments(parseJson(postAuditDeploymentsText, 'post-audit deployments'));
  latestSoleActiveDeployment(deployments, pre.deployedVersionId, pre.deploymentId);
  return { ...pre, schemaVersion: 2, postAuditDeploymentsSha256: sha256(postAuditDeploymentsText) };
}

function exactArgs(argv: string[], command: string, expected: string[]): Map<string, string> {
  assert(argv.length === expected.length * 2, `${command} expected ${expected.length} --option value pairs`);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]; const value = argv[index + 1];
    assert(typeof option === 'string' && option.startsWith('--') && typeof value === 'string'
      && value.length > 0 && !values.has(option), 'arguments are malformed or duplicated');
    values.set(option, value);
  }
  assert(values.size === expected.length && expected.every(option => values.has(option)), 'arguments are incomplete or unexpected');
  return values;
}

async function writeIdentity(
  identity: PreviewWorkerDeploymentIdentity | PreviewWorkerAuditedIdentity,
  output: string,
  githubOutput: string,
): Promise<void> {
  const serialized = `${JSON.stringify(identity, null, 2)}\n`;
  await writeFile(output, serialized, { encoding: 'utf8', flag: 'wx' });
  await writeFile(githubOutput, [
    `version_id=${identity.deployedVersionId}`,
    `deployment_id=${identity.deploymentId}`,
    `identity_sha256=${sha256(serialized)}`,
    '',
  ].join('\n'), { encoding: 'utf8', flag: 'a' });
}

export async function runCli(argv: string[]): Promise<void> {
  const command = argv[0];
  if (command === 'verify-deploy') {
    const values = exactArgs(argv.slice(1), command, ['--before-versions', '--after-versions', '--after-deployments', '--command-output', '--output', '--github-output']);
    const [beforeVersionsText, afterVersionsText, afterDeploymentsText, commandOutput] = await Promise.all([
      readFile(values.get('--before-versions')!, 'utf8'),
      readFile(values.get('--after-versions')!, 'utf8'),
      readFile(values.get('--after-deployments')!, 'utf8'),
      readFile(values.get('--command-output')!, 'utf8'),
    ]);
    await writeIdentity(verifyPreviewWorkerDeployment({ beforeVersionsText, afterVersionsText, afterDeploymentsText, commandOutput }),
      values.get('--output')!, values.get('--github-output')!);
    return;
  }
  if (command === 'verify-audit-stability') {
    const values = exactArgs(argv.slice(1), command, ['--pre-audit-identity', '--post-audit-deployments', '--output', '--github-output']);
    const [identityText, postAuditDeploymentsText] = await Promise.all([
      readFile(values.get('--pre-audit-identity')!, 'utf8'),
      readFile(values.get('--post-audit-deployments')!, 'utf8'),
    ]);
    await writeIdentity(verifyPreviewWorkerAuditStability(parsePreAuditIdentity(parseJson(identityText, 'pre-audit identity')),
      postAuditDeploymentsText), values.get('--output')!, values.get('--github-output')!);
    return;
  }
  fail('command must be verify-deploy or verify-audit-stability');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
