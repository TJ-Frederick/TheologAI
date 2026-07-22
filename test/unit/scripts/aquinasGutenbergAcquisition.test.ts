import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import {
  AQUINAS_GUTENBERG_GENERATED_RECEIPT_LOCAL_PATH,
  AQUINAS_GUTENBERG_CATALOG_IDENTITY_LOCK_PATH,
  AQUINAS_GUTENBERG_RECEIPT_PATH,
  AQUINAS_GUTENBERG_SOURCE_LOCK_PATH,
  acquireAquinasGutenberg,
  catalogSemanticIdentityDigest,
  extractAndVerifyCatalogSemanticIdentity,
  extractAndVerifyLockedHtml,
  fetchExactGutenbergBytes,
  parseAquinasGutenbergSourceLock,
  readAquinasGutenbergCatalogIdentityLock,
  parseStrictZip,
  readAquinasGutenbergSourceLock,
  sourceLockDigest,
  verifyLocalAquinasGutenbergAcquisition,
  writeNoClobber,
  type AquinasGutenbergCatalogIdentityArtifact,
  type AquinasGutenbergReviewedPins,
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

function seedTrackedAcquisitionEvidence(root: string): Buffer {
  for (const path of [AQUINAS_GUTENBERG_SOURCE_LOCK_PATH, AQUINAS_GUTENBERG_RECEIPT_PATH, AQUINAS_GUTENBERG_CATALOG_IDENTITY_LOCK_PATH]) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(path));
  }
  return readFileSync(AQUINAS_GUTENBERG_RECEIPT_PATH);
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function catalogHtml(artifact: AquinasGutenbergCatalogIdentityArtifact, siteCount = '78,967', downloads = '1936'): Buffer {
  const identity = artifact.semanticIdentity;
  const lastUpdate = identity.lastUpdate
    ? `<tr property="dcterms:modified" datatype="xsd:date" content="${identity.lastUpdate.machineDate}"><th>Last Update</th><td>${identity.lastUpdate.displayDate}</td></tr>`
    : '';
  return Buffer.from(`<!doctype html><html><body>
<a href="/ebooks/" title="Start a new search."><span itemprop="name">${siteCount} free eBooks</span></a>
<div typeof="pgterms:ebook" about="[ebook:${artifact.ebookId}]">
<table id="about_book_table">
<tr><th>Author</th><td><a href="${identity.author.agentPath}" about="${identity.author.agentAboutPath}" itemprop="creator">${identity.author.name}</a></td></tr>
<tr><th>Title</th><td>${identity.titleLines[0]}<br>${identity.titleLines[1]}</td></tr>
<tr><th>Credits</th><td>${identity.credits}</td></tr>
<tr content="${identity.language.code}"><th>Language</th><td>${identity.language.label}</td></tr>
<tr content="${identity.locClass}"><th>LoC Class</th><td>${identity.locClass}</td></tr>
<tr><th>Category</th><td>${identity.category}</td></tr>
<tr><th>eBook-No.</th><td>${artifact.ebookId}</td></tr>
<tr content="${identity.release.machineDate}"><th>Release Date</th><td>${identity.release.displayDate}</td></tr>
${lastUpdate}
<tr><th>Copyright</th><td>${identity.rightsStatement}</td></tr>
<tr><th>Downloads</th><td>${downloads} downloads in the last 30 days.</td></tr>
</table></div>
<a href="${identity.archiveDownload.path}" type="${identity.archiveDownload.mediaType}">${identity.archiveDownload.label}</a>
</body></html>`, 'utf8');
}

