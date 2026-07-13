import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  D1_EXPECTED_TABLES,
  D1SourceConsumptionRegistry,
  buildD1CorpusIdentityProjection,
  computeD1CorpusIdentity,
  parseDataManifest,
  verifyD1Migrations,
  type DataManifest,
} from '../../../scripts/d1-corpus-identity.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function manifest(): DataManifest {
  return {
    manifestVersion: 2,
    schemaVersion: '0001_initial_schema',
    algorithm: 'sha256',
    files: [
      { path: 'data/a.json', sha256: HASH_A },
      { path: 'src/data/non-d1.json', sha256: HASH_B },
    ],
    materializations: {
      d1: {
        identityVersion: 1,
        transformVersion: 1,
        migrations: [{ path: 'migrations/0001_initial_schema.sql', sha256: 'f'.repeat(64) }],
        inputs: ['data/a.json'],
      },
    },
    expectedCounts: Object.fromEntries(D1_EXPECTED_TABLES.map(table => [table, table === 'strongs' ? 2 : table === 'documents' ? 1 : 0])),
  };
}

describe('D1 corpus identity', () => {
  it('pins the usage-foundation D1 identity and includes the generated UBS artifact', () => {
    const current = parseDataManifest(readFileSync('data/data-manifest.json'));
    expect(computeD1CorpusIdentity(current))
      .toBe('93ae4ca3c09493cf02a6b48154c991c133fd6ce235119fc4b8cba0256a36f881');
    const changedUbs = structuredClone(current);
    const ubs = changedUbs.files.find(file => file.path === 'src/data/ubs-parallel-passages.generated.json');
    expect(ubs).toBeDefined();
    ubs!.sha256 = '0'.repeat(64);
    expect(computeD1CorpusIdentity(changedUbs)).not.toBe(computeD1CorpusIdentity(current));
    expect(current.materializations.d1.inputs).toContain('src/data/ubs-parallel-passages.generated.json');
    expect(current.materializations.d1.inputs).not.toContain('data/parallel-passages/ubs-paratext/ParallelPassages.xml');
  });

  it('is stable across non-D1 inventory/provenance and serialization changes', () => {
    const base = manifest();
    const changed = {
      ...manifest(),
      sources: { ubs: { title: 'changed provenance' } },
      files: [
        { path: 'src/data/another-non-d1.json', sha256: 'c'.repeat(64) },
        { path: 'src/data/non-d1.json', sha256: 'd'.repeat(64) },
        { path: 'data/a.json', sha256: HASH_A },
      ],
      expectedCounts: Object.fromEntries([...D1_EXPECTED_TABLES].reverse().map(table => [table, table === 'strongs' ? 2 : table === 'documents' ? 1 : 0])),
    } as DataManifest;
    expect(computeD1CorpusIdentity(changed)).toBe(computeD1CorpusIdentity(base));
    expect(computeD1CorpusIdentity(parseDataManifest(JSON.stringify(changed, null, 4))))
      .toBe(computeD1CorpusIdentity(base));
  });

  it.each([
    ['D1 checksum', (value: DataManifest) => { value.files[0].sha256 = 'e'.repeat(64); }],
    ['schema version', (value: DataManifest) => {
      value.schemaVersion = '0002_changed';
      value.materializations.d1.migrations.push({ path: 'migrations/0002_changed.sql', sha256: '1'.repeat(64) });
    }],
    ['migration bytes', (value: DataManifest) => { value.materializations.d1.migrations[0].sha256 = '1'.repeat(64); }],
    ['transform', (value: DataManifest) => { value.materializations.d1.transformVersion++; }],
    ['count', (value: DataManifest) => { value.expectedCounts.strongs++; }],
  ] as const)('changes when %s changes', (_label, mutate) => {
    const base = manifest();
    const changed = manifest();
    mutate(changed);
    expect(computeD1CorpusIdentity(changed)).not.toBe(computeD1CorpusIdentity(base));
  });

  it('uses a sorted canonical projection', () => {
    const value = manifest();
    value.files.unshift({ path: 'data/z.json', sha256: 'f'.repeat(64) });
    value.materializations.d1.inputs.unshift('data/z.json');
    expect(buildD1CorpusIdentityProjection(value).inputs.map(input => input.path))
      .toEqual(['data/a.json', 'data/z.json']);
    expect(buildD1CorpusIdentityProjection(value).expectedCounts.map(item => item.table))
      .toEqual([...D1_EXPECTED_TABLES]);
  });

  it('rejects duplicate, unknown, and unsafe inputs', () => {
    const duplicate = manifest();
    duplicate.materializations.d1.inputs.push('data/a.json');
    expect(() => computeD1CorpusIdentity(duplicate)).toThrow('Duplicate D1');

    const unknown = manifest();
    unknown.materializations.d1.inputs = ['data/missing.json'];
    expect(() => computeD1CorpusIdentity(unknown)).toThrow('Unknown D1');

    const unsafe = manifest();
    unsafe.files[0].path = 'data/../secret';
    unsafe.materializations.d1.inputs = ['data/../secret'];
    expect(() => computeD1CorpusIdentity(unsafe)).toThrow('Invalid manifest file');
  });

  it('rejects missing and extra expected-count tables', () => {
    const missing = manifest();
    delete missing.expectedCounts.strongs;
    expect(() => computeD1CorpusIdentity(missing)).toThrow('expectedCounts registry mismatch');
    const extra = manifest();
    extra.expectedCounts.unreviewed_table = 1;
    expect(() => computeD1CorpusIdentity(extra)).toThrow('expectedCounts registry mismatch');
  });

  it('rejects undeclared reads and declared-but-unused sources', () => {
    const registry = new D1SourceConsumptionRegistry(process.cwd(), manifest());
    expect(() => registry.read('src/data/non-d1.json')).toThrow('Undeclared D1 source read');
    expect(() => registry.assertAllConsumed()).toThrow('Declared D1 inputs were not consumed');
  });

  it('checks declared bytes at the point of D1 consumption', () => {
    const value = manifest();
    value.files = [{ path: 'src/data/parallel-passages.json', sha256: HASH_A }];
    value.materializations.d1.inputs = ['src/data/parallel-passages.json'];
    const registry = new D1SourceConsumptionRegistry(process.cwd(), value);
    expect(() => registry.read('src/data/parallel-passages.json')).toThrow('D1 source checksum mismatch');
  });

  it('rejects in-place migration-byte drift without a version/path change', () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-schema-identity-'));
    try {
      mkdirSync(join(root, 'migrations'));
      const schemaPath = join(root, 'migrations', '0001_initial_schema.sql');
      writeFileSync(schemaPath, 'CREATE TABLE stable(id INTEGER);\n');
      const value = manifest();
      value.materializations.d1.migrations[0].sha256 = '0891337a0d5cf35550ecd9272a630fe7c8d96586c9eafbf7c4e84644d1f46340';
      expect(() => verifyD1Migrations(root, value)).not.toThrow();
      writeFileSync(schemaPath, 'CREATE TABLE drifted(id INTEGER);\n');
      expect(() => verifyD1Migrations(root, value)).toThrow('D1 migration checksum mismatch');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
