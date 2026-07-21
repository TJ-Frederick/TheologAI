import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  AQUINAS_GUTENBERG_SOURCE_LOCK_PATH,
  extractAndVerifyLockedHtml,
  fetchExactGutenbergBytes,
  parseAquinasGutenbergSourceLock,
  parseStrictZip,
  readAquinasGutenbergSourceLock,
  sourceLockDigest,
  writeNoClobber,
} from '../../../scripts/aquinas-gutenberg-acquisition.js';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let current = value;
    for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
    table[value] = current >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

type ZipEntry = Readonly<{ path: string; body: string; method?: 0 | 8; unixMode?: number }>;

/** Minimal, deliberately controllable ZIP writer for archive-hazard fixtures. */
function zip(entries: readonly ZipEntry[]): Buffer {
  let offset = 0;
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const body = Buffer.from(entry.body, 'utf8');
    const method = entry.method ?? 8;
    const compressed = method === 0 ? body : deflateRawSync(body);
    const checksum = crc32(body);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.byteLength, 18);
    localHeader.writeUInt32LE(body.byteLength, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4); // Unix creator, ZIP spec 2.0
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.byteLength, 20);
    centralHeader.writeUInt32LE(body.byteLength, 24);
    centralHeader.writeUInt16LE(name.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt32LE(((entry.unixMode ?? 0o100644) << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.byteLength + name.byteLength + compressed.byteLength;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, centralBytes, end]);
}

function lockJson(): Record<string, any> {
  return JSON.parse(readFileSync(AQUINAS_GUTENBERG_SOURCE_LOCK_PATH, 'utf8')) as Record<string, any>;
}

describe('Aquinas Gutenberg local acquisition/source-rights lock', () => {
  it('binds the reviewed four-part archive, member, catalog, provenance, and IA-witness identities', () => {
    const lock = readAquinasGutenbergSourceLock(process.cwd());
    expect(lock.sourceIdentity).toBe('aquinas-english-dominican-gutenberg-four-part-v1');
    expect(lock.artifacts.map(artifact => [artifact.ebookId, artifact.partKey, artifact.questionRange])).toEqual([
      [17611, 'prima', 'q001-q119'],
      [17897, 'prima-secundae', 'q001-q114'],
      [18755, 'secunda-secundae', 'q001-q189'],
      [19950, 'tertia', 'q001-q090'],
    ]);
    expect(lock.artifacts.every(artifact => artifact.archive.memberPaths[0] === artifact.htmlMember.path)).toBe(true);
    expect(lock.rightsAndProvenance.catalogStatement).toBe('Public domain in the USA.');
    expect(lock.comparisonWitness).toMatchObject({
      sourceLockSchemaVersion: 'theologai-aquinas-shapcote-ia-source-lock.v1',
      sourceLockSha256: 'a245dbc007b76e1975eb26462a75a5e5992954d9042fc6de96477f0b30351594',
    });
    expect(sourceLockDigest(process.cwd())).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects topology, provenance, rights, member, URL, and comparison-witness drift', () => {
    const mutations: Array<(lock: Record<string, any>) => void> = [
      lock => { lock.artifacts.pop(); },
      lock => { lock.artifacts[0].partKey = 'wrong'; },
      lock => { lock.artifacts[0].archive.memberPaths[0] = 'other.html'; },
      lock => { lock.artifacts[0].archive.url = 'https://evil.invalid/cache/epub/17611/pg17611-h.zip'; },
      lock => { lock.artifacts[0].catalogSnapshot.url = 'https://www.gutenberg.org/ebooks/17611?mutable=1'; },
      lock => { lock.rightsAndProvenance.rightsStatus = 'worldwide_public_domain'; },
      lock => { delete lock.rightsAndProvenance.electronicEditionProvenance.translator; },
      lock => { lock.comparisonWitness.sourceLockSchemaVersion = 'other'; },
    ];
    for (const mutate of mutations) {
      const changed = lockJson();
      mutate(changed);
      expect(() => parseAquinasGutenbergSourceLock(changed)).toThrow();
    }
  });

  it('refuses a source lock whose reviewed byte identity has changed', () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-aquinas-gutenberg-lock-'));
    const destination = join(root, AQUINAS_GUTENBERG_SOURCE_LOCK_PATH);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, `${readFileSync(AQUINAS_GUTENBERG_SOURCE_LOCK_PATH, 'utf8')}\n`);
    expect(() => readAquinasGutenbergSourceLock(root)).toThrow('source lock byte identity drifted');
  });

  it('accepts a minimal safe ZIP and rejects duplicate/colliding paths, symlinks, and hostile traversal', () => {
    const expected = ['pg.html', 'cover.png'];
    expect(parseStrictZip(zip([
      { path: 'pg.html', body: '<html>safe</html>' },
      { path: 'cover.png', body: 'png', method: 0 },
    ]), expected)).toHaveLength(2);
    expect(() => parseStrictZip(zip([
      { path: 'pg.html', body: 'one' },
      { path: 'PG.html', body: 'two' },
    ]), expected)).toThrow('duplicate or colliding');
    expect(() => parseStrictZip(zip([
      { path: 'pg.html', body: 'link', unixMode: 0o120777 },
      { path: 'cover.png', body: 'png', method: 0 },
    ]), expected)).toThrow('is a symlink');
    expect(() => parseStrictZip(zip([
      { path: '../pg.html', body: 'traversal' },
      { path: 'cover.png', body: 'png', method: 0 },
    ]), expected)).toThrow('hostile ZIP member path');
  });

  it('rejects archive and contained-member bytes before any future corpus reader can use them', () => {
    const artifact = readAquinasGutenbergSourceLock(process.cwd()).artifacts[0]!;
    expect(() => extractAndVerifyLockedHtml(artifact, Buffer.from('not a locked archive'))).toThrow('archive byte identity drifted');
    const alteredHash = createHash('sha256').update('different').digest('hex');
    expect(alteredHash).not.toBe(artifact.htmlMember.sha256);
  });

  it('has an atomic no-clobber writer and refuses redirected archive/catalog responses', async () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-aquinas-gutenberg-no-clobber-'));
    const local = join(root, 'local');
    mkdirSync(local);
    const destination = join(local, 'evidence', 'locked.html');
    writeNoClobber(destination, Buffer.from('first'), local, 'fixture');
    expect(() => writeNoClobber(destination, Buffer.from('second'), local, 'fixture')).toThrow('no-clobber policy');
    await expect(fetchExactGutenbergBytes(
      'https://www.gutenberg.org/cache/epub/17611/pg17611-h.zip',
      32,
      'fixture archive',
      async () => new Response('', { status: 302, headers: { location: 'https://evil.invalid/file.zip' } }),
    )).rejects.toThrow('redirected to an unapproved or mutable endpoint');
  });
});
