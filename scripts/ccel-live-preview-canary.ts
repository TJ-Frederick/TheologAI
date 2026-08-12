/**
 * Fail-closed checks for the manually authorized, temporary CCEL preview canary.
 *
 * This program never calls Cloudflare.  Workflows supply JSON emitted by Wrangler
 * and use its outputs only after every exact-state check has succeeded.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';

export const CANARY_CONFIRMATION = 'I AUTHORIZE THE TEMPORARY CCEL LIVE PREVIEW CANARY';
export const CANARY_MESSAGE = 'Temporary preview-only CCEL live canary; always restore exact predecessor';
export const CANARY_TAG = 'ccel-live-preview-canary';
export const OPERATOR_TOKEN = 'THEOLOGAI_CCEL_OPERATOR_TOKEN';
export const ACCOUNT_WIDE_WORKERS_WRITE_ACK =
  'I ACCEPT ACCOUNT-WIDE WORKERS SCRIPT WRITE FOR THIS CCEL CANARY TRANSACTION';
export const PRODUCTION_BASE_SECRET_BINDINGS =
  ['AUTH_TOKEN', 'ESV_API_KEY', 'SBC_FACILITATOR_API_KEY'] as const;

/**
 * These are the retained Transform-11 / schema-0008 D1 identities.  They are
 * deployment history, not current-main canary baselines.  Keep the rejection
 * literal: a later schema-0009 release must deliberately replace this hard
 * inert gate with reviewed candidate identities and retained readiness evidence.
 */
export const LEGACY_SCHEMA_0008_D1 = {
  production: {
    name: 'theologai-production-20260729-transform11-a',
    id: '53211f50-a893-4b4c-be1e-bc625a595dc7',
  },
  preview: {
    name: 'theologai-preview-20260728-transform11-a',
    id: '62b871a6-5b4d-4d9b-8f52-301f6c878f48',
  },
} as const;

/**
 * No schema-0009 candidates have been prepared and audited yet.  The canary
 * workflow calls this local gate before its first Wrangler command, so an
 * accidental dispatch cannot turn the historical schema-0008 pair into a
 * live canary baseline. A future release must replace this sentinel with a
 * `ready` branch containing exact candidate identities and pinned evidence.
 */
export interface Schema0009Evidence {
  identity: string;
  sha256: string;
}

export interface Schema0009CanaryEnvironmentGate {
  databaseName: string;
  databaseId: string;
  readinessEvidence: Schema0009Evidence;
  authorityEvidence: Schema0009Evidence;
}

export type Schema0009CanaryGate =
  | {
    state: 'unrecorded';
    requiredSchema: '0009_candidate_c_sectioned_publications';
  }
  | {
    state: 'ready';
    requiredSchema: '0009_candidate_c_sectioned_publications';
    preview: Schema0009CanaryEnvironmentGate;
    production: Schema0009CanaryEnvironmentGate;
    environmentIsolationEvidence: Schema0009Evidence;
  };

const SCHEMA_0009 = '0009_candidate_c_sectioned_publications';
const LEGACY_SCHEMA_0008_D1_IDS = new Set<string>([
  LEGACY_SCHEMA_0008_D1.production.id,
  LEGACY_SCHEMA_0008_D1.preview.id,
]);
const LEGACY_SCHEMA_0008_D1_NAMES = new Set<string>([
  LEGACY_SCHEMA_0008_D1.production.name,
  LEGACY_SCHEMA_0008_D1.preview.name,
]);

export const SCHEMA_0009_CANARY_GATE: Schema0009CanaryGate = {
  state: 'unrecorded',
  requiredSchema: SCHEMA_0009,
};

const PRODUCTION = {
  worker: 'theologai', route: 'mcp.theologai.xyz',
  d1Name: 'theologai-production-20260811-schema0009-a', d1: '9bc79346-338b-439e-a2a5-424f4418eb21',
  requestNamespace: '361201', operatorNamespace: '361203', version: '3.6.0',
  discovery: 'false', live: 'false', coordinator: 'false', logs: 'false',
};
const PREVIEW = {
  worker: 'theologai-preview', route: 'preview-mcp.theologai.xyz',
  d1Name: 'theologai-preview-20260811-schema0009-a', d1: '74f456e2-6951-4003-bb6f-91951342bf8f',
  requestNamespace: '361202', operatorNamespace: '361204', version: '3.6.0-preview',
  discovery: 'true', live: 'false', coordinator: 'false', logs: 'true',
};
const COMPATIBILITY_DATE = '2026-07-09';
const COMPATIBILITY_FLAGS = ['nodejs_compat'];
const DO = { name: 'THEOLOGAI_CCEL_COORDINATOR', type: 'durable_object_namespace', class_name: 'CcelGlobalCoordinator', script_name: 'theologai-ccel-coordinator' };

type JsonRecord = Record<string, unknown>;
type VersionSummary = { id: string; number: number; metadata: { created_on: string }; annotations?: Record<string, string> };
type FullVersion = VersionSummary & { resources: JsonRecord & { bindings: JsonRecord[] } };
type Deployment = { id: string; created_on: string; versions: Array<{ version_id: string; percentage: number }> };
type Mode = '100' | '111' | '000';

export interface DispatchInput {
  ref: string;
  sha: string;
  expectedSha: string;
  liveMainSha: string;
  confirmation: string;
  configText: string;
}

export interface CanaryInputs {
  previewPredecessor: string;
  productionControl: string;
}

/** The workflow must be manually dispatched from the current main commit. */
export function validateCanaryDispatch(input: DispatchInput): void {
  refuse(input.ref === 'refs/heads/main', 'dispatch must use refs/heads/main');
  refuse(isSha(input.sha) && input.sha === input.expectedSha, 'expected main SHA must equal the dispatched SHA');
  refuse(isSha(input.liveMainSha) && input.liveMainSha === input.sha, 'dispatched SHA must still be the live main SHA');
  refuse(input.confirmation === CANARY_CONFIRMATION, 'confirmation must match exactly');
  const gate = validateSchema0009CanaryGate(SCHEMA_0009_CANARY_GATE);
  assertCommittedConfig(input.configText, gate);
  assertSchema0009CanaryPrerequisite(input.configText, gate);
}

