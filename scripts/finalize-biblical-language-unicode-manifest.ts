#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileAtomically } from './atomic-publication.js';
import { computeD1CorpusIdentity, type DataManifest } from './d1-corpus-identity.js';
import type { BiblicalLanguageUnicodeCorrectionLedger } from './biblical-language-unicode-correction.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = join(ROOT, 'data/data-manifest.json');
const LEDGER_PATH = 'data/biblical-languages/UNICODE-CORRECTION.json';
const EXPECTED_IDENTITY = '652245709aaed181345b0cf17f0091471ac3a3e323f6ae84cfd73a5d8b409c51';

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(join(ROOT, path))).digest('hex');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as DataManifest;
const ledger = JSON.parse(readFileSync(join(ROOT, LEDGER_PATH), 'utf8')) as BiblicalLanguageUnicodeCorrectionLedger;
assert(manifest.schemaVersion === '0002_ubs_parallel_passages', 'Unicode correction must retain schema 0002');
assert(manifest.materializations.d1.identityVersion === 1, 'Unicode correction must retain identity version 1');
assert([3, 4].includes(manifest.materializations.d1.transformVersion), 'Unexpected pre-correction D1 transform version');
assert(manifest.materializations.d1.migrations.length === 2
  && manifest.materializations.d1.migrations[0].path === 'migrations/0001_initial_schema.sql'
  && manifest.materializations.d1.migrations[1].path === 'migrations/0002_ubs_parallel_passages.sql',
'Unicode correction must not alter migrations');

const ledgerWasAdded = !manifest.files.some(file => file.path === LEDGER_PATH);
if (ledgerWasAdded) {
  manifest.files.push({ path: LEDGER_PATH, sha256: sha256(LEDGER_PATH) });
}
manifest.files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);

const changed = new Set<string>();
if (ledgerWasAdded) changed.add(LEDGER_PATH);
for (const file of manifest.files) {
  const actual = sha256(file.path);
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
if (manifest.materializations.d1.transformVersion === 3) {
  assert(runtimeCorrections.size === 45, 'Unicode ledger runtime-artifact boundary drift');
  assert([...runtimeCorrections].every(path => changed.has(path)), 'Not every reviewed runtime correction changed its manifest hash');
  assert(changed.has('data/biblical-languages/SOURCE.json') && changed.has(LEDGER_PATH)
    && changed.has('data/biblical-languages/strongs-metadata.json')
    && changed.has('data/biblical-languages/stepbible/stepbible-metadata.json'),
  'Unicode provenance artifacts were not all refreshed');
}
manifest.materializations.d1.transformVersion = 4;
const identity = computeD1CorpusIdentity(manifest);
assert(identity === EXPECTED_IDENTITY, `Unexpected corrected D1 identity: ${identity}`);
writeFileAtomically(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.error(`[finalize-biblical-language-unicode-manifest] D1 transform 4 identity ${identity}`);
