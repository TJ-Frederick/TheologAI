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
  },
] as const;

const expectedFieldPolicy = {
  retainedWordAttributes: ['xml:id', 'ref', 'class', 'role', 'lang'],
  retainedGroupAttributes: ['class', 'role', 'rule', 'Rule', 'head'],
  retainedParticipantAttributes: ['subjref', 'referent', 'participantref'],
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
  exactKeys(rights, ['maculaGreek', 'maculaHebrew', 'faithlifeSblgntStandaloneNotice', 'legalReviewGate'], 'rights and provenance');
  for (const key of ['maculaGreek', 'maculaHebrew'] as const) {
    const source = record(rights[key], `rights and provenance.${key}`);
    exactKeys(source, ['license', 'requiredAttribution', 'selectedInputProvenance', 'modificationNoticeRequirements'], `rights and provenance.${key}`);
    stringArray(source.modificationNoticeRequirements, `rights and provenance.${key}.modificationNoticeRequirements`);
  }
  const faithlife = record(rights.faithlifeSblgntStandaloneNotice, 'Faithlife SBLGNT notice');
  exactKeys(faithlife, ['role', 'repository', 'commit', 'tree', 'noticePaths', 'prohibition'], 'Faithlife SBLGNT notice');
  stringArray(faithlife.noticePaths, 'Faithlife SBLGNT notice paths');
  if (faithlife.role !== 'notice_only_not_materializer_input') fail('Faithlife SBLGNT must remain notice-only');

  const inertness = record(root.inertness, 'inertness');
  exactKeys(inertness, ['contractDoesNotActivate', 'verifierBoundary'], 'inertness');
  stringArray(inertness.contractDoesNotActivate, 'inertness.contractDoesNotActivate');
  return root as unknown as MaculaSourceContract;
}

export function readMaculaSourceContract(root: string): MaculaSourceContract {
  return parseMaculaSourceContract(parseJson(readFileSync(join(root, MACULA_SOURCE_CONTRACT_PATH)), MACULA_SOURCE_CONTRACT_PATH));
}

/** Reject both known non-retained fields and novel schema fields before materialization. */
export function assertMaculaSourceAttribute(scope: MaculaSourceAttributeScope, attribute: string): void {
  const allowed = scope === 'word'
    ? expectedFieldPolicy.retainedWordAttributes
    : scope === 'group'
      ? expectedFieldPolicy.retainedGroupAttributes
      : expectedFieldPolicy.retainedParticipantAttributes;
  const rejected = scope === 'word'
    ? expectedFieldPolicy.knownRejectedWordAttributes
    : scope === 'group'
      ? expectedFieldPolicy.knownRejectedGroupAttributes
      : [];
  if (allowed.includes(attribute as never)) return;
  if (rejected.includes(attribute as never)) fail(`${scope} attribute ${attribute} is explicitly excluded`);
  fail(`${scope} attribute ${attribute} is unknown schema drift and requires review`);
}

