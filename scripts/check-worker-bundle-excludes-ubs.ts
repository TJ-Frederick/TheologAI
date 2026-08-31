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
  // The active v2 semantic study adds bounded runtime code but must never add
  // the multi-megabyte compiled UBS JSON artifact checked above. The 3.125 MiB
  // ceiling keeps a narrow review margin above the reviewed v2 bundle.
  if (rawBytes > 3.125 * 1024 * 1024) throw new Error(`Worker bundle exceeded reviewed 3.125 MiB raw ceiling: ${rawBytes}`);

  // Wrangler's startup profiler consumes the multipart bundle produced by
  // --outfile, rather than the plain JavaScript emitted by --outdir. Keep the
  // profile ephemeral and fail before deployment if local Workerd startup
  // reaches Cloudflare's one-second Worker startup ceiling.
  const startupBundle = join(output, 'worker.bundle');
  const startupProfile = join(output, 'worker-startup.cpuprofile');
  execFileSync(process.execPath, [
    wrangler, 'deploy', '--dry-run', '--env', 'preview', '--outfile', startupBundle,
  ], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, WRANGLER_LOG_PATH: join(output, 'wrangler-startup-build.log') },
  });
  execFileSync(process.execPath, [
    wrangler, 'check', 'startup', '--workerBundle', startupBundle, '--outfile', startupProfile,
  ], {
    cwd: root,
    // Wrangler currently prints an upstream AJV code-generation diagnostic
    // even when profiling succeeds and emits a valid CPU profile. Preserve it
    // on thrown command errors without flooding successful CI logs.
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, WRANGLER_LOG_PATH: join(output, 'wrangler-startup-check.log') },
  });
  const profile = JSON.parse(readFileSync(startupProfile, 'utf8')) as { startTime?: unknown; endTime?: unknown };
  if (typeof profile.startTime !== 'number' || typeof profile.endTime !== 'number'
    || !Number.isFinite(profile.startTime) || !Number.isFinite(profile.endTime)
    || profile.endTime < profile.startTime) {
    throw new Error('Wrangler startup check produced an invalid CPU profile');
  }
  const startupMs = (profile.endTime - profile.startTime) / 1_000;
  if (startupMs >= 1_000) throw new Error(`Worker startup exceeded the 1,000 ms gate: ${startupMs.toFixed(1)} ms`);
  console.error(`[worker-ubs-bundle] ${inputs.length} inputs; ${rawBytes} raw bytes; ${gzipBytes} gzip bytes; ${startupMs.toFixed(1)} ms local startup; UBS JSON absent.`);
} finally {
  rmSync(output, { recursive: true, force: true });
}
