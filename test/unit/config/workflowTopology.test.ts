import { spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

async function readWorkflow(name: string): Promise<string> {
  return readFile(new URL(`../../../.github/workflows/${name}`, import.meta.url), 'utf8');
}

function occurrences(source: string, exactLine: string): number {
  return source.split('\n').filter(line => line === exactLine).length;
}

function uniqueBlock(source: string, exactAnchor: string): string {
  expect(occurrences(source, exactAnchor), `unique workflow anchor: ${exactAnchor}`).toBe(1);
  const lines = source.split('\n');
  const start = lines.indexOf(exactAnchor);
  const indent = exactAnchor.length - exactAnchor.trimStart().length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.trim() === '') continue;
    const lineIndent = line.length - line.trimStart().length;
    if (lineIndent <= indent) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function normalized(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const REVOCATION_PREDICATE = normalized(`
  github.event.action == 'closed' ||
  (github.event.action == 'unlabeled' && github.event.label.name == 'deploy-preview') ||
  github.event.action == 'converted_to_draft' ||
  (
    github.event.action == 'edited' &&
    github.event.changes.base.ref.from == 'main' &&
    github.event.pull_request.base.ref != 'main'
  )
`);

interface Step {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, string | number | boolean>;
  env?: Record<string, string>;
}
interface Job {
  name?: string;
  needs?: string | string[];
  if?: string;
  'runs-on'?: string;
  'timeout-minutes'?: number;
  environment?: { name: string };
  concurrency?: Record<string, unknown>;
  permissions?: Record<string, string>;
  steps?: Step[];
  uses?: string;
}
interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  concurrency: { group: string; 'cancel-in-progress': boolean | string };
  jobs: Record<string, Job>;
}
const needs = (job: Job): string[] => typeof job.needs === 'string' ? [job.needs] : job.needs ?? [];
function expressionBody(value: string): string {
  return normalized(value).replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '');
}

function assertPreviewRevocationBoundary(workflow: Workflow): void {
  const trigger = workflow.on['pull_request'] as { types?: string[] };
  expect(trigger).toEqual({ types: ['closed', 'unlabeled', 'converted_to_draft', 'edited'] });
  expect(workflow.permissions).toEqual({});

  const concurrency = workflow.concurrency;
  const group = expressionBody(concurrency.group);
  expect(group).toBe(`( ${REVOCATION_PREDICATE} ) && format('pr-{0}', github.event.pull_request.number) || format('preview-revocation-noop-{0}', github.run_id)`);
  expect(expressionBody(String(concurrency['cancel-in-progress']))).toBe(REVOCATION_PREDICATE);

  const job = workflow.jobs['acknowledge-revocation']!;
  expect(expressionBody(job.if ?? '')).toBe(REVOCATION_PREDICATE);
  expect(job).toMatchObject({ 'runs-on': 'ubuntu-latest', 'timeout-minutes': 1 });
  expect(job.environment).toBeUndefined();
  expect(JSON.stringify(job)).not.toMatch(/secrets\.|upload-artifact/i);
  expect(job.steps?.filter(step => step.run?.includes('Preview authorization was revoked'))).toHaveLength(1);
}

function assertProductionBoundary(workflow: Workflow): void {
  const deploy = workflow.jobs.deploy!;
  expect(deploy.environment).toMatchObject({ name: 'production' });
  expect(needs(deploy)).toEqual(expect.arrayContaining(['verify-deployment-plan', 'verify-dual-era-preview', 'validate']));
  expect(deploy.if).not.toContain('always()');
  expect(deploy.if).toContain("needs.verify-deployment-plan.outputs.decision == 'deploy'");
  expect(workflow.jobs.validate!.uses).toBe('./.github/workflows/validate.yml');
  for (const [id, job] of Object.entries(workflow.jobs)) {
    if (id !== 'deploy') {
      expect(job.environment).toBeUndefined();
      expect(JSON.stringify(job)).not.toContain('secrets.');
    }
  }
}

