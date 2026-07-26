#!/usr/bin/env tsx
/**
 * Release-wide capacity gate for the SQLite database that is also materialized
 * into D1. It always builds a disposable database from the current checkout;
 * it neither opens a remote D1 database nor writes a corpus artifact.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { computeD1CorpusIdentity, parseDataManifest } from './d1-corpus-identity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_SCRIPT = 'scripts/build-database.ts';
const VERIFY_SCRIPT = 'scripts/verify-database.ts';

export const D1_CORPUS_CAPACITY_LIMIT_BYTES = 350 * 1024 * 1024;
export const D1_CORPUS_CAPACITY_WARNING_RATIO = 0.9;
export const D1_CORPUS_CAPACITY_WARNING_BYTES = D1_CORPUS_CAPACITY_LIMIT_BYTES * D1_CORPUS_CAPACITY_WARNING_RATIO;
export const RECORDED_CAPACITY_BASELINE_PATH = 'docs/release-corpus-capacity-baseline-transform9.json';

export type DbstatObjectKind = 'index' | 'internal' | 'table';
export type CapacityStatus = 'exceeds_350_mib' | 'warning_at_or_above_90_percent' | 'within_capacity';

export interface DbstatObjectMeasurement {
  name: string;
  kind: DbstatObjectKind;
  pages: number;
  bytes: number;
}

export interface DatabaseCapacityMeasurement {
  fileBytes: number;
  pageSize: number;
  pageCount: number;
  pageCountBytes: number;
  freelistPages: number;
  dbstat: DbstatObjectMeasurement[];
  integrityCheck: 'ok';
  foreignKeyViolations: 0;
}

export interface RecordedCapacityBaseline {
  schemaVersion: 'theologai-release-corpus-capacity-baseline.v1';
  release: {
    id: string;
    commit: string;
    corpusIdentity: string;
    measuredWith: { node: string; sqlite: string };
  };
  measurement: DatabaseCapacityMeasurement;
}

export interface DbstatGrowth {
  name: string;
  kind: DbstatObjectKind;
  baselinePages: number;
  currentPages: number;
  pageGrowth: number;
  baselineBytes: number;
  currentBytes: number;
  byteGrowth: number;
}

export interface ReleaseCorpusCapacityReport {
  schemaVersion: 'theologai-release-corpus-capacity-report.v1';
  corpus: {
    storage: 'sqlite_d1_materialized';
    corpusIdentity: string;
    freshBuildVerified: true;
  };
  capacity: {
    basis: 'direct_fresh_database_after_analyze_pre_vacuum';
    limitBytes: number;
    warningThresholdBytes: number;
    preVacuumBytes: number;
    headroomBytes: number;
    status: CapacityStatus;
    warning: boolean;
    withinLimit: boolean;
  };
  current: {
    preVacuum: DatabaseCapacityMeasurement;
    postVacuumDiagnostic: DatabaseCapacityMeasurement;
  };
  baseline: RecordedCapacityBaseline['release'] & { preVacuumBytes: number };
  growthSinceBaseline: {
    databaseBytes: number;
    databaseBasisPoints: number;
    dbstat: DbstatGrowth[];
  };
}

export interface ReleaseCorpusCapacityBuilderContext {
  root: string;
  outputPath: string;
}

export interface ReleaseCorpusCapacityRunOptions {
  /** Test-only injection. The public command always performs the normal build. */
  buildDatabase?: (context: ReleaseCorpusCapacityBuilderContext) => void;
  /** Test-only injection. The public command always performs normal verification. */
  verifyDatabase?: (context: ReleaseCorpusCapacityBuilderContext) => void;
  /** Test-only injection. The public command always uses the checked-in release baseline. */
  baseline?: RecordedCapacityBaseline;
}

type UnknownRecord = Record<string, unknown>;

function fail(message: string): never { throw new Error(`[release-corpus-capacity] ${message}`); }

function asRecord(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as UnknownRecord;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be non-empty text`);
  return value;
}

function asInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} must be a non-negative safe integer`);
  return value as number;
}

function asKind(value: unknown, label: string): DbstatObjectKind {
  if (value === 'index' || value === 'internal' || value === 'table') return value;
  return fail(`${label} must be table, index, or internal`);
}

function pragmaInteger(database: Database.Database, sql: string): number {
  const row = database.prepare(sql).get() as Record<string, unknown> | undefined;
  const value = row === undefined ? undefined : Object.values(row)[0];
  if (!Number.isSafeInteger(value)) fail(`SQLite did not return an integer for ${sql}`);
  return value as number;
}

