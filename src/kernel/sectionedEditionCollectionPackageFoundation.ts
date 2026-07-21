import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
import { sha256Hex } from './sha256.js';

/**
 * Gate C only: an inert, pure contract for a future reviewed sectioned-edition
 * package compiler. It is intentionally not exported from src/kernel/index.ts
 * and is not wired into a server, worker, catalog, or materialization path.
 *
 * The compiler accepts caller-provided source fragments. It does no I/O, never
 * discovers or reads an artifact, and has no Aquinas body data embedded in it.
 */

export const SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA = 'sectioned-edition-collection-package.v1' as const;
export const AQUINAS_GUTENBERG_A1_TOPOLOGY_LOCK_SHA256 = 'ce6197ba036ec7200f43513f9e6676ccfd5cb5a4727077a440770416bdf6978b' as const;
export const AQUINAS_GUTENBERG_A1_DISCREPANCY_LEDGER_SHA256 = 'c8e10cbf29d710b89fe48aa91d18f25489c96039116e53254d0592dfb0b68120' as const;

export const SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS = Object.freeze({
  contentChildUtf8Bytes: 131_072,
  packageContentUtf8Bytes: 4_194_304,
  canonicalSerializedPackageUtf8Bytes: 4_718_592,
  sourceBlocksPerChild: 4_096,
  sourceBlockRawUtf8Bytes: 1_048_576,
  questions: 512,
} as const);

export const SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY = 'parse5_entities_ascii_whitespace_br_lf_reviewed_blocks_nfc_only' as const;
export const SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS = 'brackets_preserved_exactly' as const;
export const SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS = 'mechanical_only_no_silent_correction' as const;

export type AquinasPackagePartKey = 'prima' | 'prima-secundae' | 'secunda-secundae' | 'tertia';

export const AQUINAS_PACKAGE_PARTS = Object.freeze([
  { key: 'prima', questions: 119 },
  { key: 'prima-secundae', questions: 114 },
  { key: 'secunda-secundae', questions: 189 },
  { key: 'tertia', questions: 90 },
] as const satisfies readonly Readonly<{ key: AquinasPackagePartKey; questions: number }>[]);

export interface SectionedEditionCollectionPackageSourceArtifact {
  artifactId: string;
  artifactSha256: string;
  locator: string;
}

export interface SectionedEditionCollectionPackageSpan {
  startByte: number;
  endByte: number;
  sha256: string;
}

export interface SectionedEditionCollectionPackageSourceBlock {
  span: SectionedEditionCollectionPackageSpan;
  html: string;
}

export interface SectionedEditionCollectionPackageSourceEvidence {
  artifactId: string;
  artifactSha256: string;
  span: SectionedEditionCollectionPackageSpan;
  blocks: SectionedEditionCollectionPackageSourceBlock[];
}

export interface SectionedEditionCollectionPackageOutputEvidence {
  startByte: number;
  endByte: number;
  utf8Bytes: number;
  sha256: string;
}

export interface SectionedEditionCollectionPackageRightsProvenance {
  subject: 'exact_edition_transcription';
  rightsReviewStatus: 'unreviewed' | 'reviewed';
  redistributionApproved: boolean;
  reviewReference: string;
  provenanceReference: string;
}

export interface SectionedEditionCollectionPackageExclusion {
  exclusionId: string;
  kind: 'editorial_interlude' | 'project_boilerplate' | 'non_authorial_note' | 'unresolved_source_region';
  disposition: 'excluded_without_normalization';
  reason: string;
  source: Omit<SectionedEditionCollectionPackageSourceEvidence, 'blocks'>;
}

export interface SectionedEditionCollectionPackageDiscrepancy {
  discrepancyRef: string;
  ledgerEntrySha256: string;
  resolutionStatus: 'preserved_without_correction';
}

interface SectionedEditionCollectionPackageChildCommon {
  source: SectionedEditionCollectionPackageSourceEvidence;
  bracketPreservationStatus: typeof SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS;
  correctionStatus: typeof SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS;
}

export interface SectionedEditionCollectionPackageDraftPreamble extends SectionedEditionCollectionPackageChildCommon {
  kind: 'preamble';
}

export interface SectionedEditionCollectionPackageDraftArticle extends SectionedEditionCollectionPackageChildCommon {
  kind: 'article';
  articleKey: string;
  ordinal: number;
}

export interface SectionedEditionCollectionPackageDraftQuestion {
  questionKey: string;
  partKey: AquinasPackagePartKey;
  source: Omit<SectionedEditionCollectionPackageSourceEvidence, 'blocks'>;
  sourceLocatorStatus: 'verified' | 'discrepancy_ledgered';
  discrepancyRefs: string[];
  preamble: SectionedEditionCollectionPackageDraftPreamble | null;
  articles: SectionedEditionCollectionPackageDraftArticle[];
}

export interface SectionedEditionCollectionPackageDraft {
  schemaVersion: typeof SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA;
  topology: {
    topologyLockSha256: typeof AQUINAS_GUTENBERG_A1_TOPOLOGY_LOCK_SHA256;
    discrepancyLedgerSha256: typeof AQUINAS_GUTENBERG_A1_DISCREPANCY_LEDGER_SHA256;
    orderedQuestionKeysSha256: string;
  };
  normalizationPolicy: typeof SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY;
  sourceArtifacts: SectionedEditionCollectionPackageSourceArtifact[];
  rightsProvenance: SectionedEditionCollectionPackageRightsProvenance;
  exclusions: SectionedEditionCollectionPackageExclusion[];
  discrepancyInventory: SectionedEditionCollectionPackageDiscrepancy[];
  questions: SectionedEditionCollectionPackageDraftQuestion[];
}

export interface SectionedEditionCollectionPackageCompiledPreamble extends SectionedEditionCollectionPackageDraftPreamble {
  content: string;
  output: SectionedEditionCollectionPackageOutputEvidence;
}

export interface SectionedEditionCollectionPackageCompiledArticle extends SectionedEditionCollectionPackageDraftArticle {
  content: string;
  output: SectionedEditionCollectionPackageOutputEvidence;
}

export interface SectionedEditionCollectionPackageCompiledQuestion {
  questionKey: string;
  partKey: AquinasPackagePartKey;
  source: Omit<SectionedEditionCollectionPackageSourceEvidence, 'blocks'>;
  output: SectionedEditionCollectionPackageOutputEvidence;
  sourceLocatorStatus: 'verified' | 'discrepancy_ledgered';
  discrepancyRefs: string[];
  preamble: SectionedEditionCollectionPackageCompiledPreamble | null;
  articles: SectionedEditionCollectionPackageCompiledArticle[];
}

export interface SectionedEditionCollectionPackageShard {
  shardId: string;
  partKey: AquinasPackagePartKey;
  ordinal: number;
  firstQuestionKey: string;
  lastQuestionKey: string;
  questionKeys: string[];
  normalizedContentUtf8Bytes: number;
}

export interface SectionedEditionCollectionPackage {
  schemaVersion: typeof SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA;
  topology: SectionedEditionCollectionPackageDraft['topology'];
  normalizationPolicy: typeof SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY;
  sourceArtifacts: SectionedEditionCollectionPackageSourceArtifact[];
  rightsProvenance: SectionedEditionCollectionPackageRightsProvenance;
  exclusions: SectionedEditionCollectionPackageExclusion[];
  discrepancyInventory: SectionedEditionCollectionPackageDiscrepancy[];
  shard: SectionedEditionCollectionPackageShard;
  questions: SectionedEditionCollectionPackageCompiledQuestion[];
}

