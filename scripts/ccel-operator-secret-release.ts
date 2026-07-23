import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { parse as parseToml } from 'smol-toml';

export const CCEL_OPERATOR_SECRET = 'THEOLOGAI_CCEL_OPERATOR_TOKEN';
export const PRODUCTION_WORKER = 'theologai';
export const PRODUCTION_D1_ID = '3f7faa0e-689f-47aa-a601-dc662db9a6cf';
export const PREVIEW_D1_ID = '94c4938b-7800-4d68-9097-0df33c31fdc1';
export const STAGE_CONFIRMATION = 'I AUTHORIZE PROVISIONING THE PROTECTED CCEL OPERATOR SECRET';
export const PROMOTE_CONFIRMATION = 'PROMOTE THEOLOGAI CCEL OPERATOR SECRET';
export const ROLLBACK_CONFIRMATION = 'ROLL BACK THEOLOGAI TO THE EXACT SECRETLESS BASELINE';
export const STAGED_MESSAGE = `Stage ${CCEL_OPERATOR_SECRET} without traffic`;
export const STAGED_TAG = 'ccel-operator-secret-staged';

const COMPATIBILITY_DATE = '2026-07-09';
const COMPATIBILITY_FLAGS = ['nodejs_compat'];
const ORIGINS = 'https://theologai.xyz,https://theologai.pages.dev';
const DO_BINDING = {
  name: 'THEOLOGAI_CCEL_COORDINATOR',
  type: 'durable_object_namespace',
  class_name: 'CcelGlobalCoordinator',
  script_name: 'theologai-ccel-coordinator',
};
const DO_CONFIG_BINDING = {
  name: DO_BINDING.name,
  class_name: DO_BINDING.class_name,
  script_name: DO_BINDING.script_name,
};
const PRODUCTION_VARS: Record<string, string> = {
  THEOLOGAI_VERSION: '3.6.0',
  THEOLOGAI_ALLOWED_ORIGINS: ORIGINS,
  THEOLOGAI_MAX_REQUEST_BYTES: '1048576',
  THEOLOGAI_REQUEST_LOGS: 'false',
  THEOLOGAI_EXPOSE_CCEL_DISCOVERY: 'false',
  THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: 'false',
  THEOLOGAI_ENABLE_CCEL_COORDINATOR: 'false',
};
const PREVIEW_VARS: Record<string, string> = {
  ...PRODUCTION_VARS,
  THEOLOGAI_VERSION: '3.6.0-preview',
  THEOLOGAI_REQUEST_LOGS: 'true',
  THEOLOGAI_EXPOSE_CCEL_DISCOVERY: 'true',
};

type JsonRecord = Record<string, unknown>;
type VersionSummary = {
  id: string;
  number: number;
  metadata: { created_on: string };
  annotations?: Record<string, string>;
};
type FullVersion = VersionSummary & {
  resources: JsonRecord & { bindings: JsonRecord[] };
};
type Deployment = {
  id: string;
  created_on: string;
  versions: Array<{ version_id: string; percentage: number }>;
};

export interface DispatchInput {
  action: 'stage' | 'promote' | 'rollback';
  ref: string;
  sha: string;
  expectedSha: string;
  liveMainSha: string;
  expectedAccountId: string;
  baselineVersion: string;
  stagedVersion?: string;
  currentVersion?: string;
  confirmation: string;
  execute: boolean;
  configText: string;
  releaseConfigText: string;
}

export function validateDispatch(input: DispatchInput): void {
  assert(input.ref === 'refs/heads/main', 'dispatch must use refs/heads/main');
  assert(isSha(input.sha) && input.sha === input.expectedSha, 'expected main SHA must equal the dispatched SHA');
  assert(isSha(input.liveMainSha) && input.liveMainSha === input.sha, 'dispatched SHA must still be the live main SHA');
  assert(/^[0-9a-f]{32}$/.test(input.expectedAccountId), 'expected Cloudflare account ID must be 32 lowercase hex characters');
  assert(isUuid(input.baselineVersion), 'baseline Worker version must be an exact UUID');
  assertWorkerConfig(input.configText);
  assertReleaseConfig(input.releaseConfigText);
  const confirmation = input.action === 'stage'
    ? STAGE_CONFIRMATION
    : input.action === 'promote' ? PROMOTE_CONFIRMATION : ROLLBACK_CONFIRMATION;
  assert(input.confirmation === confirmation, `${input.action} confirmation must match exactly`);
  if (input.action === 'stage') {
    assert(input.stagedVersion === undefined && input.currentVersion === undefined, 'stage accepts only a baseline version');
  } else if (input.action === 'promote') {
    assert(isUuid(input.stagedVersion), 'promotion requires an exact staged UUID');
    assert(input.stagedVersion !== input.baselineVersion, 'staged and baseline UUIDs must differ');
  } else {
    assert(isUuid(input.currentVersion), 'rollback requires an exact current UUID');
    assert(input.currentVersion !== input.baselineVersion, 'rollback current and target UUIDs must differ');
  }
}

