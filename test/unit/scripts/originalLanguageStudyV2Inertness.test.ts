import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { originalLanguageStudyV2InputSchema } from '../../../src/mcp/schemas/originalLanguageStudyV2.js';

const repoPath = fileURLToPath(new URL('../../../', import.meta.url));
const frozenDraftFixtureRoot = 'test/fixtures/original-language-study-v2/';
const inactiveModules = [
  'src/kernel/originalLanguageStudyV2Contract.ts',
  'src/mcp/schemas/originalLanguageStudyV2.ts',
  'src/presenters/originalLanguageStudyV2Structured.ts',
  'src/formatters/originalLanguageStudyV2Formatter.ts',
  'src/services/languages/OriginalLanguageStudyV2Coordinator.ts',
] as const;
const runtimeEntrypoints = [
  'src/index.ts',
  'src/worker.ts',
  'src/ccel-coordinator-worker.ts',
] as const;
const registrationAndCompositionRoots = [
  'src/server.ts',
  'src/worker-server.ts',
  'src/mcp/server.ts',
  'src/mcp/tools.ts',
  'src/mcp/prompts.ts',
  'src/tools/toolRegistry.ts',
  'src/tools/v2/index.ts',
  'src/tools/worker/index.ts',
] as const;
const productionTestAndFixtureModules = [
  'test/helpers/originalLanguageStudyV2ProductionFixtures.ts',
  'test/unit/formatters/originalLanguageStudyV2Formatter.test.ts',
  'test/unit/mcp/originalLanguageStudyV2Schema.test.ts',
  'test/unit/presenters/originalLanguageStudyV2Structured.test.ts',
  'test/unit/services/languages/OriginalLanguageStudyV2Coordinator.test.ts',
  'test/unit/scripts/originalLanguageStudyV2Inertness.test.ts',
] as const;

describe('inactive original_language_study v2 implementation', () => {
  it('is absent from every Node, Worker, and coordinator runtime import graph', () => {
    const unreachable = new Set(inactiveModules);
    for (const entrypoint of runtimeEntrypoints) {
      const reachable = reachableModules(entrypoint);
      expect([...unreachable].filter(path => reachable.has(path)), entrypoint).toEqual([]);
    }
  });

  it('does not alter public registration, composition, or prompt surfaces', () => {
    for (const path of registrationAndCompositionRoots) {
      const source = read(path);
      expect(source, path).not.toMatch(/originalLanguageStudyV2|OriginalLanguageStudyV2/);
      expect(source, path).not.toMatch(/semantic_candidates|schemaVersion:\s*['"]2['"]/);
    }
  });

  it('keeps the v2 implementation storage-agnostic and rejects test-fixture/runtime backdoors', () => {
    for (const path of inactiveModules) {
      const source = read(path);
      expect(source, path).not.toMatch(/originalLanguageStudyV2Draft|test\/fixtures|D1Database|better-sqlite3|wrangler|THEOLOGAI_|CREATE\s+TABLE|INSERT\s+INTO/i);
    }
    expect(JSON.stringify(originalLanguageStudyV2InputSchema))
      .not.toMatch(/artifactIdentity|sourceIdentity|serverVerifiedAlignment|verifierVersion/);
  });

  it('keeps production behavior tests and helpers independent of the frozen draft fixture graph', () => {
    const reachable = new Set<string>();
    for (const path of productionTestAndFixtureModules) {
      for (const dependency of reachableModules(path)) reachable.add(dependency);
    }
    expect([...reachable].filter(isFrozenDraftFixtureModule)).toEqual([]);
  });

  it('detects a transitive archive import even when its raw relative specifier omits test/fixtures', () => {
    const entry = 'test/helpers/productionProbe.ts';
    const intermediate = 'test/helpers/productionProbeIndirect.ts';
    const archiveSpecifier = '../fixtures/original-language-study-v2/support/syntheticOriginalLanguageStudyV2Fixtures.js';
    const archive = resolveImport(intermediate, archiveSpecifier);
    expect(archive).toBe(`${frozenDraftFixtureRoot}support/syntheticOriginalLanguageStudyV2Fixtures.ts`);

    const virtualSources: Record<string, string> = {
      [entry]: "import './productionProbeIndirect.js';",
      [intermediate]: `import '${archiveSpecifier}';`,
    };
    const reachable = reachableModules(
      entry,
      path => virtualSources[path] ?? read(path),
      (from, specifier) => from === entry && specifier === './productionProbeIndirect.js'
        ? intermediate : resolveImport(from, specifier),
    );
    const archived = [...reachable].filter(isFrozenDraftFixtureModule);
    expect(archived).toContain(`${frozenDraftFixtureRoot}support/syntheticOriginalLanguageStudyV2Fixtures.ts`);
    expect(archived.every(isFrozenDraftFixtureModule)).toBe(true);
  });
});

function reachableModules(
  entrypoint: string,
  readModule: (path: string) => string = read,
  resolveModule: (from: string, specifier: string) => string | undefined = resolveImport,
): Set<string> {
  const reached = new Set<string>();
  const visit = (path: string) => {
    if (reached.has(path)) return;
    reached.add(path);
    for (const dependency of relativeImports(readModule(path))) {
      const resolved = resolveModule(path, dependency);
      if (resolved) visit(resolved);
    }
  };
  visit(entrypoint);
  return reached;
}

function isFrozenDraftFixtureModule(path: string): boolean {
  return path.startsWith(frozenDraftFixtureRoot);
}

function relativeImports(source: string): string[] {
  return ts.preProcessFile(source, true, true).importedFiles
    .map(reference => reference.fileName)
    .filter(specifier => specifier.startsWith('.'));
}

function resolveImport(from: string, specifier: string): string | undefined {
  const base = resolve(repoPath, dirname(from), specifier);
  const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, resolve(base, 'index.ts')];
  const file = candidates.find(candidate => existsSync(candidate));
  return file === undefined ? undefined : relative(repoPath, file).replaceAll('\\', '/');
}

function read(path: string): string {
  return readFileSync(resolve(repoPath, path), 'utf8');
}
