import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const runner = fileURLToPath(new URL('../../../scripts/capture-bounded-command.mjs', import.meta.url));

async function withCapture<T>(fn: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'theologai-bounded-command-'));
  try {
    return await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function nodeScript(source: string): { command: string; args: string[] } {
  return { command: process.execPath, args: ['-e', source] };
}

async function runCapture(options: {
  command: string;
  args: string[];
  stdoutPath: string;
  stderrPath: string;
  maxBytes?: number;
  stdoutPrefix?: string;
}): Promise<{ exitCode: number | null; result: Record<string, unknown> }> {
  const args = [
    runner,
    '--stdout', options.stdoutPath,
    '--stderr', options.stderrPath,
    '--result', `${options.stdoutPath}.result.json`,
    ...(options.maxBytes === undefined ? [] : ['--max-bytes', String(options.maxBytes)]),
    ...(options.stdoutPrefix === undefined ? [] : ['--stdout-prefix', options.stdoutPrefix]),
    '--', options.command, ...options.args,
  ];
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const [exitCode] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve, reject) => {
    child.once('close', (code, signal) => resolve([code, signal]));
    child.once('error', reject);
  });
  expect(`${stdout}${stderr}`).toContain('theologai-bounded-command.v1');
  return {
    exitCode,
    result: JSON.parse(await readFile(`${options.stdoutPath}.result.json`, 'utf8')) as Record<string, unknown>,
  };
}

describe('bounded command capture', () => {
  it('streams both outputs, hashes exact UTF-8 bytes, and preserves exit status', async () => {
    await withCapture(async directory => {
      const stdoutPath = join(directory, 'stdout');
      const stderrPath = join(directory, 'stderr');
      const run = await runCapture({
        ...nodeScript("process.stdout.write('é'.repeat(200)); process.stderr.write('ß'.repeat(100));"),
        stdoutPath, stderrPath, stdoutPrefix: 'prefix:', maxBytes: 1_000,
      });
      expect(run).toMatchObject({ exitCode: 0, result: { exitStatus: 0, signal: null, overflow: false, stdoutBytes: 407, stderrBytes: 200 } });
      expect(await readFile(stdoutPath, 'utf8')).toBe(`prefix:${'é'.repeat(200)}`);
      expect(await readFile(stderrPath, 'utf8')).toBe('ß'.repeat(100));
    });
  });

  it.each([
    ['stdout', "setInterval(() => process.stdout.write('é'.repeat(1024)), 0);"],
    ['stderr', "setInterval(() => process.stderr.write('ß'.repeat(1024)), 0);"],
  ])('terminates immediately when %s exceeds the byte budget', async (_stream, source) => {
    await withCapture(async directory => {
      const stdoutPath = join(directory, 'stdout');
      const stderrPath = join(directory, 'stderr');
      const started = Date.now();
      const run = await runCapture({ ...nodeScript(source), stdoutPath, stderrPath, maxBytes: 1_024 });
      expect(run.exitCode).not.toBe(0);
      expect(run.result).toMatchObject({ overflow: true });
      expect(Date.now() - started).toBeLessThan(2_000);
      expect((await readFile(stdoutPath)).byteLength).toBeLessThanOrEqual(1_024);
      expect((await readFile(stderrPath)).byteLength).toBeLessThanOrEqual(1_024);
    });
  });

  it('uses SIGKILL cleanup when a child ignores SIGTERM and never hangs', async () => {
    await withCapture(async directory => {
      const stdoutPath = join(directory, 'stdout');
      const stderrPath = join(directory, 'stderr');
      const run = await runCapture({
        ...nodeScript("process.on('SIGTERM', () => {}); setInterval(() => process.stdout.write('x'.repeat(2048)), 0);"),
        stdoutPath, stderrPath, maxBytes: 1_024,
      });
      expect(run.exitCode).not.toBe(0);
      expect(run.result).toMatchObject({ overflow: true });
      expect((await readFile(stdoutPath)).byteLength).toBeLessThanOrEqual(1_024);
    });
  });

  it('cleans up descendants in the child process group after overflow', async () => {
    await withCapture(async directory => {
      const stdoutPath = join(directory, 'stdout');
      const stderrPath = join(directory, 'stderr');
      const marker = join(directory, 'descendant-survived');
      const source = [
        "const {spawn}=require('node:child_process');",
        `spawn(process.execPath, ['-e', ${JSON.stringify(`setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 500)`) }], {stdio: 'ignore'});`,
        "setInterval(() => process.stdout.write('x'.repeat(2048)), 0);",
      ].join('');
      const run = await runCapture({ ...nodeScript(source), stdoutPath, stderrPath, maxBytes: 1_024 });
      expect(run.exitCode).not.toBe(0);
      expect(run.result).toMatchObject({ overflow: true });
      await new Promise(resolve => setTimeout(resolve, 700));
      await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });
});
