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
  schema: DataManifestFile;
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
  schema: DataManifestFile;
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
  'morph_codes',
  'morphology',
  'sections_fts',
  'stepbible_lexicons',
  'strongs',
  'strongs_fts',
  'theologai_metadata',
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
  if (!d1.schema || d1.schema.path !== expectedSchemaPath
    || !SAFE_SCHEMA_PATH.test(d1.schema.path) || !SHA256.test(d1.schema.sha256)) {
    throw new Error(`Invalid D1 materialization schema: expected ${expectedSchemaPath}`);
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
    schema: { ...manifest.materializations.d1.schema },
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

export function verifyD1Schema(root: string, manifest: DataManifest): Buffer {
  validateDataManifest(manifest);
  const schema = manifest.materializations.d1.schema;
  const bytes = readFileSync(join(root, schema.path));
  const actualSha256 = createHash('sha256').update(bytes).digest('hex');
  if (actualSha256 !== schema.sha256) {
    throw new Error(`D1 schema checksum mismatch for ${schema.path}: expected ${schema.sha256}, received ${actualSha256}`);
  }
  return bytes;
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
