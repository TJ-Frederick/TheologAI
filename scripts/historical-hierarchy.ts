/**
 * Transform-10 local materializer for an edition-scoped authority hierarchy.
 *
 * The only current input is the reviewed Aquinas packet, but table shape and
 * level validation are generic.  This script deliberately makes no document,
 * catalogue, runtime composition, resource, or MCP projection.
 */

import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  AquinasAuthorityBody,
  AquinasCapacityInput,
  AquinasNavigationNode,
  AquinasPackageReader,
} from './aquinas-source-pack-capacity-comparison.js';

const ACQUISITION_DIRECTORY = 'data/historical-sources/project-gutenberg/aquinas-english-dominican';
const PACKAGE_DIRECTORY = `${ACQUISITION_DIRECTORY}/packages/aquinas-summa-pg-v1`;

export const AQUINAS_HIERARCHY_ID = 'aquinas-summa-pg-v1-local-hierarchy';
/** @deprecated Name retained for local Transform-10 callers. */
export const AQUINAS_HIERARCHY_PROFILE_ID = AQUINAS_HIERARCHY_ID;
export const AQUINAS_HIERARCHY_EXPECTED = Object.freeze({
  hierarchyId: AQUINAS_HIERARCHY_ID,
  packId: 'aquinas-summa-pg-v1',
  workId: 'thomas-aquinas-summa-theologiae',
  editionId: 'aquinas-summa-english-dominican-gutenberg-electronic',
  availability: 'local_only_inactive',
  bodies: 3184,
  nodes: 3185,
  parts: 4,
  questions: 512,
  articles: 2669,
  artifacts: 4,
  sourceManifestSha256: 'b9d25c13ec6e59312ff8ecbf8d630a1875b8b253baac0d816cc9b9daf9618215',
  aggregateSha256: '76be93e0af83df8e46bbc84aadee07d8c27f2324b024b7338a44cf922e5507fa',
  orderedQuestionKeysSha256: '1c3cfe11af52a7e29a09aae6ce64e854eac18bc96e5b05c55f8200e407022049',
  orderedArticleKeysSha256: '6cfcf13360da2d30464ab48268c71b4d1b8408d7971ba497b41ddcce30ed79bd',
  sourceLockSha256: 'c5cfdd1edd132bf59968cbabe4c7de2180c42d205735ca6c06aec626104a180b',
  localReceiptSha256: 'bc0dab9ce5dc3672ccf2a81182655c75eaf6ef4f280584a40e079bf82a11719d',
  topologyLockSha256: 'ce6197ba036ec7200f43513f9e6676ccfd5cb5a4727077a440770416bdf6978b',
  discrepancyLedgerSha256: 'c8e10cbf29d710b89fe48aa91d18f25489c96039116e53254d0592dfb0b68120',
  rightsStatus: 'public_domain_in_usa',
  territoryCaveat: 'The catalog statement and internal notice support a United States position only; this lock makes no worldwide public-domain conclusion.',
  artifactPins: [
    ['pg-17611', 'https://www.gutenberg.org/cache/epub/17611/pg17611-h.zip', 'cd67660a85693de3ead953162db89677a29d59c6fc739e6faf0b4fb4f57fb8b2', 970487],
    ['pg-17897', 'https://www.gutenberg.org/cache/epub/17897/pg17897-h.zip', '378ad159b217adfa26868e1600319125a63202fd955e96ab8aca51961229d698', 979217],
    ['pg-18755', 'https://www.gutenberg.org/cache/epub/18755/pg18755-h.zip', '3d8d24ff85ac392fc2d3da6563d75362ae388ef9dc5403573ab769cebf967146', 1436264],
    ['pg-19950', 'https://www.gutenberg.org/cache/epub/19950/pg19950-h.zip', 'ac431f87de4a2fa9edb5cf0b02134c45a79e48fea3b9c3ee9f3c10cf183e52b8', 949369],
  ] as const,
} as const);

export interface HistoricalEditionHierarchyRecord {
  hierarchyId: string;
  packId: string;
  workId: string;
  editionId: string;
  availability: string;
  hierarchySchemaVersion: string;
  levelSpec: Record<string, unknown>;
  sourceManifestSha256: string;
  aggregateSha256: string;
  orderedQuestionKeysSha256: string;
  orderedArticleKeysSha256: string;
  sourceLockSha256: string;
  localReceiptSha256: string;
  topologyLockSha256: string;
  discrepancyLedgerSha256: string;
  authorityBodiesSha256: string;
  navigationPreorderSha256: string;
  bodyCount: number;
  nodeCount: number;
  coverage: Record<string, unknown>;
  provenance: Record<string, unknown>;
}

export interface HistoricalEditionHierarchyBodyRecord {
  hierarchyId: string;
  bodyKey: string;
  bodyKind: string;
  sourceOrdinal: number;
  heading: string;
  contentSha256: string;
  contentUtf8Bytes: number;
  content: string;
}

export interface HistoricalEditionHierarchyNodeRecord {
  hierarchyId: string;
  nodeKey: string;
  parentNodeKey: string | null;
  nodeKind: string;
  bodyKey: string | null;
  depth: number;
  flatOrdinal: number;
  siblingOrdinal: number;
  label: string;
  heading: string;
}

export interface HistoricalEditionHierarchyArtifactRecord {
  artifactId: string;
  editionId: string;
  role: 'authority';
  locator: string;
  sha256: string;
  bytes: number;
  acquiredAt: string;
}

