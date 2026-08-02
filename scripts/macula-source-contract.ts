#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MACULA_SOURCE_CONTRACT_VERSION = 'theologai-macula-source-contract.v1';
export const MACULA_SOURCE_CONTRACT_PATH = 'data/biblical-languages/macula/SOURCE-CONTRACT.json';
export const MACULA_AUDIT_IDENTITY = '2d5e770ee05260fbbf4f6810153f815e55b86b602ca301e30b7274c3637124b7';

type RecordValue = Record<string, unknown>;
export type MaculaCorpus = 'greek' | 'hebrew';
export type MaculaSourceAttributeScope = 'word' | 'group' | 'participant';

export interface MaculaSourceContract {
  schemaVersion: typeof MACULA_SOURCE_CONTRACT_VERSION;
  status: 'candidate_contract_only';
  sources: readonly RecordValue[];
  fieldPolicy: RecordValue;
  danglingParticipantExclusionLedger: RecordValue;
  auditEvidence: RecordValue;
  currentMainAttestation: RecordValue;
  rightsAndProvenance: RecordValue;
  inertness: RecordValue;
}

const expectedSources = [
  {
    id: 'macula-greek',
    corpus: 'greek',
    repository: 'https://github.com/Clear-Bible/macula-greek.git',
    revision: {
      commit: '8423afe47b9e8f24b7772e808af45c7159a6fe7e',
      tree: 'eea78df4b0f1efb857f1575243a1ec4548267a11',
      releaseStatus: 'unreleased_main_snapshot',
    },
    selection: { xmlPathPattern: 'SBLGNT/lowfat/*.xml', xmlFileCount: 27, selectedPathCount: 29 },
    noticePaths: ['README.md', 'LICENSE.md'],
    maturity: {
      baselineTag: '24.06.17',
      baselinePeeledCommit: 'b5b7ecec0882a3e9a609ecac99e157391e5d9b46',
      selectedPinStatus: 'untagged_snapshot',
      selectedPinDescendsFromBaseline: true,
      reachableCommitDistance: 29,
      selectedPathComparison: {
        selectedLowfatFileCount: 27,
        differingSelectedLowfatFileCount: 27,
        status: 'all_selected_lowfat_files_differ_from_baseline_tag',
      },
      repositoryLevelChangeSummary: 'The selected pin is a later untagged snapshot; this lock records reproducibility, not a release or quality conclusion.',
      independentPublicationGates: [
        'independent scholarly QA',
        'product acceptance',
        'full reproduction',
        'rights review',
        'nine-dangling relationship resolution-or-exclusion gate',
      ],
      reproducibilityBoundary: 'Exact pins prove reproducibility only.',
    },
  },
  {
    id: 'macula-hebrew',
    corpus: 'hebrew',
    repository: 'https://github.com/Clear-Bible/macula-hebrew.git',
    revision: {
      commit: '47db250bd55d0d8577f2a94fba114ef16c35b23c',
      tree: '594f395cf473795d6984003800b4bf86ca691a26',
      releaseStatus: 'unreleased_main_snapshot',
    },
    selection: { xmlPathPattern: 'WLC/lowfat/*-lowfat.xml', xmlFileCount: 929, selectedPathCount: 933 },
    noticePaths: ['README.md', 'LICENSE.md', 'sources/README.md', 'sources/GrovesCenter/README.md'],
    maturity: {
      baselineTag: '26.04.13',
      baselinePeeledCommit: '09f8ea9e25025841ec45e2b6e7fc01595a080568',
      selectedPinStatus: 'untagged_snapshot',
      selectedPinDescendsFromBaseline: true,
      reachableCommitDistance: 3,
      selectedPathComparison: {
        selectedLowfatFileCount: 929,
        differingSelectedLowfatFileCount: 0,
        differingSelectedNoticeCount: 0,
        status: 'no_selected_WLC_lowfat_files_or_selected_notices_differ_from_baseline_tag',
      },
      repositoryLevelChangeSummary: 'Repository changes from the baseline tag cover CGJ stripping, NFC normalization, and merge work; they change zero selected WLC/lowfat files and zero selected notices.',
      independentPublicationGates: [
        'independent scholarly QA',
        'product acceptance',
        'full reproduction',
        'rights review',
        'nine-dangling relationship resolution-or-exclusion gate',
      ],
      reproducibilityBoundary: 'Exact pins prove reproducibility only.',
    },
  },
] as const;

const expectedFieldPolicy = {
  capabilityMatrix: {
    greek: {
      word: ['xml:id', 'ref', 'class', 'role'],
      group: ['class', 'role', 'rule', 'Rule'],
      participant: ['referent', 'subjref'],
    },
    hebrew: {
      word: ['xml:id', 'ref', 'class', 'role', 'lang'],
      group: ['class', 'role', 'rule', 'head'],
      participant: ['subjref', 'participantref'],
    },
  },
  alignmentOnlyEphemeral: ['word element text'],
  knownRejectedWordAttributes: [
    'after', 'case', 'coredomain', 'degree', 'discontinuous', 'domain', 'english', 'frame', 'gender',
    'gloss', 'greek', 'greekstrong', 'junction', 'lemma', 'lexdomain', 'ln', 'mandarin', 'mood',
    'morph', 'normalized', 'note', 'number', 'person', 'pos', 'rule', 'sdbh', 'sensenumber', 'state',
    'stem', 'strong', 'stronglemma', 'strongnumberx', 'tense', 'transliteration', 'type', 'unicode', 'voice',
  ],
  knownRejectedGroupAttributes: ['articular', 'clauseType', 'clausetype', 'junction', 'nodeId', 'predication', 'type'],
  unknownAttributePolicy: 'fail_closed_review_required',
} as const;

const expectedDanglingLedger = {
  status: 'unresolved_excluded_from_public_output',
  records: [
    { corpus: 'hebrew', relationship: 'participantref', count: 4 },
    { corpus: 'hebrew', relationship: 'subjref', count: 5 },
  ],
  total: 9,
  correctionPolicy: 'no_guessed_target_corrections',
  publicOutputPolicy: 'fail_closed',
} as const;

