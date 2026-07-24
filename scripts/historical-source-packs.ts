import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { dirname, posix } from 'node:path';
import { compileEditionPackage, type CompiledEditionPackage } from '../src/kernel/editionProvenanceFoundation.js';
import {
  assertClassicTextDocumentMetadata,
  assertClassicTextSectionMetadata,
} from '../src/kernel/classicTextContract.js';
import type { D1SourceConsumptionRegistry } from './d1-corpus-identity.js';

export const HISTORICAL_SOURCE_PACK_PREFIX = 'data/historical-source-packs/';
export const CORE_EIGHT_SOURCE_PACK_ID = 'theologai-core-eight';
export const CORE_EIGHT_SOURCE_PACK_COUNTS = Object.freeze({
  packs: 1,
  works: 8,
  editions: 8,
  artifacts: 25,
  sections: 512,
  deliveryProfiles: 8,
  identities: 512,
  legacyAliases: 0,
});

const CORE_EIGHT_WORK_IDS = Object.freeze([
  'anselm-proslogion',
  'athanasius-on-incarnation',
  'augustine-confessions',
  'bunyan-pilgrims-progress-part-1',
  'calvin-institutes',
  'irenaeus-against-heresies',
  'john-damascene-exact-exposition',
  'wesley-standard-sermons',
]);

export interface HistoricalSourcePackRecord {
  packId: string;
  revision: string;
  /** Schema of the pack manifest, distinct from its member edition package schema. */
  manifestSchemaVersion: 'historical-source-pack-manifest.v1';
  sourcePath: string;
  compiled: CompiledEditionPackage;
  normalizedTextRights: NormalizedTextRights;
  catalog: HistoricalSourcePackCatalog;
  artifacts: HistoricalSourcePackArtifact[];
  manifestSha256?: string;
}

export interface HistoricalSourcePackCatalog {
  composition: {
    label: string;
    startYear?: number;
    endYear?: number;
  };
  compositionProvenanceSources: Array<{
    sourceId: string;
    label: string;
    url: string;
  }>;
}

export interface NormalizedTextRights {
  status: 'no_known_conflict';
  scope: 'normalized_public_domain_text_only';
  basis: string;
  reviewedAt: string;
}

export interface HistoricalSourcePackArtifact {
  artifactId: string;
  role: 'authority' | 'comparator';
  locator: string;
  sha256: string;
  bytes: number;
  acquiredAt: string;
}

export function sourcePackPaths(inputs: readonly string[]): string[] {
  return inputs.filter(path => path.startsWith(HISTORICAL_SOURCE_PACK_PREFIX)).sort();
}

/** Load only manifest-declared packs; filesystem discovery must never broaden a release. */
export function loadHistoricalSourcePacks(
  inputs: readonly string[],
  sources: Pick<D1SourceConsumptionRegistry, 'read'>,
): HistoricalSourcePackRecord[] {
  const paths = sourcePackPaths(inputs);
  if (paths.length === 0) return [];
  const manifestPaths = paths.filter(path => path.endsWith('/manifest.json'));
  if (manifestPaths.length === 0) {
    throw new Error('Historical source-pack files require a manifest.json and matching manifest.sha256');
  }

  const declaredMembers = new Set<string>();
  const records: HistoricalSourcePackRecord[] = [];
  for (const manifestPath of manifestPaths) {
    const sidecarPath = posix.join(dirname(manifestPath), 'manifest.sha256');
    if (!paths.includes(sidecarPath)) throw new Error(`${manifestPath} is missing required manifest.sha256 sidecar`);
    const loaded = loadManifestPack(manifestPath, sidecarPath, sources);
    for (const memberPath of loaded.memberPaths) {
      if (declaredMembers.has(memberPath)) throw new Error(`Historical source-pack edition is declared by multiple manifests: ${memberPath}`);
      declaredMembers.add(memberPath);
    }
    records.push(...loaded.records);
  }

  const allowed = new Set([
    ...manifestPaths,
    ...manifestPaths.map(path => posix.join(dirname(path), 'manifest.sha256')),
    ...declaredMembers,
  ]);
  const undeclared = paths.filter(path => !allowed.has(path));
  if (undeclared.length > 0) {
    throw new Error(`Orphan or unsupported historical source-pack files: ${undeclared.join(', ')}`);
  }

  const seenPacks = new Map<string, string>();
  const seenWorks = new Map<string, string>();
  const seenEditions = new Set<string>();
  const seenArtifacts = new Set<string>();
  for (const record of records) {
    const priorPackPath = seenPacks.get(record.packId);
    if (priorPackPath && priorPackPath !== record.sourcePath) throw new Error(`Duplicate historical source-pack identity: ${record.packId}`);
    seenPacks.set(record.packId, record.sourcePath);
    const workId = record.compiled.package.work.workId;
    const editionId = record.compiled.package.edition.editionId;
    const serializedWork = JSON.stringify(record.compiled.package.work);
    const priorWork = seenWorks.get(workId);
    if (priorWork !== undefined && priorWork !== serializedWork) {
      throw new Error(`Historical source packs disagree about shared work metadata: ${workId}`);
    }
    if (seenEditions.has(editionId)) throw new Error(`Historical source packs duplicate edition: ${editionId}`);
    seenWorks.set(workId, serializedWork);
    seenEditions.add(editionId);
    for (const artifact of record.artifacts) {
      if (seenArtifacts.has(artifact.artifactId)) throw new Error(`Historical source packs duplicate artifact: ${artifact.artifactId}`);
      seenArtifacts.add(artifact.artifactId);
    }
  }
  return records;
}

