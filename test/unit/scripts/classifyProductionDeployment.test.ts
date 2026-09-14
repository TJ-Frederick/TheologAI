import { releaseEligibility } from '../../../scripts/pr-release-eligibility.mjs';
import { classifyCiChanges } from '../../../scripts/classify-ci-changes.mjs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyProductionDeployment, collectGitClassification, parseNameStatusNul } from '../../../scripts/classify-production-deployment.mjs';
import {
  createProductionDeploymentPlan,
  productionDeploymentPlanSha256,
  serializeProductionDeploymentPlan,
  verifyProductionDeploymentPlan,
} from '../../../scripts/production-deployment-plan.mjs';

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
      succeeds: (...args: string[]) => { calls.push(args); return args[0] !== 'merge-base'; },
      diff: () => ({ ok: true, output: 'M\0docs/PLAN.md\0' }),
    });
    expect(result).toMatchObject({ classificationSucceeded: false, deployRequired: true, reason: 'before-is-not-ancestor' });
    expect(calls).toEqual([
      ['cat-file', '-e', `${before}^{commit}`], ['cat-file', '-e', `${after}^{commit}`], ['merge-base', '--is-ancestor', before, after],
    ]);
  });

});

describe('production deployment plan', () => {
  const script = fileURLToPath(new URL('../../../scripts/production-deployment-plan.mjs', import.meta.url));
  const plan = {
    schemaVersion: 1,
    artifactName: 'production-deployment-plan-123-attempt-2',
    run: { id: '123', attempt: '2', eventName: 'push', ref: 'refs/heads/main', head: after },
    releaseContext: { before, mode: 'push', forceDeploy: false, customDomainRequired: false, reason: 'push-before' },
    classification: {
      succeeded: true, deployRequired: false, decision: 'skip', reason: 'markdown-documentation-only',
      base: before, head: after, changedPathEvidence: [{ status: 'M', paths: ['docs/PLAN.md'] }],
    },
  };
  const golden = '{"schemaVersion":1,"artifactName":"production-deployment-plan-123-attempt-2","run":{"id":"123","attempt":"2","eventName":"push","ref":"refs/heads/main","head":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"releaseContext":{"before":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","mode":"push","forceDeploy":false,"customDomainRequired":false,"reason":"push-before"},"classification":{"succeeded":true,"deployRequired":false,"decision":"skip","reason":"markdown-documentation-only","base":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","head":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","changedPathEvidence":[{"status":"M","paths":["docs/PLAN.md"]}]}}\n';

  it('emits exact canonical one-LF bytes with a frozen digest and closed key order', () => {
    expect(serializeProductionDeploymentPlan(plan)).toBe(golden);
    expect(productionDeploymentPlanSha256(plan)).toBe('845b3e9f1834b09ebff8c0105bd96fc46d90061c8d9b5f58bdec387bedaa5dbe');
    expect(createProductionDeploymentPlan({
      classification: plan.classification,
      releaseContext: plan.releaseContext,
      run: plan.run,
      artifactName: plan.artifactName,
      schemaVersion: 1,
    })).toEqual(plan);
  });

  it('preserves classifier-authoritative zero-padded rename/copy scores in golden create and verify bytes', () => {
    const scoredPlan = {
      ...plan,
      artifactName: 'production-deployment-plan-321-attempt-4',
      run: { ...plan.run, id: '321', attempt: '4' },
      classification: {
        ...plan.classification,
        changedPathEvidence: [
          { status: 'R097', paths: ['docs/old.md', 'docs/new.md'] },
          { status: 'C095', paths: ['docs/source.md', 'docs/copy.md'] },
        ],
      },
    };
    const scoredGolden = '{"schemaVersion":1,"artifactName":"production-deployment-plan-321-attempt-4","run":{"id":"321","attempt":"4","eventName":"push","ref":"refs/heads/main","head":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"releaseContext":{"before":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","mode":"push","forceDeploy":false,"customDomainRequired":false,"reason":"push-before"},"classification":{"succeeded":true,"deployRequired":false,"decision":"skip","reason":"markdown-documentation-only","base":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","head":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","changedPathEvidence":[{"status":"R097","paths":["docs/old.md","docs/new.md"]},{"status":"C095","paths":["docs/source.md","docs/copy.md"]}]}}\n';
    const scoredDigest = 'd376b825708ea33d5c91eedfa40d0cd46392268a052fdf71e2d8a8a3e6f0dd0c';
    expect(serializeProductionDeploymentPlan(scoredPlan)).toBe(scoredGolden);
    expect(productionDeploymentPlanSha256(scoredPlan)).toBe(scoredDigest);
    expect(verifyProductionDeploymentPlan({
      planBytes: Buffer.from(scoredGolden),
      sha256Bytes: Buffer.from(`${scoredDigest}\n`),
      expected: {
        artifactName: scoredPlan.artifactName,
        sha256: scoredDigest,
        run: scoredPlan.run,
        releaseContext: scoredPlan.releaseContext,
      },
      classification: scoredPlan.classification,
    })).toMatchObject({
      artifactName: scoredPlan.artifactName,
      planSha256: scoredDigest,
      classificationSucceeded: true,
      deployRequired: false,
      decision: 'skip',
      changedPathEvidenceCount: 2,
    });
  });

  it('fails closed for missing, extra, mistyped, inconsistent, and unbounded plan fields', () => {
    const invalid = [
      { ...plan, schemaVersion: 2 },
      { ...plan, extra: true },
      { ...plan, run: { ...plan.run, id: 123 } },
      { ...plan, run: { ...plan.run, extra: true } },
      { ...plan, artifactName: 'production-deployment-plan-124-attempt-2' },
      { ...plan, releaseContext: { ...plan.releaseContext, forceDeploy: true } },
      { ...plan, classification: { ...plan.classification, decision: 'deploy' } },
      { ...plan, classification: { ...plan.classification, succeeded: false } },
      { ...plan, classification: { ...plan.classification, changedPathEvidence: [{ status: 'R100', paths: ['only-one.md'] }] } },
      { ...plan, classification: { ...plan.classification, changedPathEvidence: [{ status: 'R101', paths: ['docs/old.md', 'docs/new.md'] }] } },
      { ...plan, classification: { ...plan.classification, changedPathEvidence: [{ status: 'X', paths: ['docs/x.md'] }] } },
      { ...plan, classification: { ...plan.classification, changedPathEvidence: [{ status: 'M', paths: ['x'.repeat(4097)] }] } },
    ];
    for (const value of invalid) expect(() => serializeProductionDeploymentPlan(value)).toThrow();
  });

  it('rejects noncanonical bytes, missing LF, hash drift, identity drift, and failed classification', () => {
    const bytes = Buffer.from(golden);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const expected = { artifactName: plan.artifactName, sha256, run: plan.run, releaseContext: plan.releaseContext };
    expect(verifyProductionDeploymentPlan({ planBytes: bytes, sha256Bytes: Buffer.from(`${sha256}\n`), expected, classification: plan.classification })).toEqual({
      artifactName: plan.artifactName,
      planSha256: sha256,
      classificationSucceeded: true,
      deployRequired: false,
      decision: 'skip',
      reason: 'markdown-documentation-only',
      base: before,
      head: after,
      changedPathEvidenceCount: 1,
    });
    for (const [planBytes, sha256Bytes, overrides = expected, classification = plan.classification] of [
      [Buffer.from(golden.slice(0, -1)), Buffer.from(`${sha256}\n`)],
      [Buffer.from(` ${golden}`), Buffer.from(`${sha256}\n`)],
      [bytes, Buffer.from(`${'0'.repeat(64)}\n`)],
      [bytes, Buffer.from(`${sha256}\n`), { ...expected, artifactName: 'production-deployment-plan-999-attempt-2' }],
      [bytes, Buffer.from(`${sha256}\n`), expected, { ...plan.classification, changedPathEvidence: [] }],
    ] as const) expect(() => verifyProductionDeploymentPlan({ planBytes, sha256Bytes, expected: overrides, classification })).toThrow();
    const failedBytes = Buffer.from(serializeProductionDeploymentPlan({
      ...plan,
      classification: { ...plan.classification, succeeded: false, deployRequired: true, decision: 'deploy', reason: 'classifier-error' },
    }));
    const failedDigest = createHash('sha256').update(failedBytes).digest('hex');
    expect(() => verifyProductionDeploymentPlan({
      planBytes: failedBytes,
      sha256Bytes: Buffer.from(`${failedDigest}\n`),
      expected: { ...expected, sha256: failedDigest },
      classification: { ...plan.classification, succeeded: false, deployRequired: true, decision: 'deploy', reason: 'classifier-error' },
    })).toThrow('classification-did-not-succeed');
  });

  it('creates through stdout only and accepts exact manual-main semantics', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'theologai-plan-create-'));
    const manual = {
      ...plan,
      artifactName: 'production-deployment-plan-9-attempt-1',
      run: { id: '9', attempt: '1', eventName: 'workflow_dispatch', ref: 'refs/heads/main', head: after },
      releaseContext: { before, mode: 'manual', forceDeploy: true, customDomainRequired: true, reason: 'manual-main-dispatch' },
      classification: { succeeded: true, deployRequired: true, decision: 'deploy', reason: 'manual-main-dispatch', base: before, head: after, changedPathEvidence: [] },
    };
    const result = spawnSync(process.execPath, [script, 'create'], {
      cwd,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        PRODUCTION_PLAN_ARTIFACT_NAME: manual.artifactName,
        PRODUCTION_PLAN_RUN_ID: manual.run.id,
        PRODUCTION_PLAN_RUN_ATTEMPT: manual.run.attempt,
        PRODUCTION_PLAN_EVENT_NAME: manual.run.eventName,
        PRODUCTION_PLAN_REF: manual.run.ref,
        PRODUCTION_PLAN_HEAD: manual.run.head,
        PRODUCTION_PLAN_RELEASE_CONTEXT_JSON: JSON.stringify(manual.releaseContext),
        PRODUCTION_PLAN_CLASSIFICATION_SUCCEEDED: 'true',
        PRODUCTION_PLAN_DEPLOY_REQUIRED: 'true',
        PRODUCTION_PLAN_DECISION: 'deploy',
        PRODUCTION_PLAN_CLASSIFICATION_REASON: 'manual-main-dispatch',
        PRODUCTION_PLAN_BASE: before,
        PRODUCTION_PLAN_CLASSIFICATION_HEAD: after,
        PRODUCTION_PLAN_CHANGED_PATH_EVIDENCE_JSON: '[]',
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(serializeProductionDeploymentPlan(manual));
    expect(result.stderr).toBe('');
    expect(readdirSync(cwd)).toEqual([]);

    const directory = join(cwd, 'artifact');
    mkdirSync(directory);
    const manualBytes = serializeProductionDeploymentPlan(manual);
    const manualDigest = createHash('sha256').update(manualBytes).digest('hex');
    writeFileSync(join(directory, 'production-deployment-plan.json'), manualBytes);
    writeFileSync(join(directory, 'production-deployment-plan.sha256'), `${manualDigest}\n`);
    const verification = spawnSync(process.execPath, [script, 'verify', '--directory', directory], {
      cwd,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        EXPECTED_ARTIFACT_NAME: manual.artifactName,
        EXPECTED_SHA256: manualDigest,
        EXPECTED_RUN_ID: manual.run.id,
        EXPECTED_RUN_ATTEMPT: manual.run.attempt,
        EXPECTED_EVENT_NAME: manual.run.eventName,
        EXPECTED_REF: manual.run.ref,
        EXPECTED_HEAD: manual.run.head,
        EXPECTED_RELEASE_CONTEXT_JSON: JSON.stringify(manual.releaseContext),
      },
    });
    expect(verification.status).toBe(0);
    expect(JSON.parse(verification.stdout)).toMatchObject({
      artifactName: manual.artifactName,
      planSha256: manualDigest,
      classificationSucceeded: true,
      deployRequired: true,
      decision: 'deploy',
      reason: 'manual-main-dispatch',
      changedPathEvidenceCount: 0,
    });
  });

  it('verifies exactly two regular files and freshly reproduces the push classifier', () => {
    const repository = mkdtempSync(join(tmpdir(), 'theologai-plan-verify-'));
    execFileSync('git', ['init', '-q'], { cwd: repository });
    execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repository });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repository });
    mkdirSync(join(repository, 'docs'));
    writeFileSync(join(repository, 'docs/PLAN.md'), 'before\n');
    execFileSync('git', ['add', '.'], { cwd: repository });
    execFileSync('git', ['commit', '-qm', 'before'], { cwd: repository });
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
    writeFileSync(join(repository, 'docs/PLAN.md'), 'after\n');
    execFileSync('git', ['add', '.'], { cwd: repository });
    execFileSync('git', ['commit', '-qm', 'after'], { cwd: repository });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
    const artifactName = 'production-deployment-plan-7-attempt-3';
    const releaseContext = { before: base, mode: 'push', forceDeploy: false, customDomainRequired: false, reason: 'push-before' };
    const record = {
      schemaVersion: 1, artifactName,
      run: { id: '7', attempt: '3', eventName: 'push', ref: 'refs/heads/main', head },
      releaseContext,
      classification: { succeeded: true, deployRequired: false, decision: 'skip', reason: 'markdown-documentation-only', base, head, changedPathEvidence: [{ status: 'M', paths: ['docs/PLAN.md'] }] },
    };
    const directory = join(repository, 'artifact');
    mkdirSync(directory);
    const recordBytes = serializeProductionDeploymentPlan(record);
    const digest = createHash('sha256').update(recordBytes).digest('hex');
    writeFileSync(join(directory, 'production-deployment-plan.json'), recordBytes);
    writeFileSync(join(directory, 'production-deployment-plan.sha256'), `${digest}\n`);
    const env = {
      PATH: process.env.PATH,
      EXPECTED_ARTIFACT_NAME: artifactName,
      EXPECTED_SHA256: digest,
      EXPECTED_RUN_ID: '7',
      EXPECTED_RUN_ATTEMPT: '3',
      EXPECTED_EVENT_NAME: 'push',
      EXPECTED_REF: 'refs/heads/main',
      EXPECTED_HEAD: head,
      EXPECTED_RELEASE_CONTEXT_JSON: JSON.stringify(releaseContext),
    };
    const verify = () => spawnSync(process.execPath, [script, 'verify', '--directory', directory], { cwd: repository, env, encoding: 'utf8' });
    const success = verify();
    expect(success.status).toBe(0);
    expect(JSON.parse(success.stdout)).toEqual({ artifactName, planSha256: digest, classificationSucceeded: true, deployRequired: false, decision: 'skip', reason: 'markdown-documentation-only', base, head, changedPathEvidenceCount: 1 });
    expect(success.stderr).toBe('');

    writeFileSync(join(directory, 'extra.txt'), 'unexpected');
    expect(verify().status).not.toBe(0);
    unlinkSync(join(directory, 'extra.txt'));
    unlinkSync(join(directory, 'production-deployment-plan.sha256'));
    symlinkSync(join(directory, 'production-deployment-plan.json'), join(directory, 'production-deployment-plan.sha256'));
    expect(verify().status).not.toBe(0);
  });
});


