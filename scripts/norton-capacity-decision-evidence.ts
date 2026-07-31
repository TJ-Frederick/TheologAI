#!/usr/bin/env tsx

/**
 * Local-only decision evidence for the inactive EEBO-TCP Norton package.
 *
 * A, B, and C are built into distinct fresh databases. Mutation residue is
 * measured separately. B and C also pass a focused isolated Workerd/D1 import.
 * No checked-in database, manifest, runtime, binding, or remote service changes.
 */

import Database from 'better-sqlite3';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HistoricalDocumentRepository } from '../src/adapters/data/HistoricalDocumentRepository.js';
import { composeLocalPrimarySourceFtsQuery } from '../src/adapters/shared/primarySourceSearchSql.js';
import { DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG } from '../src/kernel/featureFlags.js';
import { compileEditionPackage } from '../src/kernel/editionProvenanceFoundation.js';
import { LocalPrimarySourceSearchProvider } from '../src/services/historical/LocalPrimarySourceSearchProvider.js';
import { PrimarySourceSearchService } from '../src/services/historical/PrimarySourceSearchService.js';
import { createPrimarySourceSearchHandler } from '../src/tools/v2/primarySourceSearch.js';
import { computeD1CorpusIdentity, parseDataManifest } from './d1-corpus-identity.js';
import { D1_SEED_BASE_TABLES } from './d1-seed-order.js';
import { exportTable, type SeedStatement } from './export-for-d1.js';
import { assertSafeStatement, D1_SEED_FILE_BYTES } from './d1-seed-utils.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_PATH = 'data/historical-sources/eebo-tcp/A17662/norton-1561.edition.json';
const EXPECTED_PACKAGE_SHA256 = '3054f4446b2e92af87c1713ee1c44d6745bca42a32aed7c67890d25fedbdff33';
const EXPECTED_SOURCE_SHA256 = '90124aa3bf17f7dcb5cab40719ed362c91c0018194b7397884b58f6b10daf5a4';
const EXPECTED_SOURCE_BYTES = 4_820_278;
const EXPECTED_SOURCE_COMMIT = '32191150ad4a919dfd2c28c89b1dbc1c2396252a';
const EXPECTED_SECTION_COUNT = 1_250;
const REQUIRED_NODE_VERSION = '22.23.1';
const CONSERVATIVE_GATE_BYTES = 350 * 1024 * 1024;
const WORK_ID = 'calvin-institutes-of-the-christian-religion';
const EDITION_ID = 'calvin-institutes-norton-1561-eebo-tcp-a17662';
const PACK_ID = 'eebo-tcp-a17662-norton-1561-capacity-decision';
const ARTIFACT_ID = 'eebo-tcp-a17662-norton-1561';
const PAGE_SIZE = 32;
const WORKERD_SEED_ROWS = 100;
const NORMALIZED_RIGHTS_PENDING = {
  status: 'not_reviewed',
  scope: 'no_release_authority',
  basis: 'capacity experiment only; no normalized-text rights decision has been made',
  reviewedAt: null,
} as const;

export type CandidateName =
  | 'A_current_four_copy'
  | 'B_historical_external_content_fts'
  | 'C_historical_and_runtime_external_content_fts'
  | 'D_norton_sidecar_lower_scope';

export interface CandidateLayout {
  historicalExternalContent: boolean;
  runtimeExternalContent: boolean;
}

export function candidateLayout(name: CandidateName): CandidateLayout {
  return {
    historicalExternalContent:
      name === 'B_historical_external_content_fts'
      || name === 'C_historical_and_runtime_external_content_fts',
    runtimeExternalContent: name === 'C_historical_and_runtime_external_content_fts',
  };
}

type Section = {
  sectionKey: string;
  sourceOrdinal: number;
  displayLabel: string;
  heading: string;
  content: string;
};

type NortonSource = {
  sections: Section[];
  packageSha256: string;
  work: {
    workId: string;
    title: string;
    creatorMetadataStatus: string;
    creators: unknown[];
  };
  edition: Record<string, any>;
  source: {
    sha256: string;
    bytes: number;
    acquiredAt: string;
    locator: string;
  };
};

type DatabaseMeasure = {
  fileBytes: number;
  pageSize: number;
  pageCount: number;
  freelistPages: number;
  integrityCheck: 'ok';
  foreignKeyViolations: 0;
  accountedDbstatPages: number;
  ftsContentShadowTables: string[];
  dbstat: Array<{ name: string; pages: number; bytes: number }>;
};

type QueryCase = {
  id: string;
  text: string;
  match: 'all_terms' | 'phrase';
  selection: 'relevance' | 'work_diversity';
  limit: 1 | 3 | 8;
  work?: string;
  author?: string;
  startYear?: number;
  endYear?: number;
};

const QUERY_CASES: QueryCase[] = [
  { id: 'term-limit-1', text: 'God', match: 'all_terms', selection: 'relevance', limit: 1 },
  { id: 'term-limit-8', text: 'Christ faith', match: 'all_terms', selection: 'relevance', limit: 8 },
  { id: 'phrase', text: 'holy scripture', match: 'phrase', selection: 'relevance', limit: 3 },
  { id: 'punctuation', text: "church's doctrine", match: 'all_terms', selection: 'relevance', limit: 3 },
  {
    id: 'work-filter',
    text: 'sacrament',
    match: 'all_terms',
    selection: 'relevance',
    limit: 3,
    work: WORK_ID,
  },
  {
    id: 'creator-date-diversity',
    text: 'prayer',
    match: 'all_terms',
    selection: 'work_diversity',
    limit: 8,
    author: 'Jean Calvin (1509–1564)',
    startYear: 1559,
    endYear: 1561,
  },
];

function fail(message: string): never {
  throw new Error(`[norton-capacity] ${message}`);
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalNortonEvidence(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const canonical = canonicalNortonEvidence;

function hash(value: unknown): string {
  return sha256(canonicalNortonEvidence(value));
}

export function stripNortonVolatileMeasurements(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutVolatileMeasurements);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !key.endsWith('Ms') && !key.endsWith('Meta'))
        .map(([key, item]) => [key, withoutVolatileMeasurements(item)]),
    );
  }
  return value;
}

const withoutVolatileMeasurements = stripNortonVolatileMeasurements;

export const NORTON_DETERMINISTIC_HASH_DOMAIN =
  'sha256(canonical-json(recursively-remove timing keys ending Ms and engine metadata keys ending Meta)).v1';
export const NORTON_COMPLETE_HASH_DOMAIN =
  'sha256(canonical-json(envelope excluding only completeArtifactSha256)).v1';

export function attachNortonEvidenceHashes<T extends Record<string, unknown>>(payload: T) {
  const deterministicEvidenceSha256 = hash(stripNortonVolatileMeasurements(payload));
  const withoutCompleteHash = {
    ...payload,
    deterministicEvidenceHashDomain: NORTON_DETERMINISTIC_HASH_DOMAIN,
    deterministicEvidenceSha256,
    completeArtifactHashDomain: NORTON_COMPLETE_HASH_DOMAIN,
  };
  return {
    ...withoutCompleteHash,
    completeArtifactSha256: hash(withoutCompleteHash),
  };
}

export function verifyNortonCompleteArtifactHash(envelope: Record<string, unknown>): boolean {
  if (envelope.completeArtifactHashDomain !== NORTON_COMPLETE_HASH_DOMAIN
    || typeof envelope.completeArtifactSha256 !== 'string') return false;
  const withoutCompleteHash = { ...envelope };
  delete withoutCompleteHash.completeArtifactSha256;
  return hash(withoutCompleteHash) === envelope.completeArtifactSha256;
}

function integer(db: Database.Database, pragma: string): number {
  const row = db.prepare(pragma).get() as Record<string, unknown>;
  const value = Object.values(row)[0];
  if (!Number.isSafeInteger(value)) fail(`${pragma} did not return an integer`);
  return value as number;
}

export function measureNortonDatabase(db: Database.Database, path: string): DatabaseMeasure {
  const integrity = db.prepare('PRAGMA integrity_check').pluck().all();
  if (integrity.length !== 1 || integrity[0] !== 'ok') fail(`${basename(path)} failed integrity_check`);
  if (db.prepare('PRAGMA foreign_key_check').all().length !== 0) fail(`${basename(path)} failed foreign_key_check`);
  const pageSize = integer(db, 'PRAGMA page_size');
  const pageCount = integer(db, 'PRAGMA page_count');
  const fileBytes = statSync(path).size;
  if (pageSize * pageCount !== fileBytes) fail(`${basename(path)} page accounting drifted`);
  const freelistPages = integer(db, 'PRAGMA freelist_count');
  const dbstat = db.prepare(
    'SELECT name, COUNT(*) AS pages, SUM(pgsize) AS bytes FROM dbstat GROUP BY name ORDER BY name',
  ).all() as Array<{ name: string; pages: number; bytes: number }>;
  const accountedDbstatPages = dbstat.reduce((sum, row) => sum + row.pages, 0);
  if (accountedDbstatPages + freelistPages !== pageCount) {
    fail(`${basename(path)} dbstat plus freelist did not account for every database page`);
  }
  return {
    fileBytes,
    pageSize,
    pageCount,
    freelistPages,
    integrityCheck: 'ok',
    foreignKeyViolations: 0,
    accountedDbstatPages,
    ftsContentShadowTables: (db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts_content' ORDER BY name",
    ).all() as Array<{ name: string }>).map(row => row.name),
    dbstat,
  };
}