/**
 * The deliberately inert schema-0009 release gate.  It is intentionally
 * separate from general config validation so recovery can still inspect a
 * historical config, while a new canary upload cannot begin from one.
 */
export function assertSchema0009CanaryPrerequisite(configText: string, gate: unknown = SCHEMA_0009_CANARY_GATE): void {
  const reviewedGate = validateSchema0009CanaryGate(gate);
  const root = parseConfig(configText);
  const preview = recordAt(recordAt(root, 'env'), 'preview');
  const productionD1 = configuredD1(root, 'production');
  const previewD1 = configuredD1(preview, 'preview');

  assertNotLegacySchema0008D1(productionD1.database_name, productionD1.database_id, 'production');
  assertNotLegacySchema0008D1(previewD1.database_name, previewD1.database_id, 'preview');
  refuse(
    reviewedGate.state === 'ready',
    'schema-0009 canary gate is unrecorded: prepare and audit separate preview and production candidates before enabling this workflow',
  );
  assertSchema0009EnvironmentMatch(productionD1, reviewedGate.production, 'production');
  assertSchema0009EnvironmentMatch(previewD1, reviewedGate.preview, 'preview');
}

/**
 * Parse the future release record defensively even though checked-in TypeScript
 * makes incomplete `ready` literals a compile error. This also protects the
 * command boundary from a malformed JavaScript import or future refactor.
 */
export function validateSchema0009CanaryGate(value: unknown): Schema0009CanaryGate {
  const gate = asRecord(value, 'schema-0009 canary gate');
  refuse(gate.requiredSchema === SCHEMA_0009, 'schema-0009 canary gate schema mismatch');
  if (gate.state === 'unrecorded') {
    exactKeys(gate, ['state', 'requiredSchema'], 'unrecorded schema-0009 canary gate');
    return gate as Schema0009CanaryGate;
  }
  refuse(gate.state === 'ready', 'schema-0009 canary gate state is invalid');
  exactKeys(gate, ['state', 'requiredSchema', 'preview', 'production', 'environmentIsolationEvidence'], 'ready schema-0009 canary gate');
  const preview = parseSchema0009EnvironmentGate(gate.preview, 'preview');
  const production = parseSchema0009EnvironmentGate(gate.production, 'production');
  const environmentIsolationEvidence = parseSchema0009Evidence(gate.environmentIsolationEvidence, 'environment isolation');
  assertNotLegacySchema0008D1(preview.databaseName, preview.databaseId, 'ready preview');
  assertNotLegacySchema0008D1(production.databaseName, production.databaseId, 'ready production');
  refuse(
    preview.databaseName !== production.databaseName && preview.databaseId !== production.databaseId,
    'ready schema-0009 canary gate must use distinct preview and production D1 identities',
  );
  return { state: 'ready', requiredSchema: SCHEMA_0009, preview, production, environmentIsolationEvidence };
}

/** Reject all user-supplied Worker IDs before a workflow calls Wrangler. */
export function validateCanaryInputs(input: CanaryInputs): void {
  refuse(isUuid(input.previewPredecessor), 'preview predecessor must be an exact UUID');
  refuse(isUuid(input.productionControl), 'production control must be an exact UUID');
  refuse(input.previewPredecessor !== input.productionControl, 'preview predecessor and production control must differ');
}

/** The dedicated environment must be explicitly provisioned outside this repo. */
export function validateCanaryCredentials(
  marker: unknown, accountWideWriteAck: unknown, cloudflareToken: unknown, operatorToken: unknown,
): void {
  refuse(marker === 'CCEL_CANARY_CREDENTIALS_CONFIGURED', 'dedicated ccel-canary credentials are not provisioned');
  refuse(accountWideWriteAck === ACCOUNT_WIDE_WORKERS_WRITE_ACK,
    'account-wide Workers Script Write scope has not been explicitly acknowledged for this transaction');
  refuse(typeof cloudflareToken === 'string' && cloudflareToken.length > 0, 'dedicated Cloudflare token is absent');
  refuse(typeof operatorToken === 'string' && operatorToken.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(operatorToken),
    'dedicated operator token is absent or malformed');
}

export function validateEmergencyCredentials(marker: unknown, accountWideWriteAck: unknown, cloudflareToken: unknown): void {
  refuse(marker === 'CCEL_CANARY_CREDENTIALS_CONFIGURED', 'dedicated ccel-canary credentials are not provisioned');
  refuse(accountWideWriteAck === ACCOUNT_WIDE_WORKERS_WRITE_ACK,
    'account-wide Workers Script Write scope has not been explicitly acknowledged for this transaction');
  refuse(typeof cloudflareToken === 'string' && cloudflareToken.length > 0, 'dedicated Cloudflare token is absent');
}

/** Emergency recovery receives no production ID, but it still validates both inputs before Wrangler. */
export function validateEmergencyInputs(ref: string, current: string, target: string, confirmation: string, configText: string): void {
  refuse(ref === 'refs/heads/main', 'emergency restore must use refs/heads/main');
  refuse(confirmation === 'RESTORE THE EXACT CCEL PREVIEW PREDECESSOR', 'emergency confirmation must match exactly');
  refuse(isUuid(current) && isUuid(target), 'emergency restore IDs must be exact UUIDs');
  assertCommittedConfig(configText);
}

/**
 * Produces a throwaway config with only preview live/coordinator flags changed.
 * It is deliberately an output file, never a tracked configuration edit.
 */
