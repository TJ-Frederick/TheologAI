/** Verify that persisted semantic rows still reproduce their declared identity. */

import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { canonicalJson } from './pinnedCompiler.js';
import { normalizedReference } from './materialization.js';

export interface UbsSemanticStoredContract {
  readonly artifact: {
    readonly artifactIdentity: string;
    readonly schemaVersion: string;
    readonly compilerVersion: number;
    readonly transformVersion: number;
    readonly rightsNoticeJson: string;
    readonly provenanceNoticeJson: string;
    readonly transformationWitnessJson: string;
  };
  readonly sources: readonly {
    readonly sourceId: string;
    readonly sourceRole: string;
    readonly schemaVersion: string;
    readonly transformVersion: number;
    readonly title: string;
    readonly artifactName: string;
    readonly artifactVersion: string;
    readonly sourceUrl: string;
    readonly sourceCommit: string;
    readonly sourceBlob: string;
    readonly sourceSha256: string;
    readonly license: string;
    readonly licenseUrl: string;
    readonly publisher: string;
    readonly modified: boolean;
    readonly modificationDescription: string;
  }[];
}

export function assertUbsSemanticStoredContract(
  db: Database.Database,
  contract: UbsSemanticStoredContract,
): void {
  const artifact = db.prepare(`SELECT artifact_identity, schema_version, compiler_version, transform_version,
    rights_notice_json, provenance_notice_json, transformation_witness_json
    FROM ubs_semantic_artifacts`).get() as Record<string, unknown> | undefined;
  if (!artifact
    || artifact.artifact_identity !== contract.artifact.artifactIdentity
    || artifact.schema_version !== contract.artifact.schemaVersion
    || artifact.compiler_version !== contract.artifact.compilerVersion
    || artifact.transform_version !== contract.artifact.transformVersion
    || artifact.rights_notice_json !== contract.artifact.rightsNoticeJson
    || artifact.provenance_notice_json !== contract.artifact.provenanceNoticeJson
    || artifact.transformation_witness_json !== contract.artifact.transformationWitnessJson) {
    throw new Error('UBS semantic artifact metadata is incomplete or stale');
  }
  const sourceRows = db.prepare(`SELECT artifact_identity, source_id, source_role, schema_version, transform_version,
    title, artifact_name, artifact_version, language, source_url, source_commit, source_blob, source_sha256,
    license, license_url, publisher, modified, modification_description
    FROM ubs_semantic_sources ORDER BY source_role, source_id`).all() as Array<Record<string, unknown>>;
  const expectedSources = contract.sources.map(source => ({
    artifact_identity: contract.artifact.artifactIdentity,
    source_id: source.sourceId,
    source_role: source.sourceRole,
    schema_version: source.schemaVersion,
    transform_version: source.transformVersion,
    title: source.title,
    artifact_name: source.artifactName,
    artifact_version: source.artifactVersion,
    language: 'Hebrew',
    source_url: source.sourceUrl,
    source_commit: source.sourceCommit,
    source_blob: source.sourceBlob,
    source_sha256: source.sourceSha256,
    license: source.license,
    license_url: source.licenseUrl,
    publisher: source.publisher,
    modified: source.modified ? 1 : 0,
    modification_description: source.modificationDescription,
  }));
  if (JSON.stringify(sourceRows) !== JSON.stringify(expectedSources)) {
    throw new Error('UBS semantic source provenance is incomplete or drifted');
  }
}

