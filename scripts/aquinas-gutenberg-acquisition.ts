#!/usr/bin/env tsx

/**
 * Strict, local-only acquisition guard for the four approved Project Gutenberg
 * Aquinas HTML ZIPs. This intentionally preserves bytes and evidence only; it
 * does not parse or materialize corpus text.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const AQUINAS_GUTENBERG_ROOT = 'data/historical-sources/project-gutenberg/aquinas-english-dominican';
export const AQUINAS_GUTENBERG_SOURCE_LOCK_PATH = `${AQUINAS_GUTENBERG_ROOT}/SOURCE_LOCK.json`;
// Reviewed, tracked evidence from the approved acquisition. Keep this path and
// its bytes stable because downstream topology locks bind its digest.
export const AQUINAS_GUTENBERG_RECEIPT_PATH = `${AQUINAS_GUTENBERG_ROOT}/LOCAL_ACQUISITION_RECEIPT.json`;
// Per-checkout acquisition output. Unlike the reviewed receipt above, this is
// generated beneath the ignored local/ boundary and is always no-clobber.
export const AQUINAS_GUTENBERG_GENERATED_RECEIPT_LOCAL_PATH = 'local/LOCAL_ACQUISITION_RECEIPT.json';
export const AQUINAS_GUTENBERG_SOURCE_LOCK_VERSION = 'theologai-aquinas-gutenberg-source-lock.v1';
export const AQUINAS_GUTENBERG_RECEIPT_VERSION = 'theologai-aquinas-gutenberg-local-receipt.v1';

// This binds the reviewed lock byte-for-byte. Changing a pin requires review of
// both the JSON and this executable guard; a receipt alone cannot redefine it.
const EXPECTED_SOURCE_LOCK_SHA256 = 'c5cfdd1edd132bf59968cbabe4c7de2180c42d205735ca6c06aec626104a180b';
const EXPECTED_REVIEWED_RECEIPT_SHA256 = 'bc0dab9ce5dc3672ccf2a81182655c75eaf6ef4f280584a40e079bf82a11719d';
const GUTENBERG_HOST = 'www.gutenberg.org';
const MAX_ARCHIVE_BYTES = 2_000_000;
const MAX_CATALOG_BYTES = 128_000;
const MAX_ZIP_MEMBERS = 2;
const MAX_MEMBER_BYTES = 6_000_000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 8_000_000;

export type AquinasGutenbergArtifact = Readonly<{
  ebookId: number;
  partKey: 'prima' | 'prima-secundae' | 'secunda-secundae' | 'tertia';
  questionRange: string;
  archive: Readonly<{
    url: string;
    localPath: string;
    bytes: number;
    sha256: string;
    memberPaths: readonly string[];
  }>;
  htmlMember: Readonly<{
    path: string;
    bytes: number;
    sha256: string;
    dctermsCreated: string;
    dctermsModified: string;
  }>;
  catalogSnapshot: Readonly<{
    url: string;
    localPath: string;
    bytes: number;
    sha256: string;
    releaseDate: string;
    issuedMachineDate: string;
    lastUpdate: string | null;
  }>;
}>;

export type AquinasGutenbergSourceLock = Readonly<{
  schemaVersion: typeof AQUINAS_GUTENBERG_SOURCE_LOCK_VERSION;
  sourceIdentity: 'aquinas-english-dominican-gutenberg-four-part-v1';
  acquisitionScope: Readonly<Record<string, unknown>>;
  acquisitionPolicy: Readonly<Record<string, unknown>>;
  rightsAndProvenance: Readonly<{
    rightsStatus: 'public_domain_in_usa';
    territoryCaveat: string;
    catalogStatement: 'Public domain in the USA.';
    projectGutenbergLicensePolicyUrl: string;
    internalUnrestrictedUseEvidence: Readonly<{ requiredPhrases: readonly string[] }>;
    electronicEditionProvenance: Readonly<Record<string, unknown>>;
  }>;
  comparisonWitness: Readonly<{
    relationship: string;
    sourceLockSchemaVersion: 'theologai-aquinas-shapcote-ia-source-lock.v1';
    sourceLockSha256: string;
    receiptSchemaVersion: 'theologai-aquinas-shapcote-ia-local-receipt.v1';
    receiptSha256: string;
  }>;
  artifacts: readonly AquinasGutenbergArtifact[];
}>;

export type LocalEvidence = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
}>;

export type AquinasGutenbergReceiptArtifact = Readonly<{
  ebookId: number;
  archive: LocalEvidence;
  catalogSnapshot: LocalEvidence;
  htmlMember: Readonly<{ path: string; bytes: number; sha256: string }>;
  unrestrictedUseNotice: LocalEvidence;
  electronicEditionProvenance: LocalEvidence;
}>;

export type AquinasGutenbergReceipt = Readonly<{
  schemaVersion: typeof AQUINAS_GUTENBERG_RECEIPT_VERSION;
  sourceLockSha256: string;
  acquiredAt: string;
  artifacts: readonly AquinasGutenbergReceiptArtifact[];
}>;

type JsonRecord = Record<string, unknown>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type ZipMember = Readonly<{
  path: string;
  method: number;
  crc32: number;
  compressedBytes: Uint8Array;
  uncompressedBytes: number;
}>;

function fail(message: string): never {
  throw new Error(`[aquinas-gutenberg-acquisition] ${message}`);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as JsonRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return string(value, label);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) fail(`${label} must be a positive safe integer`);
  return value as number;
}

function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  const observed = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (observed.length !== expected.length || observed.some((key, index) => key !== expected[index])) {
    fail(`${label} has an unexpected key set`);
  }
}

function hex(value: string, label: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) fail(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function strictUtf8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} is not strict UTF-8`);
  }
}

function assertApprovedGutenbergUrl(urlText: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    fail(`${label} is not an absolute URL`);
  }
  if (url.protocol !== 'https:' || url.hostname !== GUTENBERG_HOST || url.port || url.username || url.password || url.search || url.hash) {
    fail(`${label} escaped the approved Project Gutenberg origin`);
  }
  return url;
}

function assertLockUrl(urlText: string, expectedPath: string, label: string): void {
  const url = assertApprovedGutenbergUrl(urlText, label);
  if (url.pathname !== expectedPath) fail(`${label} does not retain its exact approved pathname`);
}

function assertLocalRelativePath(path: string, label: string): void {
  if (!path.startsWith('local/') || path.includes('\\') || path.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    fail(`${label} must be a safe local/ relative path`);
  }
}

function parseArtifact(value: unknown, index: number): AquinasGutenbergArtifact {
  const source = record(value, `artifact ${index}`);
  exactKeys(source, ['ebookId', 'partKey', 'questionRange', 'archive', 'htmlMember', 'catalogSnapshot'], `artifact ${index}`);
  const ebookId = positiveInteger(source.ebookId, `artifact ${index}.ebookId`);
  const partKey = string(source.partKey, `artifact ${index}.partKey`);
  if (!['prima', 'prima-secundae', 'secunda-secundae', 'tertia'].includes(partKey)) fail(`artifact ${index}.partKey is not reviewed`);
  const questionRange = string(source.questionRange, `artifact ${index}.questionRange`);

  const archiveValue = record(source.archive, `artifact ${index}.archive`);
  exactKeys(archiveValue, ['url', 'localPath', 'bytes', 'sha256', 'memberPaths'], `artifact ${index}.archive`);
  const archiveUrl = string(archiveValue.url, `artifact ${index}.archive.url`);
  assertLockUrl(archiveUrl, `/cache/epub/${ebookId}/pg${ebookId}-h.zip`, `artifact ${index}.archive.url`);
  const archiveLocalPath = string(archiveValue.localPath, `artifact ${index}.archive.localPath`);
  assertLocalRelativePath(archiveLocalPath, `artifact ${index}.archive.localPath`);
  if (archiveLocalPath !== `local/archives/pg${ebookId}-h.zip`) fail(`artifact ${index}.archive.localPath drifted`);
  const memberPaths = array(archiveValue.memberPaths, `artifact ${index}.archive.memberPaths`).map((entry, memberIndex) => string(entry, `artifact ${index}.archive.memberPaths[${memberIndex}]`));
  if (memberPaths.length !== 2 || memberPaths[0] !== `pg${ebookId}-images.html` || memberPaths[1] !== `${ebookId}-cover.png`) {
    fail(`artifact ${index}.archive.memberPaths are not the reviewed exact member set`);
  }

  const htmlValue = record(source.htmlMember, `artifact ${index}.htmlMember`);
  exactKeys(htmlValue, ['path', 'bytes', 'sha256', 'dctermsCreated', 'dctermsModified'], `artifact ${index}.htmlMember`);
  const htmlPath = string(htmlValue.path, `artifact ${index}.htmlMember.path`);
  if (htmlPath !== memberPaths[0]) fail(`artifact ${index}.htmlMember.path does not select the exact HTML member`);

  const catalogValue = record(source.catalogSnapshot, `artifact ${index}.catalogSnapshot`);
  exactKeys(catalogValue, ['url', 'localPath', 'bytes', 'sha256', 'releaseDate', 'issuedMachineDate', 'lastUpdate'], `artifact ${index}.catalogSnapshot`);
  const catalogUrl = string(catalogValue.url, `artifact ${index}.catalogSnapshot.url`);
  assertLockUrl(catalogUrl, `/ebooks/${ebookId}`, `artifact ${index}.catalogSnapshot.url`);
  const catalogLocalPath = string(catalogValue.localPath, `artifact ${index}.catalogSnapshot.localPath`);
  assertLocalRelativePath(catalogLocalPath, `artifact ${index}.catalogSnapshot.localPath`);
  if (catalogLocalPath !== `local/catalog/pg${ebookId}.html`) fail(`artifact ${index}.catalogSnapshot.localPath drifted`);

  return {
    ebookId,
    partKey: partKey as AquinasGutenbergArtifact['partKey'],
    questionRange,
    archive: {
      url: archiveUrl,
      localPath: archiveLocalPath,
      bytes: positiveInteger(archiveValue.bytes, `artifact ${index}.archive.bytes`),
      sha256: hex(string(archiveValue.sha256, `artifact ${index}.archive.sha256`), `artifact ${index}.archive.sha256`),
      memberPaths,
    },
    htmlMember: {
      path: htmlPath,
      bytes: positiveInteger(htmlValue.bytes, `artifact ${index}.htmlMember.bytes`),
      sha256: hex(string(htmlValue.sha256, `artifact ${index}.htmlMember.sha256`), `artifact ${index}.htmlMember.sha256`),
      dctermsCreated: string(htmlValue.dctermsCreated, `artifact ${index}.htmlMember.dctermsCreated`),
      dctermsModified: string(htmlValue.dctermsModified, `artifact ${index}.htmlMember.dctermsModified`),
    },
    catalogSnapshot: {
      url: catalogUrl,
      localPath: catalogLocalPath,
      bytes: positiveInteger(catalogValue.bytes, `artifact ${index}.catalogSnapshot.bytes`),
      sha256: hex(string(catalogValue.sha256, `artifact ${index}.catalogSnapshot.sha256`), `artifact ${index}.catalogSnapshot.sha256`),
      releaseDate: string(catalogValue.releaseDate, `artifact ${index}.catalogSnapshot.releaseDate`),
      issuedMachineDate: string(catalogValue.issuedMachineDate, `artifact ${index}.catalogSnapshot.issuedMachineDate`),
      lastUpdate: nullableString(catalogValue.lastUpdate, `artifact ${index}.catalogSnapshot.lastUpdate`),
    },
  };
}

export function parseAquinasGutenbergSourceLock(value: unknown): AquinasGutenbergSourceLock {
  const source = record(value, 'source lock');
  exactKeys(source, ['schemaVersion', 'sourceIdentity', 'acquisitionScope', 'acquisitionPolicy', 'rightsAndProvenance', 'comparisonWitness', 'artifacts'], 'source lock');
  if (source.schemaVersion !== AQUINAS_GUTENBERG_SOURCE_LOCK_VERSION) fail('unsupported source-lock schema version');
  if (source.sourceIdentity !== 'aquinas-english-dominican-gutenberg-four-part-v1') fail('source identity drifted');
  const scope = record(source.acquisitionScope, 'source lock acquisitionScope');
  const policy = record(source.acquisitionPolicy, 'source lock acquisitionPolicy');
  const rights = record(source.rightsAndProvenance, 'source lock rightsAndProvenance');
  exactKeys(rights, ['rightsStatus', 'territoryCaveat', 'catalogStatement', 'projectGutenbergLicensePolicyUrl', 'internalUnrestrictedUseEvidence', 'electronicEditionProvenance'], 'source lock rightsAndProvenance');
  if (rights.rightsStatus !== 'public_domain_in_usa' || rights.catalogStatement !== 'Public domain in the USA.') fail('rights status drifted from the reviewed territorial statement');
  assertLockUrl(string(rights.projectGutenbergLicensePolicyUrl, 'source lock projectGutenbergLicensePolicyUrl'), '/policy/license.html', 'source lock projectGutenbergLicensePolicyUrl');
  const notice = record(rights.internalUnrestrictedUseEvidence, 'source lock internalUnrestrictedUseEvidence');
  exactKeys(notice, ['requiredPhrases'], 'source lock internalUnrestrictedUseEvidence');
  const requiredPhrases = array(notice.requiredPhrases, 'source lock requiredPhrases').map((phrase, index) => string(phrase, `source lock requiredPhrases[${index}]`));
  if (requiredPhrases.length < 5) fail('source lock must retain all internal unrestricted-use evidence phrases');
  const provenance = record(rights.electronicEditionProvenance, 'source lock electronicEditionProvenance');
  for (const key of ['sourceEtextCreator', 'sourceEtextAvailability', 'electronicEditionEditor', 'disclosedEditorActions', 'translator', 'printedTranslationPublisher', 'ccelBoundary']) {
    if (!(key in provenance)) fail(`source lock provenance omits ${key}`);
  }
  const witness = record(source.comparisonWitness, 'source lock comparisonWitness');
  exactKeys(witness, ['relationship', 'sourceLockSchemaVersion', 'sourceLockSha256', 'receiptSchemaVersion', 'receiptSha256'], 'source lock comparisonWitness');
  if (witness.sourceLockSchemaVersion !== 'theologai-aquinas-shapcote-ia-source-lock.v1' || witness.receiptSchemaVersion !== 'theologai-aquinas-shapcote-ia-local-receipt.v1') fail('comparison witness identity drifted');
  if (witness.sourceLockSha256 !== 'a245dbc007b76e1975eb26462a75a5e5992954d9042fc6de96477f0b30351594' || witness.receiptSha256 !== '71f0312d497835b11a474b3254c4d5226952a539425461a2b1d6795848ed5399') fail('comparison witness digest drifted');
  const artifacts = array(source.artifacts, 'source lock artifacts').map(parseArtifact);
  const expected = [
    [17611, 'prima', 'q001-q119'],
    [17897, 'prima-secundae', 'q001-q114'],
    [18755, 'secunda-secundae', 'q001-q189'],
    [19950, 'tertia', 'q001-q090'],
  ] as const;
  if (artifacts.length !== expected.length || artifacts.some((artifact, index) => artifact.ebookId !== expected[index]![0] || artifact.partKey !== expected[index]![1] || artifact.questionRange !== expected[index]![2])) {
    fail('source lock does not retain the reviewed four-part topology and order');
  }
  return {
    schemaVersion: AQUINAS_GUTENBERG_SOURCE_LOCK_VERSION,
    sourceIdentity: 'aquinas-english-dominican-gutenberg-four-part-v1',
    acquisitionScope: scope,
    acquisitionPolicy: policy,
    rightsAndProvenance: {
      rightsStatus: 'public_domain_in_usa',
      territoryCaveat: string(rights.territoryCaveat, 'source lock territoryCaveat'),
      catalogStatement: 'Public domain in the USA.',
      projectGutenbergLicensePolicyUrl: string(rights.projectGutenbergLicensePolicyUrl, 'source lock projectGutenbergLicensePolicyUrl'),
      internalUnrestrictedUseEvidence: { requiredPhrases },
      electronicEditionProvenance: provenance,
    },
    comparisonWitness: {
      relationship: string(witness.relationship, 'source lock comparisonWitness.relationship'),
      sourceLockSchemaVersion: 'theologai-aquinas-shapcote-ia-source-lock.v1',
      sourceLockSha256: string(witness.sourceLockSha256, 'source lock comparisonWitness.sourceLockSha256'),
      receiptSchemaVersion: 'theologai-aquinas-shapcote-ia-local-receipt.v1',
      receiptSha256: string(witness.receiptSha256, 'source lock comparisonWitness.receiptSha256'),
    },
    artifacts,
  };
}

export function sourceLockDigest(cwd = ROOT): string {
  return sha256(readFileSync(resolve(cwd, AQUINAS_GUTENBERG_SOURCE_LOCK_PATH)));
}

export function readAquinasGutenbergSourceLock(cwd = ROOT): AquinasGutenbergSourceLock {
  const bytes = readFileSync(resolve(cwd, AQUINAS_GUTENBERG_SOURCE_LOCK_PATH));
  if (sha256(bytes) !== EXPECTED_SOURCE_LOCK_SHA256) fail('source lock byte identity drifted from the reviewed lock');
  return parseAquinasGutenbergSourceLock(JSON.parse(strictUtf8(bytes, 'source lock')));
}

function crcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let current = value;
    for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
    table[value] = current >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function inflateRawBounded(bytes: Uint8Array, maximumOutputBytes: number, label: string): Buffer {
  if (!Number.isSafeInteger(maximumOutputBytes) || maximumOutputBytes < 0 || maximumOutputBytes > MAX_MEMBER_BYTES) fail(`${label} has an unsafe declared uncompressed size`);
  let inflated: Buffer;
  try {
    inflated = inflateRawSync(bytes, { maxOutputLength: maximumOutputBytes });
  } catch {
    fail(`${label} cannot be safely decompressed within its declared size bound`);
  }
  if (inflated.byteLength > maximumOutputBytes) fail(`${label} exceeded its declared uncompressed size bound`);
  return inflated;
}

function u16(bytes: Uint8Array, offset: number, label: string): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) fail(`${label} crosses an archive boundary`);
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function u32(bytes: Uint8Array, offset: number, label: string): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) fail(`${label} crosses an archive boundary`);
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function safeZipPath(value: string, label: string): void {
  if (!value || value.includes('\u0000') || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value) || value.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    fail(`${label} is a hostile ZIP member path`);
  }
}

function zipPathCollisionKey(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('en-US');
}

/** Strict central-directory reader: no ZIP64, comments, encryption, links, or extra members. */
export function parseStrictZip(bytes: Uint8Array, expectedMemberPaths: readonly string[]): readonly ZipMember[] {
  if (bytes.byteLength < 22) fail('ZIP archive is too short for an end-of-central-directory record');
  const minimumOffset = Math.max(0, bytes.byteLength - 22 - 0xffff);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (u32(bytes, offset, 'EOCD signature') === 0x06054b50 && offset + 22 + u16(bytes, offset + 20, 'EOCD comment length') === bytes.byteLength) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) fail('ZIP archive has no unambiguous end-of-central-directory record');
  if (u16(bytes, eocd + 20, 'EOCD comment length') !== 0) fail('ZIP archive comments are not accepted');
  const disk = u16(bytes, eocd + 4, 'EOCD disk');
  const directoryDisk = u16(bytes, eocd + 6, 'EOCD directory disk');
  const entriesOnDisk = u16(bytes, eocd + 8, 'EOCD entries on disk');
  const entries = u16(bytes, eocd + 10, 'EOCD entries');
  const directoryBytes = u32(bytes, eocd + 12, 'EOCD directory size');
  const directoryOffset = u32(bytes, eocd + 16, 'EOCD directory offset');
  if (disk || directoryDisk || entriesOnDisk !== entries || entries === 0 || entries > MAX_ZIP_MEMBERS || directoryOffset + directoryBytes !== eocd) {
    fail('ZIP archive has a multi-disk, ZIP64-like, oversized, or ambiguous central directory');
  }

  const members: ZipMember[] = [];
  const exactPaths = new Set<string>();
  const collisions = new Set<string>();
  let cursor = directoryOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entries; index += 1) {
    if (u32(bytes, cursor, `central directory member ${index} signature`) !== 0x02014b50) fail(`central directory member ${index} has an invalid signature`);
    const madeBy = u16(bytes, cursor + 4, `central directory member ${index} made-by`);
    const flags = u16(bytes, cursor + 8, `central directory member ${index} flags`);
    const method = u16(bytes, cursor + 10, `central directory member ${index} method`);
    const expectedCrc = u32(bytes, cursor + 16, `central directory member ${index} CRC`);
    const compressedBytes = u32(bytes, cursor + 20, `central directory member ${index} compressed bytes`);
    const uncompressedBytes = u32(bytes, cursor + 24, `central directory member ${index} uncompressed bytes`);
    const nameBytes = u16(bytes, cursor + 28, `central directory member ${index} name length`);
    const extraBytes = u16(bytes, cursor + 30, `central directory member ${index} extra length`);
    const commentBytes = u16(bytes, cursor + 32, `central directory member ${index} comment length`);
    const diskStart = u16(bytes, cursor + 34, `central directory member ${index} disk`);
    const externalAttributes = u32(bytes, cursor + 38, `central directory member ${index} attributes`);
    const localOffset = u32(bytes, cursor + 42, `central directory member ${index} local offset`);
    const next = cursor + 46 + nameBytes + extraBytes + commentBytes;
    if (next > eocd || flags !== 0 || ![0, 8].includes(method) || extraBytes !== 0 || commentBytes !== 0 || diskStart !== 0 || compressedBytes > MAX_ARCHIVE_BYTES || uncompressedBytes > MAX_MEMBER_BYTES) {
      fail(`central directory member ${index} violates the reviewed ZIP safety profile`);
    }
    if (madeBy >>> 8 === 3 && ((externalAttributes >>> 16) & 0o170000) === 0o120000) fail(`central directory member ${index} is a symlink`);
    const path = strictUtf8(bytes.subarray(cursor + 46, cursor + 46 + nameBytes), `central directory member ${index} path`);
    safeZipPath(path, `central directory member ${index}`);
    const collision = zipPathCollisionKey(path);
    if (exactPaths.has(path) || collisions.has(collision)) fail(`ZIP archive contains duplicate or colliding member paths`);
    exactPaths.add(path);
    collisions.add(collision);
    totalUncompressed += uncompressedBytes;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) fail('ZIP archive exceeds its total uncompressed size bound');

    if (u32(bytes, localOffset, `local member ${index} signature`) !== 0x04034b50) fail(`local member ${index} has an invalid signature`);
    const localFlags = u16(bytes, localOffset + 6, `local member ${index} flags`);
    const localMethod = u16(bytes, localOffset + 8, `local member ${index} method`);
    const localCrc = u32(bytes, localOffset + 14, `local member ${index} CRC`);
    const localCompressedBytes = u32(bytes, localOffset + 18, `local member ${index} compressed bytes`);
    const localUncompressedBytes = u32(bytes, localOffset + 22, `local member ${index} uncompressed bytes`);
    const localNameBytes = u16(bytes, localOffset + 26, `local member ${index} name length`);
    const localExtraBytes = u16(bytes, localOffset + 28, `local member ${index} extra length`);
    const dataOffset = localOffset + 30 + localNameBytes + localExtraBytes;
    const dataEnd = dataOffset + compressedBytes;
    if (localFlags !== flags || localMethod !== method || localCrc !== expectedCrc || localCompressedBytes !== compressedBytes || localUncompressedBytes !== uncompressedBytes || localExtraBytes !== 0 || dataEnd > directoryOffset) {
      fail(`local member ${index} does not match its central-directory entry`);
    }
    const localPath = strictUtf8(bytes.subarray(localOffset + 30, localOffset + 30 + localNameBytes), `local member ${index} path`);
    if (localPath !== path) fail(`local member ${index} path disagrees with the central directory`);
    const memberData = bytes.subarray(dataOffset, dataEnd);
    const inflated = method === 0 ? memberData : inflateRawBounded(memberData, uncompressedBytes, `local member ${index}`);
    if (inflated.byteLength !== uncompressedBytes || crc32(inflated) !== expectedCrc) fail(`local member ${index} failed its size or CRC check`);
    members.push({ path, method, crc32: expectedCrc, compressedBytes: memberData, uncompressedBytes });
    cursor = next;
  }
  if (cursor !== eocd || members.length !== expectedMemberPaths.length || members.some((member, index) => member.path !== expectedMemberPaths[index])) {
    fail('ZIP archive does not contain exactly the reviewed member topology');
  }
  return members;
}