export function renderCanaryPreviewConfig(configText: string, gate: unknown = SCHEMA_0009_CANARY_GATE): string {
  assertCommittedConfig(configText, gate);
  const start = configText.indexOf('[env.preview.vars]');
  const end = configText.indexOf('\n[', start + 1);
  refuse(start >= 0 && end > start, 'preview vars section is missing or ambiguous');
  const before = configText.slice(0, start);
  const section = configText.slice(start, end);
  const after = configText.slice(end);
  const changed = section
    .replace('THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH = "false"', 'THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH = "true"')
    .replace('THEOLOGAI_ENABLE_CCEL_COORDINATOR = "false"', 'THEOLOGAI_ENABLE_CCEL_COORDINATOR = "true"');
  refuse(changed !== section, 'canary flags were not found exactly once');
  const rendered = `${before}${changed}${after}`;
  assertCanaryConfig(rendered, gate);
  return rendered;
}

/**
 * Check the exact 100 baseline. Operations must separately establish that this
 * predecessor was refreshed from current main; version JSON cannot prove Git
 * revision identity by itself. Its authoritative script etag is also required
 * before the transaction can upload a candidate.
 */
export function validatePreviewBaseline(
  configText: string, deploymentsValue: unknown, versionValue: unknown, expectedVersion: string, gate: unknown = SCHEMA_0009_CANARY_GATE,
): FullVersion {
  const reviewedGate = validateSchema0009CanaryGate(gate);
  assertCommittedConfig(configText, reviewedGate);
  refuse(isUuid(expectedVersion), 'expected preview predecessor must be an exact UUID');
  const version = parseFullVersion(versionValue);
  refuse(version.id === expectedVersion, 'preview predecessor view identity mismatch');
  refuse(activeVersion(parseDeployments(deploymentsValue)) === expectedVersion, 'preview predecessor is not the sole 100% deployment');
  assertVersion(version, '100', false, reviewedGate);
  scriptEtag(version, 'preview predecessor');
  return version;
}

/** Production is read-only control evidence and must remain v6 / flags 000. */
export function validateProductionControl(
  configText: string, deploymentsValue: unknown, versionValue: unknown, expectedVersion: string, gate: unknown = SCHEMA_0009_CANARY_GATE,
): FullVersion {
  const reviewedGate = validateSchema0009CanaryGate(gate);
  assertCommittedConfig(configText, reviewedGate);
  refuse(isUuid(expectedVersion), 'expected production control must be an exact UUID');
  const version = parseFullVersion(versionValue);
  refuse(version.id === expectedVersion, 'production control view identity mismatch');
  refuse(activeVersion(parseDeployments(deploymentsValue)) === expectedVersion, 'production control is not the sole 100% deployment');
  assertVersion(version, '000', true, reviewedGate);
  return version;
}

/** Validate the exact sanitized production binding inventory independently of canary readiness. */
export function validateProductionBindingInventory(versionValue: unknown, gate: unknown = SCHEMA_0009_CANARY_GATE): { operatorReady: boolean } {
  const reviewedGate = validateSchema0009CanaryGate(gate);
  const version = parseFullVersion(versionValue);
  return { operatorReady: assertVersion(version, '000', false, reviewedGate) };
}

/** Uploading must add exactly one undeployed immediately-next version. */
export function identifyCanaryUpload(
  beforeVersionsValue: unknown, afterVersionsValue: unknown,
  beforeDeploymentsValue: unknown, afterDeploymentsValue: unknown, expectedBaseline: string,
): string {
  const before = parseVersionSummaries(beforeVersionsValue);
  const after = parseVersionSummaries(afterVersionsValue);
  const beforeDeployments = parseDeployments(beforeDeploymentsValue);
  const afterDeployments = parseDeployments(afterDeploymentsValue);
  refuse(newest(before).id === expectedBaseline, 'pre-upload latest preview version drifted');
  refuse(activeVersion(beforeDeployments) === expectedBaseline, 'pre-upload active preview version drifted');
  refuse(stableJson(beforeDeployments) === stableJson(afterDeployments), 'upload changed a deployment or traffic allocation');
  const beforeIds = new Set(before.map(item => item.id));
  const added = after.filter(item => !beforeIds.has(item.id));
  refuse(added.length === 1, 'upload must create exactly one version');
  const canary = added[0]!;
  refuse(canary.id !== expectedBaseline && newest(after).id === canary.id, 'canary must be the newest version');
  refuse(canary.number === newest(before).number + 1, 'canary version number must immediately follow predecessor');
  return canary.id;
}

/**
 * The uploaded candidate may differ from the separately refreshed current-main
 * predecessor in exactly two flags; code/resource drift remains forbidden.
 */
export function validateCanaryVersion(
  configText: string, baselineValue: unknown, canaryValue: unknown, expectedBaseline: string, expectedCanary: string, gate: unknown = SCHEMA_0009_CANARY_GATE,
): void {
  const reviewedGate = validateSchema0009CanaryGate(gate);
  assertCommittedConfig(configText, reviewedGate);
  const baseline = parseFullVersion(baselineValue);
  const canary = parseFullVersion(canaryValue);
  refuse(baseline.id === expectedBaseline && canary.id === expectedCanary, 'canary version identity mismatch');
  refuse(isUuid(expectedBaseline) && isUuid(expectedCanary) && expectedBaseline !== expectedCanary, 'canary and predecessor IDs must be distinct UUIDs');
  refuse(canary.number > baseline.number, 'canary version sequence is invalid');
  assertVersion(baseline, '100', false, reviewedGate);
  assertVersion(canary, '111', false, reviewedGate);
  const baselineScriptEtag = scriptEtag(baseline, 'preview predecessor');
  const canaryScriptEtag = scriptEtag(canary, 'canary');
  refuse(baselineScriptEtag === canaryScriptEtag,
    'canary changed code: authoritative resources.script.etag mismatch');
  refuse(canary.annotations?.['workers/message'] === CANARY_MESSAGE, 'canary version message mismatch');
  refuse(canary.annotations?.['workers/tag'] === CANARY_TAG, 'canary version tag mismatch');
  refuse(stableJson(resourcesWithoutCanaryFlags(baseline)) === stableJson(resourcesWithoutCanaryFlags(canary)),
    'canary changed code, compatibility, a binding, or an unrelated variable');
}

