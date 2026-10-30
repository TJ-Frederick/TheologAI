import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  D1_CORPUS_CAPACITY_LIMIT_BYTES,
  D1_CORPUS_CAPACITY_WARNING_BYTES,
  assessCorpusCapacity,
  assertCorpusCapacity,
  assertDatabaseCapacityMeasurement,
  buildReleaseCorpusCapacityReport,
  compareDbstatGrowth,
  emitReleaseCorpusCapacityReport,
  measurePreVacuumDatabase,
  parseReleaseCorpusCapacityArguments,
  readRecordedCapacityBaseline,
  releaseCorpusCapacityExitCode,
  runReleaseCorpusCapacityReport,
  type DatabaseCapacityMeasurement,
  type RecordedCapacityBaseline,
} from '../../../scripts/release-corpus-capacity.js';
import { computeD1CorpusIdentity, parseDataManifest } from '../../../scripts/d1-corpus-identity.js';
import { VERIFY_DATABASE_DEFER_CAPACITY_FLAG } from '../../../scripts/release-corpus-capacity-policy.js';

const ROOT = process.cwd();

function fixtureDatabase(path: string, corpusIdentity = 'a'.repeat(64)): void {
  const database = new Database(path);
  try {
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE theologai_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE capacity_rows (id INTEGER PRIMARY KEY, content TEXT NOT NULL);
      CREATE INDEX idx_capacity_rows_content ON capacity_rows(content);
    `);
    database.prepare("INSERT INTO theologai_metadata VALUES ('corpus_manifest_sha256', ?)").run(corpusIdentity);
    const insert = database.prepare('INSERT INTO capacity_rows(content) VALUES (?)');
    database.transaction(() => {
      for (let index = 0; index < 40; index++) insert.run(`row-${String(index).padStart(3, '0')}`);
    })();
  } finally {
    database.close();
  }
}

function measurement(fileBytes: number, dbstat: DatabaseCapacityMeasurement['dbstat']): DatabaseCapacityMeasurement {
  return {
    fileBytes, pageSize: 4_096, pageCount: fileBytes / 4_096, pageCountBytes: fileBytes,
    freelistPages: 0, dbstat, integrityCheck: 'ok', foreignKeyViolations: 0,
  };
}

function baseline(value: DatabaseCapacityMeasurement): RecordedCapacityBaseline {
  return {
    schemaVersion: 'theologai-release-corpus-capacity-baseline.v1',
    release: { id: 'fixture', commit: 'b'.repeat(40), corpusIdentity: 'c'.repeat(64), measuredWith: { node: 'v22.fixture', sqlite: 'fixture' } },
    measurement: value,
  };
}

describe('release-wide SQLite/D1 corpus capacity report', () => {
  it('measures pre-VACUUM dbstat allocations and classifies table/index growth deterministically', () => {
    const directory = mkdtempSync(join(tmpdir(), 'theologai-release-capacity-test-'));
    const path = join(directory, 'fixture.sqlite');
    try {
      fixtureDatabase(path);
      const result = measurePreVacuumDatabase(path);
      expect(result.fileBytes).toBe(result.pageCountBytes);
      expect(result.integrityCheck).toBe('ok');
      expect(result.foreignKeyViolations).toBe(0);
      expect(result.dbstat.map(entry => entry.name)).toEqual([...result.dbstat.map(entry => entry.name)].sort());
      expect(result.dbstat).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'capacity_rows', kind: 'table' }),
        expect.objectContaining({ name: 'idx_capacity_rows_content', kind: 'index' }),
      ]));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('uses the documented 90% warning and inclusive 350 MiB hard ceiling', () => {
    expect(assessCorpusCapacity(D1_CORPUS_CAPACITY_WARNING_BYTES - 1)).toMatchObject({
      status: 'within_capacity', warning: false, withinLimit: true,
    });
    expect(assessCorpusCapacity(D1_CORPUS_CAPACITY_WARNING_BYTES)).toMatchObject({
      status: 'warning_at_or_above_90_percent', warning: true, withinLimit: true,
    });
    expect(assertCorpusCapacity(D1_CORPUS_CAPACITY_LIMIT_BYTES)).toMatchObject({ withinLimit: true });
    expect(assessCorpusCapacity(D1_CORPUS_CAPACITY_LIMIT_BYTES + 1)).toMatchObject({
      status: 'exceeds_350_mib', warning: true, withinLimit: false, headroomBytes: -1,
    });
    expect(() => assertCorpusCapacity(D1_CORPUS_CAPACITY_LIMIT_BYTES + 1)).toThrow('350 MiB');
  });

  it('includes new and removed dbstat objects with zero-sided growth, largest growth first', () => {
    const growth = compareDbstatGrowth(
      [{ name: 'alpha', kind: 'table', pages: 3, bytes: 12_288 }, { name: 'removed_idx', kind: 'index', pages: 2, bytes: 8_192 }],
      [{ name: 'alpha', kind: 'table', pages: 5, bytes: 20_480 }, { name: 'new_fts_data', kind: 'table', pages: 4, bytes: 16_384 }],
    );
    expect(growth).toEqual([
      { name: 'new_fts_data', kind: 'table', baselinePages: 0, currentPages: 4, pageGrowth: 4, baselineBytes: 0, currentBytes: 16_384, byteGrowth: 16_384 },
      { name: 'alpha', kind: 'table', baselinePages: 3, currentPages: 5, pageGrowth: 2, baselineBytes: 12_288, currentBytes: 20_480, byteGrowth: 8_192 },
      { name: 'removed_idx', kind: 'index', baselinePages: 2, currentPages: 0, pageGrowth: -2, baselineBytes: 8_192, currentBytes: 0, byteGrowth: -8_192 },
    ]);
  });

  it('rejects tampered object bytes and incomplete total-page accounting', () => {
    const directory = mkdtempSync(join(tmpdir(), 'theologai-release-capacity-tamper-'));
    const path = join(directory, 'fixture.sqlite');
    try {
      fixtureDatabase(path);
      const measured = measurePreVacuumDatabase(path);
      const baselineTamper = structuredClone(measured);
      baselineTamper.dbstat[0]!.bytes += baselineTamper.pageSize;
      expect(() => assertDatabaseCapacityMeasurement(baselineTamper, 'tampered baseline'))
        .toThrow('bytes must equal pages multiplied by pageSize');

      const currentTamper = structuredClone(measured);
      currentTamper.pageCount += 1;
      currentTamper.pageCountBytes += currentTamper.pageSize;
      currentTamper.fileBytes += currentTamper.pageSize;
      expect(() => assertDatabaseCapacityMeasurement(currentTamper, 'tampered current'))
        .toThrow('dbstat allocations plus freelist pages must conserve');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('uses a previous recorded release and has deterministic report ordering', () => {
    const current = measurement(16_384, [
      { name: 'alpha', kind: 'table', pages: 2, bytes: 8_192 },
      { name: 'beta', kind: 'index', pages: 2, bytes: 8_192 },
    ]);
    const prior = baseline(measurement(8_192, [
      { name: 'alpha', kind: 'table', pages: 1, bytes: 4_096 },
      { name: 'legacy', kind: 'table', pages: 1, bytes: 4_096 },
    ]));
    const report = buildReleaseCorpusCapacityReport('a'.repeat(64), current, current, prior);
    expect(report.baseline).toMatchObject({ id: 'fixture', preVacuumBytes: 8_192 });
    expect(report.growthSinceBaseline.databaseBytes).toBe(8_192);
    expect(report.growthSinceBaseline.databaseBasisPoints).toBe(10_000);
    expect(report.growthSinceBaseline.dbstat.map(row => row.name)).toEqual(['beta', 'alpha', 'legacy']);
    expect(JSON.stringify(report)).toBe(JSON.stringify(buildReleaseCorpusCapacityReport('a'.repeat(64), current, current, prior)));
  });

  it('keeps the structured report reachable before returning a hard-failure exit code', () => {
    const overLimitBytes = D1_CORPUS_CAPACITY_LIMIT_BYTES + 4_096;
    const current = measurement(overLimitBytes, [
      { name: 'all_pages', kind: 'table', pages: overLimitBytes / 4_096, bytes: overLimitBytes },
    ]);
    const prior = baseline(measurement(4_096, [
      { name: 'all_pages', kind: 'table', pages: 1, bytes: 4_096 },
    ]));
    const report = buildReleaseCorpusCapacityReport('a'.repeat(64), current, current, prior);
    expect(report.capacity).toMatchObject({
      status: 'exceeds_350_mib', preVacuumBytes: overLimitBytes, withinLimit: false,
    });
    expect(report.growthSinceBaseline.dbstat).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(report))).toMatchObject({ baseline: { id: 'fixture' } });
    expect(releaseCorpusCapacityExitCode(report)).toBe(1);
  });

  it('defers only the default verifier size abort, emits over-limit JSON, then exits 1', () => {
    const corpusIdentity = computeD1CorpusIdentity(parseDataManifest(readFileSync(join(ROOT, 'data', 'data-manifest.json'))));
    const overLimitBytes = D1_CORPUS_CAPACITY_LIMIT_BYTES + 4_096;
    const overLimitMeasurement = measurement(overLimitBytes, [
      { name: 'all_pages', kind: 'table', pages: overLimitBytes / 4_096, bytes: overLimitBytes },
    ]);
    const commands: Array<{ script: string; args: string[] }> = [];
    const report = runReleaseCorpusCapacityReport(ROOT, {
      commandRunner: (_root, script, args) => {
        commands.push({ script, args: [...args] });
        if (script === 'scripts/build-database.ts') fixtureDatabase(args[1]!, corpusIdentity);
      },
      measurePreVacuum: () => structuredClone(overLimitMeasurement),
      measurePostVacuum: () => structuredClone(overLimitMeasurement),
      baseline: baseline(measurement(4_096, [
        { name: 'all_pages', kind: 'table', pages: 1, bytes: 4_096 },
      ])),
    });
    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({ script: 'scripts/build-database.ts', args: ['--output', expect.any(String)] });
    expect(commands[1]).toMatchObject({
      script: 'scripts/verify-database.ts',
      args: ['--database', expect.any(String), VERIFY_DATABASE_DEFER_CAPACITY_FLAG],
    });

    let stdout = '';
    const exitCode = emitReleaseCorpusCapacityReport(report, value => { stdout += value; });
    expect(JSON.parse(stdout)).toMatchObject({
      schemaVersion: 'theologai-release-corpus-capacity-report.v1',
      capacity: { status: 'exceeds_350_mib', withinLimit: false },
      growthSinceBaseline: { dbstat: [expect.objectContaining({ name: 'all_pages' })] },
    });
    expect(exitCode).toBe(1);
  });

  it('reads the checked-in Transform 9 baseline and refuses public arguments', () => {
    const prior = readRecordedCapacityBaseline(ROOT);
    expect(prior.release).toMatchObject({
      id: 'transform-9-reviewed-pre-transform-10',
      commit: '9f8c2f16ae81bcdcf684840b91e920481c18430c',
      corpusIdentity: '4e182bfd2953fe06e7c8d7e13a705988e85b5a58001e7fe72440333d34f6d442',
    });
    expect(prior.measurement.fileBytes).toBe(315_211_776);
    expect(prior.measurement.dbstat).toHaveLength(117);
    expect(() => parseReleaseCorpusCapacityArguments([])).not.toThrow();
    expect(() => parseReleaseCorpusCapacityArguments(['--database', 'data/theologai.db'])).toThrow('accepts no arguments');
  });

  it('builds only a disposable fresh fixture when dependencies are injected for tests', () => {
    const corpusIdentity = computeD1CorpusIdentity(parseDataManifest(readFileSync(join(ROOT, 'data', 'data-manifest.json'))));
    const report = runReleaseCorpusCapacityReport(ROOT, {
      buildDatabase: ({ outputPath }) => fixtureDatabase(outputPath, corpusIdentity),
      baseline: baseline(measurement(4_096, [{ name: 'sqlite_schema', kind: 'internal', pages: 1, bytes: 4_096 }])),
    });
    expect(report.corpus).toMatchObject({ storage: 'sqlite_d1_materialized', freshBuildVerified: true });
    expect(report.current.preVacuum.fileBytes).toBeGreaterThan(0);
    expect(report.capacity.withinLimit).toBe(true);
  });
});
