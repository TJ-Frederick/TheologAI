import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoPath = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const sourceRoot = 'data/biblical-languages/ubs-open-license/v0.9.2';
const packetPaths = [
  `${sourceRoot}/COORDINATE-AUDIT.json`,
  `${sourceRoot}/DECODER-AUDIT.json`,
  `${sourceRoot}/NATIVE-TO-NORMALIZED-BRIDGE.json`,
  `${sourceRoot}/SCHEMA-REPORT.json`,
  `${sourceRoot}/SEMANTIC-COMPILATION-AUDIT.json`,
  `${sourceRoot}/SOURCE.json`,
  `${sourceRoot}/en/UBSHebrewDic-v0.9.2-en.JSON`,
  `${sourceRoot}/en/UBSHebrewDicLexicalDomains-v0.9.2-en.JSON`,
  `${sourceRoot}/reference-validation/USFMTC-LICENSE`,
  `${sourceRoot}/reference-validation/usfmtc-reference.py`,
  `${sourceRoot}/upstream-notices/DICTIONARIES-README.md`,
  `${sourceRoot}/upstream-notices/HEBREW-README.md`,
  `${sourceRoot}/upstream-notices/LICENSE.md`,
  'docs/UBS-HEBREW-V0.9.2-ACQUISITION.md',
  'docs/UBS-HEBREW-V0.9.2-DERIVED-NOTICE.md',
  'scripts/build-ubs-hebrew-v092-coordinate-bridge.ts',
  'scripts/verify-ubs-hebrew-v092-acquisition.ts',
  'scripts/verify-ubs-hebrew-v092-semantic-compilation.ts',
  'scripts/reproduce-ubs-hebrew-v092-coordinate-audit.ts',
  'scripts/ubs-semantics/coordinateVerifier.ts',
  'scripts/ubs-semantics/pinnedCompiler.ts',
  'scripts/ubs-semantics/rawDecoder.ts',
  'test/unit/scripts/ubsHebrewV092AcquisitionInertness.test.ts',
  'test/unit/scripts/ubsHebrewV092SemanticCompiler.test.ts',
  'test/unit/scripts/ubsRawDecoderAndCoordinateVerifier.test.ts',
  'test/unit/scripts/verifyUbsHebrewV092Acquisition.test.ts',
].sort();
const runtimeEntrypoints = ['src/index.ts', 'src/worker.ts', 'src/ccel-coordinator-worker.ts'] as const;
const exactAcquisitionReference = /data\/biblical-languages\/ubs-open-license\/v0\.9\.2|verify-ubs-hebrew-v092-acquisition|UBS-HEBREW-V0\.9\.2-ACQUISITION/i;