export function validateCanaryDeployment(
  configText: string, deploymentsValue: unknown, canaryValue: unknown, expectedCanary: string, gate: unknown = SCHEMA_0009_CANARY_GATE,
): void {
  const reviewedGate = validateSchema0009CanaryGate(gate);
  assertCommittedConfig(configText, reviewedGate);
  const canary = parseFullVersion(canaryValue);
  refuse(canary.id === expectedCanary && isUuid(expectedCanary), 'canary deployment identity is invalid');
  refuse(activeVersion(parseDeployments(deploymentsValue)) === expectedCanary, 'canary is not the sole 100% preview deployment');
  assertVersion(canary, '111', false, reviewedGate);
  scriptEtag(canary, 'canary');
}

/**
 * Refuse to overwrite any unexpected deployment.  Returning `already` proves
 * that repeated recovery calls are harmless; returning `deploy` authorizes one
 * `wrangler versions deploy <target>@100 --env preview` command.
 */
export function planRestore(
  configText: string, deploymentsValue: unknown, currentValue: unknown, targetValue: unknown,
  expectedCurrent: string, expectedTarget: string, gate: unknown = SCHEMA_0009_CANARY_GATE,
): 'already' | 'deploy' {
  const reviewedGate = validateSchema0009CanaryGate(gate);
  assertCommittedConfig(configText, reviewedGate);
  refuse(isUuid(expectedCurrent) && isUuid(expectedTarget), 'restore IDs must be exact UUIDs');
  const current = parseFullVersion(currentValue);
  const target = parseFullVersion(targetValue);
  refuse(target.id === expectedTarget, 'restore target view identity mismatch');
  const active = activeVersion(parseDeployments(deploymentsValue));
  assertVersion(target, '100', false, reviewedGate);
  const targetScriptEtag = scriptEtag(target, 'restore target');
  if (active === expectedTarget) {
    refuse(expectedCurrent === expectedTarget && current.id === expectedTarget, 'active baseline view identity mismatch');
    assertVersion(current, '100', false, reviewedGate);
    refuse(scriptEtag(current, 'active restore baseline') === targetScriptEtag,
      'restore baseline code identity mismatch');
    return 'already';
  }
  refuse(expectedCurrent !== expectedTarget, 'restore candidate and target IDs must differ');
  refuse(active === expectedCurrent && current.id === expectedCurrent, 'active preview version is not the authorized canary');
  assertVersion(current, '111', false, reviewedGate);
  refuse(scriptEtag(current, 'active canary') === targetScriptEtag,
    'restore would overwrite a preview code change');
  refuse(current.annotations?.['workers/tag'] === CANARY_TAG, 'active preview version is not the tagged canary');
  refuse(stableJson(resourcesWithoutCanaryFlags(target)) === stableJson(resourcesWithoutCanaryFlags(current)),
    'restore would overwrite a preview change beyond the two canary flags');
  return 'deploy';
}

export function validateRestoreResult(
  configText: string, deploymentsValue: unknown, targetValue: unknown, expectedTarget: string, gate: unknown = SCHEMA_0009_CANARY_GATE,
): void {
  const reviewedGate = validateSchema0009CanaryGate(gate);
  assertCommittedConfig(configText, reviewedGate);
  const target = parseFullVersion(targetValue);
  refuse(target.id === expectedTarget && isUuid(expectedTarget), 'restore target identity is invalid');
  refuse(activeVersion(parseDeployments(deploymentsValue)) === expectedTarget, 'exact preview predecessor was not restored to 100%');
  assertVersion(target, '100', false, reviewedGate);
  scriptEtag(target, 'restored preview predecessor');
}

/** Sanitized evidence deliberately permits only identifiers, booleans and hashes. */
export function sanitizedCanaryEvidence(input: {
  commit: string; predecessor: string; canary: string; productionControl: string; auditSha256: string;
  auditOutcome: 'success' | 'failure'; restored: boolean;
}): Record<string, string | boolean> {
  refuse(isSha(input.commit), 'evidence commit must be a full SHA');
  for (const [name, value] of Object.entries({ predecessor: input.predecessor, canary: input.canary, productionControl: input.productionControl })) {
    refuse(isUuid(value), `evidence ${name} must be an exact UUID`);
  }
  refuse(input.predecessor !== input.canary, 'evidence predecessor and canary must differ');
  refuse(/^[a-f0-9]{64}$/.test(input.auditSha256), 'evidence audit hash must be lowercase SHA-256');
  return {
    schemaVersion: '1', commit: input.commit, predecessorVersionId: input.predecessor,
    canaryVersionId: input.canary, productionControlVersionId: input.productionControl,
    auditOutcome: input.auditOutcome, auditSha256: input.auditSha256, restored: input.restored,
    privacy: 'identifiers_hashes_and_booleans_only',
  };
}

export function assertCommittedConfig(configText: string, gate: unknown = SCHEMA_0009_CANARY_GATE): void {
  const reviewedGate = validateSchema0009CanaryGate(gate);
  const { production, preview } = expectedSchema0009Environments(reviewedGate);
  refuse(!configText.includes(OPERATOR_TOKEN), 'operator token must never be stored in Wrangler config');
  const root = parseConfig(configText);
  assertEnvironment(root, production, '000');
  const previewConfig = recordAt(recordAt(root, 'env'), 'preview');
  assertEnvironment(previewConfig, preview, '100');
  refuse(preview.d1 !== production.d1 && preview.d1Name !== production.d1Name,
    'preview and production D1 identities must differ');
  refuse(PREVIEW.requestNamespace !== PRODUCTION.requestNamespace && PREVIEW.operatorNamespace !== PRODUCTION.operatorNamespace,
    'preview and production rate-limit namespaces must differ');
}

export function assertCanaryConfig(configText: string, gate: unknown = SCHEMA_0009_CANARY_GATE): void {
  const reviewedGate = validateSchema0009CanaryGate(gate);
  const { production, preview } = expectedSchema0009Environments(reviewedGate);
  refuse(!configText.includes(OPERATOR_TOKEN), 'operator token must never be stored in canary config');
  const root = parseConfig(configText);
  assertEnvironment(root, production, '000');
  const previewConfig = recordAt(recordAt(root, 'env'), 'preview');
  assertEnvironment(previewConfig, { ...preview, live: 'true', coordinator: 'true' }, '111');
}