function databaseObjectKinds(database: Database.Database): Map<string, DbstatObjectKind> {
  const rows = database.prepare(`SELECT name, type FROM sqlite_master
    WHERE type IN ('index', 'table') ORDER BY name`).all() as Array<{ name: string; type: string }>;
  return new Map(rows.map(row => [row.name, row.type === 'index' ? 'index' : 'table']));
}

/** Measure physical B-tree/FTS allocations after the caller has run ANALYZE. */
export function measureDatabaseCapacity(database: Database.Database, path: string): DatabaseCapacityMeasurement {
  const integrity = database.prepare('PRAGMA integrity_check').all() as Array<Record<string, unknown>>;
  if (integrity.length !== 1 || Object.values(integrity[0]!)[0] !== 'ok') fail('SQLite integrity_check failed');
  if (database.prepare('PRAGMA foreign_key_check').all().length !== 0) fail('SQLite foreign_key_check found violations');

  const kinds = databaseObjectKinds(database);
  const dbstat = database.prepare(`SELECT name, COUNT(*) AS pages, SUM(pgsize) AS bytes
    FROM dbstat GROUP BY name ORDER BY name`).all() as Array<{ name: string; pages: number; bytes: number }>;
  if (dbstat.length === 0 || dbstat.some(row => !Number.isSafeInteger(row.pages) || !Number.isSafeInteger(row.bytes))) {
    fail('SQLite dbstat measurement is unavailable');
  }

  const pageSize = pragmaInteger(database, 'PRAGMA page_size');
  const pageCount = pragmaInteger(database, 'PRAGMA page_count');
  const pageCountBytes = pageSize * pageCount;
  const fileBytes = statSync(path).size;
  if (fileBytes !== pageCountBytes) fail('SQLite file size differs from its page count');

  return {
    fileBytes,
    pageSize,
    pageCount,
    pageCountBytes,
    freelistPages: pragmaInteger(database, 'PRAGMA freelist_count'),
    dbstat: dbstat.map(row => ({ ...row, kind: kinds.get(row.name) ?? 'internal' })),
    integrityCheck: 'ok',
    foreignKeyViolations: 0,
  };
}

/** The authoritative measurement: fresh database after ANALYZE and before VACUUM. */
export function measurePreVacuumDatabase(path: string): DatabaseCapacityMeasurement {
  const database = new Database(path, { fileMustExist: true });
  try {
    database.exec('ANALYZE');
    return measureDatabaseCapacity(database, path);
  } finally {
    database.close();
  }
}

/** A non-gating diagnostic that never replaces the pre-VACUUM capacity gate. */
export function measurePostVacuumDiagnostic(path: string): DatabaseCapacityMeasurement {
  const database = new Database(path, { fileMustExist: true });
  try {
    database.exec('VACUUM');
    return measureDatabaseCapacity(database, path);
  } finally {
    database.close();
  }
}

function parseMeasurement(value: unknown, label: string): DatabaseCapacityMeasurement {
  const raw = asRecord(value, label);
  const fileBytes = asInteger(raw.fileBytes, `${label}.fileBytes`);
  const pageSize = asInteger(raw.pageSize, `${label}.pageSize`);
  const pageCount = asInteger(raw.pageCount, `${label}.pageCount`);
  const pageCountBytes = asInteger(raw.pageCountBytes, `${label}.pageCountBytes`);
  if (pageSize === 0 || pageCount === 0 || pageCountBytes !== pageSize * pageCount || fileBytes !== pageCountBytes) {
    fail(`${label} must retain matching non-zero page and file byte measurements`);
  }
  if (raw.integrityCheck !== 'ok' || raw.foreignKeyViolations !== 0) fail(`${label} must retain clean integrity checks`);
  if (!Array.isArray(raw.dbstat) || raw.dbstat.length === 0) fail(`${label}.dbstat must not be empty`);
  const dbstat = raw.dbstat.map((entry, index) => {
    const row = asRecord(entry, `${label}.dbstat[${index}]`);
    return {
      name: asString(row.name, `${label}.dbstat[${index}].name`),
      kind: asKind(row.kind, `${label}.dbstat[${index}].kind`),
      pages: asInteger(row.pages, `${label}.dbstat[${index}].pages`),
      bytes: asInteger(row.bytes, `${label}.dbstat[${index}].bytes`),
    };
  });
  const names = dbstat.map(entry => entry.name);
  if (new Set(names).size !== names.length || JSON.stringify(names) !== JSON.stringify([...names].sort())) {
    fail(`${label}.dbstat must have unique, lexically ordered names`);
  }
  return {
    fileBytes, pageSize, pageCount, pageCountBytes,
    freelistPages: asInteger(raw.freelistPages, `${label}.freelistPages`), dbstat,
    integrityCheck: 'ok', foreignKeyViolations: 0,
  };
}