export function validateOperatorToken(token: unknown): void {
  assert(typeof token === 'string', 'operator token must be present');
  assert(token.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(token), 'operator token must be one 43-character base64url line');
  const decoded = Buffer.from(token, 'base64url');
  assert(decoded.length === 32 && decoded.toString('base64url') === token, 'operator token must be canonical base64url for exactly 32 bytes');
}

export function validateAccount(expected: string, actual: unknown): void {
  assert(/^[0-9a-f]{32}$/.test(expected), 'expected Cloudflare account ID is invalid');
  assert(typeof actual === 'string' && actual === expected, 'protected Cloudflare account does not match the authorized account');
}

export function assertReleaseConfig(configText: string): void {
  const config = parseTomlRecord(configText, 'release config');
  assertExactKeys(config, ['name', 'main', 'compatibility_date', 'compatibility_flags'], 'release config');
  assert(config.name === PRODUCTION_WORKER, 'release config Worker name must be theologai');
  assert(config.main === 'src/worker.ts', 'release config entry point must be src/worker.ts');
  assert(config.compatibility_date === COMPATIBILITY_DATE, 'release config compatibility date mismatch');
  assert(stableJson(config.compatibility_flags) === stableJson(COMPATIBILITY_FLAGS), 'release config compatibility flags mismatch');
}

export function assertWorkerConfig(configText: string): void {
  assert(!configText.includes(CCEL_OPERATOR_SECRET), 'operator token must not be stored in Wrangler config');
  const root = parseTomlRecord(configText, 'Worker config');
  assert(root.name === PRODUCTION_WORKER && root.main === 'src/worker.ts', 'production Worker identity mismatch');
  assert(root.compatibility_date === COMPATIBILITY_DATE
    && stableJson(root.compatibility_flags) === stableJson(COMPATIBILITY_FLAGS), 'production compatibility settings mismatch');
  validateEnvironmentConfig(root, {
    worker: PRODUCTION_WORKER,
    d1Id: PRODUCTION_D1_ID,
    d1Name: 'theologai-production-20260723-a',
    requestNamespace: '361201',
    operatorNamespace: '361203',
    vars: PRODUCTION_VARS,
  });
  const env = recordAt(root, 'env');
  const preview = recordAt(env, 'preview');
  validateEnvironmentConfig(preview, {
    worker: 'theologai-preview',
    d1Id: PREVIEW_D1_ID,
    d1Name: 'theologai-preview-20260722-b',
    requestNamespace: '361202',
    operatorNamespace: '361204',
    vars: PREVIEW_VARS,
  });
  assert(PRODUCTION_D1_ID !== PREVIEW_D1_ID, 'preview and production D1 identities must differ');
}

export const assertProductionConfig = assertWorkerConfig;