const expectedAuditEvidence = {
  authority: 'only_final_replay_2_under_the_local_audit_output',
  deterministicIdentity: MACULA_AUDIT_IDENTITY,
  compactArtifacts: [
    { path: 'source-manifest.json', bytes: 240_952, sha256: 'b9dbd2ca6353fa76740650ffa85247b449e0e2f687fc1f40e227a7677f571988' },
    { path: 'inspection.json', bytes: 54_523, sha256: '505e715901635db876539358f9456830ff51b17445cd372045d665834c9896b9' },
  ],
  projectionArtifact: {
    path: 'macula-structural-projection.sqlite',
    bytes: 207_106_048,
    sha256: 'c5a61cf047e662a6d2238093edefa7dc540ce8f2b2bbeb49115cb94329fab414',
    verificationPolicy: 'recorded_only_not_opened_by_compact_verifier',
  },
  authorityArtifacts: [
    {
      base: 'audit-output',
      path: 'EVIDENCE-STATUS.md',
      bytes: 1_150,
      sha256: 'c40d6a96945ef15bd56363bbcd06c8d76c97058b5980e42b7707a128c6adf0f8',
    },
    {
      base: 'final-replay-2',
      path: 'run-summary.json',
      bytes: 8_779,
      sha256: 'e46fbf33ce0b15a5db0dde0f3212b33d8a9204c8a3449e549dea6ac7cf179959',
    },
    {
      base: 'final-replay-2',
      path: 'REPORT.md',
      bytes: 6_545,
      sha256: 'd27aaf26496568023617cf7d8470442ca5a321d3e52e15e568adba1767a12a52',
    },
    {
      base: 'final-replay-2',
      path: 'provenance-license-notice.json',
      bytes: 1_823,
      sha256: 'd81d2ccfef76bc682ed2c147f47dc6bcc3fb7ae2cc3bab150686191d30ca320f',
    },
    {
      base: 'final-replay-2',
      path: 'replay-comparison.json',
      bytes: 856,
      sha256: 'c20858d3d10fa95f9bc86013089a9ab206e2ef7f97c919a9c55dd61d40848d34',
    },
  ],
} as const;

const expectedDeterministicArtifacts = [
  { path: 'source-manifest.json', bytes: 240_952, sha256: 'b9dbd2ca6353fa76740650ffa85247b449e0e2f687fc1f40e227a7677f571988' },
  { path: 'inspection.json', bytes: 54_523, sha256: '505e715901635db876539358f9456830ff51b17445cd372045d665834c9896b9' },
  { path: 'macula-structural-projection.sqlite', bytes: 207_106_048, sha256: 'c5a61cf047e662a6d2238093edefa7dc540ce8f2b2bbeb49115cb94329fab414' },
] as const;

const expectedDeterministicHashDomain = {
  excludes: [
    'run-summary.json',
    'timestamps',
    'absolute paths',
    'host-specific tool versions and benchmark timing',
  ],
  artifacts: expectedDeterministicArtifacts,
  sha256: MACULA_AUDIT_IDENTITY,
} as const;

const expectedReplayComparison = {
  status: 'identical',
  priorOutput: 'audit-output/final-replay-1',
  deterministicIdentity: MACULA_AUDIT_IDENTITY,
  artifacts: expectedDeterministicArtifacts,
  assertion: 'The complete projection was independently regenerated twice from the same clean, pinned local inputs and every deterministic artifact hash and byte count matched.',
} as const;

const expectedCurrentMain = {
  commit: '2f12262c9a37d3588bee9b5071954823c15cbd12',
  tree: '9922aedb74c690e7a3fcb926b3d621f28fa44535',
  morphologyUsageIdentity: 'c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd',
  runtimeContentInventory: {
    artifactCount: 72,
    identityPolicy: 'canonical_decompressed_json_v1_sha256_for_json_gz_else_raw_sha256',
    sha256: 'caf58814f24cc72837586c901c42f3556b59e45ec81bb0af7f5cfb9fa1629dcd',
  },
  stepBibleCommit: '0f60797c170f11a1f8dc75c5f7617973e2e66b0d',
  d1CorpusIdentity: '29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4',
  d1CorpusIdentityDerivation: 'computeD1CorpusIdentity(parseDataManifest(data/data-manifest.json))',
} as const;

