#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  OPENSCRIPTURES_STRONGS,
  STEPBIBLE_DATA,
  sourceLockProjection,
} from './biblical-language-sources.js';
import type {
  MorphologyDriftRecord,
  SemanticDriftReport,
  StrongsDriftRecord,
} from './biblical-language-semantic-drift.js';
import { artifactContentIdentity, type ArtifactIdentityKind } from './artifact-content-identity.js';
import { parseDataManifest } from './d1-corpus-identity.js';

export interface ReproductionReport {
  status: string;
  sourcePins: {
    openscriptures: string;
    stepbible: string;
  };
  d1MaterializationIdentity: string;
  comparedArtifacts: number;
  changedArtifacts: number;
  comparisonIdentityPolicy: string;
  trackedContentInventorySha256: string;
  reproducedContentInventorySha256: string;
  trackedRawInventorySha256: string;
  reproducedRawInventorySha256: string;
  rawByteDifferenceCount: number;
  rawByteDifferences: Array<{
    path: string;
    trackedRawSha256: string;
    reproducedRawSha256: string;
  }>;
  missingArtifacts: string[];
  changed: Array<{
    path: string;
    identityKind: 'raw_sha256' | 'canonical_json_payload_sha256_v1';
    trackedIdentitySha256: string;
    reproducedIdentitySha256: string;
    trackedRawSha256: string;
    reproducedRawSha256: string;
  }>;
  semanticDrift: SemanticDriftReport;
}

export interface TrackedArtifactIdentity {
  path: string;
  identityKind: ArtifactIdentityKind;
  identitySha256: string;
  rawSha256: string;
}

function countReplacements(value: unknown): number {
  return typeof value === 'string' ? [...value].filter(character => character === '\uFFFD').length : 0;
}

function fail(label: string, actual: unknown): never {
  throw new Error(`Unexpected biblical-language reproduction ${label}: ${String(actual)}`);
}

function assertValue(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) fail(label, actual);
}

function inventorySha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Bind every path and digest in the report to the exact artifact inventory that
 * was compared. Reproduced gzip bytes remain diagnostic: their inventory is
 * self-consistent, but deliberately has no cross-platform lock.
 */
export function verifyReproductionArtifactInventory(
  report: ReproductionReport,
  trackedArtifacts: readonly TrackedArtifactIdentity[],
): void {
  const expectedPaths = trackedArtifacts.map(artifact => artifact.path);
  if (new Set(expectedPaths).size !== expectedPaths.length) fail('duplicate compared artifact path', 'tracked inventory');
  assertValue('compared artifact count from inventory', report.comparedArtifacts, trackedArtifacts.length);

  if (!Array.isArray(report.changed) || report.changed.length !== report.changedArtifacts) {
    fail('changed content records', report.changed?.length);
  }
  if (!Array.isArray(report.rawByteDifferences)
    || report.rawByteDifferences.length !== report.rawByteDifferenceCount) {
    fail('diagnostic raw-byte difference records', report.rawByteDifferences?.length);
  }

  const expectedByPath = new Map(trackedArtifacts.map(artifact => [artifact.path, artifact]));
  const changedByPath = new Map<string, ReproductionReport['changed'][number]>();
  for (const record of report.changed) {
    if (!expectedByPath.has(record.path)) fail('unexpected changed content path', record.path);
    if (changedByPath.has(record.path)) fail('duplicate changed content path', record.path);
    changedByPath.set(record.path, record);
  }
  const rawByPath = new Map<string, ReproductionReport['rawByteDifferences'][number]>();
  for (const record of report.rawByteDifferences) {
    if (!expectedByPath.has(record.path)) fail('unexpected raw-byte difference path', record.path);
    if (rawByPath.has(record.path)) fail('duplicate raw-byte difference path', record.path);
    rawByPath.set(record.path, record);
  }

  const trackedContentInventory: Array<{ path: string; identityKind: ArtifactIdentityKind; sha256: string }> = [];
  const reproducedContentInventory: Array<{ path: string; identityKind: ArtifactIdentityKind; sha256: string }> = [];
  const trackedRawInventory: Array<{ path: string; sha256: string }> = [];
  const reproducedRawInventory: Array<{ path: string; sha256: string }> = [];
  for (const artifact of trackedArtifacts) {
    const changed = changedByPath.get(artifact.path);
    const rawDifference = rawByPath.get(artifact.path);
    if (changed) {
      assertValue(`${artifact.path} tracked identity kind`, changed.identityKind, artifact.identityKind);
      assertValue(`${artifact.path} tracked content digest`, changed.trackedIdentitySha256, artifact.identitySha256);
      assertValue(`${artifact.path} tracked raw digest in content record`, changed.trackedRawSha256, artifact.rawSha256);
      if (changed.reproducedIdentitySha256 === artifact.identitySha256) fail('unchanged content record', artifact.path);
      if (!rawDifference
        || changed.reproducedRawSha256 !== rawDifference.reproducedRawSha256
        || changed.trackedRawSha256 !== rawDifference.trackedRawSha256) {
        fail('changed content raw-hash evidence', artifact.path);
      }
    }
    if (rawDifference) {
      assertValue(`${artifact.path} tracked raw digest`, rawDifference.trackedRawSha256, artifact.rawSha256);
      if (rawDifference.reproducedRawSha256 === artifact.rawSha256) fail('unchanged raw-byte difference', artifact.path);
    }
    trackedContentInventory.push({
      path: artifact.path,
      identityKind: artifact.identityKind,
      sha256: artifact.identitySha256,
    });
    reproducedContentInventory.push({
      path: artifact.path,
      identityKind: artifact.identityKind,
      sha256: changed?.reproducedIdentitySha256 ?? artifact.identitySha256,
    });
    trackedRawInventory.push({ path: artifact.path, sha256: artifact.rawSha256 });
    reproducedRawInventory.push({
      path: artifact.path,
      sha256: rawDifference?.reproducedRawSha256 ?? artifact.rawSha256,
    });
  }

  assertValue('tracked content inventory from artifacts', report.trackedContentInventorySha256,
    inventorySha256(trackedContentInventory));
  assertValue('reproduced content inventory from records', report.reproducedContentInventorySha256,
    inventorySha256(reproducedContentInventory));
  assertValue('tracked raw inventory from artifacts', report.trackedRawInventorySha256,
    inventorySha256(trackedRawInventory));
  assertValue('diagnostic reproduced raw inventory from records', report.reproducedRawInventorySha256,
    inventorySha256(reproducedRawInventory));
}