function validateEnvironmentConfig(config: JsonRecord, expected: {
  worker: string; d1Id: string; d1Name: string; requestNamespace: string;
  operatorNamespace: string; vars: Record<string, string>;
}): void {
  assert(config.name === expected.worker, `${expected.worker} Worker name mismatch`);
  const versionMetadata = recordAt(config, 'version_metadata');
  assertExactKeys(versionMetadata, ['binding'], `${expected.worker} version metadata`);
  assert(versionMetadata.binding === 'CF_VERSION_METADATA', `${expected.worker} version metadata binding mismatch`);
  const vars = recordAt(config, 'vars');
  assertExactKeys(vars, Object.keys(expected.vars), `${expected.worker} vars`);
  for (const [name, value] of Object.entries(expected.vars)) {
    assert(vars[name] === value, `${expected.worker} ${name} mismatch`);
  }
  const d1 = onlyRecord(arrayAt(config, 'd1_databases'), `${expected.worker} D1 binding`);
  assertExactKeys(d1, ['binding', 'database_name', 'database_id', 'migrations_dir'], `${expected.worker} D1 binding`);
  assert(d1.binding === 'THEOLOGAI_DB' && d1.database_id === expected.d1Id
    && d1.database_name === expected.d1Name && d1.migrations_dir === 'migrations', `${expected.worker} D1 binding mismatch`);
  const durable = onlyRecord(arrayAt(recordAt(config, 'durable_objects'), 'bindings'), `${expected.worker} Durable Object binding`);
  assertExactKeys(durable, ['name', 'class_name', 'script_name'], `${expected.worker} Durable Object binding`);
  assertRecordFields(durable, DO_CONFIG_BINDING, `${expected.worker} Durable Object binding`);
  const limits = arrayAt(config, 'ratelimits').map((value, index) => asRecord(value, `${expected.worker} rate limit ${index}`));
  assert(limits.length === 2, `${expected.worker} must define exactly two rate limits`);
  assertUniqueNames([{ name: d1.binding }, durable, ...limits, { name: versionMetadata.binding }], `${expected.worker} critical bindings`);
  validateRateLimit(limits, 'THEOLOGAI_RATE_LIMITER', expected.requestNamespace, 120);
  validateRateLimit(limits, 'THEOLOGAI_CCEL_OPERATOR_AUTH_LIMITER', expected.operatorNamespace, 12);
}

function validateRateLimit(limits: JsonRecord[], name: string, namespace: string, limit: number): void {
  const binding = exactlyOne(limits.filter(value => value.name === name), `${name} binding`);
  assertExactKeys(binding, ['name', 'namespace_id', 'simple'], `${name} binding`);
  assert(binding.namespace_id === namespace, `${name} namespace mismatch`);
  const simple = recordAt(binding, 'simple');
  assertExactKeys(simple, ['limit', 'period'], `${name} simple policy`);
  assert(simple.limit === limit && simple.period === 60, `${name} limit mismatch`);
}

export function validateStageBaseline(
  summariesValue: unknown,
  deploymentsValue: unknown,
  baselineViewValue: unknown,
  expectedBaseline: string,
): FullVersion {
  const summaries = parseVersionSummaries(summariesValue);
  const deployments = parseDeployments(deploymentsValue);
  const baseline = parseFullVersion(baselineViewValue);
  assert(baseline.id === expectedBaseline, 'baseline view identity mismatch');
  assert(newestSummary(summaries).id === expectedBaseline, 'latest uploaded version must equal the expected baseline');
  assert(activeVersion(deployments) === expectedBaseline, 'expected baseline must be the sole active 100% deployment');
  assertProductionVersion(baseline);
  return baseline;
}

export function identifyStagedVersion(
  beforeSummariesValue: unknown,
  afterSummariesValue: unknown,
  beforeDeploymentsValue: unknown,
  afterDeploymentsValue: unknown,
  expectedBaseline: string,
): string {
  const before = parseVersionSummaries(beforeSummariesValue);
  const after = parseVersionSummaries(afterSummariesValue);
  const beforeDeployments = parseDeployments(beforeDeploymentsValue);
  const afterDeployments = parseDeployments(afterDeploymentsValue);
  assert(newestSummary(before).id === expectedBaseline, 'pre-stage latest version drifted');
  assert(activeVersion(beforeDeployments) === expectedBaseline, 'pre-stage deployment drifted');
  assert(stableJson(beforeDeployments) === stableJson(afterDeployments), 'staging changed a deployment or traffic');
  const beforeIds = new Set(before.map(version => version.id));
  const added = after.filter(version => !beforeIds.has(version.id));
  assert(added.length === 1, 'staging must create exactly one version');
  const staged = added[0]!;
  assert(newestSummary(after).id === staged.id, 'staged version must be the newest uploaded version');
  assert(staged.number === newestSummary(before).number + 1, 'staged version number must immediately follow the baseline');
  assert(staged.id !== expectedBaseline, 'staged version must differ from baseline');
  return staged.id;
}