const expectedRightsAndProvenance = {
  maculaGreek: {
    license: 'CC BY 4.0 per the pinned MACULA Greek notice',
    requiredAttribution: 'MACULA Greek Linguistic Datasets, available at https://github.com/Clear-Bible/macula-greek/',
    selectedInputProvenance: 'MACULA SBLGNT lowfat inputs are SBLGNT-derived and may contain data migrated or persisted from the upstream edition; excluded fields do not erase applicable upstream notices.',
    modificationNoticeRequirements: [
      'Before any distribution, provide the required attribution, a link to CC BY 4.0, and applicable copyright or license notices.',
      'Identify modifications and do not imply upstream endorsement or impose additional restrictions.',
    ],
  },
  maculaHebrew: {
    license: 'CC BY 4.0 per the pinned MACULA Hebrew notice',
    requiredAttribution: 'MACULA Hebrew Linguistic Datasets, available at https://github.com/Clear-Bible/macula-hebrew/',
    selectedInputProvenance: 'The selected WLC lowfat input otherwise has composite provenance. All morphology and morphological-analysis fields are excluded except the Hebrew-only raw lang evidence expressly identified below; future publication still requires a source-by-source rights review.',
    modificationNoticeRequirements: [
      'Before any distribution, provide the required attribution, a link to CC BY 4.0, and applicable copyright or license notices.',
      'Identify modifications and do not imply upstream endorsement or impose additional restrictions.',
    ],
  },
  langRetention: {
    attribute: 'lang',
    corpus: 'hebrew',
    retainedAs: 'raw OSHB-derived H/A language evidence only',
    notA: [
      'morphological analysis',
      'an ISO code',
      'an independently adjudicated language conclusion',
      'a general classifier',
      'a Greek capability',
      'authorization to retain any other OSHB morphology field',
    ],
    pipelineEvidence: {
      maculaHebrewNotice: 'MACULA Hebrew trees combine Westminster syntax with OSHB morphology.',
      selectedSource: "The retained lang attribute is copied from MACULA's derivative, reorganized, and corrected OSHB source layer; the selected WLC lowfat input otherwise has composite provenance.",
      sourceReadme: 'The pinned repository source README records the MACULA source layer provenance.',
      pinnedRepositoryXquery: 'The pinned repository XQuery copies node @lang; it is provenance evidence and not one of the 933 selected paths.',
      observedTokenLanguages: {
        allSelectedHebrewTokensHaveLang: true,
        total: 475_911,
        H: 468_362,
        A: 7_549,
        absentFromGreekSource: true,
      },
    },
    openScripturesHebrewBible: {
      name: 'Open Scriptures Hebrew Bible',
      sourceUri: 'https://github.com/openscriptures/morphhb',
      license: 'CC BY 4.0',
      licenseUri: 'https://creativecommons.org/licenses/by/4.0/',
      noticeAndAttributionRequirement: 'Retain the supplied attribution, notices, and source URI; do not invent a replacement attribution phrase.',
      modificationRequirement: 'Identify modifications.',
      restrictionsRequirement: 'Do not imply endorsement or impose additional restrictions.',
    },
    operationalBoundary: 'This is an operational provenance record, not a legal conclusion or publication authorization.',
  },
  standaloneFaithlifeNotice: {
    role: 'notice_only_provenance_evidence_not_selected_corpus_input',
    repository: 'https://github.com/Faithlife/SBLGNT.git',
    commit: 'c4d241a9c1c479a55b989ba35a4976c1d0b8052c',
    tree: '1237db9d579eb13457157ca266a6f822dd4353b9',
    noticePaths: ['README.md', 'LICENSE'],
    selectedCorpusInput: false,
    prohibitedUses: ['selection', 'materialization', 'alignment', 'projection', 'deterministic identity', 'public output'],
  },
  sblgntRightsForMaculaGreekDerivedInput: {
    selectedInput: 'MACULA Greek SBLGNT/lowfat XML',
    derivation: 'The selected MACULA Greek lowfat input is SBLGNT-derived.',
    upstream: 'SBL Greek New Testament',
    license: 'CC BY 4.0',
    licenseUri: 'https://creativecommons.org/licenses/by/4.0/',
    copyrightNotice: 'Copyright 2010 Society of Biblical Literature and Logos Bible Software',
    upstreamSourceUri: 'https://sblgnt.com/',
    futureDistributionObligations: [
      'Retain supplied source, link, license, copyright, and disclaimer notices.',
      'Identify modifications.',
      'Do not imply endorsement or impose additional restrictions.',
    ],
    standaloneCheckoutBoundary: 'The standalone Faithlife checkout did not supply the selected XML.',
    publicationGate: 'Obligations may attach to a future projection; mandatory source-by-source and legal review is required before publication.',
    operationalBoundary: 'This is an operational rights record, not a legal conclusion or publication authorization.',
  },
  legalReviewGate: 'This contract records source notices and operational obligations; it is not a legal opinion and does not authorize publication.',
} as const;

const expectedInertness = {
  contractDoesNotActivate: [
    'corpus acquisition',
    'corpus storage',
    'SQLite or D1 projection',
    'migration',
    'data-manifest activation',
    'repository adapter',
    'MCP schema, tool, output, catalog, or resource',
    'composition-root binding',
    'runtime reachability',
    'preview, deployment, or Cloudflare workflow',
  ],
  verifierBoundary: 'The verifier is local, read-only, and deterministic. It performs no network request, source acquisition, mutation, database access, or runtime binding.',
} as const;

const expectedRunSummaryAttestations = {
  maculaGreek: {
    head: '8423afe47b9e8f24b7772e808af45c7159a6fe7e',
    tree: 'eea78df4b0f1efb857f1575243a1ec4548267a11',
    clean: true,
    selectedPathCount: 29,
    everySelectedPathTracked: true,
    branch: '(detached)',
  },
  maculaHebrew: {
    head: '47db250bd55d0d8577f2a94fba114ef16c35b23c',
    tree: '594f395cf473795d6984003800b4bf86ca691a26',
    clean: true,
    selectedPathCount: 933,
    everySelectedPathTracked: true,
    branch: '(detached)',
  },
  theologaiMain: {
    head: '2f12262c9a37d3588bee9b5071954823c15cbd12',
    tree: '9922aedb74c690e7a3fcb926b3d621f28fa44535',
    clean: true,
    selectedPathCount: 68,
    everySelectedPathTracked: true,
    branch: 'main',
    originMain: '2f12262c9a37d3588bee9b5071954823c15cbd12',
  },
  theologaiPreflight: {
    head: '2f12262c9a37d3588bee9b5071954823c15cbd12',
    tree: '9922aedb74c690e7a3fcb926b3d621f28fa44535',
    clean: true,
    selectedPathCount: 0,
    everySelectedPathTracked: true,
    branch: 'main',
    originMain: '2f12262c9a37d3588bee9b5071954823c15cbd12',
  },
} as const;

const expectedRunSummaryCompatibilityDerivation = {
  d1CorpusIdentity: 'computeD1CorpusIdentity(parseDataManifest(data/data-manifest.json)) from the exact audit checkout',
  morphologyUsageIdentity: 'computeMorphologyUsageIdentity(parseDataManifest(data/data-manifest.json)) from the exact audit checkout',
  runtimeContentInventory: 'canonical content identity over the repository-owned 72-artifact OpenScriptures/STEPBible runtime inventory',
} as const;

const expectedRunSummaryReplayScript = {
  path: 'scripts/inspect-macula-v2.mjs',
  sha256: '0ce62ee220cd49893c59f23c0b32d00a02ccbe8f1f1c6373ebead010a94f6149',
  requiredNode: '22.23.1',
} as const;

const expectedRunSummaryFaithlifeNotice = {
  status: 'notice_only_excluded_from_alignment_projection_and_deterministic_identity',
  output: 'provenance-license-notice.json',
} as const;

