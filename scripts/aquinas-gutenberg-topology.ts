#!/usr/bin/env tsx

/**
 * Local-only A1 topology scanner for the A0-locked Gutenberg HTML archives.
 * It produces hashes, spans, counts, and identifiers only: never source prose.
 */

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, type DefaultTreeAdapterTypes, type ParserError } from 'parse5';
import {
  AQUINAS_PARTS,
  AQUINAS_SECTIONED_COLLECTION_IDENTITY,
  canonicalSectionedCollectionJson,
  expectedAquinasQuestionKeys,
  orderedQuestionKeysSha256,
  type AquinasPartKey,
} from '../src/kernel/sectionedEditionCollectionFoundation.js';
import {
  AQUINAS_GUTENBERG_RECEIPT_PATH,
  extractAndVerifyLockedHtml,
  readAquinasGutenbergSourceLock,
  sourceLockDigest,
  verifyLocalAquinasGutenbergAcquisition,
  type AquinasGutenbergArtifact,
} from './aquinas-gutenberg-acquisition.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const AQUINAS_GUTENBERG_TOPOLOGY_LOCK_PATH = 'data/historical-sources/project-gutenberg/aquinas-english-dominican/TOPOLOGY_LOCK.json';
export const AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_LEDGER_PATH = 'data/historical-sources/project-gutenberg/aquinas-english-dominican/TOPOLOGY_DISCREPANCY_LEDGER.json';
export const AQUINAS_GUTENBERG_TOPOLOGY_SCHEMA = 'aquinas-gutenberg-topology-lock.v1';
export const AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_SCHEMA = 'aquinas-gutenberg-topology-discrepancy-ledger.v1';
export const AQUINAS_GUTENBERG_TOPOLOGY_PARSER = Object.freeze({ name: 'parse5', version: '8.0.1', sourceCodeLocationInfo: true } as const);
const EXPECTED_TOPOLOGY_LOCK_SHA256 = 'ce6197ba036ec7200f43513f9e6676ccfd5cb5a4727077a440770416bdf6978b';
const MAX_HTML_BYTES = 6_000_000;
const MAX_TREE_NODES = 150_000;
const MAX_TREE_DEPTH = 64;
const MAX_ATTRIBUTES = 32;
const MAX_TEXT_NODE_CHARS = 262_144;
const UTF8_SLICE_CACHE = new Map<string, Buffer>();

export type AquinasTopologyBlockType =
  | 'authorial_part_prologue'
  | 'authorial_question_preamble'
  | 'authorial_article'
  | 'source_wrapper'
  | 'gutenberg_license'
  | 'electronic_edition_provenance'
  | 'dedication'
  | 'table_of_contents'
  | 'editorial_interlude'
  | 'structural_metadata';

export type ContentFreeTypedRange = Readonly<{
  type: AquinasTopologyBlockType;
  startByte: number;
  endByte: number;
  sha256: string;
}>;

/**
 * Content-free source plan for the A2 local compiler.  It deliberately carries
 * byte ranges and reviewed container topology only; callers must separately
 * obtain the verified source-member bytes from the A0 cache.
 */
export type AquinasGutenbergReviewedBlockPlan = Readonly<{
  startByte: number;
  endByte: number;
  sha256: string;
  containerTag: 'p' | 'div' | 'blockquote' | 'h4' | 'h5';
  inlineTags: readonly ('i' | 'em' | 'b' | 'strong' | 'span' | 'sup' | 'sub')[];
}>;

export type AquinasGutenbergReviewedRangePlan = Readonly<{
  type: AquinasTopologyBlockType;
  startByte: number;
  endByte: number;
  sha256: string;
  blocks: readonly AquinasGutenbergReviewedBlockPlan[];
}>;

export type AquinasGutenbergReviewedQuestionPlan = Readonly<{
  questionKey: string;
  questionNumber: number;
  articleCount: number;
  startByte: number;
  endByte: number;
  sha256: string;
  preamble: AquinasGutenbergReviewedRangePlan;
  articles: readonly AquinasGutenbergReviewedRangePlan[];
}>;

export type AquinasGutenbergReviewedSourcePlan = Readonly<{
  source: AquinasTopologySource;
  partPrologue: AquinasGutenbergReviewedRangePlan | null;
  questions: readonly AquinasGutenbergReviewedQuestionPlan[];
  exclusions: readonly AquinasGutenbergReviewedRangePlan[];
  typedRanges: readonly ContentFreeTypedRange[];
  discrepancies: readonly AquinasTopologyDiscrepancy[];
}>;

export type AquinasTopologyQuestion = Readonly<{
  order: number;
  partKey: AquinasPartKey;
  questionNumber: number;
  questionKey: string;
  articleCount: number;
  rawSpanStartByte: number;
  rawSpanEndByte: number;
  rawSpanSha256: string;
  typedBlockCounts: Readonly<Record<'authorial_question_preamble' | 'authorial_article', number>>;
  orderedArticleKeysSha256: string;
  bracketStatus: 'mixed_unresolved_preserve_verbatim_in_a2';
  source_locator_status: 'verified' | 'discrepancy_ledgered';
  source_structure_status: 'verified' | 'discrepancy_ledgered';
}>;

export type AquinasTopologyDiscrepancy = Readonly<{
  ebookId: number;
  partKey: AquinasPartKey;
  htmlMemberSha256: string;
  questionKey: string;
  articleKey: string | null;
  observedLocator: string | null;
  observedTagName: string | null;
  evidenceStartByte: number;
  evidenceEndByte: number;
  evidenceSha256: string;
  containingElementStartByte: number | null;
  containingElementEndByte: number | null;
  containingElementSha256: string | null;
  observedDeclaredArticleCount: number | null;
  resolvedArticleCount: number | null;
  resolvedPreambleStartByte: number | null;
  resolvedPreambleEndByte: number | null;
  resolvedArticleStartByte: number | null;
  resolvedArticleEndByte: number | null;
  codes: readonly string[];
  resolutionBasis: 'ordinal_position_and_declared_count' | 'ledgered_missing_question_heading_scope' | 'article_shell_count_and_preamble_evidence';
}>;

export type AquinasTopologyDiscrepancyLedger = Readonly<{
  schemaVersion: typeof AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_SCHEMA;
  sourceLockSha256: string;
  entries: readonly AquinasTopologyDiscrepancy[];
  aggregateSha256: string;
}>;

export type AquinasTopologySource = Readonly<{
  ebookId: number;
  partKey: AquinasPartKey;
  archiveSha256: string;
  htmlMemberSha256: string;
  htmlMemberBytes: number;
  intellectualStartByte: number;
  cutoffEndByte: number;
  rawCoverageSha256: string;
  typedRangeCount: number;
  typedRangesSha256: string;
  typedBlockCounts: Readonly<Record<AquinasTopologyBlockType, number>>;
  editorialInterludeCount: number;
}>;

export type AquinasTopologyLock = Readonly<{
  schemaVersion: typeof AQUINAS_GUTENBERG_TOPOLOGY_SCHEMA;
  status: 'local_only_inactive';
  workId: typeof AQUINAS_SECTIONED_COLLECTION_IDENTITY.workId;
  editionId: typeof AQUINAS_SECTIONED_COLLECTION_IDENTITY.editionId;
  sourceLockSha256: string;
  localReceiptSha256: string;
  discrepancyLedgerSha256: string;
  parser: typeof AQUINAS_GUTENBERG_TOPOLOGY_PARSER;
  sources: readonly AquinasTopologySource[];
  questions: readonly AquinasTopologyQuestion[];
  orderedQuestionKeysSha256: string;
  orderedArticleKeysSha256: string;
  aggregateSha256: string;
}>;

type BodyElement = Readonly<{
  tagName: string;
  index: number;
  startChar: number;
  endChar: number;
  text: string;
  node: DefaultTreeAdapterTypes.Element;
}>;

type LocatedRange = Readonly<{
  type: AquinasTopologyBlockType;
  startChar: number;
  endChar: number;
}>;

type ArticleCandidate = Readonly<{
  ordinal: number | undefined;
  index: number;
  tagName: string;
  startChar: number;
  endChar: number;
  rawLocator: string | null;
  observedPartCode: string | undefined;
  observedQuestionNumber: number | undefined;
  observedArticleNumber: number | undefined;
  role: 'article_shell' | 'retyped_question_heading';
}>;

type ResolvedArticle = Readonly<{ ordinal: number; startChar: number; candidate: ArticleCandidate | undefined }>;
type ResolvedQuestion = Readonly<{
  questionNumber: number;
  startIndex: number;
  startChar: number;
  endChar: number;
  articles: readonly ResolvedArticle[];
  sourceLocatorStatus: 'verified' | 'discrepancy_ledgered';
}>;

type TopologyBuild = Readonly<{
  rows: readonly Omit<AquinasTopologyQuestion, 'order'>[];
  resolvedQuestions: readonly ResolvedQuestion[];
  prologue: LocatedRange | undefined;
  structuralBeforeFirst: LocatedRange | undefined;
  editorial: LocatedRange | undefined;
  cutoffEndChar: number;
  discrepancies: readonly AquinasTopologyDiscrepancy[];
}>;
type AuditState = { nodes: number; ids: Set<string> };

