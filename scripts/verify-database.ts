#!/usr/bin/env tsx
/** Verify a generated TheologAI SQLite database without modifying it. */

import Database from 'better-sqlite3';
import { existsSync, readFileSync, statSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { buildD1ReadinessSql } from './check-remote-d1-readiness.js';
import {
  assertGenesisOneOneDatabase,
  assertHebrewLemmaCoverageDatabase,
  assertJohnOneOneDatabase,
} from './data-integrity.js';
import { computeD1CorpusIdentity, parseDataManifest, verifyD1Migrations } from './d1-corpus-identity.js';
import { verifyBiblicalLanguageUnicodeD1 } from './verify-biblical-language-unicode-d1.js';
import { UBS_SEMANTICS_DATABASE_CEILING_BYTES } from './ubs-semantics/capacity.js';
import { verifyHistoricalSectionCompatibilityAttestationFromDisk } from './historical-section-compatibility-compiler.js';
import { historicalLegacySectionId, readHistoricalSectionSources, sha256Canonical } from './historical-section-key-plan.js';
import { auditHistoricalTransform8Authority } from './historical-transform8-authority-audit.js';
import { HistoricalDocumentRepository } from '../src/adapters/data/HistoricalDocumentRepository.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'data', 'data-manifest.json');

function getDatabasePath(argv: string[]): string {
  const equalsArg = argv.find(arg => arg.startsWith('--database='));
  if (equalsArg) {
    const value = equalsArg.slice('--database='.length);
    if (!value) throw new Error('--database requires a path');
    return isAbsolute(value) ? value : resolve(ROOT, value);
  }

  const databaseIndex = argv.indexOf('--database');
  if (databaseIndex >= 0) {
    const value = argv[databaseIndex + 1];
    if (!value || value.startsWith('--')) throw new Error('--database requires a path');
    return isAbsolute(value) ? value : resolve(ROOT, value);
  }

  return join(ROOT, 'data', 'theologai.db');
}

const databasePath = getDatabasePath(process.argv.slice(2));
if (!existsSync(databasePath)) throw new Error(`Database not found: ${databasePath}`);

const manifest = parseDataManifest(readFileSync(MANIFEST_PATH));
verifyD1Migrations(ROOT, manifest);
const expectedTables = Object.keys(manifest.expectedCounts).sort();
const expectedIndexes = ['idx_document_sections_id_document', 'idx_historical_section_aliases_target', 'idx_historical_section_identities_browse', 'idx_morph_strongs', 'idx_morph_strongs_canonical', 'idx_morph_verse', 'idx_strongs_book_stats_order', 'idx_strongs_form_stats_rank', 'idx_ubs_groups_source_order', 'idx_ubs_segments_lookup', 'idx_ubs_semantic_identity_candidate', 'idx_ubs_semantic_sense_candidate_order', 'idx_ubs_semantic_sense_domain_order', 'idx_ubs_semantic_coordinate_lookup', 'idx_ubs_semantic_evidence_sense_order', 'idx_xref_from', 'idx_xref_votes'];
const db = new Database(databasePath, { readonly: true, fileMustExist: true });

function assertHistoricalTransform8Materialization(database: Database.Database): void {
  const compilation = verifyHistoricalSectionCompatibilityAttestationFromDisk(ROOT);
  const sourcesByDocument = new Map(readHistoricalSectionSources(ROOT).map(source => [source.documentId, source]));
  const identities = database.prepare(`SELECT
    identity.document_id AS documentId, identity.section_key AS sectionKey,
    identity.source_ordinal AS sourceOrdinal, identity.document_section_id AS documentSectionId,
    section.section_number AS legacySectionId, section.title AS title,
    section.content AS content, section.topics AS topics
    FROM historical_section_identities identity
    JOIN document_sections section
      ON section.id = identity.document_section_id AND section.document_id = identity.document_id
    ORDER BY identity.document_id, identity.source_ordinal, identity.section_key`).all() as Array<{
      documentId: string; sectionKey: string; sourceOrdinal: number; documentSectionId: number;
      legacySectionId: string; title: string; content: string; topics: string;
    }>;
  if (identities.length !== 3054) throw new Error(`Transform 8 identity count mismatch: ${identities.length}`);
  let index = 0;
  for (const document of compilation.map.documents) {
    const source = sourcesByDocument.get(document.documentId);
    if (!source || source.value.sections.length !== document.sections.length) {
      throw new Error(`Transform 8 source coverage drift for ${document.documentId}`);
    }
    for (const [sourceIndex, section] of document.sections.entries()) {
      const stored = identities[index++];
      const raw = source.value.sections[sourceIndex] as Record<string, unknown>;
      const expectedTitle = String(raw.title || raw.question || raw.chapter || raw.q || '');
      const expectedContent = String(raw.content || raw.answer || raw.a || '');
      const expectedTopics = JSON.stringify(raw.topics || []);
      if (!stored || stored.documentId !== document.documentId || stored.sectionKey !== section.sectionKey
        || stored.sourceOrdinal !== section.sourceOrdinal || stored.legacySectionId !== historicalLegacySectionId(raw, sourceIndex)
        || stored.title !== expectedTitle || stored.content !== expectedContent || stored.topics !== expectedTopics) {
        throw new Error(`Transform 8 canonical/body projection drift at ${document.documentId} source ordinal ${sourceIndex + 1}`);
      }
    }
  }
  const aliases = database.prepare(`SELECT document_id AS documentId, legacy_section_id AS legacySectionId,
    section_key AS sectionKey, source_ordinal AS sourceOrdinal
    FROM historical_section_aliases ORDER BY document_id, legacy_section_id`).all() as Array<{
      documentId: string; legacySectionId: string; sectionKey: string; sourceOrdinal: number;
    }>;
  const expectedAliases = compilation.map.documents.flatMap(document => document.legacyAliases.map(alias => ({
    documentId: document.documentId,
    legacySectionId: alias.legacySectionId,
    sectionKey: alias.targetSectionKey,
    sourceOrdinal: alias.targetSourceOrdinal,
  })));
  if (JSON.stringify(aliases) !== JSON.stringify(expectedAliases)) {
    throw new Error('Transform 8 source-first alias projection drifted');
  }
  const resolvedAliases = database.prepare(`SELECT alias.document_id AS documentId,
    alias.legacy_section_id AS legacySectionId, identity.section_key AS sectionKey,
    identity.source_ordinal AS sourceOrdinal, section.content AS content
    FROM historical_section_aliases alias
    JOIN historical_section_identities identity
      ON identity.document_id = alias.document_id AND identity.section_key = alias.section_key
        AND identity.source_ordinal = alias.source_ordinal
    JOIN document_sections section
      ON section.id = identity.document_section_id AND section.document_id = identity.document_id
    ORDER BY alias.document_id, alias.legacy_section_id`).all() as Array<{
      documentId: string; legacySectionId: string; sectionKey: string; sourceOrdinal: number; content: string;
    }>;
  if (resolvedAliases.length !== expectedAliases.length) {
    throw new Error('Transform 8 aliases failed to resolve every approved canonical target');
  }
  for (const alias of resolvedAliases) {
    const source = sourcesByDocument.get(alias.documentId);
    const expected = expectedAliases.find(candidate => candidate.documentId === alias.documentId
      && candidate.legacySectionId === alias.legacySectionId);
    const body = source?.value.sections[(alias.sourceOrdinal ?? 0) - 1] as Record<string, unknown> | undefined;
    const expectedContent = body ? String(body.content || body.answer || body.a || '') : undefined;
    if (!expected || expected.sectionKey !== alias.sectionKey || expected.sourceOrdinal !== alias.sourceOrdinal
      || expectedContent !== alias.content) {
      throw new Error(`Transform 8 alias resolved to an unapproved canonical body: ${alias.documentId}#${alias.legacySectionId}`);
    }
  }
  const collisionGroups = compilation.map.documents.flatMap(document => {
    const counts = new Map<string, number>();
    for (const section of document.sections) counts.set(section.legacySectionId, (counts.get(section.legacySectionId) ?? 0) + 1);
    return [...counts.entries()].filter(([, count]) => count > 1).map(([legacySectionId]) => `${document.documentId}\u0000${legacySectionId}`);
  });
  if (collisionGroups.length !== 23) throw new Error(`Transform 8 collision-group count mismatch: ${collisionGroups.length}`);
  const aliasLocatorsLeaked = database.prepare(`SELECT COUNT(*) AS count
    FROM historical_section_aliases alias
    JOIN historical_section_identities identity
      ON identity.document_id = alias.document_id AND identity.section_key = alias.legacy_section_id
    WHERE alias.legacy_section_id != alias.section_key`).get() as { count: number };
  if (aliasLocatorsLeaked.count !== 0) throw new Error('Transform 8 browse/search authority can emit a legacy alias as a canonical key');
  // Exercise the Node repository over every stored canonical identity and
  // every approved alias. SQL-side joins prove the materialization; these
  // calls also prove the production Node resolution precedence and mapping.
  const repository = new HistoricalDocumentRepository(database);
  const canonicalByIdentity = new Map(identities.map(identity => [
    `${identity.documentId}\u0000${identity.sectionKey}\u0000${identity.sourceOrdinal}`,
    identity,
  ]));
  for (const identity of identities) {
    const resolved = repository.resolveSection(identity.documentId, identity.sectionKey);
    if (!resolved || resolved.resolution !== 'canonical' || resolved.requestedSectionId !== identity.sectionKey
      || resolved.sectionKey !== identity.sectionKey || resolved.sourceOrdinal !== identity.sourceOrdinal
      || resolved.section.content !== identity.content) {
      throw new Error(`Transform 8 Node canonical resolution drifted at ${identity.documentId}#${identity.sectionKey}`);
    }
  }
  for (const alias of expectedAliases) {
    const canonical = canonicalByIdentity.get(`${alias.documentId}\u0000${alias.sectionKey}\u0000${alias.sourceOrdinal}`);
    const resolved = repository.resolveSection(alias.documentId, alias.legacySectionId);
    // A source key that also appears in legacy data must retain source-first
    // precedence; all other approved aliases must be explicitly identified.
    const expectedResolution = alias.legacySectionId === alias.sectionKey ? 'canonical' : 'legacy_alias';
    if (!canonical || !resolved || resolved.resolution !== expectedResolution
      || resolved.requestedSectionId !== alias.legacySectionId || resolved.sectionKey !== alias.sectionKey
      || resolved.sourceOrdinal !== alias.sourceOrdinal || resolved.section.content !== canonical.content) {
      throw new Error(`Transform 8 Node alias resolution drifted at ${alias.documentId}#${alias.legacySectionId}`);
    }
  }
  for (const document of compilation.map.documents) {
    const expected = identities.filter(identity => identity.documentId === document.documentId);
    const browsed = repository.browseHistoricalSectionSummaries(document.documentId, undefined, 2001);
    if (browsed.length !== expected.length || JSON.stringify(browsed.map(section => [section.sectionKey, section.sourceOrdinal]))
      !== JSON.stringify(expected.map(section => [section.sectionKey, section.sourceOrdinal]))) {
      throw new Error(`Transform 8 Node browse emitted a non-canonical or unordered identity for ${document.documentId}`);
    }
  }
  if (repository.resolveSection('nicene-creed', 'not-a-reviewed-section-key') !== undefined) {
    throw new Error('Transform 8 Node unknown-section resolution changed the not-found boundary');
  }
  const profiles = database.prepare(`SELECT document_id AS documentId, work_id AS workId, edition_id AS editionId,
    immutable_corpus_identity AS immutableCorpusIdentity, section_package_identity AS sectionPackageIdentity,
    delivery_mode AS deliveryMode, section_count AS sectionCount, landing_max_bytes AS landingMaxBytes,
    browse_page_size AS browsePageSize, cursor_version AS cursorVersion, provenance_json AS provenanceJson,
    rights_json AS rightsJson FROM historical_document_delivery_profiles ORDER BY document_id`).all() as Array<{
      documentId: string; workId: null; editionId: null; immutableCorpusIdentity: string;
      sectionPackageIdentity: null; deliveryMode: string; sectionCount: number; landingMaxBytes: number;
      browsePageSize: number; cursorVersion: number; provenanceJson: string; rightsJson: string;
    }>;
  const expectedProfiles = compilation.map.documents.map(document => {
    const source = sourcesByDocument.get(document.documentId)!;
    const immutableCorpusIdentity = sha256Canonical(source.value);
    return {
      documentId: document.documentId,
      workId: null,
      editionId: null,
      immutableCorpusIdentity,
      sectionPackageIdentity: null,
      deliveryMode: 'complete_document',
      sectionCount: document.sections.length,
      landingMaxBytes: 0,
      browsePageSize: 0,
      cursorVersion: 0,
      provenanceJson: JSON.stringify({
        status: 'legacy_local_document_without_edition_assertion',
        sourcePath: source.sourcePath,
        sourceCanonicalSha256: immutableCorpusIdentity,
        sectionKeyPlanCanonicalSha256: compilation.attestation.inputs.historicalSectionKeyPlanCanonicalSha256,
      }),
      rightsJson: JSON.stringify({
        status: 'not_retroactively_asserted',
        editionRights: 'not_established',
        redistributionApproval: 'not_asserted',
      }),
    };
  });
  if (JSON.stringify(profiles) !== JSON.stringify(expectedProfiles)) {
    throw new Error('Transform 8 delivery profile projection drifted');
  }
  const ftsMismatches = database.prepare(`SELECT COUNT(*) AS count FROM document_sections section
    LEFT JOIN sections_fts fts ON fts.rowid = section.id
    WHERE fts.rowid IS NULL OR fts.title IS NOT section.title OR fts.content IS NOT section.content
      OR fts.topics IS NOT section.topics`).get() as { count: number };
  if (ftsMismatches.count !== 0) throw new Error('Transform 8 changed the historical FTS projection');
}

try {
  const databaseBytes = statSync(databasePath).size;
  if (databaseBytes > UBS_SEMANTICS_DATABASE_CEILING_BYTES) {
    throw new Error(`SQLite database exceeds the 350 MiB UBS semantic capacity gate: ${databaseBytes} bytes`);
  }
  const integrityRows = db.pragma('integrity_check') as Array<Record<string, string>>;
  if (integrityRows.length !== 1 || Object.values(integrityRows[0])[0] !== 'ok') {
    throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrityRows)}`);
  }

  const foreignKeyViolations = db.pragma('foreign_key_check') as unknown[];
  if (foreignKeyViolations.length > 0) {
    throw new Error(`Foreign-key check failed: ${JSON.stringify(foreignKeyViolations)}`);
  }

  const tables = (db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  ).all() as Array<{ name: string }>)
    .map(row => row.name)
    .filter(name => !/_((data)|(idx)|(content)|(docsize)|(config))$/.test(name))
    .sort();
  if (JSON.stringify(tables) !== JSON.stringify(expectedTables)) {
    throw new Error(`Unexpected table set: expected ${expectedTables.join(', ')}, received ${tables.join(', ')}`);
  }

  const indexes = (db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'"
  ).all() as Array<{ name: string }>).map(row => row.name).sort();
  for (const expectedIndex of expectedIndexes) {
    if (!indexes.includes(expectedIndex)) throw new Error(`Required index is missing: ${expectedIndex}`);
  }

  for (const [table, expected] of Object.entries(manifest.expectedCounts)) {
    if (!/^[a-z_]+$/.test(table)) throw new Error(`Invalid table name in manifest: ${table}`);
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
    if (row.count !== expected) {
      throw new Error(`Unexpected ${table} count: expected ${expected}, received ${row.count}`);
    }
  }

  const metadata = Object.fromEntries(
    (db.prepare('SELECT key, value FROM theologai_metadata').all() as Array<{ key: string; value: string }>)
      .map(row => [row.key, row.value]),
  );
  if (metadata.schema_version !== manifest.schemaVersion) {
    throw new Error(`Schema version marker mismatch: ${metadata.schema_version ?? 'missing'}`);
  }
  const d1CorpusIdentity = computeD1CorpusIdentity(manifest);
  if (metadata.corpus_manifest_sha256 !== d1CorpusIdentity) {
    throw new Error('D1 corpus identity marker mismatch');
  }
  const readiness = db.prepare(
    buildD1ReadinessSql(manifest.expectedCounts, manifest.schemaVersion, d1CorpusIdentity),
  ).get() as { readiness?: string } | undefined;
  if (readiness?.readiness !== 'ready') {
    throw new Error('Production D1 readiness SQL did not accept the complete derived database');
  }
  assertJohnOneOneDatabase(db, 'Verified SQLite morphology');
  assertGenesisOneOneDatabase(db, 'Verified SQLite morphology');
  assertHebrewLemmaCoverageDatabase(db, 'Verified SQLite morphology');
  verifyBiblicalLanguageUnicodeD1(ROOT, db, manifest.expectedCounts);
  assertHistoricalTransform8Materialization(db);
  auditHistoricalTransform8Authority(ROOT, sql => {
    const rows = db.prepare(sql).all();
    return { rows, responseBytes: Buffer.byteLength(JSON.stringify(rows), 'utf8') };
  });

  const representativeQueries = [
    ["SELECT 1 FROM cross_references WHERE from_verse = 'John.3.16' LIMIT 1", 'John 3:16 cross-references'],
    ["SELECT 1 FROM strongs WHERE strongs_number = 'G25' LIMIT 1", "Strong's G25"],
    ["SELECT 1 FROM morphology WHERE book = 'Genesis' AND chapter = 1 AND verse = 1 LIMIT 1", 'Genesis 1:1 morphology'],
    ["SELECT 1 FROM documents WHERE id = 'nicene-creed' LIMIT 1", 'Nicene Creed'],
    ["SELECT 1 FROM documents WHERE id = 'nicene-creed' AND json_extract(metadata, '$.catalog.composition.startYear') = 381 AND json_extract(metadata, '$.catalog.composition.endYear') = 381 AND json_extract(metadata, '$.catalog.creators[0].role') = 'revising_body' LIMIT 1", 'Nicene Creed reviewed catalog metadata'],
    ['SELECT 1 FROM morph_codes LIMIT 1', 'morphology-code data'],
    ["SELECT 1 FROM ubs_semantic_artifacts WHERE transform_version = 7 LIMIT 1", 'UBS Hebrew semantic artifact'],
  ] as const;
  for (const [query, label] of representativeQueries) {
    if (!db.prepare(query).get()) throw new Error(`Representative record is missing: ${label}`);
  }

  const queryPlans = [
    {
      label: 'canonical token occurrence page',
      sql: `SELECT book, book_order, chapter, verse, position FROM morphology
            WHERE strongs_number = 'G0025'
            ORDER BY book_order, chapter, verse, position LIMIT 101`,
      index: 'idx_morph_strongs_canonical',
    },
    {
      label: 'canonical per-book usage',
      sql: `SELECT book, book_order, token_count, verse_count FROM strongs_book_stats
            WHERE strongs_key = 'G0025' ORDER BY book_order`,
      index: 'idx_strongs_book_stats_order',
    },
    {
      label: 'ranked attested forms',
      sql: `SELECT form_text, token_count, verse_count FROM strongs_form_stats
            WHERE strongs_key = 'G0025'
            ORDER BY token_count DESC, verse_count DESC, form_text LIMIT 100`,
      index: 'idx_strongs_form_stats_rank',
    },
    {
      label: 'UBS Hebrew candidate identity',
      sql: `SELECT entry_id FROM ubs_semantic_entry_identities
            WHERE artifact_identity = (SELECT artifact_identity FROM ubs_semantic_artifacts)
              AND lexical_identity = 'H0430' ORDER BY entry_id LIMIT 9`,
      index: 'idx_ubs_semantic_identity_candidate',
    },
    {
      label: 'UBS Hebrew normalized-coordinate lookup',
      sql: `SELECT evidence_key FROM ubs_semantic_normalized_coordinates
            WHERE normalized_reference = 'Genesis 1:1' ORDER BY evidence_key LIMIT 17`,
      index: 'idx_ubs_semantic_coordinate_lookup',
    },
    {
      label: 'historical canonical source-order browse',
      sql: `SELECT section_key, source_ordinal FROM historical_section_identities
            WHERE document_id = 'nicene-creed'
            ORDER BY source_ordinal, section_key LIMIT 33`,
      index: 'idx_historical_section_identities_browse',
    },
  ] as const;
  for (const plan of queryPlans) {
    const details = (db.prepare(`EXPLAIN QUERY PLAN ${plan.sql}`).all() as Array<{ detail: string }>)
      .map(row => row.detail).join('\n');
    if (!details.includes(plan.index) || details.includes('USE TEMP B-TREE')) {
      throw new Error(`${plan.label} does not use ${plan.index} without a temporary sort: ${details}`);
    }
  }
} finally {
  db.close();
}

console.error(`[verify-database] Verified ${databasePath}.`);
