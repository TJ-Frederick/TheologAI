#!/usr/bin/env tsx

/**
 * Decision-neutral, local-only capacity comparison for the inactive Aquinas
 * Gutenberg package. The CLI builds a fresh current-checkout baseline beneath
 * OS temporary storage and never writes a checked-in corpus artifact.
 */

import Database from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeD1CorpusIdentity, parseDataManifest } from './d1-corpus-identity.js';
import {
  buildApprovedAquinasHierarchy,
  assertHistoricalHierarchyStoredIntegrity,
  assertNormalAquinasHierarchyExclusion,
  materializeHistoricalHierarchy,
  type HistoricalEditionHierarchyMaterialization,
  type HistoricalHierarchyMaterializationCounts,
} from './historical-hierarchy.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIRECTORY = 'data/historical-sources/project-gutenberg/aquinas-english-dominican/packages/aquinas-summa-pg-v1';
const CAPACITY_LIMIT_BYTES = 350 * 1024 * 1024;
const PACKAGE_HASH_DOMAIN = 'sectioned-edition-collection-package.bytes.v1:';
const BASELINE_BUILD_SCRIPT = 'scripts/build-database.ts';
const BASELINE_VERIFY_SCRIPT = 'scripts/verify-database.ts';
const A_PACK_ID = 'aquinas-summa-pg-v1';
const A_REVISION = 'local-only-capacity-comparison-v2';
const A_SCHEMA_VERSION = 'aquinas-source-pack-capacity-comparison.v2';

export const AQUINAS_CAPACITY_EXPECTED = Object.freeze({
  identity: {
    availability: 'local_only_inactive',
    collectionId: 'aquinas-summa-pg-v1',
    contentFormat: 'plain_text',
    editionId: 'aquinas-summa-english-dominican-gutenberg-electronic',
    workId: 'thomas-aquinas-summa-theologiae',
  },
  manifestSha256: 'b9d25c13ec6e59312ff8ecbf8d630a1875b8b253baac0d816cc9b9daf9618215',
  aggregateSha256: '76be93e0af83df8e46bbc84aadee07d8c27f2324b024b7338a44cf922e5507fa',
  orderedQuestionKeysSha256: '1c3cfe11af52a7e29a09aae6ce64e854eac18bc96e5b05c55f8200e407022049',
  orderedArticleKeysSha256: '6cfcf13360da2d30464ab48268c71b4d1b8408d7971ba497b41ddcce30ed79bd',
  sourceLockSha256: 'c5cfdd1edd132bf59968cbabe4c7de2180c42d205735ca6c06aec626104a180b',
  localReceiptSha256: 'bc0dab9ce5dc3672ccf2a81182655c75eaf6ef4f280584a40e079bf82a11719d',
  topologyLockSha256: 'ce6197ba036ec7200f43513f9e6676ccfd5cb5a4727077a440770416bdf6978b',
  discrepancyLedgerSha256: 'c8e10cbf29d710b89fe48aa91d18f25489c96039116e53254d0592dfb0b68120',
  shardIds: [
    'aquinas-summa-pg-v1.prima.shard-0001',
    'aquinas-summa-pg-v1.prima-secundae.shard-0001',
    'aquinas-summa-pg-v1.secunda-secundae.shard-0001',
    'aquinas-summa-pg-v1.secunda-secundae.shard-0002',
    'aquinas-summa-pg-v1.tertia.shard-0001',
  ],
  shardPackageHashes: [
    '80da511c2e70f6fcd7873b06d171d4504f99c63bce31cd70c59cdc612f7608a1',
    'd80369a0bfaf5d9a642eff09c2bf0270945427fee3f3da77a47116a353bd7c91',
    'cd1a448398b20defcb7adb5063f4a8860b543a7ef25e226e9fc8d7f1a1536ce9',
    'ab0429b97bcb3803a3921512f8df55ec87bb71ec66088aac203cb85932b0242a',
    'b1c054296554540ee64167c2ec881d13777c192c9e5eea060a19ea8aad10af9b',
  ],
  shards: 5,
  questions: 512,
  articles: 2669,
  preambles: 512,
  prologues: 3,
  authorityBodies: 3184,
  navigationNodes: 3185,
  partLandings: 4,
} as const);

export type AquinasBodyKind = 'part_prologue' | 'preamble' | 'article';

export interface AquinasAuthorityBody {
  bodyId: string;
  kind: AquinasBodyKind;
  partKey: string;
  questionKey: string | null;
  articleKey: string | null;
  sourceOrdinal: number;
  content: string;
}

export interface AquinasConservationEntry {
  bodyId: string;
  sha256: string;
  utf8Bytes: number;
  startByte: number;
  endByte: number;
  sourceOrdinal: number;
}

export interface AquinasQuestionBody {
  bodyId: string;
  questionKey: string;
  partKey: string;
  sourceOrdinal: number;
  /** Plain normalized text only: prologue (when present), preamble, articles. */
  content: string;
  /** Content-free child conservation evidence for the plain body. */
  conservation: AquinasConservationEntry[];
}

export interface AquinasNavigationNode {
  nodeId: string;
  parentId: string | null;
  kind: 'part' | 'question' | 'article';
  /** Part nodes point to an optional prologue; question/article nodes point to their body. */
  bodyId: string | null;
  partKey: string;
  questionKey: string | null;
  articleKey: string | null;
  flatOrdinal: number;
  siblingOrdinal: number;
}

interface AquinasQuestionInput {
  questionKey: string;
  partKey: string;
  partPrologue: AquinasAuthorityBody | null;
  preamble: AquinasAuthorityBody;
  articles: AquinasAuthorityBody[];
}

export interface AquinasCapacityInput {
  identity: Readonly<typeof AQUINAS_CAPACITY_EXPECTED.identity>;
  packageDirectory: string;
  sourceHashes: {
    manifestSha256: string;
    aggregateSha256: string;
    orderedQuestionKeysSha256: string;
    orderedArticleKeysSha256: string;
    sourceLockSha256: string;
    localReceiptSha256: string;
    topologyLockSha256: string;
    discrepancyLedgerSha256: string;
    packageSha256s: string[];
  };
  sourceArtifacts: AquinasSourceArtifact[];
  questions: AquinasQuestionInput[];
  authorityBodies: AquinasAuthorityBody[];
}

/**
 * Build-time consumers use the manifest-bound source registry instead of
 * bypassing it with direct filesystem reads.  The capacity CLI keeps its
 * existing local-filesystem behaviour when no reader is supplied.
 */
export interface AquinasPackageReader {
  read(path: string): Buffer;
}

export interface AquinasSourceArtifact {
  artifactId: string;
  ebookId: number;
  partKey: string;
  locator: string;
  sha256: string;
  bytes: number;
  acquiredAt: string;
  htmlMemberSha256: string;
  htmlMemberBytes: number;
}

export interface CandidateALayout {
  questionBodies: AquinasQuestionBody[];
  reconstructedAuthorityBodies: AquinasAuthorityBody[];
}

export interface CandidateBLayout {
  authorityBodies: AquinasAuthorityBody[];
  navigationNodes: AquinasNavigationNode[];
}

export interface DatabaseMeasure {
  fileBytes: number;
  pageSize: number;
  pageCount: number;
  pageCountBytes: number;
  freelistPages: number;
  dbstat: Array<{ name: string; pages: number; bytes: number }>;
  integrityCheck: 'ok';
  foreignKeyViolations: 0;
  /** Every physical FTS content-shadow table discovered from sqlite_master. */
  ftsContentShadowTables: string[];
}

export interface CapacityGate {
  basis: 'direct_pre_vacuum_full_copy_after_analyze';
  finalBytes: number;
  limitBytes: number;
  withinLimit: boolean;
}

export interface AquinasBaselineBuilderContext {
  root: string;
  outputPath: string;
}

export interface AquinasCapacityRunOptions {
  /** Test-only injection. The public CLI always builds a fresh temporary baseline. */
  baselinePath?: string;
  /** Test-only injection. Receives an OS-temporary output path. */
  buildBaseline?: (context: AquinasBaselineBuilderContext) => void;
  /** Test-only escape hatch for a fixture baseline; the public CLI always verifies. */
  verifyBaseline?: boolean;
}

