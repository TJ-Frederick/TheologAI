#!/usr/bin/env tsx
/**
 * Prepare one newly-created preview D1 candidate without touching an existing
 * Worker binding. This is the only operational entrypoint for remote preview
 * migrations + full seed + readiness. It intentionally has no deploy, bind,
 * delete, retry, resume, arbitrary-config, or arbitrary-environment surface.
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import {
  applyPreviewD1Seed,
  type PreviewD1SeedDependencies,
  type PreviewD1SeedExecutor,
} from './apply-preview-d1-seed.js';
import { runRemoteD1ReadinessCheck } from './check-remote-d1-readiness.js';
import { loadAndVerifyD1SeedManifest, type SeedManifest } from './d1-seed-manifest.js';
import { ensureWranglerLogDirectory, formatWranglerCommandFailure } from './wrangler-command-utils.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER_MAX_BUFFER = 16 * 1024 * 1024;
const PREVIEW_ENV = 'preview';
const CANDIDATE_BINDING = 'THEOLOGAI_DB';

/**
 * A D1 is pristine only when SQLite reports no non-internal schema objects.
 * That is intentionally stricter than checking only application tables: a
 * migration ledger, abandoned table, trigger, index, view, or FTS shadow
 * table all make the target ineligible for a fresh full corpus import.
 */
export const PRISTINE_D1_PREFLIGHT_SQL = `SELECT
  type AS object_type,
  name AS object_name,
  CASE WHEN lower(name) GLOB '*migration*' THEN 1 ELSE 0 END AS migration_state
FROM sqlite_schema
WHERE name NOT GLOB 'sqlite_*' OR lower(name) GLOB '*migration*'
ORDER BY type, name;`;

export interface PreviewD1CandidatePreparationOptions {
  remote: true;
  candidateD1Name: string;
  candidateD1Id: string;
  confirmedCandidateD1Name: string;
  confirmedCandidateD1Id: string;
}

export interface CandidateD1InventoryEntry {
  databaseName: string;
  databaseId: string;
}

export interface TemporaryCandidateConfig {
  path: string;
  assertIntact(): void;
  cleanup(): void;
}

/** Minimal filesystem seam for deterministic construction-failure tests. */
export interface CandidateConfigFilesystem {
  mkdtemp(prefix: string): string;
  chmod(path: string, mode: number): void;
  write(path: string, data: string, options: { encoding: 'utf8'; mode: number; flag: 'wx' }): void;
  read(path: string, encoding: 'utf8'): string;
  remove(path: string, options: { recursive: true; force: true }): void;
}

export type CandidatePreparationExecutor = PreviewD1SeedExecutor;
export type CandidateReadinessRunner = (input: {
  database: typeof CANDIDATE_BINDING;
  env: typeof PREVIEW_ENV;
  configPath: string;
  root: string;
}) => void;

export interface PreviewD1CandidatePreparationDependencies {
  root?: string;
  seedRoot?: string;
  loadManifest?: (root: string, seedRoot: string) => SeedManifest;
  execute?: CandidatePreparationExecutor;
  createTemporaryConfig?: (input: {
    root: string;
    candidateD1Name: string;
    candidateD1Id: string;
  }) => TemporaryCandidateConfig;
  runReadiness?: CandidateReadinessRunner;
}

function isCanonicalUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

function assertCandidateD1Name(value: string, flag: string): void {
  // Candidate names deliberately have a date and unique suffix. This excludes
  // generic names and makes accidentally addressing a stable preview binding
  // impossible unless it is also explicitly configured as a new candidate.
  if (!/^theologai-preview-[0-9]{8}-[a-z0-9][a-z0-9-]{0,31}$/.test(value)) {
    throw new Error(`${flag} must be a literal, lowercase theologai-preview-YYYYMMDD-suffix candidate name`);
  }
}

function assertCandidateD1Id(value: string, flag: string): void {
  if (!isCanonicalUuid(value)) throw new Error(`${flag} must be a canonical lowercase D1 UUID`);
}

