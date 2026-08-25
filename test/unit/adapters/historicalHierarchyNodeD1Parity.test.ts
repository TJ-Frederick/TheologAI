import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HistoricalHierarchyRepository } from '../../../src/adapters/data/HistoricalHierarchyRepository.js';
import { D1HistoricalHierarchyRepository } from '../../../src/adapters/d1/D1HistoricalHierarchyRepository.js';
import { materializeHistoricalHierarchy } from '../../../scripts/historical-hierarchy.js';
import { loadApprovedAquinasHierarchy } from '../../../scripts/aquinas-source-pack-capacity-comparison.js';
import { loadApprovedAquinasHierarchyPublication, materializeHistoricalHierarchyPublication } from '../../../scripts/historical-hierarchy-publication.js';

const ROOT = process.cwd();

function sqliteD1(db: Database.Database, statements: string[]): D1Database {
  return {
    prepare(sql: string) {
      statements.push(sql);
      return {
        bind(...values: unknown[]) {
          return {
          async all<T>(): Promise<D1Result<T>> { return { results: db.prepare(sql).all(...values) as T[], success: true, meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false, changes: 0 } }; },
            async first<T>(): Promise<T | null> { return (db.prepare(sql).get(...values) as T | undefined) ?? null; },
          };
        },
      } as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

describe('historical hierarchy Node/D1 repository parity', () => {
  it('preserves direct body, children, search, provenance, and publication facts with one batched D1 breadcrumb query', async () => {
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      for (const migration of [
        '0001_initial_schema.sql', '0002_ubs_parallel_passages.sql', '0003_original_language_usage.sql',
        '0004_ubs_hebrew_semantics.sql', '0005_historical_section_identity_delivery.sql',
        '0006_historical_source_packs.sql', '0007_historical_hierarchy.sql', '0008_historical_hierarchy_publications.sql',
      ]) db.exec(readFileSync(join(ROOT, 'migrations', migration), 'utf8'));
      const hierarchy = loadApprovedAquinasHierarchy({ read: path => readFileSync(join(ROOT, path)) });
      materializeHistoricalHierarchy(db, hierarchy);
      materializeHistoricalHierarchyPublication(db, loadApprovedAquinasHierarchyPublication(hierarchy), hierarchy);
      const statements: string[] = [];
      const node = new HistoricalHierarchyRepository(db);
      const d1 = new D1HistoricalHierarchyRepository(sqliteD1(db, statements));
      const id = hierarchy.hierarchy.hierarchyId;

      expect(await d1.getHierarchyPublicationBySlug('summa-theologiae')).toEqual(node.getHierarchyPublicationBySlug('summa-theologiae'));
      expect(await d1.getHierarchyNodeContext(id, 'article:prima.q001.a001')).toEqual(node.getHierarchyNodeContext(id, 'article:prima.q001.a001'));
      expect(await d1.listHierarchyChildren(id, 'part:secunda-secundae', undefined, 32))
        .toEqual(node.listHierarchyChildren(id, 'part:secunda-secundae', undefined, 32));

      statements.length = 0;
      expect(await d1.searchHierarchyBodies({ hierarchyId: id, text: 'Sacred Doctrine', match: 'phrase', limit: 9 }))
        .toEqual(node.searchHierarchyBodies({ hierarchyId: id, text: 'Sacred Doctrine', match: 'phrase', limit: 9 }));
      expect(statements.filter(sql => sql.includes('WITH RECURSIVE hierarchy_chain'))).toHaveLength(1);
      expect(statements).toHaveLength(3); // profile, FTS discovery, all breadcrumbs
    } finally { db.close(); }
  });
});
