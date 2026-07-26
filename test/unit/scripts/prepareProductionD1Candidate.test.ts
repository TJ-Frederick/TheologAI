import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { D1_EXPECTED_TABLES } from '../../../scripts/d1-corpus-identity.js';
import type { SeedManifest } from '../../../scripts/d1-seed-manifest.js';
import { D1_SEED_EXPORT_ORDER } from '../../../scripts/d1-seed-order.js';
import {
  createTemporaryProductionCandidateConfig,
  parseProductionD1CandidatePreparationArguments,
  prepareProductionD1Candidate,
  renderProductionCandidateConfig,
  type ProductionD1CandidatePreparationOptions,
} from '../../../scripts/prepare-production-d1-candidate.js';
import { PRISTINE_D1_PREFLIGHT_SQL, type TemporaryCandidateConfig } from '../../../scripts/prepare-preview-d1-candidate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const candidate: ProductionD1CandidatePreparationOptions = {
  remote: true,
  candidateD1Name: 'theologai-production-20260725-a',
  candidateD1Id: '514dbda0-ba5b-4ac0-826b-0402d2ed825b',
  confirmedCandidateD1Name: 'theologai-production-20260725-a',
  confirmedCandidateD1Id: '514dbda0-ba5b-4ac0-826b-0402d2ed825b',
};

function manifest(): SeedManifest {
  const ftsOrdinal = String(D1_SEED_EXPORT_ORDER.length).padStart(2, '0');
  return {
    manifestVersion: 2, algorithm: 'sha256',
    sourceManifest: { path: 'data/data-manifest.json', sha256: 'a'.repeat(64) },
    d1Materialization: { identityVersion: 1, transformVersion: 1, sha256: 'b'.repeat(64) },
    migrations: [], limits: { maximumStatementBytes: 100_000, targetFileBytes: 8_388_608 },
    tableOrder: [...D1_SEED_EXPORT_ORDER], expectedCounts: Object.fromEntries(D1_EXPECTED_TABLES.map(table => [table, 0])),
    files: [
      { path: '00-empty-target-check-000.sql', table: 'empty-target-check', chunk: 0, sha256: 'c'.repeat(64), byteSize: 1, statementCount: 1, rowCount: 0 },
      { path: '01-theologai-metadata-000.sql', table: 'theologai_metadata', chunk: 0, sha256: 'd'.repeat(64), byteSize: 1, statementCount: 1, rowCount: 0 },
      { path: `${ftsOrdinal}-fts-000.sql`, table: 'fts', chunk: 0, sha256: 'e'.repeat(64), byteSize: 1, statementCount: 1, rowCount: 0 },
    ], totals: { fileCount: 3, byteSize: 3, statementCount: 3, rowCount: 0 },
  };
}

function temporaryConfig(): { config: TemporaryCandidateConfig; state: { checks: number; cleaned: boolean } } {
  const state = { checks: 0, cleaned: false };
  return { config: {
    path: '/private/tmp/theologai-production-candidate-test/wrangler.candidate.toml',
    assertIntact: () => { state.checks++; }, cleanup: () => { state.cleaned = true; },
  }, state };
}

const fixedNow = (): Date => new Date('2026-07-25T12:00:00.000Z');

function inventory(createdAt = '2026-07-25T11:00:00.000Z', name = candidate.candidateD1Name): string {
  return JSON.stringify([{ name, uuid: candidate.candidateD1Id, created_at: createdAt }]);
}