/** Reject every convenience option before any read-only inventory call. */
export function parsePreviewD1CandidatePreparationArguments(
  argv: readonly string[],
): PreviewD1CandidatePreparationOptions {
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

  if (!remote) throw new Error('Refusing candidate preparation without the literal --remote flag');
  if (!candidateD1Name || !candidateD1Id || !confirmedCandidateD1Name || !confirmedCandidateD1Id) {
    throw new Error('Candidate name, UUID, and both repeated confirmations are required');
  }
  if (candidateD1Name !== confirmedCandidateD1Name || candidateD1Id !== confirmedCandidateD1Id) {
    throw new Error('Candidate D1 name and canonical lowercase UUID confirmations must match byte-for-byte');
  }
  return { remote: true, candidateD1Name, candidateD1Id, confirmedCandidateD1Name, confirmedCandidateD1Id };
}

/**
 * Resolve the target by both identity dimensions and reject ambiguous control
 * plane output before any migration or seed command becomes possible.
 */
export function parseUniqueD1Inventory(
  inventoryText: string,
  options: Pick<PreviewD1CandidatePreparationOptions, 'candidateD1Name' | 'candidateD1Id'>,
): CandidateD1InventoryEntry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(inventoryText) as unknown;
  } catch {
    throw new Error('D1 inventory is not valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('D1 inventory must be a nonempty array');
  const entries = parsed.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`D1 inventory entry ${index} must be an object`);
    }
    const record = value as Record<string, unknown>;
    if (typeof record.name !== 'string' || !isCanonicalUuid(typeof record.uuid === 'string' ? record.uuid : '')) {
      throw new Error(`D1 inventory entry ${index} has an invalid name or UUID`);
    }
    return { databaseName: record.name, databaseId: record.uuid as string };
  });
  if (new Set(entries.map(entry => entry.databaseName)).size !== entries.length) {
    throw new Error('D1 inventory contains duplicate database names');
  }
  if (new Set(entries.map(entry => entry.databaseId)).size !== entries.length) {
    throw new Error('D1 inventory contains duplicate database UUIDs');
  }
  const matches = entries.filter(entry => entry.databaseName === options.candidateD1Name
    && entry.databaseId === options.candidateD1Id);
  if (matches.length !== 1) {
    throw new Error('Candidate D1 name/UUID pair does not resolve to exactly one fresh inventory entry');
  }
  return matches[0]!;
}