function trackedRuntimeArtifacts(root: string): TrackedArtifactIdentity[] {
  const manifest = parseDataManifest(readFileSync(join(root, 'data/data-manifest.json')));
  const paths = [
    ...manifest.materializations.d1.inputs.filter(path => path.startsWith('data/biblical-languages/')),
    'data/biblical-languages/stepbible/index.json',
  ].sort();
  return paths.map(path => {
    const identity = artifactContentIdentity(path, readFileSync(join(root, path)));
    return {
      path,
      identityKind: identity.kind,
      identitySha256: identity.sha256,
      rawSha256: identity.rawSha256,
    };
  });
}

function verifyStrongs(records: StrongsDriftRecord[], report: SemanticDriftReport['strongs']): void {
  const allowed = new Set(['lemma', 'translit']);
  const identities = new Set<string>();
  const recordIds = new Set<string>();
  for (const record of records) {
    if (!/^[GH]\d+$/.test(record.identity)) fail('Strong\'s drift identity', record.identity);
    if (!allowed.has(record.field)) fail('Strong\'s drift field', record.field);
    if (typeof record.tracked !== 'string' || typeof record.reproduced !== 'string') fail('Strong\'s drift value type', record.identity);
    const id = `${record.identity}/${record.field}`;
    if (recordIds.has(id)) fail('duplicate Strong\'s drift identity', id);
    recordIds.add(id);
    identities.add(record.identity);
    assertValue(`${id} tracked replacement count`, record.trackedReplacementCharacters, countReplacements(record.tracked));
    assertValue(`${id} reproduced replacement count`, record.reproducedReplacementCharacters, countReplacements(record.reproduced));
    if (record.trackedReplacementCharacters < 1 || record.reproducedReplacementCharacters !== 0) {
      fail('Strong\'s non-Unicode-repair drift', id);
    }
  }
  assertValue('Strong\'s entries', identities.size, 9);
  assertValue('Strong\'s fields', records.length, 9);
  assertValue('Strong\'s replacement-bearing fields', records.filter(record => record.trackedReplacementCharacters > 0).length, 9);
  assertValue('Strong\'s tracked replacement characters', records.reduce((sum, record) => sum + record.trackedReplacementCharacters, 0), 18);
  assertValue('Strong\'s reproduced replacement characters', records.reduce((sum, record) => sum + record.reproducedReplacementCharacters, 0), 0);
  assertValue('Strong\'s summary entries', report.entries, identities.size);
  assertValue('Strong\'s summary fields', report.fields, records.length);
  assertValue('Strong\'s summary replacement-bearing fields', report.replacementBearingFields, 9);
  assertValue('Strong\'s summary tracked replacements', report.trackedReplacementCharacters, 18);
  assertValue('Strong\'s summary reproduced replacements', report.reproducedReplacementCharacters, 0);
}

