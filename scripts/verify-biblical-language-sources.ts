#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  OPENSCRIPTURES_STRONGS,
  STEPBIBLE_DATA,
  assertPinnedSourceBytes,
  trackedArtifactAttestation,
  sourceLockProjection,
  type PinnedSource,
  type PinnedSourceFile,
} from './biblical-language-sources.js';
import { assertExactPinnedRawUrl } from './download-pinned-source.js';

const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_BLOB = /^[0-9a-f]{40}$/;

function assertRegistrySource(source: PinnedSource): void {
  if (!/^[A-Za-z0-9_.-]+$/.test(source.owner) || !/^[A-Za-z0-9_.-]+$/.test(source.repository)) {
    throw new Error(`Invalid GitHub repository identity for ${source.id}`);
  }
  if (!COMMIT.test(source.commit)) throw new Error(`Invalid pinned commit for ${source.id}`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(source.commitDate)) {
    throw new Error(`Invalid pinned commit date for ${source.id}`);
  }
  if (source.repositoryUrl !== `https://github.com/${source.owner}/${source.repository}`
    || source.commitUrl !== `${source.repositoryUrl}/tree/${source.commit}`) {
    throw new Error(`Commit URL does not match pinned revision for ${source.id}`);
  }
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const file of source.files) {
    if (ids.has(file.id)) throw new Error(`Duplicate pinned source id: ${source.id}/${file.id}`);
    if (paths.has(file.repositoryPath)) throw new Error(`Duplicate pinned source path: ${source.id}/${file.repositoryPath}`);
    ids.add(file.id);
    paths.add(file.repositoryPath);
    if (file.owner !== source.owner || file.repository !== source.repository || file.commit !== source.commit) {
      throw new Error(`Source file repository identity differs from its registry parent: ${source.id}/${file.id}`);
    }
    if (file.repositoryPath.startsWith('/') || file.repositoryPath.includes('\\')
      || file.repositoryPath.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
      throw new Error(`Unsafe repository path for ${source.id}/${file.id}`);
    }
    assertExactPinnedRawUrl(file);
    if (file.trackedPath && (!/^data\/biblical-languages\/[A-Za-z0-9._/-]+$/.test(file.trackedPath)
      || file.trackedPath.split('/').some(segment => segment === '' || segment === '.' || segment === '..'))) {
      throw new Error(`Unsafe tracked path for ${source.id}/${file.id}`);
    }
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 1
      || !SHA256.test(file.sha256) || !GIT_BLOB.test(file.gitBlobSha1)) {
      throw new Error(`Invalid integrity record for ${source.id}/${file.id}`);
    }
  }
}

function assertMetadata(
  root: string,
  relativePath: string,
  source: PinnedSource,
  files: readonly PinnedSourceFile[],
  compiler: { id: string; version: number },
  artifact: {
    status: 'accepted_legacy_non_reproducible' | 'byte_reproducible_from_exact_verified_pins';
    affectedArtifacts: number;
  },
): void {
  const actual = JSON.parse(readFileSync(join(root, relativePath), 'utf8')) as Record<string, unknown>;
  const expected = trackedArtifactAttestation(source, files, compiler, artifact);
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(value)) {
      throw new Error(`Pinned provenance mismatch in ${relativePath}: ${key}`);
    }
  }
  if ('build_date' in actual || 'buildDate' in actual) {
    throw new Error(`Nondeterministic wall-clock metadata is forbidden in ${relativePath}`);
  }
}

export function verifyBiblicalLanguageSources(root: string): void {
  assertRegistrySource(OPENSCRIPTURES_STRONGS);
  assertRegistrySource(STEPBIBLE_DATA);
  const allIds = [OPENSCRIPTURES_STRONGS, STEPBIBLE_DATA].flatMap(source => source.files.map(file => file.id));
  if (new Set(allIds).size !== allIds.length) throw new Error('Pinned source file IDs must be globally unique');

  const trackedLock = JSON.parse(readFileSync(join(root, 'data/biblical-languages/SOURCE.json'), 'utf8'));
  if (JSON.stringify(trackedLock) !== JSON.stringify(sourceLockProjection())) {
    throw new Error('Tracked biblical-language SOURCE.json differs from the executable pin registry');
  }

  const tracked = STEPBIBLE_DATA.files.filter(file => file.trackedPath);
  for (const file of tracked) {
    assertPinnedSourceBytes(file, readFileSync(join(root, file.trackedPath!)));
  }

  assertMetadata(
    root,
    'data/biblical-languages/strongs-metadata.json',
    OPENSCRIPTURES_STRONGS,
    OPENSCRIPTURES_STRONGS.files,
    { id: 'theologai-strongs-json', version: 1 },
    { status: 'accepted_legacy_non_reproducible', affectedArtifacts: 2 },
  );
  assertMetadata(
    root,
    'data/biblical-languages/stepbible/stepbible-metadata.json',
    STEPBIBLE_DATA,
    STEPBIBLE_DATA.files.filter(file => file.id.startsWith('tagnt-') || file.id.startsWith('tahot-')),
    { id: 'theologai-stepbible-morphology-json', version: 1 },
    { status: 'accepted_legacy_non_reproducible', affectedArtifacts: 43 },
  );
  assertMetadata(
    root,
    'data/biblical-languages/stepbible-lexicons/metadata.json',
    STEPBIBLE_DATA,
    tracked,
    { id: 'theologai-stepbible-lexicon-json', version: 1 },
    { status: 'byte_reproducible_from_exact_verified_pins', affectedArtifacts: 0 },
  );
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyBiblicalLanguageSources(ROOT);
  console.error('[verify-biblical-language-sources] Verified immutable revisions, provenance, and tracked raw inputs.');
}
