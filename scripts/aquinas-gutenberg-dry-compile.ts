#!/usr/bin/env tsx

/**
 * Gate D local-only compiler.  It accepts only the pinned A0 cache, validates
 * the exact A0/A1 attestations before reading source members, and writes
 * canonical body-bearing bytes only below an ignored explicit test-output
 * directory.  Its stdout and report are content-free.
 */

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AQUINAS_A1_DISCREPANCY_INVENTORY,
  AQUINAS_A1_DISCREPANCY_LEDGER_SHA256,
  AQUINAS_A1_LOCAL_RECEIPT_SHA256,
  AQUINAS_A1_PACKAGE_IDENTITY,
  AQUINAS_A1_RIGHTS_AND_COVERAGE,
  AQUINAS_A1_SOURCE_LOCK_SHA256,
  AQUINAS_A1_TOPOLOGY_LOCK_SHA256,
  AQUINAS_A1_TOPOLOGY_VECTOR,
  SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS,
  SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS,
  SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY,
  SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS,
  SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA,
  assertReleaseManifestAttestation,
  assertReleasePackageAttestation,
  canonicalSectionedEditionCollectionPackageBytes,
  compileSectionedEditionCollectionPackage,
  verifyPersistedPackageBytes,
  type AquinasPackagePartKey,
  type CompiledSectionedEditionCollectionPackageSet,
  type PersistedChild,
  type PersistedPackage,
  type RawSpan,
  type TransientChild,
  type TransientSectionedEditionCollectionDraft,
} from '../src/kernel/sectionedEditionCollectionPackageFoundation.js';
import {
  AQUINAS_GUTENBERG_RECEIPT_PATH,
  AQUINAS_GUTENBERG_SOURCE_LOCK_PATH,
  extractAndVerifyLockedHtml,
  readAquinasGutenbergSourceLock,
  sourceLockDigest,
  verifyLocalAquinasGutenbergAcquisition,
} from './aquinas-gutenberg-acquisition.js';
import {
  AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_LEDGER_PATH,
  AQUINAS_GUTENBERG_TOPOLOGY_LOCK_PATH,
  buildAquinasGutenbergReviewedSourcePlan,
  type AquinasGutenbergReviewedRangePlan,
  type AquinasGutenbergReviewedSourcePlan,
  type AquinasTopologyLock,
} from './aquinas-gutenberg-topology.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPROVED_A0_CACHE_ROOT = '/private/tmp/theologai-aquinas-gutenberg-acquisition';
const TEST_OUTPUT_ROOT = resolve(ROOT, 'test-output');
const DOMAIN_PREFIX = 'sectioned-edition-collection-package';
const RUN_IDS = ['run-a', 'run-b'] as const;
const PACKAGE_SHARD_IDS = [
  'aquinas-summa-pg-v1.prima.shard-0001',
  'aquinas-summa-pg-v1.prima-secundae.shard-0001',
  'aquinas-summa-pg-v1.secunda-secundae.shard-0001',
  'aquinas-summa-pg-v1.secunda-secundae.shard-0002',
  'aquinas-summa-pg-v1.tertia.shard-0001',
] as const;
const MANIFEST_BASENAME = 'manifest.json';

type RunId = typeof RUN_IDS[number];
type SafeDirectory = Readonly<{ path: string; realpath: string }>;

type RunReport = Readonly<{
  runId: RunId;
  packageFiles: ReadonlyArray<Readonly<{ shardId: string; path: string; sha256: string; persistedSha256: string; bytes: number }>>;
  manifest: Readonly<{ path: string; sha256: string; bytes: number; aggregateSha256: string }>;
  parts: ReadonlyArray<Readonly<{
    partKey: AquinasPackagePartKey;
    questionCount: number;
    articleCount: number;
    prologueCount: number;
    normalizedContentUtf8Bytes: number;
    shards: ReadonlyArray<Readonly<{
      shardId: string;
      normalizedContentUtf8Bytes: number;
      canonicalSerializedPackageUtf8Bytes: number;
      contentHeadroom: number;
      serializedHeadroom: number;
    }>>;
  }>>;
  maxChild: Readonly<{ key: string; utf8Bytes: number; headroom: number }>;
  q102: ReadonlyArray<Readonly<{ questionKey: string; parentAggregateUtf8Bytes: number; childMaxKey: string; childMaxUtf8Bytes: number }>>;
  exclusions: Readonly<{ count: number; utf8Bytes: number; byKind: Readonly<Record<string, Readonly<{ count: number; utf8Bytes: number }>>> }>;
  discrepancyCount: number;
  checks: Readonly<{
    fullCoverage: true;
    a1Attestation: true;
    releaseVerifier: true;
    childContentLimit: true;
    packageContentLimit: true;
    canonicalSerializedLimit: true;
    maximalShards: true;
  }>;
}>;