function inflateMember(member: ZipMember, label: string): Buffer {
  return member.method === 0 ? Buffer.from(member.compressedBytes) : inflateRawBounded(member.compressedBytes, member.uncompressedBytes, label);
}

export function extractAndVerifyLockedHtml(artifact: AquinasGutenbergArtifact, archiveBytes: Uint8Array): Buffer {
  if (archiveBytes.byteLength !== artifact.archive.bytes || sha256(archiveBytes) !== artifact.archive.sha256) fail(`eBook ${artifact.ebookId} archive byte identity drifted`);
  const members = parseStrictZip(archiveBytes, artifact.archive.memberPaths);
  const html = members.find(member => member.path === artifact.htmlMember.path);
  if (!html || members.filter(member => member.path === artifact.htmlMember.path).length !== 1) fail(`eBook ${artifact.ebookId} HTML member is missing or ambiguous`);
  const inflated = inflateMember(html, `eBook ${artifact.ebookId} HTML member`);
  if (inflated.byteLength !== artifact.htmlMember.bytes || sha256(inflated) !== artifact.htmlMember.sha256) fail(`eBook ${artifact.ebookId} HTML member byte identity drifted`);
  const htmlText = strictUtf8(inflated, `eBook ${artifact.ebookId} HTML member`);
  if (!htmlText.includes(`<meta name="dcterms.created" content="${artifact.htmlMember.dctermsCreated}">`) || !htmlText.includes(`<meta name="dcterms.modified" content="${artifact.htmlMember.dctermsModified}">`)) {
    fail(`eBook ${artifact.ebookId} locked dcterms metadata drifted`);
  }
  return inflated;
}