function expectedSchema0009Environments(gate: Schema0009CanaryGate): { production: typeof PRODUCTION; preview: typeof PREVIEW } {
  if (gate.state === 'ready') {
    return {
      production: { ...PRODUCTION, d1Name: gate.production.databaseName, d1: gate.production.databaseId },
      preview: { ...PREVIEW, d1Name: gate.preview.databaseName, d1: gate.preview.databaseId },
    };
  }
  return { production: PRODUCTION, preview: PREVIEW };
}

function assertEnvironment(config: JsonRecord, expected: typeof PREVIEW, mode: Mode): void {
  refuse(config.name === expected.worker, `${expected.worker} Worker name mismatch`);
  const inheritedMain = expected.worker === PRODUCTION.worker;
  if (inheritedMain) {
    refuse(config.main === 'src/worker.ts' && config.compatibility_date === COMPATIBILITY_DATE
      && stableJson(config.compatibility_flags) === stableJson(COMPATIBILITY_FLAGS), 'production compatibility settings mismatch');
  }
  const routes = arrayAt(config, 'routes').map((entry, index) => asRecord(entry, `route ${index}`));
  refuse(routes.length === 1 && routes[0]?.pattern === expected.route && routes[0]?.custom_domain === true,
    `${expected.worker} canonical custom-domain route mismatch`);
  const metadata = recordAt(config, 'version_metadata');
  exactKeys(metadata, ['binding'], `${expected.worker} version metadata`);
  refuse(metadata.binding === 'CF_VERSION_METADATA', `${expected.worker} version metadata binding mismatch`);
  const vars = recordAt(config, 'vars');
  const expectedVars: Record<string, string> = {
    THEOLOGAI_VERSION: expected.version,
    THEOLOGAI_ALLOWED_ORIGINS: 'https://theologai.xyz,https://theologai.pages.dev',
    THEOLOGAI_MAX_REQUEST_BYTES: '1048576',
    THEOLOGAI_REQUEST_LOGS: expected.logs,
    THEOLOGAI_EXPOSE_CCEL_DISCOVERY: expected.discovery,
    THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: expected.live,
    THEOLOGAI_ENABLE_CCEL_COORDINATOR: expected.coordinator,
  };
  exactKeys(vars, Object.keys(expectedVars), `${expected.worker} vars`);
  for (const [key, value] of Object.entries(expectedVars)) refuse(vars[key] === value, `${expected.worker} ${key} mismatch`);
  const d1 = configuredD1(config, expected.worker);
  exactKeys(d1, ['binding', 'database_name', 'database_id', 'migrations_dir'], `${expected.worker} D1 binding`);
  refuse(d1.binding === 'THEOLOGAI_DB' && d1.database_name === expected.d1Name
    && d1.database_id === expected.d1 && d1.migrations_dir === 'migrations', `${expected.worker} D1 binding mismatch`);
  const durable = only(arrayAt(recordAt(config, 'durable_objects'), 'bindings').map((entry, index) => asRecord(entry, `DO ${index}`)), `${expected.worker} DO binding`);
  exactKeys(durable, ['name', 'class_name', 'script_name'], `${expected.worker} DO binding`);
  for (const [key, value] of Object.entries({ name: DO.name, class_name: DO.class_name, script_name: DO.script_name })) {
    refuse(durable[key] === value, `${expected.worker} DO binding mismatch`);
  }
  const limits = arrayAt(config, 'ratelimits').map((entry, index) => asRecord(entry, `rate limit ${index}`));
  refuse(limits.length === 2, `${expected.worker} must define exactly two rate-limit bindings`);
  assertConfigRate(limits, 'THEOLOGAI_RATE_LIMITER', expected.requestNamespace, 120);
  assertConfigRate(limits, 'THEOLOGAI_CCEL_OPERATOR_AUTH_LIMITER', expected.operatorNamespace, 12);
  uniqueNames([{ name: d1.binding }, durable, ...limits, { name: metadata.binding }], `${expected.worker} critical bindings`);
  if (mode === '000') refuse(expected.live === 'false' && expected.coordinator === 'false' && expected.discovery === 'false', 'production flags must remain 000');
}

function configuredD1(config: JsonRecord, label: string): JsonRecord & { database_name: string; database_id: string } {
  const d1 = only(arrayAt(config, 'd1_databases').map((entry, index) => asRecord(entry, `D1 ${index}`)), `${label} D1 binding`);
  exactKeys(d1, ['binding', 'database_name', 'database_id', 'migrations_dir'], `${label} D1 binding`);
  refuse(typeof d1.database_name === 'string' && typeof d1.database_id === 'string', `${label} D1 identity is invalid`);
  return d1 as JsonRecord & { database_name: string; database_id: string };
}

function parseSchema0009EnvironmentGate(value: unknown, label: string): Schema0009CanaryEnvironmentGate {
  const environment = asRecord(value, `${label} schema-0009 canary gate`);
  exactKeys(environment, ['databaseName', 'databaseId', 'readinessEvidence', 'authorityEvidence'], `${label} schema-0009 canary gate`);
  refuse(isEnvironmentD1Name(environment.databaseName, label) && isUuid(environment.databaseId), `${label} schema-0009 D1 identity is invalid`);
  return {
    databaseName: environment.databaseName,
    databaseId: environment.databaseId,
    readinessEvidence: parseSchema0009Evidence(environment.readinessEvidence, `${label} readiness`),
    authorityEvidence: parseSchema0009Evidence(environment.authorityEvidence, `${label} authority`),
  };
}

function parseSchema0009Evidence(value: unknown, label: string): Schema0009Evidence {
  const evidence = asRecord(value, `${label} evidence`);
  exactKeys(evidence, ['identity', 'sha256'], `${label} evidence`);
  refuse(isEvidenceIdentity(evidence.identity) && isSha256(evidence.sha256), `${label} evidence identity or SHA-256 is invalid`);
  return { identity: evidence.identity, sha256: evidence.sha256 };
}

