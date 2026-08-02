import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { buildNortonNormalization } from './normalize-eebo-tcp-norton-1561.js';

export const NORTON_TRANSFORM12 = Object.freeze({
  transformVersion: 12,
  packId: 'eebo-tcp-a17662-norton-1561-transform12-inactive',
  workId: 'calvin-institutes-of-the-christian-religion',
  editionId: 'calvin-institutes-norton-1561-eebo-tcp-a17662',
  artifactId: 'eebo-tcp-a17662-norton-1561-xml',
  publicationId: 'calvin-institutes-norton-1561-eebo-tcp-a17662',
  packagePath: 'data/historical-sources/eebo-tcp/A17662/norton-1561.edition.json',
  sourceLockPath: 'data/historical-sources/eebo-tcp/A17662/SOURCE.json',
  sourceXmlPath: 'data/historical-sources/eebo-tcp/A17662/A17662.xml',
  sourceRightsPath: 'data/historical-sources/eebo-tcp/A17662/README.md',
  normalizationReportPath: 'data/historical-sources/eebo-tcp/A17662/NORMALIZATION_REPORT.json',
  packageSha256: '3054f4446b2e92af87c1713ee1c44d6745bca42a32aed7c67890d25fedbdff33',
  sourceCommit: '32191150ad4a919dfd2c28c89b1dbc1c2396252a',
  sourceXmlSha256: '90124aa3bf17f7dcb5cab40719ed362c91c0018194b7397884b58f6b10daf5a4',
  sourceXmlBytes: 4_820_278,
  sourceRightsSha256: '79287eb13717149ec5d3fdbf461b21ebd83aa211745c87c41b23260d5ff87b8a',
  sectionCount: 1_250,
  firstSectionKey: 'a17662-source-ordinal-0001',
  lastSectionKey: 'a17662-source-ordinal-1250',
  orderedTextSha256: '823d6bae29f9e2b5c8b042c9167c1f62e87df42cbc309ad68d59dda7c33b2cc6',
  landingMaxBytes: 16_384,
  browsePageSize: 32,
  authorityPageSize: 8,
  authorityPages: 157,
  cursorContract: 'historical-sectioned-only-cursor-v1',
  cursorVersion: 1,
  activationState: 'dormant',
} as const);

export const NORTON_NORMALIZED_TEXT_RIGHTS_PENDING = Object.freeze({
  status: 'not_reviewed',
  scope: 'no_release_authority',
  basis: 'Transform 12 stores inactive local authority only; no normalized-text redistribution decision has been made.',
  reviewedAt: null,
} as const);

export interface NortonTransform12SourceReader {
  read(path: string): Buffer;
  read(path: string, encoding: BufferEncoding): string;
}

export interface NortonTransform12Section {
  sectionKey: string;
  sourceOrdinal: number;
  displayLabel: string;
  heading: string;
  content: string;
}

export interface NortonTransform12Publication {
  publicationId: string;
  documentId: string;
  packId: string;
  workId: string;
  editionId: string;
  title: string;
  metadata: Record<string, unknown>;
  immutableCorpusIdentity: string;
  sectionPackageIdentity: string;
  deliveryKind: 'sectioned_only_v1';
  sectionCount: number;
  landingMaxBytes: number;
  browsePageSize: number;
  cursorContract: 'historical-sectioned-only-cursor-v1';
  cursorVersion: 1;
  cursorIdentity: string;
  bodyDelivery: 'exact_section_only';
  canonicalUri: string;
  activationState: 'dormant';
}

