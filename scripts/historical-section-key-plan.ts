#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSIC_TEXT_LIMITS } from '../src/kernel/classicTextContract.js';
import { buildLocalDocumentResourceUri } from '../src/kernel/documentResource.js';

export const HISTORICAL_SECTION_KEY_PLAN_PATH = 'data/historical-section-key-plan.json';
export const HISTORICAL_SECTION_KEY_PLAN_KIND = 'migration_free_section_identity_plan' as const;
export const HISTORICAL_SECTION_KEY_PLAN_SCHEMA_VERSION = 1 as const;
export const EXPECTED_HISTORICAL_SECTION_COLLISIONS = {
  collisionGroups: 23,
  affectedSections: 256,
  newlyAddressableSections: 233,
} as const;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export interface HistoricalSectionKeyPlanEntry {
  sourceSignature: string;
  sectionKey: string;
  supersededSourceSignatures: string[];
}

export interface HistoricalLegacyLocatorPlanEntry {
  legacySectionId: string;
  sectionKey: string;
}

export interface HistoricalSectionKeyDocumentPlan {
  documentId: string;
  sourcePath: string;
  sourceCanonicalSha256: string;
  sections: HistoricalSectionKeyPlanEntry[];
  legacyLocators: HistoricalLegacyLocatorPlanEntry[];
  retiredSectionKeys: string[];
}

export interface HistoricalSectionKeyPlan {
  schemaVersion: 1;
  kind: typeof HISTORICAL_SECTION_KEY_PLAN_KIND;
  lineage:
    | { mode: 'genesis'; predecessorPlanSha256: null }
    | { mode: 'successor'; predecessorPlanSha256: string };
  policy: {
    authority: 'checked_in_explicit_keys';
    sourceSignatures: 'coverage_only_not_identity';
    legacyResolution: 'provisional_source_first_target';
    runtimeStatus: 'inactive_until_0005_transform_8';
  };
  expectedCollisionReport: HistoricalSectionCollisionReport;
  documents: HistoricalSectionKeyDocumentPlan[];
}

export interface HistoricalSectionSourceDocument {
  documentId: string;
  sourcePath: string;
  value: Record<string, unknown> & { sections: unknown[] };
}

export interface HistoricalSectionKeyVerificationReport {
  documentCount: number;
  sectionCount: number;
  legacyLocatorCount: number;
  collisionGroups: number;
  affectedSections: number;
  newlyAddressableSections: number;
}

export interface HistoricalSectionCollisionReport {
  collisionGroups: number;
  affectedSections: number;
  newlyAddressableSections: number;
}