export interface HistoricalEditionHierarchyMaterialization {
  hierarchy: HistoricalEditionHierarchyRecord;
  sourcePack: { packId: string; revision: string; schemaVersion: string; manifestSha256: string; sourcePath: string };
  work: { workId: string; title: string; creatorMetadataStatus: string; creators: Array<Record<string, unknown>> };
  edition: {
    editionId: string; workId: string; packId: string; language: string; contributorGroups: Record<string, unknown>;
    publication: string; version: string; provenanceStatus: 'verified'; provenanceUncertainty: string | null;
    provenanceReviewedAt: string; underlyingWorkRights: Record<string, unknown>; exactArtifactRights: Record<string, unknown>;
    normalizedTextRights: Record<string, unknown>;
  };
  artifacts: HistoricalEditionHierarchyArtifactRecord[];
  bodies: HistoricalEditionHierarchyBodyRecord[];
  nodes: HistoricalEditionHierarchyNodeRecord[];
}

export interface HistoricalHierarchyMaterializationCounts {
  hierarchies: number;
  artifacts: number;
  bodies: number;
  nodes: number;
  ftsRows: number;
}

export interface HierarchySourceReader extends AquinasPackageReader {}

function sha256(value: Uint8Array | string): string { return createHash('sha256').update(value).digest('hex'); }
function hashRecords(values: Iterable<unknown>): string {
  const hash = createHash('sha256');
  for (const value of values) hash.update(`${JSON.stringify(value)}\n`);
  return hash.digest('hex');
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be non-empty text`);
  return value;
}
function heading(content: string): string {
  return content.split(/\r?\n/).map(value => value.trim()).find(Boolean)?.slice(0, 500) ?? 'Untitled authority body';
}
function partLabel(partKey: string): string {
  return ({ prima: 'Prima Pars', 'prima-secundae': 'Prima Secundae', 'secunda-secundae': 'Secunda Secundae', tertia: 'Tertia Pars' } as Record<string, string>)[partKey] ?? partKey;
}
function bodyKind(body: AquinasAuthorityBody): string { return body.kind; }
function nodeKind(node: AquinasNavigationNode): string { return node.kind; }

function levelSpec(): Record<string, unknown> {
  return {
    maxDepth: 3,
    levels: [
      { depth: 1, nodeKind: 'part', parentNodeKinds: [], bodyKinds: ['part_prologue'], bodyRequired: false },
      { depth: 2, nodeKind: 'question', parentNodeKinds: ['part'], bodyKinds: ['preamble'], bodyRequired: true },
      { depth: 3, nodeKind: 'article', parentNodeKinds: ['question'], bodyKinds: ['article'], bodyRequired: true },
    ],
  };
}

function coverageDisclosure(): Record<string, unknown> {
  return {
    approvedEditionScope: {
      prima: { firstQuestion: 1, lastQuestion: 119 },
      primaSecundae: { firstQuestion: 1, lastQuestion: 114 },
      secundaSecundae: { firstQuestion: 1, lastQuestion: 189 },
      tertia: { firstQuestion: 1, lastQuestion: 90 },
    },
    exclusions: [
      'Tertia questions 91 and later are not included.',
      'The Supplement is not included.',
      'Source wrappers, licenses, editorial interludes, structural metadata, and tables of contents are not authority bodies.',
    ],
    disclosure: 'This approved edition scope is not a complete traditional Summa Theologiae.',
  };
}

function sourceFacts(reader: HierarchySourceReader): {
  acquiredAt: string; sourceLock: Record<string, unknown>; receipt: Record<string, unknown>; manifest: Record<string, unknown>;
} {
  const sourceLock = object(JSON.parse(reader.read(`${ACQUISITION_DIRECTORY}/SOURCE_LOCK.json`).toString('utf8')), 'Aquinas source lock');
  const receipt = object(JSON.parse(reader.read(`${ACQUISITION_DIRECTORY}/LOCAL_ACQUISITION_RECEIPT.json`).toString('utf8')), 'Aquinas receipt');
  const manifest = object(JSON.parse(reader.read(`${PACKAGE_DIRECTORY}/manifest.json`).toString('utf8')), 'Aquinas package manifest');
  if (sha256(reader.read(`${ACQUISITION_DIRECTORY}/SOURCE_LOCK.json`)) !== AQUINAS_HIERARCHY_EXPECTED.sourceLockSha256
    || sha256(reader.read(`${ACQUISITION_DIRECTORY}/LOCAL_ACQUISITION_RECEIPT.json`)) !== AQUINAS_HIERARCHY_EXPECTED.localReceiptSha256
    || sha256(reader.read(`${PACKAGE_DIRECTORY}/manifest.json`)) !== AQUINAS_HIERARCHY_EXPECTED.sourceManifestSha256) {
    throw new Error('Transform 10 source facts differ from the reviewed Aquinas locks');
  }
  const acquiredAt = string(receipt.acquiredAt, 'Aquinas receipt acquiredAt');
  return { acquiredAt, sourceLock, receipt, manifest };
}

function provenance(sourceLock: Record<string, unknown>): Record<string, unknown> {
  const rights = object(sourceLock.rightsAndProvenance, 'Aquinas rights and provenance');
  const edition = object(rights.electronicEditionProvenance, 'Aquinas electronic edition provenance');
  const rightsStatus = string(rights.rightsStatus, 'Aquinas rights status');
  const territoryCaveat = string(rights.territoryCaveat, 'Aquinas territory caveat');
  if (rightsStatus !== AQUINAS_HIERARCHY_EXPECTED.rightsStatus || territoryCaveat !== AQUINAS_HIERARCHY_EXPECTED.territoryCaveat) {
    throw new Error('Transform 10 must preserve the reviewed US-only public-domain caveat');
  }
  return {
    status: 'local_only_inactive',
    rightsStatus,
    territoryCaveat,
    catalogStatement: string(rights.catalogStatement, 'Aquinas catalog statement'),
    edition: {
      translator: string(edition.translator, 'Aquinas translator'),
      printedTranslationPublisher: string(edition.printedTranslationPublisher, 'Aquinas publisher'),
      sourceEtextCreator: string(edition.sourceEtextCreator, 'Aquinas source e-text creator'),
      sourceEtextAvailability: string(edition.sourceEtextAvailability, 'Aquinas source e-text availability'),
      electronicEditionEditor: string(edition.electronicEditionEditor, 'Aquinas electronic edition editor'),
      disclosedEditorActions: edition.disclosedEditorActions,
      ccelBoundary: string(edition.ccelBoundary, 'Aquinas CCEL boundary'),
    },
    activation: 'No document projection, catalogue registration, runtime composition, resource, or MCP tool is authorized by this materialization.',
  };
}

function bodyRecord(body: AquinasAuthorityBody): HistoricalEditionHierarchyBodyRecord {
  return {
    hierarchyId: AQUINAS_HIERARCHY_ID,
    bodyKey: body.bodyId,
    bodyKind: bodyKind(body),
    sourceOrdinal: body.sourceOrdinal,
    heading: heading(body.content),
    contentSha256: sha256(body.content),
    contentUtf8Bytes: Buffer.byteLength(body.content, 'utf8'),
    content: body.content,
  };
}

function nodeRecord(node: AquinasNavigationNode, bodies: Map<string, HistoricalEditionHierarchyBodyRecord>): HistoricalEditionHierarchyNodeRecord {
  const depth = node.kind === 'part' ? 1 : node.kind === 'question' ? 2 : 3;
  const body = node.bodyId === null ? undefined : bodies.get(node.bodyId);
  const label = node.kind === 'part' ? partLabel(node.partKey)
    : node.kind === 'question' ? `Question ${node.questionKey?.split('.q')[1] ?? node.nodeId}`
      : `Article ${node.articleKey?.split('.a')[1] ?? node.nodeId}`;
  return {
    hierarchyId: AQUINAS_HIERARCHY_ID,
    nodeKey: node.nodeId,
    parentNodeKey: node.parentId,
    nodeKind: nodeKind(node),
    bodyKey: node.bodyId,
    depth,
    flatOrdinal: node.flatOrdinal,
    siblingOrdinal: node.siblingOrdinal,
    label,
    heading: body?.heading ?? label,
  };
}

function assertGenericPreorder(nodes: readonly HistoricalEditionHierarchyNodeRecord[]): void {
  if (nodes.some((node, index) => node.flatOrdinal !== index + 1)) throw new Error('Transform 10 hierarchy flat ordinals must be contiguous');
  const nodeByKey = new Map(nodes.map(node => [node.nodeKey, node]));
  const groups = new Map<string | null, HistoricalEditionHierarchyNodeRecord[]>();
  for (const node of nodes) {
    if (node.parentNodeKey !== null && !nodeByKey.has(node.parentNodeKey)) throw new Error('Transform 10 hierarchy has a missing parent');
    const group = groups.get(node.parentNodeKey) ?? [];
    group.push(node); groups.set(node.parentNodeKey, group);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => left.siblingOrdinal - right.siblingOrdinal || left.nodeKey.localeCompare(right.nodeKey));
    if (group.some((node, index) => node.siblingOrdinal !== index + 1)) throw new Error('Transform 10 hierarchy sibling ordinals must be locally contiguous');
  }
  const ordered: HistoricalEditionHierarchyNodeRecord[] = [];
  const visit = (parent: string | null): void => {
    for (const node of groups.get(parent) ?? []) { ordered.push(node); visit(node.nodeKey); }
  };
  visit(null);
  if (ordered.length !== nodes.length || ordered.some((node, index) => node.nodeKey !== nodes[index]?.nodeKey)) {
    throw new Error('Transform 10 hierarchy flat ordinals must equal preorder traversal');
  }
}

/**
 * Build the exact hierarchy record from an already attested packet input.
 * Keeping packet loading in the capacity module prevents a runtime ESM cycle:
 * this materializer consumes dependency-injected facts and exposes no loader.
 */
export function buildApprovedAquinasHierarchy(
  reader: HierarchySourceReader,
  input: AquinasCapacityInput,
  layout: { authorityBodies: readonly AquinasAuthorityBody[]; navigationNodes: readonly AquinasNavigationNode[] },
): HistoricalEditionHierarchyMaterialization {
  const facts = sourceFacts(reader);
  const hierarchyProvenance = provenance(facts.sourceLock);
  const bodies = layout.authorityBodies.map(bodyRecord);
  const bodyByKey = new Map(bodies.map(body => [body.bodyKey, body]));
  const nodes = layout.navigationNodes.map(node => nodeRecord(node, bodyByKey));
  const sourceManifestSha256 = input.sourceHashes.manifestSha256;
  const sourcePack = {
    packId: AQUINAS_HIERARCHY_EXPECTED.packId,
    revision: 'locked-project-gutenberg-aquinas-v1',
    schemaVersion: string(facts.manifest.schemaVersion, 'Aquinas package schema version'),
    manifestSha256: sourceManifestSha256,
    sourcePath: PACKAGE_DIRECTORY,
  };
  const work = {
    workId: AQUINAS_HIERARCHY_EXPECTED.workId,
    title: 'Summa Theologiae',
    creatorMetadataStatus: 'reviewed',
    creators: [{ name: 'Thomas Aquinas', role: 'author' }],
  };
  const edition = {
    editionId: AQUINAS_HIERARCHY_EXPECTED.editionId,
    workId: work.workId,
    packId: sourcePack.packId,
    language: 'English',
    contributorGroups: hierarchyProvenance.edition as Record<string, unknown>,
    publication: 'Benziger Brothers',
    version: 'Project Gutenberg electronic edition of the English Dominican Province/Benziger translation',
    provenanceStatus: 'verified' as const,
    provenanceUncertainty: null,
    provenanceReviewedAt: facts.acquiredAt,
    underlyingWorkRights: { status: hierarchyProvenance.rightsStatus, territoryCaveat: hierarchyProvenance.territoryCaveat },
    exactArtifactRights: {
      status: hierarchyProvenance.rightsStatus,
      territoryCaveat: hierarchyProvenance.territoryCaveat,
      catalogStatement: hierarchyProvenance.catalogStatement,
      sourceLockSha256: input.sourceHashes.sourceLockSha256,
    },
    normalizedTextRights: {
      status: 'not_projected', scope: 'local_only_inactive_authority_bodies',
      basis: 'No public document or normalized-text projection is created by Transform 10.', reviewedAt: facts.acquiredAt,
    },
  };
  const artifacts = input.sourceArtifacts.map(artifact => ({
    artifactId: artifact.artifactId, editionId: edition.editionId, role: 'authority' as const,
    locator: artifact.locator, sha256: artifact.sha256, bytes: artifact.bytes, acquiredAt: artifact.acquiredAt,
  }));
  const hierarchy: HistoricalEditionHierarchyRecord = {
    hierarchyId: AQUINAS_HIERARCHY_ID,
    packId: sourcePack.packId,
    workId: work.workId,
    editionId: edition.editionId,
    availability: AQUINAS_HIERARCHY_EXPECTED.availability,
    hierarchySchemaVersion: 'edition-hierarchy.v1',
    levelSpec: levelSpec(),
    sourceManifestSha256,
    aggregateSha256: input.sourceHashes.aggregateSha256,
    orderedQuestionKeysSha256: input.sourceHashes.orderedQuestionKeysSha256,
    orderedArticleKeysSha256: input.sourceHashes.orderedArticleKeysSha256,
    sourceLockSha256: input.sourceHashes.sourceLockSha256,
    localReceiptSha256: input.sourceHashes.localReceiptSha256,
    topologyLockSha256: input.sourceHashes.topologyLockSha256,
    discrepancyLedgerSha256: input.sourceHashes.discrepancyLedgerSha256,
    authorityBodiesSha256: hashRecords(bodies.map(({ content, ...body }) => ({ ...body, contentSha256: sha256(content) }))),
    navigationPreorderSha256: hashRecords(nodes),
    bodyCount: bodies.length,
    nodeCount: nodes.length,
    coverage: coverageDisclosure(),
    provenance: hierarchyProvenance,
  };
  const materialization = { hierarchy, sourcePack, work, edition, artifacts, bodies, nodes };
  assertApprovedAquinasHierarchy(materialization);
  return materialization;
}

/** Independent audit of all reviewed profile, source, body, and navigation facts. */
export function assertApprovedAquinasHierarchy(materialization: HistoricalEditionHierarchyMaterialization): void {
  const { hierarchy, sourcePack, work, edition, artifacts, bodies, nodes } = materialization;
  if (hierarchy.hierarchyId !== AQUINAS_HIERARCHY_EXPECTED.hierarchyId
    || hierarchy.packId !== AQUINAS_HIERARCHY_EXPECTED.packId
    || hierarchy.workId !== AQUINAS_HIERARCHY_EXPECTED.workId
    || hierarchy.editionId !== AQUINAS_HIERARCHY_EXPECTED.editionId
    || hierarchy.availability !== AQUINAS_HIERARCHY_EXPECTED.availability
    || hierarchy.bodyCount !== AQUINAS_HIERARCHY_EXPECTED.bodies
    || hierarchy.nodeCount !== AQUINAS_HIERARCHY_EXPECTED.nodes
    || bodies.length !== AQUINAS_HIERARCHY_EXPECTED.bodies
    || nodes.length !== AQUINAS_HIERARCHY_EXPECTED.nodes
    || artifacts.length !== AQUINAS_HIERARCHY_EXPECTED.artifacts
    || sourcePack.packId !== hierarchy.packId || work.workId !== hierarchy.workId
    || edition.editionId !== hierarchy.editionId || edition.workId !== work.workId || edition.packId !== sourcePack.packId) {
    throw new Error('Transform 10 must retain the exact inactive Aquinas hierarchy identity and inventory');
  }
  const fixedHashes = [
    hierarchy.sourceManifestSha256, hierarchy.aggregateSha256, hierarchy.orderedQuestionKeysSha256,
    hierarchy.orderedArticleKeysSha256, hierarchy.sourceLockSha256, hierarchy.localReceiptSha256,
    hierarchy.topologyLockSha256, hierarchy.discrepancyLedgerSha256, hierarchy.authorityBodiesSha256,
    hierarchy.navigationPreorderSha256,
  ];
  if (fixedHashes.some(value => !/^[0-9a-f]{64}$/.test(value))
    || hierarchy.sourceManifestSha256 !== AQUINAS_HIERARCHY_EXPECTED.sourceManifestSha256
    || hierarchy.aggregateSha256 !== AQUINAS_HIERARCHY_EXPECTED.aggregateSha256
    || hierarchy.orderedQuestionKeysSha256 !== AQUINAS_HIERARCHY_EXPECTED.orderedQuestionKeysSha256
    || hierarchy.orderedArticleKeysSha256 !== AQUINAS_HIERARCHY_EXPECTED.orderedArticleKeysSha256
    || hierarchy.sourceLockSha256 !== AQUINAS_HIERARCHY_EXPECTED.sourceLockSha256
    || hierarchy.localReceiptSha256 !== AQUINAS_HIERARCHY_EXPECTED.localReceiptSha256
    || hierarchy.topologyLockSha256 !== AQUINAS_HIERARCHY_EXPECTED.topologyLockSha256
    || hierarchy.discrepancyLedgerSha256 !== AQUINAS_HIERARCHY_EXPECTED.discrepancyLedgerSha256) {
    throw new Error('Transform 10 fixed profile hashes drifted from the reviewed packet');
  }
  const expectedArtifacts = AQUINAS_HIERARCHY_EXPECTED.artifactPins;
  if (JSON.stringify(artifacts.map(artifact => [artifact.artifactId, artifact.locator, artifact.sha256, artifact.bytes])) !== JSON.stringify(expectedArtifacts)
    || artifacts.some(artifact => artifact.editionId !== edition.editionId || artifact.role !== 'authority' || !/^\d{4}-\d{2}-\d{2}T/.test(artifact.acquiredAt))) {
    throw new Error('Transform 10 must preserve every exact reviewed Gutenberg artifact locator, hash, bytes, and acquisition time');
  }
  const hierarchyProvenance = hierarchy.provenance;
  if (hierarchyProvenance.rightsStatus !== AQUINAS_HIERARCHY_EXPECTED.rightsStatus
    || hierarchyProvenance.territoryCaveat !== AQUINAS_HIERARCHY_EXPECTED.territoryCaveat
    || edition.underlyingWorkRights.status !== AQUINAS_HIERARCHY_EXPECTED.rightsStatus
    || edition.exactArtifactRights.territoryCaveat !== AQUINAS_HIERARCHY_EXPECTED.territoryCaveat
    || edition.publication !== 'Benziger Brothers' || edition.language !== 'English') {
    throw new Error('Transform 10 edition provenance or territory caveat drifted');
  }
  if (new Set(bodies.map(body => body.bodyKey)).size !== bodies.length
    || new Set(bodies.map(body => body.sourceOrdinal)).size !== bodies.length
    || new Set(nodes.map(node => node.nodeKey)).size !== nodes.length
    || new Set(nodes.map(node => node.flatOrdinal)).size !== nodes.length
    || bodies.some(body => body.contentSha256 !== sha256(body.content) || body.contentUtf8Bytes !== Buffer.byteLength(body.content, 'utf8'))
    || hierarchy.authorityBodiesSha256 !== hashRecords(bodies.map(({ content, ...body }) => ({ ...body, contentSha256: sha256(content) })))) {
    throw new Error('Transform 10 authority-body identity drifted');
  }
  const bodyKeys = new Set(bodies.map(body => body.bodyKey));
  const attachedBodyKeys = nodes.flatMap(node => node.bodyKey === null ? [] : [node.bodyKey]);
  if (attachedBodyKeys.length !== bodies.length || new Set(attachedBodyKeys).size !== bodies.length
    || attachedBodyKeys.some(key => !bodyKeys.has(key))) throw new Error('Transform 10 must attach every authority body exactly once');
  const nodeCounts = new Map(nodes.map(node => [node.nodeKind, 0]));
  for (const node of nodes) nodeCounts.set(node.nodeKind, (nodeCounts.get(node.nodeKind) ?? 0) + 1);
  if (nodeCounts.get('part') !== AQUINAS_HIERARCHY_EXPECTED.parts
    || nodeCounts.get('question') !== AQUINAS_HIERARCHY_EXPECTED.questions
    || nodeCounts.get('article') !== AQUINAS_HIERARCHY_EXPECTED.articles
    || hierarchy.navigationPreorderSha256 !== hashRecords(nodes)) throw new Error('Transform 10 hierarchy topology hash drifted');
  assertGenericPreorder(nodes);
}

/** Materialize hierarchy authority and its exact existing-source lineage only. */
export function materializeHistoricalHierarchy(
  db: Database.Database,
  materialization: HistoricalEditionHierarchyMaterialization,
): HistoricalHierarchyMaterializationCounts {
  assertApprovedAquinasHierarchy(materialization);
  const pack = db.prepare('INSERT INTO historical_source_packs (pack_id, revision, schema_version, manifest_sha256, source_path) VALUES (?, ?, ?, ?, ?)');
  const work = db.prepare('INSERT INTO historical_works (work_id, title, creator_metadata_status, creators_json) VALUES (?, ?, ?, ?)');
  const edition = db.prepare(`INSERT INTO historical_editions (
    edition_id, work_id, pack_id, language, contributor_groups_json, publication, version,
    provenance_status, provenance_uncertainty, provenance_reviewed_at, underlying_work_rights_json,
    exact_artifact_rights_json, normalized_text_rights_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const artifact = db.prepare(`INSERT INTO historical_source_artifacts (
    artifact_id, edition_id, role, locator, pin_kind, pin_value, sha256, bytes, acquired_at
  ) VALUES (?, ?, ?, ?, 'sha256', ?, ?, ?, ?)`);
  const hierarchy = db.prepare(`INSERT INTO historical_edition_hierarchies (
    hierarchy_id, pack_id, work_id, edition_id, availability, hierarchy_schema_version, level_spec_json,
    source_manifest_sha256, aggregate_sha256, ordered_question_keys_sha256, ordered_article_keys_sha256,
    source_lock_sha256, local_receipt_sha256, topology_lock_sha256, discrepancy_ledger_sha256,
    authority_bodies_sha256, navigation_preorder_sha256, body_count, node_count, coverage_json, provenance_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const body = db.prepare(`INSERT INTO historical_edition_hierarchy_bodies (
    hierarchy_id, body_key, body_kind, source_ordinal, heading, content_sha256, content_utf8_bytes, content
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const node = db.prepare(`INSERT INTO historical_edition_hierarchy_nodes (
    hierarchy_id, node_key, parent_node_key, node_kind, body_key, depth, flat_ordinal, sibling_ordinal, label, heading
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.transaction(() => {
    const sourcePack = materialization.sourcePack;
    pack.run(sourcePack.packId, sourcePack.revision, sourcePack.schemaVersion, sourcePack.manifestSha256, sourcePack.sourcePath);
    const sourceWork = materialization.work;
    work.run(sourceWork.workId, sourceWork.title, sourceWork.creatorMetadataStatus, JSON.stringify(sourceWork.creators));
    const sourceEdition = materialization.edition;
    edition.run(sourceEdition.editionId, sourceEdition.workId, sourceEdition.packId, sourceEdition.language,
      JSON.stringify(sourceEdition.contributorGroups), sourceEdition.publication, sourceEdition.version,
      sourceEdition.provenanceStatus, sourceEdition.provenanceUncertainty, sourceEdition.provenanceReviewedAt,
      JSON.stringify(sourceEdition.underlyingWorkRights), JSON.stringify(sourceEdition.exactArtifactRights), JSON.stringify(sourceEdition.normalizedTextRights));
    for (const row of materialization.artifacts) artifact.run(row.artifactId, row.editionId, row.role, row.locator, row.sha256, row.sha256, row.bytes, row.acquiredAt);
    const profile = materialization.hierarchy;
    hierarchy.run(profile.hierarchyId, profile.packId, profile.workId, profile.editionId, profile.availability,
      profile.hierarchySchemaVersion, JSON.stringify(profile.levelSpec), profile.sourceManifestSha256,
      profile.aggregateSha256, profile.orderedQuestionKeysSha256, profile.orderedArticleKeysSha256,
      profile.sourceLockSha256, profile.localReceiptSha256, profile.topologyLockSha256, profile.discrepancyLedgerSha256,
      profile.authorityBodiesSha256, profile.navigationPreorderSha256, profile.bodyCount, profile.nodeCount,
      JSON.stringify(profile.coverage), JSON.stringify(profile.provenance));
    for (const row of materialization.bodies) body.run(row.hierarchyId, row.bodyKey, row.bodyKind, row.sourceOrdinal, row.heading, row.contentSha256, row.contentUtf8Bytes, row.content);
    for (const row of materialization.nodes) node.run(row.hierarchyId, row.nodeKey, row.parentNodeKey, row.nodeKind, row.bodyKey, row.depth, row.flatOrdinal, row.siblingOrdinal, row.label, row.heading);
    db.prepare("INSERT INTO historical_edition_hierarchy_bodies_fts(historical_edition_hierarchy_bodies_fts) VALUES ('rebuild')").run();
  })();
  return assertHistoricalHierarchyStoredIntegrity(db, materialization);
}

function parseStoredObject(value: string, label: string): Record<string, unknown> {
  return object(JSON.parse(value), label);
}

/** Verify every stored authority/provenance field, FTS parity, and inertness boundary. */
export function assertHistoricalHierarchyStoredIntegrity(
  db: Database.Database,
  expected: HistoricalEditionHierarchyMaterialization,
  options: { ftsIntegrity?: boolean } = {},
): HistoricalHierarchyMaterializationCounts {
  const storedPack = db.prepare('SELECT pack_id AS packId, revision, schema_version AS schemaVersion, manifest_sha256 AS manifestSha256, source_path AS sourcePath FROM historical_source_packs WHERE pack_id = ?')
    .get(expected.sourcePack.packId);
  const storedWork = db.prepare('SELECT work_id AS workId, title, creator_metadata_status AS creatorMetadataStatus, creators_json AS creatorsJson FROM historical_works WHERE work_id = ?')
    .get(expected.work.workId) as Record<string, unknown> | undefined;
  const storedEdition = db.prepare(`SELECT edition_id AS editionId, work_id AS workId, pack_id AS packId, language, contributor_groups_json AS contributorGroupsJson,
    publication, version, provenance_status AS provenanceStatus, provenance_uncertainty AS provenanceUncertainty,
    provenance_reviewed_at AS provenanceReviewedAt, underlying_work_rights_json AS underlyingWorkRightsJson,
    exact_artifact_rights_json AS exactArtifactRightsJson, normalized_text_rights_json AS normalizedTextRightsJson
    FROM historical_editions WHERE edition_id = ?`).get(expected.edition.editionId) as Record<string, unknown> | undefined;
  const storedArtifacts = db.prepare(`SELECT artifact_id AS artifactId, edition_id AS editionId, role, locator, sha256, bytes, acquired_at AS acquiredAt
    FROM historical_source_artifacts WHERE edition_id = ? ORDER BY artifact_id`).all(expected.edition.editionId) as HistoricalEditionHierarchyArtifactRecord[];
  const storedHierarchy = db.prepare(`SELECT hierarchy_id AS hierarchyId, pack_id AS packId, work_id AS workId, edition_id AS editionId,
    availability, hierarchy_schema_version AS hierarchySchemaVersion, level_spec_json AS levelSpecJson,
    source_manifest_sha256 AS sourceManifestSha256, aggregate_sha256 AS aggregateSha256,
    ordered_question_keys_sha256 AS orderedQuestionKeysSha256, ordered_article_keys_sha256 AS orderedArticleKeysSha256,
    source_lock_sha256 AS sourceLockSha256, local_receipt_sha256 AS localReceiptSha256,
    topology_lock_sha256 AS topologyLockSha256, discrepancy_ledger_sha256 AS discrepancyLedgerSha256,
    authority_bodies_sha256 AS authorityBodiesSha256, navigation_preorder_sha256 AS navigationPreorderSha256,
    body_count AS bodyCount, node_count AS nodeCount, coverage_json AS coverageJson, provenance_json AS provenanceJson
    FROM historical_edition_hierarchies WHERE hierarchy_id = ?`).get(expected.hierarchy.hierarchyId) as Record<string, unknown> | undefined;
  const bodies = db.prepare(`SELECT hierarchy_id AS hierarchyId, body_key AS bodyKey, body_kind AS bodyKind, source_ordinal AS sourceOrdinal,
    heading, content_sha256 AS contentSha256, content_utf8_bytes AS contentUtf8Bytes, content
    FROM historical_edition_hierarchy_bodies WHERE hierarchy_id = ? ORDER BY source_ordinal`).all(expected.hierarchy.hierarchyId) as HistoricalEditionHierarchyBodyRecord[];
  const nodes = db.prepare(`SELECT hierarchy_id AS hierarchyId, node_key AS nodeKey, parent_node_key AS parentNodeKey, node_kind AS nodeKind,
    body_key AS bodyKey, depth, flat_ordinal AS flatOrdinal, sibling_ordinal AS siblingOrdinal, label, heading
    FROM historical_edition_hierarchy_nodes WHERE hierarchy_id = ? ORDER BY flat_ordinal`).all(expected.hierarchy.hierarchyId) as HistoricalEditionHierarchyNodeRecord[];
  const ftsRows = db.prepare('SELECT COUNT(*) AS count FROM historical_edition_hierarchy_bodies_fts WHERE hierarchy_id = ?')
    .get(expected.hierarchy.hierarchyId) as { count: number };
  const ftsParity = db.prepare(`SELECT COUNT(*) AS count
    FROM historical_edition_hierarchy_bodies body
    LEFT JOIN historical_edition_hierarchy_bodies_fts fts ON fts.rowid = body.rowid
    WHERE body.hierarchy_id = ? AND (fts.rowid IS NULL OR fts.hierarchy_id IS NOT body.hierarchy_id
      OR fts.body_key IS NOT body.body_key OR fts.heading IS NOT body.heading OR fts.content IS NOT body.content)`)
    .get(expected.hierarchy.hierarchyId) as { count: number };
  const hierarchyRows = db.prepare('SELECT COUNT(*) AS count FROM historical_edition_hierarchies WHERE hierarchy_id = ?')
    .get(expected.hierarchy.hierarchyId) as { count: number };
  const normalizedStoredWork = storedWork === undefined ? undefined : {
    workId: storedWork.workId, title: storedWork.title, creatorMetadataStatus: storedWork.creatorMetadataStatus,
    creators: JSON.parse(String(storedWork.creatorsJson)),
  };
  if (!storedPack || !normalizedStoredWork || !storedEdition || !storedHierarchy || hierarchyRows.count !== 1
    || JSON.stringify(storedPack) !== JSON.stringify(expected.sourcePack)
    || JSON.stringify(normalizedStoredWork) !== JSON.stringify(expected.work)
    || JSON.stringify({
      editionId: storedEdition.editionId, workId: storedEdition.workId, packId: storedEdition.packId, language: storedEdition.language,
      contributorGroups: JSON.parse(String(storedEdition.contributorGroupsJson)), publication: storedEdition.publication, version: storedEdition.version,
      provenanceStatus: storedEdition.provenanceStatus, provenanceUncertainty: storedEdition.provenanceUncertainty,
      provenanceReviewedAt: storedEdition.provenanceReviewedAt, underlyingWorkRights: JSON.parse(String(storedEdition.underlyingWorkRightsJson)),
      exactArtifactRights: JSON.parse(String(storedEdition.exactArtifactRightsJson)), normalizedTextRights: JSON.parse(String(storedEdition.normalizedTextRightsJson)),
    }) !== JSON.stringify(expected.edition)
    || JSON.stringify(storedArtifacts) !== JSON.stringify(expected.artifacts)
    || JSON.stringify({
      hierarchyId: storedHierarchy?.hierarchyId, packId: storedHierarchy?.packId, workId: storedHierarchy?.workId, editionId: storedHierarchy?.editionId,
      availability: storedHierarchy?.availability, hierarchySchemaVersion: storedHierarchy?.hierarchySchemaVersion,
      levelSpec: storedHierarchy ? JSON.parse(String(storedHierarchy.levelSpecJson)) : undefined,
      sourceManifestSha256: storedHierarchy?.sourceManifestSha256, aggregateSha256: storedHierarchy?.aggregateSha256,
      orderedQuestionKeysSha256: storedHierarchy?.orderedQuestionKeysSha256, orderedArticleKeysSha256: storedHierarchy?.orderedArticleKeysSha256,
      sourceLockSha256: storedHierarchy?.sourceLockSha256, localReceiptSha256: storedHierarchy?.localReceiptSha256,
      topologyLockSha256: storedHierarchy?.topologyLockSha256, discrepancyLedgerSha256: storedHierarchy?.discrepancyLedgerSha256,
      authorityBodiesSha256: storedHierarchy?.authorityBodiesSha256, navigationPreorderSha256: storedHierarchy?.navigationPreorderSha256,
      bodyCount: storedHierarchy?.bodyCount, nodeCount: storedHierarchy?.nodeCount,
      coverage: storedHierarchy ? JSON.parse(String(storedHierarchy.coverageJson)) : undefined,
      provenance: storedHierarchy ? JSON.parse(String(storedHierarchy.provenanceJson)) : undefined,
    }) !== JSON.stringify(expected.hierarchy)
    || JSON.stringify(bodies) !== JSON.stringify(expected.bodies)
    || JSON.stringify(nodes) !== JSON.stringify(expected.nodes)
    || ftsRows.count !== expected.bodies.length || ftsParity.count !== 0) {
    throw new Error('Transform 10 stored edition hierarchy drifted from every reviewed source/profile/body/navigation field');
  }
  if (options.ftsIntegrity !== false) db.prepare("INSERT INTO historical_edition_hierarchy_bodies_fts(historical_edition_hierarchy_bodies_fts) VALUES ('integrity-check')").run();
  const representative = expected.bodies.find(body => /[A-Za-z]{6,}/.test(body.content));
  const token = representative?.content.match(/[A-Za-z]{6,}/)?.[0]?.toLowerCase();
  const match = token === undefined ? undefined : db.prepare(`SELECT fts.rowid FROM historical_edition_hierarchy_bodies_fts fts
    JOIN historical_edition_hierarchy_bodies body ON body.rowid = fts.rowid
    WHERE historical_edition_hierarchy_bodies_fts MATCH ? AND body.hierarchy_id = ? LIMIT 1`)
    .get(`"${token}"`, expected.hierarchy.hierarchyId);
  const documentProjection = db.prepare('SELECT COUNT(*) AS count FROM documents WHERE id = ?').get(expected.work.workId) as { count: number };
  if (!match || documentProjection.count !== 0) throw new Error('Transform 10 FTS parity or inactive projection boundary drifted');
  return { hierarchies: hierarchyRows.count, artifacts: storedArtifacts.length, bodies: bodies.length, nodes: nodes.length, ftsRows: ftsRows.count };
}

/**
 * The Transform-10 tables and packet remain part of the dormant local
 * foundation, but a normal release corpus must not materialize any of it.
 * Keep this inventory beside the materializer so local SQLite verification,
 * Workerd, and remote-D1 readiness all use the same fail-closed boundary.
 */
export interface NormalAquinasHierarchyExclusionCheck {
  id: string;
  predicate: string;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function normalAquinasHierarchyExclusionChecks(): readonly NormalAquinasHierarchyExclusionCheck[] {
  const artifactIds = AQUINAS_HIERARCHY_EXPECTED.artifactPins.map(([artifactId]) => sqlLiteral(artifactId)).join(', ');
  const packId = sqlLiteral(AQUINAS_HIERARCHY_EXPECTED.packId);
  const workId = sqlLiteral(AQUINAS_HIERARCHY_EXPECTED.workId);
  const editionId = sqlLiteral(AQUINAS_HIERARCHY_EXPECTED.editionId);
  return Object.freeze([
    {
      id: 'historical.transform10.normal.hierarchies_empty',
      predicate: '(SELECT COUNT(*) FROM historical_edition_hierarchies) = 0',
    },
    {
      id: 'historical.transform10.normal.bodies_empty',
      predicate: '(SELECT COUNT(*) FROM historical_edition_hierarchy_bodies) = 0',
    },
    {
      id: 'historical.transform10.normal.nodes_empty',
      predicate: '(SELECT COUNT(*) FROM historical_edition_hierarchy_nodes) = 0',
    },
    {
      id: 'historical.transform10.normal.fts_empty',
      predicate: '(SELECT COUNT(*) FROM historical_edition_hierarchy_bodies_fts) = 0',
    },
    {
      id: 'historical.transform10.normal.pack_absent',
      predicate: `(SELECT COUNT(*) FROM historical_source_packs WHERE pack_id = ${packId}) = 0`,
    },
    {
      id: 'historical.transform10.normal.work_absent',
      predicate: `(SELECT COUNT(*) FROM historical_works WHERE work_id = ${workId}) = 0`,
    },
    {
      id: 'historical.transform10.normal.edition_absent',
      predicate: `(SELECT COUNT(*) FROM historical_editions WHERE edition_id = ${editionId}
        OR work_id = ${workId} OR pack_id = ${packId}) = 0`,
    },
    {
      id: 'historical.transform10.normal.artifacts_absent',
      predicate: `(SELECT COUNT(*) FROM historical_source_artifacts WHERE edition_id = ${editionId}
        OR artifact_id IN (${artifactIds})) = 0`,
    },
  ]);
}

/** Fail closed when a normal release database carries any dormant Aquinas row. */
export function assertNormalAquinasHierarchyExclusion(db: Database.Database): void {
  const failed = normalAquinasHierarchyExclusionChecks().flatMap(check => {
    const row = db.prepare(`SELECT CASE WHEN ${check.predicate} THEN 1 ELSE 0 END AS passed`).get() as { passed?: unknown };
    return row.passed === 1 ? [] : [check.id];
  });
  if (failed.length > 0) {
    throw new Error(`Normal release database materialized excluded Transform 10 authority: ${failed.join(', ')}`);
  }
}
