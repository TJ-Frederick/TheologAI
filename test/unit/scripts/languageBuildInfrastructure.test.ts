import { EventEmitter } from 'node:events';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  publishDirectoryAtomically,
  publishFilesAtomically,
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
});
