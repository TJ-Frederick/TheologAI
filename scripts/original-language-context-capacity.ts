#!/usr/bin/env tsx

/**
 * Source-free, synthetic-only capacity evidence for a compact per-reference
 * original-language context bundle. This file cannot acquire a corpus and
 * cannot address a remote database.
 */

import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFreshReleaseCorpusCapacityDatabase,
  D1_CORPUS_CAPACITY_LIMIT_BYTES,
  D1_CORPUS_CAPACITY_WARNING_BYTES,
  measurePostVacuumDiagnostic,
  measurePreVacuumDatabase,
  type DatabaseCapacityMeasurement,
} from './release-corpus-capacity.js';
import { computeD1CorpusIdentity, parseDataManifest } from './d1-corpus-identity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_NODE = '22.23.1';
const SCHEMA_VERSION = 'synthetic-original-language-context-capacity.v1';
const MAX_MODELED_MORPHEMES = 6;
const BASE_PROFILE_MAX_MORPHEMES = 2;
const SENSITIVITY_PROFILE_MAX_MORPHEMES = 4;

export const SYNTHETIC_PROFILE = Object.freeze({
  greekReferences: 7_957,
  hebrewReferences: 22_876,
  aramaicReferences: 269,
  greekSourcePositionsPerReference: 17,
  semiticSourcePositionsPerReference: 18,
  greekManyToOneEvery: 11,
  semiticOneToManyEvery: 5,
  relationCodeCount: 8,
});

type SourceLanguage = 'grc' | 'hbo' | 'arc';
type CrosswalkKind = 'identity' | 'psalm_superscription' | 'psalm_verse_shift';

export type SyntheticAlignmentBundle =
  | { v: 1; g: number[][] }
  | { v: 1; s: number[][] };

export interface SyntheticReferenceModel {
  canonicalCandidates: string[];
  sourceReference: string | null;
  sourceLanguage: SourceLanguage;
  crosswalkKind: CrosswalkKind;
  bundle: SyntheticAlignmentBundle;
}

interface SyntheticCounts {
  references: number;
  greekReferences: number;
  hebrewReferences: number;
  aramaicReferences: number;
  contextUnits: number;
  sourcePositions: number;
  greekManyToOneUnits: number;
  semiticOneToManySourcePositions: number;
  psalmSuperscriptions: number;
  psalmVerseShifts: number;
}

interface Candidate {
  name:
    | 'current_baseline'
    | 'existing_d1_integrated'
    | 'separate_d1_sidecar'
    | 'high_multiplicity_sidecar_sensitivity';
  databaseRole: string;
  buildBasis: string;
  preVacuum: DatabaseCapacityMeasurement;
  postVacuumDiagnostic: DatabaseCapacityMeasurement;
  capacity: ReturnType<typeof assessCapacity>;
  synthetic?: {
    schemaVersion: typeof SCHEMA_VERSION;
    maximumModeledMorphemes: number;
    counts: SyntheticCounts;
    orderedProjectionSha256: string;
    storedProjectionSha256: string;
    expectedBaseCorpusIdentity: string;
    payloadBytes: number;
    elapsedMs: number;
    retrieval: ReturnType<typeof verifyStoredSyntheticCorpus>;
  };
}

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'word',
  'wordText',
  'surface',
  'lemma',
  'morph',
  'morphology',
  'strongs',
  'strongsNumber',
  'gloss',
  'frame',
  'frames',
  'domain',
  'domains',
]);

function fail(message: string): never {
  throw new Error(`[original-language-context-capacity] ${message}`);
}

export function canonicalOriginalLanguageEvidence(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const canonical = canonicalOriginalLanguageEvidence;

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stripOriginalLanguageVolatileMeasurements(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutVolatileMeasurements);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'elapsedMs' && !key.endsWith('ElapsedMs'))
        .map(([key, item]) => [key, withoutVolatileMeasurements(item)]),
    );
  }
  return value;
}

const withoutVolatileMeasurements = stripOriginalLanguageVolatileMeasurements;

export const ORIGINAL_LANGUAGE_DETERMINISTIC_HASH_DOMAIN =
  'sha256(canonical-json(recursively-remove keys equal elapsedMs or ending ElapsedMs)).v1';
export const ORIGINAL_LANGUAGE_COMPLETE_HASH_DOMAIN =
  'sha256(canonical-json(envelope excluding only completeArtifactSha256)).v1';

export function attachOriginalLanguageEvidenceHashes<T extends Record<string, unknown>>(payload: T) {
  const deterministicEvidenceSha256 = sha256(canonical(stripOriginalLanguageVolatileMeasurements(payload)));
  const withoutCompleteHash = {
    ...payload,
    deterministicEvidenceHashDomain: ORIGINAL_LANGUAGE_DETERMINISTIC_HASH_DOMAIN,
    deterministicEvidenceSha256,
    completeArtifactHashDomain: ORIGINAL_LANGUAGE_COMPLETE_HASH_DOMAIN,
  };
  return {
    ...withoutCompleteHash,
    completeArtifactSha256: sha256(canonical(withoutCompleteHash)),
  };
}

export function verifyOriginalLanguageCompleteHash(envelope: Record<string, unknown>): boolean {
  if (envelope.completeArtifactHashDomain !== ORIGINAL_LANGUAGE_COMPLETE_HASH_DOMAIN
    || typeof envelope.completeArtifactSha256 !== 'string') return false;
  const withoutCompleteHash = { ...envelope };
  delete withoutCompleteHash.completeArtifactSha256;
  return sha256(canonical(withoutCompleteHash)) === envelope.completeArtifactSha256;
}

export function withOriginalLanguageTemporaryDirectory<T>(
  action: (directory: string) => T,
  parent = tmpdir(),
): T {
  const directory = mkdtempSync(join(parent, 'theologai-original-language-context-'));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function sqliteVersion(): string {
  const database = new Database(':memory:');
  try {
    return (database.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version;
  } finally {
    database.close();
  }
}

function assertInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function assertNoForbiddenPayloadKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenPayloadKeys(item);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) fail(`payload key ${key} is outside the experiment scope`);
    assertNoForbiddenPayloadKeys(item);
  }
}

/**
 * Fail-closed validator for the modeled alignment subset.
 *
 * Greek permits one or two source positions per context unit (1:1 and
 * many:1), but never maps one source position to multiple units. Hebrew and
 * Aramaic permit one or two ordered morphemes per source position (1:many).
 */
