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

export interface ReproductionReport {
  status: string;
  sourcePins: {
    openscriptures: string;
    stepbible: string;
  };
  d1MaterializationIdentity: string;
  comparedArtifacts: number;
  changedArtifacts: number;
  trackedInventorySha256: string;
  reproducedInventorySha256: string;
  missingArtifacts: string[];
  semanticDrift: SemanticDriftReport;
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
    ['status', report.status, 'legacy-derived-artifact-drift'],
    ['OpenScriptures source pin', report.sourcePins?.openscriptures, OPENSCRIPTURES_STRONGS.commit],
    ['STEPBible source pin', report.sourcePins?.stepbible, STEPBIBLE_DATA.commit],
    ['D1 materialization identity', report.d1MaterializationIdentity, expected.d1_materialization_identity],
    ['compared artifact count', report.comparedArtifacts, expected.compared_artifacts],
    ['changed artifact count', report.changedArtifacts, expected.changed_artifacts],
    ['tracked inventory', report.trackedInventorySha256, expected.tracked_inventory_sha256],
    ['clean reproduction inventory', report.reproducedInventorySha256, expected.clean_reproduction_inventory_sha256],
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