const expectedRunSummaryInventoryAssertions = {
  selectedMaculaGreekFiles: 29,
  selectedMaculaHebrewFiles: 933,
  runtimeCorpusFiles: 66,
  runtimeContentInventoryArtifacts: 72,
  faithlifeSblgntAlignmentInput: false,
  allSelectedPathsTracked: true,
} as const;

const expectedRunSummaryWorkerdD1 = {
  status: 'not_run',
  reason: 'A full D1/Workerd probe requires a reviewed D1 materializer/import path. Native SQLite was run against the complete projection; D1 rows_read and remote-equivalent latency remain deliberately unclaimed.',
} as const;

const expectedRunSummaryIntegrity = {
  foreignKeyViolations: 0,
  tokensWithoutImmediateGroup: 0,
  tokensWithMissingGroup: 0,
  groupsWithMissingParent: 0,
  totalGroups: 441_272,
  reachableGroups: 441_272,
  unreachableGroups: 0,
  groupCycleMembers: 0,
  tokenMembershipRows: 613_652,
  groupReferenceRows: 1_965_769,
  referencesWithoutGroupContext: 0,
  duplicateTokenIds: 0,
  releaseGateDanglingParticipantReferences: 9,
  pass: true,
  releaseEligible: false,
} as const;

function fail(message: string): never {
  throw new Error(`MACULA source contract violation: ${message}`);
}

function record(value: unknown, label: string): RecordValue {
  if (!value || Array.isArray(value) || typeof value !== 'object') fail(`${label} must be an object`);
  return value as RecordValue;
}

function exactKeys(value: RecordValue, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} has unknown or missing fields: expected ${expected.join(', ')}, received ${actual.join(', ')}`);
  }
}

function exactValue(value: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail(`${label} drifted from the reviewed lock`);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) fail(`${label} must be a string array`);
  if (new Set(value).size !== value.length) fail(`${label} must not contain duplicates`);
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) fail(`${label} must be a non-empty string`);
  return value;
}

function safeNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative safe integer`);
  return value;
}

function sha256String(value: unknown, label: string): string {
  const hash = nonEmptyString(value, label);
  if (!/^[0-9a-f]{64}$/.test(hash)) fail(`${label} must be a lower-case SHA-256`);
  return hash;
}

function absolutePathDiagnostic(value: unknown, label: string): string {
  const path = nonEmptyString(value, label);
  if (!path.startsWith('/')) fail(`${label} must be an absolute path diagnostic`);
  return path;
}

