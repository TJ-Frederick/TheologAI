import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { D1_EXPECTED_TABLES } from '../../../scripts/d1-corpus-identity.js';
import type { SeedManifest } from '../../../scripts/d1-seed-manifest.js';
import { D1_SEED_EXPORT_ORDER } from '../../../scripts/d1-seed-order.js';
import {
  createTemporaryPreviewCandidateConfig,
  parsePreviewD1CandidatePreparationArguments,
  parsePristineD1PreflightResult,
  parseUniqueD1Inventory,
  preparePreviewD1Candidate,
  PRISTINE_D1_PREFLIGHT_SQL,
  renderPreviewCandidateConfig,
  type PreviewD1CandidatePreparationOptions,
  type TemporaryCandidateConfig,
} from '../../../scripts/prepare-preview-d1-candidate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const candidate: PreviewD1CandidatePreparationOptions = {
  remote: true,
  candidateD1Name: 'theologai-preview-20260724-a',
  candidateD1Id: 'b6b24df3-f809-421f-b706-1d4a22e42141',
  confirmedCandidateD1Name: 'theologai-preview-20260724-a',
  confirmedCandidateD1Id: 'b6b24df3-f809-421f-b706-1d4a22e42141',
};

const PRISTINE_RESULT = JSON.stringify([{ success: true, results: [] }]);

function preflightResult(results: unknown[]): string {
  return JSON.stringify([{ success: true, results }]);
}

function commandResult(args: readonly string[], d1Inventory = inventory()): string {
  if (args[0] === 'd1' && args[1] === 'list') return d1Inventory;
  if (args.includes('--command')) return PRISTINE_RESULT;
  return '';
}

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
      { path: '00-empty-target-check-000.sql', table: 'empty-target-check', chunk: 0, sha256: 'c'.repeat(64), byteSize: 1, statementCount: 1, rowCount: 0 },
      { path: '01-theologai-metadata-000.sql', table: 'theologai_metadata', chunk: 0, sha256: 'd'.repeat(64), byteSize: 1, statementCount: 1, rowCount: 0 },
      { path: `${ftsOrdinal}-fts-000.sql`, table: 'fts', chunk: 0, sha256: 'e'.repeat(64), byteSize: 1, statementCount: 1, rowCount: 0 },
    ],
    totals: { fileCount: 3, byteSize: 3, statementCount: 3, rowCount: 0 },
  };
}

function inventory(entries: Array<{ name: string; uuid: string }> = [{
  name: candidate.candidateD1Name,
  uuid: candidate.candidateD1Id,
}]): string {
  return JSON.stringify(entries);
}

function temporaryConfig(): { config: TemporaryCandidateConfig; state: { checks: number; cleaned: boolean } } {
  const state = { checks: 0, cleaned: false };
  return {
    config: {
      path: '/private/tmp/theologai-candidate-test/wrangler.candidate.toml',
      assertIntact: () => { state.checks++; },
      cleanup: () => { state.cleaned = true; },
    },
    state,
  };
}