function assertSchema0009EnvironmentMatch(
  configured: JsonRecord & { database_name: string; database_id: string }, reviewed: Schema0009CanaryEnvironmentGate, label: string,
): void {
  refuse(
    configured.database_name === reviewed.databaseName && configured.database_id === reviewed.databaseId,
    `${label} D1 identity does not match the reviewed schema-0009 canary gate`,
  );
}

function assertNotLegacySchema0008D1(databaseName: string, databaseId: string, label: string): void {
  refuse(!LEGACY_SCHEMA_0008_D1_NAMES.has(databaseName) && !LEGACY_SCHEMA_0008_D1_IDS.has(databaseId),
    `${label} D1 identity uses a recorded schema-0008 name or UUID`);
}

function assertVersion(version: FullVersion, mode: Mode, requireProductionOperator = false, gate: Schema0009CanaryGate = SCHEMA_0009_CANARY_GATE): boolean {
  const runtime = recordAt(version.resources, 'script_runtime');
  refuse(runtime.compatibility_date === COMPATIBILITY_DATE && stableJson(runtime.compatibility_flags) === stableJson(COMPATIBILITY_FLAGS),
    'version compatibility settings mismatch');
  const bindings = version.resources.bindings;
  uniqueNames(bindings, 'version bindings');
  const operatorBindings = bindings.filter(binding => binding.name === OPERATOR_TOKEN);
  const operatorReady = mode === '000' && operatorBindings.length === 1;
  if (operatorReady) assertVersionBinding(bindings, OPERATOR_TOKEN, 'secret_text', {});
  const expectedNames = new Set([
    'THEOLOGAI_DB', DO.name, 'THEOLOGAI_RATE_LIMITER', 'THEOLOGAI_CCEL_OPERATOR_AUTH_LIMITER', 'CF_VERSION_METADATA',
    'THEOLOGAI_VERSION', 'THEOLOGAI_ALLOWED_ORIGINS', 'THEOLOGAI_MAX_REQUEST_BYTES', 'THEOLOGAI_REQUEST_LOGS',
    'THEOLOGAI_EXPOSE_CCEL_DISCOVERY', 'THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH', 'THEOLOGAI_ENABLE_CCEL_COORDINATOR',
    ...(mode === '000' ? PRODUCTION_BASE_SECRET_BINDINGS : ['ESV_API_KEY']),
    ...(operatorReady ? [OPERATOR_TOKEN] : []),
  ]);
  refuse(bindings.length === expectedNames.size && bindings.every(binding => expectedNames.has(String(binding.name))),
    'version bindings must be the exact authorized set');
  const environments = expectedSchema0009Environments(gate);
  const values = mode === '000' ? environments.production : environments.preview;
  assertVersionBinding(bindings, 'THEOLOGAI_DB', 'd1', { id: values.d1 });
  assertVersionBinding(bindings, DO.name, DO.type, { class_name: DO.class_name, script_name: DO.script_name });
  assertVersionRate(bindings, 'THEOLOGAI_RATE_LIMITER', values.requestNamespace, 120);
  assertVersionRate(bindings, 'THEOLOGAI_CCEL_OPERATOR_AUTH_LIMITER', values.operatorNamespace, 12);
  assertVersionBinding(bindings, 'CF_VERSION_METADATA', 'version_metadata', {});
  if (mode === '000') {
    for (const name of PRODUCTION_BASE_SECRET_BINDINGS) assertVersionBinding(bindings, name, 'secret_text', {});
  } else assertVersionBinding(bindings, 'ESV_API_KEY', 'secret_text', {});
  const flags = mode === '111' ? { discovery: 'true', live: 'true', coordinator: 'true' } : values;
  const expected: Record<string, string> = {
    THEOLOGAI_VERSION: values.version,
    THEOLOGAI_ALLOWED_ORIGINS: 'https://theologai.xyz,https://theologai.pages.dev',
    THEOLOGAI_MAX_REQUEST_BYTES: '1048576', THEOLOGAI_REQUEST_LOGS: values.logs,
    THEOLOGAI_EXPOSE_CCEL_DISCOVERY: flags.discovery,
    THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: flags.live,
    THEOLOGAI_ENABLE_CCEL_COORDINATOR: flags.coordinator,
  };
  for (const [name, text] of Object.entries(expected)) assertVersionBinding(bindings, name, 'plain_text', { text });
  refuse(mode !== '000' || !requireProductionOperator || operatorReady,
    `production operator prerequisite is missing: active 000 version must contain exactly one ${OPERATOR_TOKEN} secret_text binding before any preview mutation`);
  return operatorReady;
}

function assertConfigRate(bindings: JsonRecord[], name: string, namespace: string, limit: number): void {
  const value = one(bindings.filter(item => item.name === name), `${name} config binding`);
  exactKeys(value, ['name', 'namespace_id', 'simple'], `${name} config binding`);
  const simple = recordAt(value, 'simple');
  exactKeys(simple, ['limit', 'period'], `${name} simple policy`);
  refuse(value.namespace_id === namespace && simple.limit === limit && simple.period === 60, `${name} config policy mismatch`);
}

function assertVersionRate(bindings: JsonRecord[], name: string, namespace: string, limit: number): void {
  const value = one(bindings.filter(item => item.name === name), `${name} version binding`);
  exactKeys(value, ['name', 'type', 'namespace_id', 'simple'], `${name} version binding`);
  const simple = recordAt(value, 'simple');
  exactKeys(simple, ['limit', 'period'], `${name} version simple policy`);
  refuse(value.type === 'ratelimit' && value.namespace_id === namespace && simple.limit === limit && simple.period === 60,
    `${name} version policy mismatch`);
}

