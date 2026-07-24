#!/usr/bin/env tsx

/**
 * Verify the content-free local evidence needed before historical section keys
 * can replace ambiguous display-number locators.
 *
 * This is deliberately an offline verification boundary. It records neither
 * section text or a claimed production result. The current Node `.get()` and
 * D1 `.first()` queries have no ORDER BY, so their target remains
 * `unordered_no_compatibility_proof`. The owner has separately approved the
 * checked-in source-first aliases as the authoritative target for a future
 * migration; that decision does not claim that either current runtime ever
 * returned that target.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_HISTORICAL_SECTION_COLLISIONS,
  HISTORICAL_SECTION_KEY_PLAN_PATH,
  historicalLegacySectionId,
  parseHistoricalSectionKeyPlan,
  readHistoricalSectionSources,
  sha256Canonical,
  verifyHistoricalSectionKeyPlanFromDisk,
  type HistoricalSectionKeyPlan,
} from './historical-section-key-plan.js';
import { splitGeneratedSql } from './d1-seed-utils.js';

export const HISTORICAL_SECTION_COMPATIBILITY_EVIDENCE_KIND =
  'historical_section_compatibility_evidence' as const;
export const HISTORICAL_SECTION_COMPATIBILITY_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const HISTORICAL_SECTION_COMPATIBILITY_EVIDENCE_PATH =
  'data/historical-section-compatibility-evidence.json';
export const UNORDERED_NO_COMPATIBILITY_PROOF =
  'unordered_no_compatibility_proof' as const;

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SEED_FILE = /^\d{2}-document-sections-\d{3}\.sql$/;

export interface HistoricalSectionCompatibilityEvidenceMember {
  sourceOrdinal: number;
  sourceSignature: string;
  plannedSectionKey: string;
  sqliteBuilderRowId: number;
  d1SeedOrdinal: number;
}

export interface HistoricalSectionCompatibilityEvidenceGroup {
  documentId: string;
  legacySectionId: string;
  members: HistoricalSectionCompatibilityEvidenceMember[];
}

export interface HistoricalSectionCompatibilityEvidence {
  schemaVersion: 1;
  kind: typeof HISTORICAL_SECTION_COMPATIBILITY_EVIDENCE_KIND;
  historicalSectionKeyPlanSha256: string;
  sourcePolicy: 'content_free_local_materialization_evidence';
  compatibilityStatus: {
    nodeGetCurrentResolution: typeof UNORDERED_NO_COMPATIBILITY_PROOF;
    d1FirstCurrentResolution: typeof UNORDERED_NO_COMPATIBILITY_PROOF;
    productionObservedTarget: null;
    decisionStatus: 'approved_source_first';
  };
  expectedCollisionReport: {
    collisionGroups: number;
    affectedSections: number;
    newlyAddressableSections: number;
  };
  collisionGroups: HistoricalSectionCompatibilityEvidenceGroup[];
}

export interface HistoricalSectionCompatibilityVerificationReport {
  documentCount: number;
  sectionCount: number;
  nonLegacyDocumentSectionCount: number;
  collisionGroups: number;
  affectedSections: number;
  newlyAddressableSections: number;
  sourceFirstLowestRowFirstSeedAndApprovedAliasAgreements: number;
  nodeGetCurrentResolution: typeof UNORDERED_NO_COMPATIBILITY_PROOF;
  d1FirstCurrentResolution: typeof UNORDERED_NO_COMPATIBILITY_PROOF;
  productionObservedTarget: null;
  decisionStatus: 'approved_source_first';
}

export interface HistoricalSectionMaterializedRow {
  id: number;
  documentId: string;
  legacySectionId: string;
}

export interface HistoricalSectionSeedRow extends HistoricalSectionMaterializedRow {
  d1SeedOrdinal: number;
}

interface DerivedHistoricalSectionRow extends HistoricalSectionCompatibilityEvidenceMember {
  documentId: string;
  legacySectionId: string;
}

interface DerivedHistoricalSectionCompatibility {
  evidence: HistoricalSectionCompatibilityEvidence;
  allRows: DerivedHistoricalSectionRow[];
  sourceFirstAliasByGroup: Map<string, string>;
}

/** Parse the checked-in packet with an intentionally exact, closed schema. */
export function parseHistoricalSectionCompatibilityEvidence(value: unknown): HistoricalSectionCompatibilityEvidence {
  const root = record(value, 'Historical section compatibility evidence');
  exactKeys(root, [
    'schemaVersion',
    'kind',
    'historicalSectionKeyPlanSha256',
    'sourcePolicy',
    'compatibilityStatus',
    'expectedCollisionReport',
    'collisionGroups',
  ], 'Historical section compatibility evidence');

  if (root.schemaVersion !== HISTORICAL_SECTION_COMPATIBILITY_EVIDENCE_SCHEMA_VERSION
    || root.kind !== HISTORICAL_SECTION_COMPATIBILITY_EVIDENCE_KIND) {
    throw new Error('Historical section compatibility evidence has an unsupported identity or schema version');
  }
  const historicalSectionKeyPlanSha256 = sha256(root.historicalSectionKeyPlanSha256, 'Historical section-key plan hash');
  if (root.sourcePolicy !== 'content_free_local_materialization_evidence') {
    throw new Error('Historical section compatibility evidence must remain content-free and local-materialization-only');
  }

  const compatibilityStatus = record(root.compatibilityStatus, 'Historical section compatibility status');
  exactKeys(compatibilityStatus, [
    'nodeGetCurrentResolution',
    'd1FirstCurrentResolution',
    'productionObservedTarget',
    'decisionStatus',
  ], 'Historical section compatibility status');
  if (compatibilityStatus.nodeGetCurrentResolution !== UNORDERED_NO_COMPATIBILITY_PROOF
    || compatibilityStatus.d1FirstCurrentResolution !== UNORDERED_NO_COMPATIBILITY_PROOF
    || compatibilityStatus.productionObservedTarget !== null
    || compatibilityStatus.decisionStatus !== 'approved_source_first') {
    throw new Error('Historical section compatibility evidence must retain its unordered, unobserved, approved-source-first status');
  }

  const expectedCollisionReport = collisionReport(root.expectedCollisionReport, 'Historical section compatibility evidence report');
  if (!sameCollisionReport(expectedCollisionReport, EXPECTED_HISTORICAL_SECTION_COLLISIONS)) {
    throw new Error('Historical section compatibility evidence must retain the reviewed 23/256/233 collision sentinel');
  }
  if (!Array.isArray(root.collisionGroups) || root.collisionGroups.length !== expectedCollisionReport.collisionGroups) {
    throw new Error('Historical section compatibility evidence collision groups do not match the reviewed sentinel');
  }

  const groupIds = new Set<string>();
  const collisionGroups = root.collisionGroups.map((rawGroup, groupIndex): HistoricalSectionCompatibilityEvidenceGroup => {
    const group = record(rawGroup, `Historical section compatibility group ${groupIndex + 1}`);
    exactKeys(group, ['documentId', 'legacySectionId', 'members'], `Historical section compatibility group ${groupIndex + 1}`);
    const documentId = safeId(group.documentId, `Historical section compatibility group ${groupIndex + 1} document id`);
    const legacySectionId = safeId(group.legacySectionId, `Historical section compatibility group ${groupIndex + 1} legacy section id`);
    const groupId = compatibilityGroupId(documentId, legacySectionId);
    if (groupIds.has(groupId)) throw new Error(`Duplicate historical section compatibility group: ${documentId}#${legacySectionId}`);
    groupIds.add(groupId);
    if (!Array.isArray(group.members) || group.members.length < 2 || group.members.length > 2_000) {
      throw new Error(`Historical section compatibility group ${documentId}#${legacySectionId} must contain 2..2000 members`);
    }

    const members = group.members.map((rawMember, memberIndex): HistoricalSectionCompatibilityEvidenceMember => {
      const member = record(rawMember, `Historical section compatibility group ${documentId}#${legacySectionId} member ${memberIndex + 1}`);
      exactKeys(member, [
        'sourceOrdinal',
        'sourceSignature',
        'plannedSectionKey',
        'sqliteBuilderRowId',
        'd1SeedOrdinal',
      ], `Historical section compatibility group ${documentId}#${legacySectionId} member ${memberIndex + 1}`);
      return {
        sourceOrdinal: positiveInteger(member.sourceOrdinal, `${documentId}#${legacySectionId} source ordinal`),
        sourceSignature: sha256(member.sourceSignature, `${documentId}#${legacySectionId} source signature`),
        plannedSectionKey: safeId(member.plannedSectionKey, `${documentId}#${legacySectionId} planned section key`),
        sqliteBuilderRowId: positiveInteger(member.sqliteBuilderRowId, `${documentId}#${legacySectionId} SQLite builder row id`),
        d1SeedOrdinal: positiveInteger(member.d1SeedOrdinal, `${documentId}#${legacySectionId} D1 seed ordinal`),
      };
    });
    assertStrictlyIncreasing(members.map(member => member.sourceOrdinal), `${documentId}#${legacySectionId} source ordinals`);
    assertStrictlyIncreasing(members.map(member => member.sqliteBuilderRowId), `${documentId}#${legacySectionId} SQLite builder row ids`);
    assertStrictlyIncreasing(members.map(member => member.d1SeedOrdinal), `${documentId}#${legacySectionId} D1 seed ordinals`);
    assertUnique(members.map(member => member.sourceSignature), `${documentId}#${legacySectionId} source signatures`);
    assertUnique(members.map(member => member.plannedSectionKey), `${documentId}#${legacySectionId} planned section keys`);
    return { documentId, legacySectionId, members };
  });
  assertSorted(collisionGroups.map(group => compatibilityGroupId(group.documentId, group.legacySectionId)), 'Historical section compatibility groups');

  const affectedSections = collisionGroups.reduce((total, group) => total + group.members.length, 0);
  const newlyAddressableSections = collisionGroups.reduce((total, group) => total + group.members.length - 1, 0);
  if (affectedSections !== expectedCollisionReport.affectedSections
    || newlyAddressableSections !== expectedCollisionReport.newlyAddressableSections) {
    throw new Error('Historical section compatibility evidence member totals do not match the reviewed sentinel');
  }

  return {
    schemaVersion: 1,
    kind: HISTORICAL_SECTION_COMPATIBILITY_EVIDENCE_KIND,
    historicalSectionKeyPlanSha256,
    sourcePolicy: 'content_free_local_materialization_evidence',
    compatibilityStatus: {
      nodeGetCurrentResolution: UNORDERED_NO_COMPATIBILITY_PROOF,
      d1FirstCurrentResolution: UNORDERED_NO_COMPATIBILITY_PROOF,
      productionObservedTarget: null,
      decisionStatus: 'approved_source_first',
    },
    expectedCollisionReport,
    collisionGroups,
  };
}

