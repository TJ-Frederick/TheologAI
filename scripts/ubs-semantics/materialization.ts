/** Shared, local-only transform-7 materialization helpers. */
import type Database from 'better-sqlite3';
import { BIBLE_BOOKS, getBibleBookBounds } from '../../src/kernel/books.js';
import type { D1SourceConsumptionRegistry } from '../d1-corpus-identity.js';
import {
  compilePinnedUbsHebrewV092FromBytes,
  canonicalJson,
  type PinnedUbsSemanticArtifact,
  type PinnedUbsSemanticCompilationAudit,
} from './pinnedCompiler.js';

export const UBS_SEMANTIC_MATERIALIZATION_INPUTS = Object.freeze([
  'data/biblical-languages/ubs-open-license/v0.9.2/NATIVE-TO-NORMALIZED-BRIDGE.json',
  'data/biblical-languages/ubs-open-license/v0.9.2/SEMANTIC-COMPILATION-AUDIT.json',
  'data/biblical-languages/ubs-open-license/v0.9.2/SOURCE.json',
  'data/biblical-languages/ubs-open-license/v0.9.2/en/UBSHebrewDic-v0.9.2-en.JSON',
  'data/biblical-languages/ubs-open-license/v0.9.2/en/UBSHebrewDicLexicalDomains-v0.9.2-en.JSON',
] as const);

export const UBS_SEMANTIC_EXPECTED_COUNTS = Object.freeze({
  ubs_semantic_artifacts: 1,
  ubs_semantic_sources: 2,
  ubs_semantic_domains: 411,
  ubs_semantic_entries: 8285,
  ubs_semantic_entry_identities: 9981,
  ubs_semantic_senses: 15123,
  ubs_semantic_sense_domains: 15361,
  ubs_semantic_reference_evidence: 249901,
  ubs_semantic_normalized_coordinates: 250393,
} as const);

export interface UbsSemanticMaterialization {
  artifact: PinnedUbsSemanticArtifact;
  audit: PinnedUbsSemanticCompilationAudit;
}

/**
 * The sole transform-7 source entrypoint for a derived database. Every byte
 * comes through the checked registry: adding a manifest input but bypassing it
 * is therefore detected by assertAllConsumed() in build-database.
 */
export function compileUbsSemanticMaterialization(
  sources: D1SourceConsumptionRegistry,
): UbsSemanticMaterialization {
  const bridgeBytes = sources.read(UBS_SEMANTIC_MATERIALIZATION_INPUTS[0]);
  const trackedAudit = JSON.parse(sources.read(UBS_SEMANTIC_MATERIALIZATION_INPUTS[1], 'utf8'));
  const sourceLock = JSON.parse(sources.read(UBS_SEMANTIC_MATERIALIZATION_INPUTS[2], 'utf8')) as {
    artifacts?: Array<{ id?: string; sha256?: string }>;
  };
  const dictionary = sources.read(UBS_SEMANTIC_MATERIALIZATION_INPUTS[3]);
  const domains = sources.read(UBS_SEMANTIC_MATERIALIZATION_INPUTS[4]);
  const compiled = compilePinnedUbsHebrewV092FromBytes({ dictionary, domains, bridgeBytes });

  if (canonicalJson(compiled.audit) !== canonicalJson(trackedAudit)) {
    throw new Error('Pinned UBS semantic compilation audit drifted before materialization');
  }
  const pinned = new Map((sourceLock.artifacts ?? []).map(source => [source.id, source.sha256]));
  for (const source of compiled.artifact.sources) {
    if (pinned.get(source.sourceId) !== source.sourceSha256) {
      throw new Error(`UBS semantic source-lock drift for ${source.sourceId}`);
    }
  }
  return { artifact: compiled.artifact, audit: compiled.audit };
}

