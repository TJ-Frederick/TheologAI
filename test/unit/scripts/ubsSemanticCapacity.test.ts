import { describe, expect, it } from 'vitest';
import { D1_MAX_STATEMENT_BYTES, D1_SEED_FILE_BYTES } from '../../../scripts/d1-seed-utils.js';
import {
  D1_MAX_BOUND_PARAMETERS,
  D1_MAX_ROW_BYTES,
  UBS_SEMANTIC_OPERATION_INVENTORY,
  UBS_SEMANTIC_SEED_MANIFEST_SCHEMA,
  UBS_SEMANTIC_TABLE_INVENTORY,
  UBS_SEMANTICS_DATABASE_CEILING_BYTES,
  assessUbsSemanticCapacity,
  assertUbsSemanticCapacity,
  type UbsSemanticCapacityInput,
} from '../../../scripts/ubs-semantics/capacity.js';

function input(): UbsSemanticCapacityInput {
  const files = UBS_SEMANTIC_TABLE_INVENTORY.map((table, index) => ({
    table, chunk: 1, name: `${table}-0001.sql`, bytes: 1024,
    statementCount: 1, maxStatementBytes: 200, sha256: String((index % 9) + 1).repeat(64),
  }));
  return {
    baselineDatabaseBytes: 150 * 1024 * 1024,
    tables: UBS_SEMANTIC_TABLE_INVENTORY.map(table => table === 'ubs_semantic_entries'
      ? { table, projectedRowCount: 10_000, measuredRowBytes: [100, 200] }
      : table === 'ubs_semantic_senses'
        ? { table, projectedRowCount: 20_000, measuredRowBytes: [300] }
        : { table, projectedRowCount: 1, measuredRowBytes: [100] }),
    operations: UBS_SEMANTIC_OPERATION_INVENTORY.map(label => ({ label, bindCount: 3, queryStatementBytes: 200 })),
    seedManifest: {
      schemaVersion: UBS_SEMANTIC_SEED_MANIFEST_SCHEMA,
      generated: true,
      totalStatementCount: files.length,
      maxStatementBytes: 200,
      files,
    },
    storageMultiplierBasisPoints: 20_000,
  };
}