const ORDINAL_WORDS = Object.freeze([
  'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH', 'NINTH', 'TENTH',
  'ELEVENTH', 'TWELFTH', 'THIRTEENTH', 'FOURTEENTH', 'FIFTEENTH', 'SIXTEENTH', 'SEVENTEENTH', 'EIGHTEENTH', 'NINETEENTH', 'TWENTIETH',
] as const);
const CARDINAL_WORDS = Object.freeze([
  'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
  'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN', 'TWENTY',
] as const);
const MISSING_QUESTION_SCOPE_RULES = Object.freeze([
  { ebookId: 17611, questionNumber: 116, declaredArticleCount: 4, scopeStart: 'declaration' },
  { ebookId: 18755, questionNumber: 183, declaredArticleCount: 4, scopeStart: 'previous_element' },
] as const);
const DECLARATION_RULES = Object.freeze([
  { ebookId: 17897, questionNumber: 38, kind: 'mismatch', observedCount: 4, resolvedCount: 5 },
  { ebookId: 17897, questionNumber: 82, kind: 'absent', resolvedCount: 4 },
  { ebookId: 18755, questionNumber: 128, kind: 'absent', resolvedCount: 1 },
  { ebookId: 18755, questionNumber: 143, kind: 'absent', resolvedCount: 1 },
  { ebookId: 19950, questionNumber: 50, kind: 'absent', resolvedCount: 6 },
] as const);

export class AquinasTopologyValidationError extends Error {
  constructor(message: string) {
    super(`[aquinas-gutenberg-topology] ${message}`);
    this.name = 'AquinasTopologyValidationError';
  }
}

function fail(message: string): never {
  throw new AquinasTopologyValidationError(message);
}

export function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

type RawTopologyScan = Readonly<{
  sourceLockSha256: string;
  localReceiptSha256: string;
  sources: readonly AquinasTopologySource[];
  questions: readonly AquinasTopologyQuestion[];
  articleKeys: readonly string[];
  discrepancies: readonly AquinasTopologyDiscrepancy[];
}>;

export function scanAquinasGutenbergTopology(sourceRoot: string, outputRoot = ROOT): AquinasTopologyLock {
  const raw = scanRawTopology(sourceRoot);
  const ledger = readAquinasGutenbergTopologyDiscrepancyLedger(outputRoot);
  assertExactDiscrepancyLedger(raw, ledger);
  return buildTopologyLock(raw, sha256Bytes(readFileSync(resolve(outputRoot, AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_LEDGER_PATH))));
}

function scanRawTopology(sourceRoot: string): RawTopologyScan {
  const root = resolve(sourceRoot);
  verifyLocalAquinasGutenbergAcquisition(root);
  const lock = readAquinasGutenbergSourceLock(root);
  const sources: AquinasTopologySource[] = [];
  const questions: AquinasTopologyQuestion[] = [];
  const articleKeys: string[] = [];
  const discrepancies: AquinasTopologyDiscrepancy[] = [];
  let order = 1;
  for (const artifact of lock.artifacts) {
    const archivePath = resolve(root, 'data/historical-sources/project-gutenberg/aquinas-english-dominican', artifact.archive.localPath);
    assertSafeLocalRegularFile(archivePath, `eBook ${artifact.ebookId} archive`);
    const html = extractAndVerifyLockedHtml(artifact, readFileSync(archivePath));
    const scan = scanOneHtml(artifact, html);
    sources.push(scan.source);
    discrepancies.push(...scan.discrepancies);
    for (const row of scan.questions) {
      questions.push({ ...row, order });
      articleKeys.push(...articleKeysFor(row.questionKey, row.articleCount));
      order += 1;
    }
  }
  const expectedKeys = expectedAquinasQuestionKeys();
  if (questions.length !== expectedKeys.length || questions.some((question, index) => question.questionKey !== expectedKeys[index])) fail('four-source question topology does not exactly match the frozen 512-key order');
  return {
    sourceLockSha256: sourceLockDigest(root),
    localReceiptSha256: receiptSha256(root),
    sources,
    questions,
    articleKeys,
    discrepancies: canonicalDiscrepancies(discrepancies),
  };
}

function buildTopologyLock(raw: RawTopologyScan, discrepancyLedgerSha256: string): AquinasTopologyLock {
  const expectedKeys = expectedAquinasQuestionKeys();
  const base = {
    schemaVersion: AQUINAS_GUTENBERG_TOPOLOGY_SCHEMA as typeof AQUINAS_GUTENBERG_TOPOLOGY_SCHEMA,
    status: 'local_only_inactive' as const,
    workId: AQUINAS_SECTIONED_COLLECTION_IDENTITY.workId,
    editionId: AQUINAS_SECTIONED_COLLECTION_IDENTITY.editionId,
    sourceLockSha256: raw.sourceLockSha256,
    localReceiptSha256: raw.localReceiptSha256,
    discrepancyLedgerSha256,
    parser: AQUINAS_GUTENBERG_TOPOLOGY_PARSER,
    sources: raw.sources,
    questions: raw.questions,
    orderedQuestionKeysSha256: orderedQuestionKeysSha256(expectedKeys),
    orderedArticleKeysSha256: sha256Text(canonicalSectionedCollectionJson(raw.articleKeys)),
  };
  return { ...base, aggregateSha256: sha256Text(canonicalSectionedCollectionJson(base)) };
}

type ArtifactTopologyScan = Readonly<{
  text: string;
  byteOffsets: Uint32Array;
  elements: readonly BodyElement[];
  topology: TopologyBuild;
  source: AquinasTopologySource;
}>;

function scanOneHtml(artifact: AquinasGutenbergArtifact, html: Buffer): Readonly<{ source: AquinasTopologySource; questions: readonly Omit<AquinasTopologyQuestion, 'order'>[]; discrepancies: readonly AquinasTopologyDiscrepancy[] }> {
  const scan = scanArtifactTopology(artifact, html);
  return { source: scan.source, questions: scan.topology.rows, discrepancies: scan.topology.discrepancies };
}

function scanArtifactTopology(artifact: AquinasGutenbergArtifact, html: Buffer): ArtifactTopologyScan {
  if (html.byteLength !== artifact.htmlMember.bytes || html.byteLength > MAX_HTML_BYTES) fail(`eBook ${artifact.ebookId} HTML violates the reviewed input-size bound`);
  const text = strictHtmlUtf8(html, `eBook ${artifact.ebookId} HTML`);
  const byteOffsets = utf8Offsets(text);
  const body = parseAndAuditHtml(text, `eBook ${artifact.ebookId}`);
  const elements = directBodyElements(body, text);
  const candidates = elements.map(articleCandidate).filter((value): value is ArticleCandidate => value !== undefined);
  const expectedPartCode = partCode(artifact.partKey);
  const firstQuestionOneArticle = candidates.find(candidate => candidate.observedPartCode === expectedPartCode && candidate.observedQuestionNumber === 1 && candidate.observedArticleNumber === 1);
  if (!firstQuestionOneArticle) fail(`eBook ${artifact.ebookId} is missing the first locked article locator`);
  const intellectualCandidates = candidates.filter(candidate => candidate.index >= firstQuestionOneArticle.index);
  const topology = buildQuestionTopology(artifact, elements, intellectualCandidates, firstQuestionOneArticle.index, text, byteOffsets);
  const ranges = buildCoverageRanges(artifact, topology);
  const source = buildSourceSummary(artifact, text, byteOffsets, ranges);
  return { text, byteOffsets, elements, topology, source };
}

/**
 * Replays the locked A1 scanner for one already-verified HTML member and
 * exposes only byte boundaries, hashes, and closed reviewed HTML topology.
 * It never writes source data and never returns source prose.
 */
