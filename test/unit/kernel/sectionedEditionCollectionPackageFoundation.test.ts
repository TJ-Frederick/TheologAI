import { describe, expect, it } from 'vitest';
import {
  AQUINAS_GUTENBERG_A1_DISCREPANCY_LEDGER_SHA256,
  AQUINAS_GUTENBERG_A1_TOPOLOGY_LOCK_SHA256,
  SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS,
  SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS,
  SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY,
  SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS,
  SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA,
  SectionedEditionCollectionPackageValidationError,
  compileSectionedEditionCollectionPackage,
  expectedAquinasPackageQuestionKeys,
  normalizeSyntheticReviewedBlock,
  orderedAquinasPackageQuestionKeysSha256,
  validateCompiledSectionedEditionCollectionPackageSet,
  validateSectionedEditionCollectionPackageDraft,
  type SectionedEditionCollectionPackageDraft,
  type SectionedEditionCollectionPackageDraftArticle,
  type SectionedEditionCollectionPackageDraftPreamble,
  type SectionedEditionCollectionPackageSourceEvidence,
} from '../../../src/kernel/sectionedEditionCollectionPackageFoundation.js';
import { sha256Hex } from '../../../src/kernel/sha256.js';

const SYNTHETIC_ARTIFACT_SHA256 = sha256Hex('synthetic-a2-artifact');

