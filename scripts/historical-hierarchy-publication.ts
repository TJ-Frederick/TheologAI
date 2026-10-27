/**
 * Transform-10 PR A dormant delivery projection for immutable hierarchies.
 *
 * This intentionally creates only a reviewed, immutable publication contract.
 * It does not create a legacy document, expose an MCP resource, or change the
 * hierarchy's local_only_inactive authority availability.
 */

import type Database from 'better-sqlite3';
import { sha256Hex } from '../src/kernel/sha256.js';
import { buildHistoricalHierarchyResourceUri } from '../src/kernel/historicalHierarchyResource.js';
import type {
  HistoricalHierarchyPublication,
  HistoricalHierarchyPublicationCoverage,
  HistoricalHierarchyPublicationMetadata,
} from '../src/kernel/repositories.js';
import {
  AQUINAS_HIERARCHY_EXPECTED,
  assertApprovedAquinasHierarchy,
  type HistoricalEditionHierarchyMaterialization,
} from './historical-hierarchy.js';

export const AQUINAS_HIERARCHY_PUBLICATION_EXPECTED = Object.freeze({
  publicationId: 'summa-theologiae-english-dominican-v1',
  publicSlug: 'summa-theologiae',
  deliveryKind: 'hierarchy_nodes_v1' as const,
  cursorContract: 'historical-hierarchy-browse-cursor-v1' as const,
  browsePageSize: 32,
  landingMaxBytes: 8_192,
  directoryMaxBytes: 16_384,
  nodeMaxBytes: 65_536,
  searchMaxBytes: 16_384,
  activationState: 'dormant' as const,
} as const);

export type HistoricalHierarchyPublicationMaterialization = HistoricalHierarchyPublication;

function coverageDisclosure(): HistoricalHierarchyPublicationCoverage {
  return {
    statement: 'Includes Prima (q1–119), Prima Secundae (q1–114), Secunda Secundae (q1–189), and Tertia through q90. Tertia q91+ and the traditional Supplement are excluded.',
    descriptors: [
      { relationship: 'included', label: 'Prima', address: { scheme: 'question', start: '1', end: '119' } },
      { relationship: 'included', label: 'Prima Secundae', address: { scheme: 'question', start: '1', end: '114' } },
      { relationship: 'included', label: 'Secunda Secundae', address: { scheme: 'question', start: '1', end: '189' } },
      { relationship: 'included', label: 'Tertia', address: { scheme: 'question', start: '1', end: '90' } },
      { relationship: 'excluded', label: 'Tertia q91+', address: { scheme: 'question', start: '91', end: null } },
      { relationship: 'excluded', label: 'Traditional Supplement', address: { scheme: 'part', start: 'Supplement', end: null } },
    ],
    completeness: 'not_complete_traditional_summa_theologiae',
  };
}

function metadata(): HistoricalHierarchyPublicationMetadata {
  return {
    creators: [{ name: 'Thomas Aquinas', role: 'author' }],
    documentType: 'scholastic_theology',
    language: 'English',
    editionLabel: 'English Dominican Province / Benziger Brothers translation; Project Gutenberg electronic edition',
    rightsStatus: 'public_domain_in_usa',
    territoryCaveat: AQUINAS_HIERARCHY_EXPECTED.territoryCaveat,
  };
}

function cursorIdentity(publication: Omit<HistoricalHierarchyPublication, 'cursorIdentity'>): string {
  return sha256Hex(JSON.stringify({
    contract: publication.cursorContract,
    hierarchyId: publication.hierarchyId,
    publicationId: publication.publicationId,
    publicSlug: publication.publicSlug,
    deliveryKind: publication.deliveryKind,
    browsePageSize: publication.browsePageSize,
  }));
}