function assertCandidateIsNotCheckedInPreview(root: string, options: PreviewD1CandidatePreparationOptions): void {
  const configPath = join(root, 'wrangler.toml');
  let parsed: unknown;
  try {
    parsed = parseToml(readFileSync(configPath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`Unable to inspect checked-in preview binding: ${formatWranglerCommandFailure(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Checked-in Wrangler config must be an object');
  }
  const rootConfig = parsed as Record<string, unknown>;
  const env = rootConfig.env;
  if (!env || typeof env !== 'object' || Array.isArray(env)) throw new Error('Checked-in Wrangler config lacks env.preview');
  const preview = (env as Record<string, unknown>).preview;
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) throw new Error('Checked-in Wrangler config lacks env.preview');
  const databases = (preview as Record<string, unknown>).d1_databases;
  if (!Array.isArray(databases) || databases.length !== 1) {
    throw new Error('Checked-in Wrangler config must expose exactly one preview D1 binding');
  }
  const database = databases[0];
  if (!database || typeof database !== 'object' || Array.isArray(database)) throw new Error('Checked-in preview D1 binding is invalid');
  const binding = database as Record<string, unknown>;
  if (binding.binding !== CANDIDATE_BINDING || typeof binding.database_name !== 'string'
    || typeof binding.database_id !== 'string' || !isCanonicalUuid(binding.database_id)) {
    throw new Error('Checked-in preview D1 binding is not canonical');
  }
  if (binding.database_name === options.candidateD1Name
    || binding.database_id === options.candidateD1Id) {
    throw new Error('Candidate must not equal the checked-in preview D1 binding');
  }
}

/** A deliberately non-deployable, one-binding config for D1 commands only. */
export function renderPreviewCandidateConfig(input: {
  root: string;
  candidateD1Name: string;
  candidateD1Id: string;
}): string {
  assertCandidateD1Name(input.candidateD1Name, 'candidate D1 name');
  assertCandidateD1Id(input.candidateD1Id, 'candidate D1 UUID');
  const migrationsDirectory = resolve(input.root, 'migrations');
  return [
    '# Generated by scripts/prepare-preview-d1-candidate.ts. Never commit or deploy this file.',
    'name = "theologai-preview-d1-preparation-never-deploy"',
    'main = "__candidate_preparation_must_not_deploy__.ts"',
    'compatibility_date = "2026-07-09"',
    'workers_dev = false',
    '',
    '[env.preview]',
    'name = "theologai-preview-d1-preparation-never-deploy"',
    'workers_dev = false',
    '',
    '[[env.preview.d1_databases]]',
    `binding = "${CANDIDATE_BINDING}"`,
    `database_name = "${input.candidateD1Name}"`,
    `database_id = "${input.candidateD1Id}"`,
    `migrations_dir = ${JSON.stringify(migrationsDirectory)}`,
    '',
  ].join('\n');
}

export function createTemporaryPreviewCandidateConfig(input: {
  root: string;
  candidateD1Name: string;
  candidateD1Id: string;
}, filesystem: CandidateConfigFilesystem = {
  mkdtemp: mkdtempSync,
  chmod: chmodSync,
  write: writeFileSync,
  read: readFileSync,
  remove: rmSync,
}): TemporaryCandidateConfig {
  let directory: string | undefined;
  try {
    const createdDirectory = filesystem.mkdtemp(join(tmpdir(), 'theologai-preview-d1-candidate-'));
    directory = createdDirectory;
    filesystem.chmod(createdDirectory, 0o700);
    const path = join(createdDirectory, 'wrangler.candidate.toml');
    const expected = renderPreviewCandidateConfig(input);
    filesystem.write(path, expected, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return {
      path,
      assertIntact(): void {
        if (filesystem.read(path, 'utf8') !== expected) {
          throw new Error('Generated candidate-only Wrangler config changed during preparation');
        }
      },
      cleanup(): void {
        filesystem.remove(createdDirectory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    // No config object reaches the orchestrator on a construction failure, so
    // this factory owns cleanup of the directory it just created.
    if (directory) {
      try {
        filesystem.remove(directory, { recursive: true, force: true });
      } catch (cleanupError) {
        throw cleanupFailure(error, cleanupError);
      }
    }
    throw error;
  }
}

function createPinnedWranglerExecutor(root: string): CandidatePreparationExecutor {
  const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!existsSync(wrangler)) throw new Error('Pinned local Wrangler is unavailable; run npm ci before candidate preparation');
  const wranglerLogDirectory = join(root, 'test-output', 'wrangler', 'logs');
  ensureWranglerLogDirectory(wranglerLogDirectory);
  return args => execFileSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_LOG_PATH: wranglerLogDirectory, WRANGLER_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: WRANGLER_MAX_BUFFER,
  });
}

interface PristineD1SchemaObject {
  objectType: string;
  objectName: string;
  migrationState: 0 | 1;
}

/**
 * Wrangler's `--json` envelope may grow metadata, but a single `d1 execute`
 * statement must still produce exactly one successful statement result. Refuse
 * a changed or partial response rather than assuming an empty target.
 */
export function parsePristineD1PreflightResult(resultText: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultText) as unknown;
  } catch {
    throw new Error('Pristine D1 preflight did not return JSON');
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error('Pristine D1 preflight must return exactly one JSON statement result');
  }
  const statement = parsed[0];
  if (!statement || typeof statement !== 'object' || Array.isArray(statement)) {
    throw new Error('Pristine D1 preflight statement result is invalid');
  }
  const envelope = statement as Record<string, unknown>;
  if (envelope.success !== true || !Array.isArray(envelope.results)) {
    throw new Error('Pristine D1 preflight statement did not succeed');
  }
  const objects: PristineD1SchemaObject[] = envelope.results.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Pristine D1 preflight schema row ${index} is invalid`);
    }
    const row = value as Record<string, unknown>;
    if (typeof row.object_type !== 'string' || row.object_type.length === 0
      || typeof row.object_name !== 'string' || row.object_name.length === 0
      || (row.migration_state !== 0 && row.migration_state !== 1)) {
      throw new Error(`Pristine D1 preflight schema row ${index} has an unexpected shape`);
    }
    return {
      objectType: row.object_type,
      objectName: row.object_name,
      migrationState: row.migration_state,
    };
  });
  if (objects.length > 0) {
    const names = objects.map(object => `${object.objectType}:${object.objectName}`).join(', ');
    const migrationNames = objects.filter(object => object.migrationState === 1)
      .map(object => object.objectName);
    throw new Error(
      `Candidate D1 is not pristine; found non-internal sqlite_schema object(s): ${names}` +
      (migrationNames.length > 0 ? `; migration state detected: ${migrationNames.join(', ')}` : ''),
    );
  }
}

