import { describe, expect, it } from 'vitest';
import { classifyProductionDeployment, collectGitClassification, parseNameStatusNul } from '../../../scripts/classify-production-deployment.mjs';

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

});
