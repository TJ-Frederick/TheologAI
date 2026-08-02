import Database from 'better-sqlite3';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildD1ReadinessSql } from '../../../scripts/check-remote-d1-readiness.js';
import { parseDataManifest } from '../../../scripts/d1-corpus-identity.js';
import {
  assertCanonicalTransform12FtsMatchSentinels,
  rebuildIntegrityCheckAndSealTransform12,
} from '../../../scripts/transform12-candidate-c-storage.js';

const ROOT = process.cwd();
const workspace = mkdtempSync(join(tmpdir(), 'theologai-transform12-fts-corruption-'));
const canonicalPath = join(workspace, 'canonical.sqlite');
const manifest = parseDataManifest(readFileSync(join(ROOT, 'data/data-manifest.json')));

beforeAll(() => {
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-database.ts', '--output', canonicalPath], {
    cwd: ROOT, stdio: 'pipe', maxBuffer: 32 * 1024 * 1024,
  });
}, 30_000);

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe('Transform 12 actual FTS corruption gates', () => {
  it.each([
    ['runtime external index', `INSERT INTO sections_fts(sections_fts) VALUES ('delete-all')`],
    ['reviewed-edition external index', `INSERT INTO historical_edition_sections_fts(historical_edition_sections_fts) VALUES ('delete-all')`],
    ['Strong\'s content-bearing index', 'DELETE FROM strongs_fts'],
  ])('rejects delete-all corruption of the %s in verifier, readiness, and exporter guard', (_label, corruption) => {
    const path = join(workspace, `${String(_label).replaceAll(/[^a-z]+/gi, '-')}.sqlite`);
    copyFileSync(canonicalPath, path);
    const db = new Database(path);
    try {
      db.exec(corruption);
      expect(() => assertCanonicalTransform12FtsMatchSentinels(db)).toThrow('MATCH sentinel');
      let readiness = 'rejected';
      try {
        readiness = (db.prepare(buildD1ReadinessSql(manifest.expectedCounts)).get() as { readiness: string }).readiness;
      } catch {
        // Corrupt FTS shadow data may make another read predicate malformed;
        // an exception is also a fail-closed readiness rejection.
      }
      expect(readiness).not.toBe('ready');
    } finally {
      db.close();
    }
    const verify = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/verify-database.ts', '--database', path], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    expect(verify.status).not.toBe(0);
    expect(`${verify.stderr}${verify.stdout}`).toMatch(/MATCH sentinel|malformed JSON|Unexpected strongs_fts count/);
    expect(readFileSync(join(ROOT, 'scripts/export-for-d1.ts'), 'utf8'))
      .toContain('assertCanonicalTransform12FtsMatchSentinels(sentinelDatabase)');
  }, 30_000);

  it('proves delete-all corruption for a non-empty hierarchy external index', () => {
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      for (const migration of manifest.materializations.d1.migrations) {
        db.exec(readFileSync(join(ROOT, migration.path), 'utf8'));
      }
      const hash = 'a'.repeat(64);
      db.prepare('INSERT INTO historical_source_packs VALUES (?,?,?,?,?)').run('pack', '1', 'test', hash, 'test');
      db.prepare('INSERT INTO historical_works VALUES (?,?,?,?)').run('work', 'Work', 'unknown', '[]');
      db.prepare('INSERT INTO historical_editions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        'edition', 'work', 'pack', 'en', '{}', 'test', '1', 'verified', null,
        '2026-01-01T00:00:00Z', '{}', '{}', '{}',
      );
      db.prepare('INSERT INTO historical_edition_hierarchies VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        'hierarchy', 'pack', 'work', 'edition', 'local_only_inactive', 'test', '{}',
        hash, hash, hash, hash, hash, hash, hash, hash, hash, hash, 1, 1, '{}', '{}',
      );
      db.prepare('INSERT INTO historical_edition_hierarchy_bodies VALUES (?,?,?,?,?,?,?,?)').run(
        'hierarchy', 'body', 'authority', 1, 'Sentinel heading', hash, 20, 'hierarchy sentinel term',
      );
      rebuildIntegrityCheckAndSealTransform12(db);
      expect(db.prepare(`SELECT COUNT(*) AS count FROM historical_edition_hierarchy_bodies_fts
        WHERE historical_edition_hierarchy_bodies_fts MATCH '"sentinel"'`).get()).toEqual({ count: 1 });
      db.prepare(`INSERT INTO historical_edition_hierarchy_bodies_fts(
        historical_edition_hierarchy_bodies_fts
      ) VALUES ('delete-all')`).run();
      expect(db.prepare(`SELECT COUNT(*) AS count FROM historical_edition_hierarchy_bodies_fts
        WHERE historical_edition_hierarchy_bodies_fts MATCH '"sentinel"'`).get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });
});