describe('UBS semantic D1 capacity gate', () => {
  it('covers each statement in the fixed aggregate repository operation', () => {
    expect(UBS_SEMANTIC_OPERATION_INVENTORY).toEqual([
      'aggregate_metadata_and_boundary', 'aggregate_candidates', 'aggregate_domains',
      'aggregate_references', 'aggregate_sources',
    ]);
  });

  it('deterministically estimates sampled inputs below the planned ceiling', () => {
    const report = assertUbsSemanticCapacity(input());
    expect(report.projectionKind).toBe('sampled_projection');
    expect(report.estimatedSemanticLayerBytes).toBe(15_001_400);
    expect(report.projectedDatabaseBytes).toBe(172_287_800);
    expect(report.largestQueryStatementBytes).toBe(200);
    expect(report.largestSeedStatementBytes).toBe(200);
    expect(report.withinPlannedDatabaseCeiling).toBe(true);
  });

  it('prefers an actual materialized database measurement for the final gate', () => {
    const value = input(); value.measuredMaterializedDatabaseBytes = 200 * 1024 * 1024;
    const report = assertUbsSemanticCapacity(value);
    expect(report.projectionKind).toBe('measured_materialized_database');
    expect(report.projectedDatabaseBytes).toBe(200 * 1024 * 1024);
  });

  it.each([
    ['planned database', (x: UbsSemanticCapacityInput) => { x.measuredMaterializedDatabaseBytes = UBS_SEMANTICS_DATABASE_CEILING_BYTES + 1; }, '350 MiB'],
    ['row', (x: UbsSemanticCapacityInput) => { x.tables[0].measuredRowBytes = [D1_MAX_ROW_BYTES + 1]; }, '2 MB row'],
    ['binds', (x: UbsSemanticCapacityInput) => { x.operations[0].bindCount = D1_MAX_BOUND_PARAMETERS + 1; }, '100-bound-parameter'],
    ['repository query statement', (x: UbsSemanticCapacityInput) => { x.operations[0].queryStatementBytes = D1_MAX_STATEMENT_BYTES + 1; }, 'repository query'],
    ['generated seed statement', (x: UbsSemanticCapacityInput) => {
      x.seedManifest.files[0].maxStatementBytes = D1_MAX_STATEMENT_BYTES + 1;
      x.seedManifest.files[0].bytes = D1_MAX_STATEMENT_BYTES + 1;
      x.seedManifest.maxStatementBytes = D1_MAX_STATEMENT_BYTES + 1;
    }, 'generated seed statement'],
    ['seed chunk', (x: UbsSemanticCapacityInput) => { x.seedManifest.files[0].bytes = D1_SEED_FILE_BYTES + 1; }, '8 MiB chunk'],
  ])('rejects a %s limit violation', (_label, mutate, message) => {
    const value = input(); mutate(value);
    expect(() => assertUbsSemanticCapacity(value)).toThrow(message);
  });

  it('represents boundary values as inclusive ceilings', () => {
    const value = input();
    value.measuredMaterializedDatabaseBytes = UBS_SEMANTICS_DATABASE_CEILING_BYTES;
    value.tables[0].measuredRowBytes = [D1_MAX_ROW_BYTES];
    value.operations[0] = { ...value.operations[0], bindCount: D1_MAX_BOUND_PARAMETERS, queryStatementBytes: D1_MAX_STATEMENT_BYTES };
    value.seedManifest.files[0].maxStatementBytes = D1_MAX_STATEMENT_BYTES;
    value.seedManifest.maxStatementBytes = D1_MAX_STATEMENT_BYTES;
    value.seedManifest.files[0].bytes = D1_SEED_FILE_BYTES;
    expect(assertUbsSemanticCapacity(value).withinPlannedDatabaseCeiling).toBe(true);
  });

  it('fails closed on missing samples and malformed measurements', () => {
    const missing = input(); missing.tables[0].measuredRowBytes = [];
    expect(() => assessUbsSemanticCapacity(missing)).toThrow('requires at least one measured row');
    const malformed = input(); malformed.operations[0].bindCount = -1;
    expect(() => assessUbsSemanticCapacity(malformed)).toThrow('positive safe integer');
  });

  it.each([
    ['table', (x: UbsSemanticCapacityInput) => { x.tables.pop(); }],
    ['operation', (x: UbsSemanticCapacityInput) => { x.operations.pop(); }],
    ['seed table', (x: UbsSemanticCapacityInput) => { x.seedManifest.files.pop(); }],
  ])('rejects an incomplete %s inventory', (label, mutate) => {
    const value = input(); mutate(value);
    expect(() => assessUbsSemanticCapacity(value)).toThrow(`Incomplete ${label} inventory`);
  });

  it.each([
    ['table', (x: UbsSemanticCapacityInput) => { x.tables.push({ ...x.tables[0] }); }],
    ['operation', (x: UbsSemanticCapacityInput) => { x.operations.push({ ...x.operations[0] }); }],
    ['seed file', (x: UbsSemanticCapacityInput) => { x.seedManifest.files.push({ ...x.seedManifest.files[0] }); }],
  ])('rejects duplicate %s inventory names', (label, mutate) => {
    const value = input(); mutate(value);
    expect(() => assessUbsSemanticCapacity(value)).toThrow(`Duplicate ${label} inventory item`);
  });

  it.each([
    ['table', (x: UbsSemanticCapacityInput) => { x.tables = []; }],
    ['operation', (x: UbsSemanticCapacityInput) => { x.operations = []; }],
    ['seed file', (x: UbsSemanticCapacityInput) => { x.seedManifest.files = []; }],
  ])('rejects an empty %s inventory', (label, mutate) => {
    const value = input(); mutate(value);
    expect(() => assessUbsSemanticCapacity(value)).toThrow(`${label} inventory must not be empty`);
  });

  it('accepts multiple generated chunks per table and rejects gaps or ad-hoc names', () => {
    const value = input();
    const table = UBS_SEMANTIC_TABLE_INVENTORY[0];
    value.seedManifest.files.splice(1, 0, {
      table, chunk: 2, name: `${table}-0002.sql`, bytes: 2048,
      statementCount: 2, maxStatementBytes: 300, sha256: 'a'.repeat(64),
    });
    value.seedManifest.totalStatementCount += 2;
    value.seedManifest.maxStatementBytes = 300;
    expect(() => assertUbsSemanticCapacity(value)).not.toThrow();
    value.seedManifest.files[1]!.chunk = 3;
    value.seedManifest.files[1]!.name = `${table}-0003.sql`;
    expect(() => assertUbsSemanticCapacity(value)).toThrow('contiguous and canonically numbered');
  });

  it('rejects a generated seed manifest whose table/chunk file order is nondeterministic', () => {
    const value = input();
    value.seedManifest.files.reverse();
    expect(() => assertUbsSemanticCapacity(value)).toThrow('deterministic table/chunk order');
  });

  it('requires generated seed statement aggregates and per-file hashes to be exact', () => {
    const aggregate = input(); aggregate.seedManifest.totalStatementCount++;
    expect(() => assessUbsSemanticCapacity(aggregate)).toThrow('aggregate statement measurements');
    const hash = input(); hash.seedManifest.files[0].sha256 = 'not-a-hash';
    expect(() => assessUbsSemanticCapacity(hash)).toThrow('lowercase SHA-256');
    const impossible = input(); impossible.seedManifest.files[0].maxStatementBytes = 1025;
    impossible.seedManifest.maxStatementBytes = 1025;
    expect(() => assessUbsSemanticCapacity(impossible)).toThrow('cannot exceed file bytes');
  });
});