function assertVersionBinding(bindings: JsonRecord[], name: string, type: string, fields: JsonRecord): void {
  const value = one(bindings.filter(item => item.name === name), `${name} version binding`);
  exactKeys(value, ['name', 'type', ...Object.keys(fields)], `${name} version binding`);
  refuse(value.type === type, `${name} version binding type mismatch`);
  for (const [key, expected] of Object.entries(fields)) refuse(value[key] === expected, `${name} version binding mismatch`);
}

function resourcesWithoutCanaryFlags(version: FullVersion): JsonRecord {
  return {
    ...version.resources,
    bindings: version.resources.bindings
      .filter(binding => !['THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH', 'THEOLOGAI_ENABLE_CCEL_COORDINATOR'].includes(String(binding.name)))
      .sort((left, right) => String(left.name).localeCompare(String(right.name))),
  };
}

/**
 * Wrangler full-version JSON exposes the authoritative Worker script identity
 * at resources.script.etag. Do not infer it from another response shape: an
 * absent or blank etag cannot prove code equivalence.
 */
function scriptEtag(version: FullVersion, label: string): string {
  const script = version.resources.script;
  refuse(isRecord(script), `${label} authoritative resources.script.etag is missing or empty`);
  const etag = script.etag;
  refuse(typeof etag === 'string' && etag.trim().length > 0,
    `${label} authoritative resources.script.etag is missing or empty`);
  return etag;
}

function parseVersionSummaries(value: unknown): VersionSummary[] {
  refuse(Array.isArray(value) && value.length > 0, 'version summaries must be a nonempty array');
  const result = value.map((entry, index) => parseVersionSummary(entry, `version summary ${index}`));
  refuse(new Set(result.map(item => item.id)).size === result.length && new Set(result.map(item => item.number)).size === result.length,
    'version identities and numbers must be unique');
  return result;
}

function parseVersionSummary(value: unknown, label: string): VersionSummary {
  const item = asRecord(value, label); const metadata = recordAt(item, 'metadata');
  refuse(isUuid(item.id) && Number.isSafeInteger(item.number) && Number(item.number) > 0, `${label} is invalid`);
  refuse(typeof metadata.created_on === 'string' && Number.isFinite(Date.parse(metadata.created_on)), `${label} timestamp is invalid`);
  if (item.annotations !== undefined) asRecord(item.annotations, `${label} annotations`);
  return item as unknown as VersionSummary;
}

function parseFullVersion(value: unknown): FullVersion {
  const summary = parseVersionSummary(value, 'full version view');
  const item = asRecord(value, 'full version view'); const resources = recordAt(item, 'resources');
  const bindings = arrayAt(resources, 'bindings').map((entry, index) => asRecord(entry, `version binding ${index}`));
  return { ...(summary as FullVersion), resources: { ...resources, bindings } };
}

function parseDeployments(value: unknown): Deployment[] {
  refuse(Array.isArray(value) && value.length > 0, 'deployment list must be nonempty');
  return value.map((entry, index) => {
    const item = asRecord(entry, `deployment ${index}`); const versions = arrayAt(item, 'versions').map((nested, nestedIndex) => asRecord(nested, `deployment ${index} version ${nestedIndex}`));
    refuse(isUuid(item.id) && typeof item.created_on === 'string' && Number.isFinite(Date.parse(item.created_on)) && versions.length > 0,
      `deployment ${index} is invalid`);
    for (const version of versions) refuse(isUuid(version.version_id) && typeof version.percentage === 'number', `deployment ${index} traffic is invalid`);
    return { id: item.id as string, created_on: item.created_on as string, versions: versions as Array<{ version_id: string; percentage: number }> };
  });
}

function activeVersion(deployments: Deployment[]): string {
  const latest = [...deployments].sort((left, right) => left.created_on.localeCompare(right.created_on)).at(-1)!;
  refuse(latest.versions.length === 1 && latest.versions[0]?.percentage === 100, 'latest deployment must contain one 100% version');
  return latest.versions[0]!.version_id;
}

function newest(versions: VersionSummary[]): VersionSummary { return [...versions].sort((a, b) => a.number - b.number).at(-1)!; }
function parseConfig(text: string): JsonRecord {
  try { return asRecord(parseToml(text), 'Worker config'); }
  catch (error) { throw new Error(`CCEL canary refused: Worker config is not valid TOML (${error instanceof Error ? error.message : 'unknown parser error'}).`); }
}
function asRecord(value: unknown, label: string): JsonRecord { refuse(isRecord(value), `${label} must be an object`); return value; }
function recordAt(value: JsonRecord, key: string): JsonRecord { return asRecord(value[key], key); }
function arrayAt(value: JsonRecord, key: string): unknown[] { const result = value[key]; refuse(Array.isArray(result), `${key} must be an array`); return result; }
function one<T>(values: T[], label: string): T { refuse(values.length === 1, `${label} must be unique`); return values[0]!; }
function only<T>(values: T[], label: string): T { return one(values, label); }
function uniqueNames(values: JsonRecord[], label: string): void {
  const names = values.map(value => value.name); refuse(names.every(name => typeof name === 'string') && new Set(names).size === names.length, `${label} names must be unique strings`);
}
function exactKeys(value: JsonRecord, keys: string[], label: string): void { refuse(Object.keys(value).sort().join(',') === [...keys].sort().join(','), `${label} must contain exactly authorized keys`); }
function isRecord(value: unknown): value is JsonRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isUuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function isSha(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value); }
function isSha256(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function isEnvironmentD1Name(value: unknown, environment: string): value is string {
  return typeof value === 'string'
    && (environment === 'preview' || environment === 'production')
    && new RegExp(`^theologai-${environment}-[a-z0-9-]+$`).test(value);
}
function isEvidenceIdentity(value: unknown): value is string { return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{2,127}$/.test(value); }
function stableJson(value: unknown): string { return JSON.stringify(value, (_, nested) => isRecord(nested) ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b))) : nested); }
function refuse(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`CCEL canary refused: ${message}.`); }

