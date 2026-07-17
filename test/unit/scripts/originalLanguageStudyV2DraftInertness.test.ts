import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoUrl = new URL('../../../', import.meta.url);
const repoPath = fileURLToPath(repoUrl);
const draftFixtureRoot = 'test/fixtures/original-language-study-v2/';
const inertnessTestPath = 'test/unit/scripts/originalLanguageStudyV2DraftInertness.test.ts';

/**
 * This is deliberately a packet contract, not a snapshot of the repository.
 * Future production work may change freely; changing this reviewed design
 * packet requires an explicit review of the packet itself.
 */
const expectedPacketPaths = [
  'test/fixtures/original-language-study-v2/call-detailed.draft.json',
  'test/fixtures/original-language-study-v2/call-summary.draft.json',
  'test/fixtures/original-language-study-v2/detailed.synthetic.json',
  'test/fixtures/original-language-study-v2/prompt.draft.md',
  'test/fixtures/original-language-study-v2/summary.synthetic.json',
  'test/fixtures/original-language-study-v2/tsconfig.design.json',
  'test/fixtures/original-language-study-v2/support/OriginalLanguageStudyV2DraftCoordinator.ts',
  'test/fixtures/original-language-study-v2/support/originalLanguageStudyV2DraftContract.ts',
  'test/fixtures/original-language-study-v2/support/originalLanguageStudyV2DraftFormatter.ts',
  'test/fixtures/original-language-study-v2/support/originalLanguageStudyV2DraftSchema.ts',
  'test/fixtures/original-language-study-v2/support/originalLanguageStudyV2DraftStructured.ts',
  'test/fixtures/original-language-study-v2/support/syntheticOriginalLanguageStudyV2Fixtures.ts',
  'test/unit/formatters/originalLanguageStudyV2DraftFormatter.test.ts',
  'test/unit/mcp/originalLanguageStudyV2DraftSchema.test.ts',
  'test/unit/presenters/originalLanguageStudyV2DraftStructured.test.ts',
  inertnessTestPath,
  'test/unit/services/languages/OriginalLanguageStudyV2DraftCoordinator.test.ts',
].sort();

/**
 * Git object identities pin every peer in the reviewed packet. The test file
 * cannot usefully pin its own blob (that would be a self-referential hash), so
 * it is protected by its required path/mode and ordinary code review. This is
 * the narrowest honest boundary a test can enforce without an external signed
 * manifest or a frozen repository-wide baseline.
 */
const expectedImmutablePacketEntries = [
  ['test/fixtures/original-language-study-v2/call-detailed.draft.json', '100644', '3fa3d033856884af690b7813fbb9464bd9a4d9c1'],
  ['test/fixtures/original-language-study-v2/call-summary.draft.json', '100644', 'b3a223bafcfe0a4a63dad58361d2ee0c7361be00'],
  ['test/fixtures/original-language-study-v2/detailed.synthetic.json', '100644', '68b1e9ae02d46eb13c2bd80b74542206983710b9'],
  ['test/fixtures/original-language-study-v2/prompt.draft.md', '100644', 'b16eea7a9c546852dd99d220d0c0181a48cce2d2'],
  ['test/fixtures/original-language-study-v2/summary.synthetic.json', '100644', 'a11efab97db0c08802cc11b2a6735fe17b2df027'],
  ['test/fixtures/original-language-study-v2/support/OriginalLanguageStudyV2DraftCoordinator.ts', '100644', 'c31ef1f421f840d88e4c201fe07af1978e394a17'],
  ['test/fixtures/original-language-study-v2/support/originalLanguageStudyV2DraftContract.ts', '100644', 'a79abb4510418afb939c3cfd8a3814aa5999379c'],
  ['test/fixtures/original-language-study-v2/support/originalLanguageStudyV2DraftFormatter.ts', '100644', 'af00a97af3985c5d6b5cb19a9696d58f0adc10dd'],
  ['test/fixtures/original-language-study-v2/support/originalLanguageStudyV2DraftSchema.ts', '100644', 'fea6965f6eb415f52aeb9c9388f50dcfdf65f064'],
  ['test/fixtures/original-language-study-v2/support/originalLanguageStudyV2DraftStructured.ts', '100644', 'f0850c77557c2f15f6613ec7cd2e6e42ec3dde3f'],
  ['test/fixtures/original-language-study-v2/support/syntheticOriginalLanguageStudyV2Fixtures.ts', '100644', 'baae8958a2551d6e286e5735250c57fa6d93e281'],
  ['test/fixtures/original-language-study-v2/tsconfig.design.json', '100644', 'e68d624e93b215b3c3c508ba3bef8f0d3d6957b7'],
  ['test/unit/formatters/originalLanguageStudyV2DraftFormatter.test.ts', '100644', 'c72bdaaa4b45ae7b510d092cc86739542db30f6f'],
  ['test/unit/mcp/originalLanguageStudyV2DraftSchema.test.ts', '100644', 'ed55ed3682e256fc02f4b152d864918bc325f084'],
  ['test/unit/presenters/originalLanguageStudyV2DraftStructured.test.ts', '100644', '24b9362803e55adc84bca33b58a3ac7392a79a6f'],
  ['test/unit/services/languages/OriginalLanguageStudyV2DraftCoordinator.test.ts', '100644', '3c04c0e394198eb56da7a03db17f4dcd5201abd2'],
] as const;