export interface AquinasCapacityComparisonReport {
  schemaVersion: 'aquinas-source-pack-capacity-comparison.v4';
  status: 'normal_release_baseline_with_standalone_aquinas_rehearsal';
  temporaryStorage: 'os-temp-disposed';
  source: {
    identity: Readonly<typeof AQUINAS_CAPACITY_EXPECTED.identity>;
    hashes: AquinasCapacityInput['sourceHashes'];
    counts: { shards: number; questions: number; articles: number; preambles: number; prologues: number; authorityBodies: number; navigationNodes: number };
  };
  baseline: {
    kind: 'normal_release_zero_hierarchy_baseline';
    builtFreshFromCurrentCheckout: boolean;
    sha256: string;
    corpusIdentity: string;
    preVacuum: DatabaseMeasure;
    postVacuumDiagnostic: DatabaseMeasure;
  };
  /**
   * The reviewed packet is materialized only in a disposable copy of the
   * normal release baseline. This is a capacity rehearsal, not a release
   * corpus identity or a runtime/publication activation.
   */
  standaloneAquinasRehearsal: {
    shape: 'generic edition-scoped hierarchy with external-content FTS';
    materialization: HistoricalHierarchyMaterializationCounts;
    storedIntegrityVerified: true;
    preVacuumFullCopy: DatabaseMeasure;
    postVacuumDiagnostic: DatabaseMeasure;
    capacityGate: CapacityGate;
  };
  capacityLimitBytes: number;
  capacityStatus: 'within_350_mib' | 'exceeds_350_mib';
  currentContractIncompatibilities: string[];
}

interface CandidateDiagnostics {
  isolatedProjection: { preVacuum: DatabaseMeasure; postVacuum: DatabaseMeasure };
  baselinePlusIsolatedEstimate: { baselineBytes: number; isolatedProjectionBytes: number; estimatedBytes: number };
}

interface CandidateAReport {
  shape: '512 plain normalized question bodies in the migrated historical/document/FTS/profile/identity projections';
  logicalHashes: { canonicalAuthorityBodies: string; reconstructedAuthorityBodies: string; questionBodies: string; physicalProjection: string };
  physicalProjectionCount: 4;
  sourceArtifactRows: 4;
  preVacuumFullCopy: DatabaseMeasure;
  postVacuumDiagnostic: DatabaseMeasure;
  capacityGate: CapacityGate;
  nonGatingDiagnostics: CandidateDiagnostics;
}

interface CandidateBReport {
  shape: '3184 authority bodies with implicit work root, 4 part landings, 512 question landings, 2669 article nodes, and external-content FTS';
  logicalHashes: { canonicalAuthorityBodies: string; storedAuthorityBodies: string; flatNavigation: string; hierarchicalNavigation: string };
  externalContentFtsHasNoBodyBearingContentCopy: true;
  fts: {
    integrityCheck: 'ok';
    representativeMatch: { querySha256: string; matchCount: number; rowIdParity: true };
    indexBytes: number;
    candidateContentShadowTables: [];
  };
  preVacuumFullCopy: DatabaseMeasure;
  postVacuumDiagnostic: DatabaseMeasure;
  capacityGate: CapacityGate;
  nonGatingDiagnostics: CandidateDiagnostics;
}

type UnknownRecord = Record<string, unknown>;

function fail(message: string): never { throw new Error(`[aquinas-source-pack-capacity] ${message}`); }
function sha256(value: Uint8Array | string): string { return createHash('sha256').update(value).digest('hex'); }
function hashRecords(values: Iterable<unknown>): string {
  const hash = createHash('sha256');
  for (const value of values) hash.update(`${JSON.stringify(value)}\n`);
  return hash.digest('hex');
}
function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as UnknownRecord;
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be non-empty text`);
  return value;
}
function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} must be a non-negative integer`);
  return value as number;
}
function equalJson(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }

function contentBody(
  value: unknown, bodyId: string, kind: AquinasBodyKind, partKey: string,
  questionKey: string | null, articleKey: string | null, sourceOrdinal: number,
): AquinasAuthorityBody {
  const raw = record(value, bodyId);
  const content = text(raw.content, `${bodyId}.content`);
  const output = record(raw.output, `${bodyId}.output`);
  if (sha256(content) !== text(output.sha256, `${bodyId}.output.sha256`)
    || Buffer.byteLength(content, 'utf8') !== integer(output.utf8Bytes, `${bodyId}.output.utf8Bytes`)) {
    fail(`${bodyId} output hash or UTF-8 byte count is stale`);
  }
  return { bodyId, kind, partKey, questionKey, articleKey, sourceOrdinal, content };
}

function authorityHash(bodies: readonly AquinasAuthorityBody[]): string {
  return hashRecords(bodies.map(body => ({
    bodyId: body.bodyId, kind: body.kind, partKey: body.partKey, questionKey: body.questionKey,
    articleKey: body.articleKey, sourceOrdinal: body.sourceOrdinal, content: body.content,
  })));
}

function loadAquinasSourceArtifacts(root: string, reader?: AquinasPackageReader): AquinasSourceArtifact[] {
  const acquisitionDirectory = 'data/historical-sources/project-gutenberg/aquinas-english-dominican';
  const read = (path: string) => reader ? reader.read(path) : readFileSync(join(root, path));
  const sourceLockBytes = read(`${acquisitionDirectory}/SOURCE_LOCK.json`);
  const receiptBytes = read(`${acquisitionDirectory}/LOCAL_ACQUISITION_RECEIPT.json`);
  if (sha256(sourceLockBytes) !== AQUINAS_CAPACITY_EXPECTED.sourceLockSha256) fail('source-lock SHA-256 differs from the reviewed acquisition');
  if (sha256(receiptBytes) !== AQUINAS_CAPACITY_EXPECTED.localReceiptSha256) fail('local-receipt SHA-256 differs from the reviewed acquisition');
  const sourceLock = record(JSON.parse(sourceLockBytes.toString('utf8')), 'source lock');
  const receipt = record(JSON.parse(receiptBytes.toString('utf8')), 'local receipt');
  const sourceArtifacts = sourceLock.artifacts;
  const receiptArtifacts = receipt.artifacts;
  if (receipt.sourceLockSha256 !== AQUINAS_CAPACITY_EXPECTED.sourceLockSha256
    || !Array.isArray(sourceArtifacts) || !Array.isArray(receiptArtifacts)
    || sourceArtifacts.length !== 4 || receiptArtifacts.length !== 4) {
    fail('source lock and receipt must retain the exact four-artifact acquisition');
  }
  const acquiredAt = text(receipt.acquiredAt, 'local receipt acquiredAt');
  return sourceArtifacts.map((artifactValue, index) => {
    const artifact = record(artifactValue, `source lock artifacts[${index}]`);
    const receiptArtifact = record(receiptArtifacts[index], `local receipt artifacts[${index}]`);
    const ebookId = integer(artifact.ebookId, `source lock artifacts[${index}].ebookId`);
    const partKey = text(artifact.partKey, `source lock artifacts[${index}].partKey`);
    const archive = record(artifact.archive, `source lock artifacts[${index}].archive`);
    const receiptArchive = record(receiptArtifact.archive, `local receipt artifacts[${index}].archive`);
    const htmlMember = record(artifact.htmlMember, `source lock artifacts[${index}].htmlMember`);
    const receiptHtmlMember = record(receiptArtifact.htmlMember, `local receipt artifacts[${index}].htmlMember`);
    const locator = text(archive.url, `source lock artifacts[${index}].archive.url`);
    const artifactSha256 = text(archive.sha256, `source lock artifacts[${index}].archive.sha256`);
    const bytes = integer(archive.bytes, `source lock artifacts[${index}].archive.bytes`);
    const htmlMemberSha256 = text(htmlMember.sha256, `source lock artifacts[${index}].htmlMember.sha256`);
    const htmlMemberBytes = integer(htmlMember.bytes, `source lock artifacts[${index}].htmlMember.bytes`);
    if (receiptArtifact.ebookId !== ebookId || receiptArchive.sha256 !== artifactSha256 || receiptArchive.bytes !== bytes
      || receiptHtmlMember.sha256 !== htmlMemberSha256 || receiptHtmlMember.bytes !== htmlMemberBytes
      || locator !== `https://www.gutenberg.org/cache/epub/${ebookId}/pg${ebookId}-h.zip`) {
      fail(`Gutenberg artifact ${ebookId} does not match its exact archive/receipt pins`);
    }
    return {
      artifactId: `pg-${ebookId}`, ebookId, partKey, locator, sha256: artifactSha256,
      bytes, acquiredAt, htmlMemberSha256, htmlMemberBytes,
    };
  });
}

