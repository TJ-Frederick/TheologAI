import { sha256Hex } from './sha256.js';

/**
 * Inert, content-free successor foundation for a reviewed multi-source edition
 * collection. It is intentionally not exported by src/kernel/index.ts or
 * imported by any runtime composition root.
 */

export const SECTIONED_EDITION_COLLECTION_LIMITS = Object.freeze({
  questionUtf8Bytes: 131_072,
  packageContentUtf8Bytes: 4_194_304,
  compiledPackageUtf8Bytes: 4_718_592,
} as const);

export const AQUINAS_SECTIONED_COLLECTION_IDENTITY = Object.freeze({
  workId: 'thomas-aquinas-summa-theologiae',
  editionId: 'aquinas-summa-english-dominican-gutenberg-electronic',
  collectionVersion: 'aquinas-summa-pg-v1',
} as const);

export type AquinasPartKey = 'prima' | 'prima-secundae' | 'secunda-secundae' | 'tertia';

export const AQUINAS_PARTS = Object.freeze([
  { key: 'prima', questions: 119 },
  { key: 'prima-secundae', questions: 114 },
  { key: 'secunda-secundae', questions: 189 },
  { key: 'tertia', questions: 90 },
] as const satisfies readonly Readonly<{ key: AquinasPartKey; questions: number }>[]);

export type SectionedCollectionQuestionMetric = Readonly<{
  questionKey: string;
  normalizedContentUtf8Bytes: number;
  serializedPackageUtf8Bytes: number;
  packageSha256: string;
}>;

export type SectionedCollectionShard = Readonly<{
  id: string;
  partKey: AquinasPartKey;
  firstQuestionKey: string;
  lastQuestionKey: string;
  questionCount: number;
  normalizedContentUtf8Bytes: number;
  serializedPackageUtf8Bytes: number;
  packageSha256: string;
  questionKeys: readonly string[];
}>;

export type SectionedCollectionShardManifest = Readonly<{
  schemaVersion: 'sectioned-edition-collection-foundation.v1';
  sourceLockSha256: string;
  orderedQuestionKeysSha256: string;
  shards: readonly SectionedCollectionShard[];
  aggregateSha256: string;
}>;

export class SectionedEditionCollectionValidationError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'SectionedEditionCollectionValidationError';
  }
}

export function expectedAquinasQuestionKeys(): readonly string[] {
  return AQUINAS_PARTS.flatMap(part => Array.from(
    { length: part.questions },
    (_, index) => `${part.key}.q${String(index + 1).padStart(3, '0')}`,
  ));
}

export function expectedAquinasPartForQuestionKey(questionKey: string): AquinasPartKey {
  for (const part of AQUINAS_PARTS) if (questionKey.startsWith(`${part.key}.q`)) return part.key;
  fail('questionKey', 'does not use a frozen Aquinas part key');
}

export function canonicalSectionedCollectionJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function orderedQuestionKeysSha256(keys = expectedAquinasQuestionKeys()): string {
  return sha256Hex(canonicalSectionedCollectionJson([...keys]));
}

/**
 * Synthetic metrics only. A1 never derives these values from source prose;
 * they exist to prove the reviewed package gates and sharding contract.
 */
export function buildMaximalWithinPartShards(
  sourceLockSha256: string,
  metrics: readonly SectionedCollectionQuestionMetric[],
): SectionedCollectionShardManifest {
  assertSha256(sourceLockSha256, 'sourceLockSha256');
  const normalizedMetrics = validateMetrics(metrics);
  const shards: SectionedCollectionShard[] = [];
  for (const part of AQUINAS_PARTS) {
    const partMetrics = normalizedMetrics.filter(metric => expectedAquinasPartForQuestionKey(metric.questionKey) === part.key);
    let start = 0;
    let shardNumber = 1;
    while (start < partMetrics.length) {
      let end = start;
      let contentBytes = 0;
      let serializedBytes = 0;
      while (end < partMetrics.length) {
        const candidate = partMetrics[end]!;
        const candidateContent = contentBytes + candidate.normalizedContentUtf8Bytes;
        const candidateSerialized = serializedBytes + candidate.serializedPackageUtf8Bytes;
        if (candidateContent > SECTIONED_EDITION_COLLECTION_LIMITS.packageContentUtf8Bytes || candidateSerialized > SECTIONED_EDITION_COLLECTION_LIMITS.compiledPackageUtf8Bytes) break;
        contentBytes = candidateContent;
        serializedBytes = candidateSerialized;
        end += 1;
      }
      if (end === start) fail(`metrics[${start}]`, 'one question cannot fit the reviewed package limits');
      const selected = partMetrics.slice(start, end);
      const questionKeys = selected.map(metric => metric.questionKey);
      const packageSha256 = sha256Hex(canonicalSectionedCollectionJson(selected));
      shards.push({
        id: `${AQUINAS_SECTIONED_COLLECTION_IDENTITY.collectionVersion}.${part.key}.shard-${String(shardNumber).padStart(4, '0')}`,
        partKey: part.key,
        firstQuestionKey: questionKeys[0]!,
        lastQuestionKey: questionKeys.at(-1)!,
        questionCount: questionKeys.length,
        normalizedContentUtf8Bytes: contentBytes,
        serializedPackageUtf8Bytes: serializedBytes,
        packageSha256,
        questionKeys,
      });
      start = end;
      shardNumber += 1;
    }
  }
  const base = {
    schemaVersion: 'sectioned-edition-collection-foundation.v1' as const,
    sourceLockSha256,
    orderedQuestionKeysSha256: orderedQuestionKeysSha256(),
    shards,
  };
  return { ...base, aggregateSha256: sha256Hex(canonicalSectionedCollectionJson(base)) };
}

