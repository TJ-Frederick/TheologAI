import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const readiness = require('../../../.github/scripts/operator-readiness.cjs');
const helper = resolve('.github/scripts/operator-readiness.cjs');
const directories: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'operator-readiness-test-')); directories.push(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--initial-branch=main'); git('config', 'user.name', 'Readiness fixture'); git('config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(root, 'README.md'), 'fixture\n'); git('add', 'README.md'); git('commit', '-m', 'fixture');
  const source = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
  return { root, git, input: { source, tree, base: source } };
}

describe('offline operator readiness', () => {
  it('verifies complete independent history without mutating its Git index', () => {
    const f = fixture(), before = readFileSync(join(f.root, '.git/index'));
    expect(() => readiness.verifyCheckout(f.root, f.input, f.input.base)).not.toThrow();
    expect(readFileSync(join(f.root, '.git/index'))).toEqual(before);
  });

  it.each(['dirty', 'untracked', 'shallow', 'partial', 'alternates', 'grafts', 'replace', 'skip', 'assume', 'missing', 'corrupt', 'object-link', 'config-include'])('refuses %s preparation without repair', fault => {
    const f = fixture();
    if (fault === 'dirty') writeFileSync(join(f.root, 'README.md'), 'changed\n');
    if (fault === 'untracked') writeFileSync(join(f.root, 'extra.txt'), 'extra');
    if (fault === 'shallow') writeFileSync(join(f.root, '.git/shallow'), f.input.source + '\n');
    if (fault === 'partial') f.git('config', 'remote.origin.promisor', 'true');
    if (fault === 'alternates') writeFileSync(join(f.root, '.git/objects/info/alternates'), '/absent-object-store\n');
    if (fault === 'grafts') writeFileSync(join(f.root, '.git/info/grafts'), f.input.source + '\n');
    if (fault === 'replace') f.git('update-ref', 'refs/replace/' + f.input.source, f.input.source);
    if (fault === 'skip') f.git('update-index', '--skip-worktree', 'README.md');
    if (fault === 'assume') f.git('update-index', '--assume-unchanged', 'README.md');
    if (fault === 'missing' || fault === 'corrupt') {
      const blob = f.git('rev-parse', 'HEAD:README.md'), path = join(f.root, '.git/objects', blob.slice(0, 2), blob.slice(2));
      rmSync(path); if (fault === 'corrupt') writeFileSync(path, 'invalid loose object');
    }
    if (fault === 'object-link') { renameSync(join(f.root, '.git/objects'), join(f.root, 'borrowed-objects')); symlinkSync(join(f.root, 'borrowed-objects'), join(f.root, '.git/objects'), 'dir'); }
    if (fault === 'config-include') f.git('config', 'include.path', '/absent-private-config');
    expect(() => readiness.verifyCheckout(f.root, f.input, f.input.base)).toThrow('Operator readiness refused:');
    if (fault === 'dirty') expect(readFileSync(join(f.root, 'README.md'), 'utf8')).toBe('changed\n');
    if (fault === 'alternates') expect(existsSync(join(f.root, '.git/objects/info/alternates'))).toBe(true);
  });

  it('refuses a shared worktree and preserves the original independent store', () => {
    const f = fixture(), worktree = join(f.root, 'worktree');
    f.git('worktree', 'add', '--detach', worktree, f.input.source);
    expect(() => readiness.verifyCheckout(worktree, f.input, f.input.base)).toThrow('independent operator clone required');
    expect(() => readiness.verifyCheckout(f.root, f.input, f.input.base)).toThrow('clean source checkout required');
    expect(f.git('cat-file', '-t', f.input.source)).toBe('commit');
  });

  it.each(['source', 'tree', 'base'])('refuses an incorrect expected %s', key => {
    const f = fixture();
    expect(() => readiness.verifyCheckout(f.root, { ...f.input, [key]: '0'.repeat(40) }, f.input.base)).toThrow('Operator readiness refused:');
  });

  it('refuses an unrelated base even when all its objects are present', () => {
    const f = fixture(); f.git('checkout', '--orphan', 'other'); f.git('commit', '-m', 'unrelated'); const unrelated = f.git('rev-parse', 'HEAD'); f.git('checkout', '--detach', f.input.source);
    expect(() => readiness.verifyCheckout(f.root, { ...f.input, base: unrelated }, f.input.base)).toThrow('release baseline ancestry');
  });

  it('uses an explicit child environment without caller auth, preloads or Git overrides', () => {
    for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'GIT_DIR', 'GIT_CONFIG_COUNT', 'GH_TOKEN', 'CLOUDFLARE_API_TOKEN']) vi.stubEnv(key, 'synthetic-private-value');
    const env = readiness.childEnvironment();
    for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'GIT_DIR', 'GIT_CONFIG_COUNT', 'GH_TOKEN', 'CLOUDFLARE_API_TOKEN']) expect(env).not.toHaveProperty(key);
    expect(env).toMatchObject({ GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1' });
  });

  it('permits only the explicitly bound release dependency link alongside clean source', () => {
    const f = fixture(), toolchain = mkdtempSync(join(tmpdir(), 'operator-readiness-toolchain-')); directories.push(toolchain);
    mkdirSync(join(toolchain, 'node_modules')); symlinkSync(join(toolchain, 'node_modules'), join(f.root, 'node_modules'), 'dir');
    expect(() => readiness.verifyCheckout(f.root, { ...f.input, toolchain }, f.input.base)).not.toThrow();
    expect(() => readiness.verifyCheckout(f.root, f.input, f.input.base)).toThrow('clean source checkout required');
    writeFileSync(join(f.root, 'other-untracked'), 'unexpected');
    expect(() => readiness.verifyCheckout(f.root, { ...f.input, toolchain }, f.input.base)).toThrow('clean source checkout required');
  });

  it('distinguishes absent optional artifacts from provided but incomplete arguments', () => {
    const args = ['--source', 'a'.repeat(40), '--tree', 'b'.repeat(40), '--base', 'c'.repeat(40), '--toolchain', '/prepared'];
    expect(readiness.argumentsFor(args)).toMatchObject({ artifactDirectory: undefined, planSha256: undefined });
    expect(() => readiness.argumentsFor([...args, '--artifact-directory', '/inputs'])).toThrow('together');
    expect(() => readiness.argumentsFor([...args, '--plan-sha256', 'd'.repeat(64)])).toThrow('together');
    expect(readiness.argumentsFor([...args, '--artifact-directory', '/inputs', '--plan-sha256', 'd'.repeat(64)])).toMatchObject({ artifactDirectory: '/inputs' });
  });

  it.each([[], ['--repair', 'true'], ['--source', 'secret-path'], ['--source', 'a'.repeat(40), '--source', 'b'.repeat(40)]])('fails closed at the actual CLI boundary with bounded public reasons: %j', (...args) => {
    const f = fixture(), before = createHash('sha256').update(readFileSync(join(f.root, '.git/index'))).digest('hex');
    const result = spawnSync(process.execPath, [helper, ...args], { cwd: f.root, encoding: 'utf8', timeout: 10_000 });
    expect(result.status).toBe(1); expect(result.stdout).toBe(''); expect(result.stderr).toMatch(/^Operator readiness refused: [a-zA-Z0-9 /_-]+\n$/);
    expect(result.stderr).not.toContain('secret-path');
    expect(createHash('sha256').update(readFileSync(join(f.root, '.git/index'))).digest('hex')).toBe(before);
  });
});