describe('preview D1 candidate preparation', () => {
  it('requires remote plus exact repeated candidate name and UUID, rejecting arbitrary command surfaces', () => {
    expect(parsePreviewD1CandidatePreparationArguments([
      '--remote', '--candidate-d1-name', candidate.candidateD1Name,
      '--candidate-d1-id', candidate.candidateD1Id,
      '--confirm-candidate-d1-name', candidate.candidateD1Name,
      '--confirm-candidate-d1-id', candidate.candidateD1Id,
    ])).toEqual(candidate);

    for (const rejected of [
      ['--candidate-d1-name', 'theologai-preview'],
      ['--candidate-d1-id', candidate.candidateD1Id.toUpperCase()],
      ['--confirm-candidate-d1-id', candidate.candidateD1Id.toUpperCase()],
      ['--confirm-candidate-d1-id', '00000000-0000-4000-8000-000000000000'],
      ['--config', 'wrangler.toml'],
      ['--env', 'production'],
      ['--deploy'],
      ['--delete'],
    ]) {
      expect(() => parsePreviewD1CandidatePreparationArguments([
        '--remote', '--candidate-d1-name', candidate.candidateD1Name,
        '--candidate-d1-id', candidate.candidateD1Id,
        '--confirm-candidate-d1-name', candidate.candidateD1Name,
        '--confirm-candidate-d1-id', candidate.candidateD1Id,
        ...rejected,
      ])).toThrow();
    }
  });

  it('requires one exact unique name/UUID inventory match', () => {
    expect(parseUniqueD1Inventory(inventory(), candidate)).toEqual({
      databaseName: candidate.candidateD1Name,
      databaseId: candidate.candidateD1Id,
    });
    expect(() => parseUniqueD1Inventory(inventory([
      { name: candidate.candidateD1Name, uuid: candidate.candidateD1Id },
      { name: candidate.candidateD1Name, uuid: 'a4c4938b-7800-4d68-9097-0df33c31fdc1' },
    ]), candidate)).toThrow('duplicate database names');
    expect(() => parseUniqueD1Inventory(inventory([{ name: candidate.candidateD1Name, uuid: 'a4c4938b-7800-4d68-9097-0df33c31fdc1' }]), candidate))
      .toThrow('does not resolve');
    expect(() => parseUniqueD1Inventory(inventory([{ name: candidate.candidateD1Name, uuid: candidate.candidateD1Id.toUpperCase() }]), candidate))
      .toThrow('invalid name or UUID');
  });

  it('accepts only zero rows or the exact one-row Cloudflare _cf_KV allowance', () => {
    expect(() => parsePristineD1PreflightResult(PRISTINE_RESULT)).not.toThrow();
    expect(() => parsePristineD1PreflightResult(preflightResult([
      { object_type: 'table', object_name: '_cf_KV', migration_state: 0 },
    ]))).not.toThrow();
  });

  it('rejects every _cf_KV variant, duplicate, extra row, migration row, and malformed preflight envelope', () => {
    for (const results of [
      [{ object_type: 'table', object_name: 'documents', migration_state: 0 }],
      [{ object_type: 'table', object_name: '_cf_kv', migration_state: 0 }],
      [{ object_type: 'table', object_name: '_CF_KV', migration_state: 0 }],
      [{ object_type: 'view', object_name: '_cf_KV', migration_state: 0 }],
      [{ object_type: 'table', object_name: '_cf_KV', migration_state: 1 }],
      [{ object_type: 'table', object_name: 'd1_migrations', migration_state: 1 }],
      [
        { object_type: 'table', object_name: '_cf_KV', migration_state: 0 },
        { object_type: 'table', object_name: '_cf_KV', migration_state: 0 },
      ],
      [
        { object_type: 'table', object_name: '_cf_KV', migration_state: 0 },
        { object_type: 'table', object_name: 'documents', migration_state: 0 },
      ],
    ]) {
      expect(() => parsePristineD1PreflightResult(preflightResult(results))).toThrow('not pristine');
    }
    expect(() => parsePristineD1PreflightResult(JSON.stringify([{ success: false, results: [] }]))).toThrow('did not succeed');
  });

  it('renders a non-deployable preview-only binding to the exact candidate and repository migrations', () => {
    const rendered = renderPreviewCandidateConfig({
      root: '/reviewed/root', candidateD1Name: candidate.candidateD1Name, candidateD1Id: candidate.candidateD1Id,
    });
    expect(rendered).toContain('main = "__candidate_preparation_must_not_deploy__.ts"');
    expect(rendered).toContain('workers_dev = false');
    expect(rendered).toContain('[env.preview]');
    expect(rendered).toContain(`database_name = "${candidate.candidateD1Name}"`);
    expect(rendered).toContain(`database_id = "${candidate.candidateD1Id}"`);
    expect(rendered).toContain(`migrations_dir = ${JSON.stringify(join('/reviewed/root', 'migrations'))}`);
    expect(rendered).not.toContain('routes');
  });

  it('uses the generated binding config for migration, each seed file, and readiness in one fail-stop sequence', () => {
    const calls: string[][] = [];
    const { config, state } = temporaryConfig();
    const readiness: Array<Record<string, unknown>> = [];
    preparePreviewD1Candidate(candidate, {
      root: ROOT,
      loadManifest: () => manifest(),
      createTemporaryConfig: () => config,
      execute: args => {
        calls.push(args);
        return commandResult(args);
      },
      runReadiness: input => { readiness.push(input); },
    });

    expect(calls[0]).toEqual(['d1', 'list', '--json']);
    expect(calls[1]).toEqual([
      'd1', 'execute', 'THEOLOGAI_DB', '--remote', '--env', 'preview', '--config', config.path,
      '--command', PRISTINE_D1_PREFLIGHT_SQL, '--json',
    ]);
    expect(calls[2]).toEqual([
      'd1', 'migrations', 'apply', 'THEOLOGAI_DB', '--remote', '--env', 'preview', '--config', config.path,
    ]);
    expect(calls.slice(3)).toHaveLength(3);
    for (const seedCall of calls.slice(3)) {
      expect(seedCall.slice(0, 6)).toEqual(['d1', 'execute', 'THEOLOGAI_DB', '--remote', '--env', 'preview']);
      expect(seedCall).toContain(config.path);
    }
    expect(readiness).toEqual([{
      database: 'THEOLOGAI_DB', env: 'preview', configPath: config.path, root: ROOT,
    }]);
    expect(state.checks).toBeGreaterThanOrEqual(5);
    expect(state.cleaned).toBe(true);
  });

  it('stops before config creation or SQL when inventory resolution is ambiguous', () => {
    let configCreated = false;
    let migrationIssued = false;
    expect(() => preparePreviewD1Candidate(candidate, {
      root: ROOT,
      loadManifest: () => manifest(),
      createTemporaryConfig: () => {
        configCreated = true;
        return temporaryConfig().config;
      },
      execute: args => {
        if (args[1] === 'list') return inventory([{ name: candidate.candidateD1Name, uuid: 'a4c4938b-7800-4d68-9097-0df33c31fdc1' }]);
        migrationIssued = true;
        return '';
      },
    })).toThrow(/refused before any mutating target SQL \(fresh D1 inventory resolution\)/);
    expect(configCreated).toBe(false);
    expect(migrationIssued).toBe(false);
  });

  it('stops after a migration failure without seed or readiness recovery', () => {
    const { config, state } = temporaryConfig();
    const calls: string[][] = [];
    let readinessCalled = false;
    expect(() => preparePreviewD1Candidate(candidate, {
      root: ROOT,
      loadManifest: () => manifest(),
      createTemporaryConfig: () => config,
      execute: args => {
        calls.push(args);
        if (args[1] === 'list') return inventory();
        if (args.includes('--command')) return PRISTINE_RESULT;
        throw new Error('migration failed');
      },
      runReadiness: () => { readinessCalled = true; },
    })).toThrow(/after target SQL may have begun during migration[\s\S]*Do not retry, resume, repair, bind, or deploy/);
    expect(calls).toHaveLength(3);
    expect(readinessCalled).toBe(false);
    expect(state.cleaned).toBe(true);
  });

  it('rejects populated or migration-state preflight responses before any migration command', () => {
    for (const response of [
      JSON.stringify([{ success: true, results: [{ object_type: 'table', object_name: 'documents', migration_state: 0 }] }]),
      JSON.stringify([{ success: true, results: [{ object_type: 'table', object_name: 'd1_migrations', migration_state: 1 }] }]),
    ]) {
      const { config, state } = temporaryConfig();
      const calls: string[][] = [];
      expect(() => preparePreviewD1Candidate(candidate, {
        root: ROOT,
        loadManifest: () => manifest(),
        createTemporaryConfig: () => config,
        execute: args => {
          calls.push(args);
          if (args[1] === 'list') return inventory();
          if (args.includes('--command')) return response;
          throw new Error('a migration command must not be issued');
        },
      })).toThrow(/refused before any mutating target SQL \(pristine target preflight\)[\s\S]*not pristine/);
      expect(calls).toHaveLength(2);
      expect(calls.some(call => call.includes('migrations'))).toBe(false);
      expect(state.cleaned).toBe(true);
    }
  });

  it('permits exactly one _cf_KV preflight row and still uses the generated binding for migration', () => {
    const { config, state } = temporaryConfig();
    const calls: string[][] = [];
    preparePreviewD1Candidate(candidate, {
      root: ROOT,
      loadManifest: () => manifest(),
      createTemporaryConfig: () => config,
      execute: args => {
        calls.push(args);
        if (args[1] === 'list') return inventory();
        if (args.includes('--command')) return preflightResult([
          { object_type: 'table', object_name: '_cf_KV', migration_state: 0 },
        ]);
        return '';
      },
      runReadiness: () => {},
    });
    expect(calls[2]).toEqual([
      'd1', 'migrations', 'apply', 'THEOLOGAI_DB', '--remote', '--env', 'preview', '--config', config.path,
    ]);
    expect(state.cleaned).toBe(true);
  });

  it('rejects _cf_KV plus any extra preflight row before migration', () => {
    const { config, state } = temporaryConfig();
    const calls: string[][] = [];
    expect(() => preparePreviewD1Candidate(candidate, {
      root: ROOT,
      loadManifest: () => manifest(),
      createTemporaryConfig: () => config,
      execute: args => {
        calls.push(args);
        if (args[1] === 'list') return inventory();
        if (args.includes('--command')) return preflightResult([
          { object_type: 'table', object_name: '_cf_KV', migration_state: 0 },
          { object_type: 'table', object_name: 'documents', migration_state: 0 },
        ]);
        throw new Error('a migration command must not be issued');
      },
    })).toThrow(/pristine target preflight[\s\S]*not pristine/);
    expect(calls).toHaveLength(2);
    expect(calls.some(call => call.includes('migrations'))).toBe(false);
    expect(state.cleaned).toBe(true);
  });

  it('cleans a created temporary config after its initial integrity assertion fails', () => {
    let cleanupCalls = 0;
    const config: TemporaryCandidateConfig = {
      path: '/private/tmp/theologai-candidate-test/wrangler.candidate.toml',
      assertIntact: () => { throw new Error('tampered config'); },
      cleanup: () => { cleanupCalls++; },
    };
    const calls: string[][] = [];
    expect(() => preparePreviewD1Candidate(candidate, {
      root: ROOT,
      loadManifest: () => manifest(),
      createTemporaryConfig: () => config,
      execute: args => {
        calls.push(args);
        return inventory();
      },
    })).toThrow(/refused before any mutating target SQL \(candidate-only config generation\)[\s\S]*tampered config/);
    expect(calls).toEqual([['d1', 'list', '--json']]);
    expect(cleanupCalls).toBe(1);
  });

  it('keeps a configuration-construction failure primary when its emergency cleanup also fails', () => {
    expect(() => createTemporaryPreviewCandidateConfig({
      root: ROOT,
      candidateD1Name: candidate.candidateD1Name,
      candidateD1Id: candidate.candidateD1Id,
    }, {
      mkdtemp: () => '/private/tmp/theologai-candidate-construction-test',
      chmod: () => {},
      write: () => { throw new Error('config write failed'); },
      read: () => { throw new Error('not reached'); },
      remove: () => { throw new Error('emergency cleanup failed'); },
    })).toThrow(/config write failed[\s\S]*Secondary temporary candidate-config cleanup failure[\s\S]*emergency cleanup failed/);
  });

  it('preserves a primary phase classification when temporary-config cleanup also fails', () => {
    const calls: string[][] = [];
    const config: TemporaryCandidateConfig = {
      path: '/private/tmp/theologai-candidate-test/wrangler.candidate.toml',
      assertIntact: () => {},
      cleanup: () => { throw new Error('cleanup failed'); },
    };
    expect(() => preparePreviewD1Candidate(candidate, {
      root: ROOT,
      loadManifest: () => manifest(),
      createTemporaryConfig: () => config,
      execute: args => {
        calls.push(args);
        if (args[1] === 'list') return inventory();
        if (args.includes('--command')) return PRISTINE_RESULT;
        throw new Error('migration failed');
      },
    })).toThrow(/after target SQL may have begun during migration[\s\S]*Secondary temporary candidate-config cleanup failure[\s\S]*cleanup failed/);
    expect(calls).toHaveLength(3);
  });

  it('stops after post-seed readiness failure and leaves no repair route', () => {
    const { config, state } = temporaryConfig();
    expect(() => preparePreviewD1Candidate(candidate, {
      root: ROOT,
      loadManifest: () => manifest(),
      createTemporaryConfig: () => config,
      execute: args => commandResult(args),
      runReadiness: () => { throw new Error('not ready'); },
    })).toThrow(/post-seed readiness failed[\s\S]*Do not bind or deploy/);
    expect(state.cleaned).toBe(true);
  });

  it('uses pinned Wrangler 4.107 locally to resolve the generated env.preview binding and absolute migrations directory', () => {
    const wrangler = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    const version = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'wrangler', 'package.json'), 'utf8')) as { version: string };
    expect(version.version).toBe('4.107.0');
    const config = createTemporaryPreviewCandidateConfig({
      root: ROOT,
      candidateD1Name: candidate.candidateD1Name,
      candidateD1Id: candidate.candidateD1Id,
    });
    const persistence = mkdtempSync(join(tmpdir(), 'theologai-candidate-wrangler-local-'));
    try {
      expect(existsSync(config.path)).toBe(true);
      execFileSync(process.execPath, [
        wrangler, 'd1', 'migrations', 'apply', 'THEOLOGAI_DB',
        '--local', '--env', 'preview', '--config', config.path, '--persist-to', persistence,
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
      const output = execFileSync(process.execPath, [
        wrangler, 'd1', 'execute', 'THEOLOGAI_DB',
        '--local', '--env', 'preview', '--config', config.path, '--persist-to', persistence,
        '--command', 'SELECT COUNT(*) AS migration_rows FROM d1_migrations;', '--json',
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
      expect(output).toContain('migration_rows');
    } finally {
      config.cleanup();
      rmSync(persistence, { recursive: true, force: true });
    }
    expect(existsSync(config.path)).toBe(false);
  });
});