export function validateSectionedCollectionShardManifest(
  input: unknown,
  metrics: readonly SectionedCollectionQuestionMetric[],
): SectionedCollectionShardManifest {
  const root = objectAt(input, '$', ['schemaVersion', 'sourceLockSha256', 'orderedQuestionKeysSha256', 'shards', 'aggregateSha256']);
  literal(root.schemaVersion, '$.schemaVersion', 'sectioned-edition-collection-foundation.v1');
  const sourceLockSha256 = stringAt(root.sourceLockSha256, '$.sourceLockSha256');
  assertSha256(sourceLockSha256, '$.sourceLockSha256');
  const expectedKeyHash = orderedQuestionKeysSha256();
  literal(root.orderedQuestionKeysSha256, '$.orderedQuestionKeysSha256', expectedKeyHash);
  const expected = buildMaximalWithinPartShards(sourceLockSha256, metrics);
  const shards = denseArray(root.shards, '$.shards').map((value, index) => validateShard(value, `$.shards[${index}]`));
  if (canonicalSectionedCollectionJson(shards) !== canonicalSectionedCollectionJson(expected.shards)) {
    fail('$.shards', 'must be the deterministic maximal-prefix, within-part shard sequence for the supplied metrics');
  }
  const base = {
    schemaVersion: 'sectioned-edition-collection-foundation.v1' as const,
    sourceLockSha256,
    orderedQuestionKeysSha256: expectedKeyHash,
    shards,
  };
  const aggregateSha256 = stringAt(root.aggregateSha256, '$.aggregateSha256');
  literal(aggregateSha256, '$.aggregateSha256', sha256Hex(canonicalSectionedCollectionJson(base)));
  return { ...base, aggregateSha256 };
}

function validateMetrics(metrics: readonly SectionedCollectionQuestionMetric[]): SectionedCollectionQuestionMetric[] {
  const values = denseArray(metrics, 'metrics').map((value, index) => {
    const metric = objectAt(value, `metrics[${index}]`, ['questionKey', 'normalizedContentUtf8Bytes', 'serializedPackageUtf8Bytes', 'packageSha256']);
    const questionKey = stringAt(metric.questionKey, `metrics[${index}].questionKey`);
    const normalizedContentUtf8Bytes = integerAt(metric.normalizedContentUtf8Bytes, `metrics[${index}].normalizedContentUtf8Bytes`, 0);
    const serializedPackageUtf8Bytes = integerAt(metric.serializedPackageUtf8Bytes, `metrics[${index}].serializedPackageUtf8Bytes`, 0);
    const packageSha256 = stringAt(metric.packageSha256, `metrics[${index}].packageSha256`);
    assertSha256(packageSha256, `metrics[${index}].packageSha256`);
    if (normalizedContentUtf8Bytes > SECTIONED_EDITION_COLLECTION_LIMITS.questionUtf8Bytes) fail(`metrics[${index}].normalizedContentUtf8Bytes`, `exceeds the per-question limit of ${SECTIONED_EDITION_COLLECTION_LIMITS.questionUtf8Bytes}`);
    return { questionKey, normalizedContentUtf8Bytes, serializedPackageUtf8Bytes, packageSha256 };
  });
  const expectedKeys = expectedAquinasQuestionKeys();
  if (values.length !== expectedKeys.length || values.some((value, index) => value.questionKey !== expectedKeys[index])) {
    fail('metrics', 'must contain the exact ordered frozen 512-question topology');
  }
  return values;
}

