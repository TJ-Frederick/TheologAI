import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HistoricalHierarchyRepository } from '../../../src/adapters/data/HistoricalHierarchyRepository.js';
import { buildD1ReadinessDiagnosticSql } from '../../../scripts/check-remote-d1-readiness.js';
import {
  AQUINAS_HIERARCHY_EXPECTED,
  AQUINAS_HIERARCHY_ID,
  assertNormalAquinasHierarchyExclusion,
  materializeHistoricalHierarchy,
} from '../../../scripts/historical-hierarchy.js';
import { loadApprovedAquinasHierarchy } from '../../../scripts/aquinas-source-pack-capacity-comparison.js';

const ROOT = process.cwd();

function database(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of [
    '0001_initial_schema.sql', '0002_ubs_parallel_passages.sql', '0003_original_language_usage.sql',
    '0004_ubs_hebrew_semantics.sql', '0005_historical_section_identity_delivery.sql',
    '0006_historical_source_packs.sql', '0007_historical_hierarchy.sql',
  ]) db.exec(readFileSync(join(ROOT, 'migrations', migration), 'utf8'));
  return db;
}
function packet() { return loadApprovedAquinasHierarchy({ read: path => readFileSync(join(ROOT, path)) }); }

function materializeHeadingSearchFixture(db: Database.Database): string {
  const hierarchyId = 'heading-search-fixture';
  const hash = 'a'.repeat(64);
  const levelSpec = JSON.stringify({
    maxDepth: 1,
    levels: [{ depth: 1, nodeKind: 'landing', parentNodeKinds: [], bodyKinds: ['authority'], bodyRequired: true }],
  });
  db.transaction(() => {
    db.prepare('INSERT INTO historical_source_packs VALUES (?, ?, ?, ?, ?)')
      .run('fixture-pack', 'fixture-revision', 'fixture.v1', hash, 'fixture');
    db.prepare('INSERT INTO historical_works VALUES (?, ?, ?, ?)')
      .run('fixture-work', 'Fixture work', 'reviewed', '[]');
    db.prepare(`INSERT INTO historical_editions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('fixture-edition', 'fixture-work', 'fixture-pack', 'English', '{}', 'Fixture', '1', 'verified', null, '2026-01-01T00:00:00Z', '{}', '{}', '{}');
    db.prepare(`INSERT INTO historical_edition_hierarchies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(hierarchyId, 'fixture-pack', 'fixture-work', 'fixture-edition', 'local_only_inactive', 'fixture.v1', levelSpec,
        hash, hash, hash, hash, hash, hash, hash, hash, hash, hash, 2, 2, '{}', '{}');
    const body = db.prepare(`INSERT INTO historical_edition_hierarchy_bodies VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    body.run(hierarchyId, 'heading-body', 'authority', 1, 'Heading Only Phrase', hash, 26, 'body text without that phrase');
    body.run(hierarchyId, 'content-body', 'authority', 2, 'Other heading', hash, 31, 'A body has Heading Only Phrase');
    const node = db.prepare(`INSERT INTO historical_edition_hierarchy_nodes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    node.run(hierarchyId, 'heading-node', null, 'landing', 'heading-body', 1, 1, 1, 'Heading', 'Heading Only Phrase');
    node.run(hierarchyId, 'content-node', null, 'landing', 'content-body', 1, 2, 2, 'Content', 'Other heading');
    const fts = db.prepare(`INSERT INTO historical_edition_hierarchy_bodies_fts (rowid, hierarchy_id, body_key, heading, content)
      SELECT rowid, hierarchy_id, body_key, heading, content FROM historical_edition_hierarchy_bodies WHERE hierarchy_id = ? ORDER BY source_ordinal`);
    fts.run(hierarchyId);
  })();
  return hierarchyId;
}

function materializeCoreEightAuthorityFixture(db: Database.Database): void {
  db.transaction(() => {
    db.prepare('INSERT INTO historical_source_packs VALUES (?, ?, ?, ?, ?)')
      .run('theologai-core-eight', 'fixture', 'fixture.v1', 'b'.repeat(64), 'fixture');
    const work = db.prepare('INSERT INTO historical_works VALUES (?, ?, ?, ?)');
    const edition = db.prepare('INSERT INTO historical_editions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const artifact = db.prepare('INSERT INTO historical_source_artifacts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (let ordinal = 1; ordinal <= 8; ordinal++) {
      const workId = `core-work-${ordinal}`;
      const editionId = `core-edition-${ordinal}`;
      work.run(workId, `Core work ${ordinal}`, 'reviewed', '[]');
      edition.run(editionId, workId, 'theologai-core-eight', 'English', '{}', 'Fixture', '1', 'verified', null,
        '2026-01-01T00:00:00Z', '{}', '{}', JSON.stringify({ status: 'no_known_conflict', scope: 'normalized_public_domain_text_only' }));
      artifact.run(`core-artifact-${ordinal}`, editionId, 'authority', `https://example.test/${ordinal}`, 'sha256', 'c'.repeat(64), 'c'.repeat(64), ordinal, '2026-01-01T00:00:00Z');
    }
  })();
}

function readinessFailures(db: Database.Database, check: string): string[] {
  return (db.prepare(buildD1ReadinessDiagnosticSql({}, undefined, undefined, [check])).all() as Array<{ check_name: string }>)
    .map(row => row.check_name);
}

describe('Transform 10 generic edition hierarchy', () => {
  it('anchors all exact Aquinas provenance in the existing source lineage without a document projection', () => {
    const db = database();
    try {
      const materialization = packet();
      expect(materializeHistoricalHierarchy(db, materialization)).toEqual({ hierarchies: 1, artifacts: 4, bodies: 3184, nodes: 3185, ftsRows: 3184 });
      expect(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get('historical_edition_hierarchy_bodies_fts_content')).toBeUndefined();
      expect(db.prepare(`SELECT group_concat(name, ',') AS names FROM pragma_table_info('historical_edition_hierarchy_bodies_fts')`)
        .get()).toEqual({ names: 'hierarchy_id,body_key,heading,content' });
      expect(db.prepare('SELECT COUNT(*) AS count FROM documents WHERE id = ?').get(AQUINAS_HIERARCHY_EXPECTED.workId)).toEqual({ count: 0 });
      expect(db.prepare(`SELECT pack_id AS packId, work_id AS workId FROM historical_editions WHERE edition_id = ?`)
        .get(AQUINAS_HIERARCHY_EXPECTED.editionId)).toEqual({ packId: AQUINAS_HIERARCHY_EXPECTED.packId, workId: AQUINAS_HIERARCHY_EXPECTED.workId });
      expect(db.prepare(`SELECT COUNT(*) AS count FROM historical_source_artifacts WHERE edition_id = ? AND role = 'authority'`)
        .get(AQUINAS_HIERARCHY_EXPECTED.editionId)).toEqual({ count: 4 });
      expect(db.prepare(`SELECT provenance_json AS provenance, coverage_json AS coverage FROM historical_edition_hierarchies WHERE hierarchy_id = ?`)
        .get(AQUINAS_HIERARCHY_ID)).toEqual({
        provenance: expect.stringContaining('public_domain_in_usa'), coverage: expect.stringContaining('not a complete traditional Summa Theologiae'),
      });
    } finally { db.close(); }
  });

  it('provides bounded direct context and complete stable root/child pagination', () => {
    const db = database();
    try {
      materializeHistoricalHierarchy(db, packet());
      const repository = new HistoricalHierarchyRepository(db);
      const question = repository.getHierarchyNodeContext(AQUINAS_HIERARCHY_ID, 'question:prima.q001');
      expect(question?.node.nodeKind).toBe('question');
      expect(question?.body?.bodyKind).toBe('preamble');
      expect(question?.body?.content).not.toContain('FIRST ARTICLE [I, Q. 1, Art. 1]');
      expect(question?.ancestors.map(node => node.nodeKind)).toEqual(['part']);
      const article = repository.getHierarchyNodeContext(AQUINAS_HIERARCHY_ID, 'article:prima.q001.a001');
      expect(article?.ancestors.map(node => node.nodeKey)).toEqual(['part:prima', 'question:prima.q001']);

      const roots = repository.listHierarchyChildren(AQUINAS_HIERARCHY_ID, null, undefined, 2);
      expect(roots.nodes.map(node => node.nodeKey)).toEqual(['part:prima', 'part:prima-secundae']);
      expect(roots.hasMore).toBe(true);
      expect(repository.listHierarchyChildren(AQUINAS_HIERARCHY_ID, null, roots.nextAfter, 2).nodes.map(node => node.nodeKey))
        .toEqual(['part:secunda-secundae', 'part:tertia']);

      const seen: string[] = [];
      let after: { siblingOrdinal: number; nodeKey: string } | undefined;
      do {
        const page = repository.listHierarchyChildren(AQUINAS_HIERARCHY_ID, 'part:secunda-secundae', after, 32);
        seen.push(...page.nodes.map(node => node.nodeKey)); after = page.nextAfter;
      } while (after !== undefined);
      expect(seen).toHaveLength(189);
      expect(seen[0]).toBe('question:secunda-secundae.q001');
      expect(seen.at(-1)).toBe('question:secunda-secundae.q189');
      expect(() => repository.listHierarchyChildren(AQUINAS_HIERARCHY_ID, 'part:prima', { siblingOrdinal: 1, nodeKey: 'question:secunda-secundae.q001' }, 1))
        .toThrow('not found');
      expect(() => repository.listHierarchyChildren(AQUINAS_HIERARCHY_ID, 'part:prima', { siblingOrdinal: 99, nodeKey: 'question:prima.q001' }, 1))
        .toThrow('does not match');
      expect(repository.getHierarchyNeighbors(AQUINAS_HIERARCHY_ID, 'question:prima.q002'))
        .toMatchObject({ previous: { siblingOrdinal: 1 }, next: { siblingOrdinal: 3 } });
    } finally { db.close(); }
  });

  it('returns search discovery metadata only, with controlled all-terms and phrase matching', () => {
    const db = database();
    try {
      materializeHistoricalHierarchy(db, packet());
      const repository = new HistoricalHierarchyRepository(db);
      const allTerms = repository.searchHierarchyBodies({ hierarchyId: AQUINAS_HIERARCHY_ID, text: 'Sacred Doctrine', match: 'all_terms', limit: 9 });
      const phrase = repository.searchHierarchyBodies({ hierarchyId: AQUINAS_HIERARCHY_ID, text: 'Sacred Doctrine', match: 'phrase', limit: 9 });
      expect(allTerms.length).toBeGreaterThan(0); expect(phrase.length).toBeGreaterThan(0);
      expect(allTerms[0]).toMatchObject({ body: { bodyKey: expect.any(String), contentSha256: expect.any(String) }, snippet: expect.any(String), rank: expect.any(Number) });
      expect('content' in allTerms[0]!.body).toBe(false);
      expect(allTerms[0]!.breadcrumb.at(-1)?.nodeKey).toBe(allTerms[0]!.node.nodeKey);
      expect(() => repository.searchHierarchyBodies({ hierarchyId: AQUINAS_HIERARCHY_ID, text: 'one', match: 'all_terms', limit: 10 })).toThrow('1..9');
    } finally { db.close(); }
  });

  it('searches separately indexed headings, weights them above content, and keeps snippets content-only', () => {
    const db = database();
    try {
      const hierarchyId = materializeHeadingSearchFixture(db);
      const repository = new HistoricalHierarchyRepository(db);
      const phrase = repository.searchHierarchyBodies({ hierarchyId, text: 'Heading Only Phrase', match: 'phrase', limit: 9 });
      expect(phrase.map(result => result.body.bodyKey)).toEqual(['heading-body', 'content-body']);
      expect(phrase[0]?.snippet).not.toContain('<mark>');
      expect(phrase[1]?.snippet).toContain('<mark>Heading Only Phrase</mark>');
      expect(phrase.every(result => !('content' in result.body))).toBe(true);
    } finally { db.close(); }
  });

  it('enforces immutability, generic level transitions, local siblings, and flat ordinals in SQL', () => {
    const db = database();
    try {
      materializeHistoricalHierarchy(db, packet());
      expect(() => db.prepare(`UPDATE historical_edition_hierarchies SET availability = 'changed'`).run()).toThrow('immutable');
      expect(() => db.prepare(`UPDATE historical_edition_hierarchy_bodies SET content = 'changed' WHERE hierarchy_id = ?`).run(AQUINAS_HIERARCHY_ID)).toThrow('immutable');
      expect(() => db.prepare(`DELETE FROM historical_edition_hierarchy_nodes WHERE hierarchy_id = ?`).run(AQUINAS_HIERARCHY_ID)).toThrow('cannot be deleted');
      expect(() => db.prepare(`INSERT INTO historical_edition_hierarchy_nodes (
        hierarchy_id, node_key, parent_node_key, node_kind, body_key, depth, flat_ordinal, sibling_ordinal, label, heading
      ) VALUES (?, 'invalid:level', 'article:prima.q001.a001', 'question', 'preamble:prima.q001', 2, 3186, 1, 'invalid', 'invalid')`).run(AQUINAS_HIERARCHY_ID))
        .toThrow('level specification');
      expect(() => db.prepare(`INSERT INTO historical_edition_hierarchy_nodes (
        hierarchy_id, node_key, parent_node_key, node_kind, body_key, depth, flat_ordinal, sibling_ordinal, label, heading
      ) VALUES (?, 'invalid:flat', NULL, 'part', NULL, 1, 4000, 5, 'invalid', 'invalid')`).run(AQUINAS_HIERARCHY_ID))
        .toThrow('flat ordinals');
      expect(() => db.prepare(`INSERT INTO historical_edition_hierarchy_nodes (
        hierarchy_id, node_key, parent_node_key, node_kind, body_key, depth, flat_ordinal, sibling_ordinal, label, heading
      ) VALUES (?, 'invalid:sibling', NULL, 'part', NULL, 1, 3186, 99, 'invalid', 'invalid')`).run(AQUINAS_HIERARCHY_ID))
        .toThrow('locally contiguous');
    } finally { db.close(); }
  });

  it('keeps the exact core-eight authority gate pack-scoped and excludes dormant Aquinas materialization from normal readiness', () => {
    const db = database();
    try {
      materializeCoreEightAuthorityFixture(db);
      expect(readinessFailures(db, 'historical.transform9.source_pack_authority')).toEqual([]);
      const normalTransform10Checks = [
        'historical.transform10.normal.hierarchies_empty',
        'historical.transform10.normal.bodies_empty',
        'historical.transform10.normal.nodes_empty',
        'historical.transform10.normal.fts_empty',
        'historical.transform10.normal.pack_absent',
        'historical.transform10.normal.work_absent',
        'historical.transform10.normal.edition_absent',
        'historical.transform10.normal.artifacts_absent',
      ] as const;
      for (const check of normalTransform10Checks) expect(readinessFailures(db, check)).toEqual([]);
      expect(() => assertNormalAquinasHierarchyExclusion(db)).not.toThrow();

      db.exec('SAVEPOINT core_eight_extra');
      try {
        db.prepare('INSERT INTO historical_works VALUES (?, ?, ?, ?)').run('core-extra-work', 'Extra', 'reviewed', '[]');
        db.prepare('INSERT INTO historical_editions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run('core-extra-edition', 'core-extra-work', 'theologai-core-eight', 'English', '{}', 'Fixture', '1', 'verified', null,
            '2026-01-01T00:00:00Z', '{}', '{}', JSON.stringify({ status: 'no_known_conflict', scope: 'normalized_public_domain_text_only' }));
        db.prepare('INSERT INTO historical_source_artifacts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run('core-extra-artifact', 'core-extra-edition', 'authority', 'https://example.test/extra', 'sha256', 'd'.repeat(64), 'd'.repeat(64), 9, '2026-01-01T00:00:00Z');
        expect(readinessFailures(db, 'historical.transform9.source_pack_authority')).toEqual([
          'historical.transform9.source_pack_authority',
        ]);
      } finally { db.exec('ROLLBACK TO core_eight_extra; RELEASE core_eight_extra'); }

      db.exec('SAVEPOINT core_eight_wrong');
      try {
        db.prepare(`UPDATE historical_editions SET normalized_text_rights_json = '{}' WHERE edition_id = 'core-edition-1'`).run();
        expect(readinessFailures(db, 'historical.transform9.source_pack_authority')).toEqual([
          'historical.transform9.source_pack_authority',
        ]);
      } finally { db.exec('ROLLBACK TO core_eight_wrong; RELEASE core_eight_wrong'); }

      materializeHistoricalHierarchy(db, packet());
      for (const check of normalTransform10Checks) expect(readinessFailures(db, check)).toEqual([check]);
      expect(() => assertNormalAquinasHierarchyExclusion(db))
        .toThrow('Normal release database materialized excluded Transform 10 authority');
    } finally { db.close(); }
  });
});