const runtimeEntrypoints = [
  'src/index.ts',
  'src/worker.ts',
  'src/ccel-coordinator-worker.ts',
] as const;

const runtimeWiringRoots = [
  '.github/',
  'data/',
  'migrations/',
  'scripts/',
  'src/',
] as const;

const draftReferencePattern = /original-language-study-v2|OriginalLanguageStudyV2Draft|originalLanguageStudyV2Draft/i;

describe('globally inactive original_language_study v2 fixture packet', () => {
  it('locks the reviewed test-only packet by exact path, regular-file mode, and peer content identity', () => {
    const entries = trackedIndexEntries();
    const packet = entries.filter(entry => isDraftPacketPath(entry.path));
    expect(packet.map(entry => entry.path).sort()).toEqual(expectedPacketPaths);
    expect(packet.every(entry => entry.mode === '100644')).toBe(true);

    const immutableActual = packet
      .filter(entry => entry.path !== inertnessTestPath)
      .map(entry => [entry.path, entry.mode, entry.objectId] as const)
      .sort(comparePacketEntries);
    expect(immutableActual).toEqual([...expectedImmutablePacketEntries].sort(comparePacketEntries));
    expect(untrackedDraftPaths()).toEqual([]);

    // The index is what CI and a committed PR execute. A developer can still
    // edit the packet locally before staging it; CI must not do so.
    if (process.env.CI) {
      expect(gitStatus(['diff', '--quiet', '--', ...expectedPacketPaths]).status,
        'CI worktree must match the reviewed packet index').toBe(0);
      expect(gitStatus(['diff', '--cached', '--quiet', '--', ...expectedPacketPaths]).status,
        'CI index must match the reviewed packet commit').toBe(0);
    }
  });

  it('keeps the packet in fixtures and unit tests, with synthetic scenarios rather than source material or activation inputs', () => {
    expect(expectedPacketPaths.every(path => path.startsWith(draftFixtureRoot)
      || path === inertnessTestPath
      || /^test\/unit\/(?:formatters|mcp|presenters|services\/languages)\/.*[Oo]riginalLanguageStudyV2Draft.*\.test\.ts$/.test(path)))
      .toBe(true);

    for (const path of expectedPacketPaths.filter(path => path.endsWith('.synthetic.json'))) {
      const fixture = JSON.parse(readRepoFile(path)) as { sourcePolicy?: unknown; scenario?: unknown };
      expect(fixture.sourcePolicy, path).toBe('invented_synthetic_only');
      expect(fixture.scenario, path).toEqual(expect.any(Object));
    }

    for (const path of expectedPacketPaths.filter(path => path.startsWith(draftFixtureRoot))) {
      const source = readRepoFile(path);
      expect(source, path).not.toMatch(/\b(?:D1Database|better-sqlite3|wrangler|THEOLOGAI_)\b/i);
      expect(source, path).not.toMatch(/(?:^|["'`])(?:\.\.\/)*(?:data|migrations)\//m);
      expect(source, path).not.toMatch(/\b(?:CREATE\s+TABLE|INSERT\s+INTO|ALTER\s+TABLE|DROP\s+TABLE)\b/i);
    }

    const supportDependencies = [...new Set(expectedPacketPaths
      .filter(path => path.startsWith(`${draftFixtureRoot}support/`))
      .flatMap(path => resolveRelativeImports(path)))];
    expect(supportDependencies.filter(path => /^(?:data|migrations)\//.test(path)
      || /^src\/(?:adapters|data|http|tools|worker)/.test(path))).toEqual([]);
  });

  it('derives every compiler project from actual package and workflow commands, resolving each project fail-closed', () => {
    const configPaths = compilerProjectPathsFromReleaseCommands();
    expect(configPaths).toContain('tsconfig.json');
    expect(configPaths).toContain('tsconfig.worker.json');
    expect(configPaths).toContain('test/worker-runtime/tsconfig.json');
    expect(configPaths).not.toContain(`${draftFixtureRoot}tsconfig.design.json`);

    for (const path of configPaths) {
      const compilerInputs = compilerInputPaths(path);
      expect(compilerInputs.filter(isDraftPacketPath), path).toEqual([]);
    }

    // The one intentional compiler is a test-only design check. It is not
    // reachable from any package/workflow command above.
    const designInputs = compilerInputPaths(`${draftFixtureRoot}tsconfig.design.json`);
    expect(designInputs.some(isDraftPacketPath)).toBe(true);
  });

  it('keeps runtime package entrypoints semantic and records npm publication as a separate known non-release debt', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as Record<string, unknown>;
    const entrypointTargets = packageEntrypointTargets(packageJson);
    expect(entrypointTargets).toEqual(['dist/index.js']);
    expect(entrypointTargets.some(isDraftPacketPath)).toBe(false);
    expect(packageCommandTexts(packageJson).some(command => hasDraftReference(command))).toBe(false);

    const packlist = npmPacklistPaths();
    // This repository does not currently publish from npm. The actual packlist
    // includes the design packet and omits the configured Node entrypoint, so
    // it is evidence of packaging debt—not an assertion of package exclusion.
    expect(packlist.filter(isDraftPacketPath).sort()).toEqual(expectedPacketPaths);
    expect(packlist).not.toContain('dist/index.js');
    expect(packageJson.files).toBeUndefined();
  });

  it('builds a Node artifact and every production/preview/coordinator Worker manifest without the packet', () => {
    const nodeArtifact = buildNodeArtifact();
    try {
      expect(nodeArtifact.paths.some(isDraftPacketPath)).toBe(false);
      expect(nodeArtifact.paths.some(path => hasDraftReference(readRepoFileAt(nodeArtifact.root, path)))).toBe(false);
      for (const target of packageEntrypointTargets(JSON.parse(readRepoFile('package.json')) as Record<string, unknown>)) {
        expect(existsSync(resolve(nodeArtifact.root, target)), target).toBe(true);
      }
    } finally {
      rmSync(nodeArtifact.parent, { recursive: true, force: true });
    }

    const workerBundles = buildWorkerBundleManifests();
    try {
      expect(workerBundles.map(bundle => bundle.name).sort()).toEqual(['coordinator', 'preview', 'production']);
      for (const bundle of workerBundles) {
        expect(bundle.inputs.filter(path => isDraftPacketPath(toRepoPath(resolve(repoPath, path)))), bundle.name).toEqual([]);
        for (const source of bundle.bundleSources) {
          expect(source, bundle.name).not.toMatch(draftReferencePattern);
        }
      }
    } finally {
      rmSync(workerBundles[0]!.parent, { recursive: true, force: true });
    }
  });

  it('is unreachable from Node, Worker, and coordinator entrypoints and absent from runtime, registry, schema, config, data, and package wiring', () => {
    const reachableRuntimeFiles = new Set<string>();
    for (const entrypoint of runtimeEntrypoints) {
      for (const path of reachableRelativeModules(entrypoint)) reachableRuntimeFiles.add(path);
    }
    expect([...reachableRuntimeFiles].filter(isDraftPacketPath)).toEqual([]);
    expect([...reachableRuntimeFiles].filter(path => hasDraftReference(readRepoFile(path)))).toEqual([]);

    const wiringPaths = trackedIndexEntries().map(entry => entry.path)
      .filter(path => isRuntimeWiringPath(path) && !isDraftPacketPath(path));
    const offenders = wiringPaths.filter(path => hasDraftReference(readRepoFile(path))).sort();
    expect(offenders).toEqual([]);
  });

  it('makes a packet change or a runtime reference observably fail the guards', () => {
    const baseline = packetFingerprint([
      packetEntry('a.ts', '100644', 'a'.repeat(40)),
      packetEntry('b.ts', '100644', 'b'.repeat(40)),
    ]);
    expect(packetFingerprint([packetEntry('a.ts', '100644', 'a'.repeat(40))])).not.toBe(baseline);
    expect(packetFingerprint([
      packetEntry('a.ts', '100644', 'a'.repeat(40)),
      packetEntry('b.ts', '100644', 'c'.repeat(40)),
    ])).not.toBe(baseline);
    expect(packetFingerprint([
      packetEntry('a.ts', '100755', 'a'.repeat(40)),
      packetEntry('b.ts', '100644', 'b'.repeat(40)),
    ])).not.toBe(baseline);
    expect(packetFingerprint([
      packetEntry('a.ts', '120000', 'a'.repeat(40)),
      packetEntry('b.ts', '100644', 'b'.repeat(40)),
    ])).not.toBe(baseline);
    expect(hasDraftReference("import './test/fixtures/original-language-study-v2/support/x.js'"))
      .toBe(true);
    expect(hasDraftReference("import './tools/v2/originalLanguageStudy.js'"))
      .toBe(false);
    expect(() => compilerProjectPathsFromCommands(['cd test && tsc -p tsconfig.json']))
      .toThrow(/cwd changes/i);
    expect(() => compilerProjectPathsFromCommands(['run: cd test && tsc -p tsconfig.json']))
      .toThrow(/cwd changes/i);
    expect(() => compilerProjectPathsFromCommands(['run: |\n  cd test\n  tsc -p tsconfig.json']))
      .toThrow(/cwd changes/i);
  });
});

interface GitIndexEntry {
  path: string;
  mode: string;
  objectId: string;
}

function trackedIndexEntries(): GitIndexEntry[] {
  return splitNul(gitBytes(['ls-files', '--stage', '-z'])).map(record => {
    const tab = record.indexOf(0x09);
    if (tab < 0) throw new Error('git ls-files --stage returned an invalid record');
    const [mode, objectId, stage] = record.subarray(0, tab).toString('ascii').split(' ');
    if (!mode || !objectId || stage !== '0') {
      throw new Error('inactive packet identity requires stage-zero index entries');
    }
    return { path: record.subarray(tab + 1).toString('utf8'), mode, objectId };
  });
}

function untrackedDraftPaths(): string[] {
  return git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')
    .filter(Boolean).filter(isDraftPacketPath).sort();
}

function isDraftPacketPath(path: string): boolean {
  return path.startsWith(draftFixtureRoot)
    || /(?:^|\/)originalLanguageStudyV2Draft[^/]*$/i.test(path);
}

function isRuntimeWiringPath(path: string): boolean {
  return path === 'package.json'
    || path === 'package-lock.json'
    || /(?:^|\/)(?:wrangler(?:\.[^/]+)?\.toml|worker-configuration\.d\.ts|ccel-coordinator-configuration\.d\.ts)$/.test(path)
    || /(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/.test(path)
    || runtimeWiringRoots.some(root => path.startsWith(root));
}

function hasDraftReference(value: string): boolean {
  return draftReferencePattern.test(value);
}

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoPath, path), 'utf8');
}