function evidenceSlices(htmlBytes: Uint8Array, artifact: AquinasGutenbergArtifact, lock: AquinasGutenbergSourceLock): Readonly<{ unrestrictedUseNotice: Buffer; electronicEditionProvenance: Buffer }> {
  const html = strictUtf8(htmlBytes, `eBook ${artifact.ebookId} HTML member`);
  for (const phrase of lock.rightsAndProvenance.internalUnrestrictedUseEvidence.requiredPhrases) {
    if (!html.includes(phrase)) fail(`eBook ${artifact.ebookId} internal unrestricted-use/license evidence mismatched: ${phrase}`);
  }
  const provenancePhrases = [
    'originally produced by Sandra',
    'made available through the Christian\nClassics Ethereal Library',
    'I have eliminated\nunnecessary formatting in the text, corrected some errors in\ntranscription, and added the dedication, tables of contents,\nPrologue, and the numbers of the questions and articles, as they\nappeared in the printed translation published by Benziger Brothers.',
    'In a few places, where obvious errors appeared in the Benziger\nBrothers edition, I have corrected them by reference to a Latin text\nof the <i>Summa.</i> These corrections are indicated by English text in\nbrackets.',
    '* Any matter that appeared in a footnote in the Benziger Brothers\nedition is presented in brackets at the point in the text where the\nfootnote mark appeared.',
    'Fathers of the English Dominican Province',
    'BENZIGER BROTHERS',
    'Anything else in this electronic edition that does not correspond to\nthe content of the Benziger Brothers edition may be regarded as a\ndefect in this edition and attributed to me (David McClamrock).',
  ];
  const provenanceComparable = html.replace(/\r\n/g, '\n');
  for (const phrase of provenancePhrases) if (!provenanceComparable.includes(phrase)) fail(`eBook ${artifact.ebookId} provenance evidence mismatched`);
  const noticeStart = html.indexOf('<div>This eBook is for the use of anyone anywhere in the United States');
  const noticeEnd = noticeStart < 0 ? -1 : html.indexOf('</div>', noticeStart);
  const noteHeading = html.indexOf('>NOTE TO THIS ELECTRONIC EDITION</');
  const noteLastPhrase = 'defect in this edition and attributed to me (David McClamrock).';
  const noteLast = noteHeading < 0 ? -1 : html.indexOf(noteLastPhrase, noteHeading);
  const noteEnd = noteLast < 0 ? -1 : html.indexOf('</p>', noteLast);
  if (noticeStart < 0 || noticeEnd < noticeStart || noteHeading < 0 || noteLast < noteHeading || noteEnd < noteLast) fail(`eBook ${artifact.ebookId} has unextractable rights/provenance evidence`);
  return {
    unrestrictedUseNotice: Buffer.from(html.slice(noticeStart, noticeEnd + '</div>'.length), 'utf8'),
    electronicEditionProvenance: Buffer.from(html.slice(noteHeading, noteEnd + '</p>'.length), 'utf8'),
  };
}

