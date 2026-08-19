import { spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const setupPath = join(repositoryRoot, 'test', 'setup.ts');
const vitestCliPath = join(repositoryRoot, 'node_modules', 'vitest', 'vitest.mjs');
const childTimeoutMs = 20_000;
const childOutputLimitBytes = 8 * 1024;

const hostileKeys = [
  'ESV_API_KEY',
  'THEOLOGAI_TEST_DOTENV_SENTINEL',
  'THEOLOGAI_TEST_DATABASE_PATH',
  'WRANGLER_BIN',
  'CI',
  'THEOLOGAI_TEST_GENERIC_API_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'THEOLOGAI_TEST_FEATURE_FLAG',
  'DOTENV_CONFIG_PATH',
  'DOTENV_CONFIG_OVERRIDE',
] as const;

const hostileKeysThatMustRemainAbsent = hostileKeys.filter((key) => key !== 'ESV_API_KEY');

type ChildResult = 'passed' | 'child-config' | 'child-setup' | 'child-module' | 'child-no-probe' | 'child-exit' | 'child-error' | 'child-timeout' | 'child-output-limit';

function boundedChildFailureCode(output: string): ChildResult {
  if (output.includes('Failed to load config')) return 'child-config';
  if (output.includes('setup.ts')) return 'child-setup';
  if (output.includes('Cannot find module') || output.includes("Cannot find package 'vitest'")) return 'child-module';
  if (output.includes('No test files found')) return 'child-no-probe';
  return 'child-exit';
}

function minimalChildEnvironment(inheritedEsv: boolean): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
  };

  if (inheritedEsv) environment.ESV_API_KEY = 'inherited-synthetic-esv';
  return environment;
}

async function runHostileDotenvCase(name: string, inheritedEsv: boolean): Promise<ChildResult> {
  const root = await mkdtemp(join(tmpdir(), 'theologai-d4-unit-env-'));
  const configPath = join(root, 'vitest.config.mts');
  const probePath = join(root, 'environment-isolation.probe.test.ts');
  const dotenvPath = join(root, '.env');

  try {
    await writeFile(dotenvPath, [
      'ESV_API_KEY=hostile-synthetic-esv',
      'THEOLOGAI_TEST_DOTENV_SENTINEL=hostile',
      'THEOLOGAI_TEST_DATABASE_PATH=hostile.sqlite',
      'WRANGLER_BIN=hostile-wrangler',
      'CI=hostile-ci',
      'THEOLOGAI_TEST_GENERIC_API_TOKEN=hostile-token',
      'CLOUDFLARE_API_TOKEN=hostile-cloudflare-token',
      'THEOLOGAI_TEST_FEATURE_FLAG=hostile-feature',
      'DOTENV_CONFIG_PATH=hostile-dotenv-path',
      'DOTENV_CONFIG_OVERRIDE=true',
      '',
    ].join('\n'), { mode: 0o600 });
    await chmod(dotenvPath, 0o600);

    await writeFile(configPath, [
      `export default { test: { environment: 'node', globals: true, setupFiles: [${JSON.stringify(setupPath)}], include: ['environment-isolation.probe.test.ts'], pool: 'threads', minWorkers: 1, maxWorkers: 1, fileParallelism: false, testTimeout: 10000, hookTimeout: 10000 } };`,
      '',
    ].join('\n'));

    await writeFile(probePath, [
      `const hostileKeys = ${JSON.stringify(hostileKeysThatMustRemainAbsent)};`,
      "test('real Node-unit setup ignores cwd dotenv values', () => {",
      '  for (const key of hostileKeys) expect(process.env[key]).toBeUndefined();',
      "  expect(process.env.NODE_ENV).toBe('test');",
      "  expect(process.env.ESV_API_KEY).toBe('test-esv-api-key');",
      '});',
      '',
    ].join('\n'));

    return await new Promise<ChildResult>((resolve) => {
      const child = spawn(process.execPath, [vitestCliPath, 'run', '--config', configPath, '--root', root], {
        cwd: root,
        env: minimalChildEnvironment(inheritedEsv),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let outputBytes = 0;
      let boundedOutput = '';
      let settled = false;
      let terminalResult: ChildResult | undefined;
      const settle = (result: ChildResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };
      const onOutput = (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (boundedOutput.length < childOutputLimitBytes) {
          boundedOutput += chunk.toString('utf8', 0, Math.min(chunk.length, childOutputLimitBytes - boundedOutput.length));
        }
        if (outputBytes > childOutputLimitBytes) {
          terminalResult = 'child-output-limit';
          child.kill('SIGKILL');
        }
      };
      const timeout = setTimeout(() => {
        terminalResult = 'child-timeout';
        child.kill('SIGKILL');
      }, childTimeoutMs);

      child.stdout.on('data', onOutput);
      child.stderr.on('data', onOutput);
      child.on('error', () => settle('child-error'));
      child.on('close', (code) => settle(terminalResult ?? (code === 0 ? 'passed' : boundedChildFailureCode(boundedOutput))));
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('Node-unit environment isolation', () => {
  it.each([
    ['replaces an inherited synthetic ESV key', true],
    ['sets the test ESV key without an inherited key', false],
  ])('%s while ignoring a hostile cwd dotenv file', async (_name, inheritedEsv) => {
    await expect(runHostileDotenvCase(_name, inheritedEsv)).resolves.toBe('passed');
  }, 30_000);
});