type GateReport = Readonly<{
  schemaVersion: 'aquinas-gutenberg-gate-d-dry-compile-report.v1';
  sourceLockSha256: string;
  localReceiptSha256: string;
  topologyLockSha256: string;
  discrepancyLedgerSha256: string;
  runs: readonly RunReport[];
  byteCompare: Readonly<{ identical: true; files: ReadonlyArray<Readonly<{ name: string; sha256: string; bytes: number }>> }>;
}>;

function fail(message: string): never {
  throw new Error(`[aquinas-gutenberg-dry-compile] ${message}`);
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function domainHash(suffix: string, bytes: Uint8Array): string {
  return sha256(`${DOMAIN_PREFIX}.${suffix}:${new TextDecoder().decode(bytes)}`);
}

function span(plan: Pick<AquinasGutenbergReviewedRangePlan, 'startByte' | 'endByte' | 'sha256'>): RawSpan {
  return { startByte: plan.startByte, endByte: plan.endByte, rawSha256: plan.sha256 };
}

type SourceSlicer = Readonly<{
  full: string;
  slice: (value: Pick<AquinasGutenbergReviewedRangePlan, 'startByte' | 'endByte'>) => string;
}>;

function sourceSlicer(source: Uint8Array, plan: AquinasGutenbergReviewedSourcePlan): SourceSlicer {
  const boundaries = new Set<number>([0, source.byteLength]);
  const addRange = (range: Pick<AquinasGutenbergReviewedRangePlan, 'startByte' | 'endByte' | 'blocks'>): void => {
    boundaries.add(range.startByte); boundaries.add(range.endByte);
    for (const block of range.blocks) { boundaries.add(block.startByte); boundaries.add(block.endByte); }
  };
  if (plan.partPrologue !== null) addRange(plan.partPrologue);
  for (const question of plan.questions) {
    boundaries.add(question.startByte); boundaries.add(question.endByte);
    addRange(question.preamble);
    for (const article of question.articles) addRange(article);
  }
  for (const exclusion of plan.exclusions) addRange(exclusion);
  let full: string;
  try {
    full = new TextDecoder('utf-8', { fatal: true }).decode(source);
  } catch {
    fail('reviewed plan source is not strict UTF-8');
  }
  const offsets = new Map<number, number>();
  let byte = 0;
  for (let index = 0; index < full.length;) {
    if (boundaries.has(byte)) offsets.set(byte, index);
    const point = full.codePointAt(index)!;
    byte += Buffer.byteLength(String.fromCodePoint(point), 'utf8');
    index += point > 0xffff ? 2 : 1;
  }
  if (boundaries.has(byte)) offsets.set(byte, full.length);
  if (byte !== source.byteLength || offsets.size !== boundaries.size) fail('reviewed plan supplied a non-UTF-8 source boundary');
  return {
    full,
    slice(value): string {
      const start = offsets.get(value.startByte);
      const end = offsets.get(value.endByte);
      if (start === undefined || end === undefined || end <= start) fail('reviewed plan supplied an unresolved source boundary');
      return full.slice(start, end);
    },
  };
}

function reviewedChild(
  kind: TransientChild['kind'],
  artifactId: string,
  source: SourceSlicer,
  range: AquinasGutenbergReviewedRangePlan,
  article?: Readonly<{ articleKey: string; ordinal: number }>,
): TransientChild {
  const child = {
    kind,
    ...(article === undefined ? {} : article),
    source: {
      artifactId,
      span: span(range),
      blocks: range.blocks.map(block => ({
        span: { startByte: block.startByte, endByte: block.endByte, rawSha256: block.sha256 },
        html: source.slice(block),
        topology: { containerTag: block.containerTag, inlineTags: [...block.inlineTags] },
      })),
    },
    bracketPreservationStatus: SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS,
    correctionStatus: SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS,
  };
  return child as TransientChild;
}

function orderedArticleKeysHash(articleKeys: readonly string[]): string {
  return domainHash('article-keys.v1', canonicalSectionedEditionCollectionPackageBytes(articleKeys));
}

function assertLexicalDescendant(parent: string, child: string, label: string, allowEqual = false): void {
  const value = relative(parent, child);
  if ((!allowEqual && value.length === 0) || value === '..' || value.startsWith(`..${sep}`) || isAbsolute(value)) fail(`${label} escapes its approved parent`);
}

function assertRealpathDescendant(parent: string, child: string, label: string, allowEqual = false): void {
  assertLexicalDescendant(realpathSync(parent), realpathSync(child), label, allowEqual);
}

function existingPathComponents(path: string): readonly string[] {
  const values: string[] = [];
  let current = resolve(path);
  while (true) {
    values.push(current);
    const parent = dirname(current);
    if (parent === current) return values.reverse();
    current = parent;
  }
}

function assertSafeExistingDirectoryComponents(path: string, label: string): void {
  let missing = false;
  for (const component of existingPathComponents(path)) {
    if (!existsSync(component)) {
      missing = true;
      continue;
    }
    if (missing) fail(`${label} has an existing component below a missing parent`);
    const stat = lstatSync(component);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`${label} has a symlink or non-directory component`);
  }
}

