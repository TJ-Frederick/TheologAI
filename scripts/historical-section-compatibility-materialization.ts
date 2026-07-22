import { sha256Canonical } from './historical-section-key-plan.js';
import {
  countHistoricalSectionCompatibilityMap,
  type HistoricalSectionCompatibilityCompilation,
} from './historical-section-compatibility-compiler.js';

/** Frozen Transform-8 inventory for the existing corpus only. */
export const HISTORICAL_SECTION_TRANSFORM_8_COUNTS = Object.freeze({
  historical_document_delivery_profiles: 17,
  historical_section_identities: 3054,
  historical_section_aliases: 2821,
  collisionGroups: 23,
  affectedSections: 256,
  newlyAddressableSections: 233,
});

export interface HistoricalSectionMaterializedRow {
  documentId: string;
  sourceOrdinal: number;
  documentSectionId: number;
  legacySectionId: string;
  title: string;
  content: string;
  topics: string;
}

export interface HistoricalSectionDeliveryProfileRow {
  documentId: string;
  workId: null;
  editionId: null;
  immutableCorpusIdentity: string;
  sectionPackageIdentity: null;
  deliveryMode: 'complete_document';
  sectionCount: number;
  landingMaxBytes: 0;
  browsePageSize: 0;
  cursorVersion: 0;
  provenanceJson: string;
  rightsJson: string;
}

export interface HistoricalSectionDeliveryProfileInput {
  documentId: string;
  workId: null;
  editionId: null;
  immutableCorpusIdentity: string;
  sectionPackageIdentity: null;
  provenanceJson: string;
  rightsJson: string;
}

export interface HistoricalSectionIdentityRow {
  documentId: string;
  sectionKey: string;
  sourceOrdinal: number;
  documentSectionId: number;
}

export interface HistoricalSectionLegacyAliasRow {
  documentId: string;
  legacySectionId: string;
  sectionKey: string;
  sourceOrdinal: number;
}

export interface HistoricalSectionTransform8Rows {
  deliveryProfiles: HistoricalSectionDeliveryProfileRow[];
  identities: HistoricalSectionIdentityRow[];
  legacyAliases: HistoricalSectionLegacyAliasRow[];
}

/**
 * Prove the source projection that will be linked by the sidecars. This is
 * deliberately called before any sidecar insert, so a body or source-order
 * change fails before an identity can be persisted against it.
 */
