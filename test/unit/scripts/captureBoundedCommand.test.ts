import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const captureModule = await import('../../../scripts/capture-bounded-command.mjs');

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

  it('preserves a normal nonzero child exit status in the bounded result', async () => {
    await withCapture(async directory => {
      const stdoutPath = join(directory, 'stdout');
      const stderrPath = join(directory, 'stderr');
      const run = await runCapture({ ...nodeScript("process.stdout.write('failed'); process.exit(7);"), stdoutPath, stderrPath });
      expect(run.exitCode).toBe(1);
      expect(run.result).toMatchObject({ exitStatus: 7, signal: null, overflow: false });
    });
  });

  it('preserves a normal child signal in the bounded result', async () => {
    await withCapture(async directory => {
      const stdoutPath = join(directory, 'stdout');
      const stderrPath = join(directory, 'stderr');
      const run = await runCapture({ ...nodeScript("process.kill(process.pid, 'SIGTERM');"), stdoutPath, stderrPath });
      expect(run.exitCode).toBe(1);
      expect(run.result).toMatchObject({ exitStatus: null, signal: 'SIGTERM', overflow: false });
    });
  });

  it('preserves a SIGPIPE child outcome without replaying it on the supervisor', async () => {
    await withCapture(async directory => {
      const stdoutPath = join(directory, 'stdout');
      const stderrPath = join(directory, 'stderr');
      const run = await runCapture({
        command: '/bin/sh', args: ['-c', 'kill -PIPE $$'], stdoutPath, stderrPath,
      });
      expect(run.exitCode).toBe(1);
      expect(run.result).toMatchObject({ exitStatus: null, signal: 'SIGPIPE', overflow: false });
    });
  });

  it.each([
    ['stdout', "setInterval(() => process.stdout.write('é'.repeat(1024)), 0);"],
    ['stderr', "setInterval(() => process.stderr.write('ß'.repeat(1024)), 0);"],
  ])('terminates promptly when %s exceeds the byte budget', async (_stream, source) => {
    await withCapture(async directory => {
      const stdoutPath = join(directory, 'stdout');
      const stderrPath = join(directory, 'stderr');
      const started = Date.now();
      const run = await runCapture({ ...nodeScript(source), stdoutPath, stderrPath, maxBytes: 1_024 });
      expect(run.exitCode).not.toBe(0);
      expect(run.result).toMatchObject({ overflow: true });
      // Include runner and child-process startup time so this remains stable on
      // shared CI hosts while still bounding the complete overflow path.
      expect(Date.now() - started).toBeLessThan(5_000);
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

  it('kills a pipe-inheriting descendant when the leader exits before overflow', async () => {
    await withCapture(async directory => {
      const stdoutPath = join(directory, 'stdout');
      const stderrPath = join(directory, 'stderr');
      const marker = join(directory, 'leader-exited-descendant-survived');
      const descendant = `setTimeout(() => { process.stdout.write('z'.repeat(2048)); setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 500); }, 50);`;
      const source = [
        "const {spawn}=require('node:child_process');",
        `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio: ['ignore', 'inherit', 'inherit']});`,
      ].join('');
      const started = Date.now();
      const run = await runCapture({ ...nodeScript(source), stdoutPath, stderrPath, maxBytes: 1_024 });
      expect(run.exitCode).not.toBe(0);
      expect(run.result).toMatchObject({ overflow: true });
      // This exercises the complete supervisor startup, TERM grace, KILL, and
      // teardown path; retain CI margin while keeping the path time-bounded.
      expect(Date.now() - started).toBeLessThan(5_000);
      await new Promise(resolve => setTimeout(resolve, 700));
      await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  it('keeps the supervisor alive through TERM grace after capture overflow', async () => {
    await withCapture(async directory => {
      const stdoutPath = join(directory, 'stdout');
      const stderrPath = join(directory, 'stderr');
      const resultPath = `${stdoutPath}.result.json`;
      const supervisorPidPath = join(directory, 'supervisor.pid');
      const marker = join(directory, 'keeper-survived');
      const descendant = `setTimeout(() => { process.stdout.write('z'.repeat(2048)); setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 500); }, 100);`;
      const source = [
        "const {spawn}=require('node:child_process');",
        `require('node:fs').writeFileSync(${JSON.stringify(supervisorPidPath)}, String(process.ppid));`,
        `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio: ['ignore', 'inherit', 'inherit']});`,
      ].join('');
      const args = [
        runner, '--stdout', stdoutPath, '--stderr', stderrPath, '--result', resultPath,
        '--max-bytes', '1024', '--', process.execPath, '-e', source,
      ];
      const outer = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      outer.stdout.resume();
      outer.stderr.resume();
      const done = new Promise<number | null>((resolve, reject) => {
        outer.once('close', (code, signal) => resolve(code ?? (signal ? 1 : null)));
        outer.once('error', reject);
      });
      let supervisorPid: number | undefined;
      for (let attempt = 0; attempt < 30 && supervisorPid === undefined; attempt += 1) {
        try {
          supervisorPid = Number(await readFile(supervisorPidPath, 'utf8'));
        } catch {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      expect(supervisorPid).toSatisfy(value => Number.isSafeInteger(value) && value > 0);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          if ((await stat(stdoutPath)).size >= 1_024) break;
        } catch { /* wait for the first bounded write */ }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect((await stat(stdoutPath)).size).toBe(1_024);
      // The runner has started TERM cleanup; the keeper must still be alive
      // inside the configured grace interval before outer SIGKILL.
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(() => process.kill(supervisorPid!, 0)).not.toThrow();
      expect(await done).not.toBe(0);
      await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      expect(() => process.kill(supervisorPid!, 0)).toThrow();
    });
  });

  it('terminates the process group when an output sink fails unexpectedly', async () => {
    await withCapture(async directory => {
      const marker = join(directory, 'capture-failure-descendant-survived');
      const descendant = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 500);`;
      const source = [
        "const {spawn}=require('node:child_process');",
        `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio: 'ignore'});`,
        "setInterval(() => process.stdout.write('x'.repeat(2048)), 0);",
      ].join('');
      const failingSink = {
        write: async () => { throw new Error('injected capture failure'); },
        close: async () => undefined,
      };
      const quietSink = { write: async () => undefined, close: async () => undefined };
      await expect(captureModule.runBoundedCommand({
        ...nodeScript(source), stdoutPath: join(directory, 'stdout'), stderrPath: join(directory, 'stderr'), maxBytes: 1_000_000,
        openCapture: async (path: string) => path.endsWith('/stdout') ? failingSink : quietSink,
      })).rejects.toThrow('injected capture failure');
      await new Promise(resolve => setTimeout(resolve, 700));
      await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  it('pins the supervisor while a finite oversized write is blocked by a slow sink', async () => {
    await withCapture(async directory => {
      const supervisorPidPath = join(directory, 'slow-sink-supervisor.pid');
      const marker = join(directory, 'slow-sink-marker');
      const source = [
        `require('node:fs').writeFileSync(${JSON.stringify(supervisorPidPath)}, String(process.ppid));`,
        `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 700);`,
        "process.stdout.write('x'.repeat(1024));",
      ].join('');
      let sinkStartedResolve!: () => void;
      const sinkStarted = new Promise<void>(resolve => { sinkStartedResolve = resolve; });
      let started = false;
      const slowSink = {
        write: async (_value: Buffer) => {
          if (!started) {
            started = true;
            sinkStartedResolve();
          }
          await new Promise(resolve => setTimeout(resolve, 200));
        },
        close: async () => undefined,
      };
      const quietSink = { write: async () => undefined, close: async () => undefined };
      const run = captureModule.runBoundedCommand({
        ...nodeScript(source),
        stdoutPath: join(directory, 'stdout'),
        stderrPath: join(directory, 'stderr'),
        maxBytes: 1,
        openCapture: async (path: string) => path.endsWith('/stdout') ? slowSink : quietSink,
      });
      await sinkStarted;
      const supervisorPid = Number(await readFile(supervisorPidPath, 'utf8'));
      expect(() => process.kill(supervisorPid, 0)).not.toThrow();
      await expect(run).rejects.toBeInstanceOf(captureModule.BoundedCommandError);
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(() => process.kill(supervisorPid, 0)).toThrow();
      await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  it('returns boundedly when group and direct termination callbacks fail without stale PGID retries', async () => {
    await withCapture(async directory => {
      const supervisorPidPath = join(directory, 'failed-signal-supervisor.pid');
      const marker = join(directory, 'failed-signal-descendant-survived');
      const calls: string[] = [];
      const run = captureModule.runBoundedCommand({
        ...nodeScript([
          `require('node:fs').writeFileSync(${JSON.stringify(supervisorPidPath)}, String(process.ppid));`,
          `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(`setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 700)`) }], {stdio: 'ignore'});`,
          "process.stdout.write('x'.repeat(2048)); setInterval(() => {}, 1000);",
        ].join('')),
        stdoutPath: join(directory, 'stdout'),
        stderrPath: join(directory, 'stderr'),
        maxBytes: 1,
        signalGroup: (pid: number, signal: NodeJS.Signals) => {
          expect(pid).toBeGreaterThan(0);
          calls.push(`group:${signal}`);
          throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
        },
        signalChild: (child: unknown, signal: NodeJS.Signals) => {
          calls.push(`direct:${signal}`);
          expect(child).toBeTruthy();
          throw new Error('EPERM');
        },
      });
      const started = Date.now();
      await expect(run).rejects.toBeInstanceOf(captureModule.BoundedCommandError);
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(calls).toEqual(['group:SIGTERM', 'direct:SIGTERM']);
      const supervisorPid = Number(await readFile(supervisorPidPath, 'utf8'));
      expect(() => process.kill(supervisorPid, 0)).toThrow();
      await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });
});