const measure = measureNortonDatabase;

function closeAfter<T>(db: Database.Database, action: (database: Database.Database) => T): T {
  try {
    return action(db);
  } finally {
    if (db.open) db.close();
  }
}

async function asyncCloseAfter<T>(
  db: Database.Database,
  action: (database: Database.Database) => Promise<T>,
): Promise<T> {
  try {
    return await action(db);
  } finally {
    if (db.open) db.close();
  }
}

function command(root: string, script: string, args: string[]): void {
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve(root, script), ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) fail(`${script} failed: ${`${result.stderr}${result.stdout}`.trim().slice(-4_000)}`);
}

function buildBaseline(root: string, output: string): void {
  command(root, 'scripts/build-database.ts', ['--output', output]);
  command(root, 'scripts/verify-database.ts', ['--database', output]);
}

function loadSource(root: string): NortonSource {
  const bytes = readFileSync(join(root, PACKAGE_PATH));
  if (sha256(bytes) !== EXPECTED_PACKAGE_SHA256) fail('reviewed Norton package pin drifted');
  const compiled = compileEditionPackage(JSON.parse(bytes.toString('utf8')));
  if (compiled.sha256 !== EXPECTED_PACKAGE_SHA256 || !bytes.equals(Buffer.from(compiled.utf8))) {
    fail('Norton edition package is not canonical');
  }
  const packet = compiled.package;
  if (packet.work.workId !== WORK_ID || packet.edition.editionId !== EDITION_ID
    || packet.sections.length !== EXPECTED_SECTION_COUNT) fail('Norton package identity/count drifted');
  if (packet.edition.source.sha256 !== EXPECTED_SOURCE_SHA256
    || packet.edition.source.bytes !== EXPECTED_SOURCE_BYTES
    || packet.edition.source.pin.kind !== 'git_commit'
    || packet.edition.source.pin.value !== EXPECTED_SOURCE_COMMIT) fail('Norton authority artifact pin drifted');
  const sections = packet.sections.map((section, index) => {
    const expectedKey = `a17662-source-ordinal-${String(index + 1).padStart(4, '0')}`;
    if (section.sourceOrdinal !== index + 1 || section.sectionKey !== expectedKey) {
      fail('Norton section key/order drifted');
    }
    return {
      sectionKey: section.sectionKey,
      sourceOrdinal: section.sourceOrdinal,
      displayLabel: section.displayLabel,
      heading: section.heading,
      content: section.content,
    };
  });
  return {
    sections,
    packageSha256: compiled.sha256,
    work: packet.work,
    edition: packet.edition,
    source: {
      sha256: packet.edition.source.sha256,
      bytes: packet.edition.source.bytes,
      acquiredAt: packet.edition.source.acquiredAt,
      locator: packet.edition.source.locator,
    },
  };
}

export function externalizeNortonMigration(sql: string, layout: CandidateLayout): string {
  let result = sql;
  if (layout.runtimeExternalContent) {
    const before = result;
    result = result.replace(
      /CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5\(\s*title,\s*content,\s*topics\s*\);/m,
      "CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5(title, content, topics, content='document_sections', content_rowid='id');",
    );
    if (before === result && sql.includes('CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts')) {
      fail('runtime FTS migration rewrite did not match');
    }
  }
  if (layout.historicalExternalContent) {
    const before = result;
    result = result.replace(
      /CREATE VIRTUAL TABLE historical_edition_sections_fts USING fts5\(\s*edition_id UNINDEXED,\s*section_key UNINDEXED,\s*heading,\s*content\s*\);/m,
      "CREATE VIRTUAL TABLE historical_edition_sections_fts USING fts5(edition_id UNINDEXED, section_key UNINDEXED, heading, content, content='historical_edition_sections', content_rowid='rowid');",
    );
    if (before === result && sql.includes('CREATE VIRTUAL TABLE historical_edition_sections_fts')) {
      fail('historical FTS migration rewrite did not match');
    }
  }
  return result;
}

const externalizeMigration = externalizeNortonMigration;

function sqlString(value: string): string {
  if (value.includes('\0')) fail('NUL is not valid in SQLite text');
  return `'${value.replaceAll("'", "''")}'`;
}

function copyPinnedBaseline(
  root: string,
  sourcePath: string,
  targetPath: string,
  layout: CandidateLayout,
  migrationPaths: string[],
): void {
  const target = new Database(targetPath);
  try {
    target.pragma('foreign_keys = ON');
    for (const migration of migrationPaths) {
      target.exec(externalizeMigration(readFileSync(join(root, migration), 'utf8'), layout));
    }
    target.exec(`ATTACH DATABASE ${sqlString(sourcePath)} AS pinned_source`);
    for (const table of D1_SEED_BASE_TABLES) {
      target.exec(`INSERT INTO main."${table}" SELECT * FROM pinned_source."${table}"`);
    }
    target.exec('DETACH DATABASE pinned_source');
    rebuildFts(target, layout);
    target.exec('ANALYZE');
  } finally {
    target.close();
  }
}

function rebuildFts(db: Database.Database, layout: CandidateLayout): void {
  if (layout.historicalExternalContent) {
    db.prepare("INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts) VALUES ('rebuild')").run();
  } else {
    db.exec(`INSERT INTO historical_edition_sections_fts(edition_id, section_key, heading, content)
      SELECT edition_id, section_key, heading, content FROM historical_edition_sections`);
  }
  if (layout.runtimeExternalContent) {
    db.prepare("INSERT INTO sections_fts(sections_fts) VALUES ('rebuild')").run();
  } else {
    db.exec(`INSERT INTO sections_fts(rowid, title, content, topics)
      SELECT id, title, content, topics FROM document_sections`);
  }
  db.prepare("INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts, rank) VALUES ('integrity-check', 1)").run();
  db.prepare("INSERT INTO sections_fts(sections_fts, rank) VALUES ('integrity-check', 1)").run();
}

function catalogMetadata(source: NortonSource): Record<string, unknown> {
  return {
    topics: [],
    catalog: {
      lookupAliases: ['Institutes', 'Norton Institutes'],
      creators: source.work.creators,
      metadataProvenanceIds: ['hist-meta-norton-capacity-experiment'],
      metadataStatus: 'reviewed',
      composition: { label: 'Final Latin edition 1559; Norton English translation 1561', startYear: 1559, endYear: 1561 },
    },
  };
}

