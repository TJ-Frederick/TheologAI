#!/usr/bin/env tsx
/** Import the complete generated seed through Wrangler's isolated local D1 runtime. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { parse } from 'smol-toml';
import type { Miniflare } from 'miniflare';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndVerifyD1SeedManifest } from './d1-seed-manifest.js';
import { parseDataManifest } from './d1-corpus-identity.js';
import {
  auditHistoricalTransform8Authority,
  parseHistoricalTransform8D1Page,
  type HistoricalTransform8AuthorityPage,
} from './historical-transform8-authority-audit.js';
import {
  auditHistoricalTransform9Authority,
  parseHistoricalTransform9D1Page,
} from './historical-transform9-authority-audit.js';
import { auditAquinasAuthority, buildAquinasAuthorityQueryPlan } from './aquinas-authority-audit.js';
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
export const LOCAL_AUTHORITY_RESULT_MAX_BYTES = 128 * 1024 * 1024;
const LOCAL_AUTHORITY_MAX_PAGES = 1_000;

type Reader = (sql: string) => HistoricalTransform8AuthorityPage;
function auditAuthority(root: string, readPage: Reader) {
  return {
    authority: auditHistoricalTransform8Authority(root, readPage),
    transform9Authority: auditHistoricalTransform9Authority(root, readPage),
    aquinas: auditAquinasAuthority(readPage, buildAquinasAuthorityQueryPlan(root)),
  };
}

/** Enumerate SQL only. Source rows are never returned as local D1 proof. */
export function planLocalAuthority(root: string, sourceDatabase: string): string[] {
  const source = new Database(sourceDatabase, { readonly: true, fileMustExist: true });
  const plan: string[] = [];
  try {
    auditAuthority(root, sql => {
      if (!/^\s*SELECT\b/i.test(sql) || plan.length >= LOCAL_AUTHORITY_MAX_PAGES) {
        throw new Error('Local D1 authority query plan exceeds its read-only bound');
      }
      plan.push(sql);
      const rows = source.prepare(sql).all();
      return { rows, responseBytes: Buffer.byteLength(JSON.stringify(rows)) };
    });
    return plan;
  } finally { source.close(); }
}

/** Bridge the existing synchronous auditors without changing their pagination or checks. */
export async function verifyLocalAuthorityPages<T>(
  plan: readonly string[], readPage: (sql: string) => Promise<HistoricalTransform8AuthorityPage>,
  audit: (reader: Reader) => T,
): Promise<T> {
  if (!plan.length || plan.length > LOCAL_AUTHORITY_MAX_PAGES) throw new Error('Invalid local D1 authority page count');
  const pages: HistoricalTransform8AuthorityPage[] = [];
  let bytes = 0;
  for (const sql of plan) {
    const page = await readPage(sql);
    if (!Array.isArray(page.rows) || !Number.isSafeInteger(page.responseBytes) || page.responseBytes < 0) {
      throw new Error('Invalid local D1 authority page');
    }
    bytes += page.responseBytes;
    if (bytes > LOCAL_AUTHORITY_RESULT_MAX_BYTES) throw new Error('Local D1 authority results exceed128MiB; no rows discarded');
    pages.push(page);
  }
  let index = 0;
  const result = audit(sql => {
    if (plan[index] !== sql || !pages[index]) throw new Error('Local D1 authority SQL/order differs from its source plan');
    return pages[index++]!;
  });
  if (index !== pages.length) throw new Error('Local D1 authority audit did not consume every actual page');
  return result;
}

/** Preserve the pinned Wrangler local batch result mapping and existing envelope parser. */
export function localD1AuthorityPage(results: Array<{ success: boolean; results?: Record<string, unknown>[]; meta?: { duration?: number } }>): HistoricalTransform8AuthorityPage {
  const result = Array.isArray(results) && results.length === 1 ? results[0] : undefined;
  if (result?.success !== true || !Array.isArray(result.results)
    || result.results.some(row => {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) return true;
      const prototype = Object.getPrototypeOf(row);
      return prototype !== Object.prototype && prototype !== null;
    })) {
    throw new Error('Local D1 authority requires one successful statement with a row array');
  }
  const rows = result.results.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, Array.isArray(value) ? `[${value.join(', ')}]` : value])));
  return parseHistoricalTransform8D1Page(JSON.stringify([{ results: rows, success: result.success, meta: { duration: result.meta?.duration } }], null, 2) + '\n');
}