/** Read and fully attest the checked-in inactive package without writing to it. */
export function loadAquinasCapacityInput(root = ROOT, reader?: AquinasPackageReader): AquinasCapacityInput {
  const packageDirectory = resolve(root, PACKAGE_DIRECTORY);
  const read = (path: string) => reader ? reader.read(path) : readFileSync(join(root, path));
  const sourceArtifacts = loadAquinasSourceArtifacts(root, reader);
  const manifestBytes = read(`${PACKAGE_DIRECTORY}/manifest.json`);
  const acquisitionDirectory = 'data/historical-sources/project-gutenberg/aquinas-english-dominican';
  const topologyLockBytes = read(`${acquisitionDirectory}/TOPOLOGY_LOCK.json`);
  const discrepancyLedgerBytes = read(`${acquisitionDirectory}/TOPOLOGY_DISCREPANCY_LEDGER.json`);
  if (sha256(topologyLockBytes) !== AQUINAS_CAPACITY_EXPECTED.topologyLockSha256
    || sha256(discrepancyLedgerBytes) !== AQUINAS_CAPACITY_EXPECTED.discrepancyLedgerSha256) {
    fail('topology lock or discrepancy ledger differs from the reviewed inactive package');
  }
  if (sha256(manifestBytes) !== AQUINAS_CAPACITY_EXPECTED.manifestSha256) fail('manifest SHA-256 differs from the reviewed inactive package');
  const manifest = record(JSON.parse(manifestBytes.toString('utf8')), 'manifest');
  if (!equalJson(manifest.identity, AQUINAS_CAPACITY_EXPECTED.identity)
    || manifest.aggregateSha256 !== AQUINAS_CAPACITY_EXPECTED.aggregateSha256
    || manifest.orderedQuestionKeysSha256 !== AQUINAS_CAPACITY_EXPECTED.orderedQuestionKeysSha256
    || manifest.orderedArticleKeysSha256 !== AQUINAS_CAPACITY_EXPECTED.orderedArticleKeysSha256
    || manifest.topologyLockSha256 !== AQUINAS_CAPACITY_EXPECTED.topologyLockSha256
    || manifest.discrepancyLedgerSha256 !== AQUINAS_CAPACITY_EXPECTED.discrepancyLedgerSha256) {
    fail('inactive identity or manifest hash attestation differs from the reviewed package');
  }
  if (!Array.isArray(manifest.shards) || manifest.shards.length !== AQUINAS_CAPACITY_EXPECTED.shards) fail('manifest must retain exactly five ordered shards');

  const questions: AquinasQuestionInput[] = [];
  const authorityBodies: AquinasAuthorityBody[] = [];
  const packageSha256s: string[] = [];
  let sourceOrdinal = 0;
  for (const [index, descriptorValue] of manifest.shards.entries()) {
    const descriptor = record(descriptorValue, `manifest.shards[${index}]`);
    const shardId = text(descriptor.shardId, `manifest.shards[${index}].shardId`);
    if (shardId !== AQUINAS_CAPACITY_EXPECTED.shardIds[index]
      || descriptor.canonicalPackageSha256 !== AQUINAS_CAPACITY_EXPECTED.shardPackageHashes[index]) {
      fail(`manifest shard ${index + 1} differs from the reviewed order or package hash`);
    }
    const packageBytes = read(`${PACKAGE_DIRECTORY}/${shardId}.json`);
    const packageHash = sha256(`${PACKAGE_HASH_DOMAIN}${packageBytes.toString('utf8')}`);
    if (packageHash !== descriptor.canonicalPackageSha256) fail(`${shardId} canonical package hash is stale`);
    packageSha256s.push(packageHash);
    const shardPackage = record(JSON.parse(packageBytes.toString('utf8')), shardId);
    if (!equalJson(shardPackage.identity, AQUINAS_CAPACITY_EXPECTED.identity)
      || shardPackage.sourceLockSha256 !== AQUINAS_CAPACITY_EXPECTED.sourceLockSha256
      || shardPackage.localReceiptSha256 !== AQUINAS_CAPACITY_EXPECTED.localReceiptSha256
      || shardPackage.topologyLockSha256 !== AQUINAS_CAPACITY_EXPECTED.topologyLockSha256
      || shardPackage.discrepancyLedgerSha256 !== AQUINAS_CAPACITY_EXPECTED.discrepancyLedgerSha256) {
      fail(`${shardId} does not retain the reviewed inactive locks`);
    }
    if (!Array.isArray(shardPackage.sourceArtifacts) || shardPackage.sourceArtifacts.length !== sourceArtifacts.length) {
      fail(`${shardId} does not retain all four underlying Gutenberg artifacts`);
    }
    for (const [artifactIndex, artifactValue] of shardPackage.sourceArtifacts.entries()) {
      const artifact = record(artifactValue, `${shardId}.sourceArtifacts[${artifactIndex}]`);
      const expectedArtifact = sourceArtifacts[artifactIndex]!;
      if (artifact.artifactId !== expectedArtifact.artifactId || artifact.partKey !== expectedArtifact.partKey
        || artifact.htmlMemberSha256 !== expectedArtifact.htmlMemberSha256
        || artifact.htmlMemberBytes !== expectedArtifact.htmlMemberBytes) {
        fail(`${shardId} Gutenberg artifact projection ${artifactIndex + 1} drifted from the reviewed source lock`);
      }
    }
    const shard = record(shardPackage.shard, `${shardId}.shard`);
    const partKey = text(shard.partKey, `${shardId}.shard.partKey`);
    if (shard.shardId !== shardId || shard.ordinal !== descriptor.ordinal || shard.partKey !== descriptor.partKey
      || !equalJson(shard.questionKeys, descriptor.questionKeys)) fail(`${shardId} descriptor and package order differ`);
    if (!Array.isArray(shardPackage.questions) || !Array.isArray(shard.questionKeys)
      || shardPackage.questions.length !== shard.questionKeys.length) fail(`${shardId} questions are incomplete`);

    let partPrologue: AquinasAuthorityBody | null = null;
    if (shardPackage.partPrologue !== null) {
      partPrologue = contentBody(shardPackage.partPrologue, `prologue:${partKey}`, 'part_prologue', partKey, null, null, ++sourceOrdinal);
      authorityBodies.push(partPrologue);
    }
    for (const [questionIndex, questionValue] of shardPackage.questions.entries()) {
      const question = record(questionValue, `${shardId}.questions[${questionIndex}]`);
      const questionKey = text(question.questionKey, `${shardId}.questions[${questionIndex}].questionKey`);
      if (questionKey !== shard.questionKeys[questionIndex] || question.partKey !== partKey) fail(`${shardId} question ${questionIndex + 1} violates the reviewed order`);
      const preamble = contentBody(question.preamble, `preamble:${questionKey}`, 'preamble', partKey, questionKey, null, ++sourceOrdinal);
      if (!Array.isArray(question.articles) || question.articles.length !== integer(question.articleCount, `${questionKey}.articleCount`)) {
        fail(`${questionKey} article inventory is incomplete`);
      }
      const articles = question.articles.map((articleValue, articleIndex) => {
        const article = record(articleValue, `${questionKey}.articles[${articleIndex}]`);
        const articleKey = text(article.articleKey, `${questionKey}.articles[${articleIndex}].articleKey`);
        if (article.ordinal !== articleIndex + 1) fail(`${articleKey} article order is not contiguous`);
        return contentBody(article, articleKey, 'article', partKey, questionKey, articleKey, ++sourceOrdinal);
      });
      questions.push({ questionKey, partKey, partPrologue: questionIndex === 0 ? partPrologue : null, preamble, articles });
      authorityBodies.push(preamble, ...articles);
    }
  }
  const counts = {
    questions: questions.length,
    articles: authorityBodies.filter(body => body.kind === 'article').length,
    preambles: authorityBodies.filter(body => body.kind === 'preamble').length,
    prologues: authorityBodies.filter(body => body.kind === 'part_prologue').length,
  };
  if (counts.questions !== AQUINAS_CAPACITY_EXPECTED.questions || counts.articles !== AQUINAS_CAPACITY_EXPECTED.articles
    || counts.preambles !== AQUINAS_CAPACITY_EXPECTED.preambles || counts.prologues !== AQUINAS_CAPACITY_EXPECTED.prologues
    || authorityBodies.length !== AQUINAS_CAPACITY_EXPECTED.authorityBodies) fail('Aquinas child inventory differs from the reviewed 512/2669/512/3 topology');
  return {
    identity: AQUINAS_CAPACITY_EXPECTED.identity,
    packageDirectory,
    sourceHashes: {
      manifestSha256: AQUINAS_CAPACITY_EXPECTED.manifestSha256,
      aggregateSha256: AQUINAS_CAPACITY_EXPECTED.aggregateSha256,
      orderedQuestionKeysSha256: AQUINAS_CAPACITY_EXPECTED.orderedQuestionKeysSha256,
      orderedArticleKeysSha256: AQUINAS_CAPACITY_EXPECTED.orderedArticleKeysSha256,
      sourceLockSha256: AQUINAS_CAPACITY_EXPECTED.sourceLockSha256,
      localReceiptSha256: AQUINAS_CAPACITY_EXPECTED.localReceiptSha256,
      topologyLockSha256: AQUINAS_CAPACITY_EXPECTED.topologyLockSha256,
      discrepancyLedgerSha256: AQUINAS_CAPACITY_EXPECTED.discrepancyLedgerSha256,
      packageSha256s,
    },
    sourceArtifacts,
    questions,
    authorityBodies,
  };
}