function syntheticArchiveHtml(artifact: Record<string, any>, source: Record<string, any>): string {
  const notice = source.rightsAndProvenance.internalUnrestrictedUseEvidence.requiredPhrases.join('\n');
  const provenance = [
    'originally produced by Sandra',
    'made available through the Christian\nClassics Ethereal Library',
    'I have eliminated\nunnecessary formatting in the text, corrected some errors in\ntranscription, and added the dedication, tables of contents,\nPrologue, and the numbers of the questions and articles, as they\nappeared in the printed translation published by Benziger Brothers.',
    'In a few places, where obvious errors appeared in the Benziger\nBrothers edition, I have corrected them by reference to a Latin text\nof the <i>Summa.</i> These corrections are indicated by English text in\nbrackets.',
    '* Any matter that appeared in a footnote in the Benziger Brothers\nedition is presented in brackets at the point in the text where the\nfootnote mark appeared.',
    'Fathers of the English Dominican Province',
    'BENZIGER BROTHERS',
    'Anything else in this electronic edition that does not correspond to\nthe content of the Benziger Brothers edition may be regarded as a\ndefect in this edition and attributed to me (David McClamrock).',
  ].join('\n');
  return `<html><head><meta name="dcterms.created" content="${artifact.htmlMember.dctermsCreated}"><meta name="dcterms.modified" content="${artifact.htmlMember.dctermsModified}"></head><body><div>This eBook is for the use of anyone anywhere in the United States\n${notice}</div><h2>NOTE TO THIS ELECTRONIC EDITION</h2><p>${provenance}</p></body></html>`;
}

function syntheticEvidence(html: string): { notice: Buffer; provenance: Buffer } {
  const noticeStart = html.indexOf('<div>This eBook is for the use of anyone anywhere in the United States');
  const noticeEnd = html.indexOf('</div>', noticeStart) + '</div>'.length;
  const provenanceStart = html.indexOf('>NOTE TO THIS ELECTRONIC EDITION</');
  const provenanceEnd = html.indexOf('</p>', provenanceStart) + '</p>'.length;
  return { notice: Buffer.from(html.slice(noticeStart, noticeEnd)), provenance: Buffer.from(html.slice(provenanceStart, provenanceEnd)) };
}