export function validateStageOutcome(
  beforeSummariesValue: unknown,
  afterSummariesValue: unknown,
  beforeDeploymentsValue: unknown,
  afterDeploymentsValue: unknown,
  expectedBaseline: string,
  mutationOutcome: string,
): string {
  const before = parseVersionSummaries(beforeSummariesValue);
  const after = parseVersionSummaries(afterSummariesValue);
  const beforeDeployments = parseDeployments(beforeDeploymentsValue);
  const afterDeployments = parseDeployments(afterDeploymentsValue);
  const added = after.filter(version => !new Set(before.map(item => item.id)).has(version.id));
  reportObserved({ mutationOutcome, latest: newestSummary(after).id, active: activeVersion(afterDeployments), added: added.map(item => item.id) });
  assert(mutationOutcome === 'success', 'Wrangler staging command did not succeed');
  return identifyStagedVersion(before, after, beforeDeployments, afterDeployments, expectedBaseline);
}

export function validateStagedVersion(
  baselineValue: unknown,
  stagedValue: unknown,
  expectedBaseline: string,
  expectedStaged: string,
): void {
  const baseline = parseFullVersion(baselineValue);
  const staged = parseFullVersion(stagedValue);
  assert(baseline.id === expectedBaseline && staged.id === expectedStaged, 'version view identity mismatch');
  assert(expectedBaseline !== expectedStaged && staged.number > baseline.number, 'staged version sequence is invalid');
  assertProductionVersion(baseline);
  assertProductionVersion(staged);
  const baselineSecrets = secretNames(baseline);
  const stagedSecrets = secretNames(staged);
  assert(!baselineSecrets.includes(CCEL_OPERATOR_SECRET), 'baseline unexpectedly contains the operator secret');
  assert(stagedSecrets.filter(name => name === CCEL_OPERATOR_SECRET).length === 1, 'staged version must contain one operator secret binding');
  assert(stableJson(stagedSecrets.filter(name => name !== CCEL_OPERATOR_SECRET)) === stableJson(baselineSecrets), 'staging changed another secret binding name');
  assert(stableJson(nonSecretResources(staged)) === stableJson(nonSecretResources(baseline)), 'staged version changed code, compatibility settings, or a non-secret binding');
  assert(staged.annotations?.['workers/message'] === STAGED_MESSAGE, 'staged version message mismatch');
  assert(staged.annotations?.['workers/tag'] === STAGED_TAG, 'staged version tag mismatch');
}

export function validatePromotionBaseline(
  summariesValue: unknown,
  deploymentsValue: unknown,
  baselineValue: unknown,
  stagedValue: unknown,
  expectedBaseline: string,
  expectedStaged: string,
): void {
  const summaries = parseVersionSummaries(summariesValue);
  const deployments = parseDeployments(deploymentsValue);
  assert(newestSummary(summaries).id === expectedStaged, 'staged version is no longer the latest uploaded version');
  assert(activeVersion(deployments) === expectedBaseline, 'baseline is no longer the sole active 100% deployment');
  validateStagedVersion(baselineValue, stagedValue, expectedBaseline, expectedStaged);
}

export function validatePromotionResult(
  deploymentsValue: unknown,
  secretListValue: unknown,
  stagedValue: unknown,
  expectedStaged: string,
  mutationOutcome = 'success',
): void {
  const deployments = parseDeployments(deploymentsValue);
  const staged = parseFullVersion(stagedValue);
  assertProductionVersion(staged);
  const deployed = activeVersion(deployments);
  const secrets = parseSecretList(secretListValue);
  reportObserved({ mutationOutcome, active: deployed, secrets: secrets.map(item => item.name) });
  assert(mutationOutcome === 'success', 'Wrangler promotion command did not succeed');
  assert(deployed === expectedStaged && staged.id === expectedStaged, 'staged version was not promoted to 100%');
  assert(stableJson(secrets.map(item => item.name).sort()) === stableJson(secretNames(staged)), 'deployed secret metadata does not match the reviewed staged version');
  assert(secrets.some(item => item.name === CCEL_OPERATOR_SECRET), 'deployed Worker operator secret metadata is absent');
}

