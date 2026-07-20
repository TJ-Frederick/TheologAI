#!/usr/bin/env tsx
/** Verify that canonical database source files match the tracked manifest. */

import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { assertProvenanceMatches, type SourceMetadata } from './build-ubs-parallel-passages.js';
import { parseDataManifest, verifyD1Migrations, type DataManifest } from './d1-corpus-identity.js';
import { verifyBiblicalLanguageSources } from './verify-biblical-language-sources.js';
import {
  parseHistoricalDocumentCatalog,
  parseHistoricalDocumentCatalogProvenance,
} from './historical-document-catalog.js';

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
    'data/historical-document-catalog.json',
    'data/historical-document-catalog-provenance.json',
    'data/biblical-languages/SOURCE.json',
    'data/biblical-languages/UNICODE-CORRECTION.json',
    'data/biblical-languages/strongs-greek.json',
    'data/biblical-languages/strongs-hebrew.json',
    'data/biblical-languages/strongs-metadata.json',
    'data/biblical-languages/stepbible/index.json',
    'data/biblical-languages/stepbible/stepbible-metadata.json',
    'data/biblical-languages/stepbible/morph-codes.json',
    'data/biblical-languages/stepbible-lexicons/metadata.json',
    'data/biblical-languages/stepbible-lexicons/tbesg-greek.txt',
    'data/biblical-languages/stepbible-lexicons/tbesg-greek.json',
    'data/biblical-languages/stepbible-lexicons/tbesh-hebrew.txt',
    'data/biblical-languages/stepbible-lexicons/tbesh-hebrew.json',
    'data/biblical-languages/ubs-open-license/v0.9.2/NATIVE-TO-NORMALIZED-BRIDGE.json',
    'data/biblical-languages/ubs-open-license/v0.9.2/SEMANTIC-COMPILATION-AUDIT.json',
    'data/biblical-languages/ubs-open-license/v0.9.2/SOURCE.json',
    'data/biblical-languages/ubs-open-license/v0.9.2/en/UBSHebrewDic-v0.9.2-en.JSON',
    'data/biblical-languages/ubs-open-license/v0.9.2/en/UBSHebrewDicLexicalDomains-v0.9.2-en.JSON',
    ...relativeDataFiles('data/biblical-languages/stepbible/greek', '.json.gz'),
    ...relativeDataFiles('data/biblical-languages/stepbible/hebrew', '.json.gz'),
    ...relativeDataFiles('data/historical-documents', '.json'),
    'data/parallel-passages/ubs-paratext/LICENSE.md',
    'data/parallel-passages/ubs-paratext/ParallelPassages.xml',
    'data/parallel-passages/ubs-paratext/README.md',
    'data/parallel-passages/ubs-paratext/SOURCE.json',
    'src/data/parallel-passages.json',
    'src/data/ubs-parallel-passages.generated.json',
  ].sort();
}

function checksum(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function gitBlobChecksum(bytes: Buffer): string {
  return createHash('sha1').update(Buffer.concat([
    Buffer.from(`blob ${bytes.length}\0`, 'utf8'),
    bytes,
  ])).digest('hex');
}

const manifest = parseDataManifest(readFileSync(MANIFEST_PATH)) as DataManifest & {
  sources?: Record<string, SourceMetadata>;
};
verifyD1Migrations(ROOT, manifest);
verifyBiblicalLanguageSources(ROOT);
const historicalCatalog = parseHistoricalDocumentCatalog(JSON.parse(readFileSync(
  join(ROOT, 'data/historical-document-catalog.json'),
  'utf8',
)));
parseHistoricalDocumentCatalogProvenance(JSON.parse(readFileSync(
  join(ROOT, 'data/historical-document-catalog-provenance.json'),
  'utf8',
)), historicalCatalog);

const schemaPath = join(ROOT, 'migrations', `${manifest.schemaVersion}.sql`);
if (!existsSync(schemaPath)) {
  throw new Error(`Manifest schema migration does not exist: ${schemaPath}`);
}

const ubsSource = manifest.sources?.ubs_paratext_parallel_passages;
if (!ubsSource) throw new Error('Manifest is missing UBS/Paratext source provenance');
const ubsMetadata = JSON.parse(readFileSync(
  join(ROOT, 'data/parallel-passages/ubs-paratext/SOURCE.json'),
  'utf-8',
)) as SourceMetadata;
assertProvenanceMatches(ubsMetadata, ubsSource);
const ubsXml = readFileSync(join(ROOT, 'data/parallel-passages/ubs-paratext/ParallelPassages.xml'));
if (ubsXml.length !== ubsSource.sourceBytes) {
  throw new Error(`UBS source byte size mismatch: expected ${ubsSource.sourceBytes}, received ${ubsXml.length}`);
}
if (checksum(join(ROOT, 'data/parallel-passages/ubs-paratext/ParallelPassages.xml')) !== ubsSource.sourceSha256) {
  throw new Error('UBS source SHA-256 does not match manifest provenance');
}
if (gitBlobChecksum(ubsXml) !== ubsSource.sourceBlob) {
  throw new Error('UBS source Git blob does not match manifest provenance');
}
if (!/^[0-9a-f]{40}$/.test(ubsSource.sourceCommit)) {
  throw new Error('UBS source commit provenance is not a Git SHA-1');
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
