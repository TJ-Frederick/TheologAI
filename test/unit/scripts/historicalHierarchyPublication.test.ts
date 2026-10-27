import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AQUINAS_HIERARCHY_PUBLICATION_EXPECTED,
  assertApprovedAquinasHierarchyPublication,
  loadApprovedAquinasHierarchyPublication,
  materializeHistoricalHierarchyPublication,
} from '../../../scripts/historical-hierarchy-publication.js';
import {
  AQUINAS_HIERARCHY_ID,
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
    '0006_historical_source_packs.sql', '0007_historical_hierarchy.sql', '0008_historical_hierarchy_publications.sql',
  ]) db.exec(readFileSync(join(ROOT, 'migrations', migration), 'utf8'));
  return db;
}

describe('Transform 10 dormant hierarchy publication projection', () => {
  it('projects exact public metadata and coverage without copying authority bodies or activating documents', () => {
    const db = database();
    try {
      const hierarchy = loadApprovedAquinasHierarchy({ read: path => readFileSync(join(ROOT, path)) });
      materializeHistoricalHierarchy(db, hierarchy);
      const before = db.prepare(`SELECT
        (SELECT COUNT(*) FROM historical_edition_hierarchy_bodies WHERE hierarchy_id = ?) AS bodies,
        (SELECT COUNT(*) FROM historical_edition_hierarchy_bodies_fts WHERE hierarchy_id = ?) AS fts,
        (SELECT authority_bodies_sha256 FROM historical_edition_hierarchies WHERE hierarchy_id = ?) AS bodyHash,
        (SELECT availability FROM historical_edition_hierarchies WHERE hierarchy_id = ?) AS availability`)
        .get(AQUINAS_HIERARCHY_ID, AQUINAS_HIERARCHY_ID, AQUINAS_HIERARCHY_ID, AQUINAS_HIERARCHY_ID);
      const publication = loadApprovedAquinasHierarchyPublication(hierarchy);
      materializeHistoricalHierarchyPublication(db, publication, hierarchy);
      const after = db.prepare(`SELECT
        (SELECT COUNT(*) FROM historical_edition_hierarchy_bodies WHERE hierarchy_id = ?) AS bodies,
        (SELECT COUNT(*) FROM historical_edition_hierarchy_bodies_fts WHERE hierarchy_id = ?) AS fts,
        (SELECT authority_bodies_sha256 FROM historical_edition_hierarchies WHERE hierarchy_id = ?) AS bodyHash,
        (SELECT availability FROM historical_edition_hierarchies WHERE hierarchy_id = ?) AS availability`)
        .get(AQUINAS_HIERARCHY_ID, AQUINAS_HIERARCHY_ID, AQUINAS_HIERARCHY_ID, AQUINAS_HIERARCHY_ID);
      expect(after).toEqual(before);
      expect(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'historical_edition_hierarchy_bodies_fts_content'`).get()).toBeUndefined();
      expect(db.prepare('SELECT COUNT(*) AS count FROM documents WHERE id = ?').get(hierarchy.work.workId)).toEqual({ count: 0 });
      expect(db.prepare(`SELECT public_slug AS publicSlug, canonical_uri AS canonicalUri, delivery_kind AS deliveryKind,
        activation_state AS activationState, coverage_json AS coverageJson FROM historical_hierarchy_publications`).get())
        .toEqual({
          publicSlug: AQUINAS_HIERARCHY_PUBLICATION_EXPECTED.publicSlug,
          canonicalUri: 'theologai://documents/summa-theologiae', deliveryKind: 'hierarchy_nodes_v1', activationState: 'dormant',
          coverageJson: JSON.stringify(publication.coverage),
        });
      expect(publication.coverage.statement).toContain('Prima (q1–119), Prima Secundae (q1–114), Secunda Secundae (q1–189), and Tertia through q90');
      expect(publication.coverage.descriptors).toContainEqual({
        relationship: 'excluded', label: 'Traditional Supplement', address: { scheme: 'part', start: 'Supplement', end: null },
      });
    } finally { db.close(); }
  });

  it('rejects every immutable metadata, coverage, and unexpected-field drift', () => {
    const hierarchy = loadApprovedAquinasHierarchy({ read: path => readFileSync(join(ROOT, path)) });
    const publication = loadApprovedAquinasHierarchyPublication(hierarchy);
    const mutations: Array<(value: any) => void> = [
      value => { value.metadata.creators[0].name = 'Other author'; },
      value => { value.metadata.documentType = 'other'; },
      value => { value.metadata.language = 'Latin'; },
      value => { value.metadata.editionLabel = 'Other edition'; },
      value => { value.coverage.completeness = 'complete'; },
      value => { value.metadata.unexpected = true; },
      value => { value.coverage.unexpected = true; },
      value => { value.unexpected = true; },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(publication) as any;
      mutate(changed);
      expect(() => assertApprovedAquinasHierarchyPublication(changed, hierarchy)).toThrow(/drifted/);
    }
  });

  it('requires inactive authority and keeps its projection immutable', () => {
    const db = database();
    try {
      const hierarchy = loadApprovedAquinasHierarchy({ read: path => readFileSync(join(ROOT, path)) });
      materializeHistoricalHierarchy(db, hierarchy);
      const publication = loadApprovedAquinasHierarchyPublication(hierarchy);
      materializeHistoricalHierarchyPublication(db, publication, hierarchy);
      expect(() => db.prepare(`UPDATE historical_hierarchy_publications SET public_slug = 'other'`).run()).toThrow('immutable');
      expect(() => db.prepare(`DELETE FROM historical_hierarchy_publications`).run()).toThrow('cannot be deleted');
      expect(() => db.prepare(`INSERT INTO historical_hierarchy_publications (
        publication_id, hierarchy_id, public_slug, title, metadata_json, delivery_kind, coverage_json,
        cursor_contract, cursor_identity, browse_page_size, landing_max_bytes, directory_max_bytes,
        node_max_bytes, search_max_bytes, canonical_uri, activation_state
      ) VALUES ('other', 'missing', 'other', 'Other', '{}', 'hierarchy_nodes_v1', '{}',
        'historical-hierarchy-browse-cursor-v1', ?, 1, 1024, 1024, 1024, 1024,
        'theologai://documents/other', 'dormant')`).run('a'.repeat(64))).toThrow();
    } finally { db.close(); }
  });
});