describe('UBS Hebrew v0.9.2 acquisition remains globally inactive', () => {
  it('limits the packet to the exact reviewed inactive files', () => {
    const candidates = repositoryPaths().filter(isPacketCandidate).sort();
    expect(candidates).toEqual(packetPaths);
    expect(candidates.every(path => lstatSync(resolve(repoPath, path)).isFile())).toBe(true);

    if (process.env.CI) {
      const modes = new Map(indexEntries().map(entry => [entry.path, entry.mode]));
      expect(packetPaths.map(path => modes.get(path))).toEqual(packetPaths.map(() => '100644'));
      expect(untrackedPaths().filter(isPacketCandidate)).toEqual([]);
    }
  });

  it('derives compiler projects from package and workflow commands and excludes the packet from every one', () => {
    const projects = compilerProjectsFromReleaseCommands();
    expect(projects).toEqual(expect.arrayContaining([
      'tsconfig.json',
      'tsconfig.worker.json',
      'tsconfig.ccel-coordinator.json',
      'test/worker-runtime/tsconfig.json',
    ]));
    for (const project of projects) {
      expect(compilerInputs(project).filter(isPacketCandidate), project).toEqual([]);
    }
  });

  it('actually builds the Node artifact and all deployed Worker variants without the packet', () => {
    const node = buildNodeArtifact();
    try {
      expect(node.files.filter(isPacketCandidate)).toEqual([]);
      expect(node.files.some(path => exactAcquisitionReference.test(readAt(node.root, path)))).toBe(false);
      expect(existsSync(resolve(node.root, 'dist/index.js'))).toBe(true);
    } finally {
      rmSync(node.parent, { recursive: true, force: true });
    }

    const bundles = buildWorkerBundles();
    try {
      expect(bundles.map(bundle => bundle.name).sort()).toEqual(['coordinator', 'preview', 'production']);
      for (const bundle of bundles) {
        expect(bundle.inputs.map(normalizeBundleInput).filter(isPacketCandidate), bundle.name).toEqual([]);
        expect(bundle.sources.some(source => exactAcquisitionReference.test(source)), bundle.name).toBe(false);
      }
    } finally {
      rmSync(bundles[0]!.parent, { recursive: true, force: true });
    }
  });

  it('is unreachable from every runtime entrypoint while local materialization records its exact source inputs', () => {
    const reachable = new Set<string>();
    for (const entrypoint of runtimeEntrypoints) {
      for (const path of reachableModules(entrypoint)) reachable.add(path);
    }
    expect([...reachable].filter(isPacketCandidate)).toEqual([]);
    expect([...reachable].filter(path => exactAcquisitionReference.test(read(path)))).toEqual([]);

    for (const path of ['wrangler.toml', 'package.json', 'src/worker.ts', 'src/worker-server.ts']) {
      expect(read(path), path).not.toMatch(exactAcquisitionReference);
    }
    expect(existsSync(resolve(repoPath, 'migrations/0004_ubs_hebrew_semantics.sql'))).toBe(true);
    const manifest = JSON.parse(read('data/data-manifest.json')) as {
      schemaVersion: string;
      materializations: { d1: { transformVersion: number; inputs: string[] } };
    };
    expect(manifest).toMatchObject({
      schemaVersion: '0005_historical_section_identity_delivery',
      materializations: { d1: { transformVersion: 8 } },
    });
    expect(manifest.materializations.d1.inputs.filter(path => path.startsWith(sourceRoot))).toEqual([
      `${sourceRoot}/NATIVE-TO-NORMALIZED-BRIDGE.json`,
      `${sourceRoot}/SEMANTIC-COMPILATION-AUDIT.json`,
      `${sourceRoot}/SOURCE.json`,
      `${sourceRoot}/en/UBSHebrewDic-v0.9.2-en.JSON`,
      `${sourceRoot}/en/UBSHebrewDicLexicalDomains-v0.9.2-en.JSON`,
    ]);
  });

  it('records npm inclusion as prohibited incidental packaging debt without changing package policy', () => {
    const packageJson = JSON.parse(read('package.json')) as Record<string, unknown>;
    expect(packageJson.files).toBeUndefined();
    expect(JSON.stringify(packageJson.scripts ?? {})).not.toMatch(exactAcquisitionReference);
    expect(packageEntrypoints(packageJson).filter(isPacketCandidate)).toEqual([]);

    const packlist = npmPacklist();
    expect(packlist.filter(isPacketCandidate).sort()).toEqual(packetPaths);
    expect(packlist).not.toContain('dist/index.js');
  });
});