describe('workflow topology', () => {
  it('keeps root dependencies and builds out of every credential-bearing job', async () => {
    for (const name of [
      'deploy.yml', 'pr.yml', 'bootstrap-ccel-coordinator.yml',
      'operate-ccel-coordinator.yml', 'stage-ccel-operator-secret.yml',
      'promote-ccel-operator-secret.yml', 'rollback-ccel-operator-secret.yml',
      'ccel-live-preview-canary.yml', 'restore-ccel-live-preview-canary.yml',
      'production-rollback-rehearsal.yml',
    ]) {
      const workflow = parse(await readWorkflow(name)) as Workflow;
      for (const job of Object.values(workflow.jobs)) {
        if (!job.environment) {
          expect(JSON.stringify(job), name).not.toContain('secrets.');
          continue;
        }
        const source = JSON.stringify(job);
        expect(source, name).not.toMatch(/npm ci|npm install|npm run|wrangler-action@/);
        expect(source, name).toContain('/.github/actions/release-toolchain');
        for (const step of job.steps ?? []) {
          if (step.run?.includes('wrangler deploy --config') || step.run?.includes('wrangler versions upload')) {
            expect(step.run, name).toContain('--no-bundle');
          }
          if (step.uses?.startsWith('actions/checkout@')) expect(step.with?.['persist-credentials'], name).toBe(false);
        }
      }
    }
    const action = await readFile(new URL('../../../.github/actions/release-toolchain/action.yml', import.meta.url), 'utf8');
    expect(action).toContain('test ! -e node_modules');
    expect(action).toContain('test ! -L node_modules');
    expect(action).toContain('npm ci --prefix "$toolchain_dir" --ignore-scripts');
    expect(action).toContain('npm rebuild --prefix "$toolchain_dir" better-sqlite3 --ignore-scripts=false');
    expect(action).toContain('package-manager-cache: false');
    expect(action).not.toMatch(/^\s+cache:/m);
    const manifest = JSON.parse(await readFile(new URL('../../../.github/release-toolchain/package.json', import.meta.url), 'utf8'));
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@modelcontextprotocol/client', 'ajv', 'better-sqlite3', 'parse5', 'smol-toml', 'tsx', 'wrangler',
    ]);
    for (const version of Object.values(manifest.dependencies)) expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.scripts).toBeUndefined();
  });

  it('paces the long fixed audits within the shared per-IP request budget', async () => {
    for (const [file, target, jobId] of [['pr.yml', 'preview', 'preview-deploy'], ['deploy.yml', 'production', 'deploy']] as const) {
      const steps = (parse(await readWorkflow(file)) as Workflow).jobs[jobId]!.steps!;
      const core = steps.findIndex(step => step.name === `Audit Transform-9 historical core contract on ${target}`);
      const pause = steps.findIndex(step => step.name === 'Respect the shared IP request budget before the spine audit');
      const spine = steps.findIndex(step => step.name === `Audit Transform-11 historical spine contract on ${target}`);
      expect(pause).toBeGreaterThan(core);
      expect(spine).toBeGreaterThan(pause);
      const seconds = /^sleep (\d+)$/.exec(steps[pause]!.run ?? '');
      expect(seconds).not.toBeNull();
      expect(Number(seconds![1])).toBeGreaterThan(60);
      expect(steps[pause]!.if).toBe(`\${{ steps.${target}-historical-core-audit.outcome == 'success' }}`);
    }
  });

  it('captures final deploy stdout for strict identity proof and propagates upload failures', async () => {
    for (const [file, target, jobId] of [['pr.yml', 'preview', 'preview-deploy'], ['deploy.yml', 'production', 'deploy']] as const) {
      const workflow = parse(await readWorkflow(file)) as Workflow;
      const steps = workflow.jobs[jobId]!.steps!;
      const deploy = steps.find(step => step.id === `${target}-worker-deploy`)!;
      const verify = steps.find(step => step.name === `Verify exact active ${target} Worker version (read-only)`)!;
      const directory = await mkdtemp(join(tmpdir(), 'theologai-deploy-stdout-'));
      try {
        const bin = join(directory, 'bin');
        await mkdir(bin);
        await writeFile(join(bin, 'npx'), `#!/usr/bin/env node
          if (process.argv.includes('put')) {
            require('node:fs').readFileSync(0);
            console.log('Secret update created an intermediate version');
          } else {
            console.log('Current Version ID: 223e4567-e89b-42d3-a456-426614174000');
            process.exitCode = Number(process.env.DEPLOY_EXIT_STATUS || 0);
          }
        `, { mode: 0o755 });
        for (const code of [0, 7]) {
          const result = spawnSync('bash', ['-e', '-c', deploy.run!], {
            cwd: directory,
            env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: directory,
              ESV_API_KEY: 'offline-test-only', DEPLOY_EXIT_STATUS: String(code) },
          });
          expect(result.status).toBe(code);
          expect(await readFile(join(directory, `${target}-worker-deploy.command-output.txt`), 'utf8'))
            .toBe('Current Version ID: 223e4567-e89b-42d3-a456-426614174000\n');
        }
        expect(verify.run).toContain(`--command-output "$RUNNER_TEMP/${target}-worker-deploy.command-output.txt"`);
        expect(JSON.stringify(verify)).not.toContain('outputs.command-output');
        expect(verify.run).not.toContain('DEPLOY_COMMAND_OUTPUT');
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });

  it('requires a credential-free build and verifies the artifact digest and source', async () => {
    for (const [file, id] of [['deploy.yml', 'deploy'], ['pr.yml', 'preview-deploy']] as const) {
      const workflow = parse(await readWorkflow(file)) as Workflow;
      const build = workflow.jobs['build-worker']!;
      expect(build.environment).toBeUndefined();
      expect(JSON.stringify(build)).not.toContain('secrets.');
      expect(JSON.stringify(build)).toContain('worker-release-artifact.mjs create');
      const deploy = workflow.jobs[id]!;
      expect(needs(deploy)).toContain('build-worker');
      expect(JSON.stringify(deploy)).toContain('needs.build-worker.outputs.worker_sha256');
      expect(JSON.stringify(deploy)).toContain('worker-release-artifact.mjs render');
      const download = deploy.steps!.find(step => step.name === 'Download source-bound Worker artifact')!;
      expect(download.with?.['digest-mismatch']).toBe('error');
      expect(download.with?.name).toContain('github.run_attempt');
    }
    const preview = (parse(await readWorkflow('pr.yml')) as Workflow).jobs['preview-deploy']!;
    expect(preview.steps?.find(step => step.with?.path === 'release-control')?.with?.ref).toBe('${{ github.event.pull_request.base.sha }}');
    expect(preview.steps?.find(step => step.uses === './release-control/.github/actions/release-toolchain')?.if)
      .toBe("steps.release-toolchain-source.outputs.source == 'base'");
    expect(preview.steps?.find(step => step.uses === './.github/actions/release-toolchain')?.if)
      .toBe("steps.release-toolchain-source.outputs.source == 'introduction'");
  });

  it('binds complete fresh corpus verification to unprivileged source inputs and protected approval', async () => {
    for (const [file, role, jobId] of [['pr.yml', 'preview', 'preview-deploy'], ['deploy.yml', 'production', 'deploy']] as const) {
      const workflow = parse(await readWorkflow(file)) as Workflow;
      const build = workflow.jobs['build-worker']!;
      const prepare = build.steps!.find(step => step.id === 'corpus-source')!;
      expect(build.environment).toBeUndefined();
      expect(prepare.run).toContain('application-corpus-check.ts prepare');
      expect(prepare.run).toContain('npm run build:db');
      expect(JSON.stringify(prepare)).not.toContain('secrets.');
      expect(prepare.run).toContain("printf 'sha256=%s\\n'");
      const job = workflow.jobs[jobId]!;
      expect(job.environment?.name).toBe(role);
      expect(job['timeout-minutes']).toBe(120);
      const proof = job.steps!.findIndex(step => step.name?.startsWith('Verify fresh corpus'));
      const upload = job.steps!.findIndex(step => step.run?.includes('wrangler deploy --config'));
      expect(proof).toBeGreaterThan(-1); expect(upload).toBeGreaterThan(proof);
      const step = job.steps![proof]!;
      expect(step.run).toContain('integrityCommands:4,exclusiveDataWritesDuringProof:true');
      expect(step.run).toContain('maxReads:3800000');
      expect(step.run).toContain(`--role ${role}`);
      expect(step.run).toContain('application-corpus-check.ts verify');
      expect(step.env?.CORPUS_PLAN_SHA256).toBe('${{ needs.build-worker.outputs.corpus_plan_sha256 }}');
      const sourceDownload = job.steps!.find(s => s.name === 'Download source-bound complete corpus proof inputs')!;
      expect(sourceDownload.with?.['digest-mismatch']).toBe('error');
      expect(sourceDownload.with?.name).toContain('github.run_attempt');
      expect(JSON.stringify(step)).not.toMatch(/npm ci|npm install|npm run/);
    }
  });

  it('bootstraps only a wholly new release trust set and rejects a broken protected-base copy', async () => {
    const preview = (parse(await readWorkflow('pr.yml')) as Workflow).jobs['preview-deploy']!;
    const selection = preview.steps!.find(step => step.name === 'Select release toolchain source')!.run!;
    const files = ['.github/actions/release-toolchain/action.yml', '.github/release-toolchain/package.json', '.github/release-toolchain/package-lock.json'];
    for (const [baseCount, candidatePresent, symbolicBase, expected] of [
      [0, true, false, 'introduction'], [3, true, false, 'base'],
      [1, true, false, null], [2, true, false, null],
      [0, false, false, null], [3, true, true, null],
    ] as const) {
      const directory = await mkdtemp(join(tmpdir(), 'theologai-release-selection-'));
      try {
        for (let index = 0; index < files.length; index++) {
          const path = join(directory, files[index]!);
          await mkdir(dirname(path), { recursive: true });
          if (candidatePresent) await writeFile(path, 'reviewed release tooling');
          if (index < baseCount) {
            const base = join(directory, 'release-control', files[index]!);
            await mkdir(dirname(base), { recursive: true });
            if (symbolicBase && index === 0) await symlink(path, base);
            else await writeFile(base, 'protected base release tooling');
          }
        }
        const output = join(directory, 'output');
        const result = spawnSync('bash', ['-e', '-c', selection], { cwd: directory, env: { ...process.env, GITHUB_OUTPUT: output } });
        expect(result.status === 0).toBe(expected !== null);
        if (expected !== null) expect(await readFile(output, 'utf8')).toBe(`source=${expected}\n`);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });

  it('preserves approved preview deployment and recovery without an SEC-06 migration gate', async () => {
    for (const [file, id] of [
      ['pr.yml', 'preview-deploy'], ['ccel-live-preview-canary.yml', 'canary'],
      ['restore-ccel-live-preview-canary.yml', 'restore'],
    ] as const) {
      const job = (parse(await readWorkflow(file)) as Workflow).jobs[id]!;
      const tools = job.steps!.findIndex(step => step.uses?.endsWith('/.github/actions/release-toolchain'));
      const cloud = job.steps!.findIndex(step => JSON.stringify(step).includes('secrets.CLOUDFLARE') || JSON.stringify(step).includes('secrets.CCEL_CANARY'));
      expect(JSON.stringify(job), file).not.toMatch(/require-preview-isolation|PREVIEW_DEPLOYMENT_ISOLATED|SEC-06/);
      expect(job.environment, file).toBeDefined();
      expect(tools, file).toBeGreaterThan(-1);
      expect(cloud, file).toBeGreaterThan(tools);
    }
    const production = parse(await readWorkflow('deploy.yml')) as Workflow;
    assertProductionBoundary(production);
    expect(JSON.stringify(production.jobs.deploy)).toContain('scripts/dual-era-preview-release-receipt.ts verify');
  });
  it('keeps local validation unprivileged and requires it before protected production', async () => {
    const workflow = parse(await readWorkflow('deploy.yml')) as Workflow;
    const validation = parse(await readWorkflow('validate.yml')) as Workflow;
    assertProductionBoundary(workflow);
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.on).toHaveProperty('workflow_dispatch');
    expect(workflow.concurrency).toEqual({ group: 'deploy-production', 'cancel-in-progress': false });
    for (const job of Object.values(validation.jobs)) {
      expect(job.environment).toBeUndefined();
      expect(JSON.stringify(job)).not.toMatch(/secrets\.|--remote\b|d1:remote/);
    }
    expect(validation.jobs['test-and-build']!.steps!.some(step => step.run === 'npm audit --omit=dev')).toBe(true);
    const deploy = workflow.jobs.deploy!;
    const commands = (deploy.steps ?? []).map(step => step.run ?? '').join('\n');
    expect(commands).not.toMatch(/npm run (?:test:coverage|test:integration|d1:seed:verify-workerd|build:db)/);
    expect(commands).toContain('scripts/production-deployment-plan.mjs verify');
    expect(commands).toContain('scripts/dual-era-preview-release-receipt.ts verify');
    const downloads = (deploy.steps ?? []).filter(step => step.uses?.startsWith('actions/download-artifact@'));
    expect(downloads.length).toBeGreaterThanOrEqual(2);
    for (const step of downloads) expect(step.with?.['digest-mismatch']).toBe('error');
    // Display names and serialization have no authority. A missing dependency does.
    const renamed = structuredClone(workflow);
    renamed.jobs.deploy!.name = 'Release';
    assertProductionBoundary(parse(stringify(renamed)) as Workflow);
    for (const dependency of ['verify-deployment-plan', 'verify-dual-era-preview', 'validate']) {
      const bypass = structuredClone(workflow);
      bypass.jobs.deploy!.needs = needs(bypass.jobs.deploy!).filter(value => value !== dependency);
      expect(() => assertProductionBoundary(bypass)).toThrow();
    }
    const unprotected = structuredClone(workflow);
    delete unprotected.jobs.deploy!.environment;
    expect(() => assertProductionBoundary(unprotected)).toThrow();
  });

  it('preserves required check names with explicit classification and safe omissions', async () => {
    const workflow = parse(await readWorkflow('pr.yml')) as Workflow;
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.on).toHaveProperty('schedule');
    expect(JSON.stringify(workflow.on.pull_request)).toContain('labeled');
    expect(workflow.jobs.classify!.if).toBeUndefined();
    const classifier = workflow.jobs.classify!.steps?.find(step => step.env?.CI_FORCE_FULL);
    expect(classifier?.env?.CI_FORCE_FULL).toContain("github.event.action == 'labeled'");
    expect(workflow.concurrency.group).toContain("format('validation-{0}', github.run_id)");
    const expected = {
      'test-and-build': 'Test & Build', 'fresh-checkout-data': 'Fresh Checkout & Data',
      'worker-runtime': 'Worker Runtime & D1', 'node-http-e2e': 'Node HTTP E2E',
      'mcp-conformance': 'Applicable MCP Conformance',
    };
    for (const [id, name] of Object.entries(expected)) {
      const job = workflow.jobs[id]!;
      expect(job.name).toBe(name);
      expect(needs(job)).toContain('classify');
      expect(job.if).toContain('!cancelled()');
      expect(job.if).not.toContain('always()');
      expect(job.environment).toBeUndefined();
      const guard = job.steps?.find(step => step.env?.CLASSIFIER_RESULT);
      expect(guard?.run).toBeDefined();
      for (const [result, selected, passes] of [
        ['success', 'true', true], ['success', 'false', true],
        ['failure', 'false', false], ['cancelled', 'true', false],
        ['skipped', 'false', false], ['success', '', false], ['success', 'unexpected', false],
      ] as const) {
        const run = spawnSync('bash', ['-e', '-c', guard!.run!], {
          env: { ...process.env, CLASSIFIER_RESULT: result, SELECTED: selected },
        });
        expect(run.status === 0, `${id}: ${result}/${selected}`).toBe(passes);
      }
    }
    const aggregate = workflow.jobs['validation-complete']!;
    expect(new Set(needs(aggregate))).toEqual(new Set(Object.keys(expected)));
    expect(aggregate.if).toContain('always()');
    const script = aggregate.steps![0]!.run!;
    for (const result of ['failure', 'cancelled', 'skipped', '']) {
      const run = spawnSync('bash', ['-e', '-c', script], { env: { ...process.env, RESULTS: `success,success,${result},success,success` } });
      expect(run.status).not.toBe(0);
    }
    expect(spawnSync('bash', ['-e', '-c', script], { env: { ...process.env, RESULTS: 'success,success,success,success,success' } }).status).toBe(0);
    const preview = workflow.jobs['preview-deploy']!;
    expect(needs(preview)).toContain('validation-complete');
    expect(preview.if).toContain("contains(github.event.pull_request.labels.*.name, 'deploy-preview')");
    expect(preview.if).toContain("github.event.action != 'labeled' || github.event.label.name == 'deploy-preview'");
    expect(preview.if).toContain('github.event.pull_request.head.repo.full_name == github.repository');
    expect(preview.concurrency).toEqual({ group: 'theologai-shared-preview-mutation', 'cancel-in-progress': false });
    expect(preview.environment).toMatchObject({ name: 'preview' });
    const steps = preview.steps!;
    const checkout = steps.findIndex(step => step.uses?.startsWith('actions/checkout@'));
    expect(checkout).toBeGreaterThan(0);
    expect(steps[checkout]!.with?.ref).toBe('${{ github.event.pull_request.head.sha }}');
    expect(steps[0]!.with?.script).toContain("if (!labels.includes('deploy-preview'))");
    expect(steps[0]!.with?.script).toContain('pullRequest.head.sha !== context.payload.pull_request.head.sha');
  });

  it('shares named validation suites without dropping data or transport proof', async () => {
    const action = parse(await readFile(new URL('../../../.github/actions/validate/action.yml', import.meta.url), 'utf8')) as { runs: { steps: Step[] } };
    const steps = action.runs.steps;
    const commands = (suite: string) => steps.filter(step => step.if === `inputs.suite == '${suite}'`).map(step => step.run).join('\n');
    const data = commands('data');
    expect(data).toContain('audit:release-corpus-capacity -- --output-database');
    expect(data).not.toContain('npm run build:db');
    // This release retains the deployed application/corpus. The later research
    // benchmark and its implementation are outside this security backport.
    for (const command of ['d1:seed:verify-workerd', 'd1:seed:verify-import', 'test:d1-readiness-generated-db', 'historical-section-compatibility-evidence.ts']) expect(data).toContain(command);
    const manifest = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
    for (const step of steps) {
      for (const match of (step.run ?? '').matchAll(/npm run ([a-zA-Z0-9:._-]+)/g)) {
        expect(manifest.scripts, match[1]).toHaveProperty(match[1]!);
      }
    }
    expect(commands('core')).toContain('test:coverage');
    expect(commands('core')).toContain('typecheck:worker-runtime');
    expect(commands('worker')).not.toContain('typecheck:worker-runtime');
    for (const command of ['test:worker-runtime', 'test:ccel-coordinator-runtime', 'test:worker-production-runtime', 'test:worker-bundle-ubs']) expect(commands('worker')).toContain(command);
    expect(commands('node')).toContain('npm run test:e2e');
    expect(commands('conformance')).toContain('npm run test:conformance');
    expect(commands('docs')).toContain('npm run docs:check');
  });

  it('characterizes preview revocation without inventing a routing oracle', async () => {
    const workflow = parse(await readWorkflow('preview-revocation.yml')) as Workflow;
    assertPreviewRevocationBoundary(workflow);

    // Display names and scalar wrapping are incidental; the policy expressions are not.
    const reformatted = structuredClone(workflow);
    reformatted.jobs['acknowledge-revocation']!.name = 'Record preview teardown';
    reformatted.jobs['acknowledge-revocation']!.steps![0]!.name = 'Acknowledge teardown';
    reformatted.jobs['acknowledge-revocation']!.steps![0]!.run =
      'echo   "Preview authorization was revoked; matching in-flight PR Checks runs were canceled."';
    assertPreviewRevocationBoundary(parse(stringify(reformatted, { lineWidth: 40 })) as Workflow);

    const unsafe = structuredClone(workflow);
    unsafe.jobs['acknowledge-revocation']!.if = unsafe.jobs['acknowledge-revocation']!.if!.replace(
      "github.event.action == 'closed'",
      "github.event.action == 'opened'",
    );
    expect(() => assertPreviewRevocationBoundary(unsafe)).toThrow();
    const wrongGroup = structuredClone(workflow);
    wrongGroup.concurrency.group = wrongGroup.concurrency.group.replace("format('pr-{0}'", "format('unrelated-{0}'");
    expect(() => assertPreviewRevocationBoundary(wrongGroup)).toThrow();
  });

  it('keeps the production rollback rehearsal manual, protected, fixed-target, and read-only', async () => {
    const workflow = await readWorkflow('production-rollback-rehearsal.yml');
    const trigger = uniqueBlock(workflow, 'on:');
    const concurrency = uniqueBlock(workflow, 'concurrency:');
    const job = uniqueBlock(workflow, '  rehearse:');
    expect(normalized(trigger)).toContain('on: workflow_dispatch: inputs:');
    expect(trigger).not.toMatch(/\n\s+(push|pull_request):/);
    expect(normalized(concurrency)).toBe('concurrency: group: deploy-production cancel-in-progress: false');
    expect(workflow).toContain('permissions:\n  contents: read');
    const preflight = uniqueBlock(workflow, '  preflight:');
    expect(preflight).toContain('name: Validate dispatch inputs (unprotected)');
    expect(preflight).toContain("test \"$DISPATCH_REF\" = 'refs/heads/main'");
    expect(preflight).toContain('grep -Eiq');
    expect(job).toContain('needs: [preflight, historical-local-gates]');
    expect(job).toContain("if: ${{ needs.preflight.result == 'success' && github.ref == 'refs/heads/main' }}");
    expect(job).toContain('environment:\n      name: production\n      deployment: false');
    expect(job).not.toContain('url:');
    expect(job).toContain('contents: read');
    for (const value of [
      '8da99fd0a161b90a4bd90ab29bde1abf796b3bf6',
      'a59d9a062b2e6c7884de97fd97309878e1cbdc23',
      '3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8',
      '291f3292-3fa9-44fc-bf6f-b68fd2f4cef6',
      'theologai-production-20260729-transform11-a',
      '53211f50-a893-4b4c-be1e-bc625a595dc7',
      'REHEARSE THE EXACT PR108 ROLLBACK WITHOUT TRAFFIC',
    ]) expect(workflow).toContain(value);
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('Capture production and preview controls before rehearsal (read-only)');
    expect(workflow).toContain('Capture production and preview controls after rehearsal (read-only)');
    expect(workflow).toContain('Upload sanitized rehearsal receipt only');
    expect(workflow).toContain('--config wrangler.release.toml --name theologai --dry-run --yes');
    expect([...workflow.matchAll(/wrangler versions deploy/g)]).toHaveLength(1);
    expect(workflow).toContain('CLOUDFLARE_READ_ONLY_API_TOKEN');
    expect(workflow).not.toContain('secrets.CLOUDFLARE_API_TOKEN');
    expect(workflow.match(/^\s+CLOUDFLARE_READ_ONLY_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_READ_ONLY_API_TOKEN \}\}$/gm)).toHaveLength(5);
    expect(workflow.match(/^\s+CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_READ_ONLY_API_TOKEN \}\}$/gm)).toHaveLength(5);
    expect(workflow).toContain('capture-bounded-command.mjs');
    expect(workflow).not.toContain('node_modules/.bin/tsx" "$GITHUB_WORKSPACE/scripts/capture-bounded-command');
    const installVerifier = uniqueBlock(job, '      - name: Install verifier dependencies');
    expect(installVerifier).toContain('uses: ./.github/actions/release-toolchain');
    expect(workflow).not.toContain('WRANGLER_LOG_PATH');
    expect(workflow).not.toMatch(/^\s*[^#\n]*>\s*["']?\$RUNNER_TEMP/m);
    for (const step of workflow.split('\n      - ')) {
      if (!/\bwrangler(?:\s|$)/.test(step)) continue;
      if (step.includes('name: Verify pinned Wrangler version')) continue;
      expect(step).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_READ_ONLY_API_TOKEN }}');
    }
    expect(workflow).toContain('target-deployment.json');
    expect(workflow).toContain('/workers/scripts/theologai/deployments/3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8');
    expect(workflow).toContain('all(.value == 0)');
    expect(workflow).toContain('deployment: false');
    expect(workflow).toContain('wrangler-version');
    const localGateStart = workflow.indexOf('      - name: Run historical PR108 local gates without credentials');
    const localGateEnd = workflow.indexOf('\n      - name:', localGateStart + 1);
    expect(localGateStart).toBeGreaterThan(0);
    const localGate = workflow.slice(localGateStart, localGateEnd);
    expect(localGate).not.toMatch(/CLOUDFLARE|secrets\.|--remote\b|d1:remote/i);
    const historicalCommands = [
      'npm ci --no-audit',
      'npm run build:db -- --output "$RUNNER_TEMP/pr108-theologai.db"',
      'npm run data:verify-db -- --database "$RUNNER_TEMP/pr108-theologai.db"',
      'npm run d1:seed:export -- --database "$RUNNER_TEMP/pr108-theologai.db" --clean',
      'npm run d1:seed:verify',
      'npm run d1:seed:verify-workerd',
      'npm run test:worker-production-runtime',
    ];
    let previousCommandIndex = -1;
    for (const command of historicalCommands) {
      expect(localGate).toContain(command);
      const commandIndex = localGate.indexOf(command);
      expect(commandIndex).toBeGreaterThan(previousCommandIndex);
      previousCommandIndex = commandIndex;
    }
    expect(localGate.match(/\$RUNNER_TEMP\/pr108-theologai\.db/g)).toHaveLength(3);
    expect(localGate).toContain('--clean');
    expect(workflow.match(/^          persist-credentials: false$/gm)).toHaveLength(4);
    expect(workflow).not.toMatch(/wrangler\s+rollback|versions\s+upload|wrangler\s+deploy(?!ments)/i);
    expect(workflow).not.toMatch(/d1\s+(execute|migrations|delete|create|update)|secret\s+(put|delete)|triggers\s+deploy/i);
    expect(workflow).not.toContain('github-token:');
  });

  it('documents the exact least-privilege token permissions and matched retention baseline', async () => {
    const runbook = await readFile(new URL('../../../docs/PRODUCTION-ROLLBACK-REHEARSAL.md', import.meta.url), 'utf8');
    expect(runbook).toContain('Workers Scripts Read');
    expect(runbook).toContain('D1 Read');
    expect(runbook).toContain('no additional permissions');
    expect(runbook).toContain('schema-`0009` is active');
    expect(runbook).toContain('PR #108 Transform-11');
    expect(runbook).toContain('PR #101 hierarchy');
  });
});
