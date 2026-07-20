import { D1_MAX_STATEMENT_BYTES, D1_SEED_FILE_BYTES } from '../d1-seed-utils.js';

/** Project gate: intentionally much lower than Cloudflare's platform maximum. */
export const UBS_SEMANTICS_DATABASE_CEILING_BYTES = 350 * 1024 * 1024;
export const D1_MAX_ROW_BYTES = 2_000_000;
export const D1_MAX_BOUND_PARAMETERS = 100;

export const UBS_SEMANTIC_TABLE_INVENTORY = Object.freeze([
  'ubs_semantic_artifacts',
  'ubs_semantic_sources',
  'ubs_semantic_domains',
  'ubs_semantic_entries',
  'ubs_semantic_entry_identities',
  'ubs_semantic_senses',
  'ubs_semantic_sense_domains',
  'ubs_semantic_reference_evidence',
  'ubs_semantic_normalized_coordinates',
] as const);

export const UBS_SEMANTIC_OPERATION_INVENTORY = Object.freeze([
  'aggregate_metadata_and_boundary',
  'aggregate_candidates',
  'aggregate_domains',
  'aggregate_references',
  'aggregate_sources',
] as const);

export const UBS_SEMANTIC_SEED_MANIFEST_SCHEMA = 'theologai-ubs-semantics-seed.v1' as const;

export interface UbsSemanticSeedManifestFile {
  table: typeof UBS_SEMANTIC_TABLE_INVENTORY[number];
  chunk: number;
  name: string;
  bytes: number;
  statementCount: number;
  maxStatementBytes: number;
  sha256: string;
}

export interface UbsSemanticSeedManifest {
  schemaVersion: typeof UBS_SEMANTIC_SEED_MANIFEST_SCHEMA;
  generated: true;
  totalStatementCount: number;
  maxStatementBytes: number;
  files: UbsSemanticSeedManifestFile[];
}

export interface UbsSemanticTableMeasurement {
  table: string;
  projectedRowCount: number;
  /** UTF-8 payload sizes from synthetic fixtures or an approved measured sample. */
  measuredRowBytes: number[];
}

export interface UbsSemanticOperationMeasurement {
  label: string;
  bindCount: number;
  queryStatementBytes: number;
}

export interface UbsSemanticCapacityInput {
  baselineDatabaseBytes: number;
  tables: UbsSemanticTableMeasurement[];
  operations: UbsSemanticOperationMeasurement[];
  seedManifest: UbsSemanticSeedManifest;
  /** Deterministic allowance for SQLite pages and indexes (10000 = 1x). */
  storageMultiplierBasisPoints: number;
  /** Prefer an actual post-materialization measurement when available. */
  measuredMaterializedDatabaseBytes?: number;
}

export interface UbsSemanticCapacityReport {
  projectedDatabaseBytes: number;
  projectionKind: 'measured_materialized_database' | 'sampled_projection';
  estimatedSemanticLayerBytes: number;
  largestMeasuredRowBytes: number;
  largestBindCount: number;
  largestQueryStatementBytes: number;
  largestSeedStatementBytes: number;
  largestSeedFileBytes: number;
  withinPlannedDatabaseCeiling: boolean;
}

