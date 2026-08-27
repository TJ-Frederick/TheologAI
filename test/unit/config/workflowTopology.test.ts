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

describe('workflow topology', () => {
  it('publishes and verifies one fail-closed production plan before the sole environment job', async () => {
    const workflow = await readWorkflow('deploy.yml');
    const trigger = uniqueBlock(workflow, 'on:');
    const concurrency = uniqueBlock(workflow, 'concurrency:');
    const jobs = uniqueBlock(workflow, 'jobs:');
    const classifier = uniqueBlock(workflow, '  classify-deployment:');
    const verifier = uniqueBlock(workflow, '  verify-deployment-plan:');
    const deploy = uniqueBlock(workflow, '  deploy:');
    const classifierOutputs = uniqueBlock(classifier, '    outputs:');
    const verifierOutputs = uniqueBlock(verifier, '    outputs:');

    expect(normalized(trigger)).toBe(normalized(`
      on:
        push:
          branches: [main]
        workflow_dispatch:
          inputs:
            reason:
              description: Short reason for the manual production deployment
              required: true
              type: string
    `));
    expect(normalized(concurrency)).toBe('concurrency: group: deploy-production cancel-in-progress: false');
    expect(occurrences(workflow, '  classify-deployment:')).toBe(1);
    expect(occurrences(workflow, '  verify-deployment-plan:')).toBe(1);
    expect(occurrences(workflow, '  deploy:')).toBe(1);
    expect([...jobs.matchAll(/^  ([a-z][a-z0-9-]+):$/gm)].map(match => match[1])).toEqual([
      'classify-deployment', 'verify-deployment-plan', 'deploy',
    ]);

    expect(classifier).toContain('name: Classify Production Deployment');
    expect(classifier).toContain('permissions:\n      contents: read');
    expect(classifier).toContain('fetch-depth: 0');
    expect(classifier).not.toMatch(/\n\s+environment:|secrets\.|wrangler|cloudflare|checks:\s*write/i);
    expect(normalized(classifierOutputs)).toBe(normalized(`
      outputs:
        artifact_name: \${{ steps.production-deployment-plan.outputs.artifact_name }}
        plan_sha256: \${{ steps.production-deployment-plan.outputs.plan_sha256 }}
    `));
    expect(classifier).toContain('PRODUCTION_RELEASE_EVENT_NAME: ${{ github.event_name }}');
    expect(classifier).toContain('PRODUCTION_RELEASE_REF: ${{ github.ref }}');
    expect(classifier).toContain('PRODUCTION_RELEASE_PUSH_BEFORE: ${{ github.event.before }}');
    expect(classifier).toContain('PRODUCTION_RELEASE_HEAD: ${{ github.sha }}');
    expect(classifier).toContain('PRODUCTION_RELEASE_FIRST_PARENT="$(git rev-parse HEAD^1)"');
    expect(classifier).toContain('release_context="$(node scripts/resolve-production-release-context.mjs)"');
    expect(classifier).toContain('Object.keys(value).length !== keys.length');
    expect(classifier).toContain('process.stdout.write(value.before);');
    expect(classifier).toContain("grep -Eq '^[0-9a-f]{40}$'");
    expect(classifier).toContain('git cat-file -e "${before}^{commit}"');
    expect(classifier).toContain('git merge-base --is-ancestor "$before" HEAD');
    expect(classifier).toContain('echo "reason=$selection_reason"');
    expect(classifier).toContain('--before "$before"');
    expect(classifier).toContain('--after "$PRODUCTION_RELEASE_HEAD"');
    const classifierRunSources = [...classifier.matchAll(/        run: \|\n([\s\S]*?)(?=\n      - |$)/g)].map(match => match[1]);
    expect(classifierRunSources.length).toBeGreaterThan(0);
    for (const runSource of classifierRunSources) expect(runSource).not.toMatch(/\$\{\{\s*github\./);
    expect(classifier).not.toContain('${{ inputs.reason }}');
    expect(classifier).toContain("GITHUB_STEP_SUMMARY='' node scripts/classify-production-deployment.mjs");
    expect(classifier).toContain('node scripts/production-deployment-plan.mjs create');
    expect(classifier).toContain('production-deployment-plan-${{ github.run_id }}-attempt-${{ github.run_attempt }}');
    expect(occurrences(classifier, '        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1')).toBe(1);
    expect(classifier).toContain('retention-days: 1');
    expect(classifier).toContain('compression-level: 0');
    expect(classifier).toContain('overwrite: false');
    expect(classifier).toContain('include-hidden-files: false');

    expect(verifier).toContain('name: Verify Production Deployment Plan');
    expect(verifier).toContain('needs: classify-deployment');
    expect(verifier).toContain('permissions:\n      contents: read');
    expect(verifier).toContain('fetch-depth: 0');
    expect(verifier).not.toMatch(/\n\s+environment:|secrets\.|upload-artifact|wrangler|cloudflare|checks:\s*write/i);
    expect(normalized(verifierOutputs)).toBe(normalized(`
      outputs:
        artifact_name: \${{ steps.verify.outputs.artifact_name }}
        plan_sha256: \${{ steps.verify.outputs.plan_sha256 }}
        deploy_required: \${{ steps.verify.outputs.deploy_required }}
        decision: \${{ steps.verify.outputs.decision }}
    `));
    expect(verifier).toContain('actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1');
    expect(verifier).toContain('name: ${{ needs.classify-deployment.outputs.artifact_name }}');
    expect(verifier).toContain('digest-mismatch: error');
    expect(verifier).toContain('node scripts/production-deployment-plan.mjs verify');
    expect(verifier).toContain('value.classificationSucceeded !== true');

    expect(deploy).toContain('needs: verify-deployment-plan');
    expect(deploy).toContain("if: ${{ github.ref == 'refs/heads/main' && needs.verify-deployment-plan.outputs.deploy_required == 'true' && needs.verify-deployment-plan.outputs.decision == 'deploy' }}");
    expect(deploy.slice(0, deploy.indexOf('    runs-on:'))).not.toContain('always()');
    expect(deploy).not.toContain('needs.classify-deployment');
    expect(deploy).toContain('environment:\n      name: production\n      url: https://mcp.theologai.xyz/mcp');
    expect(deploy).toContain('permissions:\n      contents: read');
    for (const command of [
      'npm run typecheck:node',
      'npm run typecheck:test-node',
      'npm run typecheck:test-scripts',
      'npm run typecheck:test-frozen-context-capacity',
      'npm run typecheck:release-scripts',
      'npm run typecheck:worker',
      'npm run typecheck:ccel-coordinator',
      'npm run typecheck:worker-runtime',
      'npm run typecheck:ccel-coordinator-test',
    ]) expect(deploy).toContain(command);
    expect(deploy).not.toContain('typecheck:test-fixtures');
    expect(occurrences(workflow, '      name: production')).toBe(1);
    expect(occurrences(workflow, '        uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1')).toBe(2);
    expect(workflow).not.toMatch(/checks:\s*write|github-token:|artifact-ids:|merge-multiple:\s*true|repository:|run-id:|pattern:/);
  });

  it('keeps the five PR checks and preview authorization boundary exact', async () => {
    const workflow = await readWorkflow('pr.yml');
    const trigger = uniqueBlock(workflow, 'on:');
    const permissions = uniqueBlock(workflow, 'permissions:');
    const expectedJobs = [
      ['  test-and-build:', 'Test & Build'],
      ['  fresh-checkout-data:', 'Fresh Checkout & Data'],
      ['  worker-runtime:', 'Worker Runtime & D1'],
      ['  node-http-e2e:', 'Node HTTP E2E'],
      ['  mcp-conformance:', 'Applicable MCP Conformance'],
    ] as const;
    const testAndBuild = uniqueBlock(workflow, '  test-and-build:');

    expect(normalized(trigger)).toBe(normalized(`
      on:
        pull_request:
          branches: [main]
          types: [opened, synchronize, reopened, labeled, ready_for_review]
    `));
    expect(normalized(permissions)).toBe('permissions: contents: read');
    expect([...workflow.matchAll(/^  ([a-z][a-z0-9-]+):$/gm)].map(match => match[1])).toEqual([
      'test-and-build', 'fresh-checkout-data', 'worker-runtime', 'node-http-e2e', 'mcp-conformance', 'preview-deploy',
    ]);
    for (const [anchor, name] of expectedJobs) {
      expect(uniqueBlock(workflow, anchor)).toContain(`name: ${name}`);
    }
    for (const command of [
      'npm run typecheck:test-node',
      'npm run typecheck:test-scripts',
      'npm run typecheck:test-frozen-context-capacity',
      'npm run typecheck:release-scripts',
      'npm run typecheck:worker-runtime',
      'npm run typecheck:ccel-coordinator-test',
    ]) {
      expect(testAndBuild).toContain(command);
    }
    expect(workflow).not.toContain('typecheck:test-fixtures');

    const freshCheckout = uniqueBlock(workflow, '  fresh-checkout-data:');
    expect(freshCheckout).toContain('fetch-depth: 2');
    expect(occurrences(freshCheckout, '      - name: Verify historical section-key lineage')).toBe(1);

    const preview = uniqueBlock(workflow, '  preview-deploy:');
    expect(preview).toContain('name: Deploy Preview');
    expect(preview).toContain('needs: [test-and-build, fresh-checkout-data, worker-runtime, node-http-e2e, mcp-conformance]');
    expect(normalized(preview)).toContain(normalized(`
      if: >-
        github.event.pull_request.state == 'open' &&
        github.event.pull_request.draft == false &&
        github.event.pull_request.base.ref == 'main' &&
        github.event.pull_request.head.repo.full_name == github.repository &&
        contains(github.event.pull_request.labels.*.name, 'deploy-preview')
    `));
    expect(preview).toContain('group: theologai-shared-preview-mutation\n      cancel-in-progress: false');
    expect(preview).toContain('environment:\n      name: preview\n      url: https://preview-mcp.theologai.xyz/mcp');
    expect(preview).toContain('permissions:\n      contents: read\n      pull-requests: write');
    const authorization = preview.indexOf('- name: Confirm live preview authorization before using environment secrets');
    const checkout = preview.indexOf('- uses: actions/checkout@');
    const setup = preview.indexOf('- uses: actions/setup-node@');
    expect(authorization).toBeGreaterThan(0);
    expect(checkout).toBeGreaterThan(authorization);
    expect(setup).toBeGreaterThan(checkout);
    expect(preview.slice(authorization, checkout)).toContain('github.rest.pulls.get');
    expect(preview.slice(authorization, checkout)).toContain("if (!labels.includes('deploy-preview'))");
    expect(preview.slice(checkout, setup)).toContain('ref: ${{ github.event.pull_request.head.sha }}');
    expect(preview.slice(checkout, setup)).toContain('- name: Verify preview checkout identity');
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
    expect(workflow).toContain('target-deployment.json');
    expect(workflow).toContain('/workers/scripts/theologai/deployments/3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8');
    expect(workflow).toContain('all(.value == 0)');
    expect(workflow).toContain('deployment: false');
    expect(workflow).toContain('wrangler-version');
    const localGateStart = workflow.indexOf('      - name: Run historical PR108 local gates without credentials');
    const localGateEnd = workflow.indexOf('\n      - name:', localGateStart + 1);
    expect(localGateStart).toBeGreaterThan(0);
    expect(workflow.slice(localGateStart, localGateEnd)).not.toMatch(/CLOUDFLARE|secrets\./);
    expect(workflow).not.toMatch(/wrangler\s+rollback|versions\s+upload|wrangler\s+deploy(?!ments)/i);
    expect(workflow).not.toMatch(/d1\s+(execute|migrations|delete|create|update)|secret\s+(put|delete)|triggers\s+deploy/i);
    expect(workflow).not.toContain('github-token:');
  });
});
