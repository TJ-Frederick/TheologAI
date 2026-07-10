#!/usr/bin/env tsx
/** Verify that canonical database source files match the tracked manifest. */

import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

interface ManifestFile {
  path: string;
  sha256: string;
}

interface DataManifest {
  manifestVersion: number;
  schemaVersion: string;
  algorithm: 'sha256';
  files: ManifestFile[];
  expectedCounts: Record<string, number>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');
const MANIFEST_PATH = join(DATA, 'data-manifest.json');

function relativeDataFiles(directory: string, suffix: string): string[] {
  return readdirSync(join(ROOT, directory))
    .filter(file => file.endsWith(suffix))
    .map(file => `${directory}/${file}`);
}

function discoverCanonicalFiles(): string[] {
  return [
    'data/cross-references/cross_references.txt',
    'data/biblical-languages/strongs-greek.json',
    'data/biblical-languages/strongs-hebrew.json',
    'data/biblical-languages/stepbible/morph-codes.json',
    'data/biblical-languages/stepbible-lexicons/tbesg-greek.json',
    'data/biblical-languages/stepbible-lexicons/tbesh-hebrew.json',
    ...relativeDataFiles('data/biblical-languages/stepbible/greek', '.json.gz'),
    ...relativeDataFiles('data/biblical-languages/stepbible/hebrew', '.json.gz'),
    ...relativeDataFiles('data/historical-documents', '.json'),
    'src/data/parallel-passages.json',
  ].sort();
}

function checksum(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as DataManifest;
if (manifest.manifestVersion !== 1 || manifest.algorithm !== 'sha256') {
  throw new Error(`Unsupported data manifest format in ${MANIFEST_PATH}`);
}

const schemaPath = join(ROOT, 'migrations', `${manifest.schemaVersion}.sql`);
if (!existsSync(schemaPath)) {
  throw new Error(`Manifest schema migration does not exist: ${schemaPath}`);
}

const discovered = discoverCanonicalFiles();
const listed = manifest.files.map(file => file.path);
if (new Set(listed).size !== listed.length) {
  throw new Error('Data manifest contains duplicate paths');
}
if (JSON.stringify(listed) !== JSON.stringify([...listed].sort())) {
  throw new Error('Data manifest paths must be sorted');
}
if (JSON.stringify(listed) !== JSON.stringify(discovered)) {
  const missing = discovered.filter(path => !listed.includes(path));
  const unexpected = listed.filter(path => !discovered.includes(path));
  throw new Error(
    `Canonical source list differs from manifest. Missing: ${missing.join(', ') || 'none'}. ` +
    `Unexpected: ${unexpected.join(', ') || 'none'}.`
  );
}

for (const file of manifest.files) {
  const absolutePath = join(ROOT, file.path);
  if (!existsSync(absolutePath)) throw new Error(`Canonical source file is missing: ${file.path}`);
  const actual = checksum(absolutePath);
  if (actual !== file.sha256) {
    throw new Error(`Checksum mismatch for ${file.path}: expected ${file.sha256}, received ${actual}`);
  }
}

console.error(`[verify-data-manifest] Verified ${manifest.files.length} canonical source files.`);
