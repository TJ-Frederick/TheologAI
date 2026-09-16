/** Transform-13 active projection loader for the immutable Aquinas packet. */

import type Database from 'better-sqlite3';
import {
  buildCandidateB,
  loadAquinasCapacityInput,
  type AquinasPackageReader,
} from './aquinas-source-pack-capacity-comparison.js';
import {
  assertActiveAquinasHierarchy,
  assertHistoricalHierarchyStoredIntegrity,
  buildActiveAquinasHierarchy,
  type HistoricalEditionHierarchyMaterialization,
  type HistoricalHierarchyMaterializationCounts,
} from './historical-hierarchy.js';

/** Load every active fact from the hash-pinned four-part packet. */
export function loadActiveAquinasHierarchy(
  reader: AquinasPackageReader,
): HistoricalEditionHierarchyMaterialization {
  const input = loadAquinasCapacityInput(undefined, reader);
  return buildActiveAquinasHierarchy(reader, input, buildCandidateB(input));
}

/** Stored active authority must match every body, node, lineage, and FTS fact. */
export function assertActiveAquinasHierarchyStoredIntegrity(
  db: Database.Database,
  materialization: HistoricalEditionHierarchyMaterialization,
  options: { ftsIntegrity?: boolean } = {},
): HistoricalHierarchyMaterializationCounts {
  assertActiveAquinasHierarchy(materialization);
  return assertHistoricalHierarchyStoredIntegrity(db, materialization, options);
}