export function parseHistoricalSectionKeyPlan(value: unknown): HistoricalSectionKeyPlan {
  const root = record(value, 'Section-key plan');
  exactKeys(root, ['schemaVersion', 'kind', 'lineage', 'policy', 'expectedCollisionReport', 'documents'], 'Section-key plan');
  if (root.schemaVersion !== HISTORICAL_SECTION_KEY_PLAN_SCHEMA_VERSION
    || root.kind !== HISTORICAL_SECTION_KEY_PLAN_KIND) {
    throw new Error('Section-key plan has an unsupported identity or schema version');
  }

  const rawLineage = record(root.lineage, 'Section-key plan lineage');
  exactKeys(rawLineage, ['mode', 'predecessorPlanSha256'], 'Section-key plan lineage');
  let lineage: HistoricalSectionKeyPlan['lineage'];
  if (rawLineage.mode === 'genesis' && rawLineage.predecessorPlanSha256 === null) {
    lineage = { mode: 'genesis', predecessorPlanSha256: null };
  } else if (rawLineage.mode === 'successor') {
    lineage = {
      mode: 'successor',
      predecessorPlanSha256: hash(rawLineage.predecessorPlanSha256, 'Section-key predecessor plan hash'),
    };
  } else {
    throw new Error('Section-key plan lineage must be an exact genesis or successor declaration');
  }

  const policy = record(root.policy, 'Section-key plan policy');
  exactKeys(policy, ['authority', 'sourceSignatures', 'legacyResolution', 'runtimeStatus'], 'Section-key plan policy');
  if (policy.authority !== 'checked_in_explicit_keys'
    || policy.sourceSignatures !== 'coverage_only_not_identity'
    || policy.legacyResolution !== 'provisional_source_first_target'
    || policy.runtimeStatus !== 'inactive_until_0005_transform_8') {
    throw new Error('Section-key plan policy must remain explicit, coverage-only, provisionally source-first, and runtime-inactive');
  }

  const expected = collisionReport(root.expectedCollisionReport, 'Expected collision report');
  if (!Array.isArray(root.documents) || root.documents.length < 1 || root.documents.length > 100) {
    throw new Error('Section-key plan must contain 1..100 documents');
  }

  const documentIds = new Set<string>();
  const sourcePaths = new Set<string>();
  const documents = root.documents.map((raw, documentIndex): HistoricalSectionKeyDocumentPlan => {
    const item = record(raw, `Section-key document ${documentIndex + 1}`);
    exactKeys(item, ['documentId', 'sourcePath', 'sourceCanonicalSha256', 'sections', 'legacyLocators', 'retiredSectionKeys'], `Section-key document ${documentIndex + 1}`);
    const documentId = safeText(item.documentId, DOCUMENT_ID, `Section-key document ${documentIndex + 1} id`);
    assertBoundedResourceUri(documentId, undefined, `Section-key document ${documentId}`);
    const sourcePath = `data/historical-documents/${documentId}.json`;
    if (item.sourcePath !== sourcePath) throw new Error(`Section-key document ${documentId} has a non-canonical source path`);
    if (documentIds.has(documentId) || sourcePaths.has(sourcePath)) throw new Error(`Duplicate section-key document: ${documentId}`);
    documentIds.add(documentId);
    sourcePaths.add(sourcePath);
    const sourceCanonicalSha256 = hash(item.sourceCanonicalSha256, `Section-key document ${documentId} source hash`);

    if (!Array.isArray(item.sections) || item.sections.length < 1 || item.sections.length > 2000) {
      throw new Error(`Section-key document ${documentId} must contain 1..2000 section entries`);
    }
    const sourceSignatures = new Set<string>();
    const sectionKeys = new Set<string>();
    const sections = item.sections.map((rawSection, sectionIndex): HistoricalSectionKeyPlanEntry => {
      const section = record(rawSection, `${documentId} section plan ${sectionIndex + 1}`);
      exactKeysOneOf(section, [
        ['sourceSignature', 'sectionKey'],
        ['sourceSignature', 'sectionKey', 'supersededSourceSignatures'],
      ], `${documentId} section plan ${sectionIndex + 1}`);
      const sourceSignature = hash(section.sourceSignature, `${documentId} section source signature`);
      const sectionKey = safeText(section.sectionKey, SAFE_ID, `${documentId} section key`);
      assertBoundedResourceUri(documentId, sectionKey, `${documentId} section key`);
      const supersededSourceSignatures = section.supersededSourceSignatures === undefined
        ? []
        : hashList(section.supersededSourceSignatures, `${documentId} section ${sectionKey} superseded signatures`);
      if (supersededSourceSignatures.includes(sourceSignature)) {
        throw new Error(`${documentId} section ${sectionKey} cannot supersede its current source signature`);
      }
      if (sourceSignatures.has(sourceSignature)) throw new Error(`${documentId} has a duplicate section source signature`);
      if (sectionKeys.has(sectionKey)) throw new Error(`${documentId} has a duplicate section key: ${sectionKey}`);
      sourceSignatures.add(sourceSignature);
      sectionKeys.add(sectionKey);
      return { sourceSignature, sectionKey, supersededSourceSignatures };
    });
    assertSorted(sections.map(section => section.sectionKey), `${documentId} authoritative section keys`);

    const claimedSignatures = new Set<string>();
    for (const section of sections) {
      for (const signature of [section.sourceSignature, ...section.supersededSourceSignatures]) {
        if (claimedSignatures.has(signature)) throw new Error(`${documentId} claims a source signature under more than one section key`);
        claimedSignatures.add(signature);
      }
    }

    if (!Array.isArray(item.legacyLocators) || item.legacyLocators.length < 1 || item.legacyLocators.length > 2000) {
      throw new Error(`Section-key document ${documentId} must contain 1..2000 legacy locators`);
    }
    const legacyIds = new Set<string>();
    const legacyLocators = item.legacyLocators.map((rawAlias, aliasIndex): HistoricalLegacyLocatorPlanEntry => {
      const alias = record(rawAlias, `${documentId} legacy locator ${aliasIndex + 1}`);
      exactKeys(alias, ['legacySectionId', 'sectionKey'], `${documentId} legacy locator ${aliasIndex + 1}`);
      const legacySectionId = safeText(alias.legacySectionId, SAFE_ID, `${documentId} legacy section id`);
      const sectionKey = safeText(alias.sectionKey, SAFE_ID, `${documentId} legacy target key`);
      assertBoundedResourceUri(documentId, legacySectionId, `${documentId} legacy section id`);
      if (legacyIds.has(legacySectionId)) throw new Error(`${documentId} has a duplicate legacy locator: ${legacySectionId}`);
      if (!sectionKeys.has(sectionKey)) throw new Error(`${documentId} legacy locator targets an unknown section key: ${sectionKey}`);
      legacyIds.add(legacySectionId);
      return { legacySectionId, sectionKey };
    });
    assertSorted(legacyLocators.map(alias => alias.legacySectionId), `${documentId} legacy locators`);

    const retiredSectionKeys = identityList(item.retiredSectionKeys, `${documentId} retired section keys`);
    for (const retiredKey of retiredSectionKeys) {
      assertBoundedResourceUri(documentId, retiredKey, `${documentId} retired section key`);
      if (sectionKeys.has(retiredKey)) throw new Error(`${documentId} reuses retired section key ${retiredKey}`);
      if (legacyIds.has(retiredKey)) throw new Error(`${documentId} retired section key overlaps the legacy alias namespace: ${retiredKey}`);
    }
    return { documentId, sourcePath, sourceCanonicalSha256, sections, legacyLocators, retiredSectionKeys };
  });
  assertSorted(documents.map(document => document.documentId), 'Section-key plan documents');
  return {
    schemaVersion: HISTORICAL_SECTION_KEY_PLAN_SCHEMA_VERSION,
    kind: HISTORICAL_SECTION_KEY_PLAN_KIND,
    lineage,
    policy: {
      authority: 'checked_in_explicit_keys',
      sourceSignatures: 'coverage_only_not_identity',
      legacyResolution: 'provisional_source_first_target',
      runtimeStatus: 'inactive_until_0005_transform_8',
    },
    expectedCollisionReport: expected,
    documents,
  };
}

