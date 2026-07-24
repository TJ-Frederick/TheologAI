import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  D1_EXPECTED_TABLES,
  computeD1CorpusIdentity,
  computeSourceInventoryIdentity,
  type DataManifest,
} from '../../../scripts/d1-corpus-identity.js';
import {
  assertSeedManifestBinding,
  assertSeedManifestApplicationOrder,
  loadAndVerifyD1SeedManifest,
  type SeedManifest,
} from '../../../scripts/d1-seed-manifest.js';
import { D1_SEED_EXPORT_ORDER } from '../../../scripts/d1-seed-order.js';

const schemaSha = 'a'.repeat(64);

function source(): DataManifest {
  return {
    manifestVersion: 2,
    schemaVersion: '0001_initial_schema',
    algorithm: 'sha256',
    files: [{ path: 'data/source.json', sha256: 'b'.repeat(64) }],
    materializations: {
      d1: {
        identityVersion: 1,
        transformVersion: 1,
        migrations: [{ path: 'migrations/0001_initial_schema.sql', sha256: schemaSha }],
        inputs: ['data/source.json'],
      },
    },
    expectedCounts: Object.fromEntries(D1_EXPECTED_TABLES.map(table => [table, 0])),
  };
}

function fixture(): { source: DataManifest; bytes: Buffer; seed: SeedManifest } {
  const canonical = source();
  const bytes = Buffer.from(JSON.stringify(canonical));
  return {
    source: canonical,
    bytes,
    seed: {
      manifestVersion: 2,
      algorithm: 'sha256',
      sourceManifest: { path: 'data/data-manifest.json', sha256: computeSourceInventoryIdentity(bytes) },
      d1Materialization: {
        identityVersion: 1,
        transformVersion: 1,
        sha256: computeD1CorpusIdentity(canonical),
      },
      migrations: canonical.materializations.d1.migrations.map(migration => ({ ...migration })),
      limits: { maximumStatementBytes: 100_000, targetFileBytes: 8_388_608 },
      tableOrder: [...D1_SEED_EXPORT_ORDER],
      expectedCounts: { ...canonical.expectedCounts },
      files: [],
      totals: { fileCount: 0, byteSize: 0, statementCount: 0, rowCount: 0 },
    },
  };
}