/**
 * Derive the compact local packet from source order and the checked-in key
 * plan. The row/seed positions are projections of the current deterministic
 * builder/exporter and are later checked against their actual artifacts.
 */
export function deriveHistoricalSectionCompatibilityEvidence(root: string): DerivedHistoricalSectionCompatibility {
  const report = verifyHistoricalSectionKeyPlanFromDisk(root);
  const plan = readHistoricalSectionKeyPlan(root);
  const documents = new Map(plan.documents.map(document => [document.documentId, document]));
  const rowsByGroup = new Map<string, DerivedHistoricalSectionRow[]>();
  const sourceFirstAliasByGroup = new Map<string, string>();
  const allRows: DerivedHistoricalSectionRow[] = [];

  let sqliteBuilderRowId = 0;
  for (const source of readHistoricalSectionSources(root)) {
    const document = documents.get(source.documentId);
    if (!document) throw new Error(`Historical section compatibility source has no plan document: ${source.documentId}`);
    const sectionKeyBySignature = new Map(document.sections.map(section => [section.sourceSignature, section.sectionKey]));
    const aliases = new Map(document.legacyLocators.map(alias => [alias.legacySectionId, alias.sectionKey]));
    for (const [sourceIndex, section] of source.value.sections.entries()) {
      const sourceSignature = sha256Canonical(section);
      const plannedSectionKey = sectionKeyBySignature.get(sourceSignature);
      if (!plannedSectionKey) throw new Error(`Historical section compatibility source signature is not planned: ${source.documentId} row ${sourceIndex + 1}`);
      const legacySectionId = historicalLegacySectionId(section, sourceIndex);
      const row: DerivedHistoricalSectionRow = {
        documentId: source.documentId,
        legacySectionId,
        sourceOrdinal: sourceIndex + 1,
        sourceSignature,
        plannedSectionKey,
        sqliteBuilderRowId: ++sqliteBuilderRowId,
        d1SeedOrdinal: sqliteBuilderRowId,
      };
      allRows.push(row);
      const groupId = compatibilityGroupId(source.documentId, legacySectionId);
      const group = rowsByGroup.get(groupId) ?? [];
      group.push(row);
      rowsByGroup.set(groupId, group);
      const alias = aliases.get(legacySectionId);
      if (!alias) throw new Error(`Historical section compatibility source lacks a source-first alias: ${source.documentId}#${legacySectionId}`);
      sourceFirstAliasByGroup.set(groupId, alias);
    }
  }

  const collisionGroups = [...rowsByGroup.entries()]
    .filter(([, rows]) => rows.length > 1)
    .sort(([left], [right]) => compareText(left, right))
    .map(([, rows]): HistoricalSectionCompatibilityEvidenceGroup => ({
      documentId: rows[0]!.documentId,
      legacySectionId: rows[0]!.legacySectionId,
      members: rows.map(({ documentId: _documentId, legacySectionId: _legacySectionId, ...member }) => member),
    }));

  const evidence: HistoricalSectionCompatibilityEvidence = {
    schemaVersion: 1,
    kind: HISTORICAL_SECTION_COMPATIBILITY_EVIDENCE_KIND,
    historicalSectionKeyPlanSha256: sha256Canonical(plan),
    sourcePolicy: 'content_free_local_materialization_evidence',
    compatibilityStatus: {
      nodeGetCurrentResolution: UNORDERED_NO_COMPATIBILITY_PROOF,
      d1FirstCurrentResolution: UNORDERED_NO_COMPATIBILITY_PROOF,
      productionObservedTarget: null,
      decisionStatus: 'approved_source_first',
    },
    expectedCollisionReport: {
      collisionGroups: report.collisionGroups,
      affectedSections: report.affectedSections,
      newlyAddressableSections: report.newlyAddressableSections,
    },
    collisionGroups,
  };
  return { evidence: parseHistoricalSectionCompatibilityEvidence(evidence), allRows, sourceFirstAliasByGroup };
}

