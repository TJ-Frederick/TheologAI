import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoUrl = new URL('../../../', import.meta.url);
const repoPath = fileURLToPath(repoUrl);
const base = 'b26bc518722733503e3601c4dee147e77ecae3b9';
const expectedAdditions = [
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
  'test/unit/scripts/originalLanguageStudyV2DraftInertness.test.ts',
  'test/unit/services/languages/OriginalLanguageStudyV2DraftCoordinator.test.ts',
].sort();

describe('globally inactive original_language_study v2 fixture packet', () => {
  it('contains exactly the reviewed test/design additions and no tracked modification or deletion', () => {
    const committedAdditions = lines(git(['diff', '--name-only', '--diff-filter=A', base, '--']));
    const untracked = lines(git(['ls-files', '--others', '--exclude-standard']))
      .filter(path => path !== 'node_modules');
    expect([...new Set([...committedAdditions, ...untracked])].sort()).toEqual(expectedAdditions);
    expect(lines(git(['diff', '--name-only', '--diff-filter=MD', base, '--']))).toEqual([]);
  });

  it('preserves every compiled/runtime/export/registry/config/data/migration/compiler/package input from exact base', () => {
    const protectedPaths = [
      'src', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.worker.json',
      'tsconfig.test-fixtures.json', 'wrangler.toml', 'wrangler.release.toml',
      'worker-configuration.d.ts', 'migrations', 'data', 'scripts',
    ];
    const result = spawnSync('git', ['diff', '--quiet', base, '--', ...protectedPaths], { cwd: repoPath });
    expect(result.status).toBe(0);
    const tsconfig = JSON.parse(readFileSync(new URL('tsconfig.json', repoUrl), 'utf8')) as { include: string[]; rootDir?: string };
    expect(tsconfig.include).toEqual(['src/**/*']);
    expect(expectedAdditions.some(path => path.startsWith('src/'))).toBe(false);
  });

  it('keeps all draft implementation outside compiled source and free of storage, adapter, migration, and source-byte dependencies', () => {
    for (const path of expectedAdditions.filter(path => path.includes('/support/'))) {
      const source = readFileSync(new URL(path, repoUrl), 'utf8');
      expect(source, path).not.toMatch(/from ['"][^'"]*(?:adapters\/|data\/|migrations\/)/);
      expect(source, path).not.toMatch(/\b(?:SELECT|INSERT|CREATE TABLE|D1Database|better-sqlite3)\b/i);
    }
    const allCompiledSource = git(['ls-files', 'src']);
    for (const moduleName of [
      'OriginalLanguageStudyV2DraftCoordinator', 'originalLanguageStudyV2DraftContract',
      'originalLanguageStudyV2DraftFormatter', 'originalLanguageStudyV2DraftSchema',
      'originalLanguageStudyV2DraftStructured',
    ]) expect(allCompiledSource).not.toContain(moduleName);
  });
});

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' });
}

function lines(value: string): string[] {
  return value.split('\n').map(line => line.trim()).filter(Boolean);
}