function conservationEntry(body: AquinasAuthorityBody, startByte: number): AquinasConservationEntry {
  const utf8Bytes = Buffer.byteLength(body.content, 'utf8');
  return { bodyId: body.bodyId, sha256: sha256(body.content), utf8Bytes, startByte, endByte: startByte + utf8Bytes, sourceOrdinal: body.sourceOrdinal };
}

/** Candidate A: exactly one plain normalized text body per question. */
export function buildCandidateA(input: AquinasCapacityInput): CandidateALayout {
  const questionBodies = input.questions.map((question, index) => {
    const children = [...(question.partPrologue === null ? [] : [question.partPrologue]), question.preamble, ...question.articles];
    let cursor = 0;
    const conservation = children.map((child, childIndex) => {
      if (childIndex > 0) cursor += 2; // UTF-8 bytes in the exact "\n\n" separator.
      const entry = conservationEntry(child, cursor);
      cursor = entry.endByte;
      return entry;
    });
    return {
      bodyId: `question-body:${question.questionKey}`,
      questionKey: question.questionKey,
      partKey: question.partKey,
      sourceOrdinal: index + 1,
      content: children.map(child => child.content).join('\n\n'),
      conservation,
    };
  });
  if (questionBodies.length !== AQUINAS_CAPACITY_EXPECTED.questions) fail('candidate A must retain exactly 512 question bodies');
  const reconstructedAuthorityBodies = reconstructCandidateAChildren(questionBodies);
  if (authorityHash(reconstructedAuthorityBodies) !== authorityHash(input.authorityBodies)) fail('candidate A does not conserve every Aquinas child exactly once');
  return { questionBodies, reconstructedAuthorityBodies };
}

function bodyMetadataFromId(bodyId: string, sourceOrdinal: number): Omit<AquinasAuthorityBody, 'content'> {
  if (bodyId.startsWith('prologue:')) return { bodyId, kind: 'part_prologue', partKey: bodyId.slice('prologue:'.length), questionKey: null, articleKey: null, sourceOrdinal };
  if (bodyId.startsWith('preamble:')) {
    const questionKey = bodyId.slice('preamble:'.length);
    return { bodyId, kind: 'preamble', partKey: questionKey.split('.')[0]!, questionKey, articleKey: null, sourceOrdinal };
  }
  const [partKey, questionNumber] = bodyId.split('.');
  if (!partKey || !questionNumber || !/\.a\d+$/.test(bodyId)) fail(`unknown conservation body id: ${bodyId}`);
  return { bodyId, kind: 'article', partKey, questionKey: `${partKey}.${questionNumber}`, articleKey: bodyId, sourceOrdinal };
}

/** Recover the exact source children using only plain body text and its content-free conservation vector. */
export function reconstructCandidateAChildren(questionBodies: readonly AquinasQuestionBody[]): AquinasAuthorityBody[] {
  const result: AquinasAuthorityBody[] = [];
  for (const body of questionBodies) {
    const bytes = Buffer.from(body.content, 'utf8');
    let priorEnd = 0;
    for (const [index, entry] of body.conservation.entries()) {
      if (entry.startByte !== priorEnd + (index === 0 ? 0 : 2) || entry.endByte - entry.startByte !== entry.utf8Bytes) {
        fail(`${body.bodyId} conservation offsets are not contiguous`);
      }
      if (index > 0 && bytes.subarray(priorEnd, entry.startByte).toString('utf8') !== '\n\n') fail(`${body.bodyId} conservation separator drifted`);
      const content = bytes.subarray(entry.startByte, entry.endByte).toString('utf8');
      if (Buffer.byteLength(content, 'utf8') !== entry.utf8Bytes || sha256(content) !== entry.sha256) fail(`${body.bodyId} conservation hash or byte length drifted`);
      result.push({ ...bodyMetadataFromId(entry.bodyId, entry.sourceOrdinal), content });
      priorEnd = entry.endByte;
    }
    if (priorEnd !== bytes.length) fail(`${body.bodyId} conservation vector does not cover the full plain body`);
  }
  return result;
}

/** Candidate B: implicit work root; 4 part landings, 512 question landings, then article leaves. */
export function buildCandidateB(input: AquinasCapacityInput): CandidateBLayout {
  const byPart = new Map<string, AquinasQuestionInput[]>();
  for (const question of input.questions) {
    const group = byPart.get(question.partKey) ?? [];
    group.push(question); byPart.set(question.partKey, group);
  }
  const nodes: AquinasNavigationNode[] = [];
  let flatOrdinal = 0;
  for (const [partIndex, [partKey, questions]] of [...byPart.entries()].entries()) {
    const prologue = questions.find(question => question.partPrologue !== null)?.partPrologue ?? null;
    nodes.push({
      nodeId: `part:${partKey}`, parentId: null, kind: 'part', bodyId: prologue?.bodyId ?? null,
      partKey, questionKey: null, articleKey: null, flatOrdinal: ++flatOrdinal, siblingOrdinal: partIndex + 1,
    });
    for (const [questionIndex, question] of questions.entries()) {
      nodes.push({
        nodeId: `question:${question.questionKey}`, parentId: `part:${partKey}`, kind: 'question', bodyId: question.preamble.bodyId,
        partKey, questionKey: question.questionKey, articleKey: null, flatOrdinal: ++flatOrdinal, siblingOrdinal: questionIndex + 1,
      });
      for (const [articleIndex, article] of question.articles.entries()) {
        nodes.push({
          nodeId: `article:${article.articleKey}`, parentId: `question:${question.questionKey}`, kind: 'article', bodyId: article.bodyId,
          partKey, questionKey: question.questionKey, articleKey: article.articleKey, flatOrdinal: ++flatOrdinal, siblingOrdinal: articleIndex + 1,
        });
      }
    }
  }
  assertCandidateBTopology(nodes, input.authorityBodies);
  assertCandidateBNavigationEquivalence(nodes);
  return { authorityBodies: [...input.authorityBodies], navigationNodes: nodes };
}

/**
 * Load an exact packet and inject its verified facts into the generic hierarchy
 * materializer. The dependency direction intentionally remains capacity →
 * hierarchy; the hierarchy module imports these types only.
 */
export function loadApprovedAquinasHierarchy(
  reader: AquinasPackageReader,
): HistoricalEditionHierarchyMaterialization {
  const input = loadAquinasCapacityInput(undefined, reader);
  return buildApprovedAquinasHierarchy(reader, input, buildCandidateB(input));
}