export interface SectionedEditionCollectionPackageManifestShard {
  shardId: string;
  partKey: AquinasPackagePartKey;
  ordinal: number;
  firstQuestionKey: string;
  lastQuestionKey: string;
  questionKeys: string[];
  normalizedContentUtf8Bytes: number;
  canonicalSerializedPackageUtf8Bytes: number;
  canonicalPackageSha256: string;
}

export interface SectionedEditionCollectionPackageManifest {
  schemaVersion: typeof SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA;
  topologyLockSha256: typeof AQUINAS_GUTENBERG_A1_TOPOLOGY_LOCK_SHA256;
  discrepancyLedgerSha256: typeof AQUINAS_GUTENBERG_A1_DISCREPANCY_LEDGER_SHA256;
  orderedQuestionKeysSha256: string;
  shards: SectionedEditionCollectionPackageManifestShard[];
  aggregateSha256: string;
}

export interface CompiledSectionedEditionCollectionPackage {
  package: SectionedEditionCollectionPackage;
  canonicalJson: string;
  utf8Bytes: number;
  sha256: string;
}

export interface CompiledSectionedEditionCollectionPackageSet {
  manifest: SectionedEditionCollectionPackageManifest;
  packages: CompiledSectionedEditionCollectionPackage[];
}

export class SectionedEditionCollectionPackageValidationError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'SectionedEditionCollectionPackageValidationError';
  }
}

export function expectedAquinasPackageQuestionKeys(): readonly string[] {
  return AQUINAS_PACKAGE_PARTS.flatMap(part => Array.from(
    { length: part.questions },
    (_, index) => `${part.key}.q${String(index + 1).padStart(3, '0')}`,
  ));
}

export function orderedAquinasPackageQuestionKeysSha256(): string {
  return sha256Hex(canonicalSectionedEditionCollectionPackageJson(expectedAquinasPackageQuestionKeys()));
}

export function canonicalSectionedEditionCollectionPackageJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Validates an uncompiled, synthetic-or-reviewed draft. It does not read files
 * or infer boundaries. Every source and exclusion span is caller supplied.
 */
export function validateSectionedEditionCollectionPackageDraft(input: unknown): SectionedEditionCollectionPackageDraft {
  const root = objectAt(input, '$', [
    'schemaVersion', 'topology', 'normalizationPolicy', 'sourceArtifacts', 'rightsProvenance',
    'exclusions', 'discrepancyInventory', 'questions',
  ]);
  literalAt(root.schemaVersion, '$.schemaVersion', SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA);
  const topology = validateTopology(root.topology, '$.topology');
  literalAt(root.normalizationPolicy, '$.normalizationPolicy', SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY);
  const sourceArtifacts = arrayAt(root.sourceArtifacts, '$.sourceArtifacts', 1, 64)
    .map((value, index) => validateSourceArtifact(value, `$.sourceArtifacts[${index}]`));
  assertUnique(sourceArtifacts.map(value => value.artifactId), '$.sourceArtifacts', 'artifactId');
  const artifacts = new Map(sourceArtifacts.map(value => [value.artifactId, value] as const));
  const rightsProvenance = validateRightsProvenance(root.rightsProvenance, '$.rightsProvenance');
  const exclusions = arrayAt(root.exclusions, '$.exclusions', 0, 16_384)
    .map((value, index) => validateExclusion(value, `$.exclusions[${index}]`, artifacts));
  assertUnique(exclusions.map(value => value.exclusionId), '$.exclusions', 'exclusionId');
  assertNoOverlappingExclusions(exclusions);
  const discrepancyInventory = arrayAt(root.discrepancyInventory, '$.discrepancyInventory', 0, 16_384)
    .map((value, index) => validateDiscrepancy(value, `$.discrepancyInventory[${index}]`));
  assertUnique(discrepancyInventory.map(value => value.discrepancyRef), '$.discrepancyInventory', 'discrepancyRef');
  const discrepancyRefs = new Set(discrepancyInventory.map(value => value.discrepancyRef));
  const questions = arrayAt(root.questions, '$.questions', SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.questions, SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.questions)
    .map((value, index) => validateDraftQuestion(value, `$.questions[${index}]`, artifacts, discrepancyRefs));
  assertExactQuestionCoverage(questions, '$.questions');
  assertQuestionAndExclusionSeparation(questions, exclusions);
  literalAt(topology.orderedQuestionKeysSha256, '$.topology.orderedQuestionKeysSha256', orderedAquinasPackageQuestionKeysSha256());
  return {
    schemaVersion: SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA,
    topology,
    normalizationPolicy: SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY,
    sourceArtifacts,
    rightsProvenance,
    exclusions,
    discrepancyInventory,
    questions,
  };
}

/**
 * Purely normalizes caller-provided draft fragments, derives output evidence,
 * and creates maximal-prefix shards. No source acquisition or output writing is
 * performed here.
 */
export function compileSectionedEditionCollectionPackage(input: unknown): CompiledSectionedEditionCollectionPackageSet {
  const draft = validateSectionedEditionCollectionPackageDraft(input);
  const questions = compileQuestions(draft.questions);
  const packages = buildMaximalWithinPartPackages({ ...draft, questions });
  const manifest = buildManifest(packages, draft.topology);
  return { manifest, packages };
}

/** Strictly validates a compiled set, including all derived bytes, hashes, and maximal-prefix shards. */
export function validateCompiledSectionedEditionCollectionPackageSet(input: unknown): CompiledSectionedEditionCollectionPackageSet {
  const root = objectAt(input, '$', ['manifest', 'packages']);
  const packages = arrayAt(root.packages, '$.packages', 1, 512)
    .map((value, index) => validateCompiledPackage(value, `$.packages[${index}]`));
  const manifest = validateManifest(root.manifest, '$.manifest');
  const packageQuestions = packages.flatMap(value => value.package.questions);
  assertExactCompiledQuestionCoverage(packageQuestions, '$.packages');
  const first = packages[0]!.package;
  const expectedPackages = buildMaximalWithinPartPackages({
    schemaVersion: first.schemaVersion,
    topology: first.topology,
    normalizationPolicy: first.normalizationPolicy,
    sourceArtifacts: first.sourceArtifacts,
    rightsProvenance: first.rightsProvenance,
    exclusions: first.exclusions,
    discrepancyInventory: first.discrepancyInventory,
    questions: packageQuestions,
  });
  if (canonicalSectionedEditionCollectionPackageJson(packages) !== canonicalSectionedEditionCollectionPackageJson(expectedPackages)) {
    fail('$.packages', 'must be the exact deterministic maximal-prefix, within-part package sequence');
  }
  const expectedManifest = buildManifest(expectedPackages, first.topology);
  if (canonicalSectionedEditionCollectionPackageJson(manifest) !== canonicalSectionedEditionCollectionPackageJson(expectedManifest)) {
    fail('$.manifest', 'must bind the exact ordered coverage, package hashes, and aggregate hash');
  }
  return { manifest, packages };
}

function compileQuestions(questions: readonly SectionedEditionCollectionPackageDraftQuestion[]): SectionedEditionCollectionPackageCompiledQuestion[] {
  let cursor = 0;
  return questions.map((question, index) => {
    const path = `$.questions[${index}]`;
    const preamble = question.preamble === null ? null : compileChild(question.preamble, `${path}.preamble`, cursor);
    if (preamble) cursor = preamble.output.endByte;
    const articles = question.articles.map((article, articleIndex) => {
      const compiled = compileChild(article, `${path}.articles[${articleIndex}]`, cursor);
      cursor = compiled.output.endByte;
      return compiled;
    });
    const children = preamble ? [preamble, ...articles] : [...articles];
    const output = outputForRange(children, `${path}.output`);
    return {
      questionKey: question.questionKey,
      partKey: question.partKey,
      source: question.source,
      output,
      sourceLocatorStatus: question.sourceLocatorStatus,
      discrepancyRefs: question.discrepancyRefs,
      preamble,
      articles,
    };
  });
}

