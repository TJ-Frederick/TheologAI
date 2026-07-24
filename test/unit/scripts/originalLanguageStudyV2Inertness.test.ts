import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { originalLanguageStudyV2InputSchema } from '../../../src/mcp/schemas/originalLanguageStudyV2.js';
import {
  ORIGINAL_LANGUAGE_STUDY_V2_SEMANTIC_ARTIFACT_IDENTITY,
} from '../../../src/services/languages/OriginalLanguageStudyV2ContextProvider.js';

const repoPath = fileURLToPath(new URL('../../../', import.meta.url));
const frozenDraftFixtureRoot = 'test/fixtures/original-language-study-v2/';
const activatedModules = [
  'src/kernel/originalLanguageStudyV2Contract.ts',
  'src/mcp/schemas/originalLanguageStudyV2.ts',
  'src/presenters/originalLanguageStudyV2Structured.ts',
  'src/formatters/originalLanguageStudyV2Formatter.ts',
  'src/services/languages/OriginalLanguageStudyV2Coordinator.ts',
  'src/services/languages/OriginalLanguageStudyV2ContextProvider.ts',
] as const;
const runtimeEntrypoints = [
  'src/index.ts',
  'src/worker.ts',
] as const;

describe('activated original_language_study v2 runtime seam', () => {
  it('is reachable from both production runtimes while frozen draft fixtures remain unreachable', () => {
    for (const entrypoint of runtimeEntrypoints) {
      const reachable = reachableModules(entrypoint);
      expect(activatedModules.filter(path => !reachable.has(path)), entrypoint).toEqual([]);
      expect([...reachable].filter(path => path.startsWith(frozenDraftFixtureRoot)), entrypoint).toEqual([]);
    }
  });

  it('registers the same public tool with the closed v2 input boundary and no caller-controlled semantic authority', () => {
    const registry = read('src/tools/toolRegistry.ts');
    const nodeRoot = read('src/tools/v2/index.ts');
    const workerRoot = read('src/tools/worker/index.ts');
    expect(registry).toContain('originalLanguageStudyCoordinator');
    expect(nodeRoot).toContain('new UbsSemanticEvidenceBundleRepository(db)');
    expect(workerRoot).toContain('new D1UbsSemanticEvidenceBundleRepository(db)');
    expect(JSON.stringify(originalLanguageStudyV2InputSchema))
      .not.toMatch(/artifactIdentity|sourceIdentity|serverVerifiedAlignment|verifierVersion/);
  });

  it('keeps the pinned artifact identity and aggregate repository seam runtime-small and storage configuration-free', () => {
    const provider = read('src/services/languages/OriginalLanguageStudyV2ContextProvider.ts');
    const coordinator = read('src/services/languages/OriginalLanguageStudyV2Coordinator.ts');
    expect(ORIGINAL_LANGUAGE_STUDY_V2_SEMANTIC_ARTIFACT_IDENTITY)
      .toBe('bd19fb99f7bbfd13ad68f2184aaded4a6e5587196ad76b68b0c22bf971fc90f6');
    expect(provider).not.toMatch(/(?:scripts\/|SEMANTIC-COMPILATION-AUDIT|data\/biblical-languages|D1Database|better-sqlite3|THEOLOGAI_)/);
    expect(coordinator).toContain('queryUbsSemanticEvidenceBundle(this.evidenceRepository');
    expect(coordinator).not.toMatch(/originalLanguageStudyV2Draft|test\/fixtures/);
  });
});

function reachableModules(entrypoint: string): Set<string> {
  const reached = new Set<string>();
  const visit = (path: string) => {
    if (reached.has(path)) return;
    reached.add(path);
    for (const specifier of ts.preProcessFile(read(path), true, true).importedFiles
      .map(reference => reference.fileName).filter(value => value.startsWith('.'))) {
      const resolved = resolveImport(path, specifier);
      if (resolved) visit(resolved);
    }
  };
  visit(entrypoint);
  return reached;
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