/**
 * Prove append-only key continuity between two reviewed plan revisions.
 * Source-signature changes must be explicitly attached to the same key;
 * removed keys must move to the permanent retired namespace.
 */
export function verifyHistoricalSectionKeyPlanTransition(
  previous: HistoricalSectionKeyPlan,
  next: HistoricalSectionKeyPlan,
): void {
  if (sha256Canonical(previous) === sha256Canonical(next)) return;
  if (next.lineage.mode !== 'successor') {
    throw new Error('A section-key plan with a reviewed predecessor must declare successor lineage');
  }
  if (next.lineage.predecessorPlanSha256 !== sha256Canonical(previous)) {
    throw new Error('Section-key successor does not name the exact canonical predecessor plan hash');
  }
  const nextByDocument = new Map(next.documents.map(document => [document.documentId, document]));
  for (const previousDocument of previous.documents) {
    const nextDocument = nextByDocument.get(previousDocument.documentId);
    if (!nextDocument) throw new Error(`Section-key transition removed document ${previousDocument.documentId}`);
    const previousActive = new Map(previousDocument.sections.map(section => [section.sectionKey, section]));
    const nextActive = new Map(nextDocument.sections.map(section => [section.sectionKey, section]));
    const nextRetired = new Set(nextDocument.retiredSectionKeys);
    for (const retired of previousDocument.retiredSectionKeys) {
      if (!nextRetired.has(retired)) throw new Error(`${previousDocument.documentId} removed retired section key ${retired}`);
    }
    const removedActive = [...previousActive.keys()].filter(sectionKey => !nextActive.has(sectionKey));
    const newlyRetired = nextDocument.retiredSectionKeys.filter(sectionKey => !previousDocument.retiredSectionKeys.includes(sectionKey));
    if (!sameTextSet(removedActive, newlyRetired)) {
      throw new Error(`${previousDocument.documentId} newly retired keys must exactly equal removed active keys`);
    }

    const previousSignatureOwners = new Map<string, string>();
    for (const section of previousDocument.sections) {
      for (const signature of [section.sourceSignature, ...section.supersededSourceSignatures]) {
        previousSignatureOwners.set(signature, section.sectionKey);
      }
    }
    for (const section of nextDocument.sections) {
      for (const signature of [section.sourceSignature, ...section.supersededSourceSignatures]) {
        const previousOwner = previousSignatureOwners.get(signature);
        if (previousOwner !== undefined && previousOwner !== section.sectionKey) {
          throw new Error(`${previousDocument.documentId} moved a previously claimed source signature from ${previousOwner} to ${section.sectionKey}`);
        }
      }
    }

    for (const [sectionKey, previousSection] of previousActive) {
      const nextSection = nextActive.get(sectionKey);
      if (!nextSection) {
        continue;
      }
      const expectedHistory = nextSection.sourceSignature === previousSection.sourceSignature
        ? previousSection.supersededSourceSignatures
        : [...previousSection.supersededSourceSignatures, previousSection.sourceSignature].sort(compareText);
      if (!sameTextList(nextSection.supersededSourceSignatures, expectedHistory)) {
        const change = nextSection.sourceSignature === previousSection.sourceSignature ? 'unchanged' : 'changed';
        throw new Error(`${previousDocument.documentId} section ${sectionKey} has an invalid ${change} source-signature history delta`);
      }
    }
    for (const [sectionKey, nextSection] of nextActive) {
      if (previousDocument.retiredSectionKeys.includes(sectionKey)) {
        throw new Error(`${previousDocument.documentId} reused retired section key ${sectionKey}`);
      }
      if (!previousActive.has(sectionKey) && nextSection.supersededSourceSignatures.length > 0) {
        throw new Error(`${previousDocument.documentId} new section key ${sectionKey} cannot begin with superseded source-signature history`);
      }
    }
  }

  const previousDocumentIds = new Set(previous.documents.map(document => document.documentId));
  for (const nextDocument of next.documents) {
    if (previousDocumentIds.has(nextDocument.documentId)) continue;
    if (nextDocument.retiredSectionKeys.length > 0
      || nextDocument.sections.some(section => section.supersededSourceSignatures.length > 0)) {
      throw new Error(`New section-key document ${nextDocument.documentId} cannot begin with retired keys or superseded signature history`);
    }
  }
}

