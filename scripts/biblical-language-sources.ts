import { createHash } from 'node:crypto';

export interface PinnedSourceFile {
  id: string;
  owner: string;
  repository: string;
  commit: string;
  repositoryPath: string;
  rawUrl: string;
  bytes: number;
  sha256: string;
  gitBlobSha1: string;
  trackedPath?: string;
}

export interface PinnedSource {
  id: 'openscriptures_strongs' | 'stepbible_data';
  owner: string;
  repository: string;
  repositoryUrl: string;
  commit: string;
  commitDate: string;
  commitUrl: string;
  license: string;
  licenseUrl: string | null;
  attribution: string;
  files: readonly PinnedSourceFile[];
}

export const OPENSCRIPTURES_COMMIT = '0acd2f251c2d35ff8db2dece4e0593979d3ac223';
export const STEPBIBLE_COMMIT = '0f60797c170f11a1f8dc75c5f7617973e2e66b0d';

function rawUrl(owner: string, repository: string, commit: string, repositoryPath: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repository}/${commit}/${repositoryPath.split('/').map(encodeURIComponent).join('/')}`;
}

function pinnedFile(
  source: { owner: string; repository: string; commit: string },
  value: Omit<PinnedSourceFile, 'rawUrl' | 'owner' | 'repository' | 'commit'>,
): PinnedSourceFile {
  return {
    ...value,
    owner: source.owner,
    repository: source.repository,
    commit: source.commit,
    rawUrl: rawUrl(source.owner, source.repository, source.commit, value.repositoryPath),
  };
}

const openscriptures = {
  owner: 'openscriptures',
  repository: 'strongs',
  commit: OPENSCRIPTURES_COMMIT,
};

export const OPENSCRIPTURES_STRONGS: PinnedSource = Object.freeze({
  id: 'openscriptures_strongs',
  owner: openscriptures.owner,
  repository: openscriptures.repository,
  repositoryUrl: 'https://github.com/openscriptures/strongs',
  commit: OPENSCRIPTURES_COMMIT,
  commitDate: '2021-07-15T14:50:54Z',
  commitUrl: `https://github.com/openscriptures/strongs/tree/${OPENSCRIPTURES_COMMIT}`,
  license: 'Public Domain',
  licenseUrl: null,
  attribution: 'Open Scriptures (openscriptures.org)',
  files: Object.freeze([
    pinnedFile(openscriptures, {
      id: 'strongs-greek-xml',
      repositoryPath: 'greek/StrongsGreekDictionaryXML_1.4/strongsgreek.xml',
      bytes: 2_636_209,
      sha256: 'df928f01b37632f8af9f16289ce58d10b958014cb5dbd1e1ea715a8d311a0625',
      gitBlobSha1: '4d7da5124a065cde874c53d08cce647df954d81f',
    }),
    pinnedFile(openscriptures, {
      id: 'strongs-hebrew-xml',
      repositoryPath: 'hebrew/StrongHebrewG.xml',
      bytes: 6_436_400,
      sha256: '1f9659ea208f4c498843a0280dacb1448627c33ca77712642d8705793ab66061',
      gitBlobSha1: '9c16d031f99d5de30a0219cb66d54d6e6401a664',
    }),
  ]),
});

const stepbible = {
  owner: 'STEPBible',
  repository: 'STEPBible-Data',
  commit: STEPBIBLE_COMMIT,
};