export function validateRollbackBaseline(
  summariesValue: unknown,
  deploymentsValue: unknown,
  currentValue: unknown,
  targetValue: unknown,
  expectedCurrent: string,
  expectedTarget: string,
): void {
  const summaries = parseVersionSummaries(summariesValue);
  const deployments = parseDeployments(deploymentsValue);
  const current = parseFullVersion(currentValue);
  const target = parseFullVersion(targetValue);
  assert(current.id === expectedCurrent && target.id === expectedTarget, 'rollback version view identity mismatch');
  assert(summaries.some(item => item.id === expectedTarget), 'rollback target is not in the deployable version window');
  assert(newestSummary(summaries).id === expectedCurrent, 'current version must remain the latest upload for rollback');
  assert(activeVersion(deployments) === expectedCurrent, 'expected current version is not the sole active 100% deployment');
  assertProductionVersion(current);
  assertProductionVersion(target);
  const targetSecrets = secretNames(target);
  const currentSecrets = secretNames(current);
  assert(!targetSecrets.includes(CCEL_OPERATOR_SECRET), 'rollback target must be secretless for the operator token');
  assert(stableJson(currentSecrets.filter(name => name !== CCEL_OPERATOR_SECRET)) === stableJson(targetSecrets)
    && currentSecrets.includes(CCEL_OPERATOR_SECRET), 'rollback would change a secret other than the operator token');
  assert(stableJson(nonSecretResources(current)) === stableJson(nonSecretResources(target)), 'rollback target differs in code, compatibility settings, or a non-secret binding');
}

export function validateRollbackResult(
  deploymentsValue: unknown,
  secretListValue: unknown,
  targetValue: unknown,
  expectedTarget: string,
  mutationOutcome = 'success',
): void {
  const deployments = parseDeployments(deploymentsValue);
  const target = parseFullVersion(targetValue);
  assertProductionVersion(target);
  const deployed = activeVersion(deployments);
  const secrets = parseSecretList(secretListValue);
  reportObserved({ mutationOutcome, active: deployed, secrets: secrets.map(item => item.name) });
  assert(mutationOutcome === 'success', 'Wrangler rollback command did not succeed');
  assert(deployed === expectedTarget && target.id === expectedTarget, 'rollback target was not deployed to 100%');
  assert(!secrets.some(item => item.name === CCEL_OPERATOR_SECRET), 'operator token remains active after rollback');
  assert(stableJson(secrets.map(item => item.name).sort()) === stableJson(secretNames(target)), 'deployed secrets do not match the reviewed rollback target');
}

function assertProductionVersion(version: FullVersion): void {
  const runtime = recordAt(version.resources, 'script_runtime');
  assert(runtime.compatibility_date === COMPATIBILITY_DATE
    && stableJson(runtime.compatibility_flags) === stableJson(COMPATIBILITY_FLAGS), 'version compatibility settings mismatch');
  const bindings = version.resources.bindings;
  assertUniqueNames(bindings, 'production version bindings');
  const d1 = binding(bindings, 'THEOLOGAI_DB', 'd1');
  assertExactKeys(d1, ['name', 'type', 'id'], 'version D1 binding');
  assert(d1.id === PRODUCTION_D1_ID, 'version D1 binding identity mismatch');
  const durable = binding(bindings, DO_BINDING.name, DO_BINDING.type);
  assertExactKeys(durable, ['name', 'type', 'class_name', 'script_name'], 'version Durable Object binding');
  assertRecordFields(durable, DO_BINDING, 'version Durable Object binding');
  assertRateLimitBinding(bindings, 'THEOLOGAI_RATE_LIMITER', '361201', 120);
  assertRateLimitBinding(bindings, 'THEOLOGAI_CCEL_OPERATOR_AUTH_LIMITER', '361203', 12);
  const versionMetadata = binding(bindings, 'CF_VERSION_METADATA', 'version_metadata');
  assertExactKeys(versionMetadata, ['name', 'type'], 'version metadata binding');
  for (const [name, expected] of Object.entries(PRODUCTION_VARS)) {
    const value = binding(bindings, name, 'plain_text');
    assertExactKeys(value, ['name', 'type', 'text'], `version ${name} binding`);
    assert(value.text === expected, `version ${name} binding mismatch`);
  }
}