function compileChild<T extends SectionedEditionCollectionPackageDraftPreamble | SectionedEditionCollectionPackageDraftArticle>(
  child: T,
  path: string,
  startByte: number,
): T extends SectionedEditionCollectionPackageDraftPreamble
  ? SectionedEditionCollectionPackageCompiledPreamble
  : SectionedEditionCollectionPackageCompiledArticle {
  const content = child.source.blocks.map((block, index) => normalizeSyntheticReviewedBlock(block.html, `${path}.source.blocks[${index}].html`)).join('\n\n');
  assertNormalizedContent(content, `${path}.content`);
  const utf8Bytes = utf8Length(content);
  if (utf8Bytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes) {
    fail(`${path}.content`, `exceeds the content-bearing child limit of ${SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes} UTF-8 bytes`);
  }
  const output: SectionedEditionCollectionPackageOutputEvidence = {
    startByte,
    endByte: startByte + utf8Bytes,
    utf8Bytes,
    sha256: sha256Hex(content),
  };
  return { ...child, content, output } as unknown as T extends SectionedEditionCollectionPackageDraftPreamble
    ? SectionedEditionCollectionPackageCompiledPreamble
    : SectionedEditionCollectionPackageCompiledArticle;
}

function buildMaximalWithinPartPackages(input: Omit<SectionedEditionCollectionPackageDraft, 'questions'> & { questions: readonly SectionedEditionCollectionPackageCompiledQuestion[] }): CompiledSectionedEditionCollectionPackage[] {
  const packages: CompiledSectionedEditionCollectionPackage[] = [];
  for (const part of AQUINAS_PACKAGE_PARTS) {
    const partQuestions = input.questions.filter(question => question.partKey === part.key);
    let start = 0;
    let ordinal = 1;
    while (start < partQuestions.length) {
      let end = start;
      let contentBytes = 0;
      let candidate: SectionedEditionCollectionPackage | undefined;
      while (end < partQuestions.length) {
        const next = partQuestions[end]!;
        const nextContentBytes = contentBytes + next.output.utf8Bytes;
        if (nextContentBytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes) break;
        const selected = partQuestions.slice(start, end + 1);
        const packageValue = makePackage(input, part.key, ordinal, selected, nextContentBytes);
        const canonicalJson = canonicalSectionedEditionCollectionPackageJson(packageValue);
        if (utf8Length(canonicalJson) > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes) break;
        contentBytes = nextContentBytes;
        candidate = packageValue;
        end += 1;
      }
      if (!candidate) fail(`$.questions[${start}]`, 'one parent question cannot fit the reviewed package caps without splitting');
      const canonicalJson = canonicalSectionedEditionCollectionPackageJson(candidate);
      packages.push({ package: candidate, canonicalJson, utf8Bytes: utf8Length(canonicalJson), sha256: sha256Hex(canonicalJson) });
      start = end;
      ordinal += 1;
    }
  }
  return packages;
}

function makePackage(
  input: Omit<SectionedEditionCollectionPackageDraft, 'questions'> & { questions: readonly SectionedEditionCollectionPackageCompiledQuestion[] },
  partKey: AquinasPackagePartKey,
  ordinal: number,
  questions: readonly SectionedEditionCollectionPackageCompiledQuestion[],
  normalizedContentUtf8Bytes: number,
): SectionedEditionCollectionPackage {
  const questionKeys = questions.map(question => question.questionKey);
  return {
    schemaVersion: SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA,
    topology: input.topology,
    normalizationPolicy: SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY,
    sourceArtifacts: cloneArray(input.sourceArtifacts),
    rightsProvenance: { ...input.rightsProvenance },
    exclusions: cloneArray(input.exclusions),
    discrepancyInventory: cloneArray(input.discrepancyInventory),
    shard: {
      shardId: `aquinas-summa-pg-v1.${partKey}.shard-${String(ordinal).padStart(4, '0')}`,
      partKey,
      ordinal,
      firstQuestionKey: questionKeys[0]!,
      lastQuestionKey: questionKeys.at(-1)!,
      questionKeys,
      normalizedContentUtf8Bytes,
    },
    questions: cloneArray(questions),
  };
}

function buildManifest(
  packages: readonly CompiledSectionedEditionCollectionPackage[],
  topology: SectionedEditionCollectionPackageDraft['topology'],
): SectionedEditionCollectionPackageManifest {
  const shards = packages.map(compiled => ({
    shardId: compiled.package.shard.shardId,
    partKey: compiled.package.shard.partKey,
    ordinal: compiled.package.shard.ordinal,
    firstQuestionKey: compiled.package.shard.firstQuestionKey,
    lastQuestionKey: compiled.package.shard.lastQuestionKey,
    questionKeys: [...compiled.package.shard.questionKeys],
    normalizedContentUtf8Bytes: compiled.package.shard.normalizedContentUtf8Bytes,
    canonicalSerializedPackageUtf8Bytes: compiled.utf8Bytes,
    canonicalPackageSha256: compiled.sha256,
  }));
  const base = {
    schemaVersion: SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA,
    topologyLockSha256: topology.topologyLockSha256,
    discrepancyLedgerSha256: topology.discrepancyLedgerSha256,
    orderedQuestionKeysSha256: topology.orderedQuestionKeysSha256,
    shards,
  };
  return { ...base, aggregateSha256: sha256Hex(canonicalSectionedEditionCollectionPackageJson(base)) };
}

function validateCompiledPackage(input: unknown, path: string): CompiledSectionedEditionCollectionPackage {
  const root = objectAt(input, path, ['package', 'canonicalJson', 'utf8Bytes', 'sha256']);
  const packageValue = validatePackage(root.package, `${path}.package`);
  const canonicalJson = stringAt(root.canonicalJson, `${path}.canonicalJson`, 1_000_000_000);
  const utf8Bytes = integerAt(root.utf8Bytes, `${path}.utf8Bytes`, 1);
  const sha256 = shaAt(root.sha256, `${path}.sha256`);
  const expectedCanonicalJson = canonicalSectionedEditionCollectionPackageJson(packageValue);
  literalAt(canonicalJson, `${path}.canonicalJson`, expectedCanonicalJson);
  literalAt(utf8Bytes, `${path}.utf8Bytes`, utf8Length(expectedCanonicalJson));
  literalAt(sha256, `${path}.sha256`, sha256Hex(expectedCanonicalJson));
  if (utf8Bytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes) {
    fail(`${path}.utf8Bytes`, `exceeds the canonical serialized package cap of ${SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes}`);
  }
  return { package: packageValue, canonicalJson, utf8Bytes, sha256 };
}

