import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
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
import { stageAndPublishD1Seed } from '../../../scripts/export-for-d1.js';

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
    withSeedFixture(({ root, output, chunkPath }) => {
      expect(() => loadAndVerifyD1SeedManifest(root, output)).not.toThrow();
      writeFileSync(join(output, chunkPath), 'SELECT 2;\n');
      expect(() => loadAndVerifyD1SeedManifest(root, output)).toThrow('does not match its manifest');
    });
  });
});

function withSeedFixture(run: (value: {
  root: string;
  output: string;
  chunkPath: string;
  writeSeed: (directory: string, sql: string) => void;
}) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'theologai-seed-binding-'));
  try {
    const value = fixture();
    const schema = 'CREATE TABLE stable(id INTEGER);\n';
    value.source.materializations.d1.migrations[0].sha256 = createHash('sha256').update(schema).digest('hex');
    value.bytes = Buffer.from(JSON.stringify(value.source));
    value.seed.sourceManifest.sha256 = computeSourceInventoryIdentity(value.bytes);
    value.seed.d1Materialization.sha256 = computeD1CorpusIdentity(value.source);
    value.seed.migrations[0].sha256 = value.source.materializations.d1.migrations[0].sha256;
    mkdirSync(join(root, 'data'));
    mkdirSync(join(root, 'migrations'));
    writeFileSync(join(root, 'data', 'data-manifest.json'), value.bytes);
    writeFileSync(join(root, value.source.materializations.d1.migrations[0].path), schema);
    const output = join(root, 'scripts', 'd1-seed');
    mkdirSync(output, { recursive: true });
    const chunkPath = '00-empty-target-check-000.sql';

    function writeSeed(directory: string, sql: string) {
      const file = {
        path: chunkPath,
        table: 'empty-target-check',
        chunk: 0,
        sha256: createHash('sha256').update(sql).digest('hex'),
        byteSize: Buffer.byteLength(sql),
        statementCount: 1,
        rowCount: 0,
      };
      value.seed.files = [file];
      value.seed.totals = { fileCount: 1, byteSize: file.byteSize, statementCount: 1, rowCount: 0 };
      writeFileSync(join(directory, file.path), sql);
      writeFileSync(join(directory, 'seed-manifest.json'), `${JSON.stringify(value.seed)}\n`);
    }

    writeSeed(output, 'SELECT 1;\n');
    run({ root, output, chunkPath, writeSeed });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function directoryDigests(path: string): Record<string, string> {
  return Object.fromEntries(readdirSync(path).map(name => [
    name, createHash('sha256').update(readFileSync(join(path, name))).digest('hex'),
  ]));
}

describe('staged D1 seed publication', () => {
  it('refuses nonempty output without --clean before invoking the writer', () => {
    withSeedFixture(({ root, output }) => {
      const original = directoryDigests(output);
      expect(() => stageAndPublishD1Seed(root, output, false, () => {
        throw new Error('unexpected seed generation');
      })).toThrow('is not empty');
      expect(directoryDigests(output)).toEqual(original);
      expect(readdirSync(join(root, 'scripts'))).toEqual(['d1-seed']);
    });
  });

  it.each(['live', 'dangling'])('refuses a %s symlink as the output directory', kind => {
    withSeedFixture(({ root, output }) => {
      const link = join(root, 'scripts', 'output-link');
      const original = directoryDigests(output);
      symlinkSync(kind === 'live' ? output : join(root, 'missing'), link);
      expect(() => stageAndPublishD1Seed(root, link, true, () => {
        throw new Error('unexpected seed generation');
      })).toThrow('Refusing symlinked output directory');
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(directoryDigests(output)).toEqual(original);
    });
  });

  it.each([
    ['chunk', 'chunk write failed'],
    ['manifest', 'EISDIR'],
    ['same-size edit', 'does not match its manifest'],
    ['extra file', 'missing or unlisted files'],
  ])('preserves the old seed on a %s failure', (failure, message) => {
    withSeedFixture(({ root, output, chunkPath, writeSeed }) => {
      const original = directoryDigests(output);
      expect(() => stageAndPublishD1Seed(root, output, true, stage => {
        if (failure === 'chunk') {
          writeFileSync(join(stage, chunkPath), 'SELECT 2;\n');
          throw new Error(message);
        }
        if (failure === 'manifest') mkdirSync(join(stage, 'seed-manifest.json'));
        writeSeed(stage, 'SELECT 2;\n');
        if (failure === 'same-size edit') writeFileSync(join(stage, chunkPath), 'SELECT 3;\n');
        if (failure === 'extra file') writeFileSync(join(stage, 'unlisted.sql'), 'SELECT 3;\n');
      })).toThrow(message);
      expect(directoryDigests(output)).toEqual(original);
      expect(readdirSync(join(root, 'scripts'))).toEqual(['d1-seed']);
    });
  });

  it.each(['nonempty', 'empty', 'absent'])('installs exactly the verified generation over a %s destination', prior => {
    withSeedFixture(({ root, output, writeSeed }) => {
      if (prior === 'empty' || prior === 'absent') rmSync(output, { recursive: true });
      if (prior === 'empty') {
        mkdirSync(output);
        chmodSync(output, 0o750);
      }
      if (prior === 'nonempty') writeFileSync(join(output, 'old-only.txt'), 'previous generation');
      let expected: Record<string, string> | undefined;
      const verified = stageAndPublishD1Seed(root, output, prior === 'nonempty', stage => {
        writeSeed(stage, 'SELECT 2;\n');
        expected = directoryDigests(stage);
      });
      expect(verified).toEqual(loadAndVerifyD1SeedManifest(root, output));
      expect(directoryDigests(output)).toEqual(expected);
      expect(lstatSync(output).mode & 0o777).toBe(prior === 'empty' ? 0o750 : 0o777 & ~process.umask());
      expect(readdirSync(join(root, 'scripts'))).toEqual(['d1-seed']);
    });
  });

  it.each(['restored', 'recovery required', 'committed'])('reports installation outcome as %s with intact seed bytes', outcome => {
    withSeedFixture(({ root, output, writeSeed }) => {
      const original = directoryDigests(output);
      const parent = join(root, 'scripts');
      let stagePath: string | undefined;
      let expected: Record<string, string> | undefined;
      const publish = () => stageAndPublishD1Seed(root, output, true, stage => {
        writeSeed(stage, 'SELECT 2;\n');
        stagePath = stage;
        expected = directoryDigests(stage);
      }, {
        rename(source, destination) {
          if (source === stagePath && outcome !== 'committed') throw new Error('install failed');
          if (destination === output && outcome === 'recovery required') throw new Error('restore failed');
          renameSync(source, destination);
        },
        remove(path, options) {
          if (outcome === 'committed') throw new Error('transaction cleanup failed');
          rmSync(path, options);
        },
      });

      if (outcome === 'restored') {
        expect(publish).toThrow('install failed');
        expect(directoryDigests(output)).toEqual(original);
        expect(readdirSync(parent)).toEqual(['d1-seed']);
      } else {
        expect(publish).toThrow(outcome === 'committed'
          ? /Publication committed.*transaction cleanup failed/
          : /Publication failed.*install failed.*Recovery required.*restore failed/);
        const backup = readdirSync(parent).find(name => name.startsWith('.d1-seed-transaction-'))!;
        expect(directoryDigests(join(parent, backup, 'previous'))).toEqual(original);
        if (outcome === 'committed') expect(directoryDigests(output)).toEqual(expected);
        else expect(existsSync(output)).toBe(false);
      }
      expect(stagePath).toBeDefined();
      expect(existsSync(stagePath!)).toBe(false);
    });
  });
});