/** One owned Workerd runtime for all actual D1 pages; disposal also runs on failures. */
export async function auditPersistentLocalD1(
  root: string, plan: readonly string[], state: string, id: string,
  createRuntime: (options: ConstructorParameters<typeof Miniflare>[0]) => Pick<Miniflare, 'getD1Database' | 'dispose'> = options => {
    const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    const { Miniflare: WranglerMiniflare } = createRequire(wrangler)('miniflare') as typeof import('miniflare');
    return new WranglerMiniflare(options);
  },
) {
  let runtime: Pick<Miniflare, 'getD1Database' | 'dispose'> | undefined;
  try {
    runtime = createRuntime({ modules: true, script: '', d1Persist: join(state, 'v3', 'd1'), d1Databases: { DATABASE: id }, cf: false });
    const db = await runtime.getD1Database('DATABASE');
    return await verifyLocalAuthorityPages(plan, async sql => localD1AuthorityPage(await db.batch([db.prepare(sql)])),
      readPage => auditAuthority(root, readPage));
  } finally { await runtime?.dispose(); }
}

export async function verifyD1SeedWorkerd(root = ROOT): Promise<void> {
  const seedRoot = join(root, 'scripts', 'd1-seed');
  const manifest = loadAndVerifyD1SeedManifest(root, seedRoot);
  const sourceManifest = parseDataManifest(readFileSync(join(root, 'data', 'data-manifest.json')));
  // CI already creates and verifies this exact generated DB before exporting the seed.
  // A missing source is an explicit error, never a rebuild or a different artifact fallback.
  const sourceDatabase = process.env.THEOLOGAI_TEST_DATABASE_PATH || join(root, 'data', 'theologai.db');
  const plan = planLocalAuthority(root, sourceDatabase);
  const state = mkdtempSync(join(tmpdir(), 'theologai-wrangler-d1-'));
  const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const wranglerLogDirectory = join(root, 'test-output', 'wrangler', 'logs');
  function run(args: string[]): string {
    try {
      return execFileSync(process.execPath, [wrangler, ...args], {
        cwd: root, encoding: 'utf8',
        env: { ...process.env, WRANGLER_LOG_PATH: wranglerLogDirectory, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_CF_FETCH_ENABLED: 'false' },
        stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
      });
    } catch (error) { throw new Error(`Wrangler local D1 verification failed:\n${formatWranglerCommandFailure(error)}`); }
  }
  try {
    ensureWranglerLogDirectory(wranglerLogDirectory);
    const common = ['THEOLOGAI_DB', '--local', '--persist-to', state, '--config', 'wrangler.toml'];
    run(['d1', 'migrations', 'apply', ...common]);
    const migrationNames = sourceManifest.materializations.d1.migrations.map(migration => basename(migration.path));
    const schemaState = run(['d1', 'execute', ...common, '--command', buildWorkerdSchemaStateSql(migrationNames, REQUIRED_COLUMNS), '--json']);
    if (!schemaState.includes('schema-ready')) throw new Error('Wrangler-applied migration state was not verified');
    for (const [index, file] of manifest.files.entries()) {
      if (!/^[a-z0-9-]+-\d{3}\.sql$/.test(file.path)) throw new Error(`Unsafe generated seed path: ${file.path}`);
      console.error(`[verify-d1-seed-workerd] ${index + 1}/${manifest.files.length} ${file.path}`);
      run(['d1', 'execute', ...common, '--file', join(seedRoot, file.path)]);
    }
    const readiness = parseHistoricalTransform8D1Page(run(['d1', 'execute', ...common, '--command', buildD1ReadinessSql(sourceManifest.expectedCounts), '--json']));
    if (readiness.rows.length !== 1 || (readiness.rows[0] as { readiness?: unknown }).readiness !== 'ready') {
      throw new Error('Production local D1 readiness result was not ready');
    }
    const config = parse(readFileSync(join(root, 'wrangler.toml'), 'utf8')) as { d1_databases?: Array<{ binding: string; preview_database_id?: string; database_id?: string }> };
    const bindings = config.d1_databases?.filter(binding => binding.binding === 'THEOLOGAI_DB') ?? [];
    if (bindings.length !== 1) throw new Error('Local D1 verifier requires the same single configured binding as Wrangler');
    const binding = bindings[0]!;
    const id = binding.preview_database_id ?? binding.database_id ?? binding.binding;
    // Use Wrangler's own installed runtime, identifier, persistence layout and batch API.
    // No platform proxy, remote bindings, auth/config discovery or CF metadata fetch.
    const { authority, transform9Authority, aquinas } = await auditPersistentLocalD1(root, plan, state, id);
    console.error(`[verify-d1-seed-workerd] Aquinas complete authority passed (${aquinas.pages} pages).`);
    console.error(`[verify-d1-seed-workerd] Imported ${manifest.files.length} seed files through local D1; production readiness, Transform-8 (${authority.pages.profiles}/${authority.pages.identities}/${authority.pages.aliases} pages), and Transform-11 (${transform9Authority.pages.packs}/${transform9Authority.pages.works}/${transform9Authority.pages.editions}/${transform9Authority.pages.artifacts}/${transform9Authority.pages.documents}/${transform9Authority.pages.profiles}/${transform9Authority.pages.sections}/${transform9Authority.pages.projections} pages) authority audits passed.`);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyD1SeedWorkerd().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