function readRepoFileAt(root: string, path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

function compilerProjectPathsFromReleaseCommands(): string[] {
  return compilerProjectPathsFromCommands([...packageCommandTexts(), ...workflowCommandTexts()]);
}

function compilerProjectPathsFromCommands(commands: readonly string[]): string[] {
  const projects = new Set<string>();
  for (const command of commands) {
    if (containsTypeScriptCompilerInvocation(command) && /(?:^|[\s;&|])cd(?:\s|$)/.test(command)) {
      throw new Error(`TypeScript compiler commands with cwd changes are not supported: ${command}`);
    }
    for (const segment of command.split(/&&|\|\||;/)) {
      if (!containsTypeScriptCompilerInvocation(segment)) {
        continue;
      }
      const configured = [...segment.matchAll(/(?:^|\s)(?:--project|-p)(?:\s+|=)([^\s;&|]+)/g)]
        .map(match => normalizeCompilerProject(match[1]!));
      if (configured.length === 0) projects.add('tsconfig.json');
      else configured.forEach(project => projects.add(project));
    }
  }
  if (projects.size === 0) throw new Error('No TypeScript project was discovered from package or workflow commands');
  return [...projects].sort();
}

function containsTypeScriptCompilerInvocation(value: string): boolean {
  return /(?:^|\s)(?:(?:npx|npm\s+exec)\s+(?:--no-install\s+)?|\.\/node_modules\/\.bin\/)?(?:tsc|typescript)(?=\s|$)/.test(value);
}

function normalizeCompilerProject(value: string): string {
  const project = value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2');
  if (!project || project.includes('$') || project.startsWith('-')) {
    throw new Error(`Unresolved TypeScript project expression: ${value}`);
  }
  const path = toRepoPath(resolve(repoPath, project));
  if (!trackedPathSet().has(path) || !existsSync(resolve(repoPath, path))) {
    throw new Error(`TypeScript project from a package/workflow command is not tracked: ${project}`);
  }
  return path;
}

function packageCommandTexts(packageJson: Record<string, unknown> = JSON.parse(readRepoFile('package.json')) as Record<string, unknown>): string[] {
  const scripts = packageJson.scripts;
  if (scripts === undefined) return [];
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) {
    throw new Error('package.json scripts must be an object when present');
  }
  return Object.values(scripts).map((script, index) => {
    if (typeof script !== 'string') throw new Error(`package.json script ${index} is not a string`);
    return script;
  });
}