function validateShard(value: unknown, path: string): SectionedCollectionShard {
  const shard = objectAt(value, path, ['id', 'partKey', 'firstQuestionKey', 'lastQuestionKey', 'questionCount', 'normalizedContentUtf8Bytes', 'serializedPackageUtf8Bytes', 'packageSha256', 'questionKeys']);
  const partKey = stringAt(shard.partKey, `${path}.partKey`);
  if (!AQUINAS_PARTS.some(part => part.key === partKey)) fail(`${path}.partKey`, 'is not a frozen part key');
  const questionKeys = denseArray(shard.questionKeys, `${path}.questionKeys`).map((key, index) => stringAt(key, `${path}.questionKeys[${index}]`));
  const questionCount = integerAt(shard.questionCount, `${path}.questionCount`, 1);
  if (questionCount !== questionKeys.length) fail(`${path}.questionCount`, 'must equal the nonempty key count');
  const normalizedContentUtf8Bytes = integerAt(shard.normalizedContentUtf8Bytes, `${path}.normalizedContentUtf8Bytes`, 0);
  const serializedPackageUtf8Bytes = integerAt(shard.serializedPackageUtf8Bytes, `${path}.serializedPackageUtf8Bytes`, 0);
  if (normalizedContentUtf8Bytes > SECTIONED_EDITION_COLLECTION_LIMITS.packageContentUtf8Bytes || serializedPackageUtf8Bytes > SECTIONED_EDITION_COLLECTION_LIMITS.compiledPackageUtf8Bytes) fail(path, 'exceeds a reviewed package limit');
  const packageSha256 = stringAt(shard.packageSha256, `${path}.packageSha256`);
  assertSha256(packageSha256, `${path}.packageSha256`);
  const output = {
    id: stringAt(shard.id, `${path}.id`),
    partKey: partKey as AquinasPartKey,
    firstQuestionKey: stringAt(shard.firstQuestionKey, `${path}.firstQuestionKey`),
    lastQuestionKey: stringAt(shard.lastQuestionKey, `${path}.lastQuestionKey`),
    questionCount,
    normalizedContentUtf8Bytes,
    serializedPackageUtf8Bytes,
    packageSha256,
    questionKeys,
  };
  if (output.firstQuestionKey !== questionKeys[0] || output.lastQuestionKey !== questionKeys.at(-1)) fail(path, 'does not bind its first/last key');
  return output;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return denseArray(value, 'canonical value').map(canonicalize);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    if (Object.getPrototypeOf(source) !== Object.prototype || Object.getOwnPropertySymbols(source).some(symbol => Object.prototype.propertyIsEnumerable.call(source, symbol))) fail('canonical value', 'must be a plain object without enumerable symbol keys');
    const keys = Object.keys(source).sort();
    const target: Record<string, unknown> = {};
    for (const key of keys) target[key] = canonicalize(source[key]);
    return target;
  }
  return value;
}

function objectAt(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  const source = value as Record<string, unknown>;
  if (Object.getPrototypeOf(source) !== Object.prototype || Object.getOwnPropertySymbols(source).some(symbol => Object.prototype.propertyIsEnumerable.call(source, symbol))) fail(path, 'must be a plain object without enumerable symbol keys');
  const observed = Object.keys(source).sort();
  const expected = [...keys].sort();
  if (observed.length !== expected.length || observed.some((key, index) => key !== expected[index])) fail(path, 'must contain exactly the reviewed keys');
  return source;
}

function denseArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || Object.keys(value).length !== value.length
    || Object.keys(value).some((key, index) => key !== String(index))
    || Object.getOwnPropertySymbols(value).some(symbol => Object.prototype.propertyIsEnumerable.call(value, symbol))) fail(path, 'must be a dense plain array');
  return Array.from({ length: value.length }, (_, index) => value[index]);
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'must be a nonempty string');
  return value;
}

function integerAt(value: unknown, path: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail(path, `must be a safe integer at least ${minimum}`);
  return value as number;
}

function literal(value: unknown, path: string, expected: string): void {
  if (value !== expected) fail(path, `must equal ${JSON.stringify(expected)}`);
}

function assertSha256(value: string, path: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) fail(path, 'must be a lowercase SHA-256 digest');
}

function fail(path: string, message: string): never {
  throw new SectionedEditionCollectionValidationError(path, message);
}