function insertNorton(db: Database.Database, source: NortonSource, layout: CandidateLayout): void {
  db.pragma('foreign_keys = ON');
  const edition = source.edition;
  db.transaction(() => {
    db.prepare(`INSERT INTO historical_source_packs
      (pack_id, revision, schema_version, manifest_sha256, source_path)
      VALUES (?, ?, ?, ?, ?)`).run(
      PACK_ID,
      'local-only-decision-evidence',
      'norton-capacity-decision-evidence.v2',
      source.packageSha256,
      PACKAGE_PATH,
    );
    db.prepare(`INSERT INTO historical_works
      (work_id, title, creator_metadata_status, creators_json) VALUES (?, ?, ?, ?)`).run(
      source.work.workId,
      source.work.title,
      source.work.creatorMetadataStatus,
      JSON.stringify(source.work.creators),
    );
    db.prepare(`INSERT INTO historical_editions
      (edition_id, work_id, pack_id, language, contributor_groups_json, publication, version,
       provenance_status, provenance_uncertainty, provenance_reviewed_at,
       underlying_work_rights_json, exact_artifact_rights_json, normalized_text_rights_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      edition.editionId,
      edition.workId,
      PACK_ID,
      edition.language,
      JSON.stringify(edition.contributorGroups),
      edition.publication,
      edition.version,
      edition.provenance.status,
      edition.provenance.uncertainty,
      edition.provenance.reviewedAt,
      JSON.stringify(edition.underlyingWorkRights),
      JSON.stringify(edition.exactArtifactRights),
      JSON.stringify(NORMALIZED_RIGHTS_PENDING),
    );
    db.prepare(`INSERT INTO historical_source_artifacts
      (artifact_id, edition_id, role, locator, pin_kind, pin_value, sha256, bytes, acquired_at)
      VALUES (?, ?, 'authority', ?, 'sha256', ?, ?, ?, ?)`).run(
      ARTIFACT_ID,
      EDITION_ID,
      source.source.locator,
      source.source.sha256,
      source.source.sha256,
      source.source.bytes,
      source.source.acquiredAt,
    );
    db.prepare('INSERT INTO documents (id, title, type, date, metadata) VALUES (?, ?, ?, ?, ?)').run(
      WORK_ID,
      source.work.title,
      'historical_work',
      '1559–1561',
      JSON.stringify(catalogMetadata(source)),
    );
    db.prepare(`INSERT INTO historical_document_delivery_profiles
      (document_id, work_id, edition_id, immutable_corpus_identity, section_package_identity,
       delivery_mode, section_count, landing_max_bytes, browse_page_size, cursor_version,
       provenance_json, rights_json)
      VALUES (?, ?, ?, ?, ?, 'sectioned_only', ?, 16384, 32, 1, ?, ?)`).run(
      WORK_ID,
      WORK_ID,
      EDITION_ID,
      source.packageSha256,
      source.packageSha256,
      EXPECTED_SECTION_COUNT,
      JSON.stringify({ status: 'local_only_experiment' }),
      JSON.stringify(edition.exactArtifactRights),
    );
    const normalized = db.prepare(`INSERT INTO historical_edition_sections
      (edition_id, section_key, source_ordinal, display_label, heading, content)
      VALUES (?, ?, ?, ?, ?, ?)`);
    const historicalFts = db.prepare(`INSERT INTO historical_edition_sections_fts
      (edition_id, section_key, heading, content) VALUES (?, ?, ?, ?)`);
    const runtime = db.prepare(`INSERT INTO document_sections
      (document_id, section_number, title, content, topics) VALUES (?, ?, ?, ?, '[]')`);
    const runtimeFts = db.prepare('INSERT INTO sections_fts(rowid, title, content, topics) VALUES (?, ?, ?, ?)');
    const identity = db.prepare(`INSERT INTO historical_section_identities
      (document_id, section_key, source_ordinal, document_section_id) VALUES (?, ?, ?, ?)`);
    for (const section of source.sections) {
      normalized.run(EDITION_ID, section.sectionKey, section.sourceOrdinal, section.displayLabel, section.heading, section.content);
      if (!layout.historicalExternalContent) {
        historicalFts.run(EDITION_ID, section.sectionKey, section.heading, section.content);
      }
      const id = Number(runtime.run(WORK_ID, section.sectionKey, section.heading, section.content).lastInsertRowid);
      if (!layout.runtimeExternalContent) runtimeFts.run(id, section.heading, section.content, '[]');
      identity.run(WORK_ID, section.sectionKey, section.sourceOrdinal, id);
    }
  })();
  if (layout.historicalExternalContent) {
    db.prepare("INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts) VALUES ('rebuild')").run();
  }
  if (layout.runtimeExternalContent) {
    db.prepare("INSERT INTO sections_fts(sections_fts) VALUES ('rebuild')").run();
  }
  db.prepare("INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts, rank) VALUES ('integrity-check', 1)").run();
  db.prepare("INSERT INTO sections_fts(sections_fts, rank) VALUES ('integrity-check', 1)").run();
  const rights = db.prepare(
    'SELECT exact_artifact_rights_json AS exactRights, normalized_text_rights_json AS normalizedRights FROM historical_editions WHERE edition_id=?',
  ).get(EDITION_ID) as { exactRights: string | null; normalizedRights: string | null };
  if (rights.exactRights !== JSON.stringify(edition.exactArtifactRights)
    || rights.normalizedRights !== JSON.stringify(NORMALIZED_RIGHTS_PENDING)) {
    fail('rights projection did not preserve exact-artifact evidence and pending normalized-text decision');
  }
}

function immutableCorpusSealSql(): string {
  return `
    CREATE TABLE norton_capacity_corpus_seal (id INTEGER PRIMARY KEY CHECK(id=1), sealed INTEGER NOT NULL CHECK(sealed=1));
    INSERT INTO norton_capacity_corpus_seal VALUES (1, 1);
    CREATE TRIGGER norton_historical_insert_sealed BEFORE INSERT ON historical_edition_sections
      WHEN EXISTS(SELECT 1 FROM norton_capacity_corpus_seal WHERE sealed=1)
      BEGIN SELECT RAISE(ABORT, 'immutable Norton capacity corpus'); END;
    CREATE TRIGGER norton_historical_update_sealed BEFORE UPDATE ON historical_edition_sections
      BEGIN SELECT RAISE(ABORT, 'immutable Norton capacity corpus'); END;
    CREATE TRIGGER norton_historical_delete_sealed BEFORE DELETE ON historical_edition_sections
      BEGIN SELECT RAISE(ABORT, 'immutable Norton capacity corpus'); END;
    CREATE TRIGGER norton_runtime_insert_sealed BEFORE INSERT ON document_sections
      WHEN EXISTS(SELECT 1 FROM norton_capacity_corpus_seal WHERE sealed=1)
      BEGIN SELECT RAISE(ABORT, 'immutable Norton capacity corpus'); END;
    CREATE TRIGGER norton_runtime_update_sealed BEFORE UPDATE ON document_sections
      BEGIN SELECT RAISE(ABORT, 'immutable Norton capacity corpus'); END;
    CREATE TRIGGER norton_runtime_delete_sealed BEFORE DELETE ON document_sections
      BEGIN SELECT RAISE(ABORT, 'immutable Norton capacity corpus'); END;
  `;
}

function sealImmutableCorpus(db: Database.Database): void {
  db.exec(immutableCorpusSealSql());
  for (const sql of [
    `UPDATE historical_edition_sections SET heading=heading WHERE edition_id=${sqlString(EDITION_ID)} AND source_ordinal=1`,
    `DELETE FROM document_sections WHERE document_id=${sqlString(WORK_ID)} AND section_number='a17662-source-ordinal-0001'`,
    `INSERT INTO historical_edition_sections(edition_id,section_key,source_ordinal,display_label,heading,content)
      VALUES (${sqlString(EDITION_ID)},'forbidden',9999,'forbidden','forbidden','forbidden')`,
  ]) {
    let rejected = false;
    try {
      db.exec(sql);
    } catch (error) {
      rejected = error instanceof Error && error.message.includes('immutable Norton capacity corpus');
    }
    if (!rejected) fail('immutable-corpus trigger did not reject a post-rebuild mutation');
  }
}

function directRetrievalProof(db: Database.Database) {
  const rows = [1, 625, 1250].map(sourceOrdinal => db.prepare(`SELECT section_key AS sectionKey,
    source_ordinal AS sourceOrdinal, heading, content FROM historical_edition_sections
    WHERE edition_id=? AND source_ordinal=?`).get(EDITION_ID, sourceOrdinal) as {
      sectionKey: string;
      sourceOrdinal: number;
      heading: string;
      content: string;
    });
  return rows.map(row => ({
    sectionKey: row.sectionKey,
    sourceOrdinal: row.sourceOrdinal,
    headingSha256: sha256(row.heading),
    contentSha256: sha256(row.content),
  }));
}

function paginationProof(db: Database.Database) {
  const keys: string[] = [];
  let ordinal = 0;
  let key = '';
  let pages = 0;
  const query = db.prepare(`SELECT section_key AS sectionKey, source_ordinal AS sourceOrdinal
    FROM historical_edition_sections
    WHERE edition_id=? AND (source_ordinal>? OR (source_ordinal=? AND section_key>?))
    ORDER BY source_ordinal, section_key LIMIT ?`);
  while (true) {
    const rows = query.all(EDITION_ID, ordinal, ordinal, key, PAGE_SIZE) as Array<{
      sectionKey: string;
      sourceOrdinal: number;
    }>;
    if (rows.length === 0) break;
    pages++;
    for (const row of rows) keys.push(row.sectionKey);
    ordinal = rows.at(-1)!.sourceOrdinal;
    key = rows.at(-1)!.sectionKey;
  }
  if (keys.length !== EXPECTED_SECTION_COUNT || new Set(keys).size !== keys.length) {
    fail('cursor pagination did not conserve the Norton section inventory');
  }
  return { pageSize: PAGE_SIZE, pageCount: pages, orderedSectionKeysSha256: sha256(keys.join('\n')) };
}

function nortonMatchOrder(db: Database.Database) {
  const result: Record<string, { historical: string; runtime: string; count: number }> = {};
  for (const queryCase of QUERY_CASES) {
    const fts = composeLocalPrimarySourceFtsQuery(queryCase.text, queryCase.match);
    const historical = db.prepare(`SELECT section_key AS sectionKey
      FROM historical_edition_sections_fts
      WHERE historical_edition_sections_fts MATCH ? AND edition_id=?
      ORDER BY rank, rowid LIMIT ?`).all(fts, EDITION_ID, queryCase.limit) as Array<{ sectionKey: string }>;
    const runtime = db.prepare(`SELECT section.section_number AS sectionKey
      FROM sections_fts JOIN document_sections section ON section.id=sections_fts.rowid
      WHERE sections_fts MATCH ? AND section.document_id=?
      ORDER BY rank, sections_fts.rowid LIMIT ?`).all(fts, WORK_ID, queryCase.limit) as Array<{ sectionKey: string }>;
    result[queryCase.id] = {
      historical: hash(historical),
      runtime: hash(runtime),
      count: historical.length,
    };
  }
  return result;
}

async function layeredParity(db: Database.Database) {
  const repository = new HistoricalDocumentRepository(db);
  const local = new LocalPrimarySourceSearchProvider(repository);
  const unavailableExternal = { search: async () => fail('external provider must remain unused') };
  const service = new PrimarySourceSearchService(
    local,
    unavailableExternal as never,
    DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG,
  );
  const tool = createPrimarySourceSearchHandler(service);
  const results: Record<string, unknown> = {};
  for (const queryCase of QUERY_CASES) {
    const repositoryRows = repository.searchPrimarySources({
      text: queryCase.text,
      match: queryCase.match,
      selection: queryCase.selection,
      ...(queryCase.work || queryCase.author || queryCase.startYear !== undefined || queryCase.endYear !== undefined
        ? { documentIds: [WORK_ID] }
        : {}),
      limit: queryCase.limit,
    });
    const query = {
      id: queryCase.id,
      text: queryCase.text,
      providers: ['local'],
      match: queryCase.match,
      selection: queryCase.selection,
      limit: queryCase.limit,
      ...(queryCase.work ? { work: queryCase.work } : {}),
      ...(queryCase.author ? { author: queryCase.author } : {}),
      ...(queryCase.startYear !== undefined ? { startYear: queryCase.startYear } : {}),
      ...(queryCase.endYear !== undefined ? { endYear: queryCase.endYear } : {}),
    };
    const serviceResult = await service.search({ queries: [query] });
    const toolResult = await tool.handler({ queries: [query] });
    if (toolResult.isError) fail(`${queryCase.id} tool parity call returned isError`);
    const repositoryIdentity = repositoryRows.map(row => ({
      documentId: row.document.id,
      sectionKey: row.sectionKey,
      sourceOrdinal: row.sourceOrdinal,
    }));
    const serviceIdentity = serviceResult.queries[0]!.providers[0]!.hits.map(hit => ({
      documentId: hit.locator.kind === 'local_section' ? hit.locator.documentId : null,
      sectionKey: hit.locator.kind === 'local_section' ? hit.locator.sectionKey : null,
      sourceOrdinal: hit.locator.kind === 'local_section' ? hit.locator.sourceOrdinal : null,
    }));
    if (canonical(repositoryIdentity.slice(0, queryCase.limit)) !== canonical(serviceIdentity)) {
      fail(`${queryCase.id} repository/service identity drifted`);
    }
    results[queryCase.id] = {
      repositoryCount: repositoryIdentity.length,
      serviceStatus: serviceResult.queries[0]!.providers[0]!.status,
      toolSchemaVersion: (toolResult.structuredContent as { schemaVersion?: string }).schemaVersion,
      repositoryIdentitySha256: hash(repositoryIdentity),
      serviceOutputSha256: hash(serviceResult),
      toolOutputSha256: hash(toolResult),
    };
  }
  return results;
}

function baselineCompatibility(db: Database.Database, expectedDocumentCount: number) {
  const documentCount = (db.prepare('SELECT COUNT(*) AS count FROM documents WHERE id != ?').get(WORK_ID) as {
    count: number;
  }).count;
  if (documentCount !== expectedDocumentCount) {
    fail(`baseline historical count ${documentCount} does not match pinned manifest ${expectedDocumentCount}`);
  }
  return {
    documentCount,
    documentProjectionSha256: hash(db.prepare(`SELECT d.id, d.title, d.type, d.date,
      section.section_number, section.title
      FROM documents d JOIN document_sections section ON section.document_id=d.id
      WHERE d.id != ? ORDER BY d.id, section.id`).all(WORK_ID)),
    browseProjectionSha256: hash(db.prepare(`SELECT profile.document_id, identity.section_key,
      identity.source_ordinal FROM historical_document_delivery_profiles profile
      JOIN historical_section_identities identity ON identity.document_id=profile.document_id
      WHERE profile.document_id != ? ORDER BY profile.document_id, identity.source_ordinal,
      identity.section_key`).all(WORK_ID)),
  };
}

function capacityGate(measurement: DatabaseMeasure) {
  return {
    policyOwner: 'TheologAI conservative release engineering',
    basis: 'fresh_direct_pre_vacuum_after_analyze',
    limitBytes: CONSERVATIVE_GATE_BYTES,
    cloudflareLimitClaim: 'none_this_is_not_a_cloudflare_platform_limit',
    candidateBytes: measurement.fileBytes,
    headroomBytes: CONSERVATIVE_GATE_BYTES - measurement.fileBytes,
    status: measurement.fileBytes <= CONSERVATIVE_GATE_BYTES ? 'within_conservative_gate' : 'exceeds_conservative_gate',
  };
}

async function buildCandidate(
  root: string,
  temp: string,
  name: Exclude<CandidateName, 'D_norton_sidecar_lower_scope'>,
  source: NortonSource,
  manifest: ReturnType<typeof parseDataManifest>,
  expectedDocumentCount: number,
) {
  const started = performance.now();
  const freshBaseline = join(temp, `${name}-fresh-source.sqlite`);
  const candidatePath = name === 'A_current_four_copy'
    ? freshBaseline
    : join(temp, `${name}-fresh-target.sqlite`);
  buildBaseline(root, freshBaseline);
  const layout = candidateLayout(name);
  if (name !== 'A_current_four_copy') {
    copyPinnedBaseline(
      root,
      freshBaseline,
      candidatePath,
      layout,
      manifest.materializations.d1.migrations.map(item => item.path),
    );
  }
  return await asyncCloseAfter(new Database(candidatePath), async db => {
    insertNorton(db, source, layout);
    if (name !== 'A_current_four_copy') sealImmutableCorpus(db);
    db.exec('ANALYZE');
    const preVacuum = measure(db, candidatePath);
    const compatibility = baselineCompatibility(db, expectedDocumentCount);
    const matchOrder = nortonMatchOrder(db);
    const parity = await layeredParity(db);
    const postVacuum = (() => {
      db.exec('VACUUM');
      return measure(db, candidatePath);
    })();
    return {
      name,
      buildMethod: 'fresh_direct_layout_build',
      layout,
      elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
      preVacuum,
      postVacuumDiagnostic: postVacuum,
      capacityGate: capacityGate(preVacuum),
      compatibility,
      retrieval: directRetrievalProof(db),
      pagination: paginationProof(db),
      matchOrder,
      layeredParity: parity,
      immutableCorpus:
        name === 'A_current_four_copy'
          ? { contract: 'current_layout_reference_no_experimental_seal' }
          : {
              contract: 'seed_base_tables_then_rebuild_fts_once_then_seal',
              postSealMutationsRejected: true,
              incrementalFtsTriggersRequired: false,
            },
    };
  });
}

function mutationResidueDiagnostic(
  sourcePath: string,
  outputPath: string,
  layout: CandidateLayout,
  directBytes: number,
) {
  copyFileSync(sourcePath, outputPath);
  return closeAfter(new Database(outputPath), db => {
    if (layout.historicalExternalContent) {
      db.exec('DROP TABLE historical_edition_sections_fts');
      db.exec("CREATE VIRTUAL TABLE historical_edition_sections_fts USING fts5(edition_id UNINDEXED, section_key UNINDEXED, heading, content, content='historical_edition_sections', content_rowid='rowid')");
    }
    if (layout.runtimeExternalContent) {
      db.exec('DROP TABLE sections_fts');
      db.exec("CREATE VIRTUAL TABLE sections_fts USING fts5(title, content, topics, content='document_sections', content_rowid='id')");
    }
    if (layout.historicalExternalContent) {
      db.prepare("INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts) VALUES ('rebuild')").run();
    }
    if (layout.runtimeExternalContent) {
      db.prepare("INSERT INTO sections_fts(sections_fts) VALUES ('rebuild')").run();
    }
    db.exec('ANALYZE');
    const beforeVacuum = measure(db, outputPath);
    db.exec('VACUUM');
    const afterVacuum = measure(db, outputPath);
    return {
      diagnosticOnly: true,
      capacityDecisionInput: false,
      freshCandidateInputMutated: false,
      sourceDatabaseRole: 'separate_legacy_mutation_path_copy',
      outputDatabaseRole: 'disposable_diagnostic_copy',
      mutationMethod: 'copy_then_drop_recreate_rebuild',
      directCandidateBytes: directBytes,
      beforeVacuum,
      afterVacuum,
      preVacuumResidueBytesVersusDirect: beforeVacuum.fileBytes - directBytes,
      postVacuumBytesVersusDirect: afterVacuum.fileBytes - directBytes,
    };
  });
}

function workerdSchema(layout: CandidateLayout): string {
  return `
    CREATE TABLE historical_edition_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      edition_id TEXT NOT NULL,
      section_key TEXT NOT NULL,
      source_ordinal INTEGER NOT NULL,
      display_label TEXT NOT NULL,
      heading TEXT NOT NULL,
      content TEXT NOT NULL,
      UNIQUE(edition_id, section_key),
      UNIQUE(edition_id, source_ordinal)
    );
    CREATE TABLE document_sections (
      id INTEGER PRIMARY KEY,
      document_id TEXT NOT NULL,
      section_number TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      topics TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE historical_edition_sections_fts USING fts5(
      edition_id UNINDEXED, section_key UNINDEXED, heading, content,
      content='historical_edition_sections', content_rowid='id'
    );
    CREATE VIRTUAL TABLE sections_fts USING fts5(
      title, content, topics
      ${layout.runtimeExternalContent ? ", content='document_sections', content_rowid='id'" : ''}
    );
    CREATE TABLE norton_capacity_corpus_seal (
      id INTEGER PRIMARY KEY CHECK(id=1), sealed INTEGER NOT NULL CHECK(sealed=1)
    );
    CREATE TRIGGER norton_historical_insert_sealed BEFORE INSERT ON historical_edition_sections
      WHEN EXISTS(SELECT 1 FROM norton_capacity_corpus_seal WHERE sealed=1)
      BEGIN SELECT RAISE(ABORT, 'immutable Norton capacity corpus'); END;
    CREATE TRIGGER norton_historical_update_sealed BEFORE UPDATE ON historical_edition_sections
      BEGIN SELECT RAISE(ABORT, 'immutable Norton capacity corpus'); END;
    CREATE TRIGGER norton_historical_delete_sealed BEFORE DELETE ON historical_edition_sections
      BEGIN SELECT RAISE(ABORT, 'immutable Norton capacity corpus'); END;
    CREATE TRIGGER norton_runtime_insert_sealed BEFORE INSERT ON document_sections
      WHEN EXISTS(SELECT 1 FROM norton_capacity_corpus_seal WHERE sealed=1)
      BEGIN SELECT RAISE(ABORT, 'immutable Norton capacity corpus'); END;
    CREATE TRIGGER norton_runtime_update_sealed BEFORE UPDATE ON document_sections
      BEGIN SELECT RAISE(ABORT, 'immutable Norton capacity corpus'); END;
    CREATE TRIGGER norton_runtime_delete_sealed BEFORE DELETE ON document_sections
      BEGIN SELECT RAISE(ABORT, 'immutable Norton capacity corpus'); END;
  `;
}

function workerdSeedFiles(directory: string, sections: Section[], layout: CandidateLayout): {
  paths: string[];
  bytes: number;
  sha256: string;
} {
  const paths: string[] = [];
  let bytes = 0;
  const hashes: string[] = [];
  for (let offset = 0; offset < sections.length; offset += WORKERD_SEED_ROWS) {
    const statements = ['BEGIN TRANSACTION;'];
    for (const section of sections.slice(offset, offset + WORKERD_SEED_ROWS)) {
      statements.push(`INSERT INTO historical_edition_sections
        (edition_id,section_key,source_ordinal,display_label,heading,content) VALUES
        (${sqlString(EDITION_ID)},${sqlString(section.sectionKey)},${section.sourceOrdinal},
         ${sqlString(section.displayLabel)},${sqlString(section.heading)},${sqlString(section.content)});`);
      statements.push(`INSERT INTO document_sections(id,document_id,section_number,title,content,topics) VALUES
        (${section.sourceOrdinal},${sqlString(WORK_ID)},${sqlString(section.sectionKey)},
         ${sqlString(section.heading)},${sqlString(section.content)},'[]');`);
      if (!layout.runtimeExternalContent) {
        statements.push(`INSERT INTO sections_fts(rowid,title,content,topics) VALUES
          (${section.sourceOrdinal},${sqlString(section.heading)},${sqlString(section.content)},'[]');`);
      }
    }
    statements.push('COMMIT;');
    const body = `${statements.join('\n')}\n`;
    const path = join(directory, `seed-${String(paths.length + 1).padStart(3, '0')}.sql`);
    writeFileSync(path, body, { mode: 0o600 });
    paths.push(path);
    bytes += Buffer.byteLength(body);
    hashes.push(sha256(body));
  }
  return { paths, bytes, sha256: sha256(hashes.join('\n')) };
}

function focusedWorkerdExpectedOrder(source: NortonSource, layout: CandidateLayout) {
  return closeAfter(new Database(':memory:'), db => {
    db.exec(workerdSchema(layout));
    const historical = db.prepare(`INSERT INTO historical_edition_sections
      (edition_id,section_key,source_ordinal,display_label,heading,content)
      VALUES (?,?,?,?,?,?)`);
    const runtime = db.prepare(`INSERT INTO document_sections
      (id,document_id,section_number,title,content,topics) VALUES (?,?,?,?,?,'[]')`);
    const runtimeFts = db.prepare(
      'INSERT INTO sections_fts(rowid,title,content,topics) VALUES (?,?,?,?)',
    );
    db.transaction(() => {
      for (const section of source.sections) {
        historical.run(
          EDITION_ID,
          section.sectionKey,
          section.sourceOrdinal,
          section.displayLabel,
          section.heading,
          section.content,
        );
        runtime.run(
          section.sourceOrdinal,
          WORK_ID,
          section.sectionKey,
          section.heading,
          section.content,
        );
        if (!layout.runtimeExternalContent) {
          runtimeFts.run(section.sourceOrdinal, section.heading, section.content, '[]');
        }
      }
    })();
    db.prepare(
      "INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts) VALUES ('rebuild')",
    ).run();
    if (layout.runtimeExternalContent) {
      db.prepare("INSERT INTO sections_fts(sections_fts) VALUES ('rebuild')").run();
    }
    db.prepare(
      "INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts,rank) VALUES ('integrity-check',1)",
    ).run();
    db.prepare("INSERT INTO sections_fts(sections_fts,rank) VALUES ('integrity-check',1)").run();
    return nortonMatchOrder(db);
  });
}

type D1Result = {
  results?: Array<Record<string, unknown>>;
  success?: boolean;
  meta?: Record<string, unknown>;
};

export function parseNortonD1Json(output: string): D1Result[] {
  const parsed = JSON.parse(output) as unknown;
  if (!Array.isArray(parsed) || !parsed.every(item => item && typeof item === 'object')) {
    fail('Workerd D1 response was not a JSON result array');
  }
  const results = parsed as D1Result[];
  if (results.some(result => result.success !== true)) fail('Workerd D1 command reported failure');
  return results;
}

const parseD1Json = parseNortonD1Json;

function workerdProof(root: string, temp: string, name: 'B' | 'C', source: NortonSource, expected: Record<string, {
  historical: string;
  runtime: string;
  count: number;
}>) {
  const started = performance.now();
  const directory = join(temp, `workerd-${name.toLowerCase()}`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const state = join(directory, 'state');
  const layout = name === 'B'
    ? candidateLayout('B_historical_external_content_fts')
    : candidateLayout('C_historical_and_runtime_external_content_fts');
  const config = join(directory, 'wrangler.toml');
  const worker = join(directory, 'worker.mjs');
  const schema = join(directory, 'schema.sql');
  const rebuild = join(directory, 'rebuild-and-seal.sql');
  const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  writeFileSync(worker, 'export default { fetch() { return new Response("local only"); } };', { mode: 0o600 });
  writeFileSync(config, `name = "norton-capacity-${name.toLowerCase()}"
main = "${worker.replaceAll('\\', '\\\\')}"
compatibility_date = "2026-07-01"
[[d1_databases]]
binding = "NORTON_DB"
database_name = "norton-capacity-${name.toLowerCase()}"
database_id = "00000000-0000-0000-0000-00000000000${name === 'B' ? 'b' : 'c'}"
`, { mode: 0o600 });
  writeFileSync(schema, workerdSchema(layout), { mode: 0o600 });
  writeFileSync(rebuild, `
    INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts) VALUES ('rebuild');
    ${layout.runtimeExternalContent ? "INSERT INTO sections_fts(sections_fts) VALUES ('rebuild');" : ''}
    INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts,rank) VALUES ('integrity-check',1);
    INSERT INTO sections_fts(sections_fts,rank) VALUES ('integrity-check',1);
    INSERT INTO norton_capacity_corpus_seal VALUES (1,1);
  `, { mode: 0o600 });
  const seed = workerdSeedFiles(directory, source.sections, layout);
  const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/(CLOUDFLARE|CF_API|TOKEN|SECRET|PRIVATE_KEY)/i.test(key)
  ));
  const run = (args: string[]) => {
    if (!args.includes('--local')) fail('Workerd command refused without --local');
    const callStarted = performance.now();
    const output = execFileSync(process.execPath, [wrangler, ...args], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...safeEnv,
        WRANGLER_SEND_METRICS: 'false',
        WRANGLER_LOG_PATH: join(directory, 'wrangler.log'),
      },
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      elapsedMs: Math.round((performance.now() - callStarted) * 1000) / 1000,
      pages: parseD1Json(output),
    };
  };
  const common = ['NORTON_DB', '--local', '--persist-to', state, '--config', config, '--json'];
  const schemaResult = run(['d1', 'execute', ...common, '--file', schema]);
  const imports = seed.paths.map(path => run(['d1', 'execute', ...common, '--file', path]));
  const rebuildResult = run(['d1', 'execute', ...common, '--file', rebuild]);
  const queryProof: Record<string, unknown> = {};
  for (const queryCase of QUERY_CASES) {
    const fts = sqlString(composeLocalPrimarySourceFtsQuery(queryCase.text, queryCase.match));
    const historical = run(['d1', 'execute', ...common, '--command', `SELECT section_key AS sectionKey
      FROM historical_edition_sections_fts
      WHERE historical_edition_sections_fts MATCH ${fts} AND edition_id=${sqlString(EDITION_ID)}
      ORDER BY rank,rowid LIMIT ${queryCase.limit};`]);
    const runtime = run(['d1', 'execute', ...common, '--command', `SELECT section.section_number AS sectionKey
      FROM sections_fts JOIN document_sections section ON section.id=sections_fts.rowid
      WHERE sections_fts MATCH ${fts} AND section.document_id=${sqlString(WORK_ID)}
      ORDER BY rank,sections_fts.rowid LIMIT ${queryCase.limit};`]);
    const historicalRows = historical.pages.flatMap(page => page.results ?? []);
    const runtimeRows = runtime.pages.flatMap(page => page.results ?? []);
    if (hash(historicalRows) !== expected[queryCase.id]?.historical
      || hash(runtimeRows) !== expected[queryCase.id]?.runtime) {
      fail(`Workerd ${name} ${queryCase.id} MATCH identity/order drifted`);
    }
    queryProof[queryCase.id] = {
      count: historicalRows.length,
      orderedRowsSha256: hash(historicalRows),
      historicalElapsedMs: historical.elapsedMs,
      runtimeElapsedMs: runtime.elapsedMs,
      historicalMeta: historical.pages.map(page => page.meta ?? {}),
      runtimeMeta: runtime.pages.map(page => page.meta ?? {}),
    };
  }
  const retrieval = run(['d1', 'execute', ...common, '--command', `SELECT section_key AS sectionKey,
    source_ordinal AS sourceOrdinal,length(heading) AS headingChars,length(content) AS contentChars
    FROM historical_edition_sections WHERE source_ordinal IN (1,625,1250)
    ORDER BY source_ordinal;`]);
  const retrieved = retrieval.pages.flatMap(page => page.results ?? []);
  if (retrieved.length !== 3) fail(`Workerd ${name} boundary retrieval did not return three rows`);
  const triggerInventory = run(['d1', 'execute', ...common, '--command',
    "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'norton_%_sealed' ORDER BY name;",
  ]);
  const triggers = triggerInventory.pages.flatMap(page => page.results ?? []);
  if (triggers.length !== 6) fail(`Workerd ${name} immutable trigger inventory drifted`);
  return {
    runtime: 'isolated_local_workerd_d1',
    layout: name,
    elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
    schemaImportMs: schemaResult.elapsedMs,
    seed: {
      fileCount: seed.paths.length,
      bytes: seed.bytes,
      sha256: seed.sha256,
      importElapsedMs: Math.round(imports.reduce((sum, item) => sum + item.elapsedMs, 0) * 1000) / 1000,
      importMeta: imports.flatMap(item => item.pages.map(page => page.meta ?? {})),
    },
    ftsRebuildAndSealMs: rebuildResult.elapsedMs,
    ftsIntegrityChecks: 2,
    retrieval: {
      rows: retrieved,
      elapsedMs: retrieval.elapsedMs,
      meta: retrieval.pages.map(page => page.meta ?? {}),
    },
    queryProof,
    immutableTriggerCount: triggers.length,
    immutableCorpusContract: 'seed_base_tables_then_rebuild_fts_once_then_seal_no_incremental_mutation',
  };
}

type FullSeedFile = {
  path: string;
  table: string;
  chunk: number;
  bytes: number;
  rows: number;
  statements: number;
  sha256: string;
};

export function writeNortonSeedChunks(
  directory: string,
  table: string,
  ordinal: number,
  statements: readonly SeedStatement[],
): FullSeedFile[] {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const files: FullSeedFile[] = [];
  let chunk: SeedStatement[] = [];
  let bytes = 0;
  const flush = () => {
    if (chunk.length === 0) return;
    const path = join(
      directory,
      `${String(ordinal).padStart(2, '0')}-${table.replaceAll('_', '-')}-${String(files.length).padStart(3, '0')}.sql`,
    );
    const content = `${chunk.map(item => item.sql).join('\n')}\n`;
    writeFileSync(path, content, { mode: 0o600 });
    files.push({
      path,
      table,
      chunk: files.length,
      bytes: Buffer.byteLength(content),
      rows: chunk.reduce((sum, item) => sum + item.rows, 0),
      statements: chunk.length,
      sha256: sha256(content),
    });
    chunk = [];
    bytes = 0;
  };
  for (const [index, statement] of statements.entries()) {
    const statementBytes = assertSafeStatement(statement.sql, `${table} statement ${index + 1}`) + 1;
    if (chunk.length > 0 && bytes + statementBytes > D1_SEED_FILE_BYTES) flush();
    chunk.push(statement);
    bytes += statementBytes;
  }
  flush();
  return files;
}

function fullReleaseSeedWorkerdProof(
  root: string,
  temp: string,
  candidatePath: string,
  manifest: ReturnType<typeof parseDataManifest>,
  expected: Record<string, { historical: string; runtime: string; count: number }>,
  expectedBoundaryRetrieval: Array<{
    sectionKey: string;
    sourceOrdinal: number;
    headingSha256: string;
    contentSha256: string;
  }>,
) {
  const started = performance.now();
  const directory = join(temp, 'workerd-c-full-release-seed');
  const seedDirectory = join(directory, 'seed');
  const migrationDirectory = join(directory, 'migrations');
  const state = join(directory, 'state');
  mkdirSync(seedDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(migrationDirectory, { recursive: true, mode: 0o700 });
  const config = join(directory, 'wrangler.toml');
  const worker = join(directory, 'worker.mjs');
  const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  writeFileSync(worker, 'export default { fetch() { return new Response("local only"); } };', { mode: 0o600 });
  writeFileSync(config, `name = "norton-capacity-c-full-seed"
main = "${worker.replaceAll('\\', '\\\\')}"
compatibility_date = "2026-07-01"
[[d1_databases]]
binding = "NORTON_DB"
database_name = "norton-capacity-c-full-seed"
database_id = "00000000-0000-0000-0000-0000000000cf"
`, { mode: 0o600 });
  const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/(CLOUDFLARE|CF_API|TOKEN|SECRET|PRIVATE_KEY)/i.test(key)
  ));
  const runText = (args: string[]) => {
    if (!args.includes('--local')) fail('full release-seed Workerd command refused without --local');
    const callStarted = performance.now();
    const output = execFileSync(process.execPath, [wrangler, ...args], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...safeEnv,
        WRANGLER_SEND_METRICS: 'false',
        WRANGLER_LOG_PATH: join(directory, 'wrangler.log'),
      },
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      output,
      elapsedMs: Math.round((performance.now() - callStarted) * 1000) / 1000,
    };
  };
  const common = ['NORTON_DB', '--local', '--persist-to', state, '--config', config];
  const migrationFiles = manifest.materializations.d1.migrations.map((migration, index) => {
    const path = join(migrationDirectory, `${String(index + 1).padStart(3, '0')}.sql`);
    const sql = externalizeMigration(
      readFileSync(join(root, migration.path), 'utf8'),
      candidateLayout('C_historical_and_runtime_external_content_fts'),
    );
    writeFileSync(path, sql, { mode: 0o600 });
    return { path, sha256: sha256(sql), bytes: Buffer.byteLength(sql) };
  });
  const migrationElapsedMs = migrationFiles.reduce(
    (sum, file) => sum + runText(['d1', 'execute', ...common, '--file', file.path]).elapsedMs,
    0,
  );

  const seedFiles: FullSeedFile[] = [];
  const expectedCounts: Record<string, number> = {};
  const candidate = new Database(candidatePath, { readonly: true, fileMustExist: true });
  try {
    for (const [index, table] of D1_SEED_BASE_TABLES.entries()) {
      const count = Number(
        (candidate.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number }).count,
      );
      expectedCounts[table] = count;
      const statements = exportTable(candidatePath, table);
      if (statements.reduce((sum, item) => sum + item.rows, 0) !== count) {
        fail(`full release-seed ${table} export row count drifted`);
      }
      seedFiles.push(...writeNortonSeedChunks(seedDirectory, table, index + 1, statements));
    }
  } finally {
    candidate.close();
  }
  let importElapsedMs = 0;
  for (const file of seedFiles) {
    importElapsedMs += runText(['d1', 'execute', ...common, '--file', file.path]).elapsedMs;
  }
  const rebuildPath = join(directory, 'rebuild-seal.sql');
  const rebuildSql = `
    INSERT INTO strongs_fts(strongs_number,lemma,transliteration,definition)
      SELECT strongs_number,lemma,transliteration,definition FROM strongs ORDER BY strongs_number;
    INSERT INTO sections_fts(sections_fts) VALUES ('rebuild');
    INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts) VALUES ('rebuild');
    INSERT INTO historical_edition_hierarchy_bodies_fts(rowid,hierarchy_id,body_key,heading,content)
      SELECT rowid,hierarchy_id,body_key,heading,content
      FROM historical_edition_hierarchy_bodies ORDER BY hierarchy_id,source_ordinal;
    INSERT INTO strongs_fts(strongs_fts,rank) VALUES ('integrity-check',1);
    INSERT INTO sections_fts(sections_fts,rank) VALUES ('integrity-check',1);
    INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts,rank) VALUES ('integrity-check',1);
    INSERT INTO historical_edition_hierarchy_bodies_fts(historical_edition_hierarchy_bodies_fts,rank)
      VALUES ('integrity-check',1);
    ${immutableCorpusSealSql()}
  `;
  writeFileSync(rebuildPath, rebuildSql, { mode: 0o600 });
  const rebuildElapsedMs = runText(['d1', 'execute', ...common, '--file', rebuildPath]).elapsedMs;
  const countSql = `SELECT ${D1_SEED_BASE_TABLES.map(
    table => `(SELECT COUNT(*) FROM "${table}") AS "${table}"`,
  ).join(',')};`;
  const countPages = parseD1Json(
    runText(['d1', 'execute', ...common, '--command', countSql, '--json']).output,
  );
  const storedCounts = countPages.flatMap(page => page.results ?? [])[0];
  if (!storedCounts || D1_SEED_BASE_TABLES.some(table => storedCounts[table] !== expectedCounts[table])) {
    fail('full release-seed Workerd base-table inventory drifted');
  }
  const queryProof: Record<string, { historical: string; runtime: string; count: number }> = {};
  for (const queryCase of QUERY_CASES) {
    const fts = sqlString(composeLocalPrimarySourceFtsQuery(queryCase.text, queryCase.match));
    const historicalPages = parseD1Json(runText([
      'd1', 'execute', ...common, '--command', `SELECT section_key AS sectionKey
        FROM historical_edition_sections_fts
        WHERE historical_edition_sections_fts MATCH ${fts} AND edition_id=${sqlString(EDITION_ID)}
        ORDER BY rank,rowid LIMIT ${queryCase.limit};`, '--json',
    ]).output);
    const runtimePages = parseD1Json(runText([
      'd1', 'execute', ...common, '--command', `SELECT section.section_number AS sectionKey
        FROM sections_fts JOIN document_sections section ON section.id=sections_fts.rowid
        WHERE sections_fts MATCH ${fts} AND section.document_id=${sqlString(WORK_ID)}
        ORDER BY rank,sections_fts.rowid LIMIT ${queryCase.limit};`, '--json',
    ]).output);
    const historical = historicalPages.flatMap(page => page.results ?? []);
    const runtime = runtimePages.flatMap(page => page.results ?? []);
    const proof = { historical: hash(historical), runtime: hash(runtime), count: historical.length };
    if (canonical(proof) !== canonical(expected[queryCase.id])) {
      fail(`full release-seed Workerd C ${queryCase.id} query parity drifted`);
    }
    queryProof[queryCase.id] = proof;
  }
  const retrievalPages = parseD1Json(runText([
    'd1', 'execute', ...common, '--command', `SELECT section_key AS sectionKey,source_ordinal AS sourceOrdinal,
      heading,content
      FROM historical_edition_sections WHERE edition_id=${sqlString(EDITION_ID)}
      AND source_ordinal IN (1,625,1250) ORDER BY source_ordinal;`, '--json',
  ]).output);
  const retrieval = retrievalPages.flatMap(page => page.results ?? []).map(row => ({
    sectionKey: row.sectionKey,
    sourceOrdinal: row.sourceOrdinal,
    headingSha256: sha256(String(row.heading)),
    contentSha256: sha256(String(row.content)),
  }));
  if (canonical(retrieval) !== canonical(expectedBoundaryRetrieval)) {
    fail('full release-seed Workerd C boundary retrieval identity drifted from fresh Candidate C SQLite');
  }
  const totals = {
    fileCount: seedFiles.length,
    byteSize: seedFiles.reduce((sum, file) => sum + file.bytes, 0),
    statementCount: seedFiles.reduce((sum, file) => sum + file.statements, 0),
    rowCount: seedFiles.reduce((sum, file) => sum + file.rows, 0),
  };
  return {
    status: 'passed_full_generated_release_seed_workerd_proof',
    runtime: 'isolated_local_workerd_d1',
    layout: 'C_historical_and_runtime_external_content_fts',
    elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
    migrationElapsedMs: Math.round(migrationElapsedMs * 1000) / 1000,
    importElapsedMs: Math.round(importElapsedMs * 1000) / 1000,
    rebuildElapsedMs,
    migrations: {
      count: migrationFiles.length,
      aggregateSha256: hash(migrationFiles.map(file => ({
        path: basename(file.path), sha256: file.sha256, bytes: file.bytes,
      }))),
    },
    seed: {
      ...totals,
      aggregateSha256: hash(seedFiles.map(file => ({
        path: basename(file.path),
        table: file.table,
        chunk: file.chunk,
        bytes: file.bytes,
        rows: file.rows,
        statements: file.statements,
        sha256: file.sha256,
      }))),
    },
    baseTableCountsSha256: hash(expectedCounts),
    ftsIntegrityChecks: 4,
    immutableTriggerCount: 6,
    queryProof,
    retrievalSha256: hash(retrieval),
    retrievalComparedWith: 'fresh_candidate_c_sqlite_exact_keys_ordinals_heading_and_content_sha256',
    releaseSeedIdentity:
      'deterministic base-table export plus external-content FTS rebuild; experimental and not a manifest identity',
  };
}

function lowerScopeD(root: string, temp: string, source: NortonSource, expectedDocumentCount: number) {
  const baseline = join(temp, 'D-lower-scope-source.sqlite');
  const output = join(temp, 'D-lower-scope.sqlite');
  buildBaseline(root, baseline);
  copyFileSync(baseline, output);
  return closeAfter(new Database(output), db => {
    db.exec(`CREATE TABLE norton_sidecar_sections (
      id INTEGER PRIMARY KEY, section_key TEXT NOT NULL UNIQUE, source_ordinal INTEGER NOT NULL UNIQUE,
      display_label TEXT NOT NULL, heading TEXT NOT NULL, content TEXT NOT NULL);
      CREATE VIRTUAL TABLE norton_sidecar_sections_fts USING fts5(
        section_key UNINDEXED, heading, content,
        content='norton_sidecar_sections',content_rowid='id'
      );`);
    const insert = db.prepare(`INSERT INTO norton_sidecar_sections
      (id,section_key,source_ordinal,display_label,heading,content) VALUES (?,?,?,?,?,?)`);
    db.transaction(() => {
      for (const section of source.sections) {
        insert.run(section.sourceOrdinal, section.sectionKey, section.sourceOrdinal, section.displayLabel, section.heading, section.content);
      }
    })();
    db.prepare("INSERT INTO norton_sidecar_sections_fts(norton_sidecar_sections_fts) VALUES ('rebuild')").run();
    db.prepare("INSERT INTO norton_sidecar_sections_fts(norton_sidecar_sections_fts,rank) VALUES ('integrity-check',1)").run();
    db.exec('ANALYZE');
    const preVacuum = measure(db, output);
    return {
      name: 'D_norton_sidecar_lower_scope',
      comparisonStatus: 'lower_scope_research_only_not_a_release_candidate',
      omittedCapabilities: [
        'no catalog projection',
        'no repository/service/tool parity',
        'no runtime ranking merge',
        'no D1 release proof',
      ],
      preVacuum,
      capacityGate: capacityGate(preVacuum),
      baselineCompatibility: baselineCompatibility(db, expectedDocumentCount),
    };
  });
}

export function parseNortonCapacityArguments(argv: readonly string[]): void {
  if (argv.length !== 0) fail('accepts no arguments');
}

export function buildNortonCompactEvidence(envelope: Record<string, any>) {
  if (!verifyNortonCompleteArtifactHash(envelope)) fail('cannot compact an invalid complete evidence envelope');
  const candidates = (envelope.candidates as Array<Record<string, any>>)
    .filter(candidate => ['A_current_four_copy', 'B_historical_external_content_fts',
      'C_historical_and_runtime_external_content_fts'].includes(candidate.name))
    .map(candidate => ({
      name: candidate.name,
      layout: candidate.layout,
      freshBuildMethod: candidate.buildMethod,
      preVacuum: {
        fileBytes: candidate.preVacuum.fileBytes,
        pageSize: candidate.preVacuum.pageSize,
        pageCount: candidate.preVacuum.pageCount,
        freelistPages: candidate.preVacuum.freelistPages,
        accountedDbstatPages: candidate.preVacuum.accountedDbstatPages,
        integrityCheck: candidate.preVacuum.integrityCheck,
        foreignKeyViolations: candidate.preVacuum.foreignKeyViolations,
      },
      postVacuumDiagnosticBytes: candidate.postVacuumDiagnostic.fileBytes,
      capacityGate: candidate.capacityGate,
      compatibilitySha256: hash(candidate.compatibility),
      queryParitySha256: hash(candidate.matchOrder),
      layeredParitySha256: hash(candidate.layeredParity),
    }));
  if (candidates.length !== 3) fail('compact evidence requires A, B, and C');
  const focused = Object.fromEntries(['B', 'C'].map(name => {
    const proof = envelope.workerd[name];
    return [name, {
      runtime: proof.runtime,
      layout: proof.layout,
      seed: {
        fileCount: proof.seed.fileCount,
        bytes: proof.seed.bytes,
        sha256: proof.seed.sha256,
      },
      ftsIntegrityChecks: proof.ftsIntegrityChecks,
      immutableTriggerCount: proof.immutableTriggerCount,
      retrievalSha256: hash(proof.retrieval.rows),
      queryProofSha256: hash(stripNortonVolatileMeasurements(proof.queryProof)),
    }];
  }));
  const fullC = envelope.workerd.fullReleaseSeedC;
  const mutationResidueDiagnostics = Object.fromEntries(['B', 'C'].map(name => {
    const diagnostic = envelope.mutationResidueDiagnostics[name];
    if (diagnostic.diagnosticOnly !== true
      || diagnostic.capacityDecisionInput !== false
      || diagnostic.freshCandidateInputMutated !== false) {
      fail(`mutation-residue ${name} is not isolated from fresh capacity evidence`);
    }
    return [name, {
      diagnosticOnly: true,
      capacityDecisionInput: false,
      freshCandidateInputMutated: false,
      sourceDatabaseRole: diagnostic.sourceDatabaseRole,
      outputDatabaseRole: diagnostic.outputDatabaseRole,
      mutationMethod: diagnostic.mutationMethod,
      directCandidateBytes: diagnostic.directCandidateBytes,
      beforeVacuumBytes: diagnostic.beforeVacuum.fileBytes,
      afterVacuumBytes: diagnostic.afterVacuum.fileBytes,
      preVacuumResidueBytesVersusDirect: diagnostic.preVacuumResidueBytesVersusDirect,
      postVacuumBytesVersusDirect: diagnostic.postVacuumBytesVersusDirect,
    }];
  }));
  const compactPayload = {
    schemaVersion: 'norton-capacity-compact-evidence.v1',
    status: 'provisional_capacity_recommendation_not_release_authority',
    sourceRevision: envelope.sourceRevision,
    environment: envelope.environment,
    source: envelope.source,
    baseline: {
      profile: envelope.baseline.profile,
      corpusIdentity: envelope.baseline.corpusIdentity,
      fileBytes: envelope.baseline.measure.fileBytes,
      pageSize: envelope.baseline.measure.pageSize,
      pageCount: envelope.baseline.measure.pageCount,
      freelistPages: envelope.baseline.measure.freelistPages,
      accountedDbstatPages: envelope.baseline.measure.accountedDbstatPages,
    },
    capacityPolicy: envelope.capacityPolicy,
    rightsDecision: envelope.rightsDecision,
    candidates,
    mutationResidueDiagnostics: {
      capacityDecisionInfluence: 'none_fresh_A_B_C_measurements_are_authoritative',
      diagnostics: mutationResidueDiagnostics,
    },
    workerd: {
      focused,
      fullReleaseSeedC: {
        status: fullC.status,
        runtime: fullC.runtime,
        layout: fullC.layout,
        migrations: fullC.migrations,
        seed: fullC.seed,
        baseTableCountsSha256: fullC.baseTableCountsSha256,
        ftsIntegrityChecks: fullC.ftsIntegrityChecks,
        immutableTriggerCount: fullC.immutableTriggerCount,
        queryProofSha256: hash(fullC.queryProof),
        retrievalSha256: fullC.retrievalSha256,
        retrievalComparedWith: fullC.retrievalComparedWith,
        releaseSeedIdentity: fullC.releaseSeedIdentity,
      },
    },
    recommendation: envelope.recommendation,
    fullRunDeterministicEvidence: {
      hashDomain: envelope.deterministicEvidenceHashDomain,
      sha256: envelope.deterministicEvidenceSha256,
    },
    scopeBoundary: envelope.scopeBoundary,
    sanitized: true,
  };
  return attachNortonEvidenceHashes(compactPayload);
}

export async function runNortonCapacityDecisionEvidence(root = ROOT) {
  if (process.versions.node !== REQUIRED_NODE_VERSION) {
    fail(`requires pinned Node ${REQUIRED_NODE_VERSION}; received ${process.version}`);
  }
  const started = performance.now();
  const manifest = parseDataManifest(readFileSync(join(root, 'data/data-manifest.json')));
  const expectedDocumentCount = manifest.expectedCounts.documents;
  if (!Number.isSafeInteger(expectedDocumentCount) || expectedDocumentCount < 1) {
    fail('pinned manifest does not provide the baseline document count');
  }
  const source = loadSource(root);
  const temp = mkdtempSync(join(tmpdir(), 'theologai-norton-decision-'));
  try {
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const sourceTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
    const sqliteVersion = closeAfter(new Database(':memory:'), db =>
      (db.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version
    );
    const baselinePath = join(temp, 'pinned-baseline.sqlite');
    buildBaseline(root, baselinePath);
    const baseline = closeAfter(new Database(baselinePath, { readonly: true }), db => ({
      profile: {
        schemaVersion: manifest.schemaVersion,
        transformVersion: manifest.materializations.d1.transformVersion,
        expectedDocumentCount,
      },
      corpusIdentity: computeD1CorpusIdentity(manifest),
      measure: measure(db, baselinePath),
      compatibility: baselineCompatibility(db, expectedDocumentCount),
    }));
    const a = await buildCandidate(root, temp, 'A_current_four_copy', source, manifest, expectedDocumentCount);
    const b = await buildCandidate(root, temp, 'B_historical_external_content_fts', source, manifest, expectedDocumentCount);
    const c = await buildCandidate(root, temp, 'C_historical_and_runtime_external_content_fts', source, manifest, expectedDocumentCount);
    for (const candidate of [b, c]) {
      if (canonical(candidate.matchOrder) !== canonical(a.matchOrder)
        || canonical(candidate.layeredParity) !== canonical(a.layeredParity)) {
        fail(`${candidate.name} failed A-equivalent MATCH/layer parity`);
      }
    }
    const mutationSource = join(temp, 'mutation-source.sqlite');
    buildBaseline(root, mutationSource);
    closeAfter(new Database(mutationSource), db => {
      insertNorton(db, source, candidateLayout('A_current_four_copy'));
      db.exec('ANALYZE');
    });
    const mutationDiagnostics = {
      B: mutationResidueDiagnostic(
        mutationSource,
        join(temp, 'mutation-B.sqlite'),
        candidateLayout('B_historical_external_content_fts'),
        b.preVacuum.fileBytes,
      ),
      C: mutationResidueDiagnostic(
        mutationSource,
        join(temp, 'mutation-C.sqlite'),
        candidateLayout('C_historical_and_runtime_external_content_fts'),
        c.preVacuum.fileBytes,
      ),
    };
    for (const [name, diagnostic, candidate] of [
      ['B', mutationDiagnostics.B, b],
      ['C', mutationDiagnostics.C, c],
    ] as const) {
      if (diagnostic.diagnosticOnly !== true
        || diagnostic.capacityDecisionInput !== false
        || diagnostic.freshCandidateInputMutated !== false
        || diagnostic.directCandidateBytes !== candidate.preVacuum.fileBytes) {
        fail(`${name} mutation-residue diagnostic was not isolated from its fresh candidate`);
      }
    }
    const workerd = {
      B: workerdProof(
        root,
        temp,
        'B',
        source,
        focusedWorkerdExpectedOrder(source, candidateLayout('B_historical_external_content_fts')),
      ),
      C: workerdProof(
        root,
        temp,
        'C',
        source,
        focusedWorkerdExpectedOrder(source, candidateLayout('C_historical_and_runtime_external_content_fts')),
      ),
      fullReleaseSeedC: fullReleaseSeedWorkerdProof(
        root,
        temp,
        join(temp, 'C_historical_and_runtime_external_content_fts-fresh-target.sqlite'),
        manifest,
        c.matchOrder,
        c.retrieval,
      ),
    };
    const d = lowerScopeD(root, temp, source, expectedDocumentCount);
    const payload = {
      schemaVersion: 'norton-capacity-decision-evidence.v2',
      status: 'local_only_disposable_decision_evidence',
      sourceRevision: {
        commit: sourceCommit,
        tree: sourceTree,
        experimentScriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
      },
      environment: {
        node: process.version,
        sqlite: sqliteVersion,
        wrangler: JSON.parse(readFileSync(join(root, 'node_modules/wrangler/package.json'), 'utf8')).version,
      },
      source: {
        packagePath: PACKAGE_PATH,
        packageSha256: source.packageSha256,
        sourceArtifactSha256: source.source.sha256,
        sourceArtifactBytes: source.source.bytes,
        sourceArtifactGitCommit: EXPECTED_SOURCE_COMMIT,
        sectionCount: source.sections.length,
        aggregateOrderedSectionTextSha256: sha256(source.sections.map(section => sha256(section.content)).join('\n')),
      },
      baseline,
      capacityPolicy: {
        conservativeGateBytes: CONSERVATIVE_GATE_BYTES,
        owner: 'TheologAI release engineering',
        distinction: 'project_conservative_gate_not_a_cloudflare_d1_limit',
        cloudflarePlatformLimitAssessment: 'not_measured_or_claimed',
      },
      rightsDecision: {
        exactArtifactRights: 'preserved_verbatim_from_reviewed_eebo_tcp_package',
        normalizedTextRights: null,
        databaseCompatibilityMarker: NORMALIZED_RIGHTS_PENDING,
        rationale:
          'The reviewed package value remains null: this experiment preserves the reviewed CC0 exact-artifact evidence but does not mint a separate normalized-text rights determination. Because migration 0006 requires an object, disposable candidate rows carry an explicit not_reviewed/no_release_authority compatibility marker. A release transform must review and replace that marker explicitly.',
      },
      immutableCorpusContract: {
        sequence: ['seed base tables', 'rebuild external-content FTS once', 'run FTS integrity checks', 'seal corpus'],
        postSealWrites: 'rejected_by_insert_update_delete_triggers',
        incrementalFtsMaintenance: 'not_supported_or_required_for_immutable_release_corpora',
      },
      candidates: [a, b, c, d],
      mutationResidueDiagnostics: mutationDiagnostics,
      workerd,
      recommendation: {
        leadingCapacityCandidate: 'C_historical_and_runtime_external_content_fts',
        status: 'provisional_capacity_recommendation',
        architectureDecision: 'not_yet_authorized_or_final',
        basis:
          'C has the largest fresh pre-VACUUM headroom and passed focused plus full generated release-seed local Workerd parity.',
        remainingReleaseGates: [
          'review and authorize normalized-text rights',
          'design and review a real migration rather than experiment-time migration rewriting',
          'advance and review the deterministic manifest/transform identity',
          'prove compatibility with the complete release verification suite',
          'separately authorize preview D1 preparation, binding, deployment, and black-box audit',
        ],
      },
      noHybridOrR2Candidate: true,
      scopeBoundary: {
        manifestChanged: false,
        runtimeChanged: false,
        schemaMigrationAdded: false,
        bindingOrRemoteD1Used: false,
        r2Used: false,
        corpusActivated: false,
        deploymentPerformed: false,
      },
      elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
    };
    const envelopeBase = {
      ...payload,
      sanitized: true,
    };
    return attachNortonEvidenceHashes(envelopeBase);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    parseNortonCapacityArguments(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(await runNortonCapacityDecisionEvidence())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
