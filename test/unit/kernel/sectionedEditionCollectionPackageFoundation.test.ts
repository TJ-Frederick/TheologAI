import { beforeAll, describe, expect, it } from 'vitest';
import {
  AQUINAS_A1_DISCREPANCY_INVENTORY,
  AQUINAS_A1_DISCREPANCY_ENTRY_HASH_ALGORITHM,
  AQUINAS_A1_SOURCE_TYPED_RANGE_PROJECTION_ALGORITHM,
  AQUINAS_A1_SOURCE_TYPED_RANGES,
  AQUINAS_A1_PACKAGE_IDENTITY,
  AQUINAS_A1_RIGHTS_AND_COVERAGE,
  SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS,
  SectionedEditionCollectionPackageValidationError,
  assertReleaseManifestAttestation,
  assertReleasePackageAttestation,
  buildMaximalWithinPartPackagePlan,
  canonicalSectionedEditionCollectionPackageBytes,
  compileSectionedEditionCollectionPackage,
  expectedAquinasPackageQuestionKeys,
  renderReviewedElement,
  validateA1DiscrepancyProjection,
  validateA1SourceTypedRangeProjection,
  validateTransientSectionedEditionCollectionPackageDraft,
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
  let fixtureDraft: TransientSectionedEditionCollectionDraft;
  let fixtureCompiled: ReturnType<typeof compileSectionedEditionCollectionPackage>;

  beforeAll(() => {
    fixtureDraft = syntheticDraft();
    fixtureCompiled = compileSectionedEditionCollectionPackage(fixtureDraft);
  });

  it('keeps exact A1 evidence content-free and pins source, topology, prologue, rights, and ledger claims', () => {
    expect(() => validateImmutableA1EvidenceDescriptor()).not.toThrow();
    expect(AQUINAS_A1_DISCREPANCY_INVENTORY).toHaveLength(46);
    expect(AQUINAS_A1_DISCREPANCY_ENTRY_HASH_ALGORITHM).toBe('legacy_a1_canonical_entry_sha256');
    expect(AQUINAS_A1_SOURCE_TYPED_RANGE_PROJECTION_ALGORITHM).toBe('sha256_utf8_canonical_json_content_free_typed_range.v1');
    expect(AQUINAS_A1_SOURCE_TYPED_RANGES.map(value => value.typedRangeCount)).toEqual([705, 735, 1106, 642]);
    expect(() => validateA1SourceTypedRangeProjection(AQUINAS_A1_SOURCE_TYPED_RANGES)).not.toThrow();
    expect(() => validateA1DiscrepancyProjection(AQUINAS_A1_DISCREPANCY_INVENTORY)).not.toThrow();
    expect(AQUINAS_A1_DISCREPANCY_INVENTORY.map(entry => entry.ref)).toEqual([
      ...Array.from({ length: 46 }, (_, index) => `a1-ledger-${String(index + 1).padStart(3, '0')}`),
    ]);
    expect(AQUINAS_A1_PACKAGE_IDENTITY).toMatchObject({ contentFormat: 'plain_text', availability: 'local_only_inactive' });
    expect(AQUINAS_A1_RIGHTS_AND_COVERAGE).toMatchObject({
      jurisdiction: 'US-only', rightsStatus: 'public_domain', authorialCoverageThrough: 'tertia.q090', supplement: 'excluded',
    });
    expect(fixtureCompiled.manifest.shards.flatMap(shard => shard.questionKeys)).toEqual(expectedAquinasPackageQuestionKeys());
    expect(fixtureDraft.partPrologues.map(value => value.partKey)).toEqual(['prima', 'prima-secundae', 'tertia']);
    expect(fixtureDraft.typedRangeCount).toBe(3_184);

    const typedRangeDrift = structuredClone(AQUINAS_A1_SOURCE_TYPED_RANGES);
    typedRangeDrift[0]!.typedRangesSha256 = sha256Hex('changed-native-source-range');
    expect(() => validateA1SourceTypedRangeProjection(typedRangeDrift)).toThrow(/sourceTypedRanges/);
    for (const mutate of [
      (value: typeof AQUINAS_A1_DISCREPANCY_INVENTORY) => { value[0]!.codes[0] = 'changed_code'; },
      (value: typeof AQUINAS_A1_DISCREPANCY_INVENTORY) => { value[0]!.resolutionBasis = 'ledgered_missing_question_heading_scope'; },
      (value: typeof AQUINAS_A1_DISCREPANCY_INVENTORY) => { value[0]!.evidenceEndByte += 1; },
      (value: typeof AQUINAS_A1_DISCREPANCY_INVENTORY) => { value[0]!.resolvedArticleCount = 1; },
    ]) {
      const drift = structuredClone(AQUINAS_A1_DISCREPANCY_INVENTORY);
      mutate(drift);
      expect(() => validateA1DiscrepancyProjection(drift)).toThrow(/A1\.discrepancies/);
    }
  });

  it('renders actual outerHTML shapes with inert attributes, separator whitespace, NFC, and br-only LF', () => {
    const rendered = renderReviewedElement(block('\r\n  <p id="entry-1" class="entry prose"> [SYNTHETIC]\r\n Cafe\u0301 &amp; <em id="em-1" class="accent">*[Markdown]* #Case</em>  <br> <i class="keep">Keep</i> </p>\n', 0));

    expect(rendered.content).toBe('[SYNTHETIC] Café & *[Markdown]* #Case\nKeep');
    expect(rendered.content).toContain('[Markdown]');
    expect(rendered.stats).toMatchObject({ blocks: 1, nodes: 10, attributes: 5 });
    expect(() => renderReviewedElement(block('<p>literal \uE000 stays literal</p>', 0))).not.toThrow();
    expect(renderReviewedElement(block('<p>literal \uE000 stays literal</p>', 0)).content).toContain('\uE000');
    expect(renderReviewedElement(block('<p>a\r\nb</p>', 0)).content).toBe('a b');
    expect(renderReviewedElement(block('<p>a <i> b </i> c<br> d</p>', 0)).content).toBe('a b c\nd');
    expect(renderReviewedElement(block('<p>a\n b</p>', 0)).content).toBe('a b');
    expect(renderReviewedElement(block('<p style="margin-top: 2em">source-only layout</p>', 0)).content).toBe('source-only layout');
    expect(() => renderReviewedElement(block('<p onclick="alert(1)">x</p>', 0))).toThrow(/id\/class/);
    expect(() => renderReviewedElement(block('<p style="display:none">x</p>', 0))).toThrow(/id\/class/);
    expect(() => renderReviewedElement(block('<p><a>not-pinned</a></p>', 0))).toThrow(/pinned/);
  });

  it('strips source HTML from persisted evidence and marks full-artifact synthetic fixtures non-release', () => {
    const first = fixtureCompiled.packages[0]!;
    const serialized = new TextDecoder().decode(first.persistedBytes);

    expect(serialized).not.toContain('<p>');
    expect(serialized).not.toContain('canonicalJson');
    expect(serialized).not.toContain('synthetic-excluded-range');
    expect(serialized).not.toContain('synthetic-source-wrapper:');
    expect(first.package.fixtureStatus).toBe('synthetic_fixture_non_release');
    expect(first.package.discrepancyEntryHashAlgorithm).toBe('legacy_a1_canonical_entry_sha256');
    expect(first.package.typedRangeCount).toBe(3_184);
    expect(first.package.typedRangesSha256).toBe(fixtureDraft.typedRangesSha256);
    expect(fixtureCompiled.manifest).toMatchObject({ attestationMode: 'synthetic_fixture', fixtureStatus: 'synthetic_fixture_non_release' });
    expect(() => assertReleasePackageAttestation(first.package)).toThrow(/synthetic/);
    expect(() => assertReleaseManifestAttestation(fixtureCompiled.manifest)).toThrow(/synthetic/);
    const { aggregateSha256, ...manifestBase } = fixtureCompiled.manifest;
    const aggregateFor = (value: typeof manifestBase) => sha256Hex(`sectioned-edition-collection-manifest.v1:${new TextDecoder().decode(canonicalSectionedEditionCollectionPackageBytes(value))}`);
    expect(aggregateSha256).toBe(aggregateFor(manifestBase));
    expect(aggregateSha256).not.toBe(aggregateFor({ ...manifestBase, fixtureStatus: null, attestationMode: 'a1_attested' }));
    expect(first.package.questions[0]!.preamble.source).toEqual(expect.objectContaining({
      artifactId: 'synthetic-prima', outputSha256: expect.any(String),
    }));
    expect(first.package.questions[0]!.preamble.source.span.rawSha256).toEqual(expect.any(String));
    expect(() => verifyPersistedPackageBytes(fixtureDraft, fixtureCompiled.packages.map(value => value.persistedBytes))).toThrow(/a1_attested/);
    expect(fixtureDraft.sourceArtifacts.every(source => source.html.includes('synthetic-source-wrapper') && source.html.includes('synthetic-post-cutoff'))).toBe(true);
    expect(fixtureDraft.sourceArtifacts.every(source => source.intellectualStartByte > 0 && source.cutoffEndByte < source.htmlMemberBytes)).toBe(true);
  });

  it('uses deterministic maximal-prefix shards without splitting q102 parent aggregate over child-safe limits', () => {
    const metrics = expectedAquinasPackageQuestionKeys().map((questionKey, index) => ({
      questionKey,
      normalizedContentUtf8Bytes: index < 33 ? 131_072 : 1,
      canonicalSerializedPackageUtf8Bytes: index < 33 ? 131_072 : 1,
    }));
    const firstPlan = buildMaximalWithinPartPackagePlan(metrics);
    const secondPlan = buildMaximalWithinPartPackagePlan(metrics);
    const q102 = fixtureCompiled.packages.flatMap(value => value.package.questions).find(question => question.questionKey === 'prima.q102')!;

    expect(firstPlan).toEqual(secondPlan);
    expect(firstPlan.filter(shard => shard.partKey === 'prima')).toHaveLength(2);
    expect(firstPlan[0]).toMatchObject({ questionKeys: expect.arrayContaining(['prima.q001', 'prima.q032']) });
    expect(firstPlan[0]!.questionKeys).toHaveLength(32);
    expect(fixtureCompiled.manifest.shards.flatMap(shard => shard.questionKeys)).toEqual(expectedAquinasPackageQuestionKeys());
    expect(fixtureCompiled.manifest.shards.every(shard => shard.normalizedContentUtf8Bytes <= SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes)).toBe(true);
    expect(fixtureCompiled.manifest.shards.every(shard => shard.canonicalSerializedPackageUtf8Bytes <= SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes)).toBe(true);
    expect(q102.output.utf8Bytes).toBeGreaterThan(SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes);
    expect(q102.articles.every(article => article.output.utf8Bytes <= SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes)).toBe(true);
    expect(fixtureCompiled.packages.filter(value => value.package.questions.some(question => question.questionKey === 'prima.q102'))).toHaveLength(1);
  });

  it('binds raw spans to actual artifact bytes and rejects unsafe markup bombs', () => {
    const drift = structuredClone(fixtureDraft);
    const firstBlock = drift.questions[0]!.preamble.source.blocks[0]!;
    firstBlock.html = firstBlock.html.replace('SYNTHETIC', 'COUNTERFT');
    firstBlock.span.rawSha256 = sha256Hex(firstBlock.html);
    drift.questions[0]!.preamble.source.span.rawSha256 = sha256Hex(firstBlock.html);
    drift.questions[0]!.source.span.rawSha256 = sha256Hex(firstBlock.html + drift.questions[0]!.articles.map(article => article.source.blocks.map(value => value.html).join('')).join(''));
    const driftRanges = syntheticTypedRangeEvidence(drift.partPrologues, drift.questions);
    drift.typedRangeCount = driftRanges.count;
    drift.typedRangesSha256 = driftRanges.sha256;
    expect(() => validateTransientSectionedEditionCollectionPackageDraft(drift)).toThrow(/actual full artifact member slice/);

    const missingPrologue = structuredClone(fixtureDraft);
    missingPrologue.partPrologues.splice(1, 1);
    expect(() => validateTransientSectionedEditionCollectionPackageDraft(missingPrologue)).toThrow(/Prima, I-II, and III/);

    const repartition = structuredClone(fixtureDraft);
    repartition.typedRangesSha256 = sha256Hex('uncommitted-child-repartition');
    expect(() => validateTransientSectionedEditionCollectionPackageDraft(repartition)).toThrow(/typedRangesSha256/);

    const deep = `<p>${'<i>'.repeat(33)}x${'</i>'.repeat(33)}</p>`;
    expect(() => renderReviewedElement(block(deep, 0))).toThrow(/depth exceeds/);

    const attributed = block('<p data-bomb="x">x</p>', 0);
    expect(() => renderReviewedElement(attributed)).toThrow(/id\/class/);
  });

  it('rejects invalid Unicode and canonical hazards without silent coercion', () => {
    for (const html of ['<p>a\u0000b</p>', '<p>a\u202eb</p>', '<p>a\ufdd0b</p>', '<p>a\ud800b</p>']) {
      expect(() => renderReviewedElement(block(html, 0))).toThrow(SectionedEditionCollectionPackageValidationError);
    }
    for (const value of [undefined, BigInt(1), Symbol('x'), () => 1, NaN, Infinity, -1, -0]) {
      expect(() => canonicalSectionedEditionCollectionPackageBytes(value)).toThrow(SectionedEditionCollectionPackageValidationError);
    }
    expect(() => canonicalSectionedEditionCollectionPackageBytes({ nested: [undefined] })).toThrow(/undefined/);
  });
});

