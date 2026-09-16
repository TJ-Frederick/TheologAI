/** Bounded, source-replayed verification of the active Aquinas authority in SQLite or D1. */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDataManifest, verifyD1Migrations } from './d1-corpus-identity.js';
import { loadActiveAquinasHierarchy } from './active-aquinas-hierarchy.js';
import { materializeHistoricalHierarchy } from './historical-hierarchy.js';
import { loadActiveAquinasHierarchyPublication, materializeHistoricalHierarchyPublication } from './historical-hierarchy-publication.js';
import { sha256Canonical } from './historical-section-key-plan.js';
import type { HistoricalTransform8AuthorityPage } from './historical-transform8-authority-audit.js';

export interface AquinasAuthorityPage {
  sql: string;
  rows: number;
  sha256: string;
}
export interface AquinasAuthorityAuditResult { pages: number; rows: number; sha256: string }
/** Bound every decoded authority page independently of the Wrangler envelope. */
export const AQUINAS_AUTHORITY_PAGE_MAX_BYTES = 1_000_000;
export const AQUINAS_AUTHORITY_BODY_PAGE_SIZE = 8;
export const AQUINAS_AUTHORITY_NODE_PAGE_SIZE = 64;
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Rebuild only this authority in memory; retain hashes, never source bodies, in the plan. */
export function buildAquinasAuthorityQueryPlan(root: string): AquinasAuthorityPage[] {
  const manifest = parseDataManifest(readFileSync(join(root, 'data/data-manifest.json')));
  const migrations = verifyD1Migrations(root, manifest);
  const hierarchy = loadActiveAquinasHierarchy({ read: path => readFileSync(join(root, path)) });
  const publication = loadActiveAquinasHierarchyPublication(hierarchy);
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    for (const migration of migrations) db.exec(migration.toString('utf8'));
    materializeHistoricalHierarchy(db, hierarchy);
    materializeHistoricalHierarchyPublication(db, publication, hierarchy);
    const plan: AquinasAuthorityPage[] = [];
    const append = (sql: string): Record<string, unknown>[] => {
      const rows = db.prepare(sql).all() as Record<string, unknown>[];
      if (Buffer.byteLength(JSON.stringify(rows)) > AQUINAS_AUTHORITY_PAGE_MAX_BYTES) throw new Error('Aquinas authority page exceeds its response budget');
      plan.push({ sql, rows: rows.length, sha256: sha256Canonical(rows) });
      return rows;
    };
    for (const [table, key, id, limit] of [
      ['historical_source_packs', 'pack_id', hierarchy.sourcePack.packId, 1],
      ['historical_works', 'work_id', hierarchy.work.workId, 1],
      ['historical_editions', 'edition_id', hierarchy.edition.editionId, 1],
      ['historical_source_artifacts', 'edition_id', hierarchy.edition.editionId, hierarchy.artifacts.length],
      ['historical_edition_hierarchies', 'hierarchy_id', hierarchy.hierarchy.hierarchyId, 1],
      ['historical_hierarchy_publications', 'publication_id', publication.publicationId, 1],
    ]) {
      append(`SELECT * FROM ${table} WHERE ${key} = ${literal(String(id))} ORDER BY 1 LIMIT ${limit}`);
    }
    for (const [table, order, pageSize] of [
      ['historical_edition_hierarchy_bodies', 'source_ordinal', AQUINAS_AUTHORITY_BODY_PAGE_SIZE],
      ['historical_edition_hierarchy_nodes', 'flat_ordinal', AQUINAS_AUTHORITY_NODE_PAGE_SIZE],
    ] as const) {
      let after = 0;
      while (true) {
        const rows = append(`SELECT * FROM ${table} WHERE hierarchy_id = ${literal(hierarchy.hierarchy.hierarchyId)} AND ${order} > ${after} ORDER BY ${order} LIMIT ${pageSize}`);
        if (rows.length < pageSize) break;
        after = Number(rows.at(-1)![order]);
      }
    }
    return plan;
  } finally { db.close(); }
}

export function auditAquinasAuthority(
  readPage: (sql: string) => HistoricalTransform8AuthorityPage,
  plan: readonly AquinasAuthorityPage[],
): AquinasAuthorityAuditResult {
  for (const page of plan) {
    const actual = readPage(page.sql);
    if (!Number.isSafeInteger(actual.responseBytes) || actual.responseBytes < 0 || actual.responseBytes > AQUINAS_AUTHORITY_PAGE_MAX_BYTES
      || actual.rows.length !== page.rows || sha256Canonical(actual.rows) !== page.sha256) {
      throw new Error('Aquinas stored authority differs from its pinned source projection');
    }
  }
  return { pages: plan.length, rows: plan.reduce((sum, page) => sum + page.rows, 0), sha256: sha256Canonical(plan.map(({ rows, sha256 }) => ({ rows, sha256 }))) };
}
