#!/usr/bin/env tsx
/**
 * Prepare one newly-created production D1 candidate without changing the
 * active Worker binding. This is deliberately a narrow, fail-stop companion
 * to the preview candidate preparer: it cannot create, delete, bind, deploy,
 * retry, resume, or select another environment.
 *
 * The checked-in data manifest and seed manifest supply the migration and
 * transform identity. The caller supplies the separately created candidate's
 * exact name and UUID twice; both dimensions are resolved from a fresh D1
 * inventory before target SQL can begin.
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import { runRemoteD1ReadinessCheck } from './check-remote-d1-readiness.js';
import {
  assertSeedManifestApplicationOrder,
  loadAndVerifyD1SeedManifest,
  type SeedManifest,
} from './d1-seed-manifest.js';
import {
  PRISTINE_D1_PREFLIGHT_SQL,
  parsePristineD1PreflightResult,
  parseUniqueD1Inventory,
  type CandidateD1InventoryEntry,
  type CandidateConfigFilesystem,
  type CandidatePreparationExecutor,
  type TemporaryCandidateConfig,
} from './prepare-preview-d1-candidate.js';
import { ensureWranglerLogDirectory, formatWranglerCommandFailure } from './wrangler-command-utils.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATE_BINDING = 'THEOLOGAI_DB';
const WRANGLER_MAX_BUFFER = 16 * 1024 * 1024;
const MAX_CANDIDATE_AGE_MS = 36 * 60 * 60 * 1000;
const MAX_FUTURE_CREATION_SKEW_MS = 5 * 60 * 1000;
const UTC_DAY_MS = 24 * 60 * 60 * 1000;

export interface ProductionD1CandidatePreparationOptions {
  remote: true;
  candidateD1Name: string;
  candidateD1Id: string;
  confirmedCandidateD1Name: string;
  confirmedCandidateD1Id: string;
}

export interface ProductionD1CandidatePreparationDependencies {
  root?: string;
  seedRoot?: string;
  loadManifest?: (root: string, seedRoot: string) => SeedManifest;
  execute?: CandidatePreparationExecutor;
  createTemporaryConfig?: (input: { root: string; candidateD1Name: string; candidateD1Id: string }) => TemporaryCandidateConfig;
  runReadiness?: (input: { database: typeof CANDIDATE_BINDING; configPath: string; root: string }) => void;
  /** Injectable only for deterministic freshness tests; production uses wall time. */
  now?: () => Date;
}

function isCanonicalUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

function assertCandidateD1Name(value: string, flag: string): void {
  const match = /^theologai-production-([0-9]{4})([0-9]{2})([0-9]{2})-[a-z0-9][a-z0-9-]{0,31}$/.exec(value);
  if (!match) {
    throw new Error(`${flag} must be a literal, lowercase theologai-production-YYYYMMDD-suffix candidate name`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`${flag} must contain a real Gregorian YYYYMMDD calendar date`);
  }
}

function assertCandidateD1Id(value: string, flag: string): void {
  if (!isCanonicalUuid(value)) throw new Error(`${flag} must be a canonical lowercase D1 UUID`);
}

function candidateNameUtcDay(value: string): number {
  const match = /^theologai-production-([0-9]{4})([0-9]{2})([0-9]{2})-/.exec(value);
  if (!match) throw new Error('Production candidate name lost its validated calendar date');
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * D1 list returns `created_at` as an ISO-8601 timestamp. The candidate label
 * permits one UTC-day of difference so creation near a local midnight remains
 * valid in every time zone, while the 36-hour age ceiling prevents a stale
 * pre-existing database from being selected by an otherwise exact name/UUID.
 */
function assertFreshCandidateInventory(
  inventoryText: string,
  options: Pick<ProductionD1CandidatePreparationOptions, 'candidateD1Name' | 'candidateD1Id'>,
  now: Date,
): CandidateD1InventoryEntry {
  if (!Number.isFinite(now.getTime())) throw new Error('Production candidate freshness clock is invalid');
  const resolved = parseUniqueD1Inventory(inventoryText, options);
  let parsed: unknown;
  try { parsed = JSON.parse(inventoryText) as unknown; }
  catch { throw new Error('D1 inventory is not valid JSON'); }
  if (!Array.isArray(parsed)) throw new Error('D1 inventory must be an array');
  const matches = parsed.filter(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return record.name === options.candidateD1Name && record.uuid === options.candidateD1Id;
  });
  if (matches.length !== 1) throw new Error('Candidate D1 name/UUID pair does not resolve to exactly one inventory entry');
  const createdAt = (matches[0] as Record<string, unknown>).created_at;
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error('Exact production candidate D1 inventory entry must include a valid created_at timestamp');
  }
  const createdMs = Date.parse(createdAt);
  const ageMs = now.getTime() - createdMs;
  if (ageMs < -MAX_FUTURE_CREATION_SKEW_MS) {
    throw new Error('Exact production candidate D1 inventory entry has a created_at timestamp too far in the future');
  }
  if (ageMs > MAX_CANDIDATE_AGE_MS) {
    throw new Error('Exact production candidate D1 inventory entry is older than the 36-hour fresh-candidate window');
  }
  const created = new Date(createdMs);
  const createdUtcDay = Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate());
  if (Math.abs(candidateNameUtcDay(options.candidateD1Name) - createdUtcDay) > UTC_DAY_MS) {
    throw new Error('Exact production candidate D1 name date is not within one UTC day of the authoritative created_at timestamp');
  }
  return resolved;
}

