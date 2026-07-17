import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoUrl = new URL('../../../', import.meta.url);
const repoPath = fileURLToPath(repoUrl);
const BASE_REMAINDER_TREE_SHA256 = 'a419292a91a85952e8d884f80d94596c018e566ecd0472d206a0ead28c1e0fb7';
const BASE_PROTECTED_TREE_SHA256 = '23f6f4b8c6157b9ccf567a5824b6b17918680d9607f9198881b9a0d697a1046d';
const protectedPaths = [
  'src', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.worker.json',
  'tsconfig.test-fixtures.json', 'wrangler.toml', 'wrangler.release.toml',
  'worker-configuration.d.ts', 'migrations', 'data', 'scripts',
] as const;
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
  it('contains exactly the reviewed packet and preserves every other tracked path and byte from the reviewed main tree', () => {
    const tracked = trackedEntries();
    const trackedPacket = tracked.map(entry => entry.path).filter(isOlS3DraftPath).sort();
    const untracked = untrackedPaths();
    if (untracked.length === 0) expect(trackedPacket).toEqual(expectedAdditions);
    else {
      expect(untracked).toEqual(expectedAdditions);
      expect(trackedPacket).toEqual([]);
    }
    expect(treeDigest(tracked.filter(entry => !expectedAdditions.includes(entry.path)))).toBe(BASE_REMAINDER_TREE_SHA256);
  });

  it('independently pins every compiled/runtime/export/registry/config/data/migration/compiler/package byte', () => {
    const protectedTracked = trackedEntries().filter(entry => protectedPaths.some(root => inPath(entry.path, root)));
    expect(treeDigest(protectedTracked)).toBe(BASE_PROTECTED_TREE_SHA256);
    const tsconfig = JSON.parse(readFileSync(new URL('tsconfig.json', repoUrl), 'utf8')) as { include: string[]; rootDir?: string };
    expect(tsconfig.include).toEqual(['src/**/*']);
    expect(expectedAdditions.some(path => protectedPaths.some(root => inPath(path, root)))).toBe(false);
  });

  it('allows only the complete precommit packet or no untracked files and requires clean tracked state in CI', () => {
    const untracked = untrackedPaths();
    expect(untracked.length === 0 || JSON.stringify(untracked) === JSON.stringify(expectedAdditions)).toBe(true);
    const worktree = spawnSync('git', ['diff', '--quiet'], { cwd: repoPath });
    const index = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: repoPath });
    expect(index.status, 'index must equal HEAD').toBe(0);
    if (process.env.CI) {
      expect(worktree.status, 'CI tracked working tree must equal HEAD').toBe(0);
    } else {
      const dirty = git(['diff', '--name-only', '-z']).split('\0').filter(Boolean);
      expect(dirty.every(path => expectedAdditions.includes(path)), 'local tracked drift must remain inside the exact packet').toBe(true);
    }
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

  it('makes missing, extra, content, executable-mode, and regular/symlink changes produce distinct identities', () => {
    const entries = [
      syntheticEntry('alpha', '100644', 'regular_file', '1', 'one'),
      syntheticEntry('beta', '100644', 'regular_file', '2', 'two'),
    ];
    const baseline = digestEntries(entries);
    expect(digestEntries(entries.slice(0, 1))).not.toBe(baseline);
    expect(digestEntries([...entries, syntheticEntry('gamma', '100644', 'regular_file', '3', '')])).not.toBe(baseline);
    expect(digestEntries([{ ...entries[0]!, objectId: '4'.repeat(40), content: Buffer.from('changed') }, entries[1]!])).not.toBe(baseline);
    expect(digestEntries([{ ...entries[0]!, mode: '100755', entryType: 'executable_file' }, entries[1]!])).not.toBe(baseline);
    expect(digestEntries([{ ...entries[0]!, mode: '120000', entryType: 'symbolic_link' }, entries[1]!])).not.toBe(baseline);
  });
});

interface GitTreeEntry {
  path: string;
  pathBytes: Buffer;
  mode: string;
  entryType: 'regular_file' | 'executable_file' | 'symbolic_link' | 'gitlink';
  objectType: string;
  objectId: string;
  content: Buffer;
}

