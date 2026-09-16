#!/usr/bin/env tsx
/** Import the complete generated seed through Wrangler's isolated local D1 runtime. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndVerifyD1SeedManifest } from './d1-seed-manifest.js';
import { parseDataManifest } from './d1-corpus-identity.js';
import {
  auditHistoricalTransform8Authority,
  buildHistoricalTransform8AuthorityQueryPlan,
  buildHistoricalTransform8ExpectedAuthority,
  parseHistoricalTransform8D1Page,
  parseHistoricalTransform8D1Pages,
  type HistoricalTransform8AuthorityPage,
} from './historical-transform8-authority-audit.js';
import {
  auditHistoricalTransform9Authority,
  buildHistoricalTransform9AuthorityQueryPlan,
  buildHistoricalTransform9ExpectedAuthority,
  parseHistoricalTransform9D1Page,
} from './historical-transform9-authority-audit.js';
import {
  auditAquinasAuthority,
  buildAquinasAuthorityQueryPlan,
} from './aquinas-authority-audit.js';
import {
  buildD1ReadinessSql,
  REQUIRED_COLUMNS,
} from './check-remote-d1-readiness.js';
import { buildWorkerdSchemaStateSql } from './d1-workerd-verifier-utils.js';
import {
  ensureWranglerLogDirectory,
  formatWranglerCommandFailure,
} from './wrangler-command-utils.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_ROOT = join(ROOT, 'scripts', 'd1-seed');
const manifest = loadAndVerifyD1SeedManifest(ROOT, SEED_ROOT);
const sourceManifest = parseDataManifest(readFileSync(join(ROOT, 'data', 'data-manifest.json')));
const state = mkdtempSync(join(tmpdir(), 'theologai-wrangler-d1-'));
const wrangler = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const wranglerLogDirectory = join(ROOT, 'test-output', 'wrangler', 'logs');
ensureWranglerLogDirectory(wranglerLogDirectory);
// Eight response envelopes at the existing 1,250,000-byte cap fit within the
// unchanged 16 MiB stdout buffer. Page bounds remain independently enforced;
// grouping eight queries reduces Wrangler startups without sampling the corpus.
const AUTHORITY_BATCH_SIZE = 8;

type AuthorityReadMode = 'batched' | 'serial';
type Phase = 'migrations' | 'schema' | 'seedImport' | 'readiness' | 'transform8Authority' | 'transform9Authority' | 'aquinasAuthority';

function parseAuthorityReadMode(argv: readonly string[]): AuthorityReadMode {
  if (argv.length === 0) return 'batched';
  if (argv.length === 1 && argv[0] === '--authority-read-mode=serial') return 'serial';
  if (argv.length === 1 && argv[0] === '--authority-read-mode=batched') return 'batched';
  throw new Error('Usage: verify-d1-seed-workerd.ts [--authority-read-mode=batched|serial]');
}

const authorityReadMode = parseAuthorityReadMode(process.argv.slice(2));
const phaseMilliseconds = new Map<Phase, number>();

function measure<T>(phase: Phase, action: () => T): T {
  const started = performance.now();
  try {
    return action();
  } finally {
    phaseMilliseconds.set(phase, Math.round(performance.now() - started));
  }
}

function run(args: string[]): string {
  try {
    return execFileSync(process.execPath, [wrangler, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: wranglerLogDirectory,
        WRANGLER_SEND_METRICS: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`Wrangler local D1 verification failed:\n${formatWranglerCommandFailure(error)}`);
  }
}

function executeAuthorityBatch(common: readonly string[], queries: readonly string[]): HistoricalTransform8AuthorityPage[] {
  if (queries.length === 0 || queries.length > AUTHORITY_BATCH_SIZE) {
    throw new Error(`Authority batch must contain 1-${AUTHORITY_BATCH_SIZE} queries`);
  }
  const output = run(['d1', 'execute', ...common, '--command', queries.join('\n;\n'), '--json']);
  return parseHistoricalTransform8D1Pages(output, queries.length);
}

function readPlannedAuthorityPages(
  common: readonly string[],
  queries: readonly string[],
  label: string,
): { readPage: (sql: string) => HistoricalTransform8AuthorityPage; commandCount: number; queryCount: number; assertFullyRead: () => void } {
  const pages: HistoricalTransform8AuthorityPage[] = [];
  for (let start = 0; start < queries.length; start += AUTHORITY_BATCH_SIZE) {
    pages.push(...executeAuthorityBatch(common, queries.slice(start, start + AUTHORITY_BATCH_SIZE)));
  }
  let cursor = 0;
  return {
    readPage: sql => {
      if (queries[cursor] !== sql) {
        throw new Error(`${label} authority continuation diverged from its bounded query plan`);
      }
      const page = pages[cursor++];
      if (!page) throw new Error(`${label} authority query plan exhausted unexpectedly`);
      return page;
    },
    commandCount: Math.ceil(queries.length / AUTHORITY_BATCH_SIZE),
    queryCount: queries.length,
    assertFullyRead: () => {
      if (cursor !== queries.length) throw new Error(`${label} authority audit did not consume its complete bounded query plan`);
    },
  };
}

try {
  const common = ['THEOLOGAI_DB', '--local', '--persist-to', state, '--config', 'wrangler.toml', '--env-file', '/dev/null'];
  measure('migrations', () => run(['d1', 'migrations', 'apply', ...common]));
  const migrationNames = sourceManifest.materializations.d1.migrations.map(migration => basename(migration.path));
  const schemaState = measure('schema', () => run([
    'd1',
    'execute',
    ...common,
    '--command',
    buildWorkerdSchemaStateSql(migrationNames, REQUIRED_COLUMNS),
    '--json',
  ]));
  if (!schemaState.includes('schema-ready')) throw new Error('Wrangler-applied migration state was not verified');

  // A sampled import would not prove relational integrity across Transform 7.
  // The preceding generated-SQLite verification measures the same complete,
  // deterministic corpus against the 350 MiB capacity ceiling. Workerd
  // intentionally blocks SQLite page-count PRAGMAs, so this phase proves that
  // every generated statement is accepted by its local D1 runtime instead.
  measure('seedImport', () => {
    for (const [index, file] of manifest.files.entries()) {
      if (!/^[a-z0-9-]+-\d{3}\.sql$/.test(file.path)) {
        throw new Error(`Unsafe generated seed path: ${file.path}`);
      }
      console.error(`[verify-d1-seed-workerd] ${index + 1}/${manifest.files.length} ${file.path}`);
      run(['d1', 'execute', ...common, '--file', join(SEED_ROOT, file.path)]);
    }
  });

  const readiness = measure('readiness', () => parseHistoricalTransform8D1Page(run([
    'd1',
    'execute',
    ...common,
    '--command',
    buildD1ReadinessSql(sourceManifest.expectedCounts),
    '--json',
  ])));
  if (readiness.rows.length !== 1 || (readiness.rows[0] as { readiness?: unknown }).readiness !== 'ready') {
    throw new Error('Production local D1 readiness result was not ready');
  }
  const transform8Expected = buildHistoricalTransform8ExpectedAuthority(ROOT);
  const transform9Expected = buildHistoricalTransform9ExpectedAuthority(ROOT);
  let authorityCommandCount = 0;
  let authorityQueryCount = 0;
  const authority = measure('transform8Authority', () => {
    if (authorityReadMode === 'serial') {
      return auditHistoricalTransform8Authority(ROOT, sql => {
        authorityCommandCount++;
        authorityQueryCount++;
        return parseHistoricalTransform8D1Page(run(['d1', 'execute', ...common, '--command', sql, '--json']));
      }, transform8Expected);
    }
    const planned = readPlannedAuthorityPages(common, buildHistoricalTransform8AuthorityQueryPlan(ROOT, transform8Expected), 'Transform 8');
    authorityCommandCount += planned.commandCount;
    authorityQueryCount += planned.queryCount;
    const result = auditHistoricalTransform8Authority(ROOT, planned.readPage, transform8Expected);
    planned.assertFullyRead();
    return result;
  });
  const transform9Authority = measure('transform9Authority', () => {
    if (authorityReadMode === 'serial') {
      return auditHistoricalTransform9Authority(ROOT, sql => {
        authorityCommandCount++;
        authorityQueryCount++;
        return parseHistoricalTransform9D1Page(run(['d1', 'execute', ...common, '--command', sql, '--json']));
      }, transform9Expected);
    }
    const planned = readPlannedAuthorityPages(common, buildHistoricalTransform9AuthorityQueryPlan(ROOT, transform9Expected), 'Transform 11');
    authorityCommandCount += planned.commandCount;
    authorityQueryCount += planned.queryCount;
    const result = auditHistoricalTransform9Authority(ROOT, planned.readPage, transform9Expected);
    planned.assertFullyRead();
    return result;
  });
  const aquinasPlan = buildAquinasAuthorityQueryPlan(ROOT);
  const aquinasAuthority = measure('aquinasAuthority', () => {
    if (authorityReadMode === 'serial') {
      return auditAquinasAuthority(sql => {
        authorityCommandCount++;
        authorityQueryCount++;
        return parseHistoricalTransform8D1Page(run(['d1', 'execute', ...common, '--command', sql, '--json']));
      }, aquinasPlan);
    }
    const planned = readPlannedAuthorityPages(common, aquinasPlan.map(page => page.sql), 'Aquinas');
    authorityCommandCount += planned.commandCount;
    authorityQueryCount += planned.queryCount;
    const result = auditAquinasAuthority(planned.readPage, aquinasPlan);
    planned.assertFullyRead();
    return result;
  });
  const timingSummary = Object.fromEntries([...phaseMilliseconds.entries()].map(([phase, milliseconds]) => [phase, milliseconds]));
  const authorityHashes = {
    transform8: {
      attestation: authority.attestationSha256,
      profiles: authority.profilesSha256,
      identities: authority.identitiesSha256,
      aliases: authority.aliasesSha256,
      bodyFtsSample: authority.bodyFtsSampleSha256,
    },
    transform11: transform9Authority.hashes,
    aquinas: aquinasAuthority,
  };
  console.error(`[verify-d1-seed-workerd] Imported ${manifest.files.length} seed files through local D1; production readiness, Transform-8 (${authority.pages.profiles}/${authority.pages.identities}/${authority.pages.aliases} pages), Transform-11 (${transform9Authority.pages.packs}/${transform9Authority.pages.works}/${transform9Authority.pages.editions}/${transform9Authority.pages.artifacts}/${transform9Authority.pages.documents}/${transform9Authority.pages.profiles}/${transform9Authority.pages.sections}/${transform9Authority.pages.projections} pages), and Aquinas (${aquinasAuthority.pages} pages / ${aquinasAuthority.rows} rows) authority audits passed. Authority mode ${authorityReadMode}: ${authorityCommandCount} Wrangler commands for ${authorityQueryCount} bounded queries. Phase milliseconds: ${JSON.stringify(timingSummary)}. Authority hashes: ${JSON.stringify(authorityHashes)}.`);
} finally {
  rmSync(state, { recursive: true, force: true });
}