export const STEPBIBLE_DATA: PinnedSource = Object.freeze({
  id: 'stepbible_data',
  owner: stepbible.owner,
  repository: stepbible.repository,
  repositoryUrl: 'https://github.com/STEPBible/STEPBible-Data',
  commit: STEPBIBLE_COMMIT,
  commitDate: '2025-09-02T09:50:51Z',
  commitUrl: `https://github.com/STEPBible/STEPBible-Data/tree/${STEPBIBLE_COMMIT}`,
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Tyndale House, Cambridge / STEP Bible (www.stepbible.org)',
  files: Object.freeze([
    pinnedFile(stepbible, {
      id: 'tagnt-mat-jhn',
      repositoryPath: 'Translators Amalgamated OT+NT/TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt',
      bytes: 14_189_032,
      sha256: 'ab8eaaeb68e17a1dcfa34e1e9350358f22f03bc2a97244d848750ad81044bc8e',
      gitBlobSha1: '705c1bc1cf752e013efcef99b8d9a3b7853bf843',
    }),
    pinnedFile(stepbible, {
      id: 'tagnt-act-rev',
      repositoryPath: 'Translators Amalgamated OT+NT/TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt',
      bytes: 15_939_932,
      sha256: '524e32375361e6d3fa2f7ef00b87605fdc4317a762f395651a05fdc31ad031b7',
      gitBlobSha1: '4bbea2c14681b01eb889d5a2d1dc0856858a32de',
    }),
    pinnedFile(stepbible, {
      id: 'tahot-gen-deu',
      repositoryPath: 'Translators Amalgamated OT+NT/TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
      bytes: 18_190_455,
      sha256: 'e9b8546ee48fe0bfc57c3b70f5f40e98d96580e803526d19026224e31753368b',
      gitBlobSha1: 'eb051292f8cee648c4f3eaf1b48cd0f1f30dc1d5',
    }),
    pinnedFile(stepbible, {
      id: 'tahot-jos-est',
      repositoryPath: 'Translators Amalgamated OT+NT/TAHOT Jos-Est - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
      bytes: 24_500_317,
      sha256: '195fee1dc3653bab33701f170734eb894ed647c10cd08cc61749375fe8b73775',
      gitBlobSha1: 'e3824344f6dea1a3f51932d1b0a53537c3c2023e',
    }),
    pinnedFile(stepbible, {
      id: 'tahot-job-sng',
      repositoryPath: 'Translators Amalgamated OT+NT/TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
      bytes: 9_540_133,
      sha256: '84e118a97e5725e3847cdfdd593873513021c790c63cc91a0d41fca2b5db2ed5',
      gitBlobSha1: '3d7af689417b54ebc468700b2bd86a8ba5377530',
    }),
    pinnedFile(stepbible, {
      id: 'tahot-isa-mal',
      repositoryPath: 'Translators Amalgamated OT+NT/TAHOT Isa-Mal - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
      bytes: 17_977_518,
      sha256: 'f3ded203d2a74d6368932c97ae550d1d0754b271af491dc0dedf36fe3ba0bcc5',
      gitBlobSha1: '1cfe6718a1dae0d5d45a57a942d3f7f716ac6342',
    }),
    pinnedFile(stepbible, {
      id: 'tbesg-greek',
      repositoryPath: 'Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt',
      trackedPath: 'data/biblical-languages/stepbible-lexicons/tbesg-greek.txt',
      bytes: 4_736_912,
      sha256: '312f723d7b8ef263bbdfb0451c9b8057125804dfff390b6f8544cff2a84b57f4',
      gitBlobSha1: 'efe271a1dbb73fa01f8fa6e0f164c6687757a9ae',
    }),
    pinnedFile(stepbible, {
      id: 'tbesh-hebrew',
      repositoryPath: 'Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt',
      trackedPath: 'data/biblical-languages/stepbible-lexicons/tbesh-hebrew.txt',
      bytes: 3_288_043,
      sha256: 'bdfdd17c1377aa5400618930fd0ea6f9a6f8d77ffdbbcd575b35d2d81c89401f',
      gitBlobSha1: 'c1638080d61083d7f439bdae872f6d5719ec6ae8',
    }),
  ]),
});

export function sourceFile(source: PinnedSource, id: string): PinnedSourceFile {
  const file = source.files.find(candidate => candidate.id === id);
  if (!file) throw new Error(`Unknown pinned source file: ${source.id}/${id}`);
  return file;
}

export function gitBlobSha1(bytes: Buffer): string {
  return createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, 'utf8'), bytes]))
    .digest('hex');
}

export function assertPinnedSourceBytes(file: PinnedSourceFile, bytes: Buffer): void {
  if (bytes.length !== file.bytes) {
    throw new Error(`Pinned source drift for ${file.id}: expected ${file.bytes} bytes, received ${bytes.length}`);
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== file.sha256) {
    throw new Error(`Pinned source drift for ${file.id}: expected SHA-256 ${file.sha256}, received ${sha256}`);
  }
  const blob = gitBlobSha1(bytes);
  if (blob !== file.gitBlobSha1) {
    throw new Error(`Pinned source drift for ${file.id}: expected Git blob ${file.gitBlobSha1}, received ${blob}`);
  }
}

export function provenance(source: PinnedSource, files: readonly PinnedSourceFile[]) {
  return {
    repository_url: source.repositoryUrl,
    source_url: source.commitUrl,
    commit_sha: source.commit,
    commit_date: source.commitDate,
    inputs: files.map(file => ({
      id: file.id,
      repository_path: file.repositoryPath,
      raw_url: file.rawUrl,
      bytes: file.bytes,
      sha256: file.sha256,
      git_blob_sha1: file.gitBlobSha1,
    })),
  };
}

