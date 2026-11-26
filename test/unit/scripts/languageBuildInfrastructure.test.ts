import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  publishDirectoryAtomically,
  publishFilesAtomically,
  writeFileAtomically,
} from '../../../scripts/atomic-publication.js';
import { STEPBIBLE_DATA, sourceFile } from '../../../scripts/biblical-language-sources.js';
import {
  downloadPinnedSource,
  type PinnedSourceRequest,
} from '../../../scripts/download-pinned-source.js';

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fakeRequest(
  statusCode: number,
  chunks: Buffer[],
  headers: Record<string, string> = {},
  resumed?: { value: boolean },
): PinnedSourceRequest {
  return ((_url, callback) => {
    const response = new EventEmitter() as EventEmitter & {
      statusCode: number;
      headers: Record<string, string>;
      resume(): void;
    };
    response.statusCode = statusCode;
    response.headers = headers;
    response.resume = () => { if (resumed) resumed.value = true; };
    queueMicrotask(() => {
      callback(response as any);
      if (statusCode === 200 && !headers.location) {
        for (const chunk of chunks) response.emit('data', chunk);
        response.emit('end');
      }
    });
    return new EventEmitter() as any;
  }) as PinnedSourceRequest;
}

describe('pinned-source acquisition boundary', () => {
  const lexicon = sourceFile(STEPBIBLE_DATA, 'tbesg-greek');

  it('rejects redirects without following a Location header', async () => {
    const resumed = { value: false };
    await expect(downloadPinnedSource(
      lexicon,
      fakeRequest(302, [], { location: 'https://evil.example/source' }, resumed),
    )).rejects.toThrow('Redirect rejected');
    expect(resumed.value).toBe(true);
  });

  it('rejects truncated bodies before returning bytes', async () => {
    await expect(downloadPinnedSource(lexicon, fakeRequest(200, [Buffer.from('partial')]))).rejects
      .toThrow('Pinned source drift');
  });

  it('rejects any host, owner, commit, or path deviation before requesting', async () => {
    const unsafe = { ...lexicon, rawUrl: lexicon.rawUrl.replace('raw.githubusercontent.com', 'example.com') };
    let requested = false;
    expect(() => downloadPinnedSource(unsafe, ((() => {
      requested = true;
      return new EventEmitter() as any;
    }) as unknown) as PinnedSourceRequest)).toThrow('Unsafe pinned source URL');
    expect(requested).toBe(false);
  });

  it('accepts exact bytes regardless of transport chunk boundaries', async () => {
    const bytes = readFileSync(lexicon.trackedPath!);
    const result = await downloadPinnedSource(lexicon, fakeRequest(200, [
      bytes.subarray(0, 65_537),
      bytes.subarray(65_537, 1_000_003),
      bytes.subarray(1_000_003),
    ]));
    expect(result.equals(bytes)).toBe(true);
  });
});