function trackedEntries(): GitTreeEntry[] {
  const records = splitNul(gitBytes(['ls-files', '--stage', '-z']));
  const indexed = records.map(record => {
    const tab = record.indexOf(0x09);
    if (tab < 0) throw new Error('git ls-files --stage returned an invalid record');
    const [mode, objectId, stage] = record.subarray(0, tab).toString('ascii').split(' ');
    if (!mode || !objectId || stage !== '0') throw new Error('tracked packet identity requires stage-zero index entries');
    const pathBytes = record.subarray(tab + 1);
    return { path: pathBytes.toString('utf8'), pathBytes, mode, objectId };
  });
  const objects = readGitObjects([...new Set(indexed.map(entry => entry.objectId))]);
  return indexed.map(entry => {
    const object = objects.get(entry.objectId);
    if (!object) throw new Error(`git cat-file omitted ${entry.objectId}`);
    return {
      ...entry,
      entryType: entryType(entry.mode),
      objectType: object.type,
      content: object.content,
    };
  }).sort((left, right) => Buffer.compare(left.pathBytes, right.pathBytes));
}

function isOlS3DraftPath(path: string): boolean {
  return path.startsWith('test/fixtures/original-language-study-v2/')
    || /(?:^|\/)originalLanguageStudyV2Draft[^/]*$/i.test(path);
}

function untrackedPaths(): string[] {
  return git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')
    .filter(path => path && path !== 'node_modules').sort();
}

function inPath(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function treeDigest(entries: readonly GitTreeEntry[]): string {
  return digestEntries(entries);
}

function digestEntries(entries: readonly GitTreeEntry[]): string {
  const hash = createHash('sha256');
  hash.update('theologai-git-index-tree-v2\0', 'utf8');
  for (const entry of [...entries].sort((left, right) => Buffer.compare(left.pathBytes, right.pathBytes))) {
    for (const value of [
      entry.pathBytes, Buffer.from(entry.mode, 'ascii'), Buffer.from(entry.entryType, 'ascii'),
      Buffer.from(entry.objectType, 'ascii'), Buffer.from(entry.objectId, 'ascii'), entry.content,
    ]) updateFramed(hash, value);
  }
  return hash.digest('hex');
}

function readGitObjects(objectIds: readonly string[]): Map<string, { type: string; content: Buffer }> {
  const output = execFileSync('git', ['cat-file', '--batch'], {
    cwd: repoPath,
    input: Buffer.from(`${objectIds.join('\n')}\n`, 'ascii'),
    maxBuffer: 128 * 1024 * 1024,
  });
  const objects = new Map<string, { type: string; content: Buffer }>();
  let offset = 0;
  for (const requested of objectIds) {
    const newline = output.indexOf(0x0a, offset);
    if (newline < 0) throw new Error('git cat-file --batch returned a truncated header');
    const [objectId, type, sizeText] = output.subarray(offset, newline).toString('ascii').split(' ');
    const size = Number(sizeText);
    if (objectId !== requested || !type || !Number.isSafeInteger(size) || size < 0) {
      throw new Error('git cat-file --batch returned an invalid object header');
    }
    const start = newline + 1;
    const end = start + size;
    if (end >= output.length || output[end] !== 0x0a) throw new Error('git cat-file --batch returned truncated object bytes');
    objects.set(objectId, { type, content: Buffer.from(output.subarray(start, end)) });
    offset = end + 1;
  }
  if (offset !== output.length) throw new Error('git cat-file --batch returned trailing bytes');
  return objects;
}

function entryType(mode: string): GitTreeEntry['entryType'] {
  if (mode === '100644') return 'regular_file';
  if (mode === '100755') return 'executable_file';
  if (mode === '120000') return 'symbolic_link';
  if (mode === '160000') return 'gitlink';
  throw new Error(`unsupported tracked Git mode ${mode}`);
}

function syntheticEntry(
  path: string,
  mode: string,
  type: GitTreeEntry['entryType'],
  objectDigit: string,
  content: string,
): GitTreeEntry {
  return {
    path, pathBytes: Buffer.from(path), mode, entryType: type, objectType: 'blob',
    objectId: objectDigit.repeat(40), content: Buffer.from(content),
  };
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

function updateFramed(hash: ReturnType<typeof createHash>, value: Buffer): void {
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(value.byteLength));
  hash.update(length);
  hash.update(value);
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' });
}

function gitBytes(args: string[]): Buffer {
  return execFileSync('git', args, { cwd: repoPath, maxBuffer: 128 * 1024 * 1024 });
}