function assertRateLimitBinding(bindings: JsonRecord[], name: string, namespace: string, limit: number): void {
  const value = binding(bindings, name, 'ratelimit');
  assertExactKeys(value, ['name', 'type', 'namespace_id', 'simple'], `version ${name} binding`);
  assert(value.namespace_id === namespace, `version ${name} namespace mismatch`);
  const simple = recordAt(value, 'simple');
  assertExactKeys(simple, ['limit', 'period'], `version ${name} policy`);
  assert(simple.limit === limit && simple.period === 60, `version ${name} policy mismatch`);
}

function binding(bindings: JsonRecord[], name: string, type: string): JsonRecord {
  const value = exactlyOne(bindings.filter(item => item.name === name), `${name} version binding`);
  assert(value.type === type, `${name} version binding type mismatch`);
  return value;
}

function nonSecretResources(version: FullVersion): JsonRecord {
  return {
    ...version.resources,
    bindings: version.resources.bindings
      .filter(value => value.type !== 'secret_text')
      .sort((left, right) => String(left.name).localeCompare(String(right.name))),
  };
}

function secretNames(version: FullVersion): string[] {
  return version.resources.bindings
    .filter(value => value.type === 'secret_text')
    .map(value => {
      assert(typeof value.name === 'string', 'secret binding name must be text');
      assertExactKeys(value, ['name', 'type'], 'version secret binding');
      return value.name;
    })
    .sort();
}

function parseVersionSummaries(value: unknown): VersionSummary[] {
  assert(Array.isArray(value) && value.length > 0, 'version summaries must be a nonempty array');
  const summaries = value.map((item, index) => parseVersionSummary(item, `version summary ${index}`));
  assert(new Set(summaries.map(item => item.id)).size === summaries.length, 'version summary identities must be unique');
  assert(new Set(summaries.map(item => item.number)).size === summaries.length, 'version summary sequence numbers must be unique');
  return summaries;
}

function parseVersionSummary(value: unknown, label: string): VersionSummary {
  const item = asRecord(value, label);
  assert(isUuid(item.id), `${label} identity must be a UUID`);
  assert(Number.isSafeInteger(item.number) && Number(item.number) > 0, `${label} sequence number is invalid`);
  const metadata = recordAt(item, 'metadata');
  assert(typeof metadata.created_on === 'string' && Number.isFinite(Date.parse(metadata.created_on)), `${label} created_on is invalid`);
  if (item.annotations !== undefined) asRecord(item.annotations, `${label} annotations`);
  assert(item.resources === undefined, `${label} must not be parsed as a full version view`);
  return item as unknown as VersionSummary;
}

function parseFullVersion(value: unknown): FullVersion {
  const item = asRecord(value, 'full version view');
  assert(isUuid(item.id), 'full version identity must be a UUID');
  assert(Number.isSafeInteger(item.number) && Number(item.number) > 0, 'full version sequence number is invalid');
  const metadata = recordAt(item, 'metadata');
  assert(typeof metadata.created_on === 'string' && Number.isFinite(Date.parse(metadata.created_on)), 'full version created_on is invalid');
  if (item.annotations !== undefined) asRecord(item.annotations, 'full version annotations');
  const resources = recordAt(item, 'resources');
  const bindings = arrayAt(resources, 'bindings').map((entry, index) => asRecord(entry, `full version binding ${index}`));
  return { ...(item as unknown as FullVersion), resources: { ...resources, bindings } };
}

function parseDeployments(value: unknown): Deployment[] {
  assert(Array.isArray(value) && value.length > 0, 'deployment list must be nonempty');
  return value.map((entry, index) => {
    const item = asRecord(entry, `deployment ${index}`);
    assert(isUuid(item.id), `deployment ${index} identity must be a UUID`);
    assert(typeof item.created_on === 'string' && Number.isFinite(Date.parse(item.created_on)), `deployment ${index} created_on is invalid`);
    const versions = arrayAt(item, 'versions').map((entryValue, versionIndex) => {
      const version = asRecord(entryValue, `deployment ${index} version ${versionIndex}`);
      assert(isUuid(version.version_id) && typeof version.percentage === 'number', `deployment ${index} traffic is invalid`);
      return version as { version_id: string; percentage: number };
    });
    assert(versions.length > 0, `deployment ${index} versions are empty`);
    return { id: item.id, created_on: item.created_on as string, versions };
  });
}