function approvedUnsignedPublication(
  hierarchy: HistoricalEditionHierarchyMaterialization,
): Omit<HistoricalHierarchyPublication, 'cursorIdentity'> {
  const canonicalUri = buildHistoricalHierarchyResourceUri(AQUINAS_HIERARCHY_PUBLICATION_EXPECTED.publicSlug);
  if (!canonicalUri) throw new Error('Transform 10 publication canonical URI is invalid');
  return {
    publicationId: AQUINAS_HIERARCHY_PUBLICATION_EXPECTED.publicationId,
    hierarchyId: hierarchy.hierarchy.hierarchyId,
    publicSlug: AQUINAS_HIERARCHY_PUBLICATION_EXPECTED.publicSlug,
    title: hierarchy.work.title,
    metadata: metadata(),
    deliveryKind: AQUINAS_HIERARCHY_PUBLICATION_EXPECTED.deliveryKind,
    coverage: coverageDisclosure(),
    cursorContract: AQUINAS_HIERARCHY_PUBLICATION_EXPECTED.cursorContract,
    browsePageSize: AQUINAS_HIERARCHY_PUBLICATION_EXPECTED.browsePageSize,
    landingMaxBytes: AQUINAS_HIERARCHY_PUBLICATION_EXPECTED.landingMaxBytes,
    directoryMaxBytes: AQUINAS_HIERARCHY_PUBLICATION_EXPECTED.directoryMaxBytes,
    nodeMaxBytes: AQUINAS_HIERARCHY_PUBLICATION_EXPECTED.nodeMaxBytes,
    searchMaxBytes: AQUINAS_HIERARCHY_PUBLICATION_EXPECTED.searchMaxBytes,
    canonicalUri,
    activationState: AQUINAS_HIERARCHY_PUBLICATION_EXPECTED.activationState,
  };
}

/** Canonical JSON equality rejects omitted, altered, and unexpected contract members. */
function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Transform 10 publication contract cannot contain a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new Error('Transform 10 publication contract must contain only JSON values');
}

/** Create the exact reviewed Aquinas delivery contract from its authority profile. */
export function loadApprovedAquinasHierarchyPublication(
  hierarchy: HistoricalEditionHierarchyMaterialization,
): HistoricalHierarchyPublicationMaterialization {
  const unsigned = approvedUnsignedPublication(hierarchy);
  const publication = { ...unsigned, cursorIdentity: cursorIdentity(unsigned) };
  assertApprovedAquinasHierarchyPublication(publication, hierarchy);
  return publication;
}

export function assertApprovedAquinasHierarchyPublication(
  publication: HistoricalHierarchyPublication,
  hierarchy: HistoricalEditionHierarchyMaterialization,
): void {
  assertApprovedAquinasHierarchy(hierarchy);
  const { cursorIdentity: storedCursorIdentity, ...unsigned } = publication;
  const expectedUnsigned = approvedUnsignedPublication(hierarchy);
  if (canonicalJson(unsigned) !== canonicalJson(expectedUnsigned)
    || storedCursorIdentity !== cursorIdentity(expectedUnsigned)) {
    throw new Error('Transform 10 dormant publication projection drifted from its approved hierarchy contract');
  }
  if (hierarchy.bodies.some(body => body.contentUtf8Bytes > publication.nodeMaxBytes)) {
    throw new Error('Transform 10 dormant publication node budget drifted');
  }
}