function assertSafeExistingDirectory(path: string, label: string): SafeDirectory {
  const absolute = resolve(path);
  assertSafeExistingDirectoryComponents(absolute, label);
  if (!existsSync(absolute)) fail(`${label} is missing`);
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`${label} is not a safe directory`);
  return { path: absolute, realpath: realpathSync(absolute) };
}

function nearestSafeExistingDirectory(path: string, label: string): SafeDirectory {
  let current = resolve(path);
  assertSafeExistingDirectoryComponents(current, label);
  while (!existsSync(current)) current = dirname(current);
  return assertSafeExistingDirectory(current, label);
}

function assertSafeRegularFileWithin(directory: SafeDirectory, basename: string, label: string): string {
  if (basename.length === 0 || basename.includes('/') || basename.includes('\\') || basename === '.' || basename === '..') fail(`${label} does not use a safe relative basename`);
  const path = resolve(directory.path, basename);
  assertLexicalDescendant(directory.path, path, label);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} is not a safe regular file`);
  const realpath = realpathSync(path);
  assertRealpathDescendant(directory.realpath, realpath, label);
  return path;
}

function writeNewContainedFile(directory: SafeDirectory, basename: string, bytes: Uint8Array): string {
  if (basename.length === 0 || basename.includes('/') || basename.includes('\\') || basename === '.' || basename === '..') fail('output filename does not use a safe relative basename');
  const path = resolve(directory.path, basename);
  assertLexicalDescendant(directory.path, path, 'output filename');
  if (existsSync(path)) fail('output file already exists; preserve-only writing forbids clobbering it');
  const currentDirectory = assertSafeExistingDirectory(directory.path, 'output file parent directory');
  if (currentDirectory.realpath !== directory.realpath) fail('output file parent directory realpath drifted before write');
  writeFileSync(path, bytes, { flag: 'wx' });
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('new output file is not a safe regular file');
  assertRealpathDescendant(directory.realpath, realpathSync(path), 'new output file');
  return path;
}

function createSafeChildDirectory(parent: SafeDirectory, basename: string, label: string): SafeDirectory {
  if (basename.length === 0 || basename.includes('/') || basename.includes('\\') || basename === '.' || basename === '..') fail(`${label} does not use a safe relative basename`);
  const path = resolve(parent.path, basename);
  assertLexicalDescendant(parent.path, path, label);
  if (existsSync(path)) fail(`${label} already exists; preserve-only writing forbids clobbering it`);
  const currentParent = assertSafeExistingDirectory(parent.path, `${label} parent`);
  if (currentParent.realpath !== parent.realpath) fail(`${label} parent realpath drifted before mkdir`);
  mkdirSync(path, { recursive: false });
  const child = assertSafeExistingDirectory(path, label);
  assertRealpathDescendant(parent.realpath, child.realpath, label);
  return child;
}

function prepareSafeOutputRoot(outputRoot: string): SafeDirectory {
  let testOutput: SafeDirectory;
  if (existsSync(TEST_OUTPUT_ROOT)) testOutput = assertSafeExistingDirectory(TEST_OUTPUT_ROOT, 'ignored test-output root');
  else {
    const parent = assertSafeExistingDirectory(dirname(TEST_OUTPUT_ROOT), 'ignored test-output parent');
    testOutput = createSafeChildDirectory(parent, 'test-output', 'ignored test-output root');
  }
  const output = resolve(outputRoot);
  assertLexicalDescendant(testOutput.path, output, 'output directory');
  assertSafeExistingDirectoryComponents(output, 'output directory');
  if (existsSync(output)) {
    const directory = assertSafeExistingDirectory(output, 'output directory');
    assertRealpathDescendant(testOutput.realpath, directory.realpath, 'output directory');
    return directory;
  }
  const suffix = relative(testOutput.path, output).split(sep).filter(Boolean);
  let current = testOutput;
  for (const component of suffix) current = createSafeChildDirectory(current, component, 'output directory');
  return current;
}

export function assertApprovedPaths(cacheRoot: string, outputRoot: string, testOutputRoot = TEST_OUTPUT_ROOT): void {
  if (resolve(cacheRoot) !== APPROVED_A0_CACHE_ROOT) fail('cache root is not the sole approved pinned A0 cache');
  const testOutput = resolve(testOutputRoot);
  const output = resolve(outputRoot);
  assertLexicalDescendant(testOutput, output, 'output directory');
  assertSafeExistingDirectoryComponents(testOutput, 'ignored test-output root');
  assertSafeExistingDirectoryComponents(output, 'output directory');
  const nearest = nearestSafeExistingDirectory(output, 'output directory');
  if (existsSync(testOutput)) {
    const root = assertSafeExistingDirectory(testOutput, 'ignored test-output root');
    assertRealpathDescendant(root.realpath, nearest.realpath, 'output directory', true);
  }
  if (existsSync(output)) {
    const directory = assertSafeExistingDirectory(output, 'output directory');
    if (!existsSync(testOutput)) fail('output directory exists while its approved test-output root is missing');
    const root = assertSafeExistingDirectory(testOutput, 'ignored test-output root');
    assertRealpathDescendant(root.realpath, directory.realpath, 'output directory');
  }
}

function assertTrackedBytes(path: string, expectedSha256: string, label: string): void {
  if (!existsSync(path)) fail(`${label} is missing`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} is not a safe regular file`);
  if (sha256(readFileSync(path)) !== expectedSha256) fail(`${label} byte identity drifted`);
}

