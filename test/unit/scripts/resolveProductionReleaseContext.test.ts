import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolveProductionReleaseContext } from '../../../scripts/resolve-production-release-context.mjs';

const SHA = 'a'.repeat(40);
const PARENT = 'b'.repeat(40);

describe('resolveProductionReleaseContext', () => {
  it('selects the immutable push baseline without affecting deployment classification', () => {
    const result = resolveProductionReleaseContext({ eventName: 'push', ref: 'refs/heads/main', pushBefore: SHA, firstParent: PARENT });
    expect(result).toEqual({
      before: SHA, mode: 'push', forceDeploy: false, customDomainRequired: false, reason: 'push-before',
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('forces a main-only manual release from the independently resolved first parent', () => {
    expect(resolveProductionReleaseContext({ eventName: 'workflow_dispatch', ref: 'refs/heads/main', pushBefore: SHA, firstParent: PARENT })).toEqual({
      before: PARENT, mode: 'manual', forceDeploy: true, customDomainRequired: true, reason: 'manual-main-dispatch',
    });
  });

  it.each([
    { eventName: 'workflow_dispatch', ref: 'refs/heads/feature/x', pushBefore: SHA, firstParent: PARENT },
    { eventName: 'workflow_dispatch', ref: 'refs/tags/v1', pushBefore: SHA, firstParent: PARENT },
    { eventName: 'push', ref: 'refs/heads/feature/x', pushBefore: SHA, firstParent: PARENT },
    { eventName: 'schedule', ref: 'refs/heads/main', pushBefore: SHA, firstParent: PARENT },
    { eventName: 'push', ref: 'refs/heads/main', pushBefore: 'A'.repeat(40), firstParent: PARENT },
    { eventName: 'workflow_dispatch', ref: 'refs/heads/main', pushBefore: SHA, firstParent: 'A'.repeat(40) },
    { eventName: 'push', ref: 'refs/heads/main', pushBefore: SHA, firstParent: PARENT, unexpected: true },
  ])('rejects unsupported or malformed input: %#', input => {
    expect(() => resolveProductionReleaseContext(input)).toThrow();
  });

  it('keeps the pure resolver independent of process environment and serializes one closed record in CLI mode', () => {
    const prior = process.env.PRODUCTION_RELEASE_EVENT_NAME;
    process.env.PRODUCTION_RELEASE_EVENT_NAME = 'schedule';
    expect(resolveProductionReleaseContext({ eventName: 'push', ref: 'refs/heads/main', pushBefore: SHA, firstParent: PARENT }).before).toBe(SHA);
    if (prior === undefined) delete process.env.PRODUCTION_RELEASE_EVENT_NAME;
    else process.env.PRODUCTION_RELEASE_EVENT_NAME = prior;

    const result = spawnSync(process.execPath, ['scripts/resolve-production-release-context.mjs'], {
      cwd: new URL('../../..', import.meta.url),
      encoding: 'utf8',
      env: {
        PRODUCTION_RELEASE_EVENT_NAME: 'workflow_dispatch',
        PRODUCTION_RELEASE_REF: 'refs/heads/main',
        PRODUCTION_RELEASE_PUSH_BEFORE: SHA,
        PRODUCTION_RELEASE_FIRST_PARENT: PARENT,
        PATH: process.env.PATH,
      },
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.split('\n').filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toEqual({ before: PARENT, mode: 'manual', forceDeploy: true, customDomainRequired: true, reason: 'manual-main-dispatch' });

    const push = spawnSync(process.execPath, ['scripts/resolve-production-release-context.mjs'], {
      cwd: new URL('../../..', import.meta.url),
      encoding: 'utf8',
      env: {
        PRODUCTION_RELEASE_EVENT_NAME: 'push',
        PRODUCTION_RELEASE_REF: 'refs/heads/main',
        PRODUCTION_RELEASE_PUSH_BEFORE: SHA,
        PRODUCTION_RELEASE_FIRST_PARENT: '',
        PATH: process.env.PATH,
      },
    });
    expect(push.status).toBe(0);
    expect(push.stderr).toBe('');
    expect(push.stdout.split('\n').filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(push.stdout)).toEqual({ before: SHA, mode: 'push', forceDeploy: false, customDomainRequired: false, reason: 'push-before' });

    const missing = spawnSync(process.execPath, ['scripts/resolve-production-release-context.mjs'], {
      cwd: new URL('../../..', import.meta.url),
      encoding: 'utf8',
      env: {
        PRODUCTION_RELEASE_EVENT_NAME: 'push',
        PRODUCTION_RELEASE_REF: 'refs/heads/main',
        PRODUCTION_RELEASE_FIRST_PARENT: PARENT,
        PATH: process.env.PATH,
      },
    });
    expect(missing.status).toBe(1);
    expect(missing.stdout).toBe('');
  });

  it('keeps process, Git, filesystem, and network concerns outside the pure resolver', async () => {
    const source = await readFile(new URL('../../../scripts/resolve-production-release-context.mjs', import.meta.url), 'utf8');
    const pureResolver = source.slice(source.indexOf('export function resolveProductionReleaseContext'), source.indexOf('const CLI_ENV'));
    expect(pureResolver).not.toMatch(/process\.|node:(?:child_process|fs)|\bfetch\s*\(|\bexec(?:File|Sync)?\s*\(|\bspawn(?:Sync)?\s*\(|\breadFile\s*\(/i);
    const cliAdapter = source.slice(source.indexOf('const CLI_ENV'));
    expect(cliAdapter).not.toMatch(/GITHUB_OUTPUT|GITHUB_STEP_SUMMARY|writeFile|appendFile/);
  });
});