/** Prove that the initial ledger is a one-time history-free genesis. */
export function verifyHistoricalSectionKeyPlanGenesis(plan: HistoricalSectionKeyPlan): void {
  if (plan.lineage.mode !== 'genesis' || plan.lineage.predecessorPlanSha256 !== null) {
    throw new Error('Initial section-key verification requires exact genesis lineage');
  }
  for (const document of plan.documents) {
    if (document.retiredSectionKeys.length > 0
      || document.sections.some(section => section.supersededSourceSignatures.length > 0)) {
      throw new Error('Section-key genesis cannot contain retired keys or superseded signature history');
    }
  }
}

export function verifyHistoricalSectionKeyPlan(
  plan: HistoricalSectionKeyPlan,
  sourceDocuments: HistoricalSectionSourceDocument[],
): HistoricalSectionKeyVerificationReport {
  const sourceById = new Map<string, HistoricalSectionSourceDocument>();
  for (const source of sourceDocuments) {
    if (sourceById.has(source.documentId)) throw new Error(`Duplicate source document: ${source.documentId}`);
    sourceById.set(source.documentId, source);
  }
  if (sourceById.size !== plan.documents.length) {
    throw new Error(`Section-key source coverage mismatch: plan=${plan.documents.length}, sources=${sourceById.size}`);
  }

  let sectionCount = 0;
  let legacyLocatorCount = 0;
  let collisionGroups = 0;
  let affectedSections = 0;
  let newlyAddressableSections = 0;

  for (const document of plan.documents) {
    const source = sourceById.get(document.documentId);
    if (!source) throw new Error(`Section-key plan has no source document for ${document.documentId}`);
    if (source.sourcePath !== document.sourcePath) throw new Error(`Section-key source path mismatch for ${document.documentId}`);
    if (sha256Canonical(source.value) !== document.sourceCanonicalSha256) {
      throw new Error(`Section-key source snapshot changed for ${document.documentId}`);
    }
    const plannedBySignature = new Map(document.sections.map(section => [section.sourceSignature, section]));
    if (plannedBySignature.size !== source.value.sections.length || document.sections.length !== source.value.sections.length) {
      throw new Error(`Section-key section coverage mismatch for ${document.documentId}`);
    }

    const sourceRows = source.value.sections.map((section, sourceIndex) => {
      const sourceSignature = sha256Canonical(section);
      const planned = plannedBySignature.get(sourceSignature);
      if (!planned) throw new Error(`Section-key plan is missing a source signature for ${document.documentId}`);
      return {
        sourceSignature,
        sectionKey: planned.sectionKey,
        legacySectionId: historicalLegacySectionId(section, sourceIndex),
      };
    });
    if (new Set(sourceRows.map(row => row.sourceSignature)).size !== sourceRows.length) {
      throw new Error(`Source signatures do not uniquely describe ${document.documentId}`);
    }

    const rowsByLegacy = new Map<string, typeof sourceRows>();
    for (const row of sourceRows) {
      const group = rowsByLegacy.get(row.legacySectionId) ?? [];
      group.push(row);
      rowsByLegacy.set(row.legacySectionId, group);
    }
    const aliases = new Map(document.legacyLocators.map(alias => [alias.legacySectionId, alias.sectionKey]));
    if (aliases.size !== rowsByLegacy.size) throw new Error(`Legacy locator coverage mismatch for ${document.documentId}`);
    for (const [legacySectionId, rows] of rowsByLegacy) {
      const first = rows[0]!;
      if (first.sectionKey !== legacySectionId) {
        throw new Error(`${document.documentId} does not assign legacy locator ${legacySectionId} to its provisional source-first key`);
      }
      if (aliases.get(legacySectionId) !== first.sectionKey) {
        throw new Error(`${document.documentId} legacy locator ${legacySectionId} does not retain its provisional source-first target`);
      }
      if (rows.length > 1) {
        collisionGroups++;
        affectedSections += rows.length;
        newlyAddressableSections += rows.length - 1;
      }
    }
    sectionCount += sourceRows.length;
    legacyLocatorCount += aliases.size;
  }

  for (const sourceId of sourceById.keys()) {
    if (!plan.documents.some(document => document.documentId === sourceId)) {
      throw new Error(`Source document is absent from section-key plan: ${sourceId}`);
    }
  }
  const report = {
    documentCount: plan.documents.length,
    sectionCount,
    legacyLocatorCount,
    collisionGroups,
    affectedSections,
    newlyAddressableSections,
  };
  if (!reportsEqual(report, plan.expectedCollisionReport)) {
    const expected = plan.expectedCollisionReport;
    throw new Error(
      `Historical section collision report changed: expected ${expected.collisionGroups}/${expected.affectedSections}/${expected.newlyAddressableSections}, `
      + `received ${collisionGroups}/${affectedSections}/${newlyAddressableSections}`,
    );
  }
  return report;
}