function validatePackage(input: unknown, path: string): SectionedEditionCollectionPackage {
  const root = objectAt(input, path, [
    'schemaVersion', 'topology', 'normalizationPolicy', 'sourceArtifacts', 'rightsProvenance',
    'exclusions', 'discrepancyInventory', 'shard', 'questions',
  ]);
  literalAt(root.schemaVersion, `${path}.schemaVersion`, SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA);
  const topology = validateTopology(root.topology, `${path}.topology`);
  literalAt(root.normalizationPolicy, `${path}.normalizationPolicy`, SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY);
  const sourceArtifacts = arrayAt(root.sourceArtifacts, `${path}.sourceArtifacts`, 1, 64)
    .map((value, index) => validateSourceArtifact(value, `${path}.sourceArtifacts[${index}]`));
  assertUnique(sourceArtifacts.map(value => value.artifactId), `${path}.sourceArtifacts`, 'artifactId');
  const artifacts = new Map(sourceArtifacts.map(value => [value.artifactId, value] as const));
  const rightsProvenance = validateRightsProvenance(root.rightsProvenance, `${path}.rightsProvenance`);
  const exclusions = arrayAt(root.exclusions, `${path}.exclusions`, 0, 16_384)
    .map((value, index) => validateExclusion(value, `${path}.exclusions[${index}]`, artifacts));
  assertUnique(exclusions.map(value => value.exclusionId), `${path}.exclusions`, 'exclusionId');
  assertNoOverlappingExclusions(exclusions);
  const discrepancyInventory = arrayAt(root.discrepancyInventory, `${path}.discrepancyInventory`, 0, 16_384)
    .map((value, index) => validateDiscrepancy(value, `${path}.discrepancyInventory[${index}]`));
  assertUnique(discrepancyInventory.map(value => value.discrepancyRef), `${path}.discrepancyInventory`, 'discrepancyRef');
  const refs = new Set(discrepancyInventory.map(value => value.discrepancyRef));
  const questions = arrayAt(root.questions, `${path}.questions`, 1, 512)
    .map((value, index) => validateCompiledQuestion(value, `${path}.questions[${index}]`, artifacts, refs));
  assertQuestionAndExclusionSeparation(questions, exclusions);
  const shard = validateShard(root.shard, `${path}.shard`, questions);
  return {
    schemaVersion: SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA,
    topology,
    normalizationPolicy: SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY,
    sourceArtifacts,
    rightsProvenance,
    exclusions,
    discrepancyInventory,
    shard,
    questions,
  };
}

function validateCompiledQuestion(
  input: unknown,
  path: string,
  artifacts: ReadonlyMap<string, SectionedEditionCollectionPackageSourceArtifact>,
  discrepancyRefs: ReadonlySet<string>,
): SectionedEditionCollectionPackageCompiledQuestion {
  const root = objectAt(input, path, ['questionKey', 'partKey', 'source', 'output', 'sourceLocatorStatus', 'discrepancyRefs', 'preamble', 'articles']);
  const question = validateQuestionCommon(root, path, artifacts, discrepancyRefs);
  const preamble = root.preamble === null ? null : validateCompiledPreamble(root.preamble, `${path}.preamble`, artifacts);
  const articles = arrayAt(root.articles, `${path}.articles`, 1, 1_024)
    .map((value, index) => validateCompiledArticle(value, `${path}.articles[${index}]`, artifacts, question.questionKey));
  assertArticleSequence(articles, path, question.questionKey);
  const children = preamble ? [preamble, ...articles] : [...articles];
  assertExactSourceChildCoverage(question.source.span, children.map(child => child.source), `${path}.source.span`);
  const expectedOutput = outputForRange(children, `${path}.output`);
  const output = validateOutputEvidence(root.output, `${path}.output`);
  equalCanonical(output, expectedOutput, `${path}.output`, 'must exactly bind derived child output evidence');
  return { ...question, output, preamble, articles };
}

function validateCompiledPreamble(
  input: unknown,
  path: string,
  artifacts: ReadonlyMap<string, SectionedEditionCollectionPackageSourceArtifact>,
): SectionedEditionCollectionPackageCompiledPreamble {
  const root = objectAt(input, path, ['kind', 'source', 'bracketPreservationStatus', 'correctionStatus', 'content', 'output']);
  literalAt(root.kind, `${path}.kind`, 'preamble');
  const source = validateSourceEvidence(root.source, `${path}.source`, artifacts);
  validateChildPolicies(root, path);
  const content = stringAt(root.content, `${path}.content`, SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes);
  const expectedContent = source.blocks.map((block, index) => normalizeSyntheticReviewedBlock(block.html, `${path}.source.blocks[${index}].html`)).join('\n\n');
  literalAt(content, `${path}.content`, expectedContent);
  assertNormalizedContent(content, `${path}.content`);
  const output = validateOutputEvidence(root.output, `${path}.output`);
  assertOutputContentHonesty(content, output, `${path}.output`);
  return {
    kind: 'preamble', source,
    bracketPreservationStatus: SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS,
    correctionStatus: SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS,
    content, output,
  };
}

function validateCompiledArticle(
  input: unknown,
  path: string,
  artifacts: ReadonlyMap<string, SectionedEditionCollectionPackageSourceArtifact>,
  questionKey: string,
): SectionedEditionCollectionPackageCompiledArticle {
  const root = objectAt(input, path, ['kind', 'articleKey', 'ordinal', 'source', 'bracketPreservationStatus', 'correctionStatus', 'content', 'output']);
  literalAt(root.kind, `${path}.kind`, 'article');
  const ordinal = integerAt(root.ordinal, `${path}.ordinal`, 1);
  const articleKey = questionArticleKey(questionKey, ordinal);
  literalAt(root.articleKey, `${path}.articleKey`, articleKey);
  const source = validateSourceEvidence(root.source, `${path}.source`, artifacts);
  validateChildPolicies(root, path);
  const content = stringAt(root.content, `${path}.content`, SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes);
  const expectedContent = source.blocks.map((block, index) => normalizeSyntheticReviewedBlock(block.html, `${path}.source.blocks[${index}].html`)).join('\n\n');
  literalAt(content, `${path}.content`, expectedContent);
  assertNormalizedContent(content, `${path}.content`);
  const output = validateOutputEvidence(root.output, `${path}.output`);
  assertOutputContentHonesty(content, output, `${path}.output`);
  return {
    kind: 'article', articleKey, ordinal, source,
    bracketPreservationStatus: SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS,
    correctionStatus: SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS,
    content, output,
  };
}

function validateDraftQuestion(
  input: unknown,
  path: string,
  artifacts: ReadonlyMap<string, SectionedEditionCollectionPackageSourceArtifact>,
  discrepancyRefs: ReadonlySet<string>,
): SectionedEditionCollectionPackageDraftQuestion {
  const root = objectAt(input, path, ['questionKey', 'partKey', 'source', 'sourceLocatorStatus', 'discrepancyRefs', 'preamble', 'articles']);
  const question = validateQuestionCommon(root, path, artifacts, discrepancyRefs);
  const preamble = root.preamble === null ? null : validateDraftPreamble(root.preamble, `${path}.preamble`, artifacts);
  const articles = arrayAt(root.articles, `${path}.articles`, 1, 1_024)
    .map((value, index) => validateDraftArticle(value, `${path}.articles[${index}]`, artifacts, question.questionKey));
  assertArticleSequence(articles, path, question.questionKey);
  const children = preamble ? [preamble, ...articles] : [...articles];
  assertExactSourceChildCoverage(question.source.span, children.map(child => child.source), `${path}.source.span`);
  return { ...question, preamble, articles };
}

