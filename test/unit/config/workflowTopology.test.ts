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

function routedName(name: string | undefined): string {
  if (!name?.startsWith('${{')) return name ?? '';
  return new Function('github', 'inputs', 'return (' + name.slice(3,-2) + ')')({event_name:'pull_request'}, {});
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

describe('workflow topology', () => {
  it('provides immutable baseline history to both core validation routes', async () => {
    for (const name of ['pr.yml', 'validate.yml']) {
      const workflow = parse(await readWorkflow(name)) as Workflow;
      const checkout = workflow.jobs['test-and-build']!.steps!.find(step => step.uses?.startsWith('actions/checkout@'))!;
      expect(checkout.with?.['fetch-depth'], name).toBe(0);
    }
  });
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
            const base = join(directory, 'test-output/release-control', files[index]!);
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

  it('preserves required check names with explicit classification and safe omissions', async () => {
    const workflow = parse(await readWorkflow('pr.yml')) as Workflow;
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.on).toHaveProperty('schedule');
    expect(JSON.stringify(workflow.on.pull_request)).toContain('labeled');
    expect(workflow.jobs.classify!.if).toContain('operator_authorization_json');
    const classifier = workflow.jobs.classify!.steps?.find(step => step.env?.CI_FORCE_FULL);
    expect(classifier?.env?.CI_FORCE_FULL).toContain("github.event.action == 'labeled'");
    expect(workflow.concurrency.group).toContain("format('validation-{0}', github.run_id)");
    const expected = {
      'test-and-build': 'Test & Build', 'fresh-checkout-data': 'Fresh Checkout & Data',
      'worker-runtime': 'Worker Runtime & D1', 'node-http-e2e': 'Node HTTP E2E',
      'mcp-conformance': 'Applicable MCP Conformance',
    };
    const action = parse(await readFile(new URL('../../../.github/actions/validate/action.yml', import.meta.url), 'utf8')) as { runs: { steps: Step[] } };
    const guard = action.runs.steps.find(step => step.env?.CLASSIFIER_RESULT);
    for (const [id, name] of Object.entries(expected)) {
      const job = workflow.jobs[id]!;
      expect(routedName(job.name)).toBe(name);
      expect(needs(job)).toContain('classify');
      expect(job.if).toContain('!cancelled()');
      expect(job.if).not.toContain('always()');
      expect(job.environment).toBeUndefined();
      const invocation = job.steps!.find(step => step.uses === './.github/actions/validate')!;
      expect(invocation.with?.['classifier-result']).toBe('${{ needs.classify.result }}');
      expect(job.steps!.filter(step => step.uses === './.github/actions/validate')).toHaveLength(1);
      expect(Object.values(workflow.jobs).filter(value => routedName(value.name) === name)).toHaveLength(1);
      expect(guard?.run).toBeDefined();
      for (const [result, selected, passes] of [
        ['success', 'true', true], ['success', 'false', true],
        ['failure', 'false', false], ['cancelled', 'true', false],
        ['skipped', 'false', false], ['success', '', false], ['success', 'unexpected', false],
      ] as const) {
        const run = spawnSync('bash', ['-e', '-c', guard!.run!], {
          env: { ...process.env, CLASSIFIER_RESULT: result, SELECTED: selected, SUITE: 'data', MODE: selected === 'false' ? 'serving' : 'full' },
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
  });
  it('shares named validation suites without dropping data or transport proof', async () => {
    const action = parse(await readFile(new URL('../../../.github/actions/validate/action.yml', import.meta.url), 'utf8')) as { runs: { steps: Step[] } };
    const steps = action.runs.steps;
    const commands = (suite: string) => steps.filter(step => step.if === `inputs.selected == 'true' && inputs.suite == '${suite}'`).map(step => step.run).join('\n');
    const data = commands('data');
    expect(data).toContain('npm run audit:release-corpus-capacity -- --output-database "$RUNNER_TEMP/theologai.db"');
    expect(data).not.toContain('npm run build:db');
    expect(data.match(/npm run d1:seed:export /g)).toHaveLength(2);
    expect(data.match(/npm run d1:seed:verify\n/g)).toHaveLength(2);
    expect(data).toContain('cmp "$RUNNER_TEMP/d1-seed-manifest.json" scripts/d1-seed/seed-manifest.json');
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


describe('ordinary release paths', () => {
  it.each([
    ['pr.yml', 'preview-deploy', 'preview'],
    ['deploy.yml', 'deploy', 'production'],
  ])('requires source-bound proof, one cutover and role-specific acceptance in %s', async (file, id, role) => {
    const workflow = parse(await readWorkflow(file)) as Workflow;
    const job = workflow.jobs[id]!;
    expect(job.environment).toMatchObject({ name: role });
    expect(job.permissions).toEqual({ contents: 'read', actions: 'read', 'pull-requests': 'read' });
    const steps = job.steps!;
    const required = [
      'Verify immutable Worker and candidate configuration', 'Retain matched predecessor before mutation',
      'Complete source-bound corpus verification', 'Retain verified corpus before cutover',
      'Deploy the verified Worker once', 'Confirm active Worker and D1 binding', 'Run two-protocol release smoke',
      'Run full corpus acceptance in both protocol versions', 'Confirm final routing and environment isolation',
    ];
    let previous = -1;
    for (const name of required) {
      const index = steps.findIndex(step => step.name === name);
      expect(index, name).toBeGreaterThan(previous);
      previous = index;
    }
    expect(steps.find(step => step.name === required[2])?.if).toContain('corpus');
    expect(steps.find(step => step.name === required[6])?.if).toContain("== 'application'");
    expect(steps.find(step => step.name === required[7])?.if).toContain("== 'corpus'");
    expect(steps.filter(step => step.run?.includes('release-workers.sh deploy '))).toHaveLength(1);
    expect(steps.find(step => step.run?.includes('release-workers.sh reconcile '))?.if).toMatch(/failure\(\).*cancelled\(\)/);
    expect(steps.find(step => step.name === 'Retain sanitized release evidence')?.if).toBe('always()');
    const source = JSON.stringify(workflow);
    expect(source).not.toMatch(/preview_restore_json|preview_validate_existing_json|runtime-preview-handoff|scoped-response-diagnostic/);
    if (role === 'production') {
      expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
      expect(needs(job)).toEqual(expect.arrayContaining(['validate', 'verify-preview', 'operator-authorization']));
      expect(steps.find(step => step.name?.includes('current main and accepted preview'))?.with?.script).toContain('pin.workerArtifactId');
    } else {
      expect(needs(job)).toEqual(expect.arrayContaining(['validation-complete', 'build-worker', 'operator-proof-source']));
      expect(job.concurrency).toEqual({group:'theologai-shared-preview-mutation','cancel-in-progress':false});
      const build = workflow.jobs['build-worker']!;
      expect(build.environment).toBeUndefined();
      expect(JSON.stringify(build)).toContain('release-acceptance.ts');
      expect(JSON.stringify(build)).not.toContain('secrets.');
    }
  });
});