function parseSecretList(value: unknown): Array<{ name: string; type: string }> {
  assert(Array.isArray(value), 'secret list must be an array');
  return value.map((entry, index) => {
    const item = asRecord(entry, `secret metadata ${index}`);
    assertExactKeys(item, ['name', 'type'], `secret metadata ${index}`);
    assert(typeof item.name === 'string' && item.type === 'secret_text', `secret metadata ${index} is invalid`);
    return { name: item.name, type: item.type };
  });
}

function newestSummary(versions: VersionSummary[]): VersionSummary {
  return [...versions].sort((left, right) => left.number - right.number).at(-1)!;
}

function activeVersion(deployments: Deployment[]): string {
  const latest = [...deployments].sort((left, right) => left.created_on.localeCompare(right.created_on)).at(-1)!;
  assert(latest.versions.length === 1 && latest.versions[0]?.percentage === 100, 'latest deployment must contain one version at 100%');
  return latest.versions[0]!.version_id;
}

function parseTomlRecord(text: string, label: string): JsonRecord {
  try {
    return asRecord(parseToml(text), label);
  } catch (error) {
    throw new Error(`CCEL operator-secret release refused: ${label} is not valid TOML (${error instanceof Error ? error.message : 'unknown parser error'}).`);
  }
}

function recordAt(value: JsonRecord, key: string): JsonRecord {
  return asRecord(value[key], key);
}

function arrayAt(value: JsonRecord, key: string): unknown[] {
  const result = value[key];
  assert(Array.isArray(result), `${key} must be an array`);
  return result;
}

function asRecord(value: unknown, label: string): JsonRecord {
  assert(isRecord(value), `${label} must be an object`);
  return value;
}

function onlyRecord(values: unknown[], label: string): JsonRecord {
  assert(values.length === 1, `${label} must be unique`);
  return asRecord(values[0], label);
}

function exactlyOne<T>(values: T[], label: string): T {
  assert(values.length === 1, `${label} must be unique`);
  return values[0]!;
}

function assertUniqueNames(values: JsonRecord[], label: string): void {
  const names = values.map(value => value.name);
  assert(names.every(name => typeof name === 'string'), `${label} names must be strings`);
  assert(new Set(names).size === names.length, `${label} names must be unique`);
}

function assertRecordFields(actual: JsonRecord, expected: JsonRecord, label: string): void {
  for (const [key, value] of Object.entries(expected)) assert(actual[key] === value, `${label} ${key} mismatch`);
}

function assertExactKeys(value: JsonRecord, keys: string[], label: string): void {
  assert(Object.keys(value).sort().join(',') === [...keys].sort().join(','), `${label} must contain exactly the authorized keys`);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, nested) => isRecord(nested)
    ? Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)))
    : nested);
}

function reportObserved(value: JsonRecord): void {
  process.stderr.write(`Observed Cloudflare state: ${stableJson(value)}\n`);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSha(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`CCEL operator-secret release refused: ${message}.`);
}

function parseCli(argv: string[]): { command: string; args: Map<string, string> } {
  const command = argv[0];
  assert(typeof command === 'string' && !command.startsWith('--'), 'command is missing');
  const args = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    assert(key?.startsWith('--') && value !== undefined && !args.has(key), 'arguments are invalid or duplicated');
    args.set(key, value);
  }
  return { command, args };
}

function exactArgs(args: Map<string, string>, keys: string[]): void {
  assert([...args.keys()].every(key => keys.includes(key)) && args.size === keys.length, 'unexpected or missing argument');
}

function file(args: Map<string, string>, key: string): unknown {
  return JSON.parse(readFileSync(required(args, key), 'utf8')) as unknown;
}

function textFile(args: Map<string, string>, key: string): string {
  return readFileSync(required(args, key), 'utf8');
}

function required(args: Map<string, string>, key: string): string {
  const value = args.get(key);
  assert(value !== undefined, `${key} is required`);
  return value;
}