function navigationIdentity(node: AquinasNavigationNode): Omit<AquinasNavigationNode, 'flatOrdinal'> {
  const { flatOrdinal: _flatOrdinal, ...identity } = node;
  return identity;
}

function orderedHierarchy(nodes: readonly AquinasNavigationNode[]): AquinasNavigationNode[] {
  if (new Set(nodes.map(node => node.nodeId)).size !== nodes.length) fail('candidate B navigation contains duplicate node IDs');
  const ids = new Set(nodes.map(node => node.nodeId));
  if (nodes.some(node => node.parentId !== null && !ids.has(node.parentId))) fail('candidate B navigation contains a missing parent');
  const byParent = new Map<string | null, AquinasNavigationNode[]>();
  for (const node of nodes) {
    const group = byParent.get(node.parentId) ?? [];
    group.push(node); byParent.set(node.parentId, group);
  }
  for (const group of byParent.values()) {
    group.sort((left, right) => left.siblingOrdinal - right.siblingOrdinal);
    if (group.some((node, index) => node.siblingOrdinal !== index + 1)) {
      fail('candidate B navigation sibling ordinals are not locally contiguous');
    }
  }
  const result: AquinasNavigationNode[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null): void => {
    for (const node of byParent.get(parentId) ?? []) {
      if (visited.has(node.nodeId)) fail('candidate B navigation contains a cycle');
      visited.add(node.nodeId); result.push(node); visit(node.nodeId);
    }
  };
  visit(null);
  if (result.length !== nodes.length) fail('candidate B hierarchy does not visit every node exactly once');
  return result;
}

/** Hash the stored flat preorder and the independently traversed ordered hierarchy. */
export function candidateBNavigationIdentityHashes(nodes: readonly AquinasNavigationNode[]): { flat: string; hierarchical: string } {
  const expectedFlat = nodes.map(navigationIdentity);
  const hierarchical = orderedHierarchy(nodes).map(navigationIdentity);
  return { flat: hashRecords(expectedFlat), hierarchical: hashRecords(hierarchical) };
}

/** Prove exact ordered preorder traversal, not only a sorted set of node identities. */
export function assertCandidateBNavigationEquivalence(nodes: readonly AquinasNavigationNode[]): void {
  if (nodes.some((node, index) => node.flatOrdinal !== index + 1)) fail('candidate B flat navigation is not an exact contiguous preorder');
  const hashes = candidateBNavigationIdentityHashes(nodes);
  if (hashes.flat !== hashes.hierarchical) fail('candidate B flat preorder and ordered hierarchical traversal differ');
}

function assertCandidateBTopology(nodes: readonly AquinasNavigationNode[], authorityBodies: readonly AquinasAuthorityBody[]): void {
  const parts = nodes.filter(node => node.kind === 'part');
  const questions = nodes.filter(node => node.kind === 'question');
  const articles = nodes.filter(node => node.kind === 'article');
  const bodyIds = nodes.map(node => node.bodyId).filter((bodyId): bodyId is string => bodyId !== null);
  if (nodes.length !== AQUINAS_CAPACITY_EXPECTED.navigationNodes || parts.length !== AQUINAS_CAPACITY_EXPECTED.partLandings
    || questions.length !== AQUINAS_CAPACITY_EXPECTED.questions || articles.length !== AQUINAS_CAPACITY_EXPECTED.articles
    || bodyIds.length !== AQUINAS_CAPACITY_EXPECTED.authorityBodies || new Set(bodyIds).size !== bodyIds.length
    || new Set(bodyIds).size !== authorityBodies.length) fail('candidate B is not the exact implicit-root 4/512/2669 navigation topology');
  if (parts.some(node => node.parentId !== null) || questions.some(node => node.parentId !== `part:${node.partKey}`)
    || articles.some(node => node.parentId !== `question:${node.questionKey}`)) fail('candidate B navigation parentage drifted');
}

function pragmaInteger(database: Database.Database, sql: string): number {
  const row = database.prepare(sql).get() as Record<string, unknown> | undefined;
  const value = row === undefined ? undefined : Object.values(row)[0];
  if (!Number.isSafeInteger(value)) fail(`SQLite did not return an integer for ${sql}`);
  return value as number;
}

