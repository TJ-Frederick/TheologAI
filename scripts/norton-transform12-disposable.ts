#!/usr/bin/env tsx
/**
 * Disposable local-only Norton Transform-12 proof.
 *
 * This command builds the canonical zero-Norton database, copies it into an OS
 * temporary directory, adds dormant Norton authority, and proves a separately
 * generated local Workerd seed. It never writes scripts/d1-seed, never accepts
 * remote flags, and proves both SQLite and Workerd fail canonical readiness.
 */

import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auditNortonTransform12Authority } from './historical-transform12-authority-audit.js';
import {
  NORTON_TRANSFORM12,
  assertStoredNortonTransform12Authority,
  loadNortonTransform12Authority,
  materializeNortonTransform12Authority,
} from './historical-transform12-norton.js';
import { TRANSFORM12_STORAGE_CONTRACT, assertTransform12CorpusSealed } from './transform12-candidate-c-storage.js';
import { buildD1ReadinessSql } from './check-remote-d1-readiness.js';
import {
  D1_EXPECTED_TABLES, computeD1CorpusIdentity, parseDataManifest,
} from './d1-corpus-identity.js';
import { D1_SEED_BASE_TABLES } from './d1-seed-order.js';
import { exportTable } from './export-for-d1.js';
import { writeNortonSeedChunks } from './norton-capacity-decision-evidence.js';
import { parseHistoricalTransform8D1Page } from './historical-transform8-authority-audit.js';
import {
  D1_CORPUS_CAPACITY_LIMIT_BYTES,
  measureDatabaseCapacity,
} from './release-corpus-capacity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function command(script: string, args: string[]): void {
  const result = execFileSync(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
  });
  if (result.includes('remote')) throw new Error('Disposable Norton child command crossed the local-only boundary');
}

function countTables(db: Database.Database): Record<string, number> {
  return Object.fromEntries(D1_EXPECTED_TABLES.map(table => [
    table,
    (db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number }).count,
  ]));
}

function finalizeDisposableFts(db: Database.Database): void {
  db.exec(`
    INSERT INTO sections_fts(sections_fts) VALUES ('rebuild');
    INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts) VALUES ('rebuild');
    INSERT INTO historical_edition_hierarchy_bodies_fts(historical_edition_hierarchy_bodies_fts) VALUES ('rebuild');
    INSERT INTO strongs_fts(strongs_fts, rank) VALUES ('integrity-check', 1);
    INSERT INTO sections_fts(sections_fts, rank) VALUES ('integrity-check', 1);
    INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts, rank)
      VALUES ('integrity-check', 1);
    INSERT INTO historical_edition_hierarchy_bodies_fts(
      historical_edition_hierarchy_bodies_fts, rank
    ) VALUES ('integrity-check', 1);
    INSERT INTO historical_corpus_seal(seal_id, transform_version, storage_contract)
      VALUES (1, 12, '${TRANSFORM12_STORAGE_CONTRACT}');
  `);
}

function canonicalReadiness(db: Database.Database, expectedCounts: Record<string, number>): string {
  return String((db.prepare(buildD1ReadinessSql(expectedCounts)).get() as { readiness?: unknown }).readiness);
}

