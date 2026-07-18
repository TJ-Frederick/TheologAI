import { buildLocalDocumentResourceUri } from '../src/kernel/documentResource.js';
import { sha256Canonical } from './historical-section-key-plan.js';

export const HISTORICAL_SECTION_COMPATIBILITY_MAP_KIND =
  'historical_section_source_first_compatibility_map' as const;
export const HISTORICAL_SECTION_COMPATIBILITY_ATTESTATION_KIND =
  'historical_section_source_first_compiler_attestation' as const;
export const HISTORICAL_SECTION_COMPATIBILITY_COMPILER_SCHEMA_VERSION = 1 as const;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export const HISTORICAL_SECTION_COMPATIBILITY_POLICY = {
  scope: 'existing_17_local_works_only',
  sourceAuthority: 'current_checked_in_historical_documents',
  keyAuthority: 'checked_in_immutable_section_key_plan',
  legacyAliasTarget: 'approved_source_first',
  resolutionOrder: 'canonical_before_legacy_alias',
  contentPolicy: 'excluded_source_signatures_only',
  runtimeStatus: 'inactive_until_0005_transform_8',
  productionObservedTarget: null,
} as const;

export interface HistoricalSectionCompatibilityMapSection {
  sourceOrdinal: number;
  sourceSignature: string;
  legacySectionId: string;
  sectionKey: string;
  canonicalLocator: string;
}

export interface HistoricalSectionCompatibilityMapAlias {
  legacySectionId: string;
  targetSectionKey: string;
  targetSourceOrdinal: number;
  targetCanonicalLocator: string;
}

export interface HistoricalSectionCompatibilityMapDocument {
  documentId: string;
  sections: HistoricalSectionCompatibilityMapSection[];
  legacyAliases: HistoricalSectionCompatibilityMapAlias[];
}

export interface HistoricalSectionCompatibilityMap {
  schemaVersion: 1;
  kind: typeof HISTORICAL_SECTION_COMPATIBILITY_MAP_KIND;
  policy: typeof HISTORICAL_SECTION_COMPATIBILITY_POLICY;
  documents: HistoricalSectionCompatibilityMapDocument[];
}

export interface HistoricalSectionCompatibilityCounts {
  documentCount: number;
  sectionCount: number;
  legacyLocatorCount: number;
  collisionGroups: number;
  affectedSections: number;
  newlyAddressableSections: number;
}

export interface HistoricalSectionCompatibilityAttestation {
  schemaVersion: 1;
  kind: typeof HISTORICAL_SECTION_COMPATIBILITY_ATTESTATION_KIND;
  policy: typeof HISTORICAL_SECTION_COMPATIBILITY_POLICY;
  inputs: {
    historicalSectionKeyPlanCanonicalSha256: string;
    historicalSourcesCanonicalSha256: string;
    approvedSourceFirstEvidenceCanonicalSha256: string;
  };
  exactCounts: HistoricalSectionCompatibilityCounts;
  canonicalOutputSha256: string;
}

export interface HistoricalSectionCompatibilityResolution {
  kind: 'canonical' | 'legacy_alias';
  documentId: string;
  sectionKey: string;
  sourceOrdinal: number;
  canonicalLocator: string;
}

