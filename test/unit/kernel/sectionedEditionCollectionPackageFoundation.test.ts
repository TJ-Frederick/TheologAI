import { describe, expect, it } from 'vitest';
import {
  AQUINAS_A1_DISCREPANCY_INVENTORY,
  AQUINAS_A1_PACKAGE_IDENTITY,
  AQUINAS_A1_RIGHTS_AND_COVERAGE,
  SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS,
  SectionedEditionCollectionPackageValidationError,
  buildMaximalWithinPartPackagePlan,
  canonicalSectionedEditionCollectionPackageBytes,
  compileSectionedEditionCollectionPackage,
  expectedAquinasPackageQuestionKeys,
  renderReviewedElement,
  validateImmutableA1EvidenceDescriptor,
  verifyPersistedPackageBytes,
  type AquinasPackagePartKey,
  type RawSpan,
  type TransientChild,
  type TransientQuestion,
  type TransientReviewedBlock,
  type TransientSectionedEditionCollectionDraft,
} from '../../../src/kernel/sectionedEditionCollectionPackageFoundation.js';
import { sha256Hex } from '../../../src/kernel/sha256.js';

describe('inactive sectioned edition collection package contract', () => {
  it('keeps exact A1 evidence content-free and pins source, topology, prologue, rights, and ledger claims', () => {
    expect(() => validateImmutableA1EvidenceDescriptor()).not.toThrow();
    expect(AQUINAS_A1_DISCREPANCY_INVENTORY).toHaveLength(46);
    expect(AQUINAS_A1_DISCREPANCY_INVENTORY.map(entry => entry.ref)).toEqual([
      ...Array.from({ length: 46 }, (_, index) => `a1-ledger-${String(index + 1).padStart(3, '0')}`),
    ]);
    expect(AQUINAS_A1_PACKAGE_IDENTITY).toMatchObject({ contentFormat: 'plain_text', availability: 'local_only_inactive' });
    expect(AQUINAS_A1_RIGHTS_AND_COVERAGE).toMatchObject({
      jurisdiction: 'US-only', rightsStatus: 'public_domain', authorialCoverageThrough: 'tertia.q090', supplement: 'excluded',
    });
    const counterfeitA1 = syntheticDraft();
    counterfeitA1.mode = 'a1_attested';
    expect(() => compileSectionedEditionCollectionPackage(counterfeitA1)).toThrow(/sourceLockSha256/);
  });

  it('renders real-shaped pinned parse5 markup with entities, NFC, bracket preservation, and br-only LF', () => {
    const rendered = renderReviewedElement(block('<p>[SYNTHETIC]  Cafe\u0301 &amp; <em>*[Markdown]* #Case</em><br><i>Keep</i></p>', 0));

    expect(rendered.content).toBe('[SYNTHETIC] Café & *[Markdown]* #Case\nKeep');
    expect(rendered.content).toContain('[Markdown]');
    expect(rendered.stats).toMatchObject({ blocks: 1, nodes: 7, attributes: 0 });
    expect(() => renderReviewedElement(block('<p>literal \uE000 stays literal</p>', 0))).not.toThrow();
    expect(renderReviewedElement(block('<p>literal \uE000 stays literal</p>', 0)).content).toContain('\uE000');
    expect(() => renderReviewedElement(block('<p>a\nb</p>', 0))).toThrow(/LF\/CR/);
    expect(() => renderReviewedElement(block('<p><a>not-pinned</a></p>', 0))).toThrow(/pinned/);
  });

  it('strips raw HTML from persisted source evidence and verifies standalone canonical bytes by recompilation', () => {
    const draft = syntheticDraft();
    const compiled = compileSectionedEditionCollectionPackage(draft);
    const first = compiled.packages[0]!;
    const serialized = new TextDecoder().decode(first.persistedBytes);

    expect(serialized).not.toContain('<p>');
    expect(serialized).not.toContain('canonicalJson');
    expect(serialized).not.toContain('synthetic-excluded-range');
    expect(first.package.questions[0]!.preamble.source).toEqual(expect.objectContaining({
      artifactId: 'synthetic-prima', outputSha256: expect.any(String),
    }));
    expect(first.package.questions[0]!.preamble.source.span.rawSha256).toEqual(expect.any(String));
    expect(verifyPersistedPackageBytes(draft, compiled.packages.map(value => value.persistedBytes))).toEqual(compiled);

    const corrupted = compiled.packages.map(value => value.persistedBytes.slice());
    corrupted[0]![0] ^= 1;
    expect(() => verifyPersistedPackageBytes(draft, corrupted)).toThrow(/byte-compare/);
  });

  it('uses deterministic maximal-prefix shards without splitting q102 parent aggregate over child-safe limits', () => {
    const metrics = expectedAquinasPackageQuestionKeys().map((questionKey, index) => ({
      questionKey,
      normalizedContentUtf8Bytes: index < 33 ? 131_072 : 1,
      canonicalSerializedPackageUtf8Bytes: index < 33 ? 131_072 : 1,
    }));
    const firstPlan = buildMaximalWithinPartPackagePlan(metrics);
    const secondPlan = buildMaximalWithinPartPackagePlan(metrics);
    const first = compileSectionedEditionCollectionPackage(syntheticDraft());
    const q102 = first.packages.flatMap(value => value.package.questions).find(question => question.questionKey === 'prima.q102')!;

    expect(firstPlan).toEqual(secondPlan);
    expect(firstPlan.filter(shard => shard.partKey === 'prima')).toHaveLength(2);
    expect(firstPlan[0]).toMatchObject({ questionKeys: expect.arrayContaining(['prima.q001', 'prima.q032']) });
    expect(firstPlan[0]!.questionKeys).toHaveLength(32);
    expect(first.manifest.shards.flatMap(shard => shard.questionKeys)).toEqual(expectedAquinasPackageQuestionKeys());
    expect(first.manifest.shards.every(shard => shard.normalizedContentUtf8Bytes <= SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes)).toBe(true);
    expect(first.manifest.shards.every(shard => shard.canonicalSerializedPackageUtf8Bytes <= SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes)).toBe(true);
    expect(q102.output.utf8Bytes).toBeGreaterThan(SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes);
    expect(q102.articles.every(article => article.output.utf8Bytes <= SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes)).toBe(true);
    expect(first.packages.filter(value => value.package.questions.some(question => question.questionKey === 'prima.q102'))).toHaveLength(1);
  });

  it('rejects source/hash drift, parent-artifact mismatch, coverage gaps, unsafe markup bombs, and raw cap violations', () => {
    const drift = syntheticDraft();
    drift.questions[0]!.preamble.source.blocks[0]!.span.rawSha256 = sha256Hex('drift');
    expect(() => compileSectionedEditionCollectionPackage(drift)).toThrow(/rawSha256/);

    const artifactMismatch = syntheticDraft();
    artifactMismatch.questions[0]!.source.artifactId = 'synthetic-tertia';
    expect(() => compileSectionedEditionCollectionPackage(artifactMismatch)).toThrow(/matching part artifact/);

    const gap = syntheticDraft();
    gap.sourceArtifacts[0]!.cutoffEndByte -= 1;
    expect(() => compileSectionedEditionCollectionPackage(gap)).toThrow(/exactly cover/);

    const deep = `<p>${'<i>'.repeat(33)}x${'</i>'.repeat(33)}</p>`;
    expect(() => renderReviewedElement(block(deep, 0))).toThrow(/depth exceeds/);

    const attributed = block('<p class="bomb">x</p>', 0);
    expect(() => renderReviewedElement(attributed)).toThrow(/attributes/);

    const overChild = syntheticDraft();
    replaceFirstArticle(overChild, `<p>${'x'.repeat(SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes + 1)}</p>`);
    expect(() => compileSectionedEditionCollectionPackage(overChild)).toThrow(/content-child/);
  });

  it('rejects sparse/hostile input, invalid Unicode, canonical hazards, and no-silent-correction metadata', () => {
    class HostileArray<T> extends Array<T> { override map(): never { throw new Error('caller map'); } }
    const hostile = syntheticDraft();
    hostile.questions = new HostileArray(...hostile.questions) as never;
    expect(() => compileSectionedEditionCollectionPackage(hostile)).toThrow(/dense plain array/);

    for (const html of ['<p>a\u0000b</p>', '<p>a\u202eb</p>', '<p>a\ufdd0b</p>', '<p>a\ud800b</p>']) {
      expect(() => renderReviewedElement(block(html, 0))).toThrow(SectionedEditionCollectionPackageValidationError);
    }
    for (const value of [undefined, BigInt(1), Symbol('x'), () => 1, NaN, Infinity, -1, -0]) {
      expect(() => canonicalSectionedEditionCollectionPackageBytes(value)).toThrow(SectionedEditionCollectionPackageValidationError);
    }
    expect(() => canonicalSectionedEditionCollectionPackageBytes({ nested: [undefined] })).toThrow(/undefined/);
    const correction = syntheticDraft();
    correction.questions[0]!.preamble.correctionStatus = 'silent_correction' as never;
    expect(() => compileSectionedEditionCollectionPackage(correction)).toThrow(/mechanical_only_no_silent_correction/);
  });
});