function syntheticAcquisitionScenario(root: string): {
  pins: AquinasGutenbergReviewedPins;
  responses: Map<string, Buffer>;
  reviewedReceiptBytes: Buffer;
  catalogLock: ReturnType<typeof readAquinasGutenbergCatalogIdentityLock>;
} {
  const source = lockJson();
  const catalogLockJson = JSON.parse(readFileSync(AQUINAS_GUTENBERG_CATALOG_IDENTITY_LOCK_PATH, 'utf8')) as Record<string, any>;
  const reviewCatalogs = new Map<number, Buffer>();
  const acquisitionCatalogs = new Map<number, Buffer>();
  const archives = new Map<number, Buffer>();
  const evidence = new Map<number, { notice: Buffer; provenance: Buffer }>();
  for (const [index, artifact] of source.artifacts.entries()) {
    const identityArtifact = catalogLockJson.artifacts[index] as AquinasGutenbergCatalogIdentityArtifact;
    const html = syntheticArchiveHtml(artifact, source);
    const archive = zip([
      { path: artifact.archive.memberPaths[0], body: html },
      { path: artifact.archive.memberPaths[1], body: 'synthetic cover', method: 0 },
    ]);
    artifact.archive.bytes = archive.byteLength;
    artifact.archive.sha256 = digest(archive);
    artifact.htmlMember.bytes = Buffer.byteLength(html);
    artifact.htmlMember.sha256 = digest(Buffer.from(html));
    const reviewCatalog = catalogHtml(identityArtifact, '78,000', '1');
    artifact.catalogSnapshot.bytes = reviewCatalog.byteLength;
    artifact.catalogSnapshot.sha256 = digest(reviewCatalog);
    reviewCatalogs.set(artifact.ebookId, reviewCatalog);
    acquisitionCatalogs.set(artifact.ebookId, catalogHtml(identityArtifact, '79,001', '2345'));
    archives.set(artifact.ebookId, archive);
    evidence.set(artifact.ebookId, syntheticEvidence(html));
  }
  const sourceBytes = Buffer.from(`${JSON.stringify(source, null, 2)}\n`);
  const sourceLockSha256 = digest(sourceBytes);
  const reviewedReceipt = {
    schemaVersion: 'theologai-aquinas-gutenberg-local-receipt.v1',
    sourceLockSha256,
    acquiredAt: '2026-07-21T00:00:00.000Z',
    artifacts: source.artifacts.map((artifact: Record<string, any>) => {
      const localEvidence = evidence.get(artifact.ebookId)!;
      const catalog = reviewCatalogs.get(artifact.ebookId)!;
      return {
        ebookId: artifact.ebookId,
        archive: { path: artifact.archive.localPath, bytes: artifact.archive.bytes, sha256: artifact.archive.sha256 },
        catalogSnapshot: { path: artifact.catalogSnapshot.localPath, bytes: catalog.byteLength, sha256: digest(catalog) },
        htmlMember: { path: artifact.htmlMember.path, bytes: artifact.htmlMember.bytes, sha256: artifact.htmlMember.sha256 },
        unrestrictedUseNotice: { path: `local/evidence/pg${artifact.ebookId}-unrestricted-use-notice.html`, bytes: localEvidence.notice.byteLength, sha256: digest(localEvidence.notice) },
        electronicEditionProvenance: { path: `local/evidence/pg${artifact.ebookId}-electronic-edition-provenance.html`, bytes: localEvidence.provenance.byteLength, sha256: digest(localEvidence.provenance) },
      };
    }),
  };
  const reviewedReceiptBytes = Buffer.from(`${JSON.stringify(reviewedReceipt, null, 2)}\n`);
  const reviewedReceiptSha256 = digest(reviewedReceiptBytes);
  catalogLockJson.sourceLockSha256 = sourceLockSha256;
  catalogLockJson.reviewedReceiptSha256 = reviewedReceiptSha256;
  const catalogLockBytes = Buffer.from(`${JSON.stringify(catalogLockJson, null, 2)}\n`);
  const pins = { sourceLockSha256, reviewedReceiptSha256, catalogIdentityLockSha256: digest(catalogLockBytes) };
  for (const [path, bytes] of [
    [AQUINAS_GUTENBERG_SOURCE_LOCK_PATH, sourceBytes],
    [AQUINAS_GUTENBERG_RECEIPT_PATH, reviewedReceiptBytes],
    [AQUINAS_GUTENBERG_CATALOG_IDENTITY_LOCK_PATH, catalogLockBytes],
  ] as const) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
  }
  const responses = new Map<string, Buffer>();
  for (const artifact of source.artifacts) {
    responses.set(artifact.archive.url, archives.get(artifact.ebookId)!);
    responses.set(artifact.catalogSnapshot.url, acquisitionCatalogs.get(artifact.ebookId)!);
  }
  return { pins, responses, reviewedReceiptBytes, catalogLock: readAquinasGutenbergCatalogIdentityLock(root, pins) };
}