function validateQuestionCommon(
  root: Record<string, unknown>,
  path: string,
  artifacts: ReadonlyMap<string, SectionedEditionCollectionPackageSourceArtifact>,
  discrepancyRefs: ReadonlySet<string>,
): Omit<SectionedEditionCollectionPackageDraftQuestion, 'preamble' | 'articles'> {
  const questionKey = questionKeyAt(root.questionKey, `${path}.questionKey`);
  const partKey = partForQuestionKey(questionKey);
  literalAt(root.partKey, `${path}.partKey`, partKey);
  const source = validateSourceAggregate(root.source, `${path}.source`, artifacts);
  const sourceLocatorStatus = enumAt(root.sourceLocatorStatus, `${path}.sourceLocatorStatus`, ['verified', 'discrepancy_ledgered'] as const);
  const refs = arrayAt(root.discrepancyRefs, `${path}.discrepancyRefs`, 0, 16_384)
    .map((value, index) => safeIdAt(value, `${path}.discrepancyRefs[${index}]`));
  assertUnique(refs, `${path}.discrepancyRefs`, 'discrepancy ref');
  for (const ref of refs) if (!discrepancyRefs.has(ref)) fail(`${path}.discrepancyRefs`, `references unknown discrepancy ${ref}`);
  if (sourceLocatorStatus === 'verified' && refs.length !== 0) fail(`${path}.discrepancyRefs`, 'must be empty when sourceLocatorStatus is verified');
  if (sourceLocatorStatus === 'discrepancy_ledgered' && refs.length === 0) fail(`${path}.discrepancyRefs`, 'must record an explicit reviewed discrepancy reference');
  return { questionKey, partKey, source, sourceLocatorStatus, discrepancyRefs: refs };
}

function validateDraftPreamble(
  input: unknown,
  path: string,
  artifacts: ReadonlyMap<string, SectionedEditionCollectionPackageSourceArtifact>,
): SectionedEditionCollectionPackageDraftPreamble {
  const root = objectAt(input, path, ['kind', 'source', 'bracketPreservationStatus', 'correctionStatus']);
  literalAt(root.kind, `${path}.kind`, 'preamble');
  const source = validateSourceEvidence(root.source, `${path}.source`, artifacts);
  validateChildPolicies(root, path);
  return {
    kind: 'preamble', source,
    bracketPreservationStatus: SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS,
    correctionStatus: SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS,
  };
}

function validateDraftArticle(
  input: unknown,
  path: string,
  artifacts: ReadonlyMap<string, SectionedEditionCollectionPackageSourceArtifact>,
  questionKey: string,
): SectionedEditionCollectionPackageDraftArticle {
  const root = objectAt(input, path, ['kind', 'articleKey', 'ordinal', 'source', 'bracketPreservationStatus', 'correctionStatus']);
  literalAt(root.kind, `${path}.kind`, 'article');
  const ordinal = integerAt(root.ordinal, `${path}.ordinal`, 1);
  const articleKey = questionArticleKey(questionKey, ordinal);
  literalAt(root.articleKey, `${path}.articleKey`, articleKey);
  const source = validateSourceEvidence(root.source, `${path}.source`, artifacts);
  validateChildPolicies(root, path);
  return {
    kind: 'article', articleKey, ordinal, source,
    bracketPreservationStatus: SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS,
    correctionStatus: SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS,
  };
}

function validateChildPolicies(root: Record<string, unknown>, path: string): void {
  literalAt(root.bracketPreservationStatus, `${path}.bracketPreservationStatus`, SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS);
  literalAt(root.correctionStatus, `${path}.correctionStatus`, SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS);
}

function validateTopology(input: unknown, path: string): SectionedEditionCollectionPackageDraft['topology'] {
  const root = objectAt(input, path, ['topologyLockSha256', 'discrepancyLedgerSha256', 'orderedQuestionKeysSha256']);
  literalAt(root.topologyLockSha256, `${path}.topologyLockSha256`, AQUINAS_GUTENBERG_A1_TOPOLOGY_LOCK_SHA256);
  literalAt(root.discrepancyLedgerSha256, `${path}.discrepancyLedgerSha256`, AQUINAS_GUTENBERG_A1_DISCREPANCY_LEDGER_SHA256);
  return {
    topologyLockSha256: AQUINAS_GUTENBERG_A1_TOPOLOGY_LOCK_SHA256,
    discrepancyLedgerSha256: AQUINAS_GUTENBERG_A1_DISCREPANCY_LEDGER_SHA256,
    orderedQuestionKeysSha256: shaAt(root.orderedQuestionKeysSha256, `${path}.orderedQuestionKeysSha256`),
  };
}

function validateSourceArtifact(input: unknown, path: string): SectionedEditionCollectionPackageSourceArtifact {
  const root = objectAt(input, path, ['artifactId', 'artifactSha256', 'locator']);
  return {
    artifactId: safeIdAt(root.artifactId, `${path}.artifactId`),
    artifactSha256: shaAt(root.artifactSha256, `${path}.artifactSha256`),
    locator: textAt(root.locator, `${path}.locator`, 2_048),
  };
}

function validateRightsProvenance(input: unknown, path: string): SectionedEditionCollectionPackageRightsProvenance {
  const root = objectAt(input, path, ['subject', 'rightsReviewStatus', 'redistributionApproved', 'reviewReference', 'provenanceReference']);
  literalAt(root.subject, `${path}.subject`, 'exact_edition_transcription');
  const rightsReviewStatus = enumAt(root.rightsReviewStatus, `${path}.rightsReviewStatus`, ['unreviewed', 'reviewed'] as const);
  if (typeof root.redistributionApproved !== 'boolean') fail(`${path}.redistributionApproved`, 'must be a boolean');
  return {
    subject: 'exact_edition_transcription',
    rightsReviewStatus,
    redistributionApproved: root.redistributionApproved,
    reviewReference: textAt(root.reviewReference, `${path}.reviewReference`, 4_096),
    provenanceReference: textAt(root.provenanceReference, `${path}.provenanceReference`, 4_096),
  };
}

function validateExclusion(
  input: unknown,
  path: string,
  artifacts: ReadonlyMap<string, SectionedEditionCollectionPackageSourceArtifact>,
): SectionedEditionCollectionPackageExclusion {
  const root = objectAt(input, path, ['exclusionId', 'kind', 'disposition', 'reason', 'source']);
  literalAt(root.disposition, `${path}.disposition`, 'excluded_without_normalization');
  const source = validateSourceAggregate(root.source, `${path}.source`, artifacts);
  return {
    exclusionId: safeIdAt(root.exclusionId, `${path}.exclusionId`),
    kind: enumAt(root.kind, `${path}.kind`, ['editorial_interlude', 'project_boilerplate', 'non_authorial_note', 'unresolved_source_region'] as const),
    disposition: 'excluded_without_normalization',
    reason: textAt(root.reason, `${path}.reason`, 4_096),
    source,
  };
}

function validateDiscrepancy(input: unknown, path: string): SectionedEditionCollectionPackageDiscrepancy {
  const root = objectAt(input, path, ['discrepancyRef', 'ledgerEntrySha256', 'resolutionStatus']);
  literalAt(root.resolutionStatus, `${path}.resolutionStatus`, 'preserved_without_correction');
  return {
    discrepancyRef: safeIdAt(root.discrepancyRef, `${path}.discrepancyRef`),
    ledgerEntrySha256: shaAt(root.ledgerEntrySha256, `${path}.ledgerEntrySha256`),
    resolutionStatus: 'preserved_without_correction',
  };
}

function validateSourceAggregate(
  input: unknown,
  path: string,
  artifacts: ReadonlyMap<string, SectionedEditionCollectionPackageSourceArtifact>,
): Omit<SectionedEditionCollectionPackageSourceEvidence, 'blocks'> {
  const root = objectAt(input, path, ['artifactId', 'artifactSha256', 'span']);
  const artifactId = safeIdAt(root.artifactId, `${path}.artifactId`);
  const artifact = artifacts.get(artifactId);
  if (!artifact) fail(`${path}.artifactId`, 'must reference a declared source artifact');
  const artifactSha256 = shaAt(root.artifactSha256, `${path}.artifactSha256`);
  literalAt(artifactSha256, `${path}.artifactSha256`, artifact.artifactSha256);
  return { artifactId, artifactSha256, span: validateSpan(root.span, `${path}.span`) };
}