function isPacketCandidate(path: string): boolean {
  return path.startsWith(`${sourceRoot}/`)
    || /(?:^|\/)UBS-HEBREW-V0\.9\.2-ACQUISITION\.md$/i.test(path)
    || /(?:^|\/)verifyUbsHebrewV092Acquisition\.test\.ts$/i.test(path)
    || /(?:^|\/)ubsHebrewV092AcquisitionInertness\.test\.ts$/i.test(path)
    || /(?:^|\/)ubsRawDecoderAndCoordinateVerifier\.test\.ts$/i.test(path)
    || /(?:^|\/)ubs-semantics\/(?:rawDecoder|coordinateVerifier|pinnedCompiler)\.ts$/i.test(path)
    || /(?:^|\/)reproduce-ubs-hebrew-v092-coordinate-audit\.ts$/i.test(path)
    || /(?:^|\/)build-ubs-hebrew-v092-coordinate-bridge\.ts$/i.test(path)
    || /(?:^|\/)verify-ubs-hebrew-v092-(?:acquisition|semantic-compilation)\.ts$/i.test(path)
    || /(?:^|\/)ubsHebrewV092SemanticCompiler\.test\.ts$/i.test(path)
    || /(?:^|\/)UBS-HEBREW-V0\.9\.2-DERIVED-NOTICE\.md$/i.test(path);
}

function repositoryPaths(): string[] {
  return [...new Set([...indexEntries().map(entry => entry.path), ...untrackedPaths()])].sort();
}

function indexEntries(): Array<{ path: string; mode: string }> {
  return git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean).map(record => {
    const [metadata, path] = record.split('\t');
    const [mode, , stage] = metadata!.split(' ');
    if (!path || !mode || stage !== '0') throw new Error('Git index contains a non-stage-zero or malformed entry');
    return { path, mode };
  });
}

function untrackedPaths(): string[] {
  return git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort();
}