/** Insert the exact compiler projection in reviewed canonical order. */
export function insertUbsSemanticMaterialization(
  db: Database.Database,
  artifact: PinnedUbsSemanticArtifact,
): Readonly<Record<keyof typeof UBS_SEMANTIC_EXPECTED_COUNTS, number>> {
  const insertArtifact = db.prepare(`INSERT INTO ubs_semantic_artifacts (
    artifact_identity, schema_version, compiler_version, transform_version,
    rights_notice_json, provenance_notice_json, transformation_witness_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertSource = db.prepare(`INSERT INTO ubs_semantic_sources (
    artifact_identity, source_id, source_role, schema_version, transform_version, title,
    artifact_name, artifact_version, language, source_url, source_commit, source_blob,
    source_sha256, license, license_url, publisher, modified, modification_description
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertDomain = db.prepare(`INSERT INTO ubs_semantic_domains (
    artifact_identity, source_id, domain_id, source_ordinal, parent_domain_id, label, description
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertEntry = db.prepare(`INSERT INTO ubs_semantic_entries (
    artifact_identity, source_id, entry_id, source_entry_id, source_ordinal, lemma, part_of_speech_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertIdentity = db.prepare(`INSERT INTO ubs_semantic_entry_identities (
    artifact_identity, entry_id, lexical_identity
  ) VALUES (?, ?, ?)`);
  const insertSense = db.prepare(`INSERT INTO ubs_semantic_senses (
    artifact_identity, source_id, sense_id, source_sense_id, entry_id, source_ordinal,
    definition_status, definition, definition_exclusion_reasons_json, glosses_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertSenseDomain = db.prepare(`INSERT INTO ubs_semantic_sense_domains (
    artifact_identity, sense_id, domain_id, domain_ordinal
  ) VALUES (?, ?, ?, ?)`);
  const insertEvidence = db.prepare(`INSERT INTO ubs_semantic_reference_evidence (
    evidence_key, artifact_identity, source_id, evidence_id, sense_id, source_ordinal, source_reference,
    raw_anchor, footnote_suffix, native_book_number, native_book_code, native_chapter, native_verse
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertCoordinate = db.prepare(`INSERT INTO ubs_semantic_normalized_coordinates (
    coordinate_key, evidence_key, target_ordinal, normalized_book_number, normalized_book_code,
    normalized_chapter, normalized_verse, normalized_reference
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const identity = artifact.artifactIdentity;
  const counts = { ...UBS_SEMANTIC_EXPECTED_COUNTS };
  for (const key of Object.keys(counts) as Array<keyof typeof counts>) counts[key] = 0;
  let evidenceKey = 0;
  let coordinateKey = 0;

  const materialize = db.transaction(() => {
    insertArtifact.run(
      identity, artifact.schemaVersion, artifact.compilerVersion, artifact.transformVersion,
      JSON.stringify(artifact.rightsNotice), JSON.stringify(artifact.provenanceNotice),
      JSON.stringify(artifact.transformationWitness),
    );
    counts.ubs_semantic_artifacts++;
    for (const source of artifact.sources) {
      insertSource.run(
        identity, source.sourceId, source.sourceRole, 'ubs-semantics.v1', artifact.transformVersion,
        source.sourceRole === 'dictionary' ? 'UBS Hebrew Dictionary' : 'UBS Hebrew Dictionary Lexical Domains',
        source.artifactName, source.artifactVersion, 'Hebrew', source.sourceUrl, source.sourceCommit,
        source.sourceBlob, source.sourceSha256, source.license, source.licenseUrl, source.publisher,
        source.modified ? 1 : 0, source.modificationDescription,
      );
      counts.ubs_semantic_sources++;
    }
    for (const domain of artifact.domains) {
      insertDomain.run(identity, domain.sourceId, domain.domainId, domain.sourceOrdinal,
        domain.parentDomainId ?? null, domain.label, domain.description ?? null);
      counts.ubs_semantic_domains++;
    }
    for (const entry of artifact.entries) {
      insertEntry.run(identity, entry.sourceId, entry.entryId, entry.sourceEntryId, entry.sourceOrdinal,
        entry.lemma, JSON.stringify(entry.partOfSpeech));
      counts.ubs_semantic_entries++;
      for (const lexicalIdentity of entry.lexicalIdentities) {
        insertIdentity.run(identity, entry.entryId, lexicalIdentity);
        counts.ubs_semantic_entry_identities++;
      }
    }
    for (const sense of artifact.senses) {
      insertSense.run(identity, sense.sourceId, sense.senseId, sense.sourceSenseId, sense.entryId,
        sense.sourceOrdinal, sense.definitionStatus, sense.definition ?? null,
        JSON.stringify(sense.definitionExclusionReasons), JSON.stringify(sense.glosses));
      counts.ubs_semantic_senses++;
      for (const [index, domainId] of sense.domainIds.entries()) {
        insertSenseDomain.run(identity, sense.senseId, domainId, index + 1);
        counts.ubs_semantic_sense_domains++;
      }
    }
    for (const evidence of artifact.referenceEvidence) {
      evidenceKey++;
      insertEvidence.run(evidenceKey, identity, evidence.sourceId, evidence.evidenceId, evidence.senseId,
        evidence.sourceOrdinal, evidence.sourceReference, evidence.rawAnchor, evidence.footnoteSuffix,
        evidence.nativeCoordinate.bookNumber, evidence.nativeCoordinate.bookCode,
        evidence.nativeCoordinate.chapter, evidence.nativeCoordinate.verse);
      counts.ubs_semantic_reference_evidence++;
      for (const [index, coordinate] of evidence.normalizedCoordinates.entries()) {
        coordinateKey++;
        insertCoordinate.run(coordinateKey, evidenceKey, index + 1, coordinate.bookNumber,
          coordinate.bookCode, coordinate.chapter, coordinate.verse, normalizedReference(coordinate));
        counts.ubs_semantic_normalized_coordinates++;
      }
    }
  });
  materialize();
  for (const [table, expected] of Object.entries(UBS_SEMANTIC_EXPECTED_COUNTS)) {
    const actual = counts[table as keyof typeof counts];
    if (actual !== expected) throw new Error(`UBS semantic ${table} count drift: expected ${expected}, got ${actual}`);
  }
  return Object.freeze({ ...counts });
}

export function normalizedReference(coordinate: {
  bookNumber: number;
  bookCode: string;
  chapter: number;
  verse: number;
}): string {
  const book = BIBLE_BOOKS.find(candidate => candidate.number === coordinate.bookNumber);
  if (!book || !Number.isSafeInteger(coordinate.chapter) || !Number.isSafeInteger(coordinate.verse)
    || coordinate.bookCode !== book.helloaoCode
    || coordinate.chapter < 1 || coordinate.chapter > getBibleBookBounds(book).maxVerseByChapter.length
    || coordinate.verse < 0
    || (coordinate.verse === 0 && book.number !== 19)
    || (coordinate.verse > 0 && coordinate.verse > getBibleBookBounds(book).maxVerseByChapter[coordinate.chapter - 1]!)) {
    throw new Error('UBS normalized coordinate is outside the canonical Bible registry');
  }
  return `${book.name} ${coordinate.chapter}:${coordinate.verse}`;
}
