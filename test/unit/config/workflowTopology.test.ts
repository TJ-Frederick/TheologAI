import { spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { readFile } from 'node:fs/promises';
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
    expect(workflow.jobs.classify!.if).toBeUndefined();
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
      expect(job.if).toContain('always()');
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
    for (const command of ['d1:seed:verify-workerd', 'd1:seed:verify-import', 'benchmark:primary-source-research', 'test:d1-readiness-generated-db', 'historical-section-compatibility-evidence.ts']) expect(data).toContain(command);
    expect(commands('core')).toContain('test:coverage');
    expect(commands('core')).toContain('typecheck:worker-runtime');
    expect(commands('worker')).not.toContain('typecheck:worker-runtime');
    for (const command of ['test:worker-runtime', 'test:ccel-coordinator-runtime', 'test:worker-production-runtime', 'test:worker-bundle-ubs']) expect(commands('worker')).toContain(command);
    expect(commands('node')).toContain('npm run test:e2e');
    expect(commands('conformance')).toContain('npm run test:conformance');
    expect(commands('docs')).toContain('npm run docs:check');
  });

  it('characterizes preview revocation without inventing a routing oracle', async () => {
    const workflow = await readWorkflow('preview-revocation.yml');
    const trigger = uniqueBlock(workflow, 'on:');
    const permissions = uniqueBlock(workflow, 'permissions: {}');
    const concurrency = uniqueBlock(workflow, 'concurrency:');
    const job = uniqueBlock(workflow, '  acknowledge-revocation:');

    expect(normalized(trigger)).toContain('pull_request: types: [closed, unlabeled, converted_to_draft, edited]');
    expect(trigger).not.toContain('branches:');
    expect(trigger).not.toContain('ready_for_review');
    expect(normalized(permissions)).toBe('permissions: {}');
    expect(normalized(concurrency)).toContain(REVOCATION_PREDICATE);
    expect(normalized(concurrency)).toContain("format('pr-{0}', github.event.pull_request.number)");
    expect(normalized(concurrency)).toContain("format('preview-revocation-noop-{0}', github.run_id)");
    expect(normalized(concurrency)).toContain('cancel-in-progress: >- ${{ ' + REVOCATION_PREDICATE + ' }}');

    expect(normalized(job)).toContain(`if: >- ${REVOCATION_PREDICATE}`);
    expect(job).toContain('name: Record Preview Revocation');
    expect(job).toContain('runs-on: ubuntu-latest');
    expect(job).toContain('timeout-minutes: 1');
    expect(job).not.toMatch(/environment:|secrets\.|upload-artifact/i);
    expect(occurrences(job, '      - name: Confirm active preview cancellation')).toBe(1);
    expect(job).toContain('run: echo "Preview authorization was revoked; matching in-flight PR Checks runs were canceled."');
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
    expect(job).toContain('needs: preflight');
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
    expect(installVerifier).toContain('node "$GITHUB_WORKSPACE/scripts/capture-bounded-command.mjs"');
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
    expect(workflow.match(/^          persist-credentials: false$/gm)).toHaveLength(2);
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