/** Discover physical FTS content copies from the schema itself, including unexpected ones. */
export function discoverFtsContentShadowTables(database: Database.Database): string[] {
  return (database.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name LIKE '%_fts_content' ORDER BY name`).all() as Array<{ name: string }>).map(row => row.name);
}

export function additionalFtsContentShadowTables(baseline: readonly string[], measured: readonly string[]): string[] {
  const baselineSet = new Set(baseline);
  return measured.filter(name => !baselineSet.has(name));
}

export function assertNoAdditionalFtsContentShadowTables(baseline: readonly string[], measured: readonly string[]): void {
  const additional = additionalFtsContentShadowTables(baseline, measured);
  if (additional.length !== 0) fail(`candidate B external-content FTS retained body-bearing content copies: ${additional.join(', ')}`);
}

function databaseMeasure(database: Database.Database, path: string): DatabaseMeasure {
  const integrity = database.prepare('PRAGMA integrity_check').all() as Array<Record<string, unknown>>;
  if (integrity.length !== 1 || Object.values(integrity[0]!)[0] !== 'ok') fail('SQLite integrity_check failed');
  if (database.prepare('PRAGMA foreign_key_check').all().length !== 0) fail('SQLite foreign_key_check found violations');
  const pageSize = pragmaInteger(database, 'PRAGMA page_size');
  const pageCount = pragmaInteger(database, 'PRAGMA page_count');
  const freelistPages = pragmaInteger(database, 'PRAGMA freelist_count');
  const dbstat = database.prepare(`SELECT name, COUNT(*) AS pages, SUM(pgsize) AS bytes
    FROM dbstat GROUP BY name ORDER BY name`).all() as Array<{ name: string; pages: number; bytes: number }>;
  if (dbstat.length === 0 || dbstat.some(row => !Number.isSafeInteger(row.pages) || !Number.isSafeInteger(row.bytes))) fail('SQLite dbstat measurement is unavailable');
  const ftsContentShadowTables = discoverFtsContentShadowTables(database);
  const fileBytes = statSync(path).size;
  const pageCountBytes = pageSize * pageCount;
  if (fileBytes !== pageCountBytes) fail('SQLite file size differs from its page count');
  return { fileBytes, pageSize, pageCount, pageCountBytes, freelistPages, dbstat, integrityCheck: 'ok', foreignKeyViolations: 0, ftsContentShadowTables };
}

function vacuumDiagnostic(database: Database.Database, path: string): DatabaseMeasure {
  database.exec('VACUUM');
  return databaseMeasure(database, path);
}

function closeAfter<T>(database: Database.Database, operation: (database: Database.Database) => T): T {
  try { return operation(database); } finally { if (database.open) database.close(); }
}

function runCurrentCheckoutCommand(root: string, script: string, args: string[]): void {
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve(root, script), ...args], {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim().slice(-2000);
    fail(`${script} failed while building/verifying a disposable baseline${detail ? `: ${detail}` : ''}`);
  }
}

/** Build, compact, and normally verify a fresh baseline at an OS-temporary path. */
export function buildFreshAquinasCapacityBaseline({ root, outputPath }: AquinasBaselineBuilderContext): void {
  runCurrentCheckoutCommand(root, BASELINE_BUILD_SCRIPT, ['--output', outputPath]);
  // Transform 12 removes two content-bearing FTS shadow tables. With no
  // excluded packet present, their released pages would otherwise become
  // accidental headroom for the standalone comparison. Compact this disposable
  // baseline once so both sides start from a zero-freelist physical corpus.
  closeAfter(new Database(outputPath), database => database.exec('VACUUM'));
  runCurrentCheckoutCommand(root, BASELINE_VERIFY_SCRIPT, ['--database', outputPath]);
}

function expectedCorpusIdentity(root: string): string {
  return computeD1CorpusIdentity(parseDataManifest(readFileSync(join(root, 'data', 'data-manifest.json'))));
}

function attestBaseline(root: string, path: string): { sha256: string; corpusIdentity: string; preVacuum: DatabaseMeasure } {
  const corpusIdentity = expectedCorpusIdentity(root);
  const preVacuum = closeAfter(new Database(path, { readonly: true, fileMustExist: true }), database => {
    const stored = database.prepare("SELECT value FROM theologai_metadata WHERE key = 'corpus_manifest_sha256'").get() as { value?: unknown } | undefined;
    if (stored?.value !== corpusIdentity) fail('fresh baseline corpus identity does not match the current checkout');
    assertNormalAquinasHierarchyExclusion(database);
    return databaseMeasure(database, path);
  });
  return { sha256: sha256(readFileSync(path)), corpusIdentity, preVacuum };
}

function capacityGate(preVacuumFullCopy: DatabaseMeasure): CapacityGate {
  return {
    basis: 'direct_pre_vacuum_full_copy_after_analyze',
    finalBytes: preVacuumFullCopy.fileBytes,
    limitBytes: CAPACITY_LIMIT_BYTES,
    withinLimit: preVacuumFullCopy.fileBytes <= CAPACITY_LIMIT_BYTES,
  };
}

/**
 * Materialize the immutable Aquinas packet only after copying the verified
 * zero-row normal baseline. The resulting database is confined to OS temp and
 * disposed by the caller; it must never be treated as a normal release seed.
 */
function runStandaloneAquinasRehearsal(
  root: string,
  path: string,
): AquinasCapacityComparisonReport['standaloneAquinasRehearsal'] {
  return closeAfter(new Database(path), database => {
    database.pragma('foreign_keys = ON');
    // This disposable excluded-packet rehearsal starts from a sealed normal
    // release copy. Temporarily remove that singleton only inside the OS-temp
    // copy, add Aquinas, integrity-check its external FTS, then reseal it.
    database.prepare('DELETE FROM historical_corpus_seal WHERE seal_id = 1').run();
    const packet = loadApprovedAquinasHierarchy({
      read: relativePath => readFileSync(join(root, relativePath)),
    });
    const materialization = materializeHistoricalHierarchy(database, packet);
    database.exec(`
      INSERT INTO historical_edition_hierarchy_bodies_fts(
        historical_edition_hierarchy_bodies_fts, rank
      ) VALUES ('integrity-check', 1);
      INSERT INTO historical_corpus_seal(seal_id, transform_version, storage_contract)
      VALUES (1, 12, 'candidate_c_seed_base_rebuild_all_fts_integrity_check_then_seal_v1');
    `);
    const stored = assertHistoricalHierarchyStoredIntegrity(database, packet);
    if (JSON.stringify(stored) !== JSON.stringify(materialization)) {
      fail('standalone Aquinas rehearsal stored-integrity inventory drifted');
    }
    database.exec('ANALYZE');
    const preVacuumFullCopy = databaseMeasure(database, path);
    const postVacuumDiagnostic = vacuumDiagnostic(database, path);
    return {
      shape: 'generic edition-scoped hierarchy with external-content FTS',
      materialization,
      storedIntegrityVerified: true,
      preVacuumFullCopy,
      postVacuumDiagnostic,
      capacityGate: capacityGate(preVacuumFullCopy),
    };
  });
}

function questionProjectionHash(rows: Iterable<{ bodyId: string; content: string }>): string { return hashRecords(rows); }

function insertCandidateAIntoMigratedSchema(database: Database.Database, input: AquinasCapacityInput, layout: CandidateALayout): string {
  database.pragma('foreign_keys = ON');
  database.transaction(() => {
    database.prepare('INSERT INTO historical_source_packs (pack_id, revision, schema_version, manifest_sha256, source_path) VALUES (?, ?, ?, ?, ?)')
      .run(A_PACK_ID, A_REVISION, A_SCHEMA_VERSION, input.sourceHashes.manifestSha256, PACKAGE_DIRECTORY);
    database.prepare('INSERT INTO historical_works (work_id, title, creator_metadata_status, creators_json) VALUES (?, ?, ?, ?)')
      .run(input.identity.workId, 'Summa Theologiae', 'local_only_inactive', JSON.stringify([{ name: 'Thomas Aquinas', role: 'author' }]));
    database.prepare(`INSERT INTO historical_editions (
      edition_id, work_id, pack_id, language, contributor_groups_json, publication, version,
      provenance_status, provenance_uncertainty, provenance_reviewed_at, underlying_work_rights_json,
      exact_artifact_rights_json, normalized_text_rights_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.identity.editionId, input.identity.workId, A_PACK_ID, 'en', JSON.stringify({ translator: ['English Dominican Province'] }),
        'Project Gutenberg electronic edition', A_REVISION, 'verified_with_uncertainty', 'inactive local comparison only', '2026-07-24',
        JSON.stringify({ status: 'public_domain' }), JSON.stringify({ status: 'local_only_inactive' }),
        JSON.stringify({ status: 'reviewed_normalized_text_only' }));
    const artifactInsert = database.prepare(`INSERT INTO historical_source_artifacts (
      artifact_id, edition_id, role, locator, pin_kind, pin_value, sha256, bytes, acquired_at
    ) VALUES (?, ?, 'authority', ?, 'sha256', ?, ?, ?, ?)`);
    for (const artifact of input.sourceArtifacts) {
      artifactInsert.run(artifact.artifactId, input.identity.editionId, artifact.locator, artifact.sha256,
        artifact.sha256, artifact.bytes, artifact.acquiredAt);
    }
    database.prepare('INSERT INTO documents (id, title, type, date, metadata) VALUES (?, ?, ?, ?, ?)')
      .run(input.identity.workId, 'Summa Theologiae', 'historical_work', null, JSON.stringify({
        catalog: { lookupAliases: [input.identity.workId, 'Summa Theologiae'], creators: [{ name: 'Thomas Aquinas', role: 'author' }] },
        localOnlyInactive: true, sourcePack: A_PACK_ID,
      }));
    const normalized = database.prepare('INSERT INTO historical_edition_sections (edition_id, section_key, source_ordinal, display_label, heading, content) VALUES (?, ?, ?, ?, ?, ?)');
    const normalizedFts = database.prepare('INSERT INTO historical_edition_sections_fts (edition_id, section_key, heading, content) VALUES (?, ?, ?, ?)');
    const document = database.prepare('INSERT INTO document_sections (document_id, section_number, title, content, topics) VALUES (?, ?, ?, ?, ?)');
    const runtimeFts = database.prepare('INSERT INTO sections_fts (rowid, title, content, topics) VALUES (?, ?, ?, ?)');
    const identity = database.prepare('INSERT INTO historical_section_identities (document_id, section_key, source_ordinal, document_section_id) VALUES (?, ?, ?, ?)');
    const profile = database.prepare(`INSERT INTO historical_document_delivery_profiles (
      document_id, work_id, edition_id, immutable_corpus_identity, section_package_identity,
      delivery_mode, section_count, landing_max_bytes, browse_page_size, cursor_version, provenance_json, rights_json
    ) VALUES (?, ?, ?, ?, ?, 'sectioned_only', ?, 16384, 32, 1, ?, ?)`);
    profile.run(input.identity.workId, input.identity.workId, input.identity.editionId, input.sourceHashes.aggregateSha256,
      input.sourceHashes.manifestSha256, layout.questionBodies.length,
      JSON.stringify({ status: 'local_only_inactive', sourcePack: A_PACK_ID, manifestSha256: input.sourceHashes.manifestSha256 }),
      JSON.stringify({ status: 'not_authorized_for_release' }));
    for (const body of layout.questionBodies) {
      const heading = `Question ${body.questionKey}`;
      normalized.run(input.identity.editionId, body.questionKey, body.sourceOrdinal, heading, heading, body.content);
      normalizedFts.run(input.identity.editionId, body.questionKey, heading, body.content);
      const documentSectionId = Number(document.run(input.identity.workId, body.questionKey, heading, body.content, '[]').lastInsertRowid);
      runtimeFts.run(documentSectionId, heading, body.content, '[]');
      identity.run(input.identity.workId, body.questionKey, body.sourceOrdinal, documentSectionId);
    }
  })();
  const expectedQuestionHash = questionProjectionHash(layout.questionBodies.map(body => ({ bodyId: body.bodyId, content: body.content })));
  const projectionRows: Array<Iterable<{ bodyId: string; content: string }>> = [
    database.prepare(`SELECT 'question-body:' || section_key AS bodyId, content FROM historical_edition_sections
      WHERE edition_id = ? ORDER BY source_ordinal`).iterate(input.identity.editionId) as Iterable<{ bodyId: string; content: string }>,
    database.prepare(`SELECT 'question-body:' || section_key AS bodyId, content FROM historical_edition_sections_fts
      WHERE edition_id = ? ORDER BY rowid`).iterate(input.identity.editionId) as Iterable<{ bodyId: string; content: string }>,
    database.prepare(`SELECT 'question-body:' || identity.section_key AS bodyId, section.content AS content
      FROM historical_section_identities identity JOIN document_sections section ON section.id = identity.document_section_id
      WHERE identity.document_id = ? ORDER BY identity.source_ordinal`).iterate(input.identity.workId) as Iterable<{ bodyId: string; content: string }>,
    database.prepare(`SELECT 'question-body:' || identity.section_key AS bodyId, fts.content AS content
      FROM historical_section_identities identity JOIN sections_fts fts ON fts.rowid = identity.document_section_id
      WHERE identity.document_id = ? ORDER BY identity.source_ordinal`).iterate(input.identity.workId) as Iterable<{ bodyId: string; content: string }>,
  ];
  const projections = projectionRows.map(rows => questionProjectionHash(rows));
  if (new Set([expectedQuestionHash, ...projections]).size !== 1) fail('candidate A migrated-schema projections do not retain four equal question bodies');
  return expectedQuestionHash;
}