function assertCatalog(artifact: AquinasGutenbergArtifact, catalogBytes: Uint8Array, lock: AquinasGutenbergSourceLock): void {
  if (catalogBytes.byteLength !== artifact.catalogSnapshot.bytes || sha256(catalogBytes) !== artifact.catalogSnapshot.sha256) fail(`eBook ${artifact.ebookId} catalog snapshot byte identity drifted`);
  const catalog = strictUtf8(catalogBytes, `eBook ${artifact.ebookId} catalog snapshot`);
  const required = [
    `<td>${artifact.ebookId}</td>`,
    `content="${artifact.catalogSnapshot.issuedMachineDate}"`,
    artifact.catalogSnapshot.releaseDate,
    lock.rightsAndProvenance.catalogStatement,
  ];
  if (artifact.catalogSnapshot.lastUpdate) required.push('<th>Last Update</th>', artifact.catalogSnapshot.lastUpdate);
  for (const phrase of required) if (!catalog.includes(phrase)) fail(`eBook ${artifact.ebookId} catalog metadata evidence mismatched`);
  if (artifact.catalogSnapshot.lastUpdate === null && catalog.includes('<th>Last Update</th>')) fail(`eBook ${artifact.ebookId} catalog unexpectedly has update metadata`);
}

function localRoot(cwd: string): string {
  return resolve(cwd, AQUINAS_GUTENBERG_ROOT, 'local');
}

