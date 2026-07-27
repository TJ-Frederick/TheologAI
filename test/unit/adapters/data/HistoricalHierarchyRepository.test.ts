import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HistoricalHierarchyRepository } from '../../../../src/adapters/data/HistoricalHierarchyRepository.js';
import { AQUINAS_HIERARCHY_ID, materializeHistoricalHierarchy } from '../../../../scripts/historical-hierarchy.js';
import { loadApprovedAquinasHierarchy } from '../../../../scripts/aquinas-source-pack-capacity-comparison.js';

const ROOT = process.cwd();
function repository(): { db: Database.Database; repo: HistoricalHierarchyRepository } {
  const db = new Database(':memory:'); db.pragma('foreign_keys = ON');
  for (const migration of ['0001_initial_schema.sql', '0002_ubs_parallel_passages.sql', '0003_original_language_usage.sql', '0004_ubs_hebrew_semantics.sql', '0005_historical_section_identity_delivery.sql', '0006_historical_source_packs.sql', '0007_historical_hierarchy.sql']) {
    db.exec(readFileSync(join(ROOT, 'migrations', migration), 'utf8'));
  }
  materializeHistoricalHierarchy(db, loadApprovedAquinasHierarchy({ read: path => readFileSync(join(ROOT, path)) }));
  return { db, repo: new HistoricalHierarchyRepository(db) };
}

describe('HistoricalHierarchyRepository', () => {
  it('has the same profile/provenance, direct context, navigation, neighbor, and discovery boundaries as D1', () => {
    const { db, repo } = repository();
    try {
      expect(repo.getHierarchyProfile(AQUINAS_HIERARCHY_ID)).toMatchObject({ hierarchyId: AQUINAS_HIERARCHY_ID, provenance: { rightsStatus: 'public_domain_in_usa' }, levelSpec: { maxDepth: 3 } });
      expect(repo.listHierarchyArtifacts(AQUINAS_HIERARCHY_ID)).toHaveLength(4);
      expect(repo.getHierarchyNodeContext(AQUINAS_HIERARCHY_ID, 'article:prima.q001.a001'))
        .toMatchObject({ node: { depth: 3 }, body: { bodyKey: 'prima.q001.a001' }, ancestors: [{ nodeKey: 'part:prima' }, { nodeKey: 'question:prima.q001' }] });
      const roots = repo.listHierarchyChildren(AQUINAS_HIERARCHY_ID, null, undefined, 1);
      expect(roots).toMatchObject({ hasMore: true, nodes: [{ nodeKey: 'part:prima' }], nextAfter: { siblingOrdinal: 1 } });
      expect(repo.listHierarchyChildren(AQUINAS_HIERARCHY_ID, null, roots.nextAfter, 3).nodes).toHaveLength(3);
      expect(repo.getHierarchyNeighbors(AQUINAS_HIERARCHY_ID, 'article:prima.q001.a002')).toMatchObject({ previous: { siblingOrdinal: 1 }, next: { siblingOrdinal: 3 } });
      const search = repo.searchHierarchyBodies({ hierarchyId: AQUINAS_HIERARCHY_ID, text: 'Sacred Doctrine', match: 'phrase', limit: 2 });
      expect(search).toHaveLength(2); expect(search.every(result => !('content' in result.body) && result.snippet.length <= 900)).toBe(true);
    } finally { db.close(); }
  });
});