function workflowCommandTexts(): string[] {
  return trackedIndexEntries().map(entry => entry.path)
    .filter(path => path.startsWith('.github/workflows/') && /\.ya?ml$/.test(path))
    .map(readRepoFile);
}

function packageEntrypointTargets(packageJson: Record<string, unknown>): string[] {
  const targets: string[] = [];
  collectPackageTargets(packageJson.main, targets, 'main');
  collectPackageTargets(packageJson.module, targets, 'module');
  collectPackageTargets(packageJson.types, targets, 'types');
  collectPackageTargets(packageJson.bin, targets, 'bin');
  collectPackageTargets(packageJson.exports, targets, 'exports');
  return [...new Set(targets.map(normalizePackageTarget))].sort();
}

function collectPackageTargets(value: unknown, targets: string[], field: string): void {
  if (value === undefined) return;
  if (typeof value === 'string') {
    targets.push(value);
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`package.json ${field} must be a string or object`);
  }
  for (const nested of Object.values(value)) collectPackageTargets(nested, targets, field);
}

function normalizePackageTarget(value: string): string {
  if (!value || value.includes('*') || value.includes('$')) {
    throw new Error(`Package entrypoint must be a concrete relative file: ${value}`);
  }
  const path = value.replace(/^\.\//, '');
  if (path.startsWith('/') || path === '..' || path.startsWith('../')) {
    throw new Error(`Package entrypoint escapes package root: ${value}`);
  }
  return path;
}

function npmPacklistPaths(): string[] {
  const parent = mkdtempSync(join(tmpdir(), 'theologai-ol-s3-npm-pack-'));
  try {
    const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: repoPath,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_cache: join(parent, 'cache'),
        npm_config_update_notifier: 'false',
      },
      maxBuffer: 16 * 1024 * 1024,
    });
    const entries = JSON.parse(output) as Array<{ files?: Array<{ path?: unknown }> }>;
    if (!Array.isArray(entries) || entries.length !== 1 || !Array.isArray(entries[0]?.files)) {
      throw new Error('npm pack --dry-run did not return one file manifest');
    }
    return entries[0]!.files!.map(file => {
      if (!file || typeof file.path !== 'string') throw new Error('npm pack manifest contains an invalid path');
      return file.path;
    }).sort();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