export function buildAquinasGutenbergReviewedSourcePlan(artifact: AquinasGutenbergArtifact, html: Buffer): AquinasGutenbergReviewedSourcePlan {
  const scan = scanArtifactTopology(artifact, html);
  const coverage = buildCoverageRanges(artifact, scan.topology);
  const elementIndexByStart = new Map(scan.elements.map((element, index) => [element.startChar, index] as const));
  const typedRanges = coverage.map(range => contentFreeRange(range, scan.text, scan.byteOffsets));
  const partPrologue = scan.topology.prologue === undefined
    ? null
    : reviewedRangePlan(scan.topology.prologue, scan.elements, elementIndexByStart, scan.text, scan.byteOffsets);
  const questions = scan.topology.resolvedQuestions.map((question, index) => {
    const row = scan.topology.rows[index]!;
    const preamble: LocatedRange = {
      type: 'authorial_question_preamble',
      startChar: question.startChar,
      endChar: question.articles[0]!.startChar,
    };
    const articles = question.articles.map((article, articleIndex): LocatedRange => ({
      type: 'authorial_article',
      startChar: article.startChar,
      endChar: question.articles[articleIndex + 1]?.startChar ?? question.endChar,
    }));
    return {
      questionKey: row.questionKey,
      questionNumber: row.questionNumber,
      articleCount: row.articleCount,
      startByte: scan.byteOffsets[question.startChar]!,
      endByte: scan.byteOffsets[question.endChar]!,
      sha256: sha256Bytes(utf8Slice(scan.text, scan.byteOffsets, question.startChar, question.endChar)),
      preamble: reviewedRangePlan(preamble, scan.elements, elementIndexByStart, scan.text, scan.byteOffsets),
      articles: articles.map(range => reviewedRangePlan(range, scan.elements, elementIndexByStart, scan.text, scan.byteOffsets)),
    };
  });
  const exclusions: AquinasGutenbergReviewedRangePlan[] = [];
  const intellectualStartChar = coverage[0]!.startChar;
  if (intellectualStartChar > 0) exclusions.push(reviewedRangePlan({ type: 'source_wrapper', startChar: 0, endChar: intellectualStartChar }, scan.elements, elementIndexByStart, scan.text, scan.byteOffsets, false));
  for (const range of coverage) if (!isAuthorialRange(range.type)) exclusions.push(reviewedRangePlan(range, scan.elements, elementIndexByStart, scan.text, scan.byteOffsets, false));
  if (scan.topology.cutoffEndChar < scan.text.length) exclusions.push(reviewedRangePlan({ type: 'gutenberg_license', startChar: scan.topology.cutoffEndChar, endChar: scan.text.length }, scan.elements, elementIndexByStart, scan.text, scan.byteOffsets, false));
  assertExactCoverage(
    [
      ...(partPrologue === null ? [] : [{ type: 'authorial_part_prologue' as const, startChar: scan.topology.prologue!.startChar, endChar: scan.topology.prologue!.endChar }]),
      ...scan.topology.resolvedQuestions.flatMap(question => [
        { type: 'authorial_question_preamble' as const, startChar: question.startChar, endChar: question.articles[0]!.startChar },
        ...question.articles.map((article, index) => ({ type: 'authorial_article' as const, startChar: article.startChar, endChar: question.articles[index + 1]?.startChar ?? question.endChar })),
      ]),
      ...exclusions.map(exclusion => ({ type: exclusion.type, startChar: byteToChar(scan.byteOffsets, exclusion.startByte), endChar: byteToChar(scan.byteOffsets, exclusion.endByte) })),
    ],
    0,
    scan.text.length,
    artifact.ebookId,
  );
  return { source: scan.source, partPrologue, questions, exclusions, typedRanges, discrepancies: scan.topology.discrepancies };
}

function isAuthorialRange(type: AquinasTopologyBlockType): boolean {
  return type === 'authorial_part_prologue' || type === 'authorial_question_preamble' || type === 'authorial_article';
}

function contentFreeRange(range: LocatedRange, text: string, offsets: Uint32Array): ContentFreeTypedRange {
  return {
    type: range.type,
    startByte: offsets[range.startChar]!,
    endByte: offsets[range.endChar]!,
    sha256: sha256Bytes(utf8Slice(text, offsets, range.startChar, range.endChar)),
  };
}

function reviewedRangePlan(range: LocatedRange, elements: readonly BodyElement[], elementIndexByStart: ReadonlyMap<number, number>, text: string, offsets: Uint32Array, reviewBlocks = true): AquinasGutenbergReviewedRangePlan {
  if (!reviewBlocks) return { ...contentFreeRange(range, text, offsets), blocks: [] };
  const first = elementIndexByStart.get(range.startChar);
  if (first === undefined) fail('reviewed block plan does not begin at the source range boundary');
  const blocks: BodyElement[] = [];
  for (let index = first; index < elements.length && elements[index]!.startChar < range.endChar; index += 1) blocks.push(elements[index]!);
  if (blocks.length === 0) fail('reviewed block plan has no direct body elements');
  const planBlocks = blocks.map((element, index): AquinasGutenbergReviewedBlockPlan => {
    const endChar = blocks[index + 1]?.startChar ?? range.endChar;
    if (element.endChar > endChar) fail('reviewed block plan is not bounded by a direct body element');
    const topology = reviewedContainerTopology(element);
    return {
      startByte: offsets[element.startChar]!,
      endByte: offsets[endChar]!,
      sha256: sha256Bytes(utf8Slice(text, offsets, element.startChar, endChar)),
      ...topology,
    };
  });
  if (planBlocks.length > 0 && planBlocks.at(-1)!.endByte !== offsets[range.endChar]!) fail('reviewed block plan does not reach the source range boundary');
  return {
    ...contentFreeRange(range, text, offsets),
    blocks: planBlocks,
  };
}

function reviewedContainerTopology(element: BodyElement): Pick<AquinasGutenbergReviewedBlockPlan, 'containerTag' | 'inlineTags'> {
  if (!['p', 'div', 'blockquote', 'h4', 'h5'].includes(element.tagName)) fail(`reviewed block ${element.index} has an unsupported container tag`);
  const inlineOrder = ['i', 'em', 'b', 'strong', 'span', 'sup', 'sub'] as const;
  const inlineTags = new Set<typeof inlineOrder[number]>();
  const visit = (node: DefaultTreeAdapterTypes.Node): void => {
    if (node.nodeName === '#text') return;
    if (!('tagName' in node)) fail(`reviewed block ${element.index} contains an unsupported node`);
    if (node.tagName === 'br') return;
    if (!inlineOrder.includes(node.tagName as typeof inlineOrder[number])) fail(`reviewed block ${element.index} contains an unsupported inline tag`);
    inlineTags.add(node.tagName as typeof inlineOrder[number]);
    for (const child of node.childNodes) visit(child);
  };
  for (const child of element.node.childNodes) visit(child);
  return { containerTag: element.tagName as AquinasGutenbergReviewedBlockPlan['containerTag'], inlineTags: inlineOrder.filter(tag => inlineTags.has(tag)) };
}

function byteToChar(offsets: Uint32Array, byte: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const value = offsets[middle]!;
    if (value === byte) return middle;
    if (value < byte) low = middle + 1;
    else high = middle - 1;
  }
  fail('reviewed range plan has a non-UTF-8 byte boundary');
}