/** Verify the immutable packet against the current local sources and plan. */
export function verifyHistoricalSectionCompatibilityEvidenceFromSources(
  root: string,
  evidence: HistoricalSectionCompatibilityEvidence,
): DerivedHistoricalSectionCompatibility {
  verifyCurrentUnorderedSectionResolutionSource(root);
  const parsed = parseHistoricalSectionCompatibilityEvidence(evidence);
  const derived = deriveHistoricalSectionCompatibilityEvidence(root);
  if (JSON.stringify(parsed) !== JSON.stringify(derived.evidence)) {
    throw new Error('Historical section compatibility evidence does not exactly match the current local source/order/key-plan projection');
  }
  return derived;
}

/** Read the generated SQLite rows without reading section body/title text. */
export function readHistoricalSectionRowsFromSqlite(databasePath: string): HistoricalSectionMaterializedRow[] {
  const database = checkedRegularFile(databasePath, 'SQLite database');
  const output = execFileSync('sqlite3', [
    '-readonly',
    '-batch',
    '-json',
    database,
    'PRAGMA query_only=ON; SELECT id, document_id, section_number FROM document_sections ORDER BY id;',
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const raw = JSON.parse(output || '[]') as unknown;
  if (!Array.isArray(raw)) throw new Error('SQLite historical-section query did not return an array');
  return raw.map((value, index): HistoricalSectionMaterializedRow => {
    const row = record(value, `SQLite historical section row ${index + 1}`);
    exactKeys(row, ['id', 'document_id', 'section_number'], `SQLite historical section row ${index + 1}`);
    return {
      id: positiveInteger(row.id, `SQLite historical section row ${index + 1} id`),
      documentId: safeId(row.document_id, `SQLite historical section row ${index + 1} document id`),
      legacySectionId: safeId(row.section_number, `SQLite historical section row ${index + 1} section number`),
    };
  });
}

/** Read D1 seed INSERT positions without retaining historical body text. */
export function readHistoricalSectionRowsFromD1Seed(seedDirectory: string): HistoricalSectionSeedRow[] {
  const directory = checkedDirectory(seedDirectory, 'D1 seed directory');
  const manifest = record(parseJsonFile(join(directory, 'seed-manifest.json'), 'D1 seed manifest'), 'D1 seed manifest');
  if (!Array.isArray(manifest.files)) throw new Error('D1 seed manifest files must be an array');
  const files = manifest.files
    .map((value, index) => parseDocumentSectionsSeedManifestFile(value, index + 1))
    .filter((file): file is D1SeedManifestFile => file !== null)
    .sort((left, right) => left.chunk - right.chunk);
  if (files.length < 1) throw new Error('D1 seed manifest has no document_sections files');
  for (const [index, file] of files.entries()) {
    if (file.chunk !== index) throw new Error('D1 document_sections seed chunks must be contiguous and zero-based');
  }

  const rows: HistoricalSectionSeedRow[] = [];
  for (const file of files) {
    const path = checkedSeedFile(directory, file.path);
    const bytes = readFileSync(path);
    if (bytes.byteLength !== file.byteSize || sha256Buffer(bytes) !== file.sha256) {
      throw new Error(`D1 document_sections seed file does not match its manifest: ${file.path}`);
    }
    const statements = splitGeneratedSql(bytes.toString('utf8'));
    if (statements.length !== file.statementCount) {
      throw new Error(`D1 document_sections seed statement count does not match its manifest: ${file.path}`);
    }
    const fileStart = rows.length;
    for (const statement of statements) {
      const row = parseDocumentSectionsInsert(statement, rows.length + 1);
      if (row) rows.push(row);
      else if (!isDocumentSectionsContentAppend(statement)) {
        throw new Error(`D1 document_sections seed contains an unsupported statement: ${file.path}`);
      }
    }
    if (rows.length - fileStart !== file.rowCount) {
      throw new Error(`D1 document_sections seed row count does not match its manifest: ${file.path}`);
    }
  }
  assertStrictlyIncreasing(rows.map(row => row.id), 'D1 document_sections SQLite ids');
  assertStrictlyIncreasing(rows.map(row => row.d1SeedOrdinal), 'D1 document_sections seed ordinals');
  return rows;
}

/**
 * Prove that the owner-approved source-first alias target matches local row
 * and seed order. This does not establish what either unordered runtime query
 * returned in production.
 */
export function verifyHistoricalSectionCompatibilityMaterialization(
  root: string,
  evidence: HistoricalSectionCompatibilityEvidence,
  sqliteRows: HistoricalSectionMaterializedRow[],
  seedRows: HistoricalSectionSeedRow[],
): HistoricalSectionCompatibilityVerificationReport {
  const derived = verifyHistoricalSectionCompatibilityEvidenceFromSources(root, evidence);
  // Transform 6 compatibility evidence is intentionally limited to the frozen
  // 17-work legacy projection. Transform 9 adds edition-backed documents to
  // the same tables; keep those rows visible in the report, but never let
  // them relax or redefine the reviewed 3,054-row legacy contract.
  const legacyDocumentIds = new Set(derived.allRows.map(row => row.documentId));
  const scopedSqlite = scopeLegacyHistoricalSectionRows(sqliteRows, legacyDocumentIds);
  const scopedSeed = scopeLegacyHistoricalSectionRows(seedRows, legacyDocumentIds);
  if (scopedSqlite.legacyRows.length !== derived.allRows.length) {
    throw new Error(`SQLite legacy historical section row count mismatch: expected ${derived.allRows.length}, received ${scopedSqlite.legacyRows.length}`);
  }
  if (scopedSeed.legacyRows.length !== scopedSqlite.legacyRows.length) {
    throw new Error(`D1 seed legacy historical section row count mismatch: expected ${scopedSqlite.legacyRows.length}, received ${scopedSeed.legacyRows.length}`);
  }
  if (scopedSeed.nonLegacyRows.length !== scopedSqlite.nonLegacyRows.length) {
    throw new Error(`D1 seed non-legacy historical section row count mismatch: expected ${scopedSqlite.nonLegacyRows.length}, received ${scopedSeed.nonLegacyRows.length}`);
  }
  for (const [index, expected] of derived.allRows.entries()) {
    const sqlite = scopedSqlite.legacyRows[index]!;
    const seed = scopedSeed.legacyRows[index]!;
    if (sqlite.id !== expected.sqliteBuilderRowId
      || sqlite.documentId !== expected.documentId
      || sqlite.legacySectionId !== expected.legacySectionId) {
      throw new Error(`SQLite builder row ${index + 1} does not match the local historical source projection`);
    }
    if (seed.id !== sqlite.id
      || seed.documentId !== sqlite.documentId
      || seed.legacySectionId !== sqlite.legacySectionId
      || seed.d1SeedOrdinal !== expected.d1SeedOrdinal) {
      throw new Error(`D1 seed row ${index + 1} does not match the generated SQLite historical row/order`);
    }
  }
  for (const [index, sqlite] of scopedSqlite.nonLegacyRows.entries()) {
    const seed = scopedSeed.nonLegacyRows[index]!;
    if (seed.id !== sqlite.id
      || seed.documentId !== sqlite.documentId
      || seed.legacySectionId !== sqlite.legacySectionId
      || seed.d1SeedOrdinal !== sqlite.id) {
      throw new Error(`D1 seed non-legacy historical row ${index + 1} does not match the generated SQLite row/order`);
    }
  }

  const parsed = parseHistoricalSectionCompatibilityEvidence(evidence);
  for (const group of parsed.collisionGroups) {
    const groupId = compatibilityGroupId(group.documentId, group.legacySectionId);
    const alias = derived.sourceFirstAliasByGroup.get(groupId);
    if (!alias) throw new Error(`Historical section compatibility plan has no source-first alias for ${group.documentId}#${group.legacySectionId}`);
    verifyApprovedSourceFirstAgreement(group, alias);
  }

  return {
    documentCount: new Set(derived.allRows.map(row => row.documentId)).size,
    sectionCount: derived.allRows.length,
    nonLegacyDocumentSectionCount: scopedSqlite.nonLegacyRows.length,
    collisionGroups: parsed.expectedCollisionReport.collisionGroups,
    affectedSections: parsed.expectedCollisionReport.affectedSections,
    newlyAddressableSections: parsed.expectedCollisionReport.newlyAddressableSections,
    sourceFirstLowestRowFirstSeedAndApprovedAliasAgreements: parsed.collisionGroups.length,
    nodeGetCurrentResolution: UNORDERED_NO_COMPATIBILITY_PROOF,
    d1FirstCurrentResolution: UNORDERED_NO_COMPATIBILITY_PROOF,
    productionObservedTarget: null,
    decisionStatus: 'approved_source_first',
  };
}

function scopeLegacyHistoricalSectionRows<T extends HistoricalSectionMaterializedRow>(
  rows: readonly T[],
  legacyDocumentIds: ReadonlySet<string>,
): { legacyRows: T[]; nonLegacyRows: T[] } {
  const legacyRows: T[] = [];
  const nonLegacyRows: T[] = [];
  for (const row of rows) {
    if (legacyDocumentIds.has(row.documentId)) legacyRows.push(row);
    else nonLegacyRows.push(row);
  }
  return { legacyRows, nonLegacyRows };
}

/** Verify the exact current no-ORDER-BY runtime state that makes this evidence non-authoritative. */
export function verifyCurrentUnorderedSectionResolutionSource(root: string): void {
  const node = readFileSync(join(root, 'src/adapters/data/HistoricalDocumentRepository.ts'), 'utf8');
  const d1 = readFileSync(join(root, 'src/adapters/d1/D1HistoricalDocumentRepository.ts'), 'utf8');
  const unorderedSql = 'SELECT * FROM document_sections WHERE document_id = ? AND section_number = ?';
  if (!node.includes(`this.stmtSectionByNum = this.db.prepare(\n      '${unorderedSql}'\n`)
    || !node.includes('this.stmtSectionByNum.get(documentId, sectionNumber)')) {
    throw new Error('Node historical getSection query is no longer the reviewed unordered .get() implementation');
  }
  if (!d1.includes(`this.db.prepare(\n      '${unorderedSql}'\n    ).bind(documentId, sectionNumber).first`)) {
    throw new Error('D1 historical getSection query is no longer the reviewed unordered .first() implementation');
  }
}

/**
 * Check the owner-approved source-first target for one collision group. It is
 * useful for adversarial tests and deliberately cannot make an unordered
 * runtime query or an unobserved production target authoritative.
 */
export function verifyApprovedSourceFirstAgreement(
  group: HistoricalSectionCompatibilityEvidenceGroup,
  sourceFirstAliasTarget: string,
): void {
  if (!group.members.length) throw new Error(`Historical section compatibility group ${group.documentId}#${group.legacySectionId} has no members`);
  const sourceFirst = group.members[0]!;
  const lowestRow = [...group.members].sort((left, right) => left.sqliteBuilderRowId - right.sqliteBuilderRowId)[0]!;
  const firstSeed = [...group.members].sort((left, right) => left.d1SeedOrdinal - right.d1SeedOrdinal)[0]!;
  if (sourceFirst.sourceSignature !== lowestRow.sourceSignature
    || sourceFirst.sourceSignature !== firstSeed.sourceSignature
    || sourceFirst.plannedSectionKey !== sourceFirstAliasTarget) {
    throw new Error(`Historical section compatibility approved source-first target does not agree locally for ${group.documentId}#${group.legacySectionId}`);
  }
}

function readHistoricalSectionKeyPlan(root: string): HistoricalSectionKeyPlan {
  return parseHistoricalSectionKeyPlan(parseJsonFile(join(root, HISTORICAL_SECTION_KEY_PLAN_PATH), 'Historical section-key plan'));
}

function parseDocumentSectionsSeedManifestFile(value: unknown, index: number): D1SeedManifestFile | null {
  const file = record(value, `D1 seed manifest file ${index}`);
  exactKeys(file, ['path', 'table', 'chunk', 'sha256', 'byteSize', 'statementCount', 'rowCount'], `D1 seed manifest file ${index}`);
  if (file.table !== 'document_sections') return null;
  const path = string(file.path, `D1 document_sections seed file ${index} path`);
  if (!SEED_FILE.test(path)) throw new Error(`D1 document_sections seed file ${index} has an unsafe or non-canonical path`);
  return {
    path,
    chunk: nonNegativeInteger(file.chunk, `D1 document_sections seed file ${index} chunk`),
    sha256: sha256(file.sha256, `D1 document_sections seed file ${index} hash`),
    byteSize: nonNegativeInteger(file.byteSize, `D1 document_sections seed file ${index} byte size`),
    statementCount: nonNegativeInteger(file.statementCount, `D1 document_sections seed file ${index} statement count`),
    rowCount: nonNegativeInteger(file.rowCount, `D1 document_sections seed file ${index} row count`),
  };
}

interface D1SeedManifestFile {
  path: string;
  chunk: number;
  sha256: string;
  byteSize: number;
  statementCount: number;
  rowCount: number;
}

function parseDocumentSectionsInsert(statement: string, d1SeedOrdinal: number): HistoricalSectionSeedRow | null {
  if (!statement.startsWith('INSERT INTO "document_sections"')) return null;
  const match = statement.match(
    /^INSERT INTO "document_sections"\("id","document_id","section_number","title","content","topics"\) VALUES\((\d+),'((?:''|[^'])*)','((?:''|[^'])*)',/,
  );
  if (!match) throw new Error('D1 document_sections INSERT has an unexpected deterministic exporter shape');
  return {
    id: positiveInteger(Number(match[1]), 'D1 document_sections INSERT id'),
    documentId: safeId(unquoteSqlLiteral(match[2]!), 'D1 document_sections INSERT document id'),
    legacySectionId: safeId(unquoteSqlLiteral(match[3]!), 'D1 document_sections INSERT section number'),
    d1SeedOrdinal,
  };
}

function isDocumentSectionsContentAppend(statement: string): boolean {
  return /^UPDATE "document_sections" SET "content" = "content" \|\| '[\s\S]*' WHERE "id" = \d+;$/.test(statement);
}

function unquoteSqlLiteral(value: string): string {
  return value.replaceAll("''", "'");
}

function parseJsonFile(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function checkedRegularFile(path: string, label: string): string {
  const resolved = resolve(path);
  if (!existsSync(resolved) || !statSync(resolved).isFile() || lstatSync(resolved).isSymbolicLink()) {
    throw new Error(`${label} must be an existing non-symlink regular file`);
  }
  return resolved;
}

function checkedDirectory(path: string, label: string): string {
  const resolved = resolve(path);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory() || lstatSync(resolved).isSymbolicLink()) {
    throw new Error(`${label} must be an existing non-symlink directory`);
  }
  return resolved;
}

function checkedSeedFile(directory: string, filename: string): string {
  if (isAbsolute(filename) || filename.includes('/') || filename.includes('\\')) {
    throw new Error('D1 document_sections seed filename must be a safe basename');
  }
  const path = resolve(directory, filename);
  if (!path.startsWith(`${directory}${sep}`)) throw new Error('D1 document_sections seed file escapes its directory');
  return checkedRegularFile(path, `D1 document_sections seed file ${filename}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} must have exact keys: ${keys.join(', ')}`);
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
}

function safeId(value: unknown, label: string): string {
  const text = string(value, label);
  if (!SAFE_ID.test(text) || text === '.' || text === '..') throw new Error(`${label} is outside the safe identity alphabet or length bound`);
  return text;
}

function sha256(value: unknown, label: string): string {
  const text = string(value, label);
  if (!SHA256.test(text)) throw new Error(`${label} must be a lowercase SHA-256`);
  return text;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`${label} must be a positive safe integer`);
  return value as number;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value as number;
}

function collisionReport(value: unknown, label: string): HistoricalSectionCompatibilityEvidence['expectedCollisionReport'] {
  const report = record(value, label);
  exactKeys(report, ['collisionGroups', 'affectedSections', 'newlyAddressableSections'], label);
  return {
    collisionGroups: nonNegativeInteger(report.collisionGroups, `${label} collision groups`),
    affectedSections: nonNegativeInteger(report.affectedSections, `${label} affected sections`),
    newlyAddressableSections: nonNegativeInteger(report.newlyAddressableSections, `${label} newly addressable sections`),
  };
}

function sameCollisionReport(
  left: HistoricalSectionCompatibilityEvidence['expectedCollisionReport'],
  right: HistoricalSectionCompatibilityEvidence['expectedCollisionReport'],
): boolean {
  return left.collisionGroups === right.collisionGroups
    && left.affectedSections === right.affectedSections
    && left.newlyAddressableSections === right.newlyAddressableSections;
}

function compatibilityGroupId(documentId: string, legacySectionId: string): string {
  return `${documentId}\u0000${legacySectionId}`;
}

function assertSorted(values: string[], label: string): void {
  if (JSON.stringify(values) !== JSON.stringify([...values].sort(compareText))) throw new Error(`${label} must be sorted`);
}

function assertStrictlyIncreasing(values: number[], label: string): void {
  if (values.some((value, index) => index > 0 && value <= values[index - 1]!)) {
    throw new Error(`${label} must be strictly increasing`);
  }
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256Buffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseCliArguments(args: string[]): { database: string; seedDirectory: string } {
  let database: string | undefined;
  let seedDirectory: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--database' || argument === '--seed-directory') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a path`);
      if (argument === '--database') {
        if (database) throw new Error('--database may only be supplied once');
        database = value;
      } else {
        if (seedDirectory) throw new Error('--seed-directory may only be supplied once');
        seedDirectory = value;
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!database || !seedDirectory) {
    throw new Error('Usage: historical-section-compatibility-evidence.ts --database <generated.db> --seed-directory <generated-d1-seed-dir>');
  }
  return { database, seedDirectory };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { database, seedDirectory } = parseCliArguments(process.argv.slice(2));
  const evidence = parseHistoricalSectionCompatibilityEvidence(parseJsonFile(
    join(root, HISTORICAL_SECTION_COMPATIBILITY_EVIDENCE_PATH),
    'Historical section compatibility evidence input',
  ));
  const report = verifyHistoricalSectionCompatibilityMaterialization(
    root,
    evidence,
    readHistoricalSectionRowsFromSqlite(database),
    readHistoricalSectionRowsFromD1Seed(seedDirectory),
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
