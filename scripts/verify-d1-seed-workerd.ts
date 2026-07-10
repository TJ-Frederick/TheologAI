#!/usr/bin/env tsx
/** Import representative generated chunks through Wrangler's isolated local D1 runtime. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface SeedManifest {
  expectedCounts: Record<string, number>;
  files: Array<{ path: string; table: string }>;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_ROOT = join(ROOT, 'scripts', 'd1-seed');
const manifest = JSON.parse(
  readFileSync(join(SEED_ROOT, 'seed-manifest.json'), 'utf8'),
) as SeedManifest;
const state = mkdtempSync(join(tmpdir(), 'theologai-wrangler-d1-'));
const wrangler = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function run(args: string[]): string {
  try {
    return execFileSync(process.execPath, [wrangler, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: join(ROOT, 'test-output', 'wrangler', 'logs'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string };
    throw new Error(`Wrangler local D1 verification failed:\n${failure.stderr ?? failure.stdout ?? 'unknown error'}`);
  }
}

try {
  const common = ['THEOLOGAI_DB', '--local', '--persist-to', state, '--config', 'wrangler.toml'];
  run(['d1', 'migrations', 'apply', ...common]);

  const completeTables = new Set([
    'empty-target-check',
    'theologai_metadata',
    'morph_codes',
    'documents',
    'document_sections',
    'fts',
  ]);
  const firstChunkTables = new Set(['strongs', 'stepbible_lexicons', 'cross_references', 'morphology']);
  const seen = new Set<string>();
  const representativeFiles = manifest.files.filter(file => {
    if (completeTables.has(file.table)) return true;
    if (!firstChunkTables.has(file.table) || seen.has(file.table)) return false;
    seen.add(file.table);
    return true;
  });

  for (const [index, file] of representativeFiles.entries()) {
    if (!/^[a-z0-9-]+-\d{3}\.sql$/.test(file.path)) {
      throw new Error(`Unsafe generated seed path: ${file.path}`);
    }
    console.error(`[verify-d1-seed-workerd] ${index + 1}/${representativeFiles.length} ${file.path}`);
    run(['d1', 'execute', ...common, '--file', join(SEED_ROOT, file.path)]);
  }

  const readiness = run([
    'd1',
    'execute',
    ...common,
    '--command',
    `SELECT CASE WHEN
      (SELECT quick_check FROM pragma_quick_check LIMIT 1) = 'ok'
      AND (SELECT COUNT(*) FROM pragma_foreign_key_check) = 0
      AND (SELECT COUNT(*) FROM theologai_metadata) = 2
      AND (SELECT COUNT(*) FROM strongs) > 0
      AND (SELECT COUNT(*) FROM stepbible_lexicons) > 0
      AND (SELECT COUNT(*) FROM cross_references) > 0
      AND (SELECT COUNT(*) FROM morphology) > 0
      AND (SELECT COUNT(*) FROM document_sections) = ${manifest.expectedCounts.document_sections}
      AND (SELECT COUNT(*) FROM strongs_fts) > 0
      AND (SELECT COUNT(*) FROM sections_fts) = ${manifest.expectedCounts.sections_fts}
      THEN 'ready' ELSE json_extract('Local D1 representative import failed', '$') END AS readiness;`,
    '--json',
  ]);
  if (!readiness.includes('ready')) throw new Error('Local D1 readiness result was not ready');
  console.error(`[verify-d1-seed-workerd] Imported ${representativeFiles.length} representative seed files through local D1.`);
} finally {
  rmSync(state, { recursive: true, force: true });
}
