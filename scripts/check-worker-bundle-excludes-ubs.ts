#!/usr/bin/env tsx
/** Prove the Worker graph excludes the multi-megabyte UBS JSON artifact. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = mkdtempSync(join(tmpdir(), 'theologai-ubs-worker-bundle-'));
try {
  const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  execFileSync(process.execPath, [wrangler, 'deploy', '--dry-run', '--env', 'preview', '--outdir', output, '--metafile'], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, WRANGLER_LOG_PATH: join(root, 'test-output', 'wrangler', 'logs') },
  });
  const metadata = JSON.parse(readFileSync(join(output, 'bundle-meta.json'), 'utf8')) as { inputs?: Record<string, unknown> };
  const inputs = Object.keys(metadata.inputs ?? {});
  if (inputs.some(path => path.endsWith('ubs-parallel-passages.generated.json'))) {
    throw new Error('Worker dependency graph includes the UBS generated JSON artifact');
  }
  const bundleName = readdirSync(output).find(name => name.endsWith('.js'));
  if (!bundleName) throw new Error('Wrangler dry run produced no Worker JavaScript bundle');
  const bundle = readFileSync(join(output, bundleName));
  const rawBytes = statSync(join(output, bundleName)).size;
  const gzipBytes = gzipSync(bundle).byteLength;
  if (rawBytes > 3 * 1024 * 1024) throw new Error(`Worker bundle exceeded reviewed 3 MiB raw ceiling: ${rawBytes}`);
  console.error(`[worker-ubs-bundle] ${inputs.length} inputs; ${rawBytes} raw bytes; ${gzipBytes} gzip bytes; UBS JSON absent.`);
} finally {
  rmSync(output, { recursive: true, force: true });
}
