import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { OPENSCRIPTURES_STRONGS, STEPBIBLE_DATA } from './biblical-language-sources.js';
import type { ReproductionReport } from './verify-biblical-language-reproduction-report.js';
import { artifactContentIdentity, type ArtifactIdentityKind } from './artifact-content-identity.js';

export type UnicodeCorrectionCategory = 'utf8_replacement_repair' | 'attested_restoration';

export interface StrongsUnicodeCorrection {
  artifact: string;
  strongsNumber: string;
  field: string;
  before: string;
  after: string;
  category: UnicodeCorrectionCategory;
}

export interface MorphologyUnicodeCorrection {
  artifact: string;
  book: string;
  chapter: number;
  verse: number;
  position: number;
  field: string;
  before: string;
  after: string;
  category: UnicodeCorrectionCategory;
}

export interface UnicodeCorrectionArtifact {
  path: string;
  identityKind: ArtifactIdentityKind;
  legacyContentSha256: string;
  correctedContentSha256: string;
  legacyRawSha256: string;
  preparedCorrectedRawSha256: string;
}

export interface BiblicalLanguageUnicodeCorrectionLedger {
  schemaVersion: 1;
  sourcePins: {
    openscriptures: string;
    stepbible: string;
  };
  contract: {
    sourceCells: 246;
    d1Cells: 255;
    comparedArtifacts: 72;
    comparisonIdentityPolicy: 'canonical_decompressed_json_v1_sha256_for_json_gz_else_raw_sha256';
    changedContentArtifacts: 45;
    unchangedArtifacts: 27;
    legacyContentInventorySha256: string;
    correctedContentInventorySha256: string;
    legacyRawInventorySha256: string;
    correctedRawInventorySha256: string;
    legacyD1MaterializationIdentity: string;
  };
  artifacts: UnicodeCorrectionArtifact[];
  strongs: StrongsUnicodeCorrection[];
  morphology: MorphologyUnicodeCorrection[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const IDENTITY_POLICY = 'canonical_decompressed_json_v1_sha256_for_json_gz_else_raw_sha256';
const LEGACY_CONTENT_INVENTORY_SHA256 = '3661deb0e2c912bd3ca4ac1a815a118f0397a186d816c0bfe17e25d276f9fa4d';
const CORRECTED_CONTENT_INVENTORY_SHA256 = 'caf58814f24cc72837586c901c42f3556b59e45ec81bb0af7f5cfb9fa1629dcd';
const LEGACY_RAW_INVENTORY_SHA256 = '433902e19fa60f1e98dd856b0a073b72e71b1b4e2edd04abca552bf0e96bbf44';
const CORRECTED_RAW_INVENTORY_SHA256 = '35649745857b65dbe87d024d13288036710272a193179349088f7a4af138268a';
const LEGACY_D1_IDENTITY = '91afa5bcf8155ac9f8c5fd14d1d661657c83be9a8e5cd90a5783bfa38ae7dfa5';
const MORPHOLOGY_ARTIFACT = /^data\/biblical-languages\/stepbible\/(?:greek|hebrew)\/[0-9]{2}-[A-Za-z0-9]+\.json\.gz$/;
const STRONGS_ARTIFACTS = new Set([
  'data/biblical-languages/strongs-greek.json',
  'data/biblical-languages/strongs-hebrew.json',
]);

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function replacementCount(value: string): number {
  return [...value].filter(character => character === '\uFFFD').length;
}

function strongsLocator(value: StrongsUnicodeCorrection): string {
  return `${value.artifact}/${value.strongsNumber}/${value.field}`;
}

function morphologyLocator(value: MorphologyUnicodeCorrection): string {
  return `${value.artifact}/${String(value.chapter).padStart(3, '0')}/${String(value.verse).padStart(3, '0')}/${String(value.position).padStart(3, '0')}/${value.field}`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNoReplacementCharacters(value: unknown, label: string): void {
  if (typeof value === 'string') {
    assert(!value.includes('\uFFFD'), `${label} contains a Unicode replacement character`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoReplacementCharacters(item, `${label}[${index}]`));
    return;
  }
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) assertNoReplacementCharacters(item, `${label}.${key}`);
  }
}

export function createBiblicalLanguageUnicodeCorrectionLedger(
  report: ReproductionReport,
): BiblicalLanguageUnicodeCorrectionLedger {
  const strongs = report.semanticDrift.strongs.records.map(record => ({
    artifact: record.identity.startsWith('G')
      ? 'data/biblical-languages/strongs-greek.json'
      : 'data/biblical-languages/strongs-hebrew.json',
    strongsNumber: record.identity,
    field: record.field,
    before: String(record.tracked),
    after: String(record.reproduced),
    category: 'utf8_replacement_repair' as const,
  })).sort((left, right) => strongsLocator(left).localeCompare(strongsLocator(right)));

  const morphology = report.semanticDrift.morphology.records.map(record => ({
    artifact: record.path,
    book: record.book,
    chapter: Number(record.chapter),
    verse: Number(record.verse),
    position: record.position,
    field: record.field,
    before: String(record.tracked),
    after: String(record.reproduced),
    category: record.trackedReplacementCharacters === 0
      ? 'attested_restoration' as const
      : 'utf8_replacement_repair' as const,
  })).sort((left, right) => morphologyLocator(left).localeCompare(morphologyLocator(right)));

  return {
    schemaVersion: 1,
    sourcePins: {
      openscriptures: OPENSCRIPTURES_STRONGS.commit,
      stepbible: STEPBIBLE_DATA.commit,
    },
    contract: {
      sourceCells: 246,
      d1Cells: 255,
      comparedArtifacts: 72,
      comparisonIdentityPolicy: IDENTITY_POLICY,
      changedContentArtifacts: 45,
      unchangedArtifacts: 27,
      legacyContentInventorySha256: LEGACY_CONTENT_INVENTORY_SHA256,
      correctedContentInventorySha256: CORRECTED_CONTENT_INVENTORY_SHA256,
      legacyRawInventorySha256: LEGACY_RAW_INVENTORY_SHA256,
      correctedRawInventorySha256: CORRECTED_RAW_INVENTORY_SHA256,
      legacyD1MaterializationIdentity: LEGACY_D1_IDENTITY,
    },
    artifacts: report.changed.map(change => ({
      path: change.path,
      identityKind: change.identityKind,
      legacyContentSha256: change.trackedIdentitySha256,
      correctedContentSha256: change.reproducedIdentitySha256,
      legacyRawSha256: change.trackedRawSha256,
      preparedCorrectedRawSha256: change.reproducedRawSha256,
    })).sort((left, right) => left.path.localeCompare(right.path)),
    strongs,
    morphology,
  };
}

function morphologyWord(book: Record<string, any>, correction: MorphologyUnicodeCorrection): Record<string, unknown> {
  const words = book.chapters?.[String(correction.chapter)]?.[String(correction.verse)]?.words;
  assert(Array.isArray(words), `Missing morphology verse for ${morphologyLocator(correction)}`);
  const word = words.find(candidate => candidate?.position === correction.position);
  assert(isObject(word), `Missing morphology word for ${morphologyLocator(correction)}`);
  return word;
}

export function verifyBiblicalLanguageUnicodeCorrection(
  root: string,
  ledger: BiblicalLanguageUnicodeCorrectionLedger,
  comparedPaths: readonly string[],
): void {
  assert(ledger.schemaVersion === 1, 'Unsupported Unicode correction ledger schema');
  assert(ledger.sourcePins.openscriptures === OPENSCRIPTURES_STRONGS.commit, 'Unicode ledger OpenScriptures pin drift');
  assert(ledger.sourcePins.stepbible === STEPBIBLE_DATA.commit, 'Unicode ledger STEPBible pin drift');
  assert(ledger.contract.sourceCells === 246 && ledger.contract.d1Cells === 255, 'Unicode correction cell contract drift');
  assert(ledger.contract.comparedArtifacts === 72 && ledger.contract.changedContentArtifacts === 45
    && ledger.contract.unchangedArtifacts === 27, 'Unicode correction artifact boundary drift');
  assert(ledger.contract.comparisonIdentityPolicy === IDENTITY_POLICY
    && ledger.contract.legacyContentInventorySha256 === LEGACY_CONTENT_INVENTORY_SHA256
    && ledger.contract.correctedContentInventorySha256 === CORRECTED_CONTENT_INVENTORY_SHA256
    && ledger.contract.legacyRawInventorySha256 === LEGACY_RAW_INVENTORY_SHA256
    && ledger.contract.correctedRawInventorySha256 === CORRECTED_RAW_INVENTORY_SHA256
    && ledger.contract.legacyD1MaterializationIdentity === LEGACY_D1_IDENTITY,
  'Unicode correction identity contract drift');

  assert(ledger.strongs.length === 9, `Expected 9 Strong's corrections, received ${ledger.strongs.length}`);
  assert(ledger.morphology.length === 237, `Expected 237 morphology corrections, received ${ledger.morphology.length}`);
  assert(ledger.strongs.length + ledger.morphology.length === ledger.contract.sourceCells, 'Unicode source-cell total drift');
  assert(ledger.artifacts.length === 45, `Expected 45 corrected artifacts, received ${ledger.artifacts.length}`);

  const strongsLocators = ledger.strongs.map(strongsLocator);
  const morphologyLocators = ledger.morphology.map(morphologyLocator);
  assert(JSON.stringify(strongsLocators) === JSON.stringify([...strongsLocators].sort()), "Strong's corrections are not sorted");
  assert(JSON.stringify(morphologyLocators) === JSON.stringify([...morphologyLocators].sort()), 'Morphology corrections are not sorted');
  assert(new Set(strongsLocators).size === strongsLocators.length, "Duplicate Strong's correction locator");
  assert(new Set(morphologyLocators).size === morphologyLocators.length, 'Duplicate morphology correction locator');
  assert(ledger.strongs.every(value => value.category === 'utf8_replacement_repair'), "Unexpected Strong's correction category");
  assert(ledger.strongs.every(value => STRONGS_ARTIFACTS.has(value.artifact)), "Unsafe Strong's correction artifact path");
  assert(ledger.strongs.reduce((sum, value) => sum + replacementCount(value.before), 0) === 18, "Strong's legacy replacement count drift");
  assert(ledger.strongs.every(value => replacementCount(value.before) > 0 && replacementCount(value.after) === 0), "Strong's correction is not a replacement repair");

  const restorations = ledger.morphology.filter(value => value.category === 'attested_restoration');
  assert(ledger.morphology.every(value => MORPHOLOGY_ARTIFACT.test(value.artifact)),
    'Unsafe morphology correction artifact path');
  assert(restorations.length === 1, `Expected one attested restoration, received ${restorations.length}`);
  const john = restorations[0];
  assert(john.artifact === 'data/biblical-languages/stepbible/greek/43-John.json.gz'
    && john.book === 'John' && john.chapter === 1 && john.verse === 1 && john.position === 11
    && john.field === 'text' && john.before === 'τὸ' && john.after === 'τὸν',
  'John 1:1 attested restoration contract drift');
  const morphologyRepairs = ledger.morphology.filter(value => value.category === 'utf8_replacement_repair');
  assert(morphologyRepairs.length === 236, `Expected 236 morphology replacement repairs, received ${morphologyRepairs.length}`);
  assert(morphologyRepairs.reduce((sum, value) => sum + replacementCount(value.before), 0) === 496,
    'Morphology legacy replacement count drift');
  assert(morphologyRepairs.every(value => replacementCount(value.before) > 0 && replacementCount(value.after) === 0),
    'Morphology correction is not a replacement repair');

  const artifactPaths = ledger.artifacts.map(value => value.path);
  assert(JSON.stringify(artifactPaths) === JSON.stringify([...artifactPaths].sort()), 'Unicode artifact ledger is not sorted');
  assert(new Set(artifactPaths).size === artifactPaths.length, 'Duplicate Unicode artifact ledger path');
  assert(ledger.artifacts.every(value =>
    (STRONGS_ARTIFACTS.has(value.path) || MORPHOLOGY_ARTIFACT.test(value.path))
    &&
    value.identityKind === (value.path.endsWith('.json.gz') ? 'canonical_json_payload_sha256_v1' : 'raw_sha256')
    && SHA256.test(value.legacyContentSha256) && SHA256.test(value.correctedContentSha256)
    && SHA256.test(value.legacyRawSha256) && SHA256.test(value.preparedCorrectedRawSha256)
    && value.legacyContentSha256 !== value.correctedContentSha256), 'Invalid Unicode artifact identity record');
  const affectedPaths = new Set([...ledger.strongs.map(value => value.artifact), ...ledger.morphology.map(value => value.artifact)]);
  assert(JSON.stringify([...affectedPaths].sort()) === JSON.stringify(artifactPaths), 'Correction cells and artifact boundary differ');

  const reversed = new Map<string, Record<string, any>>();
  for (const artifact of ledger.artifacts) {
    const bytes = readFileSync(join(root, artifact.path));
    const identity = artifactContentIdentity(artifact.path, bytes);
    assert(identity.kind === artifact.identityKind && identity.sha256 === artifact.correctedContentSha256,
      `Corrected artifact content-identity drift: ${artifact.path}`);
    assert(identity.rawSha256 === artifact.preparedCorrectedRawSha256,
      `Corrected artifact raw-byte identity drift: ${artifact.path}`);
    const parsed = artifact.path.endsWith('.json.gz')
      ? JSON.parse(gunzipSync(bytes).toString('utf8'))
      : JSON.parse(bytes.toString('utf8'));
    assertNoReplacementCharacters(parsed, artifact.path);
    reversed.set(artifact.path, parsed);
  }

  for (const correction of ledger.strongs) {
    assert(['lemma', 'translit'].includes(correction.field), `Unexpected Strong's correction field: ${strongsLocator(correction)}`);
    const artifact = reversed.get(correction.artifact)!;
    const entry = artifact[correction.strongsNumber];
    assert(isObject(entry), `Missing Strong's entry: ${strongsLocator(correction)}`);
    assert(entry[correction.field] === correction.after, `Corrected Strong's value drift: ${strongsLocator(correction)}`);
    entry[correction.field] = correction.before;
  }
  for (const correction of ledger.morphology) {
    assert(['text', 'lemma'].includes(correction.field), `Unexpected morphology correction field: ${morphologyLocator(correction)}`);
    const artifact = reversed.get(correction.artifact)!;
    assert(artifact.book === correction.book, `Morphology book drift: ${morphologyLocator(correction)}`);
    const word = morphologyWord(artifact, correction);
    assert(word[correction.field] === correction.after, `Corrected morphology value drift: ${morphologyLocator(correction)}`);
    if (correction === john) {
      assert(word.lemma === 'ὁ' && word.strong === 'G3588' && word.morph === 'T-ASM',
        'John 1:1 attested restoration support fields drift');
    }
    word[correction.field] = correction.before;
  }

  for (const artifact of ledger.artifacts) {
    const parsed = reversed.get(artifact.path)!;
    const legacyBytes = artifact.path.endsWith('.json.gz')
      ? gzipSync(JSON.stringify(parsed), { level: 9 })
      : Buffer.from(JSON.stringify(parsed, null, 2), 'utf8');
    const identity = artifactContentIdentity(artifact.path, legacyBytes);
    assert(identity.kind === artifact.identityKind && identity.sha256 === artifact.legacyContentSha256,
      `Reverse projection did not reconstruct legacy artifact content: ${artifact.path}`);
    // Gzip container bytes vary by zlib implementation. Only uncompressed
    // Strong's artifacts can be reverse-byte-verified portably; legacy gzip
    // hashes remain bound as Phase A forensic inventory below.
    if (!artifact.path.endsWith('.json.gz')) {
      assert(identity.rawSha256 === artifact.legacyRawSha256,
        `Reverse projection did not reconstruct legacy artifact bytes: ${artifact.path}`);
    }
  }

  assert(comparedPaths.length === ledger.contract.comparedArtifacts, `Compared artifact count drift: ${comparedPaths.length}`);
  const correctedInventory = comparedPaths.map(path => {
    const identity = artifactContentIdentity(path, readFileSync(join(root, path)));
    return { path, identityKind: identity.kind, sha256: identity.sha256 };
  });
  const correctedRawInventory = comparedPaths.map(path => ({
    path,
    sha256: artifactContentIdentity(path, readFileSync(join(root, path))).rawSha256,
  }));
  const legacyHashes = new Map(ledger.artifacts.map(value => [value.path, value.legacyContentSha256]));
  const legacyContentInventory = correctedInventory.map(value => ({
    path: value.path,
    identityKind: value.identityKind,
    sha256: legacyHashes.get(value.path) ?? value.sha256,
  }));
  const legacyRawHashes = new Map(ledger.artifacts.map(value => [value.path, value.legacyRawSha256]));
  const legacyRawInventory = correctedRawInventory.map(value => ({
    path: value.path,
    sha256: legacyRawHashes.get(value.path) ?? value.sha256,
  }));
  assert(sha256(JSON.stringify(correctedInventory)) === ledger.contract.correctedContentInventorySha256,
    'Corrected biblical-language inventory identity drift');
  assert(sha256(JSON.stringify(legacyContentInventory)) === ledger.contract.legacyContentInventorySha256,
    'Reverse-projected biblical-language inventory identity drift');
  assert(sha256(JSON.stringify(correctedRawInventory)) === ledger.contract.correctedRawInventorySha256,
    'Corrected biblical-language raw inventory identity drift');
  assert(sha256(JSON.stringify(legacyRawInventory)) === ledger.contract.legacyRawInventorySha256,
    'Reverse-projected biblical-language raw inventory identity drift');
}