function syntheticDraft(options: { largePrimaArticles?: number } = {}): TransientSectionedEditionCollectionDraft {
  const cursors = new Map<AquinasPackagePartKey, number>([
    ['prima', 0], ['prima-secundae', 0], ['secunda-secundae', 0], ['tertia', 0],
  ]);
  const sourceArtifacts = (['prima', 'prima-secundae', 'secunda-secundae', 'tertia'] as AquinasPackagePartKey[]).map(partKey => ({
    artifactId: `synthetic-${partKey}`,
    partKey,
    htmlMemberBytes: 1,
    htmlMemberSha256: sha256Hex(`synthetic-artifact:${partKey}`),
    intellectualStartByte: 0,
    cutoffEndByte: 1,
    rawCoverageSha256: sha256Hex(`synthetic-coverage:${partKey}`),
  }));
  const partPrologues = (['prima', 'prima-secundae', 'tertia'] as AquinasPackagePartKey[]).map(partKey => {
    const child = makeChild('part_prologue', partKey, cursors, `<p><i>[Synthetic ${partKey} prologue]</i></p>`);
    return { partKey, child };
  });
  const questions = expectedAquinasPackageQuestionKeys().map((questionKey, index) => {
    const partKey = questionKey.slice(0, questionKey.indexOf('.q')) as AquinasPackagePartKey;
    const preamble = makeChild('preamble', partKey, cursors, index === 0
      ? '<p>[SYNTHETIC]  Cafe\u0301 &amp; <em>*[Markdown]* #Case</em><br><i>Keep</i></p>'
      : `<p>[Synthetic preamble ${questionKey}]</p>`);
    const isQ102 = questionKey === 'prima.q102';
    const length = index < (options.largePrimaArticles ?? 0) ? 100_000 : 0;
    const articles = isQ102
      ? [
        makeChild('article', partKey, cursors, `<p>${'A'.repeat(70_000)}</p>`, questionKey, 1),
        makeChild('article', partKey, cursors, `<p>${'B'.repeat(70_000)}</p>`, questionKey, 2),
      ]
      : [makeChild('article', partKey, cursors, `<p>${length > 0 ? 'X'.repeat(length) : `[Synthetic article ${questionKey}]`}</p>`, questionKey, 1)];
    const children = [preamble, ...articles];
    return {
      questionKey,
      partKey,
      questionNumber: Number(questionKey.slice(-3)),
      articleCount: articles.length,
      source: parentSource(children),
      orderedArticleKeysSha256: sha256Hex(articles.map(article => article.articleKey!).join('|')),
      bracketStatus: 'mixed_unresolved_preserve_verbatim_in_a2' as const,
      sourceLocatorStatus: 'verified' as const,
      sourceStructureStatus: 'verified' as const,
      discrepancyRefs: [],
      preamble,
      articles,
    } satisfies TransientQuestion;
  });
  const lastPart = 'tertia' as const;
  const exclusionStart = cursors.get(lastPart)!;
  const exclusions = [{
    exclusionId: 'synthetic-editorial-interlude', kind: 'editorial_interlude' as const, artifactId: 'synthetic-tertia',
    html: 'synthetic-excluded-range', span: span('synthetic-excluded-range', exclusionStart),
  }];
  cursors.set(lastPart, exclusions[0]!.span.endByte);
  for (const source of sourceArtifacts) {
    source.cutoffEndByte = cursors.get(source.partKey)!;
    source.htmlMemberBytes = source.cutoffEndByte;
  }
  return {
    mode: 'synthetic_fixture',
    schemaVersion: 'sectioned-edition-collection-package.v1',
    normalizationPolicy: 'parse5_pinned_topology_ascii_whitespace_br_lf_reviewed_blocks_nfc_only',
    identity: AQUINAS_A1_PACKAGE_IDENTITY,
    sourceLockSha256: sha256Hex('synthetic-source-lock'), localReceiptSha256: sha256Hex('synthetic-receipt'), topologyLockSha256: sha256Hex('synthetic-topology'), discrepancyLedgerSha256: sha256Hex('synthetic-ledger'),
    sourceArtifacts,
    rightsAndCoverage: AQUINAS_A1_RIGHTS_AND_COVERAGE,
    partPrologues,
    exclusions,
    discrepancies: [],
    questions,
  };
}