function runWorkerd(
  workspace: string,
  databasePath: string,
  manifest: ReturnType<typeof parseDataManifest>,
  disposableCounts: Record<string, number>,
) {
  const directory = join(workspace, 'workerd');
  const seedDirectory = join(directory, 'seed');
  const state = join(directory, 'state');
  mkdirSync(seedDirectory, { recursive: true, mode: 0o700 });
  const worker = join(directory, 'worker.mjs');
  const config = join(directory, 'wrangler.toml');
  writeFileSync(worker, 'export default { fetch() { return new Response("local only"); } };\n', { mode: 0o600 });
  writeFileSync(config, `name = "norton-transform12-disposable"
main = "${worker.replaceAll('\\', '\\\\')}"
compatibility_date = "2026-07-01"
[[d1_databases]]
binding = "NORTON_DISPOSABLE_DB"
database_name = "norton-transform12-disposable"
database_id = "00000000-0000-0000-0000-000000000012"
`, { mode: 0o600 });
  const wrangler = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/(CLOUDFLARE|CF_API|TOKEN|SECRET|PRIVATE_KEY)/i.test(key)
  ));
  const common = ['NORTON_DISPOSABLE_DB', '--local', '--persist-to', state, '--config', config];
  const execute = (args: string[]): string => {
    if (!args.includes('--local') || args.includes('--remote')) {
      throw new Error('Disposable Norton Workerd command refused a non-local invocation');
    }
    return execFileSync(process.execPath, [wrangler, ...args], {
      cwd: ROOT, encoding: 'utf8', env: { ...safeEnv, WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    });
  };

  for (const migration of manifest.materializations.d1.migrations) {
    execute(['d1', 'execute', ...common, '--file', join(ROOT, migration.path)]);
  }
  const files = D1_SEED_BASE_TABLES.flatMap((table, index) =>
    writeNortonSeedChunks(seedDirectory, table, index + 1, exportTable(databasePath, table))
  );
  for (const file of files) execute(['d1', 'execute', ...common, '--file', file.path]);
  const finalize = join(directory, 'finalize.sql');
  writeFileSync(finalize, `
    INSERT INTO strongs_fts(strongs_number,lemma,transliteration,definition)
      SELECT strongs_number,lemma,transliteration,definition FROM strongs ORDER BY strongs_number;
    INSERT INTO sections_fts(sections_fts) VALUES ('rebuild');
    INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts) VALUES ('rebuild');
    INSERT INTO historical_edition_hierarchy_bodies_fts(historical_edition_hierarchy_bodies_fts)
      VALUES ('rebuild');
    INSERT INTO strongs_fts(strongs_fts,rank) VALUES ('integrity-check',1);
    INSERT INTO sections_fts(sections_fts,rank) VALUES ('integrity-check',1);
    INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts,rank)
      VALUES ('integrity-check',1);
    INSERT INTO historical_edition_hierarchy_bodies_fts(
      historical_edition_hierarchy_bodies_fts,rank
    ) VALUES ('integrity-check',1);
    INSERT INTO historical_corpus_seal VALUES
      (1,12,'${TRANSFORM12_STORAGE_CONTRACT}');
  `, { mode: 0o600 });
  execute(['d1', 'execute', ...common, '--file', finalize]);

  const countSql = `SELECT ${D1_EXPECTED_TABLES.map(table =>
    `(SELECT COUNT(*) FROM "${table}") AS "${table}"`).join(', ')};`;
  const countRows = parseHistoricalTransform8D1Page(execute([
    'd1', 'execute', ...common, '--command', countSql, '--json',
  ])).rows;
  if (countRows.length !== 1 || canonical(countRows[0]) !== canonical(disposableCounts)) {
    throw new Error('Disposable Norton Workerd table inventory drifted');
  }
  let canonicalReadiness: unknown = 'rejected_with_error';
  try {
    const canonicalGate = parseHistoricalTransform8D1Page(execute([
      'd1', 'execute', ...common, '--command', buildD1ReadinessSql(manifest.expectedCounts), '--json',
    ])).rows[0] as { readiness?: unknown } | undefined;
    canonicalReadiness = canonicalGate?.readiness ?? null;
  } catch {
    // The production gate intentionally raises a SQL error for any failed
    // readiness check. A thrown local Workerd query is therefore rejection.
  }
  if (canonicalReadiness === 'ready') {
    throw new Error('Disposable Norton Workerd database was incorrectly accepted as canonical');
  }
  const authority = auditNortonTransform12Authority(ROOT, sql => parseHistoricalTransform8D1Page(execute([
    'd1', 'execute', ...common, '--command', sql, '--json',
  ])));
  return {
    seedFiles: files.length,
    seedRows: files.reduce((sum, file) => sum + file.rows, 0),
    canonicalReadiness,
    authority,
  };
}