/** Reject every convenience option before the read-only D1 inventory call. */
export function parseProductionD1CandidatePreparationArguments(
  argv: readonly string[],
): ProductionD1CandidatePreparationOptions {
  let remote = false;
  let candidateD1Name: string | undefined;
  let candidateD1Id: string | undefined;
  let confirmedCandidateD1Name: string | undefined;
  let confirmedCandidateD1Id: string | undefined;

  const assign = (flag: string, value: string): void => {
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a literal value`);
    if (flag.endsWith('-name')) assertCandidateD1Name(value, flag);
    else assertCandidateD1Id(value, flag);
    if (flag === '--candidate-d1-name') {
      if (candidateD1Name !== undefined) throw new Error(`${flag} may only be specified once`);
      candidateD1Name = value;
    } else if (flag === '--candidate-d1-id') {
      if (candidateD1Id !== undefined) throw new Error(`${flag} may only be specified once`);
      candidateD1Id = value;
    } else if (flag === '--confirm-candidate-d1-name') {
      if (confirmedCandidateD1Name !== undefined) throw new Error(`${flag} may only be specified once`);
      confirmedCandidateD1Name = value;
    } else {
      if (confirmedCandidateD1Id !== undefined) throw new Error(`${flag} may only be specified once`);
      confirmedCandidateD1Id = value;
    }
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--remote') {
      if (remote) throw new Error('--remote may only be specified once');
      remote = true;
      continue;
    }
    if (argument === '--candidate-d1-name' || argument === '--candidate-d1-id'
      || argument === '--confirm-candidate-d1-name' || argument === '--confirm-candidate-d1-id') {
      assign(argument, argv[++index] ?? '');
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!remote) throw new Error('Refusing production candidate preparation without the literal --remote flag');
  if (!candidateD1Name || !candidateD1Id || !confirmedCandidateD1Name || !confirmedCandidateD1Id) {
    throw new Error('Candidate name, UUID, and both repeated confirmations are required');
  }
  if (candidateD1Name !== confirmedCandidateD1Name || candidateD1Id !== confirmedCandidateD1Id) {
    throw new Error('Candidate D1 name and canonical lowercase UUID confirmations must match byte-for-byte');
  }
  return { remote: true, candidateD1Name, candidateD1Id, confirmedCandidateD1Name, confirmedCandidateD1Id };
}

function assertCandidateIsNotCheckedInProduction(root: string, options: ProductionD1CandidatePreparationOptions): void {
  let parsed: unknown;
  try { parsed = parseToml(readFileSync(join(root, 'wrangler.toml'), 'utf8')); }
  catch (error) { throw new Error(`Unable to inspect checked-in production binding: ${formatWranglerCommandFailure(error)}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Checked-in Wrangler config must be an object');
  const config = parsed as Record<string, unknown>;
  if (config.name !== 'theologai' || !Array.isArray(config.d1_databases) || config.d1_databases.length !== 1) {
    throw new Error('Checked-in Wrangler config must expose exactly one production D1 binding');
  }
  const binding = config.d1_databases[0];
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) throw new Error('Checked-in production D1 binding is invalid');
  const record = binding as Record<string, unknown>;
  if (record.binding !== CANDIDATE_BINDING || typeof record.database_name !== 'string'
    || typeof record.database_id !== 'string' || !isCanonicalUuid(record.database_id)) {
    throw new Error('Checked-in production D1 binding is not canonical');
  }
  if (record.database_name === options.candidateD1Name || record.database_id === options.candidateD1Id) {
    throw new Error('Candidate must not equal the checked-in active production D1 binding');
  }
}