function relativeToLocal(cwd: string, localPath: string): string {
  assertLocalRelativePath(localPath, 'local path');
  const result = resolve(cwd, AQUINAS_GUTENBERG_ROOT, localPath);
  const root = localRoot(cwd);
  if (relative(root, result).startsWith(`..${sep}`) || relative(root, result) === '..') fail('local path escaped the acquisition root');
  return result;
}

function assertNoSymlink(path: string, label: string): void {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) fail(`${label} is a symlink`);
}

function ensureSafeDirectory(path: string, stopAt: string): void {
  const relation = relative(stopAt, path);
  if (relation.startsWith(`..${sep}`) || relation === '..') fail('local directory escaped the acquisition root');
  let current = stopAt;
  if (!existsSync(current)) {
    assertNoSymlink(dirname(current), 'acquisition-root parent');
    mkdirSync(current);
  }
  const rootStat = lstatSync(current);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) fail('acquisition root is not a safe directory');
  for (const segment of relation.split(sep).filter(Boolean)) {
    current = join(current, segment);
    if (existsSync(current)) {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`local parent ${current} is not a safe directory`);
    } else {
      mkdirSync(current);
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`created local parent ${current} is not a safe directory`);
    }
  }
}

function assertDestinationAbsent(path: string, label: string): void {
  if (existsSync(path)) fail(`${label} violates no-clobber policy: destination already exists`);
}

