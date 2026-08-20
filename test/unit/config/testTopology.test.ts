import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type PartitionName = 'activeVitest' | 'support' | 'manual' | 'legacyOrphan' | 'conformance';

interface TopologyManifest {
  schemaVersion: number;
  sourceBaseline: Record<string, number | string>;
  current: Record<string, number>;
  partitions: Record<PartitionName, string[]>;
  maintainedTypeScriptEntrypointsOutsideTest: Array<{ path: string; packageScript: string }>;
  separatelyOwnedEntrypoints: Array<{ path: string; packageScript: string; owner: string }>;
  knownBrokenCommands: Array<{ name: string; target: string; failureCause: string }>;
}

const repoRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const read = (relativePath: string): string => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const manifest = JSON.parse(read('test/test-topology.json')) as TopologyManifest;
const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

function walk(relativeDirectory: string): string[] {
  return fs.readdirSync(path.join(repoRoot, relativeDirectory), { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      return entry.isDirectory() ? walk(relativePath) : [relativePath];
    });
}

const sorted = (values: Iterable<string>): string[] => [...values].sort();
const testTypeScriptFiles = sorted(walk('test').filter((file) => file.endsWith('.ts')));

describe('test topology manifest', () => {
  it('preserves the immutable D4 source baseline and validates current arithmetic', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.sourceBaseline).toEqual({
      commit: '56c73fac50cc42a990e376452b8c2375087a5a82',
      totalTestTypeScript: 271,
      activeVitest: 195,
      support: 21,
      manual: 4,
      legacyOrphan: 50,
      conformance: 1,
    });
    expect(manifest.current).toEqual({
      totalTestTypeScript: testTypeScriptFiles.length,
      activeVitest: manifest.partitions.activeVitest.length,
      support: manifest.partitions.support.length,
      manual: manifest.partitions.manual.length,
      legacyOrphan: manifest.partitions.legacyOrphan.length,
      conformance: manifest.partitions.conformance.length,
    });
  });

  it('partitions every tracked test TypeScript path exactly once', () => {
    expect(Object.keys(manifest.partitions)).toEqual([
      'activeVitest',
      'support',
      'manual',
      'legacyOrphan',
      'conformance',
    ]);

    const flattened = Object.values(manifest.partitions).flat();
    expect(new Set(flattened).size).toBe(flattened.length);
    expect(sorted(flattened)).toEqual(testTypeScriptFiles);
    expect(flattened.every((file) => fs.statSync(path.join(repoRoot, file)).isFile())).toBe(true);

    for (const partition of Object.keys(manifest.partitions) as PartitionName[]) {
      expect(manifest.partitions[partition]).toHaveLength(manifest.current[partition]);
    }
  });

  it('matches the exact executable Vitest ownership boundaries', () => {
    const expectedActive = testTypeScriptFiles.filter((file) =>
      (file.startsWith('test/unit/') && file.endsWith('.test.ts')) ||
      file === 'test/integration/current/mcp-protocol.test.ts' ||
      file === 'test/worker-runtime/workerMcp.test.ts' ||
      file === 'test/ccel-coordinator-runtime/ccelCoordinator.test.ts'
    );
    expect(manifest.partitions.activeVitest).toEqual(expectedActive);

    expect(read('vitest.config.ts')).toContain("include: ['test/unit/**/*.test.ts']");
    expect(read('vitest.integration.config.ts')).toContain("include: ['test/integration/current/**/*.test.ts']");
    expect(read('vitest.worker.config.ts')).toContain("include: ['test/worker-runtime/**/*.test.ts']");
    expect(read('vitest.ccel-coordinator.config.ts')).toContain(
      "include: ['test/ccel-coordinator-runtime/**/*.test.ts']",
    );
  });

  it('keeps support, manual, and conformance ownership closed and explicit', () => {
    const expectedSupport = testTypeScriptFiles.filter((file) =>
      file.startsWith('test/fixtures/') ||
      file.startsWith('test/helpers/') ||
      file === 'test/setup.ts' ||
      file === 'test/ccel-coordinator-runtime/setup.ts' ||
      file === 'test/worker-runtime/setup.ts' ||
      file === 'test/unit/adapters/data/fakeSqlite.ts'
    );
    expect(manifest.partitions.support).toEqual(expectedSupport);
    expect(manifest.partitions.manual).toEqual([
      'test/scripts/bible-lookup-17-tests-detailed.ts',
      'test/scripts/bible-lookup-17-tests.ts',
      'test/scripts/build-stepbible.test.ts',
      'test/scripts/pre-launch-critical-tests.ts',
    ]);
    expect(manifest.partitions.conformance).toEqual(['test/conformance/run-server-conformance.ts']);
    expect(packageJson.scripts['test:conformance']).toBe('tsx test/conformance/run-server-conformance.ts');
  });

  it('owns exactly five maintained TypeScript entrypoints outside test', () => {
    expect(manifest.maintainedTypeScriptEntrypointsOutsideTest).toEqual([
      { path: 'scripts/check-worker-bundle-excludes-ubs.ts', packageScript: 'test:worker-bundle-ubs' },
      { path: 'scripts/test-data-pipeline.ts', packageScript: 'test:data' },
      { path: 'scripts/test-node-http-e2e.ts', packageScript: 'test:e2e:compiled' },
      { path: 'scripts/test-worker-production-runtime.ts', packageScript: 'test:worker-production-runtime' },
      { path: 'scripts/verify-d1-seed-workerd.ts', packageScript: 'd1:seed:verify-workerd' },
    ]);
    for (const entry of manifest.maintainedTypeScriptEntrypointsOutsideTest) {
      expect(fs.existsSync(path.join(repoRoot, entry.path))).toBe(true);
      expect(packageJson.scripts[entry.packageScript]).toContain(entry.path);
    }
    expect(manifest.separatelyOwnedEntrypoints).toEqual([
      { path: 'scripts/macula-gate1.ts', packageScript: 'test:macula-gate1-workerd', owner: 'MACULA Gate-1' },
    ]);
  });

  it('documents exactly five unsupported broken commands without executing legacy targets', () => {
    expect(manifest.knownBrokenCommands.map(({ name }) => name)).toEqual([
      'test:all-books',
      'test:bibleapi',
      'test:commentary',
      'test:helloao-bible',
      'test:netbible',
    ]);

    const expectedCommands: Record<string, string> = {
      'test:all-books': 'tsx test/integration/all-books-mapping-test.ts',
      'test:bibleapi': 'tsx test/adapters/bibleapi-test.ts',
      'test:commentary': 'tsx test/integration/public-commentary-test.ts',
      'test:helloao-bible': 'tsx test/adapters/helloao-bible-test.ts',
      'test:netbible': 'tsx test/adapters/netbible-test.ts',
    };
    for (const entry of manifest.knownBrokenCommands) {
      expect(packageJson.scripts[entry.name]).toBe(expectedCommands[entry.name]);
      expect(entry.failureCause.length).toBeGreaterThan(0);
    }

    const allowedTestTargets = new Set([
      ...manifest.partitions.activeVitest,
      ...manifest.partitions.manual,
      ...manifest.partitions.conformance,
      ...manifest.knownBrokenCommands.map(({ target }) => target),
    ]);
    const scriptedTestTargets = Object.values(packageJson.scripts)
      .flatMap((command) => command.match(/test\/[A-Za-z0-9_./-]+\.ts/g) ?? []);
    expect(scriptedTestTargets.filter((target) => !allowedTestTargets.has(target))).toEqual([]);
  });
});