/**
 * Transform 9 has one explicitly approved source-pack release.  Keep this
 * check at the build boundary so adding a future pack needs a new reviewed
 * migration and cannot silently change the active corpus.
 */
export function assertCoreEightSourcePackRelease(
  records: readonly HistoricalSourcePackRecord[],
): void {
  const counts = {
    packs: new Set(records.map(record => record.packId)).size,
    works: new Set(records.map(record => record.compiled.package.work.workId)).size,
    editions: new Set(records.map(record => record.compiled.package.edition.editionId)).size,
    artifacts: records.reduce((total, record) => total + record.artifacts.length, 0),
    sections: records.reduce((total, record) => total + record.compiled.package.sections.length, 0),
  };
  if (records.some(record => record.packId !== CORE_EIGHT_SOURCE_PACK_ID)
    || JSON.stringify(counts) !== JSON.stringify({
      packs: CORE_EIGHT_SOURCE_PACK_COUNTS.packs,
      works: CORE_EIGHT_SOURCE_PACK_COUNTS.works,
      editions: CORE_EIGHT_SOURCE_PACK_COUNTS.editions,
      artifacts: CORE_EIGHT_SOURCE_PACK_COUNTS.artifacts,
      sections: CORE_EIGHT_SOURCE_PACK_COUNTS.sections,
    })
    || JSON.stringify(records.map(record => record.compiled.package.work.workId).sort())
      !== JSON.stringify(CORE_EIGHT_WORK_IDS)) {
    throw new Error('Transform 9 source-pack release must retain the reviewed core-eight 1/8/8/25/512 inventory');
  }
}

function loadManifestPack(
  path: string,
  sidecarPath: string,
  sources: Pick<D1SourceConsumptionRegistry, 'read'>,
): { records: HistoricalSourcePackRecord[]; memberPaths: string[] } {
  const rawBytes = sources.read(path, 'utf8');
  const manifestSha256 = sha256Text(rawBytes);
  const sidecar = sources.read(sidecarPath, 'utf8');
  if (sidecar !== `${manifestSha256}  manifest.json\n`) {
    throw new Error(`${sidecarPath} does not match ${path}`);
  }
  const raw = JSON.parse(rawBytes) as unknown;
  const manifest = parseManifest(raw, path);
  const works = new Map<string, string>();
  const editions = new Set<string>();
  const records = manifest.members.map(member => {
    const compiled = compileEditionPackage(JSON.parse(sources.read(member.sourcePath, 'utf8')));
    if (compiled.sha256 !== member.packageSha256) throw new Error(`${path} package checksum mismatch: ${member.sourcePath}`);
    if (member.id !== compiled.package.edition.editionId) {
      throw new Error(`${path} member id must equal its compiled editionId: ${member.sourcePath}`);
    }
    const workIdentity = JSON.stringify(compiled.package.work);
    const existingWork = works.get(compiled.package.work.workId);
    if ((existingWork !== undefined && existingWork !== workIdentity) || editions.has(compiled.package.edition.editionId)) {
      throw new Error(`${path} members must have consistent work and distinct edition identities`);
    }
    works.set(compiled.package.work.workId, workIdentity); editions.add(compiled.package.edition.editionId);
    return {
      packId: manifest.packId,
      revision: manifest.revision,
      manifestSchemaVersion: manifest.schemaVersion,
      sourcePath: path,
      compiled,
      normalizedTextRights: member.normalizedTextRights,
      catalog: member.catalog,
      artifacts: member.artifacts,
      manifestSha256,
    };
  });
  return { records, memberPaths: manifest.members.map(member => member.sourcePath) };
}

