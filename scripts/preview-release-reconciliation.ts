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
import { LEGACY_SCHEMA_0008_D1 } from './ccel-live-preview-canary.js';

type RecordValue = Record<string, unknown>;
/** The checked-in binding that the preceding readiness gate tested. */
type CandidateD1Binding = { binding: 'THEOLOGAI_DB'; databaseName: string; databaseId: string };
/** The binding observed on an immutable Worker version through Wrangler's control plane. */
type ObservedD1Binding = { binding: 'THEOLOGAI_DB'; databaseId: string };
type Deployment = { id: string; createdOn: string; versionId: string };

export interface PreviewPredecessorAnchor {
  schemaVersion: 3;
  worker: 'theologai-preview';
  predecessorVersionId: string;
  predecessorDeploymentId: string;
  predecessorDeploymentsSha256: string;
  predecessorVersionViewSha256: string;
  /** Read-only inventory proof that the configured candidate name resolves to its configured ID. */
  candidateD1InventorySha256: string;
  /** The D1 attached to the sole active pre-cutover Worker version. */
  predecessorD1: ObservedD1Binding;
  /** The checked-in D1 target addressed by the preceding readiness gate. */
  candidateD1: CandidateD1Binding;
  /** Whether this release changes the D1 binding rather than only Worker code. */
  d1Changed: boolean;
}

/** Sanitized read-only observation, retained even when the strict gate fails. */
export interface PreviewPostMutationObservation {
  schemaVersion: 3;
  worker: 'theologai-preview';
  predecessorVersionId: string;
  predecessorDeploymentId: string;
  predecessorD1: ObservedD1Binding;
  observedActiveVersionId: string;
  observedActiveDeploymentId: string;
  observedActiveD1: ObservedD1Binding;
  candidateD1: CandidateD1Binding;
  d1Changed: boolean;
  /** Detects a checked-out binding change between predecessor capture and observation. */
  candidateConfigMatchesAnchor: boolean;
  /** The strict release condition: the observed active Worker binds the expected candidate. */
  candidateBindingMatches: boolean;
  predecessorAnchorSha256: string;
  postMutationDeploymentsSha256: string;
  observedActiveVersionViewSha256: string;
}

/** @deprecated Use PreviewPostMutationObservation; strictness is applied by reconcilePreviewPostMutation. */
export type PreviewPostMutationReconciliation = PreviewPostMutationObservation;

/** The production record is separate from preview so its Worker identity cannot be supplied by a caller. */
export interface ProductionPredecessorAnchor {
  schemaVersion: 3;
  worker: 'theologai';
  predecessorVersionId: string;
  predecessorDeploymentId: string;
  predecessorDeploymentsSha256: string;
  predecessorVersionViewSha256: string;
  candidateD1InventorySha256: string;
  predecessorD1: ObservedD1Binding;
  candidateD1: CandidateD1Binding;
  d1Changed: boolean;
}

export interface ProductionPostMutationObservation {
  schemaVersion: 3;
  worker: 'theologai';
  predecessorVersionId: string;
  predecessorDeploymentId: string;
  predecessorD1: ObservedD1Binding;
  observedActiveVersionId: string;
  observedActiveDeploymentId: string;
  observedActiveD1: ObservedD1Binding;
  candidateD1: CandidateD1Binding;
  d1Changed: boolean;
  candidateConfigMatchesAnchor: boolean;
  candidateBindingMatches: boolean;
  predecessorAnchorSha256: string;
  postMutationDeploymentsSha256: string;
  observedActiveVersionViewSha256: string;
}

export type ProductionPostMutationReconciliation = ProductionPostMutationObservation;

/**
 * A fixed production control snapshot used to prove an ordinary preview
 * release did not alter production. It has no caller-selected Worker target.
 */
export interface ProductionControlIdentity {
  schemaVersion: 2;
  worker: 'theologai';
  deploymentId: string;
  workerVersionId: string;
  d1: ObservedD1Binding;
  /** Exact checked-in production binding proved against a fresh D1 inventory. */
  configuredD1: CandidateD1Binding;
  wranglerConfigSha256: string;
  d1InventorySha256: string;
}

/** A fixed preview snapshot used to prove a production release did not touch preview. */
export interface PreviewControlIdentity {
  schemaVersion: 1;
  worker: 'theologai-preview';
  deploymentId: string;
  workerVersionId: string;
  d1: ObservedD1Binding;
  configuredD1: CandidateD1Binding;
  wranglerConfigSha256: string;
  d1InventorySha256: string;
}

/** Final read-only proof that both current environments are distinct schema-0009 targets. */
export interface EnvironmentIsolationReceipt {
  schemaVersion: 1;
  production: { worker: 'theologai'; deploymentId: string; workerVersionId: string; d1: CandidateD1Binding };
  preview: { worker: 'theologai-preview'; deploymentId: string; workerVersionId: string; d1: CandidateD1Binding };
  wranglerConfigSha256: string;
  d1InventorySha256: string;
}

function fail(message: string): never { throw new Error(`Worker release reconciliation refused: ${message}.`); }
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