/** Verify the pinned origin/main object locally without fetching or changing a checkout. */
export function verifyCurrentMainAttestation(root: string): void {
  const revision = (args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  if (revision(['rev-parse', 'origin/main']) !== expectedCurrentMain.commit) fail('origin/main commit differs from audited current main');
  if (revision(['rev-parse', `${expectedCurrentMain.commit}^{tree}`]) !== expectedCurrentMain.tree) {
    fail('audited current-main tree differs from source lock');
  }
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
  const knownWord = new Set<string>([
    ...expectedFieldPolicy.retainedWordAttributes,
    ...expectedFieldPolicy.retainedParticipantAttributes,
    ...expectedFieldPolicy.knownRejectedWordAttributes,
  ]);
  const knownGroup = new Set<string>([
    ...expectedFieldPolicy.retainedGroupAttributes,
    ...expectedFieldPolicy.knownRejectedGroupAttributes,
  ]);
  const unknownWord = auditAttributeKeys(schema, 'wordAttributesObserved', `audit ${expected.id} word attributes`).filter(attribute => !knownWord.has(attribute));
  const unknownGroup = auditAttributeKeys(schema, 'groupAttributesObserved', `audit ${expected.id} group attributes`).filter(attribute => !knownGroup.has(attribute));
  const unknownParticipant = auditAttributeKeys(schema, 'participantAttributesObserved', `audit ${expected.id} participant attributes`)
    .filter(attribute => !expectedFieldPolicy.retainedParticipantAttributes.includes(attribute as never));
  if (unknownWord.length || unknownGroup.length || unknownParticipant.length) {
    fail(`audit ${expected.id} source schema contains unknown attributes`);
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
  const status = readFileSync(join(auditOutput, 'EVIDENCE-STATUS.md'), 'utf8');
  for (const phrase of [
    'The only authoritative Gate-0 candidate in this directory is:',
    '`final-replay-2/`',
    MACULA_AUDIT_IDENTITY,
    'not publication-eligible: nine Hebrew participant relationships remain dangling',
  ]) if (!status.includes(phrase)) fail(`EVIDENCE-STATUS.md does not establish ${phrase}`);

  const contract = readMaculaSourceContract(contractRoot);
  const compact = record(contract.auditEvidence, 'audit evidence').compactArtifacts as readonly RecordValue[];
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

  const summary = record(parseJson(readFileSync(join(finalDirectory, 'run-summary.json')), 'run-summary.json'), 'run summary');
  exactKeys(summary, [
    'attestations', 'auditRoot', 'benchmark', 'canonicalRuntimeCompatibility', 'command', 'deterministicHashDomain',
    'environment', 'executedAt', 'faithlifeSblgntNotice', 'integrity', 'inventoryAssertions', 'replayComparison',
    'replayScript', 'schemaVersion', 'workerdD1',
  ], 'run summary');
  const attestations = record(summary.attestations, 'run summary attestations');
  for (const [key, expected] of [
    ['maculaGreek', expectedSources[0]], ['maculaHebrew', expectedSources[1]],
  ] as const) {
    const attestation = record(attestations[key], `run summary ${key}`);
    if (attestation.head !== expected.revision.commit || attestation.tree !== expected.revision.tree
      || attestation.clean !== true || attestation.everySelectedPathTracked !== true
      || attestation.selectedPathCount !== expected.selection.selectedPathCount) fail(`run summary ${key} attestation drifted`);
  }
  for (const key of ['theologaiMain', 'theologaiPreflight'] as const) {
    const attestation = record(attestations[key], `run summary ${key}`);
    if (attestation.head !== expectedCurrentMain.commit || attestation.tree !== expectedCurrentMain.tree
      || attestation.originMain !== expectedCurrentMain.commit || attestation.clean !== true) {
      fail(`run summary ${key} current-main attestation drifted`);
    }
  }
  const hashDomain = record(summary.deterministicHashDomain, 'run summary deterministic hash domain');
  if (hashDomain.sha256 !== MACULA_AUDIT_IDENTITY) fail('run summary deterministic identity drifted');
  const compatibility = record(summary.canonicalRuntimeCompatibility, 'run summary compatibility');
  exactValue(compatibility.d1CorpusIdentity, expectedCurrentMain.d1CorpusIdentity, 'D1 corpus identity');
  exactValue(compatibility.morphologyUsageIdentity, expectedCurrentMain.morphologyUsageIdentity, 'morphology usage identity');
  exactValue(compatibility.runtimeContentInventory, expectedCurrentMain.runtimeContentInventory, 'runtime content inventory');
  const faithlife = record(summary.faithlifeSblgntNotice, 'run summary Faithlife notice');
  if (faithlife.status !== 'notice_only_excluded_from_alignment_projection_and_deterministic_identity') {
    fail('standalone Faithlife checkout must remain notice-only');
  }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argumentsAfterScript = process.argv.slice(2);
  const auditIndex = argumentsAfterScript.indexOf('--audit-dir');
  if (auditIndex >= 0 && (auditIndex !== 0 || argumentsAfterScript.length !== 2 || !argumentsAfterScript[1])) {
    fail('usage: tsx scripts/macula-source-contract.ts [--audit-dir /absolute/path/to/final-replay-2]');
  }
  readMaculaSourceContract(ROOT);
  verifyCurrentMainAttestation(ROOT);
  if (auditIndex >= 0) verifyAuthoritativeMaculaAudit(argumentsAfterScript[1]!, ROOT);
  console.error('[macula-source-contract] Verified local-only pins, field policy, inertness, and current-main attestation.');
}