export function validateSyntheticReference(model: SyntheticReferenceModel): {
  canonicalReference: string;
  sourcePositions: number;
  contextUnits: number;
  manyToOneUnits: number;
  oneToManySourcePositions: number;
} {
  if (model.canonicalCandidates.length !== 1 || !model.canonicalCandidates[0]) {
    fail('reference crosswalk must resolve to exactly one canonical candidate');
  }
  if (!['grc', 'hbo', 'arc'].includes(model.sourceLanguage)) fail('unsupported source language');
  if (model.crosswalkKind === 'identity' && model.sourceReference !== null) {
    fail('identity crosswalk must not duplicate the canonical reference');
  }
  if (model.crosswalkKind !== 'identity'
    && (typeof model.sourceReference !== 'string' || model.sourceReference.length === 0)) {
    fail('exceptional crosswalk requires one explicit source reference');
  }
  assertNoForbiddenPayloadKeys(model.bundle);
  if (model.bundle.v !== 1) fail('unsupported synthetic bundle version');

  if (model.sourceLanguage === 'grc') {
    if (!('g' in model.bundle) || Object.keys(model.bundle).sort().join(',') !== 'g,v') {
      fail('Greek bundle must contain only v and g');
    }
    const observedSources = new Set<number>();
    let manyToOneUnits = 0;
    for (const [offset, unit] of model.bundle.g.entries()) {
      if (!Array.isArray(unit) || unit.length < 4 || unit.length > 5) {
        fail('Greek unit must encode context, head, relation, and one or two source positions');
      }
      assertInteger(unit[0], offset + 1, offset + 1, 'Greek context position');
      assertInteger(unit[1], 0, model.bundle.g.length, 'Greek head position');
      assertInteger(unit[2], 0, SYNTHETIC_PROFILE.relationCodeCount - 1, 'Greek relation code');
      const sources = unit.slice(3);
      if (sources.length === 2) manyToOneUnits++;
      for (const source of sources) {
        const position = assertInteger(source, 1, 10_000, 'Greek source position');
        if (observedSources.has(position)) fail('ambiguous Greek source position maps to multiple units');
        observedSources.add(position);
      }
    }
    if (observedSources.size === 0) fail('Greek bundle must not be empty');
    return {
      canonicalReference: model.canonicalCandidates[0],
      sourcePositions: observedSources.size,
      contextUnits: model.bundle.g.length,
      manyToOneUnits,
      oneToManySourcePositions: 0,
    };
  }

  if (!('s' in model.bundle) || Object.keys(model.bundle).sort().join(',') !== 's,v') {
    fail('Hebrew/Aramaic bundle must contain only v and s');
  }
  const morphemes = new Map<number, number[]>();
  for (const [offset, unit] of model.bundle.s.entries()) {
    if (!Array.isArray(unit) || unit.length !== 5) {
      fail('Semitic unit must encode context, source, morpheme, head, and relation');
    }
    assertInteger(unit[0], offset + 1, offset + 1, 'Semitic context position');
    const source = assertInteger(unit[1], 1, 10_000, 'Semitic source position');
    const morpheme = assertInteger(unit[2], 1, MAX_MODELED_MORPHEMES, 'Semitic morpheme position');
    assertInteger(unit[3], 0, model.bundle.s.length, 'Semitic head position');
    assertInteger(unit[4], 0, SYNTHETIC_PROFILE.relationCodeCount - 1, 'Semitic relation code');
    morphemes.set(source, [...(morphemes.get(source) ?? []), morpheme]);
  }
  if (morphemes.size === 0) fail('Hebrew/Aramaic bundle must not be empty');
  let oneToManySourcePositions = 0;
  for (const values of morphemes.values()) {
    const ordered = [...values].sort((a, b) => a - b);
    if (ordered.some((value, index) => value !== index + 1)) {
      fail('ambiguous Semitic morphemes must be unique and contiguous per source position');
    }
    if (ordered.length > 1) oneToManySourcePositions++;
  }
  return {
    canonicalReference: model.canonicalCandidates[0],
    sourcePositions: morphemes.size,
    contextUnits: model.bundle.s.length,
    manyToOneUnits: 0,
    oneToManySourcePositions,
  };
}

function greekBundle(): SyntheticAlignmentBundle {
  const units: number[][] = [];
  let source = 1;
  let context = 1;
  while (source <= SYNTHETIC_PROFILE.greekSourcePositionsPerReference) {
    const take = source % SYNTHETIC_PROFILE.greekManyToOneEvery === 0
      && source < SYNTHETIC_PROFILE.greekSourcePositionsPerReference ? 2 : 1;
    units.push([
      context,
      context === 1 ? 0 : context - 1,
      context % SYNTHETIC_PROFILE.relationCodeCount,
      ...Array.from({ length: take }, (_, index) => source + index),
    ]);
    source += take;
    context++;
  }
  return { v: 1, g: units };
}

function semiticBundle(maxMorphemes = BASE_PROFILE_MAX_MORPHEMES): SyntheticAlignmentBundle {
  assertInteger(maxMorphemes, 1, MAX_MODELED_MORPHEMES, 'modeled Semitic morpheme ceiling');
  const units: number[][] = [];
  let context = 1;
  for (let source = 1; source <= SYNTHETIC_PROFILE.semiticSourcePositionsPerReference; source++) {
    const morphemeCount = source % SYNTHETIC_PROFILE.semiticOneToManyEvery === 0
      ? maxMorphemes
      : 1;
    for (let morpheme = 1; morpheme <= morphemeCount; morpheme++) {
      units.push([
        context,
        source,
        morpheme,
        context === 1 ? 0 : context - 1,
        context % SYNTHETIC_PROFILE.relationCodeCount,
      ]);
      context++;
    }
  }
  return { v: 1, s: units };
}