function buildNodeArtifact(): { parent: string; root: string; paths: string[] } {
  const parent = mkdtempSync(join(tmpdir(), 'theologai-ol-s3-node-dist-'));
  const root = join(parent, 'project');
  const dist = join(root, 'dist');
  try {
    mkdirSync(root, { recursive: true });
    for (const path of ['package.json', 'tsconfig.json', 'worker-configuration.d.ts']) {
      cpSync(resolve(repoPath, path), resolve(root, path));
    }
    cpSync(resolve(repoPath, 'src'), join(root, 'src'), { recursive: true });
    for (const path of expectedPacketPaths) {
      const target = resolve(root, path);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(resolve(repoPath, path), target);
    }
    symlinkSync(resolve(repoPath, 'node_modules'), join(root, 'node_modules'), 'dir');
    execFileSync('npm', ['run', 'build'], {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, npm_config_update_notifier: 'false' },
    });
    return { parent, root, paths: filesBelow(dist).map(path => `dist/${path}`) };
  } catch (error) {
    rmSync(parent, { recursive: true, force: true });
    throw error;
  }
}

interface WorkerBundleManifest {
  name: 'production' | 'preview' | 'coordinator';
  parent: string;
  inputs: string[];
  bundleSources: string[];
}

function buildWorkerBundleManifests(): WorkerBundleManifest[] {
  const parent = mkdtempSync(join(tmpdir(), 'theologai-ol-s3-worker-bundles-'));
  const specs: Array<{ name: WorkerBundleManifest['name']; args: string[]; entrypoint: string }> = [
    { name: 'production', entrypoint: 'src/worker.ts', args: ['deploy', '--dry-run', '--env=', '--env-file', '/dev/null'] },
    { name: 'preview', entrypoint: 'src/worker.ts', args: ['deploy', '--dry-run', '--env', 'preview', '--env-file', '/dev/null'] },
    { name: 'coordinator', entrypoint: 'src/ccel-coordinator-worker.ts', args: ['deploy', '--dry-run', '--config', 'wrangler.ccel-coordinator.toml', '--env-file', '/dev/null'] },
  ];
  try {
    return specs.map(spec => {
      const output = join(parent, spec.name);
      execFileSync(process.execPath, [localModuleBin('wrangler', 'bin/wrangler.js'), ...spec.args,
        '--outdir', output, '--metafile'], {
        cwd: repoPath,
        stdio: 'pipe',
        env: {
          ...process.env,
          WRANGLER_LOG_PATH: join(parent, 'logs', `${spec.name}.log`),
          WRANGLER_SEND_METRICS: 'false',
        },
      });
      const metadata = JSON.parse(readFileSync(join(output, 'bundle-meta.json'), 'utf8')) as {
        inputs?: unknown;
      };
      if (!metadata.inputs || typeof metadata.inputs !== 'object' || Array.isArray(metadata.inputs)) {
        throw new Error(`Wrangler ${spec.name} dry run produced an invalid metafile input manifest`);
      }
      const inputs = Object.keys(metadata.inputs).sort();
      if (inputs.length === 0) throw new Error(`Wrangler ${spec.name} dry run produced no metafile inputs`);
      if (!inputs.includes(spec.entrypoint)) {
        throw new Error(`Wrangler ${spec.name} metafile omitted its expected entrypoint: ${spec.entrypoint}`);
      }
      const bundles = filesBelow(output).filter(path => path.endsWith('.js'));
      if (bundles.length === 0) throw new Error(`Wrangler ${spec.name} dry run produced no JavaScript bundles`);
      return {
        name: spec.name,
        parent,
        inputs,
        bundleSources: bundles.map(bundle => readRepoFileAt(output, bundle)),
      };
    });
  } catch (error) {
    rmSync(parent, { recursive: true, force: true });
    throw error;
  }
}