function compilerProjectsFromReleaseCommands(): string[] {
  const packageJson = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
  const workflows = repositoryPaths().filter(path => /^\.github\/workflows\/.*\.ya?ml$/.test(path)).map(read);
  const commands = [...Object.values(packageJson.scripts ?? {}), ...workflows];
  const projects = new Set<string>();
  for (const command of commands) {
    for (const segment of command.split(/&&|\|\||;/)) {
      if (!/(?:^|\s)(?:npx\s+--no-install\s+)?tsc(?:\s|$)/m.test(segment)) continue;
      const configured = [...segment.matchAll(/(?:^|\s)(?:--project|-p)(?:\s+|=)([^\s;&|]+)/gm)];
      if (configured.length === 0) projects.add('tsconfig.json');
      for (const match of configured) projects.add(match[1]!.replace(/^['"]|['"]$/g, ''));
    }
  }
  if (projects.size === 0) throw new Error('No TypeScript release projects were discovered');
  return [...projects].sort();
}

function compilerInputs(configPath: string): string[] {
  const absolute = resolve(repoPath, configPath);
  if (!existsSync(absolute)) throw new Error(`Compiler project does not resolve: ${configPath}`);
  const loaded = ts.readConfigFile(absolute, ts.sys.readFile);
  if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, dirname(absolute), undefined, absolute);
  if (parsed.errors.length) throw new Error(parsed.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
  return parsed.fileNames.map(path => repoRelative(path)).filter(path => !path.startsWith('../')).sort();
}

function buildNodeArtifact(): { parent: string; root: string; files: string[] } {
  const parent = mkdtempSync(join(tmpdir(), 'theologai-ubs-node-'));
  const root = parent;
  try {
    execFileSync(resolve(nodeModulesRoot(), '.bin/tsc'), [
      '--project', resolve(repoPath, 'tsconfig.json'), '--outDir', resolve(root, 'dist'),
    ], { cwd: repoPath, stdio: 'pipe' });
    return { parent, root, files: filesBelow(root) };
  } catch (error) {
    rmSync(parent, { recursive: true, force: true });
    throw error;
  }
}

function buildWorkerBundles(): Array<{ name: string; parent: string; inputs: string[]; sources: string[] }> {
  const parent = mkdtempSync(join(tmpdir(), 'theologai-ubs-worker-'));
  const specs = [
    { name: 'production', args: ['deploy', '--dry-run', '--env=', '--env-file', '/dev/null'] },
    { name: 'preview', args: ['deploy', '--dry-run', '--env', 'preview', '--env-file', '/dev/null'] },
    { name: 'coordinator', args: ['deploy', '--dry-run', '--config', 'wrangler.ccel-coordinator.toml', '--env-file', '/dev/null'] },
  ];
  try {
    return specs.map(spec => {
      const outdir = join(parent, spec.name);
      execFileSync(wranglerExecutable(), [...spec.args, '--outdir', outdir, '--metafile'], {
        cwd: repoPath,
        stdio: 'pipe',
        env: { ...process.env, WRANGLER_LOG_PATH: join(parent, `${spec.name}.log`), WRANGLER_SEND_METRICS: 'false' },
      });
      const meta = JSON.parse(readFileSync(join(outdir, 'bundle-meta.json'), 'utf8')) as { inputs?: Record<string, unknown> };
      if (!meta.inputs || Object.keys(meta.inputs).length === 0) throw new Error(`${spec.name} Wrangler metafile has no inputs`);
      const js = filesBelow(outdir).filter(path => path.endsWith('.js'));
      if (js.length === 0) throw new Error(`${spec.name} Wrangler dry run produced no JavaScript bundle`);
      return { name: spec.name, parent, inputs: Object.keys(meta.inputs), sources: js.map(path => readAt(outdir, path)) };
    });
  } catch (error) {
    rmSync(parent, { recursive: true, force: true });
    throw error;
  }
}

function normalizeBundleInput(path: string): string {
  const absolute = resolve(repoPath, path);
  return repoRelative(absolute);
}

function reachableModules(entrypoint: string): Set<string> {
  const visited = new Set<string>();
  const pending = [entrypoint];
  while (pending.length) {
    const path = pending.pop()!;
    if (visited.has(path)) continue;
    visited.add(path);
    for (const imported of ts.preProcessFile(read(path), true, true).importedFiles) {
      if (!imported.fileName.startsWith('.')) continue;
      const dependency = resolveModule(path, imported.fileName);
      if (dependency?.startsWith('src/') && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return visited;
}

function resolveModule(from: string, specifier: string): string | undefined {
  const base = resolve(repoPath, dirname(from), specifier);
  const candidates = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), resolve(base, 'index.ts')];
  const found = candidates.find(existsSync);
  return found ? repoRelative(found) : undefined;
}

function packageEntrypoints(packageJson: Record<string, unknown>): string[] {
  const results: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === 'string') results.push(value.replace(/^\.\//, ''));
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  for (const key of ['main', 'module', 'types', 'bin', 'exports']) collect(packageJson[key]);
  return [...new Set(results)].sort();
}

function npmPacklist(): string[] {
  const parent = mkdtempSync(join(tmpdir(), 'theologai-ubs-pack-'));
  try {
    const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: repoPath,
      encoding: 'utf8',
      env: { ...process.env, npm_config_cache: join(parent, 'cache'), npm_config_update_notifier: 'false' },
      maxBuffer: 16 * 1024 * 1024,
    });
    const result = JSON.parse(output) as Array<{ files?: Array<{ path?: string }> }>;
    if (!Array.isArray(result[0]?.files)) throw new Error('npm pack did not return a file manifest');
    return result[0]!.files!.map(file => String(file.path)).sort();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

function filesBelow(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path).replaceAll('\\', '/'));
    }
  };
  visit(root);
  return files.sort();
}

function read(path: string): string { return readFileSync(resolve(repoPath, path), 'utf8'); }
function readAt(root: string, path: string): string { return readFileSync(resolve(root, path), 'utf8'); }
function repoRelative(path: string): string { return relative(repoPath, path).replaceAll('\\', '/'); }
function nodeModulesRoot(): string {
  return resolve(dirname(require.resolve('typescript')), '..', '..');
}
function wranglerExecutable(): string {
  const configured = process.env.WRANGLER_BIN;
  const executable = configured ? resolve(configured) : resolve(nodeModulesRoot(), '.bin/wrangler');
  if (!existsSync(executable)) throw new Error(`Wrangler executable is unavailable: ${executable}`);
  return executable;
}
function git(args: string[]): string { return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }); }