function runCandidateAFullCopy(path: string, input: AquinasCapacityInput, layout: CandidateALayout, canonicalAuthorityBodies: string): Omit<CandidateAReport, 'capacityGate' | 'nonGatingDiagnostics'> {
  return closeAfter(new Database(path), database => {
    const physicalProjection = insertCandidateAIntoMigratedSchema(database, input, layout);
    const sourceArtifactRows = pragmaInteger(database, `SELECT COUNT(*) FROM historical_source_artifacts
      WHERE edition_id = '${AQUINAS_CAPACITY_EXPECTED.identity.editionId}'`);
    if (sourceArtifactRows !== 4) fail('candidate A must materialize exactly four pinned Gutenberg source artifacts');
    const reconstructedAuthorityBodies = authorityHash(layout.reconstructedAuthorityBodies);
    if (reconstructedAuthorityBodies !== canonicalAuthorityBodies) fail('candidate A logical reconstruction drifted before measurement');
    database.exec('ANALYZE');
    const preVacuumFullCopy = databaseMeasure(database, path);
    const postVacuumDiagnostic = vacuumDiagnostic(database, path);
    return {
      shape: '512 plain normalized question bodies in the migrated historical/document/FTS/profile/identity projections',
      logicalHashes: { canonicalAuthorityBodies, reconstructedAuthorityBodies, questionBodies: physicalProjection, physicalProjection },
      physicalProjectionCount: 4,
      sourceArtifactRows: 4,
      preVacuumFullCopy,
      postVacuumDiagnostic,
    };
  });
}

function candidateBFtsCheck(
  database: Database.Database,
  layout: CandidateBLayout,
): CandidateBReport['fts'] {
  database.prepare("INSERT INTO b_authority_fts(b_authority_fts) VALUES ('integrity-check')").run();
  const sample = layout.authorityBodies.find(body => /[A-Za-z]{6,}/.test(body.content));
  if (!sample) fail('candidate B has no representative FTS token');
  const token = sample.content.match(/[A-Za-z]{6,}/)?.[0]!.toLowerCase();
  const query = `"${token}"`;
  const expected = database.prepare('SELECT rowid FROM b_authority_bodies WHERE body_id = ?').get(sample.bodyId) as { rowid?: unknown } | undefined;
  const rows = database.prepare('SELECT rowid FROM b_authority_fts WHERE b_authority_fts MATCH ? ORDER BY rowid').all(query) as Array<{ rowid: number }>;
  const expectedRowId = expected?.rowid;
  if (!Number.isSafeInteger(expectedRowId) || rows.length === 0 || !rows.some(row => row.rowid === expectedRowId)) fail('candidate B representative FTS MATCH did not preserve the authority rowid');
  const parity = database.prepare(`SELECT COUNT(*) AS count FROM b_authority_fts fts
    LEFT JOIN b_authority_bodies body ON body.rowid = fts.rowid
    WHERE b_authority_fts MATCH ? AND body.rowid IS NULL`).get(query) as { count: number };
  if (parity.count !== 0) fail('candidate B representative FTS MATCH has rowid parity drift');
  const indexBytes = (database.prepare(`SELECT COALESCE(SUM(pgsize), 0) AS bytes FROM dbstat
    WHERE name IN ('b_authority_fts_config', 'b_authority_fts_data', 'b_authority_fts_docsize', 'b_authority_fts_idx')`).get() as { bytes: number }).bytes;
  return {
    integrityCheck: 'ok',
    representativeMatch: { querySha256: sha256(query), matchCount: rows.length, rowIdParity: true },
    indexBytes,
    candidateContentShadowTables: [],
  };
}