function buildQuestionTopology(
  artifact: AquinasGutenbergArtifact,
  elements: readonly BodyElement[],
  candidates: readonly ArticleCandidate[],
  firstArticleIndex: number,
  html: string,
  byteOffsets: Uint32Array,
): TopologyBuild {
  const part = AQUINAS_PARTS.find(candidate => candidate.key === artifact.partKey);
  if (!part) fail(`eBook ${artifact.ebookId} has an unknown frozen part key`);
  const prologueIndex = lastIndexBefore(elements, firstArticleIndex, element => /^h[1-6]$/.test(element.tagName) && element.text === 'PROLOGUE');
  const prologueContent = prologueIndex === -1 ? undefined : nextElement(elements, prologueIndex, firstArticleIndex);
  if (prologueContent && prologueContent.tagName !== 'p') fail(`eBook ${artifact.ebookId} prologue has an unreviewed body topology`);
  const headers = new Map<number, number>();
  const duplicateQuestionRoleBoundaries = new Map<number, number>();
  for (const element of elements) {
    const number = semanticQuestionNumber(element);
    if (number === undefined) continue;
    if (element.index < firstArticleIndex) {
      if (number === 1) headers.set(number, element.index);
      continue;
    }
    if (headers.has(number)) {
      if (artifact.ebookId === 17897 && number === 23 && !duplicateQuestionRoleBoundaries.has(number)) {
        duplicateQuestionRoleBoundaries.set(number, element.index);
        continue;
      }
      fail(`eBook ${artifact.ebookId} has a duplicate semantic question heading for ${number}`);
    }
    headers.set(number, element.index);
  }
  const scopeStarts: number[] = [];
  for (let questionNumber = 1; questionNumber <= part.questions; questionNumber += 1) {
    const headingIndex = headers.get(questionNumber);
    if (headingIndex !== undefined) {
      scopeStarts.push(headingIndex);
      continue;
    }
    if (questionNumber === 1 && prologueContent) {
      const start = nextElement(elements, prologueContent.index, firstArticleIndex);
      if (!start) fail(`eBook ${artifact.ebookId} has no located first-question preamble after the prologue`);
      scopeStarts.push(start.index);
      continue;
    }
    const missingScopeRule = MISSING_QUESTION_SCOPE_RULES.find(rule => rule.ebookId === artifact.ebookId && rule.questionNumber === questionNumber);
    if (missingScopeRule) {
      scopeStarts.push(missingQuestionHeadingStart(elements, candidates, missingScopeRule));
      continue;
    }
    fail(`eBook ${artifact.ebookId} question ${questionNumber} has no semantic question heading`);
  }
  const cutoffFooterIndex = elements.findIndex(element => element.index > candidates.at(-1)!.index && element.tagName === 'footer');
  if (cutoffFooterIndex === -1) fail(`eBook ${artifact.ebookId} has no exact local cutoff boundary`);
  const cutoffEndChar = elements[cutoffFooterIndex]!.startChar;
  const ends = scopeStarts.map((_, index) => index === scopeStarts.length - 1 ? cutoffEndChar : elements[scopeStarts[index + 1]!]!.startChar);
  const editorialIndex = artifact.partKey === 'tertia'
    ? elements.findIndex(element => element.startChar > elements[scopeStarts[25]!]!.startChar && /EDITORIAL\s+NOTE/i.test(element.text))
    : -1;
  if (artifact.partKey === 'tertia' && editorialIndex === -1) fail('Tertia source is missing the required explicit editorial interlude');
  let editorial: LocatedRange | undefined;
  if (editorialIndex !== -1) {
    const interlude = elements[editorialIndex]!;
    if (interlude.startChar <= elements[scopeStarts[25]!]!.startChar || interlude.startChar >= elements[scopeStarts[26]!]!.startChar) fail('editorial interlude is not between the reviewed adjacent question boundaries');
    ends[25] = interlude.startChar;
    editorial = { type: 'editorial_interlude', startChar: interlude.startChar, endChar: elements[scopeStarts[26]!]!.startChar };
  }
  const discrepancies: AquinasTopologyDiscrepancy[] = [];
  const resolvedQuestions: ResolvedQuestion[] = [];
  for (let index = 0; index < part.questions; index += 1) {
    const questionNumber = index + 1;
    const startIndex = scopeStarts[index]!;
    const startChar = elements[startIndex]!.startChar;
    const endChar = ends[index]!;
    const inScope = candidates.filter(candidate => candidate.startChar >= startChar && candidate.startChar < endChar);
    const retypedBoundaryIndex = duplicateQuestionRoleBoundaries.get(questionNumber);
    if (retypedBoundaryIndex !== undefined) {
      const boundary = elements[retypedBoundaryIndex]!;
      if (boundary.startChar <= startChar || boundary.startChar >= endChar) fail('ledgered duplicate question role boundary does not fall inside its scope');
      inScope.push({
        ordinal: undefined,
        index: boundary.index,
        tagName: boundary.tagName,
        startChar: boundary.startChar,
        endChar: boundary.endChar,
        rawLocator: null,
        observedPartCode: undefined,
        observedQuestionNumber: undefined,
        observedArticleNumber: undefined,
        role: 'retyped_question_heading',
      });
      inScope.sort((left, right) => left.startChar - right.startChar);
    }
    const preambleEndChar = inScope[0]?.startChar ?? endChar;
    let declared: DeclaredArticleCount | undefined;
    try {
      declared = declaredArticleCount(elements, startIndex, preambleEndChar, html);
    } catch (error) {
      if (error instanceof AquinasTopologyValidationError) fail(`eBook ${artifact.ebookId} question ${questionNumber}: ${error.message}`);
      throw error;
    }
    let articles: readonly ResolvedArticle[];
    if (inScope.length === 0) {
      if (artifact.ebookId !== 17611 || ![71, 72].includes(questionNumber) || declared?.count !== 1) fail(`eBook ${artifact.ebookId} question ${questionNumber} has no article-heading candidate`);
      const articleStart = firstObjectionOneAfterDeclaration(elements, declared.index, endChar);
      if (!articleStart || articleStart.startChar >= endChar) fail(`eBook ${artifact.ebookId} question ${questionNumber} absent-heading evidence has no article span`);
      articles = [{ ordinal: 1, startChar: articleStart.startChar, candidate: undefined }];
      discrepancies.push(discrepancyForAbsentArticle(artifact, questionNumber, startChar, articleStart.startChar, endChar, html, byteOffsets));
    } else {
      const declarationRule = DECLARATION_RULES.find(rule => rule.ebookId === artifact.ebookId && rule.questionNumber === questionNumber);
      if (!declared) {
        if (!declarationRule || declarationRule.kind !== 'absent' || declarationRule.resolvedCount !== inScope.length) fail(`eBook ${artifact.ebookId} question ${questionNumber} has no reviewed preamble article-count declaration`);
        discrepancies.push(discrepancyForMissingDeclaration(artifact, questionNumber, inScope.length, startChar, preambleEndChar, html, byteOffsets));
      } else if (declared.count !== inScope.length) {
        if (!declarationRule || declarationRule.kind !== 'mismatch' || declarationRule.observedCount !== declared.count || declarationRule.resolvedCount !== inScope.length) fail(`eBook ${artifact.ebookId} question ${questionNumber} declared article count does not reconcile with its candidate count`);
        discrepancies.push(discrepancyForDeclaredCountMismatch(artifact, questionNumber, declared, inScope.length, elements[declared.index]!, html, byteOffsets));
      }
      const reconciledCount = declared?.count ?? inScope.length;
      articles = inScope.map((candidate, articleIndex) => {
        const ordinal = articleIndex + 1;
        if (candidate.ordinal === undefined && !(inScope.length === 1 && ordinal === 1) && candidate.role !== 'retyped_question_heading') fail(`eBook ${artifact.ebookId} question ${questionNumber} unlabeled article shell is not a one-article scope`);
        if (candidate.ordinal !== undefined && candidate.ordinal !== ordinal && !isLedgeredOrdinalDisagreement(artifact, questionNumber, ordinal, candidate.ordinal, reconciledCount, inScope.length)) fail(`eBook ${artifact.ebookId} question ${questionNumber} candidate ordinal does not equal its strict position`);
        const discrepancy = discrepancyForCandidate(artifact, questionNumber, ordinal, candidate, html, byteOffsets);
        if (discrepancy) discrepancies.push(discrepancy);
        return { ordinal, startChar: candidate.startChar, candidate };
      });
      const retypedArticleIndex = articles.findIndex(article => article.candidate?.role === 'retyped_question_heading');
      if (retypedArticleIndex !== -1) {
        const retypedArticle = articles[retypedArticleIndex]!;
        discrepancies.push(discrepancyForRetypedQuestionBoundary(
          artifact,
          questionNumber,
          retypedArticle.ordinal,
          retypedArticle.candidate!,
          startChar,
          retypedArticle.startChar,
          articles[retypedArticleIndex + 1]?.startChar ?? endChar,
          html,
          byteOffsets,
        ));
      }
    }
    if (articles[0]!.startChar <= startChar || articles[0]!.startChar >= endChar) fail(`eBook ${artifact.ebookId} question ${questionNumber} preamble boundary is invalid`);
    const questionKey = `${artifact.partKey}.q${String(questionNumber).padStart(3, '0')}`;
    const questionDiscrepancies = discrepancies.filter(entry => entry.questionKey === questionKey);
    resolvedQuestions.push({ questionNumber, startIndex, startChar, endChar, articles, sourceLocatorStatus: questionDiscrepancies.length === 0 ? 'verified' : 'discrepancy_ledgered' });
  }
  for (const rule of MISSING_QUESTION_SCOPE_RULES.filter(rule => rule.ebookId === artifact.ebookId)) {
    const missingHeadingScope = resolvedQuestions.find(question => question.questionNumber === rule.questionNumber);
    if (!missingHeadingScope) fail('ledgered missing question heading scope did not resolve');
    discrepancies.push(discrepancyForMissingQuestionHeading(artifact, missingHeadingScope, html, byteOffsets));
  }
  const rows = resolvedQuestions.map(question => {
    const questionKey = `${artifact.partKey}.q${String(question.questionNumber).padStart(3, '0')}`;
    const raw = utf8Slice(html, byteOffsets, question.startChar, question.endChar);
    return {
      partKey: artifact.partKey,
      questionNumber: question.questionNumber,
      questionKey,
      articleCount: question.articles.length,
      rawSpanStartByte: byteOffsets[question.startChar]!,
      rawSpanEndByte: byteOffsets[question.endChar]!,
      rawSpanSha256: sha256Bytes(raw),
      typedBlockCounts: { authorial_question_preamble: 1, authorial_article: question.articles.length },
      orderedArticleKeysSha256: sha256Text(canonicalSectionedCollectionJson(articleKeysFor(questionKey, question.articles.length))),
      bracketStatus: 'mixed_unresolved_preserve_verbatim_in_a2' as const,
      source_locator_status: discrepancies.some(entry => entry.questionKey === questionKey && entry.codes.some(code => code.startsWith('locator_') || code === 'article_locator_absent')) ? 'discrepancy_ledgered' as const : 'verified' as const,
      source_structure_status: discrepancies.some(entry => entry.questionKey === questionKey) ? 'discrepancy_ledgered' as const : 'verified' as const,
    };
  });
  const prologue = prologueIndex === -1 || !prologueContent ? undefined : { type: 'authorial_part_prologue' as const, startChar: elements[prologueIndex]!.startChar, endChar: prologueContent.endChar };
  const structuralBeforeFirst = prologue && prologue.endChar < elements[scopeStarts[0]!]!.startChar
    ? { type: 'structural_metadata' as const, startChar: prologue.endChar, endChar: elements[scopeStarts[0]!]!.startChar }
    : undefined;
  return { rows, resolvedQuestions, prologue, structuralBeforeFirst, editorial, cutoffEndChar, discrepancies };
}