describe('atomic publication', () => {
  function paths() {
    const root = mkdtempSync(join(tmpdir(), 'theologai-publication-'));
    temporary.push(root);
    return { root, staged: join(root, 'staged'), target: join(root, 'target') };
  }

  function files() {
    const result = paths();
    mkdirSync(result.staged);
    mkdirSync(result.target);
    for (const name of ['a', 'b', 'c', 'd']) writeFileSync(join(result.staged, name), `new-${name}`);
    for (const name of ['a', 'b', 'sentinel']) writeFileSync(join(result.target, name), `old-${name}`);
    return result;
  }

  function tree(path: string) {
    return Object.fromEntries(readdirSync(path, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => {
        const fullPath = join(entry.parentPath, entry.name);
        return [fullPath.slice(path.length + 1), readFileSync(fullPath).toString('hex')];
      }));
  }

  function caught(operation: () => void): Error {
    try {
      operation();
    } catch (error) {
      if (error instanceof Error) return error;
      throw error;
    }
    throw new Error('Expected publication to fail');
  }

  it('validates the complete stage before touching canonical files', () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-publication-'));
    temporary.push(root);
    const staged = join(root, 'staged');
    const target = join(root, 'target');
    mkdirSync(staged);
    mkdirSync(target);
    writeFileSync(join(staged, 'a.json'), 'new-a');
    writeFileSync(join(target, 'a.json'), 'old-a');
    expect(() => publishFilesAtomically(staged, target, ['a.json', 'missing.json'])).toThrow('missing');
    expect(readFileSync(join(target, 'a.json'), 'utf8')).toBe('old-a');
  });

  it('rolls back the whole file set when publication fails partway through', () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-publication-'));
    temporary.push(root);
    const staged = join(root, 'staged');
    const target = join(root, 'target');
    mkdirSync(staged);
    mkdirSync(target);
    for (const name of ['a.json', 'b.json']) {
      writeFileSync(join(staged, name), `new-${name}`);
      writeFileSync(join(target, name), `old-${name}`);
    }
    let calls = 0;
    expect(() => publishFilesAtomically(staged, target, ['a.json', 'b.json'], {
      rename(source, destination) {
        calls++;
        if (calls === 4) throw new Error('injected publication failure');
        renameSync(source, destination);
      },
    })).toThrow('injected publication failure');
    expect(readFileSync(join(target, 'a.json'), 'utf8')).toBe('old-a.json');
    expect(readFileSync(join(target, 'b.json'), 'utf8')).toBe('old-b.json');
  });

  it('restores the previous directory when the atomic swap fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-publication-'));
    temporary.push(root);
    const staged = join(root, 'staged');
    const target = join(root, 'target');
    mkdirSync(staged);
    mkdirSync(target);
    writeFileSync(join(staged, 'value'), 'new');
    writeFileSync(join(target, 'value'), 'old');
    let calls = 0;
    expect(() => publishDirectoryAtomically(staged, target, {
      rename(source, destination) {
        calls++;
        if (calls === 2) throw new Error('injected directory-swap failure');
        renameSync(source, destination);
      },
    })).toThrow('injected directory-swap failure');
    expect(readFileSync(join(target, 'value'), 'utf8')).toBe('old');
  });

  it('publishes complete file sets without changing unrelated files', () => {
    const { staged, target } = files();
    const expected = { ...tree(target), ...tree(staged) };
    publishFilesAtomically(staged, target, ['a', 'b', 'c', 'd']);
    expect(tree(target)).toEqual(expected);
  });

  it.each(['backup-b', 'install-a', 'install-d'])('restores and retries after a failed %s', step => {
    const { root, staged, target } = files();
    const original = tree(target);
    const expected = { ...original, ...tree(staged) };
    const originalError = new Error(step);
    const error = caught(() => publishFilesAtomically(staged, target, ['a', 'b', 'c', 'd'], {
      rename(source, destination) {
        if ((step === 'backup-b' && source === join(target, 'b'))
          || (step === 'install-a' && source === join(staged, 'a'))
          || (step === 'install-d' && source === join(staged, 'd'))) throw originalError;
        renameSync(source, destination);
      },
    }));
    expect(error).toBe(originalError);
    expect(tree(target)).toEqual(original);
    expect(readdirSync(root).sort()).toEqual(['staged', 'target']);

    for (const name of ['a', 'b', 'c', 'd']) writeFileSync(join(staged, name), `new-${name}`);
    publishFilesAtomically(staged, target, ['a', 'b', 'c', 'd']);
    expect(tree(target)).toEqual(expected);
  });

  it.each(['restore-a', 'restore-b', 'remove-a', 'remove-c'])('preserves every original after a rollback failure at %s', step => {
    const { root, staged, target } = files();
    const original = tree(target);
    const installError = new Error('failed to install d');
    const rollbackError = new Error(step);
    const error = caught(() => publishFilesAtomically(staged, target, ['a', 'b', 'c', 'd'], {
      rename(source, destination) {
        if (source === join(staged, 'd')) throw installError;
        if (source.includes('/backup/') && step === `restore-${basename(source)}`) throw rollbackError;
        renameSync(source, destination);
      },
      remove(path, options) {
        if (step.startsWith('remove-') && path === join(target, step.slice('remove-'.length))) throw rollbackError;
        rmSync(path, options);
      },
    }));
    rmSync(staged, { recursive: true, force: true });
    const leftover = readdirSync(root).find(name => name.startsWith('.target-transaction-'));
    expect(leftover).toBeDefined();
    const backup = join(root, leftover!, 'backup');
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.cause).toBe(installError);
    expect(error.message).toContain(join(root, leftover!));
    expect(error.message).toContain(installError.message);
    expect(error.message).toContain(rollbackError.message);
    for (const name of ['a', 'b']) {
      const saved = join(backup, name);
      expect(existsSync(saved)).toBe(step === `restore-${name}` || step === `remove-${name}`);
      const retainedPath = existsSync(saved) ? saved : join(target, name);
      expect(readFileSync(retainedPath).toString('hex')).toBe(original[name]);
    }
    expect(existsSync(join(target, 'c'))).toBe(step === 'remove-c');
    expect(readFileSync(join(target, 'sentinel')).toString('hex')).toBe(original.sentinel);
  });

  it('keeps the original directory intact when backing up the target fails', () => {
    const { root, staged, target } = paths();
    mkdirSync(staged);
    mkdirSync(join(target, 'nested'), { recursive: true });
    writeFileSync(join(target, 'nested', 'value'), Buffer.from([0, 255, 3]));
    const original = tree(target);
    const backupError = new Error('injected backup failure');
    expect(caught(() => publishDirectoryAtomically(staged, target, {
      rename(source, destination) {
        if (source === target) throw backupError;
        renameSync(source, destination);
      },
    }))).toBe(backupError);
    expect(tree(target)).toEqual(original);
    expect(readdirSync(root).sort()).toEqual(['staged', 'target']);
  });

  it('preserves the backed-up directory when restoration also fails', () => {
    const { root, staged, target } = paths();
    mkdirSync(staged);
    mkdirSync(join(target, 'nested'), { recursive: true });
    writeFileSync(join(target, 'nested', 'value'), Buffer.from([0, 255, 3]));
    const original = tree(target);
    const installError = new Error('install failed');
    const restoreError = new Error('restore failed');
    const error = caught(() => publishDirectoryAtomically(staged, target, {
      rename(source, destination) {
        if (source === staged) throw installError;
        if (destination === target) throw restoreError;
        renameSync(source, destination);
      },
    }));
    rmSync(staged, { recursive: true, force: true });
    const [leftover] = readdirSync(root);
    const backup = join(root, leftover, 'previous');
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.cause).toBe(installError);
    expect(error.message).toContain(backup);
    expect(error.message).toContain(installError.message);
    expect(error.message).toContain(restoreError.message);
    expect(existsSync(target)).toBe(false);
    expect(tree(backup)).toEqual(original);
  });

  it('leaves a missing predecessor absent and then publishes the complete stage', () => {
    const { root, staged, target } = paths();
    mkdirSync(staged);
    writeFileSync(join(staged, 'value'), Buffer.from([0, 128, 255]));
    const original = tree(staged);
    const installError = new Error('install failed');
    expect(caught(() => publishDirectoryAtomically(staged, target, {
      rename() { throw installError; },
    }))).toBe(installError);
    expect(readdirSync(root)).toEqual(['staged']);
    publishDirectoryAtomically(staged, target);
    expect(tree(target)).toEqual(original);
  });

  it('replaces the entire directory and identifies post-commit cleanup failure', () => {
    const { root, staged, target } = paths();
    mkdirSync(join(staged, 'nested'), { recursive: true });
    mkdirSync(target);
    writeFileSync(join(staged, 'nested', 'new-only'), Buffer.from([0, 255]));
    writeFileSync(join(target, 'old-only'), Buffer.from([0, 128]));
    const original = tree(target);
    const expected = tree(staged);
    const cleanupError = new Error('cleanup failed');
    const error = caught(() => publishDirectoryAtomically(staged, target, {
      rename: renameSync,
      remove() { throw cleanupError; },
    }));
    const leftover = readdirSync(root).find(name => name.startsWith('.target-transaction-'));
    expect(leftover).toBeDefined();
    expect(error.cause).toBe(cleanupError);
    expect(error.message).toContain('Publication committed');
    expect(error.message).toContain(join(root, leftover!));
    expect(tree(target)).toEqual(expected);
    expect(tree(join(root, leftover!, 'previous'))).toEqual(original);
  });

  it('creates and replaces a single file with exact bytes', () => {
    const { root, target } = paths();
    for (const content of [Buffer.from([0, 128, 255]), Buffer.from([0, 1, 2])]) {
      writeFileAtomically(target, content);
      expect(readFileSync(target)).toEqual(content);
      expect(readdirSync(root)).toEqual(['target']);
    }
  });

  it('preserves both errors when staging cleanup fails after a rejected single-file install', () => {
    const { root, target } = paths();
    const original = Buffer.from([0, 255]);
    writeFileSync(target, original);
    const installError = new Error('rename failed');
    const cleanupError = new Error('cleanup failed');
    const error = caught(() => writeFileAtomically(target, Buffer.from([0, 1]), {
      rename() { throw installError; },
      remove() { throw cleanupError; },
    }));
    const leftover = readdirSync(root).find(name => name.startsWith('.target-write-'));
    expect(leftover).toBeDefined();
    expect(error).toMatchObject({ cause: installError, errors: [installError, cleanupError] });
    expect(error.message).toContain('Publication rolled back');
    expect(error.message).toContain(join(root, leftover!));
    expect(readFileSync(target)).toEqual(original);
  });

  it.each(['write', 'replace', 'create'])('preserves the previous single-file state if %s fails', step => {
    const { root, target } = paths();
    const original = Buffer.from([0, 128, 255]);
    const failure = new Error(step);
    if (step !== 'create') writeFileSync(target, original);
    const error = caught(() => writeFileAtomically(target, Buffer.from([0, 1, 2]), {
      write(path, content) {
        if (step === 'write') {
          writeFileSync(path, Buffer.from([0]));
          throw failure;
        }
        writeFileSync(path, content);
      },
      rename() { throw failure; },
    }));
    expect(error).toBe(failure);
    expect(readdirSync(root)).toEqual(step === 'create' ? [] : ['target']);
    if (step !== 'create') expect(readFileSync(target)).toEqual(original);
  });
});
