import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createTheologAiMcpServer, STATELESS_HTTP_CAPABILITIES } from '../../src/mcp/server.js';
import { createDeterministicMcpFixture } from '../fixtures/mcpCompositionRoot.js';
import { POLICY, TARGETS } from '../../scripts/application-release-policy.mjs';
import { corpusTransportFixture } from './corpusTransportFixture.js';

const cutoverDeployment = '323e4567-e89b-42d3-a456-426614174000';
const cutoverVersion = '223e4567-e89b-42d3-a456-426614174000';
const norton = 'calvin-institutes-of-the-christian-religion';
const hooker = 'hooker-laws-of-ecclesiastical-polity-book-1';
const wesley = 'wesley-standard-sermons';
const aquinasUri = 'theologai://documents/summa-theologiae#node-article:prima.1.1';
const section = (slug: string, key: string) => 'theologai://documents/' + slug + '#section-' + key;
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const write = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value) + '\n');

export function installHostedCorpusFetch(work: string) {
  // This fixture represents only the locators and body used by the workflow.
  // The separate Workerd suite validates the actual Worker tool output schemas.
  const callTool = Client.prototype.callTool;
  Client.prototype.callTool = function (params, options) {
    return callTool.call(this, params, {
      ...options, toolDefinition: { name: params.name, inputSchema: { type: 'object' } },
    });
  };
  const config = read(join(work, 'provider.json'));
  const { root } = createDeterministicMcpFixture();
  const handler = createMcpHandler(({ era }) =>
    createTheologAiMcpServer(root, '3.6.0', STATELESS_HTTP_CAPABILITIES, era),
  { legacy: 'stateless', responseMode: 'auto' });
  const controls = corpusTransportFixture({ role: 'production', activated: true });
  controls.versions.production = cutoverVersion;
  controls.deployments.production = cutoverDeployment;
  assert.deepEqual(controls.assignments, config.assignments);
  let hookerFailures = 0;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(readFileSync(join(work, 'provider-switched'), 'utf8'), config.source);
    if (url.origin === 'https://api.cloudflare.com') {
      assert(!url.pathname.endsWith('/query'), 'hosted recovery attempted remote proof SQL');
      const response = await controls.fetch(input, init);
      if (url.pathname.endsWith('/graphql')) {
        const body = await response.json() as any;
        body.data.viewer.accounts[0].databases[0].sum.rowsWritten =
          process.env.HOSTED_FIXTURE_FAULT === 'custody' && hookerFailures ? 5 : 4;
        return Response.json(body);
      }
      return response;
    }
    assert.equal(url.href, 'https://mcp.theologai.xyz/mcp');
    const request = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const modern = new Headers(init?.headers).get('mcp-protocol-version') === '2026-07-28';
    const response = (data: Record<string, unknown>) => Response.json({
      jsonrpc: '2.0', id: request.id, result: modern ? {
        ...data, resultType: 'complete', ttlMs: 0, cacheScope: 'private',
      } : data,
    });
    if (request?.method === 'resources/read') {
      return response({ contents: [{ uri: request.params.uri, text: 'one two' }] });
    }
    if (request?.method !== 'tools/call') return handler.fetch(new Request(url, init));
    const { name, arguments: args } = request.params;
    let uri: string;
    if (name === 'classic_text_lookup' && args.query) {
      assert.deepEqual(args, { query: 'persuade multitude governed' });
      if (modern && hookerFailures === 0) {
        hookerFailures++;
        if (process.env.HOSTED_FIXTURE_FAULT === 'assignment') controls.deployments.production = controls.assignments.production.deploymentId;
        if (process.env.HOSTED_FIXTURE_FAULT === 'source') {
          writeFileSync(join(work, 'corpus-source/source.db'), 'different local content', { flag: 'a' });
        }
        if (process.env.HOSTED_FIXTURE_FAULT === 'proof') {
          const proofFile = join(work, 'release-evidence/corpus-readiness.json');
          const proof = read(proofFile);
          proof.proof.method = 'different-proof-criteria';
          write(proofFile, proof);
        }
        return new Response('synthetic Hooker failure', { status: 503 });
      }
      uri = section(hooker, 'section-001');
    } else if (name === 'classic_text_lookup') {
      assert.deepEqual(args, { work: norton, browseSections: true });
      uri = section(norton, 'norton-fixture');
    } else if (name === 'primary_source_search') {
      const [query] = args.queries;
      assert.deepEqual(query, { id: 'scope', work: query.work, match: 'all_terms', limit: 8,
        providers: ['local'], text: query.work === wesley ? 'salvation by faith' : 'latine maister caluin' });
      uri = query.work === wesley ? section(wesley, 'sermon-01') : section(norton, 'norton-fixture');
    } else {
      assert.equal(name, 'historical_hierarchy_lookup');
      uri = aquinasUri;
    }
    return response({ content: [], structuredContent: { resource: { uri } } });
  };
}

