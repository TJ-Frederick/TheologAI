import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, normalize, sep } from 'node:path';

export interface DataManifestFile {
  path: string;
  sha256: string;
}

export interface D1MaterializationManifest {
  identityVersion: number;
  transformVersion: number;
  migrations: DataManifestFile[];
  inputs: string[];
}

export interface DataManifest {
  manifestVersion: number;
  schemaVersion: string;
  algorithm: 'sha256';
  files: DataManifestFile[];
  expectedCounts: Record<string, number>;
  materializations: {
    d1: D1MaterializationManifest;
  };
}

export interface D1CorpusIdentityProjection {
  identityVersion: number;
  transformVersion: number;
  schemaVersion: string;
  migrations: DataManifestFile[];
  inputs: DataManifestFile[];
  expectedCounts: Array<{ table: string; count: number }>;
}

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_PATH = /^(?:data|src)\/[A-Za-z0-9._/-]+$/;
const SAFE_SCHEMA_PATH = /^migrations\/[a-z0-9_]+\.sql$/;
const SAFE_SCHEMA_VERSION = /^[a-z0-9_]+$/;
const SAFE_TABLE = /^[a-z_]+$/;
export const D1_EXPECTED_TABLES = Object.freeze([
  'cross_references',
  'document_sections',
  'documents',
  'historical_document_delivery_profiles',
  'historical_edition_sections',
  'historical_edition_sections_fts',
  'historical_editions',
  'historical_section_aliases',
  'historical_section_identities',
  'historical_source_artifacts',
  'historical_source_packs',
  'historical_works',
  'morph_codes',
  'morphology',
  'sections_fts',
  'stepbible_lexicons',
  'strongs',
  'strongs_book_stats',
  'strongs_form_stats',
  'strongs_fts',
  'strongs_usage_stats',
  'theologai_metadata',
  'ubs_parallel_groups',
  'ubs_parallel_members',
  'ubs_parallel_segments',
  'ubs_parallel_sources',
  'ubs_semantic_artifacts',
  'ubs_semantic_domains',
  'ubs_semantic_entries',
  'ubs_semantic_entry_identities',
  'ubs_semantic_normalized_coordinates',
  'ubs_semantic_reference_evidence',
  'ubs_semantic_sense_domains',
  'ubs_semantic_senses',
  'ubs_semantic_sources',
] as const);

export function parseDataManifest(bytes: Buffer | string): DataManifest {
  const manifest = JSON.parse(bytes.toString()) as DataManifest;
  validateDataManifest(manifest);
  return manifest;
}

