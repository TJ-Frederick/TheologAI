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
  it('keeps production classification isolated and deployment fail-open behind production', async () => {
    const workflow = await readWorkflow('deploy.yml');
    const trigger = uniqueBlock(workflow, 'on:');
    const concurrency = uniqueBlock(workflow, 'concurrency:');
    const classifier = uniqueBlock(workflow, '  classify-deployment:');
    const deploy = uniqueBlock(workflow, '  deploy:');
    const outputs = uniqueBlock(classifier, '    outputs:');

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
    expect(occurrences(workflow, '  deploy:')).toBe(1);

    expect(classifier).toContain('name: Classify Production Deployment');
    expect(classifier).toContain('permissions:\n      contents: read');
    expect(classifier).toContain('fetch-depth: 0');
    expect(classifier).not.toMatch(/\n\s+environment:|secrets\.|wrangler|cloudflare/i);
    expect(normalized(outputs)).toBe(normalized(`
      outputs:
        classification_succeeded: \${{ steps.classify.outputs.classification_succeeded }}
        deploy_required: \${{ steps.classify.outputs.deploy_required }}
        decision: \${{ steps.classify.outputs.decision }}
        reason: \${{ steps.classify.outputs.reason }}
        base: \${{ steps.classify.outputs.base }}
        head: \${{ steps.classify.outputs.head }}
        changed_path_evidence_json: \${{ steps.classify.outputs.changed_path_evidence_json }}
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
    expect(classifier).not.toMatch(/run:\s*\|[\s\S]*?\$\{\{\s*github\./);
    expect(classifier).not.toContain('${{ inputs.reason }}');

    expect(deploy).toContain('needs: classify-deployment');
    expect(deploy).toContain("if: ${{ always() && github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || needs.classify-deployment.result != 'success' || needs.classify-deployment.outputs.classification_succeeded != 'true' || needs.classify-deployment.outputs.deploy_required != 'false') }}");
    expect(deploy).toContain('environment:\n      name: production\n      url: https://mcp.theologai.xyz/mcp');
    expect(deploy).toContain('permissions:\n      contents: read');
    expect(occurrences(workflow, '      name: production')).toBe(1);
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
});