function preflight(cacheRoot: string): AquinasTopologyLock {
  const lock = readAquinasGutenbergSourceLock(cacheRoot);
  if (sourceLockDigest(cacheRoot) !== AQUINAS_A1_SOURCE_LOCK_SHA256) fail('A0 source lock does not equal the immutable A1 source-lock commitment');
  assertTrackedBytes(resolve(cacheRoot, AQUINAS_GUTENBERG_RECEIPT_PATH), AQUINAS_A1_LOCAL_RECEIPT_SHA256, 'A0 local receipt');
  assertTrackedBytes(resolve(ROOT, AQUINAS_GUTENBERG_TOPOLOGY_LOCK_PATH), AQUINAS_A1_TOPOLOGY_LOCK_SHA256, 'A1 topology lock');
  assertTrackedBytes(resolve(ROOT, AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_LEDGER_PATH), AQUINAS_A1_DISCREPANCY_LEDGER_SHA256, 'A1 discrepancy ledger');
  if (lock.artifacts.length !== 4) fail('A0 source lock does not contain the reviewed four artifacts');
  verifyLocalAquinasGutenbergAcquisition(cacheRoot);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(resolve(ROOT, AQUINAS_GUTENBERG_TOPOLOGY_LOCK_PATH)))) as AquinasTopologyLock;
}