function verifyMorphology(records: MorphologyDriftRecord[], report: SemanticDriftReport['morphology']): void {
  const allowed = new Set(['text', 'lemma']);
  const recordIds = new Set<string>();
  const paths = new Set<string>();
  for (const record of records) {
    if (!/^data\/biblical-languages\/stepbible\/(?:greek|hebrew)\/[0-9]{2}-[A-Za-z0-9]+\.json\.gz$/.test(record.path)) {
      fail('morphology drift path', record.path);
    }
    if (!allowed.has(record.field)) fail('morphology drift field', record.field);
    if (!/^\d+$/.test(record.chapter) || !/^\d+$/.test(record.verse)
      || !Number.isSafeInteger(record.position) || record.position < 1
      || typeof record.strong !== 'string' || (record.strong !== '' && !/^[GH]\d+$/.test(record.strong))
      || typeof record.morph !== 'string'
      || typeof record.tracked !== 'string' || typeof record.reproduced !== 'string') {
      fail('morphology drift identity/value', JSON.stringify(record));
    }
    const id = `${record.path}/${record.chapter}/${record.verse}/${record.position}/${record.field}`;
    if (recordIds.has(id)) fail('duplicate morphology drift identity', id);
    recordIds.add(id);
    paths.add(record.path);
    assertValue(`${id} tracked replacement count`, record.trackedReplacementCharacters, countReplacements(record.tracked));
    assertValue(`${id} reproduced replacement count`, record.reproducedReplacementCharacters, countReplacements(record.reproduced));
    if (record.reproducedReplacementCharacters !== 0) fail('reproduced morphology replacement character', id);
  }
  const nonReplacement = records.filter(record => record.trackedReplacementCharacters === 0);
  assertValue('morphology sole non-U+FFFD field count', nonReplacement.length, 1);
  const john = nonReplacement[0];
  const expectedJohn = {
    path: 'data/biblical-languages/stepbible/greek/43-John.json.gz',
    book: 'John',
    chapter: '1',
    verse: '1',
    position: 11,
    field: 'text',
    strong: 'G3588',
    morph: 'T-ASM',
    tracked: 'τὸ',
    reproduced: 'τὸν',
    trackedReplacementCharacters: 0,
    reproducedReplacementCharacters: 0,
  };
  if (JSON.stringify(john) !== JSON.stringify(expectedJohn)) fail('John 1:1 T-ASM restoration', JSON.stringify(john));

  assertValue('morphology files', paths.size, 43);
  assertValue('morphology token-fields', records.length, 237);
  assertValue('morphology replacement-bearing fields', records.filter(record => record.trackedReplacementCharacters > 0).length, 236);
  assertValue('morphology tracked replacement characters', records.reduce((sum, record) => sum + record.trackedReplacementCharacters, 0), 496);
  assertValue('morphology reproduced replacement characters', records.reduce((sum, record) => sum + record.reproducedReplacementCharacters, 0), 0);
  assertValue('morphology summary files', report.files, paths.size);
  assertValue('morphology summary token-fields', report.tokenFields, records.length);
  assertValue('morphology summary replacement-bearing fields', report.replacementBearingFields, 236);
  assertValue('morphology summary tracked replacements', report.trackedReplacementCharacters, 496);
  assertValue('morphology summary reproduced replacements', report.reproducedReplacementCharacters, 0);
}