export function assessUbsSemanticCapacity(input: UbsSemanticCapacityInput): UbsSemanticCapacityReport {
  nonNegativeInteger(input.baselineDatabaseBytes, 'baselineDatabaseBytes');
  positiveInteger(input.storageMultiplierBasisPoints, 'storageMultiplierBasisPoints');
  assertCompleteInventory('table', UBS_SEMANTIC_TABLE_INVENTORY, input.tables.map(table => table.table));
  assertCompleteInventory('operation', UBS_SEMANTIC_OPERATION_INVENTORY, input.operations.map(operation => operation.label));
  const seedFiles = validateSeedManifest(input.seedManifest);
  const estimatedSemanticLayerBytes = input.tables.reduce((total, table) => {
    if (!table.table.trim()) throw new Error('table name must not be empty');
    positiveInteger(table.projectedRowCount, `${table.table}.projectedRowCount`);
    if (table.measuredRowBytes.length === 0) throw new Error(`${table.table} requires at least one measured row`);
    table.measuredRowBytes.forEach((bytes, index) => positiveInteger(bytes, `${table.table}.measuredRowBytes[${index}]`));
    const sampleTotal = table.measuredRowBytes.reduce((sum, bytes) => sum + bytes, 0);
    const meanNumerator = sampleTotal * table.projectedRowCount * input.storageMultiplierBasisPoints;
    const meanDenominator = Math.max(1, table.measuredRowBytes.length) * 10_000;
    return total + Math.ceil(meanNumerator / meanDenominator);
  }, 0);
  for (const operation of input.operations) {
    if (!operation.label.trim()) throw new Error('operation label must not be empty');
    positiveInteger(operation.bindCount, `${operation.label}.bindCount`);
    positiveInteger(operation.queryStatementBytes, `${operation.label}.queryStatementBytes`);
  }
  const measured = input.measuredMaterializedDatabaseBytes;
  if (measured !== undefined) nonNegativeInteger(measured, 'measuredMaterializedDatabaseBytes');
  const projectedDatabaseBytes = measured ?? input.baselineDatabaseBytes + estimatedSemanticLayerBytes;
  return {
    projectedDatabaseBytes,
    projectionKind: measured === undefined ? 'sampled_projection' : 'measured_materialized_database',
    estimatedSemanticLayerBytes,
    largestMeasuredRowBytes: max(input.tables.flatMap(table => table.measuredRowBytes)),
    largestBindCount: max(input.operations.map(operation => operation.bindCount)),
    largestQueryStatementBytes: max(input.operations.map(operation => operation.queryStatementBytes)),
    largestSeedStatementBytes: input.seedManifest.maxStatementBytes,
    largestSeedFileBytes: max(seedFiles.map(file => file.bytes)),
    withinPlannedDatabaseCeiling: projectedDatabaseBytes <= UBS_SEMANTICS_DATABASE_CEILING_BYTES,
  };
}

