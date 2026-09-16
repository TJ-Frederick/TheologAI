import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AQUINAS_AUTHORITY_BODY_PAGE_SIZE,
  AQUINAS_AUTHORITY_NODE_PAGE_SIZE,
  AQUINAS_AUTHORITY_PAGE_MAX_BYTES,
  auditAquinasAuthority,
  buildAquinasAuthorityQueryPlan,
} from '../../../scripts/aquinas-authority-audit.js';
import { loadActiveAquinasHierarchy } from '../../../scripts/active-aquinas-hierarchy.js';
import { AQUINAS_HIERARCHY_ID, materializeHistoricalHierarchy } from '../../../scripts/historical-hierarchy.js';
import { loadActiveAquinasHierarchyPublication, materializeHistoricalHierarchyPublication } from '../../../scripts/historical-hierarchy-publication.js';

const ROOT = process.cwd();
let database: Database.Database;
let plan: ReturnType<typeof buildAquinasAuthorityQueryPlan>;

function audit() {
  return auditAquinasAuthority(sql => {
    const rows = database.prepare(sql).all();
    return { rows, responseBytes: Buffer.byteLength(JSON.stringify(rows), 'utf8') };
  }, plan);
}

function withinSavepoint(mutate: () => void): void {
  database.exec('SAVEPOINT aquinas_authority_audit');
  try {
    mutate();
  } finally {
    database.exec('ROLLBACK TO aquinas_authority_audit');
    database.exec('RELEASE aquinas_authority_audit');
  }
}

beforeAll(() => {
  database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  for (const migration of [
    '0001_initial_schema.sql', '0002_ubs_parallel_passages.sql', '0003_original_language_usage.sql',
    '0004_ubs_hebrew_semantics.sql', '0005_historical_section_identity_delivery.sql',
    '0006_historical_source_packs.sql', '0007_historical_hierarchy.sql',
    '0008_historical_hierarchy_publications.sql', '0009_candidate_c_sectioned_publications.sql',
    '0010_active_aquinas_hierarchy_publication.sql',
  ]) database.exec(readFileSync(join(ROOT, 'migrations', migration), 'utf8'));
  const hierarchy = loadActiveAquinasHierarchy({ read: path => readFileSync(join(ROOT, path)) });
  materializeHistoricalHierarchy(database, hierarchy);
  materializeHistoricalHierarchyPublication(database, loadActiveAquinasHierarchyPublication(hierarchy), hierarchy);
  // Simulate an out-of-band persisted corruption. Production immutability
  // triggers prevent it, while the audit must still reject a compromised copy.
  database.exec(`DROP TRIGGER historical_edition_hierarchies_immutable_update;
    DROP TRIGGER historical_edition_hierarchy_bodies_immutable_update;`);
  plan = buildAquinasAuthorityQueryPlan(ROOT);
});

afterAll(() => database.close());

describe('active Aquinas source-replayed authority audit', () => {
  it('compares every planned row through bounded, read-only source-replayed pages', () => {
    const result = audit();
    expect(result).toMatchObject({ pages: 455, rows: 6_378 });
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.every(page => /^SELECT\b/.test(page.sql) && !/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(page.sql))).toBe(true);
    expect(plan.filter(page => page.sql.includes('historical_edition_hierarchy_bodies')))
      .toHaveLength(399);
    expect(plan.filter(page => page.sql.includes('historical_edition_hierarchy_nodes')))
      .toHaveLength(50);
    expect(plan.some(page => page.sql.includes(`LIMIT ${AQUINAS_AUTHORITY_BODY_PAGE_SIZE}`))).toBe(true);
    expect(plan.some(page => page.sql.includes(`LIMIT ${AQUINAS_AUTHORITY_NODE_PAGE_SIZE}`))).toBe(true);
  });

  it('fails closed on stored body content, content hash, and authority-profile drift', () => {
    withinSavepoint(() => {
      database.prepare(`UPDATE historical_edition_hierarchy_bodies SET content = 'tampered body'
        WHERE hierarchy_id = ? AND source_ordinal = 1`).run(AQUINAS_HIERARCHY_ID);
      expect(audit).toThrow('Aquinas stored authority differs');
    });
    withinSavepoint(() => {
      database.prepare(`UPDATE historical_edition_hierarchy_bodies SET content_sha256 = ?
        WHERE hierarchy_id = ? AND source_ordinal = 1`).run('0'.repeat(64), AQUINAS_HIERARCHY_ID);
      expect(audit).toThrow('Aquinas stored authority differs');
    });
    withinSavepoint(() => {
      database.prepare(`UPDATE historical_edition_hierarchies SET availability = 'local_only_inactive'
        WHERE hierarchy_id = ?`).run(AQUINAS_HIERARCHY_ID);
      expect(audit).toThrow('Aquinas stored authority differs');
    });
  });

  it('rejects a response exceeding the independent decoded-page byte limit', () => {
    expect(() => auditAquinasAuthority(() => ({ rows: [], responseBytes: AQUINAS_AUTHORITY_PAGE_MAX_BYTES + 1 }), plan))
      .toThrow('Aquinas stored authority differs');
  });
});