function buildCoverageRanges(artifact: AquinasGutenbergArtifact, topology: TopologyBuild): readonly LocatedRange[] {
  const ranges: LocatedRange[] = [];
  if (topology.prologue) ranges.push(topology.prologue);
  if (topology.structuralBeforeFirst) ranges.push(topology.structuralBeforeFirst);
  for (const question of topology.resolvedQuestions) {
    ranges.push({ type: 'authorial_question_preamble', startChar: question.startChar, endChar: question.articles[0]!.startChar });
    for (const [index, article] of question.articles.entries()) ranges.push({
      type: 'authorial_article',
      startChar: article.startChar,
      endChar: question.articles[index + 1]?.startChar ?? question.endChar,
    });
  }
  if (topology.editorial) ranges.push(topology.editorial);
  const start = topology.prologue?.startChar ?? topology.resolvedQuestions[0]!.startChar;
  assertExactCoverage(ranges, start, topology.cutoffEndChar, artifact.ebookId);
  return ranges;
}

function buildSourceSummary(
  artifact: AquinasGutenbergArtifact,
  html: string,
  offsets: Uint32Array,
  ranges: readonly LocatedRange[],
): AquinasTopologySource {
  const orderedRanges = [...ranges].sort((left, right) => left.startChar - right.startChar || left.endChar - right.endChar);
  const startChar = orderedRanges[0]!.startChar;
  const endChar = orderedRanges.at(-1)!.endChar;
  const contentFree = orderedRanges.map(range => ({
    type: range.type,
    startByte: offsets[range.startChar]!,
    endByte: offsets[range.endChar]!,
    sha256: sha256Bytes(utf8Slice(html, offsets, range.startChar, range.endChar)),
  }));
  const typedBlockCounts = Object.fromEntries(([
    'authorial_part_prologue', 'authorial_question_preamble', 'authorial_article', 'source_wrapper', 'gutenberg_license', 'electronic_edition_provenance', 'dedication', 'table_of_contents', 'editorial_interlude', 'structural_metadata',
  ] as const).map(type => [type, contentFree.filter(range => range.type === type).length])) as Record<AquinasTopologyBlockType, number>;
  return {
    ebookId: artifact.ebookId,
    partKey: artifact.partKey,
    archiveSha256: artifact.archive.sha256,
    htmlMemberSha256: artifact.htmlMember.sha256,
    htmlMemberBytes: artifact.htmlMember.bytes,
    intellectualStartByte: offsets[startChar]!,
    cutoffEndByte: offsets[endChar]!,
    rawCoverageSha256: sha256Bytes(utf8Slice(html, offsets, startChar, endChar)),
    typedRangeCount: contentFree.length,
    typedRangesSha256: sha256Text(canonicalSectionedCollectionJson(contentFree)),
    typedBlockCounts,
    editorialInterludeCount: typedBlockCounts.editorial_interlude,
  };
}

export function writeAquinasGutenbergTopologyDiscrepancyLedger(sourceRoot: string, outputRoot = ROOT): AquinasTopologyDiscrepancyLedger {
  const raw = scanRawTopology(sourceRoot);
  const base = {
    schemaVersion: AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_SCHEMA as typeof AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_SCHEMA,
    sourceLockSha256: raw.sourceLockSha256,
    entries: raw.discrepancies,
  };
  const ledger = { ...base, aggregateSha256: sha256Text(canonicalSectionedCollectionJson(base)) };
  const path = resolve(outputRoot, AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_LEDGER_PATH);
  if (existsSync(path)) fail('topology discrepancy ledger already exists; preserve-only writing forbids clobbering it');
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return ledger;
}

export function readAquinasGutenbergTopologyDiscrepancyLedger(outputRoot = ROOT): AquinasTopologyDiscrepancyLedger {
  const path = resolve(outputRoot, AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_LEDGER_PATH);
  assertSafeLocalRegularFile(path, 'topology discrepancy ledger');
  let parsed: unknown;
  try {
    parsed = JSON.parse(strictHtmlUtf8(readFileSync(path), 'topology discrepancy ledger'));
  } catch (error) {
    if (error instanceof AquinasTopologyValidationError) throw error;
    fail('topology discrepancy ledger is not valid JSON');
  }
  const root = exactObject(parsed, 'topology discrepancy ledger', ['schemaVersion', 'sourceLockSha256', 'entries', 'aggregateSha256']);
  if (root.schemaVersion !== AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_SCHEMA) fail('topology discrepancy ledger has an unsupported schema version');
  const sourceLockSha256 = sha256String(root.sourceLockSha256, 'topology discrepancy ledger source lock');
  const entries = denseValues(root.entries, 'topology discrepancy ledger entries').map((entry, index) => validateDiscrepancy(entry, `topology discrepancy ledger entries[${index}]`));
  const base = {
    schemaVersion: AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_SCHEMA as typeof AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_SCHEMA,
    sourceLockSha256,
    entries,
  };
  const aggregateSha256 = sha256String(root.aggregateSha256, 'topology discrepancy ledger aggregate');
  if (aggregateSha256 !== sha256Text(canonicalSectionedCollectionJson(base))) fail('topology discrepancy ledger aggregate hash does not bind its entries');
  return { ...base, aggregateSha256 };
}

function assertExactDiscrepancyLedger(raw: RawTopologyScan, ledger: AquinasTopologyDiscrepancyLedger): void {
  if (ledger.sourceLockSha256 !== raw.sourceLockSha256) fail('topology discrepancy ledger source lock does not match the local verified source lock');
  if (canonicalSectionedCollectionJson(ledger.entries) !== canonicalSectionedCollectionJson(raw.discrepancies)) fail('generated topology discrepancies do not bijectively equal the checked-in content-free ledger');
}

function canonicalDiscrepancies(entries: readonly AquinasTopologyDiscrepancy[]): AquinasTopologyDiscrepancy[] {
  return [...entries].sort((left, right) => {
    const leftPart = AQUINAS_PARTS.findIndex(part => part.key === left.partKey);
    const rightPart = AQUINAS_PARTS.findIndex(part => part.key === right.partKey);
    if (leftPart !== rightPart) return leftPart - rightPart;
    if (left.questionKey !== right.questionKey) return left.questionKey.localeCompare(right.questionKey);
    return (left.articleKey ?? '').localeCompare(right.articleKey ?? '');
  });
}

function validateDiscrepancy(value: unknown, path: string): AquinasTopologyDiscrepancy {
  const entry = exactObject(value, path, ['ebookId', 'partKey', 'htmlMemberSha256', 'questionKey', 'articleKey', 'observedLocator', 'observedTagName', 'evidenceStartByte', 'evidenceEndByte', 'evidenceSha256', 'containingElementStartByte', 'containingElementEndByte', 'containingElementSha256', 'observedDeclaredArticleCount', 'resolvedArticleCount', 'resolvedPreambleStartByte', 'resolvedPreambleEndByte', 'resolvedArticleStartByte', 'resolvedArticleEndByte', 'codes', 'resolutionBasis']);
  const ebookId = positiveInteger(entry.ebookId, `${path}.ebookId`);
  const partKey = enumPartKey(entry.partKey, `${path}.partKey`);
  const htmlMemberSha256 = sha256String(entry.htmlMemberSha256, `${path}.htmlMemberSha256`);
  const questionKey = nonemptyString(entry.questionKey, `${path}.questionKey`);
  const articleKey = entry.articleKey === null ? null : nonemptyString(entry.articleKey, `${path}.articleKey`);
  const observedLocator = entry.observedLocator === null ? null : nonemptyString(entry.observedLocator, `${path}.observedLocator`);
  const observedTagName = entry.observedTagName === null ? null : nonemptyString(entry.observedTagName, `${path}.observedTagName`);
  const evidenceStartByte = nonnegativeInteger(entry.evidenceStartByte, `${path}.evidenceStartByte`);
  const evidenceEndByte = positiveInteger(entry.evidenceEndByte, `${path}.evidenceEndByte`);
  if (evidenceEndByte <= evidenceStartByte) fail(`${path}.evidence byte range is invalid`);
  const evidenceSha256 = sha256String(entry.evidenceSha256, `${path}.evidenceSha256`);
  const containingElementStartByte = nullableNonnegativeInteger(entry.containingElementStartByte, `${path}.containingElementStartByte`);
  const containingElementEndByte = nullablePositiveInteger(entry.containingElementEndByte, `${path}.containingElementEndByte`);
  const containingElementSha256 = entry.containingElementSha256 === null ? null : sha256String(entry.containingElementSha256, `${path}.containingElementSha256`);
  if ((containingElementStartByte === null) !== (containingElementEndByte === null) || (containingElementStartByte === null) !== (containingElementSha256 === null)) fail(`${path}.containing element evidence must be all present or all absent`);
  if (containingElementStartByte !== null && containingElementEndByte! <= containingElementStartByte) fail(`${path}.containing element range is invalid`);
  const observedDeclaredArticleCount = nullablePositiveInteger(entry.observedDeclaredArticleCount, `${path}.observedDeclaredArticleCount`);
  const resolvedArticleCount = nullablePositiveInteger(entry.resolvedArticleCount, `${path}.resolvedArticleCount`);
  const resolvedPreambleStartByte = nullableNonnegativeInteger(entry.resolvedPreambleStartByte, `${path}.resolvedPreambleStartByte`);
  const resolvedPreambleEndByte = nullablePositiveInteger(entry.resolvedPreambleEndByte, `${path}.resolvedPreambleEndByte`);
  const resolvedArticleStartByte = nullableNonnegativeInteger(entry.resolvedArticleStartByte, `${path}.resolvedArticleStartByte`);
  const resolvedArticleEndByte = nullablePositiveInteger(entry.resolvedArticleEndByte, `${path}.resolvedArticleEndByte`);
  const boundaryValues = [resolvedPreambleStartByte, resolvedPreambleEndByte, resolvedArticleStartByte, resolvedArticleEndByte];
  if (!boundaryValues.every(value => value === null) && !boundaryValues.every(value => value !== null)) fail(`${path}.resolved boundary evidence must be all present or all absent`);
  if (resolvedPreambleStartByte !== null && (resolvedPreambleEndByte! < resolvedPreambleStartByte || resolvedArticleStartByte! !== resolvedPreambleEndByte || resolvedArticleEndByte! <= resolvedArticleStartByte!)) fail(`${path}.resolved boundary evidence is invalid`);
  const codes = denseValues(entry.codes, `${path}.codes`).map((code, index) => nonemptyString(code, `${path}.codes[${index}]`));
  if (codes.length === 0 || new Set(codes).size !== codes.length) fail(`${path}.codes must be a nonempty unique sequence`);
  const resolutionBasis = entry.resolutionBasis;
  if (resolutionBasis !== 'ordinal_position_and_declared_count' && resolutionBasis !== 'ledgered_missing_question_heading_scope' && resolutionBasis !== 'article_shell_count_and_preamble_evidence') fail(`${path}.resolutionBasis is invalid`);
  if (resolutionBasis === 'article_shell_count_and_preamble_evidence' && resolvedArticleCount === null) fail(`${path}.count evidence requires a resolved article count`);
  return { ebookId, partKey, htmlMemberSha256, questionKey, articleKey, observedLocator, observedTagName, evidenceStartByte, evidenceEndByte, evidenceSha256, containingElementStartByte, containingElementEndByte, containingElementSha256, observedDeclaredArticleCount, resolvedArticleCount, resolvedPreambleStartByte, resolvedPreambleEndByte, resolvedArticleStartByte, resolvedArticleEndByte, codes, resolutionBasis };
}