/** Load and validate the prior, checked-in release measurement. */
export function readRecordedCapacityBaseline(root = ROOT): RecordedCapacityBaseline {
  const raw = asRecord(JSON.parse(readFileSync(join(root, RECORDED_CAPACITY_BASELINE_PATH), 'utf8')), 'recorded baseline');
  if (raw.schemaVersion !== 'theologai-release-corpus-capacity-baseline.v1') fail('unsupported recorded baseline schema');
  const release = asRecord(raw.release, 'recorded baseline.release');
  const measuredWith = asRecord(release.measuredWith, 'recorded baseline.release.measuredWith');
  const commit = asString(release.commit, 'recorded baseline.release.commit');
  const corpusIdentity = asString(release.corpusIdentity, 'recorded baseline.release.corpusIdentity');
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{64}$/.test(corpusIdentity)) fail('recorded baseline release identity is malformed');
  return {
    schemaVersion: 'theologai-release-corpus-capacity-baseline.v1',
    release: {
      id: asString(release.id, 'recorded baseline.release.id'), commit, corpusIdentity,
      measuredWith: {
        node: asString(measuredWith.node, 'recorded baseline.release.measuredWith.node'),
        sqlite: asString(measuredWith.sqlite, 'recorded baseline.release.measuredWith.sqlite'),
      },
    },
    measurement: parseMeasurement(raw.measurement, 'recorded baseline.measurement'),
  };
}

export function assessCorpusCapacity(preVacuumBytes: number): {
  status: CapacityStatus;
  warning: boolean;
  withinLimit: boolean;
  headroomBytes: number;
} {
  if (!Number.isSafeInteger(preVacuumBytes) || preVacuumBytes < 0) fail('pre-VACUUM size must be a non-negative safe integer');
  const withinLimit = preVacuumBytes <= D1_CORPUS_CAPACITY_LIMIT_BYTES;
  const warning = preVacuumBytes >= D1_CORPUS_CAPACITY_WARNING_BYTES;
  return {
    status: !withinLimit ? 'exceeds_350_mib' : warning ? 'warning_at_or_above_90_percent' : 'within_capacity',
    warning, withinLimit, headroomBytes: D1_CORPUS_CAPACITY_LIMIT_BYTES - preVacuumBytes,
  };
}

/** Fail only above the conservative 350 MiB ceiling; the 90% threshold warns. */
export function assertCorpusCapacity(preVacuumBytes: number): ReturnType<typeof assessCorpusCapacity> {
  const assessment = assessCorpusCapacity(preVacuumBytes);
  if (!assessment.withinLimit) fail(`SQLite/D1 corpus exceeds the conservative 350 MiB capacity limit by ${-assessment.headroomBytes} bytes`);
  return assessment;
}

/** Compare every table, index, FTS shadow, and SQLite-internal dbstat object in lexical order. */
export function compareDbstatGrowth(
  baseline: readonly DbstatObjectMeasurement[],
  current: readonly DbstatObjectMeasurement[],
): DbstatGrowth[] {
  const baselineByName = new Map(baseline.map(entry => [entry.name, entry]));
  const currentByName = new Map(current.map(entry => [entry.name, entry]));
  return [...new Set([...baselineByName.keys(), ...currentByName.keys()])].sort().map(name => {
    const before = baselineByName.get(name);
    const after = currentByName.get(name);
    const kind = after?.kind ?? before?.kind;
    if (!kind) fail(`missing dbstat object kind for ${name}`);
    const baselinePages = before?.pages ?? 0;
    const currentPages = after?.pages ?? 0;
    const baselineBytes = before?.bytes ?? 0;
    const currentBytes = after?.bytes ?? 0;
    return {
      name, kind, baselinePages, currentPages, pageGrowth: currentPages - baselinePages,
      baselineBytes, currentBytes, byteGrowth: currentBytes - baselineBytes,
    };
  });
}

