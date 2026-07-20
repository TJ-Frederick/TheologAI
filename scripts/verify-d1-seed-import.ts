#!/usr/bin/env tsx
/** Semantically reconstruct the generated D1 seed in disposable SQLite. */

import { createHash } from 'crypto';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { sha256File } from './d1-seed-utils.js';
import {
  assertGenesisOneOneDatabase,
  assertHebrewLemmaCoverageDatabase,
  assertJohnOneOneDatabase,
} from './data-integrity.js';
import { loadAndVerifyD1SeedManifest } from './d1-seed-manifest.js';
import { validateUbsParallelGroup } from '../src/adapters/shared/UbsParallelPassageRepository.js';
import type { ParallelSourceProvenance } from '../src/kernel/sourceAttestedParallels.js';
import { UBS_PARALLEL_PASSAGE_PROVENANCE } from '../src/kernel/ubsParallelSource.js';
import {
  createUbsSemanticStorageContract,
  type UbsSemanticStorageAudit,
} from './ubs-semantics/storageContract.js';
import { assertUbsSemanticStoredArtifactIdentity } from './ubs-semantics/storageReconstruction.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_DIRECTORY = join(ROOT, 'scripts', 'd1-seed');
const UBS_SEMANTIC_AUDIT = JSON.parse(readFileSync(join(
  ROOT, 'data/biblical-languages/ubs-open-license/v0.9.2/SEMANTIC-COMPILATION-AUDIT.json',
), 'utf8')) as UbsSemanticStorageAudit & {
  projection: { normalizedCoordinateRows: number; sourceEvidenceWithAmbiguousNormalizedCoordinates: number };
};
const UBS_SEMANTIC_STORAGE = createUbsSemanticStorageContract(UBS_SEMANTIC_AUDIT);