export function assertHistoricalSectionTransform8Materialization(
  compilation: HistoricalSectionCompatibilityCompilation,
  materializedSections: readonly HistoricalSectionMaterializedRow[],
  profileInputs: readonly HistoricalSectionDeliveryProfileInput[],
): HistoricalSectionTransform8Rows {
  const counts = countHistoricalSectionCompatibilityMap(compilation.map);
  if (counts.documentCount !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.historical_document_delivery_profiles
    || counts.sectionCount !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.historical_section_identities
    || counts.legacyLocatorCount !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.historical_section_aliases
    || counts.collisionGroups !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.collisionGroups
    || counts.affectedSections !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.affectedSections
    || counts.newlyAddressableSections !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.newlyAddressableSections) {
    throw new Error('Transform 8 compatibility compilation does not retain the exact 17/3054/2821 and 23/256/233 inventory');
  }
  if (JSON.stringify(compilation.counts) !== JSON.stringify(counts)) {
    throw new Error('Transform 8 compatibility compilation count projection drifted');
  }
  if (materializedSections.length !== counts.sectionCount) {
    throw new Error(`Transform 8 materialized section coverage mismatch: expected ${counts.sectionCount}, received ${materializedSections.length}`);
  }

  const rowsByDocument = new Map<string, HistoricalSectionMaterializedRow[]>();
  const seenStorageIds = new Set<number>();
  for (const row of materializedSections) {
    if (!Number.isSafeInteger(row.documentSectionId) || row.documentSectionId < 1
      || !Number.isSafeInteger(row.sourceOrdinal) || row.sourceOrdinal < 1
      || typeof row.content !== 'string' || typeof row.title !== 'string' || typeof row.topics !== 'string') {
      throw new Error('Transform 8 materialized section projection contains an invalid storage or body value');
    }
    if (seenStorageIds.has(row.documentSectionId)) {
      throw new Error(`Transform 8 materialized section storage id is duplicated: ${row.documentSectionId}`);
    }
    seenStorageIds.add(row.documentSectionId);
    const documentRows = rowsByDocument.get(row.documentId) ?? [];
    documentRows.push(row);
    rowsByDocument.set(row.documentId, documentRows);
  }

  const deliveryProfiles: HistoricalSectionDeliveryProfileRow[] = [];
  const identities: HistoricalSectionIdentityRow[] = [];
  const legacyAliases: HistoricalSectionLegacyAliasRow[] = [];
  const profileByDocument = new Map(profileInputs.map(profile => [profile.documentId, profile]));
  if (profileByDocument.size !== profileInputs.length) {
    throw new Error('Transform 8 delivery-profile inputs contain duplicate documents');
  }
  for (const document of compilation.map.documents) {
    const rows = rowsByDocument.get(document.documentId);
    if (!rows || rows.length !== document.sections.length) {
      throw new Error(`Transform 8 source coverage mismatch for ${document.documentId}`);
    }
    rows.sort((left, right) => left.sourceOrdinal - right.sourceOrdinal);
    const profile = profileByDocument.get(document.documentId);
    if (!profile || !/^[a-f0-9]{64}$/.test(profile.immutableCorpusIdentity)
      || profile.workId !== null || profile.editionId !== null || profile.sectionPackageIdentity !== null
      || !isJsonObject(profile.provenanceJson) || !isJsonObject(profile.rightsJson)) {
      throw new Error(`Transform 8 delivery profile is incomplete or unbound for ${document.documentId}`);
    }
    deliveryProfiles.push({
      ...profile,
      deliveryMode: 'complete_document',
      sectionCount: document.sections.length,
      landingMaxBytes: 0,
      browsePageSize: 0,
      cursorVersion: 0,
    });
    for (const [index, section] of document.sections.entries()) {
      const row = rows[index]!;
      if (row.sourceOrdinal !== section.sourceOrdinal
        || row.legacySectionId !== section.legacySectionId) {
        throw new Error(`Transform 8 section identity drift at ${document.documentId} source ordinal ${section.sourceOrdinal}`);
      }
      identities.push({
        documentId: document.documentId,
        sectionKey: section.sectionKey,
        sourceOrdinal: section.sourceOrdinal,
        documentSectionId: row.documentSectionId,
      });
    }
    for (const alias of document.legacyAliases) {
      legacyAliases.push({
        documentId: document.documentId,
        legacySectionId: alias.legacySectionId,
        sectionKey: alias.targetSectionKey,
        sourceOrdinal: alias.targetSourceOrdinal,
      });
    }
  }
  if (rowsByDocument.size !== compilation.map.documents.length) {
    throw new Error('Transform 8 materialized rows include a document outside the manifest-bound map');
  }
  if (deliveryProfiles.length !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.historical_document_delivery_profiles
    || identities.length !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.historical_section_identities
    || legacyAliases.length !== HISTORICAL_SECTION_TRANSFORM_8_COUNTS.historical_section_aliases) {
    throw new Error('Transform 8 sidecar rows do not retain the exact reviewed inventory');
  }
  return { deliveryProfiles, identities, legacyAliases };
}

/** Content-bearing rows must be byte-for-byte identical across sidecar writes. */
export function historicalSectionBodyProjectionSha256(
  rows: readonly HistoricalSectionMaterializedRow[],
): string {
  return sha256Canonical([...rows]
    .sort((left, right) => left.documentSectionId - right.documentSectionId)
    .map(row => ({
      documentSectionId: row.documentSectionId,
      documentId: row.documentId,
      sourceOrdinal: row.sourceOrdinal,
      legacySectionId: row.legacySectionId,
      title: row.title,
      content: row.content,
      topics: row.topics,
    })));
}

function isJsonObject(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}