export function buildReleaseCorpusCapacityReport(
  corpusIdentity: string,
  preVacuum: DatabaseCapacityMeasurement,
  postVacuumDiagnostic: DatabaseCapacityMeasurement,
  baseline: RecordedCapacityBaseline,
): ReleaseCorpusCapacityReport {
  if (!/^[a-f0-9]{64}$/.test(corpusIdentity)) fail('current corpus identity is malformed');
  const capacity = assessCorpusCapacity(preVacuum.fileBytes);
  const databaseBytes = preVacuum.fileBytes - baseline.measurement.fileBytes;
  return {
    schemaVersion: 'theologai-release-corpus-capacity-report.v1',
    corpus: { storage: 'sqlite_d1_materialized', corpusIdentity, freshBuildVerified: true },
    capacity: {
      basis: 'direct_fresh_database_after_analyze_pre_vacuum',
      limitBytes: D1_CORPUS_CAPACITY_LIMIT_BYTES,
      warningThresholdBytes: D1_CORPUS_CAPACITY_WARNING_BYTES,
      preVacuumBytes: preVacuum.fileBytes,
      headroomBytes: capacity.headroomBytes,
      status: capacity.status,
      warning: capacity.warning,
      withinLimit: capacity.withinLimit,
    },
    current: { preVacuum, postVacuumDiagnostic },
    baseline: { ...baseline.release, preVacuumBytes: baseline.measurement.fileBytes },
    growthSinceBaseline: {
      databaseBytes,
      databaseBasisPoints: Math.trunc((databaseBytes * 10_000) / baseline.measurement.fileBytes),
      dbstat: compareDbstatGrowth(baseline.measurement.dbstat, preVacuum.dbstat),
    },
  };
}

function runCurrentCheckoutCommand(root: string, script: string, args: string[]): void {
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve(root, script), ...args], {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim().slice(-2_000);
    fail(`${script} failed while preparing a disposable capacity database${detail ? `: ${detail}` : ''}`);
  }
}

/** Build and verify the normal SQLite/D1 materialization at a temporary output path. */
export function buildFreshReleaseCorpusCapacityDatabase(context: ReleaseCorpusCapacityBuilderContext): void {
  runCurrentCheckoutCommand(context.root, BUILD_SCRIPT, ['--output', context.outputPath]);
  runCurrentCheckoutCommand(context.root, VERIFY_SCRIPT, ['--database', context.outputPath]);
}

function expectedCorpusIdentity(root: string): string {
  return computeD1CorpusIdentity(parseDataManifest(readFileSync(join(root, 'data', 'data-manifest.json'))));
}

function assertStoredCorpusIdentity(path: string, expected: string): void {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const row = database.prepare("SELECT value FROM theologai_metadata WHERE key = 'corpus_manifest_sha256'").get() as { value?: unknown } | undefined;
    if (row?.value !== expected) fail('fresh database corpus identity does not match the current checkout');
  } finally {
    database.close();
  }
}

/** Public runner: temporary fresh build, verified identity, pre-VACUUM gate, and baseline comparison. */
export function runReleaseCorpusCapacityReport(root = ROOT, options: ReleaseCorpusCapacityRunOptions = {}): ReleaseCorpusCapacityReport {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'theologai-release-corpus-capacity-'));
  try {
    const databasePath = join(temporaryDirectory, 'theologai.sqlite');
    const context = { root, outputPath: databasePath };
    (options.buildDatabase ?? buildFreshReleaseCorpusCapacityDatabase)(context);
    if (options.verifyDatabase !== undefined) options.verifyDatabase(context);
    const corpusIdentity = expectedCorpusIdentity(root);
    assertStoredCorpusIdentity(databasePath, corpusIdentity);
    const preVacuum = measurePreVacuumDatabase(databasePath);
    const vacuumDiagnosticPath = join(temporaryDirectory, 'theologai-vacuum-diagnostic.sqlite');
    copyFileSync(databasePath, vacuumDiagnosticPath);
    const postVacuumDiagnostic = measurePostVacuumDiagnostic(vacuumDiagnosticPath);
    return buildReleaseCorpusCapacityReport(
      corpusIdentity, preVacuum, postVacuumDiagnostic, options.baseline ?? readRecordedCapacityBaseline(root),
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export function parseReleaseCorpusCapacityArguments(argv: readonly string[]): void {
  if (argv.length !== 0) fail('this release-wide capacity command accepts no arguments and always uses a disposable fresh database');
}

function assertNode22(): void {
  if (process.versions.node.split('.')[0] !== '22') fail(`requires Node 22; received ${process.version}`);
}

function main(argv: readonly string[]): void {
  parseReleaseCorpusCapacityArguments(argv);
  assertNode22();
  const report = runReleaseCorpusCapacityReport();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.capacity.withinLimit) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'unknown failure'}\n`);
    process.exitCode = 1;
  }
}