export function runCli(argv: string[]): void {
  const { command, args } = parseCli(argv);
  if (command === 'validate-token') {
    exactArgs(args, []);
    validateOperatorToken(process.env[CCEL_OPERATOR_SECRET]);
    return;
  }
  if (command === 'validate-account') {
    exactArgs(args, ['--expected']);
    validateAccount(required(args, '--expected'), process.env.CLOUDFLARE_ACCOUNT_ID);
    return;
  }
  if (command === 'validate-dispatch') {
    const common = ['--action', '--ref', '--sha', '--expected-sha', '--live-main-sha', '--expected-account', '--baseline', '--confirmation', '--execute', '--config', '--release-config'];
    const action = required(args, '--action');
    const keys = action === 'promote' ? [...common, '--staged'] : action === 'rollback' ? [...common, '--current'] : common;
    exactArgs(args, keys);
    assert(action === 'stage' || action === 'promote' || action === 'rollback', 'action must be stage, promote, or rollback');
    const executeText = required(args, '--execute');
    assert(executeText === 'true' || executeText === 'false', 'execute must be true or false');
    validateDispatch({
      action, ref: required(args, '--ref'), sha: required(args, '--sha'),
      expectedSha: required(args, '--expected-sha'), liveMainSha: required(args, '--live-main-sha'),
      expectedAccountId: required(args, '--expected-account'), baselineVersion: required(args, '--baseline'),
      ...(action === 'promote' ? { stagedVersion: required(args, '--staged') } : {}),
      ...(action === 'rollback' ? { currentVersion: required(args, '--current') } : {}),
      confirmation: required(args, '--confirmation'), execute: executeText === 'true',
      configText: textFile(args, '--config'), releaseConfigText: textFile(args, '--release-config'),
    });
    return;
  }
  if (command === 'validate-stage-baseline') {
    exactArgs(args, ['--versions', '--deployments', '--baseline-view', '--expected-baseline']);
    validateStageBaseline(file(args, '--versions'), file(args, '--deployments'), file(args, '--baseline-view'), required(args, '--expected-baseline'));
    return;
  }
  if (command === 'validate-stage-outcome') {
    exactArgs(args, ['--before-versions', '--after-versions', '--before-deployments', '--after-deployments', '--expected-baseline', '--mutation-outcome']);
    process.stdout.write(validateStageOutcome(
      file(args, '--before-versions'), file(args, '--after-versions'), file(args, '--before-deployments'),
      file(args, '--after-deployments'), required(args, '--expected-baseline'), required(args, '--mutation-outcome'),
    ));
    return;
  }
  if (command === 'validate-staged') {
    exactArgs(args, ['--baseline-view', '--staged-view', '--expected-baseline', '--expected-staged']);
    validateStagedVersion(file(args, '--baseline-view'), file(args, '--staged-view'), required(args, '--expected-baseline'), required(args, '--expected-staged'));
    return;
  }
  if (command === 'validate-promotion-baseline') {
    exactArgs(args, ['--versions', '--deployments', '--baseline-view', '--staged-view', '--expected-baseline', '--expected-staged']);
    validatePromotionBaseline(file(args, '--versions'), file(args, '--deployments'), file(args, '--baseline-view'), file(args, '--staged-view'), required(args, '--expected-baseline'), required(args, '--expected-staged'));
    return;
  }
  if (command === 'validate-promotion-result') {
    exactArgs(args, ['--deployments', '--secret-list', '--staged-view', '--expected-staged', '--mutation-outcome']);
    validatePromotionResult(file(args, '--deployments'), file(args, '--secret-list'), file(args, '--staged-view'), required(args, '--expected-staged'), required(args, '--mutation-outcome'));
    return;
  }
  if (command === 'validate-rollback-baseline') {
    exactArgs(args, ['--versions', '--deployments', '--current-view', '--target-view', '--expected-current', '--expected-target']);
    validateRollbackBaseline(file(args, '--versions'), file(args, '--deployments'), file(args, '--current-view'), file(args, '--target-view'), required(args, '--expected-current'), required(args, '--expected-target'));
    return;
  }
  if (command === 'validate-rollback-result') {
    exactArgs(args, ['--deployments', '--secret-list', '--target-view', '--expected-target', '--mutation-outcome']);
    validateRollbackResult(file(args, '--deployments'), file(args, '--secret-list'), file(args, '--target-view'), required(args, '--expected-target'), required(args, '--mutation-outcome'));
    return;
  }
  throw new Error(`Unknown CCEL operator-secret release command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) runCli(process.argv.slice(2));
