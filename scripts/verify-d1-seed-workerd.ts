#!/usr/bin/env tsx
/** Import the complete generated seed through Wrangler's isolated local D1 runtime. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndVerifyD1SeedManifest } from './d1-seed-manifest.js';
import { parseDataManifest } from './d1-corpus-identity.js';
import {
  auditHistoricalTransform8Authority,
  parseHistoricalTransform8D1Page,
} from './historical-transform8-authority-audit.js';
import {
  auditHistoricalTransform9Authority,
  parseHistoricalTransform9D1Page,
} from './historical-transform9-authority-audit.js';
import {
  buildD1ReadinessSql,
  REQUIRED_COLUMNS,
} from './check-remote-d1-readiness.js';
import { buildWorkerdSchemaStateSql } from './d1-workerd-verifier-utils.js';
import {
  ensureWranglerLogDirectory,
  formatWranglerCommandFailure,
} from './wrangler-command-utils.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_ROOT = join(ROOT, 'scripts', 'd1-seed');
const manifest = loadAndVerifyD1SeedManifest(ROOT, SEED_ROOT);
const sourceManifest = parseDataManifest(readFileSync(join(ROOT, 'data', 'data-manifest.json')));
const state = mkdtempSync(join(tmpdir(), 'theologai-wrangler-d1-'));
const wrangler = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const wranglerLogDirectory = join(ROOT, 'test-output', 'wrangler', 'logs');
ensureWranglerLogDirectory(wranglerLogDirectory);

function run(args: string[]): string {
  try {
    return execFileSync(process.execPath, [wrangler, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: wranglerLogDirectory,
        WRANGLER_SEND_METRICS: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`Wrangler local D1 verification failed:\n${formatWranglerCommandFailure(error)}`);
  }
}

try {
  const common = ['THEOLOGAI_DB', '--local', '--persist-to', state, '--config', 'wrangler.toml'];
  run(['d1', 'migrations', 'apply', ...common]);
  const migrationNames = sourceManifest.materializations.d1.migrations.map(migration => basename(migration.path));
  const schemaState = run([
    'd1',
    'execute',
    ...common,
    '--command',
    buildWorkerdSchemaStateSql(migrationNames, REQUIRED_COLUMNS),
    '--json',
  ]);
  if (!schemaState.includes('schema-ready')) throw new Error('Wrangler-applied migration state was not verified');

  // A sampled import would not prove relational integrity across Transform 7.
  // The preceding generated-SQLite verification measures the same complete,
  // deterministic corpus against the 350 MiB capacity ceiling. Workerd
  // intentionally blocks SQLite page-count PRAGMAs, so this phase proves that
  // every generated statement is accepted by its local D1 runtime instead.
  for (const [index, file] of manifest.files.entries()) {
    if (!/^[a-z0-9-]+-\d{3}\.sql$/.test(file.path)) {
      throw new Error(`Unsafe generated seed path: ${file.path}`);
    }
    console.error(`[verify-d1-seed-workerd] ${index + 1}/${manifest.files.length} ${file.path}`);
    run(['d1', 'execute', ...common, '--file', join(SEED_ROOT, file.path)]);
  }

  const readiness = parseHistoricalTransform8D1Page(run([
    'd1',
    'execute',
    ...common,
    '--command',
    buildD1ReadinessSql(sourceManifest.expectedCounts),
    '--json',
  ]));
  if (readiness.rows.length !== 1 || (readiness.rows[0] as { readiness?: unknown }).readiness !== 'ready') {
    throw new Error('Production local D1 readiness result was not ready');
  }
  const authority = auditHistoricalTransform8Authority(ROOT, sql => parseHistoricalTransform8D1Page(run([
    'd1', 'execute', ...common, '--command', sql, '--json',
  ])));
  const transform9Authority = auditHistoricalTransform9Authority(ROOT, sql => parseHistoricalTransform9D1Page(run([
    'd1', 'execute', ...common, '--command', sql, '--json',
  ])));
  console.error(`[verify-d1-seed-workerd] Imported ${manifest.files.length} seed files through local D1; production readiness, Transform-8 (${authority.pages.profiles}/${authority.pages.identities}/${authority.pages.aliases} pages), and Transform-9 (${transform9Authority.pages.packs}/${transform9Authority.pages.works}/${transform9Authority.pages.editions}/${transform9Authority.pages.artifacts}/${transform9Authority.pages.documents}/${transform9Authority.pages.profiles}/${transform9Authority.pages.sections}/${transform9Authority.pages.projections} pages) authority audits passed.`);
} finally {
  rmSync(state, { recursive: true, force: true });
}
