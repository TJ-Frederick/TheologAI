#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeD1CorpusIdentity, parseDataManifest } from './d1-corpus-identity.js';
import {
  OPENSCRIPTURES_STRONGS,
  STEPBIBLE_DATA,
  sourceLockProjection,
} from './biblical-language-sources.js';
import { resolveBiblicalLanguageReproductionOwnership } from './biblical-language-reproduction-ownership.js';
import { computeBiblicalLanguageSemanticDrift } from './biblical-language-semantic-drift.js';
import { publishFilesAtomically, writeFileAtomically } from './atomic-publication.js';
import {
  LEGACY_REPRODUCTION_SCOPE_SCHEMA_VERSION,
  verifyExpectedLegacyReproductionReport,
} from './verify-biblical-language-reproduction-report.js';
import {
  createBiblicalLanguageUnicodeCorrectionLedger,
  verifyBiblicalLanguageUnicodeCorrection,
  type BiblicalLanguageUnicodeCorrectionLedger,
} from './biblical-language-unicode-correction.js';
import { artifactContentIdentity, type ArtifactIdentityKind } from './artifact-content-identity.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = join(ROOT, 'data/data-manifest.json');
const REPORT_PATH = join(ROOT, 'test-output/biblical-language-reproduction.json');
const LEDGER_PATH = join(ROOT, 'data/biblical-languages/UNICODE-CORRECTION.json');
const PREPARE_ARGUMENT = '--prepare-unicode-correction';
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
const ownership = resolveBiblicalLanguageReproductionOwnership(manifest);
const comparedPaths = ownership.legacyReproducerArtifacts;
const outputRoot = mkdtempSync(join(tmpdir(), 'theologai-language-reproduction-'));
const prepare = process.argv.slice(2).includes(PREPARE_ARGUMENT);
if (process.argv.slice(2).some(argument => argument !== PREPARE_ARGUMENT)) {
  throw new Error(`Unknown argument. Supported: ${PREPARE_ARGUMENT}`);
}

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
    if (trackedIdentity.kind !== reproducedIdentity.kind) throw new Error(`Artifact identity-kind mismatch for ${path}`);
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
    // This is always the actual manifest identity present when the report was
    // produced, including separately verified transform-7 UBS inputs.
    d1MaterializationIdentity: computeD1CorpusIdentity(manifest),
    // The 72-artifact legacy reproducer is deliberately narrower than the
    // current D1 corpus. Its historical identity is scope evidence only and
    // is therefore explicitly versioned rather than overloaded above.
    legacyReproductionScope: {
      schemaVersion: LEGACY_REPRODUCTION_SCOPE_SCHEMA_VERSION,
      historicalMaterializationIdentity: changed.length === 0
        ? sourceLockProjection().derived_artifacts.d1_materialization_identity
        : sourceLockProjection().derived_artifacts.unicode_correction.legacy_d1_materialization_identity,
    },
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
    policy: 'This command owns only the declared OpenScriptures/STEPBible artifact inventory. UBS Hebrew v0.9.2 inputs are validated by the data manifest plus their exact acquisition and semantic-compilation verifiers. Gzip JSON is compared by canonical decompressed payload; raw container hashes are diagnostic because zlib output varies. This command never updates tracked runtime artifacts.',
  };
  writeFileAtomically(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`[reproduce-biblical-language-sources] Report: ${relative(ROOT, REPORT_PATH)}`);

  if (prepare) {
    verifyExpectedLegacyReproductionReport(report);
    const ledger = createBiblicalLanguageUnicodeCorrectionLedger(report);
    const stagedLanguageRoot = join(outputRoot, 'biblical-languages');
    writeFileAtomically(
      join(stagedLanguageRoot, 'UNICODE-CORRECTION.json'),
      `${JSON.stringify(ledger, null, 2)}\n`,
    );
    const correctedRuntimeArtifacts = report.changed.map(change =>
      change.path.replace(/^data\/biblical-languages\//, '')
    );
    if (correctedRuntimeArtifacts.length !== 45
      || correctedRuntimeArtifacts.some(path => path.startsWith('data/'))) {
      throw new Error(`Refusing Unicode preparation outside the exact 45-artifact boundary`);
    }
    publishFilesAtomically(
      stagedLanguageRoot,
      join(ROOT, 'data/biblical-languages'),
      [
        ...correctedRuntimeArtifacts,
        'strongs-metadata.json',
        'stepbible/stepbible-metadata.json',
        'UNICODE-CORRECTION.json',
      ],
    );
    console.error('[reproduce-biblical-language-sources] Published the exact reviewed 45-artifact Unicode correction and its provenance ledger.');
  } else {
    if (missing.length > 0 || changed.length > 0) {
      throw new Error(
        `Pinned clean reproduction differs from accepted legacy content: ${changed.length} changed, ${missing.length} missing. `
        + 'No tracked artifact was modified.',
      );
    }
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as BiblicalLanguageUnicodeCorrectionLedger;
    verifyBiblicalLanguageUnicodeCorrection(ROOT, ledger, comparedPaths);
    console.error(`[reproduce-biblical-language-sources] Reproduced ${comparedPaths.length} runtime artifacts by portable content identity.`);
  }
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}