function buildDraft(cacheRoot: string, topology: AquinasTopologyLock): TransientSectionedEditionCollectionDraft {
  const lock = readAquinasGutenbergSourceLock(cacheRoot);
  const sourceArtifacts: TransientSectionedEditionCollectionDraft['sourceArtifacts'] = [];
  const partPrologues: TransientSectionedEditionCollectionDraft['partPrologues'] = [];
  const exclusions: TransientSectionedEditionCollectionDraft['exclusions'] = [];
  const questions: TransientSectionedEditionCollectionDraft['questions'] = [];
  const metadata = new Map(topology.questions.map(question => [question.questionKey, question] as const));
  const sourceMetadata = new Map(topology.sources.map(source => [`${source.ebookId}:${source.partKey}`, source] as const));
  const discoveredDiscrepancies: unknown[] = [];
  let exclusionOrdinal = 1;
  for (const artifact of lock.artifacts) {
    const archivePath = resolve(cacheRoot, 'data/historical-sources/project-gutenberg/aquinas-english-dominican', artifact.archive.localPath);
    const html = extractAndVerifyLockedHtml(artifact, readFileSync(archivePath));
    const plan = buildAquinasGutenbergReviewedSourcePlan(artifact, html);
    const source = sourceSlicer(html, plan);
    const artifactId = `pg-${artifact.ebookId}`;
    const lockedSource = sourceMetadata.get(`${artifact.ebookId}:${artifact.partKey}`);
    if (!lockedSource || new TextDecoder().decode(canonicalSectionedEditionCollectionPackageBytes(plan.source)) !== new TextDecoder().decode(canonicalSectionedEditionCollectionPackageBytes(lockedSource))) fail(`A1 topology source projection drifted for ${artifactId}`);
    discoveredDiscrepancies.push(...plan.discrepancies);
    sourceArtifacts.push({
      artifactId,
      partKey: artifact.partKey,
      htmlMemberBytes: plan.source.htmlMemberBytes,
      htmlMemberSha256: plan.source.htmlMemberSha256,
      intellectualStartByte: plan.source.intellectualStartByte,
      cutoffEndByte: plan.source.cutoffEndByte,
      rawCoverageSha256: plan.source.rawCoverageSha256,
      html: source.full,
    });
    if (plan.partPrologue !== null) partPrologues.push({ partKey: artifact.partKey, child: reviewedChild('part_prologue', artifactId, source, plan.partPrologue) });
    for (const excluded of plan.exclusions) {
      exclusions.push({
        exclusionId: `${artifactId}-${excluded.type.replaceAll('_', '-')}-${String(exclusionOrdinal).padStart(4, '0')}`,
        kind: excluded.type as TransientSectionedEditionCollectionDraft['exclusions'][number]['kind'],
        artifactId,
        span: span(excluded),
        html: source.slice(excluded),
      });
      exclusionOrdinal += 1;
    }
    for (const reviewed of plan.questions) {
      const locked = metadata.get(reviewed.questionKey);
      if (!locked || locked.articleCount !== reviewed.articleCount || locked.rawSpanStartByte !== reviewed.startByte || locked.rawSpanEndByte !== reviewed.endByte || locked.rawSpanSha256 !== reviewed.sha256) fail(`A1 topology question projection drifted for ${reviewed.questionKey}`);
      const articles = reviewed.articles.map((article, index) => reviewedChild('article', artifactId, source, article, {
        articleKey: `${reviewed.questionKey}.a${String(index + 1).padStart(3, '0')}`,
        ordinal: index + 1,
      }));
      questions.push({
        questionKey: reviewed.questionKey,
        partKey: artifact.partKey,
        questionNumber: reviewed.questionNumber,
        articleCount: reviewed.articleCount,
        source: { artifactId, span: { startByte: reviewed.startByte, endByte: reviewed.endByte, rawSha256: reviewed.sha256 } },
        orderedArticleKeysSha256: locked.orderedArticleKeysSha256,
        bracketStatus: locked.bracketStatus,
        sourceLocatorStatus: locked.source_locator_status,
        sourceStructureStatus: locked.source_structure_status,
        discrepancyRefs: AQUINAS_A1_DISCREPANCY_INVENTORY.filter(entry => entry.questionKey === reviewed.questionKey).map(entry => entry.ref),
        preamble: reviewedChild('preamble', artifactId, source, reviewed.preamble),
        articles,
      });
    }
  }
  const typedRows = [
    ...partPrologues.map(prologue => ['part_prologue', prologue.partKey, null, null, prologue.child.source.artifactId, prologue.child.source.span.startByte, prologue.child.source.span.endByte, prologue.child.source.span.rawSha256]),
    ...questions.flatMap(question => [
      ['preamble', question.partKey, question.questionKey, null, question.preamble.source.artifactId, question.preamble.source.span.startByte, question.preamble.source.span.endByte, question.preamble.source.span.rawSha256],
      ...question.articles.map(article => ['article', question.partKey, question.questionKey, article.articleKey!, article.source.artifactId, article.source.span.startByte, article.source.span.endByte, article.source.span.rawSha256]),
    ]),
  ];
  if (typedRows.length !== AQUINAS_A1_TOPOLOGY_VECTOR.authorialChildRangeCount) fail('A1 authorial child-range count drifted');
  const expectedDiscrepancies = AQUINAS_A1_DISCREPANCY_INVENTORY.map(entry => {
    const { ref: _ref, canonicalEntrySha256: _hash, ...projection } = entry;
    return projection;
  });
  if (new TextDecoder().decode(canonicalSectionedEditionCollectionPackageBytes(discoveredDiscrepancies)) !== new TextDecoder().decode(canonicalSectionedEditionCollectionPackageBytes(expectedDiscrepancies))) fail('A1 discrepancy ledger does not exactly match the verified A0 local scan');
  return {
    mode: 'a1_attested',
    schemaVersion: SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA,
    normalizationPolicy: SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY,
    identity: AQUINAS_A1_PACKAGE_IDENTITY,
    sourceLockSha256: AQUINAS_A1_SOURCE_LOCK_SHA256,
    localReceiptSha256: AQUINAS_A1_LOCAL_RECEIPT_SHA256,
    topologyLockSha256: AQUINAS_A1_TOPOLOGY_LOCK_SHA256,
    typedRangeCount: typedRows.length,
    typedRangesSha256: domainHash('typed-child-ranges.v1', canonicalSectionedEditionCollectionPackageBytes(typedRows)),
    discrepancyLedgerSha256: AQUINAS_A1_DISCREPANCY_LEDGER_SHA256,
    sourceArtifacts,
    rightsAndCoverage: AQUINAS_A1_RIGHTS_AND_COVERAGE,
    partPrologues,
    exclusions,
    discrepancies: AQUINAS_A1_DISCREPANCY_INVENTORY.map(entry => ({ ...entry, codes: [...entry.codes] })),
    questions,
  };
}

function packageWithNextQuestion(pkg: PersistedPackage, next: PersistedPackage['questions'][number]): PersistedPackage {
  const questions = [...pkg.questions, structuredClone(next)];
  const questionKeys = questions.map(question => question.questionKey);
  const articleKeys = questions.flatMap(question => question.articles.map(article => article.articleKey!));
  return {
    ...structuredClone(pkg),
    shard: {
      ...pkg.shard,
      lastQuestionKey: questionKeys.at(-1)!,
      questionKeys,
      orderedArticleKeysSha256: orderedArticleKeysHash(articleKeys),
      normalizedContentUtf8Bytes: pkg.shard.normalizedContentUtf8Bytes + next.output.utf8Bytes,
    },
    questions,
  };
}