function fakeFetch(responses: Map<string, Buffer>): (input: string) => Promise<Response> {
  return async input => new Response(responses.get(input) ?? 'missing fixture', { status: responses.has(input) ? 200 : 404 });
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
      receiptSchemaVersion: 'theologai-aquinas-shapcote-ia-local-receipt.v1',
      receiptSha256: '71f0312d497835b11a474b3254c4d5226952a539425461a2b1d6795848ed5399',
    });
    expect(sourceLockDigest(process.cwd())).toMatch(/^[a-f0-9]{64}$/);
    const catalogLock = readAquinasGutenbergCatalogIdentityLock(process.cwd());
    expect(catalogLock.artifacts.map(artifact => artifact.ebookId)).toEqual([17611, 17897, 18755, 19950]);
    expect(catalogLock.sourceLockSha256).toBe('c5cfdd1edd132bf59968cbabe4c7de2180c42d205735ca6c06aec626104a180b');
    expect(catalogLock.reviewedReceiptSha256).toBe('bc0dab9ce5dc3672ccf2a81182655c75eaf6ef4f280584a40e079bf82a11719d');
  });

  it('accepts the current live catalog shape across both documented counter changes and rejects invariant drift', () => {
    const source = readAquinasGutenbergSourceLock(process.cwd());
    const catalogLock = readAquinasGutenbergCatalogIdentityLock(process.cwd());
    const liveDownloads = ['1936', '1729', '2108', '1457'];
    for (const [index, artifact] of source.artifacts.entries()) {
      const identity = catalogLock.artifacts[index]!;
      const first = extractAndVerifyCatalogSemanticIdentity(artifact, identity, catalogHtml(identity, '78,967', liveDownloads[index]), source);
      const counterDrift = extractAndVerifyCatalogSemanticIdentity(artifact, identity, catalogHtml(identity, '79,001', '999999'), source);
      expect(catalogSemanticIdentityDigest({ ...identity, semanticIdentity: first })).toBe(catalogSemanticIdentityDigest({ ...identity, semanticIdentity: counterDrift }));
    }
    const identity = catalogLock.artifacts[0]!;
    const mismatched = Buffer.from(catalogHtml(identity).toString('utf8').replace(identity.semanticIdentity.credits, 'Unreviewed credits'));
    expect(() => extractAndVerifyCatalogSemanticIdentity(source.artifacts[0]!, identity, mismatched, source)).toThrow('catalog semantic identity drifted');
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
      lock => { lock.comparisonWitness.receiptSha256 = '0'.repeat(64); },
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

  it('bounds DEFLATE output by the central-directory declaration before decompression can expand a hostile member', () => {
    const hostile = zip([
      { path: 'pg.html', body: 'A'.repeat(32_768) },
      { path: 'cover.png', body: 'png', method: 0 },
    ]);
    const central = hostile.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    hostile.writeUInt32LE(1, 22); // local-header uncompressed byte count
    hostile.writeUInt32LE(1, central + 24); // matching central-directory lie
    expect(() => parseStrictZip(hostile, ['pg.html', 'cover.png'])).toThrow('cannot be safely decompressed within its declared size bound');
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

  it('lets fresh-checkout acquisition pass destination preflight without overwriting the tracked reviewed receipt', async () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-aquinas-gutenberg-fresh-checkout-'));
    const reviewedReceipt = seedTrackedAcquisitionEvidence(root);
    const fetchReached = vi.fn(async (): Promise<Response> => {
      throw new Error('fetch reached after destination preflight');
    });

    await expect(acquireAquinasGutenberg(root, fetchReached)).rejects.toThrow('fetch reached after destination preflight');
    expect(fetchReached).toHaveBeenCalled();
    expect(readFileSync(join(root, AQUINAS_GUTENBERG_RECEIPT_PATH))).toEqual(reviewedReceipt);
  });

  it('fails closed before downloading when any generated acquisition destination already exists', async () => {
    const lock = readAquinasGutenbergSourceLock(process.cwd());
    for (const localPath of [AQUINAS_GUTENBERG_GENERATED_RECEIPT_LOCAL_PATH, lock.artifacts[0]!.archive.localPath]) {
      const root = mkdtempSync(join(tmpdir(), 'theologai-aquinas-gutenberg-hostile-destination-'));
      const reviewedReceipt = seedTrackedAcquisitionEvidence(root);
      const destination = join(root, 'data/historical-sources/project-gutenberg/aquinas-english-dominican', localPath);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, 'hostile pre-existing bytes');
      const fetchNotReached = vi.fn(async (): Promise<Response> => {
        throw new Error('download must not start');
      });

      await expect(acquireAquinasGutenberg(root, fetchNotReached)).rejects.toThrow('no-clobber policy');
      expect(fetchNotReached).not.toHaveBeenCalled();
      expect(readFileSync(destination, 'utf8')).toBe('hostile pre-existing bytes');
      expect(readFileSync(join(root, AQUINAS_GUTENBERG_RECEIPT_PATH))).toEqual(reviewedReceipt);
    }
  });

  it('completes a full fresh-checkout acquisition with fake locked responses and counter-drifted catalog snapshots', async () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-aquinas-gutenberg-full-acquire-'));
    const scenario = syntheticAcquisitionScenario(root);

    const receipt = await acquireAquinasGutenberg(root, fakeFetch(scenario.responses), scenario.pins);

    expect(receipt.schemaVersion).toBe('theologai-aquinas-gutenberg-generated-receipt.v1');
    expect(receipt.reviewedReceiptSha256).toBe(scenario.pins.reviewedReceiptSha256);
    expect(receipt.catalogIdentityLockSha256).toBe(scenario.pins.catalogIdentityLockSha256);
    expect(receipt.artifacts).toHaveLength(4);
    expect(readFileSync(join(root, AQUINAS_GUTENBERG_RECEIPT_PATH))).toEqual(scenario.reviewedReceiptBytes);
    expect(verifyLocalAquinasGutenbergAcquisition(root, scenario.pins).artifacts).toHaveLength(4);
  });

  it('rejects a semantic catalog mismatch before creating any local acquisition output', async () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-aquinas-gutenberg-semantic-no-write-'));
    const scenario = syntheticAcquisitionScenario(root);
    const first = scenario.catalogLock.artifacts[0]!;
    const url = `https://www.gutenberg.org${first.catalogPath}`;
    scenario.responses.set(url, Buffer.from(scenario.responses.get(url)!.toString('utf8').replace(first.semanticIdentity.credits, 'Hostile catalog credits')));

    await expect(acquireAquinasGutenberg(root, fakeFetch(scenario.responses), scenario.pins)).rejects.toThrow('catalog semantic identity drifted');
    expect(existsSync(join(root, 'data/historical-sources/project-gutenberg/aquinas-english-dominican/local'))).toBe(false);
    expect(readFileSync(join(root, AQUINAS_GUTENBERG_RECEIPT_PATH))).toEqual(scenario.reviewedReceiptBytes);
  });

  it('compares candidate provenance to authenticated reviewed evidence before the first write', async () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-aquinas-gutenberg-reviewed-mismatch-'));
    const scenario = syntheticAcquisitionScenario(root);
    const reviewed = JSON.parse(scenario.reviewedReceiptBytes.toString('utf8')) as Record<string, any>;
    reviewed.artifacts[0].electronicEditionProvenance.sha256 = '0'.repeat(64);
    const reviewedBytes = Buffer.from(`${JSON.stringify(reviewed, null, 2)}\n`);
    const reviewedReceiptSha256 = digest(reviewedBytes);
    writeFileSync(join(root, AQUINAS_GUTENBERG_RECEIPT_PATH), reviewedBytes);
    const catalogLock = JSON.parse(readFileSync(join(root, AQUINAS_GUTENBERG_CATALOG_IDENTITY_LOCK_PATH), 'utf8')) as Record<string, any>;
    catalogLock.reviewedReceiptSha256 = reviewedReceiptSha256;
    const catalogLockBytes = Buffer.from(`${JSON.stringify(catalogLock, null, 2)}\n`);
    writeFileSync(join(root, AQUINAS_GUTENBERG_CATALOG_IDENTITY_LOCK_PATH), catalogLockBytes);
    const pins = { ...scenario.pins, reviewedReceiptSha256, catalogIdentityLockSha256: digest(catalogLockBytes) };

    await expect(acquireAquinasGutenberg(root, fakeFetch(scenario.responses), pins)).rejects.toThrow('candidate identity drifted from reviewed receipt');
    expect(existsSync(join(root, 'data/historical-sources/project-gutenberg/aquinas-english-dominican/local'))).toBe(false);
  });

  it('rejects a tampered tracked reviewed receipt even when a valid generated receipt and cache exist', async () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-aquinas-gutenberg-reviewed-tamper-'));
    const scenario = syntheticAcquisitionScenario(root);
    await acquireAquinasGutenberg(root, fakeFetch(scenario.responses), scenario.pins);
    const generatedPath = join(root, 'data/historical-sources/project-gutenberg/aquinas-english-dominican', AQUINAS_GUTENBERG_GENERATED_RECEIPT_LOCAL_PATH);
    expect(existsSync(generatedPath)).toBe(true);
    writeFileSync(join(root, AQUINAS_GUTENBERG_RECEIPT_PATH), Buffer.concat([scenario.reviewedReceiptBytes, Buffer.from('\n')]));

    expect(() => verifyLocalAquinasGutenbergAcquisition(root, scenario.pins)).toThrow('reviewed acquisition receipt byte identity drifted');
    expect(existsSync(generatedPath)).toBe(true);
  });
});
