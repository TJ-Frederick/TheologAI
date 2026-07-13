import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  OPENSCRIPTURES_COMMIT,
  OPENSCRIPTURES_STRONGS,
  STEPBIBLE_COMMIT,
  STEPBIBLE_DATA,
  assertPinnedSourceBytes,
  deterministicBuildProvenance,
  sourceLockProjection,
  sourceFile,
  trackedArtifactAttestation,
} from '../../../scripts/biblical-language-sources.js';
import { computeD1CorpusIdentity, parseDataManifest } from '../../../scripts/d1-corpus-identity.js';
import { verifyBiblicalLanguageSources } from '../../../scripts/verify-biblical-language-sources.js';
import { verifyExpectedLegacyReproductionReport } from '../../../scripts/verify-biblical-language-reproduction-report.js';

describe('biblical-language source revisions', () => {
  it('pins the reviewed OpenScriptures and STEPBible commits in every raw URL', () => {
    expect(OPENSCRIPTURES_COMMIT).toBe('0acd2f251c2d35ff8db2dece4e0593979d3ac223');
    expect(STEPBIBLE_COMMIT).toBe('0f60797c170f11a1f8dc75c5f7617973e2e66b0d');

    for (const source of [OPENSCRIPTURES_STRONGS, STEPBIBLE_DATA]) {
      expect(source.commitUrl).toBe(`${source.repositoryUrl}/tree/${source.commit}`);
      for (const file of source.files) {
        expect(file.rawUrl).toContain(`/${source.commit}/`);
        expect(file.rawUrl).not.toMatch(/\/(?:main|master|HEAD)\//);
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(file.gitBlobSha1).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });

  it('verifies tracked raw lexicons and their exact metadata projections', () => {
    expect(() => verifyBiblicalLanguageSources(process.cwd())).not.toThrow();
    const lock = sourceLockProjection();
    expect(lock.sources.flatMap(source => source.inputs)).toHaveLength(10);
    expect(lock.derived_artifacts).toMatchObject({
      status: 'accepted_legacy_non_reproducible',
      compared_artifacts: 72,
      changed_artifacts: 45,
    });
  });

  it('distinguishes reproducible clean builds from scoped tracked legacy attestations', () => {
    const files = STEPBIBLE_DATA.files.filter(file => file.id.startsWith('tbes'));
    const compiler = { id: 'theologai-stepbible-lexicon-json', version: 1 };
    expect(deterministicBuildProvenance(STEPBIBLE_DATA, files, compiler).derived_artifact)
      .toMatchObject({
        classification: 'reproducible_from_exact_verified_pins',
        byte_reproducible_from_pinned_inputs: true,
      });
    expect(trackedArtifactAttestation(STEPBIBLE_DATA, files, compiler, {
      status: 'byte_reproducible_from_exact_verified_pins',
      affectedArtifacts: 0,
    }).tracked_artifact).toMatchObject({
      classification: 'byte_reproducible_from_exact_verified_pins',
      byte_reproducible_from_pinned_inputs: true,
      affected_runtime_artifacts: 0,
    });
  });

  it('rejects even a one-byte drift before transformation', () => {
    const file = sourceFile(STEPBIBLE_DATA, 'tbesg-greek');
    const bytes = readFileSync(file.trackedPath!);
    expect(() => assertPinnedSourceBytes(file, bytes)).not.toThrow();
    const changed = Buffer.from(bytes);
    changed[changed.length - 1] ^= 1;
    expect(() => assertPinnedSourceBytes(file, changed)).toThrow('Pinned source drift');
  });

  it('does not change the byte-derived D1 materialization identity', () => {
    const manifest = parseDataManifest(readFileSync('data/data-manifest.json'));
    expect(computeD1CorpusIdentity(manifest))
      .toBe('91afa5bcf8155ac9f8c5fd14d1d661657c83be9a8e5cd90a5783bfa38ae7dfa5');
    for (const provenanceOnly of [
      'data/biblical-languages/SOURCE.json',
      'data/biblical-languages/strongs-metadata.json',
      'data/biblical-languages/stepbible/index.json',
      'data/biblical-languages/stepbible/stepbible-metadata.json',
      'data/biblical-languages/stepbible-lexicons/metadata.json',
      'data/biblical-languages/stepbible-lexicons/tbesg-greek.txt',
      'data/biblical-languages/stepbible-lexicons/tbesh-hebrew.txt',
    ]) {
      expect(manifest.files.map(file => file.path)).toContain(provenanceOnly);
      expect(manifest.materializations.d1.inputs).not.toContain(provenanceOnly);
    }
  });

  it('fails closed when a reproduction report omits the exact semantic drift evidence', () => {
    const expected = sourceLockProjection().derived_artifacts;
    const report = {
      status: 'legacy-derived-artifact-drift',
      sourcePins: {
        openscriptures: OPENSCRIPTURES_COMMIT,
        stepbible: STEPBIBLE_COMMIT,
      },
      d1MaterializationIdentity: expected.d1_materialization_identity,
      comparedArtifacts: expected.compared_artifacts,
      changedArtifacts: expected.changed_artifacts,
      trackedInventorySha256: expected.tracked_inventory_sha256,
      reproducedInventorySha256: expected.clean_reproduction_inventory_sha256,
      missingArtifacts: [],
    };
    expect(() => verifyExpectedLegacyReproductionReport(report as any))
      .toThrow('semantic drift');
    expect(() => verifyExpectedLegacyReproductionReport({ ...report, changedArtifacts: 46 } as any))
      .toThrow('changed artifact count');
    expect(() => verifyExpectedLegacyReproductionReport({
      ...report,
      sourcePins: { ...report.sourcePins, stepbible: '0'.repeat(40) },
    } as any)).toThrow('STEPBible source pin');
  });

  it('routes every language acquisition builder through the pin registry', () => {
    for (const script of [
      'scripts/build-strongs-json.ts',
      'scripts/build-stepbible-json.ts',
      'scripts/build-stepbible-lexicons.ts',
    ]) {
      const source = readFileSync(script, 'utf8');
      expect(source).toContain("from './biblical-language-sources.js'");
      expect(source).toMatch(/(?:downloadPinnedSource|assertPinnedSourceBytes)/);
      expect(source).not.toMatch(/raw\.githubusercontent\.com\/.+\/(?:main|master)\//);
      expect(source).not.toContain('/tree/master/');
    }
  });

  it('reports STEPBible corpus size from the published target after the directory swap', () => {
    const source = readFileSync('scripts/build-stepbible-json.ts', 'utf8');
    expect(source).toContain("path.join(TARGET_DATA_DIR, 'greek')");
    expect(source).toContain("path.join(TARGET_DATA_DIR, 'hebrew')");
  });
});
