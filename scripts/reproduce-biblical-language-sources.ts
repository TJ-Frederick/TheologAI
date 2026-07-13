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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = join(ROOT, 'data/data-manifest.json');
const REPORT_PATH = join(ROOT, 'test-output/biblical-language-reproduction.json');

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

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

  const changed: Array<{ path: string; trackedSha256: string; reproducedSha256: string }> = [];
  const trackedInventory: Array<{ path: string; sha256: string }> = [];
  const reproducedInventory: Array<{ path: string; sha256: string }> = [];
  const missing: string[] = [];
  for (const path of comparedPaths) {
    const tracked = join(ROOT, path);
    const reproduced = join(outputRoot, path.replace(/^data\//, ''));
    if (!existsSync(reproduced)) {
      missing.push(path);
      continue;
    }
    const trackedSha256 = sha256(tracked);
    const reproducedSha256 = sha256(reproduced);
    trackedInventory.push({ path, sha256: trackedSha256 });
    reproducedInventory.push({ path, sha256: reproducedSha256 });
    if (trackedSha256 !== reproducedSha256) changed.push({ path, trackedSha256, reproducedSha256 });
  }

  const report = {
    status: missing.length === 0 && changed.length === 0 ? 'reproducible' : 'legacy-derived-artifact-drift',
    sourcePins: {
      openscriptures: OPENSCRIPTURES_STRONGS.commit,
      stepbible: STEPBIBLE_DATA.commit,
    },
    d1MaterializationIdentity: computeD1CorpusIdentity(manifest),
    comparedArtifacts: comparedPaths.length,
    trackedInventorySha256: createHash('sha256').update(JSON.stringify(trackedInventory)).digest('hex'),
    reproducedInventorySha256: createHash('sha256').update(JSON.stringify(reproducedInventory)).digest('hex'),
    changedArtifacts: changed.length,
    missingArtifacts: missing,
    changed,
    semanticDrift: computeBiblicalLanguageSemanticDrift(
      join(ROOT, 'data/biblical-languages'),
      join(outputRoot, 'biblical-languages'),
    ),
    policy: 'Reproduction drift must be reviewed; this command never updates tracked runtime artifacts.',
  };
  writeFileAtomically(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`[reproduce-biblical-language-sources] Report: ${relative(ROOT, REPORT_PATH)}`);

  if (missing.length > 0 || changed.length > 0) {
    throw new Error(
      `Pinned clean reproduction differs from accepted legacy artifacts: ${changed.length} changed, ${missing.length} missing. `
      + 'No tracked artifact was modified.',
    );
  }
  console.error(`[reproduce-biblical-language-sources] Reproduced ${comparedPaths.length} runtime artifacts byte-for-byte.`);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}