export function runNortonTransform12Disposable(root = ROOT) {
  if (root !== ROOT) throw new Error('Disposable Norton proof must run from this checkout root');
  const workspace = mkdtempSync(join(tmpdir(), 'theologai-norton-transform12-disposable-'));
  try {
    const canonicalPath = join(workspace, 'canonical.sqlite');
    const disposablePath = join(workspace, 'norton-disposable.sqlite');
    command('scripts/build-database.ts', ['--output', canonicalPath]);
    command('scripts/verify-database.ts', ['--database', canonicalPath]);
    copyFileSync(canonicalPath, disposablePath);
    const manifest = parseDataManifest(readFileSync(join(ROOT, 'data/data-manifest.json')));
    const expected = loadNortonTransform12Authority({
      read(path: string, encoding?: BufferEncoding): Buffer | string {
        return encoding === undefined
          ? readFileSync(join(ROOT, path))
          : readFileSync(join(ROOT, path), encoding);
      },
    } as never);
    const db = new Database(disposablePath);
    let authority: ReturnType<typeof auditNortonTransform12Authority>;
    let disposableCounts: Record<string, number>;
    let capacity: {
      fileBytes: number;
      pageSize: number;
      pageCount: number;
      freelistPages: number;
      limitBytes: number;
      headroomBytes: number;
      withinLimit: true;
    };
    let sqliteCanonicalReadiness: unknown = 'rejected_with_error';
    try {
      db.pragma('foreign_keys = ON');
      db.prepare('DELETE FROM historical_corpus_seal WHERE seal_id = 1').run();
      materializeNortonTransform12Authority(db, expected);
      finalizeDisposableFts(db);
      assertTransform12CorpusSealed(db);
      assertStoredNortonTransform12Authority(db, expected);
      authority = auditNortonTransform12Authority(ROOT, sql => {
        const rows = db.prepare(sql).all();
        return { rows, responseBytes: Buffer.byteLength(JSON.stringify(rows), 'utf8') };
      });
      try {
        sqliteCanonicalReadiness = canonicalReadiness(db, manifest.expectedCounts);
      } catch {
        // Failed production readiness checks intentionally raise a SQL error.
      }
      if (sqliteCanonicalReadiness === 'ready') {
        throw new Error('Disposable Norton SQLite database was incorrectly accepted as canonical');
      }
      db.exec('ANALYZE');
      disposableCounts = countTables(db);
      const measurement = measureDatabaseCapacity(db, disposablePath);
      if (measurement.fileBytes > D1_CORPUS_CAPACITY_LIMIT_BYTES) {
        throw new Error('Disposable Norton database exceeds the 350 MiB D1 capacity contract');
      }
      capacity = {
        fileBytes: measurement.fileBytes,
        pageSize: measurement.pageSize,
        pageCount: measurement.pageCount,
        freelistPages: measurement.freelistPages,
        limitBytes: D1_CORPUS_CAPACITY_LIMIT_BYTES,
        headroomBytes: D1_CORPUS_CAPACITY_LIMIT_BYTES - measurement.fileBytes,
        withinLimit: true,
      };
    } finally {
      db.close();
    }
    const workerd = runWorkerd(workspace, disposablePath, manifest, disposableCounts);
    const canonicalIdentity = computeD1CorpusIdentity(manifest);
    const disposableIdentity = hash({
      domain: 'theologai-norton-transform12-disposable-v1',
      canonicalIdentity,
      packageSha256: NORTON_TRANSFORM12.packageSha256,
      counts: disposableCounts,
      storageContract: TRANSFORM12_STORAGE_CONTRACT,
    });
    return {
      status: 'passed_disposable_local_only_not_release_seed',
      canonical: { identity: canonicalIdentity, counts: manifest.expectedCounts, nortonRows: 0 },
      disposable: {
        identity: disposableIdentity,
        counts: disposableCounts,
        canonicalReadiness: sqliteCanonicalReadiness,
        authority,
        workerd,
        capacity,
      },
      prohibitions: ['canonical_seed', 'remote_d1', 'binding', 'preview', 'production', 'deployment'],
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) throw new Error('Disposable Norton proof accepts no arguments');
  process.stdout.write(`${JSON.stringify(runNortonTransform12Disposable())}\n`);
}