/** Rebuild the compiler payload exactly enough to bind every relational row. */
export function assertUbsSemanticStoredArtifactIdentity(
  db: Database.Database,
  contract: UbsSemanticStoredContract,
): void {
  const entries = db.prepare(`SELECT entry_id, source_entry_id, source_id, source_ordinal, lemma, part_of_speech_json
    FROM ubs_semantic_entries ORDER BY source_ordinal, entry_id`).all() as Array<Record<string, unknown>>;
  const identities = groupStrings(db.prepare(`SELECT entry_id, lexical_identity
    FROM ubs_semantic_entry_identities ORDER BY entry_id, lexical_identity`).all() as Array<Record<string, unknown>>, 'entry_id', 'lexical_identity');
  const domains = db.prepare(`SELECT domain_id, source_id, source_ordinal, parent_domain_id, label, description
    FROM ubs_semantic_domains ORDER BY source_ordinal, domain_id`).all() as Array<Record<string, unknown>>;
  const senses = db.prepare(`SELECT s.sense_id, s.source_sense_id, s.entry_id, s.source_id, s.source_ordinal,
    s.definition_status, s.definition, s.definition_exclusion_reasons_json, s.glosses_json, e.source_ordinal AS entry_source_ordinal
    FROM ubs_semantic_senses s JOIN ubs_semantic_entries e
      ON e.artifact_identity = s.artifact_identity AND e.entry_id = s.entry_id
    ORDER BY e.source_ordinal, s.source_ordinal, s.sense_id`).all() as Array<Record<string, unknown>>;
  const senseDomains = groupStrings(db.prepare(`SELECT sense_id, domain_id
    FROM ubs_semantic_sense_domains ORDER BY sense_id, domain_ordinal, domain_id`).all() as Array<Record<string, unknown>>, 'sense_id', 'domain_id');
  const evidence = db.prepare(`SELECT r.evidence_key, r.evidence_id, r.source_id, r.sense_id, r.source_ordinal,
    r.source_reference, r.raw_anchor, r.footnote_suffix, r.native_book_number, r.native_book_code,
    r.native_chapter, r.native_verse, e.source_ordinal AS entry_source_ordinal, s.source_ordinal AS sense_source_ordinal
    FROM ubs_semantic_reference_evidence r
    JOIN ubs_semantic_senses s ON s.artifact_identity = r.artifact_identity AND s.sense_id = r.sense_id
    JOIN ubs_semantic_entries e ON e.artifact_identity = s.artifact_identity AND e.entry_id = s.entry_id
    ORDER BY e.source_ordinal, s.source_ordinal, r.source_ordinal, r.evidence_id, r.evidence_key`).all() as Array<Record<string, unknown>>;
  const coordinates = new Map<number, Array<Record<string, unknown>>>();
  for (const row of db.prepare(`SELECT evidence_key, target_ordinal, normalized_book_number, normalized_book_code,
    normalized_chapter, normalized_verse, normalized_reference
    FROM ubs_semantic_normalized_coordinates ORDER BY evidence_key, target_ordinal, coordinate_key`).iterate() as Iterable<Record<string, unknown>>) {
    const key = integer(row.evidence_key, 'coordinate evidence key');
    coordinates.set(key, [...(coordinates.get(key) ?? []), row]);
  }
  const payload = {
    schemaVersion: contract.artifact.schemaVersion,
    compilerVersion: contract.artifact.compilerVersion,
    transformVersion: contract.artifact.transformVersion,
    sources: contract.sources.map(source => ({
      sourceId: source.sourceId,
      sourceRole: source.sourceRole,
      artifactName: source.artifactName,
      artifactVersion: source.artifactVersion,
      sourceUrl: source.sourceUrl,
      sourceCommit: source.sourceCommit,
      sourceBlob: source.sourceBlob,
      sourceSha256: source.sourceSha256,
      license: source.license,
      licenseUrl: source.licenseUrl,
      publisher: source.publisher,
      modified: source.modified,
      modificationDescription: source.modificationDescription,
    })),
    rightsNotice: parseObject(contract.artifact.rightsNoticeJson, 'rights notice'),
    provenanceNotice: parseObject(contract.artifact.provenanceNoticeJson, 'provenance notice'),
    transformationWitness: parseObject(contract.artifact.transformationWitnessJson, 'transformation witness'),
    domains: domains.map(row => ({
      domainId: text(row.domain_id, 'domain ID'), sourceId: text(row.source_id, 'domain source ID'),
      sourceOrdinal: integer(row.source_ordinal, 'domain ordinal'),
      ...(row.parent_domain_id === null ? {} : { parentDomainId: text(row.parent_domain_id, 'domain parent ID') }),
      label: text(row.label, 'domain label'),
      ...(row.description === null ? {} : { description: text(row.description, 'domain description') }),
    })),
    entries: entries.map(row => ({
      entryId: text(row.entry_id, 'entry ID'), sourceEntryId: text(row.source_entry_id, 'source entry ID'),
      sourceId: text(row.source_id, 'entry source ID'), sourceOrdinal: integer(row.source_ordinal, 'entry ordinal'),
      lemma: text(row.lemma, 'entry lemma'), partOfSpeech: parseArray(row.part_of_speech_json, 'entry parts of speech'),
      lexicalIdentities: identities.get(text(row.entry_id, 'entry ID')) ?? [],
    })),
    senses: senses.map(row => ({
      senseId: text(row.sense_id, 'sense ID'), sourceSenseId: text(row.source_sense_id, 'source sense ID'),
      entryId: text(row.entry_id, 'sense entry ID'), sourceId: text(row.source_id, 'sense source ID'),
      sourceOrdinal: integer(row.source_ordinal, 'sense ordinal'), definitionStatus: text(row.definition_status, 'definition status'),
      ...(row.definition === null ? {} : { definition: text(row.definition, 'definition') }),
      definitionExclusionReasons: parseArray(row.definition_exclusion_reasons_json, 'definition exclusion reasons'),
      glosses: parseArray(row.glosses_json, 'glosses'),
      domainIds: senseDomains.get(text(row.sense_id, 'sense ID')) ?? [],
    })),
    referenceEvidence: evidence.map(row => {
      const evidenceKey = integer(row.evidence_key, 'evidence key');
      const evidenceId = text(row.evidence_id, 'evidence ID');
      const normalized = coordinates.get(evidenceKey);
      if (!normalized?.length) throw new Error(`UBS semantic evidence ${evidenceKey} has no normalized coordinate`);
      return {
        evidenceId, sourceId: text(row.source_id, 'evidence source ID'),
        senseId: text(row.sense_id, 'evidence sense ID'), sourceOrdinal: integer(row.source_ordinal, 'evidence ordinal'),
        sourceReference: text(row.source_reference, 'source reference'), rawAnchor: text(row.raw_anchor, 'raw anchor'),
        footnoteSuffix: text(row.footnote_suffix, 'footnote suffix'),
        nativeCoordinate: {
          bookNumber: integer(row.native_book_number, 'native book number'), bookCode: text(row.native_book_code, 'native book code'),
          chapter: integer(row.native_chapter, 'native chapter'), verse: integer(row.native_verse, 'native verse'),
        },
        normalizedCoordinates: normalized.map((coordinate, coordinateIndex) => {
          if (integer(coordinate.target_ordinal, 'normalized coordinate ordinal') !== coordinateIndex + 1) {
            throw new Error(`UBS semantic evidence ${evidenceKey} has non-contiguous normalized coordinate ordinals`);
          }
          const normalizedCoordinate = {
            bookNumber: integer(coordinate.normalized_book_number, 'normalized book number'),
            bookCode: text(coordinate.normalized_book_code, 'normalized book code'),
            chapter: integer(coordinate.normalized_chapter, 'normalized chapter'),
            verse: integer(coordinate.normalized_verse, 'normalized verse'),
          };
          if (text(coordinate.normalized_reference, 'normalized reference') !== normalizedReference(normalizedCoordinate)) {
            throw new Error(`UBS semantic coordinate ${evidenceKey} has a non-canonical normalized reference`);
          }
          return normalizedCoordinate;
        }),
      };
    }),
  };
  const actualIdentity = createHash('sha256').update(canonicalJson(payload)).digest('hex');
  if (actualIdentity !== contract.artifact.artifactIdentity) {
    throw new Error('UBS semantic stored rows do not reproduce their declared artifact identity');
  }
}

function groupStrings(rows: readonly Record<string, unknown>[], key: string, value: string): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const group = text(row[key], key);
    grouped.set(group, [...(grouped.get(group) ?? []), text(row[value], value)]);
  }
  return grouped;
}

function parseObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('UBS semantic stored notice is not an object');
  return parsed as Record<string, unknown>;
}

function parseArray(value: unknown, label: string): string[] {
  if (typeof value !== 'string') throw new Error(`UBS semantic ${label} is not JSON text`);
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) {
    throw new Error(`UBS semantic ${label} is not a string array`);
  }
  return parsed;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`UBS semantic ${label} is not text`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`UBS semantic ${label} is not a safe integer`);
  return value as number;
}