export interface NortonTransform12Materialization {
  packageSha256: string;
  orderedTextSha256: string;
  work: {
    workId: string;
    title: string;
    creatorMetadataStatus: string;
    creators: unknown[];
  };
  edition: Record<string, any>;
  sections: NortonTransform12Section[];
  publication: NortonTransform12Publication;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

function publicationFor(
  title: string,
  creators: unknown[],
  uncertainty: unknown,
): NortonTransform12Publication {
  const unsigned = {
    publicationId: NORTON_TRANSFORM12.publicationId,
    documentId: NORTON_TRANSFORM12.editionId,
    packId: NORTON_TRANSFORM12.packId,
    workId: NORTON_TRANSFORM12.workId,
    editionId: NORTON_TRANSFORM12.editionId,
    title,
    metadata: {
      creators,
      language: 'en',
      editionLabel: 'Thomas Norton English translation; London, 1561; EEBO-TCP A17662 transcription',
      provenanceStatus: 'verified_with_uncertainty',
      provenanceUncertainty: uncertainty,
      normalizedTextRights: NORTON_NORMALIZED_TEXT_RIGHTS_PENDING,
    },
    immutableCorpusIdentity: NORTON_TRANSFORM12.orderedTextSha256,
    sectionPackageIdentity: NORTON_TRANSFORM12.packageSha256,
    deliveryKind: 'sectioned_only_v1' as const,
    sectionCount: NORTON_TRANSFORM12.sectionCount,
    landingMaxBytes: NORTON_TRANSFORM12.landingMaxBytes,
    browsePageSize: NORTON_TRANSFORM12.browsePageSize,
    cursorContract: NORTON_TRANSFORM12.cursorContract,
    cursorVersion: NORTON_TRANSFORM12.cursorVersion,
    bodyDelivery: 'exact_section_only' as const,
    canonicalUri: `theologai://documents/${NORTON_TRANSFORM12.editionId}`,
    activationState: NORTON_TRANSFORM12.activationState,
  };
  const cursorIdentity = sha256(canonical({
    contract: unsigned.cursorContract,
    version: unsigned.cursorVersion,
    documentId: unsigned.documentId,
    editionId: unsigned.editionId,
    immutableCorpusIdentity: unsigned.immutableCorpusIdentity,
    sectionPackageIdentity: unsigned.sectionPackageIdentity,
    pageSize: unsigned.browsePageSize,
  }));
  return { ...unsigned, cursorIdentity };
}

/** Regenerate the complete package from pinned XML/rights bytes and reject drift. */
export function loadNortonTransform12Authority(
  source: NortonTransform12SourceReader,
): NortonTransform12Materialization {
  const sourceXml = source.read(NORTON_TRANSFORM12.sourceXmlPath);
  const sourceRights = source.read(NORTON_TRANSFORM12.sourceRightsPath);
  const sourceLockText = source.read(NORTON_TRANSFORM12.sourceLockPath, 'utf8');
  const packageBytes = source.read(NORTON_TRANSFORM12.packagePath);
  const reportText = source.read(NORTON_TRANSFORM12.normalizationReportPath, 'utf8');
  if (sourceXml.byteLength !== NORTON_TRANSFORM12.sourceXmlBytes
    || sha256(sourceXml) !== NORTON_TRANSFORM12.sourceXmlSha256
    || sha256(sourceRights) !== NORTON_TRANSFORM12.sourceRightsSha256) {
    throw new Error('Transform 12 Norton pinned source artifact drifted');
  }
  const sourceLock = JSON.parse(sourceLockText) as { sourceCommit?: unknown };
  if (sourceLock.sourceCommit !== NORTON_TRANSFORM12.sourceCommit) {
    throw new Error('Transform 12 Norton source commit drifted');
  }
  const regenerated = buildNortonNormalization(sourceXml, sourceRights, sourceLock);
  const expectedReport = `${JSON.stringify(regenerated.report, null, 2)}\n`;
  if (regenerated.compiled.sha256 !== NORTON_TRANSFORM12.packageSha256
    || sha256(packageBytes) !== NORTON_TRANSFORM12.packageSha256
    || !packageBytes.equals(Buffer.from(regenerated.compiled.canonicalJson, 'utf8'))
    || reportText !== expectedReport) {
    throw new Error('Transform 12 Norton local normalization replay drifted');
  }
  const { work, edition } = regenerated.compiled.package;
  if (work.workId !== NORTON_TRANSFORM12.workId || edition.editionId !== NORTON_TRANSFORM12.editionId
    || edition.workId !== work.workId) {
    throw new Error('Transform 12 Norton work/edition lineage drifted');
  }
  const sections = regenerated.compiled.package.sections.map((section, index) => {
    const ordinal = index + 1;
    const sectionKey = `a17662-source-ordinal-${String(ordinal).padStart(4, '0')}`;
    if (section.sourceOrdinal !== ordinal || section.sectionKey !== sectionKey
      || section.displayLabel !== `Source segment ${ordinal}`) {
      throw new Error(`Transform 12 Norton frozen section identity drifted at ordinal ${ordinal}`);
    }
    return {
      sectionKey: section.sectionKey,
      sourceOrdinal: section.sourceOrdinal,
      displayLabel: section.displayLabel,
      heading: section.heading,
      content: section.content,
    };
  });
  if (sections.length !== NORTON_TRANSFORM12.sectionCount
    || sections[0]?.sectionKey !== NORTON_TRANSFORM12.firstSectionKey
    || sections.at(-1)?.sectionKey !== NORTON_TRANSFORM12.lastSectionKey) {
    throw new Error('Transform 12 Norton section count/boundary drifted');
  }
  const orderedTextSha256 = sha256(sections.map(section => sha256(section.content)).join('\n'));
  if (orderedTextSha256 !== NORTON_TRANSFORM12.orderedTextSha256) {
    throw new Error('Transform 12 Norton ordered text identity drifted');
  }
  return {
    packageSha256: regenerated.compiled.sha256,
    orderedTextSha256,
    work: {
      workId: work.workId,
      title: work.title,
      creatorMetadataStatus: work.creatorMetadataStatus,
      creators: work.creators,
    },
    edition,
    sections,
    publication: publicationFor(work.title, work.creators, edition.provenance.uncertainty),
  };
}

/** Insert only inactive authority rows and one dormant delivery contract. */
export function materializeNortonTransform12Authority(
  db: Database.Database,
  materialization: NortonTransform12Materialization,
): void {
  const { work, edition, sections, publication } = materialization;
  if (materialization.packageSha256 !== NORTON_TRANSFORM12.packageSha256
    || materialization.orderedTextSha256 !== NORTON_TRANSFORM12.orderedTextSha256
    || sections.length !== NORTON_TRANSFORM12.sectionCount) {
    throw new Error('Transform 12 Norton materialization is not the reviewed authority');
  }
  db.transaction(() => {
    db.prepare(`INSERT INTO historical_source_packs
      (pack_id, revision, schema_version, manifest_sha256, source_path)
      VALUES (?, '1', 'norton-transform12-inactive.v1', ?, ?)`).run(
      NORTON_TRANSFORM12.packId,
      NORTON_TRANSFORM12.packageSha256,
      NORTON_TRANSFORM12.packagePath,
    );
    db.prepare(`INSERT INTO historical_works
      (work_id, title, creator_metadata_status, creators_json) VALUES (?, ?, ?, ?)`).run(
      work.workId, work.title, work.creatorMetadataStatus, JSON.stringify(work.creators),
    );
    db.prepare(`INSERT INTO historical_editions (
      edition_id, work_id, pack_id, language, contributor_groups_json, publication, version,
      provenance_status, provenance_uncertainty, provenance_reviewed_at,
      underlying_work_rights_json, exact_artifact_rights_json, normalized_text_rights_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      edition.editionId, work.workId, NORTON_TRANSFORM12.packId, edition.language,
      JSON.stringify(edition.contributorGroups), edition.publication, edition.version,
      edition.provenance.status, edition.provenance.uncertainty, edition.provenance.reviewedAt,
      JSON.stringify(edition.underlyingWorkRights), JSON.stringify(edition.exactArtifactRights),
      JSON.stringify(NORTON_NORMALIZED_TEXT_RIGHTS_PENDING),
    );
    db.prepare(`INSERT INTO historical_source_artifacts
      (artifact_id, edition_id, role, locator, pin_kind, pin_value, sha256, bytes, acquired_at)
      VALUES (?, ?, 'authority', ?, 'sha256', ?, ?, ?, ?)`).run(
      NORTON_TRANSFORM12.artifactId, edition.editionId, edition.source.locator,
      NORTON_TRANSFORM12.sourceXmlSha256, NORTON_TRANSFORM12.sourceXmlSha256,
      NORTON_TRANSFORM12.sourceXmlBytes, edition.source.acquiredAt,
    );
    const insertSection = db.prepare(`INSERT INTO historical_edition_sections
      (edition_id, section_key, source_ordinal, display_label, heading, content)
      VALUES (?, ?, ?, ?, ?, ?)`);
    for (const section of sections) {
      insertSection.run(
        edition.editionId, section.sectionKey, section.sourceOrdinal,
        section.displayLabel, section.heading, section.content,
      );
    }
    db.prepare(`INSERT INTO historical_sectioned_publications (
      publication_id, document_id, pack_id, work_id, edition_id, title, metadata_json,
      immutable_corpus_identity, section_package_identity, delivery_kind, section_count,
      landing_max_bytes, browse_page_size, cursor_contract, cursor_version, cursor_identity,
      body_delivery, canonical_uri, activation_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      publication.publicationId, publication.documentId, publication.packId, publication.workId,
      publication.editionId, publication.title, JSON.stringify(publication.metadata),
      publication.immutableCorpusIdentity, publication.sectionPackageIdentity,
      publication.deliveryKind, publication.sectionCount, publication.landingMaxBytes,
      publication.browsePageSize, publication.cursorContract, publication.cursorVersion,
      publication.cursorIdentity, publication.bodyDelivery, publication.canonicalUri,
      publication.activationState,
    );
  })();
  assertStoredNortonTransform12Authority(db, materialization);
}

export function assertStoredNortonTransform12Authority(
  db: Database.Database,
  expected: NortonTransform12Materialization,
): void {
  const rows = db.prepare(`SELECT section_key AS sectionKey, source_ordinal AS sourceOrdinal,
    display_label AS displayLabel, heading, content FROM historical_edition_sections
    WHERE edition_id = ? ORDER BY source_ordinal, section_key`).all(NORTON_TRANSFORM12.editionId) as NortonTransform12Section[];
  if (rows.length !== expected.sections.length || sha256(canonical(rows)) !== sha256(canonical(expected.sections))) {
    throw new Error('Transform 12 Norton stored section authority drifted');
  }
  const identity = db.prepare(`SELECT
      (SELECT COUNT(*) FROM historical_source_packs WHERE pack_id = ?) AS packs,
      (SELECT COUNT(*) FROM historical_works WHERE work_id = ?) AS works,
      (SELECT COUNT(*) FROM historical_editions WHERE edition_id = ?) AS editions,
      (SELECT COUNT(*) FROM historical_source_artifacts WHERE artifact_id = ?) AS artifacts,
      (SELECT COUNT(*) FROM historical_sectioned_publications WHERE publication_id = ?
        AND activation_state = 'dormant') AS dormant,
      (SELECT COUNT(*) FROM documents WHERE id = ?) AS documents,
      (SELECT COUNT(*) FROM document_sections WHERE document_id = ?) AS documentSections,
      (SELECT COUNT(*) FROM historical_document_delivery_profiles
        WHERE document_id = ? OR edition_id = ?) AS profiles,
      (SELECT COUNT(*) FROM historical_section_identities WHERE document_id = ?) AS identities,
      (SELECT COUNT(*) FROM historical_section_aliases WHERE document_id = ?) AS aliases
    `).get(
      NORTON_TRANSFORM12.packId, NORTON_TRANSFORM12.workId, NORTON_TRANSFORM12.editionId,
      NORTON_TRANSFORM12.artifactId, NORTON_TRANSFORM12.publicationId,
      NORTON_TRANSFORM12.editionId, NORTON_TRANSFORM12.editionId,
      NORTON_TRANSFORM12.editionId, NORTON_TRANSFORM12.editionId,
      NORTON_TRANSFORM12.editionId, NORTON_TRANSFORM12.editionId,
    ) as Record<string, number>;
  if (canonical(identity) !== canonical({
    packs: 1, works: 1, editions: 1, artifacts: 1, dormant: 1,
    documents: 0, documentSections: 0, profiles: 0, identities: 0, aliases: 0,
  })) {
    throw new Error(`Transform 12 Norton inactive boundary drifted: ${canonical(identity)}`);
  }
  const storedEdition = db.prepare(`SELECT normalized_text_rights_json AS normalizedRights,
    provenance_uncertainty AS uncertainty FROM historical_editions WHERE edition_id = ?`)
    .get(NORTON_TRANSFORM12.editionId) as { normalizedRights: string; uncertainty: string | null };
  if (storedEdition.normalizedRights !== JSON.stringify(NORTON_NORMALIZED_TEXT_RIGHTS_PENDING)
    || storedEdition.uncertainty !== expected.edition.provenance.uncertainty) {
    throw new Error('Transform 12 Norton pending rights or provenance uncertainty drifted');
  }
  const storedPublication = db.prepare(`SELECT cursor_identity AS cursorIdentity,
    immutable_corpus_identity AS immutableCorpusIdentity,
    section_package_identity AS sectionPackageIdentity, landing_max_bytes AS landingMaxBytes,
    browse_page_size AS browsePageSize, body_delivery AS bodyDelivery,
    activation_state AS activationState FROM historical_sectioned_publications
    WHERE publication_id = ?`).get(NORTON_TRANSFORM12.publicationId) as Record<string, unknown>;
  if (canonical(storedPublication) !== canonical({
    cursorIdentity: expected.publication.cursorIdentity,
    immutableCorpusIdentity: NORTON_TRANSFORM12.orderedTextSha256,
    sectionPackageIdentity: NORTON_TRANSFORM12.packageSha256,
    landingMaxBytes: 16_384,
    browsePageSize: 32,
    bodyDelivery: 'exact_section_only',
    activationState: 'dormant',
  })) {
    throw new Error('Transform 12 Norton dormant publication contract drifted');
  }
}

export function nortonTransform12BoundaryHashes(
  materialization: NortonTransform12Materialization,
): Array<{ sourceOrdinal: number; sectionKey: string; headingSha256: string; contentSha256: string }> {
  return [1, 625, 1_250].map(sourceOrdinal => {
    const section = materialization.sections[sourceOrdinal - 1]!;
    return {
      sourceOrdinal,
      sectionKey: section.sectionKey,
      headingSha256: sha256(section.heading),
      contentSha256: sha256(section.content),
    };
  });
}
