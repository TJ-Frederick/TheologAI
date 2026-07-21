import { createHash } from 'node:crypto';
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
import {
  verifyCorrectedReproductionReport,
  verifyReproductionArtifactInventory,
} from '../../../scripts/verify-biblical-language-reproduction-report.js';
import {
  verifyBiblicalLanguageUnicodeCorrection,
  type BiblicalLanguageUnicodeCorrectionLedger,
} from '../../../scripts/biblical-language-unicode-correction.js';

function unicodeCorrectionFixture(): {
  ledger: BiblicalLanguageUnicodeCorrectionLedger;
  comparedPaths: string[];
} {
  const manifest = parseDataManifest(readFileSync('data/data-manifest.json'));
  const ledger = JSON.parse(readFileSync(
    'data/biblical-languages/UNICODE-CORRECTION.json',
    'utf8',
  )) as BiblicalLanguageUnicodeCorrectionLedger;
  return {
    ledger,
    comparedPaths: [
      ...manifest.materializations.d1.inputs.filter(path => path.startsWith('data/biblical-languages/')
        && !path.startsWith('data/biblical-languages/ubs-open-license/')),
      'data/biblical-languages/stepbible/index.json',
    ].sort(),
  };
}

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
      status: 'content_reproducible_from_exact_verified_pins',
      compared_artifacts: 72,
      changed_content_artifacts: 0,
      unicode_correction: { source_cells: 246, d1_cells: 255 },
    });
  });

  it('rejects traversal segments in tracked source paths', () => {
    const file = STEPBIBLE_DATA.files.find(candidate => candidate.trackedPath)! as { trackedPath: string };
    const original = file.trackedPath;
    try {
      file.trackedPath = 'data/biblical-languages/../outside.txt';
      expect(() => verifyBiblicalLanguageSources(process.cwd())).toThrow('Unsafe tracked path');
    } finally {
      file.trackedPath = original;
    }
  });

  it('binds reproduction drift records to the exact compared paths and digests', () => {
    const digest = (value: string) => createHash('sha256').update(value).digest('hex');
    const artifacts = [
      {
        path: 'data/biblical-languages/strongs-greek.json',
        identityKind: 'raw_sha256' as const,
        identitySha256: digest('tracked-content-a'),
        rawSha256: digest('tracked-raw-a'),
      },
      {
        path: 'data/biblical-languages/stepbible/greek/40-Matthew.json.gz',
        identityKind: 'canonical_json_payload_sha256_v1' as const,
        identitySha256: digest('tracked-content-b'),
        rawSha256: digest('tracked-raw-b'),
      },
    ];
    const reproducedContentA = digest('reproduced-content-a');
    const reproducedRawA = digest('reproduced-raw-a');
    const reproducedRawB = digest('platform-specific-gzip-b');
    const inventoryHash = (value: unknown) => digest(JSON.stringify(value));
    const report = {
      comparedArtifacts: 2,
      changedArtifacts: 1,
      rawByteDifferenceCount: 2,
      changed: [{
        path: artifacts[0].path,
        identityKind: artifacts[0].identityKind,
        trackedIdentitySha256: artifacts[0].identitySha256,
        reproducedIdentitySha256: reproducedContentA,
        trackedRawSha256: artifacts[0].rawSha256,
        reproducedRawSha256: reproducedRawA,
      }],
      rawByteDifferences: [
        {
          path: artifacts[0].path,
          trackedRawSha256: artifacts[0].rawSha256,
          reproducedRawSha256: reproducedRawA,
        },
        {
          path: artifacts[1].path,
          trackedRawSha256: artifacts[1].rawSha256,
          reproducedRawSha256: reproducedRawB,
        },
      ],
      trackedContentInventorySha256: inventoryHash(artifacts.map(artifact => ({
        path: artifact.path,
        identityKind: artifact.identityKind,
        sha256: artifact.identitySha256,
      }))),
      reproducedContentInventorySha256: inventoryHash([
        { path: artifacts[0].path, identityKind: artifacts[0].identityKind, sha256: reproducedContentA },
        { path: artifacts[1].path, identityKind: artifacts[1].identityKind, sha256: artifacts[1].identitySha256 },
      ]),
      trackedRawInventorySha256: inventoryHash(artifacts.map(artifact => ({
        path: artifact.path,
        sha256: artifact.rawSha256,
      }))),
      reproducedRawInventorySha256: inventoryHash([
        { path: artifacts[0].path, sha256: reproducedRawA },
        { path: artifacts[1].path, sha256: reproducedRawB },
      ]),
    };

    expect(() => verifyReproductionArtifactInventory(report as any, artifacts)).not.toThrow();
    expect(() => verifyReproductionArtifactInventory({
      ...report,
      changed: [{ ...report.changed[0], path: 'data/biblical-languages/substituted.json' }],
    } as any, artifacts)).toThrow('unexpected changed content path');
    expect(() => verifyReproductionArtifactInventory({
      ...report,
      changed: [{ ...report.changed[0], trackedIdentitySha256: digest('substituted-digest') }],
    } as any, artifacts)).toThrow('tracked content digest');
    expect(() => verifyReproductionArtifactInventory({
      ...report,
      changed: [{ ...report.changed[0], reproducedIdentitySha256: digest('substituted-reproduction') }],
    } as any, artifacts)).toThrow('reproduced content inventory from records');
    expect(() => verifyReproductionArtifactInventory({
      ...report,
      rawByteDifferences: [
        { ...report.rawByteDifferences[0], path: 'data/biblical-languages/substituted.json' },
        report.rawByteDifferences[1],
      ],
    } as any, artifacts)).toThrow('unexpected raw-byte difference path');
    expect(() => verifyReproductionArtifactInventory({
      ...report,
      rawByteDifferences: [
        report.rawByteDifferences[0],
        { ...report.rawByteDifferences[1], reproducedRawSha256: digest('substituted-raw') },
      ],
    } as any, artifacts)).toThrow('diagnostic reproduced raw inventory from records');
  });

  it('distinguishes reproducible clean builds from scoped tracked legacy attestations', () => {
    const files = STEPBIBLE_DATA.files.filter(file => file.id.startsWith('tbes'));
    const compiler = { id: 'theologai-stepbible-lexicon-json', version: 1 };
    expect(deterministicBuildProvenance(STEPBIBLE_DATA, files, compiler).derived_artifact)
      .toMatchObject({
        classification: 'content_reproducible_from_exact_verified_pins',
        identity_kind: 'raw_sha256',
        byte_reproducible_from_pinned_inputs: true,
      });
    expect(deterministicBuildProvenance(
      STEPBIBLE_DATA, files, compiler, 'canonical_json_payload_sha256_v1',
    ).derived_artifact).toMatchObject({
      classification: 'content_reproducible_from_exact_verified_pins',
      identity_kind: 'canonical_json_payload_sha256_v1',
      byte_reproducible_from_pinned_inputs: false,
      gzip_container_bytes_reproducible_across_zlib_versions: false,
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

  it('pins the transform-7 local semantic D1 materialization identity', () => {
    const manifest = parseDataManifest(readFileSync('data/data-manifest.json'));
    const d1Identity = computeD1CorpusIdentity(manifest);
    expect(d1Identity).toBe('3708bf7e3ab903c409453fdf4fdac1b68848547f91f0b516855dd21765de4796');
    // This lock documents the earlier language-source reproduction transform.
    // The new semantic corpus has its own checked manifest and must not be
    // retroactively folded into that historical reproduction identity.
    expect(sourceLockProjection().derived_artifacts.d1_materialization_identity)
      .toBe('c334b4b91c3a7c334a9425937c7f99473f27014ddae6cea377ee38bd578a6707');
    expect(manifest.materializations.d1.transformVersion).toBe(7);
    for (const provenanceOnly of [
      'data/biblical-languages/SOURCE.json',
      'data/biblical-languages/UNICODE-CORRECTION.json',
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

  it('fails closed when a corrected reproduction report contains any residual drift', () => {
    const expected = sourceLockProjection().derived_artifacts;
    const report = {
      status: 'content-reproducible',
      sourcePins: {
        openscriptures: OPENSCRIPTURES_COMMIT,
        stepbible: STEPBIBLE_COMMIT,
      },
      d1MaterializationIdentity: expected.d1_materialization_identity,
      comparedArtifacts: expected.compared_artifacts,
      changedArtifacts: 0,
      comparisonIdentityPolicy: expected.comparison_identity_policy,
      trackedContentInventorySha256: expected.tracked_content_inventory_sha256,
      reproducedContentInventorySha256: expected.clean_reproduction_content_inventory_sha256,
      trackedRawInventorySha256: expected.tracked_raw_inventory_sha256,
      reproducedRawInventorySha256: expected.tracked_raw_inventory_sha256,
      rawByteDifferenceCount: 0,
      rawByteDifferences: [],
      changed: [],
      missingArtifacts: [],
    };
    expect(() => verifyCorrectedReproductionReport(report as any))
      .toThrow('semantic structural issue count');
    expect(() => verifyCorrectedReproductionReport({ ...report, changedArtifacts: 1 } as any))
      .toThrow('changed content artifact count');
    expect(() => verifyCorrectedReproductionReport({
      ...report,
      sourcePins: { ...report.sourcePins, stepbible: '0'.repeat(40) },
    } as any)).toThrow('STEPBible source pin');
  });

  it('verifies all 246 corrections and reverse-projects the exact legacy artifacts', () => {
    const { ledger, comparedPaths } = unicodeCorrectionFixture();
    expect(() => verifyBiblicalLanguageUnicodeCorrection(process.cwd(), ledger, comparedPaths)).not.toThrow();
    expect(ledger.strongs).toHaveLength(9);
    expect(ledger.morphology).toHaveLength(237);
    expect(ledger.artifacts).toHaveLength(45);
  });

  it('rejects unsafe Unicode correction artifact paths', () => {
    const { ledger, comparedPaths } = unicodeCorrectionFixture();
    const unsafe = structuredClone(ledger);
    unsafe.artifacts[0].path = 'data/biblical-languages/stepbible/greek/../outside.json.gz';
    expect(() => verifyBiblicalLanguageUnicodeCorrection(process.cwd(), unsafe, comparedPaths))
      .toThrow('Invalid Unicode artifact identity record');
  });

  it('binds corrected artifact records to current committed raw bytes', () => {
    const { ledger, comparedPaths } = unicodeCorrectionFixture();
    const correctedRawMutation = structuredClone(ledger);
    correctedRawMutation.artifacts[0].preparedCorrectedRawSha256 = '0'.repeat(64);
    expect(() => verifyBiblicalLanguageUnicodeCorrection(process.cwd(), correctedRawMutation, comparedPaths))
      .toThrow('Corrected artifact raw-byte identity drift');
  });

  it('binds legacy gzip forensics to the Phase A raw inventory', () => {
    const { ledger, comparedPaths } = unicodeCorrectionFixture();
    const legacyRawMutation = structuredClone(ledger);
    legacyRawMutation.artifacts[0].legacyRawSha256 = '0'.repeat(64);
    expect(() => verifyBiblicalLanguageUnicodeCorrection(process.cwd(), legacyRawMutation, comparedPaths))
      .toThrow('Reverse-projected biblical-language raw inventory identity drift');
  });

  it("reverse-verifies uncompressed Strong's legacy bytes", () => {
    const { ledger, comparedPaths } = unicodeCorrectionFixture();
    const strongsLegacyRawMutation = structuredClone(ledger);
    strongsLegacyRawMutation.artifacts.find(artifact => !artifact.path.endsWith('.json.gz'))!.legacyRawSha256 = '0'.repeat(64);
    expect(() => verifyBiblicalLanguageUnicodeCorrection(process.cwd(), strongsLegacyRawMutation, comparedPaths))
      .toThrow('Reverse projection did not reconstruct legacy artifact bytes');
  });

  it('pins the Phase A legacy raw inventory contract', () => {
    const { ledger, comparedPaths } = unicodeCorrectionFixture();
    const rawInventoryMutation = structuredClone(ledger);
    rawInventoryMutation.contract.legacyRawInventorySha256 = '0'.repeat(64);
    expect(() => verifyBiblicalLanguageUnicodeCorrection(process.cwd(), rawInventoryMutation, comparedPaths))
      .toThrow('Unicode correction identity contract drift');
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