function validateSourceEvidence(
  input: unknown,
  path: string,
  artifacts: ReadonlyMap<string, SectionedEditionCollectionPackageSourceArtifact>,
): SectionedEditionCollectionPackageSourceEvidence {
  const root = objectAt(input, path, ['artifactId', 'artifactSha256', 'span', 'blocks']);
  const aggregate = validateSourceAggregate({ artifactId: root.artifactId, artifactSha256: root.artifactSha256, span: root.span }, path, artifacts);
  const blocks = arrayAt(root.blocks, `${path}.blocks`, 1, SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.sourceBlocksPerChild)
    .map((value, index) => validateSourceBlock(value, `${path}.blocks[${index}]`));
  assertExactBlockCoverage(aggregate.span, blocks, `${path}.span`);
  return { ...aggregate, blocks };
}

function validateSourceBlock(input: unknown, path: string): SectionedEditionCollectionPackageSourceBlock {
  const root = objectAt(input, path, ['span', 'html']);
  const html = textAt(root.html, `${path}.html`, SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.sourceBlockRawUtf8Bytes);
  if (utf8Length(html) > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.sourceBlockRawUtf8Bytes) fail(`${path}.html`, `exceeds the bounded raw source block size of ${SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.sourceBlockRawUtf8Bytes} UTF-8 bytes`);
  const span = validateSpan(root.span, `${path}.span`);
  if (span.endByte - span.startByte !== utf8Length(html)) fail(`${path}.span`, 'must exactly cover the UTF-8 source fragment');
  literalAt(span.sha256, `${path}.span.sha256`, sha256Hex(html));
  return { span, html };
}

function validateSpan(input: unknown, path: string): SectionedEditionCollectionPackageSpan {
  const root = objectAt(input, path, ['startByte', 'endByte', 'sha256']);
  const startByte = integerAt(root.startByte, `${path}.startByte`, 0);
  const endByte = integerAt(root.endByte, `${path}.endByte`, startByte + 1);
  return { startByte, endByte, sha256: shaAt(root.sha256, `${path}.sha256`) };
}

function validateOutputEvidence(input: unknown, path: string): SectionedEditionCollectionPackageOutputEvidence {
  const root = objectAt(input, path, ['startByte', 'endByte', 'utf8Bytes', 'sha256']);
  const startByte = integerAt(root.startByte, `${path}.startByte`, 0);
  const endByte = integerAt(root.endByte, `${path}.endByte`, startByte);
  const utf8Bytes = integerAt(root.utf8Bytes, `${path}.utf8Bytes`, 1);
  if (endByte - startByte !== utf8Bytes) fail(path, 'must bind an output span whose byte length equals utf8Bytes');
  return { startByte, endByte, utf8Bytes, sha256: shaAt(root.sha256, `${path}.sha256`) };
}

function validateShard(input: unknown, path: string, questions: readonly SectionedEditionCollectionPackageCompiledQuestion[]): SectionedEditionCollectionPackageShard {
  const root = objectAt(input, path, ['shardId', 'partKey', 'ordinal', 'firstQuestionKey', 'lastQuestionKey', 'questionKeys', 'normalizedContentUtf8Bytes']);
  const partKey = enumAt(root.partKey, `${path}.partKey`, AQUINAS_PACKAGE_PARTS.map(part => part.key));
  const ordinal = integerAt(root.ordinal, `${path}.ordinal`, 1);
  const questionKeys = arrayAt(root.questionKeys, `${path}.questionKeys`, 1, 512)
    .map((value, index) => questionKeyAt(value, `${path}.questionKeys[${index}]`));
  const expectedKeys = questions.map(question => question.questionKey);
  equalCanonical(questionKeys, expectedKeys, `${path}.questionKeys`, 'must exactly preserve package question order');
  if (questions.some(question => question.partKey !== partKey)) fail(`${path}.partKey`, 'must not cross a frozen part boundary');
  const expectedShardId = `aquinas-summa-pg-v1.${partKey}.shard-${String(ordinal).padStart(4, '0')}`;
  literalAt(root.shardId, `${path}.shardId`, expectedShardId);
  literalAt(root.firstQuestionKey, `${path}.firstQuestionKey`, questionKeys[0]!);
  literalAt(root.lastQuestionKey, `${path}.lastQuestionKey`, questionKeys.at(-1)!);
  const normalizedContentUtf8Bytes = integerAt(root.normalizedContentUtf8Bytes, `${path}.normalizedContentUtf8Bytes`, 1);
  const expectedContentBytes = questions.reduce((total, question) => total + question.output.utf8Bytes, 0);
  literalAt(normalizedContentUtf8Bytes, `${path}.normalizedContentUtf8Bytes`, expectedContentBytes);
  if (normalizedContentUtf8Bytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes) {
    fail(`${path}.normalizedContentUtf8Bytes`, `exceeds the package content cap of ${SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes}`);
  }
  return {
    shardId: expectedShardId,
    partKey,
    ordinal,
    firstQuestionKey: questionKeys[0]!,
    lastQuestionKey: questionKeys.at(-1)!,
    questionKeys,
    normalizedContentUtf8Bytes,
  };
}

function validateManifest(input: unknown, path: string): SectionedEditionCollectionPackageManifest {
  const root = objectAt(input, path, ['schemaVersion', 'topologyLockSha256', 'discrepancyLedgerSha256', 'orderedQuestionKeysSha256', 'shards', 'aggregateSha256']);
  literalAt(root.schemaVersion, `${path}.schemaVersion`, SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA);
  literalAt(root.topologyLockSha256, `${path}.topologyLockSha256`, AQUINAS_GUTENBERG_A1_TOPOLOGY_LOCK_SHA256);
  literalAt(root.discrepancyLedgerSha256, `${path}.discrepancyLedgerSha256`, AQUINAS_GUTENBERG_A1_DISCREPANCY_LEDGER_SHA256);
  literalAt(root.orderedQuestionKeysSha256, `${path}.orderedQuestionKeysSha256`, orderedAquinasPackageQuestionKeysSha256());
  const shards = arrayAt(root.shards, `${path}.shards`, 1, 512).map((value, index) => validateManifestShard(value, `${path}.shards[${index}]`));
  const flattened = shards.flatMap(shard => shard.questionKeys);
  equalCanonical(flattened, expectedAquinasPackageQuestionKeys(), `${path}.shards`, 'must provide exact ordered full coverage');
  const base = {
    schemaVersion: SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA,
    topologyLockSha256: AQUINAS_GUTENBERG_A1_TOPOLOGY_LOCK_SHA256,
    discrepancyLedgerSha256: AQUINAS_GUTENBERG_A1_DISCREPANCY_LEDGER_SHA256,
    orderedQuestionKeysSha256: orderedAquinasPackageQuestionKeysSha256(),
    shards,
  };
  const aggregateSha256 = shaAt(root.aggregateSha256, `${path}.aggregateSha256`);
  literalAt(aggregateSha256, `${path}.aggregateSha256`, sha256Hex(canonicalSectionedEditionCollectionPackageJson(base)));
  return { ...base, aggregateSha256 };
}

