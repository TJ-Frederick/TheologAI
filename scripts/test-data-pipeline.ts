#!/usr/bin/env tsx
/** Run the complete deterministic local corpus and D1 seed verification flow. */

import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TSX = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const workspace = mkdtempSync(join(tmpdir(), 'theologai-data-test-'));
const database = join(workspace, 'theologai.db');

function run(script: string, args: string[] = []): void {
  execFileSync(process.execPath, [TSX, join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

try {
  run('verify-data-manifest.ts');
  run('build-database.ts', ['--output', database]);
  run('verify-database.ts', ['--database', database]);
  run('export-for-d1.ts', ['--database', database, '--clean']);
  run('verify-d1-seed.ts');
  run('verify-d1-seed-import.ts', ['--database', database]);
  console.error('[test-data-pipeline] Complete data pipeline passed.');
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