export function validateDataManifest(manifest: DataManifest): void {
  if (manifest.manifestVersion !== 2 || manifest.algorithm !== 'sha256') {
    throw new Error('Unsupported data manifest format');
  }
  if (!SAFE_SCHEMA_VERSION.test(manifest.schemaVersion)) throw new Error('Invalid schema version');
  const files = new Map<string, DataManifestFile>();
  for (const file of manifest.files) {
    if (!isSafeRelativePath(file.path) || !SHA256.test(file.sha256)) {
      throw new Error(`Invalid manifest file entry: ${file.path}`);
    }
    if (files.has(file.path)) throw new Error(`Duplicate manifest path: ${file.path}`);
    files.set(file.path, file);
  }

  const d1 = manifest.materializations?.d1;
  if (!d1 || !Number.isSafeInteger(d1.identityVersion) || d1.identityVersion < 1
    || !Number.isSafeInteger(d1.transformVersion) || d1.transformVersion < 1) {
    throw new Error('Invalid D1 materialization version');
  }
  const expectedSchemaPath = `migrations/${manifest.schemaVersion}.sql`;
  if (!Array.isArray(d1.migrations) || d1.migrations.length === 0
    || d1.migrations.at(-1)?.path !== expectedSchemaPath) {
    throw new Error(`Invalid D1 migration set: expected latest ${expectedSchemaPath}`);
  }
  const migrationPaths = new Set<string>();
  for (const [index, migration] of d1.migrations.entries()) {
    if (!SAFE_SCHEMA_PATH.test(migration.path) || !SHA256.test(migration.sha256)
      || migrationPaths.has(migration.path)
      || !migration.path.startsWith(`migrations/${String(index + 1).padStart(4, '0')}_`)) {
      throw new Error(`Invalid ordered D1 migration at position ${index + 1}`);
    }
    migrationPaths.add(migration.path);
  }
  const inputs = new Set<string>();
  for (const path of d1.inputs) {
    if (inputs.has(path)) throw new Error(`Duplicate D1 materialization input: ${path}`);
    if (!files.has(path)) throw new Error(`Unknown D1 materialization input: ${path}`);
    inputs.add(path);
  }
  if (inputs.size === 0) throw new Error('D1 materialization inputs must not be empty');

  const actualTables = Object.keys(manifest.expectedCounts).sort();
  if (JSON.stringify(actualTables) !== JSON.stringify(D1_EXPECTED_TABLES)) {
    const missing = D1_EXPECTED_TABLES.filter(table => !actualTables.includes(table));
    const extra = actualTables.filter(table => !D1_EXPECTED_TABLES.includes(table as typeof D1_EXPECTED_TABLES[number]));
    throw new Error(`D1 expectedCounts registry mismatch; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`);
  }
  for (const [table, count] of Object.entries(manifest.expectedCounts)) {
    if (!SAFE_TABLE.test(table) || !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Invalid expected D1 count: ${table}=${count}`);
    }
  }
}

export function buildD1CorpusIdentityProjection(manifest: DataManifest): D1CorpusIdentityProjection {
  validateDataManifest(manifest);
  const files = new Map(manifest.files.map(file => [file.path, file]));
  return {
    identityVersion: manifest.materializations.d1.identityVersion,
    transformVersion: manifest.materializations.d1.transformVersion,
    schemaVersion: manifest.schemaVersion,
    migrations: manifest.materializations.d1.migrations.map(migration => ({ ...migration })),
    inputs: [...manifest.materializations.d1.inputs]
      .sort()
      .map(path => ({ path, sha256: files.get(path)!.sha256 })),
    expectedCounts: Object.entries(manifest.expectedCounts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([table, count]) => ({ table, count })),
  };
}

export function computeD1CorpusIdentity(manifest: DataManifest): string {
  return createHash('sha256')
    .update(JSON.stringify(buildD1CorpusIdentityProjection(manifest)))
    .digest('hex');
}

export function computeSourceInventoryIdentity(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyD1Migrations(root: string, manifest: DataManifest): Buffer[] {
  validateDataManifest(manifest);
  return manifest.materializations.d1.migrations.map(migration => {
    const bytes = readFileSync(join(root, migration.path));
    const actualSha256 = createHash('sha256').update(bytes).digest('hex');
    if (actualSha256 !== migration.sha256) {
      throw new Error(`D1 migration checksum mismatch for ${migration.path}: expected ${migration.sha256}, received ${actualSha256}`);
    }
    return bytes;
  });
}

/** Verify one manifest-declared canonical input without widening its scope. */
export function verifyManifestFileChecksum(root: string, file: DataManifestFile): void {
  const bytes = readFileSync(join(root, file.path));
  const actualSha256 = createHash('sha256').update(bytes).digest('hex');
  if (actualSha256 !== file.sha256) {
    throw new Error(`Manifest checksum mismatch for ${file.path}: expected ${file.sha256}, received ${actualSha256}`);
  }
}

export class D1SourceConsumptionRegistry {
  private readonly declared: Map<string, string>;
  private readonly consumed = new Set<string>();

  constructor(
    private readonly root: string,
    manifest: DataManifest,
  ) {
    validateDataManifest(manifest);
    const files = new Map(manifest.files.map(file => [file.path, file.sha256]));
    this.declared = new Map(manifest.materializations.d1.inputs.map(path => [path, files.get(path)!]));
  }

  read(path: string): Buffer;
  read(path: string, encoding: BufferEncoding): string;
  read(path: string, encoding?: BufferEncoding): Buffer | string {
    const expectedSha256 = this.declared.get(path);
    if (!expectedSha256) throw new Error(`Undeclared D1 source read: ${path}`);
    const absolute = join(this.root, path);
    const bytes = readFileSync(absolute);
    const actualSha256 = createHash('sha256').update(bytes).digest('hex');
    if (actualSha256 !== expectedSha256) {
      throw new Error(`D1 source checksum mismatch for ${path}: expected ${expectedSha256}, received ${actualSha256}`);
    }
    this.consumed.add(path);
    return encoding ? bytes.toString(encoding) : bytes;
  }

  assertAllConsumed(): void {
    const unused = [...this.declared.keys()].filter(path => !this.consumed.has(path)).sort();
    if (unused.length > 0) throw new Error(`Declared D1 inputs were not consumed: ${unused.join(', ')}`);
  }
}

function isSafeRelativePath(path: string): boolean {
  if (!SAFE_PATH.test(path) || isAbsolute(path) || path.includes('\\')) return false;
  const normalized = normalize(path);
  return normalized === path && !normalized.split(sep).includes('..');
}