function checkedOutCandidateD1(configText: string): CandidateD1Binding {
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

/** Root production config is the release candidate; unlike preview it has no env block. */
function checkedOutProductionCandidateD1(configText: string): CandidateD1Binding {
  let parsed: unknown;
  try { parsed = parseToml(configText); } catch { return fail('wrangler config is not valid TOML'); }
  const root = object(parsed, 'wrangler config');
  assert(root.name === 'theologai', 'wrangler config production Worker is not theologai');
  assert(Array.isArray(root.d1_databases) && root.d1_databases.length === 1, 'wrangler config must expose exactly one production D1 binding');
  const binding = object(root.d1_databases[0], 'production D1 binding');
  exactKeys(binding, ['binding', 'database_name', 'database_id', 'migrations_dir'], 'production D1 binding');
  assert(binding.binding === 'THEOLOGAI_DB' && typeof binding.database_name === 'string' && binding.database_name.length > 0 && isUuid(binding.database_id),
    'production D1 binding is not canonical');
  return { binding: 'THEOLOGAI_DB', databaseName: binding.database_name, databaseId: binding.database_id.toLowerCase() };
}

/**
 * The candidate is prepared by exact D1 database name before its checked-in
 * Worker binding is deployed. Validate that mapping from a fresh read-only
 * Wrangler inventory instead of trusting a name or ID in isolation.
 */
function assertCandidateD1Inventory(
  candidate: CandidateD1Binding,
  inventoryText: string,
  environment: 'preview' | 'production',
): void {
  const inventoryLabel = `${environment} D1 inventory`;
  const values = parseJson(inventoryText, inventoryLabel);
  assert(Array.isArray(values) && values.length > 0, `${inventoryLabel} must be a nonempty array`);
  const entries = values.map((value, index) => {
    const entry = object(value, `${inventoryLabel} entry ${index}`);
    assert(isUuid(entry.uuid) && typeof entry.name === 'string' && entry.name.length > 0,
      `${inventoryLabel} entry ${index} identity is invalid`);
    return { databaseId: entry.uuid.toLowerCase(), databaseName: entry.name };
  });
  assert(new Set(entries.map(entry => entry.databaseId)).size === entries.length,
    `${inventoryLabel} database IDs are not unique`);
  assert(new Set(entries.map(entry => entry.databaseName)).size === entries.length,
    `${inventoryLabel} database names are not unique`);
  const match = entries.filter(entry => entry.databaseId === candidate.databaseId);
  assert(match.length === 1 && match[0]!.databaseName === candidate.databaseName,
    `checked-out candidate ${environment} D1 does not match the read-only inventory ID/name mapping`);
}

/** Print-safe selector used by the release workflow before it probes candidate readiness by exact D1 name. */
export function candidatePreviewD1DatabaseName(input: {
  wranglerConfigText: string;
  d1InventoryText: string;
}): string {
  const candidate = checkedOutCandidateD1(input.wranglerConfigText);
  assertCandidateD1Inventory(candidate, input.d1InventoryText, 'preview');
  return candidate.databaseName;
}

/** Exact checked-out name/UUID mapping used by the production readiness gate. */
export function candidateProductionD1DatabaseName(input: {
  wranglerConfigText: string;
  d1InventoryText: string;
}): string {
  const candidate = checkedOutProductionCandidateD1(input.wranglerConfigText);
  assertCandidateD1Inventory(candidate, input.d1InventoryText, 'production');
  return candidate.databaseName;
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

/** Cloudflare deployments select traffic; `versions view` authoritatively proves bindings. */
function observedD1FromAuthoritativeVersionView(
  versionViewText: string,
  expectedVersionId: string,
  label: string,
): ObservedD1Binding {
  const view = object(parseJson(versionViewText, `${label} version view`), `${label} version view`);
  assert(isUuid(view.id) && view.id.toLowerCase() === expectedVersionId, `${label} version view identity does not match the active deployment`);
  const resources = object(view.resources, `${label} version view resources`);
  assert(Array.isArray(resources.bindings), `${label} version view bindings must be an array`);
  const d1Bindings = resources.bindings.map((entry, index) => object(entry, `${label} version binding ${index}`))
    .filter(binding => binding.name === 'THEOLOGAI_DB');
  assert(d1Bindings.length === 1, `${label} version must expose exactly one THEOLOGAI_DB binding`);
  const d1 = d1Bindings[0]!;
  // The authoritative D1 binding response includes the UUID twice. Requiring
  // both fields catches a response-shape change or a swapped control-plane value.
  exactKeys(d1, ['name', 'type', 'id', 'database_id'], `${label} version D1 binding`);
  assert(d1.name === 'THEOLOGAI_DB' && d1.type === 'd1' && isUuid(d1.id) && isUuid(d1.database_id)
    && d1.id.toLowerCase() === d1.database_id.toLowerCase(),
  `${label} version D1 binding id/database_id is not one canonical UUID`);
  return { binding: 'THEOLOGAI_DB', databaseId: d1.id.toLowerCase() };
}

function assertObservedD1MatchesCandidate(
  observed: ObservedD1Binding,
  candidate: CandidateD1Binding,
  label: string,
): void {
  assert(observed.databaseId === candidate.databaseId,
    `${label} version THEOLOGAI_DB binding does not match the checked-out readiness-tested candidate D1`);
}

export function activePreviewVersionId(deploymentsText: string): string {
  return currentSoleDeployment(deploymentsText, 'preview deployments').versionId;
}

export function activeProductionVersionId(deploymentsText: string): string {
  return currentSoleDeployment(deploymentsText, 'production deployments').versionId;
}

export function captureProductionControlIdentity(input: {
  deploymentsText: string;
  activeVersionViewText: string;
  wranglerConfigText: string;
  d1InventoryText: string;
}): ProductionControlIdentity {
  const configuredD1 = checkedOutProductionCandidateD1(input.wranglerConfigText);
  assertCandidateD1Inventory(configuredD1, input.d1InventoryText, 'production');
  const active = currentSoleDeployment(input.deploymentsText, 'production control deployments');
  const d1 = observedD1FromAuthoritativeVersionView(input.activeVersionViewText, active.versionId, 'production control');
  assertObservedD1MatchesCandidate(d1, configuredD1, 'production control');
  return {
    schemaVersion: 2,
    worker: 'theologai',
    deploymentId: active.id,
    workerVersionId: active.versionId,
    d1,
    configuredD1,
    wranglerConfigSha256: sha256(input.wranglerConfigText),
    d1InventorySha256: sha256(input.d1InventoryText),
  };
}

function parseProductionControlIdentity(value: unknown): ProductionControlIdentity {
  const control = object(value, 'production control identity');
  exactKeys(control, ['schemaVersion', 'worker', 'deploymentId', 'workerVersionId', 'd1', 'configuredD1', 'wranglerConfigSha256', 'd1InventorySha256'], 'production control identity');
  const d1 = object(control.d1, 'production control D1');
  const configuredD1 = object(control.configuredD1, 'production control configured D1');
  exactKeys(d1, ['binding', 'databaseId'], 'production control D1');
  exactKeys(configuredD1, ['binding', 'databaseName', 'databaseId'], 'production control configured D1');
  assert(control.schemaVersion === 2 && control.worker === 'theologai'
    && isUuid(control.deploymentId) && isUuid(control.workerVersionId)
    && d1.binding === 'THEOLOGAI_DB' && isUuid(d1.databaseId),
  'production control identity is not canonical');
  assert(configuredD1.binding === 'THEOLOGAI_DB' && typeof configuredD1.databaseName === 'string'
    && configuredD1.databaseName.length > 0 && isUuid(configuredD1.databaseId)
    && d1.databaseId.toLowerCase() === configuredD1.databaseId.toLowerCase()
    && isSha256(control.wranglerConfigSha256) && isSha256(control.d1InventorySha256),
  'production control configured D1 proof is not canonical');
  return {
    schemaVersion: 2, worker: 'theologai', deploymentId: control.deploymentId.toLowerCase(),
    workerVersionId: control.workerVersionId.toLowerCase(),
    d1: { binding: 'THEOLOGAI_DB', databaseId: d1.databaseId.toLowerCase() },
    configuredD1: {
      binding: 'THEOLOGAI_DB', databaseName: configuredD1.databaseName,
      databaseId: configuredD1.databaseId.toLowerCase(),
    },
    wranglerConfigSha256: control.wranglerConfigSha256.toLowerCase(),
    d1InventorySha256: control.d1InventorySha256.toLowerCase(),
  };
}

/** Fail closed if an ordinary preview release observed any production identity drift. */
export function verifyProductionControlUnchanged(input: {
  controlText: string;
  deploymentsText: string;
  activeVersionViewText: string;
  wranglerConfigText: string;
  d1InventoryText: string;
}): ProductionControlIdentity {
  const control = parseProductionControlIdentity(parseJson(input.controlText, 'production control identity'));
  const active = currentSoleDeployment(input.deploymentsText, 'production control deployments');
  const observedD1 = observedD1FromAuthoritativeVersionView(input.activeVersionViewText, active.versionId, 'production control');
  assert(active.id === control.deploymentId, 'production deployment changed during preview release');
  assert(active.versionId === control.workerVersionId, 'production Worker version changed during preview release');
  assert(observedD1.databaseId === control.d1.databaseId, 'production D1 binding changed during preview release');
  const observed = captureProductionControlIdentity({
    deploymentsText: input.deploymentsText, activeVersionViewText: input.activeVersionViewText,
    wranglerConfigText: input.wranglerConfigText, d1InventoryText: input.d1InventoryText,
  });
  assert(observed.deploymentId === control.deploymentId, 'production deployment changed during preview release');
  assert(observed.workerVersionId === control.workerVersionId, 'production Worker version changed during preview release');
  assert(observed.d1.databaseId === control.d1.databaseId, 'production D1 binding changed during preview release');
  assert(observed.configuredD1.databaseName === control.configuredD1.databaseName
    && observed.configuredD1.databaseId === control.configuredD1.databaseId
    && observed.wranglerConfigSha256 === control.wranglerConfigSha256,
  'checked-out production D1 configuration changed during preview release');
  return observed;
}

export function capturePreviewControlIdentity(input: {
  deploymentsText: string;
  activeVersionViewText: string;
  wranglerConfigText: string;
  d1InventoryText: string;
}): PreviewControlIdentity {
  const configuredD1 = checkedOutCandidateD1(input.wranglerConfigText);
  assertCandidateD1Inventory(configuredD1, input.d1InventoryText, 'preview');
  const active = currentSoleDeployment(input.deploymentsText, 'preview control deployments');
  const d1 = observedD1FromAuthoritativeVersionView(input.activeVersionViewText, active.versionId, 'preview control');
  assertObservedD1MatchesCandidate(d1, configuredD1, 'preview control');
  return {
    schemaVersion: 1, worker: 'theologai-preview', deploymentId: active.id, workerVersionId: active.versionId, d1, configuredD1,
    wranglerConfigSha256: sha256(input.wranglerConfigText), d1InventorySha256: sha256(input.d1InventoryText),
  };
}

function parsePreviewControlIdentity(value: unknown): PreviewControlIdentity {
  const control = object(value, 'preview control identity');
  exactKeys(control, ['schemaVersion', 'worker', 'deploymentId', 'workerVersionId', 'd1', 'configuredD1', 'wranglerConfigSha256', 'd1InventorySha256'], 'preview control identity');
  const d1 = object(control.d1, 'preview control D1');
  const configuredD1 = object(control.configuredD1, 'preview control configured D1');
  exactKeys(d1, ['binding', 'databaseId'], 'preview control D1');
  exactKeys(configuredD1, ['binding', 'databaseName', 'databaseId'], 'preview control configured D1');
  assert(control.schemaVersion === 1 && control.worker === 'theologai-preview'
    && isUuid(control.deploymentId) && isUuid(control.workerVersionId)
    && d1.binding === 'THEOLOGAI_DB' && isUuid(d1.databaseId)
    && configuredD1.binding === 'THEOLOGAI_DB' && typeof configuredD1.databaseName === 'string'
    && configuredD1.databaseName.length > 0 && isUuid(configuredD1.databaseId)
    && d1.databaseId.toLowerCase() === configuredD1.databaseId.toLowerCase()
    && isSha256(control.wranglerConfigSha256) && isSha256(control.d1InventorySha256),
  'preview control identity is not canonical');
  return {
    schemaVersion: 1, worker: 'theologai-preview', deploymentId: control.deploymentId.toLowerCase(), workerVersionId: control.workerVersionId.toLowerCase(),
    d1: { binding: 'THEOLOGAI_DB', databaseId: d1.databaseId.toLowerCase() },
    configuredD1: { binding: 'THEOLOGAI_DB', databaseName: configuredD1.databaseName, databaseId: configuredD1.databaseId.toLowerCase() },
    wranglerConfigSha256: control.wranglerConfigSha256.toLowerCase(), d1InventorySha256: control.d1InventorySha256.toLowerCase(),
  };
}

/** Fail closed if a production release changes any preview routing, version, or binding identity. */
export function verifyPreviewControlUnchanged(input: {
  controlText: string;
  deploymentsText: string;
  activeVersionViewText: string;
  wranglerConfigText: string;
  d1InventoryText: string;
}): PreviewControlIdentity {
  const control = parsePreviewControlIdentity(parseJson(input.controlText, 'preview control identity'));
  const observed = capturePreviewControlIdentity({
    deploymentsText: input.deploymentsText, activeVersionViewText: input.activeVersionViewText,
    wranglerConfigText: input.wranglerConfigText, d1InventoryText: input.d1InventoryText,
  });
  assert(observed.deploymentId === control.deploymentId, 'preview deployment changed during production release');
  assert(observed.workerVersionId === control.workerVersionId, 'preview Worker version changed during production release');
  assert(observed.d1.databaseId === control.d1.databaseId, 'preview D1 binding changed during production release');
  assert(observed.configuredD1.databaseName === control.configuredD1.databaseName
    && observed.configuredD1.databaseId === control.configuredD1.databaseId
    && observed.wranglerConfigSha256 === control.wranglerConfigSha256,
  'checked-out preview D1 configuration changed during production release');
  return observed;
}

function assertCurrentSchema0009D1(candidate: CandidateD1Binding, environment: 'preview' | 'production'): void {
  const retained = Object.values(LEGACY_SCHEMA_0008_D1);
  assert(!retained.some(legacy => candidate.databaseId === legacy.id || candidate.databaseName === legacy.name),
    `${environment} D1 uses a recorded schema-0008 name or UUID`);
}

/**
 * Capture a sanitized final receipt. It proves each active Worker binds its
 * exact checked-in D1, both mappings exist in one fresh inventory, and neither
 * environment crosses into the other or retained schema-0008 identities.
 */
export function captureEnvironmentIsolationReceipt(input: {
  productionDeploymentsText: string;
  productionActiveVersionViewText: string;
  previewDeploymentsText: string;
  previewActiveVersionViewText: string;
  wranglerConfigText: string;
  d1InventoryText: string;
}): EnvironmentIsolationReceipt {
  const productionD1 = checkedOutProductionCandidateD1(input.wranglerConfigText);
  const previewD1 = checkedOutCandidateD1(input.wranglerConfigText);
  assertCurrentSchema0009D1(productionD1, 'production');
  assertCurrentSchema0009D1(previewD1, 'preview');
  assert(productionD1.databaseId !== previewD1.databaseId && productionD1.databaseName !== previewD1.databaseName,
    'production and preview D1 identities must be distinct');
  assertCandidateD1Inventory(productionD1, input.d1InventoryText, 'production');
  assertCandidateD1Inventory(previewD1, input.d1InventoryText, 'preview');
  const production = currentSoleDeployment(input.productionDeploymentsText, 'environment isolation production deployments');
  const preview = currentSoleDeployment(input.previewDeploymentsText, 'environment isolation preview deployments');
  const observedProductionD1 = observedD1FromAuthoritativeVersionView(input.productionActiveVersionViewText, production.versionId, 'environment isolation production');
  const observedPreviewD1 = observedD1FromAuthoritativeVersionView(input.previewActiveVersionViewText, preview.versionId, 'environment isolation preview');
  assertObservedD1MatchesCandidate(observedProductionD1, productionD1, 'environment isolation production');
  assertObservedD1MatchesCandidate(observedPreviewD1, previewD1, 'environment isolation preview');
  return {
    schemaVersion: 1,
    production: { worker: 'theologai', deploymentId: production.id, workerVersionId: production.versionId, d1: productionD1 },
    preview: { worker: 'theologai-preview', deploymentId: preview.id, workerVersionId: preview.versionId, d1: previewD1 },
    wranglerConfigSha256: sha256(input.wranglerConfigText), d1InventorySha256: sha256(input.d1InventoryText),
  };
}

export function capturePreviewPredecessorAnchor(input: {
  deploymentsText: string;
  predecessorVersionViewText: string;
  wranglerConfigText: string;
  d1InventoryText: string;
}): PreviewPredecessorAnchor {
  const active = currentSoleDeployment(input.deploymentsText, 'pre-deploy preview deployments');
  const candidateD1 = checkedOutCandidateD1(input.wranglerConfigText);
  assertCandidateD1Inventory(candidateD1, input.d1InventoryText, 'preview');
  const predecessorD1 = observedD1FromAuthoritativeVersionView(input.predecessorVersionViewText, active.versionId, 'predecessor');
  return {
    schemaVersion: 3,
    worker: 'theologai-preview',
    predecessorVersionId: active.versionId,
    predecessorDeploymentId: active.id,
    predecessorDeploymentsSha256: sha256(input.deploymentsText),
    predecessorVersionViewSha256: sha256(input.predecessorVersionViewText),
    candidateD1InventorySha256: sha256(input.d1InventoryText),
    predecessorD1,
    candidateD1,
    d1Changed: predecessorD1.databaseId !== candidateD1.databaseId,
  };
}

export function captureProductionPredecessorAnchor(input: {
  deploymentsText: string;
  predecessorVersionViewText: string;
  wranglerConfigText: string;
  d1InventoryText: string;
}): ProductionPredecessorAnchor {
  const active = currentSoleDeployment(input.deploymentsText, 'pre-deploy production deployments');
  const candidateD1 = checkedOutProductionCandidateD1(input.wranglerConfigText);
  assertCandidateD1Inventory(candidateD1, input.d1InventoryText, 'production');
  const predecessorD1 = observedD1FromAuthoritativeVersionView(input.predecessorVersionViewText, active.versionId, 'production predecessor');
  return {
    schemaVersion: 3, worker: 'theologai', predecessorVersionId: active.versionId, predecessorDeploymentId: active.id,
    predecessorDeploymentsSha256: sha256(input.deploymentsText), predecessorVersionViewSha256: sha256(input.predecessorVersionViewText),
    candidateD1InventorySha256: sha256(input.d1InventoryText), predecessorD1, candidateD1,
    d1Changed: predecessorD1.databaseId !== candidateD1.databaseId,
  };
}

function parseAnchor(value: unknown): PreviewPredecessorAnchor {
  const anchor = object(value, 'predecessor anchor');
  exactKeys(anchor, [
    'schemaVersion', 'worker', 'predecessorVersionId', 'predecessorDeploymentId',
    'predecessorDeploymentsSha256', 'predecessorVersionViewSha256', 'candidateD1InventorySha256',
    'predecessorD1', 'candidateD1', 'd1Changed',
  ], 'predecessor anchor');
  const predecessorD1 = object(anchor.predecessorD1, 'predecessor anchor predecessorD1');
  const candidateD1 = object(anchor.candidateD1, 'predecessor anchor candidateD1');
  exactKeys(predecessorD1, ['binding', 'databaseId'], 'predecessor anchor predecessorD1');
  exactKeys(candidateD1, ['binding', 'databaseName', 'databaseId'], 'predecessor anchor candidateD1');
  assert(anchor.schemaVersion === 3 && anchor.worker === 'theologai-preview' && isUuid(anchor.predecessorVersionId)
    && isUuid(anchor.predecessorDeploymentId) && isSha256(anchor.predecessorDeploymentsSha256) && isSha256(anchor.predecessorVersionViewSha256)
    && isSha256(anchor.candidateD1InventorySha256)
    && predecessorD1.binding === 'THEOLOGAI_DB' && isUuid(predecessorD1.databaseId)
    && candidateD1.binding === 'THEOLOGAI_DB' && typeof candidateD1.databaseName === 'string' && candidateD1.databaseName.length > 0 && isUuid(candidateD1.databaseId)
    && typeof anchor.d1Changed === 'boolean'
    && anchor.d1Changed === (predecessorD1.databaseId.toLowerCase() !== candidateD1.databaseId.toLowerCase()),
  'predecessor anchor is not canonical');
  return {
    schemaVersion: 3, worker: 'theologai-preview', predecessorVersionId: anchor.predecessorVersionId.toLowerCase(),
    predecessorDeploymentId: anchor.predecessorDeploymentId.toLowerCase(), predecessorDeploymentsSha256: anchor.predecessorDeploymentsSha256.toLowerCase(), predecessorVersionViewSha256: anchor.predecessorVersionViewSha256.toLowerCase(),
    candidateD1InventorySha256: anchor.candidateD1InventorySha256.toLowerCase(),
    predecessorD1: { binding: 'THEOLOGAI_DB', databaseId: predecessorD1.databaseId.toLowerCase() },
    candidateD1: { binding: 'THEOLOGAI_DB', databaseName: candidateD1.databaseName, databaseId: candidateD1.databaseId.toLowerCase() },
    d1Changed: anchor.d1Changed,
  };
}

function parseProductionAnchor(value: unknown): ProductionPredecessorAnchor {
  const anchor = object(value, 'production predecessor anchor');
  exactKeys(anchor, [
    'schemaVersion', 'worker', 'predecessorVersionId', 'predecessorDeploymentId',
    'predecessorDeploymentsSha256', 'predecessorVersionViewSha256', 'candidateD1InventorySha256',
    'predecessorD1', 'candidateD1', 'd1Changed',
  ], 'production predecessor anchor');
  const predecessorD1 = object(anchor.predecessorD1, 'production predecessor anchor predecessorD1');
  const candidateD1 = object(anchor.candidateD1, 'production predecessor anchor candidateD1');
  exactKeys(predecessorD1, ['binding', 'databaseId'], 'production predecessor anchor predecessorD1');
  exactKeys(candidateD1, ['binding', 'databaseName', 'databaseId'], 'production predecessor anchor candidateD1');
  assert(anchor.schemaVersion === 3 && anchor.worker === 'theologai' && isUuid(anchor.predecessorVersionId)
    && isUuid(anchor.predecessorDeploymentId) && isSha256(anchor.predecessorDeploymentsSha256) && isSha256(anchor.predecessorVersionViewSha256)
    && isSha256(anchor.candidateD1InventorySha256) && predecessorD1.binding === 'THEOLOGAI_DB' && isUuid(predecessorD1.databaseId)
    && candidateD1.binding === 'THEOLOGAI_DB' && typeof candidateD1.databaseName === 'string' && candidateD1.databaseName.length > 0
    && isUuid(candidateD1.databaseId) && typeof anchor.d1Changed === 'boolean'
    && anchor.d1Changed === (predecessorD1.databaseId.toLowerCase() !== candidateD1.databaseId.toLowerCase()),
  'production predecessor anchor is not canonical');
  return {
    schemaVersion: 3, worker: 'theologai', predecessorVersionId: anchor.predecessorVersionId.toLowerCase(),
    predecessorDeploymentId: anchor.predecessorDeploymentId.toLowerCase(), predecessorDeploymentsSha256: anchor.predecessorDeploymentsSha256.toLowerCase(),
    predecessorVersionViewSha256: anchor.predecessorVersionViewSha256.toLowerCase(), candidateD1InventorySha256: anchor.candidateD1InventorySha256.toLowerCase(),
    predecessorD1: { binding: 'THEOLOGAI_DB', databaseId: predecessorD1.databaseId.toLowerCase() },
    candidateD1: { binding: 'THEOLOGAI_DB', databaseName: candidateD1.databaseName, databaseId: candidateD1.databaseId.toLowerCase() },
    d1Changed: anchor.d1Changed,
  };
}

export function observePreviewPostMutation(input: {
  predecessorAnchorText: string;
  postMutationDeploymentsText: string;
  observedActiveVersionViewText: string;
  wranglerConfigText: string;
}): PreviewPostMutationObservation {
  const predecessor = parseAnchor(parseJson(input.predecessorAnchorText, 'predecessor anchor'));
  const candidateD1 = checkedOutCandidateD1(input.wranglerConfigText);
  const active = currentSoleDeployment(input.postMutationDeploymentsText, 'post-mutation preview deployments');
  const observedActiveD1 = observedD1FromAuthoritativeVersionView(input.observedActiveVersionViewText, active.versionId, 'post-mutation active');
  return {
    schemaVersion: 3, worker: 'theologai-preview', predecessorVersionId: predecessor.predecessorVersionId,
    predecessorDeploymentId: predecessor.predecessorDeploymentId, observedActiveVersionId: active.versionId,
    observedActiveDeploymentId: active.id,
    predecessorD1: predecessor.predecessorD1,
    observedActiveD1,
    candidateD1: predecessor.candidateD1,
    d1Changed: predecessor.d1Changed,
    candidateConfigMatchesAnchor: JSON.stringify(candidateD1) === JSON.stringify(predecessor.candidateD1),
    candidateBindingMatches: observedActiveD1.databaseId === predecessor.candidateD1.databaseId,
    predecessorAnchorSha256: sha256(input.predecessorAnchorText),
    postMutationDeploymentsSha256: sha256(input.postMutationDeploymentsText),
    observedActiveVersionViewSha256: sha256(input.observedActiveVersionViewText),
  };
}

/** Strict release gate layered on the persistable observation above. */
export function reconcilePreviewPostMutation(input: {
  predecessorAnchorText: string;
  postMutationDeploymentsText: string;
  observedActiveVersionViewText: string;
  wranglerConfigText: string;
}): PreviewPostMutationReconciliation {
  const observation = observePreviewPostMutation(input);
  assert(observation.candidateConfigMatchesAnchor,
    'checked-out candidate preview D1 binding no longer matches the captured candidate readiness anchor');
  assertObservedD1MatchesCandidate(observation.observedActiveD1, observation.candidateD1, 'post-mutation active');
  return observation;
}

export function observeProductionPostMutation(input: {
  predecessorAnchorText: string;
  postMutationDeploymentsText: string;
  observedActiveVersionViewText: string;
  wranglerConfigText: string;
}): ProductionPostMutationObservation {
  const predecessor = parseProductionAnchor(parseJson(input.predecessorAnchorText, 'production predecessor anchor'));
  const candidateD1 = checkedOutProductionCandidateD1(input.wranglerConfigText);
  const active = currentSoleDeployment(input.postMutationDeploymentsText, 'post-mutation production deployments');
  const observedActiveD1 = observedD1FromAuthoritativeVersionView(input.observedActiveVersionViewText, active.versionId, 'post-mutation production active');
  return {
    schemaVersion: 3, worker: 'theologai', predecessorVersionId: predecessor.predecessorVersionId,
    predecessorDeploymentId: predecessor.predecessorDeploymentId, predecessorD1: predecessor.predecessorD1,
    observedActiveVersionId: active.versionId, observedActiveDeploymentId: active.id, observedActiveD1,
    candidateD1: predecessor.candidateD1, d1Changed: predecessor.d1Changed,
    candidateConfigMatchesAnchor: JSON.stringify(candidateD1) === JSON.stringify(predecessor.candidateD1),
    candidateBindingMatches: observedActiveD1.databaseId === predecessor.candidateD1.databaseId,
    predecessorAnchorSha256: sha256(input.predecessorAnchorText), postMutationDeploymentsSha256: sha256(input.postMutationDeploymentsText),
    observedActiveVersionViewSha256: sha256(input.observedActiveVersionViewText),
  };
}

export function reconcileProductionPostMutation(input: {
  predecessorAnchorText: string;
  postMutationDeploymentsText: string;
  observedActiveVersionViewText: string;
  wranglerConfigText: string;
}): ProductionPostMutationReconciliation {
  const observation = observeProductionPostMutation(input);
  assert(observation.candidateConfigMatchesAnchor,
    'checked-out candidate production D1 binding no longer matches the captured candidate readiness anchor');
  assertObservedD1MatchesCandidate(observation.observedActiveD1, observation.candidateD1, 'post-mutation production active');
  return observation;
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

async function writeRecord(record: PreviewPredecessorAnchor | PreviewPostMutationObservation | ProductionPredecessorAnchor | ProductionPostMutationObservation | ProductionControlIdentity | PreviewControlIdentity | EnvironmentIsolationReceipt, output: string): Promise<void> {
  await writeFile(output, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

export async function runCli(argv: string[]): Promise<void> {
  const command = argv[0];
  if (command === 'candidate-d1-name') {
    const values = exactArgs(argv.slice(1), command, ['--wrangler-config', '--d1-inventory']);
    const [wranglerConfigText, d1InventoryText] = await Promise.all([
      readFile(values.get('--wrangler-config')!, 'utf8'), readFile(values.get('--d1-inventory')!, 'utf8'),
    ]);
    process.stdout.write(`${candidatePreviewD1DatabaseName({ wranglerConfigText, d1InventoryText })}\n`);
    return;
  }
  if (command === 'active-version-id') {
    const values = exactArgs(argv.slice(1), command, ['--deployments']);
    process.stdout.write(`${activePreviewVersionId(await readFile(values.get('--deployments')!, 'utf8'))}\n`);
    return;
  }
  if (command === 'capture-control') {
    const values = exactArgs(argv.slice(1), command, ['--deployments', '--active-version-view', '--wrangler-config', '--d1-inventory', '--output']);
    const [deploymentsText, activeVersionViewText, wranglerConfigText, d1InventoryText] = await Promise.all([
      readFile(values.get('--deployments')!, 'utf8'), readFile(values.get('--active-version-view')!, 'utf8'),
      readFile(values.get('--wrangler-config')!, 'utf8'), readFile(values.get('--d1-inventory')!, 'utf8'),
    ]);
    await writeRecord(capturePreviewControlIdentity({ deploymentsText, activeVersionViewText, wranglerConfigText, d1InventoryText }), values.get('--output')!);
    return;
  }
  if (command === 'verify-control') {
    const values = exactArgs(argv.slice(1), command, ['--control', '--deployments', '--active-version-view', '--wrangler-config', '--d1-inventory', '--output']);
    const [controlText, deploymentsText, activeVersionViewText, wranglerConfigText, d1InventoryText] = await Promise.all([
      readFile(values.get('--control')!, 'utf8'), readFile(values.get('--deployments')!, 'utf8'),
      readFile(values.get('--active-version-view')!, 'utf8'), readFile(values.get('--wrangler-config')!, 'utf8'), readFile(values.get('--d1-inventory')!, 'utf8'),
    ]);
    await writeRecord(verifyPreviewControlUnchanged({ controlText, deploymentsText, activeVersionViewText, wranglerConfigText, d1InventoryText }), values.get('--output')!);
    return;
  }
  if (command === 'capture-predecessor') {
    const values = exactArgs(argv.slice(1), command, ['--deployments', '--predecessor-version-view', '--wrangler-config', '--d1-inventory', '--output']);
    const [deploymentsText, predecessorVersionViewText, wranglerConfigText, d1InventoryText] = await Promise.all([
      readFile(values.get('--deployments')!, 'utf8'), readFile(values.get('--predecessor-version-view')!, 'utf8'), readFile(values.get('--wrangler-config')!, 'utf8'), readFile(values.get('--d1-inventory')!, 'utf8'),
    ]);
    await writeRecord(capturePreviewPredecessorAnchor({ deploymentsText, predecessorVersionViewText, wranglerConfigText, d1InventoryText }), values.get('--output')!);
    return;
  }
  if (command === 'reconcile-post-mutation') {
    const values = exactArgs(argv.slice(1), command, ['--predecessor-anchor', '--deployments', '--observed-active-version-view', '--wrangler-config', '--output']);
    const [predecessorAnchorText, postMutationDeploymentsText, observedActiveVersionViewText, wranglerConfigText] = await Promise.all([
      readFile(values.get('--predecessor-anchor')!, 'utf8'), readFile(values.get('--deployments')!, 'utf8'), readFile(values.get('--observed-active-version-view')!, 'utf8'), readFile(values.get('--wrangler-config')!, 'utf8'),
    ]);
    await writeRecord(reconcilePreviewPostMutation({ predecessorAnchorText, postMutationDeploymentsText, observedActiveVersionViewText, wranglerConfigText }), values.get('--output')!);
    return;
  }
  if (command === 'observe-post-mutation') {
    const values = exactArgs(argv.slice(1), command, ['--predecessor-anchor', '--deployments', '--observed-active-version-view', '--wrangler-config', '--output']);
    const [predecessorAnchorText, postMutationDeploymentsText, observedActiveVersionViewText, wranglerConfigText] = await Promise.all([
      readFile(values.get('--predecessor-anchor')!, 'utf8'), readFile(values.get('--deployments')!, 'utf8'), readFile(values.get('--observed-active-version-view')!, 'utf8'), readFile(values.get('--wrangler-config')!, 'utf8'),
    ]);
    await writeRecord(observePreviewPostMutation({ predecessorAnchorText, postMutationDeploymentsText, observedActiveVersionViewText, wranglerConfigText }), values.get('--output')!);
    return;
  }
  fail('command must be candidate-d1-name, active-version-id, capture-control, verify-control, capture-predecessor, reconcile-post-mutation, or observe-post-mutation');
}

/** Fixed production CLI wrapper: it has no environment or Worker-name option. */
export async function runProductionCli(argv: string[]): Promise<void> {
  const command = argv[0];
  if (command === 'candidate-d1-name') {
    const values = exactArgs(argv.slice(1), command, ['--wrangler-config', '--d1-inventory']);
    const [wranglerConfigText, d1InventoryText] = await Promise.all([readFile(values.get('--wrangler-config')!, 'utf8'), readFile(values.get('--d1-inventory')!, 'utf8')]);
    process.stdout.write(`${candidateProductionD1DatabaseName({ wranglerConfigText, d1InventoryText })}\n`); return;
  }
  if (command === 'active-version-id') {
    const values = exactArgs(argv.slice(1), command, ['--deployments']);
    process.stdout.write(`${activeProductionVersionId(await readFile(values.get('--deployments')!, 'utf8'))}\n`); return;
  }
  if (command === 'capture-control') {
    const values = exactArgs(argv.slice(1), command, ['--deployments', '--active-version-view', '--wrangler-config', '--d1-inventory', '--output']);
    const [deploymentsText, activeVersionViewText, wranglerConfigText, d1InventoryText] = await Promise.all([
      readFile(values.get('--deployments')!, 'utf8'), readFile(values.get('--active-version-view')!, 'utf8'),
      readFile(values.get('--wrangler-config')!, 'utf8'), readFile(values.get('--d1-inventory')!, 'utf8'),
    ]);
    await writeRecord(captureProductionControlIdentity({ deploymentsText, activeVersionViewText, wranglerConfigText, d1InventoryText }), values.get('--output')!); return;
  }
  if (command === 'verify-control') {
    const values = exactArgs(argv.slice(1), command, ['--control', '--deployments', '--active-version-view', '--wrangler-config', '--d1-inventory', '--output']);
    const [controlText, deploymentsText, activeVersionViewText, wranglerConfigText, d1InventoryText] = await Promise.all([
      readFile(values.get('--control')!, 'utf8'), readFile(values.get('--deployments')!, 'utf8'),
      readFile(values.get('--active-version-view')!, 'utf8'),
      readFile(values.get('--wrangler-config')!, 'utf8'), readFile(values.get('--d1-inventory')!, 'utf8'),
    ]);
    await writeRecord(verifyProductionControlUnchanged({ controlText, deploymentsText, activeVersionViewText, wranglerConfigText, d1InventoryText }), values.get('--output')!); return;
  }
  if (command === 'capture-environment-isolation') {
    const values = exactArgs(argv.slice(1), command, [
      '--production-deployments', '--production-active-version-view', '--preview-deployments', '--preview-active-version-view',
      '--wrangler-config', '--d1-inventory', '--output',
    ]);
    const [productionDeploymentsText, productionActiveVersionViewText, previewDeploymentsText, previewActiveVersionViewText, wranglerConfigText, d1InventoryText] = await Promise.all([
      readFile(values.get('--production-deployments')!, 'utf8'), readFile(values.get('--production-active-version-view')!, 'utf8'),
      readFile(values.get('--preview-deployments')!, 'utf8'), readFile(values.get('--preview-active-version-view')!, 'utf8'),
      readFile(values.get('--wrangler-config')!, 'utf8'), readFile(values.get('--d1-inventory')!, 'utf8'),
    ]);
    await writeRecord(captureEnvironmentIsolationReceipt({
      productionDeploymentsText, productionActiveVersionViewText, previewDeploymentsText, previewActiveVersionViewText,
      wranglerConfigText, d1InventoryText,
    }), values.get('--output')!);
    return;
  }
  if (command === 'capture-predecessor') {
    const values = exactArgs(argv.slice(1), command, ['--deployments', '--predecessor-version-view', '--wrangler-config', '--d1-inventory', '--output']);
    const [deploymentsText, predecessorVersionViewText, wranglerConfigText, d1InventoryText] = await Promise.all([
      readFile(values.get('--deployments')!, 'utf8'), readFile(values.get('--predecessor-version-view')!, 'utf8'),
      readFile(values.get('--wrangler-config')!, 'utf8'), readFile(values.get('--d1-inventory')!, 'utf8'),
    ]);
    await writeRecord(captureProductionPredecessorAnchor({ deploymentsText, predecessorVersionViewText, wranglerConfigText, d1InventoryText }), values.get('--output')!); return;
  }
  if (command === 'observe-post-mutation' || command === 'reconcile-post-mutation') {
    const values = exactArgs(argv.slice(1), command, ['--predecessor-anchor', '--deployments', '--observed-active-version-view', '--wrangler-config', '--output']);
    const [predecessorAnchorText, postMutationDeploymentsText, observedActiveVersionViewText, wranglerConfigText] = await Promise.all([
      readFile(values.get('--predecessor-anchor')!, 'utf8'), readFile(values.get('--deployments')!, 'utf8'),
      readFile(values.get('--observed-active-version-view')!, 'utf8'), readFile(values.get('--wrangler-config')!, 'utf8'),
    ]);
    const input = { predecessorAnchorText, postMutationDeploymentsText, observedActiveVersionViewText, wranglerConfigText };
    await writeRecord(command === 'observe-post-mutation' ? observeProductionPostMutation(input) : reconcileProductionPostMutation(input), values.get('--output')!); return;
  }
  fail('production command must be candidate-d1-name, active-version-id, capture-control, verify-control, capture-environment-isolation, capture-predecessor, reconcile-post-mutation, or observe-post-mutation');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
