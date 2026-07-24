#!/usr/bin/env tsx
/** Apply one reviewed seed manifest to an explicitly confirmed preview D1 name. */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSeedManifestApplicationOrder,
  loadAndVerifyD1SeedManifest,
  type SeedManifest,
} from './d1-seed-manifest.js';
import {
  ensureWranglerLogDirectory,
  formatWranglerCommandFailure,
} from './wrangler-command-utils.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER_MAX_BUFFER = 16 * 1024 * 1024;

export const PREVIEW_D1_ENV = 'preview';

export interface PreviewD1SeedOptions {
  remote: true;
  candidateD1Name: string;
  confirmedCandidateD1Name: string;
}

export type PreviewD1SeedExecutor = (args: string[]) => string | Buffer;

export interface PreviewD1SeedDependencies {
  root?: string;
  seedRoot?: string;
  loadManifest?: (root: string, seedRoot: string) => SeedManifest;
  execute?: PreviewD1SeedExecutor;
}

function assertCandidateD1Name(value: string, flag: string): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(value)) {
    throw new Error(`${flag} must be a literal D1 database name`);
  }
}

/**
 * Refuse every convenience form that could quietly change the target. In
 * particular, --env is not accepted: this runner can only use preview.
 */
export function parsePreviewD1SeedArguments(argv: string[]): PreviewD1SeedOptions {
  let remote = false;
  let candidateD1Name: string | undefined;
  let confirmedCandidateD1Name: string | undefined;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--remote') {
      if (remote) throw new Error('--remote may only be specified once');
      remote = true;
      continue;
    }
    if (argument === '--candidate-d1-name' || argument === '--confirm-candidate-d1-name') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a literal D1 database name`);
      assertCandidateD1Name(value, argument);
      if (argument === '--candidate-d1-name') {
        if (candidateD1Name !== undefined) throw new Error('--candidate-d1-name may only be specified once');
        candidateD1Name = value;
      } else {
        if (confirmedCandidateD1Name !== undefined) {
          throw new Error('--confirm-candidate-d1-name may only be specified once');
        }
        confirmedCandidateD1Name = value;
      }
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!remote) throw new Error('Refusing remote D1 seed without the literal --remote flag');
  if (!candidateD1Name) throw new Error('--candidate-d1-name is required');
  if (!confirmedCandidateD1Name) throw new Error('--confirm-candidate-d1-name is required');
  if (candidateD1Name !== confirmedCandidateD1Name) {
    throw new Error('Candidate D1 name and confirmation must match exactly');
  }
  return { remote: true, candidateD1Name, confirmedCandidateD1Name };
}

function createPinnedWranglerExecutor(root: string): PreviewD1SeedExecutor {
  const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!existsSync(wrangler)) {
    throw new Error('Pinned local Wrangler is unavailable; run npm ci before applying a seed');
  }
  const wranglerLogDirectory = join(root, 'test-output', 'wrangler', 'logs');
  ensureWranglerLogDirectory(wranglerLogDirectory);
  return args => execFileSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: wranglerLogDirectory,
      WRANGLER_SEND_METRICS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: WRANGLER_MAX_BUFFER,
  });
}

function partialTargetFailure(filePath: string, error: unknown): Error {
  return new Error(
    `Preview D1 seed stopped at ${filePath}. Do not retry or resume this partial target; ` +
    'abandon it, create a new empty preview D1 database, and restart from the empty-target guard.\n' +
    formatWranglerCommandFailure(error),
  );
}

/**
 * Validation happens before the executor is constructed or called. The
 * synchronous executor is deliberately invoked exactly once per manifest file
 * in manifest order; failures stop the sequence without retry or checkpoint.
 */
export function applyPreviewD1Seed(
  options: PreviewD1SeedOptions,
  dependencies: PreviewD1SeedDependencies = {},
): void {
  if (options.remote !== true) throw new Error('Refusing a preview seed without remote execution');
  assertCandidateD1Name(options.candidateD1Name, '--candidate-d1-name');
  if (options.candidateD1Name !== options.confirmedCandidateD1Name) {
    throw new Error('Candidate D1 name and confirmation must match exactly');
  }

  const root = resolve(dependencies.root ?? ROOT);
  const seedRoot = resolve(dependencies.seedRoot ?? join(root, 'scripts', 'd1-seed'));
  const configPath = join(root, 'wrangler.toml');
  let manifest: SeedManifest;
  try {
    manifest = (dependencies.loadManifest ?? loadAndVerifyD1SeedManifest)(root, seedRoot);
    assertSeedManifestApplicationOrder(manifest);
  } catch (error) {
    throw new Error(`Preview D1 seed refused before any remote command:\n${formatWranglerCommandFailure(error)}`);
  }

  const execute = dependencies.execute ?? createPinnedWranglerExecutor(root);
  for (const [index, file] of manifest.files.entries()) {
    const args = [
      'd1',
      'execute',
      options.candidateD1Name,
      '--remote',
      '--env',
      PREVIEW_D1_ENV,
      '--config',
      configPath,
      '--file',
      join(seedRoot, file.path),
    ];
    console.error(
      `[d1:seed:apply-preview] ${index + 1}/${manifest.files.length} ` +
      `${file.path} sha256=${file.sha256}`,
    );
    try {
      execute(args);
    } catch (error) {
      throw partialTargetFailure(file.path, error);
    }
  }
  console.error(
    `[d1:seed:apply-preview] Applied ${manifest.files.length} reviewed seed files to ` +
    `${options.candidateD1Name} in ${PREVIEW_D1_ENV}.`,
  );
}

export function main(argv: string[]): void {
  applyPreviewD1Seed(parsePreviewD1SeedArguments(argv));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`[d1:seed:apply-preview] ${formatWranglerCommandFailure(error)}`);
    process.exitCode = 1;
  }
}