/** Insert only a projection record; authority bodies and legacy documents are untouched. */
export function materializeHistoricalHierarchyPublication(
  db: Database.Database,
  publication: HistoricalHierarchyPublicationMaterialization,
  hierarchy: HistoricalEditionHierarchyMaterialization,
): void {
  assertApprovedAquinasHierarchyPublication(publication, hierarchy);
  db.prepare(`INSERT INTO historical_hierarchy_publications (
    publication_id, hierarchy_id, public_slug, title, metadata_json, delivery_kind,
    coverage_json, cursor_contract, cursor_identity, browse_page_size,
    landing_max_bytes, directory_max_bytes, node_max_bytes, search_max_bytes,
    canonical_uri, activation_state
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      publication.publicationId, publication.hierarchyId, publication.publicSlug, publication.title,
      JSON.stringify(publication.metadata), publication.deliveryKind, JSON.stringify(publication.coverage),
      publication.cursorContract, publication.cursorIdentity, publication.browsePageSize,
      publication.landingMaxBytes, publication.directoryMaxBytes, publication.nodeMaxBytes, publication.searchMaxBytes,
      publication.canonicalUri, publication.activationState,
    );
  assertHistoricalHierarchyPublicationStoredIntegrity(db, publication, hierarchy);
}

/** Verify that the projection added no authority-body or legacy-document copy. */
export function assertHistoricalHierarchyPublicationStoredIntegrity(
  db: Database.Database,
  expected: HistoricalHierarchyPublication,
  hierarchy: HistoricalEditionHierarchyMaterialization,
): void {
  assertApprovedAquinasHierarchyPublication(expected, hierarchy);
  const row = db.prepare(`SELECT publication_id AS publicationId, hierarchy_id AS hierarchyId, public_slug AS publicSlug,
    title, metadata_json AS metadataJson, delivery_kind AS deliveryKind, coverage_json AS coverageJson,
    cursor_contract AS cursorContract, cursor_identity AS cursorIdentity, browse_page_size AS browsePageSize,
    landing_max_bytes AS landingMaxBytes, directory_max_bytes AS directoryMaxBytes,
    node_max_bytes AS nodeMaxBytes, search_max_bytes AS searchMaxBytes,
    canonical_uri AS canonicalUri, activation_state AS activationState
    FROM historical_hierarchy_publications WHERE publication_id = ?`).get(expected.publicationId) as Record<string, unknown> | undefined;
  const noDocumentProjection = db.prepare('SELECT COUNT(*) AS count FROM documents WHERE id = ?')
    .get(hierarchy.work.workId) as { count: number };
  const bodyCount = db.prepare('SELECT COUNT(*) AS count FROM historical_edition_hierarchy_bodies WHERE hierarchy_id = ?')
    .get(expected.hierarchyId) as { count: number };
  const ftsCount = db.prepare('SELECT COUNT(*) AS count FROM historical_edition_hierarchy_bodies_fts WHERE hierarchy_id = ?')
    .get(expected.hierarchyId) as { count: number };
  const authority = db.prepare('SELECT availability FROM historical_edition_hierarchies WHERE hierarchy_id = ?')
    .get(expected.hierarchyId) as { availability: string } | undefined;
  const stored = row === undefined ? undefined : {
    publicationId: row.publicationId, hierarchyId: row.hierarchyId, publicSlug: row.publicSlug, title: row.title,
    metadata: JSON.parse(String(row.metadataJson)), deliveryKind: row.deliveryKind,
    coverage: JSON.parse(String(row.coverageJson)), cursorContract: row.cursorContract,
    cursorIdentity: row.cursorIdentity, browsePageSize: row.browsePageSize,
    landingMaxBytes: row.landingMaxBytes, directoryMaxBytes: row.directoryMaxBytes,
    nodeMaxBytes: row.nodeMaxBytes, searchMaxBytes: row.searchMaxBytes,
    canonicalUri: row.canonicalUri, activationState: row.activationState,
  };
  const expectedStored = {
    publicationId: expected.publicationId, hierarchyId: expected.hierarchyId, publicSlug: expected.publicSlug,
    title: expected.title, metadata: expected.metadata, deliveryKind: expected.deliveryKind,
    coverage: expected.coverage, cursorContract: expected.cursorContract, cursorIdentity: expected.cursorIdentity,
    browsePageSize: expected.browsePageSize, landingMaxBytes: expected.landingMaxBytes,
    directoryMaxBytes: expected.directoryMaxBytes, nodeMaxBytes: expected.nodeMaxBytes,
    searchMaxBytes: expected.searchMaxBytes, canonicalUri: expected.canonicalUri,
    activationState: expected.activationState,
  };
  if (JSON.stringify(stored) !== JSON.stringify(expectedStored)
    || authority?.availability !== 'local_only_inactive'
    || noDocumentProjection.count !== 0
    || bodyCount.count !== hierarchy.bodies.length
    || ftsCount.count !== hierarchy.bodies.length) {
    throw new Error('Transform 10 dormant publication projection changed authority conservation boundaries');
  }
}
