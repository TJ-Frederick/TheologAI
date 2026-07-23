#!/usr/bin/env tsx
/** Import the complete generated seed through Wrangler's isolated local D1 runtime. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndVerifyD1SeedManifest } from './d1-seed-manifest.js';
import { parseDataManifest } from './d1-corpus-identity.js';
import {
  auditHistoricalTransform8Authority,
  parseHistoricalTransform8D1Page,
} from './historical-transform8-authority-audit.js';
import {
  buildD1ReadinessSql,
  REQUIRED_COLUMNS,
} from './check-remote-d1-readiness.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_ROOT = join(ROOT, 'scripts', 'd1-seed');
const manifest = loadAndVerifyD1SeedManifest(ROOT, SEED_ROOT);
const sourceManifest = parseDataManifest(readFileSync(join(ROOT, 'data', 'data-manifest.json')));
const state = mkdtempSync(join(tmpdir(), 'theologai-wrangler-d1-'));
const wrangler = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function run(args: string[]): string {
  try {
    return execFileSync(process.execPath, [wrangler, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: join(ROOT, 'test-output', 'wrangler', 'logs'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string; message?: string };
    throw new Error(`Wrangler local D1 verification failed:\n${failure.stderr ?? failure.stdout ?? failure.message ?? 'unknown error'}`);
  }
}

try {
  const common = ['THEOLOGAI_DB', '--local', '--persist-to', state, '--config', 'wrangler.toml'];
  run(['d1', 'migrations', 'apply', ...common]);
  const migrationNames = sourceManifest.materializations.d1.migrations.map(migration => basename(migration.path));
  const columnChecks = Object.entries(REQUIRED_COLUMNS).map(([table, columns]) =>
    `(SELECT group_concat(name, ',') FROM (SELECT name FROM pragma_table_info('${table}') ORDER BY cid)) = '${columns.join(',')}'`
  );
  const schemaState = run([
    'd1',
    'execute',
    ...common,
    '--command',
    `SELECT CASE WHEN
      (SELECT COUNT(*) FROM d1_migrations) = ${migrationNames.length}
      AND (SELECT group_concat(name, ',') FROM (SELECT name FROM d1_migrations ORDER BY id)) = '${migrationNames.join(',')}'
      AND (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name IN ('idx_xref_from','idx_xref_votes','idx_morph_verse','idx_morph_strongs','idx_morph_strongs_canonical','idx_strongs_book_stats_order','idx_strongs_form_stats_rank','idx_ubs_groups_source_order','idx_ubs_segments_lookup','idx_ubs_semantic_identity_candidate','idx_ubs_semantic_sense_candidate_order','idx_ubs_semantic_sense_domain_order','idx_ubs_semantic_coordinate_lookup','idx_ubs_semantic_evidence_sense_order','idx_document_sections_id_document','idx_historical_section_identities_browse','idx_historical_section_aliases_target','idx_historical_editions_work','idx_historical_editions_pack','idx_historical_source_artifacts_edition','idx_historical_edition_sections_order')) = 22
      AND ${columnChecks.join('\n      AND ')}
      THEN 'schema-ready' ELSE json_extract('Wrangler-applied migration state mismatch', '$') END AS schema_state;`,
    '--json',
  ]);
  if (!schemaState.includes('schema-ready')) throw new Error('Wrangler-applied migration state was not verified');

  // A sampled import would not prove relational integrity across Transform 7.
  // The preceding generated-SQLite verification measures the same complete,
  // deterministic corpus against the 350 MiB capacity ceiling. Workerd
  // intentionally blocks SQLite page-count PRAGMAs, so this phase proves that
  // every generated statement is accepted by its local D1 runtime instead.
  for (const [index, file] of manifest.files.entries()) {
    if (!/^[a-z0-9-]+-\d{3}\.sql$/.test(file.path)) {
      throw new Error(`Unsafe generated seed path: ${file.path}`);
    }
    console.error(`[verify-d1-seed-workerd] ${index + 1}/${manifest.files.length} ${file.path}`);
    run(['d1', 'execute', ...common, '--file', join(SEED_ROOT, file.path)]);
  }

  const readiness = parseHistoricalTransform8D1Page(run([
    'd1',
    'execute',
    ...common,
    '--command',
    buildD1ReadinessSql(sourceManifest.expectedCounts),
    '--json',
  ]));
  if (readiness.rows.length !== 1 || (readiness.rows[0] as { readiness?: unknown }).readiness !== 'ready') {
    throw new Error('Production local D1 readiness result was not ready');
  }
  const authority = auditHistoricalTransform8Authority(ROOT, sql => parseHistoricalTransform8D1Page(run([
    'd1', 'execute', ...common, '--command', sql, '--json',
  ])));
  console.error(`[verify-d1-seed-workerd] Imported ${manifest.files.length} seed files through local D1; production readiness and Transform-8 authority audit passed (${authority.pages.profiles}/${authority.pages.identities}/${authority.pages.aliases} pages).`);
} finally {
  rmSync(state, { recursive: true, force: true });
}