/** A one-binding config which cannot be used to deploy a Worker. */
export function renderProductionCandidateConfig(input: { root: string; candidateD1Name: string; candidateD1Id: string }): string {
  assertCandidateD1Name(input.candidateD1Name, 'candidate D1 name');
  assertCandidateD1Id(input.candidateD1Id, 'candidate D1 UUID');
  return [
    '# Generated by scripts/prepare-production-d1-candidate.ts. Never commit or deploy this file.',
    'name = "theologai-production-d1-preparation-never-deploy"',
    'main = "__candidate_preparation_must_not_deploy__.ts"',
    'compatibility_date = "2026-07-09"',
    'workers_dev = false',
    '',
    '[[d1_databases]]',
    `binding = "${CANDIDATE_BINDING}"`,
    `database_name = "${input.candidateD1Name}"`,
    `database_id = "${input.candidateD1Id}"`,
    `migrations_dir = ${JSON.stringify(resolve(input.root, 'migrations'))}`,
    '',
  ].join('\n');
}

export function createTemporaryProductionCandidateConfig(input: { root: string; candidateD1Name: string; candidateD1Id: string }, filesystem: CandidateConfigFilesystem = {
  mkdtemp: mkdtempSync, chmod: chmodSync, write: writeFileSync, read: readFileSync, remove: rmSync,
}): TemporaryCandidateConfig {
  let directory: string | undefined;
  try {
    directory = filesystem.mkdtemp(join(tmpdir(), 'theologai-production-d1-candidate-'));
    filesystem.chmod(directory, 0o700);
    const path = join(directory, 'wrangler.candidate.toml');
    const expected = renderProductionCandidateConfig(input);
    filesystem.write(path, expected, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return {
      path,
      assertIntact: () => {
        if (filesystem.read(path, 'utf8') !== expected) throw new Error('Generated candidate-only Wrangler config changed during preparation');
      },
      cleanup: () => filesystem.remove(directory!, { recursive: true, force: true }),
    };
  } catch (error) {
    if (directory) {
      try { filesystem.remove(directory, { recursive: true, force: true }); }
      catch (cleanupError) { throw new Error(`${formatWranglerCommandFailure(error)}\nCandidate-config cleanup also failed: ${formatWranglerCommandFailure(cleanupError)}`); }
    }
    throw error;
  }
}

function createPinnedWranglerExecutor(root: string): CandidatePreparationExecutor {
  const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!existsSync(wrangler)) throw new Error('Pinned local Wrangler is unavailable; run npm ci before candidate preparation');
  const logs = join(root, 'test-output', 'wrangler', 'logs');
  ensureWranglerLogDirectory(logs);
  return args => execFileSync(process.execPath, [wrangler, ...args], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: WRANGLER_MAX_BUFFER,
    env: { ...process.env, WRANGLER_LOG_PATH: logs, WRANGLER_SEND_METRICS: 'false' },
  });
}

function partialTargetFailure(stage: 'migration' | 'seed' | 'readiness', detail: string, error: unknown): Error {
  return new Error(
    `Production D1 candidate preparation stopped after target SQL may have begun during ${stage}${detail}. ` +
    'Do not retry, resume, repair, bind, deploy, or reuse this partial target; abandon it, create a new empty production D1 candidate, and restart from the empty-target guard.\n' +
    formatWranglerCommandFailure(error),
  );
}

function cleanupFailure(primary: unknown, cleanup: unknown): Error {
  const primaryMessage = primary instanceof Error ? primary.message : formatWranglerCommandFailure(primary);
  return new Error(
    `${primaryMessage}\nSecondary temporary candidate-config cleanup failure (the primary phase result is unchanged):\n` +
    formatWranglerCommandFailure(cleanup),
  );
}

function runPristinePreflight(execute: CandidatePreparationExecutor, configPath: string): void {
  let result: string | Buffer;
  try {
    result = execute(['d1', 'execute', CANDIDATE_BINDING, '--remote', '--config', configPath, '--command', PRISTINE_D1_PREFLIGHT_SQL, '--json']);
  } catch (error) {
    throw new Error(`Production D1 pristine preflight failed before target SQL may begin:\n${formatWranglerCommandFailure(error)}`);
  }
  parsePristineD1PreflightResult(Buffer.isBuffer(result) ? result.toString('utf8') : result);
}

/**
 * The executor is called exactly once for inventory, once for preflight, once
 * for migrations, then once per manifest file in manifest order. No retry or
 * resume path exists. The readiness helper includes both Transform-8 and
 * Transform-9 authority audits derived from the checked-in seed identity.
 */