interface ParsedManifest {
  schemaVersion: 'historical-source-pack-manifest.v1';
  packId: string;
  revision: string;
  members: Array<{ id: string; sourcePath: string; packageSha256: string; normalizedTextRights: NormalizedTextRights; catalog: HistoricalSourcePackCatalog; artifacts: HistoricalSourcePackArtifact[] }>;
}

function parseManifest(value: unknown, path: string): ParsedManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  const root = value as Record<string, unknown>;
  assertKeys(root, ['schemaVersion', 'packId', 'revision', 'rightsScope', 'members'], path);
  if (root.schemaVersion !== 'historical-source-pack-manifest.v1') throw new Error(`${path}.schemaVersion is unsupported`);
  if (!isId(root.packId)) throw new Error(`${path}.packId must be a canonical identifier`);
  if (!Number.isSafeInteger(root.revision) || (root.revision as number) < 1) throw new Error(`${path}.revision must be a positive integer`);
  if (root.rightsScope !== 'normalized_public_domain_text_only') throw new Error(`${path}.rightsScope must exclude source artifact redistribution`);
  if (!Array.isArray(root.members) || root.members.length < 1) throw new Error(`${path}.members must be a non-empty array`);
  let previous = '';
  const artifactIds = new Set<string>();
  return {
    schemaVersion: root.schemaVersion,
    packId: root.packId,
    revision: String(root.revision),
    members: root.members.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${path}.members[${index}] must be an object`);
      const member = entry as Record<string, unknown>;
      assertKeys(member, ['id', 'sourcePath', 'packageSha256', 'normalizedTextRights', 'catalog', 'artifacts'], `${path}.members[${index}]`);
      if (!isId(member.id) || typeof member.sourcePath !== 'string' || !/^editions\/[a-z][a-z0-9._-]*\.json$/.test(member.sourcePath) || member.sourcePath <= previous) {
        throw new Error(`${path}.members must be strictly sourcePath-sorted packages`);
      }
      previous = member.sourcePath;
      if (typeof member.packageSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(member.packageSha256)) throw new Error(`${path}.members[${index}].packageSha256 is invalid`);
      const normalizedTextRights = parseNormalizedTextRights(member.normalizedTextRights, `${path}.members[${index}].normalizedTextRights`);
      if (!Array.isArray(member.artifacts) || member.artifacts.length < 1) throw new Error(`${path}.members[${index}].artifacts must be non-empty`);
      let previousArtifact = '';
      const artifacts = member.artifacts.map((artifact, artifactIndex) => {
        const parsed = parseArtifact(artifact, `${path}.members[${index}].artifacts[${artifactIndex}]`);
        if (parsed.artifactId <= previousArtifact || artifactIds.has(parsed.artifactId)) throw new Error(`${path} artifacts must have globally unique sorted artifactId values`);
        previousArtifact = parsed.artifactId; artifactIds.add(parsed.artifactId);
        return parsed;
      });
      if (!artifacts.some(artifact => artifact.role === 'authority')) throw new Error(`${path}.members[${index}] requires an authority artifact`);
      const catalog = parseCatalog(member.catalog, artifacts, `${path}.members[${index}].catalog`);
      return { id: member.id, sourcePath: posix.join(dirname(path), member.sourcePath), packageSha256: member.packageSha256, normalizedTextRights, catalog, artifacts };
    }),
  };
}

function parseCatalog(value: unknown, _artifacts: readonly HistoricalSourcePackArtifact[], path: string): HistoricalSourcePackCatalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  const catalog = value as Record<string, unknown>;
  assertKeys(catalog, ['composition', 'compositionProvenanceSources'], path);
  if (!catalog.composition || typeof catalog.composition !== 'object' || Array.isArray(catalog.composition)) {
    throw new Error(`${path}.composition must be an object`);
  }
  const composition = catalog.composition as Record<string, unknown>;
  const keys = Object.keys(composition).sort();
  const expected = ['label', ...(composition.startYear === undefined && composition.endYear === undefined ? [] : ['startYear', 'endYear'])].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)
    || typeof composition.label !== 'string' || !composition.label.trim()
    || (composition.startYear !== undefined && (!Number.isSafeInteger(composition.startYear) || !Number.isSafeInteger(composition.endYear)
      || composition.startYear > composition.endYear))) {
    throw new Error(`${path}.composition must use a non-empty label and optional inclusive integer bounds`);
  }
  if (!Array.isArray(catalog.compositionProvenanceSources) || catalog.compositionProvenanceSources.length < 1) {
    throw new Error(`${path}.compositionProvenanceSources must be non-empty`);
  }
  const sources = catalog.compositionProvenanceSources.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}.compositionProvenanceSources[${index}] must be an object`);
    const source = value as Record<string, unknown>;
    assertKeys(source, ['sourceId', 'label', 'url'], `${path}.compositionProvenanceSources[${index}]`);
    if (typeof source.sourceId !== 'string' || !/^hist-meta-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.sourceId)
      || typeof source.label !== 'string' || !source.label.trim()
      || typeof source.url !== 'string' || !source.url.startsWith('https://')) {
      throw new Error(`${path}.compositionProvenanceSources[${index}] is invalid`);
    }
    return { sourceId: source.sourceId, label: source.label, url: source.url };
  });
  if (new Set(sources.map(source => source.sourceId)).size !== sources.length
    || sources.some((source, index) => index > 0 && sources[index - 1]!.sourceId >= source.sourceId)) {
    throw new Error(`${path}.compositionProvenanceSources must use sorted unique source IDs`);
  }
  return {
    composition: {
      label: composition.label,
      ...(composition.startYear === undefined ? {} : { startYear: composition.startYear as number, endYear: composition.endYear as number }),
    },
    compositionProvenanceSources: sources,
  };
}