/** Parse a future migration input with a closed schema and source-first semantics. */
export function parseHistoricalSectionCompatibilityMap(value: unknown): HistoricalSectionCompatibilityMap {
  const root = record(value, 'Historical section compatibility map');
  exactKeys(root, ['schemaVersion', 'kind', 'policy', 'documents'], 'Historical section compatibility map');
  if (root.schemaVersion !== HISTORICAL_SECTION_COMPATIBILITY_COMPILER_SCHEMA_VERSION
    || root.kind !== HISTORICAL_SECTION_COMPATIBILITY_MAP_KIND) {
    throw new Error('Historical section compatibility map has an unsupported identity or schema version');
  }
  parsePolicy(root.policy);
  if (!Array.isArray(root.documents) || root.documents.length < 1 || root.documents.length > 100) {
    throw new Error('Historical section compatibility map must contain 1..100 documents');
  }
  const documentIds = new Set<string>();
  const documents = root.documents.map((rawDocument, documentIndex): HistoricalSectionCompatibilityMapDocument => {
    const document = record(rawDocument, `Compatibility document ${documentIndex + 1}`);
    exactKeys(document, ['documentId', 'sections', 'legacyAliases'], `Compatibility document ${documentIndex + 1}`);
    const documentId = safeText(document.documentId, DOCUMENT_ID, `Compatibility document ${documentIndex + 1} id`);
    if (documentIds.has(documentId)) throw new Error(`Duplicate compatibility document: ${documentId}`);
    documentIds.add(documentId);
    if (!Array.isArray(document.sections) || document.sections.length < 1 || document.sections.length > 2000) {
      throw new Error(`Compatibility document ${documentId} must contain 1..2000 sections`);
    }
    const sectionKeys = new Set<string>();
    const signatures = new Set<string>();
    const sections = document.sections.map((rawSection, sectionIndex): HistoricalSectionCompatibilityMapSection => {
      const section = record(rawSection, `${documentId} compatibility section ${sectionIndex + 1}`);
      exactKeys(section, ['sourceOrdinal', 'sourceSignature', 'legacySectionId', 'sectionKey', 'canonicalLocator'], `${documentId} compatibility section ${sectionIndex + 1}`);
      const sourceOrdinal = positiveInteger(section.sourceOrdinal, `${documentId} compatibility source ordinal`);
      if (sourceOrdinal !== sectionIndex + 1) throw new Error(`${documentId} compatibility source ordinals must be dense and source-ordered`);
      const sourceSignature = hash(section.sourceSignature, `${documentId} compatibility source signature`);
      const legacySectionId = safeText(section.legacySectionId, SAFE_ID, `${documentId} compatibility legacy locator`);
      const sectionKey = safeText(section.sectionKey, SAFE_ID, `${documentId} compatibility section key`);
      const canonicalLocator = exactLocator(section.canonicalLocator, documentId, sectionKey, `${documentId} compatibility canonical locator`);
      if (signatures.has(sourceSignature)) throw new Error(`${documentId} compatibility source signatures must be unique`);
      if (sectionKeys.has(sectionKey)) throw new Error(`${documentId} compatibility section keys must be unique`);
      signatures.add(sourceSignature);
      sectionKeys.add(sectionKey);
      return { sourceOrdinal, sourceSignature, legacySectionId, sectionKey, canonicalLocator };
    });
    if (!Array.isArray(document.legacyAliases) || document.legacyAliases.length < 1 || document.legacyAliases.length > 2000) {
      throw new Error(`Compatibility document ${documentId} must contain 1..2000 legacy aliases`);
    }
    const sectionByKey = new Map(sections.map(section => [section.sectionKey, section]));
    const firstByLegacy = new Map<string, HistoricalSectionCompatibilityMapSection>();
    for (const section of sections) if (!firstByLegacy.has(section.legacySectionId)) firstByLegacy.set(section.legacySectionId, section);
    const aliasIds = new Set<string>();
    const legacyAliases = document.legacyAliases.map((rawAlias, aliasIndex): HistoricalSectionCompatibilityMapAlias => {
      const alias = record(rawAlias, `${documentId} compatibility alias ${aliasIndex + 1}`);
      exactKeys(alias, ['legacySectionId', 'targetSectionKey', 'targetSourceOrdinal', 'targetCanonicalLocator'], `${documentId} compatibility alias ${aliasIndex + 1}`);
      const legacySectionId = safeText(alias.legacySectionId, SAFE_ID, `${documentId} compatibility alias id`);
      const targetSectionKey = safeText(alias.targetSectionKey, SAFE_ID, `${documentId} compatibility alias target`);
      const targetSourceOrdinal = positiveInteger(alias.targetSourceOrdinal, `${documentId} compatibility alias target ordinal`);
      const targetCanonicalLocator = exactLocator(alias.targetCanonicalLocator, documentId, targetSectionKey, `${documentId} compatibility alias locator`);
      if (aliasIds.has(legacySectionId)) throw new Error(`${documentId} compatibility aliases must be unique`);
      aliasIds.add(legacySectionId);
      const target = sectionByKey.get(targetSectionKey);
      const first = firstByLegacy.get(legacySectionId);
      if (!target || target.sourceOrdinal !== targetSourceOrdinal || target.canonicalLocator !== targetCanonicalLocator) {
        throw new Error(`${documentId} compatibility alias target does not match a canonical section`);
      }
      if (!first || target.sectionKey !== first.sectionKey) {
        throw new Error(`${documentId} compatibility alias ${legacySectionId} is not the sole source-first target`);
      }
      const canonicalShadow = sectionByKey.get(legacySectionId);
      if (canonicalShadow && canonicalShadow.sectionKey !== target.sectionKey) {
        throw new Error(`${documentId} compatibility alias conflicts with canonical-before-alias resolution`);
      }
      return { legacySectionId, targetSectionKey, targetSourceOrdinal, targetCanonicalLocator };
    });
    if (aliasIds.size !== firstByLegacy.size || [...firstByLegacy.keys()].some(id => !aliasIds.has(id))) {
      throw new Error(`${documentId} compatibility aliases must exactly cover legacy locator groups`);
    }
    assertSorted(legacyAliases.map(alias => alias.legacySectionId), `${documentId} compatibility aliases`);
    return { documentId, sections, legacyAliases };
  });
  assertSorted(documents.map(document => document.documentId), 'Compatibility documents');
  return { schemaVersion: 1, kind: HISTORICAL_SECTION_COMPATIBILITY_MAP_KIND, policy: HISTORICAL_SECTION_COMPATIBILITY_POLICY, documents };
}

