#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeD1CorpusIdentity, parseDataManifest } from './d1-corpus-identity.js';
import { OPENSCRIPTURES_STRONGS, STEPBIBLE_DATA } from './biblical-language-sources.js';
import { computeBiblicalLanguageSemanticDrift } from './biblical-language-semantic-drift.js';
import { writeFileAtomically } from './atomic-publication.js';
import { artifactContentIdentity, type ArtifactIdentityKind } from './artifact-content-identity.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = join(ROOT, 'data/data-manifest.json');
const REPORT_PATH = join(ROOT, 'test-output/biblical-language-reproduction.json');

const IDENTITY_POLICY = 'canonical_decompressed_json_v1_sha256_for_json_gz_else_raw_sha256';

function runBuilder(script: string, outputRoot: string): void {
  const executable = join(ROOT, 'node_modules/.bin/tsx');
  const result = spawnSync(executable, [join(ROOT, script)], {
    cwd: ROOT,
    env: { ...process.env, THEOLOGAI_LANGUAGE_OUTPUT_ROOT: outputRoot },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${script} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

const manifest = parseDataManifest(readFileSync(MANIFEST_PATH));
const runtimePaths = manifest.materializations.d1.inputs
  .filter(path => path.startsWith('data/biblical-languages/'));
const comparedPaths = [...runtimePaths, 'data/biblical-languages/stepbible/index.json'].sort();
const outputRoot = mkdtempSync(join(tmpdir(), 'theologai-language-reproduction-'));

try {
  for (const script of [
    'scripts/build-strongs-json.ts',
    'scripts/build-stepbible-lexicons.ts',
    'scripts/build-stepbible-json.ts',
  ]) {
    runBuilder(script, outputRoot);
  }

  const changed: Array<{
    path: string;
    identityKind: ArtifactIdentityKind;
    trackedIdentitySha256: string;
    reproducedIdentitySha256: string;
    trackedRawSha256: string;
    reproducedRawSha256: string;
  }> = [];
  const trackedContentInventory: Array<{ path: string; identityKind: ArtifactIdentityKind; sha256: string }> = [];
  const reproducedContentInventory: Array<{ path: string; identityKind: ArtifactIdentityKind; sha256: string }> = [];
  const trackedRawInventory: Array<{ path: string; sha256: string }> = [];
  const reproducedRawInventory: Array<{ path: string; sha256: string }> = [];
  const rawByteDifferences: Array<{ path: string; trackedRawSha256: string; reproducedRawSha256: string }> = [];
  const missing: string[] = [];
  for (const path of comparedPaths) {
    const tracked = join(ROOT, path);
    const reproduced = join(outputRoot, path.replace(/^data\//, ''));
    if (!existsSync(reproduced)) {
      missing.push(path);
      continue;
    }
    const trackedIdentity = artifactContentIdentity(path, readFileSync(tracked));
    const reproducedIdentity = artifactContentIdentity(path, readFileSync(reproduced));
    if (trackedIdentity.kind !== reproducedIdentity.kind) {
      throw new Error(`Artifact identity-kind mismatch for ${path}`);
    }
    trackedContentInventory.push({ path, identityKind: trackedIdentity.kind, sha256: trackedIdentity.sha256 });
    reproducedContentInventory.push({ path, identityKind: reproducedIdentity.kind, sha256: reproducedIdentity.sha256 });
    trackedRawInventory.push({ path, sha256: trackedIdentity.rawSha256 });
    reproducedRawInventory.push({ path, sha256: reproducedIdentity.rawSha256 });
    if (trackedIdentity.rawSha256 !== reproducedIdentity.rawSha256) {
      rawByteDifferences.push({
        path,
        trackedRawSha256: trackedIdentity.rawSha256,
        reproducedRawSha256: reproducedIdentity.rawSha256,
      });
    }
    if (trackedIdentity.sha256 !== reproducedIdentity.sha256) {
      changed.push({
        path,
        identityKind: trackedIdentity.kind,
        trackedIdentitySha256: trackedIdentity.sha256,
        reproducedIdentitySha256: reproducedIdentity.sha256,
        trackedRawSha256: trackedIdentity.rawSha256,
        reproducedRawSha256: reproducedIdentity.rawSha256,
      });
    }
  }

  const report = {
    status: missing.length === 0 && changed.length === 0 ? 'content-reproducible' : 'legacy-derived-content-drift',
    sourcePins: {
      openscriptures: OPENSCRIPTURES_STRONGS.commit,
      stepbible: STEPBIBLE_DATA.commit,
    },
    d1MaterializationIdentity: computeD1CorpusIdentity(manifest),
    comparedArtifacts: comparedPaths.length,
    comparisonIdentityPolicy: IDENTITY_POLICY,
    trackedContentInventorySha256: createHash('sha256').update(JSON.stringify(trackedContentInventory)).digest('hex'),
    reproducedContentInventorySha256: createHash('sha256').update(JSON.stringify(reproducedContentInventory)).digest('hex'),
    trackedRawInventorySha256: createHash('sha256').update(JSON.stringify(trackedRawInventory)).digest('hex'),
    reproducedRawInventorySha256: createHash('sha256').update(JSON.stringify(reproducedRawInventory)).digest('hex'),
    rawByteDifferenceCount: rawByteDifferences.length,
    rawByteDifferences,
    changedArtifacts: changed.length,
    missingArtifacts: missing,
    changed,
    semanticDrift: computeBiblicalLanguageSemanticDrift(
      join(ROOT, 'data/biblical-languages'),
      join(outputRoot, 'biblical-languages'),
    ),
    policy: 'Gzip JSON is compared by canonical decompressed payload; raw container hashes are diagnostic because zlib output varies. This command never updates tracked runtime artifacts.',
  };
  writeFileAtomically(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`[reproduce-biblical-language-sources] Report: ${relative(ROOT, REPORT_PATH)}`);

  if (missing.length > 0 || changed.length > 0) {
    throw new Error(
      `Pinned clean reproduction differs from accepted legacy content: ${changed.length} changed, ${missing.length} missing. `
      + 'No tracked artifact was modified.',
    );
  }
  console.error(`[reproduce-biblical-language-sources] Reproduced ${comparedPaths.length} runtime artifacts by portable content identity.`);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}