function syntheticReference(
  language: SourceLanguage,
  ordinal: number,
  maxMorphemes = BASE_PROFILE_MAX_MORPHEMES,
): SyntheticReferenceModel {
  if (language === 'hbo' && ordinal === 1) {
    return {
      canonicalCandidates: ['PSA.3.0'],
      sourceReference: 'MT.PSA.3.1',
      sourceLanguage: language,
      crosswalkKind: 'psalm_superscription',
      bundle: semiticBundle(maxMorphemes),
    };
  }
  if (language === 'hbo' && ordinal === 2) {
    return {
      canonicalCandidates: ['PSA.3.1'],
      sourceReference: 'MT.PSA.3.2',
      sourceLanguage: language,
      crosswalkKind: 'psalm_verse_shift',
      bundle: semiticBundle(maxMorphemes),
    };
  }
  const prefix = language.toUpperCase();
  return {
    canonicalCandidates: [`SYN.${prefix}.${String(ordinal).padStart(5, '0')}`],
    sourceReference: null,
    sourceLanguage: language,
    crosswalkKind: 'identity',
    bundle: language === 'grc' ? greekBundle() : semiticBundle(maxMorphemes),
  };
}

function* allSyntheticReferences(
  maxMorphemes = BASE_PROFILE_MAX_MORPHEMES,
): Generator<SyntheticReferenceModel> {
  for (let ordinal = 1; ordinal <= SYNTHETIC_PROFILE.greekReferences; ordinal++) {
    yield syntheticReference('grc', ordinal);
  }
  for (let ordinal = 1; ordinal <= SYNTHETIC_PROFILE.hebrewReferences; ordinal++) {
    yield syntheticReference('hbo', ordinal, maxMorphemes);
  }
  for (let ordinal = 1; ordinal <= SYNTHETIC_PROFILE.aramaicReferences; ordinal++) {
    yield syntheticReference('arc', ordinal, maxMorphemes);
  }
}

const SYNTHETIC_SCHEMA = `
  CREATE TABLE synthetic_original_language_context_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE synthetic_original_language_context_bundles (
    id INTEGER PRIMARY KEY,
    canonical_reference TEXT NOT NULL UNIQUE,
    source_reference TEXT UNIQUE,
    source_language TEXT NOT NULL CHECK(source_language IN ('grc','hbo','arc')),
    crosswalk_kind TEXT NOT NULL CHECK(crosswalk_kind IN ('identity','psalm_superscription','psalm_verse_shift')),
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object')
  );
`;

function emptyCounts(): SyntheticCounts {
  return {
    references: 0,
    greekReferences: 0,
    hebrewReferences: 0,
    aramaicReferences: 0,
    contextUnits: 0,
    sourcePositions: 0,
    greekManyToOneUnits: 0,
    semiticOneToManySourcePositions: 0,
    psalmSuperscriptions: 0,
    psalmVerseShifts: 0,
  };
}

export function storedOriginalLanguageProjectionSha256(database: Database.Database): string {
  const hashes: string[] = [];
  const rows = database.prepare(`SELECT canonical_reference AS canonicalReference,
    source_reference AS sourceReference,source_language AS sourceLanguage,
    crosswalk_kind AS crosswalkKind,payload_json AS payload
    FROM synthetic_original_language_context_bundles ORDER BY canonical_reference`).iterate() as Iterable<{
      canonicalReference: string;
      sourceReference: string | null;
      sourceLanguage: string;
      crosswalkKind: string;
      payload: string;
    }>;
  for (const row of rows) {
    hashes.push(sha256(canonical([
      row.canonicalReference,
      row.sourceReference,
      row.sourceLanguage,
      row.crosswalkKind,
      row.payload,
    ])));
  }
  return sha256(hashes.join('\n'));
}

export function assertOriginalLanguageProjectionParity(
  generatedSha256: string,
  stored: ReadonlyArray<{ label: string; sha256: string }>,
): void {
  if (!/^[a-f0-9]{64}$/.test(generatedSha256)
    || stored.length < 1
    || stored.some(item => item.sha256 !== generatedSha256)) {
    fail(`generated/stored projection mismatch: ${stored.map(item => item.label).join(',')}`);
  }
}

function materializeSyntheticCorpus(
  database: Database.Database,
  expectedBaseCorpusIdentity: string,
  maxMorphemes = BASE_PROFILE_MAX_MORPHEMES,
) {
  const started = performance.now();
  database.exec(SYNTHETIC_SCHEMA);
  const insert = database.prepare(`INSERT INTO synthetic_original_language_context_bundles
    (canonical_reference,source_reference,source_language,crosswalk_kind,payload_json)
    VALUES (?,?,?,?,?)`);
  const counts = emptyCounts();
  const projectionHashes: string[] = [];
  let payloadBytes = 0;
  const models = [...allSyntheticReferences(maxMorphemes)]
    .sort((left, right) => left.canonicalCandidates[0]!.localeCompare(right.canonicalCandidates[0]!));
  database.transaction(() => {
    for (const model of models) {
      const validated = validateSyntheticReference(model);
      const payload = canonical(model.bundle);
      insert.run(
        validated.canonicalReference,
        model.sourceReference,
        model.sourceLanguage,
        model.crosswalkKind,
        payload,
      );
      counts.references++;
      counts.contextUnits += validated.contextUnits;
      counts.sourcePositions += validated.sourcePositions;
      counts.greekManyToOneUnits += validated.manyToOneUnits;
      counts.semiticOneToManySourcePositions += validated.oneToManySourcePositions;
      counts.greekReferences += Number(model.sourceLanguage === 'grc');
      counts.hebrewReferences += Number(model.sourceLanguage === 'hbo');
      counts.aramaicReferences += Number(model.sourceLanguage === 'arc');
      counts.psalmSuperscriptions += Number(model.crosswalkKind === 'psalm_superscription');
      counts.psalmVerseShifts += Number(model.crosswalkKind === 'psalm_verse_shift');
      payloadBytes += Buffer.byteLength(payload);
      projectionHashes.push(sha256(canonical([
        validated.canonicalReference,
        model.sourceReference,
        model.sourceLanguage,
        model.crosswalkKind,
        payload,
      ])));
    }
  })();
  const orderedProjectionSha256 = sha256(projectionHashes.join('\n'));
  const metadata = database.prepare(
    'INSERT INTO synthetic_original_language_context_metadata(key,value) VALUES (?,?)',
  );
  metadata.run('schema_version', SCHEMA_VERSION);
  metadata.run('expected_base_corpus_identity', expectedBaseCorpusIdentity);
  metadata.run('context_projection_sha256', orderedProjectionSha256);
  metadata.run('maximum_modeled_morphemes', String(maxMorphemes));
  database.exec('ANALYZE');
  const storedProjectionSha256 = storedOriginalLanguageProjectionSha256(database);
  assertOriginalLanguageProjectionParity(orderedProjectionSha256, [
    { label: 'fresh-materialization', sha256: storedProjectionSha256 },
  ]);
  return {
    schemaVersion: SCHEMA_VERSION,
    maximumModeledMorphemes: maxMorphemes,
    counts,
    orderedProjectionSha256,
    storedProjectionSha256,
    expectedBaseCorpusIdentity,
    payloadBytes,
    elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
  } as const;
}