function validateSeedManifest(manifest: UbsSemanticSeedManifest): UbsSemanticSeedManifestFile[] {
  if (manifest.schemaVersion !== UBS_SEMANTIC_SEED_MANIFEST_SCHEMA || manifest.generated !== true) {
    throw new Error('UBS semantic seed manifest must use the generated transform-7 schema');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('seed file inventory must not be empty');
  const names = manifest.files.map(file => file.name);
  const duplicates = names.filter((value, index) => names.indexOf(value) !== index);
  if (duplicates.length) throw new Error(`Duplicate seed file inventory item(s): ${[...new Set(duplicates)].sort().join(', ')}`);
  assertCompleteInventory('seed table', UBS_SEMANTIC_TABLE_INVENTORY, [...new Set(manifest.files.map(file => file.table))]);
  for (const table of UBS_SEMANTIC_TABLE_INVENTORY) {
    const files = manifest.files.filter(file => file.table === table).sort((left, right) => left.chunk - right.chunk);
    files.forEach((file, index) => {
      positiveInteger(file.chunk, `${file.name}.chunk`);
      positiveInteger(file.bytes, `${file.name}.bytes`);
      positiveInteger(file.statementCount, `${file.name}.statementCount`);
      positiveInteger(file.maxStatementBytes, `${file.name}.maxStatementBytes`);
      if (file.maxStatementBytes > file.bytes) throw new Error(`${file.name}.maxStatementBytes cannot exceed file bytes`);
      if (!/^[0-9a-f]{64}$/.test(file.sha256)) throw new Error(`${file.name}.sha256 must be a lowercase SHA-256`);
      const expectedChunk = index + 1;
      const expectedName = `${table}-${String(expectedChunk).padStart(4, '0')}.sql`;
      if (file.chunk !== expectedChunk || file.name !== expectedName) {
        throw new Error(`Seed chunks for ${table} must be contiguous and canonically numbered from ${table}-0001.sql`);
      }
    });
  }
  const canonicalNames = [...manifest.files]
    .sort((left, right) => UBS_SEMANTIC_TABLE_INVENTORY.indexOf(left.table) - UBS_SEMANTIC_TABLE_INVENTORY.indexOf(right.table)
      || left.chunk - right.chunk)
    .map(file => file.name);
  if (JSON.stringify(names) !== JSON.stringify(canonicalNames)) {
    throw new Error('UBS semantic seed manifest files must use deterministic table/chunk order');
  }
  const totalStatementCount = manifest.files.reduce((total, file) => total + file.statementCount, 0);
  const maxStatementBytes = max(manifest.files.map(file => file.maxStatementBytes));
  positiveInteger(manifest.totalStatementCount, 'seedManifest.totalStatementCount');
  positiveInteger(manifest.maxStatementBytes, 'seedManifest.maxStatementBytes');
  if (!Number.isSafeInteger(totalStatementCount)) throw new Error('UBS semantic seed manifest statement count exceeds safe integer range');
  if (manifest.totalStatementCount !== totalStatementCount || manifest.maxStatementBytes !== maxStatementBytes) {
    throw new Error('UBS semantic seed manifest aggregate statement measurements do not match its files');
  }
  return manifest.files;
}

export function assertUbsSemanticCapacity(input: UbsSemanticCapacityInput): UbsSemanticCapacityReport {
  const report = assessUbsSemanticCapacity(input);
  if (report.largestMeasuredRowBytes > D1_MAX_ROW_BYTES) {
    throw new Error(`Measured semantic row exceeds the D1 2 MB row limit: ${report.largestMeasuredRowBytes} bytes`);
  }
  if (report.largestBindCount > D1_MAX_BOUND_PARAMETERS) {
    throw new Error(`Semantic operation exceeds the D1 100-bound-parameter limit: ${report.largestBindCount}`);
  }
  if (report.largestQueryStatementBytes > D1_MAX_STATEMENT_BYTES) {
    throw new Error(`Semantic repository query exceeds the D1 100 KB statement limit: ${report.largestQueryStatementBytes} bytes`);
  }
  if (report.largestSeedStatementBytes > D1_MAX_STATEMENT_BYTES) {
    throw new Error(`Semantic generated seed statement exceeds the D1 100 KB statement limit: ${report.largestSeedStatementBytes} bytes`);
  }
  if (report.largestSeedFileBytes > D1_SEED_FILE_BYTES) {
    throw new Error(`Semantic seed file exceeds the project 8 MiB chunk limit: ${report.largestSeedFileBytes} bytes`);
  }
  if (report.projectedDatabaseBytes > UBS_SEMANTICS_DATABASE_CEILING_BYTES) {
    throw new Error(`Projected D1 database exceeds the planned 350 MiB ceiling: ${report.projectedDatabaseBytes} bytes`);
  }
  return report;
}

function max(values: number[]): number { return values.length ? Math.max(...values) : 0; }
function nonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
}
function positiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
}

function assertCompleteInventory(
  label: string,
  expected: readonly string[],
  actual: string[],
): void {
  if (actual.length === 0) throw new Error(`${label} inventory must not be empty`);
  const duplicates = actual.filter((value, index) => actual.indexOf(value) !== index);
  if (duplicates.length) throw new Error(`Duplicate ${label} inventory item(s): ${[...new Set(duplicates)].sort().join(', ')}`);
  const missing = expected.filter(value => !actual.includes(value));
  const unexpected = actual.filter(value => !expected.includes(value));
  if (missing.length || unexpected.length) {
    throw new Error(
      `Incomplete ${label} inventory; missing: ${missing.join(', ') || 'none'}; ` +
      `unexpected: ${unexpected.join(', ') || 'none'}`,
    );
  }
}