describe('standalone D1 seed manifest binding', () => {
  it('accepts a seed bound to the current inventory, D1 identity, schema, and counts', () => {
    const value = fixture();
    expect(() => assertSeedManifestBinding(value.seed, value.bytes, value.source)).not.toThrow();
  });

  it('requires the exact canonical table order', () => {
    const value = fixture();
    value.seed.tableOrder = [...D1_SEED_EXPORT_ORDER].reverse();
    expect(() => assertSeedManifestBinding(value.seed, value.bytes, value.source))
      .toThrow('table order differs from the canonical export order');
  });

  it('requires the guard first and canonical contiguous table chunks', () => {
    const value = fixture();
    const ftsOrdinal = String(D1_SEED_EXPORT_ORDER.length).padStart(2, '0');
    value.seed.files = [
      {
        path: '00-empty-target-check-000.sql',
        table: 'empty-target-check',
        chunk: 0,
        sha256: 'a'.repeat(64),
        byteSize: 1,
        statementCount: 1,
        rowCount: 0,
      },
      {
        path: '01-theologai-metadata-000.sql',
        table: 'theologai_metadata',
        chunk: 0,
        sha256: 'b'.repeat(64),
        byteSize: 1,
        statementCount: 1,
        rowCount: 0,
      },
      {
        path: '01-theologai-metadata-001.sql',
        table: 'theologai_metadata',
        chunk: 1,
        sha256: 'c'.repeat(64),
        byteSize: 1,
        statementCount: 1,
        rowCount: 0,
      },
      {
        path: `${ftsOrdinal}-fts-000.sql`,
        table: 'fts',
        chunk: 0,
        sha256: 'd'.repeat(64),
        byteSize: 1,
        statementCount: 1,
        rowCount: 0,
      },
    ];
    expect(() => assertSeedManifestApplicationOrder(value.seed)).not.toThrow();

    value.seed.files[1].chunk = 2;
    expect(() => assertSeedManifestApplicationOrder(value.seed)).toThrow('chunks are not contiguous');
    value.seed.files[1].chunk = 0;
    value.seed.files[3] = { ...value.seed.files[3], path: '02-fts-000.sql' };
    expect(() => assertSeedManifestApplicationOrder(value.seed)).toThrow('file name is not canonical');
    value.seed.files[3] = { ...value.seed.files[3], path: `${ftsOrdinal}-fts-000.sql` };
    value.seed.files.push({ ...value.seed.files[0], path: '00-empty-target-check-001.sql', chunk: 1 });
    expect(() => assertSeedManifestApplicationOrder(value.seed)).toThrow('exactly one empty-target guard');
  });

  it('reconciles every seed-table row total, including the FTS projection', () => {
    const value = fixture();
    const documentsOrdinal = String(D1_SEED_EXPORT_ORDER.indexOf('documents') + 1).padStart(2, '0');
    const ftsOrdinal = String(D1_SEED_EXPORT_ORDER.length).padStart(2, '0');
    value.seed.expectedCounts.documents = 2;
    value.seed.expectedCounts.strongs_fts = 1;
    value.seed.expectedCounts.sections_fts = 2;
    value.seed.expectedCounts.historical_edition_sections_fts = 3;
    value.seed.files = [
      {
        path: '00-empty-target-check-000.sql',
        table: 'empty-target-check',
        chunk: 0,
        sha256: 'a'.repeat(64),
        byteSize: 1,
        statementCount: 1,
        rowCount: 0,
      },
      {
        path: `${documentsOrdinal}-documents-000.sql`,
        table: 'documents',
        chunk: 0,
        sha256: 'b'.repeat(64),
        byteSize: 1,
        statementCount: 1,
        rowCount: 2,
      },
      {
        path: `${documentsOrdinal}-documents-001.sql`,
        table: 'documents',
        chunk: 1,
        sha256: 'c'.repeat(64),
        byteSize: 1,
        statementCount: 1,
        rowCount: 0,
      },
      {
        path: `${ftsOrdinal}-fts-000.sql`,
        table: 'fts',
        chunk: 0,
        sha256: 'd'.repeat(64),
        byteSize: 1,
        statementCount: 1,
        rowCount: 6,
      },
    ];
    expect(() => assertSeedManifestApplicationOrder(value.seed)).not.toThrow();

    value.seed.files[2].rowCount = 2;
    expect(() => assertSeedManifestApplicationOrder(value.seed))
      .toThrow('row-count total for documents is 4; canonical expected count is 2');
    value.seed.files[2].rowCount = 0;
    value.seed.files[3].rowCount = 5;
    expect(() => assertSeedManifestApplicationOrder(value.seed))
      .toThrow('row-count total for fts is 5; canonical expected count is 6');
  });

  it.each([
    ['source inventory', (seed: SeedManifest) => { seed.sourceManifest.sha256 = createHash('sha256').update('stale').digest('hex'); }],
    ['D1 identity', (seed: SeedManifest) => { seed.d1Materialization.sha256 = 'c'.repeat(64); }],
    ['migration path', (seed: SeedManifest) => { seed.migrations[0].path = 'migrations/other.sql'; }],
    ['migration hash', (seed: SeedManifest) => { seed.migrations[0].sha256 = 'd'.repeat(64); }],
    ['expected counts', (seed: SeedManifest) => { seed.expectedCounts.strongs = 1; }],
  ] as const)('rejects stale standalone %s state', (_label, mutate) => {
    const value = fixture();
    mutate(value.seed);
    expect(() => assertSeedManifestBinding(value.seed, value.bytes, value.source)).toThrow();
  });

  it('independently verifies canonical schema, listed seed files, checksums, statements, and totals', () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-seed-binding-'));
    try {
      const value = fixture();
      const schema = 'CREATE TABLE stable(id INTEGER);\n';
      value.source.materializations.d1.migrations[0].sha256 = createHash('sha256').update(schema).digest('hex');
      value.bytes = Buffer.from(JSON.stringify(value.source));
      value.seed.sourceManifest.sha256 = computeSourceInventoryIdentity(value.bytes);
      value.seed.d1Materialization.sha256 = computeD1CorpusIdentity(value.source);
      value.seed.migrations[0].sha256 = value.source.materializations.d1.migrations[0].sha256;
      const sql = 'SELECT 1;\n';
      const file = {
        path: '00-empty-target-check-000.sql',
        table: 'empty-target-check',
        chunk: 0,
        sha256: createHash('sha256').update(sql).digest('hex'),
        byteSize: Buffer.byteLength(sql),
        statementCount: 1,
        rowCount: 0,
      };
      value.seed.files = [file];
      value.seed.totals = { fileCount: 1, byteSize: file.byteSize, statementCount: 1, rowCount: 0 };
      mkdirSync(join(root, 'data'), { recursive: true });
      mkdirSync(join(root, 'migrations'), { recursive: true });
      const seedRoot = join(root, 'scripts', 'd1-seed');
      mkdirSync(seedRoot, { recursive: true });
      writeFileSync(join(root, 'data', 'data-manifest.json'), value.bytes);
      writeFileSync(join(root, value.source.materializations.d1.migrations[0].path), schema);
      writeFileSync(join(seedRoot, 'seed-manifest.json'), `${JSON.stringify(value.seed)}\n`);
      writeFileSync(join(seedRoot, file.path), sql);
      expect(() => loadAndVerifyD1SeedManifest(root, seedRoot)).not.toThrow();
      writeFileSync(join(seedRoot, file.path), 'SELECT 2;\n');
      expect(() => loadAndVerifyD1SeedManifest(root, seedRoot)).toThrow('does not match its manifest');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