/** Atomically link an owned temporary file into place; never replace an existing target. */
export function writeNoClobber(path: string, bytes: Uint8Array, localBoundary: string, label: string): void {
  const destination = resolve(path);
  const relation = relative(localBoundary, destination);
  if (relation.startsWith(`..${sep}`) || relation === '..') fail(`${label} escaped its permitted storage root`);
  ensureSafeDirectory(dirname(destination), localBoundary);
  assertDestinationAbsent(destination, label);
  const temporary = `${destination}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
    linkSync(temporary, destination);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
  unlinkSync(temporary);
}

function assertLocalEvidence(cwd: string, evidence: LocalEvidence, label: string): void {
  assertLocalRelativePath(evidence.path, `${label}.path`);
  const path = relativeToLocal(cwd, evidence.path);
  if (!existsSync(path)) fail(`${label} is missing`);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${label} is not a safe regular file`);
  const bytes = readFileSync(path);
  if (bytes.byteLength !== evidence.bytes || sha256(bytes) !== evidence.sha256) fail(`${label} byte identity drifted`);
}

function localEvidence(path: string, bytes: Uint8Array): LocalEvidence {
  assertLocalRelativePath(path, 'receipt evidence path');
  return { path, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function evidencePaths(artifact: AquinasGutenbergArtifact): Readonly<{ unrestrictedUseNotice: string; electronicEditionProvenance: string }> {
  return {
    unrestrictedUseNotice: `local/evidence/pg${artifact.ebookId}-unrestricted-use-notice.html`,
    electronicEditionProvenance: `local/evidence/pg${artifact.ebookId}-electronic-edition-provenance.html`,
  };
}

async function cancel(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Best effort only; the original rejection is the diagnostic that matters.
  }
}

async function readBoundedResponse(response: Response, maximum: number, label: string): Promise<Buffer> {
  if (!response.body) fail(`${label} returned no body`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        fail(`${label} exceeded its hard byte bound of ${maximum}`);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), total);
}