/** Canonical identifiers always win; aliases are consulted only on a miss. */
export function resolveHistoricalSectionCompatibility(
  map: HistoricalSectionCompatibilityMap,
  documentId: string,
  locator: string,
): HistoricalSectionCompatibilityResolution | undefined {
  const document = map.documents.find(candidate => candidate.documentId === documentId);
  if (!document) return undefined;
  const canonical = document.sections.find(section => section.sectionKey === locator);
  if (canonical) return {
    kind: 'canonical', documentId, sectionKey: canonical.sectionKey,
    sourceOrdinal: canonical.sourceOrdinal, canonicalLocator: canonical.canonicalLocator,
  };
  const alias = document.legacyAliases.find(candidate => candidate.legacySectionId === locator);
  if (!alias) return undefined;
  return {
    kind: 'legacy_alias', documentId, sectionKey: alias.targetSectionKey,
    sourceOrdinal: alias.targetSourceOrdinal, canonicalLocator: alias.targetCanonicalLocator,
  };
}

export function countHistoricalSectionCompatibilityMap(map: HistoricalSectionCompatibilityMap): HistoricalSectionCompatibilityCounts {
  let sectionCount = 0;
  let legacyLocatorCount = 0;
  let collisionGroups = 0;
  let affectedSections = 0;
  let newlyAddressableSections = 0;
  for (const document of map.documents) {
    sectionCount += document.sections.length;
    legacyLocatorCount += document.legacyAliases.length;
    const groupSizes = new Map<string, number>();
    for (const section of document.sections) groupSizes.set(section.legacySectionId, (groupSizes.get(section.legacySectionId) ?? 0) + 1);
    for (const size of groupSizes.values()) if (size > 1) {
      collisionGroups++;
      affectedSections += size;
      newlyAddressableSections += size - 1;
    }
  }
  return { documentCount: map.documents.length, sectionCount, legacyLocatorCount, collisionGroups, affectedSections, newlyAddressableSections };
}