function exactObject(value: unknown, path: string, expectedKeys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).some(symbol => Object.prototype.propertyIsEnumerable.call(value, symbol))) fail(`${path} must be a plain exact object`);
  const observed = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (observed.length !== expected.length || observed.some((key, index) => key !== expected[index])) fail(`${path} has unreviewed keys`);
  return value as Record<string, unknown>;
}

function denseValues(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.keys(value).length !== value.length || Object.keys(value).some((key, index) => key !== String(index))) fail(`${path} must be a dense plain array`);
  return Array.from({ length: value.length }, (_, index) => value[index]);
}

function nonemptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${path} must be a nonempty string`);
  return value;
}

function sha256String(value: unknown, path: string): string {
  const result = nonemptyString(value, path);
  if (!/^[a-f0-9]{64}$/.test(result)) fail(`${path} must be a lowercase SHA-256 digest`);
  return result;
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(`${path} must be a positive safe integer`);
  return value as number;
}

function nonnegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${path} must be a nonnegative safe integer`);
  return value as number;
}

function nullableNonnegativeInteger(value: unknown, path: string): number | null {
  return value === null ? null : nonnegativeInteger(value, path);
}

function nullablePositiveInteger(value: unknown, path: string): number | null {
  return value === null ? null : positiveInteger(value, path);
}

function enumPartKey(value: unknown, path: string): AquinasPartKey {
  if (!AQUINAS_PARTS.some(part => part.key === value)) fail(`${path} must be a frozen part key`);
  return value as AquinasPartKey;
}

export function parseAndAuditHtml(html: string, label: string): DefaultTreeAdapterTypes.Element {
  const errors: ParserError[] = [];
  const document = parse(html, { sourceCodeLocationInfo: true, onParseError: error => errors.push(error) });
  if (errors.length > 0) fail(`${label} HTML has parse5 repair errors`);
  auditNode(document, label, 0, { nodes: 0, ids: new Set<string>() }, false);
  const body = findElement(document, 'body');
  if (!body) fail(`${label} has no located body element`);
  if (!body.sourceCodeLocation) fail(`${label} body has no source location`);
  return body;
}

function auditNode(node: DefaultTreeAdapterTypes.Node, label: string, depth: number, state: AuditState, insideHead: boolean): void {
  state.nodes += 1;
  if (state.nodes > MAX_TREE_NODES || depth > MAX_TREE_DEPTH) fail(`${label} exceeds reviewed tree bounds`);
  if (node.nodeName === '#comment') fail(`${label} contains a forbidden comment node`);
  if (node.nodeName === '#text') {
    const text = (node as DefaultTreeAdapterTypes.TextNode).value;
    if (text.length > MAX_TEXT_NODE_CHARS) fail(`${label} contains an oversized text node`);
    assertSafeUnicode(text, label);
    return;
  }
  if ('tagName' in node) {
    const element = node as DefaultTreeAdapterTypes.Element;
    if (!element.sourceCodeLocation) fail(`${label} contains a synthesized element without source location`);
    if (element.attrs.length > MAX_ATTRIBUTES) fail(`${label} contains too many attributes`);
    const seen = new Set<string>();
    for (const attribute of element.attrs) {
      const name = attribute.name.toLowerCase();
      if (seen.has(name) || name.startsWith('on') || name === 'hidden') fail(`${label} contains a forbidden or duplicate attribute`);
      seen.add(name);
      assertSafeUnicode(attribute.value, label);
      if (name === 'id') {
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(attribute.value) || state.ids.has(attribute.value)) fail(`${label} contains a duplicate or confusable identifier`);
        state.ids.add(attribute.value);
      }
    }
    if (['script', 'template', 'svg', 'iframe', 'object', 'embed'].includes(element.tagName)) fail(`${label} contains a forbidden active/foreign element`);
    if (element.tagName === 'style' && !insideHead) fail(`${label} contains a body style element`);
  }
  const childInsideHead = insideHead || ('tagName' in node && node.tagName === 'head');
  if ('childNodes' in node) for (const child of node.childNodes) auditNode(child, label, depth + 1, state, childInsideHead);
}

function directBodyElements(body: DefaultTreeAdapterTypes.Element, html: string): readonly BodyElement[] {
  const elements: BodyElement[] = [];
  for (const node of body.childNodes) {
    if (!('tagName' in node)) continue;
    const element = node as DefaultTreeAdapterTypes.Element;
    if (!element.sourceCodeLocation) fail('body contains an unlocated direct element');
    if (element.tagName === 'style') fail('body contains a forbidden style element');
    const { startOffset, endOffset } = element.sourceCodeLocation;
    if (!Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset) || startOffset >= endOffset || endOffset > html.length) fail('body element has invalid source offsets');
    elements.push({ tagName: element.tagName, index: elements.length, startChar: startOffset, endChar: endOffset, text: collapseText(elementText(element)), node: element });
  }
  if (elements.length === 0) fail('body has no located direct elements');
  return elements;
}

function elementText(element: DefaultTreeAdapterTypes.Element): string {
  let text = '';
  const visit = (node: DefaultTreeAdapterTypes.Node): void => {
    if (node.nodeName === '#text') text += (node as DefaultTreeAdapterTypes.TextNode).value;
    if ('childNodes' in node) for (const child of node.childNodes) visit(child);
  };
  visit(element);
  return text;
}

function collapseText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function articleCandidate(element: BodyElement): ArticleCandidate | undefined {
  const words = ORDINAL_WORDS.join('|');
  const match = new RegExp(`^(?:(${words}) )?ARTICLE(?: (\\[[^\\[\\]]+\\]))?$`).exec(element.text);
  if (!match) return undefined;
  const ordinal = match[1] === undefined ? undefined : ORDINAL_WORDS.indexOf(match[1] as typeof ORDINAL_WORDS[number]) + 1;
  const rawLocator = match[2] ?? null;
  const locator = rawLocator === null ? undefined : /^\[(?:(I-II|II-II|III|I)[,.]\s*)?Q[.,]+\s*(\d+)[,.]+\s*(?:Art\.?|A\.)\s*(\d+)?\]$/i.exec(rawLocator);
  if (rawLocator !== null && !locator) fail(`article-heading candidate has an unrecognized bracket locator grammar (${sha256Text(rawLocator)})`);
  return {
    ordinal,
    index: element.index,
    tagName: element.tagName,
    startChar: element.startChar,
    endChar: element.endChar,
    rawLocator,
    observedPartCode: locator?.[1],
    observedQuestionNumber: locator?.[2] === undefined ? undefined : Number(locator[2]),
    observedArticleNumber: locator?.[3] === undefined ? undefined : Number(locator[3]),
    role: 'article_shell',
  };
}