/** One read-only remote preflight, resolved only through the generated binding. */
export function runPristineD1Preflight(input: {
  configPath: string;
  execute: CandidatePreparationExecutor;
}): void {
  const response = input.execute([
    'd1', 'execute', CANDIDATE_BINDING,
    '--remote', '--env', PREVIEW_ENV, '--config', input.configPath,
    '--command', PRISTINE_D1_PREFLIGHT_SQL, '--json',
  ]);
  parsePristineD1PreflightResult(typeof response === 'string' ? response : response.toString('utf8'));
}

function preSqlFailure(phase: string, error: unknown): Error {
  return new Error(
    `Preview candidate preparation refused before any mutating target SQL (${phase}). ` +
    'No migration or seed command was issued; only local validation and read-only resolution/preflight ran.\n' +
    formatWranglerCommandFailure(error),
  );
}

function partialTargetFailure(phase: 'migration' | 'seed', error: unknown): Error {
  return new Error(
    `Preview candidate preparation stopped after target SQL may have begun during ${phase}. ` +
    'Do not retry, resume, repair, bind, or deploy this candidate; abandon it and prepare a new empty candidate only under fresh authorization.\n' +
    formatWranglerCommandFailure(error),
  );
}

function postSqlReadinessFailure(error: unknown): Error {
  return new Error(
    'Preview candidate preparation stopped because post-seed readiness failed. ' +
    'Do not bind or deploy this unverified candidate; do not repair or retry it in place.\n' +
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

/**
 * Fixed sequence: validated inventory -> generated candidate config -> one
 * migration application -> manifest-ordered seed -> read-only readiness.
 * Any failure ends the sequence; this function has no recovery action.
 */
export function preparePreviewD1Candidate(
  options: PreviewD1CandidatePreparationOptions,
  dependencies: PreviewD1CandidatePreparationDependencies = {},
): void {
  if (options.remote !== true) throw new Error('Refusing candidate preparation without remote execution');
  assertCandidateD1Name(options.candidateD1Name, '--candidate-d1-name');
  assertCandidateD1Id(options.candidateD1Id, '--candidate-d1-id');
  if (options.candidateD1Name !== options.confirmedCandidateD1Name
    || options.candidateD1Id !== options.confirmedCandidateD1Id) {
    throw new Error('Candidate D1 name and canonical lowercase UUID confirmations must match byte-for-byte');
  }

  const root = resolve(dependencies.root ?? ROOT);
  const seedRoot = resolve(dependencies.seedRoot ?? join(root, 'scripts', 'd1-seed'));
  const loadManifest = dependencies.loadManifest ?? loadAndVerifyD1SeedManifest;
  let manifest: SeedManifest;
  try {
    assertCandidateIsNotCheckedInPreview(root, options);
    manifest = loadManifest(root, seedRoot);
  } catch (error) {
    throw preSqlFailure('local candidate/manifest validation', error);
  }

  const execute = dependencies.execute ?? createPinnedWranglerExecutor(root);
  let inventoryText: string;
  try {
    const result = execute(['d1', 'list', '--json']);
    inventoryText = typeof result === 'string' ? result : result.toString('utf8');
    parseUniqueD1Inventory(inventoryText, options);
  } catch (error) {
    throw preSqlFailure('fresh D1 inventory resolution', error);
  }

  let config: TemporaryCandidateConfig | undefined;
  let primaryFailure: unknown;
  try {
    try {
      config = (dependencies.createTemporaryConfig ?? createTemporaryPreviewCandidateConfig)({
        root,
        candidateD1Name: options.candidateD1Name,
        candidateD1Id: options.candidateD1Id,
      });
      config.assertIntact();
    } catch (error) {
      throw preSqlFailure('candidate-only config generation', error);
    }
    // Keep a non-optional local reference for callbacks used during the seed
    // phase; `config` remains optional below solely so the final cleanup block
    // can distinguish pre-creation failures.
    const candidateConfig = config;
    if (!candidateConfig) throw preSqlFailure('candidate-only config generation', new Error('config was not created'));

    try {
      candidateConfig.assertIntact();
      runPristineD1Preflight({ configPath: candidateConfig.path, execute });
    } catch (error) {
      throw preSqlFailure('pristine target preflight', error);
    }

    try {
      candidateConfig.assertIntact();
      execute([
        'd1', 'migrations', 'apply', CANDIDATE_BINDING,
        '--remote', '--env', PREVIEW_ENV, '--config', candidateConfig.path,
      ]);
    } catch (error) {
      throw partialTargetFailure('migration', error);
    }

    try {
      const seedDependencies: PreviewD1SeedDependencies = {
        root,
        seedRoot,
        loadManifest: () => manifest,
        execute: args => {
          candidateConfig.assertIntact();
          return execute(args);
        },
      };
      applyPreviewD1Seed({
        remote: true,
        candidateD1Name: options.candidateD1Name,
        confirmedCandidateD1Name: options.confirmedCandidateD1Name,
        candidateConfigPath: candidateConfig.path,
      }, seedDependencies);
    } catch (error) {
      throw partialTargetFailure('seed', error);
    }

    try {
      candidateConfig.assertIntact();
      const readiness = dependencies.runReadiness ?? (input => runRemoteD1ReadinessCheck({
        database: input.database,
        env: input.env,
        configPath: input.configPath,
        cwd: input.root,
        wrangler: join(input.root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
      }));
      readiness({ database: CANDIDATE_BINDING, env: PREVIEW_ENV, configPath: candidateConfig.path, root });
    } catch (error) {
      throw postSqlReadinessFailure(error);
    }
  } catch (error) {
    primaryFailure = error;
  }

  let secondaryCleanupFailure: unknown;
  if (config) {
    try {
      config.cleanup();
    } catch (error) {
      secondaryCleanupFailure = error;
    }
  }
  if (primaryFailure !== undefined) {
    if (secondaryCleanupFailure !== undefined) throw cleanupFailure(primaryFailure, secondaryCleanupFailure);
    throw primaryFailure;
  }
  if (secondaryCleanupFailure !== undefined) {
    throw new Error(
      'Preview candidate preparation completed, but temporary candidate-config cleanup failed. ' +
      'No binding or deployment was performed.\n' + formatWranglerCommandFailure(secondaryCleanupFailure),
    );
  }
}

export function main(argv: readonly string[]): void {
  preparePreviewD1Candidate(parsePreviewD1CandidatePreparationArguments(argv));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`[d1:preview:candidate:prepare] ${formatWranglerCommandFailure(error)}`);
    process.exitCode = 1;
  }
}