export function parseHistoricalSectionCompatibilityAttestation(value: unknown): HistoricalSectionCompatibilityAttestation {
  const root = record(value, 'Historical section compatibility attestation');
  exactKeys(root, ['schemaVersion', 'kind', 'policy', 'inputs', 'exactCounts', 'canonicalOutputSha256'], 'Historical section compatibility attestation');
  if (root.schemaVersion !== HISTORICAL_SECTION_COMPATIBILITY_COMPILER_SCHEMA_VERSION
    || root.kind !== HISTORICAL_SECTION_COMPATIBILITY_ATTESTATION_KIND) {
    throw new Error('Historical section compatibility attestation has an unsupported identity or schema version');
  }
  parsePolicy(root.policy);
  const inputs = record(root.inputs, 'Historical section compatibility attestation inputs');
  exactKeys(inputs, ['historicalSectionKeyPlanCanonicalSha256', 'historicalSourcesCanonicalSha256', 'approvedSourceFirstEvidenceCanonicalSha256'], 'Historical section compatibility attestation inputs');
  const exactCounts = parseCounts(root.exactCounts);
  const reviewed = { documentCount: 17, sectionCount: 3054, legacyLocatorCount: 2821, collisionGroups: 23, affectedSections: 256, newlyAddressableSections: 233 };
  if (!sameCounts(exactCounts, reviewed)) throw new Error('Historical section compatibility attestation must retain exact 17/3054/2821 and 23/256/233 sentinels');
  return {
    schemaVersion: 1,
    kind: HISTORICAL_SECTION_COMPATIBILITY_ATTESTATION_KIND,
    policy: HISTORICAL_SECTION_COMPATIBILITY_POLICY,
    inputs: {
      historicalSectionKeyPlanCanonicalSha256: hash(inputs.historicalSectionKeyPlanCanonicalSha256, 'Historical section-key plan input hash'),
      historicalSourcesCanonicalSha256: hash(inputs.historicalSourcesCanonicalSha256, 'Historical sources input hash'),
      approvedSourceFirstEvidenceCanonicalSha256: hash(inputs.approvedSourceFirstEvidenceCanonicalSha256, 'Approved source-first evidence input hash'),
    },
    exactCounts,
    canonicalOutputSha256: hash(root.canonicalOutputSha256, 'Historical section compatibility output hash'),
  };
}

export function sameHistoricalSectionCompatibilityCounts(
  actual: HistoricalSectionCompatibilityCounts,
  expected: HistoricalSectionCompatibilityCounts,
): boolean {
  return sameCounts(actual, expected);
}

function parsePolicy(value: unknown): typeof HISTORICAL_SECTION_COMPATIBILITY_POLICY {
  const policy = record(value, 'Historical section compatibility policy');
  exactKeys(policy, Object.keys(HISTORICAL_SECTION_COMPATIBILITY_POLICY), 'Historical section compatibility policy');
  if (sha256Canonical(policy) !== sha256Canonical(HISTORICAL_SECTION_COMPATIBILITY_POLICY)) {
    throw new Error('Historical section compatibility policy must remain source-first, canonical-before-alias, content-free, and runtime-inactive');
  }
  return HISTORICAL_SECTION_COMPATIBILITY_POLICY;
}

function parseCounts(value: unknown): HistoricalSectionCompatibilityCounts {
  const counts = record(value, 'Historical section compatibility counts');
  const keys = ['documentCount', 'sectionCount', 'legacyLocatorCount', 'collisionGroups', 'affectedSections', 'newlyAddressableSections'];
  exactKeys(counts, keys, 'Historical section compatibility counts');
  for (const key of keys) if (!Number.isSafeInteger(counts[key]) || (counts[key] as number) < 0) throw new Error(`Historical section compatibility count ${key} must be a non-negative safe integer`);
  return counts as unknown as HistoricalSectionCompatibilityCounts;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], field: string): void {
  if (JSON.stringify(Object.keys(value).sort(compareText)) !== JSON.stringify([...keys].sort(compareText))) throw new Error(`${field} must have exact keys: ${keys.join(', ')}`);
}

function safeText(value: unknown, pattern: RegExp, field: string): string {
  if (typeof value !== 'string' || !pattern.test(value) || value === '.' || value === '..') throw new Error(`${field} is outside the safe identity alphabet or length bound`);
  return value;
}

function hash(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${field} must be a lowercase SHA-256`);
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`${field} must be a positive safe integer`);
  return value as number;
}

function exactLocator(value: unknown, documentId: string, sectionKey: string, field: string): string {
  const expected = buildLocalDocumentResourceUri(documentId, sectionKey);
  if (typeof value !== 'string' || value !== expected) throw new Error(`${field} must be the exact canonical section locator`);
  return value;
}

function sameCounts(actual: HistoricalSectionCompatibilityCounts, expected: HistoricalSectionCompatibilityCounts): boolean {
  return actual.documentCount === expected.documentCount && actual.sectionCount === expected.sectionCount
    && actual.legacyLocatorCount === expected.legacyLocatorCount && actual.collisionGroups === expected.collisionGroups
    && actual.affectedSections === expected.affectedSections && actual.newlyAddressableSections === expected.newlyAddressableSections;
}

function assertSorted(values: string[], field: string): void {
  if (JSON.stringify(values) !== JSON.stringify([...values].sort(compareText))) throw new Error(`${field} must be sorted`);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
