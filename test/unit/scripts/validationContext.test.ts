import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const cli = resolve('.github/scripts/validation-context.cjs');
const classify = resolve('scripts/classify-ci-changes.mjs');
const action = parse(readFileSync('.github/actions/validate/action.yml', 'utf8'));
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'validation-context-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(cwd, 'base'), 'base'); git('add', '.'); git('commit', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  git('checkout', '-b', 'different-successor'); writeFileSync(join(cwd, 'candidate-file'), 'head'); git('add', '.'); git('commit', '-m', 'head');
  const head = git('rev-parse', 'HEAD'); git('checkout', 'main'); git('merge', '--no-ff', 'different-successor', '-m', 'merge');
  const merge = git('rev-parse', 'HEAD');
  const env = { ...process.env, CI_SUITE: 'worker', CI_EXPECTED_HEAD: merge, CI_EVENT_NAME: 'pull_request', CI_PR_HEAD: head, CI_REF: 'refs/pull/172/merge', CI_LINEAGE_BEFORE: '' };
  return { cwd, git, base, head, merge, env, run: (extra = {}, file = cli) => spawnSync(process.execPath, [file], { cwd, env: { ...env, ...extra }, encoding: 'utf8' }) };
}

describe('validation checkout CLI', () => {
  it('exports the exact synthetic merge first parent through the real CLI output', () => {
    const f = fixture(); try {
      const output = join(f.cwd, 'outputs'); const r = f.run({ GITHUB_OUTPUT: output });
      expect(r.status, r.stderr).toBe(0); expect(JSON.parse(r.stdout)).toEqual({ head: f.merge, baseline: f.base });
      expect(readFileSync(output, 'utf8')).toBe(`baseline=${f.base}\n`);
    } finally { rmSync(f.cwd, { recursive: true, force: true }); }
  });
  it('validates actual production checkout and canonical first parent, never merely ancestry', () => {
    const f = fixture(); try {
      const env = { CI_EVENT_NAME: 'workflow_dispatch', CI_REF: 'refs/heads/main', CI_LINEAGE_BEFORE: f.base };
      expect(f.run(env).status).toBe(0);
      expect(f.run({ ...env, CI_LINEAGE_BEFORE: f.head }).status).toBe(1);
      expect(f.run({ ...env, CI_REF: 'refs/heads/other' }).status).toBe(1);
      expect(f.run({ CI_EVENT_NAME: 'schedule' }).status).toBe(0);
    } finally { rmSync(f.cwd, { recursive: true, force: true }); }
  });
  for (const fault of ['checkout', 'head', 'missing-head', 'event', 'baseline', 'shallow', 'not-merge']) it('fails early for ' + fault, () => {
    const f = fixture(); try {
      const extra: Record<string, string> = {};
      if (fault === 'checkout') extra.CI_EXPECTED_HEAD = f.head;
      if (fault === 'head') extra.CI_PR_HEAD = f.base;
      if (fault === 'missing-head') extra.CI_PR_HEAD = 'f'.repeat(40);
      if (fault === 'event') extra.CI_EVENT_NAME = 'push';
      if (fault === 'baseline') extra.CI_SUITE = 'core';
      if (fault === 'shallow') { extra.CI_SUITE = 'data'; writeFileSync(join(f.cwd, '.git/shallow'), f.merge + '\n'); }
      if (fault === 'not-merge') { f.git('checkout', f.head); extra.CI_EXPECTED_HEAD = f.head; }
      expect(f.run(extra).status).toBe(1);
    } finally { rmSync(f.cwd, { recursive: true, force: true }); }
  });
  it('provides all immutable baseline objects to core checks in the real checkout', () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const result = spawnSync(process.execPath, [cli], { encoding: 'utf8', env: { ...process.env, CI_SUITE: 'core', CI_EXPECTED_HEAD: head, CI_EVENT_NAME: 'schedule', CI_LINEAGE_BEFORE: '' } });
    expect(result.status, result.stderr).toBe(0);
  });
  it('requires exact PR parents even when label/manual selection forces full validation', () => {
    const f = fixture(); try {
      const result = f.run({ CI_FORCE_FULL: 'true' }, classify); expect(result.status, result.stderr).toBe(0);
      expect(f.run({ CI_FORCE_FULL: 'true', CI_PR_HEAD: f.base }, classify).status).toBe(1);
    } finally { rmSync(f.cwd, { recursive: true, force: true }); }
  });
});

describe('shared validation execution guards', () => {
  const guard = action.runs.steps.find((s: { name: string }) => s.name === 'Validate requested suite').run;
  for (const [suite, mode, selected, pass] of [
    ['docs', 'docs', 'true', true], ['data', 'docs', 'false', true], ['worker', 'serving', 'true', true],
    ['data', 'serving', 'false', true], ['core', 'full', 'true', true], ['data', 'full', 'false', false],
    ['core', 'nonsense', 'true', false], ['docs', 'full', 'true', false], ['data', 'full', '', false],
  ] as const) it(`validates explicit ${suite}/${mode}/${selected}`, () => {
    const r = spawnSync('bash', ['-e', '-c', guard], { encoding: 'utf8', env: { ...process.env, CLASSIFIER_RESULT: 'success', SUITE: suite, MODE: mode, SELECTED: selected } });
    expect(r.status === 0).toBe(pass);
  });
  for (const failing of ['strict', 'production']) it('stops before expensive suites when ' + failing + ' audit fails', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'validation-audit-')); try {
      mkdirSync(join(cwd, 'bin')); const log = join(cwd, 'calls');
      writeFileSync(join(cwd, 'bin/npm'), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$CALL_LOG"\nif [[ "$*" == "$FAIL_COMMAND" ]]; then exit 1; fi\n', { mode: 0o755 });
      const core = action.runs.steps.find((s: { name: string }) => s.name === 'Run core validation').run;
      const r = spawnSync('bash', ['-e', '-c', core], { cwd, env: { ...process.env, PATH: join(cwd, 'bin') + ':' + process.env.PATH, CALL_LOG: log, FAIL_COMMAND: failing === 'strict' ? 'run audit:dependencies:high' : 'audit --omit=dev' } });
      expect(r.status).toBe(1); expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(failing === 'strict' ? ['run audit:dependencies:high'] : ['run audit:dependencies:high', 'audit --omit=dev']);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  it('orders checkout preflight before installation and keeps deterministic full data proof', () => {
    const steps = action.runs.steps;
    expect(steps.findIndex((s: { id: string }) => s.id === 'context')).toBeLessThan(steps.findIndex((s: { run: string }) => s.run === 'npm ci --no-audit'));
    const data = steps.find((s: { name: string }) => s.name === 'Run data validation').run;
    expect(data.match(/npm run d1:seed:export /g)).toHaveLength(2);
    expect(data).toContain('cmp "$RUNNER_TEMP/d1-seed-manifest.json" scripts/d1-seed/seed-manifest.json');
  });
});
