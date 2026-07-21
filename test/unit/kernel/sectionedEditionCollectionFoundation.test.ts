import { describe, expect, it } from 'vitest';
import {
  AQUINAS_SECTIONED_COLLECTION_IDENTITY,
  SECTIONED_EDITION_COLLECTION_LIMITS,
  SectionedEditionCollectionValidationError,
  buildMaximalWithinPartShards,
  expectedAquinasQuestionKeys,
  validateSectionedCollectionShardManifest,
  type SectionedCollectionQuestionMetric,
} from '../../../src/kernel/sectionedEditionCollectionFoundation.js';
import { sha256Hex } from '../../../src/kernel/sha256.js';

const SOURCE_LOCK_SHA256 = '0'.repeat(64);

function syntheticMetrics(): SectionedCollectionQuestionMetric[] {
  return expectedAquinasQuestionKeys().map((questionKey, index) => ({
    questionKey,
    normalizedContentUtf8Bytes: 1_000 + index,
    serializedPackageUtf8Bytes: 2_000 + index,
    packageSha256: sha256Hex(`synthetic-metric:${questionKey}`),
  }));
}

describe('inactive sectioned collection foundation', () => {
  it('freezes the four-source 512-question topology and reviewed byte gates', () => {
    const keys = expectedAquinasQuestionKeys();

    expect(AQUINAS_SECTIONED_COLLECTION_IDENTITY).toEqual({
      workId: 'thomas-aquinas-summa-theologiae',
      editionId: 'aquinas-summa-english-dominican-gutenberg-electronic',
      collectionVersion: 'aquinas-summa-pg-v1',
    });
    expect(keys).toHaveLength(512);
    expect(keys.at(0)).toBe('prima.q001');
    expect(keys.at(-1)).toBe('tertia.q090');
    expect(SECTIONED_EDITION_COLLECTION_LIMITS).toEqual({
      questionUtf8Bytes: 131_072,
      packageContentUtf8Bytes: 4_194_304,
      compiledPackageUtf8Bytes: 4_718_592,
    });
  });

  it('deterministically uses within-part maximal-prefix sharding with exact coverage', () => {
    const metrics = syntheticMetrics();
    for (let index = 0; index < 33; index += 1) metrics[index] = {
      ...metrics[index]!,
      normalizedContentUtf8Bytes: SECTIONED_EDITION_COLLECTION_LIMITS.questionUtf8Bytes,
      serializedPackageUtf8Bytes: SECTIONED_EDITION_COLLECTION_LIMITS.compiledPackageUtf8Bytes / 32,
    };
    const first = buildMaximalWithinPartShards(SOURCE_LOCK_SHA256, metrics);
    const second = buildMaximalWithinPartShards(SOURCE_LOCK_SHA256, metrics);

    expect(first).toEqual(second);
    expect(first.shards[0]).toMatchObject({
      id: 'aquinas-summa-pg-v1.prima.shard-0001',
      firstQuestionKey: 'prima.q001',
      lastQuestionKey: 'prima.q032',
      questionCount: 32,
    });
    expect(first.shards.flatMap(shard => shard.questionKeys)).toEqual(expectedAquinasQuestionKeys());
    expect(first.shards.every(shard => shard.normalizedContentUtf8Bytes <= SECTIONED_EDITION_COLLECTION_LIMITS.packageContentUtf8Bytes)).toBe(true);
    expect(first.shards.every(shard => shard.serializedPackageUtf8Bytes <= SECTIONED_EDITION_COLLECTION_LIMITS.compiledPackageUtf8Bytes)).toBe(true);
    expect(validateSectionedCollectionShardManifest(first, metrics)).toEqual(first);
  });

  it('rejects a question that cannot enter a reviewed package', () => {
    const metrics = syntheticMetrics();
    metrics[0] = { ...metrics[0]!, normalizedContentUtf8Bytes: SECTIONED_EDITION_COLLECTION_LIMITS.questionUtf8Bytes + 1 };

    expect(() => buildMaximalWithinPartShards(SOURCE_LOCK_SHA256, metrics)).toThrow(SectionedEditionCollectionValidationError);
  });

  it('rejects a single question whose serialized package size exceeds its reviewed gate', () => {
    const metrics = syntheticMetrics();
    metrics[0] = {
      ...metrics[0]!,
      serializedPackageUtf8Bytes: SECTIONED_EDITION_COLLECTION_LIMITS.compiledPackageUtf8Bytes + 1,
    };

    expect(() => buildMaximalWithinPartShards(SOURCE_LOCK_SHA256, metrics)).toThrow(/cannot fit/);
  });

  it('rejects non-canonical metrics and dishonest manifest details', () => {
    const metrics = syntheticMetrics();
    const manifest = buildMaximalWithinPartShards(SOURCE_LOCK_SHA256, metrics);
    const dishonest = structuredClone(manifest) as unknown as { shards: { questionKeys: string[] }[] };
    dishonest.shards[0]!.questionKeys = [...dishonest.shards[0]!.questionKeys].reverse();

    expect(() => validateSectionedCollectionShardManifest(dishonest, metrics)).toThrow(SectionedEditionCollectionValidationError);

    const sparse = syntheticMetrics();
    delete sparse[1];
    expect(() => buildMaximalWithinPartShards(SOURCE_LOCK_SHA256, sparse)).toThrow(/dense plain array/);
  });
});