function semanticQuestionNumber(element: BodyElement): number | undefined {
  const match = /^QUESTION (\d+)$/.exec(element.text);
  return match ? Number(match[1]) : undefined;
}

type DeclaredArticleCount = Readonly<{
  count: number;
  index: number;
  tokenStartChar: number;
  tokenEndChar: number;
}>;

function declaredArticleCount(elements: readonly BodyElement[], startIndex: number, endChar: number, html: string): DeclaredArticleCount | undefined {
  let declaration: DeclaredArticleCount | undefined;
  for (const element of elements) {
    if (element.index < startIndex || element.startChar >= endChar) continue;
    const raw = html.slice(element.startChar, element.endChar);
    const match = /\((?:In )?([A-Za-z]+) Articles?\)/i.exec(raw);
    if (!match) continue;
    const count = CARDINAL_WORDS.indexOf(match[1]!.toUpperCase() as typeof CARDINAL_WORDS[number]) + 1;
    if (count === 0 || declaration) fail('question scope has an unreviewed article-count declaration');
    declaration = {
      count,
      index: element.index,
      tokenStartChar: element.startChar + match.index,
      tokenEndChar: element.startChar + match.index + match[0].length,
    };
  }
  return declaration;
}

function missingQuestionHeadingStart(elements: readonly BodyElement[], candidates: readonly ArticleCandidate[], rule: typeof MISSING_QUESTION_SCOPE_RULES[number]): number {
  const first = candidates.find(candidate => candidate.observedQuestionNumber === rule.questionNumber && candidate.observedArticleNumber === 1);
  if (!first) fail('ledgered missing question heading has no first article locator');
  for (let index = first.index - 1; index >= 0; index -= 1) {
    const element = elements[index]!;
    const match = /\((?:In )?([A-Za-z]+) Articles?\)/i.exec(element.text);
    if (!match) continue;
    const count = CARDINAL_WORDS.indexOf(match[1]!.toUpperCase() as typeof CARDINAL_WORDS[number]) + 1;
    if (count !== rule.declaredArticleCount) fail('ledgered missing question heading does not retain its reviewed declared count');
    const start = rule.scopeStart === 'previous_element' ? elements[element.index - 1] : element;
    if (!start) fail('ledgered missing question heading has no reviewed predecessor for its structural preamble');
    return start.index;
  }
  fail('ledgered missing question heading has no scope declaration');
}

function firstObjectionOneAfterDeclaration(elements: readonly BodyElement[], declarationIndex: number, endChar: number): BodyElement {
  const candidate = elements.find(element => element.index > declarationIndex && element.startChar < endChar && /^Objection 1:/.test(element.text));
  if (!candidate || candidate.tagName !== 'p') fail('ledgered absent article heading has no exact direct first-objection boundary');
  return candidate;
}

function discrepancyForCandidate(
  artifact: AquinasGutenbergArtifact,
  questionNumber: number,
  ordinal: number,
  candidate: ArticleCandidate,
  html: string,
  offsets: Uint32Array,
): AquinasTopologyDiscrepancy | undefined {
  if (candidate.role === 'retyped_question_heading') {
    return undefined;
  }
  const expectedPartCode = partCode(artifact.partKey);
  const codes: string[] = [];
  if (candidate.rawLocator === null) {
    codes.push('article_locator_absent');
  } else {
    if (candidate.observedPartCode !== expectedPartCode) codes.push(candidate.observedPartCode === undefined ? 'locator_part_prefix_missing' : 'locator_part_prefix_mismatch');
    if (candidate.observedQuestionNumber !== questionNumber) codes.push('locator_question_scope_mismatch');
    if (candidate.observedArticleNumber !== undefined && candidate.observedArticleNumber !== ordinal) codes.push('locator_article_ordinal_mismatch');
    if (!isAcceptedLocatorSyntax(candidate.rawLocator, expectedPartCode, questionNumber, ordinal) && codes.length === 0) codes.push('locator_syntax_noncanonical');
  }
  if (candidate.ordinal !== undefined && candidate.ordinal !== ordinal) codes.push('article_ordinal_position_mismatch');
  if (candidate.tagName !== 'p') codes.push('article_heading_tag_noncanonical');
  if (codes.length === 0) return undefined;
  return discrepancyRecord(artifact, questionNumber, ordinal, candidate.rawLocator, candidate.tagName, candidate.startChar, candidate.endChar, html, offsets, codes, 'ordinal_position_and_declared_count');
}

function discrepancyForRetypedQuestionBoundary(
  artifact: AquinasGutenbergArtifact,
  questionNumber: number,
  ordinal: number,
  candidate: ArticleCandidate,
  preambleStartChar: number,
  articleStartChar: number,
  articleEndChar: number,
  html: string,
  offsets: Uint32Array,
): AquinasTopologyDiscrepancy {
  return discrepancyRecord(
    artifact,
    questionNumber,
    ordinal,
    null,
    candidate.tagName,
    candidate.startChar,
    candidate.endChar,
    html,
    offsets,
    ['article_locator_absent', 'question_heading_retyped_article_boundary'],
    'ordinal_position_and_declared_count',
    undefined,
    null,
    null,
    { preambleStartChar, preambleEndChar: articleStartChar, articleStartChar, articleEndChar },
  );
}

function isAcceptedLocatorSyntax(rawLocator: string, partCode: string, questionNumber: number, ordinal: number): boolean {
  const escapedPart = partCode.replace(/[.-]/g, '\\$&');
  const articleNumber = ordinal === 1 ? `(?: ${ordinal})?` : ` ${ordinal}`;
  return new RegExp(`^\\[${escapedPart}[,.] Q\\. ${questionNumber}, Art\\.${articleNumber}\\]$`).test(rawLocator);
}

function isLedgeredOrdinalDisagreement(
  artifact: AquinasGutenbergArtifact,
  questionNumber: number,
  position: number,
  observedOrdinal: number,
  declaredCount: number,
  candidateCount: number,
): boolean {
  return artifact.ebookId === 18755
    && questionNumber === 19
    && declaredCount === 12
    && candidateCount === 12
    && ((position === 7 && observedOrdinal === 6) || (position === 8 && observedOrdinal === 7));
}

function discrepancyForDeclaredCountMismatch(
  artifact: AquinasGutenbergArtifact,
  questionNumber: number,
  declaration: DeclaredArticleCount,
  resolvedArticleCount: number,
  containingElement: BodyElement,
  html: string,
  offsets: Uint32Array,
): AquinasTopologyDiscrepancy {
  return discrepancyRecord(
    artifact,
    questionNumber,
    null,
    null,
    null,
    declaration.tokenStartChar,
    declaration.tokenEndChar,
    html,
    offsets,
    ['declared_article_count_mismatch'],
    'article_shell_count_and_preamble_evidence',
    { startChar: containingElement.startChar, endChar: containingElement.endChar },
    declaration.count,
    resolvedArticleCount,
  );
}

function discrepancyForMissingDeclaration(
  artifact: AquinasGutenbergArtifact,
  questionNumber: number,
  resolvedArticleCount: number,
  preambleStartChar: number,
  preambleEndChar: number,
  html: string,
  offsets: Uint32Array,
): AquinasTopologyDiscrepancy {
  return discrepancyRecord(
    artifact,
    questionNumber,
    null,
    null,
    null,
    preambleStartChar,
    preambleEndChar,
    html,
    offsets,
    ['declared_article_count_absent'],
    'article_shell_count_and_preamble_evidence',
    undefined,
    null,
    resolvedArticleCount,
  );
}

function discrepancyForAbsentArticle(
  artifact: AquinasGutenbergArtifact,
  questionNumber: number,
  preambleStartChar: number,
  articleStartChar: number,
  questionEndChar: number,
  html: string,
  offsets: Uint32Array,
): AquinasTopologyDiscrepancy {
  return discrepancyRecord(
    artifact,
    questionNumber,
    1,
    null,
    null,
    articleStartChar,
    questionEndChar,
    html,
    offsets,
    ['article_heading_absent', 'article_locator_absent'],
    'ordinal_position_and_declared_count',
    undefined,
    null,
    null,
    { preambleStartChar, preambleEndChar: articleStartChar, articleStartChar, articleEndChar: questionEndChar },
  );
}

function discrepancyForMissingQuestionHeading(
  artifact: AquinasGutenbergArtifact,
  question: ResolvedQuestion,
  html: string,
  offsets: Uint32Array,
): AquinasTopologyDiscrepancy {
  return discrepancyRecord(artifact, question.questionNumber, null, null, null, question.startChar, question.articles[0]!.startChar, html, offsets, ['question_heading_absent'], 'ledgered_missing_question_heading_scope');
}

