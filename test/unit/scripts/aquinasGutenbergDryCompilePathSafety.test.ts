import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertApprovedPaths,
  validateComparableRunAt,
} from '../../../scripts/aquinas-gutenberg-dry-compile.js';

const A0_CACHE_ROOT = '/private/tmp/theologai-aquinas-gutenberg-acquisition';
const IGNORED_TEST_OUTPUT_ROOT = resolve('test-output');
const SHARDS = [
  'aquinas-summa-pg-v1.prima.shard-0001',
  'aquinas-summa-pg-v1.prima-secundae.shard-0001',
  'aquinas-summa-pg-v1.secunda-secundae.shard-0001',
  'aquinas-summa-pg-v1.secunda-secundae.shard-0002',
  'aquinas-summa-pg-v1.tertia.shard-0001',
] as const;

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function packageDomainSha256(bytes: Uint8Array): string {
  return sha256(`sectioned-edition-collection-package.bytes.v1:${new TextDecoder().decode(bytes)}`);
}

function makeIgnoredFixtureRoot(prefix: string): string {
  mkdirSync(IGNORED_TEST_OUTPUT_ROOT, { recursive: true });
  return mkdtempSync(join(IGNORED_TEST_OUTPUT_ROOT, prefix));
}

function makeFixtureRun(root: string, runId: 'run-a' | 'run-b', pathOverride: Partial<{ manifest: string; package: string }> = {}): void {
  const directory = join(root, runId);
  mkdirSync(directory, { recursive: true });
  const manifest = Buffer.from(`manifest-${runId}`);
  writeFileSync(join(directory, 'manifest.json'), manifest);
  const packageFiles = SHARDS.map(shardId => {
    const bytes = Buffer.from(`package-${runId}-${shardId}`);
    writeFileSync(join(directory, `${shardId}.json`), bytes);
    return {
      shardId,
      path: pathOverride.package ?? `${shardId}.json`,
      sha256: sha256(bytes),
      persistedSha256: packageDomainSha256(bytes),
      bytes: bytes.byteLength,
    };
  });
  writeFileSync(join(directory, 'run-report.json'), JSON.stringify({
    runId,
    packageFiles,
    manifest: {
      path: pathOverride.manifest ?? 'manifest.json',
      sha256: sha256(manifest),
      bytes: manifest.byteLength,
      aggregateSha256: '0'.repeat(64),
    },
    parts: [],
    maxChild: {},
    q102: [],
    exclusions: {},
    discrepancyCount: 0,
    checks: {},
  }));
}

describe('Aquinas Gutenberg Gate D output-path safety', () => {
  it('rejects a symlinked output root even when its lexical path is under test-output', () => {
    const root = makeIgnoredFixtureRoot('theologai-aquinas-gate-d-path-');
    const testOutput = join(root, 'test-output');
    const outside = join(root, 'outside');
    mkdirSync(testOutput);
    mkdirSync(outside);
    symlinkSync(outside, join(testOutput, 'linked-output'));

    expect(() => assertApprovedPaths(A0_CACHE_ROOT, join(testOutput, 'linked-output'), testOutput)).toThrow(/symlink/);
  });

  it('rejects absolute and escaping report paths instead of following them', () => {
    const root = makeIgnoredFixtureRoot('theologai-aquinas-gate-d-report-');
    makeFixtureRun(root, 'run-a', { manifest: '/private/tmp/manifest.json' });
    makeFixtureRun(root, 'run-b');
    expect(() => validateComparableRunAt(root, 'run-a')).toThrow(/relative basename/);

    const escaping = makeIgnoredFixtureRoot('theologai-aquinas-gate-d-report-');
    makeFixtureRun(escaping, 'run-a', { package: '../manifest.json' });
    makeFixtureRun(escaping, 'run-b');
    expect(() => validateComparableRunAt(escaping, 'run-a')).toThrow(/relative basename/);
  });
});