function insertCandidateB(database: Database.Database, layout: CandidateBLayout, canonicalAuthorityBodies: string): { storedAuthorityBodies: string; navigation: { flat: string; hierarchical: string }; fts: CandidateBReport['fts'] } {
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE b_authority_bodies (
      body_id TEXT PRIMARY KEY, kind TEXT NOT NULL, part_key TEXT NOT NULL, question_key TEXT,
      article_key TEXT, source_ordinal INTEGER NOT NULL UNIQUE, content TEXT NOT NULL
    );
    CREATE TABLE b_navigation_nodes (
      node_id TEXT PRIMARY KEY, parent_id TEXT REFERENCES b_navigation_nodes(node_id), node_kind TEXT NOT NULL,
      body_id TEXT UNIQUE REFERENCES b_authority_bodies(body_id), part_key TEXT NOT NULL, question_key TEXT,
      article_key TEXT, flat_ordinal INTEGER NOT NULL UNIQUE, sibling_ordinal INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE b_authority_fts USING fts5(
      body_id UNINDEXED, content, content='b_authority_bodies', content_rowid='rowid'
    );
  `);
  const bodyInsert = database.prepare(`INSERT INTO b_authority_bodies (
    body_id, kind, part_key, question_key, article_key, source_ordinal, content
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const nodeInsert = database.prepare(`INSERT INTO b_navigation_nodes (
    node_id, parent_id, node_kind, body_id, part_key, question_key, article_key, flat_ordinal, sibling_ordinal
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  database.transaction(() => {
    for (const body of layout.authorityBodies) bodyInsert.run(body.bodyId, body.kind, body.partKey, body.questionKey, body.articleKey, body.sourceOrdinal, body.content);
    for (const node of layout.navigationNodes) nodeInsert.run(node.nodeId, node.parentId, node.kind, node.bodyId, node.partKey, node.questionKey, node.articleKey, node.flatOrdinal, node.siblingOrdinal);
  })();
  const ftsInsert = database.prepare('INSERT INTO b_authority_fts (rowid, body_id, content) VALUES (?, ?, ?)');
  const ftsRows = database.prepare('SELECT rowid, body_id, content FROM b_authority_bodies ORDER BY source_ordinal').all() as Array<{ rowid: number; body_id: string; content: string }>;
  database.transaction(() => { for (const row of ftsRows) ftsInsert.run(row.rowid, row.body_id, row.content); })();
  const storedAuthorityBodies = hashRecords(database.prepare(`SELECT body_id AS bodyId, kind, part_key AS partKey, question_key AS questionKey,
    article_key AS articleKey, source_ordinal AS sourceOrdinal, content FROM b_authority_bodies ORDER BY source_ordinal`).iterate());
  if (storedAuthorityBodies !== canonicalAuthorityBodies) fail('candidate B authority body hash drifted before measurement');
  const nodes = database.prepare(`SELECT node_id AS nodeId, parent_id AS parentId, node_kind AS kind, body_id AS bodyId,
    part_key AS partKey, question_key AS questionKey, article_key AS articleKey, flat_ordinal AS flatOrdinal,
    sibling_ordinal AS siblingOrdinal FROM b_navigation_nodes ORDER BY flat_ordinal`).all() as AquinasNavigationNode[];
  assertCandidateBTopology(nodes, layout.authorityBodies);
  assertCandidateBNavigationEquivalence(nodes);
  const navigation = candidateBNavigationIdentityHashes(nodes);
  const fts = candidateBFtsCheck(database, layout);
  return { storedAuthorityBodies, navigation, fts };
}

function runCandidateBFullCopy(path: string, layout: CandidateBLayout, canonicalAuthorityBodies: string): Omit<CandidateBReport, 'capacityGate' | 'nonGatingDiagnostics'> {
  return closeAfter(new Database(path), database => {
    const baselineContentShadows = discoverFtsContentShadowTables(database);
    const inserted = insertCandidateB(database, layout, canonicalAuthorityBodies);
    database.exec('ANALYZE');
    const preVacuumFullCopy = databaseMeasure(database, path);
    assertNoAdditionalFtsContentShadowTables(baselineContentShadows, preVacuumFullCopy.ftsContentShadowTables);
    const postVacuumDiagnostic = vacuumDiagnostic(database, path);
    assertNoAdditionalFtsContentShadowTables(baselineContentShadows, postVacuumDiagnostic.ftsContentShadowTables);
    return {
      shape: '3184 authority bodies with implicit work root, 4 part landings, 512 question landings, 2669 article nodes, and external-content FTS',
      logicalHashes: { canonicalAuthorityBodies, storedAuthorityBodies: inserted.storedAuthorityBodies, flatNavigation: inserted.navigation.flat, hierarchicalNavigation: inserted.navigation.hierarchical },
      externalContentFtsHasNoBodyBearingContentCopy: true,
      fts: inserted.fts,
      preVacuumFullCopy,
      postVacuumDiagnostic,
    };
  });
}

function runIsolatedCandidateA(path: string, layout: CandidateALayout): { preVacuum: DatabaseMeasure; postVacuum: DatabaseMeasure } {
  return closeAfter(new Database(path), database => {
    database.exec(`
      CREATE TABLE isolated_a_authority (body_id TEXT PRIMARY KEY, content TEXT NOT NULL);
      CREATE TABLE isolated_a_runtime (body_id TEXT PRIMARY KEY, content TEXT NOT NULL);
      CREATE VIRTUAL TABLE isolated_a_authority_fts USING fts5(body_id UNINDEXED, content);
      CREATE VIRTUAL TABLE isolated_a_runtime_fts USING fts5(body_id UNINDEXED, content);
    `);
    const authority = database.prepare('INSERT INTO isolated_a_authority VALUES (?, ?)');
    const runtime = database.prepare('INSERT INTO isolated_a_runtime VALUES (?, ?)');
    const authorityFts = database.prepare('INSERT INTO isolated_a_authority_fts(rowid, body_id, content) VALUES (?, ?, ?)');
    const runtimeFts = database.prepare('INSERT INTO isolated_a_runtime_fts(rowid, body_id, content) VALUES (?, ?, ?)');
    database.transaction(() => {
      for (const [index, body] of layout.questionBodies.entries()) {
        authority.run(body.bodyId, body.content); runtime.run(body.bodyId, body.content);
        authorityFts.run(index + 1, body.bodyId, body.content); runtimeFts.run(index + 1, body.bodyId, body.content);
      }
    })();
    database.exec('ANALYZE');
    const preVacuum = databaseMeasure(database, path);
    const postVacuum = vacuumDiagnostic(database, path);
    return { preVacuum, postVacuum };
  });
}

function runIsolatedCandidateB(path: string, layout: CandidateBLayout, canonicalAuthorityBodies: string): { preVacuum: DatabaseMeasure; postVacuum: DatabaseMeasure } {
  return closeAfter(new Database(path), database => {
    insertCandidateB(database, layout, canonicalAuthorityBodies);
    database.exec('ANALYZE');
    const preVacuum = databaseMeasure(database, path);
    const postVacuum = vacuumDiagnostic(database, path);
    return { preVacuum, postVacuum };
  });
}

const CURRENT_CONTRACT_INCOMPATIBILITIES = [
  'A normal release corpus excludes the dormant Aquinas hierarchy and its shared source lineage; this report materializes it only in a disposable standalone rehearsal.',
  'This local rehearsal does not authorize a D1 binding, remote D1 operation, deployment, publication, runtime activation, or a release corpus identity containing Aquinas rows.',
] as const;

/**
 * Build a zero-row normal release baseline, then rehearse the standalone
 * dormant materialization only in a copy. Earlier A/B scratch layouts remain
 * derivation helpers and cannot substitute for the actual schema rehearsal.
 */
export function runAquinasSourcePackCapacityComparison(root = ROOT, options: AquinasCapacityRunOptions = {}): AquinasCapacityComparisonReport {
  const input = loadAquinasCapacityInput(root);
  const candidateB = buildCandidateB(input);
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'theologai-aquinas-source-pack-capacity-'));
  try {
    const freshBaselinePath = join(temporaryDirectory, 'fresh-pr95-baseline.sqlite');
    const suppliedBaseline = options.baselinePath === undefined ? undefined : (isAbsolute(options.baselinePath) ? options.baselinePath : resolve(root, options.baselinePath));
    if (suppliedBaseline === undefined) (options.buildBaseline ?? buildFreshAquinasCapacityBaseline)({ root, outputPath: freshBaselinePath });
    const baselinePath = suppliedBaseline ?? freshBaselinePath;
    if (options.verifyBaseline !== false && options.buildBaseline !== undefined) runCurrentCheckoutCommand(root, BASELINE_VERIFY_SCRIPT, ['--database', baselinePath]);
    const baselineAttestation = attestBaseline(root, baselinePath);
    const baselineVacuumPath = join(temporaryDirectory, 'baseline-vacuum-diagnostic.sqlite');
    copyFileSync(baselinePath, baselineVacuumPath);
    const baselinePostVacuum = closeAfter(new Database(baselineVacuumPath), database => vacuumDiagnostic(database, baselineVacuumPath));
    rmSync(baselineVacuumPath, { force: true });

    const rehearsalPath = join(temporaryDirectory, 'standalone-aquinas-rehearsal.sqlite');
    copyFileSync(baselinePath, rehearsalPath);
    const standaloneAquinasRehearsal = runStandaloneAquinasRehearsal(root, rehearsalPath);
    rmSync(rehearsalPath, { force: true });
    return {
      schemaVersion: 'aquinas-source-pack-capacity-comparison.v4', status: 'normal_release_baseline_with_standalone_aquinas_rehearsal', temporaryStorage: 'os-temp-disposed',
      source: {
        identity: input.identity, hashes: input.sourceHashes,
        counts: {
          shards: AQUINAS_CAPACITY_EXPECTED.shards, questions: input.questions.length,
          articles: input.authorityBodies.filter(body => body.kind === 'article').length,
          preambles: input.authorityBodies.filter(body => body.kind === 'preamble').length,
          prologues: input.authorityBodies.filter(body => body.kind === 'part_prologue').length,
          authorityBodies: input.authorityBodies.length, navigationNodes: candidateB.navigationNodes.length,
        },
      },
      baseline: { kind: 'normal_release_zero_hierarchy_baseline', builtFreshFromCurrentCheckout: suppliedBaseline === undefined, sha256: baselineAttestation.sha256, corpusIdentity: baselineAttestation.corpusIdentity, preVacuum: baselineAttestation.preVacuum, postVacuumDiagnostic: baselinePostVacuum },
      standaloneAquinasRehearsal, capacityLimitBytes: CAPACITY_LIMIT_BYTES,
      capacityStatus: standaloneAquinasRehearsal.capacityGate.withinLimit ? 'within_350_mib' : 'exceeds_350_mib',
      currentContractIncompatibilities: [...CURRENT_CONTRACT_INCOMPATIBILITIES],
    };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export function parseAquinasCapacityComparisonArguments(argv: readonly string[]): void {
  if (argv.length !== 0) fail('this local-only comparison accepts no arguments and always builds disposable OS-temporary databases');
}

function main(argv: readonly string[]): void {
  parseAquinasCapacityComparisonArguments(argv);
  const report = runAquinasSourcePackCapacityComparison();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.capacityStatus === 'exceeds_350_mib') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'unknown failure'}\n`);
    process.exitCode = 1;
  }
}