export function readHistoricalSectionSources(root: string): HistoricalSectionSourceDocument[] {
  const directory = join(root, 'data/historical-documents');
  return readdirSync(directory)
    .filter(file => file.endsWith('.json'))
    .sort(compareText)
    .map(file => {
      const documentId = file.slice(0, -5);
      const value = JSON.parse(readFileSync(join(directory, file), 'utf8')) as Record<string, unknown>;
      if (!Array.isArray(value.sections)) throw new Error(`Historical source ${file} has no sections array`);
      return { documentId, sourcePath: `data/historical-documents/${file}`, value: value as Record<string, unknown> & { sections: unknown[] } };
    });
}

export function verifyHistoricalSectionKeyPlanFromDisk(root: string): HistoricalSectionKeyVerificationReport {
  const plan = parseHistoricalSectionKeyPlan(JSON.parse(readFileSync(join(root, HISTORICAL_SECTION_KEY_PLAN_PATH), 'utf8')));
  const report = verifyHistoricalSectionKeyPlan(plan, readHistoricalSectionSources(root));
  if (!reportsEqual(report, EXPECTED_HISTORICAL_SECTION_COLLISIONS)) {
    throw new Error('Tracked historical section-key plan must retain the reviewed 23/256/233 collision sentinel');
  }
  return report;
}