export async function rehearseHostedRecovery(input: {
  root: string;
  work: string;
  authority: string;
  challenge: string;
  proof: string;
  planDigest: string;
  now: number;
  env: NodeJS.ProcessEnv;
}) {
  const { root, work, authority, challenge, proof, planDigest, now, env } = input;
  const evidence = join(work, 'release-evidence');
  const sourceDirectory = join(work, 'corpus-source');
  const bundle = join(work, 'worker-bundle');
  for (const directory of [evidence, sourceDirectory, bundle]) mkdirSync(directory);
  for (const name of ['plan.json', 'source.db']) copyFileSync(join(work, name), join(sourceDirectory, name));
  const receipt = join(evidence, 'corpus-readiness.json');
  copyFileSync(proof, receipt);
  copyFileSync(proof + '.events.jsonl', receipt + '.events.jsonl');
  copyFileSync(join(work, 'operator-proof-envelope.json'), join(evidence, 'operator-proof-envelope.json'));
  copyFileSync(challenge, join(work, 'operator-corpus-challenge.json'));
  const proofJournal = readFileSync(receipt + '.events.jsonl', 'utf8');
  const physicalChecks = proofJournal.trim().split('\n').map(line => JSON.parse(line))
    .filter(event => event.kind === 'intent' && event.label === 'physical');
  assert.equal(physicalChecks.length, 1);
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const { assignments } = read(authority).authorization;
  const previous = { databaseId: assignments.production.databaseId, databaseName: 'theologai-production-20260811-schema0009-a' };
  const baselineSource = POLICY.serving().productionSource;
  write(join(work, 'provider.json'), {
    source, role: 'production', assignments, bindings: TARGETS, production_tag: baselineSource, ambiguous: false,
    inventory: [TARGETS.preview, TARGETS.production, previous].map(db => ({ uuid: db.databaseId, name: db.databaseName })),
  });
  write(join(work, 'production-baseline.json'), {
    productionSource: baselineSource, requireVersionTag: true, targets: { preview: TARGETS.preview, production: previous },
  });
  write(join(work, 'verified-preview.json'), assignments.preview);
  const config = (role: 'production' | 'preview') => '[[%PREFIX%d1_databases]]\n'
    + 'binding = "THEOLOGAI_DB"\ndatabase_name = "' + TARGETS[role].databaseName
    + '"\ndatabase_id = "' + TARGETS[role].databaseId + '"\nmigrations_dir = "migrations"\n';
  const toml = 'name = "theologai"\n' + config('production').replace('%PREFIX%', '')
    + '[env.preview]\nname = "theologai-preview"\n' + config('preview').replace('%PREFIX%', 'env.preview.');
  writeFileSync(join(work, 'corpus-wrangler.toml'), toml);
  writeFileSync(join(bundle, 'worker.js'), 'export default {};\n');
  writeFileSync(join(bundle, 'worker.js.map'), '{}\n');
  const manifest = execFileSync(process.execPath, ['scripts/worker-release-artifact.mjs', 'create', 'preview', bundle],
    { cwd: root, encoding: 'utf8' }).trim();
  write(join(work, 'worker-release.json'), { main: join(bundle, 'worker.js'), no_bundle: true, find_additional_modules: false,
    name: 'theologai', routes: [{ pattern: 'mcp.theologai.xyz', custom_domain: true }], workers_dev: true,
    d1_databases: [{ binding: 'THEOLOGAI_DB', database_id: TARGETS.production.databaseId, database_name: TARGETS.production.databaseName }],
  });
  const clock = join(work, 'hosted-clock.cjs');
  writeFileSync(clock, `
    const OriginalDate = Date;
    let now = Number(process.env.FIXTURE_NOW);
    globalThis.advanceFixtureClock = (milliseconds) => { now += milliseconds; };
    globalThis.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    };
  `);
  const preload = join(work, 'hosted-preload.mjs');
  writeFileSync(preload, `
    import { installHostedCorpusFetch } from ${JSON.stringify(resolve('test/helpers/hostedCorpusRecoveryFixture.ts'))};
    const timeout = setTimeout;
    globalThis.setTimeout = (fn, ms, ...args) => {
      if (ms > 0 && ms < 1000) return timeout(() => { advanceFixtureClock(ms); fn(...args); }, 0);
      return timeout(fn, ms, ...args);
    };
    installHostedCorpusFetch(${JSON.stringify(work)});
  `);
  const provider = resolve('test/fixtures/release-workers/wrangler-provider.py');
  writeFileSync(join(work, 'bin/npx'), `#!/usr/bin/env bash
if [[ "$3" == scripts/norton-aquinas-live.ts ]]; then
  shift 2
  exec "$FIXTURE_NODE" --import tsx --import "$FIXTURE_PRELOAD" "$@"
fi
exec python3 "$FIXTURE_WRANGLER" "$@"
`, { mode: 0o755 });
  const workflow = (phase: string, fault = '') => spawnSync('bash',
    ['.github/scripts/release-workers.sh', phase, 'production', 'corpus'], {
      cwd: root, encoding: 'utf8', timeout: 30_000,
      env: { ...env, PATH: join(work, 'bin') + ':' + process.env.PATH, FIXTURE_NODE: process.execPath,
        FIXTURE_PRELOAD: preload, FIXTURE_WRANGLER: provider, REAL_NPX: join(dirname(process.execPath), 'npx'),
        NODE_OPTIONS: '--require=' + clock, FIXTURE_NOW: String(now), WORKER_SHA256: manifest, CORPUS_PLAN_SHA256: planDigest,
        GITHUB_STEP_SUMMARY: join(work, 'release-summary.md'), HOSTED_FIXTURE_FAULT: fault,
        CLOUDFLARE_API_TOKEN: 'synthetic-reader' },
    });
  const run = (phase: string) => {
    const result = workflow(phase);
    const failedReport = join(evidence, 'corpus-live-attempt-1-failure.json');
    const failure = existsSync(failedReport) ? JSON.stringify(read(failedReport).failure) : '';
    assert.equal(result.status, 0, phase + ': ' + (result.error?.message ?? '') + result.stderr + result.stdout + failure);
  };
  run('preflight');
  run('deploy');
  run('confirm');
  run('audit-corpus');
  run('finish');
  run('record');
  const accepted = read(join(evidence, 'accepted-production.json'));
  assert.equal(accepted.productionSource, source);
  assert.equal(accepted.deploymentId, cutoverDeployment);
  assert.equal(accepted.versionId, cutoverVersion);
  assert.equal(accepted.databaseId, TARGETS.production.databaseId);
  const audit = read(join(evidence, 'corpus-live.json'));
  assert.equal(audit.passed, true);
  assert.equal(audit.recovered, true);
  assert.equal(audit.checks.length, 24);
  assert.equal(audit.cumulativeReservedReads, read(challenge).liveControlReserve);
  const failure = read(join(evidence, 'corpus-live-attempt-1-failure.json')).failure;
  assert.equal(failure.lastHttpStatus, 503);
  assert.equal(failure.probeId, 'global-classic-search:' + hooker);
  assert.equal(failure.era, '2026-07-28');
  const summary = readFileSync(join(work, 'release-summary.md'), 'utf8');
  assert.match(summary, /Serving, verification pending/);
  assert.match(summary, /Verification-only recovery passed/);
  const journal = readFileSync(join(evidence, 'corpus-live.json.events.jsonl'), 'utf8').trim().split('\n')
    .map(line => JSON.parse(line));
  const intents = journal.filter(event => event.kind === 'live-intent');
  assert.deepEqual(intents.map(event => event.attempt), [1, 2]);
  assert.equal(intents[0].evidenceSha256, intents[1].evidenceSha256);
  assert.equal(intents[0].reservedReads + intents[1].reservedReads, audit.cumulativeReservedReads);
  assert.equal(workflow('audit-corpus').status, 1, 'a repeated invocation could reuse the original reservation');
  const reports = ['corpus-live.json', 'corpus-live.json.events.jsonl', 'corpus-live-attempt-1-failure.json'];
  for (const file of reports) renameSync(join(evidence, file), join(work, file));
  const receiptBytes = readFileSync(receipt);
  for (const [fault, reason] of [
    ['assignment', 'confirmed serving assignment changed'],
    ['custody', 'candidate write custody changed or is unconfirmed'],
    ['proof', 'retained proof and journal'],
    ['source', 'source plan and database bytes'],
  ]) {
    const result = workflow('audit-corpus', fault);
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stderr, new RegExp(reason));
    assert(!existsSync(join(evidence, 'corpus-live.json')));
    const events = readFileSync(join(evidence, 'corpus-live.json.events.jsonl'), 'utf8').trim().split('\n')
      .map(line => JSON.parse(line));
    assert.equal(events.filter(event => event.kind === 'live-intent').length, 1);
    for (const file of reports) rmSync(join(evidence, file), { force: true });
    writeFileSync(receipt, receiptBytes);
    copyFileSync(join(work, 'source.db'), join(sourceDirectory, 'source.db'));
  }
  const deploys = readFileSync(join(work, 'provider.log'), 'utf8').split('\n').filter(line => line.includes(' wrangler deploy '));
  assert.equal(deploys.length, 1);
  assert.equal(readFileSync(receipt + '.events.jsonl', 'utf8'), proofJournal);

  const { resolveProductionBaseline } = createRequire(import.meta.url)('../../.github/scripts/production-baseline.cjs');
  const repo = { owner: 'TJ-Frederick', repo: 'TheologAI' };
  const runId = Number(env.GITHUB_RUN_ID);
  const data = (value: unknown) => ({ data: value });
  const selected = await resolveProductionBaseline({
    context: { repo, runId: runId + 1 },
    github: { rest: { actions: {
      listWorkflowRuns: () => data({ total_count: 1, workflow_runs: [{
        id: runId, run_number: read(join(root, 'release/serving.json')).productionRunNumber + 1, repository: { full_name: 'TJ-Frederick/TheologAI' },
        path: '.github/workflows/deploy.yml', head_branch: 'main', status: 'completed', conclusion: 'success',
        event: 'workflow_dispatch', head_sha: accepted.productionSource, run_attempt: 1,
      }] }),
      listJobsForWorkflowRun: () => data({ total_count: 1, jobs: [{
        name: 'Test, Build & Deploy', conclusion: 'success', head_sha: source,
        steps: [{ name: 'Record accepted production source and assignment', conclusion: 'success' }],
      }] }),
      getReviewsForRun: () => data([{ state: 'approved', user: { id: 40179660 }, environments: [{ name: 'production' }] }]),
    } } },
    readSource: (sha: string) => JSON.parse(execFileSync('git', ['show', sha + ':release/serving.json'], { cwd: root, encoding: 'utf8' })),
  });
  assert.deepEqual(selected, { productionSource: source, targets: TARGETS, requireVersionTag: true });
}