function parseCli(argv: string[]): { command: string; args: Map<string, string> } {
  const command = argv[0]; refuse(typeof command === 'string' && !command.startsWith('--'), 'command is missing');
  const args = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    refuse(key?.startsWith('--') && value !== undefined && !args.has(key), 'arguments are invalid or duplicated'); args.set(key, value);
  }
  return { command, args };
}
function exactArgs(args: Map<string, string>, keys: string[]): void { refuse(args.size === keys.length && [...args.keys()].every(key => keys.includes(key)), 'unexpected or missing argument'); }
function required(args: Map<string, string>, key: string): string { const value = args.get(key); refuse(value !== undefined, `${key} is required`); return value; }
function jsonFile(args: Map<string, string>, key: string): unknown { return JSON.parse(readFileSync(required(args, key), 'utf8')) as unknown; }
function textFile(args: Map<string, string>, key: string): string { return readFileSync(required(args, key), 'utf8'); }

export function runCli(argv: string[]): void {
  const { command, args } = parseCli(argv);
  if (command === 'validate-canary-inputs') {
    exactArgs(args, ['--preview-predecessor', '--production-control']);
    validateCanaryInputs({ previewPredecessor: required(args, '--preview-predecessor'), productionControl: required(args, '--production-control') }); return;
  }
  if (command === 'validate-canary-credentials') {
    exactArgs(args, []);
    validateCanaryCredentials(
      process.env.CCEL_CANARY_CREDENTIALS_CONFIGURED, process.env.CCEL_CANARY_ACCOUNT_WIDE_WORKERS_WRITE_ACK,
      process.env.CLOUDFLARE_API_TOKEN, process.env[OPERATOR_TOKEN],
    ); return;
  }
  if (command === 'validate-emergency-credentials') {
    exactArgs(args, []);
    validateEmergencyCredentials(
      process.env.CCEL_CANARY_CREDENTIALS_CONFIGURED, process.env.CCEL_CANARY_ACCOUNT_WIDE_WORKERS_WRITE_ACK,
      process.env.CLOUDFLARE_API_TOKEN,
    ); return;
  }
  if (command === 'validate-emergency-inputs') {
    exactArgs(args, ['--ref', '--current', '--target', '--confirmation', '--config']);
    validateEmergencyInputs(required(args, '--ref'), required(args, '--current'), required(args, '--target'), required(args, '--confirmation'), textFile(args, '--config')); return;
  }
  if (command === 'validate-dispatch') {
    exactArgs(args, ['--ref', '--sha', '--expected-sha', '--live-main-sha', '--confirmation', '--config']);
    validateCanaryDispatch({ ref: required(args, '--ref'), sha: required(args, '--sha'), expectedSha: required(args, '--expected-sha'), liveMainSha: required(args, '--live-main-sha'), confirmation: required(args, '--confirmation'), configText: textFile(args, '--config') }); return;
  }
  if (command === 'render-preview-config') {
    exactArgs(args, ['--config', '--output']); writeFileSync(required(args, '--output'), renderCanaryPreviewConfig(textFile(args, '--config'))); return;
  }
  if (command === 'validate-preview-baseline' || command === 'validate-production-control') {
    exactArgs(args, ['--config', '--deployments', '--version-view', '--expected-version']);
    const values = [textFile(args, '--config'), jsonFile(args, '--deployments'), jsonFile(args, '--version-view'), required(args, '--expected-version')] as const;
    if (command === 'validate-preview-baseline') validatePreviewBaseline(...values); else validateProductionControl(...values); return;
  }
  if (command === 'identify-upload') {
    exactArgs(args, ['--before-versions', '--after-versions', '--before-deployments', '--after-deployments', '--expected-baseline']);
    process.stdout.write(identifyCanaryUpload(jsonFile(args, '--before-versions'), jsonFile(args, '--after-versions'), jsonFile(args, '--before-deployments'), jsonFile(args, '--after-deployments'), required(args, '--expected-baseline'))); return;
  }
  if (command === 'validate-canary-version') {
    exactArgs(args, ['--config', '--baseline-view', '--canary-view', '--expected-baseline', '--expected-canary']);
    validateCanaryVersion(textFile(args, '--config'), jsonFile(args, '--baseline-view'), jsonFile(args, '--canary-view'), required(args, '--expected-baseline'), required(args, '--expected-canary')); return;
  }
  if (command === 'validate-canary-deployment') {
    exactArgs(args, ['--config', '--deployments', '--version-view', '--expected-canary']);
    validateCanaryDeployment(textFile(args, '--config'), jsonFile(args, '--deployments'), jsonFile(args, '--version-view'), required(args, '--expected-canary')); return;
  }
  if (command === 'restore-plan') {
    exactArgs(args, ['--config', '--deployments', '--current-view', '--target-view', '--expected-current', '--expected-target']);
    process.stdout.write(planRestore(textFile(args, '--config'), jsonFile(args, '--deployments'), jsonFile(args, '--current-view'), jsonFile(args, '--target-view'), required(args, '--expected-current'), required(args, '--expected-target'))); return;
  }
  if (command === 'validate-restore-result') {
    exactArgs(args, ['--config', '--deployments', '--target-view', '--expected-target']);
    validateRestoreResult(textFile(args, '--config'), jsonFile(args, '--deployments'), jsonFile(args, '--target-view'), required(args, '--expected-target')); return;
  }
  if (command === 'emit-evidence') {
    exactArgs(args, ['--commit', '--predecessor', '--canary', '--production-control', '--audit-sha256', '--audit-outcome', '--restored']);
    const restored = required(args, '--restored'); refuse(restored === 'true' || restored === 'false', 'restored must be true or false');
    const auditOutcome = required(args, '--audit-outcome');
    refuse(auditOutcome === 'success' || auditOutcome === 'failure', 'audit outcome must be success or failure');
    process.stdout.write(`${JSON.stringify(sanitizedCanaryEvidence({ commit: required(args, '--commit'), predecessor: required(args, '--predecessor'), canary: required(args, '--canary'), productionControl: required(args, '--production-control'), auditSha256: required(args, '--audit-sha256'), auditOutcome, restored: restored === 'true' }))}\n`); return;
  }
  throw new Error(`Unknown CCEL canary command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) runCli(process.argv.slice(2));