export function verifyExpectedLegacyReproductionReport(report: ReproductionReport): void {
  const expected = sourceLockProjection().derived_artifacts;
  const checks: Array<[string, unknown, unknown]> = [
    ['status', report.status, 'legacy-derived-content-drift'],
    ['OpenScriptures source pin', report.sourcePins?.openscriptures, OPENSCRIPTURES_STRONGS.commit],
    ['STEPBible source pin', report.sourcePins?.stepbible, STEPBIBLE_DATA.commit],
    ['D1 materialization identity', report.d1MaterializationIdentity, expected.d1_materialization_identity],
    ['compared artifact count', report.comparedArtifacts, expected.compared_artifacts],
    ['comparison identity policy', report.comparisonIdentityPolicy, expected.comparison_identity_policy],
    ['changed content artifact count', report.changedArtifacts, expected.changed_content_artifacts],
    ['tracked content inventory', report.trackedContentInventorySha256, expected.tracked_content_inventory_sha256],
    ['clean reproduction content inventory', report.reproducedContentInventorySha256, expected.clean_reproduction_content_inventory_sha256],
    ['tracked raw inventory', report.trackedRawInventorySha256, expected.tracked_raw_inventory_sha256],
    ['missing artifact count', report.missingArtifacts.length, 0],
  ];
  for (const [label, actual, value] of checks) {
    assertValue(label, actual, value);
  }
  if (!report.semanticDrift || typeof report.semanticDrift !== 'object') {
    fail('semantic drift evidence', 'missing');
  }
  if (!Array.isArray(report.semanticDrift.structuralIssues) || report.semanticDrift.structuralIssues.length !== 0) {
    fail('semantic structural issues', JSON.stringify(report.semanticDrift.structuralIssues));
  }
  if (!Array.isArray(report.semanticDrift.strongs.records) || !Array.isArray(report.semanticDrift.morphology.records)) {
    fail('semantic drift records', 'missing');
  }
  verifyReproductionArtifactInventory(report, trackedRuntimeArtifacts(ROOT));
  if (!/^[0-9a-f]{64}$/.test(report.reproducedRawInventorySha256)) {
    fail('diagnostic reproduced raw inventory', report.reproducedRawInventorySha256);
  }
  if (!Number.isSafeInteger(report.rawByteDifferenceCount)
    || report.rawByteDifferenceCount < report.changedArtifacts
    || report.rawByteDifferenceCount > report.comparedArtifacts
    || !Array.isArray(report.rawByteDifferences)
    || report.rawByteDifferences.length !== report.rawByteDifferenceCount) {
    fail('diagnostic raw-byte difference count', report.rawByteDifferenceCount);
  }
  for (const record of report.rawByteDifferences) {
    if (!/^[0-9a-f]{64}$/.test(record.trackedRawSha256)
      || !/^[0-9a-f]{64}$/.test(record.reproducedRawSha256)
      || record.trackedRawSha256 === record.reproducedRawSha256) {
      fail('invalid raw-byte difference', record.path);
    }
  }
  for (const record of report.changed) {
    const gzip = record.path.endsWith('.json.gz');
    assertValue(`${record.path} identity kind`, record.identityKind,
      gzip ? 'canonical_json_payload_sha256_v1' : 'raw_sha256');
    for (const [label, digest] of Object.entries(record).filter(([key]) => key.endsWith('Sha256'))) {
      if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) fail(`${record.path} ${label}`, digest);
    }
    if (record.trackedIdentitySha256 === record.reproducedIdentitySha256) {
      fail('unchanged content record', record.path);
    }
  }
  assertValue('changed gzip content artifacts', report.changed.filter(record => record.path.endsWith('.json.gz')).length, 43);
  assertValue('changed raw content artifacts', report.changed.filter(record => !record.path.endsWith('.json.gz')).length, 2);
  verifyStrongs(report.semanticDrift.strongs.records, report.semanticDrift.strongs);
  verifyMorphology(report.semanticDrift.morphology.records, report.semanticDrift.morphology);
  const inventorySha256 = createHash('sha256').update(JSON.stringify({
    strongs: report.semanticDrift.strongs.records,
    morphology: report.semanticDrift.morphology.records,
  })).digest('hex');
  assertValue('semantic inventory self-hash', report.semanticDrift.inventorySha256, inventorySha256);
  assertValue('semantic inventory lock', inventorySha256, expected.semantic_drift_inventory_sha256);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = JSON.parse(readFileSync(
    join(ROOT, 'test-output/biblical-language-reproduction.json'),
    'utf8',
  )) as ReproductionReport;
  verifyExpectedLegacyReproductionReport(report);
  console.error('[verify-biblical-language-reproduction-report] Confirmed the exact reviewed legacy drift; no runtime cutover was performed.');
}