describe('inactive sectioned edition collection package foundation', () => {
  it('pins the reviewed A1 topology and performs only the approved mechanical normalization', () => {
    const draft = syntheticDraft();
    const result = compileSectionedEditionCollectionPackage(draft);
    const first = result.packages[0]!.package.questions[0]!;

    expect(draft.topology).toEqual({
      topologyLockSha256: AQUINAS_GUTENBERG_A1_TOPOLOGY_LOCK_SHA256,
      discrepancyLedgerSha256: AQUINAS_GUTENBERG_A1_DISCREPANCY_LEDGER_SHA256,
      orderedQuestionKeysSha256: orderedAquinasPackageQuestionKeysSha256(),
    });
    expect(first.preamble?.content).toBe('[SYNTHETIC] Café &\n*[Markdown]* #Case');
    expect(first.preamble?.content).toContain('[Markdown]');
    expect(first.preamble?.content).toContain('#Case');
    expect(first.preamble?.bracketPreservationStatus).toBe(SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS);
    expect(first.preamble?.correctionStatus).toBe(SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS);
    expect(result.manifest.shards.flatMap(shard => shard.questionKeys)).toEqual(expectedAquinasPackageQuestionKeys());
    expect(validateCompiledSectionedEditionCollectionPackageSet(result)).toEqual(result);
    expect(normalizeSyntheticReviewedBlock('  A\tB <br>  C  ')).toBe('A B\nC');
  });

  it('uses maximal-prefix, within-part deterministic sharding without splitting a question', () => {
    const first = compileSectionedEditionCollectionPackage(syntheticDraft({ largePrimaArticles: 40 }));
    const second = compileSectionedEditionCollectionPackage(syntheticDraft({ largePrimaArticles: 40 }));

    expect(first).toEqual(second);
    expect(first.manifest.shards.filter(shard => shard.partKey === 'prima')).toHaveLength(2);
    expect(first.manifest.shards[0]).toMatchObject({
      shardId: 'aquinas-summa-pg-v1.prima.shard-0001',
      firstQuestionKey: 'prima.q001',
      lastQuestionKey: 'prima.q023',
    });
    expect(first.manifest.shards[1]).toMatchObject({
      shardId: 'aquinas-summa-pg-v1.prima.shard-0002',
      firstQuestionKey: 'prima.q024',
      lastQuestionKey: 'prima.q119',
    });
    expect(first.manifest.shards.every(shard => shard.normalizedContentUtf8Bytes <= SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes)).toBe(true);
    expect(first.manifest.shards.every(shard => shard.canonicalSerializedPackageUtf8Bytes <= SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes)).toBe(true);
    expect(first.manifest.shards.map(shard => shard.canonicalPackageSha256)).toEqual(first.packages.map(value => value.sha256));
    expect(validateCompiledSectionedEditionCollectionPackageSet(first)).toEqual(first);
  });

  it('permits a q102 parent aggregate over the child cap when every typed child is safe', () => {
    const result = compileSectionedEditionCollectionPackage(syntheticDraft());
    const q102 = result.packages.flatMap(value => value.package.questions).find(question => question.questionKey === 'prima.q102')!;

    expect(q102.output.utf8Bytes).toBeGreaterThan(SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes);
    expect(q102.articles).toHaveLength(2);
    expect(q102.articles.every(article => article.output.utf8Bytes <= SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes)).toBe(true);
    expect(q102.articles.map(article => article.content.length)).toEqual([70_000, 70_000]);
    expect(result.packages.filter(value => value.package.questions.some(question => question.questionKey === 'prima.q102'))).toHaveLength(1);
  });

  it('rejects invalid Unicode, controls, bidi controls, noncharacters, malformed source, and confusable IDs', () => {
    for (const html of [
      'synthetic\u0000control',
      'synthetic\u202ebidi',
      'synthetic\ufdd0noncharacter',
      'synthetic\ud800surrogate',
      '<strong>unreviewed-tag</strong>',
      '<br data-unreviewed="x">',
    ]) expect(() => normalizeSyntheticReviewedBlock(html)).toThrow(SectionedEditionCollectionPackageValidationError);

    const confusable = syntheticDraft();
    confusable.questions[0]!.questionKey = 'prima.q0ο1';
    expect(() => validateSectionedEditionCollectionPackageDraft(confusable)).toThrow(/non-confusable|frozen A1/);

    const correction = syntheticDraft();
    correction.questions[0]!.preamble!.correctionStatus = 'corrected' as never;
    expect(() => validateSectionedEditionCollectionPackageDraft(correction)).toThrow(/mechanical_only_no_silent_correction/);

    const unreferencedLedgeredQuestion = syntheticDraft();
    unreferencedLedgeredQuestion.questions[18]!.discrepancyRefs = [];
    expect(() => validateSectionedEditionCollectionPackageDraft(unreferencedLedgeredQuestion)).toThrow(/explicit reviewed discrepancy reference/);
  });

  it('rejects source drift, unreviewed source gaps or overlaps, and an over-cap content child', () => {
    const drift = syntheticDraft();
    drift.questions[0]!.articles[0]!.source.artifactSha256 = sha256Hex('drift');
    expect(() => validateSectionedEditionCollectionPackageDraft(drift)).toThrow(/artifactSha256/);

    const gap = syntheticDraft();
    gap.questions[0]!.source.span.startByte += 1;
    expect(() => validateSectionedEditionCollectionPackageDraft(gap)).toThrow(/no gaps or overlaps|exactly cover/);

    const overlap = syntheticDraft();
    overlap.questions[0]!.articles[0]!.source.span.startByte = overlap.questions[0]!.preamble!.source.span.startByte;
    expect(() => validateSectionedEditionCollectionPackageDraft(overlap)).toThrow(/no gaps or overlaps/);

    const tooLarge = syntheticDraft();
    replaceQuestionArticle(tooLarge, 0, 1, 'x'.repeat(SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes + 1));
    expect(() => compileSectionedEditionCollectionPackage(tooLarge)).toThrow(/content-bearing child limit/);
  });

  it('rejects hostile arrays and accessor properties before caller-controlled behavior can run', () => {
    class HostileArray<T> extends Array<T> {
      override map(): never { throw new Error('caller-controlled map invoked'); }
      override [Symbol.iterator](): ArrayIterator<T> { throw new Error('caller-controlled iterator invoked'); }
    }
    const hostile = syntheticDraft();
    hostile.questions = new HostileArray(...hostile.questions) as never;
    expect(() => validateSectionedEditionCollectionPackageDraft(hostile)).toThrow(/dense plain array/);

    const accessor = syntheticDraft();
    Object.defineProperty(accessor.questions, '0', {
      enumerable: true,
      configurable: true,
      get: () => { throw new Error('caller-controlled getter invoked'); },
    });
    expect(() => validateSectionedEditionCollectionPackageDraft(accessor)).toThrow(/data value/);
  });

  it('rejects dishonest derived output evidence, package sizes, hashes, and shard coverage', () => {
    const compiled = compileSectionedEditionCollectionPackage(syntheticDraft());

    const dishonestOutput = structuredClone(compiled);
    dishonestOutput.packages[0]!.package.questions[0]!.articles[0]!.output.sha256 = sha256Hex('dishonest');
    expect(() => validateCompiledSectionedEditionCollectionPackageSet(dishonestOutput)).toThrow(/sha256/);

    const dishonestSize = structuredClone(compiled);
    dishonestSize.manifest.shards[0]!.canonicalSerializedPackageUtf8Bytes += 1;
    expect(() => validateCompiledSectionedEditionCollectionPackageSet(dishonestSize)).toThrow(/manifest/);

    const dishonestShard = structuredClone(compiled);
    dishonestShard.manifest.shards[0]!.questionKeys.reverse();
    expect(() => validateCompiledSectionedEditionCollectionPackageSet(dishonestShard)).toThrow(/exact ordered full coverage|manifest/);
  });
});