export function deterministicBuildProvenance(
  source: PinnedSource,
  files: readonly PinnedSourceFile[],
  compiler: { id: string; version: number },
) {
  return {
    ...provenance(source, files),
    provenance_status: 'reproducible_build_from_exact_verified_pins',
    source_attestation: {
      kind: 'build_time_byte_verification',
      source_lock: 'data/biblical-languages/SOURCE.json',
      raw_inputs_byte_verified: true,
    },
    derived_artifact: {
      classification: 'reproducible_from_exact_verified_pins',
      byte_reproducible_from_pinned_inputs: true,
      source_lock: 'data/biblical-languages/SOURCE.json#sources',
      compiler: {
        id: compiler.id,
        version: compiler.version,
        source_revision: source.commit,
      },
    },
  };
}

export function trackedArtifactAttestation(
  source: PinnedSource,
  files: readonly PinnedSourceFile[],
  compiler: { id: string; version: number },
  artifact: {
    status: 'accepted_legacy_non_reproducible' | 'byte_reproducible_from_exact_verified_pins';
    affectedArtifacts: number;
  },
) {
  return {
    ...provenance(source, files),
    provenance_status: 'forensic_attestation_of_tracked_inventory',
    source_attestation: {
      kind: 'forensic_source_attestation_added_after_artifact_creation',
      source_lock: 'data/biblical-languages/SOURCE.json',
      raw_inputs_byte_verified: true,
    },
    tracked_artifact: {
      lineage: 'historical_tracked_artifact_with_provenance_attested_after_creation',
      classification: artifact.status,
      byte_reproducible_from_pinned_inputs: artifact.status === 'byte_reproducible_from_exact_verified_pins',
      affected_runtime_artifacts: artifact.affectedArtifacts,
      source_lock: artifact.affectedArtifacts > 0
        ? 'data/biblical-languages/SOURCE.json#derived_artifacts'
        : 'data/biblical-languages/SOURCE.json#sources',
      clean_reproduction_compiler: {
        id: compiler.id,
        version: compiler.version,
        source_revision: source.commit,
      },
    },
  };
}

export function sourceLockProjection() {
  return {
    schema_version: 1,
    derived_artifacts: {
      status: 'accepted_legacy_non_reproducible',
      tracked_manifest: 'data/data-manifest.json',
      d1_materialization_identity: '91afa5bcf8155ac9f8c5fd14d1d661657c83be9a8e5cd90a5783bfa38ae7dfa5',
      compared_artifacts: 72,
      changed_artifacts: 45,
      tracked_inventory_sha256: '433902e19fa60f1e98dd856b0a073b72e71b1b4e2edd04abca552bf0e96bbf44',
      clean_reproduction_inventory_sha256: '35649745857b65dbe87d024d13288036710272a193179349088f7a4af138268a',
      semantic_drift_inventory_sha256: 'a0ca99fa6a876b22f2c55a2415f1bf524c17026f290773f59f98676d903c7f36',
      explanation: '45 of 72 tracked runtime artifacts remain byte-locked but differ from a deterministic rebuild because historical per-network-chunk UTF-8 decoding corrupted text. The STEPBible lexicon pair is byte-reproducible and is not part of this exception.',
      clean_reproduction_delta: {
        strongs_entries: 9,
        strongs_fields: 9,
        strongs_replacement_characters: 18,
        morphology_files: 43,
        morphology_tokens: 237,
        morphology_fields: 237,
        morphology_replacement_characters: 496,
        additional_attested_delta: 'John 1:1 position 11 is tracked as τὸ while the pinned TAGNT input rebuilds as τὸν.',
      },
      policy: 'Do not replace tracked runtime artifacts in the provenance-pin slice; repair and cut over as a separately reviewed data migration.',
    },
    sources: [OPENSCRIPTURES_STRONGS, STEPBIBLE_DATA].map(source => ({
      id: source.id,
      repository_url: source.repositoryUrl,
      commit_sha: source.commit,
      commit_date: source.commitDate,
      commit_url: source.commitUrl,
      license: source.license,
      license_url: source.licenseUrl,
      attribution: source.attribution,
      inputs: source.files.map(file => ({
        id: file.id,
        repository_path: file.repositoryPath,
        raw_url: file.rawUrl,
        git_blob_sha1: file.gitBlobSha1,
        bytes: file.bytes,
        sha256: file.sha256,
        license: source.license,
        license_url: source.licenseUrl,
        attribution: source.attribution,
      })),
    })),
  };
}
