import { describe, expect, it } from 'vitest';
import { D1_EXPECTED_TABLES } from '../../../scripts/d1-corpus-identity.js';
import { D1_SEED_EXPORT_ORDER } from '../../../scripts/d1-seed-order.js';
import type { SeedManifest } from '../../../scripts/d1-seed-manifest.js';
import {
  applyPreviewD1Seed,
  parsePreviewD1SeedArguments,
  type PreviewD1SeedOptions,
} from '../../../scripts/apply-preview-d1-seed.js';

const options: PreviewD1SeedOptions = {
  remote: true,
  candidateD1Name: 'theologai-preview-candidate-123',
  confirmedCandidateD1Name: 'theologai-preview-candidate-123',
};

function manifest(): SeedManifest {
  const ftsOrdinal = String(D1_SEED_EXPORT_ORDER.length).padStart(2, '0');
  return {
    manifestVersion: 2,
    algorithm: 'sha256',
    sourceManifest: { path: 'data/data-manifest.json', sha256: 'a'.repeat(64) },
    d1Materialization: { identityVersion: 1, transformVersion: 1, sha256: 'b'.repeat(64) },
    migrations: [],
    limits: { maximumStatementBytes: 100_000, targetFileBytes: 8_388_608 },
    tableOrder: [...D1_SEED_EXPORT_ORDER],
    expectedCounts: Object.fromEntries(D1_EXPECTED_TABLES.map(table => [table, 0])),
    files: [
      {
        path: '00-empty-target-check-000.sql',
        table: 'empty-target-check',
        chunk: 0,
        sha256: 'c'.repeat(64),
        byteSize: 1,
        statementCount: 1,
        rowCount: 0,
      },
      {
        path: '01-theologai-metadata-000.sql',
        table: 'theologai_metadata',
        chunk: 0,
        sha256: 'd'.repeat(64),
        byteSize: 1,
        statementCount: 1,
        rowCount: 0,
      },
      {
        path: `${ftsOrdinal}-fts-000.sql`,
        table: 'fts',
        chunk: 0,
        sha256: 'e'.repeat(64),
        byteSize: 1,
        statementCount: 1,
        rowCount: 0,
      },
    ],
    totals: { fileCount: 3, byteSize: 3, statementCount: 3, rowCount: 0 },
  };
}

describe('preview D1 seed runner', () => {
  it('requires literal remote execution and an exact repeated candidate name', () => {
    expect(parsePreviewD1SeedArguments([
      '--remote',
      '--candidate-d1-name',
      options.candidateD1Name,
      '--confirm-candidate-d1-name',
      options.candidateD1Name,
    ])).toEqual(options);

    expect(() => parsePreviewD1SeedArguments([
      '--candidate-d1-name', options.candidateD1Name,
      '--confirm-candidate-d1-name', options.candidateD1Name,
    ])).toThrow('literal --remote');
    expect(() => parsePreviewD1SeedArguments([
      '--remote',
      '--candidate-d1-name', options.candidateD1Name,
      '--confirm-candidate-d1-name', 'another-preview-database',
    ])).toThrow('must match exactly');
    for (const forbidden of [
      ['--env', 'production'],
      ['--local'],
      ['--config', 'other-wrangler.toml'],
      ['--file', 'unreviewed.sql'],
      ['--command', 'SELECT 1'],
    ]) {
      expect(() => parsePreviewD1SeedArguments([
        '--remote',
        '--candidate-d1-name', options.candidateD1Name,
        '--confirm-candidate-d1-name', options.candidateD1Name,
        ...forbidden,
      ])).toThrow(`Unknown argument: ${forbidden[0]}`);
    }
  });

  it('validates before any executor call, then invokes pinned arguments once in manifest order', () => {
    const calls: string[][] = [];
    applyPreviewD1Seed(options, {
      root: '/reviewed-root',
      seedRoot: '/reviewed-root/scripts/d1-seed',
      loadManifest: () => manifest(),
      execute: args => {
        calls.push(args);
        return '';
      },
    });

    expect(calls).toEqual([
      [
        'd1', 'execute', options.candidateD1Name, '--remote', '--env', 'preview',
        '--config', '/reviewed-root/wrangler.toml',
        '--file', '/reviewed-root/scripts/d1-seed/00-empty-target-check-000.sql',
      ],
      [
        'd1', 'execute', options.candidateD1Name, '--remote', '--env', 'preview',
        '--config', '/reviewed-root/wrangler.toml',
        '--file', '/reviewed-root/scripts/d1-seed/01-theologai-metadata-000.sql',
      ],
      [
        'd1', 'execute', options.candidateD1Name, '--remote', '--env', 'preview',
        '--config', '/reviewed-root/wrangler.toml',
        '--file', `/reviewed-root/scripts/d1-seed/${String(D1_SEED_EXPORT_ORDER.length).padStart(2, '0')}-fts-000.sql`,
      ],
    ]);
  });

  it('refuses an invalid manifest before constructing or calling the executor', () => {
    let executed = false;
    let failure: unknown;
    try {
      applyPreviewD1Seed(options, {
        loadManifest: () => {
          throw Object.assign(new Error('bad manifest'), { stderr: 'D1_SEED_TOKEN=do-not-leak' });
        },
        execute: () => {
          executed = true;
          return '';
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('refused before any remote command');
    expect((failure as Error).message).toContain('[REDACTED]');
    expect((failure as Error).message).not.toContain('do-not-leak');
    expect(executed).toBe(false);
  });

  it('refuses an omitted nonzero table before calling the executor', () => {
    const incomplete = manifest();
    incomplete.expectedCounts.documents = 1;
    let executed = false;
    expect(() => applyPreviewD1Seed(options, {
      loadManifest: () => incomplete,
      execute: () => {
        executed = true;
        return '';
      },
    })).toThrow('row-count total for documents is 0; canonical expected count is 1');
    expect(executed).toBe(false);
  });

  it('stops at the first failed file with redacted diagnostics and no resume', () => {
    const calls: string[][] = [];
    let failure: unknown;
    try {
      applyPreviewD1Seed(options, {
        root: '/reviewed-root',
        seedRoot: '/reviewed-root/scripts/d1-seed',
        loadManifest: () => manifest(),
        execute: args => {
          calls.push(args);
          if (calls.length === 2) {
            throw Object.assign(new Error('Wrangler failed'), {
              stderr: 'Authorization: Bearer secret-token D1_SEED_TOKEN=also-secret',
            });
          }
          return '';
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/stopped at 01-theologai-metadata-000\.sql[\s\S]*abandon it/);
    expect((failure as Error).message).toContain('[REDACTED]');
    expect((failure as Error).message).not.toContain('secret-token');
    expect((failure as Error).message).not.toContain('also-secret');
    expect(calls).toHaveLength(2);
  });
});