function localModuleBin(moduleName: string, path: string): string {
  const executable = resolve(repoPath, 'node_modules', moduleName, path);
  if (!existsSync(executable)) throw new Error(`Required local module executable is missing: ${executable}`);
  return executable;
}

function filesBelow(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path).replaceAll('\\', '/'));
    }
  };
  visit(root);
  return files.sort();
}

function trackedPathSet(): Set<string> {
  return new Set(trackedIndexEntries().map(entry => entry.path));
}

function compilerInputPaths(configPath: string): string[] {
  if (!trackedPathSet().has(configPath) || !existsSync(resolve(repoPath, configPath))) {
    throw new Error(`TypeScript project is not a tracked file: ${configPath}`);
  }
  const absoluteConfigPath = resolve(repoPath, configPath);
  const parsedFile = ts.readConfigFile(absoluteConfigPath, ts.sys.readFile);
  if (parsedFile.error) throw new Error(ts.flattenDiagnosticMessageText(parsedFile.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(parsedFile.config, ts.sys, dirname(absoluteConfigPath), undefined, absoluteConfigPath);
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
  }
  return parsed.fileNames.map(toRepoPath).sort();
}

function reachableRelativeModules(entrypoint: string): Set<string> {
  const visited = new Set<string>();
  const pending = [entrypoint];
  while (pending.length > 0) {
    const path = pending.pop();
    if (!path || visited.has(path)) continue;
    visited.add(path);
    for (const dependency of resolveRelativeImports(path)) {
      if (dependency.startsWith('src/') && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return visited;
}

function resolveRelativeImports(path: string): string[] {
  const source = readRepoFile(path);
  const imports = ts.preProcessFile(source, true, true).importedFiles.map(reference => reference.fileName);
  return imports.filter(specifier => specifier.startsWith('.'))
    .map(specifier => resolveRelativeModule(path, specifier))
    .filter((value): value is string => value !== undefined);
}

function resolveRelativeModule(fromPath: string, specifier: string): string | undefined {
  const base = resolve(repoPath, dirname(fromPath), specifier);
  const candidates = [
    base,
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    base.replace(/\.js$/, '.d.ts'),
    resolve(base, 'index.ts'),
    resolve(base, 'index.tsx'),
  ];
  const match = candidates.find(candidate => existsSync(candidate));
  return match === undefined ? undefined : toRepoPath(match);
}

function toRepoPath(absolutePath: string): string {
  const path = relative(repoPath, absolutePath).replaceAll('\\', '/');
  if (path === '' || path === '..' || path.startsWith('../')) {
    throw new Error(`path escapes repository: ${absolutePath}`);
  }
  return path;
}

function packetFingerprint(entries: readonly GitIndexEntry[]): string {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort((left, right) => comparePacketEntries(
    [left.path, left.mode, left.objectId], [right.path, right.mode, right.objectId],
  ))) {
    hash.update(entry.path).update('\0').update(entry.mode).update('\0').update(entry.objectId).update('\0');
  }
  return hash.digest('hex');
}

function packetEntry(path: string, mode: string, objectId: string): GitIndexEntry {
  return { path, mode, objectId };
}

function comparePacketEntries(
  left: readonly [string, string, string],
  right: readonly [string, string, string],
): number {
  return left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]) || left[2].localeCompare(right[2]);
}

function splitNul(value: Buffer): Buffer[] {
  const records: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== 0) continue;
    if (index > start) records.push(value.subarray(start, index));
    start = index + 1;
  }
  if (start !== value.length) throw new Error('NUL-delimited Git output was not terminated');
  return records;
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' });
}

function gitBytes(args: string[]): Buffer {
  return execFileSync('git', args, { cwd: repoPath, maxBuffer: 128 * 1024 * 1024 });
}

function gitStatus(args: string[]) {
  return spawnSync('git', args, { cwd: repoPath });
}
