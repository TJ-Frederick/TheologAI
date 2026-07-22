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
import { parse, type DefaultTreeAdapterTypes } from 'parse5';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const AQUINAS_GUTENBERG_ROOT = 'data/historical-sources/project-gutenberg/aquinas-english-dominican';
export const AQUINAS_GUTENBERG_SOURCE_LOCK_PATH = `${AQUINAS_GUTENBERG_ROOT}/SOURCE_LOCK.json`;
export const AQUINAS_GUTENBERG_CATALOG_IDENTITY_LOCK_PATH = `${AQUINAS_GUTENBERG_ROOT}/CATALOG_IDENTITY_LOCK.json`;
// Reviewed, tracked evidence from the approved acquisition. Keep this path and
// its bytes stable because downstream topology locks bind its digest.
export const AQUINAS_GUTENBERG_RECEIPT_PATH = `${AQUINAS_GUTENBERG_ROOT}/LOCAL_ACQUISITION_RECEIPT.json`;
// Per-checkout acquisition output. Unlike the reviewed receipt above, this is
// generated beneath the ignored local/ boundary and is always no-clobber.
export const AQUINAS_GUTENBERG_GENERATED_RECEIPT_LOCAL_PATH = 'local/LOCAL_ACQUISITION_RECEIPT.json';
export const AQUINAS_GUTENBERG_SOURCE_LOCK_VERSION = 'theologai-aquinas-gutenberg-source-lock.v1';
export const AQUINAS_GUTENBERG_RECEIPT_VERSION = 'theologai-aquinas-gutenberg-local-receipt.v1';
export const AQUINAS_GUTENBERG_CATALOG_IDENTITY_LOCK_VERSION = 'theologai-aquinas-gutenberg-catalog-identity-lock.v1';
export const AQUINAS_GUTENBERG_GENERATED_RECEIPT_VERSION = 'theologai-aquinas-gutenberg-generated-receipt.v1';

// This binds the reviewed lock byte-for-byte. Changing a pin requires review of
// both the JSON and this executable guard; a receipt alone cannot redefine it.
const EXPECTED_SOURCE_LOCK_SHA256 = 'c5cfdd1edd132bf59968cbabe4c7de2180c42d205735ca6c06aec626104a180b';
const EXPECTED_REVIEWED_RECEIPT_SHA256 = 'bc0dab9ce5dc3672ccf2a81182655c75eaf6ef4f280584a40e079bf82a11719d';
const EXPECTED_CATALOG_IDENTITY_LOCK_SHA256 = '42e19c59e1907560148fd68316c9426eeaf664d8bcab358726b78b497df18c7c';
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

export type AquinasGutenbergCatalogSemanticIdentity = Readonly<{
  author: Readonly<{ name: string; agentPath: string; agentAboutPath: string }>;
  titleLines: readonly string[];
  credits: string;
  language: Readonly<{ code: string; label: string }>;
  locClass: string;
  category: string;
  release: Readonly<{ machineDate: string; displayDate: string }>;
  lastUpdate: Readonly<{ machineDate: string; displayDate: string }> | null;
  rightsStatement: string;
  archiveDownload: Readonly<{ path: string; mediaType: string; label: string }>;
}>;

export type AquinasGutenbergCatalogIdentityArtifact = Readonly<{
  ebookId: number;
  catalogPath: string;
  semanticIdentity: AquinasGutenbergCatalogSemanticIdentity;
}>;

export type AquinasGutenbergCatalogIdentityLock = Readonly<{
  schemaVersion: typeof AQUINAS_GUTENBERG_CATALOG_IDENTITY_LOCK_VERSION;
  sourceLockSha256: string;
  reviewedReceiptSha256: string;
  artifacts: readonly AquinasGutenbergCatalogIdentityArtifact[];
}>;

export type AquinasGutenbergGeneratedReceiptArtifact = Omit<AquinasGutenbergReceiptArtifact, 'catalogSnapshot'> & Readonly<{
  catalogSnapshot: LocalEvidence & Readonly<{ semanticIdentitySha256: string }>;
}>;

export type AquinasGutenbergGeneratedReceipt = Readonly<{
  schemaVersion: typeof AQUINAS_GUTENBERG_GENERATED_RECEIPT_VERSION;
  sourceLockSha256: string;
  reviewedReceiptSha256: string;
  catalogIdentityLockSha256: string;
  acquiredAt: string;
  artifacts: readonly AquinasGutenbergGeneratedReceiptArtifact[];
}>;

