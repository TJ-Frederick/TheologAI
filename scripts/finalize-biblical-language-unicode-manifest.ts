#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileAtomically } from './atomic-publication.js';
import { computeD1CorpusIdentity, type DataManifest } from './d1-corpus-identity.js';
import type { BiblicalLanguageUnicodeCorrectionLedger } from './biblical-language-unicode-correction.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = 'data/data-manifest.json';
const LEDGER_PATH = 'data/biblical-languages/UNICODE-CORRECTION.json';
const EXPECTED_IDENTITIES = Object.freeze({
  5: '93ae4ca3c09493cf02a6b48154c991c133fd6ce235119fc4b8cba0256a36f881',
  6: 'c334b4b91c3a7c334a9425937c7f99473f27014ddae6cea377ee38bd578a6707',
  7: '3708bf7e3ab903c409453fdf4fdac1b68848547f91f0b516855dd21765de4796',
} as const);
const HISTORICAL_CATALOG_INPUTS = Object.freeze([
  'data/historical-document-catalog-provenance.json',
  'data/historical-document-catalog.json',
] as const);

export interface UnicodeManifestFinalization {
  manifest: DataManifest;
  identity: string;
  transformVersion: 5 | 6 | 7;
  changedPaths: string[];
}

function sha256(root: string, path: string): string {
  return createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function buildFinalizedBiblicalLanguageUnicodeManifest(
  root: string,
  sourceManifest: DataManifest,
  ledger: BiblicalLanguageUnicodeCorrectionLedger,
): UnicodeManifestFinalization {
  const manifest = structuredClone(sourceManifest);
  const sourceTransformVersion = manifest.materializations.d1.transformVersion;
  assert([3, 4, 5, 6, 7].includes(sourceTransformVersion), 'Unexpected pre-correction D1 transform version');
  const transformSeven = sourceTransformVersion === 7;
  assert(manifest.schemaVersion === (transformSeven ? '0004_ubs_hebrew_semantics' : '0003_original_language_usage'),
    `Unicode correction must retain schema ${transformSeven ? '0004' : '0003'}`);
  assert(manifest.materializations.d1.identityVersion === 1, 'Unicode correction must retain identity version 1');
  assert(manifest.materializations.d1.migrations.length === (transformSeven ? 4 : 3)
    && manifest.materializations.d1.migrations[0].path === 'migrations/0001_initial_schema.sql'
    && manifest.materializations.d1.migrations[1].path === 'migrations/0002_ubs_parallel_passages.sql'
    && manifest.materializations.d1.migrations[2].path === 'migrations/0003_original_language_usage.sql'
    && (!transformSeven || manifest.materializations.d1.migrations[3].path === 'migrations/0004_ubs_hebrew_semantics.sql'),
  'Unicode correction must retain the reviewed migration set');

  if (sourceTransformVersion >= 6) {
    const manifestPaths = new Set(manifest.files.map(file => file.path));
    const d1Inputs = new Set(manifest.materializations.d1.inputs);
    for (const path of HISTORICAL_CATALOG_INPUTS) {
      assert(manifestPaths.has(path), `Transform 6 must retain historical catalog manifest file: ${path}`);
      assert(d1Inputs.has(path), `Transform 6 must retain historical catalog D1 input: ${path}`);
    }
  }

  const ledgerWasAdded = !manifest.files.some(file => file.path === LEDGER_PATH);
  if (ledgerWasAdded) {
    manifest.files.push({ path: LEDGER_PATH, sha256: sha256(root, LEDGER_PATH) });
  }
  manifest.files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);

  const changed = new Set<string>();
  if (ledgerWasAdded) changed.add(LEDGER_PATH);
  for (const file of manifest.files) {
    const actual = sha256(root, file.path);
    if (file.sha256 !== actual) changed.add(file.path);
    file.sha256 = actual;
  }
  const runtimeCorrections = new Set(ledger.artifacts.map(artifact => artifact.path));
  const allowed = new Set([
    ...runtimeCorrections,
    'data/biblical-languages/SOURCE.json',
    LEDGER_PATH,
    'data/biblical-languages/strongs-metadata.json',
    'data/biblical-languages/stepbible/stepbible-metadata.json',
  ]);
  assert([...changed].every(path => allowed.has(path)),
    `Manifest refresh exceeded the Unicode correction boundary: ${[...changed].filter(path => !allowed.has(path)).join(', ')}`);
  if (sourceTransformVersion === 3) {
    assert(runtimeCorrections.size === 45, 'Unicode ledger runtime-artifact boundary drift');
    assert([...runtimeCorrections].every(path => changed.has(path)), 'Not every reviewed runtime correction changed its manifest hash');
    assert(changed.has('data/biblical-languages/SOURCE.json') && changed.has(LEDGER_PATH)
      && changed.has('data/biblical-languages/strongs-metadata.json')
      && changed.has('data/biblical-languages/stepbible/stepbible-metadata.json'),
    'Unicode provenance artifacts were not all refreshed');
  }

  const transformVersion = sourceTransformVersion === 7 ? 7 : sourceTransformVersion === 6 ? 6 : 5;
  manifest.materializations.d1.transformVersion = transformVersion;
  const identity = computeD1CorpusIdentity(manifest);
  assert(identity === EXPECTED_IDENTITIES[transformVersion],
    `Unexpected corrected D1 transform ${transformVersion} identity: ${identity}`);
  return { manifest, identity, transformVersion, changedPaths: [...changed].sort() };
}

export function finalizeBiblicalLanguageUnicodeManifest(
  root = ROOT,
  write = true,
): UnicodeManifestFinalization {
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST_PATH), 'utf8')) as DataManifest;
  const ledger = JSON.parse(readFileSync(join(root, LEDGER_PATH), 'utf8')) as BiblicalLanguageUnicodeCorrectionLedger;
  const result = buildFinalizedBiblicalLanguageUnicodeManifest(root, manifest, ledger);
  if (write) writeFileAtomically(join(root, MANIFEST_PATH), `${JSON.stringify(result.manifest, null, 2)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = finalizeBiblicalLanguageUnicodeManifest();
  console.error(`[finalize-biblical-language-unicode-manifest] D1 transform ${result.transformVersion} identity ${result.identity}`);
}