function verifyStoredSyntheticCorpus(database: Database.Database, expected: ReturnType<typeof materializeSyntheticCorpus>) {
  const metadata = Object.fromEntries(
    (database.prepare(
      'SELECT key,value FROM synthetic_original_language_context_metadata ORDER BY key',
    ).all() as Array<{ key: string; value: string }>).map(row => [row.key, row.value]),
  );
  if (metadata.schema_version !== SCHEMA_VERSION
    || metadata.expected_base_corpus_identity !== expected.expectedBaseCorpusIdentity
    || metadata.context_projection_sha256 !== expected.orderedProjectionSha256
    || metadata.maximum_modeled_morphemes !== String(expected.maximumModeledMorphemes)) {
    fail('stored synthetic metadata/corpus identity drifted');
  }
  const storedProjectionSha256 = storedOriginalLanguageProjectionSha256(database);
  assertOriginalLanguageProjectionParity(expected.orderedProjectionSha256, [
    { label: 'stored-verification', sha256: storedProjectionSha256 },
  ]);
  const counts = database.prepare(`SELECT
    COUNT(*) AS total,
    SUM(source_language='grc') AS greek,
    SUM(source_language='hbo') AS hebrew,
    SUM(source_language='arc') AS aramaic,
    SUM(crosswalk_kind='psalm_superscription') AS superscriptions,
    SUM(crosswalk_kind='psalm_verse_shift') AS verseShifts
    FROM synthetic_original_language_context_bundles`).get() as Record<string, number>;
  if (counts.total !== expected.counts.references
    || counts.greek !== expected.counts.greekReferences
    || counts.hebrew !== expected.counts.hebrewReferences
    || counts.aramaic !== expected.counts.aramaicReferences
    || counts.superscriptions !== 1
    || counts.verseShifts !== 1) fail('stored synthetic language/crosswalk inventory drifted');

  const boundaries = database.prepare(`SELECT canonical_reference AS canonicalReference,
    source_reference AS sourceReference,source_language AS sourceLanguage,
    crosswalk_kind AS crosswalkKind,payload_json AS payload
    FROM synthetic_original_language_context_bundles
    WHERE canonical_reference IN ('PSA.3.0','PSA.3.1','SYN.GRC.00001','SYN.ARC.00269')
    ORDER BY canonical_reference`).all() as Array<Record<string, string | null>>;
  if (boundaries.length !== 4) fail('stored synthetic boundary retrieval drifted');
  for (const row of boundaries) {
    const language = row.sourceLanguage as SourceLanguage;
    validateSyntheticReference({
      canonicalCandidates: [row.canonicalReference!],
      sourceReference: row.sourceReference,
      sourceLanguage: language,
      crosswalkKind: row.crosswalkKind as CrosswalkKind,
      bundle: JSON.parse(row.payload!) as SyntheticAlignmentBundle,
    });
  }
  const psalm = boundaries.filter(row => row.canonicalReference?.startsWith('PSA.'));
  if (psalm[0]?.canonicalReference !== 'PSA.3.0' || psalm[0]?.sourceReference !== 'MT.PSA.3.1'
    || psalm[1]?.canonicalReference !== 'PSA.3.1' || psalm[1]?.sourceReference !== 'MT.PSA.3.2') {
    fail('Psalm superscription/verse-shift crosswalk drifted');
  }
  if (!boundaries.some(row => row.sourceLanguage === 'arc')) fail('explicit Aramaic retrieval case missing');
  return {
    rowCounts: counts,
    metadata,
    storedProjectionSha256,
    boundaryProjectionSha256: sha256(canonical(boundaries)),
    psalmCrosswalkVerified: true,
    aramaicCaseVerified: true,
    ambiguousAlignmentAccepted: false,
  };
}

export function assessOriginalLanguageCapacity(fileBytes: number) {
  if (!Number.isSafeInteger(fileBytes) || fileBytes < 0) fail('capacity bytes must be non-negative integer');
  const withinLimit = fileBytes <= D1_CORPUS_CAPACITY_LIMIT_BYTES;
  const warning = fileBytes >= D1_CORPUS_CAPACITY_WARNING_BYTES;
  return {
    policyOwner: 'TheologAI internal release engineering',
    basis: 'fresh_direct_pre_vacuum_after_analyze',
    limitBytes: D1_CORPUS_CAPACITY_LIMIT_BYTES,
    warningThresholdBytes: D1_CORPUS_CAPACITY_WARNING_BYTES,
    cloudflareLimitClaim: 'none_internal_project_gate_only',
    fileBytes,
    headroomBytes: D1_CORPUS_CAPACITY_LIMIT_BYTES - fileBytes,
    withinLimit,
    warning,
    status: !withinLimit ? 'exceeds_internal_gate' : warning ? 'within_gate_warning' : 'within_gate',
  } as const;
}

const assessCapacity = assessOriginalLanguageCapacity;

export function originalLanguageSlotAccounting(environmentCount: number) {
  if (!Number.isSafeInteger(environmentCount) || environmentCount < 1) {
    fail('environment count must be a positive integer');
  }
  return {
    existingD1AdditionalSlots: 0,
    separateD1AdditionalSlots: environmentCount,
    environments: environmentCount,
  };
}

export function assertOriginalLanguageCorpusCompatibility(
  primaryCorpusIdentity: string,
  contextExpectedBaseCorpusIdentity: string,
  contextSchemaVersion: string,
): void {
  if (!/^[a-f0-9]{64}$/.test(primaryCorpusIdentity)
    || !/^[a-f0-9]{64}$/.test(contextExpectedBaseCorpusIdentity)) {
    fail('corpus identities must be lowercase SHA-256 values');
  }
  if (primaryCorpusIdentity !== contextExpectedBaseCorpusIdentity) {
    fail('context bundle expects a different base corpus identity');
  }
  if (contextSchemaVersion !== SCHEMA_VERSION) fail('context bundle schema version is unsupported');
}