function parseNormalizedTextRights(value: unknown, path: string): NormalizedTextRights {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  const rights = value as Record<string, unknown>;
  assertKeys(rights, ['status', 'scope', 'basis', 'reviewedAt'], path);
  if (rights.status !== 'no_known_conflict' || rights.scope !== 'normalized_public_domain_text_only' || typeof rights.basis !== 'string' || !rights.basis.trim() || typeof rights.reviewedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rights.reviewedAt)) throw new Error(`${path} is invalid`);
  return { status: rights.status, scope: rights.scope, basis: rights.basis, reviewedAt: rights.reviewedAt };
}

function parseArtifact(value: unknown, path: string): HistoricalSourcePackArtifact {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  const artifact = value as Record<string, unknown>;
  assertKeys(artifact, ['artifactId', 'role', 'locator', 'sha256', 'bytes', 'acquiredAt'], path);
  const { artifactId, role, locator, sha256, bytes, acquiredAt } = artifact;
  if (!isId(artifactId) || (role !== 'authority' && role !== 'comparator')
    || typeof locator !== 'string' || !locator.startsWith('https://')
    || typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)
    || typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 1
    || typeof acquiredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(acquiredAt)) {
    throw new Error(`${path} is invalid`);
  }
  return { artifactId, role, locator, sha256, bytes, acquiredAt };
}