function validateManifestShard(input: unknown, path: string): SectionedEditionCollectionPackageManifestShard {
  const root = objectAt(input, path, ['shardId', 'partKey', 'ordinal', 'firstQuestionKey', 'lastQuestionKey', 'questionKeys', 'normalizedContentUtf8Bytes', 'canonicalSerializedPackageUtf8Bytes', 'canonicalPackageSha256']);
  const partKey = enumAt(root.partKey, `${path}.partKey`, AQUINAS_PACKAGE_PARTS.map(part => part.key));
  const ordinal = integerAt(root.ordinal, `${path}.ordinal`, 1);
  const questionKeys = arrayAt(root.questionKeys, `${path}.questionKeys`, 1, 512)
    .map((value, index) => questionKeyAt(value, `${path}.questionKeys[${index}]`));
  if (questionKeys.some(key => partForQuestionKey(key) !== partKey)) fail(`${path}.questionKeys`, 'must remain within its frozen part');
  const shardId = `aquinas-summa-pg-v1.${partKey}.shard-${String(ordinal).padStart(4, '0')}`;
  literalAt(root.shardId, `${path}.shardId`, shardId);
  literalAt(root.firstQuestionKey, `${path}.firstQuestionKey`, questionKeys[0]!);
  literalAt(root.lastQuestionKey, `${path}.lastQuestionKey`, questionKeys.at(-1)!);
  const normalizedContentUtf8Bytes = integerAt(root.normalizedContentUtf8Bytes, `${path}.normalizedContentUtf8Bytes`, 1);
  if (normalizedContentUtf8Bytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes) fail(`${path}.normalizedContentUtf8Bytes`, 'exceeds the package content cap');
  const canonicalSerializedPackageUtf8Bytes = integerAt(root.canonicalSerializedPackageUtf8Bytes, `${path}.canonicalSerializedPackageUtf8Bytes`, 1);
  if (canonicalSerializedPackageUtf8Bytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes) fail(`${path}.canonicalSerializedPackageUtf8Bytes`, 'exceeds the canonical serialized package cap');
  return {
    shardId,
    partKey,
    ordinal,
    firstQuestionKey: questionKeys[0]!,
    lastQuestionKey: questionKeys.at(-1)!,
    questionKeys,
    normalizedContentUtf8Bytes,
    canonicalSerializedPackageUtf8Bytes,
    canonicalPackageSha256: shaAt(root.canonicalPackageSha256, `${path}.canonicalPackageSha256`),
  };
}

/** The only permitted body transformation. Source HTML is supplied by callers and no tag layout is inferred. */
export function normalizeSyntheticReviewedBlock(html: string, path = 'html'): string {
  assertTextUnicode(html, path, true);
  const parseErrors: string[] = [];
  const fragment = parseFragment(html, { onParseError: error => parseErrors.push(error.code) });
  if (parseErrors.length > 0) fail(path, `parse5 rejected malformed source markup (${parseErrors[0]})`);
  const raw = flattenReviewedNodes(fragment.childNodes, path);
  const normalized = raw
    .replace(/[\u0009-\u000d\u0020]+/g, ' ')
    .replace(/ *\uE000 */g, '\n')
    .normalize('NFC')
    .replace(/^ +| +$/g, '');
  assertNormalizedContent(normalized, path);
  return normalized;
}

function flattenReviewedNodes(nodes: readonly DefaultTreeAdapterTypes.ChildNode[], path: string): string {
  const pieces: string[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    if (node.nodeName === '#text' && 'value' in node) {
      pieces.push(node.value);
      continue;
    }
    if ('tagName' in node && node.tagName === 'br') {
      if (node.attrs.length !== 0 || node.childNodes.length !== 0) fail(`${path}[${index}]`, 'reviewed blocks permit only attribute-free br elements');
      pieces.push('\uE000');
      continue;
    }
    fail(`${path}[${index}]`, 'reviewed blocks permit text, parse5 entities, and br only; reviewed boundaries must be supplied by the caller');
  }
  return pieces.join('');
}

function outputForRange(
  children: readonly (SectionedEditionCollectionPackageCompiledPreamble | SectionedEditionCollectionPackageCompiledArticle)[],
  path: string,
): SectionedEditionCollectionPackageOutputEvidence {
  if (children.length === 0) fail(path, 'requires at least one content-bearing child');
  let cursor = children[0]!.output.startByte;
  let bytes = 0;
  for (const child of children) {
    if (child.output.startByte !== cursor) fail(path, 'child output spans must be contiguous without gaps or overlaps');
    cursor = child.output.endByte;
    bytes += child.output.utf8Bytes;
  }
  const content = children.map(child => child.content).join('');
  return {
    startByte: children[0]!.output.startByte,
    endByte: cursor,
    utf8Bytes: bytes,
    sha256: sha256Hex(content),
  };
}

function assertOutputContentHonesty(content: string, output: SectionedEditionCollectionPackageOutputEvidence, path: string): void {
  const bytes = utf8Length(content);
  literalAt(output.utf8Bytes, `${path}.utf8Bytes`, bytes);
  if (output.endByte - output.startByte !== bytes) fail(path, 'must have exactly-sized output bounds');
  literalAt(output.sha256, `${path}.sha256`, sha256Hex(content));
  if (bytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes) fail(path, 'exceeds the content-bearing child limit');
}

function assertExactBlockCoverage(
  parent: SectionedEditionCollectionPackageSpan,
  blocks: readonly SectionedEditionCollectionPackageSourceBlock[],
  path: string,
): void {
  let cursor = parent.startByte;
  let source = '';
  for (const block of blocks) {
    if (block.span.startByte !== cursor) fail(path, 'reviewed source blocks must have no gaps or overlaps');
    cursor = block.span.endByte;
    source += block.html;
  }
  if (cursor !== parent.endByte) fail(path, 'reviewed source blocks must exactly cover the parent source span');
  literalAt(parent.sha256, `${path}.sha256`, sha256Hex(source));
}

function assertExactSourceChildCoverage(
  parent: SectionedEditionCollectionPackageSpan,
  children: readonly SectionedEditionCollectionPackageSourceEvidence[],
  path: string,
): void {
  let cursor = parent.startByte;
  let sourceHashMaterial = '';
  for (const child of children) {
    if (child.artifactId !== children[0]!.artifactId || child.artifactSha256 !== children[0]!.artifactSha256) fail(path, 'a question parent must not combine source artifacts');
    if (child.span.startByte !== cursor) fail(path, 'content child source spans must have no gaps or overlaps');
    cursor = child.span.endByte;
    sourceHashMaterial += child.blocks.map(block => block.html).join('');
  }
  if (cursor !== parent.endByte) fail(path, 'content child source spans must exactly cover the parent source span');
  literalAt(parent.sha256, `${path}.sha256`, sha256Hex(sourceHashMaterial));
}

function assertQuestionAndExclusionSeparation(
  questions: readonly Pick<SectionedEditionCollectionPackageDraftQuestion, 'source'>[],
  exclusions: readonly SectionedEditionCollectionPackageExclusion[],
): void {
  for (const exclusion of exclusions) for (const question of questions) {
    if (exclusion.source.artifactId !== question.source.artifactId) continue;
    if (rangesOverlap(exclusion.source.span, question.source.span)) fail('$.exclusions', `must not overlap authorial question source span ${question.source.artifactId}`);
  }
}

function assertNoOverlappingExclusions(exclusions: readonly SectionedEditionCollectionPackageExclusion[]): void {
  for (let index = 0; index < exclusions.length; index += 1) for (let later = index + 1; later < exclusions.length; later += 1) {
    const left = exclusions[index]!;
    const right = exclusions[later]!;
    if (left.source.artifactId === right.source.artifactId && rangesOverlap(left.source.span, right.source.span)) fail('$.exclusions', 'must not contain overlapping source spans');
  }
}