function discrepancyRecord(
  artifact: AquinasGutenbergArtifact,
  questionNumber: number,
  ordinal: number | null,
  observedLocator: string | null,
  observedTagName: string | null,
  startChar: number,
  endChar: number,
  html: string,
  offsets: Uint32Array,
  codes: readonly string[],
  resolutionBasis: AquinasTopologyDiscrepancy['resolutionBasis'],
  containingElement: Readonly<{ startChar: number; endChar: number }> | undefined = undefined,
  observedDeclaredArticleCount: number | null = null,
  resolvedArticleCount: number | null = null,
  resolvedBoundary: Readonly<{ preambleStartChar: number; preambleEndChar: number; articleStartChar: number; articleEndChar: number }> | undefined = undefined,
): AquinasTopologyDiscrepancy {
  const questionKey = `${artifact.partKey}.q${String(questionNumber).padStart(3, '0')}`;
  return {
    ebookId: artifact.ebookId,
    partKey: artifact.partKey,
    htmlMemberSha256: artifact.htmlMember.sha256,
    questionKey,
    articleKey: ordinal === null ? null : `${questionKey}.a${String(ordinal).padStart(3, '0')}`,
    observedLocator,
    observedTagName,
    evidenceStartByte: offsets[startChar]!,
    evidenceEndByte: offsets[endChar]!,
    evidenceSha256: sha256Bytes(utf8Slice(html, offsets, startChar, endChar)),
    containingElementStartByte: containingElement === undefined ? null : offsets[containingElement.startChar]!,
    containingElementEndByte: containingElement === undefined ? null : offsets[containingElement.endChar]!,
    containingElementSha256: containingElement === undefined ? null : sha256Bytes(utf8Slice(html, offsets, containingElement.startChar, containingElement.endChar)),
    observedDeclaredArticleCount,
    resolvedArticleCount,
    resolvedPreambleStartByte: resolvedBoundary === undefined ? null : offsets[resolvedBoundary.preambleStartChar]!,
    resolvedPreambleEndByte: resolvedBoundary === undefined ? null : offsets[resolvedBoundary.preambleEndChar]!,
    resolvedArticleStartByte: resolvedBoundary === undefined ? null : offsets[resolvedBoundary.articleStartChar]!,
    resolvedArticleEndByte: resolvedBoundary === undefined ? null : offsets[resolvedBoundary.articleEndChar]!,
    codes: [...codes],
    resolutionBasis,
  };
}

function partCode(partKey: AquinasPartKey): string {
  return ({ prima: 'I', 'prima-secundae': 'I-II', 'secunda-secundae': 'II-II', tertia: 'III' } as const)[partKey];
}

function lastIndexBefore(elements: readonly BodyElement[], exclusive: number, predicate: (element: BodyElement) => boolean): number {
  for (let index = exclusive - 1; index >= 0; index -= 1) if (predicate(elements[index]!)) return index;
  return -1;
}

function nextElement(elements: readonly BodyElement[], index: number, exclusive: number): BodyElement | undefined {
  const next = elements[index + 1];
  return next && next.index < exclusive ? next : undefined;
}

function articleKeysFor(questionKey: string, articleCount: number): readonly string[] {
  return Array.from({ length: articleCount }, (_, index) => `${questionKey}.a${String(index + 1).padStart(3, '0')}`);
}

export function assertExactCoverage(ranges: readonly LocatedRange[], startChar: number, endChar: number, ebookId: number): void {
  const sorted = [...ranges].sort((a, b) => a.startChar - b.startChar || a.endChar - b.endChar);
  let expected = startChar;
  for (const range of sorted) {
    if (range.startChar !== expected || range.endChar <= range.startChar) fail(`eBook ${ebookId} source-byte coverage has an unknown gap or overlap`);
    expected = range.endChar;
  }
  if (expected !== endChar) fail(`eBook ${ebookId} source-byte coverage does not reach its exact cutoff`);
}

export function strictHtmlUtf8(bytes: Uint8Array, label: string): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    fail(`${label} is not strict UTF-8`);
  }
  if (text.startsWith('\ufeff') || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text) || /[\u202a-\u202e\u2066-\u2069]/u.test(text)) fail(`${label} contains forbidden controls or bidi formatting`);
  assertSafeUnicode(text, label);
  return text;
}

function assertSafeUnicode(value: string, label: string): void {
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if ((code & 0xffff) === 0xfffe || (code & 0xffff) === 0xffff || (code >= 0xfdd0 && code <= 0xfdef) || (code >= 0xd800 && code <= 0xdfff)) fail(`${label} contains a forbidden Unicode scalar`);
  }
}

function utf8Offsets(text: string): Uint32Array {
  const offsets = new Uint32Array(text.length + 1);
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    offsets[index] = bytes;
    const point = text.codePointAt(index)!;
    const width = point > 0xffff ? 2 : 1;
    bytes += Buffer.byteLength(String.fromCodePoint(point), 'utf8');
    if (width === 2) offsets[index + 1] = bytes - 4;
    index += width - 1;
    offsets[index + 1] = bytes;
  }
  return offsets;
}

function utf8Slice(text: string, offsets: Uint32Array, startChar: number, endChar: number): Buffer {
  let bytes = UTF8_SLICE_CACHE.get(text);
  if (bytes === undefined) {
    if (UTF8_SLICE_CACHE.size >= 16) UTF8_SLICE_CACHE.clear();
    bytes = Buffer.from(text, 'utf8');
    UTF8_SLICE_CACHE.set(text, bytes);
  }
  return bytes.subarray(offsets[startChar]!, offsets[endChar]!);
}

function findElement(node: DefaultTreeAdapterTypes.Node, tagName: string): DefaultTreeAdapterTypes.Element | undefined {
  if ('tagName' in node && node.tagName === tagName) return node as DefaultTreeAdapterTypes.Element;
  if ('childNodes' in node) for (const child of node.childNodes) {
    const found = findElement(child, tagName);
    if (found) return found;
  }
  return undefined;
}

function receiptSha256(sourceRoot: string): string {
  const path = resolve(sourceRoot, AQUINAS_GUTENBERG_RECEIPT_PATH);
  assertSafeLocalRegularFile(path, 'local receipt');
  return sha256Bytes(readFileSync(path));
}

function assertSafeLocalRegularFile(path: string, label: string): void {
  if (!existsSync(path)) fail(`${label} is missing`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} is not a safe regular file`);
}

function sha256Text(value: string): string {
  return sha256Bytes(Buffer.from(value, 'utf8'));
}

export function writeAquinasGutenbergTopologyLock(sourceRoot: string, outputRoot = ROOT): AquinasTopologyLock {
  const topology = scanAquinasGutenbergTopology(sourceRoot, outputRoot);
  const path = resolve(outputRoot, AQUINAS_GUTENBERG_TOPOLOGY_LOCK_PATH);
  if (existsSync(path)) fail('topology lock already exists; preserve-only writing forbids clobbering it');
  writeFileSync(path, `${JSON.stringify(topology, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return topology;
}

export function verifyAquinasGutenbergTopologyLock(sourceRoot: string, outputRoot = ROOT): AquinasTopologyLock {
  const path = resolve(outputRoot, AQUINAS_GUTENBERG_TOPOLOGY_LOCK_PATH);
  assertSafeLocalRegularFile(path, 'topology lock');
  const bytes = readFileSync(path);
  if (sha256Bytes(bytes) !== EXPECTED_TOPOLOGY_LOCK_SHA256) fail('topology lock byte identity drifted');
  const locked = JSON.parse(strictHtmlUtf8(bytes, 'topology lock')) as AquinasTopologyLock;
  const first = scanAquinasGutenbergTopology(sourceRoot, outputRoot);
  const second = scanAquinasGutenbergTopology(sourceRoot, outputRoot);
  const firstJson = `${JSON.stringify(first, null, 2)}\n`;
  const secondJson = `${JSON.stringify(second, null, 2)}\n`;
  if (firstJson !== secondJson) fail('topology scanner is not deterministic across a second run');
  if (JSON.stringify(locked) !== JSON.stringify(first)) fail('topology lock no longer exactly matches the local locked-source scan');
  return first;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const sourceIndex = process.argv.indexOf('--source-root');
  if (sourceIndex === -1) fail('--source-root is required and must identify the verified A0 local cache');
  const sourceRoot = process.argv[sourceIndex + 1];
  if (!sourceRoot) fail('--source-root requires a path');
  if (command === '--write-discrepancy-ledger') {
    const result = writeAquinasGutenbergTopologyDiscrepancyLedger(sourceRoot);
    console.error(`[aquinas-gutenberg-topology] wrote a content-free discrepancy ledger with ${result.entries.length} entries.`);
    return;
  }
  if (command === '--write-topology-lock') {
    const result = writeAquinasGutenbergTopologyLock(sourceRoot);
    console.error(`[aquinas-gutenberg-topology] wrote a content-free topology lock for ${result.questions.length} questions.`);
    return;
  }
  if (command === '--verify-topology-lock') {
    const result = verifyAquinasGutenbergTopologyLock(sourceRoot);
    console.error(`[aquinas-gutenberg-topology] verified deterministic content-free topology for ${result.questions.length} questions.`);
    return;
  }
  fail('use --write-discrepancy-ledger, --write-topology-lock, or --verify-topology-lock with an explicit local --source-root');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