function assertMaximalShards(compiled: CompiledSectionedEditionCollectionPackageSet): void {
  for (const [index, current] of compiled.packages.entries()) {
    const next = compiled.packages[index + 1];
    if (!next || next.package.shard.partKey !== current.package.shard.partKey) continue;
    const candidate = packageWithNextQuestion(current.package, next.package.questions[0]!);
    const contentOver = candidate.shard.normalizedContentUtf8Bytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes;
    const serializedOver = canonicalSectionedEditionCollectionPackageBytes(candidate).byteLength > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes;
    if (!contentOver && !serializedOver) fail(`shard ${current.package.shard.shardId} is not maximal within its part`);
  }
}

function childEntries(compiled: CompiledSectionedEditionCollectionPackageSet): ReadonlyArray<Readonly<{ key: string; child: PersistedChild }>> {
  return compiled.packages.flatMap(({ package: pkg }) => [
    ...(pkg.partPrologue === null ? [] : [{ key: `${pkg.shard.partKey}.part-prologue`, child: pkg.partPrologue }]),
    ...pkg.questions.flatMap(question => [
      { key: `${question.questionKey}.preamble`, child: question.preamble },
      ...question.articles.map(article => ({ key: article.articleKey!, child: article })),
    ]),
  ]);
}

function runReport(runId: RunId, runDir: SafeDirectory, draft: TransientSectionedEditionCollectionDraft, compiled: CompiledSectionedEditionCollectionPackageSet): RunReport {
  const manifestBytes = canonicalSectionedEditionCollectionPackageBytes(compiled.manifest);
  const manifestPath = writeNewContainedFile(runDir, MANIFEST_BASENAME, manifestBytes);
  const packageFiles = compiled.packages.map(value => {
    const basename = `${value.package.shard.shardId}.json`;
    writeNewContainedFile(runDir, basename, value.persistedBytes);
    return { shardId: value.package.shard.shardId, path: basename, sha256: sha256(value.persistedBytes), persistedSha256: value.persistedSha256, bytes: value.persistedBytes.byteLength };
  });
  const readManifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(manifestPath)));
  const persistedBytes = packageFiles.map(value => readFileSync(assertSafeRegularFileWithin(runDir, value.path, `package ${value.shardId}`)));
  verifyPersistedPackageBytes(draft, persistedBytes, readManifest);
  assertReleaseManifestAttestation(compiled.manifest);
  for (const value of compiled.packages) assertReleasePackageAttestation(value.package);
  assertMaximalShards(compiled);
  const entries = childEntries(compiled);
  const maximum = entries.reduce((largest, entry) => entry.child.output.utf8Bytes > largest.child.output.utf8Bytes ? entry : largest);
  if (!maximum || entries.some(entry => entry.child.output.utf8Bytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes)) fail('per-child normalized-content limit validation failed');
  if (compiled.packages.some(value => value.package.shard.normalizedContentUtf8Bytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes)) fail('per-package normalized-content limit validation failed');
  if (compiled.packages.some(value => value.persistedBytes.byteLength > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes)) fail('per-package canonical-serialization limit validation failed');
  const partKeys: AquinasPackagePartKey[] = ['prima', 'prima-secundae', 'secunda-secundae', 'tertia'];
  const parts = partKeys.map(partKey => {
    const partPackages = compiled.packages.filter(value => value.package.shard.partKey === partKey);
    const questions = partPackages.flatMap(value => value.package.questions);
    return {
      partKey,
      questionCount: questions.length,
      articleCount: questions.reduce((total, question) => total + question.articles.length, 0),
      prologueCount: partPackages.filter(value => value.package.partPrologue !== null).length,
      normalizedContentUtf8Bytes: partPackages.reduce((total, value) => total + value.package.shard.normalizedContentUtf8Bytes, 0),
      shards: partPackages.map(value => ({
        shardId: value.package.shard.shardId,
        normalizedContentUtf8Bytes: value.package.shard.normalizedContentUtf8Bytes,
        canonicalSerializedPackageUtf8Bytes: value.persistedBytes.byteLength,
        contentHeadroom: SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes - value.package.shard.normalizedContentUtf8Bytes,
        serializedHeadroom: SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes - value.persistedBytes.byteLength,
      })),
    };
  });
  const q102 = compiled.packages.flatMap(value => value.package.questions).filter(question => question.questionKey.endsWith('.q102')).map(question => {
    const values = [
      { key: `${question.questionKey}.preamble`, child: question.preamble },
      ...question.articles.map(article => ({ key: article.articleKey!, child: article })),
    ];
    const child = values.reduce((largest, value) => value.child.output.utf8Bytes > largest.child.output.utf8Bytes ? value : largest);
    return { questionKey: question.questionKey, parentAggregateUtf8Bytes: question.output.utf8Bytes, childMaxKey: child.key, childMaxUtf8Bytes: child.child.output.utf8Bytes };
  });
  const byKind: Record<string, { count: number; utf8Bytes: number }> = {};
  for (const exclusion of draft.exclusions) {
    const current = byKind[exclusion.kind] ?? { count: 0, utf8Bytes: 0 };
    current.count += 1;
    current.utf8Bytes += exclusion.span.endByte - exclusion.span.startByte;
    byKind[exclusion.kind] = current;
  }
  return {
    runId,
    packageFiles,
    manifest: { path: MANIFEST_BASENAME, sha256: sha256(manifestBytes), bytes: manifestBytes.byteLength, aggregateSha256: compiled.manifest.aggregateSha256 },
    parts,
    maxChild: { key: maximum.key, utf8Bytes: maximum.child.output.utf8Bytes, headroom: SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes - maximum.child.output.utf8Bytes },
    q102,
    exclusions: { count: draft.exclusions.length, utf8Bytes: draft.exclusions.reduce((total, value) => total + value.span.endByte - value.span.startByte, 0), byKind },
    discrepancyCount: draft.discrepancies.length,
    checks: { fullCoverage: true, a1Attestation: true, releaseVerifier: true, childContentLimit: true, packageContentLimit: true, canonicalSerializedLimit: true, maximalShards: true },
  };
}
type ValidatedComparableRun = Readonly<{ report: RunReport; directory: SafeDirectory; files: ReadonlyMap<string, Uint8Array> }>;