function makeChild(kind: TransientChild['kind'], partKey: AquinasPackagePartKey, cursors: Map<AquinasPackagePartKey, number>, html: string, questionKey?: string, ordinal?: number): TransientChild {
  const startByte = cursors.get(partKey)!;
  const source = { artifactId: `synthetic-${partKey}`, span: span(html, startByte), blocks: [block(html, startByte)] };
  cursors.set(partKey, source.span.endByte);
  return {
    kind,
    ...(kind === 'article' ? { articleKey: `${questionKey}.a${String(ordinal).padStart(3, '0')}`, ordinal } : {}),
    source,
    bracketPreservationStatus: 'brackets_preserved_exactly',
    correctionStatus: 'mechanical_only_no_silent_correction',
  };
}

function block(html: string, startByte: number): TransientReviewedBlock {
  return { span: span(html, startByte), html, topology: { containerTag: 'p', inlineTags: ['i', 'em', 'b', 'strong', 'span', 'sup', 'sub'] } };
}

function span(raw: string, startByte: number): RawSpan {
  return { startByte, endByte: startByte + new TextEncoder().encode(raw).byteLength, rawSha256: sha256Hex(raw) };
}

function parentSource(children: readonly TransientChild[]) {
  const first = children[0]!.source;
  const last = children.at(-1)!.source;
  const raw = children.flatMap(child => child.source.blocks.map(value => value.html)).join('');
  return { artifactId: first.artifactId, span: { startByte: first.span.startByte, endByte: last.span.endByte, rawSha256: sha256Hex(raw) } };
}

function replaceFirstArticle(draft: TransientSectionedEditionCollectionDraft, html: string): void {
  const question = draft.questions.at(-1)!;
  const article = question.articles[0]!;
  const startByte = article.source.span.startByte;
  const previousBytes = article.source.span.endByte - article.source.span.startByte;
  article.source = { ...article.source, span: span(html, startByte), blocks: [block(html, startByte)] };
  question.source = parentSource([question.preamble, ...question.articles]);
  const source = draft.sourceArtifacts.find(value => value.artifactId === question.source.artifactId)!;
  const difference = new TextEncoder().encode(html).byteLength - previousBytes;
  const trailingExclusion = draft.exclusions.find(value => value.artifactId === question.source.artifactId);
  if (trailingExclusion) {
    trailingExclusion.span.startByte += difference;
    trailingExclusion.span.endByte += difference;
  }
  source.cutoffEndByte += difference;
  source.htmlMemberBytes += difference;
}