function databaseArgument(argv: string[]): string {
  let value: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--database') {
      if (value !== undefined) throw new Error('--database may only be specified once');
      value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--database requires a path');
    } else if (argument.startsWith('--database=')) {
      if (value !== undefined) throw new Error('--database may only be specified once');
      value = argument.slice('--database='.length);
      if (!value) throw new Error('--database requires a path');
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  const path = value
    ? (isAbsolute(value) ? value : resolve(ROOT, value))
    : join(ROOT, 'data', 'theologai.db');
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Source database not found: ${path}`);
  }
  return path;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  return `"${identifier}"`;
}

function tableDigest(db: Database.Database, table: string): { rows: number; sha256: string } {
  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{
    name: string;
    pk: number;
  }>;
  if (columns.length === 0) throw new Error(`Cannot hash missing table: ${table}`);

  const selected = columns.map(column => quoteIdentifier(column.name)).join(',');
  const primaryKey = columns.filter(column => column.pk > 0).sort((a, b) => a.pk - b.pk);
  const order = primaryKey.length > 0
    ? primaryKey.map(column => quoteIdentifier(column.name)).join(',')
    : columns.map(column => quoteIdentifier(column.name)).join(',');
  const hash = createHash('sha256');
  hash.update(columns.map(column => column.name).join('\0'));
  let rows = 0;

  for (const row of db.prepare(
    `SELECT ${selected} FROM ${quoteIdentifier(table)} ORDER BY ${order}`,
  ).iterate() as Iterable<Record<string, unknown>>) {
    rows++;
    for (const column of columns) {
      const value = row[column.name];
      if (value === null) {
        hash.update('n;');
      } else if (typeof value === 'number') {
        hash.update(`d${value};`);
      } else if (typeof value === 'bigint') {
        hash.update(`i${value};`);
      } else if (typeof value === 'string') {
        hash.update(`s${Buffer.byteLength(value, 'utf8')}:`);
        hash.update(value);
        hash.update(';');
      } else if (Buffer.isBuffer(value)) {
        hash.update(`b${value.byteLength}:`);
        hash.update(value);
        hash.update(';');
      } else {
        throw new Error(`Unsupported ${table}.${column.name} value type: ${typeof value}`);
      }
    }
  }
  return { rows, sha256: hash.digest('hex') };
}

function assertDatabaseHealth(db: Database.Database, expectedCounts: Record<string, number>): void {
  const integrity = db.pragma('integrity_check') as Array<Record<string, string>>;
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') {
    throw new Error(`Imported database integrity check failed: ${JSON.stringify(integrity)}`);
  }
  const foreignKeys = db.pragma('foreign_key_check') as unknown[];
  if (foreignKeys.length > 0) {
    throw new Error(`Imported database foreign-key check failed: ${JSON.stringify(foreignKeys)}`);
  }
  for (const [table, expected] of Object.entries(expectedCounts)) {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get() as { count: number };
    if (row.count !== expected) {
      throw new Error(`Imported ${table} count is ${row.count}; expected ${expected}`);
    }
  }

  const sectionFtsMismatches = db.prepare(
    `SELECT COUNT(*) AS count
       FROM sections_fts
       JOIN document_sections ds ON ds.id = sections_fts.rowid
      WHERE sections_fts.title IS NOT ds.title
         OR sections_fts.content IS NOT ds.content
         OR sections_fts.topics IS NOT ds.topics`,
  ).get() as { count: number };
  if (sectionFtsMismatches.count !== 0) {
    throw new Error(`Imported historical FTS has ${sectionFtsMismatches.count} rowid/content mismatches`);
  }
}

function assertRepresentativeFts(db: Database.Database): void {
  const strongs = db.prepare(
    `SELECT strongs_number FROM strongs_fts
     WHERE strongs_fts MATCH '"love"*'
     ORDER BY strongs_number LIMIT 1`,
  ).get();
  if (!strongs) throw new Error("Imported Strong's FTS has no representative 'love' result");

  const sections = db.prepare(
    `SELECT rowid FROM sections_fts
     WHERE sections_fts MATCH '"almighty"*'
     ORDER BY rowid LIMIT 1`,
  ).get();
  if (!sections) throw new Error("Imported historical FTS has no representative 'almighty' result");
}

function assertUbsReconstruction(db: Database.Database, expectedCounts: Record<string, number>): void {
  const incompleteGroups = db.prepare(`SELECT COUNT(*) AS count FROM ubs_parallel_groups g
    WHERE (SELECT COUNT(*) FROM ubs_parallel_members m WHERE m.group_id = g.group_id) < 2`).get() as { count: number };
  const incompleteMembers = db.prepare(`SELECT COUNT(*) AS count FROM ubs_parallel_members m
    WHERE NOT EXISTS (SELECT 1 FROM ubs_parallel_segments s WHERE s.group_id = m.group_id AND s.member_order = m.source_order)`).get() as { count: number };
  const source = db.prepare('SELECT artifact_identity, transform_version FROM ubs_parallel_sources').get() as { artifact_identity?: string; transform_version?: number } | undefined;
  if (incompleteGroups.count !== 0 || incompleteMembers.count !== 0
    || source?.artifact_identity !== 'a5fd0d4646cb69f426f592c6e334866191201fbe64691cd55c7f7ecd0ca9d4cc'
    || source?.transform_version !== 2) {
    throw new Error('Normalized UBS reconstruction is incomplete or has a stale artifact identity');
  }
  const ubsDelta = ['ubs_parallel_sources', 'ubs_parallel_groups', 'ubs_parallel_members', 'ubs_parallel_segments']
    .reduce((sum, table) => sum + expectedCounts[table], 0);
  if (ubsDelta !== 12_736) throw new Error(`Unexpected normalized UBS row delta: ${ubsDelta}`);

  const sourceRow = db.prepare(`SELECT * FROM ubs_parallel_sources WHERE source_id = 'ubs_paratext_parallel_passages'`).get() as Record<string, any>;
  const provenance: ParallelSourceProvenance = {
    sourceId: sourceRow.source_id, title: sourceRow.title, publisher: sourceRow.publisher,
    copyright: sourceRow.copyright, license: sourceRow.license, licenseUrl: sourceRow.license_url,
    sourceUrl: sourceRow.source_url, sourcePath: sourceRow.source_path, sourceCommit: sourceRow.source_commit,
    sourceCommitDate: sourceRow.source_commit_date, sourceBlob: sourceRow.source_blob,
    sourceBytes: sourceRow.source_bytes, sourceSha256: sourceRow.source_sha256,
    transformVersion: sourceRow.transform_version, modified: sourceRow.modified === 1,
    modificationNote: sourceRow.modification_note,
  };
  if (JSON.stringify(provenance) !== JSON.stringify(UBS_PARALLEL_PASSAGE_PROVENANCE)
    || sourceRow.schema_version !== 'ubs-parallel-passages.v2'
    || sourceRow.label !== 'source_attested_parallel'
    || sourceRow.directionality !== 'unspecified') {
    throw new Error('Normalized UBS source provenance differs from the reviewed descriptor');
  }
  const groups = db.prepare('SELECT * FROM ubs_parallel_groups ORDER BY source_ordinal').all() as Record<string, any>[];
  const members = db.prepare('SELECT * FROM ubs_parallel_members ORDER BY group_id, source_order').all() as Record<string, any>[];
  const segments = db.prepare('SELECT * FROM ubs_parallel_segments ORDER BY group_id, member_order, segment_order').all() as Record<string, any>[];
  const membersByGroup = new Map<string, Record<string, any>[]>();
  for (const member of members) membersByGroup.set(member.group_id, [...(membersByGroup.get(member.group_id) ?? []), member]);
  const segmentsByMember = new Map<string, Record<string, any>[]>();
  for (const segment of segments) {
    const key = `${segment.group_id}\0${segment.member_order}`;
    segmentsByMember.set(key, [...(segmentsByMember.get(key) ?? []), segment]);
  }
  groups.forEach((group, groupIndex) => validateUbsParallelGroup({
    groupId: group.group_id,
    sourceOrdinal: group.source_ordinal,
    label: group.label,
    directionality: group.directionality,
    provenance,
    members: (membersByGroup.get(group.group_id) ?? []).map((member, memberIndex) => {
      if (member.source_order !== memberIndex + 1) throw new Error('Normalized UBS member ordinals are not contiguous');
      return {
        sourceOrder: member.source_order,
        sourceReference: member.source_reference,
        normalizedReference: member.normalized_reference,
        languageMarker: member.language_marker,
        alignmentBasis: member.alignment_basis,
        alignmentRaw: member.alignment_raw,
        segments: (segmentsByMember.get(`${group.group_id}\0${member.source_order}`) ?? []).map((segment, segmentIndex) => {
          if (segment.segment_order !== segmentIndex + 1) throw new Error('Normalized UBS segment ordinals are not contiguous');
          return { bookNumber: segment.book_number, chapter: segment.chapter, startVerse: segment.start_verse, endVerse: segment.end_verse };
        }),
      };
    }),
  }, groupIndex + 1, provenance));
}

function assertUbsSemanticReconstruction(db: Database.Database, expectedCounts: Record<string, number>): void {
  const storage = UBS_SEMANTIC_STORAGE;
  const artifact = db.prepare(`SELECT artifact_identity, schema_version, compiler_version, transform_version,
    rights_notice_json, provenance_notice_json, transformation_witness_json
    FROM ubs_semantic_artifacts`).get() as Record<string, unknown> | undefined;
  if (!artifact
    || artifact.artifact_identity !== storage.artifact.artifactIdentity
    || artifact.schema_version !== storage.artifact.schemaVersion
    || artifact.compiler_version !== storage.artifact.compilerVersion
    || artifact.transform_version !== storage.artifact.transformVersion
    || artifact.rights_notice_json !== storage.artifact.rightsNoticeJson
    || artifact.provenance_notice_json !== storage.artifact.provenanceNoticeJson
    || artifact.transformation_witness_json !== storage.artifact.transformationWitnessJson) {
    throw new Error('UBS semantic artifact metadata is incomplete or stale');
  }
  const identity = artifact.artifact_identity as string;
  const sourceRows = db.prepare(`SELECT artifact_identity, source_id, source_role, schema_version, transform_version,
    title, artifact_name, artifact_version, language, source_url, source_commit, source_blob, source_sha256,
    license, license_url, publisher, modified, modification_description
    FROM ubs_semantic_sources ORDER BY source_role, source_id`).all() as Array<Record<string, unknown>>;
  const expectedSources = storage.sources.map(source => ({
    artifact_identity: storage.artifact.artifactIdentity,
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
    modified: 1,
    modification_description: source.modificationDescription,
  }));
  if (JSON.stringify(sourceRows) !== JSON.stringify(expectedSources)) {
    throw new Error('UBS semantic source provenance is incomplete or drifted');
  }
  const countDelta = Object.entries({
    ubs_semantic_artifacts: 1,
    ubs_semantic_sources: 2,
    ubs_semantic_domains: 411,
    ubs_semantic_entries: 8285,
    ubs_semantic_entry_identities: 9981,
    ubs_semantic_senses: 15123,
    ubs_semantic_sense_domains: 15361,
    ubs_semantic_reference_evidence: 249901,
    ubs_semantic_normalized_coordinates: 250393,
  }).reduce((sum, [table, expected]) => sum + (expectedCounts[table] === expected ? expected : -1), 0);
  if (countDelta !== 549458) throw new Error('UBS semantic manifest row inventory drifted');
  const unlinked = db.prepare(`SELECT
    (SELECT COUNT(*) FROM ubs_semantic_senses s LEFT JOIN ubs_semantic_entries e
      ON e.artifact_identity = s.artifact_identity AND e.entry_id = s.entry_id WHERE e.entry_id IS NULL) AS senses,
    (SELECT COUNT(*) FROM ubs_semantic_reference_evidence e LEFT JOIN ubs_semantic_senses s
      ON s.artifact_identity = e.artifact_identity AND s.sense_id = e.sense_id WHERE s.sense_id IS NULL) AS evidence,
    (SELECT COUNT(*) FROM ubs_semantic_normalized_coordinates c LEFT JOIN ubs_semantic_reference_evidence e
      ON e.evidence_key = c.evidence_key AND e.artifact_identity = c.artifact_identity WHERE e.evidence_key IS NULL) AS coordinates,
    (SELECT COUNT(*) FROM ubs_semantic_normalized_coordinates WHERE normalized_verse < 0) AS negative_verses,
    (SELECT COUNT(*) FROM ubs_semantic_normalized_coordinates WHERE artifact_identity = ? AND normalized_reference = '') AS blank_references,
    (SELECT COUNT(*) FROM (SELECT evidence_key FROM ubs_semantic_normalized_coordinates WHERE artifact_identity = ? GROUP BY evidence_key HAVING COUNT(*) > 1)) AS one_to_many
  `).get(identity, identity) as Record<string, number>;
  if (Object.values(unlinked).some(value => !Number.isSafeInteger(value))
    || unlinked.senses !== 0 || unlinked.evidence !== 0 || unlinked.coordinates !== 0
    || unlinked.negative_verses !== 0 || unlinked.blank_references !== 0
    || unlinked.one_to_many !== UBS_SEMANTIC_AUDIT.projection.sourceEvidenceWithAmbiguousNormalizedCoordinates) {
    throw new Error(`UBS semantic reconstruction integrity drift: ${JSON.stringify(unlinked)}`);
  }
  const coordinateRows = db.prepare(`SELECT COUNT(*) AS count FROM ubs_semantic_normalized_coordinates
    WHERE artifact_identity = ?`).get(identity) as { count: number };
  if (coordinateRows.count !== UBS_SEMANTIC_AUDIT.projection.normalizedCoordinateRows) {
    throw new Error('UBS semantic normalized-coordinate row count drifted');
  }
  assertUbsSemanticStoredArtifactIdentity(db, UBS_SEMANTIC_STORAGE);
}

const sourcePath = databaseArgument(process.argv.slice(2));
const manifest = loadAndVerifyD1SeedManifest(ROOT, SEED_DIRECTORY);

for (const migration of manifest.migrations) {
  const migrationPath = join(ROOT, migration.path);
  if (!existsSync(migrationPath) || sha256File(migrationPath) !== migration.sha256) {
    throw new Error(`Tracked migration does not match the D1 seed manifest: ${migration.path}`);
  }
}
for (const file of manifest.files) {
  const path = join(SEED_DIRECTORY, file.path);
  if (!existsSync(path) || statSync(path).size !== file.byteSize || sha256File(path) !== file.sha256) {
    throw new Error(`Seed file does not match its manifest: ${file.path}`);
  }
}

const workspace = mkdtempSync(join(tmpdir(), 'theologai-d1-seed-import-'));
const targetPath = join(workspace, 'imported.db');
const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
const target = new Database(targetPath);

try {
  target.pragma('journal_mode = OFF');
  target.pragma('synchronous = OFF');
  target.pragma('foreign_keys = ON');
  for (const migration of manifest.migrations) target.exec(readFileSync(join(ROOT, migration.path), 'utf8'));

  for (const file of manifest.files) {
    const sql = readFileSync(join(SEED_DIRECTORY, file.path), 'utf8');
    try {
      target.exec('BEGIN');
      target.exec(sql);
      target.exec('COMMIT');
    } catch (error) {
      if (target.inTransaction) target.exec('ROLLBACK');
      throw new Error(`Failed to apply ${file.path}`, { cause: error });
    }
  }

  assertDatabaseHealth(target, manifest.expectedCounts);
  assertJohnOneOneDatabase(source, 'Source SQLite morphology');
  assertJohnOneOneDatabase(target, 'Imported D1 morphology');
  assertGenesisOneOneDatabase(source, 'Source SQLite morphology');
  assertGenesisOneOneDatabase(target, 'Imported D1 morphology');
  assertHebrewLemmaCoverageDatabase(source, 'Source SQLite morphology');
  assertHebrewLemmaCoverageDatabase(target, 'Imported D1 morphology');
  assertRepresentativeFts(target);
  assertUbsReconstruction(source, manifest.expectedCounts);
  assertUbsReconstruction(target, manifest.expectedCounts);
  assertUbsSemanticReconstruction(source, manifest.expectedCounts);
  assertUbsSemanticReconstruction(target, manifest.expectedCounts);

  for (const table of Object.keys(manifest.expectedCounts)) {
    const sourceDigest = tableDigest(source, table);
    const targetDigest = tableDigest(target, table);
    if (JSON.stringify(targetDigest) !== JSON.stringify(sourceDigest)) {
      throw new Error(
        `Imported ${table} differs from source: expected ${JSON.stringify(sourceDigest)}, ` +
        `received ${JSON.stringify(targetDigest)}`,
      );
    }
  }

  const longestSource = source.prepare(
    'SELECT id, content FROM document_sections ORDER BY length(content) DESC, id LIMIT 1',
  ).get() as { id: number; content: string };
  const longestTarget = target.prepare(
    'SELECT id, content FROM document_sections WHERE id = ?',
  ).get(longestSource.id) as { id: number; content: string } | undefined;
  if (longestSource.content.length <= 10_000) {
    throw new Error('Source fixture has no long historical section to exercise seed reconstruction');
  }
  if (!longestTarget || longestTarget.content !== longestSource.content) {
    throw new Error(`Long historical section ${longestSource.id} was not reconstructed exactly`);
  }

  const guard = manifest.files.find(file => file.table === 'empty-target-check');
  if (!guard) throw new Error('Seed manifest has no empty-target guard');
  let guardRejected = false;
  try {
    target.exec(readFileSync(join(SEED_DIRECTORY, guard.path), 'utf8'));
  } catch {
    guardRejected = true;
  }
  if (!guardRejected) throw new Error('Empty-target guard accepted a populated database');

  console.error(
    `[verify-d1-seed-import] Reconstructed and compared ${Object.keys(manifest.expectedCounts).length} ` +
    `tables from ${manifest.files.length} ordered seed files.`,
  );
} finally {
  source.close();
  target.close();
  rmSync(workspace, { recursive: true, force: true });
}