function isoTimestampDiagnostic(value: unknown, label: string): string {
  const timestamp = nonEmptyString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    fail(`${label} must be an ISO-8601 UTC timestamp diagnostic`);
  }
  return timestamp;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    fail(`${label} is not strict UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function parseMaculaSourceContract(value: unknown): MaculaSourceContract {
  const root = record(value, 'contract');
  exactKeys(root, [
    'schemaVersion', 'status', 'sources', 'fieldPolicy', 'danglingParticipantExclusionLedger', 'auditEvidence',
    'currentMainAttestation', 'rightsAndProvenance', 'inertness',
  ], 'contract');
  if (root.schemaVersion !== MACULA_SOURCE_CONTRACT_VERSION || root.status !== 'candidate_contract_only') {
    fail('schema version or candidate-only status drifted');
  }
  if (!Array.isArray(root.sources)) fail('sources must be an array');
  exactValue(root.sources, expectedSources, 'source pins');

  const policy = record(root.fieldPolicy, 'fieldPolicy');
  exactKeys(policy, Object.keys(expectedFieldPolicy), 'fieldPolicy');
  exactValue(policy, expectedFieldPolicy, 'fieldPolicy');
  for (const [name, value] of Object.entries(policy)) {
    if (name.endsWith('Attributes') || name === 'alignmentOnlyEphemeral') stringArray(value, `fieldPolicy.${name}`);
  }
  const matrix = record(policy.capabilityMatrix, 'fieldPolicy capability matrix');
  exactKeys(matrix, ['greek', 'hebrew'], 'fieldPolicy capability matrix');
  for (const corpus of ['greek', 'hebrew'] as const) {
    const capabilities = record(matrix[corpus], `fieldPolicy ${corpus} capabilities`);
    exactKeys(capabilities, ['word', 'group', 'participant'], `fieldPolicy ${corpus} capabilities`);
    for (const scope of ['word', 'group', 'participant'] as const) {
      stringArray(capabilities[scope], `fieldPolicy ${corpus}.${scope}`);
    }
  }

  const ledger = record(root.danglingParticipantExclusionLedger, 'dangling participant exclusion ledger');
  exactKeys(ledger, Object.keys(expectedDanglingLedger), 'dangling participant exclusion ledger');
  exactValue(ledger, expectedDanglingLedger, 'dangling participant exclusion ledger');

  const evidence = record(root.auditEvidence, 'audit evidence');
  exactKeys(evidence, Object.keys(expectedAuditEvidence), 'audit evidence');
  exactValue(evidence, expectedAuditEvidence, 'audit evidence');

  const currentMain = record(root.currentMainAttestation, 'current main attestation');
  exactKeys(currentMain, Object.keys(expectedCurrentMain), 'current main attestation');
  exactValue(currentMain, expectedCurrentMain, 'current main attestation');

  const rights = record(root.rightsAndProvenance, 'rights and provenance');
  exactKeys(rights, [
    'maculaGreek', 'maculaHebrew', 'langRetention', 'standaloneFaithlifeNotice',
    'sblgntRightsForMaculaGreekDerivedInput', 'legalReviewGate',
  ], 'rights and provenance');
  exactValue(rights, expectedRightsAndProvenance, 'rights and provenance');
  for (const key of ['maculaGreek', 'maculaHebrew'] as const) {
    const source = record(rights[key], `rights and provenance.${key}`);
    exactKeys(source, ['license', 'requiredAttribution', 'selectedInputProvenance', 'modificationNoticeRequirements'], `rights and provenance.${key}`);
    stringArray(source.modificationNoticeRequirements, `rights and provenance.${key}.modificationNoticeRequirements`);
  }
  const faithlife = record(rights.standaloneFaithlifeNotice, 'Faithlife SBLGNT notice');
  exactKeys(faithlife, ['role', 'repository', 'commit', 'tree', 'noticePaths', 'selectedCorpusInput', 'prohibitedUses'], 'Faithlife SBLGNT notice');
  stringArray(faithlife.noticePaths, 'Faithlife SBLGNT notice paths');
  stringArray(faithlife.prohibitedUses, 'Faithlife SBLGNT prohibited uses');
  if (faithlife.role !== 'notice_only_provenance_evidence_not_selected_corpus_input' || faithlife.selectedCorpusInput !== false) {
    fail('Faithlife SBLGNT must remain notice-only and outside selected corpus inputs');
  }

  const inertness = record(root.inertness, 'inertness');
  exactKeys(inertness, ['contractDoesNotActivate', 'verifierBoundary'], 'inertness');
  exactValue(inertness, expectedInertness, 'inertness');
  stringArray(inertness.contractDoesNotActivate, 'inertness.contractDoesNotActivate');
  return root as unknown as MaculaSourceContract;
}

export function readMaculaSourceContract(root: string): MaculaSourceContract {
  return parseMaculaSourceContract(parseJson(readFileSync(join(root, MACULA_SOURCE_CONTRACT_PATH)), MACULA_SOURCE_CONTRACT_PATH));
}

/** Reject both known non-retained fields and novel schema fields before materialization. */
export function assertMaculaSourceAttribute(corpus: MaculaCorpus, scope: MaculaSourceAttributeScope, attribute: string): void {
  if (corpus !== 'greek' && corpus !== 'hebrew') {
    fail(`invalid source attribute corpus ${JSON.stringify(corpus)}`);
  }
  if (scope !== 'word' && scope !== 'group' && scope !== 'participant') {
    fail(`invalid source attribute scope ${JSON.stringify(scope)}`);
  }
  const allowed = expectedFieldPolicy.capabilityMatrix[corpus][scope];
  const rejected = scope === 'word'
    ? expectedFieldPolicy.knownRejectedWordAttributes
    : scope === 'group'
      ? expectedFieldPolicy.knownRejectedGroupAttributes
      : [];
  if (allowed.includes(attribute as never)) return;
  if ((corpus === 'greek' ? expectedFieldPolicy.capabilityMatrix.hebrew : expectedFieldPolicy.capabilityMatrix.greek)[scope]
    .includes(attribute as never)) {
    fail(`${corpus} ${scope} attribute ${attribute} is not approved for that corpus`);
  }
  if (rejected.includes(attribute as never)) fail(`${scope} attribute ${attribute} is explicitly excluded`);
  fail(`${corpus} ${scope} attribute ${attribute} is unknown schema drift and requires review`);
}

/** Verify an exact local commit/tree pair without fetching or moving a ref. */
export function verifyPinnedGitCommitTree(root: string, commit: string, tree: string, label: string): void {
  const revision = (args: string[]) => {
    try {
      return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch {
      fail(`${label} Git object is unavailable for ${args.join(' ')}`);
    }
  };
  revision(['cat-file', '-e', `${commit}^{commit}`]);
  if (revision(['rev-parse', `${commit}^{tree}`]) !== tree) {
    fail(`${label} tree differs from the source lock`);
  }
}

/**
 * Verify the historical Git object used by the audit. It intentionally does
 * not compare `origin/main`: main is expected to advance after the audit.
 */
export function verifyHistoricalCurrentMainAttestation(root: string): void {
  verifyPinnedGitCommitTree(
    root,
    expectedCurrentMain.commit,
    expectedCurrentMain.tree,
    'pinned historical current-main',
  );
}

function assertAuditSelectedFiles(source: RecordValue, expected: typeof expectedSources[number]): void {
  exactKeys(source, ['corpus', 'files', 'id', 'releaseStatus', 'repository', 'requestedRef', 'resolvedCommit', 'resolvedTree'], `audit source ${expected.id}`);
  if (source.id !== expected.id || source.corpus !== expected.corpus || source.repository !== expected.repository
    || source.requestedRef !== expected.revision.commit || source.resolvedCommit !== expected.revision.commit
    || source.resolvedTree !== expected.revision.tree || source.releaseStatus !== 'unreleased-main-snapshot') {
    fail(`audit source ${expected.id} drifted from the source lock`);
  }
  if (!Array.isArray(source.files) || source.files.length !== expected.selection.selectedPathCount) fail(`audit source ${expected.id} selected path count drifted`);
  const notices = new Set<string>(expected.noticePaths);
  let xmlCount = 0;
  for (const rawFile of source.files) {
    const file = record(rawFile, `audit source ${expected.id} file`);
    exactKeys(file, ['bytes', 'kind', 'path', 'sha256'], `audit source ${expected.id} file`);
    if (typeof file.bytes !== 'number' || !Number.isSafeInteger(file.bytes) || file.bytes < 1
      || typeof file.path !== 'string' || typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)
      || (file.kind !== 'selected-xml' && file.kind !== 'license-or-source-notice')) {
      fail(`audit source ${expected.id} has malformed selected-file evidence`);
    }
    if (file.kind === 'license-or-source-notice') {
      if (!notices.delete(file.path)) fail(`audit source ${expected.id} contains an unexpected notice path`);
      continue;
    }
    const validXml = expected.id === 'macula-greek'
      ? /^SBLGNT\/lowfat\/[a-z0-9-]+\.xml$/.test(file.path)
      : /^WLC\/lowfat\/[0-9]{2}-[A-Za-z0-9]+-[0-9]{3}-lowfat\.xml$/.test(file.path);
    if (!validXml) fail(`audit source ${expected.id} contains an unexpected XML path`);
    xmlCount += 1;
  }
  if (notices.size !== 0 || xmlCount !== expected.selection.xmlFileCount) fail(`audit source ${expected.id} selection drifted`);
}

function auditAttributeKeys(value: RecordValue, key: string, label: string): string[] {
  return Object.keys(record(value[key], label)).sort();
}

function assertAuditSchema(schema: RecordValue, expected: typeof expectedSources[number]): void {
  exactKeys(schema, [
    'corpus', 'danglingExamples', 'files', 'groupAttributesObserved', 'groups', 'idCollisions', 'languages',
    'maxDepth', 'maxReferenceMultiplicity', 'participantAttributesObserved', 'participantResolutions', 'references',
    'roots', 'selectedXmlBytes', 'syntheticUngroupedGroups', 'tokens', 'wordAttributesObserved',
  ], `audit ${expected.id} schema`);
  if (schema.corpus !== expected.corpus || schema.files !== expected.selection.xmlFileCount) fail(`audit ${expected.id} schema identity drifted`);
  const capabilities = expectedFieldPolicy.capabilityMatrix[expected.corpus];
  const knownWord = new Set<string>([
    ...capabilities.word,
    ...capabilities.participant,
    ...expectedFieldPolicy.knownRejectedWordAttributes,
  ]);
  const knownGroup = new Set<string>([
    ...capabilities.group,
    ...expectedFieldPolicy.knownRejectedGroupAttributes,
  ]);
  const unknownWord = auditAttributeKeys(schema, 'wordAttributesObserved', `audit ${expected.id} word attributes`).filter(attribute => !knownWord.has(attribute));
  const unknownGroup = auditAttributeKeys(schema, 'groupAttributesObserved', `audit ${expected.id} group attributes`).filter(attribute => !knownGroup.has(attribute));
  const unknownParticipant = auditAttributeKeys(schema, 'participantAttributesObserved', `audit ${expected.id} participant attributes`)
    .filter(attribute => !capabilities.participant.includes(attribute as never));
  if (unknownWord.length || unknownGroup.length || unknownParticipant.length) {
    fail(`audit ${expected.id} source schema contains unknown attributes`);
  }
}

function verifyRunSummaryBenchmark(value: unknown): void {
  const benchmark = record(value, 'run summary benchmark');
  exactKeys(benchmark, [
    'contextQueryPlan', 'd1RowsRead', 'engine', 'iterations', 'medianMilliseconds', 'p95Milliseconds',
    'qualification', 'representativeReferences', 'returnedContextRows',
  ], 'run summary benchmark');
  if (benchmark.engine !== 'node:sqlite/native-SQLite' || benchmark.qualification !== 'This is a full-projection local SQLite benchmark. It is not a Workerd/D1 billing or latency claim.'
    || benchmark.d1RowsRead !== null) fail('run summary benchmark diagnostic drifted');
  if (!Array.isArray(benchmark.representativeReferences) || benchmark.representativeReferences.length < 1 || benchmark.representativeReferences.length > 12) {
    fail('run summary benchmark representative references have an invalid diagnostic shape');
  }
  for (const candidate of benchmark.representativeReferences) {
    const reference = record(candidate, 'run summary benchmark representative reference');
    exactKeys(reference, ['corpus', 'group_count', 'reference_id', 'source_reference', 'token_count'], 'run summary benchmark representative reference');
    if (safeNonNegativeInteger(reference.reference_id, 'run summary benchmark reference id') < 1
      || reference.corpus !== 'hebrew'
      || !/^[1-3]?[A-Z][A-Z0-9]* \d+:\d+!\d+$/.test(nonEmptyString(reference.source_reference, 'run summary benchmark source reference'))
      || safeNonNegativeInteger(reference.token_count, 'run summary benchmark token count') < 1
      || safeNonNegativeInteger(reference.group_count, 'run summary benchmark group count') < 1) {
      fail('run summary benchmark representative reference drifted');
    }
  }
  if (safeNonNegativeInteger(benchmark.iterations, 'run summary benchmark iterations') < 1
    || safeNonNegativeInteger(benchmark.returnedContextRows, 'run summary benchmark returned context rows') < 1
    || typeof benchmark.medianMilliseconds !== 'number' || !Number.isFinite(benchmark.medianMilliseconds) || benchmark.medianMilliseconds < 0
    || typeof benchmark.p95Milliseconds !== 'number' || !Number.isFinite(benchmark.p95Milliseconds) || benchmark.p95Milliseconds < 0) {
    fail('run summary benchmark timing diagnostic drifted');
  }
  if (!Array.isArray(benchmark.contextQueryPlan) || benchmark.contextQueryPlan.length < 1) fail('run summary benchmark query plan has an invalid diagnostic shape');
  for (const candidate of benchmark.contextQueryPlan) {
    const plan = record(candidate, 'run summary benchmark query plan row');
    exactKeys(plan, ['detail', 'id', 'notused', 'parent'], 'run summary benchmark query plan row');
    safeNonNegativeInteger(plan.id, 'run summary benchmark query plan id');
    safeNonNegativeInteger(plan.parent, 'run summary benchmark query plan parent');
    safeNonNegativeInteger(plan.notused, 'run summary benchmark query plan notused');
    nonEmptyString(plan.detail, 'run summary benchmark query plan detail');
  }
}

/** Validate all unhashed run-summary metadata without opening any corpus artifact. */
export function verifyMaculaAuditRunSummary(value: unknown): void {
  const summary = record(value, 'run summary');
  exactKeys(summary, [
    'attestations', 'auditRoot', 'benchmark', 'canonicalRuntimeCompatibility', 'command', 'deterministicHashDomain',
    'environment', 'executedAt', 'faithlifeSblgntNotice', 'integrity', 'inventoryAssertions', 'replayComparison',
    'replayScript', 'schemaVersion', 'workerdD1',
  ], 'run summary');
  if (summary.schemaVersion !== 2) fail('run summary schema version drifted');
  isoTimestampDiagnostic(summary.executedAt, 'run summary execution timestamp');
  absolutePathDiagnostic(summary.auditRoot, 'run summary audit root');
  const command = nonEmptyString(summary.command, 'run summary command');
  if (!command.includes('scripts/inspect-macula-v2.mjs') || !command.includes('--output audit-output/final-replay-2') || !command.includes('--compare audit-output/final-replay-1')) {
    fail('run summary command diagnostic drifted');
  }

  const environment = record(summary.environment, 'run summary environment');
  exactKeys(environment, ['git', 'node', 'sqlite'], 'run summary environment');
  if (!/^v\d+\.\d+\.\d+$/.test(nonEmptyString(environment.node, 'run summary Node diagnostic'))
    || !/^\d+\.\d+(?:\.\d+)?$/.test(nonEmptyString(environment.sqlite, 'run summary SQLite diagnostic'))
    || !/^git version .+$/.test(nonEmptyString(environment.git, 'run summary Git diagnostic'))) {
    fail('run summary host tooling diagnostic drifted');
  }
  const replayScript = record(summary.replayScript, 'run summary replay script');
  exactKeys(replayScript, Object.keys(expectedRunSummaryReplayScript), 'run summary replay script');
  exactValue(replayScript, expectedRunSummaryReplayScript, 'run summary replay script');

  const attestations = record(summary.attestations, 'run summary attestations');
  exactKeys(attestations, Object.keys(expectedRunSummaryAttestations), 'run summary attestations');
  for (const [key, expected] of Object.entries(expectedRunSummaryAttestations)) {
    const attestation = record(attestations[key], `run summary ${key}`);
    exactKeys(attestation, Object.keys(expected), `run summary ${key}`);
    exactValue(attestation, expected, `run summary ${key}`);
  }

  const compatibility = record(summary.canonicalRuntimeCompatibility, 'run summary compatibility');
  exactKeys(compatibility, ['d1CorpusIdentity', 'derivation', 'loader', 'morphologyUsageIdentity', 'runtimeContentInventory'], 'run summary compatibility');
  exactValue(compatibility.d1CorpusIdentity, expectedCurrentMain.d1CorpusIdentity, 'run summary D1 corpus identity');
  exactValue(compatibility.morphologyUsageIdentity, expectedCurrentMain.morphologyUsageIdentity, 'run summary morphology usage identity');
  exactValue(compatibility.runtimeContentInventory, expectedCurrentMain.runtimeContentInventory, 'run summary runtime content inventory');
  const derivation = record(compatibility.derivation, 'run summary compatibility derivation');
  exactKeys(derivation, Object.keys(expectedRunSummaryCompatibilityDerivation), 'run summary compatibility derivation');
  exactValue(derivation, expectedRunSummaryCompatibilityDerivation, 'run summary compatibility derivation');
  const loader = record(compatibility.loader, 'run summary compatibility loader');
  exactKeys(loader, ['executable', 'tsxCliSha256', 'tsxVersion'], 'run summary compatibility loader');
  absolutePathDiagnostic(loader.executable, 'run summary loader executable');
  sha256String(loader.tsxCliSha256, 'run summary loader tsx CLI SHA-256');
  if (!/^\d+\.\d+\.\d+$/.test(nonEmptyString(loader.tsxVersion, 'run summary loader tsx version'))) {
    fail('run summary loader diagnostic drifted');
  }

  const faithlife = record(summary.faithlifeSblgntNotice, 'run summary Faithlife notice');
  exactKeys(faithlife, Object.keys(expectedRunSummaryFaithlifeNotice), 'run summary Faithlife notice');
  exactValue(faithlife, expectedRunSummaryFaithlifeNotice, 'run summary Faithlife notice');
  const hashDomain = record(summary.deterministicHashDomain, 'run summary deterministic hash domain');
  exactKeys(hashDomain, ['artifacts', 'excludes', 'sha256'], 'run summary deterministic hash domain');
  exactValue(hashDomain, expectedDeterministicHashDomain, 'run summary deterministic hash domain');
  const inventory = record(summary.inventoryAssertions, 'run summary inventory assertions');
  exactKeys(inventory, Object.keys(expectedRunSummaryInventoryAssertions), 'run summary inventory assertions');
  exactValue(inventory, expectedRunSummaryInventoryAssertions, 'run summary inventory assertions');
  const replayComparison = record(summary.replayComparison, 'run summary replay comparison');
  exactKeys(replayComparison, ['artifacts', 'assertion', 'deterministicIdentity', 'priorOutput', 'status'], 'run summary replay comparison');
  exactValue(replayComparison, expectedReplayComparison, 'run summary replay comparison');
  if (JSON.stringify(replayComparison.artifacts) !== JSON.stringify(hashDomain.artifacts)) {
    fail('replay comparison artifacts differ from deterministic hash-domain artifacts');
  }
  verifyRunSummaryBenchmark(summary.benchmark);
  const workerdD1 = record(summary.workerdD1, 'run summary Workerd/D1');
  exactKeys(workerdD1, Object.keys(expectedRunSummaryWorkerdD1), 'run summary Workerd/D1');
  exactValue(workerdD1, expectedRunSummaryWorkerdD1, 'run summary Workerd/D1');
  const integrity = record(summary.integrity, 'run summary integrity');
  exactKeys(integrity, Object.keys(expectedRunSummaryIntegrity), 'run summary integrity');
  exactValue(integrity, expectedRunSummaryIntegrity, 'run summary integrity');
  if (safeNonNegativeInteger(integrity.totalGroups, 'run summary total groups')
      !== safeNonNegativeInteger(integrity.reachableGroups, 'run summary reachable groups') + safeNonNegativeInteger(integrity.unreachableGroups, 'run summary unreachable groups')
    || integrity.releaseGateDanglingParticipantReferences !== expectedDanglingLedger.total
    || integrity.pass !== true || integrity.releaseEligible !== false) {
    fail('run summary integrity arithmetic or publication gate drifted');
  }
}

/**
 * Check only the compact, authoritative final replay. It never opens the
 * 197 MiB projection and never reads source checkouts, XML, SQLite, or a
 * superseded replay. A full future materializer remains a separate gate.
 */
export function verifyAuthoritativeMaculaAudit(finalReplayDirectory: string, contractRoot = ROOT): void {
  const finalDirectory = resolve(finalReplayDirectory);
  if (basename(finalDirectory) !== 'final-replay-2') fail('only final-replay-2 is authoritative');
  const auditOutput = dirname(finalDirectory);
  const contract = readMaculaSourceContract(contractRoot);
  const evidence = record(contract.auditEvidence, 'audit evidence');
  const authorityArtifacts = evidence.authorityArtifacts as readonly RecordValue[];
  for (const artifact of authorityArtifacts) {
    const base = artifact.base === 'audit-output'
      ? auditOutput
      : artifact.base === 'final-replay-2'
        ? finalDirectory
        : fail('authority artifact has an unknown base');
    if (typeof artifact.path !== 'string' || typeof artifact.bytes !== 'number' || typeof artifact.sha256 !== 'string') {
      fail('malformed authority artifact lock');
    }
    const bytes = readFileSync(join(base, artifact.path));
    if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) {
      fail(`authority artifact ${artifact.path} drifted`);
    }
  }

  const status = readFileSync(join(auditOutput, 'EVIDENCE-STATUS.md'), 'utf8');
  for (const phrase of [
    'The only authoritative Gate-0 candidate in this directory is:',
    '`final-replay-2/`',
    MACULA_AUDIT_IDENTITY,
    'not publication-eligible: nine Hebrew participant relationships remain dangling',
  ]) if (!status.includes(phrase)) fail(`EVIDENCE-STATUS.md does not establish ${phrase}`);

  const compact = evidence.compactArtifacts as readonly RecordValue[];
  const audit = new Map<string, RecordValue>();
  for (const artifact of compact) {
    const path = artifact.path;
    if (typeof path !== 'string' || typeof artifact.bytes !== 'number' || typeof artifact.sha256 !== 'string') fail('malformed compact artifact lock');
    const bytes = readFileSync(join(finalDirectory, path));
    if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) fail(`compact audit artifact ${path} drifted`);
    audit.set(path, record(parseJson(bytes, path), path));
  }
  const sourceManifest = audit.get('source-manifest.json')!;
  exactKeys(sourceManifest, ['runtimeIdentity', 'schemaVersion', 'scope', 'sources', 'strictRightsAllowlist'], 'source-manifest');
  if (sourceManifest.schemaVersion !== 2 || !Array.isArray(sourceManifest.sources) || sourceManifest.sources.length !== expectedSources.length) {
    fail('source-manifest identity drifted');
  }
  const runtimeIdentity = record(sourceManifest.runtimeIdentity, 'source-manifest runtime identity');
  exactKeys(runtimeIdentity, ['commit', 'compatibilityGate', 'files', 'originMain', 'repository', 'tree'], 'source-manifest runtime identity');
  if (runtimeIdentity.commit !== expectedCurrentMain.commit || runtimeIdentity.tree !== expectedCurrentMain.tree
    || runtimeIdentity.originMain !== expectedCurrentMain.commit) fail('source-manifest current-main identity drifted');
  const compatibilityGate = record(runtimeIdentity.compatibilityGate, 'source-manifest compatibility gate');
  exactKeys(compatibilityGate, [
    'd1CorpusIdentity', 'd1CorpusIdentityDerivation', 'morphologyUsageIdentity', 'primary',
    'runtimeContentInventory', 'stepBibleSourceCommit',
  ], 'source-manifest compatibility gate');
  exactValue(compatibilityGate.d1CorpusIdentity, expectedCurrentMain.d1CorpusIdentity, 'source-manifest D1 corpus identity');
  exactValue(compatibilityGate.d1CorpusIdentityDerivation, `${expectedCurrentMain.d1CorpusIdentityDerivation} from the exact audit checkout`, 'source-manifest D1 identity derivation');
  exactValue(compatibilityGate.morphologyUsageIdentity, expectedCurrentMain.morphologyUsageIdentity, 'source-manifest morphology usage identity');
  exactValue(compatibilityGate.runtimeContentInventory, expectedCurrentMain.runtimeContentInventory, 'source-manifest runtime content inventory');
  exactValue(compatibilityGate.stepBibleSourceCommit, expectedCurrentMain.stepBibleCommit, 'source-manifest STEPBible source commit');
  for (const expected of expectedSources) {
    const source = sourceManifest.sources.find(candidate => record(candidate, 'source-manifest source').id === expected.id);
    if (!source) fail(`source-manifest omits ${expected.id}`);
    assertAuditSelectedFiles(record(source, `source-manifest ${expected.id}`), expected);
  }

  const inspection = audit.get('inspection.json')!;
  exactKeys(inspection, [
    'integrity', 'projection', 'releaseDecision', 'runtimeAlignment', 'schemaVersion', 'scope', 'sourceSchema',
    'strictRightsAllowlist', 'userFacingRoleDiagnosticHygiene', 'workerdD1',
  ], 'inspection');
  const sourceSchema = record(inspection.sourceSchema, 'inspection sourceSchema');
  exactKeys(sourceSchema, ['greek', 'hebrew', 'parser'], 'inspection sourceSchema');
  for (const expected of expectedSources) assertAuditSchema(record(sourceSchema[expected.corpus], `inspection ${expected.corpus}`), expected);
  const integrity = record(inspection.integrity, 'inspection integrity');
  const decision = record(inspection.releaseDecision, 'inspection release decision');
  if (integrity.releaseEligible !== false || integrity.releaseGateDanglingParticipantReferences !== 9
    || decision.eligibleForPublication !== false) fail('audit must remain publication-ineligible');

  verifyMaculaAuditRunSummary(parseJson(readFileSync(join(finalDirectory, 'run-summary.json')), 'run-summary.json'));
}

/** Accept only no arguments or one exact local audit-directory option. */
export function parseMaculaSourceContractCliArgs(argumentsAfterScript: readonly string[]): string | undefined {
  if (argumentsAfterScript.length === 0) return undefined;
  if (argumentsAfterScript.length === 2
    && argumentsAfterScript[0] === '--audit-dir'
    && argumentsAfterScript[1]
    && !argumentsAfterScript[1].startsWith('-')) {
    return resolve(argumentsAfterScript[1]);
  }
  fail('usage: tsx scripts/macula-source-contract.ts [--audit-dir /absolute/or/resolved/path/to/final-replay-2]');
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const auditDirectory = parseMaculaSourceContractCliArgs(process.argv.slice(2));
  readMaculaSourceContract(ROOT);
  verifyHistoricalCurrentMainAttestation(ROOT);
  if (auditDirectory) verifyAuthoritativeMaculaAudit(auditDirectory, ROOT);
  console.error('[macula-source-contract] Verified local-only pins, field policy, inertness, and historical current-main attestation.');
}
