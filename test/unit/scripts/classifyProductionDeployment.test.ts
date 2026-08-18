import { describe, expect, it } from 'vitest';
import { classifyProductionDeployment, collectGitClassification, parseNameStatusNul } from '../../../scripts/classify-production-deployment.mjs';
import { readFile } from 'node:fs/promises';

const before = 'a'.repeat(40);
const after = 'b'.repeat(40);
const input = (output: string) => ({ before, after, head: after, beforeExists: true, afterExists: true, beforeIsAncestor: true, diff: { ok: true as const, output } });
const classify = (output: string) => classifyProductionDeployment(input(output));

describe('production deployment classifier', () => {
  it('skips only safe Markdown documentation A/M/D changes and safe-safe renames', () => {
    for (const output of [
      'A\0README.md\0M\0docs/PLAN.md\0D\0CHANGELOG.md\0',
      'R100\0docs/old.md\0docs/new.md\0',
      'C100\0docs/source.md\0docs/copy.md\0',
    ]) expect(classify(output)).toMatchObject({ classificationSucceeded: true, deployRequired: false, reason: 'markdown-documentation-only' });
  });

  it('requires deployment for cross-boundary moves, runtime deletion, mixed changes, and release inputs', () => {
    for (const output of [
      'R100\0src/runtime.ts\0docs/runtime.md\0', 'R100\0docs/runtime.md\0src/runtime.ts\0', 'C100\0docs/runtime.md\0src/runtime.ts\0', 'D\0src/runtime.ts\0',
      'M\0docs/PLAN.md\0M\0src/server.ts\0', 'M\0.github/workflows/deploy.yml\0', 'M\0package.json\0',
      'M\0scripts/release.ts\0', 'M\0wrangler.toml\0', 'M\0data/input.json\0', 'M\0test/unit/example.test.ts\0',
      'M\0skills/word-study/SKILL.md\0', 'M\0LICENSE\0', 'M\0docs/not-markdown.json\0',
    ]) expect(classify(output)).toMatchObject({ classificationSucceeded: true, deployRequired: true });
  });

  it('fails safe for malformed and unknown name-status records', () => {
    for (const output of ['X\0docs/PLAN.md\0', 'R100\0docs/only-one.md\0', 'R101\0docs/one.md\0docs/two.md\0', '\0docs/PLAN.md\0', 'M\0docs/PLAN.md', 'R100\0docs/old.md\0docs/new.md']) {
      expect(classify(output)).toMatchObject({ classificationSucceeded: false, deployRequired: true });
    }
    expect(() => parseNameStatusNul('Q\0docs/PLAN.md\0')).toThrow('malformed-status:Q');
  });

  it('keeps NUL framing intact for filenames containing tabs or newlines', () => {
    expect(classify('M\0docs/tab\tname.md\0')).toMatchObject({ deployRequired: false });
    expect(classify('M\0docs/new\nname.md\0')).toMatchObject({ deployRequired: true });
  });

  it('fails safe when Git identity, ancestry, or diff validation is ambiguous', () => {
    const cases = [
      { before: '0'.repeat(40) }, { before: 'not-a-sha' }, { after: 'not-a-sha' }, { head: before },
      { beforeExists: false }, { afterExists: false }, { beforeIsAncestor: false }, { diff: { ok: false, error: 'exit-128' } },
    ];
    for (const overrides of cases) {
      const result = classifyProductionDeployment({ ...input('M\0docs/PLAN.md\0'), ...overrides });
      expect(result).toMatchObject({ classificationSucceeded: false, deployRequired: true });
    }
  });

  it('treats PR #123’s docs-and-tests diff as deploy-required while retaining a docs-only fixture', () => {
    expect(classify('M\0README.md\0M\0docs/PHASE-3B-PLAN.md\0M\0test/unit/docs/publicContract.test.ts\0M\0test/unit/scripts/ccelLivePreviewCanary.test.ts\0')).toMatchObject({ deployRequired: true });
    expect(classify('M\0docs/PHASE-3B-PLAN.md\0')).toMatchObject({ classificationSucceeded: true, deployRequired: false });
  });

  it('provides a dependency-free CLI seam that fails safe when a Git command fails', () => {
    const calls: string[][] = [];
    const result = collectGitClassification(before, after, after, {
      succeeds: (...args) => { calls.push(args); return args[0] !== 'merge-base'; },
      diff: () => ({ ok: true, output: 'M\0docs/PLAN.md\0' }),
    });
    expect(result).toMatchObject({ classificationSucceeded: false, deployRequired: true, reason: 'before-is-not-ancestor' });
    expect(calls).toEqual([
      ['cat-file', '-e', `${before}^{commit}`], ['cat-file', '-e', `${after}^{commit}`], ['merge-base', '--is-ancestor', before, after],
    ]);
  });

  it('keeps the workflow fail-safe, manual-deploy defaults, and classifier isolation wired', async () => {
    const workflow = await readFile(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
    const prWorkflow = await readFile(new URL('../../../.github/workflows/pr.yml', import.meta.url), 'utf8');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('reason:');
    expect(workflow).toContain('required: true');
    expect(workflow).toContain('classify-deployment:');
    expect(workflow).toContain('fetch-depth: 0');
    const classifier = workflow.slice(workflow.indexOf('  classify-deployment:'), workflow.indexOf('\n  deploy:'));
    const deploy = workflow.slice(workflow.indexOf('  deploy:'));
    expect(classifier).toContain('if [ "$GITHUB_EVENT_NAME" = \'workflow_dispatch\' ]; then');
    expect(classifier).toContain('if [ "$GITHUB_REF" != \'refs/heads/main\' ]; then');
    expect(classifier).not.toMatch(/run:\s*\|[\s\S]*?github\.ref/);
    expect(classifier).toContain('exit 1');
    expect(classifier).toContain('manual-main-dispatch');
    expect(classifier).toContain('before="$(git rev-parse HEAD^1)"');
    expect(classifier).toContain("grep -Eq '^[0-9a-fA-F]{40}$'");
    expect(classifier).toContain("echo 'decision=deploy'");
    expect(classifier).toContain('echo "base=$before"');
    expect(classifier).toContain('>> "$GITHUB_STEP_SUMMARY"');
    expect(workflow).toContain('decision: ${{ steps.classify.outputs.decision }}');
    expect(deploy).toContain('needs: classify-deployment');
    expect(deploy).toContain("if: ${{ always() && github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || needs.classify-deployment.result != 'success' || needs.classify-deployment.outputs.classification_succeeded != 'true' || needs.classify-deployment.outputs.deploy_required != 'false') }}");
    // This exact truth table is the workflow condition above: only an
    // explicit successful push classifier result of false skips deployment.
    const runs = (event: 'push' | 'workflow_dispatch', ref: string, result: string, succeeded: string | undefined, required: string | undefined) =>
      ref === 'refs/heads/main' && (event === 'workflow_dispatch' || result !== 'success' || succeeded !== 'true' || required !== 'false');
    expect(runs('push', 'refs/heads/main', 'success', 'true', 'false')).toBe(false);
    expect(runs('push', 'refs/heads/main', 'failure', undefined, undefined)).toBe(true);
    expect(runs('push', 'refs/heads/main', 'success', undefined, undefined)).toBe(true);
    expect(runs('push', 'refs/heads/main', 'success', 'true', 'malformed')).toBe(true);
    expect(runs('workflow_dispatch', 'refs/heads/main', 'success', 'true', 'false')).toBe(true);
    expect(runs('workflow_dispatch', 'refs/heads/feature', 'failure', undefined, undefined)).toBe(false);
    expect(runs('workflow_dispatch', 'refs/tags/v3.6.0', 'failure', undefined, undefined)).toBe(false);
    expect(workflow).toContain('Resolve production release comparison context');
    expect(workflow).toContain('before="$(git rev-parse HEAD^1)"');
    expect(workflow).toContain('custom_domain_required=true');
    // Push preserves its exact event base only while resolving the shared
    // context; later production guards consume that context output instead.
    expect(deploy.match(/github\.event\.before/g)).toHaveLength(1);
    expect(deploy).toContain('PREVIOUS_MAIN_SHA: ${{ steps.production-release-context.outputs.before }}');
    expect(deploy).toContain('before="${{ steps.production-release-context.outputs.before }}"');
    for (const check of ['Test & Build', 'Fresh Checkout & Data', 'Worker Runtime & D1', 'Node HTTP E2E', 'Applicable MCP Conformance']) {
      expect(prWorkflow).toContain(`name: ${check}`);
    }
  });
});