function syntheticDraft(): TransientSectionedEditionCollectionDraft {
  const parts = ['prima', 'prima-secundae', 'secunda-secundae', 'tertia'] as AquinasPackagePartKey[];
  const partQuestionCounts = new Map<AquinasPackagePartKey, number>([['prima', 119], ['prima-secundae', 114], ['secunda-secundae', 189], ['tertia', 90]]);
  const partArticleCounts = new Map<AquinasPackagePartKey, number>([['prima', 584], ['prima-secundae', 619], ['secunda-secundae', 917], ['tertia', 549]]);
  const nonQ102Ordinals = new Map<AquinasPackagePartKey, number>(parts.map(partKey => [partKey, 0] as const));
  const cursors = new Map<AquinasPackagePartKey, number>([
    ['prima', 0], ['prima-secundae', 0], ['secunda-secundae', 0], ['tertia', 0],
  ]);
  const exclusions = parts.map(partKey => makeExclusion(`synthetic-source-wrapper-${partKey}`, 'source_wrapper', partKey, cursors, `synthetic-source-wrapper:${partKey}`));
  const partPrologues = (['prima', 'prima-secundae', 'tertia'] as AquinasPackagePartKey[]).map(partKey => {
    const child = makeChild('part_prologue', partKey, cursors, `<p><i>[Synthetic ${partKey} prologue]</i></p>`);
    return { partKey, child };
  });
  const questions = expectedAquinasPackageQuestionKeys().map((questionKey, index) => {
    const partKey = questionKey.slice(0, questionKey.indexOf('.q')) as AquinasPackagePartKey;
    const preamble = makeChild('preamble', partKey, cursors, index === 0
      ? '\r\n  <p id="fixture-entry-1" class="entry prose"> [SYNTHETIC]\r\n Cafe\u0301 &amp; <em id="fixture-em-1" class="accent">*[Markdown]* #Case</em>  <br> <i class="keep">Keep</i> </p>\n'
      : `<p>[Synthetic preamble ${questionKey}]</p>`);
    const isQ102 = questionKey === 'prima.q102';
    const articleCount = isQ102
      ? 2
      : syntheticArticleCount(partKey, nonQ102Ordinals.get(partKey)!, partQuestionCounts.get(partKey)!, partArticleCounts.get(partKey)!);
    if (!isQ102) nonQ102Ordinals.set(partKey, nonQ102Ordinals.get(partKey)! + 1);
    const articles = isQ102
      ? [
        makeChild('article', partKey, cursors, `<p>${'A'.repeat(70_000)}</p>`, questionKey, 1),
        makeChild('article', partKey, cursors, `<p>${'B'.repeat(70_000)}</p>`, questionKey, 2),
      ]
      : Array.from({ length: articleCount }, (_, articleIndex) => makeChild('article', partKey, cursors, `<p>[Synthetic article ${questionKey}.${String(articleIndex + 1)}]</p>`, questionKey, articleIndex + 1));
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
  exclusions.push(makeExclusion('synthetic-editorial-interlude', 'editorial_interlude', 'tertia', cursors, 'synthetic-excluded-range'));
  const cutoffEnds = new Map(parts.map(partKey => [partKey, cursors.get(partKey)!] as const));
  for (const partKey of parts) exclusions.push(makeExclusion(`synthetic-post-cutoff-${partKey}`, partKey === 'tertia' ? 'supplement' : 'gutenberg_license', partKey, cursors, `synthetic-post-cutoff:${partKey}`));
  const sourceArtifacts = parts.map(partKey => {
    const artifactId = `synthetic-${partKey}`;
    const members = [
      ...partPrologues.filter(value => value.child.source.artifactId === artifactId).flatMap(value => value.child.source.blocks),
      ...questions.filter(value => value.source.artifactId === artifactId).flatMap(question => [question.preamble, ...question.articles].flatMap(child => child.source.blocks)),
      ...exclusions.filter(value => value.artifactId === artifactId).map(value => ({ html: value.html, span: value.span })),
    ].sort((left, right) => left.span.startByte - right.span.startByte);
    const html = members.map(value => value.html).join('');
    const prefix = exclusions.find(value => value.exclusionId === `synthetic-source-wrapper-${partKey}`)!;
    const start = prefix.span.endByte;
    const end = cutoffEnds.get(partKey)!;
    return {
      artifactId,
      partKey,
      html,
      htmlMemberBytes: new TextEncoder().encode(html).byteLength,
      htmlMemberSha256: sha256Hex(html),
      intellectualStartByte: start,
      cutoffEndByte: end,
      rawCoverageSha256: sha256Hex(new TextDecoder().decode(new TextEncoder().encode(html).slice(start, end))),
    };
  });
  const typedRangeEvidence = syntheticTypedRangeEvidence(partPrologues, questions);
  return {
    mode: 'synthetic_fixture',
    schemaVersion: 'sectioned-edition-collection-package.v1',
    normalizationPolicy: 'parse5_pinned_topology_ascii_whitespace_br_lf_reviewed_blocks_nfc_only',
    identity: AQUINAS_A1_PACKAGE_IDENTITY,
    sourceLockSha256: sha256Hex('synthetic-source-lock'), localReceiptSha256: sha256Hex('synthetic-receipt'), topologyLockSha256: sha256Hex('synthetic-topology'), typedRangeCount: typedRangeEvidence.count, typedRangesSha256: typedRangeEvidence.sha256, discrepancyLedgerSha256: sha256Hex('synthetic-ledger'),
    sourceArtifacts,
    rightsAndCoverage: AQUINAS_A1_RIGHTS_AND_COVERAGE,
    partPrologues,
    exclusions,
    discrepancies: [],
    questions,
  };
}

function syntheticArticleCount(partKey: AquinasPackagePartKey, nonQ102Ordinal: number, questionCount: number, articleCount: number): number {
  const includesQ102 = partKey === 'prima';
  const regularQuestions = questionCount - (includesQ102 ? 1 : 0);
  const regularArticles = articleCount - (includesQ102 ? 2 : 0);
  return Math.floor((nonQ102Ordinal + 1) * regularArticles / regularQuestions) - Math.floor(nonQ102Ordinal * regularArticles / regularQuestions);
}

function syntheticTypedRangeEvidence(partPrologues: readonly { partKey: AquinasPackagePartKey; child: TransientChild }[], questions: readonly TransientQuestion[]) {
  const rows = [
    ...partPrologues.map(value => typedRangeRow(value.child, value.partKey, null)),
    ...questions.flatMap(question => [typedRangeRow(question.preamble, question.partKey, question.questionKey), ...question.articles.map(article => typedRangeRow(article, question.partKey, question.questionKey))]),
  ];
  const bytes = canonicalSectionedEditionCollectionPackageBytes(rows);
  return { count: rows.length, sha256: sha256Hex(`sectioned-edition-collection-package.typed-child-ranges.v1:${new TextDecoder().decode(bytes)}`) };
}

function typedRangeRow(child: TransientChild, partKey: AquinasPackagePartKey, questionKey: string | null) {
  return [child.kind, partKey, questionKey, child.articleKey ?? null, child.source.artifactId, child.source.span.startByte, child.source.span.endByte, child.source.span.rawSha256] as const;
}

function makeExclusion(exclusionId: string, kind: typeof AQUINAS_A1_RIGHTS_AND_COVERAGE.exclusionKinds[number], partKey: AquinasPackagePartKey, cursors: Map<AquinasPackagePartKey, number>, html: string) {
  const startByte = cursors.get(partKey)!;
  const value = { exclusionId, kind, artifactId: `synthetic-${partKey}`, html, span: span(html, startByte) };
  cursors.set(partKey, value.span.endByte);
  return value;
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