function syntheticDraft(options: { largePrimaArticles?: number } = {}): SectionedEditionCollectionPackageDraft {
  let sourceCursor = 32;
  const questions = expectedAquinasPackageQuestionKeys().map((questionKey, index) => {
    const isFirst = index === 0;
    const isQ102 = questionKey === 'prima.q102';
    const articleLength = index < (options.largePrimaArticles ?? 0) ? 100_000 : 0;
    const preamble = isFirst
      ? child('preamble', sourceEvidence(['[SYNTHETIC]  Cafe\u0301 &amp; <br> *[Markdown]* #Case'], sourceCursor))
      : null;
    if (preamble) sourceCursor = preamble.source.span.endByte;
    const articles = isQ102
      ? [
        child('article', sourceEvidence(['A'.repeat(70_000)], sourceCursor), questionKey, 1),
        child('article', sourceEvidence(['B'.repeat(70_000)], sourceCursor + 70_000), questionKey, 2),
      ]
      : [child('article', sourceEvidence([articleLength > 0 ? 'X'.repeat(articleLength) : `[SYNTHETIC ${questionKey}]`], sourceCursor), questionKey, 1)];
    sourceCursor = articles.at(-1)!.source.span.endByte;
    const children = preamble ? [preamble, ...articles] : articles;
    const source = parentSource(children.map(value => value.source));
    return {
      questionKey,
      partKey: questionKey.slice(0, questionKey.indexOf('.q')) as SectionedEditionCollectionPackageDraft['questions'][number]['partKey'],
      source,
      sourceLocatorStatus: questionKey === 'prima.q019' ? 'discrepancy_ledgered' as const : 'verified' as const,
      discrepancyRefs: questionKey === 'prima.q019' ? ['synthetic-locator-issue'] : [],
      preamble,
      articles,
    };
  });
  return {
    schemaVersion: SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA,
    topology: {
      topologyLockSha256: AQUINAS_GUTENBERG_A1_TOPOLOGY_LOCK_SHA256,
      discrepancyLedgerSha256: AQUINAS_GUTENBERG_A1_DISCREPANCY_LEDGER_SHA256,
      orderedQuestionKeysSha256: orderedAquinasPackageQuestionKeysSha256(),
    },
    normalizationPolicy: SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY,
    sourceArtifacts: [{
      artifactId: 'synthetic-source',
      artifactSha256: SYNTHETIC_ARTIFACT_SHA256,
      locator: 'synthetic://a2-source',
    }],
    rightsProvenance: {
      subject: 'exact_edition_transcription',
      rightsReviewStatus: 'unreviewed',
      redistributionApproved: false,
      reviewReference: 'synthetic-review-reference',
      provenanceReference: 'synthetic-provenance-reference',
    },
    exclusions: [{
      exclusionId: 'synthetic-editorial-interlude',
      kind: 'editorial_interlude',
      disposition: 'excluded_without_normalization',
      reason: 'synthetic inventory entry only',
      source: {
        artifactId: 'synthetic-source',
        artifactSha256: SYNTHETIC_ARTIFACT_SHA256,
        span: { startByte: 0, endByte: 32, sha256: sha256Hex('synthetic exclusion evidence') },
      },
    }],
    discrepancyInventory: [{
      discrepancyRef: 'synthetic-locator-issue',
      ledgerEntrySha256: sha256Hex('synthetic discrepancy ledger row'),
      resolutionStatus: 'preserved_without_correction',
    }],
    questions,
  };
}

function child(
  kind: 'preamble',
  source: SectionedEditionCollectionPackageSourceEvidence,
): SectionedEditionCollectionPackageDraftPreamble;
function child(
  kind: 'article',
  source: SectionedEditionCollectionPackageSourceEvidence,
  questionKey: string,
  ordinal: number,
): SectionedEditionCollectionPackageDraftArticle;
function child(
  kind: 'preamble' | 'article',
  source: SectionedEditionCollectionPackageSourceEvidence,
  questionKey?: string,
  ordinal?: number,
): SectionedEditionCollectionPackageDraftPreamble | SectionedEditionCollectionPackageDraftArticle {
  const common = {
    kind,
    source,
    bracketPreservationStatus: SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS,
    correctionStatus: SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS,
  };
  if (kind === 'preamble') return { ...common, kind: 'preamble' };
  return { ...common, kind: 'article' as const, articleKey: `${questionKey}.a${String(ordinal).padStart(3, '0')}`, ordinal: ordinal! };
}

function sourceEvidence(htmls: readonly string[], startByte: number): SectionedEditionCollectionPackageSourceEvidence {
  let cursor = startByte;
  const blocks = htmls.map(html => {
    const endByte = cursor + new TextEncoder().encode(html).byteLength;
    const block = { span: { startByte: cursor, endByte, sha256: sha256Hex(html) }, html };
    cursor = endByte;
    return block;
  });
  return {
    artifactId: 'synthetic-source',
    artifactSha256: SYNTHETIC_ARTIFACT_SHA256,
    span: { startByte, endByte: cursor, sha256: sha256Hex(htmls.join('')) },
    blocks,
  };
}

function parentSource(children: readonly SectionedEditionCollectionPackageSourceEvidence[]) {
  const first = children[0]!;
  const last = children.at(-1)!;
  return {
    artifactId: first.artifactId,
    artifactSha256: first.artifactSha256,
    span: {
      startByte: first.span.startByte,
      endByte: last.span.endByte,
      sha256: sha256Hex(children.flatMap(childValue => childValue.blocks.map(block => block.html)).join('')),
    },
  };
}

function replaceQuestionArticle(draft: SectionedEditionCollectionPackageDraft, questionIndex: number, ordinal: number, html: string): void {
  const question = draft.questions[questionIndex]!;
  const article = question.articles[ordinal - 1]!;
  const startByte = article.source.span.startByte;
  article.source = sourceEvidence([html], startByte);
  question.source = parentSource(question.preamble ? [question.preamble.source, ...question.articles.map(value => value.source)] : question.articles.map(value => value.source));
}