function exactObject(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`${label} must be a plain exact object`);
  const observed = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (observed.length !== expected.length || observed.some((key, index) => key !== expected[index])) fail(`${label} has unreviewed keys`);
  return value as Record<string, unknown>;
}

function safeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} must be a nonnegative safe integer`);
  return value as number;
}

function sha256Value(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`${label} must be a SHA-256 hex value`);
  return value;
}

function requiredRelativeBasename(value: unknown, expected: string, label: string): string {
  if (typeof value !== 'string' || isAbsolute(value) || value.includes('/') || value.includes('\\') || value.includes('..') || value !== expected) fail(`${label} must equal the expected safe relative basename`);
  return value;
}

function validateComparableRun(outputRoot: SafeDirectory, runId: RunId): ValidatedComparableRun {
  const runPath = resolve(outputRoot.path, runId);
  assertLexicalDescendant(outputRoot.path, runPath, `${runId} directory`);
  const directory = assertSafeExistingDirectory(runPath, `${runId} directory`);
  assertRealpathDescendant(outputRoot.realpath, directory.realpath, `${runId} directory`);
  const reportPath = assertSafeRegularFileWithin(directory, 'run-report.json', `${runId} report`);
  let reportValue: unknown;
  try {
    reportValue = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(reportPath)));
  } catch {
    fail(`${runId} report is not strict JSON`);
  }
  const report = reportValue as RunReport;
  const root = exactObject(reportValue, ['runId', 'packageFiles', 'manifest', 'parts', 'maxChild', 'q102', 'exclusions', 'discrepancyCount', 'checks'], `${runId} report`);
  if (root.runId !== runId) fail(`${runId} report runId does not match its fixed directory`);
  if (!Array.isArray(root.packageFiles) || root.packageFiles.length !== PACKAGE_SHARD_IDS.length) fail(`${runId} report must contain the exact package file count`);
  const files = new Map<string, Uint8Array>();
  const manifest = exactObject(root.manifest, ['path', 'sha256', 'bytes', 'aggregateSha256'], `${runId} report manifest`);
  const manifestName = requiredRelativeBasename(manifest.path, MANIFEST_BASENAME, `${runId} report manifest.path`);
  const manifestBytes = readFileSync(assertSafeRegularFileWithin(directory, manifestName, `${runId} manifest`));
  if (safeInteger(manifest.bytes, `${runId} report manifest.bytes`) !== manifestBytes.byteLength || sha256Value(manifest.sha256, `${runId} report manifest.sha256`) !== sha256(manifestBytes)) fail(`${runId} report manifest byte or SHA evidence does not match the actual file`);
  files.set(manifestName, manifestBytes);
  const remaining = new Set(PACKAGE_SHARD_IDS);
  for (const [index, value] of root.packageFiles.entries()) {
    const entry = exactObject(value, ['shardId', 'path', 'sha256', 'persistedSha256', 'bytes'], `${runId} report packageFiles[${index}]`);
    if (typeof entry.shardId !== 'string' || !remaining.delete(entry.shardId as typeof PACKAGE_SHARD_IDS[number])) fail(`${runId} report has an unexpected or duplicate shard ID`);
    const basename = requiredRelativeBasename(entry.path, `${entry.shardId}.json`, `${runId} report packageFiles[${index}].path`);
    const bytes = readFileSync(assertSafeRegularFileWithin(directory, basename, `${runId} package ${entry.shardId}`));
    if (safeInteger(entry.bytes, `${runId} report packageFiles[${index}].bytes`) !== bytes.byteLength || sha256Value(entry.sha256, `${runId} report packageFiles[${index}].sha256`) !== sha256(bytes) || sha256Value(entry.persistedSha256, `${runId} report packageFiles[${index}].persistedSha256`) !== domainHash('bytes.v1', bytes)) fail(`${runId} report package byte or SHA evidence does not match the actual file`);
    files.set(basename, bytes);
  }
  if (remaining.size !== 0) fail(`${runId} report is missing an expected shard ID`);
  return { report, directory, files };
}

export function validateComparableRunAt(outputRoot: string, runId: RunId): void {
  validateComparableRun(assertSafeExistingDirectory(outputRoot, 'output directory'), runId);
}

function byteCompare(runA: ValidatedComparableRun, runB: ValidatedComparableRun): GateReport['byteCompare'] {
  if (runA.files.size !== runB.files.size || [...runA.files.keys()].some(name => !runB.files.has(name))) fail('independent runs emitted different package file names');
  const files = [...runA.files.keys()].sort().map(name => {
    const first = runA.files.get(name)!;
    const second = runB.files.get(name)!;
    if (first.byteLength !== second.byteLength || !first.every((value, index) => value === second[index])) fail(`independent runs differ for ${name}`);
    return { name, sha256: sha256(first), bytes: first.byteLength };
  });
  return { identical: true, files };
}

function parseArgs(argv: readonly string[]): Readonly<{ cacheRoot: string; outputRoot: string; phase: RunId | 'compare' }> {
  if (argv.length !== 6 || argv[0] !== '--cache-root' || argv[2] !== '--output-dir' || argv[4] !== '--phase' || !['run-a', 'run-b', 'compare'].includes(argv[5]!)) fail('use exactly --cache-root <pinned-a0-root> --output-dir <ignored-test-output-dir> --phase <run-a|run-b|compare>');
  return { cacheRoot: resolve(argv[1]!), outputRoot: resolve(argv[3]!), phase: argv[5]! as RunId | 'compare' };
}

function writeContentFree(directory: SafeDirectory, basename: string, value: unknown): Uint8Array {
  const bytes = canonicalSectionedEditionCollectionPackageBytes(value);
  writeNewContainedFile(directory, basename, bytes);
  return bytes;
}

function main(): void {
  const { cacheRoot, outputRoot, phase } = parseArgs(process.argv.slice(2));
  assertApprovedPaths(cacheRoot, outputRoot);
  if (phase === 'compare') {
    const safeOutput = assertSafeExistingDirectory(outputRoot, 'output directory');
    const reportA = validateComparableRun(safeOutput, 'run-a');
    const reportB = validateComparableRun(safeOutput, 'run-b');
    const report: GateReport = {
      schemaVersion: 'aquinas-gutenberg-gate-d-dry-compile-report.v1',
      sourceLockSha256: AQUINAS_A1_SOURCE_LOCK_SHA256,
      localReceiptSha256: AQUINAS_A1_LOCAL_RECEIPT_SHA256,
      topologyLockSha256: AQUINAS_A1_TOPOLOGY_LOCK_SHA256,
      discrepancyLedgerSha256: AQUINAS_A1_DISCREPANCY_LEDGER_SHA256,
      runs: [reportA.report, reportB.report],
      byteCompare: byteCompare(reportA, reportB),
    };
    const bytes = writeContentFree(safeOutput, 'report.json', report);
    process.stdout.write(`${new TextDecoder().decode(bytes)}\n`);
    return;
  }
  const topology = preflight(cacheRoot);
  const safeOutput = prepareSafeOutputRoot(outputRoot);
  const runDir = createSafeChildDirectory(safeOutput, phase, 'independent run directory');
  writeContentFree(runDir, 'preflight.json', {
    sourceLockSha256: AQUINAS_A1_SOURCE_LOCK_SHA256,
    localReceiptSha256: AQUINAS_A1_LOCAL_RECEIPT_SHA256,
    topologyLockSha256: AQUINAS_A1_TOPOLOGY_LOCK_SHA256,
    discrepancyLedgerSha256: AQUINAS_A1_DISCREPANCY_LEDGER_SHA256,
    a0Verified: true,
    a1TrackedBytesVerified: true,
  });
  const draft = buildDraft(cacheRoot, topology);
  writeContentFree(runDir, 'input-report.json', {
    questionCount: draft.questions.length,
    articleCount: draft.questions.reduce((count, question) => count + question.articles.length, 0),
    partPrologueCount: draft.partPrologues.length,
    typedRangeCount: draft.typedRangeCount,
    exclusionCount: draft.exclusions.length,
    discrepancyCount: draft.discrepancies.length,
    sourcePlansVerified: true,
    fullCoverageVerified: true,
  });
  const compiled = compileSectionedEditionCollectionPackage(draft);
  const report = runReport(phase, runDir, draft, compiled);
  const bytes = writeContentFree(runDir, 'run-report.json', report);
  process.stdout.write(`${new TextDecoder().decode(bytes)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'unknown failure'}\n`);
    process.exitCode = 1;
  }
}