function assertExactQuestionCoverage(questions: readonly SectionedEditionCollectionPackageDraftQuestion[], path: string): void {
  equalCanonical(questions.map(question => question.questionKey), expectedAquinasPackageQuestionKeys(), path, 'must provide exact ordered A1 topology coverage');
}

function assertExactCompiledQuestionCoverage(questions: readonly SectionedEditionCollectionPackageCompiledQuestion[], path: string): void {
  equalCanonical(questions.map(question => question.questionKey), expectedAquinasPackageQuestionKeys(), path, 'must provide exact ordered A1 topology coverage');
  let cursor = 0;
  for (const question of questions) {
    if (question.output.startByte !== cursor) fail(path, 'question output spans must have no gaps or overlaps');
    cursor = question.output.endByte;
  }
}

function assertArticleSequence(
  articles: readonly Pick<SectionedEditionCollectionPackageDraftArticle, 'articleKey' | 'ordinal'>[],
  path: string,
  questionKey: string,
): void {
  for (let index = 0; index < articles.length; index += 1) {
    const article = articles[index]!;
    const ordinal = index + 1;
    if (article.ordinal !== ordinal) fail(`${path}.articles[${index}].ordinal`, `must be contiguous; expected ${ordinal}`);
    literalAt(article.articleKey, `${path}.articles[${index}].articleKey`, questionArticleKey(questionKey, ordinal));
  }
}

function assertNormalizedContent(content: string, path: string): void {
  assertTextUnicode(content, path, true);
  if (content.length === 0) fail(path, 'must contain nonempty normalized text');
  if (content !== content.normalize('NFC')) fail(path, 'must be NFC normalized');
  if (/[\t\v\f\r]/.test(content)) fail(path, 'must contain only normalized ASCII whitespace');
  if (/^ | $| \n|\n /.test(content)) fail(path, 'must not retain unreviewed whitespace around br-derived line feeds');
}

function questionKeyAt(value: unknown, path: string): string {
  const key = safeAsciiAt(value, path, /^[a-z]+(?:-[a-z]+)*\.q\d{3}$/);
  if (!expectedAquinasPackageQuestionKeys().includes(key)) fail(path, 'is not an exact frozen A1 question key');
  return key;
}

function questionArticleKey(questionKey: string, ordinal: number): string {
  return `${questionKey}.a${String(ordinal).padStart(3, '0')}`;
}

function partForQuestionKey(questionKey: string): AquinasPackagePartKey {
  for (const part of AQUINAS_PACKAGE_PARTS) if (questionKey.startsWith(`${part.key}.q`)) return part.key;
  fail('questionKey', 'does not use a frozen part key');
}

function rangesOverlap(left: SectionedEditionCollectionPackageSpan, right: SectionedEditionCollectionPackageSpan): boolean {
  return left.startByte < right.endByte && right.startByte < left.endByte;
}

function objectAt(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(path, 'must be a plain object');
  const source = value as Record<string, unknown>;
  const observed = Object.keys(source).sort();
  const expected = [...keys].sort();
  if (observed.length !== expected.length || observed.some((key, index) => key !== expected[index])) fail(path, 'must contain exactly the reviewed keys');
  if (Object.getOwnPropertySymbols(source).length !== 0) fail(path, 'must not contain symbol keys');
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor || !('value' in descriptor)) fail(`${path}.${key}`, 'must be a data property, not an accessor');
  }
  return source;
}

function arrayAt(value: unknown, path: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0) fail(path, 'must be a dense plain array');
  const length = value.length;
  if (length < minimum || length > maximum) fail(path, `must contain between ${minimum} and ${maximum} values`);
  const keys = Object.keys(value);
  if (keys.length !== length || keys.some((key, index) => key !== String(index))) fail(path, 'must be a dense plain array without extra properties');
  const output: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor)) fail(`${path}[${index}]`, 'must be a data value, not an accessor');
    output.push(descriptor.value);
  }
  return output;
}

function textAt(value: unknown, path: string, maximum: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) fail(path, `must be a nonempty string of at most ${maximum} UTF-16 code units`);
  assertTextUnicode(value, path, true);
  return value;
}

function stringAt(value: unknown, path: string, maximum: number): string {
  return textAt(value, path, maximum);
}

function safeIdAt(value: unknown, path: string): string {
  return safeAsciiAt(value, path, /^[a-z][a-z0-9-]{0,127}$/);
}

function safeAsciiAt(value: unknown, path: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) fail(path, 'must be an ASCII, non-confusable reviewed identifier');
  return value;
}

function shaAt(value: unknown, path: string): string {
  return safeAsciiAt(value, path, /^[a-f0-9]{64}$/);
}

function integerAt(value: unknown, path: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail(path, `must be a safe integer at least ${minimum}`);
  return value as number;
}

function enumAt<T extends readonly string[]>(value: unknown, path: string, values: T): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) fail(path, `must be one of ${values.join(', ')}`);
  return value as T[number];
}

function literalAt(value: unknown, path: string, expected: unknown): void {
  if (value !== expected) fail(path, `must equal ${JSON.stringify(expected)}`);
}

function assertUnique(values: readonly string[], path: string, label: string): void {
  if (new Set(values).size !== values.length) fail(path, `must not contain duplicate ${label} values`);
}

function equalCanonical(actual: unknown, expected: unknown, path: string, message: string): void {
  if (canonicalSectionedEditionCollectionPackageJson(actual) !== canonicalSectionedEditionCollectionPackageJson(expected)) fail(path, message);
}

function cloneArray<T>(values: readonly T[]): T[] {
  return values.map(value => structuredClone(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return arrayAt(value, 'canonical value', 0, Number.MAX_SAFE_INTEGER).map(canonicalize);
  if (value && typeof value === 'object') {
    const source = objectAt(value, 'canonical value', Object.keys(value as Record<string, unknown>));
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) result[key] = canonicalize(source[key]);
    return result;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) fail('canonical value', 'must not contain non-finite numbers');
  return value;
}

function assertTextUnicode(value: string, path: string, allowRawAsciiWhitespace: boolean): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    let codePoint = unit;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) fail(path, 'contains an unpaired surrogate');
      codePoint = 0x1_0000 + ((unit - 0xd800) << 10) + (next - 0xdc00);
      index += 1;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) fail(path, 'contains an unpaired surrogate');
    const isRawWhitespace = codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0b || codePoint === 0x0c || codePoint === 0x0d;
    if ((codePoint <= 0x1f && !(allowRawAsciiWhitespace && isRawWhitespace)) || (codePoint >= 0x7f && codePoint <= 0x9f)) fail(path, 'contains a disallowed control character');
    if (codePoint === 0x061c || codePoint === 0x200e || codePoint === 0x200f || (codePoint >= 0x202a && codePoint <= 0x202e) || (codePoint >= 0x2066 && codePoint <= 0x2069)) fail(path, 'contains a bidi control character');
    if (codePoint === 0xfdd0 || codePoint === 0xfdef || (codePoint & 0xfffe) === 0xfffe) fail(path, 'contains a Unicode noncharacter');
    if (codePoint === 0x200c || codePoint === 0x200d || (codePoint >= 0x2060 && codePoint <= 0x2064) || codePoint === 0xfeff) fail(path, 'contains a disallowed format character');
  }
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function fail(path: string, message: string): never {
  throw new SectionedEditionCollectionPackageValidationError(path, message);
}