export type AquinasGutenbergReviewedPins = Readonly<{
  sourceLockSha256: string;
  reviewedReceiptSha256: string;
  catalogIdentityLockSha256: string;
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

function exactStringArray(value: unknown, expected: readonly string[], label: string): readonly string[] {
  const observed = array(value, label).map((entry, index) => string(entry, `${label}[${index}]`));
  if (observed.length !== expected.length || observed.some((entry, index) => entry !== expected[index])) fail(`${label} drifted`);
  return observed;
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

function defaultReviewedPins(): AquinasGutenbergReviewedPins {
  return {
    sourceLockSha256: EXPECTED_SOURCE_LOCK_SHA256,
    reviewedReceiptSha256: EXPECTED_REVIEWED_RECEIPT_SHA256,
    catalogIdentityLockSha256: EXPECTED_CATALOG_IDENTITY_LOCK_SHA256,
  };
}

export function readAquinasGutenbergSourceLock(cwd = ROOT, pins: AquinasGutenbergReviewedPins = defaultReviewedPins()): AquinasGutenbergSourceLock {
  const bytes = readFileSync(resolve(cwd, AQUINAS_GUTENBERG_SOURCE_LOCK_PATH));
  if (sha256(bytes) !== pins.sourceLockSha256) fail('source lock byte identity drifted from the reviewed lock');
  return parseAquinasGutenbergSourceLock(JSON.parse(strictUtf8(bytes, 'source lock')));
}

const CATALOG_INVARIANT_FIELDS = [
  'ebookId', 'catalogPath', 'author.name', 'author.agentPath', 'author.agentAboutPath', 'titleLines', 'credits',
  'language.code', 'language.label', 'locClass', 'category', 'release.machineDate',
  'release.displayDate', 'lastUpdate.machineDate', 'lastUpdate.displayDate',
  'rightsStatement', 'archiveDownload.path', 'archiveDownload.mediaType', 'archiveDownload.label',
] as const;

function parseCatalogSemanticIdentity(value: unknown, ebookId: number, label: string): AquinasGutenbergCatalogSemanticIdentity {
  const identity = record(value, label);
  exactKeys(identity, ['author', 'titleLines', 'credits', 'language', 'locClass', 'category', 'release', 'lastUpdate', 'rightsStatement', 'archiveDownload'], label);
  const author = record(identity.author, `${label}.author`);
  exactKeys(author, ['name', 'agentPath', 'agentAboutPath'], `${label}.author`);
  const language = record(identity.language, `${label}.language`);
  exactKeys(language, ['code', 'label'], `${label}.language`);
  const release = record(identity.release, `${label}.release`);
  exactKeys(release, ['machineDate', 'displayDate'], `${label}.release`);
  const lastUpdate = identity.lastUpdate === null ? null : record(identity.lastUpdate, `${label}.lastUpdate`);
  if (lastUpdate) exactKeys(lastUpdate, ['machineDate', 'displayDate'], `${label}.lastUpdate`);
  const archive = record(identity.archiveDownload, `${label}.archiveDownload`);
  exactKeys(archive, ['path', 'mediaType', 'label'], `${label}.archiveDownload`);
  const agentPath = string(author.agentPath, `${label}.author.agentPath`);
  if (!/^\/ebooks\/author\/[1-9][0-9]*$/.test(agentPath)) fail(`${label}.author.agentPath is not an exact Gutenberg agent path`);
  const agentAboutPath = string(author.agentAboutPath, `${label}.author.agentAboutPath`);
  if (!/^\/authors\/[1-9][0-9]*$/.test(agentAboutPath) || agentAboutPath.slice('/authors/'.length) !== agentPath.slice('/ebooks/author/'.length)) fail(`${label}.author agent identifiers disagree`);
  const archivePath = string(archive.path, `${label}.archiveDownload.path`);
  if (archivePath !== `/cache/epub/${ebookId}/pg${ebookId}-h.zip`) fail(`${label}.archiveDownload.path drifted`);
  const titleLines = array(identity.titleLines, `${label}.titleLines`).map((entry, index) => string(entry, `${label}.titleLines[${index}]`));
  if (titleLines.length !== 2) fail(`${label}.titleLines must contain exactly two reviewed lines`);
  return {
    author: { name: string(author.name, `${label}.author.name`), agentPath, agentAboutPath },
    titleLines,
    credits: string(identity.credits, `${label}.credits`),
    language: { code: string(language.code, `${label}.language.code`), label: string(language.label, `${label}.language.label`) },
    locClass: string(identity.locClass, `${label}.locClass`),
    category: string(identity.category, `${label}.category`),
    release: { machineDate: string(release.machineDate, `${label}.release.machineDate`), displayDate: string(release.displayDate, `${label}.release.displayDate`) },
    lastUpdate: lastUpdate ? { machineDate: string(lastUpdate.machineDate, `${label}.lastUpdate.machineDate`), displayDate: string(lastUpdate.displayDate, `${label}.lastUpdate.displayDate`) } : null,
    rightsStatement: string(identity.rightsStatement, `${label}.rightsStatement`),
    archiveDownload: { path: archivePath, mediaType: string(archive.mediaType, `${label}.archiveDownload.mediaType`), label: string(archive.label, `${label}.archiveDownload.label`) },
  };
}

export function parseAquinasGutenbergCatalogIdentityLock(value: unknown): AquinasGutenbergCatalogIdentityLock {
  const lock = record(value, 'catalog identity lock');
  exactKeys(lock, ['schemaVersion', 'sourceLockSha256', 'reviewedReceiptSha256', 'normalization', 'invariantFields', 'allowedVolatility', 'permittedOutOfProjectionRows', 'outOfProjectionPresentation', 'artifacts'], 'catalog identity lock');
  if (lock.schemaVersion !== AQUINAS_GUTENBERG_CATALOG_IDENTITY_LOCK_VERSION) fail('unsupported catalog identity lock schema');
  const normalization = record(lock.normalization, 'catalog identity normalization');
  exactKeys(normalization, ['parser', 'text', 'projection', 'rawSnapshot'], 'catalog identity normalization');
  for (const key of ['parser', 'text', 'projection', 'rawSnapshot']) string(normalization[key], `catalog identity normalization.${key}`);
  exactStringArray(lock.invariantFields, CATALOG_INVARIANT_FIELDS, 'catalog identity invariantFields');
  const volatility = array(lock.allowedVolatility, 'catalog identity allowedVolatility');
  const expectedVolatility = [
    ['siteWideFreeEbookCount', '^[0-9]{1,3}(,[0-9]{3})* free eBooks$', 'unique breadcrumb link href=/ebooks/ and its unique itemprop=name span'],
    ['downloadsLast30Days', '^[0-9]{1,12} downloads in the last 30 days\\.$', 'unique Downloads row in table#about_book_table'],
  ] as const;
  if (volatility.length !== expectedVolatility.length) fail('catalog identity allowedVolatility drifted');
  volatility.forEach((value, index) => {
    const entry = record(value, `catalog identity allowedVolatility[${index}]`);
    exactKeys(entry, ['field', 'syntax', 'locator'], `catalog identity allowedVolatility[${index}]`);
    if (entry.field !== expectedVolatility[index]![0] || entry.syntax !== expectedVolatility[index]![1] || entry.locator !== expectedVolatility[index]![2]) fail(`catalog identity allowedVolatility[${index}] drifted`);
  });
  const permittedRows = array(lock.permittedOutOfProjectionRows, 'catalog identity permittedOutOfProjectionRows');
  const expectedPermittedRows = [
    ['Note', 1, 'The Wikipedia pointer is contextual navigation, not edition identity or provenance evidence.'],
    ['Reading Level', 1, 'The computed readability estimate is presentation metadata and is not source identity.'],
    ['Subject', 4, 'The four catalog subject classifications aid discovery but do not select this electronic edition.'],
  ] as const;
  if (permittedRows.length !== expectedPermittedRows.length) fail('catalog identity permittedOutOfProjectionRows drifted');
  permittedRows.forEach((value, index) => {
    const entry = record(value, `catalog identity permittedOutOfProjectionRows[${index}]`);
    exactKeys(entry, ['label', 'expectedCount', 'rationale'], `catalog identity permittedOutOfProjectionRows[${index}]`);
    const expected = expectedPermittedRows[index]!;
    if (entry.label !== expected[0] || entry.expectedCount !== expected[1] || entry.rationale !== expected[2]) fail(`catalog identity permittedOutOfProjectionRows[${index}] drifted`);
  });
  exactStringArray(lock.outOfProjectionPresentation, ['descriptive summary', 'reading-level estimate', 'site navigation and styling', 'non-archive download-format presentation'], 'catalog identity outOfProjectionPresentation');
  const artifacts = array(lock.artifacts, 'catalog identity artifacts').map((value, index) => {
    const artifact = record(value, `catalog identity artifact ${index}`);
    exactKeys(artifact, ['ebookId', 'catalogPath', 'semanticIdentity'], `catalog identity artifact ${index}`);
    const ebookId = positiveInteger(artifact.ebookId, `catalog identity artifact ${index}.ebookId`);
    const catalogPath = string(artifact.catalogPath, `catalog identity artifact ${index}.catalogPath`);
    if (catalogPath !== `/ebooks/${ebookId}`) fail(`catalog identity artifact ${index}.catalogPath drifted`);
    return { ebookId, catalogPath, semanticIdentity: parseCatalogSemanticIdentity(artifact.semanticIdentity, ebookId, `catalog identity artifact ${index}.semanticIdentity`) };
  });
  if (artifacts.length !== 4 || artifacts.some((artifact, index) => artifact.ebookId !== [17611, 17897, 18755, 19950][index])) fail('catalog identity lock topology drifted');
  return {
    schemaVersion: AQUINAS_GUTENBERG_CATALOG_IDENTITY_LOCK_VERSION,
    sourceLockSha256: hex(string(lock.sourceLockSha256, 'catalog identity sourceLockSha256'), 'catalog identity sourceLockSha256'),
    reviewedReceiptSha256: hex(string(lock.reviewedReceiptSha256, 'catalog identity reviewedReceiptSha256'), 'catalog identity reviewedReceiptSha256'),
    artifacts,
  };
}

export function readAquinasGutenbergCatalogIdentityLock(cwd = ROOT, pins: AquinasGutenbergReviewedPins = defaultReviewedPins()): AquinasGutenbergCatalogIdentityLock {
  const bytes = readFileSync(resolve(cwd, AQUINAS_GUTENBERG_CATALOG_IDENTITY_LOCK_PATH));
  if (sha256(bytes) !== pins.catalogIdentityLockSha256) fail('catalog identity lock byte identity drifted');
  const lock = parseAquinasGutenbergCatalogIdentityLock(JSON.parse(strictUtf8(bytes, 'catalog identity lock')));
  if (lock.sourceLockSha256 !== pins.sourceLockSha256 || lock.reviewedReceiptSha256 !== pins.reviewedReceiptSha256) fail('catalog identity lock does not bind the reviewed source and receipt');
  return lock;
}

export function catalogSemanticIdentityDigest(artifact: AquinasGutenbergCatalogIdentityArtifact): string {
  return sha256(Buffer.from(`theologai-aquinas-gutenberg-catalog-semantic-identity.v1\0${JSON.stringify(artifact)}`, 'utf8'));
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

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;

function isHtmlElement(node: HtmlNode): node is HtmlElement {
  return 'tagName' in node;
}

function htmlChildren(node: HtmlNode): readonly HtmlNode[] {
  return 'childNodes' in node ? node.childNodes : [];
}

function htmlElements(root: HtmlNode, predicate: (element: HtmlElement) => boolean): HtmlElement[] {
  const matches: HtmlElement[] = [];
  const visit = (node: HtmlNode): void => {
    if (isHtmlElement(node) && predicate(node)) matches.push(node);
    for (const child of htmlChildren(node)) visit(child);
  };
  visit(root);
  return matches;
}

function htmlAttribute(element: HtmlElement, name: string): string | null {
  return element.attrs.find(attribute => attribute.name === name)?.value ?? null;
}

function normalizedHtmlText(node: HtmlNode, preserveBreaks = false): string {
  const collect = (current: HtmlNode): string => {
    if ('value' in current && current.nodeName === '#text') return current.value;
    if (preserveBreaks && isHtmlElement(current) && current.tagName === 'br') return '\n';
    return htmlChildren(current).map(collect).join('');
  };
  const raw = collect(node).replace(/\r\n?/g, '\n');
  if (!preserveBreaks) return raw.replace(/\s+/g, ' ').trim();
  return raw.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

function uniqueHtmlElement(root: HtmlNode, predicate: (element: HtmlElement) => boolean, label: string): HtmlElement {
  const matches = htmlElements(root, predicate);
  if (matches.length !== 1) fail(`${label} must occur exactly once`);
  return matches[0]!;
}

/** Extract the closed semantic projection; only the two lock-documented counters may vary. */
export function extractAndVerifyCatalogSemanticIdentity(
  sourceArtifact: AquinasGutenbergArtifact,
  identityArtifact: AquinasGutenbergCatalogIdentityArtifact,
  catalogBytes: Uint8Array,
  sourceLock: AquinasGutenbergSourceLock,
): AquinasGutenbergCatalogSemanticIdentity {
  if (sourceArtifact.ebookId !== identityArtifact.ebookId || new URL(sourceArtifact.catalogSnapshot.url).pathname !== identityArtifact.catalogPath) fail(`eBook ${sourceArtifact.ebookId} catalog locks disagree`);
  if (catalogBytes.byteLength === 0 || catalogBytes.byteLength > MAX_CATALOG_BYTES) fail(`eBook ${sourceArtifact.ebookId} catalog snapshot exceeds its byte contract`);
  const document = parse(strictUtf8(catalogBytes, `eBook ${sourceArtifact.ebookId} catalog snapshot`));
  uniqueHtmlElement(document, element => element.tagName === 'div' && htmlAttribute(element, 'typeof') === 'pgterms:ebook' && htmlAttribute(element, 'about') === `[ebook:${sourceArtifact.ebookId}]`, `eBook ${sourceArtifact.ebookId} catalog identity container`);
  const siteCountLink = uniqueHtmlElement(document, element => element.tagName === 'a' && htmlAttribute(element, 'href') === '/ebooks/' && htmlAttribute(element, 'title') === 'Start a new search.', `eBook ${sourceArtifact.ebookId} site-wide counter link`);
  const siteCount = uniqueHtmlElement(siteCountLink, element => element.tagName === 'span' && htmlAttribute(element, 'itemprop') === 'name', `eBook ${sourceArtifact.ebookId} site-wide counter`);
  if (!/^[0-9]{1,3}(,[0-9]{3})* free eBooks$/.test(normalizedHtmlText(siteCount))) fail(`eBook ${sourceArtifact.ebookId} site-wide counter is malformed`);
  const table = uniqueHtmlElement(document, element => element.tagName === 'table' && htmlAttribute(element, 'id') === 'about_book_table', `eBook ${sourceArtifact.ebookId} catalog metadata table`);
  const rows = htmlElements(table, element => element.tagName === 'tr').map(row => {
    const headings = htmlElements(row, element => element.tagName === 'th');
    const values = htmlElements(row, element => element.tagName === 'td');
    if (headings.length !== 1 || values.length !== 1) fail(`eBook ${sourceArtifact.ebookId} catalog row is structurally ambiguous`);
    return { row, value: values[0]!, label: normalizedHtmlText(headings[0]!) };
  });
  const expectedRowCounts: Readonly<Record<string, number>> = {
    Author: 1,
    Title: 1,
    Note: 1,
    Credits: 1,
    'Reading Level': 1,
    Language: 1,
    'LoC Class': 1,
    Subject: 4,
    Category: 1,
    'eBook-No.': 1,
    'Release Date': 1,
    'Last Update': identityArtifact.semanticIdentity.lastUpdate ? 1 : 0,
    Copyright: 1,
    Downloads: 1,
  };
  for (const candidate of rows) {
    if (!(candidate.label in expectedRowCounts)) fail(`eBook ${sourceArtifact.ebookId} catalog has unknown row label: ${candidate.label || '(empty)'}`);
  }
  for (const [label, expectedCount] of Object.entries(expectedRowCounts)) {
    const observedCount = rows.filter(candidate => candidate.label === label).length;
    if (observedCount !== expectedCount) fail(`eBook ${sourceArtifact.ebookId} catalog ${label} row count drifted: expected ${expectedCount}, observed ${observedCount}`);
  }
  const requiredRow = (label: string, optional = false): { row: HtmlElement; value: HtmlElement } | null => {
    const matches = rows.filter(candidate => candidate.label === label);
    if (matches.length > 1 || (!optional && matches.length !== 1)) fail(`eBook ${sourceArtifact.ebookId} catalog ${label} row must occur exactly once`);
    return matches[0] ?? null;
  };
  const authorRow = requiredRow('Author')!;
  const authorLink = uniqueHtmlElement(authorRow.value, element => element.tagName === 'a' && htmlAttribute(element, 'itemprop') === 'creator', `eBook ${sourceArtifact.ebookId} catalog author link`);
  const authorCellContent = htmlChildren(authorRow.value).filter(child => isHtmlElement(child) || normalizedHtmlText(child).length > 0);
  if (authorCellContent.length !== 1 || authorCellContent[0] !== authorLink || htmlElements(authorLink, element => element !== authorLink).length !== 0 || normalizedHtmlText(authorRow.value) !== normalizedHtmlText(authorLink)) {
    fail(`eBook ${sourceArtifact.ebookId} Author cell must contain only the single reviewed creator link and text`);
  }
  const titleRow = requiredRow('Title')!;
  const creditsRow = requiredRow('Credits')!;
  const languageRow = requiredRow('Language')!;
  const locClassRow = requiredRow('LoC Class')!;
  const categoryRow = requiredRow('Category')!;
  const ebookNumberRow = requiredRow('eBook-No.')!;
  const releaseRow = requiredRow('Release Date')!;
  const lastUpdateRow = requiredRow('Last Update', true);
  const rightsRow = requiredRow('Copyright')!;
  const downloadsRow = requiredRow('Downloads')!;
  if (!/^[0-9]{1,12} downloads in the last 30 days\.$/.test(normalizedHtmlText(downloadsRow.value))) fail(`eBook ${sourceArtifact.ebookId} 30-day download counter is malformed`);
  const archiveLink = uniqueHtmlElement(document, element => element.tagName === 'a' && htmlAttribute(element, 'href') === identityArtifact.semanticIdentity.archiveDownload.path, `eBook ${sourceArtifact.ebookId} exact archive link`);
  const ebookId = Number(normalizedHtmlText(ebookNumberRow.value));
  if (!Number.isSafeInteger(ebookId) || ebookId !== sourceArtifact.ebookId) fail(`eBook ${sourceArtifact.ebookId} catalog eBook-No. drifted`);
  const observed: AquinasGutenbergCatalogSemanticIdentity = {
    author: { name: normalizedHtmlText(authorLink), agentPath: htmlAttribute(authorLink, 'href') ?? '', agentAboutPath: htmlAttribute(authorLink, 'about') ?? '' },
    titleLines: normalizedHtmlText(titleRow.value, true).split('\n'),
    credits: normalizedHtmlText(creditsRow.value),
    language: { code: htmlAttribute(languageRow.row, 'content') ?? '', label: normalizedHtmlText(languageRow.value) },
    locClass: htmlAttribute(locClassRow.row, 'content') ?? '',
    category: normalizedHtmlText(categoryRow.value),
    release: { machineDate: htmlAttribute(releaseRow.row, 'content') ?? '', displayDate: normalizedHtmlText(releaseRow.value) },
    lastUpdate: lastUpdateRow ? { machineDate: htmlAttribute(lastUpdateRow.row, 'content') ?? '', displayDate: normalizedHtmlText(lastUpdateRow.value) } : null,
    rightsStatement: normalizedHtmlText(rightsRow.value),
    archiveDownload: { path: htmlAttribute(archiveLink, 'href') ?? '', mediaType: htmlAttribute(archiveLink, 'type') ?? '', label: normalizedHtmlText(archiveLink) },
  };
  const observedArtifact = { ebookId, catalogPath: identityArtifact.catalogPath, semanticIdentity: observed };
  if (observed.rightsStatement !== sourceLock.rightsAndProvenance.catalogStatement || catalogSemanticIdentityDigest(observedArtifact) !== catalogSemanticIdentityDigest(identityArtifact)) fail(`eBook ${sourceArtifact.ebookId} catalog semantic identity drifted`);
  return observed;
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
  identityArtifact: AquinasGutenbergCatalogIdentityArtifact;
  archive: Buffer;
  catalog: Buffer;
  catalogSemanticIdentity: AquinasGutenbergCatalogSemanticIdentity;
  html: Buffer;
  evidence: Readonly<{ unrestrictedUseNotice: Buffer; electronicEditionProvenance: Buffer }>;
}>;

async function downloadAndValidate(lock: AquinasGutenbergSourceLock, catalogLock: AquinasGutenbergCatalogIdentityLock, artifact: AquinasGutenbergArtifact, index: number, fetchImpl: FetchLike): Promise<Candidate> {
  const identityArtifact = catalogLock.artifacts[index]!;
  const [archive, catalog] = await Promise.all([
    fetchExactGutenbergBytes(artifact.archive.url, Math.min(MAX_ARCHIVE_BYTES, artifact.archive.bytes), `eBook ${artifact.ebookId} archive`, fetchImpl),
    fetchExactGutenbergBytes(artifact.catalogSnapshot.url, MAX_CATALOG_BYTES, `eBook ${artifact.ebookId} catalog`, fetchImpl),
  ]);
  const html = extractAndVerifyLockedHtml(artifact, archive);
  const catalogSemanticIdentity = extractAndVerifyCatalogSemanticIdentity(artifact, identityArtifact, catalog, lock);
  return { artifact, identityArtifact, archive, catalog, catalogSemanticIdentity, html, evidence: evidenceSlices(html, artifact, lock) };
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

function makeGeneratedReceipt(candidates: readonly Candidate[], pins: AquinasGutenbergReviewedPins): AquinasGutenbergGeneratedReceipt {
  return {
    schemaVersion: AQUINAS_GUTENBERG_GENERATED_RECEIPT_VERSION,
    sourceLockSha256: pins.sourceLockSha256,
    reviewedReceiptSha256: pins.reviewedReceiptSha256,
    catalogIdentityLockSha256: pins.catalogIdentityLockSha256,
    acquiredAt: new Date().toISOString(),
    artifacts: candidates.map(({ artifact, identityArtifact, archive, catalog, catalogSemanticIdentity, html, evidence }) => {
      const paths = evidencePaths(artifact);
      return {
        ebookId: artifact.ebookId,
        archive: localEvidence(artifact.archive.localPath, archive),
        catalogSnapshot: {
          ...localEvidence(artifact.catalogSnapshot.localPath, catalog),
          semanticIdentitySha256: catalogSemanticIdentityDigest({ ...identityArtifact, semanticIdentity: catalogSemanticIdentity }),
        },
        htmlMember: { path: artifact.htmlMember.path, bytes: html.byteLength, sha256: sha256(html) },
        unrestrictedUseNotice: localEvidence(paths.unrestrictedUseNotice, evidence.unrestrictedUseNotice),
        electronicEditionProvenance: localEvidence(paths.electronicEditionProvenance, evidence.electronicEditionProvenance),
      };
    }),
  };
}

function receiptBytes(receipt: AquinasGutenbergGeneratedReceipt): Buffer {
  return Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function writeReceiptNoClobber(cwd: string, receipt: AquinasGutenbergGeneratedReceipt): void {
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

function parseReceipt(value: unknown, lock: AquinasGutenbergSourceLock, pins: AquinasGutenbergReviewedPins): AquinasGutenbergReceipt {
  const source = record(value, 'receipt');
  exactKeys(source, ['schemaVersion', 'sourceLockSha256', 'acquiredAt', 'artifacts'], 'receipt');
  if (source.schemaVersion !== AQUINAS_GUTENBERG_RECEIPT_VERSION || source.sourceLockSha256 !== pins.sourceLockSha256) fail('receipt does not bind the reviewed source lock');
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
  return { schemaVersion: AQUINAS_GUTENBERG_RECEIPT_VERSION, sourceLockSha256: pins.sourceLockSha256, acquiredAt, artifacts };
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

function parseGeneratedReceipt(value: unknown, lock: AquinasGutenbergSourceLock, catalogLock: AquinasGutenbergCatalogIdentityLock, pins: AquinasGutenbergReviewedPins): AquinasGutenbergGeneratedReceipt {
  const source = record(value, 'generated receipt');
  exactKeys(source, ['schemaVersion', 'sourceLockSha256', 'reviewedReceiptSha256', 'catalogIdentityLockSha256', 'acquiredAt', 'artifacts'], 'generated receipt');
  if (source.schemaVersion !== AQUINAS_GUTENBERG_GENERATED_RECEIPT_VERSION
    || source.sourceLockSha256 !== pins.sourceLockSha256
    || source.reviewedReceiptSha256 !== pins.reviewedReceiptSha256
    || source.catalogIdentityLockSha256 !== pins.catalogIdentityLockSha256) fail('generated receipt does not bind all reviewed locks');
  const acquiredAt = string(source.acquiredAt, 'generated receipt.acquiredAt');
  if (Number.isNaN(Date.parse(acquiredAt)) || !acquiredAt.endsWith('Z')) fail('generated receipt.acquiredAt is not a UTC ISO timestamp');
  const artifacts = array(source.artifacts, 'generated receipt.artifacts').map((value, index) => {
    const entry = record(value, `generated receipt artifact ${index}`);
    exactKeys(entry, ['ebookId', 'archive', 'catalogSnapshot', 'htmlMember', 'unrestrictedUseNotice', 'electronicEditionProvenance'], `generated receipt artifact ${index}`);
    const catalog = record(entry.catalogSnapshot, `generated receipt artifact ${index}.catalogSnapshot`);
    exactKeys(catalog, ['path', 'bytes', 'sha256', 'semanticIdentitySha256'], `generated receipt artifact ${index}.catalogSnapshot`);
    const html = record(entry.htmlMember, `generated receipt artifact ${index}.htmlMember`);
    exactKeys(html, ['path', 'bytes', 'sha256'], `generated receipt artifact ${index}.htmlMember`);
    return {
      ebookId: positiveInteger(entry.ebookId, `generated receipt artifact ${index}.ebookId`),
      archive: parseLocalEvidence(entry.archive, `generated receipt artifact ${index}.archive`),
      catalogSnapshot: {
        path: string(catalog.path, `generated receipt artifact ${index}.catalogSnapshot.path`),
        bytes: positiveInteger(catalog.bytes, `generated receipt artifact ${index}.catalogSnapshot.bytes`),
        sha256: hex(string(catalog.sha256, `generated receipt artifact ${index}.catalogSnapshot.sha256`), `generated receipt artifact ${index}.catalogSnapshot.sha256`),
        semanticIdentitySha256: hex(string(catalog.semanticIdentitySha256, `generated receipt artifact ${index}.catalogSnapshot.semanticIdentitySha256`), `generated receipt artifact ${index}.catalogSnapshot.semanticIdentitySha256`),
      },
      htmlMember: {
        path: string(html.path, `generated receipt artifact ${index}.htmlMember.path`),
        bytes: positiveInteger(html.bytes, `generated receipt artifact ${index}.htmlMember.bytes`),
        sha256: hex(string(html.sha256, `generated receipt artifact ${index}.htmlMember.sha256`), `generated receipt artifact ${index}.htmlMember.sha256`),
      },
      unrestrictedUseNotice: parseLocalEvidence(entry.unrestrictedUseNotice, `generated receipt artifact ${index}.unrestrictedUseNotice`),
      electronicEditionProvenance: parseLocalEvidence(entry.electronicEditionProvenance, `generated receipt artifact ${index}.electronicEditionProvenance`),
    };
  });
  if (artifacts.length !== lock.artifacts.length || artifacts.some((artifact, index) => artifact.ebookId !== lock.artifacts[index]!.ebookId)) fail('generated receipt topology drifted');
  const receipt: AquinasGutenbergGeneratedReceipt = {
    schemaVersion: AQUINAS_GUTENBERG_GENERATED_RECEIPT_VERSION,
    sourceLockSha256: pins.sourceLockSha256,
    reviewedReceiptSha256: pins.reviewedReceiptSha256,
    catalogIdentityLockSha256: pins.catalogIdentityLockSha256,
    acquiredAt,
    artifacts,
  };
  for (const [index, artifact] of lock.artifacts.entries()) {
    const entry = receipt.artifacts[index]!;
    const paths = evidencePaths(artifact);
    if (entry.archive.path !== artifact.archive.localPath || entry.archive.bytes !== artifact.archive.bytes || entry.archive.sha256 !== artifact.archive.sha256
      || entry.catalogSnapshot.path !== artifact.catalogSnapshot.localPath || entry.catalogSnapshot.semanticIdentitySha256 !== catalogSemanticIdentityDigest(catalogLock.artifacts[index]!)
      || entry.htmlMember.path !== artifact.htmlMember.path || entry.htmlMember.bytes !== artifact.htmlMember.bytes || entry.htmlMember.sha256 !== artifact.htmlMember.sha256
      || entry.unrestrictedUseNotice.path !== paths.unrestrictedUseNotice || entry.electronicEditionProvenance.path !== paths.electronicEditionProvenance) fail(`generated receipt artifact ${artifact.ebookId} drifted from reviewed locks`);
  }
  return receipt;
}

function readReviewedReceipt(cwd: string, lock: AquinasGutenbergSourceLock, pins: AquinasGutenbergReviewedPins): AquinasGutenbergReceipt {
  const path = resolve(cwd, AQUINAS_GUTENBERG_RECEIPT_PATH);
  if (!existsSync(path)) fail('reviewed acquisition receipt is missing');
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) fail('reviewed acquisition receipt is not a safe regular file');
  const bytes = readFileSync(path);
  if (sha256(bytes) !== pins.reviewedReceiptSha256) fail('reviewed acquisition receipt byte identity drifted');
  const receipt = parseReceipt(JSON.parse(strictUtf8(bytes, 'reviewed acquisition receipt')), lock, pins);
  assertReceiptMatchesLock(receipt, lock);
  return receipt;
}

function assertCandidatesMatchReviewedReceipt(candidates: readonly Candidate[], generated: AquinasGutenbergGeneratedReceipt, reviewed: AquinasGutenbergReceipt): void {
  for (const [index, candidate] of candidates.entries()) {
    const expected = reviewed.artifacts[index]!;
    const observed = generated.artifacts[index]!;
    if (candidate.artifact.ebookId !== expected.ebookId || observed.archive.bytes !== expected.archive.bytes || observed.archive.sha256 !== expected.archive.sha256
      || observed.htmlMember.bytes !== expected.htmlMember.bytes || observed.htmlMember.sha256 !== expected.htmlMember.sha256
      || observed.unrestrictedUseNotice.bytes !== expected.unrestrictedUseNotice.bytes || observed.unrestrictedUseNotice.sha256 !== expected.unrestrictedUseNotice.sha256
      || observed.electronicEditionProvenance.bytes !== expected.electronicEditionProvenance.bytes || observed.electronicEditionProvenance.sha256 !== expected.electronicEditionProvenance.sha256) {
      fail(`eBook ${candidate.artifact.ebookId} candidate identity drifted from reviewed receipt`);
    }
  }
}

function authenticatedInputs(cwd: string, pins: AquinasGutenbergReviewedPins): Readonly<{ lock: AquinasGutenbergSourceLock; catalogLock: AquinasGutenbergCatalogIdentityLock; reviewed: AquinasGutenbergReceipt }> {
  const lock = readAquinasGutenbergSourceLock(cwd, pins);
  const catalogLock = readAquinasGutenbergCatalogIdentityLock(cwd, pins);
  const reviewed = readReviewedReceipt(cwd, lock, pins);
  return { lock, catalogLock, reviewed };
}

export async function preflightAquinasGutenbergAcquisition(cwd = ROOT, fetchImpl: FetchLike = fetch, pins: AquinasGutenbergReviewedPins = defaultReviewedPins()): Promise<AquinasGutenbergSourceLock> {
  const { lock, catalogLock, reviewed } = authenticatedInputs(cwd, pins);
  const candidates = await Promise.all(lock.artifacts.map((artifact, index) => downloadAndValidate(lock, catalogLock, artifact, index, fetchImpl)));
  const generated = parseGeneratedReceipt(JSON.parse(receiptBytes(makeGeneratedReceipt(candidates, pins)).toString('utf8')), lock, catalogLock, pins);
  assertCandidatesMatchReviewedReceipt(candidates, generated, reviewed);
  return lock;
}

export async function acquireAquinasGutenberg(cwd = ROOT, fetchImpl: FetchLike = fetch, pins: AquinasGutenbergReviewedPins = defaultReviewedPins()): Promise<AquinasGutenbergGeneratedReceipt> {
  const { lock, catalogLock, reviewed } = authenticatedInputs(cwd, pins);
  assertAcquisitionDestinationsEmpty(cwd, lock);
  // Validate every remote byte in memory before the first local write.
  const candidates = await Promise.all(lock.artifacts.map((artifact, index) => downloadAndValidate(lock, catalogLock, artifact, index, fetchImpl)));
  const receipt = parseGeneratedReceipt(JSON.parse(receiptBytes(makeGeneratedReceipt(candidates, pins)).toString('utf8')), lock, catalogLock, pins);
  assertCandidatesMatchReviewedReceipt(candidates, receipt, reviewed);
  for (const candidate of candidates) {
    const { artifact, archive, catalog, evidence } = candidate;
    writeNoClobber(relativeToLocal(cwd, artifact.archive.localPath), archive, localRoot(cwd), `eBook ${artifact.ebookId} archive`);
    writeNoClobber(relativeToLocal(cwd, artifact.catalogSnapshot.localPath), catalog, localRoot(cwd), `eBook ${artifact.ebookId} catalog snapshot`);
    const paths = evidencePaths(artifact);
    writeNoClobber(relativeToLocal(cwd, paths.unrestrictedUseNotice), evidence.unrestrictedUseNotice, localRoot(cwd), `eBook ${artifact.ebookId} unrestricted-use evidence`);
    writeNoClobber(relativeToLocal(cwd, paths.electronicEditionProvenance), evidence.electronicEditionProvenance, localRoot(cwd), `eBook ${artifact.ebookId} provenance evidence`);
  }
  writeReceiptNoClobber(cwd, receipt);
  return verifyLocalAquinasGutenbergAcquisition(cwd, pins) as AquinasGutenbergGeneratedReceipt;
}

export function verifyLocalAquinasGutenbergAcquisition(cwd = ROOT, pins: AquinasGutenbergReviewedPins = defaultReviewedPins()): AquinasGutenbergReceipt | AquinasGutenbergGeneratedReceipt {
  const { lock, catalogLock, reviewed } = authenticatedInputs(cwd, pins);
  const generatedReceiptPath = relativeToLocal(cwd, AQUINAS_GUTENBERG_GENERATED_RECEIPT_LOCAL_PATH);
  let receipt: AquinasGutenbergReceipt | AquinasGutenbergGeneratedReceipt = reviewed;
  if (existsSync(generatedReceiptPath)) {
    const receiptStat = lstatSync(generatedReceiptPath);
    if (receiptStat.isSymbolicLink() || !receiptStat.isFile()) fail('generated acquisition receipt is not a safe regular file');
    receipt = parseGeneratedReceipt(JSON.parse(strictUtf8(readFileSync(generatedReceiptPath), 'generated acquisition receipt')), lock, catalogLock, pins);
  }
  for (const [index, artifact] of lock.artifacts.entries()) {
    const entry = receipt.artifacts[index]!;
    assertLocalEvidence(cwd, entry.archive, `eBook ${artifact.ebookId} archive`);
    assertLocalEvidence(cwd, entry.catalogSnapshot, `eBook ${artifact.ebookId} catalog snapshot`);
    assertLocalEvidence(cwd, entry.unrestrictedUseNotice, `eBook ${artifact.ebookId} unrestricted-use evidence`);
    assertLocalEvidence(cwd, entry.electronicEditionProvenance, `eBook ${artifact.ebookId} provenance evidence`);
    const archive = readFileSync(relativeToLocal(cwd, artifact.archive.localPath));
    const html = extractAndVerifyLockedHtml(artifact, archive);
    const catalog = readFileSync(relativeToLocal(cwd, artifact.catalogSnapshot.localPath));
    extractAndVerifyCatalogSemanticIdentity(artifact, catalogLock.artifacts[index]!, catalog, lock);
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