describe('production D1 candidate preparation', () => {
  it('requires exact repeated production name/UUID and rejects arbitrary environment or deploy surfaces', () => {
    expect(parseProductionD1CandidatePreparationArguments([
      '--remote', '--candidate-d1-name', candidate.candidateD1Name, '--candidate-d1-id', candidate.candidateD1Id,
      '--confirm-candidate-d1-name', candidate.candidateD1Name, '--confirm-candidate-d1-id', candidate.candidateD1Id,
    ])).toEqual(candidate);
    for (const rejected of [['--env', 'preview'], ['--config', 'wrangler.toml'], ['--deploy'], ['--delete'],
      ['--candidate-d1-name', 'theologai-production'], ['--candidate-d1-name', 'theologai-production-20260230-a'],
      ['--candidate-d1-id', candidate.candidateD1Id.toUpperCase()]]) {
      expect(() => parseProductionD1CandidatePreparationArguments([
        '--remote', '--candidate-d1-name', candidate.candidateD1Name, '--candidate-d1-id', candidate.candidateD1Id,
        '--confirm-candidate-d1-name', candidate.candidateD1Name, '--confirm-candidate-d1-id', candidate.candidateD1Id,
        ...rejected,
      ])).toThrow();
    }
  });

  it('renders a no-deploy root production binding and does not expose routes or environments', () => {
    const rendered = renderProductionCandidateConfig({ root: '/reviewed/root', candidateD1Name: candidate.candidateD1Name, candidateD1Id: candidate.candidateD1Id });
    expect(rendered).toContain('main = "__candidate_preparation_must_not_deploy__.ts"');
    expect(rendered).toContain('workers_dev = false');
    expect(rendered).toContain(`database_name = "${candidate.candidateD1Name}"`);
    expect(rendered).toContain(`database_id = "${candidate.candidateD1Id}"`);
    expect(rendered).not.toContain('[env.');
    expect(rendered).not.toContain('routes');
  });

  it('uses an exact inventory, one migration, every manifest file once, then Transform-8/9 readiness', () => {
    const { config, state } = temporaryConfig();
    const calls: string[][] = [];
    const readiness: Array<Record<string, unknown>> = [];
    prepareProductionD1Candidate(candidate, {
      root: ROOT, loadManifest: () => manifest(), createTemporaryConfig: () => config,
      execute: args => { calls.push(args); return args[1] === 'list' ? inventory() : args.includes('--command') ? JSON.stringify([{ success: true, results: [] }]) : ''; },
      runReadiness: input => { readiness.push(input); },
      now: fixedNow,
    });
    expect(calls[0]).toEqual(['d1', 'list', '--json']);
    expect(calls[1]).toEqual(['d1', 'execute', 'THEOLOGAI_DB', '--remote', '--config', config.path, '--command', PRISTINE_D1_PREFLIGHT_SQL, '--json']);
    expect(calls[2]).toEqual(['d1', 'migrations', 'apply', 'THEOLOGAI_DB', '--remote', '--config', config.path]);
    expect(calls.slice(3)).toHaveLength(3);
    expect(calls.slice(3).map(call => call.at(-1))).toEqual([
      `${ROOT}/scripts/d1-seed/00-empty-target-check-000.sql`,
      `${ROOT}/scripts/d1-seed/01-theologai-metadata-000.sql`,
      `${ROOT}/scripts/d1-seed/${String(D1_SEED_EXPORT_ORDER.length).padStart(2, '0')}-fts-000.sql`,
    ]);
    expect(readiness).toEqual([{ database: 'THEOLOGAI_DB', configPath: config.path, root: ROOT }]);
    expect(state.checks).toBeGreaterThanOrEqual(6);
    expect(state.cleaned).toBe(true);
  });

  it('does not create a config or issue SQL if the inventory is not the exact pair', () => {
    let configCreated = false;
    expect(() => prepareProductionD1Candidate(candidate, {
      root: ROOT, loadManifest: () => manifest(), createTemporaryConfig: () => { configCreated = true; return temporaryConfig().config; },
      execute: args => args[1] === 'list' ? JSON.stringify([{ name: candidate.candidateD1Name, uuid: 'a4c4938b-7800-4d68-9097-0df33c31fdc1', created_at: '2026-07-25T11:00:00.000Z' }]) : '',
      now: fixedNow,
    })).toThrow(/before target SQL may begin/);
    expect(configCreated).toBe(false);
  });

  it('stops permanently after migration or a seed failure and never reaches readiness', () => {
    for (const failAt of ['migration', 'seed'] as const) {
      const { config, state } = temporaryConfig();
      const calls: string[][] = [];
      let readiness = false;
      expect(() => prepareProductionD1Candidate(candidate, {
        root: ROOT, loadManifest: () => manifest(), createTemporaryConfig: () => config,
        execute: args => {
          calls.push(args);
          if (args[1] === 'list') return inventory();
          if (args.includes('--command')) return JSON.stringify([{ success: true, results: [] }]);
          if (failAt === 'migration' ? args[1] === 'migrations' : args[1] === 'execute' && args.includes('--file')) throw new Error('simulated failure');
          return '';
        }, runReadiness: () => { readiness = true; },
        now: fixedNow,
      })).toThrow(/Do not retry, resume, repair, bind, deploy, or reuse/);
      expect(readiness).toBe(false);
      expect(state.cleaned).toBe(true);
      if (failAt === 'migration') expect(calls).toHaveLength(3);
    }
  });

  it('retains the original failure when temporary config creation cannot clean itself up', () => {
    expect(() => createTemporaryProductionCandidateConfig({ root: ROOT, candidateD1Name: candidate.candidateD1Name, candidateD1Id: candidate.candidateD1Id }, {
      mkdtemp: () => '/private/tmp/theologai-production-candidate-construction-test', chmod: () => {},
      write: () => { throw new Error('config write failed'); }, read: () => { throw new Error('not reached'); },
      remove: () => { throw new Error('cleanup failed'); },
    })).toThrow(/config write failed[\s\S]*cleanup failed/);
  });

  it('preserves a failed migration classification when temporary config cleanup also fails', () => {
    const config: TemporaryCandidateConfig = {
      path: '/private/tmp/theologai-production-candidate-test/wrangler.candidate.toml',
      assertIntact: () => {}, cleanup: () => { throw new Error('cleanup failed'); },
    };
    expect(() => prepareProductionD1Candidate(candidate, {
      root: ROOT, loadManifest: () => manifest(), createTemporaryConfig: () => config,
      execute: args => {
        if (args[1] === 'list') return inventory();
        if (args.includes('--command')) return JSON.stringify([{ success: true, results: [] }]);
        throw new Error('migration failed');
      },
      now: fixedNow,
    })).toThrow(/during migration[\s\S]*Secondary temporary candidate-config cleanup failure[\s\S]*cleanup failed/);
  });

  it('refuses stale, future, or date-mismatched inventory entries before it creates a config or issues target SQL', () => {
    const cases = [
      { name: 'stale', text: inventory('2026-07-23T11:00:00.000Z'), message: /older than the 36-hour/ },
      { name: 'future', text: inventory('2026-07-25T12:06:00.000Z'), message: /too far in the future/ },
      { name: 'mismatched candidate date', text: inventory('2026-07-25T11:00:00.000Z', 'theologai-production-20260720-a'), message: /name date is not within one UTC day/ },
    ];
    for (const testCase of cases) {
      let configCreated = false;
      const options = testCase.name === 'mismatched candidate date'
        ? { ...candidate, candidateD1Name: 'theologai-production-20260720-a', confirmedCandidateD1Name: 'theologai-production-20260720-a' }
        : candidate;
      expect(() => prepareProductionD1Candidate(options, {
        root: ROOT, loadManifest: () => manifest(), now: fixedNow,
        createTemporaryConfig: () => { configCreated = true; return temporaryConfig().config; },
        execute: args => args[1] === 'list' ? testCase.text : '',
      })).toThrow(testCase.message);
      expect(configCreated).toBe(false);
    }
  });

  it('classifies readiness or authority-audit failure as terminal after target SQL and cleans up without retrying', () => {
    const { config, state } = temporaryConfig();
    const calls: string[][] = [];
    expect(() => prepareProductionD1Candidate(candidate, {
      root: ROOT, loadManifest: () => manifest(), createTemporaryConfig: () => config, now: fixedNow,
      execute: args => {
        calls.push(args);
        if (args[1] === 'list') return inventory();
        if (args.includes('--command')) return JSON.stringify([{ success: true, results: [] }]);
        return '';
      },
      runReadiness: () => { throw new Error('authority audit failed'); },
    })).toThrow(/during readiness and Transform-8\/9 authority audit[\s\S]*Do not retry, resume, repair, bind, deploy, or reuse/);
    expect(calls.filter(call => call[1] === 'list')).toHaveLength(1);
    expect(state.cleaned).toBe(true);
  });
});