export function verifyHistoricalSectionKeyPlanRevisionFromDisk(
  root: string,
  mode: { genesis: true } | { previousPlanPath: string },
  currentPlanPath = join(root, HISTORICAL_SECTION_KEY_PLAN_PATH),
): HistoricalSectionKeyVerificationReport {
  const current = parseHistoricalSectionKeyPlan(JSON.parse(readFileSync(resolve(currentPlanPath), 'utf8')));
  const report = verifyHistoricalSectionKeyPlan(current, readHistoricalSectionSources(root));
  if ('genesis' in mode) {
    verifyHistoricalSectionKeyPlanGenesis(current);
  } else {
    const previous = parseHistoricalSectionKeyPlan(JSON.parse(readFileSync(resolve(mode.previousPlanPath), 'utf8')));
    verifyHistoricalSectionKeyPlanTransition(previous, current);
  }
  return report;
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function historicalLegacySectionId(section: unknown, sourceIndex: number): string {
  const item = record(section, `Historical source section ${sourceIndex + 1}`);
  const value = item.question_number || item.section_number || String(sourceIndex + 1);
  return safeText(value, SAFE_ID, `Historical source section ${sourceIndex + 1} legacy id`);
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical source signatures require finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const item = record(value, 'Canonical source value');
  return `{${Object.keys(item).sort(compareText).map(key => `${JSON.stringify(key)}:${canonicalJson(item[key])}`).join(',')}}`;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], field: string): void {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${field} must have exact keys: ${keys.join(', ')}`);
}

function exactKeysOneOf(value: Record<string, unknown>, alternatives: string[][], field: string): void {
  const actual = JSON.stringify(Object.keys(value).sort(compareText));
  if (!alternatives.some(keys => JSON.stringify([...keys].sort(compareText)) === actual)) {
    throw new Error(`${field} has unsupported keys`);
  }
}

function safeText(value: unknown, pattern: RegExp, field: string): string {
  if (typeof value !== 'string' || !pattern.test(value) || value === '.' || value === '..') {
    throw new Error(`${field} is outside the safe identity alphabet or length bound`);
  }
  return value;
}

function hash(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${field} must be a lowercase SHA-256`);
  return value;
}

function hashList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const hashes = value.map((entry, index) => hash(entry, `${field} ${index + 1}`));
  if (new Set(hashes).size !== hashes.length) throw new Error(`${field} contains duplicates`);
  assertSorted(hashes, field);
  return hashes;
}

function identityList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const identities = value.map((entry, index) => safeText(entry, SAFE_ID, `${field} ${index + 1}`));
  if (new Set(identities).size !== identities.length) throw new Error(`${field} contains duplicates`);
  assertSorted(identities, field);
  return identities;
}

function assertBoundedResourceUri(documentId: string, sectionId: string | undefined, field: string): void {
  const uri = buildLocalDocumentResourceUri(documentId, sectionId);
  if (!uri || [...uri].length > CLASSIC_TEXT_LIMITS.resourceUriCharacters) {
    throw new Error(`${field} cannot form a canonical resource URI within ${CLASSIC_TEXT_LIMITS.resourceUriCharacters} characters after encoding`);
  }
}

function collisionReport(value: unknown, field: string): HistoricalSectionCollisionReport {
  const item = record(value, field);
  exactKeys(item, ['collisionGroups', 'affectedSections', 'newlyAddressableSections'], field);
  for (const key of ['collisionGroups', 'affectedSections', 'newlyAddressableSections'] as const) {
    if (!Number.isSafeInteger(item[key]) || (item[key] as number) < 0) throw new Error(`${field} ${key} must be a non-negative safe integer`);
  }
  return item as unknown as HistoricalSectionCollisionReport;
}

function reportsEqual(
  actual: { collisionGroups: number; affectedSections: number; newlyAddressableSections: number },
  expected: { collisionGroups: number; affectedSections: number; newlyAddressableSections: number },
): boolean {
  return actual.collisionGroups === expected.collisionGroups
    && actual.affectedSections === expected.affectedSections
    && actual.newlyAddressableSections === expected.newlyAddressableSections;
}

function sameTextSet(left: string[], right: string[]): boolean {
  return sameTextList([...left].sort(compareText), [...right].sort(compareText));
}

function sameTextList(left: string[], right: string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertSorted(values: string[], field: string): void {
  if (JSON.stringify(values) !== JSON.stringify([...values].sort(compareText))) throw new Error(`${field} must be sorted`);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const args = [...process.argv.slice(2)];
  let currentPlanPath = join(root, HISTORICAL_SECTION_KEY_PLAN_PATH);
  const currentIndex = args.indexOf('--current-plan');
  if (currentIndex >= 0) {
    const value = args[currentIndex + 1];
    if (!value) throw new Error('--current-plan requires a path');
    currentPlanPath = value;
    args.splice(currentIndex, 2);
  }
  let mode: { genesis: true } | { previousPlanPath: string };
  if (args.length === 1 && args[0] === '--genesis') {
    mode = { genesis: true };
  } else if (args.length === 2 && args[0] === '--previous-plan' && args[1]) {
    mode = { previousPlanPath: args[1] };
  } else {
    throw new Error('Usage: historical-section-key-plan.ts [--current-plan <path>] (--genesis | --previous-plan <path>)');
  }
  process.stdout.write(`${JSON.stringify(verifyHistoricalSectionKeyPlanRevisionFromDisk(root, mode, currentPlanPath))}\n`);
}