describe('CI change selection', () => {
  it('keeps documentation checks while omitting unrelated serving and corpus work', () => {
    expect(classifyCiChanges('M\0docs/ROADMAP.md\0M\0README.md\0')).toMatchObject({ mode: 'docs', data: false, serving: false });
  });
  it('checks both sides of moves and defaults unknown ownership to full verification', () => {
    for (const path of ['src/kernel/cache.ts', 'src/adapters/d1/D1HistoricalDocumentRepository.ts', 'src/services/historical/LocalPrimarySourceSearchProvider.ts', 'scripts/build-database.ts', 'data/data-manifest.json', 'package-lock.json', '.github/workflows/pr.yml', 'new-area/file.ts']) {
      expect(classifyCiChanges(`M\0${path}\0`)).toMatchObject({ mode: 'full', data: true, serving: true });
      expect(classifyCiChanges(`R100\0${path}\0docs/old.md\0`)).toMatchObject({ mode: 'full' });
    }
    expect(classifyCiChanges('C100\0docs/plan.md\0src/kernel/plan.ts\0').data).toBe(true);
  });
  it('keeps all serving suites for positively identified serving changes', () => {
    expect(classifyCiChanges('M\0src/mcp/tools.ts\0M\0docs/PLAN.md\0')).toMatchObject({ mode: 'serving', serving: true, data: false });
    expect(classifyCiChanges('R100\0src/http/old.ts\0src/http/new.ts\0').serving).toBe(true);
  });
  it('binds CLI decisions to the actual merge checkout and PR head', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'theologai-ci-selection-'));
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=CI Test', '-c', 'user.email=ci@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();
    try {
      git('init', '-q', '-b', 'base');
      writeFileSync(join(cwd, 'README.md'), 'base');
      git('add', '.'); git('commit', '-qm', 'base');
      const base = git('rev-parse', 'HEAD');
      git('checkout', '-qb', 'candidate');
      writeFileSync(join(cwd, 'README.md'), 'candidate');
      git('add', '.'); git('commit', '-qm', 'candidate');
      const prHead = git('rev-parse', 'HEAD');
      git('checkout', '-q', 'base');
      git('merge', '--no-ff', '-qm', 'synthetic merge', 'candidate');
      const head = git('rev-parse', 'HEAD');
      const classifier = fileURLToPath(new URL('../../../scripts/classify-ci-changes.mjs', import.meta.url));
      const eligibility = fileURLToPath(new URL('../../../scripts/pr-release-eligibility.mjs', import.meta.url));
      const env = { ...process.env, CI_EXPECTED_HEAD: head, CI_PR_HEAD: prHead, CI_FORCE_FULL: 'false', CI_VALIDATION_RESULT: 'success', CI_PREVIEW_RESULT: 'skipped', GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '' };
      const run = (script: string, overrides = {}) => spawnSync(process.execPath, [script], { cwd, env: { ...env, ...overrides }, encoding: 'utf8' });
      const selected = run(classifier);
      expect(selected.status, selected.stderr).toBe(0);
      expect(JSON.parse(selected.stdout)).toMatchObject({ mode: 'docs', data: false });
      expect(run(eligibility).stdout.trim()).toBe('no-deployment-required');
      for (const script of [classifier, eligibility]) {
        expect(run(script, { CI_EXPECTED_HEAD: base }).status).not.toBe(0);
        expect(run(script, { CI_PR_HEAD: base }).status).not.toBe(0);
      }
      expect(JSON.parse(run(classifier, { CI_FORCE_FULL: 'true' }).stdout).mode).toBe('full');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  it('never uses malformed or absent evidence to silently omit checks', () => {
    for (const diff of ['M\0docs/PLAN.md', 'R100\0docs/a.md\0', 'X\0docs/a.md\0']) expect(() => classifyCiChanges(diff)).toThrow();
    expect(classifyCiChanges('').mode).toBe('full');
    expect(classifyCiChanges('M\0docs/PLAN.md\0', true).mode).toBe('full');
    expect(classifyCiChanges('M\0docs/new\nname.md\0').mode).toBe('full');
  });
});


describe('pre-merge release eligibility', () => {
  const candidate = { classified: true, deployRequired: true, validation: 'success', preview: 'success', sameTree: true };
  it('distinguishes no-release docs from candidates requiring preview proof', () => {
    expect(releaseEligibility({ ...candidate, deployRequired: false, preview: 'skipped' })).toBe('no-deployment-required');
    expect(releaseEligibility({ ...candidate, preview: 'skipped' })).toBe('protected-preview-required');
    expect(releaseEligibility(candidate)).toBe('ready-for-protected-release-verification');
  });
  it('never treats a failure, missing result or different merge tree as ready', () => {
    for (const validation of ['failure', 'cancelled', 'skipped', undefined]) expect(releaseEligibility({ ...candidate, validation })).toBe('validation-incomplete');
    for (const preview of ['failure', 'cancelled', undefined]) expect(releaseEligibility({ ...candidate, preview })).toBe('protected-preview-incomplete');
    expect(releaseEligibility({ ...candidate, classified: false })).toBe('validation-incomplete');
    expect(releaseEligibility({ ...candidate, sameTree: false })).toBe('merge-tree-differs-from-preview');
  });
});