export function resolveOriginalLanguageContextBinding(
  primaryCorpusIdentity: string,
  context:
    | { expectedBaseCorpusIdentity: string; schemaVersion: string }
    | undefined,
) {
  if (!context) {
    return {
      status: 'context_unavailable',
      reason: 'binding_missing_or_unavailable',
      baseMorphologyMayContinue: true,
      contextReturned: false,
    } as const;
  }
  try {
    assertOriginalLanguageCorpusCompatibility(
      primaryCorpusIdentity,
      context.expectedBaseCorpusIdentity,
      context.schemaVersion,
    );
    return {
      status: 'context_available',
      reason: null,
      baseMorphologyMayContinue: true,
      contextReturned: true,
    } as const;
  } catch {
    return {
      status: 'context_unavailable',
      reason: 'identity_or_version_mismatch',
      baseMorphologyMayContinue: true,
      contextReturned: false,
    } as const;
  }
}

function freshBaseline(root: string, path: string): void {
  buildFreshReleaseCorpusCapacityDatabase({ root, outputPath: path });
}

function measureCandidate(
  name: Candidate['name'],
  role: string,
  buildBasis: string,
  path: string,
  synthetic?: ReturnType<typeof materializeSyntheticCorpus>,
): Candidate {
  const preVacuum = measurePreVacuumDatabase(path);
  const vacuumPath = `${path}.vacuum.sqlite`;
  copyFileSync(path, vacuumPath);
  const postVacuumDiagnostic = measurePostVacuumDiagnostic(vacuumPath);
  const retrieval = synthetic
    ? (() => {
        const database = new Database(path, { readonly: true, fileMustExist: true });
        try {
          return verifyStoredSyntheticCorpus(database, synthetic);
        } finally {
          database.close();
        }
      })()
    : undefined;
  return {
    name,
    databaseRole: role,
    buildBasis,
    preVacuum,
    postVacuumDiagnostic,
    capacity: assessCapacity(preVacuum.fileBytes),
    ...(synthetic && retrieval ? { synthetic: { ...synthetic, retrieval } } : {}),
  };
}

type LocalD1Page = {
  success?: boolean;
  results?: Array<Record<string, unknown>>;
  meta?: { rows_read?: number; rows_written?: number; [key: string]: unknown };
};

function parseLocalD1(output: string): LocalD1Page[] {
  const value = JSON.parse(output) as unknown;
  if (!Array.isArray(value) || value.some(page => !page || typeof page !== 'object')) {
    fail('local Workerd D1 output was not a result array');
  }
  const pages = value as LocalD1Page[];
  if (pages.some(page => page.success !== true)) fail('local Workerd D1 operation failed');
  return pages;
}