export async function fetchExactGutenbergBytes(url: string, maximum: number, label: string, fetchImpl: FetchLike = fetch): Promise<Buffer> {
  const parsed = assertApprovedGutenbergUrl(url, label);
  const response = await fetchImpl(parsed.toString(), { redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location') ?? '(missing)';
    await cancel(response);
    fail(`${label} redirected to an unapproved or mutable endpoint (${location})`);
  }
  if (response.status !== 200) {
    await cancel(response);
    fail(`${label} returned HTTP ${response.status}`);
  }
  return readBoundedResponse(response, maximum, label);
}

type Candidate = Readonly<{
  artifact: AquinasGutenbergArtifact;
  archive: Buffer;
  catalog: Buffer;
  html: Buffer;
  evidence: Readonly<{ unrestrictedUseNotice: Buffer; electronicEditionProvenance: Buffer }>;
}>;

async function downloadAndValidate(lock: AquinasGutenbergSourceLock, artifact: AquinasGutenbergArtifact, fetchImpl: FetchLike): Promise<Candidate> {
  const [archive, catalog] = await Promise.all([
    fetchExactGutenbergBytes(artifact.archive.url, Math.min(MAX_ARCHIVE_BYTES, artifact.archive.bytes), `eBook ${artifact.ebookId} archive`, fetchImpl),
    fetchExactGutenbergBytes(artifact.catalogSnapshot.url, MAX_CATALOG_BYTES, `eBook ${artifact.ebookId} catalog`, fetchImpl),
  ]);
  const html = extractAndVerifyLockedHtml(artifact, archive);
  assertCatalog(artifact, catalog, lock);
  return { artifact, archive, catalog, html, evidence: evidenceSlices(html, artifact, lock) };
}

function assertAcquisitionDestinationsEmpty(cwd: string, lock: AquinasGutenbergSourceLock): void {
  const receipt = relativeToLocal(cwd, AQUINAS_GUTENBERG_GENERATED_RECEIPT_LOCAL_PATH);
  assertNoSymlink(dirname(receipt), 'generated receipt parent');
  assertDestinationAbsent(receipt, AQUINAS_GUTENBERG_GENERATED_RECEIPT_LOCAL_PATH);
  for (const artifact of lock.artifacts) {
    for (const candidate of [artifact.archive.localPath, artifact.catalogSnapshot.localPath, ...Object.values(evidencePaths(artifact))]) {
      const path = relativeToLocal(cwd, candidate);
      assertNoSymlink(dirname(path), `destination parent for ${candidate}`);
      assertDestinationAbsent(path, candidate);
    }
  }
}

function makeReceipt(lock: AquinasGutenbergSourceLock, candidates: readonly Candidate[]): AquinasGutenbergReceipt {
  return {
    schemaVersion: AQUINAS_GUTENBERG_RECEIPT_VERSION,
    sourceLockSha256: EXPECTED_SOURCE_LOCK_SHA256,
    acquiredAt: new Date().toISOString(),
    artifacts: candidates.map(({ artifact, archive, catalog, html, evidence }) => {
      const paths = evidencePaths(artifact);
      return {
        ebookId: artifact.ebookId,
        archive: localEvidence(artifact.archive.localPath, archive),
        catalogSnapshot: localEvidence(artifact.catalogSnapshot.localPath, catalog),
        htmlMember: { path: artifact.htmlMember.path, bytes: html.byteLength, sha256: sha256(html) },
        unrestrictedUseNotice: localEvidence(paths.unrestrictedUseNotice, evidence.unrestrictedUseNotice),
        electronicEditionProvenance: localEvidence(paths.electronicEditionProvenance, evidence.electronicEditionProvenance),
      };
    }),
  };
}

function receiptBytes(receipt: AquinasGutenbergReceipt): Buffer {
  return Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function writeReceiptNoClobber(cwd: string, receipt: AquinasGutenbergReceipt): void {
  const path = relativeToLocal(cwd, AQUINAS_GUTENBERG_GENERATED_RECEIPT_LOCAL_PATH);
  writeNoClobber(path, receiptBytes(receipt), localRoot(cwd), 'generated receipt');
}

function parseLocalEvidence(value: unknown, label: string): LocalEvidence {
  const evidence = record(value, label);
  exactKeys(evidence, ['path', 'bytes', 'sha256'], label);
  const path = string(evidence.path, `${label}.path`);
  assertLocalRelativePath(path, `${label}.path`);
  return { path, bytes: positiveInteger(evidence.bytes, `${label}.bytes`), sha256: hex(string(evidence.sha256, `${label}.sha256`), `${label}.sha256`) };
}

function parseReceipt(value: unknown, lock: AquinasGutenbergSourceLock): AquinasGutenbergReceipt {
  const source = record(value, 'receipt');
  exactKeys(source, ['schemaVersion', 'sourceLockSha256', 'acquiredAt', 'artifacts'], 'receipt');
  if (source.schemaVersion !== AQUINAS_GUTENBERG_RECEIPT_VERSION || source.sourceLockSha256 !== EXPECTED_SOURCE_LOCK_SHA256) fail('receipt does not bind the reviewed source lock');
  const acquiredAt = string(source.acquiredAt, 'receipt.acquiredAt');
  if (Number.isNaN(Date.parse(acquiredAt)) || !acquiredAt.endsWith('Z')) fail('receipt.acquiredAt is not a UTC ISO timestamp');
  const artifacts = array(source.artifacts, 'receipt.artifacts').map((value, index) => {
    const entry = record(value, `receipt artifact ${index}`);
    exactKeys(entry, ['ebookId', 'archive', 'catalogSnapshot', 'htmlMember', 'unrestrictedUseNotice', 'electronicEditionProvenance'], `receipt artifact ${index}`);
    const html = record(entry.htmlMember, `receipt artifact ${index}.htmlMember`);
    exactKeys(html, ['path', 'bytes', 'sha256'], `receipt artifact ${index}.htmlMember`);
    return {
      ebookId: positiveInteger(entry.ebookId, `receipt artifact ${index}.ebookId`),
      archive: parseLocalEvidence(entry.archive, `receipt artifact ${index}.archive`),
      catalogSnapshot: parseLocalEvidence(entry.catalogSnapshot, `receipt artifact ${index}.catalogSnapshot`),
      htmlMember: {
        path: string(html.path, `receipt artifact ${index}.htmlMember.path`),
        bytes: positiveInteger(html.bytes, `receipt artifact ${index}.htmlMember.bytes`),
        sha256: hex(string(html.sha256, `receipt artifact ${index}.htmlMember.sha256`), `receipt artifact ${index}.htmlMember.sha256`),
      },
      unrestrictedUseNotice: parseLocalEvidence(entry.unrestrictedUseNotice, `receipt artifact ${index}.unrestrictedUseNotice`),
      electronicEditionProvenance: parseLocalEvidence(entry.electronicEditionProvenance, `receipt artifact ${index}.electronicEditionProvenance`),
    };
  });
  if (artifacts.length !== lock.artifacts.length || artifacts.some((artifact, index) => artifact.ebookId !== lock.artifacts[index]!.ebookId)) fail('receipt does not retain all four locked artifacts in order');
  return { schemaVersion: AQUINAS_GUTENBERG_RECEIPT_VERSION, sourceLockSha256: EXPECTED_SOURCE_LOCK_SHA256, acquiredAt, artifacts };
}

function assertReceiptMatchesLock(receipt: AquinasGutenbergReceipt, lock: AquinasGutenbergSourceLock): void {
  for (const [index, artifact] of lock.artifacts.entries()) {
    const entry = receipt.artifacts[index]!;
    const paths = evidencePaths(artifact);
    if (entry.archive.path !== artifact.archive.localPath || entry.archive.bytes !== artifact.archive.bytes || entry.archive.sha256 !== artifact.archive.sha256 || entry.catalogSnapshot.path !== artifact.catalogSnapshot.localPath || entry.catalogSnapshot.bytes !== artifact.catalogSnapshot.bytes || entry.catalogSnapshot.sha256 !== artifact.catalogSnapshot.sha256 || entry.htmlMember.path !== artifact.htmlMember.path || entry.htmlMember.bytes !== artifact.htmlMember.bytes || entry.htmlMember.sha256 !== artifact.htmlMember.sha256 || entry.unrestrictedUseNotice.path !== paths.unrestrictedUseNotice || entry.electronicEditionProvenance.path !== paths.electronicEditionProvenance) {
      fail(`receipt artifact ${artifact.ebookId} drifted from the locked identity`);
    }
  }
}

export async function preflightAquinasGutenbergAcquisition(cwd = ROOT, fetchImpl: FetchLike = fetch): Promise<AquinasGutenbergSourceLock> {
  const lock = readAquinasGutenbergSourceLock(cwd);
  await Promise.all(lock.artifacts.map(artifact => downloadAndValidate(lock, artifact, fetchImpl)));
  return lock;
}

export async function acquireAquinasGutenberg(cwd = ROOT, fetchImpl: FetchLike = fetch): Promise<AquinasGutenbergReceipt> {
  const lock = readAquinasGutenbergSourceLock(cwd);
  assertAcquisitionDestinationsEmpty(cwd, lock);
  // Validate every remote byte in memory before the first local write.
  const candidates = await Promise.all(lock.artifacts.map(artifact => downloadAndValidate(lock, artifact, fetchImpl)));
  for (const candidate of candidates) {
    const { artifact, archive, catalog, evidence } = candidate;
    writeNoClobber(relativeToLocal(cwd, artifact.archive.localPath), archive, localRoot(cwd), `eBook ${artifact.ebookId} archive`);
    writeNoClobber(relativeToLocal(cwd, artifact.catalogSnapshot.localPath), catalog, localRoot(cwd), `eBook ${artifact.ebookId} catalog snapshot`);
    const paths = evidencePaths(artifact);
    writeNoClobber(relativeToLocal(cwd, paths.unrestrictedUseNotice), evidence.unrestrictedUseNotice, localRoot(cwd), `eBook ${artifact.ebookId} unrestricted-use evidence`);
    writeNoClobber(relativeToLocal(cwd, paths.electronicEditionProvenance), evidence.electronicEditionProvenance, localRoot(cwd), `eBook ${artifact.ebookId} provenance evidence`);
  }
  const receipt = makeReceipt(lock, candidates);
  writeReceiptNoClobber(cwd, receipt);
  return verifyLocalAquinasGutenbergAcquisition(cwd);
}

export function verifyLocalAquinasGutenbergAcquisition(cwd = ROOT): AquinasGutenbergReceipt {
  const lock = readAquinasGutenbergSourceLock(cwd);
  const generatedReceiptPath = relativeToLocal(cwd, AQUINAS_GUTENBERG_GENERATED_RECEIPT_LOCAL_PATH);
  const receiptPath = existsSync(generatedReceiptPath)
    ? generatedReceiptPath
    : resolve(cwd, AQUINAS_GUTENBERG_RECEIPT_PATH);
  if (!existsSync(receiptPath)) fail('local acquisition receipt is missing');
  const receiptStat = lstatSync(receiptPath);
  if (receiptStat.isSymbolicLink() || !receiptStat.isFile()) fail('local acquisition receipt is not a safe regular file');
  const receiptFile = readFileSync(receiptPath);
  if (receiptPath !== generatedReceiptPath && sha256(receiptFile) !== EXPECTED_REVIEWED_RECEIPT_SHA256) {
    fail('reviewed acquisition receipt byte identity drifted');
  }
  const receipt = parseReceipt(JSON.parse(strictUtf8(receiptFile, 'local acquisition receipt')), lock);
  assertReceiptMatchesLock(receipt, lock);
  for (const [index, artifact] of lock.artifacts.entries()) {
    const entry = receipt.artifacts[index]!;
    assertLocalEvidence(cwd, entry.archive, `eBook ${artifact.ebookId} archive`);
    assertLocalEvidence(cwd, entry.catalogSnapshot, `eBook ${artifact.ebookId} catalog snapshot`);
    assertLocalEvidence(cwd, entry.unrestrictedUseNotice, `eBook ${artifact.ebookId} unrestricted-use evidence`);
    assertLocalEvidence(cwd, entry.electronicEditionProvenance, `eBook ${artifact.ebookId} provenance evidence`);
    const archive = readFileSync(relativeToLocal(cwd, artifact.archive.localPath));
    const html = extractAndVerifyLockedHtml(artifact, archive);
    const catalog = readFileSync(relativeToLocal(cwd, artifact.catalogSnapshot.localPath));
    assertCatalog(artifact, catalog, lock);
    const evidence = evidenceSlices(html, artifact, lock);
    if (sha256(evidence.unrestrictedUseNotice) !== entry.unrestrictedUseNotice.sha256 || sha256(evidence.electronicEditionProvenance) !== entry.electronicEditionProvenance.sha256) fail(`eBook ${artifact.ebookId} local evidence extraction drifted`);
  }
  return receipt;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === '--preflight') {
    const lock = await preflightAquinasGutenbergAcquisition();
    console.error(`[aquinas-gutenberg-acquisition] preflight passed for ${lock.artifacts.length} locked Project Gutenberg artifacts.`);
    return;
  }
  if (command === '--acquire') {
    const receipt = await acquireAquinasGutenberg();
    console.error(`[aquinas-gutenberg-acquisition] acquired ${receipt.artifacts.length} locked artifacts; receipt binds ${receipt.sourceLockSha256}.`);
    return;
  }
  if (command === '--verify-local') {
    const receipt = verifyLocalAquinasGutenbergAcquisition();
    console.error(`[aquinas-gutenberg-acquisition] local verification passed for ${receipt.artifacts.length} locked artifacts.`);
    return;
  }
  fail('use exactly one of --preflight, --acquire, or --verify-local');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