export function prepareProductionD1Candidate(
  options: ProductionD1CandidatePreparationOptions,
  dependencies: ProductionD1CandidatePreparationDependencies = {},
): void {
  if (options.remote !== true) throw new Error('Refusing production candidate preparation without remote execution');
  assertCandidateD1Name(options.candidateD1Name, '--candidate-d1-name');
  assertCandidateD1Id(options.candidateD1Id, '--candidate-d1-id');
  if (options.candidateD1Name !== options.confirmedCandidateD1Name || options.candidateD1Id !== options.confirmedCandidateD1Id) {
    throw new Error('Candidate D1 name and canonical lowercase UUID confirmations must match byte-for-byte');
  }
  const root = resolve(dependencies.root ?? ROOT);
  const seedRoot = resolve(dependencies.seedRoot ?? join(root, 'scripts', 'd1-seed'));
  let manifest: SeedManifest;
  try {
    manifest = (dependencies.loadManifest ?? loadAndVerifyD1SeedManifest)(root, seedRoot);
    assertSeedManifestApplicationOrder(manifest);
    assertCandidateIsNotCheckedInProduction(root, options);
  } catch (error) {
    throw new Error(`Production D1 candidate preparation refused before any remote command:\n${formatWranglerCommandFailure(error)}`);
  }

  const execute = dependencies.execute ?? createPinnedWranglerExecutor(root);
  let inventory: CandidateD1InventoryEntry;
  try {
    const result = execute(['d1', 'list', '--json']);
    inventory = assertFreshCandidateInventory(
      Buffer.isBuffer(result) ? result.toString('utf8') : result,
      options,
      (dependencies.now ?? (() => new Date()))(),
    );
  } catch (error) {
    throw new Error(`Production D1 candidate preparation refused before target SQL may begin:\n${formatWranglerCommandFailure(error)}`);
  }
  if (inventory.databaseName !== options.candidateD1Name || inventory.databaseId !== options.candidateD1Id) {
    throw new Error('Production D1 inventory identity drifted after exact-pair resolution');
  }

  let config: TemporaryCandidateConfig | undefined;
  let primaryFailure: unknown;
  try {
    try {
      config = (dependencies.createTemporaryConfig ?? createTemporaryProductionCandidateConfig)({
        root, candidateD1Name: options.candidateD1Name, candidateD1Id: options.candidateD1Id,
      });
      config.assertIntact();
    } catch (error) {
      throw new Error(`Production D1 candidate preparation refused before target SQL may begin (candidate-only config generation):\n${formatWranglerCommandFailure(error)}`);
    }
    const candidateConfig = config;
    if (!candidateConfig) throw new Error('Production candidate-only config was not created');
    try {
      candidateConfig.assertIntact();
      runPristinePreflight(execute, candidateConfig.path);
    } catch (error) {
      throw new Error(`Production D1 candidate preparation refused before target SQL may begin (pristine target preflight):\n${formatWranglerCommandFailure(error)}`);
    }
    candidateConfig.assertIntact();
    try { execute(['d1', 'migrations', 'apply', CANDIDATE_BINDING, '--remote', '--config', candidateConfig.path]); }
    catch (error) { throw partialTargetFailure('migration', '', error); }
    for (const [index, file] of manifest.files.entries()) {
      candidateConfig.assertIntact();
      try {
        execute(['d1', 'execute', CANDIDATE_BINDING, '--remote', '--config', candidateConfig.path, '--file', join(seedRoot, file.path)]);
      } catch (error) { throw partialTargetFailure('seed', ` ${index + 1}/${manifest.files.length} (${file.path})`, error); }
    }
    candidateConfig.assertIntact();
    const runReadiness = dependencies.runReadiness ?? (input => runRemoteD1ReadinessCheck({
      database: input.database, configPath: input.configPath, cwd: input.root,
      wrangler: join(input.root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    }));
    try { runReadiness({ database: CANDIDATE_BINDING, configPath: candidateConfig.path, root }); }
    catch (error) { throw partialTargetFailure('readiness', ' and Transform-8/9 authority audit', error); }
  } catch (error) {
    primaryFailure = error;
  }
  let cleanupError: unknown;
  if (config) {
    try { config.cleanup(); } catch (error) { cleanupError = error; }
  }
  if (primaryFailure !== undefined) {
    if (cleanupError !== undefined) throw cleanupFailure(primaryFailure, cleanupError);
    throw primaryFailure;
  }
  if (cleanupError !== undefined) {
    throw new Error(
      'Production candidate preparation completed, but temporary candidate-config cleanup failed. ' +
      'No binding or deployment was performed.\n' + formatWranglerCommandFailure(cleanupError),
    );
  }
}

export function main(argv: readonly string[]): void {
  prepareProductionD1Candidate(parseProductionD1CandidatePreparationArguments(argv));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`[d1:production:candidate:prepare] ${formatWranglerCommandFailure(error)}`); process.exitCode = 1; }
}