function sqlText(value: string | null): string {
  return value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`;
}

function buildWorkerdSeedFiles(databasePath: string, directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  const statements: string[] = [];
  try {
    const metadata = database.prepare(
      'SELECT key,value FROM synthetic_original_language_context_metadata ORDER BY key',
    ).all() as Array<{ key: string; value: string }>;
    statements.push(`INSERT INTO synthetic_original_language_context_metadata(key,value) VALUES ${
      metadata.map(row => `(${sqlText(row.key)},${sqlText(row.value)})`).join(',')
    };`);
    const rows = database.prepare(`SELECT canonical_reference AS canonicalReference,
      source_reference AS sourceReference,source_language AS sourceLanguage,
      crosswalk_kind AS crosswalkKind,payload_json AS payload
      FROM synthetic_original_language_context_bundles ORDER BY canonical_reference`).all() as Array<{
        canonicalReference: string;
        sourceReference: string | null;
        sourceLanguage: string;
        crosswalkKind: string;
        payload: string;
      }>;
    for (let offset = 0; offset < rows.length; offset += 100) {
      statements.push(`INSERT INTO synthetic_original_language_context_bundles
        (canonical_reference,source_reference,source_language,crosswalk_kind,payload_json) VALUES ${
          rows.slice(offset, offset + 100).map(row => `(${[
            sqlText(row.canonicalReference),
            sqlText(row.sourceReference),
            sqlText(row.sourceLanguage),
            sqlText(row.crosswalkKind),
            sqlText(row.payload),
          ].join(',')})`).join(',')
        };`);
    }
  } finally {
    database.close();
  }
  const files: Array<{ path: string; bytes: number; statements: number; sha256: string }> = [];
  let chunk: string[] = [];
  let bytes = 0;
  const flush = () => {
    if (chunk.length === 0) return;
    const path = join(directory, `seed-${String(files.length + 1).padStart(3, '0')}.sql`);
    const content = `${chunk.join('\n')}\n`;
    writeFileSync(path, content, { mode: 0o600 });
    files.push({
      path,
      bytes: Buffer.byteLength(content),
      statements: chunk.length,
      sha256: sha256(content),
    });
    chunk = [];
    bytes = 0;
  };
  for (const statement of statements) {
    const statementBytes = Buffer.byteLength(statement) + 1;
    if (statementBytes > 100_000) fail('synthetic Workerd seed statement exceeds 100,000 bytes');
    if (chunk.length > 0 && bytes + statementBytes > 8 * 1024 * 1024) flush();
    chunk.push(statement);
    bytes += statementBytes;
  }
  flush();
  return {
    files,
    aggregateSha256: sha256(canonical(files.map(file => ({
      path: file.path.split('/').at(-1),
      bytes: file.bytes,
      statements: file.statements,
      sha256: file.sha256,
    })))),
  };
}

function workerdSidecarProof(root: string, temp: string, databasePath: string, expectedCorpusIdentity: string) {
  const directory = join(temp, 'workerd-sidecar');
  const state = join(directory, 'state');
  const seedDirectory = join(directory, 'seed');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const worker = join(directory, 'worker.mjs');
  const config = join(directory, 'wrangler.toml');
  const schema = join(directory, 'schema.sql');
  writeFileSync(worker, 'export default { fetch() { return new Response("local only"); } };', { mode: 0o600 });
  writeFileSync(config, `name = "synthetic-context-sidecar"
main = "${worker.replaceAll('\\', '\\\\')}"
compatibility_date = "2026-07-01"
[[d1_databases]]
binding = "CONTEXT_DB"
database_name = "synthetic-context-sidecar"
database_id = "00000000-0000-0000-0000-0000000000ac"
`, { mode: 0o600 });
  writeFileSync(schema, SYNTHETIC_SCHEMA, { mode: 0o600 });
  const seed = buildWorkerdSeedFiles(databasePath, seedDirectory);
  const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/(CLOUDFLARE|CF_API|TOKEN|SECRET|PRIVATE_KEY)/i.test(key)
  ));
  const run = (args: string[], json = false) => {
    if (!args.includes('--local')) fail('Workerd command refused without --local');
    const started = performance.now();
    const output = execFileSync(process.execPath, [wrangler, ...args, ...(json ? ['--json'] : [])], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...safeEnv,
        WRANGLER_SEND_METRICS: 'false',
        WRANGLER_LOG_PATH: join(directory, 'wrangler.log'),
      },
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
      pages: json ? parseLocalD1(output) : [],
    };
  };
  const common = ['d1', 'execute', 'CONTEXT_DB', '--local', '--persist-to', state, '--config', config];
  const schemaResult = run([...common, '--file', schema]);
  const imports = seed.files.map(file => run([...common, '--file', file.path]));
  const query = (id: string, sql: string) => {
    const result = run([...common, '--command', sql], true);
    const rows = result.pages.flatMap(page => page.results ?? []);
    const reportedRowsRead = result.pages.map(page => page.meta?.rows_read);
    const rowsRead = reportedRowsRead.every(value => Number.isSafeInteger(value) && (value as number) >= 0)
      ? reportedRowsRead.reduce((sum, value) => sum + (value as number), 0)
      : null;
    return {
      id,
      elapsedMs: result.elapsedMs,
      rowsRead,
      rowsReadObservation:
        rowsRead === null ? 'not_reported_by_local_wrangler_d1_meta' : 'reported_by_local_wrangler_d1_meta',
      observedMetaKeys: [...new Set(result.pages.flatMap(page => Object.keys(page.meta ?? {})))].sort(),
      rowCount: rows.length,
      rowsSha256: sha256(canonical(rows)),
      rows,
    };
  };
  const identity = query(
    'shared-corpus-identity',
    `SELECT key,value FROM synthetic_original_language_context_metadata ORDER BY key;`,
  );
  const identityMap = Object.fromEntries(identity.rows.map(row => [row.key, row.value]));
  assertOriginalLanguageCorpusCompatibility(
    expectedCorpusIdentity,
    String(identityMap.expected_base_corpus_identity),
    String(identityMap.schema_version),
  );
  const lookups = [
    query('greek-point', "SELECT canonical_reference,source_language,length(payload_json) AS payload_bytes FROM synthetic_original_language_context_bundles WHERE canonical_reference='SYN.GRC.00001';"),
    query('psalm-source-crosswalk', "SELECT canonical_reference,source_reference,crosswalk_kind FROM synthetic_original_language_context_bundles WHERE source_reference='MT.PSA.3.1';"),
    query('aramaic-point', "SELECT canonical_reference,source_language,length(payload_json) AS payload_bytes FROM synthetic_original_language_context_bundles WHERE canonical_reference='SYN.ARC.00269';"),
  ];
  if (lookups.some(item => item.rowCount !== 1)) fail('Workerd representative point lookup drifted');
  return {
    status: 'synthetic_local_workerd_proof_passed',
    schemaImportElapsedMs: schemaResult.elapsedMs,
    seed: {
      fileCount: seed.files.length,
      bytes: seed.files.reduce((sum, file) => sum + file.bytes, 0),
      statementCount: seed.files.reduce((sum, file) => sum + file.statements, 0),
      aggregateSha256: seed.aggregateSha256,
      importElapsedMs: Math.round(imports.reduce((sum, item) => sum + item.elapsedMs, 0) * 1000) / 1000,
    },
    identity: {
      expectedBaseCorpusIdentity: expectedCorpusIdentity,
      contextProjectionSha256: identityMap.context_projection_sha256,
      schemaVersion: identityMap.schema_version,
      queryElapsedMs: identity.elapsedMs,
      rowsRead: identity.rowsRead,
      rowsReadObservation: identity.rowsReadObservation,
    },
    representativeQueries: lookups.map(({ rows, ...summary }) => summary),
    bindingFailureContract: {
      missingBinding: resolveOriginalLanguageContextBinding(expectedCorpusIdentity, undefined),
      versionSkew: resolveOriginalLanguageContextBinding(expectedCorpusIdentity, {
        expectedBaseCorpusIdentity: '0'.repeat(64),
        schemaVersion: SCHEMA_VERSION,
      }),
    },
  };
}

function assertFailClosedExamples(): string {
  const rejected: string[] = [];
  const examples: Array<[string, SyntheticReferenceModel]> = [
    ['ambiguous-crosswalk', {
      ...syntheticReference('grc', 1),
      canonicalCandidates: ['SYN.GRC.00001', 'SYN.GRC.00002'],
    }],
    ['greek-one-to-many', {
      ...syntheticReference('grc', 1),
      bundle: { v: 1, g: [[1, 0, 1, 1], [2, 1, 2, 1]] },
    }],
    ['semitic-ambiguous-morpheme', {
      ...syntheticReference('hbo', 3),
      bundle: { v: 1, s: [[1, 1, 1, 0, 1], [2, 1, 1, 1, 2]] },
    }],
  ];
  for (const [id, model] of examples) {
    try {
      validateSyntheticReference(model);
    } catch {
      rejected.push(id);
    }
  }
  if (rejected.length !== examples.length) fail('ambiguous alignment examples did not all fail closed');
  return sha256(rejected.join('\n'));
}

export function parseOriginalLanguageCapacityArguments(argv: readonly string[]): void {
  if (argv.length !== 0) fail('accepts no arguments and cannot acquire or address a corpus');
}

export function buildOriginalLanguageCompactEvidence(envelope: Record<string, any>) {
  if (!verifyOriginalLanguageCompleteHash(envelope)) fail('cannot compact invalid original-language evidence');
  const compactPayload = {
    schemaVersion: 'synthetic-original-language-context-compact-evidence.v1',
    status: 'provisional_leading_candidate_not_architecture_authority',
    sourcePolicy: envelope.sourcePolicy,
    sourceRevision: envelope.sourceRevision,
    environment: envelope.environment,
    baselineProfile: envelope.baselineProfile,
    syntheticProfile: envelope.syntheticProfile,
    sensitivityProfile: envelope.sensitivityProfile,
    storageContract: envelope.storageContract,
    internalCapacityPolicy: envelope.internalCapacityPolicy,
    candidates: envelope.candidates.map((candidate: Record<string, any>) => ({
      name: candidate.name,
      databaseRole: candidate.databaseRole,
      buildBasis: candidate.buildBasis,
      preVacuum: {
        fileBytes: candidate.preVacuum.fileBytes,
        pageSize: candidate.preVacuum.pageSize,
        pageCount: candidate.preVacuum.pageCount,
        freelistPages: candidate.preVacuum.freelistPages,
        integrityCheck: candidate.preVacuum.integrityCheck,
        foreignKeyViolations: candidate.preVacuum.foreignKeyViolations,
      },
      postVacuumDiagnosticBytes: candidate.postVacuumDiagnostic.fileBytes,
      capacity: candidate.capacity,
      ...(candidate.synthetic ? {
        synthetic: {
          maximumModeledMorphemes: candidate.synthetic.maximumModeledMorphemes,
          counts: candidate.synthetic.counts,
          payloadBytes: candidate.synthetic.payloadBytes,
          generatedProjectionSha256: candidate.synthetic.orderedProjectionSha256,
          storedProjectionSha256: candidate.synthetic.storedProjectionSha256,
          expectedBaseCorpusIdentity: candidate.synthetic.expectedBaseCorpusIdentity,
        },
      } : {}),
    })),
    workerd: envelope.workerd,
    architectureDecision: envelope.architectureDecision,
    fullRunDeterministicEvidence: {
      hashDomain: envelope.deterministicEvidenceHashDomain,
      sha256: envelope.deterministicEvidenceSha256,
    },
    scopeBoundary: envelope.scopeBoundary,
    sanitized: true,
  };
  return attachOriginalLanguageEvidenceHashes(compactPayload);
}

export function runOriginalLanguageContextCapacity(root = ROOT) {
  if (process.versions.node !== REQUIRED_NODE) {
    fail(`requires pinned Node ${REQUIRED_NODE}; received ${process.version}`);
  }
  const started = performance.now();
  return withOriginalLanguageTemporaryDirectory(temp => {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
    const manifestBytes = readFileSync(join(root, 'data/data-manifest.json'));
    const parsedManifest = parseDataManifest(manifestBytes);
    const baselineCorpusIdentity = computeD1CorpusIdentity(parsedManifest);
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
      schemaVersion: unknown;
      expectedCounts?: { morphology?: unknown };
      materializations?: { d1?: { transformVersion?: unknown } };
    };
    if (typeof manifest.schemaVersion !== 'string'
      || !Number.isSafeInteger(manifest.expectedCounts?.morphology)
      || !Number.isSafeInteger(manifest.materializations?.d1?.transformVersion)) {
      fail('current data manifest does not provide the required baseline profile');
    }
    const baselinePath = join(temp, 'baseline.sqlite');
    freshBaseline(root, baselinePath);
    const baseline = measureCandidate(
      'current_baseline',
      'current release corpus only',
      'fresh normal build and verification',
      baselinePath,
    );

    const integratedPath = join(temp, 'integrated.sqlite');
    freshBaseline(root, integratedPath);
    const integratedDatabase = new Database(integratedPath);
    let integratedSynthetic: ReturnType<typeof materializeSyntheticCorpus>;
    try {
      integratedSynthetic = materializeSyntheticCorpus(
        integratedDatabase,
        baselineCorpusIdentity,
        BASE_PROFILE_MAX_MORPHEMES,
      );
    } finally {
      integratedDatabase.close();
    }
    const integrated = measureCandidate(
      'existing_d1_integrated',
      'current release corpus plus synthetic compact context bundles',
      'fresh normal build followed by direct synthetic-only materialization',
      integratedPath,
      integratedSynthetic,
    );

    const sidecarPath = join(temp, 'sidecar.sqlite');
    const sidecarDatabase = new Database(sidecarPath);
    let sidecarSynthetic: ReturnType<typeof materializeSyntheticCorpus>;
    try {
      sidecarSynthetic = materializeSyntheticCorpus(
        sidecarDatabase,
        baselineCorpusIdentity,
        BASE_PROFILE_MAX_MORPHEMES,
      );
    } finally {
      sidecarDatabase.close();
    }
    const sidecar = measureCandidate(
      'separate_d1_sidecar',
      'synthetic compact context bundles only',
      'fresh empty SQLite database with direct synthetic-only materialization',
      sidecarPath,
      sidecarSynthetic,
    );
    assertOriginalLanguageProjectionParity(integratedSynthetic.orderedProjectionSha256, [
      { label: 'integrated-stored', sha256: integratedSynthetic.storedProjectionSha256 },
      { label: 'sidecar-generated', sha256: sidecarSynthetic.orderedProjectionSha256 },
      { label: 'sidecar-stored', sha256: sidecarSynthetic.storedProjectionSha256 },
    ]);
    if (canonical(integratedSynthetic.counts) !== canonical(sidecarSynthetic.counts)) {
      fail('integrated and sidecar synthetic inventories drifted');
    }

    const sensitivityPath = join(temp, 'high-multiplicity-sidecar.sqlite');
    const sensitivityDatabase = new Database(sensitivityPath);
    let sensitivitySynthetic: ReturnType<typeof materializeSyntheticCorpus>;
    try {
      sensitivitySynthetic = materializeSyntheticCorpus(
        sensitivityDatabase,
        baselineCorpusIdentity,
        SENSITIVITY_PROFILE_MAX_MORPHEMES,
      );
    } finally {
      sensitivityDatabase.close();
    }
    const sensitivity = measureCandidate(
      'high_multiplicity_sidecar_sensitivity',
      'synthetic context bundles only with four morphemes at modeled split positions',
      'fresh empty SQLite sensitivity database; not a release projection',
      sensitivityPath,
      sensitivitySynthetic,
    );
    const workerd = workerdSidecarProof(root, temp, sidecarPath, baselineCorpusIdentity);

    const existingD1HardGateFeasible = integrated.capacity.withinLimit;
    const existingD1Recommended = existingD1HardGateFeasible && !integrated.capacity.warning;
    const separateD1LeadingCandidate = sidecar.capacity.withinLimit && !existingD1Recommended;
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      status: 'synthetic_non_authoritative_non_releaseable_provisional_architecture_evidence',
      sourcePolicy: {
        externalCorpusAcquired: false,
        sourceTextPresent: false,
        authorityClaim: 'none',
        releaseAuthority: false,
      },
      sourceRevision: {
        commit,
        tree,
        experimentScriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
        dataManifestSha256: sha256(manifestBytes),
      },
      environment: {
        node: process.version,
        sqlite: sqliteVersion(),
      },
      baselineProfile: {
        schemaVersion: manifest.schemaVersion,
        transformVersion: manifest.materializations!.d1!.transformVersion,
        existingMorphologyRows: manifest.expectedCounts!.morphology,
        corpusIdentity: baselineCorpusIdentity,
        derivation: 'pinned current data manifest',
      },
      syntheticProfile: {
        ...SYNTHETIC_PROFILE,
        totalReferences:
          SYNTHETIC_PROFILE.greekReferences
          + SYNTHETIC_PROFILE.hebrewReferences
          + SYNTHETIC_PROFILE.aramaicReferences,
        modelDisclaimer:
          'Fixed engineering assumptions for relative capacity only; not observed corpus counts or linguistic authority.',
      },
      storageContract: {
        unit: 'one compact JSON bundle per reference',
        included: [
          'canonical and exceptional source reference coordinates',
          'source language',
          'positional token or morpheme alignment',
          'compact syntactic head and relation codes',
        ],
        excluded: [
          'source text',
          'surface forms',
          'lemmas',
          'morphology',
          'Strongs numbers',
          'glosses',
          'frames',
          'domains',
        ],
        alignment: {
          greek: 'one_to_one_and_many_source_positions_to_one_context_unit',
        hebrewAndAramaic: 'one_source_position_to_one_or_two_ordered_morpheme_units',
          ambiguity: 'rejected_not_stored',
        },
        psalmCrosswalk:
          'synthetic Psalm 3 superscription and one-verse shift cases prove the storage shape only',
      },
      sensitivityProfile: {
        status: 'conservative_synthetic_sensitivity_not_a_real_corpus_projection',
        baseMaximumMorphemes: BASE_PROFILE_MAX_MORPHEMES,
        highMultiplicityMaximumMorphemes: SENSITIVITY_PROFILE_MAX_MORPHEMES,
        validatorHardBound: MAX_MODELED_MORPHEMES,
        projectionBoundary:
          'Real-corpus acquisition must measure observed multiplicity, reject values above six pending a new decision, and rerun capacity evidence.',
      },
      failClosedExamplesSha256: assertFailClosedExamples(),
      internalCapacityPolicy: {
        limitBytes: D1_CORPUS_CAPACITY_LIMIT_BYTES,
        warningThresholdBytes: D1_CORPUS_CAPACITY_WARNING_BYTES,
        distinction: 'TheologAI internal project gate, not a Cloudflare platform limit',
      },
      candidates: [baseline, integrated, sidecar, sensitivity],
      workerd,
      architectureDecision: {
        existingD1HardGateFeasible,
        existingD1Recommended,
        separateD1LeadingCandidate,
        status: 'provisional_leading_candidate_pending_real_corpus_and_operational_proof',
        leadingCandidate: existingD1Recommended
          ? 'existing_d1'
          : separateD1LeadingCandidate
            ? 'separate_d1'
            : 'none',
        rationale: !existingD1HardGateFeasible
          ? 'The integrated fresh candidate exceeds the internal 350 MiB gate.'
          : integrated.capacity.warning
            ? 'The integrated candidate fits the hard gate but remains in the internal warning band; the compact sidecar preserves independent headroom and failure isolation.'
            : 'The integrated candidate remains below both the internal warning threshold and hard gate.',
        operationalImplication: separateD1LeadingCandidate
          ? 'A future runtime would need two bounded reads and an application-layer positional join because D1 bindings cannot be SQL-joined across databases; missing or conflicting coordinates must fail closed.'
          : 'A future runtime could use one database read boundary, but the context table must remain independently rebuildable and non-authoritative.',
        aggregateBytesDiagnosticOnly: baseline.preVacuum.fileBytes + sidecar.preVacuum.fileBytes,
        highMultiplicityAggregateBytesDiagnosticOnly:
          baseline.preVacuum.fileBytes + sensitivity.preVacuum.fileBytes,
        sharedIdentityContract: {
          primaryCorpusIdentity: baselineCorpusIdentity,
          contextExpectedBaseCorpusIdentity: sidecarSynthetic.expectedBaseCorpusIdentity,
          contextProjectionSha256: sidecarSynthetic.storedProjectionSha256,
          contextSchemaVersion: SCHEMA_VERSION,
          mismatchBehavior: 'context unavailable; base morphology may continue without context',
        },
        slotAccounting: {
          ...originalLanguageSlotAccounting(2),
          assumedEnvironments: ['preview', 'production'],
          accountSlotAvailability: 'unknown_not_queried_local_only',
          releaseGate: 'confirm one free D1 slot per target environment before selecting separate D1',
        },
        remainingGates: [
          'acquire and review the real corpus under separate authorization',
          'measure observed token/morpheme multiplicity and rerun capacity',
          'prove representative real-corpus Workerd latency and rows_read budgets',
          'review shared corpus identity and version-skew behavior in runtime design',
          'confirm Cloudflare D1 slot availability for preview and production',
          'design and test missing-binding behavior without weakening base morphology',
        ],
      },
      scopeBoundary: {
        runtimeChanged: false,
        publicSchemaChanged: false,
        migrationAdded: false,
        manifestChanged: false,
        remoteD1OrWorkerUsed: false,
        isolatedLocalWorkerdUsed: true,
        corpusAcquired: false,
        corpusActivated: false,
        deploymentPerformed: false,
      },
      elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
    };
    const envelopeBase = {
      ...payload,
      sanitized: true,
    };
    return attachOriginalLanguageEvidenceHashes(envelopeBase);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    parseOriginalLanguageCapacityArguments(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(runOriginalLanguageContextCapacity())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