function assertKeys(value: Record<string, unknown>, keys: string[], path: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${path} has unknown or missing fields`);
}
function isId(value: unknown): value is string { return typeof value === 'string' && /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value); }
function sha256Text(value: string): string { return createHash('sha256').update(value).digest('hex'); }

/** Insert the immutable normalized authority plus the legacy-safe search/resource projection. */
export function materializeHistoricalSourcePacks(
  db: Database.Database,
  packs: readonly HistoricalSourcePackRecord[],
): { packs: number; works: number; editions: number; artifacts: number; sections: number; deliveryProfiles: number; identities: number; legacyAliases: number } {
  const insertPack = db.prepare('INSERT INTO historical_source_packs (pack_id, revision, schema_version, manifest_sha256, source_path) VALUES (?, ?, ?, ?, ?)');
  const insertWork = db.prepare('INSERT INTO historical_works (work_id, title, creator_metadata_status, creators_json) VALUES (?, ?, ?, ?)');
  const insertEdition = db.prepare(`INSERT INTO historical_editions (
    edition_id, work_id, pack_id, language, contributor_groups_json, publication, version,
    provenance_status, provenance_uncertainty, provenance_reviewed_at, underlying_work_rights_json, exact_artifact_rights_json, normalized_text_rights_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertArtifact = db.prepare('INSERT INTO historical_source_artifacts (artifact_id, edition_id, role, locator, pin_kind, pin_value, sha256, bytes, acquired_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertNormalizedSection = db.prepare('INSERT INTO historical_edition_sections (edition_id, section_key, source_ordinal, display_label, heading, content) VALUES (?, ?, ?, ?, ?, ?)');
  const insertNormalizedFts = db.prepare('INSERT INTO historical_edition_sections_fts (edition_id, section_key, heading, content) VALUES (?, ?, ?, ?)');
  const insertDocument = db.prepare('INSERT INTO documents (id, title, type, date, metadata) VALUES (?, ?, ?, ?, ?)');
  const insertSection = db.prepare('INSERT INTO document_sections (document_id, section_number, title, content, topics) VALUES (?, ?, ?, ?, ?)');
  const insertFts = db.prepare('INSERT INTO sections_fts (title, content, topics) VALUES (?, ?, ?)');
  const insertProfile = db.prepare(`INSERT INTO historical_document_delivery_profiles (
    document_id, work_id, edition_id, immutable_corpus_identity, section_package_identity,
    delivery_mode, section_count, landing_max_bytes, browse_page_size, cursor_version,
    provenance_json, rights_json
  ) VALUES (?, ?, ?, ?, ?, 'sectioned_only', ?, 16384, 32, 1, ?, ?)`);
  const insertIdentity = db.prepare(`INSERT INTO historical_section_identities (
    document_id, section_key, source_ordinal, document_section_id
  ) VALUES (?, ?, ?, ?)`);

  let sections = 0;
  let artifactCount = 0;
  let identities = 0;
  const workRows = new Map<string, string>();
  const packRows = new Map<string, { revision: string; schemaVersion: string; manifestSha256: string; sourcePath: string }>();
  for (const record of packs) {
    const candidate = {
      revision: record.revision,
      schemaVersion: record.manifestSchemaVersion,
      manifestSha256: record.manifestSha256 ?? record.compiled.sha256,
      sourcePath: record.sourcePath,
    };
    const prior = packRows.get(record.packId);
    if (prior && JSON.stringify(prior) !== JSON.stringify(candidate)) {
      throw new Error(`Historical source-pack members disagree about pack identity: ${record.packId}`);
    }
    packRows.set(record.packId, candidate);
    const serializedWork = JSON.stringify(record.compiled.package.work);
    const priorWork = workRows.get(record.compiled.package.work.workId);
    if (priorWork !== undefined && priorWork !== serializedWork) {
      throw new Error(`Historical source-pack work metadata was not validated: ${record.compiled.package.work.workId}`);
    }
    workRows.set(record.compiled.package.work.workId, serializedWork);
  }
  const insertedPackIds = new Set<string>();
  const insertedWorkIds = new Set<string>();
  const transaction = db.transaction(() => {
    for (const { packId, revision, manifestSchemaVersion, sourcePath, compiled, normalizedTextRights, catalog, artifacts, manifestSha256 } of packs) {
      const { work, edition, sections: editionSections } = compiled.package;
      const pack = packRows.get(packId);
      if (!pack) throw new Error(`Historical source-pack identity was not validated: ${packId}`);
      if (pack.schemaVersion !== manifestSchemaVersion || pack.revision !== revision || pack.sourcePath !== sourcePath
        || pack.manifestSha256 !== (manifestSha256 ?? compiled.sha256)) {
        throw new Error(`Historical source-pack member drifted after identity validation: ${packId}`);
      }
      if (!insertedPackIds.has(packId)) {
        insertPack.run(packId, pack.revision, pack.schemaVersion, pack.manifestSha256, pack.sourcePath);
        insertedPackIds.add(packId);
      }
      if (!insertedWorkIds.has(work.workId)) {
        insertWork.run(work.workId, work.title, work.creatorMetadataStatus, JSON.stringify(work.creators));
        insertedWorkIds.add(work.workId);
      }
      insertEdition.run(
        edition.editionId, work.workId, packId, edition.language, JSON.stringify(edition.contributorGroups),
        edition.publication, edition.version, edition.provenance.status, edition.provenance.uncertainty,
        edition.provenance.reviewedAt, JSON.stringify(edition.underlyingWorkRights), JSON.stringify(edition.exactArtifactRights), JSON.stringify(normalizedTextRights),
      );
      for (const artifact of artifacts) {
        insertArtifact.run(artifact.artifactId, edition.editionId, artifact.role, artifact.locator, 'sha256', artifact.sha256, artifact.sha256, artifact.bytes, artifact.acquiredAt);
        artifactCount++;
      }

      const metadata = buildHistoricalSourcePackDocumentMetadata(packId, compiled, normalizedTextRights, catalog, artifacts);
      assertClassicTextDocumentMetadata({
        id: work.workId, title: work.title, type: 'historical_work', date: null, topics: [],
      }, `Historical source-pack work ${work.workId}`);
      insertDocument.run(work.workId, work.title, 'historical_work', null, JSON.stringify(metadata));
      const identityRows: Array<{ sectionKey: string; sourceOrdinal: number; documentSectionId: number }> = [];
      for (const section of editionSections) {
        assertClassicTextSectionMetadata({
          documentId: work.workId, sectionNumber: section.sectionKey, title: section.heading,
          content: section.content, topics: '[]',
        }, `Historical source-pack work ${work.workId} section ${section.sectionKey}`);
        insertNormalizedSection.run(edition.editionId, section.sectionKey, section.sourceOrdinal, section.displayLabel, section.heading, section.content);
        insertNormalizedFts.run(edition.editionId, section.sectionKey, section.heading, section.content);
        const inserted = insertSection.run(work.workId, section.sectionKey, section.heading, section.content, '[]');
        const documentSectionId = Number(inserted.lastInsertRowid);
        if (!Number.isSafeInteger(documentSectionId) || documentSectionId < 1) {
          throw new Error(`Historical source-pack section did not receive a safe storage id: ${work.workId}#${section.sectionKey}`);
        }
        identityRows.push({
          sectionKey: section.sectionKey,
          sourceOrdinal: section.sourceOrdinal,
          documentSectionId,
        });
        insertFts.run(section.heading, section.content, '[]');
        sections++;
      }
      if (identityRows.length !== editionSections.length) {
        throw new Error(`Historical source-pack section projection drifted for ${work.workId}`);
      }
      insertProfile.run(
        work.workId, work.workId, edition.editionId, compiled.sha256, compiled.sha256,
        editionSections.length,
        JSON.stringify({
          status: 'reviewed_edition_aligned_normalized_transcription',
          sourcePackId: packId,
          revision,
          manifestSha256: manifestSha256 ?? compiled.sha256,
          packageSha256: compiled.sha256,
          sourcePath,
        }),
        JSON.stringify({
          status: 'reviewed_normalized_public_domain_text',
          normalizedTextRights,
          underlyingWorkRights: edition.underlyingWorkRights,
          exactArtifactRights: edition.exactArtifactRights,
        }),
      );
      for (const row of identityRows) {
        insertIdentity.run(work.workId, row.sectionKey, row.sourceOrdinal, row.documentSectionId);
        identities++;
      }
    }
  });
  transaction();
  return {
    packs: new Set(packs.map(pack => pack.packId)).size,
    works: insertedWorkIds.size,
    editions: packs.length,
    artifacts: artifactCount,
    sections,
    deliveryProfiles: packs.length,
    identities,
    legacyAliases: 0,
  };
}

/**
 * The public document projection is deliberately derived from the immutable
 * package and manifest rather than copied from a hand-maintained catalog.
 * Transform-9 authority verification regenerates this exact object.
 */
export function buildHistoricalSourcePackDocumentMetadata(
  packId: string,
  compiled: CompiledEditionPackage,
  normalizedTextRights: NormalizedTextRights,
  catalog: HistoricalSourcePackCatalog,
  artifacts: readonly HistoricalSourcePackArtifact[],
): Record<string, unknown> {
  const { work, edition } = compiled.package;
  return {
    topics: [],
    catalog: {
      lookupAliases: [work.workId, work.title],
      composition: catalog.composition,
      creators: work.creators,
      metadataStatus: work.creatorMetadataStatus,
      metadataProvenanceIds: catalog.compositionProvenanceSources.map(source => source.sourceId),
    },
    editionProvenance: {
      foundation: 'edition-provenance-foundation.v1',
      sourcePackId: packId,
      editionId: edition.editionId,
      language: edition.language,
      publication: edition.publication,
      version: edition.version,
      sourceArtifacts: artifacts,
      underlyingWorkRights: edition.underlyingWorkRights,
      normalizedTextRights,
      provenance: edition.provenance,
    },
  };
}
